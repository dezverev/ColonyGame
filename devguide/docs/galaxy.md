# galaxy.js

> Procedural galaxy generation: star systems, hyperlanes, starting system assignment.

**File:** `server/galaxy.js`
**Last verified:** 2026-03-12

## Overview

Procedural galaxy generation module. Creates star systems with planets, connects them via hyperlanes using a relative neighborhood graph algorithm, and assigns starting systems to players with maximum spacing. Uses a seeded PRNG (mulberry32) for deterministic generation.

## Public API

### `generateGalaxy(options?) -> { seed, size, systems, hyperlanes }`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `options.size` | string | `'small'` | `'small'`, `'medium'`, or `'large'` |
| `options.seed` | number | random | PRNG seed for deterministic generation |

### `assignStartingSystems(galaxy, playerIds) -> { [playerId]: systemId }`

Assigns one starting system per player, maximizing mutual distance. Prefers systems with at least one habitable planet (habitability >= 60). Marks assigned system's planets as surveyed and sets ownership.

### `bestHabitablePlanet(system) -> planet | null`

Finds the best colonization target: highest habitability (min 20), ties broken by largest size.

### `mulberry32(seed) -> () => number`

Seeded 32-bit PRNG returning deterministic floats in [0, 1).

### `poissonDisc(rng, count, radius, minDist) -> [{ x, z }]`

Poisson disc sampling for even spatial distribution of star systems.

### `generateHyperlanes(systems, rng) -> [[i, j]]`

Four-phase hyperlane algorithm:
1. **Relative Neighborhood Graph** — connects systems where no third point is closer to both
2. **Connectivity enforcement** — BFS to find isolated components, bridges to main component
3. **Minimum degree supplement** — ensures every node has at least 2 connections
4. **Maximum degree pruning** — caps at 6 per node, removes longest edges first

### `generateName(rng, usedNames) -> string`

Procedural star name from prefix + suffix syllables with optional designation.

### `weightedPick(rng, items) -> key`

Weighted random selection from an object with `weight` properties.

## Key Constants

### Galaxy Sizes

| Size | Systems | Radius |
|------|---------|--------|
| `small` | 50 | 200 |
| `medium` | 100 | 300 |
| `large` | 200 | 450 |

### Star Types

| Type | Color | Weight |
|------|-------|--------|
| `yellow` | #f9d71c | 30 |
| `red` | #e74c3c | 30 |
| `blue` | #3498db | 15 |
| `white` | #ecf0f1 | 20 |
| `orange` | #e67e22 | 5 |

### Planet Types

| Type | Habitability | Weight |
|------|-------------|--------|
| continental | 80 | 15 |
| ocean | 80 | 10 |
| tropical | 80 | 10 |
| arctic | 60 | 10 |
| desert | 60 | 10 |
| arid | 60 | 10 |
| barren | 0 | 15 |
| molten | 0 | 10 |
| gasGiant | 0 | 10 |

## System Object Shape

```js
{
  id: number,          // index in systems array
  name: string,
  x: number, y: 0, z: number,  // flat galaxy plane
  starType: string,
  starColor: string,
  planets: [{ orbit, type, size, habitability, surveyed }],
  owner: playerId | null,
  surveyed: { [playerId]: true }
}
```

## Dependencies

- **Requires:** None (standalone module)
- **Used by:** `server/game-engine.js`

## Internal Notes

- **Poisson disc sampling** uses Bridson's algorithm with adaptive minimum distance.
- **Distance caching**: `generateHyperlanes` pre-computes an NxN `Float64Array` distance-squared matrix.
- **Name generation**: 36 prefixes x 32 suffixes x optional 13 designations (~15,000 unique names).
- The `y` coordinate is always 0; galaxy is 2D in the xz plane.
