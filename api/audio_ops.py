from typing import List, Tuple
import numpy as np
import soundfile as sf
import pyrubberband as rb

def load_wav(path: str) -> Tuple[np.ndarray, int]:
    y, sr = sf.read(path, always_2d=True)  # shape [T, C]
    return y, sr

def save_wav(path: str, y: np.ndarray, sr: int):
    sf.write(path, y, sr, subtype="PCM_16")

def apply_gain_db(y: np.ndarray, db: float) -> np.ndarray:
    return y * (10.0 ** (db / 20.0))

def time_stretch_uniform(y: np.ndarray, sr: int, rate: float) -> np.ndarray:
    # rate > 1 speeds up (shorter); <1 slows down (longer)
    chans = []
    for c in range(y.shape[1]):
        chans.append(rb.time_stretch(y[:, c], sr, rate))
    out = np.stack(chans, axis=1)
    return out

def pitch_shift_semitones(y: np.ndarray, sr: int, semitones: float) -> np.ndarray:
    chans = []
    for c in range(y.shape[1]):
        chans.append(rb.pitch_shift(y[:, c], sr, semitones))
    out = np.stack(chans, axis=1)
    return out

def _xfade(a: np.ndarray, b: np.ndarray, sr: int, ms: float = 10.0) -> np.ndarray:
    # short crossfade to avoid clicks between stretched chunks
    n = int(sr * ms / 1000.0)
    if n <= 0: return np.concatenate([a, b], axis=0)
    a_tail = a[-n:]
    b_head = b[:n]
    w = np.linspace(0, 1, n)[:, None]
    cross = (1 - w) * a_tail + w * b_head
    return np.concatenate([a[:-n], cross, b[n:]], axis=0)

def stretch_to_grid_piecewise(y: np.ndarray, sr: int,
                              src_beats: List[float], tgt_beats: List[float]) -> np.ndarray:
    """
    Piecewise-stretch audio so each source beat interval fits the target beat interval.
    Assumes lengths are comparable; uses per-beat uniform stretch + 10ms crossfades.
    """
    assert len(src_beats) >= 2 and len(tgt_beats) >= 2
    segs = []
    for i in range(min(len(src_beats)-1, len(tgt_beats)-1)):
        s0, s1 = src_beats[i], src_beats[i+1]
        t0, t1 = tgt_beats[i], tgt_beats[i+1]
        src_len = int((s1 - s0) * sr)
        tgt_len = int((t1 - t0) * sr)
        chunk = y[int(s0*sr):int(s1*sr)]
        if len(chunk) < 32: continue
        rate = len(chunk) / max(tgt_len, 1)     # rubberband expects rate, not target len
        stretched = time_stretch_uniform(chunk, sr, rate)
        # If stretched too long/short due to rounding, pad/trim
        if stretched.shape[0] > tgt_len:
            stretched = stretched[:tgt_len]
        elif stretched.shape[0] < tgt_len:
            pad = np.zeros((tgt_len - stretched.shape[0], stretched.shape[1]), dtype=stretched.dtype)
            stretched = np.vstack([stretched, pad])
        if segs:
            segs[-1] = _xfade(segs[-1], stretched, sr, ms=12.0)
        else:
            segs.append(stretched)
            continue
        segs.append(stretched)  # append as placeholder; will be merged next loop
    # Merge segments (every odd index is same as previous due to xfade logic)
    out = segs[0]
    for j in range(1, len(segs), 2):
        out = np.concatenate([out, segs[j]], axis=0)
    return out
