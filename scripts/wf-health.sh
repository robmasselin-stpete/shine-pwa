#!/usr/bin/env bash
# wf-health.sh — is a running Workflow alive or dead?
#
# The journal only appends when an agent COMPLETES, so it goes quiet during the
# tail of a normal run. Per-agent transcripts (agent-*.jsonl) are appended while
# an agent WORKS, so they distinguish "thinking hard" from "died".
#
# Usage: bash scripts/wf-health.sh <transcript-dir> [stall-minutes]
set -euo pipefail
DIR="${1:?usage: wf-health.sh <transcript-dir> [stall-minutes]}"
STALL="${2:-10}"
now=$(date +%s)

newest=0; newest_file=""
for f in "$DIR"/agent-*.jsonl "$DIR"/journal.jsonl; do
  [ -f "$f" ] || continue
  m=$(stat -f %m "$f")
  if [ "$m" -gt "$newest" ]; then newest=$m; newest_file=$(basename "$f"); fi
done
[ "$newest" -eq 0 ] && { echo "no transcripts in $DIR"; exit 2; }

quiet=$(( (now - newest) / 60 ))
echo "newest write : ${quiet}m ago  (${newest_file})"

# agents active in the last 2 minutes
active=0
for f in "$DIR"/agent-*.jsonl; do
  [ -f "$f" ] || continue
  m=$(stat -f %m "$f")
  [ $(( (now - m) / 60 )) -lt 2 ] && active=$((active+1))
done
echo "agents written to in last 2m : $active"

if [ "$quiet" -ge "$STALL" ]; then
  echo "STALLED — nothing written for ${quiet}m (threshold ${STALL}m). Stop + resume from cache."
  exit 1
fi
echo "ALIVE"
