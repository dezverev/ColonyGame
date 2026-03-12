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

---

## Entry 4 — 2026-03-11 — Balance Fix: Energy Economy

**Phase:** 1 (Foundation Pivot)
**Status:** Complete

**What was built:**
- Rebalanced all energy-related district values to make alloys and research obtainable
- Generator output increased from 4 to 6 energy/month
- Industrial energy consumption reduced from 50 to 3 energy/month, energy build cost removed
- Research energy consumption reduced from 100 to 4 energy/month, energy build cost reduced from 100 to 20
- Housing now consumes 1 energy/month (was 0)
- Fixed _calcProduction to apply consumption from jobless districts (housing)

**Files changed:**
- `server/game-engine.js` — DISTRICT_DEFS values, _calcProduction jobless district handling
- `src/tests/game-engine.test.js` — updated 2 existing tests, added 8 new energy balance tests
- `devguide/design.md` — marked task complete
- `devguide/ledger.md` — this entry

**Tests:** 63 total (46 game-engine + 12 room-manager + 5 integration). All passing.

**Key decisions:**
- One generator (6 energy) can power two industrial districts (3 energy each) — achievable ratio
- Housing energy cost (1/month) adds meaningful energy pressure as colonies grow without being punishing
- Removed industrial energy build cost entirely (was 50) rather than reducing — minerals-only cost keeps it accessible
- Added production calc fix for jobless districts so housing consumption actually applies

**Next:** Fix starting food deficit (2 Agriculture districts), then pop growth pacing

---

## Entry 5 — 2026-03-11 — Balance Fix: Starting Food Deficit & Housing

**Phase:** 1 (Foundation Pivot)
**Status:** Complete

**What was built:**
- Changed starting pre-built districts from (1 Generator, 1 Mining, 1 Agriculture) to (1 Generator, 1 Mining, 2 Agriculture) so food production (12) exceeds consumption (10 pops × 1 = 10), giving a net +2 food/month surplus
- Increased base capital housing from 2 to 10 so starting 10 pops don't exceed housing on turn 1
- Updated all existing tests to match new starting state (4 districts, 10 housing, adjusted food/research values)
- Added 4 new balance validation tests

**Files changed:**
- `server/game-engine.js` — _initStartingColonies (added 2nd agriculture), _calcHousing (base 2→10)
- `src/tests/game-engine.test.js` — updated 8 existing tests, added 4 new food/housing balance tests
- `devguide/design.md` — marked task complete
- `devguide/ledger.md` — this entry

**Tests:** 68 total (50 game-engine + 12 room-manager + 5 integration + 1 server-integration). All passing.

**Key decisions:**
- 2 Agriculture districts (12 food) vs 10 pops (10 food) gives a slim +2/month surplus — enough to survive but players still need to build more agriculture as they grow pops
- Base housing of 10 matches starting pops exactly — players need housing districts to grow beyond 10 pops, creating a meaningful early decision
- Pop death test needed adjustment: food set to -10 (not -1) because +2/month net surplus now recovers from small deficits

**Next:** Pop growth pacing (colony.growthProgress, +1 pop based on food surplus thresholds)

---

## Entry 6 — 2026-03-11 — Pop Growth System

**Phase:** 1 (Foundation Pivot)
**Status:** Complete

**What was built:**
- Pop growth system: colonies grow +1 pop over time when food surplus > 0
- Growth progress counter (`colony.growthProgress`) increments every tick
- Three growth speed tiers based on food surplus: base (400 ticks), fast (300 ticks when surplus > 5), fastest (200 ticks when surplus > 10)
- Housing cap enforcement — pops cannot grow beyond housing capacity
- Starvation resets growth progress to 0
- Growth constants exported for test use (GROWTH_BASE_TICKS, GROWTH_FAST_TICKS, GROWTH_FASTEST_TICKS)
- Refactored old `_processPopGrowth` into `_processPopStarvation` (monthly) and `_processPopGrowth` (per-tick)

