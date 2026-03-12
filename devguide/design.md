# RTSGame — Design & Implementation Roadmap

Isometric multiplayer RTS where players create rooms, set up games, and compete in real-time strategy battles.
Built on the rendering foundation and shared assets from IsometricJS.

## Architecture

- **Static file server** (port 4000): `src/dev-client-server.js` — serves client files, falls back to IsometricJS assets
- **WebSocket game server** (port 4001): `server/server.js` — room management, game state, tick loop
- **Client**: Vanilla JS, Canvas 2D (upgrade to WebGL later), isometric projection from IsometricJS
- **Shared assets**: Tiles, sprites, and props served from `../IsometricJS/src/public/assets/` as fallback

## Phases

### Phase 1: Foundation
- [x] Project scaffold (package.json, .gitignore, config)
- [x] Static file server with IsometricJS asset fallback
- [x] WebSocket game server
- [x] Room management (create, join, leave, list)
- [x] Player name entry
- [x] Lobby UI (room list, create room dialog)
- [x] Room view (player list, ready/unready, host controls)
- [x] Chat in rooms
- [x] Game launch flow (host launches when all ready)
- [x] Basic game engine with tick loop
- [x] Starting units and buildings per player
- [x] Unit movement commands
- [x] Unit tests for room-manager, game-engine
- [x] Integration tests for server WebSocket protocol

### Phase 2: Game View & Rendering
- [ ] Isometric ground tile rendering using Canvas 2D
  - Load tile PNGs from IsometricJS shared assets
  - Render a 50x50 grid of grass tiles
  - Frustum culling (only draw visible tiles)
- [ ] Camera controls
  - Arrow key panning
  - Edge-of-screen scroll
  - Middle-mouse drag panning (already started)
  - Smooth zoom with scroll wheel (already started)
- [ ] Replace placeholder unit diamonds with sprite rendering
  - Load sprite sheets from IsometricJS shared assets
  - Direction-based sprite selection
  - Idle/run animation states
- [ ] Replace placeholder building rectangles with proper isometric building rendering
  - Use IsometricJS Cube/Wall geometry patterns
  - Building footprints based on size
- [ ] Minimap improvements
  - Click-to-pan on minimap
  - Terrain color coding
- [ ] Selection improvements
  - Selection box visual feedback
  - Multi-select with Shift+click
  - Select-all of type with Ctrl+click
  - Double-click to select all of same type on screen

### Phase 3: Units & Combat
- [x] Expanded unit definitions with full stats in game-engine.js: worker (30 HP, 3 atk, 0 armor, 2.0 speed, 1 range, 1.5s cooldown, 50g 20w, 1 supply), soldier (60 HP, 10 atk, 2 armor, 1.5 speed, 1 range, 1.0s cooldown, 60g 20w, 1 supply), archer (40 HP, 8 atk, 0 armor, 1.8 speed, 5 range, 1.2s cooldown, 40g 50w, 1 supply), cavalry (70 HP, 12 atk, 1 armor, 3.5 speed, 1 range, 1.3s cooldown, 80g 30w, 2 supply). Add `armor`, `range`, `cooldown`, `cost`, `supplyCost`, `bonusVs` fields to unit defs
- [ ] Unit counter system: add `bonusVs` multipliers — soldiers deal 1.5x to archers, archers deal 1.5x to cavalry, cavalry deal 1.5x to soldiers, workers deal 0.5x to all military. Apply multiplier in damage calc as `max(1, (atk * bonusMultiplier) - target.armor)`
- [ ] Attack command: right-click enemy unit sends `attackUnit` command with `unitIds` and `targetUnitId`. Server validates ownership, sets unit state to 'attacking', unit moves toward target until within `range` tiles, then deals damage every `cooldown` seconds. If target moves out of range, pursue. If target dies, go idle
- [ ] Auto-attack nearby enemies: idle units scan for enemies within 6-tile aggro radius each tick. Acquire nearest enemy (prefer lowest HP if tied on distance). Set state to 'attacking' and engage. Units already attacking don't switch targets unless current target dies
- [ ] Unit death and removal: when HP <= 0, remove unit from game state Map, broadcast removal in next tick. Client shows 0.5s fade-out at last position. Award kill credit to attacking player for post-game stats
- [ ] Formation movement: when multiple units are given a move command, spread them in a grid pattern around the target point (1.2 tile spacing). Prevent stacking by offsetting each unit's final position. Closest units get closest positions
- [ ] Line of sight / fog of war: per-player visibility grid (50x50 booleans). Sight ranges: workers 7, soldiers 5, archers 8, cavalry 9, buildings 8, towers 10. Three states: visible (in LOS), revealed (previously seen — show terrain/buildings but not units), hidden (never seen — black). Server only includes units in `gameState` that are within the receiving player's vision. Client renders semi-transparent black overlay for revealed, opaque black for hidden

