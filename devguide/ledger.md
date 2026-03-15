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

---

## Entry 14 — 2026-03-11 — CLIENT UX SPRINT 3/5: Three.js Scene + Isometric Colony View

**Phase:** 1 (Foundation Pivot)
**Status:** Complete

**What was built:**
- Three.js integrated via CDN (r128) in index.html
- Created renderer.js module: Scene, OrthographicCamera at isometric angle (35.264° pitch, 45° yaw), WebGLRenderer
- Ambient light (0x404060, 0.6) + directional light (white, 0.8) for depth
- Colony terrain grid: BoxGeometry tiles arranged in 4-column rows based on planet.size, with 0.1 gap between tiles
- Ground plane underneath the grid (dark 0x111122)
- District rendering: colored 3D boxes per type — Generator=yellow, Mining=gray, Agriculture=green, Industrial=blue, Research=purple, Housing=white — with varying heights
- Under-construction districts shown as wireframe with 50% opacity
- Empty slots shown as dark semi-transparent tiles
- Camera controls: scroll-wheel zoom (adjust ortho frustum, min 2 / max 20), middle-mouse drag to pan, WASD/arrow keys to pan (speed scales with zoom)
- Dark space background color (#0a0a1a)
- requestAnimationFrame render loop at 60fps
- Wired into app.js: ColonyRenderer.init() on gameInit, buildColonyGrid for first colony, updateFromState on gameState updates
- updateFromState rebuilds grid when district count or build queue changes

**Files changed:**
- `src/public/js/renderer.js` — new file (Three.js colony renderer)
- `src/public/index.html` — added Three.js CDN, renderer.js script tag
- `src/public/js/app.js` — wired ColonyRenderer into gameInit and gameState handlers
- `devguide/design.md` — marked Sprint 3/5 complete
- `devguide/ledger.md` — this entry

**Tests:** 111 total. All passing (renderer is browser-only, no new server tests needed).

**Key decisions:**
- Used Three.js r128 from CDN (stable, well-documented, no bundler needed)
- District rendering included in this sprint (ahead of Sprint 4/5 spec) since colored boxes are trivial and the grid without them would be meaningless — aligns with feedback that visuals are core, not polish
- Grid rebuilds on district/queue count changes rather than diffing individual tiles — simple and correct, optimization can come later
- Camera pan uses world coordinates, not screen-space — isometric angle preserved at all times
- Exposed ColonyRenderer on window for cross-module access, consistent with GameClient pattern

**Next:** CLIENT UX SPRINT 4/5 — Raycaster click interaction (click empty tile to build, click district for info/demolish), selected tile highlight

---

## Entry 15 — 2026-03-11 — CLIENT UX SPRINT 4/5: Click Interaction + Build/Demolish UI

**Phase:** 1 (Foundation Pivot)
**Status:** Complete

**What was built:**
- Three.js Raycaster click detection on colony grid tiles — left-click any tile to select it
- Selected tile highlight: glowing green ring (emissive MeshStandardMaterial) appears under selected tile
- Build menu (HTML overlay, bottom-center): appears on empty tile click, shows all 6 district types with color swatch, name, production preview, and cost. Grayed out if unaffordable, slots full, or queue full. Click to send `buildDistrict` command
- District info panel (HTML overlay, right side): appears on built district click, shows type, output, upkeep. Demolish button sends `demolish` command
- Escape key and X buttons deselect tile and close panels
- Client-side DISTRICT_UI mirror for rendering costs/production without server round-trip
- Wired renderer → app.js via `setOnTileSelect` callback pattern

**Files changed:**
- `src/public/js/renderer.js` — raycaster, mouse vector, click handler, tile selection/deselection, highlight mesh, public API (setOnTileSelect, deselectTile, getSelectedTile, getCurrentColony)
- `src/public/js/app.js` — DISTRICT_UI data, _onTileSelect handler, _showBuildMenu, _showDistrictInfo, _hideAllPanels, panel close wiring, gameInit wires setOnTileSelect
- `src/public/index.html` — build-menu and district-info panel HTML inside colony-ui
- `src/public/css/style.css` — game-panel, build-menu, build-option, district-info, demolish-btn styles
- `devguide/design.md` — marked Sprint 4/5 complete
- `devguide/ledger.md` — this entry

**Tests:** 111 total. All passing (client-side UI — no new server tests needed).

**Key decisions:**
- Used callback pattern (setOnTileSelect) rather than events for renderer→app communication — simple, direct, no event system needed
- Build menu shows all 6 types in a 2-column grid with affordability checks against current player resources
- District info panel on right side keeps it out of the way of the colony grid
- No server changes needed — existing buildDistrict and demolish commands handle all the logic
- Highlight uses emissive green (#00ffaa) material for visibility against dark space theme

**Next:** CLIENT UX SPRINT 5/5 — HTML overlay UI (resource bar, status bar, colony info panel with production breakdown)

---

## Entry 16 — 2026-03-11 — CLIENT UX SPRINT 5/5: HTML Overlay UI on 3D View

**Phase:** 1 (Foundation Pivot)
**Status:** Complete

**What was built:**
- Resource bar (top): all 6 resource types showing stockpile and net income/month colored green(+)/red(−). Resource-specific colors: energy=#f1c40f, minerals=#95a5a6, food=#2ecc71, alloys=#e67e22, research=#3498db, influence=#9b59b6
- Status bar (below resource bar): month counter (tick/100), pop count with housing cap warning (yellow near cap, red at cap), growth indicator (slow/fast/rapid/starving/stalled/housing full) with progress bar
- Colony info panel (right side): colony name, planet type/size, district count, pop breakdown (working/idle), housing used/cap, build queue with progress bars (ticks as seconds) and cancel buttons with 50% refund
- Build menu resource header: shows current mineral and energy stockpile at top of build menu
- Server: added growthProgress, growthTarget, and growthStatus to colony serialization for growth indicator UI
- Server: extended demolish command to support build queue cancellation with 50% resource refund (floor-rounded)
- UI data refresh throttled to 2Hz (500ms setInterval), Three.js renders independently at 60fps
- Dark space theme: panels rgba(26,26,46,0.85) with backdrop-blur, borders #2a2a4e, monospace for numbers

**Files changed:**
- `server/game-engine.js` — growth data in getState(), build queue cancellation in demolish handler, state cache invalidation
- `src/public/js/app.js` — HUD elements, _updateHUD() with 2Hz refresh, resource bar, status bar, colony panel, queue cancel wiring, build menu resource header
- `src/public/index.html` — resource bar, status bar, colony info panel, build-menu-resources div
- `src/public/css/style.css` — resource bar, status bar, colony panel, queue item, build menu resource header styles
- `src/tests/game-engine.test.js` — 3 new tests (queue cancellation, growth data serialization, housing full status)
- `devguide/design.md` — marked Sprint 5/5 and build menu resource header complete
- `devguide/ledger.md` — this entry

**Tests:** 116 total (84 game-engine + 18 room-manager + 7 integration + 7 performance). All passing.

**Key decisions:**
- All UI logic stays in app.js rather than a separate ui.js — keeps the pattern simple until the module grows large enough to warrant splitting
- Growth status computed server-side (not client) to keep client thin and match server-authoritative design
- Queue cancellation reuses the demolish command type (checks queue after districts) rather than adding a new command — minimal protocol change
- 50% refund on queue cancel (floor-rounded) prevents build-cancel resource duplication exploits while being generous enough to encourage experimentation
- 2Hz UI refresh prevents DOM thrashing while keeping resource display responsive — Three.js renders independently at 60fps

**Next:** Energy deficit consequences (auto-disable districts when energy negative), or mini tech tree for research sink

---

## Entry 17 — 2026-03-11 — Mini Tech Tree (Research Sink)

**Phase:** 2 (Colony Management) — early deliverable pulled forward
**Status:** Complete

**What was built:**
- 2-tier, 3-track tech tree: Physics (Generator bonuses), Society (growth + agriculture), Engineering (Mining bonuses)
- T1 techs cost 150 research, T2 techs cost 500 research (tuned for 20-minute matches)
- Research processing: monthly cycle consumes accumulated research stockpile toward active tech
- Tech modifiers apply to `_calcProduction()` — district output multiplied by highest completed tech bonus
- Frontier Medicine growth modifier applies to `_processPopGrowth()` — reduces ticks needed by 25%
- T2 supersedes T1 for same district type (uses highest multiplier, not stacking)
- `setResearch` command handler with prerequisite, completion, and duplicate validation
- `researchComplete` event emitted on tech completion with invalidation of all player colony caches
- Research state (currentResearch, researchProgress, completedTechs) serialized in player state
- Client research panel: toggle with R key, shows 3 tracks side-by-side with T1/T2 cards
- Cards show status (available/researching/completed/locked), progress bars, costs
- Click to start researching — panel auto-refreshes on 2Hz HUD cycle and on researchComplete event

**Files changed:**
- `server/game-engine.js` — TECH_TREE constant, research state in playerStates, _getTechModifiers, _processResearch, tech modifiers in _calcProduction/_processPopGrowth, setResearch command, serialization
- `server/server.js` — setResearch command routing
- `src/public/js/app.js` — TECH_TREE_UI data, research panel DOM refs, _toggleResearchPanel, _renderResearchPanel, R key handler, HUD refresh integration
- `src/public/index.html` — research panel HTML
- `src/public/css/style.css` — research panel, track, tech card, progress bar styles
- `src/tests/game-engine.test.js` — 18 new tech tree tests
- `devguide/design.md` — marked mini tech tree + research cost adjustment tasks complete
- `devguide/ledger.md` — this entry

**Tests:** 138 total (18 new: tech tree definitions, setResearch validation, research progress, tech completion, production modifiers for all 6 techs, growth modifier, simultaneous tracks, serialization). All passing.

**Key decisions:**
- Used adjusted research costs (150/500) instead of original spec (500/1000) for better 20-minute match pacing
- T2 supersedes T1 rather than stacking — prevents overpowered 1.875x multiplier, keeps balance clean
- Research is consumed from monthly stockpile, not per-tick — matches the monthly economic cycle pattern
- Growth modifier uses target tick reduction (×0.75) rather than progress acceleration — simpler implementation
- Research panel centered as overlay rather than permanent side panel — avoids cluttering the colony view

**Next:** Energy deficit consequences (auto-disable districts when energy negative)

---

## Entry 18 — 2026-03-11 — Energy Deficit Consequences

**Phase:** 1 (Foundation Pivot)
**Status:** Complete

**What was built:**
- Auto-disable system: when a player's energy stockpile goes negative at monthly processing, the highest-energy-consuming district is disabled until energy balance is restored
- Disabled districts produce nothing, consume nothing, provide no jobs or housing — pops become unemployed
- Re-enable system: each month, cheapest disabled districts are re-enabled if the monthly net energy balance can support them
- `_processEnergyDeficit()` method runs after monthly resource processing, before research/starvation
- `_calcPlayerNetEnergy()` helper calculates net energy production across all player colonies
- `_calcProduction`, `_calcJobs`, `_calcHousing` all skip disabled districts
- `districtDisabled` and `districtEnabled` events emitted for UI notifications
- Client renderer: disabled districts rendered with desaturated gray material (MeshStandardMaterial color #444444, 50% opacity)
- Client UI: district info panel shows [DISABLED] tag with struck-through production/upkeep values
- Disabled material pool created in renderer.js `_initPools()` for each district type
- Incremental renderer update tracks disabled state to swap materials without full grid rebuild

**Files changed:**
- `server/game-engine.js` — `_processEnergyDeficit`, `_calcPlayerNetEnergy`, disabled checks in `_calcProduction`/`_calcJobs`/`_calcHousing`, wired into monthly tick
- `src/public/js/renderer.js` — disabled materials in pool, `_createDistrictMesh` accepts disabled param, `updateFromState` tracks disabled state
- `src/public/js/app.js` — district info panel shows disabled status with struck-through values
- `src/tests/game-engine.test.js` — 10 new energy deficit tests
- `devguide/design.md` — marked task complete
- `devguide/ledger.md` — this entry

**Tests:** 150 total (10 new: disable on negative energy, disabled districts produce/consume nothing, multi-district disable, re-enable when energy supports, no re-enable if would go negative, disable/enable events, disabled housing provides no housing, disabled districts have no jobs, monthly tick integration). All passing.

**Key decisions:**
- Disable logic reverses the current month's impact (adds back consumption, subtracts production) so the stockpile immediately reflects the disabled state
- Re-enable uses net monthly energy balance check (not stockpile) to prevent oscillating enable/disable cycles
- `delete district.disabled` on re-enable rather than `= false` to keep district objects clean
- Disabled materials are pre-allocated in the pool (one per district type) to avoid per-frame allocations
- No separate "disabled district 3D rendering" task needed for basic visuals — desaturated material is sufficient; the existing design doc task for red X overlay is a future enhancement

**Next:** Dead code fix (first-3-districts discount for newly colonized planets), or score timer + VP scoring

---

## Entry 19 — 2026-03-11 — Score Timer + VP Scoring

**Phase:** 1 (Foundation Pivot)
**Status:** Complete

**What was built:**
- Victory Points (VP) calculation: `_calcVictoryPoints(playerId)` — VP = pops×2 + districts×1 + alloys/50 + totalResearch/100
- Configurable match timer: 10/20/30 minutes or unlimited, selectable in room creation dialog
- Timer countdown in server ticks, with 2-minute warning and 30-second final countdown events
- `gameOver` broadcast when timer expires: winner (highest VP), per-player scores with VP breakdown
- Game engine stops ticking after game over
- Server.js `onGameOver` callback broadcasts `gameOver` to all room players, marks room as finished
- Room settings: `matchTimer` option with defaults (10 min practice, 20 min multiplayer), validation against [0,10,20,30]
- Client: Tab key toggles live scoreboard overlay showing all players sorted by VP
- Client: Match timer countdown in status bar (color-coded: green > 2min, yellow < 2min, red < 30s)
- Client: VP display in status bar
- Client: Match warning banner with pulse animation for 2-minute and 30-second warnings
- Client: Post-game overlay with winner announcement, full score breakdown table, "Return to Lobby" button
- Client: Match timer selector in create room dialog

**Files changed:**
- `server/game-engine.js` — `_calcVictoryPoints`, `_processMatchTimer`, `_triggerGameOver`, match timer state, VP in serialization, `onGameOver` callback
- `server/server.js` — `onGameOver` handler, pass `matchTimer` to room creation
- `server/room-manager.js` — `matchTimer` room setting with validation/defaults, included in serialization/listing
- `src/public/js/app.js` — scoreboard toggle/render, game-over overlay, match warning banner, timer/VP in HUD, `matchTimer` in room creation, `gameOver` message handler
- `src/public/index.html` — scoreboard overlay, game-over overlay, match warning banner, timer/VP in status bar, match timer selector in create room dialog
- `src/public/css/style.css` — scoreboard table, game-over overlay, match warning banner with pulse animation, VP display
- `src/tests/game-engine.test.js` — 19 new tests (7 VP, 12 match timer)
- `src/tests/room-manager.test.js` — 6 new match timer tests
- `devguide/design.md` — marked 3 tasks complete
- `devguide/ledger.md` — this entry

**Tests:** 182 total (25 new: 7 VP calculation, 12 match timer/game over, 6 room manager match timer). All passing.

**Key decisions:**
- VP formula uses floor division for alloys/50 and research/100 — prevents fractional VP, keeps scoring clean
- Match timer defaults: 10 min for practice (fast iteration), 20 min for multiplayer (competitive but not too long)
- Timer validation restricts to [0,10,20,30] — prevents arbitrary values that could break pacing
- Game engine `_gameOver` flag prevents any processing after game ends, `stop()` called in `_triggerGameOver`
- VP recalculated per-broadcast rather than cached — simple and accurate, no performance concern with current player counts
- Warning events use the existing `_emitEvent` system — consistent with other event types
- Post-game overlay shows full VP breakdown (pops, districts, alloys, research) so players understand scoring

**Next:** Research & Industrial output bump (3→4), then starting minerals & alloys adjustment

---

## Entry 20 — 2026-03-12 — Procedural Galaxy Generation

**Phase:** 3 (Galaxy & Exploration)
**Status:** Complete

**What was built:**
- `server/galaxy.js` — standalone galaxy generation module with seeded PRNG (mulberry32) for deterministic generation
- Poisson disc sampling in 2D for even star system distribution within a circular galaxy radius
- Relative Neighborhood Graph algorithm for hyperlane connections, with connectivity enforcement (BFS), minimum degree supplement (≥2), and maximum degree cap (≤6)
- Procedural star name generator from curated syllable lists (prefix + suffix + optional designation)
- 5 star types (yellow, red, blue, white, orange) with weighted random selection
- 9 planet types with proper habitability values, 1-6 planets per system, orbit slots, size variation
- 3 galaxy sizes: small (50 systems, r=200), medium (100 systems, r=300), large (200 systems, r=450)
- Starting system assignment: greedy spread algorithm maximizing minimum distance between players, prefers habitable systems
- Starting colonies now placed on actual galaxy planets (best habitable planet in assigned system)
- `galaxySize` room setting with validation (small/medium/large), passed through room creation flow
- `getInitState()` sends full galaxy data (systems + hyperlanes) to clients on game start
- Colony serialization includes `systemId` linking colonies to galaxy systems

**Files changed:**
- `server/galaxy.js` — new file (galaxy generation module)
- `server/game-engine.js` — galaxy integration: generate on init, assign starting systems, colony placement on galaxy planets, galaxy in getInitState(), systemId in colonies
- `server/room-manager.js` — galaxySize room setting with validation, included in serialization/listing
- `server/server.js` — pass galaxySize through from createRoom message
- `src/tests/galaxy.test.js` — new file (33 tests)
- `src/tests/game-engine.test.js` — updated 1 test (starting colony now uses galaxy planet)
- `devguide/design.md` — marked 2 tasks complete
- `devguide/ledger.md` — this entry

**Tests:** 228 total (33 new galaxy tests: PRNG determinism, name uniqueness, Poisson disc spacing/bounds, hyperlane connectivity/degree bounds, full galaxy structure, determinism, size variants, planet validity, habitable planets, hyperlane validity, starting system assignment/spread/ownership, best habitable planet selection, GameEngine integration). All passing.

**Key decisions:**
- Used Relative Neighborhood Graph instead of Delaunay triangulation — simpler to implement, naturally produces sparse planar-ish connections without complex computational geometry
- Seeded PRNG (mulberry32) ensures identical galaxies from same seed — critical for multiplayer synchronization and replay
- Galaxy generated server-side and sent to clients in `gameInit` — keeps server-authoritative design
- Starting colonies use `bestHabitablePlanet()` to pick the best planet in the assigned system — players always start on a viable world
- Planet generation is per-system, not global — each system rolls its own planets with weighted type distribution
- Galaxy data sent once on init (not every tick) — clients cache it locally

**Next:** Galaxy map view (Three.js) — PerspectiveCamera rendering star systems and hyperlanes

---

## Entry 21 — 2026-03-12 — Galaxy Map View + System Panel + View Toggle

**Phase:** 3 (Galaxy & Exploration) + Phase 1 (view toggle)
**Status:** Complete

**What was built:**
- `galaxy-view.js` — full Three.js galaxy map renderer with PerspectiveCamera, orbit camera controls (left-drag rotate, scroll zoom, middle-drag pan)
- Star systems rendered as emissive SphereGeometry meshes, sized by star type (blue=3.0, orange=2.2, yellow=2.0, white=1.8, red=1.5), colored by STAR_TYPES
- Hyperlanes rendered as a single LineSegments object with BufferGeometry for efficiency (one draw call for all lanes)
- Player-owned systems get colored RingGeometry halos matching player color
- System name labels on hover (DOM overlay positioned relative to mouse)
- Click system to select (green highlight ring) — triggers system info panel
- System selection panel (right-side game-panel): star type with color dot, owner name, planet table (orbit, type, size, habitability%), "View Colony" button for owned colonies
- G key toggles between colony view (isometric) and galaxy view (3D perspective)
- View indicator (bottom-left) shows current view with [G] toggle hint
- Camera auto-fits to galaxy bounds on init (~36° from top-down)
- Colony renderer destroyed on switch to galaxy, re-initialized on switch back (clean WebGL context management)

**Files changed:**
- `src/public/js/galaxy-view.js` — new file (galaxy map Three.js renderer)
- `src/public/js/app.js` — view toggle (G key), galaxy data storage in gameState, system panel rendering, view management functions, system panel close/escape handlers
- `src/public/index.html` — galaxy-view.js script tag, view indicator, system panel HTML
- `src/public/css/style.css` — view indicator, system panel, planet table, colony button styles
- `devguide/design.md` — marked 4 tasks complete (galaxy map view, system panel, view toggle, priority order)
- `devguide/ledger.md` — this entry

**Tests:** 261 total. All passing (no new server tests needed — all changes are client-side Three.js rendering).

**Key decisions:**
- Separate Three.js scenes for colony and galaxy (destroy one when switching to other) rather than showing/hiding — cleaner WebGL context, no conflicting cameras
- Galaxy view uses MeshBasicMaterial for stars (not MeshStandard) — emissive glow effect, unaffected by lighting for consistent star brightness
- Orbit camera implemented from scratch rather than importing OrbitControls — avoids CDN dependency for a single class, keeps it simple
- System selection panel reuses game-panel CSS class — consistent visual language with colony panels
- Hyperlane positions offset -0.5 Y below star positions to prevent z-fighting
- Planet habitability color-coded in table: green (60%+), yellow (1-59%), gray (0%) — instant visual parsing

**Next:** Alloy VP fix + industrial output bump (game-designer R17-2, R17-3), then event toast HUD

---

## Entry 22 — 2026-03-12 — Balance Fix: Alloy VP Weight + Industrial/Research Output Bump

**Phase:** 1 (Foundation Pivot)
**Status:** Complete

**What was built:**
- Doubled alloy VP weight: changed VP formula from `alloys/50` to `alloys/25` in `_calcVictoryPoints` and `_triggerGameOver` breakdown — Industrial districts now produce ~0.16 VP/month, competitive with Housing's ~0.08 VP/month
- Increased Industrial district alloy output from 3 to 4 per month in DISTRICT_DEFS
- Increased Research district output from 3/3/3 to 4/4/4 (physics/society/engineering) per month in DISTRICT_DEFS
- Updated client DISTRICT_UI to show "+4 Alloys" and "+4 Phys/Soc/Eng"
- Updated all VP tests to use new alloys/25 divisor (7 existing tests updated)
- Added 3 new tests: Industrial output=4, Research output=4/4/4, VP alloy divisor=25

**Files changed:**
- `server/game-engine.js` — DISTRICT_DEFS industrial/research output values, _calcVictoryPoints alloys/25, _triggerGameOver breakdown alloys/25
- `src/public/js/app.js` — DISTRICT_UI industrial/research produces strings
- `src/tests/game-engine.test.js` — updated 7 VP tests, added 3 new balance tests
- `devguide/design.md` — marked 2 tasks complete
- `devguide/ledger.md` — this entry

**Tests:** 282 total (3 new). All passing.

**Key decisions:**
- Alloys/25 makes Industrial VP-competitive: 4 alloys/month × 1/25 = 0.16 VP/month vs Housing ~0.08 VP/month from pop growth — still slightly behind but no longer a 33x disadvantage
- Research 4/4/4 output justifies the 200 mineral + 20 energy premium over basic districts (4 vs 6 for basics, but across 3 types = 12 total)
- Energy consumption unchanged (Industrial: 3, Research: 4) — the buff is output-only, energy pressure remains the same

**Next:** Event toast notification HUD (game-designer R18 priority #2)

---

## Entry 23 — 2026-03-12 — Event Toast Notification HUD

**Phase:** 1 (Foundation Pivot)
**Status:** Complete

**What was built:**
- Toast notification system that surfaces server game events as slide-in cards on the right side of the game screen
- Covers all 8 existing game event types: constructionComplete, popMilestone, researchComplete, districtEnabled, queueEmpty, housingFull, foodDeficit, districtDisabled
- Color-coded borders: green for positive events, yellow for warnings, red for crises
- CSS slide-in animation from right, auto-dismiss after 4 seconds with fade-out
- Max 5 visible toasts (oldest removed when 6th arrives)
- Human-readable text formatting with colony name, district type, pop count, tech name
- Shared toast-format.js module (IIFE pattern) for both browser and Node.js testing

**Files changed:**
- `src/public/index.html` — added toast container div, added toast-format.js script tag
- `src/public/css/style.css` — added toast notification styles (container, cards, animations)
- `src/public/js/toast-format.js` — **new** shared module with formatGameEvent() and TOAST_TYPE_MAP
- `src/public/js/app.js` — added _showToast() function, wired gameEvent handler to create toasts
- `src/tests/toast-notifications.test.js` — **new** 15 tests
- `devguide/design.md` — marked task complete
- `devguide/ledger.md` — this entry

**Tests:** 313 total (15 new). All passing.

**Key decisions:**
- Extracted formatting logic into shared toast-format.js to enable Node.js testing without DOM dependencies
- Toast container positioned at top: 80px, right: 10px — below resource bar, doesn't overlap colony panel
- Used CSS-only animations (no JS animation libraries) for performance
- All event types already had the required detail fields (colonyName, districtType, etc.) from earlier event work

**Next:** Planet type signature bonuses (game-designer R19 priority #2)

---

## Entry 24 — 2026-03-12 — Balance Fix: Dead Code — First-3-Districts Build Discount

**Phase:** 1 (Foundation Pivot)
**Status:** Complete

**What was built:**
- Fixed the first-3-districts 50% build time discount which never fired because starting colonies have 4 pre-built districts
- Added `isStartingColony` flag to colony objects — `true` for initial colonies created at game start
- Added `playerBuiltDistricts` counter that increments each time a player queues a district
- Discount now applies to first 3 player-built districts on non-starting (newly colonized) planets only
- Both new fields included in `getState()` serialization for client visibility

**Files changed:**
- `server/game-engine.js` — added `isStartingColony` and `playerBuiltDistricts` fields to `_createColony`, set flag on starting colonies, updated discount logic, incremented counter on build, added fields to `getState()`
- `devguide/design.md` — marked task complete
- `devguide/ledger.md` — this entry

**Tests:** 313 total (0 new — all existing tests pass with updated logic). All passing.

**Key decisions:**
- Discount tracked by `playerBuiltDistricts` counter rather than re-counting districts, avoiding O(n) recounts
- Starting colonies explicitly flagged rather than checking pre-built district count — cleaner, future-proof for when colonize command is implemented
- Counter incremented at queue time (not completion time) so the 4th queued district gets full build time even if earlier ones haven't finished

**Next:** Planet type signature bonuses

---

## Entry 25 — 2026-03-12 — Game Speed Controls

**Phase:** 1 (Foundation Pivot)
**Status:** Complete

**What was built:**
- 5-speed game speed system (0.5x, 1x, 2x, 3x, 5x) with pause/unpause toggle
- Server: `setGameSpeed(speed)` and `togglePause()` methods on GameEngine that dynamically change the tick interval
- Server: `SPEED_INTERVALS` lookup (speed 1=200ms, 2=100ms, 3=50ms, 4=33ms, 5=20ms) and `SPEED_LABELS` for display
- Server: `onSpeedChange` callback broadcasts `speedChanged` messages to all room players
- Protocol: `setGameSpeed` and `togglePause` commands with host-only enforcement in multiplayer (any player in practice mode)
- Client: Speed indicator in status bar showing current speed label (e.g., "2x")
- Client: "PAUSED" overlay centered on screen when game is paused
- Client: Keyboard shortcuts — +/= to speed up, - to slow down, Space to toggle pause
- Speed and pause state included in `gameInit`, `gameState`, and `getPlayerState` payloads

**Files changed:**
- `server/game-engine.js` — added SPEED_INTERVALS, SPEED_LABELS, DEFAULT_SPEED constants; added _gameSpeed, _paused, onSpeedChange to constructor; added setGameSpeed(), togglePause(), _broadcastSpeedState() methods; updated start() to use speed-based interval; added speed/pause to getState() and getPlayerState(); updated exports
- `server/server.js` — added setGameSpeed and togglePause message handlers with host-only validation; wired onSpeedChange callback to broadcast speedChanged to room
- `src/public/index.html` — added speed indicator span in status bar; added pause overlay div
- `src/public/css/style.css` — added #status-speed and #pause-overlay styles
- `src/public/js/app.js` — added speedChanged message handler; stored speed/pause in gameState; added _updateSpeedDisplay(); added keyboard shortcuts (+/-/Space); added SPEED_LABELS client-side lookup
- `src/tests/game-engine.test.js` — 12 new unit tests for speed controls
- `src/tests/server-integration.test.js` — 2 new integration tests (protocol speed controls, host-only enforcement)
- `devguide/design.md` — marked game speed control tasks complete
- `devguide/ledger.md` — this entry

**Tests:** 347 total (14 new — 12 unit + 2 integration). All passing.

**Key decisions:**
- Speed changes tick interval rather than MONTH_TICKS — simpler implementation, all game systems (construction, growth, resources) scale uniformly
- Default speed is 2 (1x/100ms) matching the original 10Hz tick rate — no behavioral change for existing games
- Cache invalidation on speed/pause change prevents stale state reads
- Host-only control in multiplayer but any player can control in practice mode — solo players need full control for playtesting

**Next:** Planet type signature bonuses (R21 priority #2)

---

## Entry 26 — 2026-03-12 — Planet Type Signature Bonuses

**Phase:** 1 (Foundation Pivot)
**Status:** Complete

**What was built:**
- `PLANET_BONUSES` lookup table in game-engine.js: 6 habitable planet types each get additive production bonuses per working district of matching type
- Continental: +1 food per Agriculture district
- Ocean: +1 food per Agriculture, +1 each research per Research district
- Tropical: +2 food per Agriculture district
- Arctic: +1 mineral per Mining, +1 each research per Research district
- Desert: +2 mineral per Mining district
- Arid: +1 energy per Generator, +1 alloy per Industrial district
- Bonuses applied in `_calcProduction` after tech modifiers — additive, not multiplicative with tech
- Client: build menu shows planet-specific bonus per district type (orange text)
- Client: district info panel shows planet bonus row when applicable
- Client: system panel planet table includes Bonus column with per-type labels
- Client: `_planetBonusLabel()` helper formats bonus text for any planet type

**Files changed:**
- `server/game-engine.js` — PLANET_BONUSES constant, bonus application in _calcProduction, exported in module.exports
- `src/public/js/app.js` — client PLANET_BONUSES mirror, _planetBonusLabel helper, build menu bonus display, district info panel bonus row, system panel bonus column
- `src/public/css/style.css` — .build-option-bonus and .planet-bonus-tag styles
- `src/tests/game-engine.test.js` — 11 new planet bonus tests, updated ~12 existing tests to account for planet bonuses using calcPlanetBonus helper
- `devguide/design.md` — marked 2 tasks complete
- `devguide/ledger.md` — this entry

**Tests:** 344 total (11 new: PLANET_BONUSES structure, no bonuses for uninhabitable, Continental/Ocean/Tropical/Arctic/Desert/Arid production, tech+bonus stacking, disabled districts no bonus, serialization). All passing.

**Key decisions:**
- Bonuses are additive (flat +N per district) rather than multiplicative — prevents overpowered stacking with tech modifiers while keeping bonuses meaningful
- Applied after tech modifier multiplication, not before — tech multiplies base output, planet adds flat bonus on top. This means tech doesn't amplify planet bonuses
- Updated existing tests to use a `calcPlanetBonus` helper that dynamically computes expected values based on the galaxy-assigned planet type, rather than hardcoding — makes tests resilient to random galaxy seeds
- New planet bonus tests use `makeEngineWithPlanet()` helper that overrides colony planet type for deterministic testing
- Non-habitable types (barren, molten, gasGiant) have no bonuses — consistent with them being uncolonizable

**Next:** Colony ships — minimal expansion (R23 priority #2)

---

## Entry 27 — 2026-03-12 — Colony Ships + Multi-Colony Management

**Phase:** 3 (Galaxy & Exploration)
**Status:** Complete

**What was built:**
- Colony ships: buildable from any colony build queue for 200 minerals + 100 food + 100 alloys, 600 ticks (60 sec) build time
- Colony ship appears as movable unit at colony's system on galaxy map after construction
- `sendColonyShip` command: select idle ship, click habitable planet in system panel to send. BFS shortest path along hyperlanes, 50 ticks (5 sec) per hop
- On arrival: ship consumed, new colony founded with 2 pops on best habitable planet. Colony gets `isStartingColony = false` so first-3-districts build discount applies
- Max 5 colonies per player enforced (counts both existing colonies and in-flight ships)
- Colony list sidebar (left side): appears when player has 2+ colonies, shows colony name + pop count, click to switch view, keyboard shortcuts 1-5
- Colony ship rendering on galaxy map: colored diamond markers (OctahedronGeometry) interpolated along hyperlane path during transit, idle ships offset near their system
- System panel "Send Colony Ship here" button: appears when player has idle ships and target system has uncolonized habitable planet
- Build menu "Colony Ship" option: appears below district types with green accent, grayed when at colony cap or insufficient resources
- `colonyFounded` event broadcast to all players with toast notifications
- Colony ship build queue cancellation with 50% resource refund
- Shared resource pool across all colonies (Stellaris model)

**Files changed:**
- `server/game-engine.js` — COLONY_SHIP_COST/BUILD_TIME/HOP_TICKS/MAX_COLONIES/STARTING_POPS constants, _colonyShips array, _findPath BFS, _processColonyShipMovement, _foundColonyFromShip, buildColonyShip/sendColonyShip commands, colonyShip in construction completion, colonyShip cancellation refund, colony ships in getState/getPlayerState serialization
- `server/server.js` — added buildColonyShip and sendColonyShip to command routing
- `src/public/js/galaxy-view.js` — colonyShipMeshes, OctahedronGeometry diamond markers, updateColonyShips method with path interpolation, cleanup in _clearGalaxy
- `src/public/js/app.js` — colonyShips in gameState, _viewingColonyIndex for multi-colony, _updateColonyList sidebar, colony ship build option in build menu, "Send Colony Ship" in system panel, number key shortcuts 1-5, colonyShip queue display, galaxy view colony ship updates
- `src/public/js/toast-format.js` — colonyFounded, colonyShipFailed, colonyShip constructionComplete toast formatting
- `src/public/index.html` — colony-list-sidebar div
- `src/public/css/style.css` — colony list sidebar, colony ship build option, send colony ship button styles
- `src/tests/colony-ships.test.js` — new file (37 tests)
- `devguide/design.md` — marked 4 tasks complete (colony ships, colony switcher UI, colony list sidebar, max colonies cap, colony founding broadcast)
- `devguide/ledger.md` — this entry

**Tests:** 384 total (37 new: constants, buildColonyShip validation × 8, construction completion × 2, cancellation refund, BFS pathfinding × 3, sendColonyShip validation × 5, movement + colonization × 2, colony cap × 2, serialization × 2, toast formatting × 4). All passing.

**Key decisions:**
- Colony ships use existing build queue system (type: 'colonyShip') rather than a separate shipyard — keeps expansion simple and accessible from day 1
- BFS pathfinding computed on send command, not on ship tick — path is static once calculated, no per-tick pathfinding cost
- Ship movement processed every tick (hopProgress++) but dirty marking throttled to every 5 ticks — smooth animation without broadcast spam
- Colony cap counts both existing colonies and in-flight ships to prevent queuing 5 ships simultaneously
- New colonies start with 2 pops (not 8) — makes expansion a real investment that takes time to pay off
- Colony list sidebar only appears with 2+ colonies — no UI clutter for single-colony games
- Shared resource pool (not per-colony) matches Stellaris model — simpler accounting, colony ships use global resources

**Next:** Fog of war on galaxy map (R25 priority #3)

---

## Entry 28 — 2026-03-12 — Fog of War on Galaxy Map

**Phase:** 3 (Galaxy & Exploration)
**Status:** Complete

**What was built:**
- Client-side fog of war visibility system with BFS from owned systems to depth 2 along hyperlanes
- Shared `fog-of-war.js` module (IIFE pattern) with `buildAdjacency`, `computeVisibility`, `getOwnedSystemIds` — testable in both browser and Node.js
- Three visibility tiers for star systems: **Known** (within 2 hops of owned system) renders full-color at normal size, **Unknown** renders as dim gray dot at 60% size with opacity 0.2
- Hyperlane visibility: **known** (both endpoints known) renders solid at 0.4 opacity, **faded** (one endpoint known) renders at 0.12 opacity, **hidden** (neither known) not rendered at all
- Hover labels show "Unknown System" for systems outside fog range, full name for known systems
- System panel shows "Unexplored — send a colony ship to learn more" for unknown systems instead of planet details
- Unknown systems still show ownership dots if another player has colonized them (colored ring visible, but no planet data)
- Fog recomputes on every `updateOwnership` call (each gameState update), so visibility expands in real-time as colonies are founded
- Hyperlanes rebuilt on each fog recompute (partitioned into known/faded/hidden LineSegments)

**Files changed:**
- `src/public/js/fog-of-war.js` — **new** shared fog of war computation module
- `src/public/js/galaxy-view.js` — adjacency list, fog state, star material swapping, hyperlane partitioning, hover label gating, `isSystemKnown` API
- `src/public/js/app.js` — system panel fog of war check, "Unexplored" UI for unknown systems
- `src/public/index.html` — fog-of-war.js script tag
- `src/public/css/style.css` — `.system-unexplored` style
- `src/tests/fog-of-war.test.js` — **new** 19 tests
- `devguide/design.md` — marked task complete
- `devguide/ledger.md` — this entry

**Tests:** 419 total (19 new: adjacency building ×3, BFS visibility ×9, owned system extraction ×3, constant validation ×1, integration scenarios ×3). All passing.

**Key decisions:**
- Extracted BFS/adjacency into shared `fog-of-war.js` module rather than inlining in galaxy-view.js — enables Node.js testing without DOM/Three.js dependencies
- Client-side only — no server changes needed. Server sends full galaxy data; client filters what to render based on owned systems
- Fog recomputes on every gameState update rather than being cached across sessions — simple, correct, and fast enough (BFS on 50-200 nodes is trivial)
- Unknown systems still rendered (dim dot) rather than completely hidden — preserves galaxy shape awareness and lets players see the extent of unexplored space
- Ownership rings still visible on unknown systems — creates "who owns that?" tension without revealing planet details
- Hyperlane rebuild on each fog update creates 2-3 LineSegments objects max — negligible memory cost vs maintaining a single object with per-line opacity

**Next:** Base capital housing reduction 10→8 (R25 priority #4), or in-game chat panel (R25 priority #5)

---

## Entry 29 — 2026-03-12 — Multiplayer Awareness Bundle (Chat + Scoreboard + Event Ticker)

**Phase:** 1 (Foundation Pivot)
**Status:** Complete

**What was built:**
- **In-game chat panel:** Collapsible chat overlay at bottom-left of game screen. Reuses existing WebSocket `chat` message routing. Player names colored by their player color from gameState. Enter key focuses chat input, Escape unfocuses. Auto-expands when new messages arrive, collapses after 4 seconds. Max 30 messages displayed. `e.stopPropagation()` prevents game shortcuts while typing.
- **Enhanced scoreboard overlay (Tab key):** Expanded from VP-only to show: rank, player name (colored), VP, colony count, total pops, and net income rates for energy/minerals/food/alloys. Month counter shown at top. Server-side `_getPlayerSummary(playerId)` computes per-player stats from colony production data. Income data included in `getPlayerState` for both own player and other players.
- **Event ticker:** Scrolling ticker at top-center of game screen showing significant player actions across all players. Events auto-dismiss after 6 seconds with fade animation. Max 5 visible. Broadcasts: `constructionComplete`, `popMilestone`, `colonyFounded`, `researchComplete`. Each broadcast event includes `playerName` field and `broadcast: true` flag. Server routes broadcast events to all players in room instead of just the originating player.
- **Broadcast event system:** Added `broadcast` parameter to `_emitEvent()`. Server `onEvent` handler now checks `event.broadcast` to route to all room players vs single player. Non-broadcast events (foodDeficit, housingFull, etc.) remain private. Simplified colonyFounded from N per-player events to 1 broadcast event.

**Files changed:**
- `server/game-engine.js` — `_emitEvent` broadcast flag, `_getPlayerSummary` method, playerName in broadcast events, colonyFounded simplified to single broadcast, summary in getPlayerState
- `server/server.js` — broadcast routing in onEvent handler
- `src/public/js/app.js` — game chat DOM refs, `_addGameChatMessage`, `_getPlayerColor`, game chat input wiring (Enter/Escape/focus/blur), event ticker (`_addTickerEvent`, `_formatTickerEvent`), enhanced `_renderScoreboard` with colonies/pops/income, toast now only shows for own events
- `src/public/index.html` — `#game-chat` panel, `#event-ticker` div
- `src/public/css/style.css` — game chat styles (collapsible, expanded state), event ticker styles (fade in/out animations), enhanced scoreboard styles (wider, income colors), `.inc-pos`/`.inc-neg` classes
- `src/tests/multiplayer-awareness.test.js` — **new** 17 tests
- `devguide/design.md` — marked 3 tasks complete
- `devguide/ledger.md` — this entry

**Tests:** 455 total (17 new: player summary × 5, getPlayerState summary × 4, broadcast events × 6, chat protocol × 2). All passing.

**Key decisions:**
- Chat auto-collapses after 4 seconds to avoid obscuring the game view, but stays expanded while input is focused
- Broadcast events are a lightweight extension to the existing `_emitEvent` system — just a boolean flag, no architectural changes
- Toasts remain private (only show for own events) while the ticker shows all-player broadcasts — avoids duplicating notifications for your own actions
- colonyFounded simplified from N manual per-player events to 1 broadcast event — cleaner and consistent with the new system
- Scoreboard income data computed server-side via `_getPlayerSummary` to keep all game state authoritative on the server
- Event ticker positioned below status bar at top-center, separate from toasts (right side) — two distinct notification channels

**Next:** Base capital housing reduction 10→8 (R25 priority #4), or starting planet variety, or colony personality system (R28 priority #2)

---

## Entry 30 — 2026-03-12 — Balance Fix: Research VP Rebalance + Per-Tech VP Bonuses

**Phase:** 4 (Technology & Research)
**Status:** Complete

**What was built:**
- Doubled research VP contribution: changed VP formula from `totalResearch/100` to `totalResearch/50` in `_calcVictoryPoints` and `_triggerGameOver` breakdown
- Added per-tech VP bonuses: +5 VP per completed T1 tech, +10 VP per T2 tech, +20 VP per T3 tech (when T3 exists)
- Updated game-over breakdown to include `techs` (count) and `techVP` (bonus VP from completed techs) fields
- Updated client post-game scoreboard table to show Techs column with count and VP contribution
- A player who researches all 6 current techs gets +45 VP bonus (3×5 + 3×10) plus doubled research stockpile VP — makes "tech rush" a viable strategy

**Files changed:**
- `server/game-engine.js` — `_calcVictoryPoints` research divisor 100→50, techVP loop over completedTechs; `_triggerGameOver` breakdown with techs/techVP fields
- `src/public/js/app.js` — game-over scoreboard Techs column
- `src/tests/game-engine.test.js` — updated 2 existing VP tests (research divisor, fractional values), added 7 new tests
- `devguide/design.md` — marked task complete
- `devguide/ledger.md` — this entry

**Tests:** 502 total (7 new: research divisor=50, T1 tech +5 VP, T2 tech +10 VP, multi-tech sum, zero techs, gameOver breakdown techs/techVP, all 6 techs = +45 VP). All passing.

**Key decisions:**
- Per-tech VP bonuses are flat (+5/+10/+20 by tier) rather than percentage-based — predictable, easy to reason about during play
- techVP computed in a loop over completedTechs using TECH_TREE tier lookup — future T3 techs at +20 VP each will automatically work
- Research divisor change from 100→50 means 1 Research district (producing 12 research/month across 3 tracks) generates ~0.24 VP/month from stockpile alone, plus tech completion bonuses
- Game-over breakdown shows both tech count and tech VP separately for clarity

**Next:** Science ships (game-designer R29 priority #1) or colony crisis events (R29 priority #2)

---

## Entry 31 — 2026-03-12 — Science Ships + System Surveying + Anomaly Discovery

**Phase:** 3 (Galaxy & Exploration) + Phase 2 (anomalies)
**Status:** Complete

**What was built:**
- Science ship unit type: cheaper (100 minerals + 50 alloys), faster (30 ticks/hop = 3 sec vs colony ship 50 ticks/hop = 5 sec) exploration unit buildable from colony build queue
- Max 3 science ships per player (counted across built + building)
- Build time: 300 ticks (30 sec). Construction completion spawns idle ship at colony's system
- `sendScienceShip` command: select idle ship, click system in galaxy panel to send. BFS shortest path along hyperlanes
- Auto-survey on arrival: 100 ticks (10 sec). Survey completes automatically
- 5 anomaly types discovered at 20% chance per planet: Ancient Ruins (+50 research per track), Mineral Deposit (+100 minerals), Habitable Moon (+2 planet size), Precursor Artifact (+25 influence), Derelict Ship (+50 alloys)
- Anomaly rewards applied immediately on discovery. Seeded random for deterministic outcomes
- Surveyed systems tracked per player (`_surveyedSystems` Map) — persistent fog penetration: surveyed systems stay revealed even when outside 2-hop visibility range
- After surveying, science ship auto-returns to nearest colony via BFS pathfinding
- Galaxy map rendering: cyan OctahedronGeometry diamond (smaller than colony ship green diamond). Orbiting animation during survey, interpolated movement during transit
- Client: "Science Ship" build option in build menu (cyan accent), "Send Science Ship to survey" button in system panel (both known and unknown systems), "Surveyed" badge on surveyed systems
- Build queue display handles scienceShip type with cyan color and 300-tick total
- Toast notifications: scienceShip constructionComplete, surveyComplete (with anomaly count), anomalyDiscovered
- Event ticker: surveyComplete broadcasts formatted with anomaly count
- Fog of war integration: surveyed systems added to known set in galaxy-view.js _recomputeFog
- 50% resource refund on build queue cancellation (same as colony ships)

**Files changed:**
- `server/game-engine.js` — SCIENCE_SHIP constants, ANOMALY_TYPES, _scienceShips array, _surveyedSystems Map, scienceShip construction completion, _processScienceShipMovement, _completeSurvey, _seededRandom, _returnScienceShipToColony, _removeScienceShip, buildScienceShip/sendScienceShip commands, scienceShip cancellation refund, serialization in getState/getPlayerState, tick integration, module.exports
- `server/server.js` — buildScienceShip and sendScienceShip command routing
- `src/public/js/app.js` — scienceShips/surveyedSystems in gameState, science ship build option, "Send Science Ship" button in system panel, scienceShip build queue display, event ticker surveyComplete format, galaxy view updateScienceShips call
- `src/public/js/galaxy-view.js` — scienceShip geometry/material, scienceShipMeshes/Pool, updateScienceShips with transit/survey/idle animations, cleanup in _clearGalaxy, surveyed systems in fog recompute, module export
- `src/public/js/toast-format.js` — surveyComplete, anomalyDiscovered, scienceShip constructionComplete formatting and TOAST_TYPE_MAP entries
- `src/public/js/fog-of-war.js` — (unchanged, integration via galaxy-view.js)
- `src/public/css/style.css` — .system-send-sci-btn, .system-surveyed-badge styles
- `src/tests/science-ships.test.js` — **new** 37 tests
- `devguide/design.md` — marked task complete
- `devguide/ledger.md` — this entry

**Tests:** 552 total (37 new: 7 constants, 6 buildScienceShip validation, 2 construction completion, 6 sendScienceShip validation, 4 movement + survey, 4 serialization, 1 cancellation refund, 5 toast formatting, 2 toast type map). All passing.

**Key decisions:**
- Science ships follow colony ship pattern exactly (build queue, BFS pathfinding, hop-based movement) for consistency and maintainability
- Seeded random for anomaly rolls (`_seededRandom`) uses system+planet orbit as seed — deterministic per system, no stored state needed
- Anomaly rewards are immediate one-time bonuses (not ongoing) — keeps things simple, rewards exploration without requiring ongoing tracking
- Max 3 ships (vs colony ship's max 5) balances exploration investment against expansion
- Auto-return to nearest colony after survey — ships don't sit idle at remote systems, always ready for next command
- Persistent fog penetration means surveyed systems stay visible even after ship leaves — rewards systematic exploration
- Surveyed check prevents sending ships to already-surveyed systems — no wasted turns

**Next:** Colony crisis events (game-designer R30 priority #1) or T3 tech expansion (R17-5)

---

## Entry 32 — 2026-03-12 — Single-Player Mode Client UI

**Phase:** 1 (Foundation — Client UX)
**Status:** Complete

**What was built:**
- "Single Player" button in lobby header — one click creates a practice-mode room and enters it
- Room screen hides Ready button and shows Launch immediately in practice mode
- Green-accented button styling to visually distinguish from multiplayer "Create Room"
- Server already had full practiceMode support (maxPlayers=1, canLaunch bypasses ready check, 10-min default timer) — this was purely a client UI gap

**Files changed:**
- `src/public/index.html` — added `#single-player-btn` in lobby header
- `src/public/js/app.js` — added DOM ref, click handler sending `practiceMode: true`, updated `renderRoom()` to hide ready/show launch in practice mode
- `src/public/css/style.css` — `#single-player-btn` styling (green accent)
- `devguide/ledger.md` — this entry

**Tests:** 566 total, all passing. No new tests needed — server-side practiceMode already had 7+ dedicated tests in room-manager.test.js and server-integration.test.js.

**Key decisions:**
- Single click creates + enters room (no dialog) — minimizes friction for solo play
- Room name auto-set to "{playerName}'s Game" — no input needed
- Practice mode rooms use server defaults (10-min timer, small galaxy) — player can still configure via multiplayer path if desired

**Next:** Colony crisis events or T3 tech expansion

---

## Entry 33 — 2026-03-12 — Colony Personality Traits + VP Bonus

**Phase:** 2 (Colony Management) + Phase 1 (VP balance)
**Status:** Complete

**What was built:**
- Colony personality trait system: when a colony has 4+ districts of the same type, it earns a named trait with empire-wide production bonuses
- 5 trait types: Academy World (4+ Research: +10% research empire-wide), Forge World (4+ Industrial: +10% alloys), Mining Colony (4+ Mining: +10% minerals), Breadbasket (4+ Agriculture: +10% food), Power Hub (4+ Generator: +10% energy)
- Only one trait per colony — highest district count wins. Disabled districts don't count
- Empire-wide bonuses stack across colonies (2 Forge Worlds = +20% alloys)
- Trait bonuses applied as multiplicative modifier in `_calcProduction` after base + tech + planet bonuses
- +5 VP per active colony trait added to `_calcVPBreakdown` — rebalances tall vs wide play
- `colonyTraitEarned` broadcast event emitted when district construction creates or changes a trait
- Colony serialization includes `trait: { type, name }` (or null)
- Client: trait badge shown in colony info panel (gold text) and colony list sidebar (gold pill badge)
- Client: game-over scoreboard includes Traits column with count and VP contribution
- Toast notification: "Colony earned trait: Mining Colony!" (positive type)
- Colony list sidebar fingerprint includes trait type for rebuild on trait changes

**Files changed:**
- `server/game-engine.js` — COLONY_TRAITS constant, `_calcColonyTrait`, `_calcTraitBonuses`, trait bonus application in `_calcProduction`, traitsVP in `_calcVPBreakdown`, trait in `_serializeColony`, `colonyTraitEarned` event in construction completion, COLONY_TRAITS in module.exports
- `src/public/js/app.js` — cpTraitRow/cpTrait DOM refs, trait display in `_updateHUD`, trait badge in colony list sidebar, traits column in game-over scoreboard, trait in colony list fingerprint
- `src/public/index.html` — cp-trait-row in colony panel
- `src/public/css/style.css` — .colony-list-trait, .colony-trait-badge styles
- `src/public/js/toast-format.js` — colonyTraitEarned formatting and TOAST_TYPE_MAP entry
- `src/tests/colony-traits.test.js` — **new** 24 tests
- `devguide/design.md` — marked 2 tasks complete
- `devguide/ledger.md` — this entry

**Tests:** 643 total (24 new: COLONY_TRAITS constant ×4, _calcColonyTrait ×8, empire-wide bonuses ×7, VP bonus ×4, serialization ×3, trait event ×2, toast formatting ×3). All passing.

**Key decisions:**
- Trait bonuses are multiplicative on total production (base + tech + planet), applied after all other modifiers — gives the most impactful reward for specialization
- Disabled districts excluded from trait count — losing power can cost you a trait, creating cascading consequences
- Only one trait per colony (highest count wins) — prevents gaming with exactly 4 of everything
- Housing districts can't earn traits — consistent with housing having no production output
- Trait calculation is not cached separately — computed on-demand in `_calcProduction`, `_calcVPBreakdown`, and `_serializeColony`. Could be cached if profiling shows a bottleneck
- +5 VP per trait means a 3-colony empire with 3 traits gets +15 VP, competitive with a 5-colony empire's raw pop/district VP

**Next:** T3 tech expansion (game-designer R31 priority #2) or colony crisis events (R31 priority #3)

---

## Entry 34 — 2026-03-12 — Colony Crisis Events (4 Types)

**Phase:** 2 (Colony Management)
**Status:** Complete

**What was built:**
- Colony crisis event system: 4 crisis types with 2-choice resolution and timing mechanics
- **Seismic Activity**: Evacuate (lose 1 district, save pops) or Reinforce (spend 100 minerals, 70% success / 30% lose district + 1 pop)
- **Plague Outbreak**: Quarantine (growth halted 300 ticks) or Rush Cure (50 energy + 50 food, 80% success / 20% lose 1 pop)
- **Power Surge**: Shut Down (all districts disabled 100 ticks) or Ride It Out (+50% energy 200 ticks, 25% chance lose generator)
- **Labor Unrest**: Negotiate (spend 25 influence, resume immediately) or Wait (strike lasts 300 ticks with 3 districts disabled)
- Crisis timing: first crisis at 1500+ ticks (2.5 min grace), subsequent crises every 500-800 ticks with 300-tick immunity after resolution
- 200-tick (20 sec) decision window — unresolved crises auto-resolve with worst outcome
- Crisis state serialized to client: type, label, description, choices, timer, ongoing effects
- Client: crisis alert panel in colony panel with choice buttons, countdown timer, ongoing effect status display
- Toast notifications: crisisStarted (crisis type), crisisResolved (outcome)
- Event ticker: broadcasts crisis events to all players with formatted text
- Energy boost integration: Power Surge "Ride It Out" success gives +50% energy production via `_calcProduction`
- Quarantine integration: Plague quarantine blocks pop growth via `_processPopGrowth` check
- `resolveCrisis` command with full validation: ownership, active crisis, valid choice, resource cost check

**Files changed:**
- `server/game-engine.js` — CRISIS_TYPES, CRISIS_MIN_TICKS, CRISIS_MAX_TICKS, CRISIS_CHOICE_TICKS, CRISIS_IMMUNITY_TICKS constants; crisisState/nextCrisisTick on colony; _processColonyCrises, _triggerCrisis, _processCrisisEffects, _autoResolveCrisis, _resolveCrisisSeismic/Plague/PowerSurge/LaborUnrest, resolveCrisis; energy boost in _calcProduction; quarantine check in _processPopGrowth; crisis in _serializeColony; tick loop integration; handleCommand resolveCrisis case
- `server/server.js` — resolveCrisis added to command routing
- `src/public/js/app.js` — crisis alert DOM refs, crisis panel rendering in _updateHUD, resolveCrisis send on choice click, crisisStarted/crisisResolved in event ticker
- `src/public/js/toast-format.js` — crisisStarted/crisisResolved formatting and TOAST_TYPE_MAP entries
- `src/public/index.html` — crisis-alert div with header/desc/timer/choices/status elements
- `src/public/css/style.css` — crisis alert panel styles, choice button styles
- `src/tests/colony-crises.test.js` — **new** 37 tests
- `devguide/design.md` — marked task complete
- `devguide/ledger.md` — this entry

**Tests:** 686 total (37 new: 4 constants, 6 triggering, 4 seismic resolution, 4 plague resolution, 4 power surge resolution, 5 labor unrest resolution, 1 auto-resolution, 5 validation, 3 serialization, 1 energy boost, 4 toast formatting). All passing.

**Key decisions:**
- First crisis delayed to 1500+ ticks (2.5 min) so early game isn't punishing — subsequent crises use normal 500-800 tick intervals
- Crisis choices have asymmetric risk/reward: safe option always works but costs something, risky option has % chance of better/worse outcome
- Auto-resolution picks worst outcome to incentivize active decision-making — no benefit to ignoring crises
- Labor unrest disables 3 random districts on trigger (not on resolution) — creates immediate pressure to act
- Energy boost applied in _calcProduction as a 1.5x multiplier on energy — production cache invalidated when boost starts/ends
- Quarantine check added to top of _processPopGrowth loop — cleanest integration point
- Crisis state serialized with full CRISIS_TYPES definition (choices, descriptions) so client doesn't need a local copy of the crisis definitions

**Next:** T3 tech expansion (game-designer R32 priority #2) or colony planet context rendering (R32 priority #3)

---

## Entry 35 — 2026-03-13 — T3 Tech Expansion + Crisis Interval Scaling

**Phase:** 4 (Technology & Research) + Phase 2 (Colony Management balance)
**Status:** Complete

**What was built:**
- 3 new Tier 3 techs added to TECH_TREE (cost 1000 each, requires T2 prerequisite):
  - **Fusion Reactors** (Physics T3): +100% Generator output (2.0x multiplier) + generators produce +1 alloy per working district. New `alloysBonus` effect property in tech modifier system
  - **Genetic Engineering** (Society T3): +100% Agriculture output (2.0x multiplier) + pop growth time halved (0.5x stacking with Frontier Medicine's 0.75x = 0.375x total). New `districtBonusAndGrowth` effect type combines district and growth bonuses
  - **Automated Mining** (Engineering T3): +100% Mining output (2.0x multiplier) + mining districts cost 0 jobs. New `jobOverride` effect property allows districts to produce without consuming a pop slot
- `_getTechModifiers` expanded to return `alloysBonus` and `jobOverride` maps alongside existing `district` and `growth` fields
- `_calcJobs` now checks `techMods.jobOverride` — mining districts with Automated Mining contribute 0 jobs, freeing pops for other work
- `_calcProduction` updated: applies `alloysBonus` per working generator, handles `effectiveJobs === 0` with `def.jobs > 0` (tech override) to allow production without pop assignment
- Client TECH_TREE_UI updated with 3 new T3 cards showing in research panel
- VP: T3 techs grant +20 VP each (all 9 techs = 105 total techVP vs previous 45 for 6 techs)
- **Crisis interval scaling:** `_scheduleCrisis` now adds +100 ticks per colony beyond 3. A 5-colony empire gets +200 ticks between crises (~20 extra seconds), reducing late-game crisis whack-a-mole

**Files changed:**
- `server/game-engine.js` — 3 new TECH_TREE entries, `_getTechModifiers` returns alloysBonus/jobOverride, `_calcJobs` uses jobOverride, `_calcProduction` applies alloysBonus and handles 0-job tech override, `_scheduleCrisis` colony count scaling
- `src/public/js/app.js` — 3 new TECH_TREE_UI entries (fusion_reactors, genetic_engineering, automated_mining)
- `src/tests/t3-techs-crisis-scaling.test.js` — **new** 28 tests
- `src/tests/game-engine.test.js` — updated 1 test (TECH_TREE count 6→9, tiers 2→3)
- `devguide/design.md` — marked 2 tasks complete
- `devguide/ledger.md` — this entry

**Tests:** 718 total (28 new: T3 structure ×5, Fusion Reactors ×3, Genetic Engineering ×2, Automated Mining ×4, VP bonuses ×2, research validation ×2, crisis interval scaling ×3, tech modifier properties ×3, existing test updated ×1). All passing.

**Key decisions:**
- Fusion Reactors alloy bonus is flat +1 per generator (not multiplicative) — prevents overpowered stacking, keeps it as a side benefit rather than replacing Industrial districts
- Genetic Engineering growth multiplier stacks multiplicatively with Frontier Medicine (0.75 × 0.5 = 0.375) — both techs in the same track, late-game payoff for full society investment
- Automated Mining uses `jobOverride` mechanism rather than modifying DISTRICT_DEFS — clean separation between base definitions and tech effects, tech modifier cache handles invalidation
- Mining districts with 0 jobs still produce even with 0 pops — they're fully automated. This is a powerful late-game economy enabler
- Crisis scaling uses colony count at scheduling time, not a fixed value — dynamically adapts as player expands or loses colonies
- T3 cost of 1000 requires heavy research investment: with 1 Research district (12/month across 3 tracks = 4 per track), T3 takes ~250 months (~42 min). Players need 2-3 Research districts to complete T3 in a 20-min match

**Next:** Colony planet context rendering (game-designer R33 priority #2) or influence economy/edicts (R33 priority #3)

---

## Entry 37 — 2026-03-14 — Edict System (Influence Spending)

**Phase:** 2 (Colony Management)
**Status:** Complete

**What was built:**
- Empire-wide edict system: 4 edicts that spend influence for temporary bonuses
- Mineral Rush (50 influence, +50% mining output for 5 months)
- Population Drive (75 influence, +100% pop growth for 5 months)
- Research Grant (50 influence, +50% research output for 5 months)
- Emergency Reserves (25 influence, instantly grants +100 energy/minerals/food)
- Monthly edict processing: duration countdown, expiry with event notification
- Edict production modifiers integrated into `_calcProduction` (after trait bonuses)
- Edict growth modifiers integrated into `_processPopGrowth` (after tech modifiers)
- `activateEdict` command with full validation (influence check, active edict check, type check)
- Client UI: edict panel (E key toggle), shows active edict status and all available edicts
- Toast notifications for edict activation and expiry
- Edict state serialized in per-player gameState

**Files changed:**
- `server/game-engine.js` — EDICT_DEFS constant, activeEdict in playerState, _processEdicts monthly, activateEdict command, edict modifiers in _calcProduction and _processPopGrowth, activeEdict in getPlayerState, EDICT_DEFS export
- `server/server.js` — added activateEdict to command routing
- `src/public/index.html` — edict panel HTML
- `src/public/js/app.js` — edict panel refs, EDICT_UI definitions, _toggleEdictPanel, _renderEdictPanel, E key shortcut, Escape handling, close button wiring
- `src/public/js/toast-format.js` — edictActivated and edictExpired toast formatting
- `src/public/css/style.css` — edict panel and option styling
- `src/tests/game-engine.test.js` — 13 new edict tests
- `devguide/design.md` — marked edict system complete

**Tests:** 753 total (all passing). 13 new edict tests covering: activation, influence deduction, rejection (insufficient funds, already active, unknown type, missing params), emergency reserves instant grant, mineral rush production boost, research grant production boost, population drive growth bonus, edict expiry with event, edictActivated event, state serialization, sequential edict activation, EDICT_DEFS export.

**Key decisions:**
- Instant edicts (Emergency Reserves) don't count as "active" — can activate a duration edict right after
- Edict production modifiers apply multiplicatively after trait bonuses but before crisis modifiers
- One active edict at a time (as specified) — creates strategic timing decisions
- Influence remains a finite resource (starting 100, no income yet) — edict choices are irreversible and meaningful

**Next:** VP formula rebalance with diminishing pop returns (game-designer R34 priority #2), or influence generation from colony traits (R31) to create renewable edict fuel

---

## Entry 38 — 2026-03-14 — Influence Income from Colonies

**Phase:** 2 (Colony Management)
**Status:** Complete

**What was built:**
- Renewable influence income: each colony generates +2 influence/month base income (capital building)
- Trait bonus: each colony with an active personality trait generates +1 influence/month bonus
- Influence cap at 200 to prevent late-game stockpiling
- `_processInfluenceIncome()` method called monthly after edicts, iterates player colonies and adds base + trait income
- Influence income included in `_getPlayerSummary` income object for client display
- Client HUD: influence resource bar now shows net income rate (+N/month) matching other resources
- Constants: `INFLUENCE_BASE_INCOME` (2), `INFLUENCE_TRAIT_INCOME` (1), `INFLUENCE_CAP` (200) exported

**Files changed:**
- `server/game-engine.js` — INFLUENCE_BASE_INCOME/INFLUENCE_TRAIT_INCOME/INFLUENCE_CAP constants, `_processInfluenceIncome` method, influence income in `_getPlayerSummary`, wired into monthly tick loop, constants in module.exports
- `src/public/js/app.js` — `influenceNet` in resBar, influence income display in `_updateHUD` from player summary
- `src/public/index.html` — added `res-influence-net` span to influence resource bar item
- `src/tests/influence-income.test.js` — **new** 19 tests
- `devguide/design.md` — marked task complete
- `devguide/ledger.md` — this entry

**Tests:** 772 total (19 new: 3 constants, 3 base income from 1/2/3 colonies, 3 trait bonus income, 3 cap enforcement, 5 edge cases including 0 colonies/monthly tick integration/multiplayer/summary, 1 serialization). All passing.

**Key decisions:**
- Influence income processed after edicts in the monthly tick — edicts deduct first, then income arrives, preventing exploit where income offsets same-month edict cost
- Income added to `_getPlayerSummary` so the client can show the rate without separate calculation — consistent with how energy/mineral/food/alloy income already works
- Cap enforced in `_processInfluenceIncome` after adding income — simple clamp, no pre-check needed
- Starting influence remains 100 as specified — now a meaningful starting budget rather than the entire lifetime supply
- Example pacing: 3 colonies with 2 traits = 8 influence/month → 50-cost Mineral Rush edict takes ~6 months (~1 min) to save for

**Next:** VP formula rebalance with diminishing pop returns (game-designer R37 priority #2)

---

## Entry 39 — 2026-03-14 — VP Formula Rebalance (Diminishing Pop Returns)

**Phase:** 1 (Foundation Pivot)
**Status:** Complete

**What was built:**
- Diminishing pop VP returns: first 20 pops ×2 VP each, pops 21-40 ×1.5 VP each (rounded), pops 41+ ×1 VP each
- Static `GameEngine._calcPopVP(totalPops)` method for the tiered formula
- Colony trait VP increased from +5 to +10 per active trait
- T3 tech VP increased from +20 to +30 each (T1: +5, T2: +10 unchanged)
- Exploration VP: +1 VP per 5 systems surveyed (reads from `_surveyedSystems` map)
- `_calcVPBreakdown` returns new `surveyed` and `surveyedVP` fields
- Empty breakdown for unknown players includes `surveyed: 0, surveyedVP: 0`
- Client game-over scoreboard shows "Explored" column with surveyed count and VP

**Files changed:**
- `server/game-engine.js` — `_calcPopVP` static method, `_calcVPBreakdown` updated: diminishing pop VP, trait VP 5→10, T3 tech VP 20→30, exploration VP from surveyedSystems, new surveyed/surveyedVP fields in breakdown and empty object
- `src/public/js/app.js` — game-over scoreboard table: added "Explored" column header and `surveyed (surveyedVP)` cell
- `src/tests/vp-rebalance.test.js` — **new** 27 tests
- `src/tests/colony-traits.test.js` — updated 3 tests (traitsVP 5→10, total VP recalculated)
- `src/tests/t3-techs-crisis-scaling.test.js` — updated 2 tests (T3 VP 20→30, all-techs total 105→135)
- `src/tests/game-engine.test.js` — updated 1 test (gameOver popsVP assertion uses `_calcPopVP`)
- `devguide/design.md` — marked task complete
- `devguide/ledger.md` — this entry

**Tests:** 829 total (27 new: 10 _calcPopVP tier tests, 2 trait VP increase, 3 T3 tech VP increase, 7 exploration VP, 5 integrated formula). All passing.

**Key decisions:**
- Pop VP uses `Math.round` for the 1.5× tier — 21 pops = 42 VP (round(1.5) = 2), 25 pops = 48 VP (round(7.5) = 8)
- Exploration VP reads from existing `_surveyedSystems` Map — no new data tracking needed
- `_calcPopVP` is a static method for easy testing without engine instantiation
- VP formula now: `popVP + districts + alloysVP + researchVP + techVP + traitsVP + surveyedVP`
- Impact: at 8 starting pops, VP unchanged (16). At 40 pops, 70 VP vs old 80. At 100 pops, 130 VP vs old 200 — 35% reduction. Multiple strategies now viable

**Next:** Starting condition draft "Opening Hands" (game-designer R38-3) or scarcity seasons (R38-7)

---

## Entry 40 — 2026-03-14 — Scarcity Seasons (Galaxy-Wide Resource Pressure)

**Phase:** 2 (Colony Management)
**Status:** Complete

**What was built:**
- Galaxy-wide scarcity seasons: every 800-1200 ticks (randomized), one commodity resource (energy/minerals/food) gets -30% production for 300 ticks (30 seconds)
- 100-tick advance warning broadcast before scarcity starts, giving players time to stockpile or activate Emergency Reserves edict
- Resource rotation: same resource cannot be hit twice in a row
- `_processScarcitySeason()` method called every tick — handles warning phase, scarcity start, countdown, and end
- SCARCITY_MULTIPLIER (0.70) applied in `_calcProduction` after edict bonuses, before crisis effects
- `_invalidateAllProductionCaches()` method invalidates all colony production caches on scarcity start/end
- Three broadcast events: `scarcityWarning`, `scarcityStarted`, `scarcityEnded` — all broadcast to all players
- Active scarcity state included in `getState()` and `getPlayerState()` serialization for client HUD
- Client: toast notifications for all three scarcity events, ticker display with colored warnings, HUD indicator showing active scarcity countdown

**Files changed:**
- `server/game-engine.js` — SCARCITY_RESOURCES/SCARCITY_MIN_INTERVAL/SCARCITY_MAX_INTERVAL/SCARCITY_DURATION/SCARCITY_WARNING_TICKS/SCARCITY_MULTIPLIER constants, constructor init (_activeScarcity, _lastScarcityResource, _nextScarcityTick, _scarcityWarned), _randomScarcityInterval, _pickScarcityResource, _processScarcitySeason, _invalidateAllProductionCaches methods, scarcity multiplier in _calcProduction, activeScarcity in getState/getPlayerState, constants in module.exports
- `src/public/js/toast-format.js` — scarcityWarning/scarcityStarted/scarcityEnded in TOAST_TYPE_MAP and formatGameEvent
- `src/public/js/app.js` — scarcity events in _formatTickerEvent, scarcity HUD indicator in _updateHUD
- `src/public/index.html` — scarcity-indicator span in status bar
- `src/tests/scarcity-seasons.test.js` — **new** 31 tests
- `devguide/design.md` — marked task complete
- `devguide/ledger.md` — this entry

**Tests:** 887 total (31 new: 2 constants, 3 initialization, 3 warning phase, 4 active scarcity lifecycle, 5 production multiplier, 2 resource rotation, 2 scheduling, 2 cache invalidation, 1 multiplayer, 4 state serialization, 2 edict interaction, 1 full lifecycle integration). All passing (1 pre-existing failure in game-engine.test.js:549 unrelated).

**Key decisions:**
- Scarcity multiplier applied after edict bonuses but before crisis effects (power surge) — scarcity stacks multiplicatively with edicts, creating interesting interaction (e.g., Mineral Rush during mineral scarcity partially offsets the penalty)
- Only commodity resources (energy/minerals/food) affected — alloys and research are strategic, not commodity; scarcity on them would feel punishing rather than interesting
- Warning resource is pre-picked and stored as `_pendingScarcityResource` so the same resource from the warning is used when scarcity starts
- `_invalidateAllProductionCaches` is a new method separate from `_invalidatePlayerProductionCaches` — scarcity affects ALL players, not per-player
- Scarcity is galaxy-wide (not per-colony) to create shared economic weather that drives trade/diplomacy decisions

**Next:** Opening Hands starting draft (R40-2), military outposts (R40-3), or in-game chat + diplomacy pings (R40-4)

---

## Entry 41 — 2026-03-14 — NPC Raider Fleets (PvE Military Threat)

**Phase:** 5 (Fleets & Combat)
**Status:** Complete

**What was built:**
- NPC raider fleet spawning: every 1800-3000 ticks (3-5 min), a raider spawns at a random galaxy edge system and moves toward the nearest player colony via BFS pathfinding at 40 ticks/hop
- Defense platform build command: `buildDefensePlatform` costs 100 alloys, 200-tick build time, max 1 per colony, 50 HP / 15 attack per combat tick
- Combat resolution: auto-resolves over 5 ticks when raider arrives — platform deals 15/tick (kills 30 HP raider in 2 ticks), raider deals 8/tick (platform survives at 42 HP). Damaged platforms may lose to subsequent raiders
- Raid consequences: undefended colonies lose 2 random districts (disabled for 300 ticks) + 50 of each resource stolen
- VP integration: +5 VP per raider destroyed, tracked per player as lifetime count, shown in scoreboard
- Defense platform passive repair: +10 HP/month, capped at maxHp
- Raider-disabled district re-enable timers: districts auto-re-enable after 300 ticks
- Client: toast notifications for raiderSpawned/raiderDefeated/colonyRaided, event ticker entries, HUD raider count indicator, red diamond raider markers on galaxy map with smooth animation, game-over scoreboard "Raiders" column

**Files changed:**
- `server/game-engine.js` — 14 new constants (RAIDER_*, DEFENSE_PLATFORM_*), constructor init (_raiders, _nextRaiderTick, _raidersDestroyed), _randomRaiderInterval, _getEdgeSystems, _findNearestColonySystem, _processRaiderSpawning, _processRaiderMovement, _resolveRaiderArrival, _raidColony, _removeRaider, _processRaiderDisableTimers, _processDefensePlatformRepair, _processDefensePlatformConstruction methods, buildDefensePlatform command handler, raider VP in _calcVPBreakdown, raiders in getState/getPlayerState serialization, defensePlatform in _serializeColony (conditional), defensePlatform field on colony objects, updated tick() and module.exports
- `src/public/js/toast-format.js` — raiderSpawned/raiderDefeated/colonyRaided in TOAST_TYPE_MAP and formatGameEvent
- `src/public/js/app.js` — raider events in _formatTickerEvent, raider HUD indicator, updateRaiders call in galaxy view update, game-over scoreboard "Raiders" column
- `src/public/js/galaxy-view.js` — raider geometry/material, raiderMeshes/raiderPool tracking, updateRaiders function, raider animation in _animateShips, cleanup in destroy, exported in GalaxyView object
- `src/public/index.html` — raider-indicator span in status bar
- `src/tests/raider-fleets.test.js` — **new** 44 tests
- `devguide/design.md` — marked task complete
- `devguide/ledger.md` — this entry

**Tests:** 945 total (44 new: 4 constants, 4 initialization, 4 spawning, 1 movement, 5 defense platform construction, 6 combat resolution, 3 VP integration, 4 defense platform repair, 5 serialization, 1 resource theft limits, 5 edge cases, 1 toast format, 1 lifecycle integration). All passing.

**Key decisions:**
- Combat resolves instantly on arrival (not over multiple ticks in the tick loop) — simpler and avoids needing to track in-progress combats, matches the "auto-resolve over 5 ticks" spec by running 5 combat iterations in a single function call
- Platform attacks first each combat tick — the defender has advantage, so a full-HP platform always beats a single raider (15×2 = 30 kills raider, takes 8 damage = 42 HP remaining)
- Raider-disabled districts use `_raiderDisableTick` property on district objects to track when to re-enable, separate from crisis disable mechanism
- Defense platform is omitted from colony serialization when null to keep payload under 25KB at 8 players / 40 colonies
- Raiders visible to all players (not fog-gated) since they're a shared threat that all players should see and prepare for
- Edge systems for spawning are defined as systems with ≤2 hyperlane connections (galactic rim nodes)

**Next:** Opening Hands starting draft (R40-2), military outposts (R40-3), or in-game chat + diplomacy pings (R40-4)
