# app.js

> Main game client: WebSocket connection, screen management, HUD, input handling.

**File:** `src/public/js/app.js`
**Last verified:** 2026-03-12

## Overview

Main game client module. Manages the WebSocket connection to the game server (port 4001), routes incoming messages, handles screen transitions (name, lobby, room, game), and orchestrates all in-game UI: resource bars, colony management, build menus, research panel, scoreboard, galaxy/colony view switching, game chat, toast notifications, and game-over display. Wrapped in an IIFE; exposes `window.GameClient`.

## Public API

Exposed on `window.GameClient`:

| Method | Signature | Returns | Purpose |
|--------|-----------|---------|---------|
| `send` | `send(msg)` | `void` | JSON-encodes and sends a message over WebSocket |
| `getState` | `getState()` | `object \| null` | Returns current `gameState` object |

## Key Constants

| Name | Value | Purpose |
|------|-------|---------|
| `SPEED_LABELS` | `{ 1: '0.5x', 2: '1x', 3: '2x', 4: '3x', 5: '5x' }` | Game speed display labels |
| `TOAST_MAX` | `5` | Max simultaneous toast notifications |
| `TOAST_DURATION` | `4000` ms | Toast auto-dismiss delay |
| `TICKER_MAX` | `5` | Max visible event ticker entries |
| `_MAX_GAME_CHAT` | `30` | Max in-game chat messages |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `G` | Toggle colony/galaxy view |
| `R` | Toggle research panel |
| `Tab` | Toggle scoreboard |
| `Escape` | Close open panels |
| `1`-`5` | Switch to colony by index |
| `+`/`=` | Increase game speed |
| `-` | Decrease game speed |
| `Space` | Toggle pause |
| `Enter` | Focus game chat input |

## Dependencies

- **Requires:** `window.Lobby`, `window.ColonyRenderer`, `window.GalaxyView`, `window.ToastFormat`
- **Used by:** Entry point — loaded from `index.html`

## Internal Notes

- View switching between colony and galaxy destroys and re-creates the respective renderer to avoid two WebGL contexts sharing a single `render-container` div.
- Player/colony references are cached (`_cachedMyPlayer`, `_cachedMyColony`) after each `gameState` update.
- HUD updates run at 2 Hz (500 ms interval). Research panel and build queue use fingerprint strings to skip redundant DOM rebuilds.
- WebSocket auto-reconnects with a 2-second delay on close.
- Colony ship cap is 5 (colonies + ships combined); science ship cap at 3.
