# ColonyGame — Game Design Review

*Living document — newest reviews first.*

---

## Review #7 — 2026-03-11

**Reviewer:** Game Design Analyst (automated)
**Build State:** 12/86 tasks complete (14%). Colony 4X engine solid with 6 balance passes, pop growth system, variable build times, practice mode. Client still has old RTS Canvas 2D — no visual representation of 4X state. 101 tests passing.

---

### 1. Pillar Scores

| Pillar | Score | Trend | Notes |
|--------|-------|-------|-------|
| Strategic Depth | 3/10 | = | Six district types with clear tier separation and energy gating. The entire decision space remains single-colony district sequencing. No tech, no fleets, no expansion, no alternative win paths. Strategy ceiling hit in ~3 minutes of play. |
| Pacing & Tension | 2/10 | = | Pop growth (8→10 in ~80 sec) creates a weak early arc. Variable build times (20/30/40 sec) add anticipation tiers. Monthly economic cycles give rhythm. But no mid-game escalation, no crisis, no timer, no climax. Game flatlines after minute 5. |
| Economy & Production | 6.5/10 | ↑ | The strongest pillar and improving. Uniform 100-mineral basic costs, clear 200-mineral tier 2 gate, energy tension (1 Generator powers 2 Industrial OR 1.5 Research), food surplus driving growth speed tiers, variable build times creating decision weight. Well-tuned after 6 balance iterations. Economy works — it just has nowhere to go. |
| Exploration & Discovery | 0/10 | = | Nothing implemented. No galaxy, no systems, no surveying, no anomalies. Zero exploration content. |
| Multiplayer Fairness | 1/10 | = | All players start identical (inherently fair). Practice mode enables solo testing. But no comeback mechanics, no information sharing, no diplomacy, no player interaction whatsoever. Multiplayer is technically functional but experientially absent. |

**Overall: 2.5/10** (average of pillars)

---

### 2. Top 5 Playtester Gaps

These are what a player would notice within 60 seconds of trying to play:

1. **"I can't see my colony."** — The client is still RTS code with Canvas 2D, unit diamonds, minimap, and gold/wood/stone HUD. The gameInit/gameState messages arrive with colony data, but nothing renders it. The game is invisible.

2. **"What am I trying to do?"** — No win condition, no score, no timer, no objective. The game runs indefinitely with no purpose. Players build districts into the void.

3. **"My research numbers go up but nothing happens."** — Research accumulates across three tracks (physics/society/engineering) but there's nothing to spend it on. No tech tree exists. Research districts feel like a waste of energy.

4. **"I filled my planet, now what?"** — 16 district slots fill in ~12-15 minutes. After that, the game is over in practice but not in theory. No second colony, no expansion, no next-phase gameplay.

5. **"Is anyone else even playing?"** — In multiplayer, players share a server but have zero interaction. No chat during gameplay, no shared events, no diplomacy, no combat, no visibility into other players' progress.

---

### 3. Recommendations

#### 3.1 Client Visual Sprint (Three.js + HTML Overlay)

**Impact:** CRITICAL | **Effort:** High | **Category:** Core UX

**The problem:** The game literally cannot be played. The server engine works beautifully but the client renders an RTS that no longer exists. This is the single biggest blocker to everything.

**The fix:** Execute Client UX Sprints 2-5 already in the roadmap. Strip RTS code, add Three.js scene with isometric camera, render districts as colored 3D geometry on a grid, build HTML overlay for resources/build menu/colony info.

**Why it matters:** Nothing else matters until players can see and interact with their colony. Every other recommendation depends on this. Per the project's own memory: "Never defer 3D rendering for HTML-only UI. Visuals are core, not polish."

**Design details:**
- Sprint 2: Strip stale RTS code, add colony 4X containers (~1 session)
- Sprint 3: Three.js scene, isometric camera, terrain grid (~1 session)
- Sprint 4: 3D district rendering with click interaction (~1 session)
- Sprint 5: HTML overlay — resources, build menu, colony info (~1 session)
- Reference: Stellaris colony view (grid of districts with colored icons), Anno 1800 (production overlay on 3D view)

---

#### 3.2 Score Timer Victory Condition

**Impact:** High | **Effort:** Low | **Category:** Core Mechanic

**The problem:** The game has no endpoint. Players build districts with no goal, no tension, no climax. There's no reason to optimize or rush.

**The fix:** Configurable match timer (10/20/30 min). When timer expires, highest VP wins. VP = pops×2 + districts×1 + alloys/50 + total_research/100. Show live VP on a Tab-key scoreboard. 2-minute warning and 30-second final countdown with all scores revealed.

**Why it matters:** A timer transforms aimless building into urgent optimization. Every district choice becomes "is this the highest-VP move in the time remaining?" The countdown creates a natural climax that the game currently lacks entirely.

**Design details:**
- Default: 10 min practice, 20 min multiplayer
- VP formula weights pops highest (growth strategy), districts second (expansion), alloys/research as tiebreakers
- Final 30-second score reveal creates dramatic tension — "am I winning?"
- Reference: Civ VI score victory, Stellaris victory year, Anno 1800 investor milestones

---

#### 3.3 Mini Tech Tree (3-Track, 2-Tier)

**Impact:** High | **Effort:** Medium | **Category:** Core Mechanic

**The problem:** Research districts produce research that accumulates uselessly. Three resource tracks (physics/society/engineering) exist with no consumer. Players learn quickly that Research districts are a trap — they cost energy and produce nothing actionable.

**The fix:** Lightweight 2-tier, 3-track tech tree. Each track has a Tier 1 tech (+25% output, 500 research) and Tier 2 tech (+50% output, 1000 research, requires T1). Players choose one active research per track. Research points per tick reduce remaining cost.

**Why it matters:** Makes Research districts immediately valuable. Creates mid-game decision points (which track to prioritize?). Multiplied output from techs creates a satisfying power curve. Players who invest in research early gain compounding returns — classic 4X tech-rush strategy.

**Design details:**
- Physics T1: Improved Power Plants (+25% Generator), T2: Advanced Reactors (+50% Generator)
- Society T1: Frontier Medicine (+25% pop growth), T2: Gene Crops (+50% Agriculture)
- Engineering T1: Improved Mining (+25% Mining), T2: Deep Mining (+50% Mining)
- Research deducted per tick from accumulated stockpile
- Multiplicative modifiers applied in `_calcProduction`
- Reference: Stellaris tech cards, Civ VI eureka moments (simpler version)

---

#### 3.4 Colony Personality System

**Impact:** Medium | **Effort:** Low | **Category:** Content / Depth

**The problem:** All colonies feel identical. There's no reward for specialization beyond raw resource output. Building 4 mining districts feels the same as building a diversified colony.

**The fix:** When a colony has 4+ districts of the same type, it earns a trait: "Forge World" (4+ Industrial: +10% alloys empire-wide), "Academy World" (4+ Research: +10% research), etc. Only one trait per colony (highest count). Empire bonuses stack across colonies.

**Why it matters:** Creates colony identity and rewards strategic specialization. Players talk about "my Forge World" not "colony 2." Empire-wide bonuses mean colony specialization has cascading benefits, encouraging the "tall vs. wide" strategic tension.

**Design details:**
- Threshold: 4+ same-type districts
- Bonus: +10% empire-wide for that resource
- Stacks across colonies (2 Forge Worlds = +20% alloys)
- Show trait badge on colony list
- Reference: Stellaris planet designations, Endless Space 2 system improvements

---

#### 3.5 Edict System (Influence Spending)

**Impact:** Medium | **Effort:** Low | **Category:** Core Mechanic

**The problem:** Influence (starting 100) has no purpose. It's a dead resource with no production and no consumption. Players ignore it completely.

**The fix:** 4 empire-wide edicts spending influence for temporary bonuses. "Mineral Rush" (50 influence, +50% mining 5 months), "Population Drive" (75 influence, +100% growth 5 months), "Research Grant" (50 influence, +50% research 5 months), "Emergency Reserves" (25 influence, instant +100 energy/minerals/food). Max 1 active edict.

**Why it matters:** Gives influence immediate strategic value. Creates tactical timing decisions — when to pop your edict for maximum impact. With 100 starting influence and no production, it's a limited resource that forces hard choices. "Do I save influence for a late-game research push or spend it now on minerals?"

**Design details:**
- Max 1 active edict at a time
- Duration: 5 months (500 ticks = ~50 seconds)
- No influence production until diplomacy — 100 is your total budget
- Emergency Reserves is the "panic button" — cheap but doesn't scale
- Reference: Stellaris edicts, Civ VI policy cards

---

#### 3.6 Scarcity Seasons

**Impact:** Medium | **Effort:** Low | **Category:** Balance / Tension

**The problem:** The economy is stable and predictable. Once you've built your districts, income is constant. There's no external pressure or variability to force adaptation.

**The fix:** Every 8-12 months (randomized), one resource gets a galaxy-wide -25% production for 3 months. Pre-warning 1 month before. Affects energy/minerals/food/alloys (not research).

**Why it matters:** Punishes over-specialization, rewards diversified economies. Creates shared tension in multiplayer ("mineral scarcity incoming — do I stockpile or pivot?"). The warning period turns scarcity from frustration into strategic opportunity.

**Design details:**
- Interval: 800-1200 ticks between scarcities (randomized)
- Duration: 300 ticks (3 months)
- Warning: 100 ticks (1 month) before onset
- Multiplier: 0.75 on affected resource production
- Never hits research (to avoid punishing the tech strategy)
- Reference: Anno 1800 fertility zones, Stellaris galactic events

---

#### 3.7 Opening Hands (Starting Condition Draft)

**Impact:** Medium | **Effort:** Medium | **Category:** Content / Replayability

**The problem:** Every game starts identically. Same planet, same districts, same resources. After 2-3 games, the optimal opening is solved and every game feels the same.

**The fix:** At game start, present 3 randomly-selected starting conditions. Players pick one within 30 seconds. Options: "Industrial Start" (+200 alloys, 1 Industrial), "Research Rush" (+500 physics, 1 Research), "Mining Boom" (+200 minerals, 1 Mining), "Population Boom" (+4 pops, 1 Housing), "Energy Surplus" (+200 energy, 1 Generator), "Frontier Start" (+100 influence, colony ship token).

**Why it matters:** Different starts create different stories. "I went Research Rush and teched into Advanced Reactors by minute 5" vs "I went Population Boom and had 20 pops by minute 3." Replayability through asymmetric openings — a proven 4X design pattern.

**Design details:**
- 30-second draft timer, auto-select first option if no choice
- 6 options in pool, 3 shown per game
- In multiplayer, all players draft simultaneously (hidden choices)
- Reference: Stellaris origin system, TFT item carousel, MTG draft

---

#### 3.8 In-Game Chat + Event Ticker

**Impact:** Medium | **Effort:** Low | **Category:** Multiplayer UX

**The problem:** Players in the same game have zero awareness of each other. No chat, no notifications, no shared events. Multiplayer feels like parallel single-player.

**The fix:** Extend lobby chat to work during gameplay. Add event ticker narrating significant actions: "Player X built a Research district", "Player Y reached 20 pops", "ALERT: Mineral scarcity in 1 month." Collapsible overlay on game screen.

**Why it matters:** Social presence is what makes multiplayer worth playing. Even without direct interaction mechanics, knowing what others are doing creates competitive pressure and social dynamics.

**Design details:**
- Chat: same WebSocket channel, collapsible panel
- Ticker: server broadcasts `gameEvent` on construction complete, pop milestones (every 5), scarcity warnings
- Rate-limited to avoid spam (max 1 event per player per 10 seconds in ticker)
- Reference: Stellaris notification log, Civ VI "X has built Y" alerts

---

### 4. Balance Snapshot

#### Resource Flow Analysis (Starting State: 8 pops, 4 districts)

| Resource | Production | Consumption | Net/Month | Assessment |
|----------|-----------|-------------|-----------|------------|
| Energy | +6 (gen) | -1 (housing) | **+5** | Healthy. Room for 1 Industrial (costs 3) or 1 Research (costs 4). |
| Minerals | +6 (mining) | 0 | **+6** | Tight. 100/6 = 16.7 months (~2.8 min) per district from income. Starting 300 gives 3 immediate builds. |
| Food | +12 (2 agri) | -8 (pops) | **+4** | Good. Base growth rate. Second housing district pushes to 15 pops before food constrains (12 food, 15 pops = -3 deficit). |
| Alloys | 0 | 0 | **0** | Dead resource. 50 starting stockpile with no sink. Needs tech tree or reinforcement mechanic. |
| Research | +4 each (unemployed) | 0 | **+4 each** | Dead accumulation. Needs mini tech tree urgently. |
| Influence | 0 | 0 | **0** | Dead. 100 starting, no production, no sink. Needs edicts. |

#### Early Game Timeline

| Time | Event | Player Action |
|------|-------|---------------|
| 0:00 | Game start. 300 minerals, 8 pops, 4 districts. | Queue 3 districts (spend 300 minerals). |
| 0:20 | Housing completes (200 ticks). | Pop growth resumes (was at cap? No — 8/10, growing). |
| 0:30 | First basic district completes (300 ticks). | — |
| 0:40 | Second district completes, pop hits 10 (housing cap). | Need housing to continue growing. |
| 0:50 | Third district completes. Mining income funding next build. | Queue next district when minerals reach 100 (~16 months from mining). |
| 2:50 | ~12 months of mining income = ~72 minerals + 100 from food savings. | Can afford another district. Pace: ~1 district every 2-3 minutes from income. |
| 5:00 | ~8-9 districts built, ~14-16 pops. | Mid-game. Colony starting to fill. |
| 10:00 | ~12-14 districts, planet nearing capacity. | Late game. Optimization phase. |
| 15:00 | Planet full (16 districts). Nothing left to do. | **STALL.** Game needs to end here or offer expansion. |

#### Specific Number Tweaks

1. **Starting minerals 300 → 250:** Currently 300 lets you queue 3 districts instantly with nothing left over. 250 forces a choice: 2 districts + 50 buffer, or save for a 200-mineral advanced district. More interesting opening.

2. **Alloy starting stockpile 50 → 0:** Alloys have no use. Having 50 sitting there is confusing. Set to 0 until alloy sinks exist (tech tree Industrial buildings, colony reinforcement, or ships).

3. **Research district output 3/3/3 → 4/4/4:** At 200 minerals + 4 energy/month, research districts are clearly worse than their cost suggests. Bumping to 4 each makes the tech-rush strategy viable once mini tech tree exists.

4. **Industrial district output 3 alloys → 4 alloys:** Same logic — at 200 minerals + 3 energy/month, industrials should produce meaningfully more than basic districts to justify their tier-2 cost.

#### Target Match Length

Current pacing supports a **10-15 minute match** for single-colony gameplay. This aligns well with the browser-based multiplayer target. With expansion (Phase 3), matches should extend to 20-30 minutes. The score timer victory should default to 10 minutes for practice, 20 for multiplayer.

---

### 5. Content Wishlist (Aspirational)

1. **Colony Evolution Visuals** — As colonies grow from 2-3 districts to 16, their 3D appearance evolves: small outposts with scattered buildings → mid-size settlements with connecting paths and ambient lighting → large developed colonies glowing with energy and activity. Visual progression creates pride and emotional attachment to colonies. Think SimCity zone development stages.

2. **Surface Anomalies** — Random tile-based anomalies on the colony grid itself. "Ancient ruins" on tile 7 (excavate for +500 research), "mineral vein" on tile 3 (+50% output to adjacent mining districts), "thermal vent" (+25% energy to adjacent generators). Makes each colony spatially unique and creates a puzzle in district placement. Reference: Anno 1800 island fertilities.

