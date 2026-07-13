"""
deep_step7_stemmer_and_analyzer-CLAUDE.py

Refined stem-separation + feature-extraction pass for Phase C.
See PLAN-phase-c-deep-audio-analysis-CLAUDE.md for the full rationale. Summary:

  * Demucs model loaded ONCE via demucs.api.Separator, reused per track (no subprocess reload).
  * Stems stay in RAM (no temp files, no disk-fill risk); all four stems analyzed.
  * Per-stem CLAP embeddings (Vocal / Groove / Harmonic spaces) extracted IN THE SAME PASS,
    because that is the only moment the stem audio exists — see plan section 5. UMAP over these
    vectors is a separate, cheap, re-runnable step (deep_step8_stem_umap.py).
  * 60-second CENTERED window per track (MAX_SECONDS) to keep total runtime tractable.
  * CREPE pitch is computed once and reused for vibrato, range, and pitch-class histogram.
  * Vocal vibrato computed correctly (contiguous voiced runs, normalized).
  * Bass / harmonic / cross-stem dissonance / presence / Math-Index components added.
  * Atomic cache writes + per-track error isolation, for BOTH output files.

Outputs (both keyed by trackId, both written atomically after every track):
  public/data/v3/descriptors_stems.json            -- numeric features
  public/data/v3/descriptors_stem_embeddings.json  -- {vocals,groove,harmonic} 512-d CLAP vecs

Run:
    cd 2026-exp
    .audio-work/venv/bin/python tools/deep_step7_stemmer_and_analyzer-CLAUDE.py
"""

# --- Compatibility hotfixes for Python 3.10+ and NumPy 2.0+ (must precede madmom) ---
import collections
import collections.abc
collections.MutableSequence = collections.abc.MutableSequence

import numpy as np
np.float = float
np.int = int
np.complex = complex

import os
import gc
import json
import time
import argparse
import traceback

import torch
import librosa
import torchcrepe
import madmom
from demucs.api import Separator
from transformers import ClapModel, ClapProcessor

# --- CONFIGURATION ---
HERE = os.path.dirname(os.path.abspath(__file__))
WORKSPACE_ROOT = os.path.dirname(HERE)                     # .../2026-exp
TRACKS_JSON = os.path.join(WORKSPACE_ROOT, "public/data/ALL_tracks.json")
OUTPUT_JSON = os.path.join(WORKSPACE_ROOT, "public/data/v3/descriptors_stems.json")
EMB_JSON = os.path.join(WORKSPACE_ROOT, "public/data/v3/descriptors_stem_embeddings.json")
INPROGRESS = OUTPUT_JSON + ".inprogress"   # crash guard: names the track currently being processed

DEVICE = "mps" if torch.backends.mps.is_available() else "cpu"

# 60-second CENTERED excerpt per track. Separation cost is ~linear in length, so this is the
# single biggest runtime lever. Bump toward 120-180 for more robust tempo/harmony at higher cost.
MAX_SECONDS = 60
MIN_SECONDS = 5

CREPE_HOP_S = 0.01         # 10 ms pitch frames
CLAP_SR = 48000            # laion/larger_clap_music operates at 48 kHz
CLAP_WIN = 10 * CLAP_SR    # 10 s embedding windows (matches tools/embed_clap.py)
SCHEMA_VERSION = 2

# Math Index weights (plan section 4B). Raw components; re-normalize corpus-wide downstream.
MATH_W_SYNC = 0.6
MATH_W_DRIFT = 0.4

os.makedirs(os.path.dirname(OUTPUT_JSON), exist_ok=True)
print(f"Using device: {DEVICE}   |   window: {MAX_SECONDS}s centered")

# --- Load heavy models ONCE ---
print("Loading Demucs (htdemucs) ...")
SEPARATOR = Separator(model="htdemucs", device=DEVICE)
STEM_SR = SEPARATOR.samplerate  # 44100

print("Building madmom beat processors ...")
BEAT_RNN = madmom.features.beats.RNNBeatProcessor()
BEAT_DBN = madmom.features.beats.DBNBeatTrackingProcessor(fps=100)

