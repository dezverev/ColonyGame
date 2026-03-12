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
