# ColonyGame — Design & Implementation Roadmap

Isometric multiplayer space colony 4X game. Three.js rendering, WebSocket multiplayer.

## Architecture

- **Static file server** (port 4000): `src/dev-client-server.js`
- **WebSocket game server** (port 4001): `server/server.js` — rooms, game state, tick loop
- **Client**: Vanilla JS + Three.js — isometric colony, 3D galaxy map, system view
- **Rendering**: OrthographicCamera (isometric), PerspectiveCamera (galaxy/system)
- **Performance escape hatch**: Extract hot paths to Rust/WASM if profiling shows bottlenecks

## Phases

### Phase 1: Foundation Pivot
- [x] **BALANCE FIX — Energy economy**
- [x] **BALANCE FIX — Starting food deficit + housing**
- [x] **BALANCE FIX — Pop growth pacing**
- [x] **BALANCE FIX — Early mineral pacing**
- [x] Refactor game-engine.js from RTS to colony 4X
- [x] New resource system in game-engine.js
- [x] Update network protocol
- [x] Update all tests
- [x] **BALANCE FIX — Starting pop/housing deadlock**
- [x] **BALANCE FIX — Generator cost parity**
- [x] **BALANCE FIX — Variable build times**
- [x] **Colony idle event notifications**
- [x] **Energy deficit consequences**
- [x] **CLIENT UX SPRINT 1/3 — Single-player/practice mode**
- [x] **CLIENT UX SPRINT 2/5 — Stale client cleanup**
- [x] **CLIENT UX SPRINT 3/5 — Three.js scene + isometric colony view**
- [x] **CLIENT UX SPRINT 4/5 — 3D district rendering**
- [x] **CLIENT UX SPRINT 5/5 — HTML overlay UI on 3D view**
- [x] **Build menu resource header**
- [x] **BALANCE FIX — Dead code**
- [x] Planet type signature bonuses
- [x] **Game speed controls**
- [x] **In-game chat**
- [x] **Scoreboard overlay (Tab key)**
- [x] **Event ticker for player actions**
- [x] **BALANCE TWEAK — Colony ship cost and build time reduction**
- [x] **Live scoreboard with opponent summaries**
- [x] **BALANCE TWEAK — Housing district food production**
- [x] **BALANCE TWEAK — Foundry cost reduction**
- [x] **BALANCE TWEAK — Defense platform repair rate increase**
- [ ] **Starting planet variety:** Random planet type and size (12-20). Fairness mode = same for all.
- [x] **Score timer victory condition**
- [ ] **Scarcity pre-warning system:** Warning 100 ticks before scarcity starts.
- [ ] **Colony saturation indicator:** "Nearing Capacity" at 80%+, "Fully Developed" at 100%.
- [ ] **BALANCE TWEAK — Starting minerals & dead resources:** Minerals 300→250, alloys 50→0.
- [x] **BALANCE TWEAK — Research & Industrial output bump**
- [x] **Scoreboard overlay — server VP calculation**
- [ ] **PRIORITY: Surface anomalies — server logic:** 1-3 tile anomalies per colony (+50% output or one-time choice). Spatial puzzle.
- [ ] **Surface anomaly 3D rendering:** Glowing markers per type. Requires server logic first.
- [x] **BALANCE: Mini tech tree research costs adjustment**
- [ ] **Disabled district 3D rendering:** Desaturated + red tint on disabled districts.
- [x] **PRIORITY: Score timer + VP scoring**
- [x] **Galaxy/Colony view toggle (G key)**
- [x] **Colony list sidebar**
- [x] **Max colonies cap (5 per player)**
- [x] **BALANCE FIX — Alloy VP weight + Industrial output bump**
- [x] **Event toast notification HUD**
- [ ] **BALANCE TWEAK — T2 tech cost increase:** 500→750 research.
- [ ] **PRIORITY ORDER (R65):** (1) Defense platform repair, (2) T2 buildings, (3) Trade agreements, (4) System claims, (5) Expeditions, (6) Surface anomalies, (7) VP timeline, (8) Saturation indicator.
- [ ] **Exploration progress indicator:** "X% Explored" badge on galaxy HUD. Client-side only.
- [ ] **BALANCE TWEAK — Base capital housing:** 10→8.
- [ ] **Cascading colony events (stretch):** Crises spread to colonies within 2 hops.
- [ ] **BALANCE TWEAK — Generator VP:** +1 VP per generator district.
- [ ] **New district type — Alloy Refinery:** 2 alloys, 2 energy upkeep, 150m. Weaker Industrial alternative.
- [ ] **Add 25-minute match timer option**
- [x] **VP bonus for colony personality traits**
- [x] **Ship maintenance costs**
- [ ] **BALANCE TWEAK — VP formula rebalance:** Battle 5→3, survey per 5→3, colony +5 each, alloy per 25→20.
- [ ] **District adjacency bonus (stretch):** Same-type adjacent districts get +10% output.

