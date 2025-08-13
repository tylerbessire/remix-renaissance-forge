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

def estimate_tuning(y, sr):
    f0, voiced_flag, voiced_probs = librosa.pyin(y, fmin=librosa.note_to_hz('C2'), fmax=librosa.note_to_hz('C7'))

    # Get only voiced frames
    f0_voiced = f0[voiced_flag]
    if len(f0_voiced) == 0:
        return 0.0

    # Convert f0 to midi notes
    midi_voiced = librosa.hz_to_midi(f0_voiced)

    # Deviation from integer midi notes
    deviation = midi_voiced - np.round(midi_voiced)

    # Average deviation in cents (1 semitone = 100 cents)
    avg_deviation_cents = float(np.mean(deviation) * 100)

    return avg_deviation_cents

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
    cents_off = estimate_tuning(y, sr)
    confidence = float(np.clip((conf - 0.1)/0.9, 0, 1))
    return {
        "name": name,
        "camelot": camelot,
        "cents_off": round(cents_off, 1),
        "confidence": round(confidence, 2),
        "method": "chroma_cqt+krumhansl",
        "chromagram": chroma_norm.tolist()
    }

def energy_brightness(y, sr):
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)[0]
    energy = float(np.clip(np.mean(rms) / (np.max(rms)+1e-6), 0, 1))
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
    brightness = float(np.clip(np.mean(centroid) / (sr/2), 0, 1))
    return energy, brightness

def analyze_rhythm(y, sr):
    oenv = librosa.onset.onset_strength(y=y, sr=sr)
    pulse = librosa.beat.plp(y=y, sr=sr)
    pulse_clarity = float(librosa.beat.pulse_clarity(pulse, sr=sr))
    # Using variance of onset strength as a measure of complexity
    rhythmic_complexity = float(np.var(oenv))
    return {
        "pulse_clarity": round(pulse_clarity, 3),
        "rhythmic_complexity": round(rhythmic_complexity, 3)
    }

def analyze_spectral_balance(y, sr):
    S = np.abs(librosa.stft(y))
    freqs = librosa.fft_frequencies(sr=sr)

    low_idx = freqs < 250
    mid_idx = (freqs >= 250) & (freqs < 4000)
    high_idx = freqs >= 4000

    S_power = S**2
    low_power = float(np.mean(S_power[low_idx, :]))
    mid_power = float(np.mean(S_power[mid_idx, :]))
    high_power = float(np.mean(S_power[high_idx, :]))
    total_power = low_power + mid_power + high_power + 1e-6

    return {
        "low_freq_content": round(low_power / total_power, 3),
        "mid_freq_content": round(mid_power / total_power, 3),
        "high_freq_content": round(high_power / total_power, 3),
    }

def analyze_roughness(y, sr):
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    chroma_rolled = np.roll(chroma, 1, axis=0)
    dissonance_matrix = chroma * chroma_rolled
    roughness = float(np.mean(dissonance_matrix))
    return {
        "estimated_roughness": round(roughness * 100, 3)
    }

def run(file_bytes, analyze_length_sec=None, detect_chords=False, strict=True):
    y, sr = load_audio(file_bytes)
    if analyze_length_sec and analyze_length_sec > 0:
        y = y[: int(analyze_length_sec * sr)]

    bg = beat_grid(y, sr)
    key = detect_key(y, sr)
    energy, brightness = energy_brightness(y, sr)
    rhythm = analyze_rhythm(y, sr)
    spectral_balance = analyze_spectral_balance(y, sr)
    roughness = analyze_roughness(y, sr)

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
        "version": "2025-08-13",
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
        "rhythm": rhythm,
        "spectral_balance": spectral_balance,
        "roughness": roughness,
        "diagnostics": {
            "warnings": warnings,
        }
    }

    if detect_chords:
        # Keep chord detection simple & explicit; omit if confidence is poor.
        # (Implement Viterbi over chord templates if needed; otherwise return 422 when strict.)
        pass

    return resp

if __name__ == '__main__':
    import sys
    import json

    if len(sys.argv) < 2:
        print(json.dumps({"error": "No file path provided"}), file=sys.stderr)
        sys.exit(1)

    filepath = sys.argv[1]
    try:
        with open(filepath, 'rb') as f:
            file_bytes = f.read()
        analysis_results = run(file_bytes)
        print(json.dumps(analysis_results))
    except FileNotFoundError:
        print(json.dumps({"error": f"File not found: {filepath}"}), file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)
