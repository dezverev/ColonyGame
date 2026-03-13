#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# doc-gaps.sh — Documentation gap analysis and generation
#
# Audits the ColonyGame codebase against existing component docs
# in devguide/docs/. Creates missing docs, updates stale ones,
# ensures every module has accurate documentation.
#
# Each iteration runs a 2-phase pipeline:
#   1. /status           → assess current project state
#   2. /doc-gaps         → audit docs, create/update as needed
#
# Usage:
#   ./doc-gaps.sh                       # run 1 iteration (full audit)
#   ./doc-gaps.sh -n 2                  # run 2 iterations (catch stragglers)
#   ./doc-gaps.sh --focus server        # only audit server components
#   ./doc-gaps.sh -v                    # verbose — stream claude output live
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
      echo "Options:"
      echo "  -n COUNT       Run COUNT iterations (default: 1)"
      echo "  --focus AREA   Focus on a specific area (server, client, rendering, protocol)"
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

TMPDIR_DG=$(mktemp -d)
trap 'rm -rf "$TMPDIR_DG"' EXIT

log() {
  echo ""
  echo "═══════════════════════════════════════════════════"
  echo "  $1"
  echo "═══════════════════════════════════════════════════"
  echo ""
}

# Run claude and write result to a file.
# In verbose mode, streams live token-by-token output to terminal.
run_claude() {
  local prompt="$1"
  local outfile="$2"
  if [[ "$VERBOSE" == true ]]; then
    local raw="$TMPDIR_DG/raw_stream.jsonl"
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

  # ── Phase 2: /doc-gaps ──────────────────────────────────
  log "Phase 2: Documentation audit..."
  run_claude "/doc-gaps $FOCUS" "$TMPDIR_DG/doc-gaps.txt"

  log "Iteration $i complete."

done

log "All $ITERATIONS iteration(s) done."
