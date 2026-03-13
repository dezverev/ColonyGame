# game-engine.js

> Core game loop: galaxy, colonies, resources, research, ships, combat, victory.

**File:** `server/game-engine.js`
**Last verified:** 2026-03-12

## Overview

Core game loop for the Colony 4X game. Manages galaxy generation, colony management, resource production, technology research, ship construction and movement, population growth/starvation, victory point calculation, match timers, and game speed control. Runs a server-authoritative tick loop that broadcasts per-player filtered state at a throttled rate.

## Public API — `GameEngine` class

### `constructor(room, options?)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `room` | object | Room object from RoomManager (players map, settings) |
| `options.tickRate` | number | Ticks per second (default: 10) |
| `options.onTick` | function | `(playerId, stateJSON) => void` — called per dirty player on broadcast |
| `options.onEvent` | function | `(events[]) => void` — game events to dispatch |
| `options.onSpeedChange` | function | `(speedState) => void` — speed/pause changes |
| `options.onGameOver` | function | `(data) => void` — match ended |
| `options.galaxySeed` | number | Deterministic galaxy seed |
| `options.profile` | boolean | Enable tick profiling |

### `start()` / `stop()`

Begins or clears the tick interval.

### `tick()`

Single game tick. Processes in order: match timer, construction queues, colony ship movement, science ship movement/surveying, population growth (every tick), monthly processing (every 100 ticks: resources, energy deficit, research, starvation), event flush, throttled state broadcast (every 3 ticks, dirty players only).

### `handleCommand(playerId, cmd) -> { ok } | { error }`

Dispatches player commands:

| Command | Key Fields | Description |
|---------|-----------|-------------|
| `buildDistrict` | `colonyId`, `districtType` | Queue district (max 3 in queue, checks slots and resources) |
| `demolish` | `colonyId`, `districtId` | Remove district or cancel queued (50% refund) |
| `buildColonyShip` | `colonyId` | Queue colony ship construction |
| `sendColonyShip` | `shipId`, `targetSystemId` | Send idle colony ship to habitable system |
| `buildScienceShip` | `colonyId` | Queue science ship construction |
| `sendScienceShip` | `shipId`, `targetSystemId` | Send idle science ship to survey |
| `setResearch` | `techId` | Set active research on a tech track |

### `setGameSpeed(speed)` / `togglePause()`

Changes game speed (1-5) or pauses/unpauses. Restarts the tick interval.

### `getState()` / `getPlayerState(playerId)` / `getPlayerStateJSON(playerId)`

Full state, per-player filtered state, or pre-stringified per-player state. Cached until invalidated.

### `getInitState()`

Full state plus galaxy data (systems, hyperlanes). Sent once on game start.

### `getTickStats() -> { avg, max, count, budgetPct }`

Tick profiling statistics (when profiling enabled).

## Key Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `MONTH_TICKS` | 100 | Ticks per "month" (10 sec at 10 Hz) |
| `BROADCAST_EVERY` | 3 | State broadcast every N ticks (~3.3 Hz) |
| `DEFAULT_SPEED` | 2 | Default game speed (1x) |
| `GROWTH_BASE_TICKS` | 400 | Base pop growth rate (40 sec) |
| `GROWTH_FAST_TICKS` | 300 | Pop growth with food surplus > 5 |
| `GROWTH_FASTEST_TICKS` | 200 | Pop growth with food surplus > 10 |
| `MAX_COLONIES` | 5 | Maximum colonies per player |
| `MAX_SCIENCE_SHIPS` | 3 | Maximum science ships per player |
| `COLONY_SHIP_COST` | `{ minerals: 200, food: 100, alloys: 100 }` | Colony ship resource cost |
| `COLONY_SHIP_BUILD_TIME` | 600 | Colony ship build ticks (60 sec) |
| `COLONY_SHIP_HOP_TICKS` | 50 | Ticks per hyperlane hop (5 sec) |
| `SCIENCE_SHIP_COST` | `{ minerals: 100, alloys: 50 }` | Science ship resource cost |
| `SCIENCE_SHIP_BUILD_TIME` | 300 | Science ship build ticks (30 sec) |
| `SCIENCE_SHIP_HOP_TICKS` | 30 | Ticks per hyperlane hop (3 sec) |
| `SURVEY_TICKS` | 100 | Ticks to survey a system (10 sec) |
| `ANOMALY_CHANCE` | 0.20 | Per-planet anomaly discovery chance |
| `COLONY_SHIP_STARTING_POPS` | 2 | Pops assigned to newly settled colony |