3. **Galactic Radio** — A shared "news broadcast" ticker narrating all player actions in dramatic in-character style. "BREAKING: Commander Zhang reports unprecedented mineral yields on Kepler-7b." "ALERT: Energy crisis grips the Orion sector — generators running at 75%." Creates shared narrative and personality without requiring complex diplomacy systems.

4. **Colony Naming Ceremonies** — Procedural name generation based on planet type with brief flavor text. Arctic: "New Helsinki — a frozen frontier where only the bold survive." Desert: "Dusthaven — the sands hide treasures for those patient enough to dig." Creates memorable moments at colony founding.

5. **Speed Chess Mode** — A 5-minute blitz format where everything runs at 3x speed. Districts build in 7-13 seconds, months pass every 3.3 seconds. Forces rapid decision-making and rewards intuitive play over careful optimization. Perfect for quick browser sessions and tournament play.

---

### 6. Priority Implementation Order

For maximum player experience improvement per development session:

1. **Client UX Sprint 2-5** (CRITICAL — game is unplayable without this)
2. **Score timer victory** (gives the game purpose — low effort, high impact)
3. **Mini tech tree** (makes research valuable — medium effort, high impact)
4. **Colony idle events + energy deficit** (already next in queue — finishes Phase 1)
5. **Edict system** (influence sink — low effort)
6. **Colony personality** (specialization reward — low effort)
7. **Scarcity seasons** (economy variability — low effort)
8. **Opening hands draft** (replayability — medium effort)
9. **In-game chat + event ticker** (multiplayer awareness — low effort)
10. **Balance tweaks** (starting minerals, research/industrial output — trivial)

---

## Review #6 — 2026-03-11

**Reviewer:** Game Design Analyst (automated)
**Build State:** 10/81 tasks complete (12%). Colony 4X engine solid with 6 balance passes, pop growth system, practice mode. Client still has old RTS Canvas 2D — no visual representation of 4X state. 96 tests passing.

---

### 1. Pillar Scores

| Pillar | Score | Trend | Notes |
|--------|-------|-------|-------|
| Strategic Depth | 3/10 | = | Six district types with clear tier separation. Energy gating creates real tension. But the entire decision space is single-colony district sequencing. No tech, no fleets, no expansion, no alternative win paths. Strategy ceiling hit in 3 minutes. |
| Pacing & Tension | 2.5/10 | = | Pop growth (8→10 in ~80 sec) creates a weak early arc. Monthly economic cycles give rhythm. But no mid-game escalation, no crisis, no timer, no climax. Game flatlines after minute 5. |
| Economy & Production | 6/10 | = | The strongest pillar. Uniform 100-mineral basic costs, clear 200-mineral tier 2 gate, energy tension (1 Generator powers 2 Industrial OR 1.5 Research), food surplus driving growth speed. Well-tuned after 6 balance iterations. Economy works — it just has nowhere to go. |
| Exploration & Discovery | 0/10 | = | Nothing exists. No galaxy, no systems, no surveying, no anomalies, no fog of war. The entire Explore pillar is absent. |
| Multiplayer Fairness | 1/10 | +0.5 | Practice mode added — solo play now works. But multiplayer has identical starts, no catch-up mechanics, no scoring, no win condition. "Fairness" is trivially achieved by having nothing to compete over. |
| **Overall** | **2.5/10** | = | |

### 2. Top 5 Things a Playtester Would Notice

1. **"I can't see anything."** — The client renders an RTS game with gold/wood/stone and unit diamonds. The colony 4X engine is invisible. This is the #1 blocker to any meaningful playtest. No amount of server-side balance tuning matters if players can't see their colony.

2. **"What am I trying to do?"** — No win condition, no score, no timer. There's no goal. Even a simple "highest population after 10 minutes wins" would transform the experience from a sandbox into a game.

3. **"I built some districts and now... nothing?"** — After building 4-5 districts, there's nothing new to do. No tech to research, no ships to build, no planets to explore. The game runs out of decisions in 2-3 minutes.

4. **"All my resources are piling up with nowhere to spend them."** — Minerals, alloys, and research accumulate with no sinks. Alloys have zero use. Research has zero use. Influence has zero use. Only minerals and food matter, and only until you've filled your colony.

5. **"Is this multiplayer? I can't tell the other player exists."** — No shared visibility, no scoreboard, no event ticker, no diplomacy. Two players in the same game are playing parallel single-player with no interaction.

### 3. Recommendations

#### 3.1 — Visual Client (Three.js Colony View)

