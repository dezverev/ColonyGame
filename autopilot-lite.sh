#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# autopilot-lite.sh — Fast development iteration (no game-designer)
#
# Each iteration runs a 4-phase pipeline:
#   1. /develop          → pick next task, implement, test, commit
#   2. /test             → test coverage audit, write missing tests
#   3. /perf             → performance audit and fix
#   4. /ship             → commit, push, create PR, merge
#
# Use this for rapid iteration when the design backlog is already
# populated. Use autopilot.sh (full) when you want game-designer
# analysis and priority reordering.
#
# Usage:
#   ./autopilot-lite.sh                  # run 1 iteration
#   ./autopilot-lite.sh -n 5            # run 5 iterations
#   ./autopilot-lite.sh --focus colonies # focus develop on an area
#   ./autopilot-lite.sh -v              # verbose — stream output live
# ══════════════════════════════════════════════════════════════

set -euo pipefail

FOCUS=""
ITERATIONS=1
VERBOSE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -n)        ITERATIONS="$2"; shift 2 ;;
    --focus)   FOCUS="$2"; shift 2 ;;
    -v|--verbose) VERBOSE=true; shift ;;
    -h|--help)
      echo "Usage: $0 [-n COUNT] [--focus AREA] [-v|--verbose]"
      echo ""
      echo "Fast autopilot: /develop + /test only (no game-designer, status, or perf)."
      echo ""
      echo "Options:"
      echo "  -n COUNT       Run COUNT iterations (default: 1)"
      echo "  --focus AREA   Focus develop on a specific area"
      echo "  -v, --verbose  Stream Claude output live"
      echo "  -h, --help     Show this help"
      exit 0
      ;;
    *)         echo "Unknown arg: $1"; echo "Usage: $0 [-n COUNT] [--focus AREA] [-v|--verbose]"; exit 1 ;;
  esac
done

# Prevent "nested session" error when run from an IDE terminal
unset CLAUDECODE CLAUDE_CODE_SSE_PORT CLAUDE_CODE_ENTRYPOINT

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

TMPDIR_AP=$(mktemp -d)
trap 'rm -rf "$TMPDIR_AP"' EXIT

log() {
  echo ""
  echo "═══════════════════════════════════════════════════"
  echo "  $1"
  echo "═══════════════════════════════════════════════════"
  echo ""
}

run_claude() {
  local prompt="$1"
  local outfile="$2"
  if [[ "$VERBOSE" == true ]]; then
    local raw="$TMPDIR_AP/raw_stream.jsonl"
    claude --dangerously-skip-permissions -p --verbose \
      --output-format stream-json --include-partial-messages \
      "$prompt" 2>/dev/null \
      | python3 -u -c "
import sys, json
for line in sys.stdin:
    sys.stdout.write(line)
    sys.stdout.flush()
    line = line.strip()
    if not line: continue
    try:
        d = json.loads(line)
        t = d.get('type','')
        if t == 'stream_event':
            evt = d.get('event',{})
            et = evt.get('type','')
            if et == 'content_block_delta':
                txt = evt.get('delta',{}).get('text','')
                if txt:
                    print(txt, end='', flush=True, file=sys.stderr)
            elif et == 'content_block_start':
                tb = evt.get('content_block',{})
                if tb.get('type') == 'tool_use':
                    print(f'\n[tool: {tb.get(\"name\",\"\")}]', flush=True, file=sys.stderr)
    except: pass
print('', file=sys.stderr, flush=True)
" > "$raw" || true
    python3 -c "
import json
result = ''
for line in open('$raw'):
    try:
        d = json.loads(line)
        if d.get('type') == 'result':
            result = d.get('result', '')
    except: pass
print(result)
" > "$outfile" 2>/dev/null || true
    rm -f "$raw"
  else
    claude --dangerously-skip-permissions -p "$prompt" > "$outfile" 2>&1 || true
    cat "$outfile"
  fi
}

truncate_file() {
  local file="$1"
  local max_lines="${2:-60}"
  local total
  total=$(wc -l < "$file" | tr -d ' ')
  if [[ "$total" -gt "$max_lines" ]]; then
    echo "[...truncated ${total} lines to last ${max_lines}...]"
    tail -n "$max_lines" "$file"
  else
    cat "$file"
  fi
}

for ((i=1; i<=ITERATIONS; i++)); do

  if [[ "$ITERATIONS" -gt 1 ]]; then
    log "Iteration $i of $ITERATIONS"
  fi

  # ── Phase 1: /develop ───────────────────────────────────
  log "Phase 1: Implementing next task..."
  run_claude "/develop $FOCUS" "$TMPDIR_AP/develop.txt"
  RESULT_CTX=$(truncate_file "$TMPDIR_AP/develop.txt" 60)

  # ── Phase 2: /test ──────────────────────────────────────
  log "Phase 2: Test coverage audit..."
  run_claude "/test recent

What was built:
$RESULT_CTX" "$TMPDIR_AP/test.txt"

  # ── Phase 3: /perf ──────────────────────────────────────
  log "Phase 3: Performance audit..."
  run_claude "/perf

What just changed:
$RESULT_CTX" "$TMPDIR_AP/perf.txt"

  # ── Phase 4: /ship ──────────────────────────────────────
  log "Phase 4: Ship it..."
  run_claude "/ship" "$TMPDIR_AP/ship.txt"

  log "Iteration $i complete."

done

log "All $ITERATIONS iteration(s) done."
