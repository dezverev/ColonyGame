# ColonyGame — Project Guide

Isometric multiplayer space colony 4X game. Players found colonies on alien worlds, research technology, build fleets, explore the galaxy, and compete or cooperate with other players. Inspired by Stellaris, rendered with Three.js in isometric 3D. Built on multiplayer WebSocket infrastructure.

## Quick Start

```bash
npm install
npm run dev          # Starts static server (4000) + game server (4001)
npm test             # Runs all tests
```

- Static file server: `http://localhost:4000` (`src/dev-client-server.js`)
- WebSocket game server: `ws://localhost:4001` (`server/server.js`)

## Running Tests

Uses Node.js built-in test runner (`node:test` + `node:assert`).

```bash
npm test    # Runs all tests in src/tests/
```

## Architecture

### Two Servers

| Server | File | Port | Purpose |
|--------|------|------|---------|
| Static | `src/dev-client-server.js` | 4000 | Serves `src/public/` |
| Game | `server/server.js` | 4001 | WebSocket game server, room management, game loop |

### Server Modules

| Module | Purpose |
|--------|---------|
| `server/server.js` | WebSocket server, room/game lifecycle, message routing |
| `server/room-manager.js` | Room CRUD, player tracking, ready states, launch validation |
| `server/game-engine.js` | Colony 4X game loop, galaxy state, colony management, fleet movement |
| `server/config.js` | Environment-driven configuration |

### Client Modules (`src/public/js/`)

| Module | Purpose |
|--------|---------|
| `app.js` | Main client: WebSocket connection, screen management, input |
| `lobby.js` | Room list rendering, player list, chat messages |
| `renderer.js` | Three.js scene management, camera, rendering pipeline |
| `colony-view.js` | Isometric colony surface view — buildings, districts, terrain |
| `galaxy-view.js` | 3D galaxy map — star systems, hyperlanes, fleet markers |
| `system-view.js` | System orbital view — planets, stations, asteroid belts |
| `ui.js` | HUD panels — resources, research, production, diplomacy |

### Rendering — Three.js

The game uses Three.js for all rendering across three views:

| View | Camera | Purpose |
|------|--------|---------|
| Colony (primary) | Orthographic (isometric angle) | Surface buildings, districts, pops, terrain |
| Galaxy Map | Perspective | Star systems, hyperlanes, territory, fleet movements |
| System | Perspective/Ortho | Planets, orbital stations, asteroid belts |

Isometric projection is achieved with a Three.js OrthographicCamera positioned at a ~35.264° pitch and 45° yaw, giving the classic isometric look with real 3D geometry.

## Network Protocol

**Client → Server (Lobby):**
- `setName` — set display name
- `createRoom` — create a new room (name, maxPlayers, galaxySettings)
- `joinRoom` — join existing room by ID
- `leaveRoom` — leave current room
- `toggleReady` — toggle ready state
- `launchGame` — host launches game
- `chat` — chat message in room

**Client → Server (In-Game Commands):**
- `buildDistrict` — build a district on a colony (colonyId, districtType)
- `buildBuilding` — build a building on a colony (colonyId, buildingType, slot)
- `demolish` — remove a district or building
- `setResearch` — choose tech to research (techId)
- `buildShip` — queue ship construction at a starbase (stationId, shipType)
- `moveFleet` — order fleet to a destination system (fleetId, targetSystemId)
- `surveySystem` — order a science ship to survey (fleetId, systemId)
- `colonize` — send colony ship to found a colony (fleetId, planetId)
- `setDiplomacy` — change diplomatic stance toward a player (targetPlayerId, stance)
- `tradeOffer` — propose a trade deal
- `setGameSpeed` — host changes game speed (speed: 1-5)
- `togglePause` — host pauses/unpauses

**Server → Client:**
- `welcome` — connection established (clientId, displayName)
- `nameSet` — name confirmed
- `roomList` — list of all rooms
- `roomJoined` — successfully joined/created a room
- `roomUpdate` — room state changed
- `roomLeft` — left room, back to lobby
- `gameInit` — game starting (galaxy, systems, colonies, fleets, techTree, yourPlayerId)
- `gameState` — periodic state update (resources, colonies, fleets, diplomacy)
- `colonyUpdate` — colony state changed (buildings, pops, production)
- `researchComplete` — technology researched, new options available
- `fleetUpdate` — fleet position/status changed
- `combatResult` — space battle outcome
- `diplomacyEvent` — diplomatic action from another player
- `eventOccurred` — anomaly discovered, random event triggered
- `gameOver` — win condition met
- `chat` — chat message
- `error` — error message

## Game Flow

