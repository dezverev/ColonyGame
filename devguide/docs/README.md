# Component Documentation

Last updated: 2026-03-12

## Server

| Component | File | Doc | Status |
|-----------|------|-----|--------|
| Game Server | `server/server.js` | [server.md](server.md) | Current |
| Room Manager | `server/room-manager.js` | [room-manager.md](room-manager.md) | Current |
| Game Engine | `server/game-engine.js` | [game-engine.md](game-engine.md) | Current |
| Galaxy Generator | `server/galaxy.js` | [galaxy.md](galaxy.md) | Current |
| Config | `server/config.js` | — | Trivial (env vars with defaults) |

## Client

| Component | File | Doc | Status |
|-----------|------|-----|--------|
| Main Client | `src/public/js/app.js` | [app.md](app.md) | Current |
| Lobby UI | `src/public/js/lobby.js` | [lobby.md](lobby.md) | Current |
| Colony Renderer | `src/public/js/renderer.js` | [renderer.md](renderer.md) | Current |
| Galaxy View | `src/public/js/galaxy-view.js` | [galaxy-view.md](galaxy-view.md) | Current |
| Fog of War | `src/public/js/fog-of-war.js` | [fog-of-war.md](fog-of-war.md) | Current |
| Toast Format | `src/public/js/toast-format.js` | [toast-format.md](toast-format.md) | Current |

## Not Yet Implemented

These components are referenced in CLAUDE.md but do not exist in the codebase yet:

| Component | Expected File | Notes |
|-----------|---------------|-------|
| Colony View | `src/public/js/colony-view.js` | Colony rendering currently in `renderer.js` |
| System View | `src/public/js/system-view.js` | System orbital view not yet built |
| UI Module | `src/public/js/ui.js` | HUD logic currently in `app.js` |