print("Loading CLAP (laion/larger_clap_music) ...")
CLAP_MODEL = ClapModel.from_pretrained("laion/larger_clap_music").eval().to(DEVICE)
CLAP_PROC = ClapProcessor.from_pretrained("laion/larger_clap_music")


# --------------------------------------------------------------------------- #
# Path / IO helpers
# --------------------------------------------------------------------------- #
def get_track_audio_path(track):
    f = track.get("file")
    if not f:
        return None
    # track["file"] is repo-relative to the audio-hub root (parent of 2026-exp)
    return os.path.abspath(os.path.join(WORKSPACE_ROOT, "..", f))


def load_centered_window(path, duration_hint):
    """Load a MAX_SECONDS mono/stereo window centered in the track (skips intro/outro)."""
    total = float(duration_hint) if duration_hint else MAX_SECONDS
    offset = max(0.0, (total - MAX_SECONDS) / 2.0)
    y, _ = librosa.load(path, sr=STEM_SR, mono=False, offset=offset, duration=MAX_SECONDS)
    if y.ndim == 1:
        y = np.stack([y, y])  # demucs expects (channels, samples)
    return y


def save_atomic(obj, path):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f, indent=2)
    os.replace(tmp, path)


def mark_inprogress(tid):
    with open(INPROGRESS, "w") as f:
        f.write(tid)


def clear_inprogress():
    try:
        os.remove(INPROGRESS)
    except FileNotFoundError:
        pass


def read_inprogress():
    try:
        with open(INPROGRESS) as f:
            return f.read().strip() or None
    except FileNotFoundError:
        return None


# --------------------------------------------------------------------------- #
# Numeric utilities
# --------------------------------------------------------------------------- #
def to_mono(stem_tensor):
    return stem_tensor.mean(dim=0).detach().cpu().numpy().astype(np.float32)


def resample_np(y, src_sr, dst_sr):
    """Pure-numpy resample (deliberately bypasses the soxr backend; commit dbec89b)."""
    n = int(round(len(y) * dst_sr / src_sr))
    if n <= 1:
        return y.astype(np.float32)
    return np.interp(np.linspace(0, len(y) - 1, n), np.arange(len(y)), y).astype(np.float32)


def band_energy(y, sr, lo, hi):
    S = np.abs(librosa.stft(y, n_fft=4096, hop_length=1024)) ** 2
    freqs = librosa.fft_frequencies(sr=sr, n_fft=4096)
    mask = (freqs >= lo) & (freqs < hi)
    return float(S[mask, :].sum()) if np.any(mask) else 0.0


def normalized_entropy(dist):
    dist = np.asarray(dist, dtype=np.float64)
    total = dist.sum()
    if total <= 0:
        return 0.0
    p = dist / total
    p = p[p > 0]
    return float(-np.sum(p * np.log2(p)) / np.log2(len(dist)))


def contiguous_runs(mask):
    idx = np.flatnonzero(mask)
    if len(idx) == 0:
        return
    breaks = np.flatnonzero(np.diff(idx) > 1)
    starts = np.concatenate(([0], breaks + 1))
    ends = np.concatenate((breaks + 1, [len(idx)]))
    for s, e in zip(starts, ends):
        yield idx[s], idx[e - 1] + 1


# --------------------------------------------------------------------------- #
# CLAP per-stem embedding (plan section 5)
# --------------------------------------------------------------------------- #
def clap_embed(y44):
    """Windowed CLAP embedding of a mono stem: L2-norm each window, mean-pool, re-normalize.
    Mirrors tools/embed_clap.py. Returns a 512-d python list."""
    y = resample_np(y44, STEM_SR, CLAP_SR)
    chunks = [y[i:i + CLAP_WIN] for i in range(0, max(1, len(y) - CLAP_WIN + 1), CLAP_WIN)]
    chunks = [c for c in chunks if len(c) >= 3 * CLAP_SR] or [y]
    vecs = []
    with torch.no_grad():
        for c in chunks:
            inp = CLAP_PROC(audio=c, sampling_rate=CLAP_SR, return_tensors="pt")
            inp = {k: (v.to(DEVICE) if hasattr(v, "to") else v) for k, v in inp.items()}
            out = CLAP_MODEL.get_audio_features(**inp)
            v = (out.pooler_output if hasattr(out, "pooler_output") else out)[0].cpu().numpy()
            vecs.append(v / (np.linalg.norm(v) + 1e-9))
    m = np.mean(vecs, axis=0)
    m = m / (np.linalg.norm(m) + 1e-9)
    return [round(float(x), 5) for x in m]


