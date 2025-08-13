import os
import uuid
import supabase
import json
import requests
import tempfile
import traceback
import sys
import base64
from threading import Thread
import numpy as np

# Import the new helper modules
from .audio_ops import load_wav, save_wav, pitch_shift_semitones, stretch_to_grid_piecewise, apply_gain_db
from .align import choose_target_key, plan_shifts
from .transitions import s_curve_xfade, filter_sweep, echo_out, sidechain_duck

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

def run_mashup_process(job_id, songs):
    try:
        supabase_client.table('mashup_jobs').update({'status': 'processing', 'details': 'Analyzing tracks...'}).eq('id', job_id).execute()

        tracks_meta = {}
        for song in songs:
                song_id = song['song_id']
                storage_path = song['storage_path']

                # Fetch the audio file from storage
                audio_bytes = supabase_client.storage.from_('mashups').download(storage_path)
                audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')

                # Get spectral analysis
                analysis_payload = {
                    "audioData": audio_base64,
                    "songId": song_id
                }
                analysis = invoke_function('spectral-analysis', analysis_payload, is_binary=False)

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

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No input data file path provided"}), file=sys.stderr)
        sys.exit(1)

    input_filepath = sys.argv[1]

    try:
        with open(input_filepath, 'r') as f:
            data = json.load(f)

        songs = data.get('songs')
        if not songs or len(songs) < 2:
            print(json.dumps({"error": "At least two songs are required"}), file=sys.stderr)
            sys.exit(1)

        # Create a job record in Supabase
        job_data = {'songs': songs}
        response = supabase_client.table('mashup_jobs').insert([{'job_data': job_data, 'status': 'starting'}]).execute()
        job_id = response.data[0]['id']

        # Immediately return the job ID to the calling process
        print(json.dumps({"success": True, "jobId": job_id}))
        sys.stdout.flush()

        # Start the long-running process in a separate thread
        # This allows the main script to exit while the work continues
        thread = Thread(target=run_mashup_process, args=(job_id, songs))
        thread.daemon = True # This allows the main thread to exit even if this thread is running
        thread.start()
        # The main thread will now exit, but the daemon thread will continue in the background
        # in the context of the running Python interpreter process invoked by Deno.

    except Exception as e:
        print(json.dumps({"error": "Failed to start mashup job", "details": str(e)}), file=sys.stderr)
        sys.exit(1)