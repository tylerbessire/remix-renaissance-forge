import os
import supabase
import json
import requests
import tempfile
import uuid
import numpy as np
from flask import Flask, request, jsonify
from pydub import AudioSegment
import rubberband  # For time-stretching

app = Flask(__name__)

# --- Environment Setup ---
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase_client = supabase.create_client(SUPABASE_URL, SUPABASE_KEY)

# --- Function Invocation ---
def invoke_function(function_name, payload):
    headers = {
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json'
    }
    response = requests.post(f"{SUPABASE_URL}/functions/v1/{function_name}", json=payload, headers=headers)
    response.raise_for_status()
    return response.json()

# --- Audio Mixing Logic ---
def execute_mashup_plan(plan, all_song_data):
    stem_lookup = {song['song_id']: song['stems'] for song in all_song_data}
    target_bpm = plan.get('global', {}).get('targetBPM')

    final_mashup = AudioSegment.silent(duration=0)

    with tempfile.TemporaryDirectory() as temp_dir:
        for section in plan.get('timeline', []):
            section_duration_ms = int(section.get('duration_seconds', 0) * 1000)
            if section_duration_ms <= 0:
                continue

            section_segment = AudioSegment.silent(duration=section_duration_ms)

            for layer in section.get('layers', []):
                song_id = layer.get('songId')
                stem_name = layer.get('stem')

                song_data = next((s for s in all_song_data if s['song_id'] == song_id), None)
                if not song_data:
                    continue

                stem_path = song_data['stems'].get(stem_name)
                if not stem_path:
                    continue

                # Create a short-lived signed URL to download the private stem
                signed = supabase_client.storage.from_('mashups').create_signed_url(stem_path, 3600)
                signed_url = signed.get('signed_url') or signed.get('signedURL')

                temp_path = os.path.join(temp_dir, f"{song_id}_{stem_name}.wav")
                response = requests.get(signed_url)
                response.raise_for_status()
                with open(temp_path, 'wb') as f:
                    f.write(response.content)

                stem_audio = AudioSegment.from_file(temp_path)

                # Time-stretch to target BPM if needed
                source_bpm = song_data.get('analysis', {}).get('bpm')
                if target_bpm and source_bpm and source_bpm != target_bpm:
                    stretch_ratio = target_bpm / source_bpm
                    # This requires rubberband-cli to be installed in the function environment
                    y = np.array(stem_audio.get_array_of_samples())
                    y_stretched = rubberband.stretch(y, stem_audio.frame_rate, stretch_ratio)
                    stem_audio = AudioSegment(y_stretched.tobytes(), frame_rate=stem_audio.frame_rate, sample_width=stem_audio.sample_width, channels=stem_audio.channels)

                stem_audio += layer.get('volume_db', 0)

                if len(stem_audio) < section_duration_ms:
                    stem_audio = stem_audio * (section_duration_ms // len(stem_audio) + 1)

                stem_audio = stem_audio[:section_duration_ms]
                section_segment = section_segment.overlay(stem_audio)

            final_mashup += section_segment

        output_path = os.path.join(temp_dir, "final_mashup.mp3")
        final_mashup.export(output_path, format="mp3")

        # Return the content of the file, not the path
        with open(output_path, 'rb') as f:
            return f.read()

# --- Main Route ---
@app.route('/', methods=['POST'])
def generate_mashup_route():
    try:
        data = request.get_json()
        songs = data.get('songs')
        if not songs or len(songs) < 2:
            return jsonify({"error": "At least two songs are required"}), 400

        processed_songs = []
        for s in songs:
            # Create a short-lived signed URL for the uploaded user track
            signed = supabase_client.storage.from_('mashups').create_signed_url(s['storage_path'], 3600)
            signed_url = signed.get('signed_url') or signed.get('signedURL')
            stem_resp = invoke_function('stem-separation', { 'audio_url': signed_url })
            song_data = stem_resp['data']
            # Attach the input song id/name for downstream referencing
            song_data['song_id'] = s.get('song_id') or s.get('id')
            song_data['name'] = s.get('name')
            song_data['artist'] = s.get('artist')
            processed_songs.append(song_data)
        all_song_data = processed_songs

        mashup_plan = invoke_function('claude-mashup-director', {"songs": songs, "analysisData": [s['analysis'] for s in all_song_data]})

        final_mashup_content = execute_mashup_plan(mashup_plan, all_song_data)

        mashup_id = f"mashup_{songs[0]['song_id']}_{songs[1]['song_id']}_{uuid.uuid4()}"
        storage_path = f"generated/{mashup_id}.mp3"

        supabase_client.storage.from_('mashups').upload(storage_path, final_mashup_content, {'contentType': 'audio/mp3', 'upsert': 'true'})
        final_mashup_url = supabase_client.storage.from_('mashups').get_public_url(storage_path)

        return jsonify({
            "success": True,
            "mashup_url": final_mashup_url,
            "title": mashup_plan.get("title", "Untitled Mashup"),
            "concept": mashup_plan.get("concept", "A cool mashup.")
        })

    except Exception as e:
        return jsonify({"error": "Failed to generate mashup", "details": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))