# --------------------------------------------------------------------------- #
# Vocal stem analysis (CREPE computed once, reused everywhere)
# --------------------------------------------------------------------------- #
def crepe_pitch(y44):
    """Run CREPE once on the vocal stem. Returns (f0, periodicity) at 10 ms hop, or (None, None)."""
    y16 = resample_np(y44, STEM_SR, 16000)
    if len(y16) < 16000:
        return None, None
    audio = torch.from_numpy(y16).unsqueeze(0)
    f0, pd = torchcrepe.predict(
        audio.to(DEVICE), 16000, hop_length=int(CREPE_HOP_S * 16000),
        fmin=50, fmax=600, device=DEVICE, decoder=torchcrepe.decode.viterbi,
        batch_size=1024, return_periodicity=True,
    )
    return f0.squeeze(0).cpu().numpy(), pd.squeeze(0).cpu().numpy()


def vocal_density(y44):
    fl, hl = int(0.02 * STEM_SR), int(0.01 * STEM_SR)
    rms = librosa.feature.rms(y=y44, frame_length=fl, hop_length=hl)[0]
    return float(np.mean(rms > 0.015))


def vocal_pitch_features(f0, pd):
    """From cached CREPE output: (vocal_range_sd, vibrato_index)."""
    if f0 is None:
        return 0.0, 0.0
    voiced_mask = pd > 0.5
    if voiced_mask.sum() < 10:
        return 0.0, 0.0

    voiced = f0[voiced_mask]
    cents = 1200 * np.log2(np.maximum(voiced, 1e-6) / 10.0)  # std invariant to the 10 Hz ref
    range_sd = float(np.std(cents))

    # Vibrato: fraction of pitch-modulation power in 4-8 Hz, over CONTIGUOUS voiced runs only.
    min_run = int(0.25 / CREPE_HOP_S)
    band_sum, weight_sum = 0.0, 0.0
    for s, e in contiguous_runs(voiced_mask):
        run = f0[s:e]
        if len(run) < min_run:
            continue
        c = 1200 * np.log2(np.maximum(run, 1e-6) / 10.0)
        c = c - np.mean(c)
        spec = np.abs(np.fft.rfft(c)) ** 2
        freqs = np.fft.rfftfreq(len(c), d=CREPE_HOP_S)
        spec[0] = 0.0
        total = spec.sum()
        if total <= 0:
            continue
        band = spec[(freqs >= 4.0) & (freqs <= 8.0)].sum()
        band_sum += (band / total) * len(run)
        weight_sum += len(run)
    vibrato = float(band_sum / weight_sum) if weight_sum > 0 else 0.0
    return range_sd, vibrato


def vocal_pitch_class_hist(f0, pd):
    if f0 is None:
        return None
    voiced = f0[pd > 0.5]
    if len(voiced) < 10:
        return None
    midi = 69 + 12 * np.log2(np.maximum(voiced, 1e-6) / 440.0)
    pc = np.mod(np.round(midi).astype(int), 12)
    return np.bincount(pc, minlength=12).astype(np.float64)


# --------------------------------------------------------------------------- #
# Drum / bass / harmonic / cross-stem analysis
# --------------------------------------------------------------------------- #
def analyze_drum_stem(y44):
    out = {"tempo_rnn": 0.0, "swing_index": 0.0, "syncopation_index": 0.0, "tempo_drift": 0.0}
    from madmom.audio.signal import Signal
    sig = Signal(y44, sample_rate=STEM_SR)
    beats = BEAT_DBN(BEAT_RNN(sig))
    if len(beats) < 4:
        return out
    intervals = np.diff(beats)
    median_interval = float(np.median(intervals))
    if median_interval <= 0:
        return out
    out["tempo_rnn"] = float(60.0 / median_interval)
    grid = np.maximum(np.round(intervals / median_interval) * median_interval, 0.1)
    offsets = intervals - grid
    out["swing_index"] = float(np.std(offsets))
    out["syncopation_index"] = float(np.mean(np.abs(offsets)) / median_interval)
    out["tempo_drift"] = float(np.std(60.0 / np.maximum(intervals, 1e-3)))
    return out