**Files changed:**
- `server/game-engine.js` — growth constants, growthProgress field, _processPopGrowth (per-tick), _processPopStarvation (monthly), state serialization
- `src/tests/game-engine.test.js` — 8 new pop growth tests
- `devguide/design.md` — marked task complete
- `devguide/ledger.md` — this entry

**Tests:** 77 total (58 game-engine + 12 room-manager + 6 integration + 1 server-integration). All passing.

**Key decisions:**
- Growth checks production rate (food surplus = production - consumption), not resource stockpile — a colony with good farms grows even if the empire's food reserves are low
- Growth progress increments every tick (not monthly) for smooth progression and responsive gameplay
- Housing cap check before incrementing prevents wasted progress accumulation
- Starvation resets growth progress to create meaningful penalty for food deficits

**Next:** Early mineral pacing (Mining output 4→6, starting minerals 200→300, Mining cost 150→100)

---

## Entry 7 — 2026-03-11 — Balance Fix: Early Mineral Pacing

**Phase:** 1 (Foundation Pivot)
**Status:** Complete

**What was built:**
- Increased Mining district output from 4 to 6 minerals/month
- Reduced Mining district build cost from 150 to 100 minerals (now matches agriculture/housing)
- Increased starting minerals from 200 to 300, enabling 3 immediate district builds
- Updated Phase 2 district spec to match new Mining values
- Added 5 new mineral pacing balance tests

**Files changed:**
- `server/game-engine.js` — DISTRICT_DEFS.mining values, starting minerals
- `src/tests/game-engine.test.js` — updated 4 existing tests, added 5 new mineral balance tests
- `devguide/design.md` — marked task complete, updated Phase 2 mining spec
- `devguide/ledger.md` — this entry

**Tests:** 84 total (63 game-engine + 12 room-manager + 6 integration + 3 performance). All passing.

**Key decisions:**
- Mining cost aligned with agriculture/housing at 100 minerals — uniform early-game costs simplify player decisions
- Time to fund a mining district from mining income drops from 37.5 months (150/4) to 16.7 months (100/6), a ~2.2x improvement
- Starting minerals of 300 allows exactly 3 district builds at 100 each, giving players meaningful opening choices

**Next:** Dead code fix (first-3-districts discount for newly colonized planets), or stale client cleanup + HTML colony UI

---

## Entry 8 — 2026-03-11 — Balance Fix: Starting Pop/Housing Deadlock

**Phase:** 1 (Foundation Pivot)
**Status:** Complete

**What was built:**
- Reduced starting pops from 10 to 8 in `_createColony`
- Players now start 2 below housing cap (10), allowing 2 natural growth cycles (~40 sec each at surplus +4) before housing constrains
- Food surplus increased from +2/month to +4/month (12 production - 8 consumption), making early game feel more abundant
- Unemployed pops reduced from 6 to 4 (with 4 working districts), slightly lowering early passive research

**Files changed:**
- `server/game-engine.js` — starting pops 10→8
- `src/tests/game-engine.test.js` — updated 15 existing tests, added 2 new balance tests
- `devguide/design.md` — marked task complete
- `devguide/ledger.md` — this entry

**Tests:** 86 total (65 game-engine + 12 room-manager + 6 integration + 3 performance). All passing.

**Key decisions:**
- 8 pops with 10 housing teaches players that pops grow and Housing matters — they'll see growth happen naturally before hitting the cap
- Food surplus of +4 (base growth rate) means first pop grows in 40 seconds, second in another 40 seconds, then housing constrains at 10 pops
- No housing district changes needed — the extra headroom comes purely from reducing starting pops
- Growth tests no longer need extra housing districts added since there's natural headroom

**Next:** Generator cost parity (150→100 minerals), then variable build times

---

## Entry 9 — 2026-03-11 — Balance Fix: Generator Cost Parity

**Phase:** 1 (Foundation Pivot)
**Status:** Complete

