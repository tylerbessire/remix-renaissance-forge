import os
import tempfile
import numpy as np
import librosa
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app) # Enable CORS

# A simple mapping from pitch class to key
KEY_MAP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

def analyze_audio(filepath):
    """Analyzes an audio file and extracts features using librosa."""
    y, sr = librosa.load(filepath)

    # Tempo
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)

    # Key
    chroma = librosa.feature.chroma_stft(y=y, sr=sr)
    chroma_mean = np.mean(chroma, axis=1)
    key_idx = np.argmax(chroma_mean)
    key = KEY_MAP[key_idx]

    # Energy (RMS)
    rms = librosa.feature.rms(y=y)[0]
    energy = np.mean(rms)

    # Brightness (Spectral Centroid)
    spectral_centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
    brightness = np.mean(spectral_centroid) / (sr / 2) # Normalize

    # Mood (valence) - simplified heuristic
    # Using a combination of tempo and mode (major/minor)
    # This is a very simplified placeholder for a real mood analysis
    mode = 'major' if 'maj' in librosa.key.name(key_idx) else 'minor'
    mood = "Happy" if mode == 'major' and tempo > 130 else "Sad" if mode == 'minor' and tempo < 100 else "Energetic" if tempo > 120 else "Chill"

    return {
        "tempo": tempo,
        "key": key,
        "energy": float(energy),
        "brightness": float(brightness),
        "mood": mood,
    }

@app.route('/api/spectral-analysis', methods=['POST'])
def handle_request():
    if 'file' not in request.files:
        return jsonify({"error": "No file part in the request"}), 400

    file = request.files['file']

    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    try:
        with tempfile.NamedTemporaryFile(delete=True, suffix=os.path.splitext(file.filename)[1]) as temp_file:
            file.save(temp_file.name)
            features = analyze_audio(temp_file.name)
            return jsonify(features)

    except Exception as e:
        print(f"Error during analysis: {str(e)}")
        return jsonify({"error": "Failed to analyze audio", "details": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))
