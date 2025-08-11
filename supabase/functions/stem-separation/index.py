import os, io, json, hashlib, tempfile, shutil, time
from typing import Dict
import torch
import soundfile as sf
import librosa

USE_DEMUCS = os.getenv("USE_DEMUCS", "true").lower() == "true"

def sha1_bytes(b: bytes) -> str:
    return hashlib.sha1(b).hexdigest()

def write_wav(tmpdir: str, raw: bytes, sr=44100):
    # Decode with librosa to ensure consistent format (mono->stereo later)
    y, _sr = librosa.load(io.BytesIO(raw), sr=sr, mono=True)
    # Demucs expects stereo; duplicate if mono
    y = librosa.to_mono(y) if y.ndim > 1 else y
    y = (y, y)  # L,R
    y = librosa.util.stack(y, axis=0)
    path = os.path.join(tmpdir, "input.wav")
    sf.write(path, y.T, sr, subtype="PCM_16")
    return path, sr

def separate_demucs(in_wav: str, out_dir: str) -> Dict[str, str]:
    from demucs.pretrained import get_model
    from demucs.apply import apply_model
    import torchaudio

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = get_model("htdemucs").to(device)
    wav, sr = torchaudio.load(in_wav)             # [channels, samples]
    wav = wav.to(device)

    with torch.no_grad():
        stems = apply_model(model, wav[None], split=True, overlap=0.25)[0]  # [stems, ch, T]

    names = ["drums", "bass", "other", "vocals"]
    paths = {}
    os.makedirs(out_dir, exist_ok=True)
    for i, name in enumerate(names):
        y = stems[i].cpu().numpy().T  # [T, ch]
        out = os.path.join(out_dir, f"{name}.wav")
        sf.write(out, y, sr, subtype="PCM_16")
        paths[name] = out
    return paths

def separate_spleeter(in_wav: str, out_dir: str) -> Dict[str, str]:
    # Keep as a real fallback—requires spleeter CLI available in your environment
    # Example: spleeter separate -p spleeter:4stems -o out input.wav
    import subprocess, json as _json
    os.makedirs(out_dir, exist_ok=True)
    cmd = ["spleeter", "separate", "-p", "spleeter:4stems", "-o", out_dir, in_wav]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"Spleeter failed: {res.stderr[:500]}")
    # Spleeter creates directory input with stems
    base = os.path.splitext(os.path.basename(in_wav))[0]
    cand = os.path.join(out_dir, base)
    # Standardize names
    mapping = {
        "vocals.wav": "vocals.wav", "drums.wav": "drums.wav",
        "bass.wav": "bass.wav", "other.wav": "other.wav"
    }
    paths = {}
    for k,v in mapping.items():
        src = os.path.join(cand, k)
        dst = os.path.join(out_dir, v)
        shutil.move(src, dst)
        paths[v.split('.')[0]] = dst
    shutil.rmtree(cand, ignore_errors=True)
    return paths

def handler(body_bytes: bytes) -> str:
    """Expect a multipart handler in your edge wrapper to pass us the raw file bytes under 'file'."""
    start = time.time()
    raw = body_bytes
    if not raw:
        raise ValueError("no file provided")

    file_hash = sha1_bytes(raw)
    cache_root = os.getenv("SEPARATION_CACHE", "/tmp/separation_cache")
    os.makedirs(cache_root, exist_ok=True)
    out_dir = os.path.join(cache_root, file_hash)

    if all(os.path.exists(os.path.join(out_dir, f"{n}.wav")) for n in ["vocals","drums","bass","other"]):
        elapsed = int((time.time() - start) * 1000)
        return json.dumps({"ok": True, "hash": file_hash, "cached": True, "stems_dir": out_dir, "latency_ms": elapsed})

    with tempfile.TemporaryDirectory() as td:
        in_wav, sr = write_wav(td, raw)
        try:
            if USE_DEMUCS:
                stems = separate_demucs(in_wav, out_dir)
            else:
                stems = separate_spleeter(in_wav, out_dir)
        except Exception as e:
            if USE_DEMUCS:
                # hard fail, no silent fallback—upstream can flip USE_DEMUCS=false explicitly
                raise
            raise

    elapsed = int((time.time() - start) * 1000)
    return json.dumps({"ok": True, "hash": file_hash, "cached": False, "stems_dir": out_dir, "latency_ms": elapsed})
