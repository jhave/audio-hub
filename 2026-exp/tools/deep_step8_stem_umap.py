"""
deep_step8_stem_umap.py

Stem-targeted UMAP projections (plan section 5). This step reads the per-stem CLAP embeddings
produced by deep_step7_stemmer_and_analyzer-CLAUDE.py and projects each "space" to 2-D:

    vocals   -> Vocal-tone space
    groove   -> Percussive / rhythmic space
    harmonic -> Chordal / melodic space

It also (optionally) projects the pre-existing MIXED-audio CLAP embeddings
(public/data/ALL_track_embeddings.json) as a baseline, so the "hairball vs stem-separated"
improvement is visible side by side.

This step touches NO audio -- it operates purely on the persisted embedding vectors, so it is
cheap and safe to re-run repeatedly while tuning n_neighbors / min_dist / metric. Nothing here
requires the 70-hour (or 60s-mode) stemming pass to be re-run.

Requires: umap-learn  (NOT installed in .audio-work/venv by default)
    .audio-work/venv/bin/pip install umap-learn

Run:
    cd 2026-exp
    .audio-work/venv/bin/python tools/deep_step8_stem_umap.py \
        --n-neighbors 15 --min-dist 0.1 --metric cosine

Output:
    public/data/v3/stem_umap.json
      { "<trackId>": { "vocalXY":[x,y], "grooveXY":[x,y], "harmonicXY":[x,y], "mixedXY":[x,y] } }
"""

import os
import sys
import json
import argparse

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
WORKSPACE_ROOT = os.path.dirname(HERE)
EMB_JSON = os.path.join(WORKSPACE_ROOT, "public/data/v3/descriptors_stem_embeddings.json")
MIXED_JSON = os.path.join(WORKSPACE_ROOT, "public/data/ALL_track_embeddings.json")
OUTPUT_JSON = os.path.join(WORKSPACE_ROOT, "public/data/v3/stem_umap.json")

# CLAP vectors are L2-normalized, so cosine is the natural metric.
SPACES = {"vocals": "vocalXY", "groove": "grooveXY", "harmonic": "harmonicXY"}


def load_stem_embeddings():
    if not os.path.exists(EMB_JSON):
        sys.exit(f"Missing {EMB_JSON}. Run deep_step7_stemmer_and_analyzer-CLAUDE.py first.")
    with open(EMB_JSON) as f:
        data = json.load(f)
    # tolerate an 'error'/'schema' record shape; keep only entries that carry vectors
    return {tid: rec for tid, rec in data.items() if isinstance(rec, dict) and "vocals" in rec}


def load_mixed_embeddings():
    """ALL_track_embeddings.json is a list of {trackId, vec}. Returns {trackId: vec} or {}."""
    if not os.path.exists(MIXED_JSON):
        return {}
    with open(MIXED_JSON) as f:
        data = json.load(f)
    out = {}
    items = data.values() if isinstance(data, dict) else data
    for rec in items:
        if isinstance(rec, dict) and "trackId" in rec and "vec" in rec:
            out[rec["trackId"]] = rec["vec"]
    return out


def project(matrix, reducer_kwargs, center=True):
    import umap  # imported lazily so --help works without umap-learn installed
    X = np.asarray(matrix, dtype=np.float32)
    # CLAP embeddings are strongly anisotropic: every vector shares a large common-mode
    # component, so raw pairwise cosines run ~0.99 and UMAP under-separates. Removing the
    # corpus-mean vector exposes the discriminative residual (validated: cross-track cosine
    # goes from ~0.99 to a -0.85..+0.69 spread). This is the single most important knob here.
    if center:
        X = X - X.mean(axis=0, keepdims=True)
    reducer = umap.UMAP(n_components=2, **reducer_kwargs)
    coords = np.asarray(reducer.fit_transform(X), dtype=np.float64)
    # normalize to [-1, 1] per axis for stable plotting across re-runs
    mn, mx = coords.min(axis=0), coords.max(axis=0)
    span = np.where((mx - mn) > 1e-9, mx - mn, 1.0)
    return (2.0 * (coords - mn) / span - 1.0)


def add_space(out, tids, matrix, out_key, reducer_kwargs, center=True):
    if len(tids) < 3:
        print(f"  {out_key}: only {len(tids)} vectors -- skipping (need >=3).")
        return
    print(f"  {out_key}: projecting {len(tids)} vectors (center={center}) ...")
    coords = project(matrix, reducer_kwargs, center=center)
    for tid, xy in zip(tids, coords):
        out.setdefault(tid, {})[out_key] = [round(float(xy[0]), 4), round(float(xy[1]), 4)]


def main():
    ap = argparse.ArgumentParser(description="Stem-targeted UMAP projections (plan section 5).")
    ap.add_argument("--n-neighbors", type=int, default=15)
    ap.add_argument("--min-dist", type=float, default=0.1)
    ap.add_argument("--metric", default="cosine")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--no-mixed", action="store_true", help="skip the mixed-audio baseline projection")
    ap.add_argument("--no-center", action="store_true",
                    help="do NOT mean-center embeddings before UMAP (leaves CLAP anisotropy in; not recommended)")
    args = ap.parse_args()
    center = not args.no_center

    reducer_kwargs = dict(
        n_neighbors=args.n_neighbors,
        min_dist=args.min_dist,
        metric=args.metric,
        random_state=args.seed,
    )
    print(f"UMAP params: {reducer_kwargs}")

    stem = load_stem_embeddings()
    print(f"Loaded {len(stem)} stem-embedding records.")
    out = {}

    for space_key, out_key in SPACES.items():
        tids, matrix = [], []
        for tid, rec in stem.items():
            vec = rec.get(space_key)
            if vec:
                tids.append(tid)
                matrix.append(vec)
        add_space(out, tids, matrix, out_key, reducer_kwargs, center=center)

    if not args.no_mixed:
        mixed = load_mixed_embeddings()
        if mixed:
            tids = list(mixed.keys())
            add_space(out, tids, [mixed[t] for t in tids], "mixedXY", reducer_kwargs, center=center)
        else:
            print("  mixedXY: no baseline embeddings found -- skipping.")

    os.makedirs(os.path.dirname(OUTPUT_JSON), exist_ok=True)
    tmp = OUTPUT_JSON + ".tmp"
    with open(tmp, "w") as f:
        json.dump(out, f, indent=2)
    os.replace(tmp, OUTPUT_JSON)
    print(f"\nWrote {OUTPUT_JSON}: {len(out)} tracks.")


if __name__ == "__main__":
    main()
