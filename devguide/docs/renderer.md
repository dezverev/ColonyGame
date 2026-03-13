# renderer.js

> Three.js isometric colony surface renderer: tile grid, districts, camera controls.

**File:** `src/public/js/renderer.js`
**Last verified:** 2026-03-12

## Overview

Three.js isometric colony surface renderer. Manages a Scene, OrthographicCamera, WebGLRenderer, lighting, and a tile grid representing colony districts. Supports tile selection via raycasting, keyboard/mouse camera controls (pan, zoom), and an optional FPS counter. Wrapped in an IIFE; exposes `window.ColonyRenderer`.

## Public API

Exposed on `window.ColonyRenderer`:

| Method | Signature | Purpose |
|--------|-----------|---------|
| `init` | `()` | Creates scene, camera, renderer, lighting, input handlers, geometry/material pools. Targets `#render-container`. |
| `buildColonyGrid` | `(colony)` | Builds tile grid from `colony.planet.size`, `districts[]`, `buildQueue[]`. Centers camera. |
| `updateFromState` | `(colony)` | Incremental update: swaps geometry/materials in-place. Falls back to rebuild if colony changed. |
| `destroy` | `()` | Cancels animation, removes listeners, disposes renderer. |
| `deselectTile` | `()` | Clears selection highlight. |
| `getSelectedTile` | `()` | Returns selected tile index or `-1`. |
| `getCurrentColony` | `()` | Returns colony data being rendered. |
| `setOnTileSelect` | `(cb)` | Sets tile selection callback. `cb` receives `{ index, empty, district, construction, colonyId }` or `null`. |

## Key Constants

| Name | Value | Purpose |
|------|-------|---------|
| `ISO_ANGLE_PITCH` | ~35.264° | Isometric camera pitch |
| `ISO_ANGLE_YAW` | 45° | Isometric camera yaw |
| `TILE_SIZE` | 1 | Tile width/depth |
| `TILE_GAP` | 0.1 | Gap between tiles |
| `GRID_COLS` | 4 | Grid columns |
| `ZOOM_MIN` / `ZOOM_MAX` | 2 / 20 | Ortho frustum bounds |
| `PAN_SPEED` | 0.15 | Keyboard pan speed |
| `DISTRICT_COLORS` | 6 colors | generator, mining, agriculture, industrial, research, housing |
| `DISTRICT_HEIGHTS` | 6 values | Box height per district type |

## Dependencies

- **Requires:** `THREE` (global)
- **Used by:** `app.js`

## Internal Notes

- Geometry and material objects are pooled (`_geoCache` / `_matCache`). Meshes reuse shared pool objects.
- Incremental updates swap `.geometry` and `.material` on existing meshes to avoid destroy/recreate per tick.
- Construction-in-progress tiles use wireframe materials. Disabled districts use gray materials.
- FPS counter activates with `?debug=1` URL parameter.
- Camera: WASD/arrows pan, scroll zooms, middle-mouse drags, left-click selects tiles.