## District Definitions

| Type | Produces | Consumes | Housing | Jobs | Cost | Build Ticks |
|------|----------|----------|---------|------|------|-------------|
| `housing` | — | energy: 1 | 5 | 0 | minerals: 100 | 200 |
| `generator` | energy: 6 | — | 0 | 1 | minerals: 100 | 300 |
| `mining` | minerals: 6 | — | 0 | 1 | minerals: 100 | 300 |
| `agriculture` | food: 6 | — | 0 | 1 | minerals: 100 | 300 |
| `industrial` | alloys: 4 | energy: 3 | 0 | 1 | minerals: 200 | 400 |
| `research` | physics/society/engineering: 4 each | energy: 4 | 0 | 1 | minerals: 200, energy: 20 | 400 |

## Planet Type Bonuses

| Planet Type | District | Bonus |
|-------------|----------|-------|
| continental | agriculture | +1 food |
| ocean | agriculture | +1 food |
| ocean | research | +1 each research |
| tropical | agriculture | +2 food |
| arctic | mining | +1 minerals |
| arctic | research | +1 each research |
| desert | mining | +2 minerals |
| arid | generator | +1 energy |
| arid | industrial | +1 alloys |

## Tech Tree

| Tech ID | Track | Tier | Cost | Effect |
|---------|-------|------|------|--------|
| `improved_power_plants` | physics | 1 | 150 | +25% generator output |
| `frontier_medicine` | society | 1 | 150 | +25% pop growth speed |
| `improved_mining` | engineering | 1 | 150 | +25% mining output |
| `advanced_reactors` | physics | 2 | 500 | +50% generator output |
| `gene_crops` | society | 2 | 500 | +50% agriculture output |
| `deep_mining` | engineering | 2 | 500 | +50% mining output |

## Anomaly Types

| Type | Reward |
|------|--------|
| `ancientRuins` | +50 physics/society/engineering |
| `mineralDeposit` | +100 minerals |
| `habitableMoon` | +2 planet size |
| `precursorArtifact` | +25 influence |
| `derelictShip` | +50 alloys |

## Game Speed

| Speed | Label | Tick Interval | Effective Hz |
|-------|-------|---------------|-------------|
| 1 | 0.5x | 200ms | 5 Hz |
| 2 | 1x | 100ms | 10 Hz |
| 3 | 2x | 50ms | 20 Hz |
| 4 | 3x | 33ms | ~30 Hz |
| 5 | 5x | 20ms | 50 Hz |

## Victory Points

- 2 VP per pop
- 1 VP per built district
- 1 VP per 25 alloys stockpiled
- 1 VP per 50 total research
- +5/+10/+20 VP per Tier 1/2/3 tech

## Starting Resources

| Resource | Amount |
|----------|--------|
| Energy | 100 |
| Minerals | 300 |
| Food | 100 |
| Alloys | 50 |
| Influence | 100 |
| Pops | 8 |
| Pre-built districts | generator, mining, agriculture x2 |

## Dependencies

- **Requires:** `./galaxy.js`
- **Used by:** `server/server.js`

## Internal Notes

- **Dirty tracking**: A `_dirtyPlayers` set accumulates between broadcasts. State is only serialized and sent for players whose data changed, at ~3.3 Hz.
- **Caching layers**: Colony production/housing/jobs cached per colony. VP and player summaries are tick-scoped. Tech modifiers cached per player, invalidated on tech completion. Per-player JSON cached per broadcast cycle.
- **Build time discount**: First 3 player-built districts on non-starting colonies build at 50% time.
- **Energy deficit**: When energy goes negative, highest-consuming districts are disabled first. Re-enabling happens cheapest-first, only if net energy stays non-negative.
- **Science ship return**: After survey, ships auto-return to nearest owned colony by BFS hop count.
- **Anomaly determinism**: Uses hash-based seeded random keyed on system ID and planet orbit.
- **Research model**: Entire stockpile for a track is consumed each month toward progress. Switching techs preserves partial progress.
- **Match timer**: Configurable (0/10/20/30 min). Emits 2-minute and 30-second warnings. On expiry, triggers game over with VP-based winner.