def analyze_bass_stem(y44):
    out = {"sub_bass_ratio": 0.0, "bass_centroid": 0.0, "bass_centroid_std": 0.0}
    sub, mid = band_energy(y44, STEM_SR, 20, 60), band_energy(y44, STEM_SR, 60, 250)
    out["sub_bass_ratio"] = float(sub / mid) if mid > 0 else 0.0
    cent = librosa.feature.spectral_centroid(y=y44, sr=STEM_SR)[0]
    cent = cent[np.isfinite(cent)]
    if len(cent):
        out["bass_centroid"] = float(np.mean(cent))
        out["bass_centroid_std"] = float(np.std(cent))
    return out


def chroma_mean(y44):
    if np.max(np.abs(y44)) < 1e-5:
        return None
    return librosa.feature.chroma_cqt(y=y44, sr=STEM_SR).mean(axis=1)


def dissonance_index(vocal_hist, backing_chroma):
    if vocal_hist is None or backing_chroma is None:
        return None
    a = vocal_hist / (np.linalg.norm(vocal_hist) + 1e-9)
    b = backing_chroma / (np.linalg.norm(backing_chroma) + 1e-9)
    return float(np.clip(1.0 - float(np.dot(a, b)), 0.0, 1.0))


# --------------------------------------------------------------------------- #
# Per-track pipeline
# --------------------------------------------------------------------------- #
def process_track(track):
    """Returns (record, embeddings). On failure, record carries an 'error' key and emb is None."""
    tid = track["trackId"]
    audio_path = get_track_audio_path(track)
    if not audio_path or not os.path.exists(audio_path):
        return {"trackId": tid, "error": "audio file missing"}, None

    y = load_centered_window(audio_path, track.get("durationSec"))
    if y.shape[1] / STEM_SR < MIN_SECONDS:
        return {"trackId": tid, "error": "too short"}, None

    # ---- Separate ONCE; keep all four stems in memory ----
    _origin, stems = SEPARATOR.separate_tensor(torch.from_numpy(y).float(), STEM_SR)
    vocals, drums = to_mono(stems["vocals"]), to_mono(stems["drums"])
    bass, other = to_mono(stems["bass"]), to_mono(stems["other"])
    backing = other + bass  # melodic/harmonic bed, drum noise excluded (plan 3D/3E)

    # ---- Vocal presence (plan 4C): energy ratio vs the stem mix ----
    def rms(x):
        return float(np.sqrt(np.mean(x ** 2))) if len(x) else 0.0
    r_v, r_d, r_b, r_o = rms(vocals), rms(drums), rms(bass), rms(other)
    total = r_v + r_d + r_b + r_o
    vocal_presence = float(r_v / total) if total > 0 else 0.0

    # ---- Vocal: CREPE once, reused ----
    f0, pd = crepe_pitch(vocals)
    range_sd, vibrato = vocal_pitch_features(f0, pd)
    vocal_hist = vocal_pitch_class_hist(f0, pd) if vocal_presence > 0.02 else None

    # ---- Other stems ----
    dr = analyze_drum_stem(drums)
    ba = analyze_bass_stem(bass)
    backing_chroma = chroma_mean(backing)
    harmonic_complexity = normalized_entropy(backing_chroma) if backing_chroma is not None else 0.0
    diss = dissonance_index(vocal_hist, backing_chroma)

    math_index_raw = MATH_W_SYNC * dr["syncopation_index"] + MATH_W_DRIFT * (dr["tempo_drift"] / 20.0)

    record = {
        "trackId": tid, "schema": SCHEMA_VERSION,
        "tempo_rnn": round(dr["tempo_rnn"], 2),
        "swing_index": round(dr["swing_index"], 4),
        "syncopation_index": round(dr["syncopation_index"], 4),
        "tempo_drift": round(dr["tempo_drift"], 3),
        "vocal_density": round(vocal_density(vocals), 3),
        "vocal_presence": round(vocal_presence, 3),
        "vocal_range_sd": round(range_sd, 2),
        "vibrato_index": round(vibrato, 4),
        "sub_bass_ratio": round(ba["sub_bass_ratio"], 3),
        "bass_centroid": round(ba["bass_centroid"], 1),
        "bass_centroid_std": round(ba["bass_centroid_std"], 1),
        "harmonic_complexity": round(harmonic_complexity, 4),
        "dissonance_index": round(diss, 4) if diss is not None else None,
        "math_index_raw": round(math_index_raw, 4),
    }

    # ---- Per-stem CLAP embeddings (plan section 5): the only moment the audio exists ----
    embeddings = {
        "trackId": tid, "schema": SCHEMA_VERSION,
        "vocals": clap_embed(vocals),     # Vocal-tone space
        "groove": clap_embed(drums),      # Percussive/rhythmic space
        "harmonic": clap_embed(backing),  # Chordal/melodic space
    }

    if DEVICE == "mps":
        torch.mps.empty_cache()
    return record, embeddings


