#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# openpilot.sh — Iterative ColonyGame development automation
#
# Each iteration runs a 5-phase pipeline:
#   1. /status           → assess current project state
#   2. /game-designer    → analyze gameplay, recommend improvements,
#                          add work items to design.md
#   3. /develop          → pick next task, implement, test, commit
#   4. /perf             → performance audit and fix
#   5. /test             → test coverage audit, write missing tests
#
# Usage:
#   ./openpilot.sh                      # run 1 iteration
#   ./openpilot.sh -n 3                # run 3 iterations
#   ./openpilot.sh --dry-run            # phases 1+2 only, skip implementation
#   ./openpilot.sh --focus colonies     # focus game-designer + develop
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

TMPDIR_AP=$(mktemp -d)
trap 'rm -rf "$TMPDIR_AP"' EXIT

log() {
  echo ""
  echo "═══════════════════════════════════════════════════"
  echo "  $1"
  echo "═══════════════════════════════════════════════════"
  echo ""
}

run_opencode() {
  local prompt="$1"
  local outfile="$2"
  opencode run "$prompt" > "$outfile" 2>&1 || true
  cat "$outfile"
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

  # ── Phase 1: /status ────────────────────────────────────
  log "Phase 1: Project status..."
  run_opencode "/status" "$TMPDIR_AP/status.txt"
  STATUS_CTX=$(truncate_file "$TMPDIR_AP/status.txt" 60)

  # ── Phase 2: /game-designer ─────────────────────────────
  log "Phase 2: Game design analysis..."
  run_opencode "/game-designer $FOCUS

Project status context:
$STATUS_CTX" "$TMPDIR_AP/design.txt"
  DESIGN_CTX=$(truncate_file "$TMPDIR_AP/design.txt" 60)

  if [[ "$DRY_RUN" == true ]]; then
    log "Dry run complete — skipping implementation."
    continue
  fi

  # ── Phase 3: /develop ───────────────────────────────────
  log "Phase 3: Implementing next task..."
  run_opencode "/develop $FOCUS

Game designer priorities:
$DESIGN_CTX" "$TMPDIR_AP/develop.txt"
  RESULT_CTX=$(truncate_file "$TMPDIR_AP/develop.txt" 60)

  # ── Phase 4: /perf ──────────────────────────────────────
  log "Phase 4: Performance audit..."
  run_opencode "/perf

What just changed:
$RESULT_CTX" "$TMPDIR_AP/perf.txt"
  PERF_CTX=$(truncate_file "$TMPDIR_AP/perf.txt" 40)

  # ── Phase 5: /test ──────────────────────────────────────
  log "Phase 5: Test coverage audit..."
  run_opencode "/test recent

What was built:
$RESULT_CTX

Perf changes:
$PERF_CTX" "$TMPDIR_AP/test.txt"

  log "Iteration $i complete."

done

log "All $ITERATIONS iteration(s) done."
