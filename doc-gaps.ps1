# ══════════════════════════════════════════════════════════════
# doc-gaps.ps1 — Documentation gap analysis and generation
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
#   .\doc-gaps.ps1                       # run 1 iteration (full audit)
#   .\doc-gaps.ps1 -n 2                  # run 2 iterations (catch stragglers)
#   .\doc-gaps.ps1 -Focus server         # only audit server components
# ══════════════════════════════════════════════════════════════

param(
    [int]$n = 1,
    [string]$Focus = "",
    [switch]$Help
)

if ($Help) {
    Write-Host "Usage: .\doc-gaps.ps1 [-n COUNT] [-Focus AREA]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -n COUNT       Run COUNT iterations (default: 1)"
    Write-Host "  -Focus AREA    Focus on a specific area (server, client, rendering, protocol)"
    Write-Host "  -Help          Show this help"
    exit 0
}

# Prevent nested session errors
$env:CLAUDECODE = $null
$env:CLAUDE_CODE_SSE_PORT = $null
$env:CLAUDE_CODE_ENTRYPOINT = $null

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

function Write-Phase {
    param([string]$Message)
    Write-Host ""
    Write-Host ("=" * 51)
    Write-Host "  $Message"
    Write-Host ("=" * 51)
    Write-Host ""
}

function Invoke-Claude {
    param([string]$Prompt)
    try {
        $result = claude --dangerously-skip-permissions -p $Prompt 2>&1 | Out-String
        Write-Host $result
        return $result
    }
    catch {
        Write-Warning "Claude invocation failed: $_"
        return ""
    }
}

function Get-Truncated {
    param([string]$Text, [int]$MaxLines = 60)
    $lines = $Text -split "`n"
    if ($lines.Count -gt $MaxLines) {
        "[...truncated $($lines.Count) lines to last $MaxLines...]`n" + ($lines[-$MaxLines..-1] -join "`n")
    }
    else {
        $Text
    }
}

for ($i = 1; $i -le $n; $i++) {
    if ($n -gt 1) {
        Write-Phase "Iteration $i of $n"
    }

    # ── Phase 1: /status ────────────────────────────────────
    Write-Phase "Phase 1: Project status..."
    $statusOut = Invoke-Claude "/status"
    $statusCtx = Get-Truncated $statusOut 60

    # ── Phase 2: /doc-gaps ──────────────────────────────────
    Write-Phase "Phase 2: Documentation audit..."
    $prompt = "/doc-gaps $Focus`n`nProject status context:`n$statusCtx"
    $docOut = Invoke-Claude $prompt

    Write-Phase "Iteration $i complete."
}

Write-Phase "All $n iteration(s) done."
