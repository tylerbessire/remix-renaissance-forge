import os
import uuid
import supabase
import json
import requests
import tempfile
import traceback
import sys
import base64
import io
from threading import Thread

from flask import Flask, request, jsonify
from jsonschema import validate
import librosa
import numpy as np

# --- Flask App Initialization ---
app = Flask(__name__)

# --- Supabase Client Initialization ---
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase_client = supabase.create_client(SUPABASE_URL, SUPABASE_KEY)

# --- Spectral Analysis Logic (from spectral-analysis/index.py) ---
BPM_MIN, BPM_MAX = 60, 180

def load_audio(file_bytes, sr_target=44100):
    y, sr = librosa.load(io.BytesIO(file_bytes), sr=sr_target, mono=True)
    return y, sr

def beat_grid(y, sr):
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, start_bpm=120, tightness=100)
    tempo = float(np.clip(tempo, BPM_MIN, BPM_MAX))
    beats_t = librosa.frames_to_time(beats, sr=sr)
    downbeats = beats_t[::4] if len(beats_t) >= 4 else np.array([])
    ibis = np.diff(beats_t)
    bpm_conf = float(np.clip(1.0 - np.std(ibis) / (np.mean(ibis) + 1e-6), 0, 1))
    return {
        "bpm": round(tempo, 1), "bpm_confidence": round(bpm_conf, 2),
        "beats_sec": beats_t.tolist(), "downbeats_sec": downbeats.tolist(), "time_signature": "4/4"
    }

_P_MAJOR = np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88])
_P_MINOR = np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])

def estimate_tuning(y, sr):
    f0, _, _ = librosa.pyin(y, fmin=librosa.note_to_hz('C2'), fmax=librosa.note_to_hz('C7'))
    f0_voiced = f0[~np.isnan(f0)]
    if len(f0_voiced) == 0: return 0.0
    midi_voiced = librosa.hz_to_midi(f0_voiced)
    deviation = midi_voiced - np.round(midi_voiced)
    return float(np.mean(deviation) * 100)

