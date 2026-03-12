#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# autopilot-rts.sh — Iterative RTS game development automation
#
# Each iteration:
#   1. Reads the design roadmap and development ledger
#   2. Picks the next unfinished task
#   3. Implements it with tests
#   4. Commits and updates the ledger
#
# Usage:
#   ./autopilot-rts.sh                    # run 1 iteration
#   ./autopilot-rts.sh -n 3              # run 3 iterations
#   ./autopilot-rts.sh --dry-run          # analyze only, don't implement
#   ./autopilot-rts.sh --focus rendering  # focus on rendering tasks
# ══════════════════════════════════════════════════════════════

set -euo pipefail

DRY_RUN=false
FOCUS=""
ITERATIONS=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    -n)        ITERATIONS="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --focus)   FOCUS="$2"; shift 2 ;;
    *)         echo "Unknown arg: $1"; echo "Usage: $0 [-n COUNT] [--dry-run] [--focus AREA]"; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

log() {
  echo ""
  echo "═══════════════════════════════════════════════════"
  echo "  $1"
  echo "═══════════════════════════════════════════════════"
  echo ""
}

PREV_RESULT=""

for ((i=1; i<=ITERATIONS; i++)); do

  if [[ "$ITERATIONS" -gt 1 ]]; then
    log "Iteration $i of $ITERATIONS"
  fi

  if [[ "$DRY_RUN" == true ]]; then
    log "DRY RUN: Analyzing project state..."
    claude --dangerously-skip-permissions -p "/rts-status"
    log "Dry run complete."
    continue
  fi

  # ── Build context from previous iteration ──
  if [[ -z "$PREV_RESULT" ]]; then
    FULL_PROMPT="/rts-develop $FOCUS"
  else
    FULL_PROMPT="/rts-develop $FOCUS

Previous iteration output (use for context):
$PREV_RESULT"
  fi

  log "Running /rts-develop..."

  PREV_RESULT=$(claude --dangerously-skip-permissions -p "$FULL_PROMPT" 2>&1) || true
  echo "$PREV_RESULT"

  log "Iteration $i complete."

done

log "All $ITERATIONS iteration(s) done."
echo ""
echo "Run ./autopilot-rts.sh --dry-run to see current status."
