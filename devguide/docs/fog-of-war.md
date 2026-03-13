# fog-of-war.js

> Fog of war visibility computation via BFS from owned systems.

**File:** `src/public/js/fog-of-war.js`
**Last verified:** 2026-03-12

## Overview

Fog of war visibility computation module. Determines which star systems are "known" to a player by running BFS from owned systems along hyperlane connections out to a configurable hop depth. Shared between browser and Node.js (dual IIFE + `module.exports` export).

## Public API

Exposed on `window.FogOfWar` and `module.exports`:

| Method | Signature | Returns | Purpose |
|--------|-----------|---------|---------|
| `buildAdjacency` | `(hyperlanes, systemCount)` | `Array<number[]>` | Builds adjacency list from hyperlane pairs |
| `computeVisibility` | `(sourceIds, adjacency, maxDepth?)` | `Set<number>` | BFS from sources out to `maxDepth` hops |
| `getOwnedSystemIds` | `(colonies, playerId)` | `number[]` | Extracts system IDs from player's colonies |

| Constant | Value | Purpose |
|----------|-------|---------|
| `FOG_VISIBILITY_DEPTH` | 2 | Default BFS hop depth |

## Dependencies

- **Requires:** None (pure computation)
- **Used by:** `galaxy-view.js`

## Internal Notes

- BFS uses array-based queue with `head` pointer (avoids `shift()` cost).
- Source IDs are bounds-checked against `adjacency.length`.
