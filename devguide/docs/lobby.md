# lobby.js

> Lobby/room UI helpers: room list, player list, chat rendering.

**File:** `src/public/js/lobby.js`
**Last verified:** 2026-03-12

## Overview

Lobby UI helper module. Provides functions to render the room list, player list within a room, and chat messages. Handles HTML escaping of user-provided strings. Wrapped in an IIFE; exposes `window.Lobby`.

## Public API

Exposed on `window.Lobby`:

| Method | Signature | Purpose |
|--------|-----------|---------|
| `renderRoomList` | `(rooms, container, onJoin)` | Renders room cards; waiting rooms are clickable via `onJoin(roomId)` |
| `renderPlayerList` | `(room, container, myId)` | Renders player rows with host/ready badges and "(you)" tag |
| `addChatMessage` | `(container, from, text)` | Appends HTML-escaped chat message, auto-scrolls |

## Dependencies

- **Requires:** None (standalone)
- **Used by:** `app.js`

## Internal Notes

- HTML escaping uses a temporary `<div>` with `textContent`/`innerHTML` swap — handles all special characters.
- Host player never shows a ready/not-ready badge.
