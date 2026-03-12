#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# autopilot.sh — Iterative ColonyGame development automation
#
# Each iteration runs a 4-phase pipeline:
#   1. /status           → assess current project state
#   2. /game-designer    → analyze gameplay, recommend improvements,
#                          add work items to design.md
#   3. /develop          → pick next task, implement, test, commit
#   4. /perf             → performance audit and fix
#
# Usage:
#   ./autopilot.sh                      # run 1 iteration
#   ./autopilot.sh -n 3                # run 3 iterations
#   ./autopilot.sh --dry-run            # phases 1+2 only, skip implementation
#   ./autopilot.sh --focus colonies     # focus game-designer + develop
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

  # ── Phase 1: /status ────────────────────────────────────
  log "Phase 1: Project status..."
  STATUS=$(claude --dangerously-skip-permissions -p "/status" 2>&1) || true
  echo "$STATUS"

  # ── Phase 2: /game-designer ─────────────────────────────
  log "Phase 2: Game design analysis..."
  DESIGN=$(claude --dangerously-skip-permissions -p "/game-designer $FOCUS

Current project status for context:
$STATUS" 2>&1) || true
  echo "$DESIGN"

  if [[ "$DRY_RUN" == true ]]; then
    log "Dry run complete — skipping implementation."
    continue
  fi

  # ── Phase 3: /develop ───────────────────────────────────
  log "Phase 3: Implementing next task..."
  RESULT=$(claude --dangerously-skip-permissions -p "/develop $FOCUS

Game designer output (use for context on priorities):
$DESIGN" 2>&1) || true
  echo "$RESULT"

  # ── Phase 4: /perf ────────────────────────────────────
  log "Phase 4: Performance audit..."
  PERF=$(claude --dangerously-skip-permissions -p "/perf

Development output (for context on what changed):
$RESULT" 2>&1) || true
  echo "$PERF"

  log "Iteration $i complete."

done

log "All $ITERATIONS iteration(s) done."
