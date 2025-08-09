import os
import supabase
import json
from flask import Flask, request, jsonify
import requests # To invoke other functions

app = Flask(__name__)

# Initialize Supabase client
supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_KEY")
supabase_client = supabase.create_client(supabase_url, supabase_key)

# --- Function Invocation ---
def invoke_function(function_name, payload):
    """Invokes another Supabase function."""
    # Note: This requires setting up the service role key for server-to-server calls
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    headers = {
        'Authorization': f'Bearer {service_role_key}',
        'Content-Type': 'application/json'
    }
    response = requests.post(f"{supabase_url}/functions/v1/{function_name}", json=payload, headers=headers)
    response.raise_for_status()
    return response.json()

# --- Audio Mixing Logic ---
def execute_mashup_plan(plan, stem_data):
    """
    Executes the mashup plan from the AI director.
    This is where the core audio processing will happen.
    It will use libraries like pydub and pyrubberband.
    """
    # TODO: Parse the structured JSON "score" from the AI director

    # TODO: Download the necessary stems from Supabase Storage

    # TODO: Use pydub/librosa to slice, dice, crossfade, and mix the stems
    # according to the timeline in the plan.

    # TODO: Apply pitch shifting or time stretching as required by the plan.

    # For now, return a path to a dummy output file
    output_path = "/tmp/final_mashup.mp3"
    with open(output_path, 'w') as f:
        f.write("dummy mashup content")
    return output_path

# --- Supabase Storage ---
def upload_to_storage(file_path, storage_path):
    """Uploads the final mashup to Supabase Storage."""
    with open(file_path, 'rb') as f:
        supabase_client.storage.from_('mashups').upload(storage_path, f)
    return supabase_client.storage.from_('mashups').get_public_url(storage_path)

@app.route('/', methods=['POST'])
def generate_mashup_route():
    try:
        data = request.get_json()
        songs = data.get('songs') # Expects a list of song objects with audio_url, id, etc.

        if not songs or len(songs) < 2:
            return jsonify({"error": "At least two songs are required"}), 400

        # Step 1: Get stems and analysis for each song
        all_song_data = []
        for song in songs:
            stem_payload = {"audio_url": song['audio_url'], "song_id": song['id']}
            song_data = invoke_function('stem-separation', stem_payload)
            all_song_data.append(song_data['data'])

        # Step 2: Get the creative direction from the AI director
        director_payload = {
            "songs": songs,
            "analysisData": [s['analysis'] for s in all_song_data]
        }
        mashup_plan = invoke_function('claude-mashup-director', director_payload)

        # Step 3: Execute the mashup plan
        final_mashup_path = execute_mashup_plan(mashup_plan, all_song_data)

        # Step 4: Upload the final result to storage
        mashup_id = f"mashup_{songs[0]['id']}_{songs[1]['id']}"
        final_storage_path = f"{mashup_id}/final.mp3"
        final_mashup_url = upload_to_storage(final_mashup_path, final_storage_path)

        return jsonify({
            "status": "success",
            "mashup_url": final_mashup_url,
            "title": mashup_plan.get("title", "Untitled Mashup"),
            "concept": mashup_plan.get("concept", "A cool mashup.")
        }), 200

    except Exception as e:
        return jsonify({"error": "Failed to generate mashup", "details": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))
