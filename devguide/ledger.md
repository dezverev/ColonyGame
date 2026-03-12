# ColonyGame Development Ledger

Each entry records an iteration of automated development.

---

## Entry 0 — 2026-03-11 — Initial Scaffold (as RTSGame)

**Phase:** 1 (Foundation)
**Status:** Complete (pre-pivot)

**What was built:**
- Full project scaffold: package.json, .gitignore, .env.example, server config
- WebSocket game server with room management (create, join, leave, list, ready, launch)
- Game engine with tick loop, unit movement, starting units/buildings
- Static file server with IsometricJS asset fallback
- Client: name entry, lobby UI, room view, chat, game view with isometric rendering
- Isometric projection adapted from IsometricJS
- Canvas 2D game renderer with placeholder graphics
- Unit selection, right-click movement commands
- Minimap, Resource HUD, camera pan and zoom

**Files created:**
- `server/config.js`, `server/room-manager.js`, `server/game-engine.js`, `server/server.js`
- `src/dev-client-server.js`
- `src/public/index.html`, `src/public/css/style.css`
- `src/public/js/projection.js`, `src/public/js/lobby.js`, `src/public/js/app.js`
- `src/tests/room-manager.test.js`, `src/tests/game-engine.test.js`, `src/tests/server-integration.test.js`

**Tests:** 18 unit + integration tests covering room lifecycle, game engine, and server protocol

---

## Entry 1 — 2026-03-11 — Expanded Unit Definitions & Damage Calc (as RTSGame)

**Phase:** 3 (Units & Combat)
**Status:** Complete (pre-pivot)

**What was built:**
- Extracted unit definitions into UNIT_DEFS with combat stats
- Added calcDamage function with counter system
- 12 new tests

**Files changed:**
- `server/game-engine.js`, `src/tests/game-engine.test.js`

**Tests:** 35 total (12 new)

---

## Entry 2 — 2026-03-11 — Project Pivot: RTS → Space Colony 4X

**Phase:** N/A (retool)
**Status:** Complete

**What changed:**
- Pivoted from medieval RTS to space colony 4X game (Stellaris-inspired)
- Replaced all project documentation, design roadmap, and automation skills
- Moving from Canvas 2D sprites to Three.js 3D rendering
- New core loop: Explore, Expand, Exploit, Exterminate
- New resource system: Energy, Minerals, Food, Alloys, Research, Influence
- Kept: WebSocket multiplayer infrastructure, room/lobby system, tick-based game loop

**Key decisions:**
- Three.js for rendering — isometric OrthographicCamera for colony view, PerspectiveCamera for galaxy map
- No sprites — all 3D geometry and materials
- Colony management as primary gameplay, fleet/galaxy as secondary layer
- Simultaneous real-time multiplayer (like Stellaris, not turn-based)

**Next:** Phase 1 — Foundation Pivot (Three.js integration, colony terrain, new game engine)

---

## Entry 3 — 2026-03-11 — Colony 4X Engine & Resource System

**Phase:** 1 (Foundation Pivot)
**Status:** Complete

**What was built:**
- Complete rewrite of game-engine.js from RTS to colony 4X: removed unit movement/combat, UNIT_DEFS, calcDamage
- Colony state system: districts[], buildQueue[], pops, planet properties (size, type, habitability)
- 6 district types with production/consumption: Housing, Generator, Mining, Agriculture, Industrial, Research
- Per-player resource tracking: energy, minerals, food, alloys, research (3 types), influence
- Monthly economic cycle (every 100 ticks): resource production, consumption, pop food costs
- Construction system: build queue (max 3), build time with 50% discount for first 3 districts
- Demolish command for removing built districts
- Population system: food deficit causes pop death, pops cannot go below 1
- Unemployed pops produce research (1 each type per unemployed pop per month)
- Updated server.js protocol: buildDistrict and demolish commands replace old gameCommand/moveUnits
- Server validates ownership, resources, slots, queue limits on every command
- Planet type definitions with habitability values (9 types)

**Files changed:**
- `server/game-engine.js` — complete rewrite (colony 4X engine)
- `server/server.js` — updated protocol handlers, log message
- `src/tests/game-engine.test.js` — complete rewrite (38 tests)
- `src/tests/server-integration.test.js` — updated for colony protocol (5 tests including 2 new)
- `devguide/design.md` — marked 4 tasks complete
- `devguide/ledger.md` — this entry

**Tests:** 50 total (38 game-engine + 12 room-manager + 5 integration). All passing.

**Key decisions:**
- Built economy loop before Three.js rendering (game designer recommendation: playable mechanics > pretty graphics)
- Production is per-month (100 ticks = 10 seconds), not per-tick, for balanced pacing
- handleCommand returns result objects {ok/error} so server.js can send errors to client
- Starting colonies get 3 pre-built districts so resources flow immediately without player action

**Next:** Add Three.js dependency and basic scene setup (Phase 1 rendering tasks), or basic resource HUD to make the economy visible