def main():
    ap = argparse.ArgumentParser(description="Phase C stem separation + feature/embedding extraction.")
    ap.add_argument("--limit", type=int, default=0, help="process at most N pending tracks (0 = all)")
    ap.add_argument("--max-seconds", type=int, default=0, help="override the analysis window length")
    args = ap.parse_args()
    if args.max_seconds > 0:
        global MAX_SECONDS
        MAX_SECONDS = args.max_seconds
        print(f"Window overridden to {MAX_SECONDS}s")

    if not os.path.exists(TRACKS_JSON):
        print(f"Error: {TRACKS_JSON} not found!")
        return
    with open(TRACKS_JSON) as f:
        tracks = json.load(f)
    print(f"Loaded {len(tracks)} canonical tracks.")

    def load_cache(path):
        if os.path.exists(path):
            try:
                with open(path) as f:
                    return json.load(f)
            except Exception as e:
                print(f"Warning: could not parse {os.path.basename(path)}: {e}")
        return {}

    results = load_cache(OUTPUT_JSON)
    embs = load_cache(EMB_JSON)
    print(f"Cache: {len(results)} feature records, {len(embs)} embedding records.")

    def done(tid):
        r = results.get(tid)
        e = embs.get(tid)
        return (r is not None and "error" not in r and r.get("schema") == SCHEMA_VERSION
                and e is not None and e.get("schema") == SCHEMA_VERSION)

    # Poison-track guard: if a previous run died mid-track (segfault / OOM-kill / power loss),
    # the .inprogress marker names it. Record it as errored so the restart can't loop on it.
    crashed = read_inprogress()
    if crashed and not done(crashed):
        results[crashed] = {"trackId": crashed,
                            "error": "process died during processing; skipped on restart"}
        save_atomic(results, OUTPUT_JSON)
        print(f"Skipping track that crashed the previous run: {crashed}")
    clear_inprogress()

    pending = [t for t in tracks if not done(t["trackId"])]
    if args.limit > 0:
        pending = pending[:args.limit]
    print(f"Pending tracks to process this run: {len(pending)}")

    t0 = time.time()
    for n, track in enumerate(pending, 1):
        tid = track["trackId"]
        title = track.get("trackTitle", tid)
        print(f"[{n}/{len(pending)}] ({time.time() - t0:7.1f}s) {title[:60]}", flush=True)
        mark_inprogress(tid)  # so a hard crash on this track is detected next run
        try:
            rec, emb = process_track(track)
        except Exception as e:
            rec, emb = {"trackId": tid, "error": repr(e)}, None
            print(f"    ERROR: {e}")
            traceback.print_exc()
        results[rec["trackId"]] = rec
        save_atomic(results, OUTPUT_JSON)
        if emb is not None:
            embs[emb["trackId"]] = emb
            save_atomic(embs, EMB_JSON)
        clear_inprogress()
        gc.collect()  # keeps RSS flat over a 746-track run (validated: no growth across 10 tracks)

    ok = sum(1 for r in results.values() if "error" not in r)
    err = sum(1 for r in results.values() if "error" in r)
    print(f"\nDone. {ok} analyzed, {err} errored, {len(embs)} embedding sets. "
          f"({len(results)}/{len(tracks)} tracks accounted for.)", flush=True)


if __name__ == "__main__":
    main()
