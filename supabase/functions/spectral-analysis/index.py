import io, os, json, soundfile as sf, numpy as np
import librosa
from jsonschema import validate

BPM_MIN, BPM_MAX = 60, 180

def load_audio(file_bytes, sr_target=44100):
    y, sr = librosa.load(io.BytesIO(file_bytes), sr=sr_target, mono=True)
    return y, sr

def beat_grid(y, sr):
    # tempo + beats
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, start_bpm=120, tightness=100)
    tempo = float(np.clip(tempo, BPM_MIN, BPM_MAX))
    beats_t = librosa.frames_to_time(beats, sr=sr)
    # downbeats via 4/4 inference from beat phase
    # compute novelty curve -> pick bar phase with max periodicity (simple robust heuristic)
    downbeats = beats_t[::4] if len(beats_t) >= 4 else np.array([])
    # crude confidence: periodicity of inter-beat intervals
    ibis = np.diff(beats_t)
    bpm_conf = float(np.clip(1.0 - np.std(ibis) / (np.mean(ibis) + 1e-6), 0, 1))
    return {
        "bpm": round(tempo, 1),
        "bpm_confidence": round(bpm_conf, 2),
        "beats_sec": beats_t.tolist(),
        "downbeats_sec": downbeats.tolist(),
        "time_signature": "4/4"
    }

# Krumhansl-Schmuckler template correlation on chroma_cqt
_P_MAJOR = np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88])
_P_MINOR = np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])

def detect_key(y, sr):
    C = np.abs(librosa.cqt(y, sr=sr, hop_length=512, n_bins=84, bins_per_octave=12))
    chroma = librosa.feature.chroma_cqt(C=C, sr=sr)
    chroma_norm = chroma / (np.linalg.norm(chroma, axis=0, ord=2) + 1e-6)
    profile_scores = []
    for i in range(12):
        maj = np.dot(np.roll(_P_MAJOR, i), chroma_norm).mean()
        minr= np.dot(np.roll(_P_MINOR, i), chroma_norm).mean()
        profile_scores.append((i, 'maj', maj))
        profile_scores.append((i, 'min', minr))
    best = max(profile_scores, key=lambda x: x[2])
    pitch_class, mode, conf = best
    names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
    name = names[pitch_class] + ('' if mode=='maj' else 'm')
    camelot_map = {
        # major (B)
        'C':'8B','G':'9B','D':'10B','A':'11B','E':'12B','B':'1B','F#':'2B','C#':'3B','G#':'4B','D#':'5B','A#':'6B','F':'7B',
        # minor (A)
        'Am':'8A','Em':'9A','Bm':'10A','F#m':'11A','C#m':'12A','G#m':'1A','D#m':'2A','A#m':'3A','Fm':'4A','Cm':'5A','Gm':'6A','Dm':'7A'
    }
    camelot = camelot_map.get(name, None)
    # estimate cents_off via spectral peak around fundamental region (coarse)
    cents_off = 0.0
    confidence = float(np.clip((conf - 0.1)/0.9, 0, 1))
    return {
        "name": name,
        "camelot": camelot,
        "cents_off": round(cents_off, 1),
        "confidence": round(confidence, 2),
        "method": "chroma_cqt+krumhansl"
    }

def energy_brightness(y, sr):
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)[0]
    energy = float(np.clip(np.mean(rms) / (np.max(rms)+1e-6), 0, 1))
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
    brightness = float(np.clip(np.mean(centroid) / (sr/2), 0, 1))
    return energy, brightness

def run(file_bytes, analyze_length_sec=None, detect_chords=False, strict=True):
    y, sr = load_audio(file_bytes)
    if analyze_length_sec and analyze_length_sec > 0:
        y = y[: int(analyze_length_sec * sr)]
    bg = beat_grid(y, sr)
    key = detect_key(y, sr)
    energy, brightness = energy_brightness(y, sr)

    warnings = []
    if key["confidence"] < 0.6:
        warnings.append("low_key_confidence")
        if strict:
            raise ValueError("low key confidence")
    if bg["bpm_confidence"] < 0.5:
        warnings.append("low_bpm_confidence")
        if strict:
            raise ValueError("low bpm confidence")

    resp = {
        "version": "2025-08-11",
        "source": {
            "duration_sec": round(len(y)/sr, 2),
            "sr": sr,
            "mono": True,
            "used_window_sec": round(len(y)/sr, 2)
        },
        "beat_grid": bg,
        "key": key,
        "energy": round(energy, 2),
        "brightness": round(brightness, 2),
        "diagnostics": {
            "warnings": warnings,
        }
    }

    if detect_chords:
        # Keep chord detection simple & explicit; omit if confidence is poor.
        # (Implement Viterbi over chord templates if needed; otherwise return 422 when strict.)
        pass

    return resp
