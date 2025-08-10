import os
import supabase
import librosa
import numpy as np
import soundfile as sf
from spleeter.separator import Separator
import hashlib
import json
import requests
import tempfile
from flask import Flask, request, jsonify
from datetime import datetime

app = Flask(__name__)

# --- Environment Setup ---
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") # Use service role key for admin access
supabase_client = supabase.create_client(SUPABASE_URL, SUPABASE_KEY)
separator = Separator('spleeter:4stems')

# --- Caching ---
def get_cached_result(audio_hash):
    try:
        response = supabase_client.table('mashup_cache').select('metadata').eq('audio_hash', audio_hash).single().execute()
        return json.loads(response.data['metadata']) if response.data else None
    except Exception:
        return None # Cache miss on any error

def set_cached_result(audio_hash, metadata):
    try:
        supabase_client.table('mashup_cache').insert({
            'audio_hash': audio_hash,
            'metadata': json.dumps(metadata)
        }).execute()
    except Exception as e:
        print(f"Failed to cache result for hash {audio_hash}: {e}")

# --- Audio Analysis ---
def analyze_audio(file_path):
    y, sr = librosa.load(file_path, sr=None)
    bpm, _ = librosa.beat.beat_track(y=y, sr=sr)
    chroma = librosa.feature.chroma_stft(y=y, sr=sr)

    # LUFS normalization would require a dedicated library like 'pyloudnorm'
    # For now, we'll use RMS energy as a proxy for loudness.
    rms_energy = librosa.feature.rms(y=y)[0]

    return {
        "bpm": round(float(bpm), 2),
        "key": librosa.key.key_name(chroma)[0],
        "duration_seconds": round(librosa.get_duration(y=y, sr=sr), 2),
        "chroma_profile": np.mean(chroma, axis=1).tolist(),
        "harmonic_complexity": float(np.std(chroma)),
        "energy": float(np.mean(rms_energy)),
        "spectral_brightness": float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)))
    }

# --- Main Route ---
@app.route('/', methods=['POST'])
def process_audio_route():
    data = request.get_json()
    audio_url = data.get('audio_url')
    if not audio_url:
        return jsonify({"error": "audio_url is required"}), 400

    with tempfile.TemporaryDirectory() as temp_dir:
        try:
            # Download, hash, and save audio simultaneously
            response = requests.get(audio_url, stream=True)
            response.raise_for_status()
            hasher = hashlib.sha256()
            temp_audio_path = os.path.join(temp_dir, "original.audio")
            with open(temp_audio_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
                    hasher.update(chunk)
            audio_hash = hasher.hexdigest()

            # Check cache
            cached_metadata = get_cached_result(audio_hash)
            if cached_metadata:
                return jsonify({"status": "success", "cached": True, "data": cached_metadata})

            # 1. Analyze Audio
            analysis_metadata = analyze_audio(temp_audio_path)

            # 2. Separate Stems
            output_path = os.path.join(temp_dir, "output")
            separator.separate_to_file(temp_audio_path, output_path)

            # 3. Upload Stems
            stem_urls = {}
            original_filename = os.path.splitext(os.path.basename(temp_audio_path))[0]
            stem_dir = os.path.join(output_path, original_filename)
            for stem_file in ['vocals.wav', 'drums.wav', 'bass.wav', 'other.wav']:
                stem_name = stem_file.split('.')[0]
                local_path = os.path.join(stem_dir, stem_file)
                if os.path.exists(local_path):
                    storage_path = f"{audio_hash}/{stem_file}"
                    with open(local_path, 'rb') as f:
                        supabase_client.storage.from_('mashups').upload(storage_path, f, {'contentType': 'audio/wav', 'upsert': 'true'})
                    stem_urls[stem_name] = storage_path

            # 4. Compile Metadata
            full_metadata = {
                "audio_hash": audio_hash,
                "analysis": analysis_metadata,
                "stems": stem_urls,
                "processed_at": datetime.utcnow().isoformat()
            }

            # 5. Cache Result
            set_cached_result(audio_hash, full_metadata)

            return jsonify({"status": "success", "cached": False, "data": full_metadata})

        except Exception as e:
            return jsonify({"error": "Processing failed", "details": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))
