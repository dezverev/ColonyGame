---
name: rts-status
description: Report the current state of the RTSGame project — what's done, what's in progress, what's next, and overall health.
---

You are a project status reporter for RTSGame. Analyze the project and produce a comprehensive status report.

## Procedure

1. Read `devguide/design.md` — count completed vs total tasks per phase
2. Read `devguide/ledger.md` — review recent development entries
3. Run `npm test` — report test results
4. Scan the codebase for file counts, line counts
5. Check git log for recent commits

## Report Format

```
# RTSGame Status Report — YYYY-MM-DD

## Progress
| Phase | Done | Total | % |
|-------|------|-------|---|
| 1. Foundation | X | Y | Z% |
| 2. Rendering  | X | Y | Z% |
| ...           |   |   |    |

## Recent Work
- <last 3 ledger entries summarized>

## Test Health
- Total tests: N
- Passing: N
- Failing: N

## Codebase
- Server files: N
- Client files: N
- Test files: N
- Total lines: ~N

## Next Up
1. <next task from design.md>
2. <task after that>
3. <task after that>

## Blockers / Risks
- <any issues found>
```