### Phase 2: Colony Management
- [ ] District system: 6 types. Max = planet size. 300-tick build, first 3 on new colonies at 50% time.
- [ ] Population system: 1 pop/housing, 1 pop/job. +1 pop per 600 ticks if food surplus. Starvation kills.
- [ ] Building system: slots unlock at pop thresholds (max 12). 7 building types.
- [ ] Colony overview UI panel
- [ ] Construction queue (max 3 per colony)
- [ ] **Construction queue QoL:** Total cost display, deficit warnings, 50% cancel refund, ETA.
- [x] Colony personality system
- [x] **Edict system (influence spending)**
- [x] **Buildings layer — 3 building types**
- [x] **Advanced buildings T2 tier:** Quantum Lab (+8 research), Advanced Foundry (+8 alloys), Planetary Shield (+50 defense HP). Each requires T2 tech + base building. Max 1 each.
- [x] **BUGFIX — Colony upkeep deficit triggers district disabling**
- [x] **Colony upkeep scaling**
- [ ] **Planet grade rating:** D-through-S grade combining size + habitability + type bonus.
- [ ] **Tech complete visual celebration:** Flash affected districts on tech completion with emissive glow.
- [x] **Mini tech tree (early deliverable)**
- [x] **PRIORITY: Influence income from colonies**
- [ ] **Colony reinforcement (alloy sink):** Spend 100 alloys for +5 housing. Max 3 per colony.
- [ ] **Starbase upgrade — alloy sink:** 150 alloys, +5 defense repair HP/month, +5 VP. Max 1 per colony.
- [ ] **Crisis prevention via specialization:** 4+ districts of matching type prevents corresponding crisis.
- [x] **Catch-up mechanics: underdog production bonus**
- [x] **PRIORITY: Scarcity seasons**
- [x] **Colony established bonus**
- [x] **VP formula rebalance — diminishing pop returns**
- [ ] **Opening Hands (stretch):** Choose from 3 random starting conditions. 30s timer.
- [ ] **Colony governors (stretch):** NPC governor per colony with trait + quirk.
- [ ] **Galactic market (stretch):** Shared market with fluctuating prices.
- [ ] **Colony mood system:** Thriving/Content/Restless/Rebellious. Affects output.
- [ ] **Colony legends (stretch):** Milestone history entries, narrative recap at game end.
- [ ] **Contested colonization race:** First ship wins. Same-tick = coin flip, 50% refund to loser.
- [x] **Science ship unit type**
- [ ] **Planetary features as tile modifiers (stretch):** 2-4 bonus tiles per colony for specific district types.
- [x] **Crisis interval scaling**
- [ ] **Resource deficit projection warning:** Client-side warning for projected deficits.
- [x] **Colony crisis events (4 types)**

### Phase 3: Galaxy & Exploration

**Build order:** Auto-chain survey -> Colony established bonus -> Scouting race VP milestones -> Science ship expeditions -> System orbital view.

