const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SpectralAnalysisRequest {
  audioData: string; // base64 encoded audio
  songId: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { audioData, songId }: SpectralAnalysisRequest = await req.json();

    if (!audioData || !songId) {
      return new Response(
        JSON.stringify({ error: 'Missing audioData or songId' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`Starting spectral analysis for song: ${songId}`);

    // Python script for spectral analysis using librosa
    const pythonScript = `
import sys
import json
import base64
import io
import numpy as np
import librosa
import warnings
warnings.filterwarnings('ignore')

def analyze_audio(audio_base64):
    try:
        # Decode base64 audio
        audio_bytes = base64.b64decode(audio_base64)
        
        # Load audio using librosa
        y, sr = librosa.load(io.BytesIO(audio_bytes), sr=None, mono=True)
        duration = len(y) / sr
        
        # Beat and tempo analysis
        tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
        beat_times = librosa.frames_to_time(beats, sr=sr)
        
        # Key detection using chromagram
        chroma = librosa.feature.chroma_stft(y=y, sr=sr)
        chroma_mean = np.mean(chroma, axis=1)
        key_idx = np.argmax(chroma_mean)
        keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        detected_key = keys[key_idx]
        
        # Camelot wheel mapping
        camelot_map = {
            'C': '8B', 'G': '9B', 'D': '10B', 'A': '11B', 'E': '12B', 'B': '1B',
            'F#': '2B', 'C#': '3B', 'G#': '4B', 'D#': '5B', 'A#': '6B', 'F': '7B'
        }
        camelot = camelot_map.get(detected_key, '1A')
        
        # Energy and brightness
        rms = librosa.feature.rms(y=y)[0]
        energy = float(np.mean(rms))
        
        spectral_centroids = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
        brightness = float(np.mean(spectral_centroids)) / sr
        
        # Rhythm analysis
        onset_frames = librosa.onset.onset_detect(y=y, sr=sr)
        onset_times = librosa.frames_to_time(onset_frames, sr=sr)
        pulse_clarity = min(1.0, len(onset_times) / duration * 0.1)
        
        # Spectral features
        spectral_rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)[0]
        spectral_bandwidth = librosa.feature.spectral_bandwidth(y=y, sr=sr)[0]
        
        # Frequency content analysis
        stft = librosa.stft(y)
        magnitude = np.abs(stft)
        freq_bins = librosa.fft_frequencies(sr=sr)
        
        low_freq = np.sum(magnitude[freq_bins < 200])
        mid_freq = np.sum(magnitude[(freq_bins >= 200) & (freq_bins < 2000)])
        high_freq = np.sum(magnitude[freq_bins >= 2000])
        total_energy = low_freq + mid_freq + high_freq
        
        if total_energy > 0:
            low_content = float(low_freq / total_energy)
            mid_content = float(mid_freq / total_energy)
            high_content = float(high_freq / total_energy)
        else:
            low_content = mid_content = high_content = 0.33
        
        # Roughness estimation
        roughness = float(np.std(rms))
        
        result = {
            "version": "1.0",
            "source": {
                "duration_sec": float(duration),
                "sr": int(sr),
                "mono": True,
                "used_window_sec": 4.0
            },
            "beat_grid": {
                "bpm": float(tempo),
                "bpm_confidence": 0.8,
                "beats_sec": beat_times.tolist()[:20],  # Limit to first 20
                "downbeats_sec": beat_times[::4].tolist()[:10],  # Every 4th beat
                "time_signature": "4/4"
            },
            "key": {
                "name": detected_key,
                "camelot": camelot,
                "cents_off": 0.0,
                "confidence": float(chroma_mean[key_idx]),
                "method": "chromagram",
                "chromagram": chroma_mean.tolist()
            },
            "energy": energy,
            "brightness": brightness,
            "rhythm": {
                "pulse_clarity": pulse_clarity,
                "rhythmic_complexity": float(np.std(np.diff(onset_times))) if len(onset_times) > 1 else 0.0
            },
            "spectral_balance": {
                "low_freq_content": low_content,
                "mid_freq_content": mid_content,
                "high_freq_content": high_content
            },
            "roughness": {
                "estimated_roughness": roughness
            },
            "diagnostics": {
                "warnings": []
            }
        }
        
        return result
        
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    audio_data = sys.argv[1]
    result = analyze_audio(audio_data)
    print(json.dumps(result))
`;

    // Write Python script to temporary file
    const scriptPath = `/tmp/analyze_${songId}.py`;
    await Deno.writeTextFile(scriptPath, pythonScript);

    // Run Python analysis
    const command = new Deno.Command("python3", {
      args: [scriptPath, audioData],
      stdout: "piped",
      stderr: "piped",
    });

    const { code, stdout, stderr } = await command.output();
    
    // Clean up temporary file
    try {
      await Deno.remove(scriptPath);
    } catch (e) {
      console.warn('Failed to clean up temp file:', e);
    }

    if (code !== 0) {
      const errorText = new TextDecoder().decode(stderr);
      console.error('Python script error:', errorText);
      throw new Error(`Python analysis failed: ${errorText}`);
    }

    const resultText = new TextDecoder().decode(stdout);
    const analysisResult = JSON.parse(resultText);

    if (analysisResult.error) {
      throw new Error(analysisResult.error);
    }

    console.log(`Analysis completed for song: ${songId}`);

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