**Impact:** Critical (without this, the game doesn't exist for players)
**Effort:** High (3-5 sprints already planned)
**Category:** Core UX

**The problem:** Players see an RTS with Canvas 2D diamonds, gold/wood/stone, and a minimap. The colony 4X engine is completely invisible.
**The fix:** Already planned as CLIENT UX SPRINT 2-5. This is correctly prioritized. No changes to the plan needed — just execute it.
**Why it matters:** Every other recommendation is meaningless without visual feedback. A beautiful economy that players can't see doesn't create fun.
**Design details:**
- Prioritize Sprint 2 (stale cleanup) and Sprint 3 (Three.js scene) as a single atomic deliverable — don't ship one without the other
- The isometric colony view should feel alive immediately: subtle idle animations, construction scaffolding, pop indicators
- Reference: Anno 1800's island view — players should feel pride looking at their colony

#### 3.2 — Mini Tech Tree (Immediate Research Sink)

**Impact:** High (transforms research from useless to strategic)
**Effort:** Medium (already specced in Phase 2)
**Category:** Core Mechanic

**The problem:** Research districts produce physics/society/engineering that go into a black hole. Players who build Research districts are literally wasting a district slot.
**The fix:** Already designed in design.md under Phase 2 as "Mini tech tree." 2-tier, 3-track tree with percentage bonuses. This should be pulled forward to execute immediately after the visual client.
**Why it matters:** Makes Research districts valuable, adds mid-game decisions ("do I boost generators or mining first?"), and creates divergent strategies between players. In Stellaris, the tech tree is what separates a good player from a great one.
**Design details:**
- 6 techs total: T1 costs 500, T2 costs 1000 (requires T1)
- Physics: Improved Power Plants (+25%), Advanced Reactors (+50%)
- Society: Frontier Medicine (+25% growth), Gene Crops (+50% agriculture)
- Engineering: Improved Mining (+25%), Deep Mining (+50%)
- At base research output (3/type/month from 1 Research district), T1 takes ~167 months = ~28 min. Two Research districts = ~14 min. This pacing is good for a 20-min match — T1 should land around minute 10-14 if you invest early

#### 3.3 — Score Timer Victory Condition

**Impact:** High (transforms sandbox into a game)
**Effort:** Low-Medium (already specced in Phase 1)
**Category:** Core Mechanic

**The problem:** There's no reason to play. No win condition means no tension, no time pressure, no climax.
**The fix:** Already designed in design.md. Configurable match timer with VP formula. Default 10 min practice, 20 min multiplayer.
**Why it matters:** A timer creates urgency. VP scoring creates strategy ("do I maximize pops or stockpile alloys?"). A 2-minute warning creates a climax. This is the cheapest way to make ColonyGame feel like a real game.
**Design details:**
- VP formula: pops×2 + districts×1 + alloys/50 + total_research/100
- At current balance with 1 colony: 20 pops (40) + 12 districts (12) + ~200 alloys (4) + ~3000 research (30) = ~86 VP at 20 min
- Show live VP on Tab scoreboard — creates competitive awareness
- The 30-second "final countdown" with visible scores is brilliant — keep this

#### 3.4 — Edict System (Influence Spending)

**Impact:** Medium-High (gives influence a use, adds tactical layer)
**Effort:** Low (already specced in Phase 2)
**Category:** Core Mechanic

**The problem:** Influence starts at 100 and sits there forever. It's a resource with no purpose.
**The fix:** Already designed — 4 edicts spending influence for temporary bonuses. "Mineral Rush," "Population Drive," "Research Grant," "Emergency Reserves."
**Why it matters:** Influence becomes a strategic reserve — do you spend it early for a mineral rush opening, or save it for a population drive mid-game? Creates timing decisions and player expression. In Stellaris, edicts are how you react to opportunities and crises.
**Design details:**
- Max 1 active edict at a time forces meaningful choice
- 100 starting influence = 1-2 edicts total (budget is entire supply until diplomacy adds production)
- "Emergency Reserves" (25 influence) is the panic button — cheap but less efficient
- "Population Drive" (75 influence, +100% growth for 5 months) is the investment play

#### 3.5 — Colony Personality System

**Impact:** Medium (creates specialization identity, replayability)
**Effort:** Low (already specced in Phase 2)
**Category:** Content / Depth

**The problem:** Colonies are interchangeable. There's no reason to specialize because no bonus rewards it.
**The fix:** Already designed — colonies with 4+ districts of the same type earn traits. "Forge World" (+10% alloys empire-wide), etc.
**Why it matters:** Creates identity and pride ("my Forge World is pumping out alloys"). Creates divergent strategies ("do I go wide with generalist colonies or tall with specialists?"). In Civ VI, district adjacency bonuses serve the same purpose — rewarding thoughtful placement.
**Design details:**
- Threshold of 4 means 25% of a 16-slot planet must be dedicated — a real commitment
- Empire-wide bonuses that stack (2 Forge Worlds = +20%) incentivize multiple colonies of the same type
- Show trait badge prominently in colony list — it should feel like an achievement

#### 3.6 — Event Ticker for Multiplayer Awareness

**Impact:** Medium (creates social layer without galaxy view)
**Effort:** Low (already specced in Phase 1)
**Category:** UX / Multiplayer

**The problem:** In multiplayer, you have zero awareness of other players. Two people in the same game might as well be playing separate instances.
**The fix:** Already designed — scrolling text ticker narrating player actions: "Player X built a Research district," "Player Y's colony reached 20 pops."
**Why it matters:** Before galaxy view exists, this is the only way players know they're competing. Creates awareness, comparison, and urgency. "Player X just hit 20 pops and I'm at 14 — I need to focus on growth." In Stellaris, the notification feed creates a living galaxy even when you're zoomed into one planet.

#### 3.7 — Scarcity Seasons (Dynamic Economy Disruption)

**Impact:** Medium (breaks monotony, rewards diversification)
**Effort:** Medium (already specced in Phase 2)
**Category:** Balance / Depth

**The problem:** Once you figure out the optimal build order, every game plays the same. There's no variation or disruption.
**The fix:** Already designed — every 8-12 months, one resource gets -25% production galaxy-wide for 3 months.
**Why it matters:** Forces adaptation. A mineral scarcity when you're mid-build is a crisis. An energy scarcity when you're running 4 Industrial districts is devastating. Rewards players who diversify vs. players who over-specialize. In Anno 1800, supply chain disruptions create the most memorable moments.
**Design details:**
- 8-12 month random interval at 100 ticks/month means first scarcity hits ~80-120 seconds in
- -25% is noticeable but survivable — creates pressure without being game-ending
- Announce 1 month early: "WARNING: Mineral scarcity detected — mining output will drop 25% next month" — gives players time to react

### 4. Balance Snapshot

#### Resource Flow Analysis (Current State)

| Metric | Value | Assessment |
|--------|-------|------------|
| Starting minerals | 300 | Good — enables 3 immediate builds |
| Starting energy | 100 | Good — comfortable buffer |
| Starting food | 100 | Good — large buffer against early mistakes |
| Starting alloys | 50 | Dead resource — no use case exists |
| Starting influence | 100 | Dead resource — no use case exists |
| Mining income | 6/month (10 sec) | Good — 16.7 months to fund a mining district |
| Generator income | 6/month | Good — 1 Generator powers 2 Industrial |
| Agriculture income | 6/month | Good — feeds 6 pops per farm |
| Pop growth time | 40 sec (base) | Reasonable — 2 growth cycles before housing cap |

#### Colony Saturation Timeline (Single Colony, Optimal Play)

| Time | State | Action |
|------|-------|--------|
| 0:00 | 8 pops, 4 districts, 300 minerals | Build Mining + Housing + Generator (300 minerals spent) |
| 0:30 | 8 pops, 5 districts (Mining done) | Income: +12 minerals/month |
| 0:40 | 9 pops | Natural growth |
| 0:50 | 9 pops, 6 districts (Housing done) | Housing now 15, growth uncapped |
| 1:00 | 9 pops, 7 districts (Generator done) | Energy comfortable |
| 1:20 | 10 pops | Natural growth |
| ~2:00 | 10 pops, ~8 districts | Start building Industrial/Research (200 minerals) |
| ~5:00 | 12-14 pops, 10-12 districts | Colony approaching saturation |
| ~8:00 | 16 pops, 14-16 districts | Colony fully saturated |

**Assessment:** Colony saturates at ~8 minutes on a size-16 planet. For a 20-minute game, this means ~12 minutes of dead time with nothing to do. The mini tech tree and edicts would fill minutes 5-15. Multi-colony expansion (Phase 3) fills minutes 10-20. The pacing needs these systems urgently.

#### District Dominance Check

| District | Output/Cost Ratio | Assessment |
|----------|-------------------|------------|
| Mining | 6 minerals / 100 minerals = 16.7 month payback | Baseline — good |
| Generator | 6 energy / 100 minerals | Good — enables tier 2 districts |
| Agriculture | 6 food / 100 minerals | Good — required for growth |
| Housing | 5 housing / 100 minerals | Essential — no housing = no growth |
| Industrial | 3 alloys / 200 minerals (−3 energy) | Weak — alloys have no use. Will improve with ships |
| Research | 9 total research / 200 minerals + 20 energy (−4 energy) | Weak — research has no use. Will improve with tech tree |

**Key insight:** Industrial and Research are correctly positioned as "investments for the future" — but without the future systems (ships, tech tree), they're traps that waste resources. The mini tech tree is the single most important next system for economy health.

### 5. Content Wishlist — "Wouldn't It Be Cool If..."

1. **Colony Governors with Personality:** Each colony gets a randomly-assigned governor NPC with a personality trait that provides a small bonus but also a quirk. "Admiral Chen" gives +10% alloy production but occasionally demands 50 minerals for "defense projects." "Dr. Voss" gives +15% research but reduces pop growth by 10% ("too busy in the lab"). Creates narrative attachment to colonies and emergent storytelling. Inspired by Stellaris leaders but adapted for shorter match times.

2. **Galactic Market Price Fluctuation:** A shared market where all players can buy/sell resources at prices that fluctuate based on supply and demand. If everyone is dumping minerals, mineral price drops. If no one is producing alloys, alloy price spikes. Creates economic interconnection without requiring formal diplomacy. Inspired by Anno 1800's trading system but galaxy-scale.

3. **Orbital Bombardment Visible from Colony View:** When an enemy fleet bombards your colony, the isometric colony view shows explosions, fires, and districts taking damage in real-time. Your beautiful city getting wrecked should feel visceral and motivating. The player should *want* to build a fleet to stop it. Most 4X games abstract combat into numbers — showing it on the colony you built creates emotional stakes.

4. **"Galactic Wonders" Mega-Projects:** End-game colony buildings that take 5+ minutes to build but provide game-changing effects visible from space. "Dyson Sphere Frame" (unlimited energy), "Galactic Assembly" (diplomatic victory accelerator), "Matter Decompressor" (unlimited minerals). Only one per galaxy — first to complete it gets it. Creates a dramatic end-game race visible to all players on the galaxy map.

5. **Procedural Colony Crises:** At random intervals, colonies face unique crises that require player choice: "Plague outbreak — quarantine (lose 3 pops, save the rest) or treat (spend 200 research, 50% chance of cure, 50% chance it spreads)." "Rebel faction — grant autonomy (-20% production for 3 months) or suppress (spend 50 influence, lose 2 pops)." Creates narrative moments and meaningful decisions within colony management. Inspired by Stellaris events but tuned for faster pace.

### 6. Summary

The engine is well-tuned but the game doesn't exist yet for players. The economy balance work has been thorough and correct — all the fundamentals are solid. The critical path is now:

1. **Visual client** (Sprints 2-5) — make the game visible
2. **Mini tech tree** — make Research districts matter
3. **Score timer victory** — give the game a goal
4. **Edicts + Colony personalities** — give the game depth
5. **Scarcity seasons + Event ticker** — give the game dynamism

The design.md roadmap already has most of these specced. Execution priority should follow impact-to-effort ratio, and the visual client is the gating factor for everything else.

---

## Review #5 — 2026-03-11

**Reviewer:** Game Design Analyst (automated)
**Build State:** 10/82 tasks complete (12%). Colony 4X engine with 6 balance passes complete. Economy fundamentals are solid. Client still has old RTS Canvas 2D code — zero visual representation of 4X state. 89 tests passing.

---

### 1. Pillar Scores

| Pillar | Score | Notes |
|--------|-------|-------|
| Strategic Depth | 3/10 | Six district types with real energy trade-offs and two clear tiers (100 vs 200 minerals). District sequencing on a single colony is the entire decision space. No tech tree, no fleet composition, no expansion dilemma, no alternative victory paths. The strategy ceiling is hit in ~3 minutes. |
| Pacing & Tension | 2.5/10 | Pop growth (8→10 in ~80 sec) creates a natural early arc. Monthly cycles give rhythm. Variable food surplus tiers create meaningful growth speed differences. But no mid-game escalation, no crisis, no win condition, no climax. The game flatlines after minute 5. Up slightly from 2.0 — pop growth adds a weak but real forward pull. |
| Economy & Production | 6/10 | The strongest pillar and genuinely well-tuned after 6 balance iterations. Uniform 100-mineral basic costs simplify early decisions. Energy gating on Industrial/Research creates real tension (1 Generator powers 2 Industrial OR 1.5 Research). Food surplus of +4 drives base growth at 40-sec intervals. Housing headroom (8/10 pops) teaches the mechanic naturally. The economy *works* — it just has nowhere to go after the opening. Up from 5.0 — cost parity, mineral pacing, and pop/housing tuning have eliminated all early-game friction. |
| Exploration & Discovery | 0/10 | Completely absent. No galaxy, no systems, no fog of war, no surveying, no anomalies. |
| Multiplayer Fairness | 3/10 | Symmetric starts, solid lobby system. But no solo mode, no scoreboard, no interaction during gameplay, no catch-up mechanics. |

**Overall: 2.9/10** — Unchanged from Review #4. The economy engine is polished but the game remains invisible and single-dimensional. The balance work has hit diminishing returns — the engine doesn't need more tuning, it needs *systems built on top of it*.

---

### 2. Top 5 Things a Playtester Would Notice

1. **"I literally cannot play this game."** The client renders medieval RTS units with gold/wood/stone. The 4X engine is invisible. This is not a "polish" issue — the game is non-functional for players.

2. **"I solved it in 2 minutes."** Build Mining → Housing → Agriculture → Generator → Industrial. That's the optimal opening. With one colony, no tech, no opponents, and no randomness, there's no reason to deviate. The game is a solved puzzle.

3. **"What's the point?"** No win condition, no score, no timer. Resources accumulate infinitely. There's no tension because there's nothing at stake.

4. **"I can't test alone."** `canLaunch` still requires 2 players. This blocks all solo iteration.

5. **"Nothing ever surprises me."** No events, no notifications, no opponent actions. Districts complete silently. Pops grow silently. The game gives zero feedback.

---

### 3. Deep Analysis

#### The Diminishing Returns Problem

The last 3 development entries (7, 8, 9) were all balance fixes on an economy that was already functional. Generator cost 150→100, starting pops 10→8, mining output 4→6 — these are marginal improvements to a system that already works.

**The economy engine no longer needs balance passes.** It needs:
- A *visual client* so players can interact with it
- *Resource sinks* so accumulation creates strategic pressure
- A *win condition* so optimization has a goal
- *Variety* so games don't feel identical

Every additional balance fix on the existing system has lower marginal value than building the next system layer.

#### Economy Health Check (Post-6 Balance Passes)

| Metric | Value | Assessment |
|--------|-------|------------|
| Starting minerals | 300 | Perfect — 3 immediate builds |
| Basic district cost | 100 (uniform) | Perfect — clean tier |
| Advanced district cost | 200 | Good — clear progression |
| Mining output | 6/month | Good — 16.7 month ROI |
| Generator output | 6/month | Good — powers 2 Industrial |
| Food surplus at start | +4/month | Good — comfortable, drives base growth |
| Pop growth rate | 40 sec/pop (base) | Good — noticeable, not instant |
| Housing headroom | 2 slots (8/10) | Good — teaches mechanic |
| Energy budget | 6 prod / 3+4 consume | Tight and meaningful |

**Verdict: Economy is ready. Stop tuning it. Build on it.**

#### Where Player Time Goes (20-Minute Session Projection)

| Phase | Time | Activity | Fun? |
|-------|------|----------|------|
| Opening | 0-2 min | Spend 300 minerals on 3 districts, watch pop growth | Yes — active, novel |
| Early | 2-5 min | Mine for next district, hit housing cap, build Housing | OK — slower but purposeful |
| Mid | 5-10 min | Colony filling up, resources accumulating with no sink | No — decision desert |
| Late | 10-20 min | Colony full, nothing to do, game doesn't end | Dead time |

The game provides ~5 minutes of engagement. The target is 20-40 minutes. The gap is closed by: tech tree (minutes 5-15), galaxy expansion (minutes 8-20), win condition (creates urgency throughout), events (break monotony).

---

### 4. Recommendations

#### R1: STOP BALANCE WORK — Ship the Client

**Impact:** Critical
**Effort:** High (but already well-designed as 5-part sprint)
**Category:** Core / UX

**The problem:** 6 of 10 completed tasks are economy balance fixes. The economy is done. Meanwhile, the client still renders an obsolete RTS from 2 iterations ago. No player can experience any of the work that's been done.

**The fix:** The next 5 development iterations should be:
1. Solo/Practice mode (Sprint 1/3)
2. Stale client cleanup (Sprint 2/5)
3. Three.js scene + isometric view (Sprint 3/5)
4. 3D district rendering (Sprint 4/5)
5. HTML overlay UI (Sprint 5/5)

**No more server-side-only work until the client can render colonies.** Variable build times, energy deficit consequences, and event notifications are nice server features — but they're invisible without a client. Implement them *after* the visual layer exists.

**Why it matters:** The memory feedback says it clearly: "Never defer 3D rendering for HTML-only UI. Visuals are core, not polish." The project has been doing exactly what this feedback warns against — building invisible mechanics. Time to course-correct.

---

#### R2: Mini Tech Tree as First Resource Sink

**Impact:** High (doubles strategic depth, gives research + alloys purpose)
**Effort:** Medium
**Category:** Core Mechanic

**The problem:** Research and alloys accumulate with zero purpose. 2 of 6 district types (Industrial, Research) are objectively bad choices because their outputs are wasted. This makes the strategy space smaller than the 6 district types suggest.

**The fix:** The mini tech tree (already designed in Phase 2 of design.md) should be the first post-client feature:
- 3 tracks × 2 tiers = 6 techs
- Tier 1: 500 research, Tier 2: 1000 research
- Immediate gameplay impact: "+25% Mining output" transforms Research districts from waste to investment

**Why it matters:** In every great 4X, the tech tree is the spine of long-term strategy. "Which tech should I rush?" is the question that makes a 20-minute session feel different each time. Right now there is no such question.

---

#### R3: Score Timer Victory

**Impact:** High (gives the game a purpose)
**Effort:** Low
**Category:** Core Mechanic

**The problem:** The game runs forever with no objective.

**The fix:** Already fully designed in Phase 1 of design.md. Configurable timer (10/20/30 min). VP formula: pops×2 + districts×1 + alloys/50 + research/100.

**Why it matters:** A timer + score converts "aimless sandbox" into "optimization race." Even the current one-colony depth becomes engaging when you have 10 minutes to maximize score.

---

#### R4: Colony Personality Traits

**Impact:** Medium (makes specialization rewarding)
**Effort:** Low
**Category:** Core Mechanic

**The problem:** The optimal play is always a balanced district mix. There's no reward for specialization.

**The fix:** Already designed in Phase 2: 4+ same-type districts earns a named trait with empire-wide +10% bonus. "Forge World," "Academy World," "Mining Colony."

**Why it matters:** Creates the signature 4X dilemma of specialization vs. self-sufficiency. Stacking bonuses across multiple colonies (once expansion exists) rewards going wide.

---

#### R5: Scarcity Seasons

**Impact:** Medium (breaks monotony, rewards diversification)
**Effort:** Low
**Category:** Content / Balance

**The problem:** The economy is completely predictable. Nothing ever disrupts it. Players who find the optimal build order never need to adapt.

**The fix:** Already designed in Phase 7 — every 8-12 months, one resource gets -25% production for 3 months. Galaxy-wide, affects all players.

**Why it matters:** Scarcity seasons are the cheapest way to add dynamism to a static economy. A mineral scarcity mid-game forces players to adapt their build plan. An energy scarcity with lots of Industrial districts creates a genuine crisis. This is the simplest mechanic that makes each game *feel different*.

**Design consideration:** Move this from Phase 7 to Phase 2. It requires only `_processMonthlyResources` changes and a random timer — no client rendering needed. It's a server-side feature that creates real gameplay variety.

---

#### R6: Expanded Opening Variety — Starting Planet Randomization

**Impact:** Medium (makes each game feel different from turn 1)
**Effort:** Low
**Category:** Content

**The problem:** Every game starts identically — Continental, size 16, 8 pops, same districts. The first minute is rote.

**The fix:** Already designed in Phase 1 — random habitable planet type and size (12-20). Requires planet type bonuses (also Phase 1) to be meaningful. In multiplayer fairness mode, all players get the same random type/size.

**Why it matters:** The opening is the most-replayed part of any 4X game. If every opening is identical, replayability dies. Random starts create "this game I have a Desert world so I should lean Mining" moments from turn 1.

---

### 5. Balance Snapshot

**Economy status: COMPLETE.** No further balance work recommended until new systems (tech, ships, multi-colony) are added.

| Parameter | Current Value | Status |
|-----------|--------------|--------|
| Basic district cost | 100 minerals (uniform) | Finalized |
| Advanced district cost | 200 minerals | Finalized |
| Build times | 300 ticks (uniform) | Ready for tiering (200/300/400) but not urgent |
| Generator output | 6 energy/month | Finalized |
| Mining output | 6 minerals/month | Finalized |
| Agriculture output | 6 food/month | Finalized |
| Industrial output | 3 alloys/month | Finalized |
| Research output | 3×3/month | Finalized |
| Starting resources | 100E/300M/100F/50A/100I | Finalized |
| Starting pops | 8 (housing cap 10) | Finalized |
| Pop growth | 40/30/20 sec tiers | Finalized |
| Food surplus at start | +4/month | Finalized |

**Target match duration:** 10 min (practice), 20 min (multiplayer). Current single-colony depth supports ~5 min of engagement. Tech tree + expansion + win condition needed to fill the remaining time.

---

### 6. Content Wishlist

1. **"Opening Hands"** — At game start, present 3 random "starting conditions" to choose from (like Slay the Spire's card draft): e.g., "Industrial Start: +200 alloys, start with 1 Industrial district" vs "Frontier Start: +100 influence, smaller planet but 2 colony ships" vs "Research Rush: +500 physics, start with 1 Research district." Creates asymmetric openings and replayability without complex faction design.

2. **"The Galactic Bazaar"** — A shared NPC market where players trade surplus resources at fluctuating prices. Prices adjust based on all players' production: if everyone mines minerals, mineral prices crash. Selling alloys when nobody produces them yields huge returns. Creates emergent economic strategy without direct player-to-player diplomacy. Simpler than EVE but same principle.

3. **"Colony Traditions"** — As colonies age, they develop random "traditions" based on their history: a colony that survived a food shortage gains "Rationing Culture" (+20% food efficiency forever). A colony that built 3 Research districts in a row gains "Academic Heritage" (+10% research speed). Makes every colony feel unique and rewards varied play styles.

4. **"Expedition Mode"** — A solo roguelike mode: given a random planet, random starting conditions, and a series of escalating challenges (asteroid impact at month 5, pirate raid at month 10, plague at month 15), survive as long as possible. High scores on a leaderboard. Perfect for the browser format — quick sessions, high replayability, solo-friendly.

5. **"Whisper Network"** — Anonymous multiplayer messaging. Send secret messages like "The player in the east is building alloys — prepare for war." Recipients don't know who sent it. Creates paranoia and social dynamics that named chat can't. Perfect for short browser matches where deep diplomacy isn't feasible.

---

### 7. Roadmap Updates

**Changes to design.md:**
- Added Phase 2 task: "Scarcity seasons" (moved from Phase 7 for earlier delivery as it only needs server-side monthly processing changes)
- Added Phase 2 task: "Opening Hands" starting condition draft for game variety

---

### 8. Priority Ranking for Next Development Sprint

1. **Solo/Practice Mode** (Sprint 1/3 — unblocks everything)
2. **Stale Client Cleanup** (Sprint 2/5 — remove RTS code)
3. **Three.js Scene + Isometric Colony View** (Sprint 3/5 — make the game visible)
4. **3D District Rendering** (Sprint 4/5 — make the game interactive)
5. **HTML Overlay UI** (Sprint 5/5 — make the game informative)
6. **Variable Build Times** (quick server fix, now visible via UI)
7. **Event Notifications** (now visible via toast UI)
8. **Score Timer Victory** (gives the game a point)
9. **Mini Tech Tree** (doubles strategic depth)
10. **Colony Personality Traits** (rewards specialization)

**Critical path: Solo → Cleanup → Three.js → Districts → UI.** The client sprint is non-negotiable. Everything else is invisible without it.

---

## Review #2 — 2026-03-11

**Reviewer:** Game Design Analyst (automated)
**Build State:** 9/78 tasks complete (12%). Colony 4X engine operational, economy loop running, 6 balance passes done. Client still has old RTS renderer — no visual representation of 4X state.

---

### 1. Pillar Scores

| Pillar | Score | Notes |
|--------|-------|-------|
| Strategic Depth | 3/10 | Players can choose which districts to build and in what order, creating basic economic trade-offs (energy vs minerals vs food vs growth). But there's only one colony, no tech tree, no fleet composition, no diplomacy, no alternative win paths. The "opening build order" is currently the entire strategy space. |
| Pacing & Tension | 2/10 | Pop growth creates a natural early arc (build agriculture → grow pops → need housing → expand). Monthly resource ticks give rhythm. But there's no mid-game escalation, no crisis, no win condition. The game runs indefinitely with no climax. |
| Economy & Production | 5/10 | The strongest pillar. Six resource types with real production chains. District costs create genuine trade-offs (100 minerals for basics, 200 for advanced). Energy consumption gates Industrial/Research. Food surplus drives pop growth speed. Housing caps create expansion pressure. The fundamentals are solid and well-balanced after 6 iterations. |
| Exploration & Discovery | 0/10 | No galaxy. No systems. No fog of war. No surveying. No anomalies. The entire exploration pillar is unimplemented. |
| Multiplayer Fairness | 3/10 | Lobby works, symmetric starts (everyone gets Continental size 16 with identical districts). But can't solo test (requires 2 players), no catch-up mechanics, no scoreboard, no way to gauge relative position. |

**Overall: 2.6/10** — Up from 1.6. The economy engine is genuinely good, but the game is invisible (no client) and has no strategic variety beyond district sequencing.

---

### 2. Top 5 Things a Playtester Would Notice

1. **"I can't see anything."** The client still renders an RTS with medieval units, selection boxes, gold/wood/stone HUD. The colony 4X engine is running server-side but the client shows *nothing* from it. This is the single biggest gap — the game is literally unplayable.

2. **"There's only one thing to do."** The entire game is "pick which district to build next on your one colony." No tech to research, no ships to build, no planets to explore, no enemies to fight. The build order puzzle gets stale within 3 minutes.

3. **"When does this end?"** No win condition, no score, no timer. The game runs forever. Players have no goal to pursue and no way to know if they're winning.

4. **"I can't play alone."** `canLaunch` requires 2 players. There's no practice/solo mode. Iterating on gameplay requires finding another person every time. This kills development velocity.

5. **"Nothing ever happens."** No events, no notifications, no surprises. Districts complete silently. Pops grow silently. Food deficits kill pops silently. There's no feedback loop telling the player what's going on.

---

### 3. Deep Analysis

#### Economy Health Check

The economy is in good shape after 6 balance passes:

| Metric | Value | Assessment |
|--------|-------|------------|
| Starting minerals | 300 | Good — 3 immediate builds at 100 each |
| Basic district cost | 100 minerals | Good — uniform, simple |
| Advanced district cost | 200 minerals | Good — clear tier distinction |
| Mining output | 6/month | Good — funds a basic district every 16.7 months (2.8 minutes) |
| Generator output | 6 energy/month | Good — powers 2 Industrial or 1.5 Research |
| Food surplus at start | +4/month (12 prod - 8 consume) | Good — comfortable but not wasteful |
| Pop growth at start | 1 pop per 40 sec (base rate, surplus=4) | Good — noticeable but not instant |
| Housing headroom | 2 slots (8/10) | Good — teaches housing mechanics |
| Generator cost | **150 minerals** | **Problem — only district still at 150, breaks cost parity** |

**Key tension:** The economy works well for the first 3-5 minutes. After that, players hit a choice desert — they've built their opening districts and have nothing else to spend on. The game needs a resource sink (tech, ships, buildings, edicts) to create mid-game economic pressure.

#### District Balance

| District | Cost | Output | ROI (months) | Assessment |
|----------|------|--------|--------------|------------|
| Housing | 100 | 5 housing, -1 energy | N/A (enabling) | Good — necessary for growth |
| Generator | 150 | 6 energy | — | **Overpriced vs peers** |
| Mining | 100 | 6 minerals | 16.7 | Good baseline |
| Agriculture | 100 | 6 food | — | Good — enables growth |
| Industrial | 200 | 3 alloys, -3 energy | — | Fine — alloys have no use yet |
| Research | 200 + 20E | 3×3 research, -4 energy | — | Fine — research has no use yet |

**Problem:** Alloys and research are produced but have zero sinks. No tech tree consumes research. No shipyard consumes alloys. Players building Industrial or Research districts are wasting resources. This makes the "interesting choice" space smaller than it looks — optimal play is Housing/Mining/Agriculture/Generator only.

#### Pacing Arc

| Phase | Time | What Happens | Player Feeling |
|-------|------|-------------|----------------|
| Opening (0-2 min) | Ticks 0-1200 | Spend 300 starting minerals on 3 districts. Watch pops grow 8→10. | Good — active decisions |
| Early (2-5 min) | Ticks 1200-3000 | Mining income funds ~1 district per 2.8 min. Pops hit housing cap. Build housing → more growth. | OK — slower but logical |
| Mid (5+ min) | Ticks 3000+ | **Nothing new happens.** Same loop: mine → build → grow. No tech, no events, no new systems unlock. | **Boredom — game stalls** |

The game needs a mid-game inflection point. In Stellaris, that's first contact + expansion. In Civ, it's meeting other civs + choosing a victory path. Here, there's nothing.

---

### 4. Recommendations

#### R1: Visual Client (Three.js Colony View)

**Impact:** Critical (game is literally unplayable without it)
**Effort:** High (3-part sprint already planned)
**Category:** Core / UX

**The problem:** The game engine runs but players can't see it. The client renders an obsolete RTS. This blocks all playtesting.

**The fix:** Execute the CLIENT UX SPRINT (tasks 2-5 in Phase 1). This is already well-designed in the roadmap. The key priority order should be:
1. Solo mode (unblocks testing)
2. Stale code cleanup (remove RTS renderer)
3. Three.js scene + isometric view
4. 3D district rendering
5. HTML overlay UI

**Why it matters:** Until players can see and interact with colonies, nothing else matters. Every other recommendation depends on this.

**Design details:**
- Prioritize *information density* over beauty. A player needs to see at a glance: what's built, what's building, resource rates, pop status.
- Reference: Anno 1800's island view — functional first, pretty second.

---

#### R2: Solo/Practice Mode

**Impact:** High (unblocks all playtesting and development iteration)
**Effort:** Low (modify one function + add button)
**Category:** UX / Core

**The problem:** `canLaunch` requires 2 players. Developers and playtesters can't test the game alone.

**The fix:** Already designed (Sprint 1/3). Allow `maxPlayers=1` to bypass ready check.

**Why it matters:** This is a force multiplier for everything else. Every subsequent feature can be tested 10x faster with solo mode.

---

#### R3: Resource Sinks — Make Alloys and Research Useful

**Impact:** High (doubles the strategy space overnight)
**Effort:** Medium (tech tree is Phase 4, but a lightweight version could ship sooner)

**The problem:** Alloys and research accumulate with no purpose. 2 of 6 district types are effectively dead choices. Players who build Industrial or Research are making a suboptimal play.

**The fix:** Implement the **edict system** (Phase 2) as the first resource sink — influence buys temporary empire bonuses. Then implement a **mini tech tree** (3 techs per track, 2 tiers) as the first real research sink. Even simple techs like "+25% Mining output" transform research districts from waste to investment.

**Why it matters:** In Civ VI, the moment you start researching your first tech, the game transforms from "place tiles" to "pursue a strategy." Same principle here.

**Design details:**
- Tier 1 techs should cost ~500 research total (achievable in ~3 minutes with 1 Research district)
- Each tech should visibly change gameplay: new district type, output bonus, or unlock
- Alloy sink: even before ships, allow "Reinforce Colony" (spend 100 alloys for +5 housing, simulating building upgrades). Gives alloys immediate value

---

#### R4: Event Notifications and Feedback Loop

**Impact:** High (transforms silent simulation into responsive game)
**Effort:** Low (server-side event emitter + client toast system)
**Category:** UX / Polish

**The problem:** Everything happens silently. Districts complete, pops grow, food runs out — the player gets zero feedback. In Stellaris, every completed construction triggers a sound + notification + popup. Here, nothing.

**The fix:** Implement the colony idle event notifications (already designed in Phase 1). Key events:
- Construction complete (with district name)
- Build queue empty ("Colony idle — nothing being built")
- Pop milestone (every 5 pops)
- Housing full warning
- Food deficit alert

**Why it matters:** Games communicate through feedback loops. Build → wait → *notification* → decide → build. Without the notification step, the loop is broken and players disengage.

**Design details:**
- Events should be brief, non-blocking (toast notification, not modal)
- Sound cue on construction complete (even a simple beep) massively improves feel
- Rate-limit to prevent spam: max 1 notification per 2 seconds

---

#### R5: Win Condition — Score Timer

**Impact:** High (gives the game a point)
**Effort:** Low
**Category:** Core Mechanic

**The problem:** The game runs forever with no objective. Players have no reason to optimize.

**The fix:** Add a simple score-based victory with a configurable timer. When the timer expires, highest score wins.

**Scoring:**
- Pops: 2 VP each
- Districts built: 1 VP each
- Alloys stockpiled: 1 VP per 50
- Research accumulated: 1 VP per 100 (total across all types)

**Why it matters:** A timer + score transforms an aimless sandbox into a competitive optimization puzzle. "Get the highest score in 10 minutes" is a complete game loop even with just colony management.

**Design details:**
- Default timer: 10 minutes for quick matches, 20 minutes for standard
- Show live score on Tab scoreboard
- 2-minute warning notification
- Final 30 seconds: score visible to all players (creates tension)
- Reference: Factorio's speedrun community shows that optimization against a clock is deeply engaging even without combat

---

#### R6: Colony Specialization Rewards

**Impact:** Medium (adds strategic depth to district placement)
**Effort:** Low
**Category:** Core Mechanic / Content

**The problem:** All colonies play identically. There's no reason to specialize — you always want a balanced mix of districts.

**The fix:** Implement the colony personality system (already in Phase 2): 4+ districts of the same type earns a trait with an empire-wide bonus (+10% to that resource type).

**Why it matters:** This creates a genuine strategic dilemma: do you build a balanced colony that's self-sufficient, or specialize for the empire-wide bonus and accept local deficits? This is the kind of "meaningful choice" that defines good 4X games.

**Design details:**
- Trait names add personality: "Forge World," "Breadbasket," "Academy World"
- Stacking across colonies rewards expansion
- Show trait badge prominently in colony list
- Reference: Stellaris planet designations, which create the same specialization-vs-balance tension

---

#### R7: Planet Type Bonuses

**Impact:** Medium (makes colony location matter)
**Effort:** Low
**Category:** Content / Strategy

**The problem:** All planets are functionally identical. Continental, Ocean, Desert — same districts, same output, same strategy.

**The fix:** Already designed in Phase 1: each planet type gets distinct mechanical bonuses (Continental +1 all, Ocean +50% Agri +2 slots, Desert +50% Mining +25% Energy, etc.)

**Why it matters:** When planets differ, expansion becomes strategic. "Should I colonize the Ocean world for food or the Desert world for minerals?" is exactly the kind of choice that makes 4X games engaging.

---

#### R8: Build Queue QoL

**Impact:** Medium (reduces frustration, increases engagement)
**Effort:** Low
**Category:** UX / Polish

**The problem:** Players can't see total costs of queued items, can't cancel efficiently, can't estimate completion times.

**The fix:** Already designed in Phase 2 — show total mineral cost, warn on overspend, 50% refund on cancel, estimated time display.

**Why it matters:** Every friction point in the build loop is a moment where a player might disengage. Smooth UX keeps players in flow state.

---

### 5. Balance Snapshot

#### Current Numbers Assessment

| Parameter | Current | Recommended | Reasoning |
|-----------|---------|-------------|-----------|
| Generator cost | 150 minerals | **100 minerals** | Only basic district not at 100. Break cost parity. Already flagged as next fix. |
| Build times (all) | 300 ticks (30 sec) | **Tiered: 200/300/400** | Housing should be fast (unlocks growth), advanced should feel weighty. Already planned. |
| Starting resources | 100E/300M/100F/50A/100I | Good | 300 minerals for 3 immediate builds is well-calibrated |
| Pop growth (base) | 400 ticks (40 sec) | Good | First pop at ~40 sec feels right — noticeable but earned |
| Housing base | 10 | Good | 2 headroom from 8 starting pops teaches the mechanic |
| Monthly cycle | 100 ticks (10 sec) | Good | Fast enough to feel active, slow enough for planning |

#### Target Match Duration Analysis

With current systems, a 20-minute match would look like:
- **0-2 min:** 3 opening builds from starting minerals
- **2-8 min:** ~2 more districts from mining income, pops growing to ~15-18
- **8-15 min:** ~3 more districts, pops at ~20-25, some specialization emerging
- **15-20 min:** Colony near full (12-14 districts on size 16 planet)

**Problem:** With only one colony and no other systems, the game runs out of meaningful decisions by minute 10. The target 20-40 minute match requires either multiple colonies (galaxy + expansion) or deeper single-colony mechanics (tech + buildings + edicts).

**Short-term fix:** A 10-minute score timer makes the current depth sufficient. A single colony with 10 minutes of optimization is a tight, engaging puzzle.

---

### 6. Content Wishlist

1. **"Sector Crises"** — Every few minutes, a random crisis hits: pirate raid (lose a district if you don't have military), solar storm (generators offline for 30 sec), plague (pop growth halted for 1 minute). Creates moments of reactive play in what's otherwise a pure builder. Unlike Stellaris's endgame crisis, these are small, frequent, and test preparedness rather than military strength.

2. **"Colony DNA"** — Each colony develops a randomly-generated "trait chain" based on the first 5 districts built. Build 3 Mining first? Colony becomes a "Deep Core Extraction Site" with unique bonuses and visual identity. This makes build order feel like character creation rather than optimization. No other 4X does this — colonies are usually blank slates.

3. **"The Galactic Market"** — Instead of direct player-to-player trade, implement a shared market where surplus resources are "sold" and scarce resources cost more. Price fluctuates based on all players' production. Creates emergent economic warfare: if you corner the mineral market, everyone else's builds slow down. Reference: EVE Online's player market, simplified for short matches.

4. **"Terraform Chains"** — Allow players to change planet types through expensive, multi-step projects. Desert → Arid → Continental takes 3 research tiers and enormous resources but transforms a mediocre world into a powerhouse. Creates a long-term investment arc that competes with expansion (go wide vs go tall).

5. **"Whisper Diplomacy"** — In multiplayer, allow anonymous messages: "Someone is willing to trade 500 minerals for a ceasefire." Recipients don't know who sent it. Creates intrigue and bluffing in a way that named diplomacy can't. Perfect for browser-game social dynamics.

---

### 7. Roadmap Updates

Added to design.md:
- Phase 1: Score timer victory condition (configurable, VP-based)
- Phase 2: Lightweight mini tech tree (2 tiers, 3 techs per track) as an early deliverable before full Phase 4
- Phase 2: Alloy spending via colony reinforcement

See design.md for specific task entries.

---

### 8. Priority Ranking for Next Development Sprint

1. **Solo/Practice Mode** (unblocks everything)
2. **Stale Client Cleanup** (remove RTS code)
3. **Three.js Scene + Colony View** (make the game visible)
4. **Event Notifications** (make the game communicative)
5. **Score Timer** (give the game a point)
6. **Generator cost parity** (quick balance fix)
7. **Variable build times** (quick pacing fix)
8. **Colony personality traits** (strategic depth)

The critical path is **Solo Mode → Client Cleanup → Three.js → Overlay UI**. Everything else can be interleaved but nothing matters until players can see and play the game.

---

## Review #1 — 2026-03-11

**Reviewer:** Game Design Analyst (automated)
**Build State:** Pre-implementation (0/50 tasks complete, codebase still contains old RTS)

---

### 1. Pillar Scores

| Pillar | Score | Notes |
|--------|-------|-------|
| Strategic Depth | 2/10 | Design doc outlines good systems (districts, tech, fleets, diplomacy) but nothing is implemented. The existing RTS code has zero strategic choices — just move units. |
| Pacing & Tension | 1/10 | No game arc exists. No win conditions, no crisis moments, no escalation curve. |
| Economy & Production | 1/10 | Old RTS has gold/wood/stone with no production or spending mechanics. The *designed* 6-resource system is solid on paper but untested. |
| Exploration & Discovery | 1/10 | No galaxy, no fog of war, no surveying. Flat 50x50 grid. |
| Multiplayer Fairness | 3/10 | Lobby/room system works. Symmetric spawn points exist. But no game to be fair *in*. |

**Overall: 1.6/10** — Expected for a freshly-pivoted project with no implementation.

---

### 2. Top 5 Things a Playtester Would Notice

1. **"There's no game here."** Launching a match drops you into an RTS with medieval units on a flat grid. No colonies, no galaxy, no 4X loop.
2. **"I can't build anything."** No construction, no economy, no resource production. You have gold/wood/stone that can't be spent.
3. **"Where's the map?"** No galaxy to explore, no star systems, no planets. Just a blank isometric grid.
4. **"What am I supposed to do?"** No objectives, no tutorial, no win condition. No UI guidance.
5. **"It looks like a prototype."** Canvas 2D diamonds and rectangles. No visual identity suggesting space or colonies.

---

### 3. Recommendations

*(Recommendations from Review #1 omitted for brevity — see git history. Many were adopted in Entry 3.)*

---

## Review #2 — 2026-03-11

**Reviewer:** Game Design Analyst (automated)
**Build State:** 4/59 tasks complete (7%). Colony 4X engine implemented server-side. Client still renders old RTS.

*(Full Review #2 omitted for brevity — see git history. Key recs: fix energy balance, fix food deficit, make game visible with HTML UI, implement pop growth, planet type bonuses. Energy balance was fixed in Entry 4.)*

---

## Review #3 — 2026-03-11

**Reviewer:** Game Design Analyst (automated)
**Build State:** 5/65 tasks complete (8%). Colony 4X engine with rebalanced energy economy. No visual client.

*(Full Review #3 omitted for brevity — see git history. Key recs: HTML colony UI, pop growth, planet bonuses, colony personality traits, game speed controls, stale client cleanup, build discount fix. Food deficit and housing were fixed in Entry 5.)*

---

## Review #4 — 2026-03-11

**Reviewer:** Game Design Analyst (automated)
**Build State:** 5/64 tasks complete (8%). Colony 4X engine with balanced energy economy, fixed food surplus, correct housing. No visual client. 69 tests passing.

---

### 1. Pillar Scores

| Pillar | Score | Notes |
|--------|-------|-------|
| Strategic Depth | 3/10 | Six district types with real energy trade-offs. Generator-to-consumer ratio (1:2 for Industrial, 1:1.5 for Research) creates genuine tension. But only one decision axis — district selection on a single colony. No tech, no fleet composition, no expansion-vs-consolidation dilemma. A 4X needs at least three competing systems to generate strategic depth. |
| Pacing & Tension | 2/10 | Monthly economic cycle (10s) and 30s build times provide rhythm. Food surplus (+2/month) gives a stable start. But no pop growth means no escalation, no events disrupt the economy, no opponents interact, no win condition creates urgency. The game is a pleasant but static optimization. |
| Economy & Production | 5.5/10 | **Best pillar.** Energy budget is tight and meaningful — building Industrial or Research requires planning Generator capacity first. Food is balanced (12 production vs 10 consumption). Housing (base 10) matches starting pops exactly, creating a clear "build Housing to grow" signal once pop growth exists. Build costs are tiered sensibly (100 for basics, 200 for advanced). **Missing:** pop growth (the engine that makes economy matter), planet bonuses (the thing that makes economies differ), and any resource sinks beyond construction. |
| Exploration & Discovery | 1/10 | Completely absent. No galaxy, no systems, no surveying, no anomalies. The single starting colony is the entire universe. |
| Multiplayer Fairness | 3/10 | Symmetric Continental size-16 starts with identical resources. Lobby/room system is solid. But zero interaction during gameplay — no shared map, no diplomacy, no awareness of other players. Fairness is trivially achieved when players can't affect each other. |

**Overall: 2.9/10** — The economy engine is becoming genuinely well-tuned, but the game remains invisible and single-dimensional. The gap between "engine quality" and "player experience" is the widest it's been — the foundation is sound, but nothing is built on it yet.

---

### 2. Top 5 Things a Playtester Would Notice

1. **"I can't see anything."** The client still renders the old RTS — Canvas 2D with units, buildings, Projection module, gold/wood/stone HUD, minimap. The colony 4X engine runs silently on the server. A player who launches a game sees medieval diamond-shaped units on a grid while their colony economy ticks away invisibly. This is the single biggest blocker to any form of playtesting or fun.

2. **"Nothing grows."** Pop growth is not implemented. Starting 10 pops stay at 10 forever. After building ~6 districts (one per worker beyond the 4 pre-built), every meaningful decision is exhausted within 3-4 minutes. There's no "next thing" pulling the player forward. The economy produces resources that accumulate with nothing to spend them on.

3. **"Every session is identical."** One colony, one planet type (Continental, size 16), same starting resources, no tech tree, no opponents. The optimal build order is solvable in a single session and never varies: build Mining → build Industrial → build Generator → repeat. There are no external pressures to force adaptation.

4. **"Where's the other player?"** Two or more players connect to the same server but have zero awareness of each other. No shared map, no notifications, no in-game chat. It's parallel solitaire. The multiplayer infrastructure is solid (rooms, readying, launching), but the game it launches is completely isolated per player.

5. **"There's no goal."** No win condition, no score, no timer. The game never ends. Resources accumulate infinitely. A player who perfectly optimizes their colony has no reward, no "you win" moment, no comparison to others. Without a goal, there's no tension and no reason to make trade-offs.

---

### 3. Recommendations

Ordered by impact-to-effort ratio. The first two are **existential** — without them, nothing else can be evaluated.

#### 3.1 Stale Client Cleanup + HTML Colony UI — Make the Game Exist

**Impact:** Critical (blocks ALL playtesting)
**Effort:** Medium (two connected tasks, one session)
**Category:** UX / Foundation

**The problem:** The client renders a dead RTS. The colony engine is invisible. No amount of server-side balance work matters if nobody can see or interact with the game.

**The fix (two steps):**

**Step A — Strip RTS client code:**
- Remove Canvas 2D game renderer, Projection module references, unit selection/movement, minimap, gold/wood/stone HUD from `app.js`
- Update `gameInit` handler to parse colony 4X state: `{ colonies, players, yourPlayerId, tick }`
- Update `gameState` handler to receive `{ tick, players, colonies }` with resource/production data
- Remove `projection.js` script tag from `index.html` (if present)

**Step B — Build HTML colony UI overlay:**
- **Resource bar** (top): 6 resource types — Energy (⚡ yellow), Minerals (⛏ gray), Food (🌾 green), Alloys (⚙ orange), Research (🔬 blue), Influence (👑 purple). Each shows: stockpile count + net income/month in green (+) or red (−).
- **Colony panel** (center): district grid as clickable colored tiles. Built districts are filled tiles, empty slots are dark outlines. Color by type: green=agriculture, yellow=generator, gray=mining, blue=industrial, purple=research, white=housing.
- **Build menu**: click empty slot → dropdown/panel with district options. Gray out unaffordable options. Show cost, build time, and production preview for each.
- **Info sidebar**: pop count (employed/unemployed), housing (used/capacity), month counter (tick/100), construction queue with progress bars and cancel buttons.
- **Wire commands**: district option click → `buildDistrict` message. Built district click → demolish option → `demolish` message.

**Why it matters:** This is the difference between "a server that runs math" and "a game." Dwarf Fortress proved that function over form works — an ASCII interface is infinitely better than no interface. Until this exists, every other recommendation is theoretical. This unblocks balance testing, pacing evaluation, and multiplayer interaction design.

**Design details:**
- Use pure HTML/CSS positioned over the game screen div — no Three.js needed yet
- Resource colors: energy=#f1c40f, minerals=#95a5a6, food=#2ecc71, alloys=#e67e22, research=#3498db, influence=#9b59b6
- Show month number prominently (players need temporal orientation)
- Construction progress as percentage or "12s remaining"

#### 3.2 Pop Growth — The Engine That Makes Everything Matter

**Impact:** Critical (without this, the economy is static and finite)
**Effort:** Low (small code addition to game-engine.js)
**Category:** Core Mechanic

**The problem:** 10 pops forever. After building 6 more districts (one per available worker), the game is "solved." There's no growth, no pressure, no escalation. The economy produces surplus resources that pile up with nothing to spend them on. Pop growth transforms a static puzzle into a dynamic engine.

**The fix:**
- Add `colony.growthProgress` counter, incrementing each tick when food surplus > 0
- Base growth: +1 pop every 400 ticks (40 seconds real-time) when food surplus > 0
- Accelerated: surplus > 5 → every 300 ticks, surplus > 10 → every 200 ticks
- Housing cap: pops cannot exceed `_calcHousing()`. Growth halts at cap. This makes Housing districts meaningful.
- Overcrowding: if pops somehow exceed housing (shouldn't happen with cap), -50% production penalty as a safety valve
- Existing starvation mechanic (pop death at food < 0) stays as-is

**Why it matters:** Pop growth is the flywheel of every 4X economy. Build Agriculture → food surplus → pops grow → need more Housing → build Housing → need more jobs → build districts → need more food → loop. Without this flywheel, the game is a spreadsheet exercise with a known optimal answer. With it, every decision creates downstream consequences that force further decisions.

**Design details:**
- Starting state: 10 pops, 10 housing, +2 food/month surplus
- First new pop at ~40 seconds. By minute 5: ~17 pops (need 2 Housing districts by then)
- At 17 pops with 20 housing (base 10 + 2 Housing districts): 17 workers, 13 job districts + 2 Housing = 15 total districts. Colony is nearing its 16-slot capacity.
- This creates a natural early-game arc: minutes 0-1 (build), 1-3 (optimize), 3-5 (housing crunch), 5+ (need second colony)
- Reference: Stellaris pop growth drives all mid-game decisions; Civ VI population growth gates district construction

#### 3.3 Early Mineral Pacing — Remove the Waiting Wall

**Impact:** High (directly affects moment-to-moment fun in minutes 2-8)
**Effort:** Low (number changes only)
**Category:** Balance

**The problem:** After spending the starting 200 minerals on 1-2 builds, Mining output of 4/month means waiting 25-50 seconds (2.5-5 months) per 100-mineral build funded purely by income. In a browser game targeting 20-40 minute sessions, a 50-second wait between meaningful actions in the early game is lethal. Players will tab away.

**The fix:**
- Increase Mining district output: 4 → 6 minerals/month
- Increase starting minerals: 200 → 300 (funds 2-3 immediate builds instead of 1-2)
- Reduce Mining build cost: 150 → 100 minerals (same tier as Agriculture/Housing)

**Why it matters:** The early game is the tutorial. If a player's first 5 minutes are "click, wait, wait, wait, click," they leave. Mining at 6/month with 300 starting minerals means: build 3 cheap districts immediately, then Mining income funds a new build every ~17 seconds (1.7 months). That's an action every 17 seconds — close to the sweet spot for browser 4X.

**Design details:**
- Mining at 6/month pays back its 100-mineral cost in 16.7 months = 167 seconds ≈ 2.8 minutes (was 6.25 minutes). Acceptable.
- 300 starting minerals allows: immediate Mining (100) + Agriculture (100) + 100 reserve. Or: Mining + Housing (100) + 100 reserve. Meaningful opening choice.
- Generator stays at 150 minerals — it should be slightly more expensive since energy is the enabling resource.

#### 3.4 Planet Type Bonuses — Why Colonization Will Matter

**Impact:** High (prerequisite for interesting expansion decisions)
**Effort:** Low-Medium (multiplier logic in `_calcProduction`)
**Category:** Core Mechanic

**The problem:** Planet types exist in `PLANET_TYPES` but have no mechanical effect beyond habitability. When galaxy/colonization arrives, without bonuses the decision is always "pick the biggest planet." Zero strategic nuance.

**The fix:** Each habitable type gets a production bonus applied as a multiplier in `_calcProduction`:

| Planet Type | Bonus | Strategic Identity |
|-------------|-------|--------------------|
| Continental | +1 to all district base output (flat, not %) | Best generalist, ideal capital |
| Ocean | +50% Agriculture, +2 max district slots | Food powerhouse, wide builder |
| Tropical | +25% Agriculture, +25% Research | Balanced science/breadbasket |
| Arctic | +50% Research | Dedicated science world |
| Desert | +50% Mining, +25% Energy | Industrial backbone |
| Arid | +25% Mining, +25% Alloy output | Military forge world |

**Why it matters:** This is the answer to "where should I expand?" Without bonuses, colonization is solved (biggest = best). With bonuses, an Arctic size-10 world might be better for a tech-rush player than a Continental size-14. It enables player archetypes and replayability. Endless Space 2's system resource distribution serves the same design purpose.

**Design details:**
- Store bonuses in `PLANET_TYPES`: `continental: { bonuses: { all: 1 } }`, `ocean: { bonuses: { agriculture: 1.5 }, extraSlots: 2 }`, etc.
- Apply in `_calcProduction` after base output, before consumption
- Continental's +1 is additive (6 energy → 7, 4 minerals → 5), all others are multiplicative
- Show planet bonuses in colony panel and future colonization target list

#### 3.5 Colony Personality Traits — Reward Specialization

**Impact:** Medium (adds strategic layer and narrative)
**Effort:** Medium
**Category:** Content / Core Mechanic

**The problem:** Building 6 Mining districts feels the same as building 3 Mining + 3 Generator. Raw numbers change, but there's no emergent identity or empire-wide consequence for specialization.

**The fix:** When a colony reaches 4+ districts of a single type, it earns a personality trait:

| Trait | Trigger | Empire-Wide Bonus |
|-------|---------|-------------------|
| Academy World | 4+ Research | +10% research all colonies |
| Forge World | 4+ Industrial | +10% alloy production all colonies |
| Breadbasket | 4+ Agriculture | +10% food all colonies |
| Power Hub | 4+ Generator | +10% energy all colonies |
| Mining Colony | 4+ Mining | +10% mineral production all colonies |

- One trait per colony (highest district count wins)
- Empire bonuses stack across colonies (2 Forge Worlds = +20% alloys)
- Trait badge visible in colony list and colony panel
- Trait lost if district count drops below 4 (demolish)

**Why it matters:** Traits name player strategy and reward commitment. "I'm building a Forge World" is more motivating than "I'm stacking Industrial districts." It creates a meta-optimization layer: generalize for resilience or specialize for empire bonuses? Civ VI's district adjacency bonuses serve this same purpose.

#### 3.6 Game Speed Controls + Match Timer — Flexible Sessions

**Impact:** Medium
**Effort:** Low
**Category:** UX / Multiplayer

**The problem:** All games run at fixed speed with no end condition. Browser games need flexible match lengths. A 30-minute session is too long for some, too short for others.

**The fix:**
- Speed multiplier modifies `MONTH_TICKS`: Speed 1 = 200 (slow), Speed 3 = 100 (default), Speed 5 = 50 (fast)
- Host sets speed in room creation, can change during gameplay
- Pause toggle (host only)
- Optional match timer (15/30/45/60 min, or unlimited) set in room creation
- At timer expiry, highest VP wins: VP = colonies×10 + techs×5 + fleets×2

**Why it matters:** Speed 5 enables 10-15 minute lunch-break games. Speed 1 enables hour-long epics. A timer creates urgency and a guaranteed end point — essential for multiplayer where one player might stall.

#### 3.7 Visible Multiplayer — Break the Solitaire

**Impact:** Medium-High (transforms the experience from solo to social)
**Effort:** Low-Medium
**Category:** Multiplayer / UX

**The problem:** Players in the same game have zero awareness of each other. It's parallel solitaire. Even before fleets, combat, or diplomacy, players should *know* opponents exist and feel competitive pressure.

**The fix — implement in order:**
1. **In-game chat:** Extend the existing lobby chat to work during gameplay. Simple text chat visible to all players in the room. Low effort, high social value.
2. **Scoreboard overlay** (Tab key): show all players with colony count, total pops, resource income rates, month counter. No secrets — in a 20-minute browser game, information asymmetry isn't the fun part; outplaying with the same info is.
3. **Event ticker:** "Player X built their 5th Mining district" / "Player Y's colony reached 20 pops." Narrates the game, creates awareness, drives competitive impulse.
4. **Simple resource gifting:** Send resources to another player via a UI button. Enables informal cooperation before formal diplomacy. Already in design.md.

**Why it matters:** Multiplayer games live or die on player interaction. Even the minimal version — chat + scoreboard — transforms "I'm optimizing my economy" into "I'm optimizing my economy and she's ahead on alloys, I need to pivot." The scoreboard alone adds a win condition without any complex victory logic.

---

### 4. Balance Snapshot

#### Current Economy (Post-Entry 5 Fixes)

| District | Produces | Consumes | Build Cost | Build Time |
|----------|----------|----------|------------|------------|
| Housing | 5 housing | 1 energy/month | 100 minerals | 300 ticks (30s) |
| Generator | 6 energy | — | 150 minerals | 300 ticks |
| Mining | 4 minerals | — | 150 minerals | 300 ticks |
| Agriculture | 6 food | — | 100 minerals | 300 ticks |
| Industrial | 3 alloys | 3 energy/month | 200 minerals | 300 ticks |
| Research | 3 phy/soc/eng | 4 energy/month | 200 minerals + 20 energy | 300 ticks |

**Starting State:**
- Resources: 100 energy, 200 minerals, 100 food, 50 alloys, 100 influence
- Colony: Continental, size 16, 10 pops, 10 housing (base)
- Pre-built: 1 Generator (6 energy), 1 Mining (4 minerals), 2 Agriculture (12 food)
- Net/month: +5 energy, +4 minerals, +2 food, 0 alloys. 6 unemployed pops → +6 research each type
- 4 workers employed (4 districts), 6 unemployed, 12 district slots remaining

**Energy Budget (the key constraint) — Still Sound:**
- 1 Generator (6 energy) powers: 2 Industrial (6 energy) OR 1 Research + 2 Housing (4+2 energy)
- Late-game 16-slot colony: ~3 Generator, 3 Industrial, 2 Research, 2 Housing, 3 Mining, 2 Agriculture, 1 flex = 16 slots. Energy: 18 produced, 15 consumed. Viable. ✓

**Mineral Economy — Too Slow:**
- Mining at 4/month means 37.5 seconds per 100-mineral build from income alone
- After spending starting 200 on 2 builds, players wait ~38 seconds before their next action
- **Recommended fix:** Mining → 6/month, starting minerals → 300, Mining build cost → 100. This cuts the gap between actions to ~17 seconds. See Rec 3.3.

**Food Economy — Stable but Thin:**
- +2 food/month surplus with 10 pops. Works for now.
- Once pop growth exists, each new pop adds 1 food consumption. At 12 pops: 12-12 = 0 net. Player must build 3rd Agriculture before pop 13.
- This creates a good "I'm about to outgrow my food supply" pressure moment. ✓

**Housing Economy — Clean Design:**
- Base 10 housing = 10 pops. Perfect starting match.
- Each Housing district adds 5 housing for 100 minerals + 1 energy/month.
- Player hits housing cap at pop 10, needs Housing before pop 11 (once growth exists).
- First Housing district at pop 10 → capacity 15. Second at pop 15 → capacity 20. Colony maxes out around 16-20 pops depending on layout.

**Projected Match Pacing (with recommended fixes):**
- Minutes 0-2: Spend 300 starting minerals on 3 districts. Immediate choices.
- Minutes 2-5: Mining income (6/month) funds a new build every ~17s. Pops growing toward 15.
- Minutes 5-10: Housing pressure, energy budgeting, colony nearing capacity. Mid-game.
- Minutes 10-15: Colony saturated at 16 districts. Need second colony (once expansion exists) or tech bonuses.
- Minutes 15-30: Multi-colony management, fleet building, diplomacy. Late game.
- This is a healthy arc for a 20-40 minute browser game. ✓

---

### 5. Content Wishlist — Making ColonyGame Distinctive

#### 5.1 "Living Colonies" — Environmental Storytelling Through Economy

Instead of static district tiles, let colony events emerge from economic states. A colony with 5+ Agriculture districts occasionally spawns a "Harvest Festival" event (+10% food for 3 months). A colony with energy deficit gets "Rolling Blackouts" (visual flickering, -20% research for 2 months). These are cheap to implement (just conditional checks on existing state) but make colonies feel alive rather than spreadsheet rows. Anno 1800's production chain events serve this role.

#### 5.2 "Galactic Radio" — Shared Narrative Ticker

Already in design.md Phase 7, but should be prioritized much earlier. A scrolling ticker at the top of screen narrating galaxy events in-character: "BREAKING: Commander Vex reports mineral boom on Kepler-7b." Turns raw game events into shared story. Even with just colony events (pre-galaxy): "NEW: Player Vex's colony 'Dusthaven' declared a Forge World." Creates multiplayer awareness for almost zero implementation cost.

#### 5.3 "Colony DNA" — Procedural Names and Personality

When founding a colony, generate a name based on planet type: Arctic → "New Helsinki" / "Frostheim" / "Boreas Station." Desert → "Dusthaven" / "Sunward" / "Dune Prime." Players remember "Frostheim fell" more than "Colony e7 was conquered." Combined with personality traits, colonies become characters in the game's story.

#### 5.4 "Scarcity Seasons" — Periodic Economic Disruption

Every 8-12 months (randomized), one resource gets a galaxy-wide scarcity modifier (-25% production for 3 months). All players must adapt simultaneously. "The Mineral Drought of Month 47" becomes shared story and competitive opportunity. Simple conditional in `_processMonthlyResources`, high drama. This is the 4X equivalent of a market crash — it rewards diversified economies and punishes over-specialization.

#### 5.5 "Quick Match" Preset — 15-Minute Browser Sessions

Pre-configured mode: start with 2 colonies, Speed 5, 15-minute timer, VP scoring, small galaxy (20 systems), no tech tree beyond Tier 2. For lunch-break games. Browser 4X games *must* have a quick-play option or they lose the casual audience entirely. Most Slither.io sessions are 5-15 minutes — that's the competition for attention.

---

### 6. Priority Sequence

The recommended implementation order for maximum player-experience impact:

1. **Pop growth** (Rec 3.2) — 30 min. Adds the core growth loop that makes everything else matter.
2. **Early mineral pacing** (Rec 3.3) — 15 min. Removes the early-game wait wall.
3. **Build discount fix** — 15 min. Dead code cleanup, prepares for colonization.
4. **Stale client cleanup** (Rec 3.1 Step A) — 1 hour. Removes RTS cruft from app.js.
5. **HTML colony UI** (Rec 3.1 Step B) — 2 hours. Makes the game playable for the first time.
6. **Planet type bonuses** (Rec 3.4) — 1 hour. Adds strategic variety.
7. **Colony personality traits** (Rec 3.5) — 1 hour. Rewards specialization.
8. **Game speed controls** (Rec 3.6) — 30 min. Enables flexible match lengths.
9. **Visible multiplayer** (Rec 3.7) — 1-2 hours. Breaks the solitaire.

Items 1-5 are the critical path to a playable game. Items 6-9 enrich the experience.

---

### 7. Design Roadmap Updates

Added to `devguide/design.md`:
- Phase 1: In-game chat during gameplay, scoreboard overlay (Tab key), event ticker for player actions
- Phase 2: Colony personality traits system (already existed but refined with stacking details)
- Phase 6: Match timer with VP scoring, surrender vote
- Phase 7: Galactic radio ticker (already existed), scarcity seasons event system, colony procedural naming

See `devguide/design.md` for full task descriptions.

---

## Review #5 — 2026-03-11

**Reviewer:** Game Design Analyst (automated)
**Build State:** 7/70 tasks complete (10%). Colony 4X engine with pop growth, balanced economy. No visual client. 79 tests passing.

---

### 1. Pillar Scores

| Pillar | Score | Notes |
|--------|-------|-------|
| Strategic Depth | 3.5/10 | Six district types with energy trade-offs and pop growth creating a food/housing growth spiral. The economy has one genuine strategic loop: agriculture → growth → housing → jobs → energy budget. But only one colony, no tech choices, no opponents, no expansion-vs-consolidation dilemma. The growth loop adds dynamism but not depth — there's still one optimal build order per session. |
| Pacing & Tension | 3/10 | Pop growth transforms the economy from static to dynamic. The game now has a natural arc: build → grow → housing crunch → food pressure → slot saturation. First pop arrives at ~40 seconds, housing cap hits around minute 5-6, colony maxes out at 16 districts around minute 8-10. This is a real early/mid-game arc. But no late game exists — once the colony saturates, there's nothing left to do. No crisis, no opponents, no win condition. |
| Economy & Production | 6/10 | **Strongest pillar and improving.** The flywheel works: food surplus → pop growth → workers fill districts → need housing → housing costs energy → need generators. Energy budget is the binding constraint. Pop growth at 3 speed tiers (40s/30s/20s per pop) creates responsive feedback. Housing cap at base 10 forces an early Housing build. Food math is tight: 12 production at start, 10 consumed by starting pops, +2 surplus. Each new pop eats into that surplus, forcing Agriculture expansion at pop 12-13. **Remaining gaps:** mineral income too slow (4/month), no resource sinks beyond construction, no alloy spending, no tech to invest research into. |
| Exploration & Discovery | 1/10 | Completely absent. Single starting colony is the entire universe. |
| Multiplayer Fairness | 3/10 | Symmetric starts, solid lobby system. Zero in-game interaction. |

**Overall: 3.3/10** — Up from 2.9. Pop growth is the inflection point — the economy is now a living system rather than a static puzzle. But the gap between "engine quality" (solid) and "player experience" (nonexistent) is at maximum. The server has a genuinely interesting colony simulation running that no player can see or interact with.

---

### 2. Top 5 Things a Playtester Would Notice

1. **"I still can't see anything."** The client renders medieval RTS — Canvas 2D diamonds, gold/wood/stone HUD, minimap, unit selection. The colony engine with pop growth, food pressure, and housing constraints runs invisibly on the server. This has been the #1 problem for 4 consecutive reviews. The server-side game is now interesting enough to play; the client is the only thing stopping it.

2. **"The mineral wall is painful."** After spending 200 starting minerals on 2 builds (30 seconds of construction), Mining income of 4/month means 25+ seconds between actions. With pop growth now creating demand for Housing, Agriculture, and Generator districts, the mineral bottleneck is more frustrating than ever — the game creates urgency through growth but can't deliver the building speed to match.

3. **"The colony filled up and then... nothing."** Pop growth creates a compelling 8-10 minute arc of growth and optimization. But once the colony hits 16 districts and ~16-20 pops, there's nowhere to go. Resources pile up. No second colony, no tech tree, no ships. The growth loop revs up and then slams into a wall with no off-ramp.

4. **"Every game is the same."** Continental size-16 planet, same resources, no opponents, no events, no randomness. The optimal build order can be solved once and repeated forever. Planet type bonuses and multi-planet starts would add replayability, but currently there's zero variance between sessions.

5. **"There's still no goal."** No win condition, no timer, no score. Resources accumulate, pops max out, and the game continues indefinitely. The growth loop needs somewhere to go.

---

### 3. Recommendations

The game's server-side economy is now genuinely well-designed. **The critical path is making it visible and playable.** All recommendations are ordered by impact-to-effort ratio.

#### 3.1 Stale Client Cleanup + HTML Colony UI — The Only Thing That Matters

**Impact:** Critical (blocks ALL playtesting, ALL feedback, ALL fun)
**Effort:** Medium (2-3 hours for both steps)
**Category:** UX / Foundation

**The problem:** This is Review #5 and the same recommendation is #1 for the fifth time. The server now has a genuine game — pop growth, food pressure, housing constraints, energy budgeting, construction queues. A player who could see and interact with this system would have 8-10 minutes of engaging colony management. But the client shows a dead RTS with gold/wood/stone and diamond-shaped units.

**The fix:** Same as Review #4 Rec 3.1. Two steps:
1. Strip RTS code from app.js (Projection, units, Canvas 2D renderer, minimap, gold/wood/stone)
2. Build HTML overlay: resource bar, district grid, build menu, pop/housing display, construction queue

**Why it matters:** Every other recommendation is theoretical until players can see and click. The server-side game is "ready for alpha" — the client is "ready for deletion."

**Design notes for the HTML UI now that pop growth exists:**
- Show growth progress bar (current growthProgress / growthTarget ticks) next to pop count
- Show food surplus prominently — this is now the driver of growth speed
- Indicate growth speed tier: "Growing (slow)" / "Growing (fast)" / "Growing (rapid)"
- Show housing headroom: "Pops: 10/10 ⚠" when at cap, "Pops: 10/15" when room to grow
- Color-code the food net income: green when surplus > 0 (pops growing), red when deficit (pops dying)

#### 3.2 Early Mineral Pacing — Feed the Growth Loop

**Impact:** High (eliminates the early-game dead zone)
**Effort:** Low (number changes + test updates)
**Category:** Balance

**The problem:** Pop growth made this worse. The engine now creates demand for districts (food, housing, generators) as pops grow, but mineral income (4/month = 1 build every 25-37s) can't keep up. The game says "you need to build!" while simultaneously saying "wait 30 seconds." That contradiction kills momentum.

**The fix:** Already in design.md — Mining 4→6, starting minerals 200→300, Mining cost 150→100.

**Why it matters more now:** With pop growth, the first pop arrives at tick 400 (~40s). At that point, a player with 1 Mining district has earned 16 minerals from income (4×4 months). Combined with whatever's left of starting minerals, they need to be able to build Housing (100) and Agriculture (100) in roughly that window. At 6/month mining + 300 starting minerals, this math works. At 4/month + 200 starting, it doesn't.

#### 3.3 Single-Player Mode — Remove the 2-Player Launch Barrier

**Impact:** High (currently CANNOT playtest alone)
**Effort:** Low (room manager change + optional AI stub)
**Category:** UX / Development

**The problem:** `canLaunch` requires 2+ players with all non-hosts ready. A developer or solo tester cannot launch a game alone. This means every playtest session requires opening two browser tabs, entering two names, creating a room, joining, readying, then launching. For rapid iteration on balance and UI, this friction is unacceptable.

**The fix:**
- Add a "Practice" or "Solo" mode: allow room creation with `minPlayers: 1` (or a "solo" flag)
- Solo rooms can be launched immediately by the host without requiring a second player
- Alternatively, add a `singlePlayer` option to room creation that bypasses the ready check
- No AI needed — just running the economy solo is the immediate use case

**Why it matters:** Every developer, every playtester, every first-time player will want to try the game solo first. Requiring two clients to see your own colony manage is a dev-velocity killer.

**Design details:**
- Room creation dialog: add a "Practice Mode" checkbox that sets `maxPlayers: 1` and auto-launches
- `canLaunch`: if `room.maxPlayers === 1` or `room.practiceMode`, skip the 2-player requirement
- This also enables future single-player content (tutorial, scenarios)

#### 3.4 Planet Type Bonuses — Prerequisite for Meaningful Expansion

**Impact:** High (when galaxy/colonization arrives, this is what makes expansion interesting)
**Effort:** Low (multiplier logic in _calcProduction)
**Category:** Core Mechanic

**The problem:** Same as Review #4 — planet types have no mechanical effect. Now more urgent because the single-colony game is nearing its content ceiling. When multi-colony arrives, without bonuses every colony plays identically.

**The fix:** Same as Review #4 Rec 3.4 — production multipliers per planet type.

#### 3.5 Colony Personality Traits — End-Game Goal for Single Colony

**Impact:** Medium-High (gives the saturated colony something to achieve)
**Effort:** Medium
**Category:** Core Mechanic / Content

**The problem:** The colony fills up at 16 districts around minute 8-10. After that, nothing happens. With personality traits, a player has a goal: "specialize this colony to earn a trait." The trait's empire-wide bonus creates value even before multi-colony exists — it's a concrete achievement.

**The fix:** Same as Review #4 Rec 3.5 — 4+ districts of one type triggers a named trait with empire-wide bonuses.

**New design note:** With pop growth, getting 4+ districts of one type is a real commitment. On a 16-slot planet with 4 starting districts, the player builds 12 more. To get 4 Industrial: 4×3 = 12 energy consumed, requiring 2 Generators. That's 6 slots committed (4 Industrial + 2 Generator) for a Forge World trait. Trade-off: that's 6 slots NOT used for Mining/Agriculture/Housing, meaning slower growth, tighter food, or less raw minerals. This is a genuine strategic decision now.

#### 3.6 Starting Planet Variety — Break Session Repetition

**Impact:** Medium (replayability without galaxy generation)
**Effort:** Low
**Category:** Content / Replayability

**The problem:** Every game starts on Continental, size 16. No variance. With pop growth making each session play out a real 8-10 minute arc, the identical starting conditions mean that arc is always the same.

**The fix:**
- On game start, randomly assign starting planet type from habitable types (Continental, Ocean, Tropical, Arctic, Desert, Arid)
- Randomize planet size within a range: 12-20 district slots
- Requires planet type bonuses (Rec 3.4) to be meaningful
- Show planet type and size in the colony panel so players know what they're working with
- In multiplayer, all players still get the same type/size for fairness (or allow asymmetric for more chaos)

**Why it matters:** This is the cheapest way to add replayability. An Arctic size-12 game plays completely differently from an Ocean size-20 game — different build orders, different pressures, different specialization paths. Combined with personality traits, this creates real variety.

#### 3.7 Construction Queue QoL — Respect Player Time

**Impact:** Medium
**Effort:** Low
**Category:** UX / Polish

**The problem:** With pop growth creating constant demand for new districts, players will be queuing builds frequently. The current system allows max 3 items in queue, which is fine. But there's no way to reorder the queue, and no visibility into what the queue will cost total. Players will queue 3 builds, run out of minerals for the 3rd, and wonder why nothing is building.

**The fix:**
- Show total queue cost in the build menu (minerals remaining after all queued builds)
- Warn if queuing a build that will leave resources negative
- Allow queue cancellation with partial refund (50% of spent resources returned)
- Show estimated completion time for each queue item: "Done in 30s / 60s / 90s"

**Design details:**
- Current behavior: resources deducted on queue. This is correct — keeps the mental model clean
- Partial refund on cancel prevents the "I queued the wrong thing and lost 200 minerals" feel-bad
- Completion time estimates need to account for game speed (when speed controls arrive)

---

### 4. Balance Snapshot

#### Economy with Pop Growth (Post-Entry 6)

**Starting State (unchanged):**
- Resources: 100 energy, 200 minerals, 100 food, 50 alloys, 100 influence
- Colony: Continental, size 16, 10 pops, 10 housing
- Pre-built: 1 Generator, 1 Mining, 2 Agriculture
- Net/month: +5 energy, +4 minerals, +2 food, 0 alloys, +6 research each (from 6 unemployed)

**Growth Timeline (current values):**
- Tick 0-400 (0-40s): 10 pops, food surplus +2 → base growth speed. First pop at tick 400.
- Tick 400 (40s): 11 pops. Food surplus drops to +1. Still growing but slower demand headroom.
- Tick 800 (80s): 12 pops. Food surplus = 0. **Growth halts.** Player must build 3rd Agriculture (cost: 100 minerals) to resume growth. At 4/month mining income, player has earned only 32 minerals from income by this point. Starting 200 minerals must fund this.
- After 3rd Agriculture: 18 food production, 12 consumed → +6 surplus → **fast growth** (300 ticks/pop = 30s).
- Tick ~1100 (110s): 13 pops. At +6 surplus, fast growth. But housing cap at 10 blocks this! **Player must have built Housing by now or growth stops at pop 10.**

**Critical insight:** The housing cap of 10 means pop growth stops immediately unless the player builds Housing first. With 10 starting pops and 10 base housing, the VERY FIRST pop requires a Housing district. This creates a hard dependency: before any pop growth benefit, player must spend 100 minerals on Housing. Combined with the 4/month mining income, this means the first ~25 seconds are "build Housing or growth is wasted."

**This is actually good design** — it forces an early decision point. But it needs to be VISIBLE in the UI. A player who doesn't realize housing = 10/10 will wonder why their colony isn't growing.

**Mineral Economy (still too slow):**
- Optimal opening with 200 starting minerals: Housing (100) + Agriculture (100) = 0 remaining
- Now entirely reliant on 4/month Mining income. Next build in 25-37 seconds depending on cost.
- At 6/month Mining + 300 starting minerals (recommended fix): Housing (100) + Agriculture (100) + Mining (100) = 0 remaining, but now have 2 Mining districts producing 12/month. Next 100-mineral build in ~8.3 months = 83 seconds ≈ 1.4 minutes. Much better.

**Projected Match Arc (with mineral fix applied):**
| Phase | Time | Pops | Districts | Player Activity |
|-------|------|------|-----------|-----------------|
| Opening | 0-30s | 10 | 4→7 | Spend 300 minerals on Housing + Agriculture + Mining |
| Early Growth | 30s-2m | 10→13 | 7→9 | Pops growing, build Generator + Industrial/Research |
| Mid Game | 2-5m | 13→18 | 9→13 | Energy budgeting, choose specialization path |
| Late Game | 5-8m | 18→20 | 13→16 | Colony saturating, optimize last slots, earn personality trait |
| Post-Saturation | 8m+ | 20 | 16 | Colony maxed. Nothing to do (until second colony/tech exists) |

This is a healthy 8-minute arc. The post-saturation problem (minute 8+) is solved by multi-colony expansion, which requires galaxy generation.

---

### 5. Content Wishlist

#### 5.1 "Colony Pressure Events"

At key pop milestones, fire small event notifications: Pop 15 → "Colony growing rapidly — housing demand increasing." Pop 20 → "Colony at maximum capacity — expansion recommended." First Forge World trait → "Your industrial output attracts galactic attention." These cost almost nothing to implement (conditional checks on existing state) and create narrative beats in the growth arc.

#### 5.2 "Economic Dashboard"

A toggleable panel showing production/consumption graphs over time. X-axis = months, Y-axis = resource amounts. Players can see their energy budget tightening, food surplus narrowing, mineral income growing. Gives the economy a visual heartbeat. Spreadsheet players (a huge 4X demographic) will love this.

#### 5.3 "Colony Challenges"

Per-session micro-objectives: "Reach 20 pops in 5 minutes," "Build a Forge World before month 30," "Maintain food surplus > 5 for 10 consecutive months." Rewards: cosmetic badge, bonus starting resources next match. Adds replayability and goals even in single-colony mode. Idle games like Cookie Clicker use achievement systems to sustain engagement — same principle applied to 4X.

#### 5.4 "Rival AI Shadow"

Even before full AI opponents, show a "ghost rival" — a simulated economy running optimal play, shown as a line on the scoreboard. "You're ahead of the AI by 3 pops." Gives solo players something to beat. Cheap to implement: just run the growth math forward with a fixed build order and compare.

#### 5.5 "Environmental Hazards"

Each planet type has a unique periodic hazard: Arctic → "Ice Storm" (-50% energy for 2 months), Desert → "Sandstorm" (-50% mining for 2 months), Ocean → "Tsunami" (lose 1 random district), Tropical → "Plague" (lose 2 pops). Frequency: ~once per 20 months. Creates planet-specific risk/reward profiles and makes planet choice more interesting.

---

### 6. Priority Sequence (Updated)

1. **Early mineral pacing** (Rec 3.2) — 15 min. Removes the mineral wall that now compounds with pop growth.
2. **Build discount fix** — 15 min. Dead code cleanup.
3. **Single-player mode** (Rec 3.3) — 15 min. Enables solo testing.
4. **Stale client cleanup** (Rec 3.1 Step A) — 1 hour. Strip RTS cruft.
5. **HTML colony UI** (Rec 3.1 Step B) — 2-3 hours. Make the game playable.
6. **Planet type bonuses** (Rec 3.4) — 1 hour. Strategic variety.
7. **Starting planet variety** (Rec 3.6) — 30 min. Replayability (requires #6).
8. **Colony personality traits** (Rec 3.5) — 1 hour. End-game goal.
9. **Construction queue QoL** (Rec 3.7) — 30 min. Player comfort.

Items 1-5 are the critical path to a playable, testable game.

---

### 7. Design Roadmap Updates

Added to `devguide/design.md`:
- Phase 1: Single-player/practice mode (canLaunch bypass for solo rooms)
- Phase 1: Starting planet variety (random type/size assignment)
- Phase 2: Construction queue QoL (cost preview, cancel refund, time estimates)

See `devguide/design.md` for full task descriptions.

---

## Review #6 — 2026-03-11

**Reviewer:** Game Design Analyst (automated)
**Build State:** 7/70 tasks complete (10%). Colony 4X engine with balanced economy, pop growth, 84 tests. Client still renders dead RTS.
**Focus:** First client UX pass — make the game visible and playable.

---

### 1. Pillar Scores

| Pillar | Score | Notes |
|--------|-------|-------|
| Strategic Depth | 3.5/10 | Unchanged — solid district trade-offs exist server-side but are invisible to players |
| Pacing & Tension | 3/10 | Growth loop creates a real 8-minute arc, but no player has ever experienced it |
| Economy & Production | 6/10 | Best pillar. Energy budget, food pressure, housing cap all working. Completely hidden. |
| Exploration & Discovery | 1/10 | Absent |
| Multiplayer Fairness | 3/10 | Symmetric starts, solid lobby. Zero in-game interaction visible |

**Overall: 3.3/10** — The server-side game is genuinely interesting. The score won't move until a player can see and interact with it.

---

### 2. The Diagnosis

The game has a **complete architectural mismatch**: the server sends colony 4X data (`colonies`, `districts`, `pops`, `resources.energy/minerals/food/alloys`), but the client expects RTS data (`units`, `buildings`, `gold/wood/stone`). The client renders Canvas 2D diamonds on a 50x50 grid. The HUD references properties that don't exist in gameState. Every game system built over the last 7 entries is invisible.

This isn't a polish issue — it's a **broken product**. A player who connects, creates a room, and launches sees medieval RTS placeholder graphics and a HUD showing "Gold: NaN". Meanwhile, a well-tuned colony economy ticks silently on the server.

**The single highest-impact change to this project is making the existing server game visible to the player.** Nothing else matters until this happens.

---

### 3. Recommended Implementation Order

The client UX sprint should be the next 3 tasks picked by `/develop`, in this exact order:

#### 3.1 Single-Player/Practice Mode

**Impact:** Critical (unblocks all testing)
**Effort:** Very Low (10-15 minutes)
**Category:** UX / Development

**Why first:** Currently requires 2 browser tabs, 2 names, join, ready, launch just to see the game. Every iteration of client development requires this dance. Removing it saves minutes per test cycle across dozens of iterations.

**The fix:** Already spec'd in design.md. Modify `canLaunch` in room-manager.js to allow solo launch when `room.maxPlayers === 1` or `room.practiceMode === true`.

#### 3.2 Stale Client Cleanup

**Impact:** Critical (prerequisite for any new UI)
**Effort:** Medium (1-2 hours)
**Category:** Foundation

**What to strip from app.js:**
- Canvas 2D isometric renderer (drawTile, drawUnit, drawBuilding, drawMinimap, drawGrid, drawSelectionBox — all game render functions)
- Unit selection system (click select, box select, selection state)
- Right-click movement command sending
- RTS camera (isometric projection math for unit positioning)
- Minimap rendering and click-to-pan
- Gold/Wood/Stone/Supply HUD update code
- Any references to Projection module

**What to keep:**
- WebSocket connection setup and message dispatch
- Screen management (name → lobby → room → game transitions)
- Chat message handling
- Room UI (player list, ready, launch)
- The `handleMessage` switch/dispatch structure (just gut the game-specific cases and rewire)

**What to rewire:**
- `gameInit` handler: parse `{ colonies, players, yourPlayerId, tick }` instead of `{ units, buildings, players, mapWidth }`
- `gameState` handler: receive `{ tick, players, colonies }` and update stored state
- Store `myColonies`, `myResources`, `currentTick` as module-level state for the UI to read

**What to update in index.html:**
- Remove `<canvas id="game-canvas">` (or repurpose later for Three.js)
- Remove minimap canvas
- Remove the gold/wood/stone resource bar HTML
- Remove selection panel HTML
- Add a `<div id="colony-ui">` container for the new HTML UI
- Remove `projection.js` script tag if present

#### 3.3 HTML Colony UI Overlay

**Impact:** Critical (transforms project from "invisible server" to "playable game")
**Effort:** Medium-High (2-3 hours)
**Category:** Core UX

This is the big one. Build a pure HTML/CSS interface that reads gameState and lets the player manage their colony. No Three.js needed — function over form.

**Layout:**

```
┌─────────────────────────────────────────────────────┐
│ ⚡ 105 (+5/mo) │ ⛏ 306 (+6/mo) │ 🌾 102 (+2/mo)  │  RESOURCE BAR
│ ⚙ 50 (0/mo)   │ 🔬 P:6 S:6 E:6 │ 👑 100 (+2/mo) │  (top, always visible)
├─────────────────────────────────────────────────────┤
│ Month 3 │ Speed: ▶▶▶ │ Pops: 10/10 ⚠ Growing (slow) │  STATUS BAR
├──────────────────────┬──────────────────────────────┤
│                      │ Colony: New Earth            │
│   DISTRICT GRID      │ Continental (Size 16)       │
│                      │                              │
│  [Gen] [Min] [Agr]  │ Districts: 4/16              │
│  [Agr] [ + ] [ + ]  │ Pops: 10 (4 working, 6 idle)│  COLONY PANEL
│  [ + ] [ + ] [ + ]  │ Housing: 10/10 ⚠             │
│  [ + ] [ + ] [ + ]  │                              │
│  [ + ] [ + ] [ + ]  │ Build Queue:                 │
│  [ + ] [ + ] [ + ]  │ (empty)                      │
│                      │                              │
├──────────────────────┴──────────────────────────────┤
│ BUILD MENU (appears on [ + ] click):                │
│ [Housing 100⛏] [Generator 100⛏] [Mining 100⛏]     │
│ [Agriculture 100⛏] [Industrial 200⛏] [Research 200⛏+20⚡] │
└─────────────────────────────────────────────────────┘
```

**Resource Bar:** 6 resources horizontal. Each: icon + stockpile + net/month (green if +, red if −). Colors: energy=#f1c40f, minerals=#95a5a6, food=#2ecc71, alloys=#e67e22, research=#3498db, influence=#9b59b6.

**Status Bar:** Month counter (`tick/100`), pop count with housing warning if at cap, growth indicator ("Growing slow/fast/rapid" or "Starving!" or "Housing full"), growth progress bar.

**District Grid:** CSS grid (4 columns). Built = colored tile with type abbrev (GEN, MIN, AGR, IND, RES, HOU). Empty = dark outline + "+" icon. Under construction = color + progress bar overlay. Click built → tooltip + demolish. Click empty → build menu.

**Build Menu:** Horizontal buttons per district type. Show cost. Gray out if unaffordable or queue full (3 max). Click → send `buildDistrict`. Hover → production preview.

**Colony Info Panel (right):** Colony name, planet type/size, district count, pop breakdown (working/idle), housing used/cap, build queue with progress bars (ticks as seconds), production/consumption breakdown per resource.

**Interaction Wiring:**
- Build click → `ws.send({ type: 'buildDistrict', colonyId, districtType })`
- Demolish click → `ws.send({ type: 'demolish', colonyId, districtId })`
- All state from `gameState` messages — never compute locally
- Refresh UI on every `gameState` (throttle to every 5th tick / 2Hz if needed)

**CSS Theme:** Dark space: bg #0a0a1a, panels #1a1a2e, borders #2a2a4e. Monospace for numbers. Sans-serif for labels. No animations beyond progress bars.

---

### 4. What NOT to Build Yet

- **In-game chat** — Works in lobby. Not needed for solo testing.
- **Scoreboard/Tab** — Multiplayer feature. Solo doesn't need it.
- **Event ticker** — No events yet.
- **Planet bonuses, speed controls** — Server features. Do after 3D view + UI exist.

The goal: launch game → see your colony in 3D isometric → click to build districts → watch buildings appear → see pops grow → feel the economy. The 3D view and the HTML overlay are built together — the scene IS the game, the overlay is the controls.

---

### 5. Balance Note

No changes recommended. Post-entries 4-7 numbers are well-tuned on paper. First real playtest through the UI will reveal whether pacing *feels* right. Reserve adjustments for after the UI exists.

---

### 6. Design Roadmap Updates

Reordered Phase 1 in `devguide/design.md` to put the client UX sprint at the top of unchecked tasks. Three tasks (practice mode → stale cleanup → HTML UI) become the next 3 items `/develop` picks up, in that exact order. Moved above Three.js tasks to enforce priority.

---

## Review #2 — 2026-03-11

**Reviewer:** Game Design Analyst (automated)
**Build State:** 8/68 tasks complete (12%). Server-side colony 4X engine functional; client still renders old RTS.

---

### 1. Pillar Scores

| Pillar | Score | Notes |
|--------|-------|-------|
| Strategic Depth | 3/10 | Server has 6 district types with real trade-offs (energy vs alloys vs research), but only one colony per player, no tech tree, no fleet composition, no win paths. The district choice is the *only* decision point. |
| Pacing & Tension | 2/10 | Pop growth creates a slow ramp. Monthly resource ticks give a sense of progression. But no mid/late game arc, no crises, no opponent pressure, no escalation. The game just... continues. |
| Economy & Production | 5/10 | Strongest pillar. 6 resources with distinct roles. Districts have meaningful costs and energy trade-offs (Industrial costs 3 energy/month, Research costs 4). Pop-job assignment creates workforce pressure. Food surplus drives growth speed. Mineral pacing is tuned. Solid foundation — needs more spending sinks. |
| Exploration & Discovery | 0/10 | Nothing exists. No galaxy, no systems, no surveying, no anomalies. Single colony on a fixed Continental size-16 planet. |
| Multiplayer Fairness | 3/10 | Symmetric starts (same planet, same resources). Lobby/room system works. But requires 2 players to launch, no solo mode, and no game to compete *in*. |

**Overall: 2.6/10** — Up from 1.6. The economy engine is real and well-balanced. Everything else is missing or invisible to players.

---

### 2. Top 5 Things a Playtester Would Notice

1. **"The screen is broken."** After launching a game, the client renders an old RTS view with a grid, no units, no buildings, gold/wood/stone HUD showing `undefined`. The colony engine is running on the server but the client can't display it. This is the #1 blocker — the game is literally unplayable.

2. **"I can't play alone."** Requires 2 players to launch. For a game this early, solo iteration is essential. Every playtest requires coordinating two browser tabs/windows.

3. **"I built some districts... now what?"** Even if the client worked, there's only one colony on one planet. No expansion, no exploration, no opponents doing anything. The 4X loop is "exploit" only — and a narrow slice of it.

4. **"All colonies are the same."** Every game starts on Continental size 16. No planet variety, no type bonuses, no specialization incentives beyond district mix. Two players' colonies are mechanically identical.

5. **"There's no way to win or lose."** No win conditions, no score tracking, no time pressure. The game has no end state. Players will ask "what's the point?" within 2 minutes.

---

### 3. What's Working Well (Design Wins)

- **Energy as a constraint resource.** Industrial (3 energy) and Research (4 energy) districts require Generator support. This creates a real decision: do I build generators now to unlock alloys later, or rush agriculture for faster pop growth? Good Stellaris-style tension.

- **Pop growth tied to food surplus with tiers.** Three growth speeds (base/fast/fastest) at surplus thresholds of 0/5/10 create meaningful breakpoints. Players can invest in agriculture early for compound growth or defer for immediate economic power. Classic 4X early-game dilemma.

- **Housing as a hard cap on growth.** Base housing of 10 means the first Housing district (+5) is a critical early decision. Housing doesn't produce anything — pure growth investment. Good opportunity cost.

- **Unemployed pops produce research.** Elegant fallback that prevents "dead" pops and gives early-game research without dedicated districts. Mirrors Stellaris's researcher jobs.

- **Build queue limit of 3.** Forces prioritization. Every slot is a commitment.

---

### 4. Economy & Balance Analysis

#### Resource Flow (Starting State)

| Resource | Starting | Production/month | Consumption/month | Net | Notes |
|----------|----------|-------------------|--------------------|----|-------|
| Energy | 100 | 6 (1 Generator) | 0 | +6 | Comfortable. Will need more when building Industrial/Research. |
| Minerals | 300 | 6 (1 Mining) | 0 | +6 | 3 immediate builds at 100 each. Good opening agency. |
| Food | 100 | 12 (2 Agriculture) | 10 (10 pops) | +2 | Tight but positive. Growth starts immediately. |
| Alloys | 50 | 0 | 0 | 0 | No production until Industrial district. Dead resource early. |
| Research | 0 | 6 each (6 unemployed pops) | 0 | +6 each | Free research from unemployed. Drops as pops get jobs. |
| Influence | 100 | 0 | 0 | 0 | No production, no spending. Completely inert. |

**Key observations:**
- **Alloys are gated behind a 2-step chain:** Need minerals (200) + energy capacity (3/month ongoing) to build Industrial. Earliest alloy production is ~month 2-3. Fine for pacing — alloys should feel earned.
- **Influence is a dead resource.** No way to produce or spend it. Needs a purpose before it's worth displaying.
- **Research has an interesting inversion:** Starts high (6/type from unemployed) and *decreases* as you employ pops in districts, until dedicated Research districts are built. Non-obvious trade-off — building economy actually reduces research temporarily. Clever, but players won't understand without UI feedback.

#### District Economics

| District | Cost | Monthly Output | Monthly Energy Cost | ROI (months) |
|----------|------|---------------|--------------------|----|
| Housing | 100 | +5 housing | 1 | N/A (enabling) |
| Generator | 150 | +6 energy | 0 | 25 months |
| Mining | 100 | +6 minerals | 0 | 16.7 months |
| Agriculture | 100 | +6 food | 0 | N/A (enabling) |
| Industrial | 200 | +3 alloys | 3 | Depends on alloy value |
| Research | 200+20e | +3 each type | 4 | Depends on tech value |

**Balance issues:**
- **Generator costs 150 vs Mining/Agriculture/Housing at 100.** Generators are enabling infrastructure, not a luxury. The 50% premium feels punishing. Should be 100 to match.
- **Build time is uniformly 300 ticks for everything.** Removes pacing variety. Consider tiered times: Housing 200, basic 300, advanced 400.

#### Pop Growth Timing

Starting surplus is +2, so base growth rate applies. **But players start at 10 pops with 10 housing — growth is immediately blocked.** The pop growth system is disabled from tick 1 unless the player builds Housing first. This is a design bug.

#### Game Length Estimate

16-slot planet fills in ~8-10 minutes of active building. No second colony possible. No win condition. **Effective session: 5-10 minutes before running out of things to do.** Target is 20-40 minutes.

---

### 5. Recommendations

#### 5.1 — Fix Starting Pop/Housing Deadlock

**Impact:** High | **Effort:** Low | **Category:** Balance

**The problem:** Players start with 10 pops and 10 housing. Pop growth is immediately blocked. The growth system is silently disabled from game start.
**The fix:** Reduce starting pops to 8 (keeping base housing at 10). Gives 2 growth cycles before housing constrains, teaching players that pops grow and housing matters.
**Why it matters:** First 60 seconds set the tone. A colony that starts stagnant feels dead.
**Design details:**
- 8 pops × 1 food = 8 consumed. 12 produced. Surplus = +4 → base growth (400 ticks).
- Pop 9 at ~40 sec, pop 10 at ~80 sec. Then housing-blocked — clear signal to build Housing.
- 4 districts staffed, 4 pops unemployed producing research. Slightly more starting research.

#### 5.2 — Generator Cost Parity

**Impact:** Medium | **Effort:** Low | **Category:** Balance

**The problem:** Generator at 150 minerals vs 100 for other basics. Punishing for enabling infrastructure.
**The fix:** Generator cost 150 → 100 minerals.
**Why it matters:** Uniform basic costs (100 each) let players focus on *what* to build, not *can I afford* it. Real cost is already in opportunity (slot used for energy, not minerals/food).

#### 5.3 — Variable Build Times by District Tier

**Impact:** Medium | **Effort:** Low | **Category:** Pacing

**The problem:** All districts take 300 ticks. Housing takes as long as a Research lab.
**The fix:** Housing: 200 ticks (20s). Basic districts: 300 ticks (30s). Industrial/Research: 400 ticks (40s).
**Why it matters:** Quick Housing lets players unblock growth fast. Slower advanced districts create anticipation.

#### 5.4 — Colony Idle Notifications (Server Events)

**Impact:** High | **Effort:** Low | **Category:** UX

**The problem:** Construction completes, pops grow, queues empty — nothing notifies the player. "Idle colony" is the #1 efficiency killer in 4X.
**The fix:** Server broadcasts `gameEvent` messages: `constructionComplete`, `queueEmpty`, `popMilestone` (every 5 pops), `housingFull`, `foodDeficit`.
**Why it matters:** Events are the heartbeat of 4X. They create "turn to" moments that keep players engaged. Rate-limit pop events to every 5 pops to avoid spam.

#### 5.5 — Energy Deficit Consequences

**Impact:** Medium | **Effort:** Medium | **Category:** Core Mechanic

**The problem:** Energy deficit has no consequence. Districts run free even at negative energy. Generators become pointless.
**The fix:** When energy is negative at month end, disable highest-consuming districts until balance recovers. Disabled districts produce nothing, pop becomes unemployed. Re-enable automatically when energy supports them.
**Why it matters:** Without consequences, the Generator/Industrial/Research triangle collapses. Energy deficit must hurt. Stellaris does exactly this.

#### 5.6 — Early Opponent Awareness

**Impact:** Medium | **Effort:** Low | **Category:** Multiplayer

**The problem:** Zero opponent visibility. No competitive tension even in multiplayer.
**The fix:** Every 500 ticks, broadcast `galaxyNews` with comparative stats: pop rankings, district counts, milestones. Frame as "Galactic Census Bureau" reports.
**Why it matters:** Knowing your opponent has 15 pops while you have 12 creates urgency. Cheap to implement, immediate multiplayer tension.

#### 5.7 — Planet Type Bonuses

**Impact:** Medium | **Effort:** Medium | **Category:** Replayability

**The problem:** Every game is Continental size 16. No variety.
**The fix:** Already designed — implement the type bonuses and randomize starting planet. All players get same random type for fairness.
**Why it matters:** Different starts create different opening strategies. Arctic → tech rush. Desert → industrial expansion. Low-effort replayability.

#### 5.8 — Edict System (Influence Spending)

**Impact:** Medium | **Effort:** Medium | **Category:** Strategic Depth

**The problem:** Influence is a dead resource with no purpose until Phase 3/6.
**The fix:** 3-4 colony edicts: "Mineral Rush" (50 influence, +50% mining for 5 months), "Population Drive" (75 influence, +100% growth for 5 months), "Research Grant" (50 influence, +50% research for 5 months), "Emergency Reserves" (25 influence, +100 of each resource immediately). Max 1 active edict.
**Why it matters:** Influence becomes a strategic timer — limited "power moves" that must be spent wisely. Stellaris edicts are one of its most elegant systems.

---

### 6. Content Wishlist

1. **Colony Governors with Personalities.** Auto-assigned AI governor per colony with a trait (Industrialist: +10% alloys/-10% research, Ecologist: +10% food/housing/-10% mining). Reassignable. Creates attachment to colonies as characters. Lighter version of Endless Space 2's hero system.

2. **Galactic Stock Market.** Shared resource exchange where supply/demand from all players sets prices. Mining-heavy meta → mineral prices crash. Creates emergent economic gameplay. Inspired by Anno 1800 and EVE Online.

3. **Colony Crises with Player Choice.** Colony-specific events: "Worker Uprising on your Forge World — grant demands, suppress, or negotiate?" Creates memorable stories per playthrough.

4. **Asymmetric Player Factions.** 4-6 factions: "Solar Collective" (+33% energy, -25% mining), "Deep Miners" (+50% mining, can build on Barren), "Hive Mind" (0.5 food/pop, can't trade). Dramatically increases replayability.

5. **Orbital Stations as Colony Extensions.** When surface slots are full, build orbital platforms for Industrial/Research/Military slots. "Vertical growth" alongside horizontal expansion. Visually dramatic above the colony grid.

---

### 7. Priority Matrix

| # | Recommendation | Impact | Effort | Priority |
|---|---------------|--------|--------|----------|
| 5.1 | Starting pop/housing fix | High | Low | **Do first** |
| 5.2 | Generator cost parity | Medium | Low | **Do first** |
| 5.3 | Variable build times | Medium | Low | **Do first** |
| 5.4 | Colony idle notifications | High | Low | **Do second** |
| 5.5 | Energy deficit consequences | Medium | Medium | **Do second** |
| 5.6 | Early opponent awareness | Medium | Low | **Do third** |
| 5.7 | Planet type bonuses | Medium | Medium | **Do third** |
| 5.8 | Edict system | Medium | Medium | **Phase 2+** |

**Critical path:** Fix starting deadlock (5.1) → get client working (existing sprints) → add notifications (5.4) → energy consequences (5.5).

---

### 8. Roadmap Updates

Added 6 new tasks to `devguide/design.md`:
- Phase 1: Starting pops 10→8 balance fix, Generator cost 150→100, variable build times
- Phase 1: Colony idle event notifications, energy deficit district disable
- Phase 2: Edict system (influence spending)
