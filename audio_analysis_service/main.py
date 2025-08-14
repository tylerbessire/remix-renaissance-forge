import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import base64
import io
import librosa
import numpy as np
import traceback
from scipy.spatial.distance import cosine

# --- Pydantic Models for API ---
class AnalysisRequest(BaseModel):
    audioData: str  # base64 encoded audio string
    songId: str

# --- FastAPI App Initialization ---
app = FastAPI()

# --- Studio-Grade Audio Analysis Logic ---

def analyze_harmonics(y, sr):
    # --- Key Detection ---
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=512)

    # Use a standard key detection algorithm (Krumhansl-Schmuckler)
    major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
    minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

    chroma_norm = librosa.util.normalize(chroma, norm=2)

    correlations = []
    notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    for i in range(12):
        correlations.append(np.corrcoef(chroma_norm, np.roll(major_profile, i))[0, 1])
        correlations.append(np.corrcoef(chroma_norm, np.roll(minor_profile, i))[0, 1])

    max_corr_idx = np.argmax(correlations)
    key_idx, mode_idx = divmod(max_corr_idx, 2)
    key = notes[key_idx]
    mode = 'major' if mode_idx == 0 else 'minor'
    key_confidence = correlations[max_corr_idx]

    # --- Chord Progression and Complexity (Studio Grade) ---
    # This is a simplified but more effective chord detection than a simple proxy.
    # It identifies the most likely chord in each frame based on chroma.
    chords = []
    for frame in chroma.T:
        # Templates for major and minor chords
        major_templates = {notes[i]: np.roll([1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0], i) for i in range(12)}
        minor_templates = {notes[i] + 'm': np.roll([1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0], i) for i in range(12)}
        all_templates = {**major_templates, **minor_templates}

        best_chord = max(all_templates.keys(), key=lambda c: np.dot(frame, all_templates[c]))
        chords.append(best_chord)

    # Chord complexity is the number of unique chords found.
    unique_chords = list(set(chords))
    chord_complexity = len(unique_chords) / 24.0 # Normalize by total possible simple chords

    return {
        "key": f"{key} {mode}",
        "key_confidence": float(key_confidence),
        "chord_progression": unique_chords,
        "chord_complexity": float(chord_complexity),
    }

def analyze_rhythm(y, sr):
    # BPM and Beat Grid
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, start_bpm=120, tightness=100)
    beat_confidence = 1.0 - np.std(np.diff(beats)) / np.mean(np.diff(beats))

    # Onset detection for groove analysis
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    onsets = librosa.onset.onset_detect(onset_env=onset_env, sr=sr, units='time')

    # Studio-Grade Swing Factor Calculation
    swing_factor = 0.0
    if len(beats) > 1 and len(onsets) > 0:
        beat_duration = np.mean(np.diff(beats))
        eighth_duration = beat_duration / 2
        offbeat_deviations = []

        for beat_time in beats:
            offbeat_time = beat_time + eighth_duration
            # Find onsets near this offbeat time
            nearby_onsets = onsets[np.abs(onsets - offbeat_time) < eighth_duration / 2]
            if len(nearby_onsets) > 0:
                # Find the closest onset to the offbeat
                closest_onset = nearby_onsets[np.argmin(np.abs(nearby_onsets - offbeat_time))]
                deviation = (closest_onset - offbeat_time) / eighth_duration
                offbeat_deviations.append(deviation)

        if len(offbeat_deviations) > 5: # Need enough data points
            # Swing is a systematic delay of the off-beat.
            # A positive mean deviation indicates swing.
            # 0.33 would be a classic 2:1 triplet swing ratio.
            swing_factor = np.mean(offbeat_deviations)

    # Groove Stability: Lower standard deviation of beat intervals is more stable.
    groove_stability = np.std(np.diff(beats))

    return {
        "bpm": float(tempo),
        "beat_confidence": float(beat_confidence),
        "groove_stability": float(groove_stability),
        "swing_factor": float(swing_factor)
    }

def analyze_spectral(y, sr):
    # MFCCs for timbre
    mfccs = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)

    # Dynamic Range (New)
    rms = librosa.feature.rms(y=y)[0]
    if len(rms) > 0:
        crest_factor = np.max(np.abs(y)) / (np.mean(rms) + 1e-6)
        dynamic_range = 20 * np.log10(crest_factor)
    else:
        dynamic_range = 0.0

    return {
        "mfccs": mfccs.tolist(), # Send the raw features for similarity calculation
        "dynamic_range": float(dynamic_range),
        "brightness": float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)))
    }

def analyze_vocals(y, sr):
    # This is a highly complex task. A true implementation would use a source separation model.
    # For now, we'll use a simple proxy: spectral flatness.
    # Vocal sections tend to be less "flat" (more harmonic) than instrumental sections.
    flatness = librosa.feature.spectral_flatness(y=y)
    vocal_presence_proxy = 1 - np.mean(flatness) # Higher value means less flat -> more likely vocals

    return {
        "vocal_presence": float(vocal_presence_proxy)
    }


def run_studio_grade_analysis(file_bytes: bytes):
    """
    This function now includes placeholders for the new "studio-grade" features.
    """
    y, sr = librosa.load(io.BytesIO(file_bytes), sr=44100, mono=True)

    harmonic_analysis = analyze_harmonics(y, sr)
    rhythmic_analysis = analyze_rhythm(y, sr)
    spectral_analysis = analyze_spectral(y, sr)
    vocal_analysis = analyze_vocals(y, sr)

    analysis_result = {
        "version": "1.0-studio",
        "harmonic": harmonic_analysis,
        "rhythmic": rhythmic_analysis,
        "spectral": spectral_analysis,
        "vocal": vocal_analysis,
    }
    return analysis_result

# --- API Endpoints ---
@app.post("/analyze")
async def analyze_endpoint(request: AnalysisRequest):
    try:
        audio_bytes = base64.b64decode(request.audioData)
        analysis_results = run_studio_grade_analysis(audio_bytes)

        return {
            "success": True,
            "songId": request.songId,
            "analysis": analysis_results
        }
    except Exception as e:
        print(f"Error during analysis: {e}", file=sys.stderr)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to analyze audio: {str(e)}")

# --- Main execution ---
if __name__ == "__main__":
    import sys
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
