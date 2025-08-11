import os
import json
import subprocess
from flask import Flask, request, jsonify

app = Flask(__name__)

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
        query = data.get('query')

        if not query:
            return add_cors_headers(jsonify({"error": "A 'query' parameter is required."})), 400

        command = [
            'yt-dlp',
            '--dump-json',
            f'ytsearch5:{query}'
        ]

        process = subprocess.run(command, capture_output=True, text=True, check=True)

        results = []
        for line in process.stdout.strip().split('\n'):
            video_info = json.loads(line)
            results.append({
                'id': video_info.get('id'),
                'title': video_info.get('title'),
                'url': video_info.get('webpage_url'),
                'duration': video_info.get('duration_string'),
                'thumbnail': video_info.get('thumbnail'),
            })

        return add_cors_headers(jsonify({"success": True, "results": results}))

    except subprocess.CalledProcessError as e:
        return add_cors_headers(jsonify({"error": "Failed to execute yt-dlp", "details": e.stderr})), 500
    except Exception as e:
        return add_cors_headers(jsonify({"error": "An unexpected error occurred", "details": str(e)})), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))
