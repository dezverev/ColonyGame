# ColonyGame — Design & Implementation Roadmap

Isometric multiplayer space colony 4X game. Players found colonies on alien worlds, research technology, build fleets, explore the galaxy, and compete or cooperate. Rendered with Three.js in isometric 3D. Inspired by Stellaris.

## Architecture

- **Static file server** (port 4000): `src/dev-client-server.js` — serves client files
- **WebSocket game server** (port 4001): `server/server.js` — room management, game state, tick loop
- **Client**: Vanilla JS + Three.js — isometric colony view (primary), 3D galaxy map, system view
- **Rendering**: Three.js OrthographicCamera for isometric, PerspectiveCamera for galaxy/system views

## Phases

### Phase 1: Foundation Pivot
- [ ] Add Three.js dependency (CDN link in index.html)
- [ ] Replace Canvas 2D renderer with Three.js scene setup: create Scene, OrthographicCamera (isometric angle: 35.264° pitch, 45° yaw), WebGLRenderer. Initialize on game start, run requestAnimationFrame loop
- [ ] Isometric camera controls: scroll-wheel zoom (adjust ortho frustum), middle-mouse drag to pan, arrow keys to pan. Clamp zoom to min/max bounds. Camera always maintains isometric angle
- [ ] Basic colony terrain: generate a hex or square grid (16x16) of ground tiles using Three.js PlaneGeometry or BoxGeometry with basic color materials. Each tile represents a district slot. Render with slight elevation variation for visual interest
- [ ] Refactor game-engine.js from RTS to colony 4X: remove unit movement/combat, add colony state (districts[], buildings[], pops, resources), planet properties (size, type, habitability). Keep tick loop and room integration
- [ ] New resource system in game-engine.js: track per-player resources {energy, minerals, food, alloys, research: {physics, society, engineering}, influence}. Calculate production/consumption each tick based on colony districts and buildings. Starting resources: 100 energy, 200 minerals, 50 food, 50 alloys, 100 influence
- [ ] Update network protocol: replace moveUnits/gameCommand with colony commands (buildDistrict, buildBuilding, demolish). Server validates ownership, resources, available slots. Client sends command, server processes on next tick
- [ ] Basic resource HUD: display current resources and net income (per-month equivalent) in a top bar. Update each tick from gameState
- [ ] Update all tests: remove RTS unit/combat tests, add colony creation, resource calculation, district building, protocol validation tests. Minimum 15 tests covering the new systems
- [ ] Placeholder colony rendering: render districts as colored 3D boxes on the grid (green=agriculture, yellow=energy, gray=mining, blue=industrial). Buildings as taller boxes on building slots. Show player's colony on game start

### Phase 2: Colony Management
- [ ] District system: 6 district types — Housing (provides housing for 5 pops, costs 50 minerals), Generator (produces 4 energy, costs 75 minerals), Mining (produces 4 minerals, costs 75 minerals), Agriculture (produces 6 food, costs 50 minerals), Industrial (produces 3 alloys, costs 100 minerals 25 energy), Research (produces 3 research each type, costs 100 minerals 50 energy). Districts occupy grid slots. Max districts = planet size (8-20). Build time: 180 ticks (18 seconds)
- [ ] Population system: pops live in housing (1 pop per housing unit). Pops work district jobs (1 pop per district). Unemployed pops produce 1 research each. Pop growth: +1 pop every 600 ticks (1 minute) if food surplus > 0. Growth halts if food deficit. Pops consume 1 food each per month-equivalent (100 ticks). If food deficit, random pop dies every 200 ticks
- [ ] Building system: buildings occupy building slots (separate from district grid). Unlock building slots at pop thresholds (slot 1 at 5 pops, slot 2 at 10, etc., max 12 slots). Building types: Administrative Center (capital building, +2 influence, cannot be demolished), Research Lab (+5 physics research, 150 minerals), Engineering Bay (+5 engineering research, 150 minerals), Cultural Center (+5 society research, 150 minerals), Hydroponics Bay (+10 food, 100 minerals), Alloy Foundry (+5 alloys, 150 minerals 50 energy), Civilian Shipyard (enables colony ship production, 200 minerals 100 alloys)
- [ ] Colony overview UI panel: show colony name, planet type, district grid with built/available slots, building slots, pop count and jobs, local resource production breakdown. Click district slot to build, click building slot to build. Show construction progress bars
- [ ] Colony list sidebar: list all player colonies with summary (name, pops, production). Click to switch colony view. Highlight capital colony
- [ ] Construction queue: each colony has a build queue (max 3). Building takes time based on type. Show queue in colony panel with progress and cancel buttons

