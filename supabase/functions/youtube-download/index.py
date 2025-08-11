import os
import json
import subprocess
import uuid
import tempfile
from flask import Flask, request, jsonify
import supabase

app = Flask(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
supabase_client = supabase.create_client(SUPABASE_URL, SUPABASE_KEY)

STORAGE_BUCKET = 'mashups'

# Helper function to add CORS headers
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    return response

@app.route('/', methods=['POST', 'OPTIONS'])
def handle_request():
    if request.method == 'OPTIONS':
        return add_cors_headers(jsonify({}))

    try:
        data = request.get_json()
        youtube_url = data.get('url')
        song_title = data.get('title', 'Untitled_Song')

        if not youtube_url:
            return add_cors_headers(jsonify({"error": "A 'url' parameter is required."})), 400

        with tempfile.TemporaryDirectory() as temp_dir:
            unique_id = str(uuid.uuid4())
            safe_title = "".join(c for c in song_title if c.isalnum() or c in (' ', '_')).rstrip()
            temp_filename = f"{unique_id}_{safe_title}.mp3"
            temp_filepath = os.path.join(temp_dir, temp_filename)

            command = [
                'yt-dlp',
                '-f', 'bestaudio/best',
                '-x', '--audio-format', 'mp3',
                '-o', temp_filepath,
                youtube_url
            ]

            subprocess.run(command, check=True, capture_output=True)

            with open(temp_filepath, 'rb') as f:
                audio_content = f.read()

            storage_path = f"youtube-downloads/{temp_filename}"

            supabase_client.storage.from_(STORAGE_BUCKET).upload(
                path=storage_path,
                file=audio_content,
                file_options={"content-type": "audio/mpeg", "upsert": "true"}
            )

            return add_cors_headers(jsonify({
                "success": True,
                "storage_path": storage_path
            }))

    except subprocess.CalledProcessError as e:
        print(f"yt-dlp error: {e.stderr.decode()}")
        return add_cors_headers(jsonify({"error": "Failed to download audio from YouTube", "details": e.stderr.decode()})), 500
    except Exception as e:
        print(f"An unexpected error occurred: {str(e)}")
        return add_cors_headers(jsonify({"error": "An unexpected error occurred", "details": str(e)})), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))
