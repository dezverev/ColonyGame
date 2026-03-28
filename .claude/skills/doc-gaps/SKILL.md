---
name: doc-gaps
description: Analyze the project and its docs — find missing component docs, update stale ones, ensure every module has accurate documentation in devguide/docs/.
argument-hint: [optional focus area, e.g. "server", "client", "rendering", "protocol". If omitted, audits the entire project]
---

## Important: Autonomous Mode

Never ask for confirmation. When you identify issues, just fix them. Don't ask "should I do X?" or propose options. Just do the work and report what you did.

---

You are the documentation auditor for the ColonyGame project — an isometric multiplayer space colony 4X game. Your job is to ensure every significant component has its own up-to-date documentation file in `devguide/docs/`, and that no doc is stale or missing.

Before doing anything, read `CLAUDE.md` at the project root for the full architectural reference.

## Focus: $ARGUMENTS

---

## Procedure

### 1. Inventory the Codebase

Scan these locations to build a component map:

| Location | What lives there |
|----------|-----------------|
| `server/server.js` | WebSocket server, message routing, room/game lifecycle |
| `server/room-manager.js` | Room CRUD, player tracking, ready states |
| `server/game-engine.js` | Core game loop, galaxy generation, colony management, fleets, research, combat, victory |
| `server/config.js` | Environment-driven configuration |
| `src/public/js/app.js` | Main client: connection, screens, HUD, game state, input handling |
| `src/public/js/lobby.js` | Lobby/room UI helpers |
| `src/public/js/renderer.js` | Three.js scene, camera, render loop |
| `src/public/js/colony-view.js` | Isometric colony surface rendering |
| `src/public/js/galaxy-view.js` | 3D galaxy map rendering |
| `src/public/js/system-view.js` | System orbital view rendering |
| `src/public/js/ui.js` | HUD panels and overlays |
| `src/public/js/fog-of-war.js` | Fog of war system |
| `src/public/js/toast-format.js` | Toast notification formatting |
| `src/public/css/style.css` | All UI styles |
| `src/public/index.html` | Entry point, script loading order |

Also scan for any `.js` files not in the list above — new modules may have been added.

**If a focus area was provided:** Only audit components in that area.

### 2. Inventory Existing Docs

Read `devguide/docs/` to see what documentation already exists. For each existing doc:
1. Read the doc file
2. Read the corresponding source file(s)
3. Determine if the doc is **current** (matches code), **stale** (code has diverged), or **orphaned** (code was removed)

### 3. Identify Gaps

For each component from step 1, check whether a corresponding doc exists in `devguide/docs/`. A component needs its own doc if it has:
- Exported functions/classes used by other modules
- Non-obvious game logic, formulas, or algorithms
- Protocol messages (client-server communication)
- Configuration or constants that affect gameplay

Flag components that are:
- **Missing** — no doc exists at all
- **Stale** — doc exists but doesn't reflect current code (new functions, changed constants, removed features)
- **Orphaned** — doc exists but the component was removed or renamed

### 4. Create or Update Docs

For each gap, create or update a doc file in `devguide/docs/`.

**File naming convention:** `devguide/docs/<component-name>.md`
- `server.md`, `room-manager.md`, `game-engine.md`, `config.md`
- `app.md`, `lobby.md`, `renderer.md`, `colony-view.md`, `galaxy-view.md`
- `system-view.md`, `ui.md`, `fog-of-war.md`, `toast-format.md`
- `protocol.md` — consolidated client-server message reference
- `style.md` — CSS architecture and class naming

**Doc template:**

```markdown
# <Component Name>

> <One-line description>

**File:** `<path/to/file.js>`
**Last verified:** <YYYY-MM-DD>

## Overview

<2-4 sentences on what this component does and where it fits in the architecture.>

## Public API

### `functionName(param1, param2)`
<Brief description. Include param types and return value.>

### `ClassName`
<Brief description of the class and its responsibilities.>

## Key Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| ... | ... | ... |

## Dependencies

- **Requires:** <list of modules this depends on>
- **Used by:** <list of modules that depend on this>

## Protocol Messages (if applicable)

### Client -> Server
| Message | Fields | Purpose |
|---------|--------|---------|
| ... | ... | ... |

### Server -> Client
| Message | Fields | Purpose |
|---------|--------|---------|
| ... | ... | ... |

## Internal Notes

<Any non-obvious logic, algorithms, known quirks, or performance considerations.>
```

Adapt the template to fit each component — skip sections that don't apply (e.g., no protocol section for renderer.js).

### 5. Update the Doc Index

Maintain `devguide/docs/README.md` as an index of all component docs:

```markdown
# Component Documentation

Last updated: <YYYY-MM-DD>

| Component | File | Doc | Status |
|-----------|------|-----|--------|
| Game Server | server/server.js | [server.md](server.md) | Current |
| Room Manager | server/room-manager.js | [room-manager.md](room-manager.md) | Current |
| ... | ... | ... | ... |
```

### 6. Report

Output a summary:

1. **Components audited** — count
2. **Docs created** — list of new files
3. **Docs updated** — list of files that were stale and refreshed
4. **Docs current** — list of files that needed no changes
5. **Orphaned docs removed** — list (if any)
6. **Coverage** — X/Y components documented (percentage)

---

## Quality Standards

### Accuracy
- Every fact in a doc MUST match the current source code
- Read the actual source — do not rely on memory or assumptions
- Include line-number references for key functions where helpful
- Constants and default values must be exact

### Completeness
- Document all exported/public functions and classes
- Document all protocol messages a component handles
- Document key constants that affect gameplay
- Note dependencies (what it imports, what imports it)

### Conciseness
- Docs should be reference material, not tutorials
- Use tables for structured data (constants, messages, API)
- Keep descriptions to 1-3 sentences per item
- Don't duplicate what's already in CLAUDE.md — reference it instead

### Freshness
- Every doc has a "Last verified" date
- When updating a doc, update the date
- When code changes, the corresponding doc should be updated in the same iteration (ideally by the /develop skill, but /doc-gaps catches what was missed)

---

## What NOT to Document

- Test files — they are self-documenting
- `CLAUDE.md` content — don't duplicate the project guide
- `devguide/design.md` — that's the roadmap, not component docs
- `devguide/ledger.md` — that's the dev log
- Obvious code — don't document `config.js` line by line if it's just env vars with defaults
