# ColonyGame — Game Design Review

*Living document — newest reviews first.*

---

## Review #32 — 2026-03-12 — The Missing Middle: From Colony Builder to 4X

**Reviewer:** Game Design Analyst (automated)
**Build State:** 60/162 tasks complete (37%). Colony traits, science ships, fog of war, anomalies, single-player mode. 645 tests passing. ~16,200 lines.
**Focus:** Holistic 4X evaluation at the 37% mark. The game has exploration and expansion — what's needed to make a 20-minute session feel like a complete, satisfying game?

---

### 1. Current State Audit

**What a player experiences today:**
1. Enter name → "Single Player" one-click or multiplayer lobby
2. Galaxy generated (50/100/200 systems), starting colony on habitable planet with 4 pre-built districts, 8 pops
3. Build 6 district types with energy/mineral/food/alloy/research economy
4. Research 6 techs across 3 tracks (2 tiers, T1 costs 150, T2 costs 500)
5. Galaxy map with fog of war (2-hop visibility), science ships for exploration
6. Colony ships for expansion (max 5 colonies), planet type bonuses
7. Colony personality traits at 4+ district specialization (+10% empire-wide bonuses, +5 VP each)
8. Energy deficit auto-disables districts, food deficit kills pops
9. Match timer → VP scoring → scoreboard

**What's conspicuously absent:**
- No military units, combat, or threat of any kind
- No diplomacy, trade, or player interaction beyond chat
- No mid-game events or crises that disrupt plans
- No win condition other than timer expiry
- No way to interact with or respond to other players' actions
- Tech tree ends at T2 — late game has nothing new to unlock
- No visual progression on colonies (same look at pop 8 and pop 30)

---

### 2. Pillar Scores

#### Strategic Depth: 4/10
The colony specialization system (planet bonuses + traits) is genuinely good. Players make real choices about which districts to build and where to expand. But strategic depth bottoms out fast: there's no military dimension, no diplomacy, no competing victory paths. Every game plays the same — expand to 5 colonies, specialize, wait for timer. The tech tree is too shallow (6 techs) to create divergent strategies. There's no "opponent's move" that forces you to adapt.

#### Pacing & Tension: 3/10
The weakest pillar. Early game has a nice rhythm (build first districts, scout galaxy, pick expansion targets). But there's no mid-game inflection point and no late-game climax. Once you have 3-4 colonies running, you're on autopilot — queue districts, wait for pops, research finishes itself. No crises, no threats, no "oh no" moments. The match timer ending is the only dramatic beat, and it's external to gameplay. The 2-minute warning helps but can't substitute for organic tension.

#### Economy & Production: 6/10
The strongest system in the game. Energy as a power grid with auto-disable creates real tension. Food pressure via pop consumption forces agriculture investment. Alloy costs for ships create expansion trade-offs. Planet type bonuses (desert +minerals, ocean +research) make colony site selection meaningful. Colony traits reward specialization. The economy genuinely works — but it needs more sinks. Once you're stable, resources just pile up with nothing to spend them on.

#### Exploration & Discovery: 5/10
Science ships + fog of war + anomalies create a legitimate explore loop. Surveying reveals planets, anomalies give one-time bonuses, and persistent fog penetration rewards systematic scouting. But the reward space is shallow: 5 anomaly types with static bonuses. No narrative choices, no multi-step chains, no "ancient precursor mystery" to unravel. Exploration is functional but not exciting. The galaxy feels like a spreadsheet of habitability numbers rather than a frontier of wonders.

#### Multiplayer Fairness: 3/10
Hard to evaluate fully since there's no interaction beyond chat. Starting positions use galaxy generation's spacing, which is reasonable. But there are no comeback mechanics, no underdog bonuses, no way to interfere with or respond to another player. In a 2-player match, both players play solitaire on the same map. VP scoring is the only competitive element, and it heavily favors wide play (more colonies = more pops = more VP).

**Overall Score: 4.2/10**

---

### 3. Top 5 Gaps a Playtester Would Notice

1. **"Nothing is happening to me."** After the initial build-out, the game becomes purely reactive to the player's own decisions. No events, no crises, no AI actions, no opponent moves. This is the #1 fun killer — 4X games need external pressure.

2. **"I've researched everything, now what?"** The tech tree empties after 6 techs. In a 20-minute match at normal speed, an active researcher finishes all T2 techs by minute 12-14. The last 6-8 minutes have no progression system.

3. **"Why should I care about other players?"** In multiplayer, other players are invisible except as VP numbers. No territorial conflict, no trade, no diplomacy. The multiplayer label promises interaction but delivers parallel solitaire.

4. **"My colonies all look the same."** Despite planet type bonuses, the isometric colony view doesn't change based on planet type. A Desert colony looks identical to an Arctic colony. The 3D rendering — the game's visual signature — isn't leveraging its biggest differentiator.

5. **"The game just... stops."** The match timer ending feels arbitrary. There's no climax, no final push, no dramatic finish. The game needs a rising action curve that makes the last few minutes intense rather than anticlimactic.

---

### 4. Recommendations

### R32-1: Colony Crisis Events (already designed, needs implementation)

**Impact:** High
**Effort:** Medium
**Category:** Core Mechanic

**The problem:** Zero external pressure after initial setup. The game is a sandbox with a timer.
**The fix:** Implement the 4 crisis types already designed in design.md (Seismic Activity, Plague, Power Surge, Labor Unrest). These are the single highest-impact addition for player engagement.
**Why it matters:** Crises create "oh no" moments that break monotony, force resource stockpiling as insurance, and create stories ("remember when the plague hit our Forge World?"). Every good 4X has them — Stellaris has galactic crises, Civ has barbarians and natural disasters.
**Design details:**
- Already fully specified in Phase 2 of design.md
- First crisis at 500-800 ticks (50-80 seconds) gives players time to establish before disruption
- 200-tick (20 second) decision window is tight enough to feel urgent
- Crisis immunity window (300 ticks) prevents frustrating back-to-back events
- Priority: implement this before any other recommendation

### R32-2: Tech Tree T3 Expansion

**Impact:** High
**Effort:** Low
**Category:** Core Mechanic

**The problem:** Tech tree exhausts at T2, leaving 6-8 minutes of a match with no research goals.
**The fix:** Add T3 techs (already designed): Fusion Reactors, Genetic Engineering, Automated Mining. Cost 1000 each — unreachable without heavy research investment, creating a viable "tech rush" strategy.
**Why it matters:** Progression systems are the backbone of 4X engagement. An empty tech tree means no reason to build research districts after minute 12. T3 techs with powerful effects (generators produce alloys, pop growth halved, mining costs 0 jobs) create late-game power spikes and viable "research victory" vibes.
**Design details:**
- Already specified in Phase 4 of design.md
- At 12 research/month (2 research districts), T3 takes ~83 months (14 minutes) — forces dedicated investment
- T3 VP bonus (+20 per tech) makes full tech completion worth +60 VP, competitive with an extra colony

### R32-3: Colony Planet Context Rendering

**Impact:** High
**Effort:** Low-Medium
**Category:** Visual Polish / Player Experience

