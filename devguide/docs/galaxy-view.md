# galaxy-view.js

> Three.js galaxy map: star systems, hyperlanes, ownership, ships, fog of war.

**File:** `src/public/js/galaxy-view.js`
**Last verified:** 2026-03-12

## Overview

Three.js galaxy map renderer. Displays star systems as colored spheres, hyperlane connections as line segments, ownership rings, colony ship markers, and science ship markers. Uses a PerspectiveCamera with orbit/pan/zoom mouse controls and supports fog of war. Wrapped in an IIFE; exposes `window.GalaxyView`.

## Public API

Exposed on `window.GalaxyView`:

| Method | Signature | Purpose |
|--------|-----------|---------|
| `init` | `(containerEl?)` | Creates scene, camera, renderer, lighting, hover label, event listeners |
| `buildGalaxy` | `(data)` | Clears scene, creates star meshes and ownership rings, builds fog adjacency, fits camera |
| `updateOwnership` | `(colonies, players)` | Updates ownership, rebuilds player color map, recomputes fog |
| `updateColonyShips` | `(ships)` | Renders colony ship markers with position interpolation |
| `updateScienceShips` | `(ships)` | Renders science ship markers with orbit/interpolation animation |
| `render` | `()` | Calls `renderer.render()`. Must be called each frame externally. |
| `destroy` | `()` | Removes listeners, disposes renderer, clears data |
| `getSelectedSystem` | `()` | Returns selected system or `null` |
| `setOnSystemSelect` | `(cb)` | Sets system selection callback |
| `getGalaxyData` | `()` | Returns raw galaxy data |
| `isSystemKnown` | `(sysId)` | Returns `true` if system is in known set |

## Key Constants

| Name | Value | Purpose |
|------|-------|---------|
| `STAR_RADIUS` | per star type | Base sphere scale (yellow: 2.0, red: 1.5, blue: 3.0, white: 1.8, orange: 2.2) |
| `_HOVER_INTERVAL` | 33 ms | Hover raycast throttle (~30 Hz) |

## Dependencies

- **Requires:** `THREE` (global), `window.FogOfWar`, `window.GameClient`
- **Used by:** `app.js`

## Internal Notes

- **Mesh pooling**: Colony ships, science ships, and ownership rings use object pools — meshes hidden and returned rather than destroyed.
- **Fog of war**: Owned system IDs fingerprinted as comma-separated string. Recomputation skipped when unchanged. Surveyed systems added to known set.
- **Hyperlane partitioning**: Three categories — known (opacity 0.4), faded (one endpoint known, opacity 0.12), hidden (not rendered). Each is a separate `LineSegments` object.
- **Orbit camera**: Left-drag rotates, middle/right-drag pans in XZ plane, scroll zooms (radius 50-2000). Phi clamped 0.1-89.4° to prevent gimbal flip.
- **Click vs. drag**: Clicks ignored if mouse moved >5px from mousedown.
- **Hover label**: DOM overlay at mouse coords, throttled to ~30 Hz. Shows "Unknown System" for fogged systems.
- Unknown stars render at 60% scale with dim gray material (opacity 0.2).
