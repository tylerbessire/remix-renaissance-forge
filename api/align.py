from typing import List, Dict, Tuple

# Camelot neighbors: same, +/-1 number same letter, or relative (A<->B same number)
# We’ll map to semitone offsets via actual keys, not just Camelot math.

KEYS = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]
MINOR = {k+"m" for k in KEYS}

# Simple mapping for semitone distance between keys (12-TET)
def semitone_distance(src: str, dst: str) -> int:
    def idx(k: str) -> int:
        base = k.replace("m","")
        return KEYS.index(base)
    s, d = idx(src), idx(dst)
    # crude: ignore major/minor difference for semitone calc, handle with preference
    up = (d - s) % 12
    down = -((s - d) % 12)
    # choose smaller magnitude
    return up if abs(up) <= abs(down) else down

def choose_target_key(keys: List[str]) -> str:
    """
    Choose a musically-forgiving target key:
    - prefer the most frequent key class among inputs (major vs minor),
    - break ties by minimizing sum of semitone distances.
    """
    if not keys: return "C"
    cands = set(keys)
    best, best_cost = None, 1e9
    for cand in cands:
        cost = 0
        for k in keys:
            cost += abs(semitone_distance(k, cand))
            # small penalty for mode change (major<->minor)
            if (k.endswith("m")) != (cand.endswith("m")):
                cost += 1
        if cost < best_cost:
            best, best_cost = cand, cost
    return best

def plan_shifts(per_track_keys: Dict[str, str], target_key: str,
                vocal_shift_limit: int = 3, music_shift_limit: int = 6) -> Dict[str, int]:
    """
    Return per-track semitone shifts; vocals are clamped tighter to avoid artifacts.
    Caller should pass stem_type info to decide vocal vs instrumental clamp.
    """
    shifts = {}
    for track_id, key in per_track_keys.items():
        shift = semitone_distance(key, target_key)
        shifts[track_id] = shift
    return shifts, vocal_shift_limit, music_shift_limit