### Phase 3: Galaxy & Exploration
- [ ] Procedural galaxy generation: on game start, generate N star systems (small=50, medium=100, large=200) as 3D points. Use Poisson disc sampling for even distribution. Connect nearby systems with hyperlanes (Delaunay triangulation, then prune to avg 3-4 connections per system). Each system has: name (generated), star type (yellow/red/blue/white), 1-6 planets
- [ ] Planet generation per system: each planet has: orbit slot (1-6), size (8-20 district slots), type (Continental, Ocean, Arctic, Desert, Arid, Tropical, Barren, Molten, Gas Giant), habitability (0-100% based on type — Continental/Ocean/Tropical 80%+, Arctic/Desert/Arid 60%, Barren 0%, Gas Giant 0%). Resource modifiers per type (e.g., Desert = +minerals, Ocean = +food, Barren = +minerals but uninhabitable). Only habitable planets (>20% habitability) can be colonized
- [ ] Galaxy map view (Three.js): render star systems as glowing point sprites or small sphere meshes, colored by star type. Render hyperlanes as lines between connected systems. Player territory shown as colored regions (convex hull or Voronoi). Camera: perspective, orbit controls, zoom to galaxy/system level. Click system to select, double-click to open system view
- [ ] System view: show star at center, planets on orbital rings. Click planet to see details (type, size, habitability, resources). If colonized, click to open colony view. Show any starbases or fleets in system
- [ ] Fleet fundamentals: science ship (surveys systems, discovers anomalies), colony ship (founds new colonies, consumed on use), construction ship (builds starbases). Ships move along hyperlanes between systems — travel time based on distance (default 5 seconds per hyperlane hop). Fleet movement shown on galaxy map as animated dots along hyperlane paths
- [ ] System surveying: unsurveyed systems appear as "?" on galaxy map. Send science ship to survey — takes 10 seconds per planet in system. Surveying reveals planet details (type, size, habitability, resources). May discover anomalies (20% chance per planet — placeholder for now, just bonus resources)
- [ ] Colonization: build colony ship at Civilian Shipyard (cost: 200 minerals 100 food 100 influence). Send colony ship to habitable surveyed planet. On arrival, colony ship is consumed, new colony founded with 2 starting pops, Administrative Center auto-built. Colony appears in colony list. System claimed for player
- [ ] Starbase construction: send construction ship to a system to build a starbase (cost: 200 minerals 100 alloys). Starbases claim uncolonized systems for the player. Starbases can be upgraded later for defense/economy. One starbase per system

### Phase 4: Technology & Research
- [ ] Tech tree structure: three parallel tracks (Physics, Society, Engineering). Each track has 5 tiers. Each tier has 3-4 tech options. Player researches one tech per track at a time. Research cost scales per tier (tier 1: 500, tier 2: 1000, tier 3: 2000, tier 4: 4000, tier 5: 8000). Research points per tick reduce remaining cost. When cost reaches 0, tech is complete
- [ ] Physics techs: Tier 1 — Improved Power Plants (+25% Generator output), Laser Weapons I (+10% ship weapon damage), Sensor Arrays (+2 survey speed). Tier 2 — Advanced Reactors (+50% Generator output), Laser Weapons II (+20% damage), Hyperspace Mapping (+25% fleet speed). Tier 3-5 — increasingly powerful versions and new unlocks
- [ ] Society techs: Tier 1 — Hydroponics (+25% Agriculture output), Colonial Bureaucracy (+1 building slot all colonies), Frontier Medicine (+25% pop growth). Tier 2 — Gene Crops (+50% Agriculture output), Planetary Administration (+2 building slots), Galactic Ambitions (+50 influence cap). Tier 3-5 — advanced versions
- [ ] Engineering techs: Tier 1 — Improved Mining (+25% Mining output), Alloy Smelting (+25% Industrial output), Corvette Hulls (unlock corvettes). Tier 2 — Deep Mining (+50% Mining output), Advanced Alloys (+50% Industrial output), Destroyer Hulls (unlock destroyers). Tier 3-5 — cruisers, battleships, mega-structures
- [ ] Research UI: panel showing three tracks side by side, current research per track with progress bar, available techs to pick when current completes, tech details on hover (cost, effect, prerequisites). Locked techs shown grayed with prerequisite chain
- [ ] Tech effects system: when a tech completes, apply its modifiers to the player's state. Modifiers are multiplicative (e.g., +25% Generator output means all generator districts produce 5 instead of 4). Track active modifiers per player. Send `researchComplete` message to client with new options

