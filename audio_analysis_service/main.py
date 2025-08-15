import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import base64
import io
import librosa
import numpy as np
import traceback
import sys
import os
from scipy.spatial.distance import cosine
import math
import warnings

# Suppress common warnings in production
warnings.filterwarnings("ignore", message="pkg_resources is deprecated")
warnings.filterwarnings("ignore", category=RuntimeWarning, module="numpy")
warnings.filterwarnings("ignore", message="invalid value encountered in divide")

# --- Pydantic Models for API ---
class AnalysisRequest(BaseModel):
    audioData: str  # base64 encoded audio string
    songId: str

# --- FastAPI App Initialization ---
app = FastAPI()

# --- Utility Functions ---
def sanitize_nan_values(obj):
    """Recursively replace NaN values with 0.0 in nested dict/list structures."""
    if isinstance(obj, dict):
        return {k: sanitize_nan_values(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_nan_values(item) for item in obj]
    elif isinstance(obj, (int, float, np.integer, np.floating)):
        if math.isnan(obj) or math.isinf(obj):
            return 0.0
        return float(obj)
    else:
        return obj

# --- Studio-Grade Audio Analysis Logic ---

def analyze_harmonics(y, sr):
    # --- Key Detection ---
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=512)

    # Use a standard key detection algorithm (Krumhansl-Schmuckler)
    major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
    minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

    # Average chroma across time to get a single vector for key detection
    chroma_mean = np.mean(chroma, axis=1)
    chroma_norm = librosa.util.normalize(chroma_mean.reshape(1, -1), norm=2)[0]

    correlations = []
    notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    for i in range(12):
        # Now both arrays are 1D and same length
        major_rolled = np.roll(major_profile, i)
        minor_rolled = np.roll(minor_profile, i)
        
        # Handle NaN in correlation calculations
        major_corr = np.corrcoef(chroma_norm, major_rolled)[0, 1]
        minor_corr = np.corrcoef(chroma_norm, minor_rolled)[0, 1]
        
        correlations.append(0.0 if math.isnan(major_corr) else major_corr)
        correlations.append(0.0 if math.isnan(minor_corr) else minor_corr)

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
    
    # Handle division by zero in beat confidence calculation
    beat_diffs = np.diff(beats)
    if len(beat_diffs) > 0 and np.mean(beat_diffs) != 0:
        beat_confidence = 1.0 - np.std(beat_diffs) / np.mean(beat_diffs)
        beat_confidence = max(0.0, min(1.0, beat_confidence))  # Clamp between 0 and 1
    else:
        beat_confidence = 0.0

    # Onset detection for groove analysis
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    onsets = librosa.onset.onset_detect(y=y, sr=sr, onset_envelope=onset_env, units='time')

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

    # Dynamic Range (New) - Handle log of zero or invalid values
    rms = librosa.feature.rms(y=y)[0]
    if len(rms) > 0 and np.mean(rms) > 0:
        crest_factor = np.max(np.abs(y)) / (np.mean(rms) + 1e-6)
        if crest_factor > 0 and not math.isinf(crest_factor):
            dynamic_range = 20 * np.log10(crest_factor)
            # Clamp extreme values
            dynamic_range = max(-100.0, min(100.0, dynamic_range))
        else:
            dynamic_range = 0.0
    else:
        dynamic_range = 0.0

    # Calculate brightness safely
    spectral_centroids = librosa.feature.spectral_centroid(y=y, sr=sr)
    brightness = np.mean(spectral_centroids) if len(spectral_centroids) > 0 else 0.0

    return {
        "mfccs": mfccs.tolist(), # Send the raw features for similarity calculation
        "dynamic_range": float(dynamic_range),
        "brightness": float(brightness)
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
    
    # Final safety net: sanitize any remaining NaN values
    return sanitize_nan_values(analysis_result)

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
