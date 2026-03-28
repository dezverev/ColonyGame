# ══════════════════════════════════════════════════════════════
# openpilot.ps1 — Iterative ColonyGame development automation
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
#   .\openpilot.ps1                      # run 1 iteration
#   .\openpilot.ps1 -n 3                # run 3 iterations
#   .\openpilot.ps1 -DryRun             # phases 1+2 only, skip implementation
#   .\openpilot.ps1 -Focus colonies     # focus game-designer + develop
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

function Run-OpenCode {
    param([string]$Prompt, [string]$OutFile)
    opencode run $Prompt *>$OutFile
    Get-Content $OutFile
}

function Truncate-File {
    param([string]$File, [int]$MaxLines = 60)
    $total = (Get-Content $File).Count
    if ($total -gt $MaxLines) {
        Write-Host "[...truncated ${total} lines to last ${MaxLines}...]"
        Get-Content $File | Select-Object -Last $MaxLines
    } else {
        Get-Content $File
    }
}

for ($i = 1; $i -le $n; $i++) {
    if ($n -gt 1) { Log "Iteration $i of $n" }

    Log "Phase 1: Project status..."
    Run-OpenCode -Prompt "/status" -OutFile "$env:TEMP\openpilot_status.txt"
    $statusCtx = Truncate-File -File "$env:TEMP\openpilot_status.txt" -MaxLines 60

    Log "Phase 2: Game design analysis..."
    $designPrompt = "/game-designer $Focus`n`nProject status context:`n$statusCtx"
    Run-OpenCode -Prompt $designPrompt -OutFile "$env:TEMP\openpilot_design.txt"
    $designCtx = Truncate-File -File "$env:TEMP\openpilot_design.txt" -MaxLines 60

    if ($DryRun) {
        Log "Dry run complete — skipping implementation."
        continue
    }

    Log "Phase 3: Implementing next task..."
    $devPrompt = "/develop $Focus`n`nGame designer priorities:`n$designCtx"
    Run-OpenCode -Prompt $devPrompt -OutFile "$env:TEMP\openpilot_develop.txt"
    $resultCtx = Truncate-File -File "$env:TEMP\openpilot_develop.txt" -MaxLines 60

    Log "Phase 4: Performance audit..."
    $perfPrompt = "/perf`n`nWhat just changed:`n$resultCtx"
    Run-OpenCode -Prompt $perfPrompt -OutFile "$env:TEMP\openpilot_perf.txt"
    $perfCtx = Truncate-File -File "$env:TEMP\openpilot_perf.txt" -MaxLines 40

    Log "Phase 5: Test coverage audit..."
    $testPrompt = "/test recent`n`nWhat was built:`n$resultCtx`n`nPerf changes:`n$perfCtx"
    Run-OpenCode -Prompt $testPrompt -OutFile "$env:TEMP\openpilot_test.txt"

    Log "Iteration $i complete."
}

Log "All $n iteration(s) done."