- [x] Procedural galaxy generation
- [x] Planet generation per system
- [x] **Galaxy map view (Three.js)**
- [x] **System selection panel on galaxy map**
- [ ] **PRIORITY: System orbital view:** Star + planets on orbital rings. Click planet for details. Galaxy -> System -> Colony nav.
- [ ] **Colony planet context rendering:** Ground plane + background color per planet type.
- [ ] **Planet visual polish in system panel:** Colored dots, bold size 15+, gold border on best.
- [x] **Fog of war on galaxy map**
- [ ] **PRIORITY: Science ship expeditions:** After 5+ surveys, timed missions: Deep Space Probe (60s, +3 VP), Precursor Signal (90s, risk/reward, +5 VP), Wormhole Mapping (60s, +2 VP).
- [x] **Scouting race VP milestones**
- [x] **Science ship auto-chain survey**
- [ ] Fleet fundamentals: science/colony/construction ships. Hyperlane movement, 5s/hop.
- [ ] System surveying: 10s/planet, reveals details, 20% anomaly chance.
- [x] **Minimal colony ship**
- [ ] Colonization (full): 200m/100f/100i, consumed on arrival, 2 starting pops.
- [ ] Starbase construction: 200m/100 alloys, claims system.
- [ ] **Multiplayer territorial visibility:** Show ownership claims, proximity alerts.
- [ ] **Expanded anomaly events (15 total, 3 tiers)**
- [x] **Colony switcher UI for multi-colony management**
- [ ] **Military outpost system:** 100 alloys + 25 influence, claims system, +1 influence/month, +3 VP. Max 3.
- [ ] **Galactic leylines (stretch):** Hidden resource veins connecting 2-3 systems. +15% bonus if all controlled.
- [ ] **Emergent trade routes (stretch):** Auto-trade between players within 3 hops, +5% energy.
- [ ] **Planet type bonus visibility in system panel:** Show bonus tags in planet rows.
- [ ] **Precursor anomaly chain (stretch):** 3-phase exploration quest, major reward.
- [x] **Colony founding broadcast and galaxy update**

### Phase 4: Technology & Research
- [x] **BALANCE FIX — Research VP weight**
- [x] **PRIORITY: Tech tree T3 expansion**
- [ ] Full tech tree: 3 tracks x 5 tiers. Costs: 500/1000/2000/4000/8000. 3-4 techs per tier.
- [ ] Research UI + tech effects system: track display, progress bars, multiplicative modifiers.
- [ ] **Capability-unlocking techs:** Colonial Administration (+1 slot), Subspace Comms (+1 fog range), Modular Hulls (+4 corvette cap).
- [ ] **BALANCE TWEAK — T3 tech cost reduction:** 1000→750.
- [x] **Doctrine choice at game start**
- [ ] **Empire specialization doctrines:** At 3 colonies, permanent pick: Expansionist/Industrialist/Scholar.
- [ ] **Tech tree branching: exclusive T2 choices:** Mutually exclusive T2 per track. 8 configurations.

### Phase 5: Fleets & Combat
- [x] **Corvette ship class**
- [x] **Fleet combat resolution**
- [x] **Colony occupation after fleet combat**
- [ ] **Fleet energy maintenance:** Corvette 1/month, Destroyer 3, Cruiser 6.
- [ ] Ship classes: Corvette (50a/30HP), Destroyer (100/80HP), Cruiser (200/200HP), Battleship (400/500HP).
- [ ] Fleet management + shipyard system: grouping, fleet cap 20, shipyard module 100 alloys, queue 5.
- [ ] Combat + starbase defense: per-tick firing, starbase 100HP/40fp.
- [ ] Military UI: fleet list, composition, build queue, combat alerts.
- [x] **Corvette variants via tech**
- [x] **BALANCE TWEAK — Gunboat attack reduction**
- [x] **BALANCE TWEAK — Base corvette maintenance increase**
- [ ] **BALANCE TWEAK — Defense platform repair rate:** 10→15 HP/month.
- [ ] **Fleet intelligence — espionage:** 25 influence, reveal fleet 5 min, 600-tick cooldown.
- [ ] **War weariness — occupation VP decay:** VP decays after 500 ticks, reaches 0 at 900 ticks.
- [x] **NPC raider fleets**

### Phase 6: Diplomacy & Interaction

**Build order:** Chat + diplomacy pings -> System claims -> Cease-fire negotiations.

