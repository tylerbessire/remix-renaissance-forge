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

app = Flask(__name__)

# --- Environment Setup ---
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase_client = supabase.create_client(SUPABASE_URL, SUPABASE_KEY)

# --- Helper Functions ---
def invoke_function(function_name, payload):
    headers = {'Authorization': f'Bearer {SUPABASE_KEY}', 'Content-Type': 'application/json'}
    response = requests.post(f"{SUPABASE_URL}/functions/v1/{function_name}", json=payload, headers=headers, timeout=60)
    response.raise_for_status()
    return response.json()

def execute_mashup_plan(plan, all_song_data):
    # This function is the same as before, containing the core mixing logic
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
                    y = np.array(stem_audio.get_array_of_samples())
                    # (Simplified stretching logic for brevity, full logic is complex)
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
def process_job_queue():
    """
    This function is intended to be called by a cron job.
    It fetches one 'queued' job and processes it.
    """
    try:
        # 1. Fetch one queued job
        # Using .limit(1).single() is a common way to atomically get and update one row,
        # though it requires specific table policies or a plpgsql function in a real scenario.
        # For simplicity, we'll just fetch and update.
        response = supabase_client.table('mashup_jobs').select('*').eq('status', 'queued').limit(1).execute()

        if not response.data:
            return jsonify({"message": "No queued jobs to process."}), 200

        job = response.data[0]
        job_id = job['id']
        songs = job['job_data']['songs']

        # 2. Mark job as 'processing'
        supabase_client.table('mashup_jobs').update({'status': 'processing'}).eq('id', job_id).execute()

        # 3. Run the full mashup process
        all_song_data = [invoke_function('stem-separation', s)['data'] for s in songs]
        mashup_plan = invoke_function('claude-mashup-director', {"songs": songs, "analysisData": [s['analysis'] for s in all_song_data]})
        final_mashup_content = execute_mashup_plan(mashup_plan, all_song_data)

        # 4. Upload result
        storage_path = f"generated/{job_id}.mp3"
        storage_api = supabase_client.storage.from_('mashups')
        storage_api.upload(file=io.BytesIO(final_mashup_content), path=storage_path, file_options={'content-type': 'audio/mp3', 'upsert': 'true'})
        public_url = storage_api.get_public_url(storage_path)['publicUrl']

        # 5. Mark job as 'complete'
        supabase_client.table('mashup_jobs').update({
            'status': 'complete',
            'result_url': public_url,
            'title': mashup_plan.get('title'),
            'concept': mashup_plan.get('concept')
        }).eq('id', job_id).execute()

        return jsonify({"message": f"Successfully processed job {job_id}"}), 200

    except Exception as e:
        # If an error occurs, mark the job as 'failed'
        job_id_on_error = locals().get('job_id')
        if job_id_on_error:
            supabase_client.table('mashup_jobs').update({
                'status': 'failed',
                'error_message': str(e)
            }).eq('id', job_id_on_error).execute()

        traceback.print_exc()
        return jsonify({"error": "Failed to process job", "details": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))