1. Player enters name → lobby screen
2. Player creates or joins a room → room screen (configure galaxy size, AI, etc.)
3. Players ready up, host launches → game starts
4. Server generates galaxy, assigns starting systems, sends `gameInit`
5. Server ticks at configurable speed, broadcasts `gameState` periodically
6. Players manage colonies, research tech, build fleets, explore, fight
7. Game ends when win condition met → results screen → back to lobby

## 4X Core Loop

| Phase | Player Actions |
|-------|---------------|
| **Explore** | Send science ships to survey unknown systems, discover anomalies and habitable worlds |
| **Expand** | Colonize habitable planets, build starbases to claim systems |
| **Exploit** | Build districts and buildings on colonies, optimize resource production, research technology |
| **Exterminate** | Build military fleets, engage in space combat, conquer enemy colonies |

## Resources

| Resource | Purpose | Primary Source |
|----------|---------|---------------|
| Energy | Powers buildings, maintenance costs, trade | Generator districts, solar buildings |
| Minerals | Construction, district/building costs | Mining districts, asteroid mining |
| Food | Population growth and maintenance | Agriculture districts, hydroponics |
| Alloys | Ship construction, advanced buildings | Industrial districts, foundries |
| Research | Technology progression (Physics/Society/Engineering) | Research buildings, labs |
| Influence | Claiming systems, edicts, diplomacy actions | Capital building, civic choices |

## Key Constants

| Constant | Value | Location |
|----------|-------|----------|
| TICK_RATE | 10 Hz (100ms) | server/config.js |
| MAX_ROOMS | 20 | server/config.js |
| MAX_PLAYERS_PER_ROOM | 8 | server/config.js |
| Default galaxy size | Small (50 systems) | game-engine.js |
| Starting energy | 100 | game-engine.js |
| Starting minerals | 200 | game-engine.js |
| Starting food | 50 | game-engine.js |
| Starting alloys | 50 | game-engine.js |
| Starting influence | 100 | game-engine.js |
| Starting pops | 8 | game-engine.js |
| Colony districts max | 16 per planet (size-dependent) | game-engine.js |
| Building slots | 6-12 per colony (pop-dependent) | game-engine.js |

## Design Document & Ledger

- `devguide/design.md` — Full implementation roadmap with phases and task checklists
- `devguide/ledger.md` — Development log tracking what each automation iteration built

## Automation

### Scripts

```bash
./autopilot.sh                    # Run 1 development iteration
./autopilot.sh -n 3               # Run 3 iterations
./autopilot.sh --dry-run           # Analyze only, don't implement
./autopilot.sh --focus colonies    # Focus on a specific area
```

### Skills

| Skill | Invocation | Purpose |
|-------|-----------|---------|
| `develop` | `/develop [focus]` | Pick next task from design.md, implement it, test, commit, update ledger |
| `status` | `/status` | Report current project state, what's done, what's next |
| `game-designer` | `/game-designer [focus]` | Analyze game from a design/playstyle perspective, recommend improvements |
| `perf` | `/perf [focus]` | Performance audit — profile server ticks, client FPS, memory, network payloads, apply fixes |
| `test` | `/test [focus]` | Test coverage audit — find gaps, write missing tests, validate edge cases, fix bugs found |
| `mcp-tool-maker` | `/mcp-tool-maker [focus]` | Create MCP tools for Claude Code — live game inspection, server control, design tracking |
| `ship` | `/ship [description]` | Commit changes, create branch, push, create PR, and merge — one-command ship-it workflow |

## Conventions

- No build step or bundler — vanilla JS with `<script>` tags + Three.js via CDN
- Three.js for all rendering (isometric colony, 3D galaxy map, system view)
- Client modules use IIFE wrapping for browser, `module.exports` for Node.js
- Server modules are plain `module.exports`
- Tests use `node:test` + `node:assert`
- All game state is server-authoritative
- Isometric view: Three.js OrthographicCamera at 35.264° pitch, 45° yaw

## File Layout

```
ColonyGame/
  server/
    server.js              # WebSocket game server
    room-manager.js        # Room CRUD & player tracking
    game-engine.js         # Colony 4X game loop & state
    config.js              # Server configuration
  src/
    dev-client-server.js   # Static file server
    public/
      index.html           # Entry point
      css/style.css        # UI styles
      js/
        app.js             # Main client (connection, screens, input)
        lobby.js           # Lobby/room UI helpers
        renderer.js        # Three.js scene, camera, render loop
        colony-view.js     # Isometric colony surface rendering
        galaxy-view.js     # 3D galaxy map rendering
        system-view.js     # System orbital view rendering
        ui.js              # HUD panels and overlays
      assets/              # Local assets (textures, models, etc.)
    tests/
      room-manager.test.js
      game-engine.test.js
      server-integration.test.js
  devguide/
    design.md              # Implementation roadmap
    ledger.md              # Development log
  .claude/skills/          # Automation skills
  autopilot.sh             # Shell automation script
  autopilot.ps1            # PowerShell automation script
```
