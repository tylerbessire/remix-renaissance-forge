import os
import json
import subprocess
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app) # Enable CORS for all routes

@app.route('/', methods=['POST'])
def handle_request():
    try:
        data = request.get_json()
        query = data.get('query')

        if not query:
            return jsonify({"error": "A 'query' parameter is required."}), 400

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

        return jsonify({"success": True, "results": results})

    except subprocess.CalledProcessError as e:
        return jsonify({"error": "Failed to execute yt-dlp", "details": e.stderr.decode()}), 500
    except Exception as e:
        return jsonify({"error": "An unexpected error occurred", "details": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))
