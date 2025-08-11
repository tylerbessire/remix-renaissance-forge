import os
import supabase
import json
import requests
import tempfile
import traceback
import io
from flask import Flask, request, jsonify
from pydub import AudioSegment
import pyrubberband as pyrb
import numpy as np
from threading import Thread

app = Flask(__name__)

# --- Environment Setup ---
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase_client = supabase.create_client(SUPABASE_URL, SUPABASE_KEY)

# --- Background Mashup Process ---
def run_mashup_process(job_id, songs, app_context):
    with app_context:
        try:
            supabase_client.table('mashup_jobs').update({'status': 'processing'}).eq('id', job_id).execute()
            all_song_data = [invoke_function('stem-separation', s)['data'] for s in songs]
            mashup_plan = invoke_function('claude-mashup-director', {"songs": songs, "analysisData": [s['analysis'] for s in all_song_data]})
            final_mashup_content = execute_mashup_plan(mashup_plan, all_song_data)
            storage_path = f"generated/{job_id}.mp3"
            storage_api = supabase_client.storage.from_('mashups')
            storage_api.upload(
                file=io.BytesIO(final_mashup_content),
                path=storage_path,
                file_options={'content-type': 'audio/mp3', 'upsert': 'true'}
            )
            public_url = storage_api.get_public_url(storage_path)
            supabase_client.table('mashup_jobs').update({
                'status': 'complete',
                'result_url': public_url
            }).eq('id', job_id).execute()
        except Exception as e:
            traceback.print_exc()
            supabase_client.table('mashup_jobs').update({
                'status': 'failed',
                'error_message': str(e)
            }).eq('id', job_id).execute()

def invoke_function(function_name, payload):
    headers = {'Authorization': f'Bearer {SUPABASE_KEY}', 'Content-Type': 'application/json'}
    response = requests.post(f"{SUPABASE_URL}/functions/v1/{function_name}", json=payload, headers=headers, timeout=60)
    response.raise_for_status()
    return response.json()

def execute_mashup_plan(plan, all_song_data):
    stem_lookup = {song['song_id']: song['stems'] for song in all_song_data}
    target_bpm = plan.get('global', {}).get('targetBPM')
    final_mashup = AudioSegment.silent(duration=0)
    with tempfile.TemporaryDirectory() as temp_dir:
        for section in plan.get('timeline', []):
            section_duration_ms = int(section.get('duration_seconds', 0) * 1000)
            if section_duration_ms <= 0: continue
            section_segment = AudioSegment.silent(duration=section_duration_ms)
            for layer in section.get('layers', []):
                song_id = layer.get('songId')
                stem_name = layer.get('stem')
                song_data = next((s for s in all_song_data if s['song_id'] == song_id), None)
                if not song_data: continue
                stem_url = song_data['stems'].get(stem_name)
                if not stem_url: continue
                temp_path = os.path.join(temp_dir, f"{song_id}_{stem_name}.wav")
                with requests.get(stem_url, stream=True, timeout=60) as r:
                    r.raise_for_status()
                    with open(temp_path, 'wb') as f:
                        for chunk in r.iter_content(chunk_size=8192):
                            if chunk: f.write(chunk)
                stem_audio = AudioSegment.from_file(temp_path)
                source_bpm = song_data.get('analysis', {}).get('bpm')
                if target_bpm and source_bpm and source_bpm != target_bpm:
                    ratio = target_bpm / source_bpm
                    frame_rate = stem_audio.frame_rate
                    sample_width = stem_audio.sample_width
                    channels = stem_audio.channels
                    arr = np.array(stem_audio.get_array_of_samples())
                    scale = float(2 ** (8 * sample_width - 1))
                    if channels == 2:
                        left = arr[0::2].astype(np.float32) / scale
                        right = arr[1::2].astype(np.float32) / scale
                        left_s = pyrb.time_stretch(left, frame_rate, float(ratio))
                        right_s = pyrb.time_stretch(right, frame_rate, float(ratio))
                        interleaved = np.empty(left_s.size + right_s.size, dtype=np.float32)
                        interleaved[0::2], interleaved[1::2] = left_s, right_s
                        pcm = (np.clip(interleaved, -1.0, 1.0) * (scale - 1)).astype(np.int16)
                    else:
                        mono = arr.astype(np.float32) / scale
                        stretched = pyrb.time_stretch(mono, frame_rate, float(ratio))
                        pcm = (np.clip(stretched, -1.0, 1.0) * (scale - 1)).astype(np.int16)
                    stem_audio = AudioSegment(pcm.tobytes(), frame_rate=frame_rate, sample_width=2, channels=channels)
                stem_audio += layer.get('volume_db', 0)
                if len(stem_audio) < section_duration_ms:
                    stem_audio = stem_audio * (section_duration_ms // len(stem_audio) + 1)
                stem_audio = stem_audio[:section_duration_ms]
                section_segment = section_segment.overlay(stem_audio)
            final_mashup += section_segment
        output_path = os.path.join(temp_dir, "final.mp3")
        final_mashup.export(output_path, format="mp3")
        with open(output_path, 'rb') as f:
            return f.read()

# --- Main Route ---
@app.route('/', methods=['POST'])
def start_mashup_job():
    try:
        data = request.get_json()
        songs = data.get('songs')
        if not songs or len(songs) < 2:
            return jsonify({"error": "At least two songs are required"}), 400
        job_data = {'songs': songs, 'status': 'queued'}
        response = supabase_client.table('mashup_jobs').insert(job_data).execute()
        if not response.data:
            raise RuntimeError("Insert into mashup_jobs returned no rows")
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
