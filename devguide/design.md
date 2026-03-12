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
- [ ] Unit type definitions with stats (worker, soldier, archer, cavalry)
  - HP, attack damage, attack speed, armor, move speed, attack range
  - Production cost (gold, wood, time)
  - Supply cost
- [ ] Attack command (right-click enemy unit)
  - Server-side damage calculation
  - Attack cooldown
  - Range checking (melee vs ranged)
- [ ] Auto-attack nearby enemies
  - Aggro radius per unit type
  - Priority targeting (closest, lowest HP)
- [ ] Unit death
  - Death animation/fade
  - Remove from game state
  - Notify all players
- [ ] Formation movement
  - Units spread out around target point
  - Avoid stacking on same tile
- [ ] Line of sight / fog of war
  - Per-player visibility map
  - Revealed/fog/hidden states
  - Only send visible units to each player

### Phase 4: Resources & Economy
- [ ] Resource node world objects (gold mines, trees, stone quarries)
  - Placed on map at game init
  - Finite resource amounts
  - Visual depletion states
- [ ] Worker gathering
  - Assign worker to resource node
  - Gathering animation and timer
  - Auto-return to nearest town hall / drop-off
  - Resource increment on delivery
- [ ] Building construction
  - Building placement UI (ghost building, valid/invalid placement)
  - Construction progress bar
  - Worker required for construction
  - Cost deducted on placement start
- [ ] Building types
  - Town Hall: drop-off point, produces workers
  - Barracks: produces soldiers, archers
  - Farm: increases supply cap
  - Tower: static defense, ranged attack
  - Wall: blocking terrain piece
- [ ] Unit production
  - Queue system per building
  - Production timer
  - Supply check before queuing
  - Rally point for produced units

### Phase 5: Multiplayer Polish
- [ ] Server-authoritative command validation
  - Verify unit ownership on every command
  - Verify building ownership
  - Verify resource sufficiency
  - Rate limiting per player
- [ ] Player disconnect handling
  - Grace period for reconnection
  - AI takeover option
  - Surrender on timeout
- [ ] Spectator mode
  - Join a running game as observer
  - Full map visibility
  - No commands allowed
- [ ] Game result recording
  - Win/loss/draw determination
  - Post-game stats (units killed, resources gathered, buildings built)
  - Return to lobby after game ends

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
- [ ] Tech tree / upgrades
  - Research at buildings
  - Unlock advanced units and abilities
  - Stat upgrades (attack, armor, speed)
- [ ] Special abilities per unit type
  - Charge (cavalry)
  - Heal (priest)
  - Siege (catapult)
- [ ] Win condition options
  - Annihilation (destroy all enemy buildings)
  - Regicide (kill enemy king unit)
  - Score-based with time limit
  - Custom objectives

## Conventions

- Server modules: plain `module.exports`, no dual-export
- Client modules: IIFE with `window.*` for browser, `module.exports` for Node.js tests
- Tests: `node:test` + `node:assert` (Node.js built-in)
- All game state is server-authoritative
- Commands: client sends intent, server validates and executes
- State broadcast: server sends full state each tick (optimize later with deltas)
- Shared rendering code from IsometricJS: projection.js math
