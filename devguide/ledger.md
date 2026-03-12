# ColonyGame Development Ledger

Each entry records an iteration of automated development.

---

## Entry 0 — 2026-03-11 — Initial Scaffold

**Phase:** 1 (Foundation)
**Status:** Complete

**What was built:**
- Full project scaffold: package.json, .gitignore, .env.example, server config
- WebSocket game server with room management (create, join, leave, list, ready, launch)
- Game engine with tick loop, unit movement, starting units/buildings
- Static file server with IsometricJS asset fallback
- Client: name entry, lobby UI, room view, chat, game view with isometric rendering
- Isometric projection adapted from IsometricJS
- Canvas 2D game renderer with placeholder graphics (diamonds for units, rectangles for buildings)
- Unit selection (click and box select), right-click movement commands
- Minimap with viewport indicator
- Resource HUD
- Camera pan (middle-mouse drag) and zoom (scroll wheel)

**Files created:**
- `server/config.js`, `server/room-manager.js`, `server/game-engine.js`, `server/server.js`
- `src/dev-client-server.js`
- `src/public/index.html`, `src/public/css/style.css`
- `src/public/js/projection.js`, `src/public/js/lobby.js`, `src/public/js/app.js`
- `src/tests/room-manager.test.js`, `src/tests/game-engine.test.js`, `src/tests/server-integration.test.js`

**Tests:** 18 unit + integration tests covering room lifecycle, game engine, and server protocol

**Next:** Phase 2 — Game View & Rendering (isometric tiles, sprites, proper building rendering)

---

## Entry 1 — 2026-03-11 — Expanded Unit Definitions & Damage Calc

**Phase:** 3 (Units & Combat)
**Status:** Complete

**What was built:**
- Extracted unit definitions into `UNIT_DEFS` constant with all four unit types (worker, soldier, archer, cavalry) including full stats: hp, atk, armor, speed, range, cooldown, cost, supplyCost, bonusVs
- Added `calcDamage(attackerType, defenderType)` function implementing the counter system: soldier>archer>cavalry>soldier triangle with 1.5x bonuses, workers deal 0.5x to military, damage formula is `max(1, round(atk * bonus - armor))`
- Units created by the engine now carry `armor`, `range`, and `cooldown` fields for use by future combat logic

**Files changed:**
- `server/game-engine.js` — added UNIT_DEFS, calcDamage, updated _createUnit
- `src/tests/game-engine.test.js` — 12 new tests across 3 new test suites

**Tests:** 35 total (12 new) — UNIT_DEFS validation, calcDamage counter system, unit creation with expanded stats

**Key decisions:**
- Extracted unit defs to a top-level constant so future systems (production, UI) can import them directly
- `calcDamage` uses `Math.round` after applying bonus and armor subtraction, with `Math.max(1, ...)` floor
- bonusVs defaults to 1.0x if not specified (no entry = neutral matchup)

**Next:** Phase 3 — Unit counter system (bonusVs multipliers are defined, next implement attack command to use them)
