# RTSGame — Game Design Review

## Review #1 — 2026-03-11

**Reviewer:** Game Design Analysis (automated)
**Build:** Phase 1 complete, Phases 2-7 pending
**Playable:** Partially — can move units, but no combat/economy/win condition

---

### 1. Design Pillar Scores

| Pillar | Score | Notes |
|--------|-------|-------|
| Strategic Depth | 1/10 | Only one action available (move). No choices to make. |
| Pacing & Tension | 1/10 | No game arc — nothing escalates, nothing ends. |
| Player Agency & Feedback | 3/10 | Selection + movement works. No feedback on actions, no economy levers. |
| Asymmetry & Replayability | 1/10 | Every match is identical — same start, same (empty) options. |
| Multiplayer Fairness | 4/10 | Spawn points are pre-set and roughly symmetric. No fog of war means full info. |
| **Average** | **2.0/10** | Expected for Phase 1 — the skeleton is there, the game is not. |

---

### 2. Pillar Analysis

#### Strategic Depth (1/10)
There are zero meaningful decisions. Players start with 3 workers and 1 town hall. They can move workers around. That's it. No build orders because there's no building. No unit composition because there's no production. No map control because there's nothing to control.

The unit stat definitions exist in code (worker/soldier/archer) but soldiers and archers are never created. There's no rock-paper-scissors, no timing windows, no resource trade-offs.

**What's needed first:** Combat + resource gathering create the decision space. Without these, nothing else matters.

#### Pacing & Tension (1/10)
There is no game arc. The game starts and... continues forever at the same state. Resources don't change. Units don't die. Nothing is produced. There's no early/mid/late game because there's no game.

**What's needed first:** A basic economic loop (gather → build → produce → fight) creates natural pacing. Add a win condition and suddenly every action has stakes.

#### Player Agency & Feedback (3/10)
The selection system works well — click to select, box select, right-click to move. This is the right foundation. The minimap shows unit positions. The HUD shows resource counts (even though they never change).

**Missing:** No audio cues, no attack feedback, no "your base is under attack" alerts, no production queue visibility, no tech tree display. When you right-click to move, there's no visual confirmation (move marker, path preview).

#### Asymmetry & Replayability (1/10)
Every game is identical. Same map, same spawns, same units. There's only one map (50x50 default). No procedural generation, no map selection, no faction differences.

**What's needed first:** Even before factions, just having 3-4 different maps with different resource layouts would make matches feel different. Resource node placement is the cheapest way to add replayability.

#### Multiplayer Fairness (4/10)
Spawn points are reasonably placed — corners and edge midpoints for up to 8 players. The 2-player spawns (5,5 and 45,45) are diagonally symmetric, which is fair.

**Problems:** No fog of war means you see everything your opponent does. This eliminates scouting, surprise attacks, and hidden tech switches — three core pillars of competitive RTS. Full visibility heavily favors reactive play over creative play.

---

### 3. Top 5 Things a Playtester Would Notice

1. **"I can't do anything."** — Move units around... and then what? No combat, no building, no gathering. The game has no verbs beyond "move."

2. **"How do I win?"** — There's no win condition. The game runs forever. No score, no elimination, no objectives.

3. **"These are colored diamonds."** — Placeholder graphics make it impossible to distinguish unit types at a glance. Even with sprites, there's no visual language for "this is a soldier vs. this is a worker."

4. **"My resources never change."** — The HUD shows Gold: 200, Wood: 100, Stone: 50 from start to finish. Static resources with no way to spend or earn them feel broken.

5. **"I can see everything on the map."** — No fog of war means no discovery, no scouting, no surprises. The map feels small and static when you can see all of it immediately.

---

### 4. Recommendations

### 4.1 — Combat System (Attack + Death + Auto-aggro)

**Impact:** High
**Effort:** Medium
**Category:** Core Mechanic

**The problem:** Units exist but can't fight. An RTS without combat is a walking simulator.

**The fix:** Implement the attack command, damage calculation, unit death, and auto-aggro in one pass. This is the single highest-impact feature.

**Why it matters:** Combat creates the stakes that make every other decision meaningful. Build orders matter because they determine army composition. Economy matters because it fuels production. Map control matters because you need to deny enemy resources while protecting yours.