### Phase 5: Fleets & Combat
- [ ] Ship classes: Corvette (cost: 50 alloys, 30 HP, 10 firepower, 5 speed, 1 fleet cap), Destroyer (100 alloys, 80 HP, 30 firepower, 4 speed, 2 fleet cap), Cruiser (200 alloys, 200 HP, 80 firepower, 3 speed, 4 fleet cap), Battleship (400 alloys, 500 HP, 200 firepower, 2 speed, 8 fleet cap). Each ship class must be researched first (corvettes available by default)
- [ ] Fleet management: group ships into fleets. Fleet speed = slowest ship. Fleet cap starts at 20 (from starbase), increased by techs and starbases. Fleets move between systems along hyperlanes. Fleet UI: list of fleets with composition, location, orders. Click to select, right-click system to move
- [ ] Shipyard system: build military ships at starbases with shipyard module (upgrade cost: 100 alloys). Queue up to 5 ships. Build time: Corvette 10s, Destroyer 20s, Cruiser 35s, Battleship 60s. Ships spawn at starbase system
- [ ] Space combat resolution: when hostile fleets occupy same system, combat begins. Each tick: each ship fires at random enemy ship (weighted by fleet cap — bigger ships draw more fire). Damage = firepower vs HP. Ships destroyed at 0 HP. Combat continues until one side is eliminated or retreats. Retreating fleet moves to adjacent friendly system at half speed. Send `combatResult` to involved players with losses
- [ ] Starbase defense: starbases have base combat stats (100 HP, 40 firepower). Upgraded starbases are stronger. Starbases fight alongside defending fleets. Destroying enemy starbase removes their system claim
- [ ] Military UI: fleet list panel, fleet composition view, ship build queue at starbases, combat log/notifications. "Fleet destroyed" / "System under attack" alerts

### Phase 6: Diplomacy & Interaction
- [ ] Diplomatic stances: each player has a stance toward every other player — Neutral (default), Friendly, Rival, War. Changing stance costs influence (10 to change). War can only be declared from Rival stance (must be Rival for 60 seconds first). Peace can be proposed after 120 seconds of war
- [ ] Communication: players can send diplomatic messages to each other (text + optional trade offer). Messages appear in a diplomacy inbox panel
- [ ] Trade system: players can propose trades — exchange resources, systems, or treaties. Both players must accept. Active trades last until cancelled or war declared. Trade routes: +10% energy income between trading partners
- [ ] Alliances: Friendly players can form alliances (costs 50 influence each). Allied players share vision, cannot attack each other, and are pulled into each other's wars. Max 1 alliance per player (with 1 other player in 2-player, or faction-based in larger games)
- [ ] War & conquest: when at war, fleets can attack enemy systems. Conquering a colony (destroy starbase + have fleet in system for 30 seconds) transfers it to the attacker. Conquered pops are unhappy (-50% output for 120 seconds). War exhaustion builds over time — after 300 seconds, forced peace option becomes available
- [ ] Diplomacy UI: player list with stances, diplomacy inbox, trade proposal panel, alliance status, war/peace controls

### Phase 7: Events, Polish & Win Conditions
- [ ] Anomaly events: when surveying, anomalies trigger event chains. 10 unique events with choices: e.g., "Ancient Ruins" (choose: excavate for +500 research or preserve for +50 influence), "Derelict Ship" (salvage for free corvette or study for +200 engineering research), "Alien Artifacts" (+research or +alloys). Events add narrative flavor and meaningful choices
- [ ] Random galaxy events: every 120 seconds, chance of galaxy-wide event. Asteroid storm (random system loses 1 mining district), Solar flare (random system loses power for 30 seconds), Resource boom (random unclaimed system gets bonus resources). Notification to all players
- [ ] Planet biome rendering: distinct Three.js materials/textures per planet type. Continental (green/blue), Ocean (deep blue), Arctic (white/pale blue), Desert (tan/orange), Tropical (deep green), Arid (brown), Barren (gray). Visible in colony view as ground material and in system view as planet color
- [ ] Visual effects: fleet warp-in/warp-out animations, combat laser/explosion particles, building construction scaffolding animation, research complete flash, colony founding ceremony effect. Use Three.js particle systems and shader materials
- [ ] Sound design: ambient space music, UI click sounds, combat sounds, notification chimes, warp drive sound for fleet movement. Use Web Audio API
- [ ] Win conditions (selectable in room settings): Domination (control 60% of colonizable planets), Research Victory (complete all tier 5 techs in all 3 tracks), Economic Victory (accumulate 10000 of each basic resource simultaneously), Diplomatic Victory (be allied with or have friendly status with all surviving players for 120 continuous seconds). Default: Domination
- [ ] Post-game screen: on `gameOver`, show overlay with winner, victory type, per-player stats (colonies, techs researched, ships built, ships lost, resources gathered, pops), timeline graph of territory over time. "Return to Lobby" button
- [ ] Player disconnect handling: on disconnect, start 60-second grace period. AI takes over basic colony management (auto-queue food if deficit, continue existing research). If player reconnects, restore session. If timeout, colonies continue on auto-pilot as "fallen empire" (passive, doesn't expand)

## Conventions

- Server modules: plain `module.exports`, no dual-export
- Client modules: IIFE with `window.*` for browser, `module.exports` for Node.js tests
- Tests: `node:test` + `node:assert` (Node.js built-in)
- All game state is server-authoritative
- Commands: client sends intent, server validates and executes
- State broadcast: server sends colony/fleet updates each tick (optimize later with deltas)
- Three.js for all rendering — no 2D canvas, no sprites
- Isometric colony view: OrthographicCamera at 35.264° pitch, 45° yaw
