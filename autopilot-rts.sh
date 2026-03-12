#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# autopilot-rts.sh — Iterative RTS game development automation
#
# Each iteration runs a 3-phase pipeline:
#   1. /rts-status      → assess current project state
#   2. /game-designer   → analyze gameplay, recommend improvements,
#                         add work items to design.md
#   3. /rts-develop     → pick next task, implement, test, commit
#
# Usage:
#   ./autopilot-rts.sh                    # run 1 iteration
#   ./autopilot-rts.sh -n 3              # run 3 iterations
#   ./autopilot-rts.sh --dry-run          # phases 1+2 only, skip implementation
#   ./autopilot-rts.sh --focus rendering  # focus game-designer + rts-develop
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

for ((i=1; i<=ITERATIONS; i++)); do

  if [[ "$ITERATIONS" -gt 1 ]]; then
    log "Iteration $i of $ITERATIONS"
  fi

  # ── Phase 1: /rts-status ──────────────────────────────────
  log "Phase 1: Project status..."
  STATUS=$(claude --dangerously-skip-permissions -p "/rts-status" 2>&1) || true
  echo "$STATUS"

  # ── Phase 2: /game-designer ───────────────────────────────
  log "Phase 2: Game design analysis..."
  DESIGN=$(claude --dangerously-skip-permissions -p "/game-designer $FOCUS

Current project status for context:
$STATUS" 2>&1) || true
  echo "$DESIGN"

  if [[ "$DRY_RUN" == true ]]; then
    log "Dry run complete — skipping implementation."
    continue
  fi

  # ── Phase 3: /rts-develop ─────────────────────────────────
  log "Phase 3: Implementing next task..."
  RESULT=$(claude --dangerously-skip-permissions -p "/rts-develop $FOCUS

Game designer output (use for context on priorities):
$DESIGN" 2>&1) || true
  echo "$RESULT"

  log "Iteration $i complete."

done

log "All $ITERATIONS iteration(s) done."