**What was built:**
- Reduced Generator district cost from 150 to 100 minerals in DISTRICT_DEFS
- All 4 basic districts (Housing, Generator, Mining, Agriculture) now cost a uniform 100 minerals
- Industrial and Research remain at 200 minerals as clear "tier 2" districts
- Added 3 new tests validating cost parity across tiers

**Files changed:**
- `server/game-engine.js` — Generator cost 150→100
- `src/tests/game-engine.test.js` — 3 new generator cost parity tests
- `devguide/design.md` — marked task complete
- `devguide/ledger.md` — this entry

**Tests:** 89 total (68 game-engine + 12 room-manager + 6 integration + 3 performance). All passing.

**Key decisions:**
- Uniform 100-mineral cost for basic districts simplifies early-game decisions — players compare district output, not cost
- Clear tier separation: 100 minerals (basic) vs 200 minerals (advanced) makes progression intuitive

**Next:** Variable build times (Housing 200, basic 300, advanced 400), then colony idle event notifications

---

## Entry 10 — 2026-03-11 — Client UX Sprint 1/3: Single-Player Practice Mode

**Phase:** 1 (Foundation Pivot)
**Status:** Complete

**What was built:**
- Practice mode for solo game launch without requiring a second player
- `createRoom` accepts `practiceMode: true` option, sets `maxPlayers` to 1
- `canLaunch` returns true for practice rooms with a single host (no ready check needed)
- Practice mode flag exposed in room list and room serialization
- Non-practice rooms unaffected — still require 2+ players with ready checks

**Files changed:**
- `server/room-manager.js` — practiceMode option in createRoom, canLaunch bypass, serialization
- `server/server.js` — pass practiceMode through from createRoom message
- `src/tests/room-manager.test.js` — 6 new practice mode unit tests
- `src/tests/server-integration.test.js` — 1 new practice mode integration test
- `devguide/design.md` — marked task complete
- `devguide/ledger.md` — this entry

**Tests:** 96 total (68 game-engine + 18 room-manager + 7 integration + 3 performance). All passing.

**Key decisions:**
- Practice mode forces maxPlayers=1 rather than just relaxing the canLaunch check — prevents accidental joins
- Host doesn't need to toggle ready in practice mode — canLaunch returns true immediately
- practiceMode flag stored on room object and exposed in serialization so client can show "Practice" badge

**Next:** CLIENT UX SPRINT 2/5 — Stale client cleanup (strip RTS rendering, add colony 4X containers)

---

## Entry 11 — 2026-03-11 — Balance Fix: Variable Build Times

**Phase:** 1 (Foundation Pivot)
**Status:** Complete

**What was built:**
- Tiered build times: Housing 200 ticks (20 sec), Generator/Mining/Agriculture 300 ticks (30 sec), Industrial/Research 400 ticks (40 sec)
- Quick Housing lets players unblock pop growth fast; slower advanced districts create anticipation
- 50% new-colony discount still applies correctly to all tiers (Housing=100, basic=150, advanced=200)
- Updated existing build time tests, added 5 new variable build time tests

**Files changed:**
- `server/game-engine.js` — DISTRICT_DEFS buildTime values (housing 300→200, industrial/research 300→400)
- `src/tests/game-engine.test.js` — updated 2 existing tests, added 5 new variable build time tests
- `devguide/design.md` — marked task complete
- `devguide/ledger.md` — this entry

**Tests:** 101 total (73 game-engine + 18 room-manager + 7 integration + 3 performance). All passing.

**Key decisions:**
- Housing is fastest (200 ticks) because it's the growth-unblocking district — players shouldn't wait long to fix a housing bottleneck
- Basic resource districts stay at 300 ticks (unchanged) as the default baseline
- Advanced districts at 400 ticks create meaningful anticipation for the more powerful alloy/research production
- Three clear tiers: fast (200), standard (300), slow (400) — intuitive progression

**Next:** Colony idle event notifications, then energy deficit consequences

---

## Entry 12 — 2026-03-11 — Colony Idle Event Notifications

**Phase:** 1 (Foundation Pivot)
**Status:** Complete