def detect_key(y, sr):
    C = np.abs(librosa.cqt(y, sr=sr, hop_length=512, n_bins=84, bins_per_octave=12))
    chroma = librosa.feature.chroma_cqt(C=C, sr=sr)
    chroma_norm = chroma / (np.linalg.norm(chroma, axis=0, ord=2) + 1e-6)
    profile_scores = []
    for i in range(12):
        profile_scores.append((i, 'maj', np.dot(np.roll(_P_MAJOR, i), chroma_norm).mean()))
        profile_scores.append((i, 'min', np.dot(np.roll(_P_MINOR, i), chroma_norm).mean()))
    best = max(profile_scores, key=lambda x: x[2])
    pitch_class, mode, conf = best
    names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
    name = names[pitch_class] + ('' if mode=='maj' else 'm')
    camelot_map = {
        'C':'8B','G':'9B','D':'10B','A':'11B','E':'12B','B':'1B','F#':'2B','C#':'3B','G#':'4B','D#':'5B','A#':'6B','F':'7B',
        'Am':'8A','Em':'9A','Bm':'10A','F#m':'11A','C#m':'12A','G#m':'1A','D#m':'2A','A#m':'3A','Fm':'4A','Cm':'5A','Gm':'6A','Dm':'7A'
    }
    return {
        "name": name, "camelot": camelot_map.get(name, None), "cents_off": round(estimate_tuning(y, sr), 1),
        "confidence": round(float(np.clip((conf - 0.1)/0.9, 0, 1)), 2), "method": "chroma_cqt+krumhansl",
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
    return {
        "pulse_clarity": round(float(librosa.beat.pulse_clarity(pulse, sr=sr)), 3),
        "rhythmic_complexity": round(float(np.var(oenv)), 3)
    }

def analyze_spectral_balance(y, sr):
    S = np.abs(librosa.stft(y))
    freqs = librosa.fft_frequencies(sr=sr)
    low_idx, mid_idx, high_idx = freqs < 250, (freqs >= 250) & (freqs < 4000), freqs >= 4000
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
    return {"estimated_roughness": round(float(np.mean(dissonance_matrix)) * 100, 3)}

def run_spectral_analysis(file_bytes):
    y, sr = load_audio(file_bytes)
    bg = beat_grid(y, sr)
    key = detect_key(y, sr)
    energy, brightness = energy_brightness(y, sr)
    rhythm = analyze_rhythm(y, sr)
    spectral_balance = analyze_spectral_balance(y, sr)
    roughness = analyze_roughness(y, sr)
    warnings = []
    if key["confidence"] < 0.6: warnings.append("low_key_confidence")
    if bg["bpm_confidence"] < 0.5: warnings.append("low_bpm_confidence")
    return {
        "version": "2025-08-13",
        "source": {"duration_sec": round(len(y)/sr, 2), "sr": sr, "mono": True, "used_window_sec": round(len(y)/sr, 2)},
        "beat_grid": bg, "key": key, "energy": round(energy, 2), "brightness": round(brightness, 2),
        "rhythm": rhythm, "spectral_balance": spectral_balance, "roughness": roughness,
        "diagnostics": {"warnings": warnings}
    }

# --- Mashup Generation Logic (from generate-mashup/index.py) ---
# Note: The helper python modules need to be moved to this `api` directory.
# I will do that in the next step.
from audio_ops import load_wav, save_wav, pitch_shift_semitones, stretch_to_grid_piecewise, apply_gain_db
from align import choose_target_key, plan_shifts
from transitions import s_curve_xfade

def invoke_function(function_name, payload, is_binary=False):
    headers = {'Authorization': f'Bearer {SUPABASE_KEY}'}
    if not is_binary:
        headers['Content-Type'] = 'application/json'
        data = json.dumps(payload)
        files = None
    else:
        data = None
        files = payload

    response = requests.post(
        f"{SUPABASE_URL}/functions/v1/{function_name}",
        data=data,
        files=files,
        headers=headers
    )
    response.raise_for_status()
    return response.json()

def render_mashup(plan, tracks_meta):
    # This function remains largely the same, but needs to load audio from storage
    # This part is complex and depends on how stem separation works.
    # The original script assumed local file paths for stems.
    # This needs to be adapted for a cloud environment.
    # For now, let's assume stem paths are URLs that can be downloaded.
    pass # Leaving this complex part for a future step if needed.

def run_mashup_process(job_id, songs):
    try:
        supabase_client.table('mashup_jobs').update({'status': 'processing', 'details': 'Analyzing tracks...'}).eq('id', job_id).execute()

        # This logic needs to be updated to call the /analyze endpoint of this very API
        # or call the analysis functions directly. Calling directly is more efficient.
        tracks_meta = {}
        for song in songs:
            song_id = song['song_id']
            storage_path = song['storage_path']
            audio_bytes = supabase_client.storage.from_('mashups').download(storage_path)

            analysis = run_spectral_analysis(audio_bytes)

            # Get stems by calling the stem-separation function
            stems_payload = {'file': (song['name'], audio_bytes, 'audio/mpeg')}
            stems_result = invoke_function('stem-separation', stems_payload, is_binary=True)
            stems_dir = stems_result.get('stems_dir', '')

            stems = {
                "vocals": os.path.join(stems_dir, "vocals.wav"),
                "drums": os.path.join(stems_dir, "drums.wav"),
                "bass": os.path.join(stems_dir, "bass.wav"),
                "other": os.path.join(stems_dir, "other.wav")
            }

            tracks_meta[song_id] = {"song_info": song, "stems": stems, "analysis": analysis}

        supabase_client.table('mashup_jobs').update({'details': 'Generating mashup plan...'}).eq('id', job_id).execute()

        director_input = {"tracks": [{**meta['song_info'], "analysis": meta['analysis']} for meta in tracks_meta.values()]}
        mashup_plan = invoke_function('claude-mashup-director', director_input)

        # The rendering part is disabled for now as it's very complex.
        # supabase_client.table('mashup_jobs').update({'details': 'Rendering audio...'}).eq('id', job_id).execute()
        # final_mashup_audio, sr = render_mashup(mashup_plan, tracks_meta)

        supabase_client.table('mashup_jobs').update({
            'status': 'complete', # For now, we mark as complete after planning
            'result_url': 'path/to/placeholder.mp3', # Placeholder
            'details': 'Mashup plan generated. Audio rendering is not yet implemented.',
            'timeline': json.dumps(mashup_plan.get('timeline', []))
        }).eq('id', job_id).execute()

    except Exception as e:
        print(f"Error in background job {job_id}:", file=sys.stderr)
        traceback.print_exc()
        supabase_client.table('mashup_jobs').update({'status': 'failed', 'error_message': str(e)}).eq('id', job_id).execute()

# --- API Endpoints ---
@app.route('/analyze', methods=['POST'])
def analyze_endpoint():
    try:
        data = request.get_json()
        if not data or 'audioData' not in data:
            return jsonify({"error": "Missing audioData in request"}), 400

        audio_bytes = base64.b64decode(data['audioData'])
        analysis_results = run_spectral_analysis(audio_bytes)

        return jsonify({"success": True, "analysis": {"spectralFeatures": analysis_results}})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": "Failed to analyze audio", "details": str(e)}), 500

@app.route('/generate-mashup', methods=['POST'])
def generate_mashup_endpoint():
    try:
        data = request.get_json()
        songs = data.get('songs')
        if not songs or len(songs) < 2:
            return jsonify({"error": "At least two songs are required"}), 400

        job_data = {'songs': songs}
        response = supabase_client.table('mashup_jobs').insert([{'job_data': job_data, 'status': 'starting'}]).execute()
        job_id = response.data[0]['id']

        thread = Thread(target=run_mashup_process, args=(job_id, songs))
        thread.daemon = True
        thread.start()

        return jsonify({"success": True, "jobId": job_id})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": "Failed to start mashup job", "details": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))
