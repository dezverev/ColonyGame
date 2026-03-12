# ══════════════════════════════════════════════════════════════
# autopilot-rts.ps1 — Iterative RTS game development automation
#
# Each iteration runs a 3-phase pipeline:
#   1. /rts-status      → assess current project state
#   2. /game-designer   → analyze gameplay, recommend improvements,
#                         add work items to design.md
#   3. /rts-develop     → pick next task, implement, test, commit
#
# Usage:
#   .\autopilot-rts.ps1                    # run 1 iteration
#   .\autopilot-rts.ps1 -n 3              # run 3 iterations
#   .\autopilot-rts.ps1 -DryRun           # phases 1+2 only, skip implementation
#   .\autopilot-rts.ps1 -Focus rendering  # focus game-designer + rts-develop
# ══════════════════════════════════════════════════════════════

param(
    [int]$n = 1,
    [switch]$DryRun,
    [string]$Focus = ""
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Log($msg) {
    Write-Host ""
    Write-Host ("=" * 55)
    Write-Host "  $msg"
    Write-Host ("=" * 55)
    Write-Host ""
}

for ($i = 1; $i -le $n; $i++) {

    if ($n -gt 1) {
        Log "Iteration $i of $n"
    }

    # ── Phase 1: /rts-status ──────────────────────────────────
    Log "Phase 1: Project status..."
    try {
        $status = claude --dangerously-skip-permissions -p "/rts-status" 2>&1 | Out-String
        Write-Host $status
    } catch {
        Write-Warning "Phase 1 failed: $_"
        $status = "ERROR: $_"
    }

    # ── Phase 2: /game-designer ───────────────────────────────
    Log "Phase 2: Game design analysis..."
    $designPrompt = @"
/game-designer $Focus

Current project status for context:
$status
"@
    try {
        $design = claude --dangerously-skip-permissions -p $designPrompt 2>&1 | Out-String
        Write-Host $design
    } catch {
        Write-Warning "Phase 2 failed: $_"
        $design = "ERROR: $_"
    }

    if ($DryRun) {
        Log "Dry run complete - skipping implementation."
        continue
    }

    # ── Phase 3: /rts-develop ─────────────────────────────────
    Log "Phase 3: Implementing next task..."
    $devPrompt = @"
/rts-develop $Focus

Game designer output (use for context on priorities):
$design
"@
    try {
        $result = claude --dangerously-skip-permissions -p $devPrompt 2>&1 | Out-String
        Write-Host $result
    } catch {
        Write-Warning "Phase 3 failed: $_"
    }

    Log "Iteration $i complete."
}

Log "All $n iteration(s) done."
