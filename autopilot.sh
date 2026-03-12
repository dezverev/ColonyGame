#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# autopilot.sh — Iterative ColonyGame development automation
#
# Each iteration runs a 5-phase pipeline:
#   1. /status           → assess current project state
#   2. /game-designer    → analyze gameplay, recommend improvements,
#                          add work items to design.md
#   3. /develop          → pick next task, implement, test, commit
#   4. /perf             → performance audit and fix
#   5. /test             → test coverage audit, write missing tests
#
# Output from earlier phases is truncated and passed to later
# phases as context. Each skill also reads repo state directly.
#
# Usage:
#   ./autopilot.sh                      # run 1 iteration
#   ./autopilot.sh -n 3                # run 3 iterations
#   ./autopilot.sh --dry-run            # phases 1+2 only, skip implementation
#   ./autopilot.sh --focus colonies     # focus game-designer + develop
#   ./autopilot.sh -v                  # verbose — stream claude output live
# ══════════════════════════════════════════════════════════════

set -euo pipefail

DRY_RUN=false
FOCUS=""
ITERATIONS=1
VERBOSE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -n)        ITERATIONS="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --focus)   FOCUS="$2"; shift 2 ;;
    -v|--verbose) VERBOSE=true; shift ;;
    *)         echo "Unknown arg: $1"; echo "Usage: $0 [-n COUNT] [--dry-run] [--focus AREA] [-v|--verbose]"; exit 1 ;;
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

# Run claude and write result to a file.
# Usage: run_claude "prompt" output_file
# In verbose mode, streams live token-by-token output to terminal.
# Result text always ends up in output_file for later phases.
run_claude() {
  local prompt="$1"
  local outfile="$2"
  if [[ "$VERBOSE" == true ]]; then
    local raw="$TMPDIR_AP/raw_stream.jsonl"
    # Stream JSON with partial messages, pipe through python for live display.
    # Python writes parsed text to stderr (live terminal), raw JSON to stdout (captured in file).
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
    # Extract final result text into outfile
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

# Truncate to last N lines to keep prompts within budget.
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

  # ── Phase 1: /status ────────────────────────────────────
  log "Phase 1: Project status..."
  run_claude "/status" "$TMPDIR_AP/status.txt"
  STATUS_CTX=$(truncate_file "$TMPDIR_AP/status.txt" 60)

  # ── Phase 2: /game-designer ─────────────────────────────
  log "Phase 2: Game design analysis..."
  run_claude "/game-designer $FOCUS

Project status context:
$STATUS_CTX" "$TMPDIR_AP/design.txt"
  DESIGN_CTX=$(truncate_file "$TMPDIR_AP/design.txt" 60)

  if [[ "$DRY_RUN" == true ]]; then
    log "Dry run complete — skipping implementation."
    continue
  fi

  # ── Phase 3: /develop ───────────────────────────────────
  log "Phase 3: Implementing next task..."
  run_claude "/develop $FOCUS

Game designer priorities:
$DESIGN_CTX" "$TMPDIR_AP/develop.txt"
  RESULT_CTX=$(truncate_file "$TMPDIR_AP/develop.txt" 60)

  # ── Phase 4: /perf ──────────────────────────────────────
  log "Phase 4: Performance audit..."
  run_claude "/perf

What just changed:
$RESULT_CTX" "$TMPDIR_AP/perf.txt"
  PERF_CTX=$(truncate_file "$TMPDIR_AP/perf.txt" 40)

  # ── Phase 5: /test ──────────────────────────────────────
  log "Phase 5: Test coverage audit..."
  run_claude "/test recent

What was built:
$RESULT_CTX

Perf changes:
$PERF_CTX" "$TMPDIR_AP/test.txt"

  log "Iteration $i complete."

done

log "All $ITERATIONS iteration(s) done."
