import numpy as np
from scipy.signal import butter, lfilter

def s_curve_xfade(a: np.ndarray, b: np.ndarray, sr: int, bars: int, bpm: float) -> np.ndarray:
    # bars -> seconds
    sec = 60.0 / bpm * 4 * bars
    n = int(sec * sr)
    a = a[-n:] if a.shape[0] > n else a
    b = b[:n]  if b.shape[0] > n else b
    t = np.linspace(-1, 1, b.shape[0])[:, None]
    w = 0.5 * (1 + np.tanh(3 * t))  # smooth S
    out = (1 - w) * a + w * b
    return np.concatenate([out, b[n:]], axis=0) if b.shape[0] > n else out

def butter_filter(y, sr, cutoff, btype="low", order=4):
    nyq = 0.5 * sr
    normal = np.clip(cutoff / nyq, 1e-5, 0.999)
    b, a = butter(order, normal, btype=btype)
    return lfilter(b, a, y, axis=0)

def filter_sweep(y: np.ndarray, sr: int, start_hz: float, end_hz: float, duration_sec: float, mode="low"):
    # simple per-block sweep
    n = int(duration_sec * sr)
    n = min(n, y.shape[0])
    out = y.copy()
    for i in range(0, n, sr // 16):
        t = i / max(n - 1, 1)
        cutoff = start_hz * (end_hz / start_hz) ** t
        out[i:i+sr//16] = butter_filter(out[i:i+sr//16], sr, cutoff, btype=("low" if mode=="low" else "high"))
    return out

def echo_out(y: np.ndarray, sr: int, delay_ms=300, feedback=0.35):
    d = int(sr * delay_ms / 1000)
    out = y.copy()
    buf = np.zeros_like(y)
    for i in range(d, y.shape[0]):
        buf[i] = out[i] + feedback * buf[i - d]
    return buf

def sidechain_duck(bed: np.ndarray, sr: int, bpm: float, bars: int = 2, depth_db= -6.0):
    # 4-on-the-floor pump envelope over N bars
    beats = int(4 * bars)
    dur = int(sr * (60.0 / bpm))
    env = np.ones((dur, 1))
    # quick pump: dip then recover
    t = np.linspace(0, 1, dur)[:, None]
    env = 0.3 + 0.7 * t
    env = np.clip(env, 0.3, 1.0)
    out = bed.copy()
    idx = 0
    for _ in range(beats):
        end = min(idx + dur, out.shape[0])
        out[idx:end] *= env[:end-idx]
        idx = end
    return out