**Design details:**
- Right-click enemy unit → attack-move toward target, attack when in range
- Damage formula: `max(1, attacker.atk - target.armor)` per attack cooldown
- Attack cooldown: workers 1.5s, soldiers 1.0s, archers 1.2s
- Attack range: workers 1 tile (melee), soldiers 1 tile (melee), archers 5 tiles (ranged)
- Auto-aggro radius: 6 tiles — idle units engage enemies that enter this radius
- Priority: lowest HP enemy within range (focus fire feels good)
- Unit death: remove from game state, brief fade on client
- **Counter system (critical for strategic depth):**
  - Soldiers deal 1.5x damage to archers (armored advance)
  - Archers deal 1.5x damage to cavalry (kiting)
  - Cavalry deal 1.5x damage to soldiers (flanking charge)
  - Workers deal 0.5x damage to everything (they're not fighters)
- Reference: Age of Empires II counter system, StarCraft unit roles

### 4.2 — Resource Gathering Loop

**Impact:** High
**Effort:** Medium
**Category:** Core Mechanic

**The problem:** Resources are static numbers on the HUD. There's no way to earn or spend them. Economy is the engine of an RTS — without it, there's no reason to make strategic trade-offs.

**The fix:** Place resource nodes on the map, let workers gather from them and return to town hall.

**Why it matters:** Resource gathering creates the "macro" half of RTS gameplay. Where to expand, when to add workers vs. military, which resources to prioritize — these are the decisions that separate strategic depth from rock-paper-scissors.

**Design details:**
- Resource nodes placed at game init: 4 gold mines (1500 gold each), forests (tiles that provide 50 wood each), 2 stone quarries (800 stone each) per spawn area
- Workers right-click a resource → walk to it → gather for 2 seconds → walk back to nearest town hall → deposit → repeat automatically
- Gather rates: 8 gold/trip, 10 wood/trip, 5 stone/trip
- Gold mines deplete after total extraction. Forests thin out. Stone quarries deplete.
- Workers carry one resource type at a time. Switching resource target drops current carry.
- This creates the classic economic pressure: more workers = faster income but slower army buildup
- Reference: Age of Empires II villager economy, C&C harvester loop

### 4.3 — Unit Production & Building Construction

**Impact:** High
**Effort:** Medium
**Category:** Core Mechanic

**The problem:** You start with 3 workers and that's all you ever have. Can't build, can't produce. The game is frozen in its initial state.

**The fix:** Workers can construct buildings. Buildings produce units. This creates the economic loop: gather → build → produce → fight.

**Why it matters:** Production is what creates the RTS "build order" metagame. Do I rush with early soldiers? Do I boom with extra workers? Do I tech to archers? These choices are the heart of strategic expression.

**Design details:**
- Building costs:
  - Town Hall: 300 gold, 200 wood — drop-off point, produces workers (50g 20w, 15s)
  - Barracks: 150 gold, 100 wood — produces soldiers (60g 20w, 12s) and archers (40g 50w, 14s)
  - Farm: 50 gold, 30 wood — +5 supply cap
  - Tower: 100 gold, 75 stone — static defense, 8 atk, 7 range, attacks every 2s
  - Stable: 200 gold, 150 wood — produces cavalry (80g 30w, 16s)
- Construction: worker walks to site, builds over time (10-30 seconds depending on building), worker is "busy" during construction
- Production queue: max 5 per building. Unit spawns at rally point when timer completes.
- Supply cap starts at 10 (from town hall). Each farm adds 5. Max 50.
- Reference: Warcraft III build times, AoE2 production queues

### 4.4 — Win Condition & Game End

**Impact:** High
**Effort:** Low
**Category:** Core Mechanic

**The problem:** Games never end. There's no objective, no score, no winner. Without a win condition, nothing matters.

**The fix:** Implement "Annihilation" as the default win condition — destroy all enemy buildings to win.

**Why it matters:** Win conditions create urgency. Every unit lost is a step toward defeat. Every building destroyed is progress toward victory. The game needs stakes.

**Design details:**
- A player is eliminated when they have zero buildings remaining
- Last player standing wins
- On elimination: player's remaining units are removed, notification sent to all
- Game ends → server sends `gameOver` message with winner, stats (units killed, resources gathered, buildings destroyed)
- Post-game screen shows stats, "Return to Lobby" button
- Future: add Regicide (kill king unit) and Timed (highest score at 15 min) as options
- Reference: Every RTS ever — this is table stakes

### 4.5 — Fog of War

**Impact:** High
**Effort:** High
**Category:** Core Mechanic

**The problem:** Complete map visibility eliminates scouting, surprise, and hidden information — three of the most exciting elements in competitive RTS.

**The fix:** Per-player visibility based on unit and building sight ranges.

**Why it matters:** Fog of war is what makes scouting a skill, surprise attacks viable, and hidden tech switches possible. It transforms RTS from a pure execution contest into a game of information and deception. This is what separates a great RTS from a mediocre one.

**Design details:**
- Sight ranges: workers 7 tiles, soldiers 5 tiles, archers 8 tiles, cavalry 9 tiles, buildings 8 tiles, towers 10 tiles
- Three states: visible (currently in LOS), revealed (previously seen, shows terrain/buildings but not units), hidden (never seen, black)
- Server only sends unit positions for units within the player's vision — prevents maphacking
- Client renders fog overlay (semi-transparent black for revealed, solid black for hidden)
- This is the highest-effort item but also the highest single-feature improvement to strategic depth
- Reference: StarCraft fog of war, AoE2 exploration

### 4.6 — Cavalry Unit Type

**Impact:** Medium
**Effort:** Low
**Category:** Content

**The problem:** Only three unit types exist in code (worker, soldier, archer). There's no fast raider unit, which means no harassment play, no flanking, and a missing piece of the counter triangle.

**The fix:** Add cavalry as the fourth military unit.

**Why it matters:** Cavalry completes the counter triangle (soldier → archer → cavalry → soldier) and enables hit-and-run tactics, which are some of the most exciting micro moments in RTS games.

**Design details:**
- Stats: 70 HP, speed 3.5, atk 12, armor 1, range 1 (melee), attack cooldown 1.3s
- Cost: 80 gold, 30 wood. Build time: 16s. Supply: 2.
- Produced at Stable (new building, 200g 150w)
- Bonus: 1.5x damage vs soldiers, weak to archers (archers deal 1.5x to cavalry)
- Role: fast raider, worker harasser, flanker. High speed lets them pick fights and disengage.
- Reference: AoE2 Knights, StarCraft Zealot charge, WC3 Raiders

### 4.7 — Move Confirmation & Combat Feedback

**Impact:** Medium
**Effort:** Low
**Category:** UX / Polish

**The problem:** When you right-click to move, nothing happens visually — units just start drifting toward the target. No move marker, no sound, no feedback. Combat (once implemented) will need hit indicators, damage numbers, and death effects.

**The fix:** Add visual feedback for all player actions.

**Why it matters:** Feedback is what makes a game feel responsive. Without it, players feel disconnected from their units. A small green circle at the move target, a flash when a unit takes damage, a brief particle burst on death — these tiny details make the game feel 10x more polished.

**Design details:**
- Move command: green circle at target position, fades over 1 second
- Attack command: red circle at target
- Damage taken: brief white flash on unit sprite, floating damage number (-5) that fades upward
- Unit death: brief fade-out and small particle burst
- Building destruction: larger particle effect
- "Under attack" alert: red flash on minimap at attack location, text alert
- Reference: StarCraft's "your base is under attack" alert, AoE2's flare system

### 4.8 — Resource Nodes on Map

**Impact:** Medium
**Effort:** Low
**Category:** Content / Map Design

**The problem:** The map is a blank 50x50 grid with nothing on it except starting buildings and units. There are no landmarks, no resources to contest, no terrain features. The map has no strategic geography.

**The fix:** Place resource nodes on the map at game init — gold mines, forests, and stone quarries at specific locations that create contestable points of interest.

**Why it matters:** Resource placement is the cheapest way to create strategic geography. A gold mine in the center of the map becomes a point of conflict. Forests near a player's base provide safe wood income. A remote stone quarry requires an expansion to access. These create the "where" decisions that complement "what" and "when."

**Design details:**
- Each player spawn area gets: 1 gold mine (1500g), 1 forest cluster (10 trees, 50w each), 1 stone quarry (800 stone)
- Map center gets: 1 rich gold mine (3000g) — contestable objective
- Map edges get: 2 additional stone quarries, 2 forest clusters — incentivize expansion
- Resource nodes are visible on minimap with distinct colors (gold=yellow, wood=green, stone=gray)
- Reference: AoE2's gold/stone placement around town centers, StarCraft's expansion bases

---

### 5. Balance Snapshot

#### Current Unit Stats

| Unit | HP | Speed | Atk | Armor | Range | Cooldown | Cost |
|------|----|-------|-----|-------|-------|----------|------|
| Worker | 30 | 2.0 | 3 | 0 | 1 | 1.5s | 50g 20w |
| Soldier | 60 | 1.5 | 10 | 2 | 1 | 1.0s | 60g 20w |
| Archer | 40 | 1.8 | 8 | 0 | 5 | 1.2s | 40g 50w |
| Cavalry* | 70 | 3.5 | 12 | 1 | 1 | 1.3s | 80g 30w |

*Proposed new unit

#### DPS Analysis (without counters)

| Unit | DPS | Cost (gold equiv.) | DPS/Cost | Time to kill Soldier |
|------|-----|---------------------|----------|---------------------|
| Worker | 2.0 | 70 | 0.029 | 30s |
| Soldier | 10.0 | 80 | 0.125 | 6s |
| Archer | 6.67 | 90 | 0.074 | 9s |
| Cavalry | 9.23 | 110 | 0.084 | 6.5s |

#### Analysis
- **Soldiers are cost-efficient fighters** — highest DPS/cost ratio. This is correct for a frontline unit.
- **Archers are weaker per-cost but fight at range** — the range advantage justifies lower DPS. 5-tile range means they get 2-3 free volleys before melee arrives.
- **Cavalry are expensive but fast** — their value is mobility, not raw DPS. They pick off workers and retreat.
- **Workers are bad fighters** — intentional. They should flee from military units.

#### Resource Flow
- Starting: 200g, 100w, 50s — enough for 1 barracks (150g 100w) with 50g leftover, OR 2 farms + save for barracks
- Gather rate: ~8g per worker trip (est. 8-10 second round trip) → ~0.8-1.0 gold/sec per worker
- 3 starting workers on gold = ~3 gold/sec initially
- First soldier (60g) affordable in ~20 seconds — this feels right for a 10-20 minute game
- **Concern:** Stone income is slow (5 per trip) and only needed for towers. Consider making stone also required for Town Hall expansion to create a meaningful choice.

#### Projected Game Length
- With proposed economy: first military unit at ~45 seconds, first meaningful army at ~3 minutes, decisive battles at ~8-12 minutes
- Target: 10-20 minutes per match — the proposed numbers should land in this range
- 10Hz tick rate × 15 min average = ~9000 ticks per game

---

### 6. Content Wishlist — "Wouldn't It Be Cool If..."

#### 6.1 — Territory Control Victory
Instead of just annihilation, what if the map had 5 control points (like Northgard's territories)? Hold 3+ for 3 consecutive minutes to win. This creates constant map tension and prevents turtling. Players who lose army fights can still win by splitting attention across multiple fronts.

#### 6.2 — Mercenary Camps (Neutral Structures)
Scattered across the map are neutral mercenary camps. Send gold to a camp to hire its units instantly — no build time, no production building required. Different camps offer different unit types. This creates early-game map objectives beyond resource gathering and rewards scouting/map control. Reference: Warcraft III creep camps + hero items.

#### 6.3 — Seasonal/Timed Map Events
Every 3 minutes, something changes on the map — a river freezes and becomes passable, a gold mine in the center becomes active, a storm reduces visibility for 30 seconds. This creates shared moments of tension and forces players to adapt their strategy to dynamic conditions. Reference: Northgard seasons, They Are Billions waves.

#### 6.4 — Relics & Map Objectives
Place 3 "ancient relics" on the map. Workers can pick them up and return them to the town hall. Each relic grants a permanent bonus: +10% gather speed, +1 unit armor, +20% build speed. This creates early-game objectives that reward aggressive scouting and map control. Reference: AoE2 relics + monks, Dawn of War control points.

#### 6.5 — Commander Abilities (No Hero Unit)
Instead of a hero unit on the field, each player picks a "Commander" before the match that grants 3 timed abilities on cooldowns (90s/120s/180s). Examples: "Inspiration" (selected units +30% speed for 10s), "Supply Drop" (gain 100 gold instantly), "Fortify" (selected building gains 2x HP for 20s). This adds strategic expression without the balance complexity of hero units. Reference: C&C Generals powers, Company of Heroes commander abilities.

---

### 7. Summary

**Overall Score: 2.0/10** (expected for Phase 1 — the foundation is solid, the game loop doesn't exist yet)

**Top 3 Recommendations:**
1. **Combat system** — attack command, damage calc, auto-aggro, counter system. This is the #1 priority.
2. **Resource gathering loop** — workers gather from nodes, return to town hall. Creates the economic engine.
3. **Unit production & building construction** — completes the gather→build→produce→fight loop.

**Most Urgent Balance Fix:** Add armor values to unit definitions (currently missing from code — soldiers should have 2 armor, cavalry 1, others 0) and attack cooldowns (not implemented). Without these, damage calculation has no depth.

**Big Idea:** Commander Abilities — let players pick a "commander" pre-match with 3 timed abilities on cooldowns. Adds strategic expression and asymmetry without the balance nightmare of full factions. Easy to add incrementally (start with 3 commanders, each with 3 abilities).