**The problem:** All colonies look identical regardless of planet type. The isometric 3D view — the game's visual signature — wastes its biggest differentiator.
**The fix:** Change ground plane color and scene background based on planet type (already designed as R24-2 in Phase 3). Desert colonies get sandy ground (#c4956a), Arctic gets icy blue (#b8c9d4), etc.
**Why it matters:** Visual identity makes colonies feel like distinct places rather than spreadsheet rows. When a player switches between their Ocean World and their Desert Colony, it should feel like visiting different locations. This is low-hanging fruit that dramatically improves the "feel" of multi-colony gameplay.
**Design details:**
- 6 ground plane colors, 6 background colors already specified
- Implement in `buildColonyGrid()` based on `colony.planet.type`
- Optional horizon glow adds atmosphere for minimal extra effort
- Pure client-side change — no server modifications

### R32-4: Empire Specialization Doctrines

**Impact:** High
**Effort:** Medium
**Category:** Core Mechanic / Strategic Depth

**The problem:** Every game plays identically. No strategic divergence, no commitment moments, no "build identity."
**The fix:** At 3 colonies, players choose a permanent doctrine: Expansionist (colony cap +2, ship build -40%), Industrialist (district build -25%, +1 alloy/industrial), or Scholar (research +25%, +3 VP per tech). Already designed in Phase 4.
**Why it matters:** Permanent choices create identity and replayability. "I'm going Expansionist this game" vs "Scholar rush" creates different playstyles from the same starting point. This is the cheapest way to add strategic depth — one decision that ripples through the entire mid/late game. Reference: Endless Space 2 faction quests, Stellaris tradition trees.
**Design details:**
- Trigger at exactly 3 colonies — natural mid-game milestone
- Expansionist raises cap to 7 colonies (wide play), Industrialist makes existing colonies more productive (tall play), Scholar makes research a win condition
- +3 VP per tech for Scholar means all 6 current techs = +18 VP, competitive but not dominant
- Show doctrine badge on scoreboard for multiplayer awareness

### R32-5: Colony Mood System

**Impact:** Medium-High
**Effort:** Medium
**Category:** Core Mechanic / Player Engagement

**The problem:** Colonies are pure optimization puzzles with no personality. There's no nurturing relationship — you build districts and forget about them.
**The fix:** Colonies have mood states (Thriving/Content/Restless/Rebellious) based on housing ratio, food surplus, and district variety. Already designed in Phase 2.
**Why it matters:** Mood creates a caretaking relationship with colonies. A "Thriving" colony producing +10% feels rewarding. A "Rebellious" colony destroying a district feels urgent. It transforms colonies from spreadsheets into places you care about. Reference: Tropico citizen satisfaction, Civ VI amenities.
**Design details:**
- Thriving: housing ratio < 0.7, food surplus > 5, 4+ district types → +10% all output
- Rebellious: housing ratio > 1.0 AND food deficit for 3+ months → -25% output, district destruction after 5 months
- Color-coded indicator (green/white/yellow/red) in colony panel
- Creates tension between fast expansion (cramped, unhappy) and careful development

### R32-6: Dynamic Galactic News Ticker

**Impact:** Medium
**Effort:** Low
**Category:** Multiplayer / Atmosphere

**The problem:** The galaxy feels dead. In multiplayer, other players are invisible numbers. Even in single-player, events happen silently.
**The fix:** Scrolling text feed at top of screen narrating events with procedural flavor text. "BREAKING: Player X establishes Dusthaven Colony in the Kepler system." Already designed in Phase 7.
**Why it matters:** A news ticker makes the galaxy feel alive and populated. In multiplayer, it creates awareness of rivals without requiring direct interaction mechanics. In single-player, it adds narrative flavor. This is a pure client-side feature using existing event data — very low implementation cost for high atmosphere impact.
**Design details:**
- 3-4 text template variants per event type for variety
- Single-line display, 4-second cycling, max 8 queued messages
- Player names colored by player color
- Already-broadcast events (colonyFounded, constructionComplete, researchComplete, popMilestone) provide the data

### R32-7: Scarcity Pre-Warning System

**Impact:** Medium
**Effort:** Low
**Category:** UX / Player Quality of Life

**The problem:** Resource shortfalls happen suddenly. A player builds an industrial district, doesn't realize it'll push energy negative, and districts get auto-disabled with no advance warning. This feels punishing rather than challenging.
**The fix:** When the player's projected production (including in-queue buildings) would result in a deficit within 2 months, show a warning indicator. Amber for "will go negative if you build more consumers," red for "currently in deficit."
**Why it matters:** Good 4X games give players information to plan ahead. Stellaris shows projected income. Anno shows production chains. Letting players see incoming shortfalls transforms "unfair surprise" into "strategic decision." This is the difference between a game that feels unfair and one that feels deep.
**Design details:**
- Calculate projected net after all queue items complete
- Show warning icon next to resource in HUD panel
- Tooltip: "Energy: +6/month now, -1/month when Industrial completes"
- Server already has the data; this is a client-side projection calculation

---

### 5. Balance Snapshot

**Resource Flow Analysis:**
- Starting resources: 100 energy, 300 minerals, 100 food, 50 alloys, 100 influence
- Starting districts: 1 generator (+6 energy), 1 mining (+6 minerals), 2 agriculture (+12 food)
- Starting pops: 8, with 4 jobs filled → 4 unemployed pops produce 4 physics/society/engineering each
- Net month 1: +5 energy (6 produced - 1 housing), +6 minerals, +4 food (12 - 8 pops), 0 alloys
- **Assessment:** Early economy is well-paced. Players have enough minerals (~300) for 3 districts before needing mining income. Energy becomes tight after 3-4 consumers, creating genuine tension. Food pressure from pop growth is well-calibrated.

**District Balance:**
| District | Cost | Build Time | Output/month | Energy Cost | Notes |
|----------|------|-----------|-------------|------------|-------|
| Housing | 100m | 20s | 5 housing | -1 energy | Necessary evil, no production |
| Generator | 100m | 30s | 6 energy | 0 | Foundation — always needed |
| Mining | 100m | 30s | 6 minerals | 0 | Good ROI, pays for itself in ~17 months |
| Agriculture | 100m | 30s | 6 food | 0 | Pop growth engine |
| Industrial | 200m | 40s | 4 alloys | -3 energy | Premium — needs generator support |
| Research | 200m | 40s | 12 research (4×3) | -4 energy | Expensive but high VP yield |

- **Issue:** Mining at 6 minerals/month for 100 mineral cost = 17-month ROI. But after initial colony build-out, minerals have nowhere to go (no ships, no starbases, limited district slots). Mining becomes less valuable than any other district type in mid-game.
- **Fix:** This resolves naturally when military ships arrive (mineral→alloy pipeline), but in current state, consider: colony ships cost 200 minerals, so expansion gives minerals a sink. If players are expanding, mining stays relevant. No immediate rebalance needed.

**Tech Pacing:**
- T1 costs 150 research. With 2 unemployed pops (2 research/month each track) + 0 research districts = ~75 months per T1 tech (12.5 minutes). Too slow without research districts.
- With 1 research district (4/month per track): ~25 months per T1 (4.2 minutes). Reasonable.
- T2 costs 500. With 1 research district: ~83 months (13.8 minutes). In a 20-minute match, T2 is achievable but tight.
- **Assessment:** Tech pacing is good for 20-minute matches. Players who invest in research can finish T1 by minute 5 and T2 by minute 14-15. Players who skip research lose ~30 VP (3×5 + 3×10) plus production bonuses. Tech is a real strategic choice, not free.

**VP Distribution (typical 20-minute single-player game):**
- 3 colonies × ~15 pops each = 45 pops × 2 = **90 VP** (dominant)
- 3 colonies × ~8 districts each = 24 districts × 1 = **24 VP**
- ~200 alloys stockpiled / 25 = **8 VP**
- ~600 total research / 50 = **12 VP**
- 6 techs completed = 3×5 + 3×10 = **45 VP**
- 2 colony traits × 5 = **10 VP**
- **Total: ~189 VP**

- **Issue:** Pops dominate VP (48%). This heavily favors wide play (more colonies = more pops). A player with 5 colonies and 75 total pops gets 150 pop VP alone, dwarfing any tall-play strategy.
- **Fix:** Doctrines (R32-4) help by giving tall players alternative VP paths. Colony traits are a good start (+5 VP each). Consider raising trait VP to +8 to further reward specialization depth.

**Game Length:**
- Default 20-minute match timer with 10Hz tick rate = 12,000 ticks
- A month = 100 ticks = 10 seconds
- 20 minutes = 120 months of game time
- **Assessment:** Match length feels right for the current depth. As more systems are added (combat, diplomacy), 25-30 minute matches may become the sweet spot.

---

### 6. Content Wishlist

1. **Precursor Questline:** Discovering 3+ "Precursor Artifact" anomalies across different systems unlocks a multi-step questline: triangulate the precursor homeworld → send science ship to investigate → discover a dormant megastructure → spend massive resources to activate it → permanent empire-wide bonus + 30 VP. Creates a narrative throughline for exploration-focused players and makes anomaly hunting feel purposeful rather than random.

2. **Colony Governance Elections:** Every 30 months (5 minutes), colonies hold an election where 2 randomly-generated policy options are presented: "Expand Housing" (+3 housing, -1 energy/month) vs "Intensify Production" (+15% output, -2 housing). The player picks one, creating periodic meaningful micro-decisions that shape colony identity over time. Each election adds a "law" to the colony's identity, visible as badges. Makes colonies feel like living societies, not just production centers.

3. **Galactic Archaeology Layer:** Hidden beneath the galaxy topology, generate "precursor ruins" at 5-10% of systems. Ruins are only discovered by science ship survey. Each ruin contains a fragment of a procedurally generated precursor civilization name and backstory. Collecting 5+ fragments reveals the full story + unlocks a unique building type for all colonies. Adds a metagame collection quest that spans the entire match and gives exploration a deeper purpose than just finding colonizable planets.

4. **Stellar Phenomena as Map Hazards:** Some hyperlanes pass through nebulae (slows fleet travel 2x), black holes (instant death for unshielded ships, requires T2 tech to traverse safely), or pulsar fields (drains energy from passing fleets). Creates geography that matters — some routes are faster but dangerous, others are safe but long. The galaxy becomes a landscape with terrain, not just a graph.

5. **Colony Cultural Victory:** Instead of just VP numbers, colonies that reach "Thriving" mood for 10+ consecutive months develop "Cultural Influence" that slowly converts nearby unclaimed systems to the player's territory (1 hop per 20 months of sustained thriving). Creates a peaceful expansion path that rewards careful colony management. Cultural influence visible as a soft glow on the galaxy map. A "cultural victory" alternative: first player to culturally influence 10 systems wins.

---

### 7. Roadmap Updates

**7 new work items added to design.md** — see Phase 2 (colony mood, scarcity warnings) and Phase 7 (news ticker, VP timeline recording). Colony crises, T3 tech, planet context rendering, and doctrines were already present as existing tasks.

**Prioritization recommendation for `/develop`:**
1. Colony crisis events (Phase 2) — highest impact on engagement
2. T3 tech expansion (Phase 4) — fills the late-game void
3. Colony planet context rendering (Phase 3) — visual differentiation
4. Colony mood system (Phase 2) — adds colony personality
5. Empire doctrines (Phase 4) — strategic divergence
6. Galactic news ticker (Phase 7) — atmosphere
7. Scarcity pre-warning (Phase 1) — QoL

---

## Review #31 — 2026-03-12 — Scout First, Settle Later: The Exploration Loop Lands

**Reviewer:** Game Design Analyst (automated)
**Build State:** 57/158 tasks complete (36%). Science ships, system surveying, 5 anomaly types, persistent fog penetration, single-player mode, research VP rebalance. 611 tests passing. ~15,600 lines.
**Focus:** Post-science-ships audit. The game now has a scout→discover→evaluate→settle loop. How does it change the player experience? What's still missing for a compelling 20-minute session?

---

### 1. Current State Audit

**What a player experiences today:**
1. Enter name → one-click "Single Player" or create/join multiplayer room
2. Configure galaxy size (S/M/L), match timer (10/20/25/30 min or unlimited)
3. Game starts: isometric 3D colony on a random planet type with 4 pre-built districts and 8 pops
4. Build 6 district types, manage energy balance, research 6 techs across 3 tracks (2 tiers)
5. Press G → galaxy map with fog of war (2-hop visibility from owned systems)
6. Build science ships (100 minerals + 50 alloys) → send to explore unknown systems → auto-survey reveals planets + 20% anomaly chance per planet → 5 anomaly types with one-time bonuses
7. Surveyed systems stay revealed permanently (persistent fog penetration)
8. Build colony ships (200 minerals, 100 food, 100 alloys) → send along hyperlanes → found colonies
9. Manage up to 5 colonies via sidebar list, keyboard shortcuts 1-5
10. Planet type bonuses create differentiated colony economies
11. VP scoring: pops×2 + districts + alloys/25 + research/50 + tech VP bonuses
12. Game ends on timer → scoreboard with VP breakdown

**What a player CANNOT do:**
- See planets as 3D objects (system view is HTML table only)
- Build military ships or engage in combat (no fleets)
- Interact with other players beyond chat (no diplomacy, trade, territory claims)
- Build buildings (only districts)
- Specialize colonies for strategic bonus (no personality/trait system)
- Choose different openings (every game starts identically)
- Spend influence (100 starting, no sink)
- Claim territory without colonizing (no outposts/starbases)

**The honest assessment:** Science ships have completed the explore→exploit pipeline. There's now a genuine scouting loop: build science ship → push into fog → discover anomalies → evaluate planets → decide where to colonize. The persistent fog penetration reward feels good — surveying a system permanently reveals it. Anomaly bonuses create small dopamine hits during exploration. But the game still lacks inter-player friction, colony specialization depth, and any late-game strategic branching. The "what do I do next?" question gets answered faster than new questions arise.

---

### 2. 4X Design Pillar Scores

#### Strategic Depth: 5/10 (unchanged from R30)
Science ships add a planning layer (scout then settle), but don't create new strategic branches. The opener is still largely solved — build science ship first or start economy? Economy first still wins because anomaly bonuses are small one-time payoffs. The tech tree has no branching; colony specialization doesn't exist yet; there's only one way to win (VP). Strategic depth requires choices where both options are viable. Currently, the viable path is: economy → science ship → colony ship → repeat.

#### Pacing & Tension: 7/10 (up from 6)
+1 from science ships. The early game now has three distinct phases: (1) build-up (minutes 0-3), (2) scouting (minutes 3-6, science ships exploring), (3) expansion (minutes 6-12, colony ships settling discovered worlds). Science ship movement creates micro-tension: "What will I find?" Anomaly discovery is a small but real excitement spike. The survey-then-settle rhythm is satisfying. But mid-to-late game still flattens once colonies are established and the galaxy is surveyed. No crises, no disruption, no opponent interaction to create turning points.

#### Economy & Production: 7/10 (unchanged)
Science ships add alloy tension (50 alloys competes with colony ships' 100 alloys). The "explore vs expand" resource trade-off is real. Anomaly bonuses (100 minerals, 50 alloys, etc.) create small economic boosts that reward scouting. Still missing: influence spending, building variety, scarcity events, and any late-game resource sinks.

#### Exploration & Discovery: 7/10 (up from 5)
+2 from science ships. This is the biggest single-feature improvement to a pillar since colony ships. The loop works: push science ships into fog → systems reveal → anomalies pop → "Ancient Ruins discovered! +50 research" creates genuine delight. Surveyed systems staying visible rewards systematic exploration. The 20% anomaly chance means some systems are barren and some are treasure troves — this variance is good. Auto-return to nearest colony after survey keeps ships active. Cap of 3 science ships creates fleet management lite. Still missing: anomaly choice events (branching decisions), multi-step anomaly chains, system orbital view to make discoveries visual, and any sense of galactic-scale narrative.

#### Multiplayer Fairness: 4/10 (unchanged)
Starting positions are balanced. Fog of war creates information asymmetry that adds tension. But multiplayer is still mostly parallel play. No territorial mechanics, no economic interaction (trade, blockade), no diplomacy. Science ship scouting is entirely PvE — discovering an opponent's territory is informational only, with no mechanical consequences. The expansion alert toast helps, but there's no way to respond to territorial encroachment.

**Overall Score: 6.0/10 (up from 5.4)** — Science ships drove +0.6, entirely through Pacing and Exploration.

---

### 3. Top 5 Things a Playtester Would Notice

1. **"I explored everything and there's nothing left to do."** In a small galaxy (50 systems), 3 science ships can survey the entire map by minute 10. After that, the exploration pillar shuts off entirely. The remaining match is pure optimization with no new information. Larger galaxies help, but even medium (100 systems) gets fully explored by minute 15 in a 20-minute match.

2. **"My opponent is invisible."** The biggest single gap: multiplayer matches feel like solo games with a shared scoreboard. No territorial friction, no economic interaction, no way to help or hinder another player. Chat exists but there's nothing to talk about beyond "good luck." The game needs inter-player mechanics to justify multiplayer.

3. **"All my colonies play the same."** Despite planet bonuses creating different raw numbers, the build order barely changes across colonies. There's no reward for specializing a colony — no personality traits, no buildings, no colony-level upgrades. Each new colony is just another instance of the same optimization puzzle.

4. **"The tech tree is too small."** 6 techs across 2 tiers completes in ~12-15 minutes with moderate research investment. After that, research districts produce VP but there's nothing exciting to unlock. T3 techs with transformative effects would give research districts purpose beyond point accumulation.

5. **"I wish I could see the planets."** System information is still an HTML table. Discovering a size-20 Continental world via science ship survey should feel like finding El Dorado — instead it's a row in a table with green highlighting. The system orbital view would transform discovery moments from data events to visual experiences.

---

### 4. Recommendations

### R31-1: Colony Personality Traits — Make Specialization Pay

**Impact:** High
**Effort:** Low
**Category:** Core Mechanic / Strategic Depth

**The problem:** 5 colonies × same build order = repetitive mid-game. Planet bonuses add variance but don't change strategy. There's no mechanical reason to go all-in on one district type.

**The fix:** When a colony has 4+ districts of one type, it earns a trait with empire-wide bonuses:
- "Forge World" (4+ Industrial): +10% alloy production empire-wide
- "Academy World" (4+ Research): +10% research empire-wide
- "Mining Colony" (4+ Mining): +10% minerals empire-wide
- "Breadbasket" (4+ Agriculture): +10% food empire-wide
- "Power Hub" (4+ Generator): +10% energy empire-wide

One trait per colony (highest count wins). Traits stack across colonies. +5 VP per trait for VP balance.

**Why it matters:** Creates genuine empire-building strategy. "Should I make this Ocean world a Breadbasket (food bonus) or Academy (research bonus)?" becomes a real decision. Three Forge Worlds = +30% alloys empire-wide, making tall industrialist play viable. This single feature differentiates every mid-game. Reference: Stellaris planet designation system.

### R31-2: T3 Tech Expansion — The Late-Game Fork

**Impact:** High
**Effort:** Low
**Category:** Strategic Depth

**The problem:** 6 techs complete by minute 12-15. Research becomes VP-only after that. No late-game strategic decisions. No "tech rush" archetype.

**The fix:** Already in design.md. Add 3 T3 techs at cost 1000:
- Physics T3: Fusion Reactors (+100% Generator output + generators produce +1 alloy/month)
- Society T3: Genetic Engineering (+100% Agriculture + pop growth time halved)
- Engineering T3: Automated Mining (+100% Mining + mining districts cost 0 jobs)

**Why it matters:** T3 at 1000 cost with 2 research districts (8/month) takes ~125 months (~21 min). Reaching T3 in a 20-minute match requires 3+ research districts on an Academy World — a massive early investment that sacrifices economy for a transformative payoff. This creates the "tech rush" archetype alongside "expansion rush" and "economy rush." Three viable strategies = replayability.

### R31-3: Colony Crisis Events — Break the Optimization Treadmill

**Impact:** High
**Effort:** Medium
**Category:** Pacing & Tension

**The problem:** After the exploration phase ends (~minute 10), the game becomes pure optimization with no disruption. No surprises, no threats, no adaptation required. The "tension" line goes flat.

**The fix:** Already detailed in design.md (Phase 2). 4 crisis types every 500-800 ticks per colony:
- Seismic Activity: evacuate (lose district) or reinforce (100 minerals, 30% fail)
- Plague Outbreak: quarantine (growth halted) or rush cure (50 energy + 50 food, 20% spread)
- Power Surge: shut down (all districts disabled 100 ticks) or ride it out (25% lose generator)
- Labor Unrest: negotiate (25 influence) or wait (300 ticks disabled)

200-tick (20 sec) decision window. Unresolved = worst outcome.

**Why it matters:** Crises inject mid-game tension and test player adaptability. A plague on your Forge World while you're saving alloys for a colony ship creates genuine drama. Crises also create the first influence sink (Labor Unrest negotiation), give the event system narrative weight, and break the "build and forget" colony management pattern. Reference: Stellaris empire crises, Frostpunk dilemma events.

### R31-4: Empire Specialization Doctrines — The Mid-Game Commitment

**Impact:** High
**Effort:** Medium
**Category:** Strategic Depth

**The problem:** At minute 8-10, players have 3 colonies and the game path is the same for everyone: expand to 5, optimize, wait for timer. No asymmetric mid-game strategies.

**The fix:** Already in design.md (Phase 4). At 3 colonies, unlock a permanent doctrine:
- **Expansionist:** Colony ship build time -40%, colony cap +2 (to 7)
- **Industrialist:** All district build time -25%, +1 alloy per Industrial
- **Scholar:** Research +25% empire-wide, each completed tech +3 VP

**Why it matters:** This is the single most impactful strategic depth feature. A permanent commitment at the mid-game pivot point creates divergent player identities: "I'm going Scholar to rush T3 Fusion Reactors" vs "I'm going Expansionist to claim 7 colonies before the timer." Opponent doctrine choices become visible strategic information that changes your own plans. Reference: Endless Space 2's faction quests, Civ VI's government system.

### R31-5: System Orbital View — Make Discovery Beautiful

**Impact:** Medium-High
**Effort:** Medium
**Category:** Visual / Core UX

**The problem:** Science ships now discover valuable planets, but the discovery is displayed as a table row. The exploration loop works mechanically but lacks visual payoff. A size-20 Continental world should feel spectacular to find.

**The fix:** Already in design.md. system-view.js with central star, orbital rings, colored planet spheres, habitable atmospheres. Click planet for details, "Colonize" button for colony ships. Galaxy → System → Colony navigation.

**Why it matters:** The system view is where exploration meets exploitation. Surveying a system with a science ship and then *seeing* the planets orbiting their star transforms data into experience. This is the "wow" moment that screenshots are made of. Every colony ship destination becomes a visual memory, not a row in a table. Reference: Stellaris system view.

### R31-6: Scarcity Seasons — Punish Monocultures

**Impact:** Medium
**Effort:** Low
**Category:** Economy / Balance

**The problem:** Once a player's economy is established, it never gets disrupted. Optimal production ratios remain static. There's no reason to diversify beyond basic needs.

**The fix:** Already in design.md (Phase 2). Every 8-12 months, one resource gets -25% production for 3 months galaxy-wide. Random selection from energy/minerals/food/alloys. Pre-warning 1 month before.

**Why it matters:** Scarcity rewards diversified economies and punishes monocultures. A player with 4 Mining Colonies gets devastated by mineral scarcity; a balanced empire barely notices. The pre-warning creates strategic windows: "Mineral scarcity in 1 month — should I stockpile or shift to alloys?" This is the simplest way to add mid-game economy disruption.

### R31-7: Edict System — Give Influence Purpose

**Impact:** Medium
**Effort:** Low
**Category:** Core Mechanic

**The problem:** Players start with 100 influence and have zero ways to spend it. It's a dead resource that creates confusion.

**The fix:** Already in design.md (Phase 2). 4 edicts spending influence for temporary bonuses:
- Mineral Rush (50 influence): +50% mining 5 months
- Population Drive (75 influence): +100% pop growth 5 months
- Research Grant (50 influence): +50% research 5 months
- Emergency Reserves (25 influence): instant +100 energy/minerals/food

Max 1 active. Starting 100 influence = 1-2 strategic uses per match.

**Why it matters:** Transforms a dead resource into a timing weapon. "Do I use my influence now for a population boom, or save it for a late-game research sprint?" Edicts also create VP-relevant decisions: Population Drive early compounds through pop VP; Research Grant late accelerates T3 tech completion. This is the cheapest way to add strategic timing decisions.

---

### 5. Balance Snapshot

#### Resource Flow — Post-Science Ships

**Starting position:** 100 energy, 300 minerals, 100 food, 50 alloys, 100 influence. 8 pops on size-16 planet with 4 pre-built districts.

**Science ship timing:** 100 minerals + 50 alloys = affordable by month 3-4. First survey results by month 6-8 (build + transit + survey). This is good — exploration begins before colony ship is ready.

**Colony ship timing:** 200 minerals + 100 food + 100 alloys. First colony ship ready by month 8-10 (~minutes 5-6). Science ship scouting data informs colony ship targeting. The pipeline works.

**Explore vs Expand tension:** Science ship (50 alloys) vs colony ship (100 alloys). Building 2 science ships costs 100 alloys — equivalent to 1 colony ship. This is the right tension: explore more or settle sooner?

**5-colony empire timeline:** ~15-18 minutes in a 20-minute match. Tight but achievable. Colony personality traits (when implemented) should kick in around colony 2-3 (minute 10-12), creating mid-game strategic identity.

#### VP Formula Assessment

Current: Pops×2 + Districts + Alloys/25 + Research/50 + TechVP (+5/+10/+20 per tier)

**Issue:** Expansion still dominates. 5 colonies × 8 districts × 10 pops = 80 VP from pops + 40 from districts = 120 base. Tech rush: 6 techs = 30 VP bonus + research stockpile. Colony traits at +5 VP each would add 15-25 VP for specialized empires.

**Recommended addition:** +5 VP per colony personality trait (pending implementation). This closes the tall vs wide gap.

#### Anomaly Economy

5 anomaly types with 20% chance per planet. Average planet count per system: 3. Average anomalies per surveyed system: 0.6. Over 15 surveyed systems: ~9 anomaly discoveries.

Average value per anomaly: ~80 resources equivalent. Total scouting value: ~720 resources from 15 systems. Science ship cost: 150 resources × 2 ships = 300 resources investment. ROI: ~2.4x. Healthy — scouting is profitable but not game-breaking.

---

### 6. Content Wishlist

1. **Galactic Leylines:** Hidden resource veins connecting 2-3 star systems. Only revealed when you colonize one endpoint. Control all endpoints = +15% production of leyline's resource. Creates a hidden puzzle on top of expansion: the "obviously best" planet might not be on a leyline, but two mediocre planets that complete a leyline outperform it. Rewards systematic exploration over greedy colonization.

2. **Opening Hands (Starting Condition Draft):** At game start, pick from 3 randomly-selected starting conditions: "Industrial Start" (+200 alloys, 1 pre-built Industrial), "Research Rush" (+500 physics research, 1 pre-built Research), "Population Boom" (+4 starting pops, +1 Housing). 30-second timer. Breaks the solved opener and adds pre-game strategic choice. Every match starts differently.

3. **Dynamic Galactic News Ticker:** Shared scrolling text at top of screen narrating events in-character: "BREAKING: Commander Zhang discovers Ancient Ruins in the Vega system", "CENSUS: New Helsinki reaches 15 population." Takes existing gameEvent data and wraps in procedural flavor text. Zero mechanical impact, massive atmosphere. Makes the galaxy feel alive and other players feel present.

4. **Secret Rival Objectives:** At game start in multiplayer, each player gets a hidden objective targeting another player: "Control more colonies than Player B" (+10 VP), "Out-research Player A" (+10 VP). Revealed at game end. Creates invisible competition and post-game surprise moments.

5. **Post-Game VP Timeline:** Record VP snapshots every 10 months during gameplay. Show as line chart on post-game screen. Reveals inflection points, surges, and comebacks. Low effort, high emotional payoff — players learn from their pacing. "I was ahead until minute 12 when they got their third colony."

---

### 7. Roadmap Updates

Added the following new tasks to `devguide/design.md`:

**Phase 1 (1 new):**
- Exploration exhaustion counter — track % of galaxy surveyed, surface as "X% Explored" badge

**Phase 2 (1 new):**
- Influence generation from colony traits (+2 influence/month per personality trait earned)

**Phase 3 (1 new):**
- Science ship auto-chain survey — after completing a survey, auto-target nearest unsurveyed system within 3 hops

**Total: 3 new work items added + priority reorder**

---

### 8. Summary

| Metric | R27 | R28 | R30 | R31 | Delta |
|--------|-----|-----|-----|-----|-------|
| Strategic Depth | 5/10 | 5/10 | 5/10 | 5/10 | 0 |
| Pacing & Tension | 5/10 | 6/10 | 6/10 | 7/10 | +1 |
| Economy & Production | 7/10 | 7/10 | 7/10 | 7/10 | 0 |
| Exploration & Discovery | 3/10 | 5/10 | 5/10 | 7/10 | +2 |
| Multiplayer Fairness | 4/10 | 4/10 | 4/10 | 4/10 | 0 |
| **Overall** | **4.8/10** | **5.4/10** | **5.4/10** | **6.0/10** | **+0.6** |

Science ships delivered the biggest single-pillar improvement since colony ships: Exploration jumped from 5 to 7. The scout→discover→settle loop now works. But Strategic Depth and Multiplayer Fairness remain stuck — the game needs inter-player mechanics and strategic branching to climb above 6.0.

**Critical path for next +1.0 to overall score:**
1. Colony personality traits (Strategic Depth +1)
2. T3 tech expansion (Strategic Depth +1)
3. Colony crisis events (Pacing +1)
4. System orbital view (Exploration +1 through visual payoff)

**Priority order for `/develop`:**
1. Colony personality traits (Phase 2) — highest impact-to-effort ratio
2. T3 tech expansion (Phase 4) — unlocks tech rush strategy
3. Colony crisis events (Phase 2) — breaks mid-game flatline
4. Empire doctrines (Phase 4) — mid-game strategic fork
5. System orbital view (Phase 3) — visual payoff for exploration
6. Scarcity seasons (Phase 2) — economy disruption
7. Edict system (Phase 2) — influence sink
8. Surface anomalies on colony grid (Phase 1) — spatial puzzles

---

## Review #30 — 2026-03-12 — The Strategy Gap: VP Rebalance Landed, But Where Are the Choices?

**Reviewer:** Game Design Analyst (automated)
**Build State:** 56/155 tasks complete (36%). Research VP rebalance, per-tech VP bonuses, VP breakdown caching, tick-cached player summaries. In-game chat, enhanced scoreboard, event ticker, fog of war, colony ships, multi-colony management. 516 tests passing. ~13,000 lines.
**Focus:** Post-research-rebalance audit. Tech rush is now viable on paper — but does the game actually let players pursue divergent strategies? Where does the player experience stand as Phase 2 (Colony Management) remains at 4%?

---

### 1. Current State Audit

**What a player experiences today:**
1. Enter name, create/join room, configure galaxy size + match timer + practice mode
2. Game starts: isometric 3D colony on a random planet type with 4 pre-built districts and 8 pops
3. Build 6 district types (housing, generator, mining, agriculture, industrial, research), manage energy balance
4. Research 6 techs (2 tiers x 3 tracks) via R key — linear upgrades (+25%/+50%)
5. Press G for galaxy map — fog of war with 2-hop BFS visibility, dim unknown systems
6. Build colony ships (200m/100f/100a, 60 sec build), send along hyperlane paths
7. Manage up to 5 colonies via sidebar list (keyboard shortcuts 1-5)
8. Chat with other players, view scoreboard (Tab), watch event ticker
9. Game ends on timer — highest VP wins: pops x2 + districts + alloys/25 + research/50 + techVP (+5/+10/+20 per tier)

**What changed since R29:**
- Research VP contribution doubled (divisor 100 → 50)
- Per-tech VP bonuses: +5 per T1 tech, +10 per T2, +20 per T3
- All 6 current techs = +45 VP bonus, making tech rush competitive
- VP breakdown and player summary caching (perf, not gameplay)

**What a player still CANNOT do:**
- Scout without colonizing (no science ships)
- Respond to crises or random events
- Build buildings (only districts — no colony specialization depth)
- See a system orbital view (galaxy → colony is abrupt)
- Interact with other players beyond chat (no trade, diplomacy, combat)
- Spend influence (100 starting, dead resource)
- Choose an empire identity (no factions, doctrines, or asymmetry)
- Claim territory without settling (no outposts/starbases)

---

### 2. 4X Design Pillar Scores

#### Strategic Depth: 4.5/10 (was 4)
The research VP rebalance is a meaningful step — a player who rushes all 6 techs now earns +45 VP from tech bonuses alone, plus doubled stockpile VP. This creates a paper-viable "tech rush" strategy. But in practice, there's only one path through the tech tree (linear prerequisites, no branching), and the strategic decision is simply "build research districts or don't." The game still lacks the competing priorities that define strategic depth: there's no military threat to defend against, no diplomatic leverage to gain, no exclusive choices that lock out alternatives. Colony specialization remains implicit (planet bonuses) rather than mechanically rewarded.

**What would move the needle:** Empire doctrines (permanent choice at 3 colonies), tech tree branching (mutually exclusive T2 options), and colony personality traits (mechanical reward for specialization).

#### Pacing & Tension: 5/10 (unchanged)
The early game arc (stabilize → grow → expand) remains solid. The mid-game is still a flatline. Once you have 3-4 colonies with districts queued, the game becomes "wait for timers and occasionally click build." No crises interrupt optimization, no rivals threaten your borders, no new mechanics unlock in the mid-game. The scoreboard creates passive competitive awareness but no actionable tension — you can see Player B is ahead, but you can't do anything about it besides build faster. The match timer provides end-game urgency but not drama.

#### Economy & Production: 6.5/10 (was 6)
Still the strongest pillar. The VP rebalance slightly improves this score because research output now has meaningful VP weight, making research districts a real investment rather than a luxury. Energy remains a compelling bottleneck. Planet bonuses differentiate economic profiles. The "save up for colony ship vs build districts now" tension is real. Still missing: influence as a resource, building variety beyond districts, any late-game resource sinks, and escalating costs that prevent infinite growth.

#### Exploration & Discovery: 5/10 (unchanged)
Fog of war remains the foundation. The 2-hop visibility creates genuine frontier excitement. But exploration hasn't changed since R28 — colony ships are still the only way to push into fog, and there's no survey, anomaly, or narrative discovery system. The galaxy is geometry with stats, not a world with stories. Science ships remain the single most impactful unbuilt feature.

#### Multiplayer Fairness: 5.5/10 (was 5)
Chat, scoreboard, and event ticker have meaningfully improved awareness. The VP rebalance adds strategic diversity (tech rush vs expansion rush), which indirectly improves fairness by giving trailing players a viable catch-up path (invest in research for late VP instead of competing on colonies). Starting positions are symmetric. But there are still no comeback mechanics, no diplomacy, and no way to interfere with a leader. Information is largely symmetric but unexploitable — knowing your rival is ahead doesn't give you tools to respond.

**Overall Score: 5.3/10** (was 5.0 — marginal improvement from VP rebalance opening strategic space)

---

### 3. Top 5 Things a Playtester Would Notice

1. **"I can see the other player is winning and there's nothing I can do."** The scoreboard shows VP, colonies, pops, income — and when you're behind, your only option is "build districts faster." No raiding, no sabotage, no diplomacy, no comebacks. The game creates competitive awareness without competitive agency.

2. **"My colonies are just resource farms with no personality."** Five colonies, same build order, same district mix. Planet bonuses add +1-2 resources but don't change decisions. No buildings, no specialization rewards, no events that make Colony #3 feel different from Colony #1. Phase 2 at 4% is showing.

3. **"I researched everything by minute 10 and there's nothing left."** 6 techs at cost 150/500. Even without heavy research investment, all techs complete well before match end. The VP bonuses help, but the experience of having nothing left to research for the second half of the match is deflating.

4. **"I want to scout before I commit a colony ship."** Sending 400 resources into fog with no prior intel feels bad. You're either lucky (great planet) or unlucky (nothing habitable). Science ships would transform this from gambling into planning.

5. **"The game peaks at minute 8 and plateaus."** The opening (build up homeworld) and early expansion (first colony ship) are genuinely engaging. But by minute 8-10, the gameplay loop is fully solved and nothing new emerges. No mid-game event, no rival encounter, no second-tier mechanic unlocking.

---

### 4. Recommendations

### R30-1: Colony Crisis Events — The Mid-Game Needs Disruption

**Impact:** High
**Effort:** Medium
**Category:** Core Mechanic

**The problem:** After establishing 2-3 colonies, the game enters an optimization plateau. Nothing bad ever happens, nothing demands reactive play. Minutes 10-20 are "queue districts, wait for timers."
**The fix:** Every 500-800 ticks (~50-80 sec) per colony, trigger one of 4 crisis types requiring a choice within 200 ticks (20 sec):
- **Seismic Activity:** Threatens 1 random district. Choice: Evacuate (lose district but save pops) or Reinforce (spend 100 minerals to save it, 30% chance of failure losing district + 1 pop).
- **Plague Outbreak:** Pop growth halted, -1 pop per 100 ticks. Choice: Quarantine (growth halted for 300 ticks but no pop loss) or Rush Cure (spend 50 energy + 50 food, 80% success, 20% spreads to another colony).
- **Power Surge:** Energy grid unstable. Choice: Shut Down (all districts disabled for 100 ticks) or Ride It Out (+50% energy production for 200 ticks, 25% chance of losing a generator district).
- **Labor Unrest:** 3 random districts go on strike (disabled). Choice: Negotiate (spend 25 influence, districts resume) or Wait It Out (strike ends in 300 ticks).
**Why it matters:** Crises create stories, force attention management across colonies, and break the optimization monotony. A plague hitting your main colony while you're managing expansion creates the "oh no" moment that's completely absent. Broadcast events let rivals see your crises — creating strategic information and multiplayer drama.
**Design details:**
- `colony.crisisState = { type, ticksRemaining, resolved }` in game-engine
- `resolveCrisis` command handler with choice parameter
- Unresolved crises auto-resolve with worst outcome (punishes inattention)
- Crisis immunity for 300 ticks after resolution (no stacking misery)
- Broadcast crisis events to all players via ticker

### R30-2: T3 Techs — Research Needs a Payoff

**Impact:** High
**Effort:** Low
**Category:** Content / Strategic Depth

**The problem:** The VP rebalance made research *worth points*, but completing all 6 techs by minute 10 means research districts produce aimless VP stockpile for the second half. There's no "big payoff" for heavy research investment.
**The fix:** 3 Tier 3 techs at cost 1000, each game-changing:
- **Fusion Reactors** (physics, requires Advanced Reactors): Generators also produce +2 alloys each. Eliminates the energy-vs-alloys trade-off.
- **Genetic Engineering** (society, requires Gene Crops): Pop growth time halved (0.5x multiplier). Explosive late-game population growth.
- **Automated Mining** (engineering, requires Deep Mining): Mining districts require 0 jobs. Frees pops for other work.
**Why it matters:** At cost 1000, T3 requires ~83 months with 3 research districts on an Academy World — reachable at ~14 minutes. +20 VP per T3 tech plus the transformative economic effect creates a genuine "tech rush" victory path that plays fundamentally differently from expansion rush. A player who reaches Automated Mining has free mineral production — their pops can all work research/industrial districts.
**Design details:**
- T3 techs already specified in design.md — just needs implementation
- `jobOverride` effect type for Automated Mining (new modifier in `_getTechModifiers`)
- `districtBonus` with secondary production for Fusion Reactors

### R30-3: Empire Doctrines — The Missing Identity Moment

**Impact:** High
**Effort:** Low-Medium
**Category:** Core Mechanic

**The problem:** All empires play identically. The VP rebalance created divergent scoring but not divergent gameplay. A tech-rush player and an expansion-rush player build the same districts in the same order — they just weight research vs. colony ships differently.
**The fix:** At 3 colonies, a `doctrineAvailable` event fires. Player must choose one of three permanent doctrines:
- **Expansionist:** Colony ship build time -40%, colony cap 5→7, +2 VP per colony. Strategy: go wide.
- **Industrialist:** All district build time -25%, +1 alloy per Industrial district. Strategy: tall + alloy stockpile VP.
- **Scholar:** Research output +25% empire-wide, +5 VP per completed tech (stacks with existing per-tech VP). Strategy: tech rush.
**Why it matters:** This creates the mid-game pivot point the game desperately needs. At 3 colonies (~minute 8), you stop and make a permanent choice that shapes the rest of the match. The choice is visible on the scoreboard, creating multiplayer reads: "she went Scholar — expect a late-game VP surge from T3 techs."
**Design details:**
- `playerState.doctrine = null | 'expansionist' | 'industrialist' | 'scholar'`
- `chooseDoctrine` command handler, one-time only
- Modifiers applied in existing `_processConstruction`, `_calcProduction`, `_calcVPBreakdown`
- Doctrine badge on scoreboard (Tab overlay)

### R30-4: Science Ships — Complete the Explore Pillar

**Impact:** High
**Effort:** Medium
**Category:** Core Mechanic

**The problem:** Colony ships (400 resources) are the only way to push into fog. No lightweight scouting, no "peek before you commit." The explore phase of 4X is just gambling.
**The fix:** Science ships: cheap (100m + 50a), fast (30 ticks/hop), auto-survey on arrival (100 ticks, reveals planets, 20% anomaly chance per planet), max 3 per player. 5 anomaly types (one-time bonuses: +research, +minerals, +alloys, +influence, +planet size).
**Why it matters:** Creates the scout-then-settle loop that defines 4X exploration. Fog of war becomes gameplay, not just visuals.
**Design details:** Already well-specified in design.md and R28/R29. Implementation-ready.

### R30-5: Influence Edicts — Make the Dead Resource Live

**Impact:** Medium-High
**Effort:** Low
**Category:** Economy / Player Agency

**The problem:** Influence starts at 100 and never changes. Players learn to ignore it. It's a broken promise in the HUD.
**The fix:** 4 edicts spending influence:
- **Mineral Rush** (50 influence): +50% mining output for 5 months
- **Population Drive** (75 influence): +100% pop growth for 5 months
- **Research Grant** (50 influence): +50% research output for 5 months
- **Emergency Reserves** (25 influence): Instantly +100 energy, +100 minerals, +100 food
Max 1 active edict. 100 starting influence = 1-3 strategic uses per game.
**Why it matters:** Creates "clutch" timing decisions. Population Drive before a new colony, Research Grant when pushing for T3, Emergency Reserves when a colony ship drains you. Finite budget = genuine opportunity cost.

### R30-6: Colony Personality Traits — Reward Specialization

**Impact:** Medium
**Effort:** Low
**Category:** Strategic Depth

**The problem:** 5 colonies, same build order. No reward for going all-in on one district type. Planet bonuses are too subtle to drive strategy.
**The fix:** When a colony has 4+ districts of one type, it earns a trait:
- **Forge World** (4+ Industrial): +10% alloy production empire-wide, +5 VP
- **Academy World** (4+ Research): +10% research empire-wide, +5 VP
- **Mining Colony** (4+ Mining): +10% minerals empire-wide, +5 VP
- **Breadbasket** (4+ Agriculture): +10% food empire-wide, +5 VP
- **Power Hub** (4+ Generator): +10% energy empire-wide, +5 VP
One trait per colony (highest count wins). Stacks across colonies.
**Why it matters:** Creates empire-level strategy. 3 Forge Worlds = +30% alloys. An Academy World on an Ocean planet (+research bonuses) becomes strategically obvious. The galaxy becomes a puzzle: "Which planets support which specializations?"

---

### 5. Balance Snapshot

#### VP Formula Analysis (Post-Rebalance)

| VP Source | Typical 20-min Value | Notes |
|-----------|---------------------|-------|
| Pops (x2) | 60-80 VP (30-40 pops) | Still dominant |
| Districts (x1) | 20-30 VP | Scales with expansion |
| Alloys (/25) | 4-8 VP | Minor unless hoarding |
| Research (/50) | 20-35 VP | Doubled — now meaningful |
| Tech VP (+5/+10) | 30-45 VP (all 6 techs) | Significant — makes tech path viable |

**Verdict:** The rebalance works. A 3-colony tech-focused player (25 pops = 50 VP, 15 districts = 15 VP, all 6 techs = 45 VP, research stockpile = ~25 VP, alloys = ~4 VP) = ~139 VP. A 5-colony expansion player (40 pops = 80 VP, 25 districts = 25 VP, 3 techs = 15 VP, research = ~10 VP, alloys = ~6 VP) = ~136 VP. These are roughly competitive. Tech rush is now viable but not dominant.

**Issue:** Both strategies still feel the same moment-to-moment. The VP math diverges but the gameplay doesn't. Doctrines and colony traits would create the mechanical divergence to match the scoring divergence.

#### Tech Pacing
| Tier | Cost | 1 Research District | 2 Research Districts | 3 Research (Academy World) |
|------|------|---------------------|---------------------|---------------------------|
| T1 | 150 | 37.5 mo (6.3 min) | 18.75 mo (3.1 min) | 12.5 mo (2.1 min) |
| T2 | 500 | 125 mo (20.8 min) | 62.5 mo (10.4 min) | 41.7 mo (6.9 min) |
| T3 | 1000 | 250 mo (41.7 min) | 125 mo (20.8 min) | 83.3 mo (13.9 min) |

T3 is only reachable with serious research investment (2-3 districts). This is correct — it rewards commitment.

#### Game Length
- 20-minute default matches are correct for current depth
- With crises, doctrines, and T3 techs, 25-30 minutes would be appropriate
- Recommend adding 25-minute option to match timer

---

### 6. Content Wishlist

1. **Galactic Leylines**: Hidden resource veins connecting 3 star systems. Colonize all endpoints → +15% production bonus to all three colonies. Creates an expansion puzzle that rewards galaxy knowledge. Already in design.md — highest-priority stretch content.

2. **Colony Siege Mode**: When a rival has a colony within 2 hops, you can "pressure" it by spending 50 alloys to deploy a "blockade marker." Besieged colony produces -25% until the blocker is removed (costs the blocker 10 alloys/month to maintain). No combat needed — economic warfare. Creates multiplayer friction without fleet mechanics.

3. **Precursor Artifact Hunt**: 5 special systems scattered in fog. Survey all 5 with science ships → reveal a size-25 "Precursor Homeworld" with pre-built districts. First to colonize it gets a massive VP spike (+30 VP). Creates a galaxy-spanning treasure hunt intersecting exploration, territory, and racing.

4. **Dynamic Difficulty Scaling**: In practice mode, after minute 5, introduce AI "pirate raids" that threaten colonies on a timer. Forces defensive play and resource management even in single-player. Creates the external pressure that multiplayer provides.

5. **Match Replay Graph**: On game over, show a timeline graph of each player's VP over time. See the moment someone surged ahead, the inflection points, the comebacks. Low effort, high emotional payoff. Players learn from their pacing.

---

### 7. Roadmap Alignment

**The Phase 2 gap is now critical.** Phase 1 is at 73% but Phase 2 (Colony Management) is at 4%. The game has a galaxy, fog of war, colony ships, chat, scoreboard — but the colonies themselves remain shallow. The next wave of development should prioritize colony depth (crises, traits, buildings) alongside the exploration loop (science ships).

**Recommended build order for maximum impact:**
1. Colony crisis events (R30-1) — breaks mid-game monotony, highest pacing impact
2. T3 techs (R30-2) — completes research endgame, low effort
3. Empire doctrines (R30-3) — mid-game identity moment, creates strategic divergence
4. Science ships (R30-4) — completes explore pillar, medium effort
5. Influence edicts (R30-5) — makes dead resource live, low effort
6. Colony personality traits (R30-6) — rewards specialization, low effort

**New tasks added to design.md:** See Section 8.

---

### 8. Summary

| Metric | R27 | R28 | R29 | R30 | Delta |
|--------|-----|-----|-----|-----|-------|
| Strategic Depth | 5/10 | 5/10 | 4/10 | 4.5/10 | +0.5 |
| Pacing & Tension | 5/10 | 6/10 | 5/10 | 5/10 | 0 |
| Economy & Production | 7/10 | 7/10 | 6/10 | 6.5/10 | +0.5 |
| Exploration & Discovery | 3/10 | 5/10 | 5/10 | 5/10 | 0 |
| Multiplayer Fairness | 4/10 | 4/10 | 5/10 | 5.5/10 | +0.5 |
| **Overall** | **4.8/10** | **5.4/10** | **5.0/10** | **5.3/10** | **+0.3** |

Research VP rebalance moved the needle on strategic viability but not on moment-to-moment gameplay. The math now supports divergent strategies; the game mechanics don't yet deliver divergent experiences. Colony crises, empire doctrines, and T3 techs are the three features that would most transform the player experience.

**Critical path:** Colony crises → T3 techs → Empire doctrines → Science ships → Edicts → Colony traits. The first three are the "mid-game rescue" — they give players things to do, think about, and react to between minutes 8 and 20.

---

*(Reviews R29 and earlier trimmed for space — see git history)*
