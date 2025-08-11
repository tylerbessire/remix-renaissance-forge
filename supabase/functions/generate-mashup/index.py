import os
import uuid
import supabase
import json
import requests
import tempfile
import traceback
from flask import Flask, request, jsonify
from threading import Thread
import numpy as np

# Import the new helper modules
from .audio_ops import load_wav, save_wav, pitch_shift_semitones, stretch_to_grid_piecewise, apply_gain_db
from .align import choose_target_key, plan_shifts
from .transitions import s_curve_xfade, filter_sweep, echo_out, sidechain_duck

app = Flask(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase_client = supabase.create_client(SUPABASE_URL, SUPABASE_KEY)

def invoke_function(function_name, payload, is_binary=False):
    headers = {'Authorization': f'Bearer {SUPABASE_KEY}'}
    if not is_binary:
        headers['Content-Type'] = 'application/json'
        data = json.dumps(payload)
        files = None
    else:
        data = None
        files = payload # Expects {'file': (filename, file_bytes, content_type)}

    response = requests.post(
        f"{SUPABASE_URL}/functions/v1/{function_name}",
        data=data,
        files=files,
        headers=headers
    )
    response.raise_for_status()
    return response.json()

def render_mashup(plan, tracks_meta):
    keys = [meta["analysis"]["key"]["name"] for meta in tracks_meta.values()]
    bpms = [meta["analysis"]["beat_grid"]["bpm"] for meta in tracks_meta.values()]
    target_key = choose_target_key(keys)
    target_bpm = float(sorted(bpms)[len(bpms)//2])

    ref_track_id = max(tracks_meta, key=lambda tid: len(tracks_meta[tid]["analysis"]["beat_grid"]["beats_sec"]))
    target_beats = tracks_meta[ref_track_id]["analysis"]["beat_grid"]["beats_sec"]

    per_track_keys = {tid: meta["analysis"]["key"]["name"] for tid, meta in tracks_meta.items()}
    shifts, vocal_limit, music_limit = plan_shifts(per_track_keys, target_key)

    prepped = {}
    for tid, meta in tracks_meta.items():
        beats = meta["analysis"]["beat_grid"]["beats_sec"]
        stems = {}
        for stem_name, path in meta["stems"].items():
            y, sr = load_wav(path)
            y = stretch_to_grid_piecewise(y, sr, beats, target_beats)
            shift = shifts[tid]
            lim = vocal_limit if stem_name == "vocals" else music_limit
            shift = max(min(shift, lim), -lim)
            if shift != 0:
                y = pitch_shift_semitones(y, sr, shift)
            stems[stem_name] = y
        prepped[tid] = {"stems": stems, "sr": sr}

    master = None
    sr = list(prepped.values())[0]["sr"]
    for i, sec in enumerate(plan["sections"]):
        mix = None
        for layer in sec["layers"]:
            tid, stem = layer["track_id"], layer["stem"]
            y = prepped[tid]["stems"][stem].copy()
            if "gain_db" in layer:
                y = apply_gain_db(y, layer["gain_db"])
            mix = y if mix is None else mix[:y.shape[0]] + y[:mix.shape[0]]

        if master is None:
            master = mix
        else:
            style = sec.get("transition", "clean_cross")
            if style == "clean_cross":
                master = s_curve_xfade(master, mix, sr, bars=sec.get("xfade_bars", 2), bpm=target_bpm)
            else:
                master = s_curve_xfade(master, mix, sr, bars=2, bpm=target_bpm)

    peak = np.max(np.abs(master))
    if peak > 0:
        master = master * (0.98 / peak)
    return master, sr

def run_mashup_process(job_id, songs, app_context):
    with app_context:
        try:
            supabase_client.table('mashup_jobs').update({'status': 'processing', 'details': 'Analyzing tracks...'}).eq('id', job_id).execute()

            tracks_meta = {}
            for song in songs:
                song_id = song['song_id']
                storage_path = song['storage_path']

                # Fetch the audio file from storage
                audio_bytes = supabase_client.storage.from_('mashups').download(storage_path)

                # Get spectral analysis
                analysis_payload = {'file': (song['name'], audio_bytes, 'audio/mpeg')}
                analysis = invoke_function('spectral-analysis', analysis_payload, is_binary=True)

                # Get stems
                stems_payload = {'file': (song['name'], audio_bytes, 'audio/mpeg')}
                stems_result = invoke_function('stem-separation', stems_payload, is_binary=True)
                stems_dir = stems_result['stems_dir']

                # This is a simplification. The stem separation function returns a directory path.
                # In a real scenario, we'd need a shared file system or to upload the stems back to storage
                # and get their paths. For now, we'll assume the path is accessible.
                stems = {
                    "vocals": os.path.join(stems_dir, "vocals.wav"),
                    "drums": os.path.join(stems_dir, "drums.wav"),
                    "bass": os.path.join(stems_dir, "bass.wav"),
                    "other": os.path.join(stems_dir, "other.wav")
                }

                tracks_meta[song_id] = {"song_info": song, "stems": stems, "analysis": analysis}

            supabase_client.table('mashup_jobs').update({'details': 'Generating mashup plan...'}).eq('id', job_id).execute()

            director_input = {
                "tracks": [{**meta['song_info'], "analysis": meta['analysis']} for meta in tracks_meta.values()],
                "constraints": {"preview_seconds": 105}
            }
            mashup_plan = invoke_function('director-v2', director_input) # Assuming director-v2 is the function name

            supabase_client.table('mashup_jobs').update({'details': 'Rendering audio...'}).eq('id', job_id).execute()

            final_mashup_audio, sr = render_mashup(mashup_plan, tracks_meta)

            storage_path = f"generated/{job_id}.mp3"
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=True) as temp_f:
                save_wav(temp_f.name, final_mashup_audio, sr)
                with open(temp_f.name, "rb") as f_read:
                    supabase_client.storage.from_('mashups').upload(storage_path, f_read.read(), {'contentType': 'audio/wav', 'upsert': 'true'})

            supabase_client.table('mashup_jobs').update({
                'status': 'complete',
                'result_url': storage_path,
                'details': 'Mashup complete!',
                'timeline': json.dumps(mashup_plan.get('sections', []))
            }).eq('id', job_id).execute()

        except Exception as e:
            print(f"Error in background job {job_id}:")
            traceback.print_exc()
            supabase_client.table('mashup_jobs').update({'status': 'failed', 'error_message': str(e)}).eq('id', job_id).execute()


@app.route('/', methods=['POST'])
def start_mashup_job():
    try:
        data = request.get_json()
        songs = data.get('songs')
        if not songs or len(songs) < 2:
            return jsonify({"error": "At least two songs are required"}), 400

        job_data = {'songs': songs}
        response = supabase_client.table('mashup_jobs').insert([{'job_data': job_data}]).execute()
        job_id = response.data[0]['id']

        thread = Thread(target=run_mashup_process, args=(job_id, songs, app.app_context()))
        thread.daemon = True
        thread.start()

        return jsonify({"success": True, "jobId": job_id})

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": "Failed to start mashup job", "details": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))