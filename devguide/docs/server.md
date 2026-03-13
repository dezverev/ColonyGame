# server.js

> WebSocket game server: client connections, lobby operations, in-game command routing.

**File:** `server/server.js`
**Last verified:** 2026-03-12

## Overview

WebSocket game server that manages client connections, lobby operations, and in-game command routing. Wraps an HTTP server (with a `/health` endpoint) and a `ws` WebSocketServer. Instantiates a `RoomManager` for lobby state and creates per-room `GameEngine` instances when games launch. Broadcasts are per-player filtered via the engine's `onTick` callback.

## Public API

### `startServer(options?) -> Promise<{ port, close }>`

Starts the HTTP + WebSocket server.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `options.port` | number | `config.GAME_PORT` (4001) | Port to listen on |
| `options.log` | boolean | `true` | Enable console logging |

Returns a promise resolving to:
- `port` — actual listening port (useful when `0` is passed)
- `close()` — stops all game engines, terminates all WebSocket clients, closes servers

## Internal State

| Variable | Type | Purpose |
|----------|------|---------|
| `clients` | `Map<clientId, ws>` | All connected WebSocket clients |
| `games` | `Map<roomId, GameEngine>` | Active game engines keyed by room |
| `rooms` | `RoomManager` | Lobby room management |
| `nextClientId` | number | Auto-incrementing client ID counter |

## Protocol Messages Handled

### Client -> Server (Lobby)

| Message | Key Fields | Purpose |
|---------|-----------|---------|
| `setName` | `name` (string, max 20 chars) | Set player display name |
| `createRoom` | `name`, `maxPlayers`, `map`, `practiceMode`, `matchTimer`, `galaxySize` | Create a new room; sender becomes host |
| `joinRoom` | `roomId` | Join existing room by ID |
| `leaveRoom` | (none) | Leave current room; cleans up engine if room empties |
| `toggleReady` | (none) | Toggle ready state in room |
| `launchGame` | (none) | Host launches the game; creates `GameEngine`, sends `gameInit` to all players |
| `chat` | `text` (string, max 200 chars) | Chat message broadcast to room |

### Client -> Server (In-Game)

| Message | Key Fields | Purpose |
|---------|-----------|---------|
| `buildDistrict` | `colonyId`, `districtType` | Queue district construction |
| `demolish` | `colonyId`, `districtId` | Remove district or cancel queued item |
| `setResearch` | `techId` | Set active research for a tech track |
| `buildColonyShip` | `colonyId` | Queue colony ship construction |
| `sendColonyShip` | `shipId`, `targetSystemId` | Dispatch colony ship to a system |
| `buildScienceShip` | `colonyId` | Queue science ship construction |
| `sendScienceShip` | `shipId`, `targetSystemId` | Dispatch science ship to survey a system |
| `setGameSpeed` | `speed` (1-5) | Change tick rate (host-only in multiplayer, any player in practice) |
| `togglePause` | (none) | Pause/unpause game (host-only in multiplayer) |

### Server -> Client

| Message | Key Fields | Purpose |
|---------|-----------|---------|
| `welcome` | `clientId`, `displayName` | Sent on connection |
| `nameSet` | `displayName` | Name change confirmed |
| `roomList` | `rooms` | Full room listing (sent to players not in a room) |
| `roomJoined` | `room` | Sent to player who joined/created a room |
| `roomUpdate` | `room` | Room state changed (broadcast to room members) |
| `roomLeft` | (none) | Confirmation of leaving a room |
| `gameInit` | full game state + `galaxy` + `yourId` | Game start payload; galaxy data sent once |
| `gameState` | per-player filtered state | Periodic state update (~3.3 Hz) |
| `gameEvent` | varies by `eventType` | Events (construction complete, survey, anomaly, etc.) |
| `speedChanged` | `speed`, `speedLabel`, `paused` | Game speed or pause state changed |
| `gameOver` | `winner`, `scores`, `finalTick` | Match ended |
| `chat` | `from`, `text` | Chat message |
| `error` | `message` | Error response |

## Dependencies

- **Requires:** `ws`, `http`, `./room-manager.js`, `./game-engine.js`, `./config.js`
- **Used by:** Entry point — run directly or imported for testing

## Internal Notes

- **gameInit optimization**: The full `gameInit` payload is serialized once as JSON. Per-player `yourId` is injected by string-splicing into the trailing `}` rather than re-serializing the entire galaxy per player.
- **Game engine lifecycle**: Engines are created on `launchGame` and cleaned up on room deletion (last player leaves or disconnects). The `onGameOver` callback also removes the engine from the `games` map.
- **Disconnect handling**: When a client disconnects, `rooms.removePlayer()` is called. If the room is deleted (last player), the associated engine is stopped and cleaned up.
- Runs as main module via `require.main === module` check, or can be imported for testing.
