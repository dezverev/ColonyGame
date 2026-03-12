# ══════════════════════════════════════════════════════════════
# autopilot-rts.ps1 — Iterative RTS game development automation
#
# Each iteration:
#   1. Reads the design roadmap and development ledger
#   2. Picks the next unfinished task
#   3. Implements it with tests
#   4. Commits and updates the ledger
#
# Usage:
#   .\autopilot-rts.ps1                    # run 1 iteration
#   .\autopilot-rts.ps1 -n 3              # run 3 iterations
#   .\autopilot-rts.ps1 -DryRun           # analyze only, don't implement
#   .\autopilot-rts.ps1 -Focus rendering  # focus on rendering tasks
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

$prevResult = ""

for ($i = 1; $i -le $n; $i++) {

    if ($n -gt 1) {
        Log "Iteration $i of $n"
    }

    if ($DryRun) {
        Log "DRY RUN: Analyzing project state..."
        claude --dangerously-skip-permissions -p "/rts-status"
        Log "Dry run complete."
        continue
    }

    # Build context from previous iteration
    if ([string]::IsNullOrEmpty($prevResult)) {
        $fullPrompt = "/rts-develop $Focus"
    } else {
        $fullPrompt = @"
/rts-develop $Focus

Previous iteration output (use for context):
$prevResult
"@
    }

    Log "Running /rts-develop..."

    try {
        $prevResult = claude --dangerously-skip-permissions -p $fullPrompt 2>&1 | Out-String
        Write-Host $prevResult
    } catch {
        Write-Warning "Iteration $i failed: $_"
        $prevResult = "ERROR: $_"
    }

    Log "Iteration $i complete."
}

Log "All $n iteration(s) done."
Write-Host ""
Write-Host "Run .\autopilot-rts.ps1 -DryRun to see current status."