**What was built:**
- Server-side event notification system with `_pendingEvents[]` array and `_emitEvent()` method
- 5 event types: `constructionComplete`, `queueEmpty`, `popMilestone`, `housingFull`, `foodDeficit`
- Events flushed each tick via `onEvent` callback, sent per-player through WebSocket
- `popMilestone` rate-limited to fire only on multiples of 5 pops
- `foodDeficit` fires once per monthly processing when player food goes negative
- Server.js wired to deliver `gameEvent` messages to the relevant player

**Files changed:**
- `server/game-engine.js` — `_emitEvent`, `_flushEvents`, event emissions in `_processConstruction`, `_processPopGrowth`, `_processMonthlyResources`, `onEvent` callback in tick loop
- `server/server.js` — `onEvent` handler in engine creation to send per-player `gameEvent` messages
- `src/tests/game-engine.test.js` — 8 new event notification tests
- `devguide/design.md` — marked task complete
- `devguide/ledger.md` — this entry

**Tests:** 109 total (81 game-engine + 18 room-manager + 7 integration + 3 performance). All passing.

**Key decisions:**
- Events are per-player (not broadcast to all) since they're notifications about your own colonies
- Events flushed via separate `onEvent` callback rather than embedding in gameState — keeps the periodic state broadcast lean and avoids bloating the cached JSON
- `popMilestone` uses modulo-5 check for simple rate limiting
- `housingFull` fires on the exact tick pops reach housing cap, giving immediate feedback

**Next:** Energy deficit consequences (auto-disable districts when energy negative)

---

## Entry 13 — 2026-03-11 — CLIENT UX SPRINT 2/5: Stale Client Cleanup

**Phase:** 1 (Foundation Pivot)
**Status:** Complete

**What was built:**
- Stripped all RTS rendering code from app.js: removed Canvas 2D renderer, Projection module references, unit selection/drag-select, minimap rendering, gold/wood/stone HUD update, camera/zoom system, selection box, render loop
- Updated gameInit handler to parse colony 4X state (tick, players, colonies, yourId)
- Updated gameState handler to receive tick/player/colony updates
- Added gameEvent handler stub for future UI rendering
- Exposed `window.GameClient = { send, getState }` for future modules (renderer.js, ui.js)
- Removed from index.html: game-canvas, minimap-canvas, gold/wood/stone/supply resource bar, selection-panel, game-hud, projection.js script tag
- Added to index.html: `<div id="render-container">` for Three.js canvas, `<div id="colony-ui">` for HTML overlay
- Updated title from "RTS Game" to "ColonyGame"
- Removed RTS game styles from style.css (canvas, minimap, gold/wood/stone colors, selection panel)
- Added colony 4X game screen styles (render-container, colony-ui overlay)
- Deleted `src/public/js/projection.js` (no longer referenced anywhere)

**Files changed:**
- `src/public/js/app.js` — complete rewrite (stripped RTS, added colony 4X handlers)
- `src/public/index.html` — removed RTS elements, added 4X containers, updated title
- `src/public/css/style.css` — replaced RTS game styles with colony 4X layout
- `src/public/js/projection.js` — deleted
- `devguide/design.md` — marked task complete
- `devguide/ledger.md` — this entry

**Tests:** 111 total. All passing (no client-side tests needed for this cleanup — all changes are browser UI).

**Key decisions:**
- Exposed `window.GameClient` so future renderer.js and ui.js modules can send commands and read game state without tight coupling to app.js internals
- render-container and colony-ui are both absolute-positioned overlays on game-screen — Three.js canvas goes in render-container, HTML panels go in colony-ui with pointer-events: none (individual panels opt-in to pointer events)
- Kept lobby/room/chat code untouched — it works correctly and is 4X-agnostic
- No game loop in app.js anymore — Three.js renderer.js will own requestAnimationFrame in Sprint 3

**Next:** CLIENT UX SPRINT 3/5 — Three.js scene + isometric colony view (OrthographicCamera, terrain grid, camera controls)
