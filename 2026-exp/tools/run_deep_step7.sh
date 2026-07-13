#!/usr/bin/env bash
#
# Unattended overnight runner for deep_step7_stemmer_and_analyzer-CLAUDE.py.
#
#   * caffeinate  -> the Mac will not idle/system-sleep while this runs.
#   * restart loop -> a hard crash (segfault / OOM-kill) auto-resumes from the JSON cache;
#                     the script's .inprogress guard prevents looping forever on one bad track.
#   * tee to a timestamped log -> check progress any time without touching the run.
#
# Usage:
#   tools/run_deep_step7.sh              # full run, all pending tracks
#   tools/run_deep_step7.sh --limit 5    # quick test on the first 5 pending tracks
#   (any extra args are passed straight through to the python script)
#
# Safe to Ctrl-C and re-launch: it always resumes from where it stopped.

set -u

# Resolve paths relative to this script so it works from any cwd.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"                 # .../2026-exp
cd "$ROOT" || exit 1

VENV_PY="$ROOT/.audio-work/venv/bin/python"
SCRIPT="$ROOT/tools/deep_step7_stemmer_and_analyzer-CLAUDE.py"
LOG_DIR="$ROOT/.audio-work/logs"
MAX_RETRIES=40

if [ ! -x "$VENV_PY" ]; then
    echo "ERROR: venv python not found at $VENV_PY" >&2
    exit 1
fi

mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/step7-$(date +%Y%m%d-%H%M%S).log"
echo "Logging to: $LOG"
echo "Tip: tail -f \"$LOG\"  to watch progress."

attempt=0
while :; do
    attempt=$((attempt + 1))
    echo "=== attempt $attempt  $(date) ===" | tee -a "$LOG"

    # caffeinate flags: -i idle, -m disk, -s system (on AC). Keeps the machine awake for the run.
    caffeinate -ims "$VENV_PY" -u "$SCRIPT" "$@" 2>&1 | tee -a "$LOG"
    code=${PIPESTATUS[0]}

    if [ "$code" -eq 0 ]; then
        echo "=== completed cleanly (exit 0) at $(date) ===" | tee -a "$LOG"
        break
    fi
    if [ "$attempt" -ge "$MAX_RETRIES" ]; then
        echo "=== giving up after $attempt attempts (last exit $code) ===" | tee -a "$LOG"
        exit "$code"
    fi
    echo "=== exit $code; resuming in 15s (attempt $attempt) ===" | tee -a "$LOG"
    sleep 15
done