- [x] **Resource gifting**
- [x] **Diplomatic stances**
- [x] **In-game chat + diplomacy pings**
- [ ] **System claims with influence:** 25 influence, prevents enemy colonization, +1 VP.
- [ ] **Inter-player trade routes:** +3 energy/month per hop. Max 3 per empire.
- [ ] **Cease-fire negotiations:** After 600+ ticks of war. Both go neutral + 3 VP.
- [ ] **Non-Aggression Pact:** 25 influence each, 5 min, prevents attacks.
- [x] **Trade Agreement:** 25 influence each, +15% energy/minerals. Breaks on aggression.
- [ ] **Sabotage action:** 50 influence, random crisis on opponent. 600-tick cooldown.
- [ ] Communication: diplomatic messages + trade offers via inbox panel.
- [ ] Trade system: exchange resources/systems/treaties. Both must accept.
- [ ] Alliances: 50 influence each, shared vision, mutual defense. Max 1.
- [ ] War & conquest: conquer colonies (destroy starbase + hold 30s), -50% output for 120s.
- [ ] Diplomacy UI: stances, inbox, trade, alliance, war/peace controls.
- [x] **Underdog bonus and catch-up mechanics**
- [ ] Match timer + VP scoring: selectable timer, VP formula.
- [ ] Surrender vote: 2+ players concede in 3+ player games.
- [ ] **Colony mood — tall vs wide tension:** Empire penalty at 4+ colonies. Expansionist shifts thresholds.
- [ ] **Colony economic blockade:** 50 alloys, -25% production on rival colony within 2 hops. 10 alloys/month upkeep.
- [ ] **Galactic Council mid-game vote (stretch):** Periodic resolutions at 50% match time. Majority vote.

### Phase 7: Events, Polish & Win Conditions

**Build order:** Alternate victory conditions -> VP timeline graph -> Galactic news ticker.

- [x] **Endgame crisis event**
- [x] **Mid-game catalyst events**
- [x] **BALANCE: Catalyst event window widening**
- [x] **BALANCE: T3 tech cost reduction**
- [ ] Anomaly events: 10 unique survey events with choices and narrative flavor.
- [ ] Random galaxy events: asteroid storms, solar flares, resource booms every 120s.
- [ ] Planet biome rendering: distinct Three.js materials per planet type.
- [ ] Visual effects: warp animations, combat particles, construction scaffolding, research flash.
- [ ] Sound design: ambient music, UI sounds, combat, notifications via Web Audio API.
- [x] **Distinct victory conditions**
- [ ] Win conditions (selectable): Domination/Research/Economic/Diplomatic.
- [x] **Post-game score screen**
- [ ] **Post-game VP timeline graph:** VP snapshots every 10 months, line chart on post-game screen.
- [ ] Player disconnect handling: 60s grace period, AI takeover, reconnect or fallen empire.
- [ ] **Dynamic galactic news ticker:** Procedural flavor text ticker, 4s intervals, max 8 queued.
- [x] **Colony procedural naming**
- [ ] **Spectator replay time-lapse (stretch):** 30s fast-forward of colony growth on game over.
- [ ] **Colony rivalry ticker (stretch):** Comparison events when surpassed. Multiplayer only.
- [ ] **Dynamic colony atmosphere (stretch):** Particle effects at 25%/50%/100% capacity.
- [ ] **Galactic Wonder Race (stretch):** 3 unique wonders, +20 VP each. First to build claims it.
- [ ] **Secret rival objectives (stretch):** Hidden objectives targeting another player, +8-10 VP.
- [ ] **Faction archetypes (stretch):** 4 factions with asymmetric starts.

## Conventions

- Server modules: plain `module.exports`, no dual-export
- Client modules: IIFE with `window.*` for browser, `module.exports` for Node.js tests
- Tests: `node:test` + `node:assert` (Node.js built-in)
- All game state is server-authoritative
- Commands: client sends intent, server validates and executes
- State broadcast: server sends colony/fleet updates each tick (optimize later with deltas)
- Three.js for all rendering — no 2D canvas, no sprites
- Isometric colony view: OrthographicCamera at 35.264° pitch, 45° yaw
