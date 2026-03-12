# ColonyGame — Project Guide

Isometric multiplayer RTS game. Players create rooms, configure settings, wait for opponents, then launch real-time strategy matches. Built on the rendering foundation and shared assets from IsometricJS.

## Quick Start

```bash
npm install
npm run dev          # Starts static server (4000) + game server (4001)
npm test             # Runs all tests
```

- Static file server: `http://localhost:4000` (`src/dev-client-server.js`)
- WebSocket game server: `ws://localhost:4001` (`server/server.js`)
- Shared assets fallback: `../IsometricJS/src/public/assets/`

## Running Tests

Uses Node.js built-in test runner (`node:test` + `node:assert`).

```bash
npm test    # Runs all tests in src/tests/
```

## Architecture

### Two Servers

| Server | File | Port | Purpose |
|--------|------|------|---------|
| Static | `src/dev-client-server.js` | 4000 | Serves `src/public/`, falls back to IsometricJS assets |
| Game | `server/server.js` | 4001 | WebSocket game server, room management, tick-based game loop |

### Server Modules

| Module | Purpose |
|--------|---------|
| `server/server.js` | WebSocket server, room/game lifecycle, message routing |
| `server/room-manager.js` | Room CRUD, player tracking, ready states, launch validation |
| `server/game-engine.js` | RTS game tick loop, unit movement, buildings, player states |
| `server/config.js` | Environment-driven configuration |

### Client Modules (`src/public/js/`)

| Module | Purpose |
|--------|---------|
| `projection.js` | Isometric math (adapted from IsometricJS): worldToScreen, screenToWorld, zoom |
| `lobby.js` | Room list rendering, player list, chat messages |
| `app.js` | Main client: WebSocket connection, screen management, game rendering, input |

## Network Protocol

**Client → Server:**
- `setName` — set display name
- `createRoom` — create a new room (name, maxPlayers, map)
- `joinRoom` — join existing room by ID
- `leaveRoom` — leave current room
- `toggleReady` — toggle ready state
- `launchGame` — host launches game (requires all non-host ready, >= 2 players)
- `gameCommand` — in-game command (moveUnits, etc.)
- `chat` — chat message in room

**Server → Client:**
- `welcome` — connection established (clientId, displayName)
- `nameSet` — name confirmed
- `roomList` — list of all rooms (sent to lobby players)
- `roomJoined` — successfully joined/created a room
- `roomUpdate` — room state changed (player join/leave/ready)
- `roomLeft` — left room, back to lobby
- `gameInit` — game starting (map, units, buildings, players, yourId)
- `gameState` — tick update (units, buildings, players)
- `chat` — chat message from another player
- `error` — error message

## Game Flow

1. Player enters name → lobby screen
2. Player creates or joins a room → room screen
3. Players ready up, host launches → game screen
4. Server creates GameEngine, sends `gameInit` to all players
5. Server ticks at 10Hz, broadcasts `gameState` each tick
6. Players send `gameCommand` messages (moveUnits, etc.)
7. Game ends when win condition met → back to lobby

## Shared Assets from IsometricJS

The static file server falls back to `../IsometricJS/src/public/assets/` when a requested asset isn't found locally. Available:

- **Tiles**: 233 isometric terrain tiles (56x56 PNG) in `assets/tiles/`
- **Sprites**: 28 character types with 8-direction animations in `assets/sprites/`
- **Props**: 172 isometric props in `assets/props/`

## Design Document & Ledger

- `devguide/design.md` — Full implementation roadmap with phases and task checklists
- `devguide/ledger.md` — Development log tracking what each automation iteration built

## Automation

### Scripts

```bash
./autopilot-rts.sh              # Run 1 development iteration
./autopilot-rts.sh -n 3         # Run 3 iterations
./autopilot-rts.sh --dry-run    # Analyze only, don't implement
./autopilot-rts.sh --focus rendering  # Focus on a specific area
```

### Skills

| Skill | Invocation | Purpose |
|-------|-----------|---------|
| `rts-develop` | `/rts-develop [focus]` | Pick next task from design.md, implement it, test, commit, update ledger |
| `rts-status` | `/rts-status` | Report current project state, what's done, what's next |
| `game-designer` | `/game-designer [focus]` | Analyze game from a design/playstyle perspective, recommend improvements |

## Key Constants

| Constant | Value | Location |
|----------|-------|----------|
| TICK_RATE | 10 Hz (100ms) | server/config.js |
| MAX_ROOMS | 20 | server/config.js |
| MAX_PLAYERS_PER_ROOM | 8 | server/config.js |
| Map size | 50x50 tiles | game-engine.js |
| Starting gold | 200 | game-engine.js |
| Starting wood | 100 | game-engine.js |
| Starting stone | 50 | game-engine.js |
| Starting workers | 3 | game-engine.js |
| Worker speed | 2 tiles/sec | game-engine.js |

## Conventions

- No build step or bundler — plain JS with `<script>` tags
- Client modules use IIFE wrapping for browser, `module.exports` for Node.js
- Server modules are plain `module.exports`
- Tests use `node:test` + `node:assert`
- All game state is server-authoritative
- Isometric projection: `sx = originX + (worldX - worldY) * 32`, `sy = originY + (worldX + worldY) * 16`

## File Layout

```
ColonyGame/
  server/
    server.js              # WebSocket game server
    room-manager.js        # Room CRUD & player tracking
    game-engine.js         # RTS game tick loop & state
    config.js              # Server configuration
  src/
    dev-client-server.js   # Static file server + asset fallback
    public/
      index.html           # Entry point
      css/style.css        # UI styles
      js/
        app.js             # Main client (connection, rendering, input)
        lobby.js           # Lobby/room UI helpers
        projection.js      # Isometric math (from IsometricJS)
      assets/              # Local assets (falls back to IsometricJS)
    tests/
      room-manager.test.js
      game-engine.test.js
      server-integration.test.js
  devguide/
    design.md              # Implementation roadmap
    ledger.md              # Development log
  .claude/skills/          # Automation skills
  autopilot-rts.sh         # Shell automation script
  autopilot-rts.ps1        # PowerShell automation script
```
