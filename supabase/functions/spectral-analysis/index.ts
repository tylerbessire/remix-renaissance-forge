import { corsHeaders } from '../_shared/cors.ts';

interface SpectralAnalysisRequest {
  audioData: string; // base64 encoded audio
  songId: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { audioData, songId }: SpectralAnalysisRequest = await req.json();

    if (!audioData || !songId) {
      return new Response(
        JSON.stringify({ error: 'Audio data and song ID are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`Starting spectral analysis for song: ${songId}`);

    // Decode base64 audio data and save to temporary file
    const audioBytes = Uint8Array.from(atob(audioData), c => c.charCodeAt(0));
    const tempAudioPath = `/tmp/audio_${songId}.wav`;
    
    await Deno.writeFile(tempAudioPath, audioBytes);
    console.log(`Audio file saved to: ${tempAudioPath}`);

    // Run Python spectral analysis
    const pythonScript = `
import librosa
import numpy as np
import json
import sys

def analyze_audio(file_path):
    try:
        # Load audio file
        y, sr = librosa.load(file_path, sr=None, mono=True)
        duration = len(y) / sr
        
        # Beat and tempo analysis
        tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
        beat_times = librosa.frames_to_time(beats, sr=sr)
        
        # Onset detection for downbeats (simplified)
        onset_frames = librosa.onset.onset_detect(y=y, sr=sr)
        onset_times = librosa.frames_to_time(onset_frames, sr=sr)
        downbeat_times = onset_times[::4][:len(beat_times)//4]  # Approximate downbeats
        
        # Key and harmonic analysis
        chroma = librosa.feature.chroma_stft(y=y, sr=sr)
        chroma_mean = np.mean(chroma, axis=1)
        
        # Simple key detection based on chroma profile
        key_profiles = {
            'C': [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1],
            'C#': [1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0],
            'D': [0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1],
            'D#': [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0],
            'E': [0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1],
            'F': [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0],
            'F#': [0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1],
            'G': [1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1],
            'G#': [1, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1, 0],
            'A': [0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1],
            'A#': [1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0],
            'B': [0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1]
        }
        
        camelot_wheel = {
            'C': '8A', 'G': '9A', 'D': '10A', 'A': '11A', 'E': '12A', 'B': '1A',
            'F#': '2A', 'C#': '3A', 'G#': '4A', 'D#': '5A', 'A#': '6A', 'F': '7A'
        }
        
        best_key = 'C'
        best_correlation = 0
        for key, profile in key_profiles.items():
            correlation = np.corrcoef(chroma_mean, profile)[0, 1]
            if correlation > best_correlation:
                best_correlation = correlation
                best_key = key
        
        # Energy and spectral features
        spectral_centroids = librosa.feature.spectral_centroid(y=y, sr=sr)
        energy = np.mean(librosa.feature.rms(y=y))
        brightness = np.mean(spectral_centroids) / sr
        
        # Spectral balance
        stft = librosa.stft(y)
        freq_bins = librosa.fft_frequencies(sr=sr)
        magnitude = np.abs(stft)
        
        low_freq_mask = freq_bins < 250
        mid_freq_mask = (freq_bins >= 250) & (freq_bins < 4000)
        high_freq_mask = freq_bins >= 4000
        
        low_content = np.mean(magnitude[low_freq_mask])
        mid_content = np.mean(magnitude[mid_freq_mask])
        high_content = np.mean(magnitude[high_freq_mask])
        
        total_content = low_content + mid_content + high_content
        low_ratio = low_content / total_content if total_content > 0 else 0
        mid_ratio = mid_content / total_content if total_content > 0 else 0
        high_ratio = high_content / total_content if total_content > 0 else 0
        
        # Rhythm analysis
        tempo_stability = 1.0 - (np.std(np.diff(beat_times)) / np.mean(np.diff(beat_times)) if len(beat_times) > 1 else 0)
        rhythm_complexity = np.std(np.diff(beat_times)) if len(beat_times) > 1 else 0
        
        # Roughness estimation (simplified)
        spectral_rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)
        roughness = np.std(spectral_rolloff) / np.mean(spectral_rolloff)
        
        # Build result
        result = {
            "version": "1.0",
            "source": {
                "duration_sec": float(duration),
                "sr": int(sr),
                "mono": True,
                "used_window_sec": 2048 / sr
            },
            "beat_grid": {
                "bpm": float(tempo),
                "bpm_confidence": float(tempo_stability),
                "beats_sec": beat_times.tolist(),
                "downbeats_sec": downbeat_times.tolist(),
                "time_signature": "4/4"
            },
            "key": {
                "name": best_key,
                "camelot": camelot_wheel.get(best_key, "1A"),
                "cents_off": 0.0,
                "confidence": float(best_correlation),
                "method": "chroma_correlation",
                "chromagram": chroma.tolist()
            },
            "energy": float(energy),
            "brightness": float(brightness),
            "rhythm": {
                "pulse_clarity": float(tempo_stability),
                "rhythmic_complexity": float(rhythm_complexity)
            },
            "spectral_balance": {
                "low_freq_content": float(low_ratio),
                "mid_freq_content": float(mid_ratio),
                "high_freq_content": float(high_ratio)
            },
            "roughness": {
                "estimated_roughness": float(roughness)
            },
            "diagnostics": {
                "warnings": []
            }
        }
        
        return result
        
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    file_path = sys.argv[1]
    result = analyze_audio(file_path)
    print(json.dumps(result))
`;

    // Write Python script to temporary file
    const pythonScriptPath = `/tmp/analyze_${songId}.py`;
    await Deno.writeTextFile(pythonScriptPath, pythonScript);

    // Execute Python analysis
    const command = new Deno.Command("python3", {
      args: [pythonScriptPath, tempAudioPath],
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stdout, stderr } = await command.output();

    if (code !== 0) {
      const errorText = new TextDecoder().decode(stderr);
      console.error(`Python analysis failed: ${errorText}`);
      throw new Error(`Analysis failed: ${errorText}`);
    }

    const analysisResult = JSON.parse(new TextDecoder().decode(stdout));
    
    if (analysisResult.error) {
      throw new Error(analysisResult.error);
    }

    // Cleanup temp files
    try {
      await Deno.remove(tempAudioPath);
      await Deno.remove(pythonScriptPath);
    } catch (e) {
      console.warn(`Failed to cleanup temp files: ${e}`);
    }

    console.log(`Analysis complete for song: ${songId}`);

    return new Response(
      JSON.stringify(analysisResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in spectral analysis function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to process spectral analysis',
        details: error.message 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});