### Phase 4: Resources & Economy
- [ ] Resource node world objects on map: gold mines (1500 gold each, rendered as yellow squares), tree clusters (10 trees per cluster, 50 wood each tree, rendered as green circles), stone quarries (800 stone each, rendered as gray squares). Each player spawn gets 1 gold mine, 1 forest cluster, 1 stone quarry nearby. Map center gets 1 rich gold mine (3000 gold). Map edges get 2 extra stone quarries and 2 extra forest clusters. Store as `resourceNodes` Map in game-engine with `{id, type, x, y, amount, maxAmount}`
- [ ] Worker gathering: right-click resource node sends `gatherResource` command with `unitIds` and `nodeId`. Worker walks to node, gathers for 2 seconds (state: 'gathering'), picks up cargo (8 gold, 10 wood, or 5 stone per trip), walks to nearest town hall (state: 'returning'), deposits cargo (add to player resources), then auto-walks back to same node. If node depleted (amount <= 0), worker goes idle. Workers carry one resource type at a time
- [ ] Resource node depletion: subtract gathered amount from node on each pickup. When amount <= 0, remove node from map. Client shows visual depletion stages (full/half/quarter/empty) based on amount/maxAmount ratio. Depleted gold mines leave a "depleted mine" marker (cannot be gathered)
- [ ] Building construction: client sends `placeBuilding` command with `type`, `x`, `y`, `workerId`. Server validates: worker owned by player, sufficient resources, no collision with existing buildings/units. Deduct cost immediately. Create building with `progress: 0.0`. Assigned worker walks to site, increments progress each tick. Construction times: Town Hall 30s, Barracks 20s, Farm 10s, Tower 15s, Stable 20s, Wall 5s. When progress reaches 1.0, building becomes functional. Client shows ghost building during placement (green=valid, red=invalid), progress bar during construction
- [ ] Building types with costs: Town Hall (300g 200w, drop-off point, produces workers, +10 supply cap), Barracks (150g 100w, produces soldiers and archers), Stable (200g 150w, produces cavalry), Farm (50g 30w, +5 supply cap), Tower (100g 75s, static defense — 8 atk, 7 range, 2s cooldown, auto-attacks enemies), Wall (25g 25s, blocking terrain piece, 200 HP, 1x1 size)
- [ ] Unit production queue: click building to select it, show production panel with available unit buttons. Click unit button sends `produceUnit` command with `buildingId` and `unitType`. Server validates: building owned by player, building type can produce that unit, sufficient resources, supply available. Deduct cost, add to building's queue (max 5). Each tick decrements production timer. When timer hits 0, spawn unit at rally point (default: 2 tiles south of building). Rally point settable by right-clicking ground while building selected

