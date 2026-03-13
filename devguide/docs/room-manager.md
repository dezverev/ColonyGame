# room-manager.js

> Room CRUD, player tracking, ready states, game launch validation.

**File:** `server/room-manager.js`
**Last verified:** 2026-03-12

## Overview

Manages multiplayer lobby rooms: creation, joining, leaving, ready-state toggling, and game launch validation. Tracks bidirectional mappings between players and rooms. Handles host transfer when the host leaves.

## Public API — `RoomManager` class

### `constructor()`

Initializes empty `rooms` (Map) and `playerRooms` (Map) indexes.

### `createRoom(name, hostId, hostName, options?) -> room`

Creates a new room and adds the host as the first player.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | string | Room name (truncated to 30 chars) |
| `hostId` | number | Client ID of the host |
| `hostName` | string | Display name of the host |
| `options.maxPlayers` | number | 2-8 for multiplayer, forced to 1 for practice mode |
| `options.map` | string | Map preset (default: `'default'`) |
| `options.practiceMode` | boolean | Single-player practice mode |
| `options.matchTimer` | number | Match length in minutes: 0, 10, 20, or 30 (default: 10 for practice, 20 for multiplayer) |
| `options.galaxySize` | string | `'small'`, `'medium'`, or `'large'` (default: `'small'`) |

### `joinRoom(roomId, playerId, playerName) -> { room } | { error }`

Adds a player to an existing room. Errors: room not found, game already started, room full, player already in a room.

### `leaveRoom(playerId) -> { room } | { removed, roomId } | null`

Removes a player from their room. Returns `{ removed: true, roomId }` if the room was deleted (last player left), or `{ room }` with the updated room. Transfers host to the next player if the host leaves.

### `toggleReady(playerId) -> { room, ready } | null`

Toggles the player's ready state. Only works in `'waiting'` status rooms.

### `canLaunch(roomId) -> boolean`

Returns true if the game can launch: all non-host players must be ready. Practice mode requires exactly 1 player. Multiplayer requires at least 2.

### `launchGame(roomId, hostId) -> { room } | { error }`

Sets room status to `'playing'`. Only the host can launch, and `canLaunch` must be true.

### `getRoom(roomId) -> room | undefined`

Direct room lookup by ID.

### `getRoomForPlayer(playerId) -> room | null`

Finds the room a player is currently in.

### `listRooms() -> Array`

Returns a summary array of all rooms.

### `serializeRoom(room) -> object`

Full room serialization including player list as array.

### `removePlayer(playerId)`

Alias for `leaveRoom(playerId)`. Used by server.js on disconnect.

## Key Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| Room ID length | 8 hex chars | Generated via `crypto.randomBytes(4)` |
| Valid match timers | `[0, 10, 20, 30]` | Allowed match duration options (minutes) |
| Valid galaxy sizes | `['small', 'medium', 'large']` | Galaxy size options |

## Room Object Shape

```js
{
  id, name, hostId, maxPlayers, map, practiceMode,
  matchTimer, galaxySize, status, // 'waiting' | 'playing' | 'finished'
  players: Map<clientId, { id, name, ready, isHost }>,
  createdAt: timestamp
}
```

## Dependencies

- **Requires:** `crypto` (Node.js built-in)
- **Used by:** `server/server.js`

## Internal Notes

- **Host transfer**: When the host leaves, the next player in Map iteration order becomes host.
- **Practice mode** forces `maxPlayers` to 1 and skips the "all ready" check in `canLaunch`.
- Room status transitions: `waiting` -> `playing` -> `finished` (set externally by server.js on game over).
