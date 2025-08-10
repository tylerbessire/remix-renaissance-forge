import os
import uuid
import supabase
import json
import requests
import tempfile
import traceback
from flask import Flask, request, jsonify, Response
from pydub import AudioSegment
import rubberband as rb
import numpy as np
from threading import Thread

app = Flask(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase_client = supabase.create_client(SUPABASE_URL, SUPABASE_KEY)

# --- Background Mashup Process ---
def run_mashup_process(job_id, songs, app_context):
    """This function runs in a background thread to avoid timeouts."""
    with app_context:
        try:
            # 1. Update status to 'processing'
            supabase_client.table('mashup_jobs').update({'status': 'processing'}).eq('id', job_id).execute()

            # 2. Get stems and analysis for each song
            all_song_data = [invoke_function('stem-separation', s)['data'] for s in songs]

            # 3. Get the creative direction
            mashup_plan = invoke_function('claude-mashup-director', {"songs": songs, "analysisData": [s['analysis'] for s in all_song_data]})

            # 4. Execute the mashup plan
            final_mashup_content = execute_mashup_plan(mashup_plan, all_song_data)

            # 5. Upload the final result
            storage_path = f"generated/{job_id}.mp3"
            supabase_client.storage.from_('mashups').upload(storage_path, final_mashup_content, {'contentType': 'audio/mp3', 'upsert': 'true'})

            # 6. Update job as 'complete' with the result URL
            supabase_client.table('mashup_jobs').update({
                'status': 'complete',
                'result_url': storage_path
            }).eq('id', job_id).execute()

        except Exception as e:
            print(f"Error in background job {job_id}:")
            traceback.print_exc()
            supabase_client.table('mashup_jobs').update({
                'status': 'failed',
                'error_message': str(e)
            }).eq('id', job_id).execute()


def invoke_function(function_name, payload):
    headers = {'Authorization': f'Bearer {SUPABASE_KEY}', 'Content-Type': 'application/json'}
    response = requests.post(f"{SUPABASE_URL}/functions/v1/{function_name}", json=payload, headers=headers)
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
                r = requests.get(stem_url)
                r.raise_for_status()
                with open(temp_path, 'wb') as f: f.write(r.content)
                stem_audio = AudioSegment.from_file(temp_path)
                source_bpm = song_data.get('analysis', {}).get('bpm')
                if target_bpm and source_bpm and source_bpm != target_bpm:
                    ratio = target_bpm / source_bpm
                    y = np.array(stem_audio.get_array_of_samples())
                    y_stretched = rb.stretch(y, stem_audio.frame_rate, ratio)
                    stem_audio = AudioSegment(y_stretched.tobytes(), frame_rate=stem_audio.frame_rate, sample_width=stem_audio.sample_width, channels=stem_audio.channels)
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

@app.route('/', methods=['POST'])
def start_mashup_job():
    try:
        data = request.get_json()
        songs = data.get('songs')
        if not songs or len(songs) < 2:
            return jsonify({"error": "At least two songs are required"}), 400

        # 1. Create a new job in the database
        job_data = {'songs': songs}
        response = supabase_client.table('mashup_jobs').insert({'job_data': job_data}).execute()
        job_id = response.data[0]['id']

        # 2. Start the background process
        thread = Thread(target=run_mashup_process, args=(job_id, songs, app.app_context()))
        thread.daemon = True
        thread.start()

        # 3. Immediately return the job ID
        return jsonify({"success": True, "jobId": job_id})

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": "Failed to start mashup job", "details": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))