### Phase 5: Multiplayer Polish
- [ ] Win condition — Annihilation: player is eliminated when they have zero buildings. Server checks each tick after a building is destroyed. Last player standing wins. On elimination: remove all remaining units for that player, send `playerEliminated` message to all. When only 1 player remains, send `gameOver` with `{winnerId, stats}`. Stats include: units killed, units lost, resources gathered, buildings built, buildings destroyed, game duration in ticks
- [ ] Post-game screen: on `gameOver` message, client shows overlay with winner name, per-player stats table, "Return to Lobby" button. Server sets room status to 'finished', cleans up GameEngine. Clicking return sends `leaveRoom`, returns to lobby
- [ ] Server-authoritative command validation: verify unit ownership on moveUnits/attackUnit/gatherResource, verify building ownership on produceUnit/setRallyPoint, verify resource sufficiency on placeBuilding/produceUnit, verify supply cap on produceUnit. Reject invalid commands silently (send error message to player). Rate limit: max 30 commands/second per player, drop excess
- [ ] Player disconnect handling: on WebSocket close, start 30-second grace period. If player reconnects within grace period, restore their session (resend gameInit + current gameState). If timeout expires, remove all player units/buildings (elimination). Send `playerDisconnected`/`playerReconnected` messages to room
- [ ] Spectator mode: join a running game as observer via `spectateGame` command. Spectators see full map (no fog), receive all gameState ticks, cannot send gameCommands. Spectator count shown in room list. Spectators auto-return to lobby on game end
- [ ] Move confirmation visual: on right-click move command, client draws a green circle at target position that fades out over 1 second. On attack command, draw red circle. Add "ping" effect on minimap at command location
- [ ] Under-attack alert: server sends `underAttack` event when a player's unit/building first takes damage from a new attacker. Client flashes minimap at attack location (red pulse), shows "Under attack!" text alert that fades after 3 seconds. Throttle to max 1 alert per 5 seconds per player

### Phase 6: Maps & Variety
- [ ] Map definitions (multiple maps)
  - Size, terrain layout, resource placement, spawn points
  - Symmetric maps for fairness
- [ ] Map selection in room settings
- [ ] Procedural map generation
  - Noise-based terrain
  - Guaranteed resource balance per spawn
- [ ] Terrain types
  - Grass (normal speed)
  - Forest (slow, provides wood)
  - Water (impassable)
  - Hills (elevation, defense bonus)

### Phase 7: Advanced Features
- [ ] Tech tree / upgrades: Town Hall researches Improved Gathering (+25% gather speed, 100g 100w, 30s), Barracks researches Forged Blades (+2 atk for soldiers/cavalry, 150g 75s, 25s) and Leather Armor (+1 armor for archers, 100g 50w, 20s), Stable researches Swift Steeds (+0.5 speed for cavalry, 100g 100w, 25s). Research uses production queue slot. Only one research per building at a time
- [ ] Special abilities per unit type: Cavalry Charge — active ability, 30s cooldown, unit dashes 4 tiles toward target dealing 2x damage on arrival. Priest (new unit, 60 HP, 1 atk, 0 armor, 1.5 speed, produced at Town Hall, 80g 60w): auto-heals nearest friendly unit within 5 tiles for 3 HP/sec, cannot attack. Catapult (new unit, 80 HP, 25 atk, 0 armor, 0.8 speed, 8 range, 3s cooldown, produced at Siege Workshop — new building 200g 150s): deals splash damage in 2-tile radius, 1.5x damage vs buildings, minimum range 3 tiles
- [ ] Win condition options selectable in room settings: Annihilation (destroy all enemy buildings — default), Regicide (each player gets a King unit at start, 150 HP, 5 atk, 3 armor — kill enemy King to eliminate them), Timed (15-minute match, score = units killed × 10 + buildings destroyed × 50 + resources gathered, highest score wins)
- [ ] Commander abilities: pre-match, each player picks 1 of 3 commanders. Each grants 3 abilities on cooldowns. Commander A "Warlord": Rally Cry (selected units +30% speed 10s, 90s CD), Forced March (selected units ignore terrain penalties 15s, 120s CD), War Horn (all military units +3 atk 8s, 180s CD). Commander B "Economist": Supply Drop (+150 gold instantly, 90s CD), Overtime (all workers +50% gather speed 20s, 120s CD), Emergency Reserves (+200 of each resource, 180s CD). Commander C "Fortifier": Quick Walls (place 5 free walls instantly, 90s CD), Garrison (selected building gains 2x HP 20s, 120s CD), Watchtower Network (all towers +5 range 15s, 180s CD)

## Conventions

- Server modules: plain `module.exports`, no dual-export
- Client modules: IIFE with `window.*` for browser, `module.exports` for Node.js tests
- Tests: `node:test` + `node:assert` (Node.js built-in)
- All game state is server-authoritative
- Commands: client sends intent, server validates and executes
- State broadcast: server sends full state each tick (optimize later with deltas)
- Shared rendering code from IsometricJS: projection.js math
