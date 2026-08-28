#!/usr/bin/env bash
# wf-watch.sh — watchdog for a running Workflow. Exits (and so notifies) on the FIRST
# of: completion, stall, or deadline. Run with Bash run_in_background so the exit
# re-invokes the assistant — otherwise "check every N minutes" is not enforceable,
# since the assistant only executes while taking a turn.
#
# Stall detection uses agent-*.jsonl mtimes (appended WHILE agents work), not
# journal.jsonl (appended only when an agent FINISHES, so it is normally quiet during
# the tail of a healthy run). See scripts/wf-health.sh.
#
# Usage: bash scripts/wf-watch.sh <transcript-dir> <output-file> [stall-min] [max-min]
set -uo pipefail
DIR="${1:?usage: wf-watch.sh <transcript-dir> <output-file> [stall-min] [max-min]}"
OUT="${2:?need the task output file}"
STALL_MIN="${3:-10}"
MAX_MIN="${4:-60}"
started=$(date +%s)

newest_mtime() {
  local newest=0 m
  for f in "$DIR"/agent-*.jsonl "$DIR"/journal.jsonl; do
    [ -f "$f" ] || continue
    m=$(stat -f %m "$f" 2>/dev/null) || continue
    [ "$m" -gt "$newest" ] && newest=$m
  done
  echo "$newest"
}

while true; do
  sleep 60
  now=$(date +%s)

  # 1. Completed — the workflow writes a non-empty result file.
  if [ -s "$OUT" ]; then
    echo "COMPLETE — $OUT is non-empty after $(( (now-started)/60 ))m."
    exit 0
  fi

  # 2. Stalled — nothing written by any agent for STALL_MIN.
  newest=$(newest_mtime)
  if [ "$newest" -gt 0 ]; then
    quiet=$(( (now - newest) / 60 ))
    if [ "$quiet" -ge "$STALL_MIN" ]; then
      echo "STALLED — no agent transcript written for ${quiet}m (threshold ${STALL_MIN}m)."
      echo "Stop the task and re-launch with resumeFromRunId; cached agents replay free."
      exit 1
    fi
  fi

  # 3. Deadline — never watch forever.
  if [ $(( (now - started) / 60 )) -ge "$MAX_MIN" ]; then
    echo "DEADLINE — watched ${MAX_MIN}m without completion or stall. Check manually."
    exit 2
  fi
done
