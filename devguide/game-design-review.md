# ColonyGame — Game Design Review

*Living document — newest reviews first.*

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

## Review #29 — 2026-03-12 — The Multiplayer 4X Emerges: Chat, Scoreboard, and the Missing Middle Game

**Reviewer:** Game Design Analyst (automated)
**Build State:** 55/153 tasks complete (36%). In-game chat, enhanced scoreboard, event ticker, fog of war, colony ships, multi-colony management, BFS pathfinding, planet bonuses, game speed, toast HUD, mini tech tree, VP scoring, energy deficit. 495 tests passing. ~12,700 lines.
**Focus:** Post-multiplayer-awareness audit. The game now has fog of war, chat, scoreboards, and broadcast events — the multiplayer shell exists. Where is the player experience today, and what's the most impactful path forward?

---

### 1. Current State Audit

**What a player experiences today:**
1. Enter name, create/join room, configure galaxy size + match timer + practice mode
2. Game starts: isometric 3D colony on a random planet type with 4 pre-built districts
3. Build 6 district types, manage energy balance, watch pops grow with food surplus
4. Research 6 techs (2 tiers x 3 tracks) via R key panel
5. Press G for galaxy map — fog of war reveals 2-hop radius, unknown systems dim
6. Build colony ships (200m/100f/100a), send them along hyperlane paths to colonize
7. Manage up to 5 colonies via sidebar list (keyboard shortcuts 1-5)
8. Chat with other players via collapsible in-game chat panel
9. See rival progress on Tab scoreboard (VP, colonies, pops, income rates)
10. Event ticker broadcasts significant actions (colony founded, construction, research, pop milestones)
11. Game ends on timer — highest VP wins (pops x2 + districts + alloys/25 + research/100)

**What a player CANNOT do:**
- Build buildings (only districts exist — no specialization beyond type)
- Build science ships, military ships, or any non-colony vessel
- Attack, trade with, or diplomatically interact with other players
- See a system orbital view (galaxy jumps directly to colony)
- Respond to random events or crises
- Choose a faction or specialization
- Win through any means other than VP-on-timer

---

### 2. 4X Design Pillar Scores

#### Strategic Depth: 4/10
The game has resource management and expansion decisions, but lacks the tension between competing priorities that defines great 4X. Every player follows roughly the same build order: agriculture for food → mining for minerals → expand → repeat. The tech tree is too small (6 techs, all linear upgrades) to create meaningful divergence. There's no military threat, no diplomatic leverage, no reason NOT to expand. Colony specialization is implied by planet bonuses but not deep enough to create real identity for each colony.

**Bright spot:** The colony ship cost (200m/100f/100a) creates a genuine "save up vs build now" decision, and fog of war adds uncertainty to expansion timing.

#### Pacing & Tension: 5/10
Improved significantly with fog of war and the event ticker. The early game has a clear arc: stabilize energy → grow food → build colony ship → expand. But the mid-game is a flatline — once you have 3-4 colonies, you're just building more districts with no new mechanics unlocking. There's no crisis, no rival interaction, no "oh no" moment. The scoreboard creates mild competitive tension but without the ability to interfere with opponents, it's just a number-watching exercise.

**Bright spot:** Match timer creates urgency. Fog of war creates genuine "what's out there?" excitement during expansion.

#### Economy & Production: 6/10
The strongest pillar. Six resource types with clear purposes. Energy as a bottleneck (consumed by industrial and research) creates real trade-offs. Planet type bonuses reward matching districts to terrain. Pop-job-housing triangle works well. Food surplus drives growth speed in a satisfying way. The shared resource pool (Stellaris model) keeps accounting simple.

**Issues:** All districts of a type are identical — no upgrade path, no adjacency bonuses, no specialization within types. Building costs are uniform (100m for basic, 200m for advanced), creating no interesting cost curve as the game progresses.

#### Exploration & Discovery: 5/10
Fog of war is a strong foundation. The 2-hop visibility radius creates a genuine frontier. Unknown systems showing as dim dots preserves galaxy shape awareness while hiding details. Colony ships as the only exploration tool is limiting — you're committing 200m/100f/100a just to see what's out there.

**Critical gap:** No science ships. No anomalies during exploration. No reward for scouting except finding habitable planets. The galaxy is just geometry — no narrative, no surprises, no "what if I go deeper?" pull.

#### Multiplayer Fairness: 5/10
Starting positions are spread via the galaxy generator's `assignStartingSystems`. All players start with identical resources and districts. The scoreboard and event ticker create information symmetry. But there are no comeback mechanics — a player who expands faster just wins, with no way for laggards to catch up. No diplomacy means no kingmaking, but also no coalition-building against a leader.

**Overall Score: 5.0/10**

---

### 3. Top 5 Things a Playtester Would Notice

1. **"There's nothing to do in the mid-game."** After your 3rd colony, you're just queuing districts and waiting for timers. No new mechanics unlock, no threats emerge, no decisions escalate. The game needs a mid-game catalyst.

2. **"I can't interact with other players at all."** Chat and scoreboard exist, but gameplay is completely parallel. You can't trade, attack, block, or meaningfully affect another player. It's a competitive idle game, not a multiplayer 4X.

3. **"Every colony feels the same."** You build the same districts in the same order. Planet bonuses are too subtle (+1-2 resources) to drive different strategies. Colonies need identity — buildings, features, crises, specialization.

4. **"The tech tree is over in 5 minutes."** 6 techs, all linear upgrades, exhausted quickly. There's no branching, no exclusive choices, no "tech rush" viable as a strategy. Research feels like a checklist, not a strategic dimension.

5. **"I can't see the system — there's no bridge between galaxy and colony."** Clicking a star on the galaxy map teleports you to the colony grid. The system view (planets orbiting a star) is missing. You never see the planets you're choosing to colonize.

---

### 4. Recommendations

### R29-1: Science Ships and the Scout-Settle Loop

**Impact:** High
**Effort:** Medium
**Category:** Core Mechanic

**The problem:** Colony ships are the only mobile unit. Exploring costs 400 resources (colony ship) and commits you to settling. There's no lightweight scouting, no "peek before you commit" gameplay. The explore phase of 4X is stunted.
**The fix:** Already well-specified in design.md as "Science ship unit type (game-designer R28)." This is the single highest-impact unimplemented feature. Cheap ships (100m + 50a), fast (30 ticks/hop), auto-survey on arrival (reveals planets + 20% anomaly chance), max 3 per player. Creates the core 4X loop: scout → evaluate → settle.
**Why it matters:** Every great 4X game has a scout unit that's separate from settlers. Stellaris has science ships, Civ has scouts/warriors, Endless Space has probes. Without this, exploration is just "send an expensive colony ship and hope." Science ships transform fog of war from a visual feature into a gameplay system.
**Design details:**
- Survey time: 100 ticks (10 sec) per system
- Anomaly types: 5 simple one-time bonuses (already designed)
- Persistent fog penetration: surveyed systems stay revealed
- Render as cyan diamond on galaxy map
- Creates "scout then settle" planning layer

### R29-2: Colony Crisis Events — Breaking the Optimization Monotony

**Impact:** High
**Effort:** Medium
**Category:** Core Mechanic

**The problem:** Once you have your colonies running, there's zero disruption. Nothing bad ever happens. The game becomes "click build, wait, click build." Great 4X games interrupt optimization with problems that demand reactive play.
**The fix:** Already specified in design.md as "Colony crisis events (3 types)." Every 5-8 months per colony, trigger a crisis requiring player choice within 2 months. "Seismic Activity" (evacuate vs endure), "Plague" (halts growth unless cured), "Power Surge" (risky bonus). Forces attention management across multiple colonies.
**Why it matters:** Stellaris anomalies and crises are what make mid-game memorable. Without disruption, optimization is just a spreadsheet. Crises create stories ("remember when the plague hit my main colony right before the timer?") and force strategic flexibility.
**Design details:**
- 3 crisis types with binary choices
- `resolveCrisis` command with choice parameter
- Unresolved crises auto-resolve with worst outcome (punishes inattention)
- 500-800 tick interval between crises per colony
- Events create multiplayer drama via broadcast

### R29-3: System Orbital View — The Missing Visual Layer

**Impact:** Medium-High
**Effort:** Medium
**Category:** Core Mechanic / Visual

**The problem:** Galaxy map → colony view is an abrupt jump. Players never see the system they're colonizing — the planets, the star, the orbital layout. This is the visual centerpiece of space 4X games and it's completely absent.
**The fix:** Already specified as "System orbital view (game-designer R24-1)." Central star, orbital rings, planets sized by planet.size, colored by type, habitable planets with atmosphere glow. Click planet for detail panel. Navigation: Galaxy → System → Colony.
**Why it matters:** This is the "wow" moment for space 4X. Stellaris's system view is where you fall in love with the universe. It's also functional: it's where you evaluate colonization targets, see what's in a system, and eventually manage starbases/fleets. Without it, the galaxy is abstract nodes.
**Design details:**
- PerspectiveCamera, slight top-down angle
- Planets orbit slowly (cosmetic)
- Clickable planets with detail panel
- "Colonize" button for colony ship targeting
- Escape returns to galaxy

### R29-4: Tech Tree T3 Expansion — Making Research a Strategy

**Impact:** Medium
**Effort:** Low
**Category:** Content / Balance

**The problem:** The tech tree has 6 techs across 2 tiers. All are linear upgrades (+25%/+50%). A player can exhaust the entire tree in 5-10 minutes. Research doesn't feel like a strategic investment — it's a checklist you complete early and forget.
**The fix:** Already specified as "Tech tree T3 expansion (game-designer R17-5)." Add 3 Tier 3 techs with powerful, game-changing effects: Fusion Reactors (+100% generator + generators produce alloys), Genetic Engineering (+100% agriculture + growth halved), Automated Mining (+100% mining + mining costs 0 jobs). Cost 1000 — unreachable without heavy research investment.
**Why it matters:** T3 techs at cost 1000 create a viable "tech rush" strategy. A player who invests heavily in research gets a transformative payoff that changes their economy. This adds a strategic dimension that doesn't exist today: invest in tech or invest in expansion?
**Design details:**
- T3 costs ~167 months with 2 research districts — forces commitment
- Each T3 has a secondary effect (alloy production, job reduction, growth speed) that changes how you play
- Creates strategy divergence: Fusion player pivots to alloys, Gene Crops player grows pops fast, Automated Mining player frees up pops

### R29-5: Empire Doctrines — Asymmetric Mid-Game Identity

**Impact:** Medium
**Effort:** Low-Medium
**Category:** Core Mechanic

**The problem:** All empires play identically. There's no strategic identity beyond "who expanded faster." No meaningful choice permanently shapes your playstyle.
**The fix:** Already specified as "Empire specialization doctrines (game-designer R28)." At 3 colonies, choose one permanent doctrine: Expansionist (colony ship -40% build time, +2 colony cap), Industrialist (district build -25%, +1 alloy/industrial), Scholar (research +25%, +3 VP/tech). Cannot change.
**Why it matters:** This is Stellaris civics meets Civ VI government. It creates the mid-game pivot point the game desperately needs. At 3 colonies, you stop and think: "What kind of empire am I building?" The choice is permanent, creating commitment and regret in equal measure.
**Design details:**
- Trigger: 3 colonies → `doctrineAvailable` event
- 3 options align with wide/tall/tech strategies
- Doctrine badge on scoreboard creates multiplayer reads ("they went Scholar, expect a late-game VP surge")
- Simple to implement: modifier applied in existing processing functions

### R29-6: Military Outposts — Territorial Gameplay Without Combat

**Impact:** Medium
**Effort:** Low
**Category:** Core Mechanic

**The problem:** The only way to claim space is to colonize. With 5-colony cap, you control at most 5 of 50+ systems. The galaxy map has vast unclaimed space with no way to project territorial influence.
**The fix:** Already specified as "Military outpost system (game-designer R22-6)." Buildable at owned systems for 100 alloys + 200 ticks. Claims system, +1 influence/month, extends fog by +1 hop. Max 3 per player. +3 VP each.
**Why it matters:** Outposts are the lightest possible territorial mechanic. They don't require combat, they don't require colonization, they just say "this space is mine." They create contested territory before military exists, extend fog of war (making exploration more rewarding), and add VP pressure.
**Design details:**
- Build from galaxy map on owned systems
- Only within 2 hops of existing territory
- If another player colonizes the system, outpost transfers
- Creates chokepoint awareness: "if I outpost that system, I block their expansion corridor"

### R29-7: Contested Colonization — Multiplayer Friction Point

**Impact:** Medium
**Effort:** Low
**Category:** Multiplayer

**The problem:** Two players can send colony ships to the same planet and there's no resolution. First-arrive-wins needs to be explicit, and near-misses need to feel dramatic.
**The fix:** Already specified as "Contested colonization race resolution (game-designer R28)." First to arrive wins. Same-tick arrivals: coin flip, loser gets 50% refund. Emit race events.
**Why it matters:** This is the first real multiplayer interaction. Two colony ships racing to the same system is inherently dramatic — especially with fog of war. It creates stories, rivalry, and the feeling that other players matter.
**Design details:**
- Check `planet.colonized === false` in `_foundColonyFromShip`
- Seeded random for same-tick ties
- 50% resource refund to loser
- Events broadcast to both players

---

### 5. Balance Snapshot

#### Resource Flow Analysis
| Resource | Start | Basic District Output | Monthly Cost (8 pops, 4 districts) | Net/Month |
|----------|-------|----------------------|-------------------------------------|-----------|
| Energy | 100 | 6/generator | 6 gen - 1 housing = +5 | Stable |
| Minerals | 300 | 6/mining | 6 mining, no consumption = +6 | Accumulates |
| Food | 100 | 6/agriculture | 12 agri - 8 pops = +4 | Slow growth OK |
| Alloys | 50 | 4/industrial | 4 ind - 3 energy cost = net +4 alloys, -3 energy | Tight |

**Verdict:** Starting economy is well-balanced. Energy is correctly the bottleneck. Minerals accumulate fastest, making them the primary building currency. Alloys are appropriately scarce (colony ship costs 100 alloys = 25 months of 1 industrial).

#### Colony Ship Economics
- Cost: 200m + 100f + 100a = ~45 months of saving with 1 mining + 2 agriculture + 1 industrial
- This is appropriate — expansion should feel expensive. But the 60-second build time adds significant delay
- **Suggested tweak:** None needed. The economics create a satisfying "save up → commit → expand" rhythm

#### VP Balance Concerns
- Pops x2 is the dominant VP source (8 starting pops = 16 VP)
- Districts x1 is secondary (4 starting = 4 VP)
- Alloys/25 and Research/100 are negligible in short games
- **Issue:** Research VP (total_research/100) is almost worthless. A player with 2 research districts generates 8/month per track = 24 total/month. Over a 20-minute game (~120 months), that's 2,880 research = 28 VP from research. Meanwhile, 3 colonies with 15 pops each = 90 VP from pops alone.
- **Fix:** Increase research VP weight to total_research/50 (doubles VP contribution) OR add VP per completed tech (e.g., +5 VP per T1 tech, +10 per T2, +20 per T3)

#### Build Time Analysis
| Item | Ticks | Real Time (speed 2) | Feel |
|------|-------|---------------------|------|
| Basic district | 200-300 | 20-30 sec | Good |
| Advanced district | 400 | 40 sec | Slightly long |
| Colony ship | 600 | 60 sec | Appropriate for cost |
| New colony first 3 districts | 50% time | 10-20 sec | Good accelerant |

**Verdict:** Build times are reasonable. The 50% discount for first 3 districts on new colonies is a great mechanic that makes expansion immediately rewarding.

#### Game Length
- 20-minute timer (default): ~120 months in-game
- Feels right for the current content depth
- With more mechanics (combat, diplomacy), 30 minutes would be more appropriate
- **No change needed** for current state

---

### 6. Content Wishlist — "Wouldn't It Be Cool If..."

1. **Galactic Leylines** (already in design.md): Hidden resource veins connecting star systems. Colonize all endpoints to activate a 15% production bonus. Creates an expansion puzzle layer — "settle the obvious planet or complete the leyline?" This is the most distinctive idea in the roadmap. Prioritize it.

2. **Colony Personality System**: Each colony develops a "character" based on what you build. Research-heavy colonies become "Academic Centers" (bonus: +1 research per pop). Military-focused become "Fortress Worlds" (bonus: defense bonus). Agriculture-heavy become "Breadbasket Worlds" (bonus: food exports to other colonies at +25%). Personality emerges at 10+ districts of a majority type. Creates emergent colony identity without requiring explicit player choice.

3. **Precursor Storyline**: Scattered across the galaxy, 5 "Precursor Artifact" systems (special star type). Surveying all 5 with science ships reveals a "Precursor Homeworld" — a size 25 planet with pre-built districts. First player to survey all 5 and send a colony ship claims it. Creates a galaxy-spanning treasure hunt that intersects with exploration, territory control, and multiplayer racing.

4. **Galactic Council**: At 50% game time elapsed, a "Galactic Council" forms. Every 3 minutes, a resolution is voted on: "Mutual Research Pact" (+10% research for all), "Demilitarization" (ship build time +50%), "Open Borders" (fog of war removed for all). Each player casts one vote. Creates diplomatic interaction without a formal diplomacy system.

5. **Colony Time-Lapse on Game Over**: Already in design.md as "Spectator replay time-lapse." Record snapshots every 10 months, replay as 30-second animation on game over. This is a low-effort emotional hook that turns every game into a shareable story.

---

### 7. Roadmap Alignment

The existing design.md roadmap is comprehensive and well-specified. Most of my recommendations are already present as tasks. The key issue is **prioritization** — Phase 2-7 are mostly untouched while Phase 1 keeps growing.

**Recommended build order for maximum player impact:**
1. Science ships (design.md: already specified) — unlocks exploration loop
2. Colony crisis events (design.md: already specified) — breaks mid-game monotony
3. System orbital view (design.md: already specified) — visual wow factor
4. T3 tech expansion (design.md: already specified) — strategic depth
5. Empire doctrines (design.md: already specified) — mid-game identity
6. Military outposts (design.md: already specified) — territorial gameplay
7. Contested colonization (design.md: already specified) — multiplayer friction

**New tasks added to design.md:** 3 (research VP rebalance, colony personality system, Galactic Council mid-game vote)

---

## Review #28 — 2026-03-12 — Fog of War: The Galaxy Has Secrets Now

**Reviewer:** Game Design Analyst (automated)
**Build State:** 51/149 tasks complete (34%). Fog of war, colony ships, multi-colony management, BFS pathfinding, planet bonuses, game speed, toast HUD, mini tech tree, VP scoring, energy deficit. 438 tests passing. ~11,600 lines.
**Focus:** Post-fog-of-war audit — the exploration pillar finally exists. What's the game's identity shaping up to be, and where does it go next?

---

### 1. Current State Audit

**What a player experiences today:**
1. Enter name, create/join room, configure galaxy size + match timer
2. Game starts: isometric 3D colony view with 4 pre-built districts on a random planet type
3. Build districts (6 types) by clicking empty tiles, manage energy balance
4. Research 6 techs across 3 tracks (2 tiers) via R key panel
5. Press G for galaxy map — star systems visible in fog tiers (known 2-hop radius, unknown dim gray)
6. Build colony ships (200m + 100f + 100a) from colony build menu
7. Send colony ships along hyperlanes — discover new systems as fog lifts, found colonies (2 pops)
8. Manage up to 5 colonies via sidebar list, keyboard shortcuts 1-5
9. Fog of war creates genuine "what's out there?" tension — unknown systems show as dim dots, hovering shows "Unknown System", system panel shows "Unexplored"
10. Game ends on timer — highest VP wins (pops x2 + districts + alloys/25 + research/100)

**What a player CANNOT do:**
- Interact with other players during gameplay (no chat, diplomacy, trade, or combat)
- See a scoreboard showing rival progress
- Build buildings (only districts exist)
- Specialize colonies for empire-wide bonuses (no personality traits)
- Scout without colonizing (no science ships or scouts)
- Claim territory without settling (no starbases/outposts)
- Choose different openings (every game starts identically)
- Use influence (100 starting, no way to spend)

**The honest assessment:** Fog of war has completed the *feeling* of exploration. The galaxy now has secrets — you send colony ships into gray space and discover what's there. Combined with colony ships, the core loop is: build economy → build colony ship → push into fog → discover → found colony → fog recedes, revealing more targets. This is a real 4X loop. But the game is still a **multiplayer solitaire empire builder** — two players in the same galaxy might never know each other exist until end-of-match scores. The next breakthrough needs to be **player interaction**.

---

### 2. 4X Design Pillar Scores

#### Strategic Depth: 5/10 (unchanged from R27)
Fog of war adds information asymmetry but doesn't change strategic decision-making mechanically. The "tall vs wide" tension from colony ships remains the primary strategic axis. The opener is still nearly solved. Tech tree is still linear. Colony specialization doesn't exist beyond planet bonuses. Fog creates *interesting positions* but not yet *interesting choices* — you still colonize the best planet you can see, regardless of fog.

#### Pacing & Tension: 6/10 (was 5)
Fog of war adds a genuine discovery arc. Early game: build up your homeworld in a small bubble. Mid-game: push colony ships into unknown space, discover new systems as they arrive. Late-game: your fog has receded to reveal most of the galaxy. The "just one more colony" hook is strong — each new colony reveals 2-3 new systems, creating cascading discovery. The tension of sending a ship into fog and waiting to see what's there is real. Still missing: late-game crisis, player-vs-player tension, and any reason to care about what's happening beyond your borders.

#### Economy & Production: 7/10 (unchanged)
Solid and well-balanced. The resource pipeline works. Alloys have purpose through colony ships. Energy balance creates real constraints. Planet bonuses differentiate colonies. Multi-colony shared resource pool is clean. Still missing: influence spending, late-game resource sinks, building variety.

#### Exploration & Discovery: 5/10 (was 3)
The biggest jump this review. Fog of war creates genuine exploration: dim unknown systems beckon from the edge of your known space. Colonizing a new world reveals 2-3 more systems — creating the "what's next?" cascade that makes 4X exploration addictive. Ownership dots on unknown systems create intrigue ("someone's out there"). The "Unexplored" system panel creates an itch to send a ship. However, exploration is still binary — you either can see a system (and know everything about it) or you can't. There's no graduated discovery (survey → scan → full intel). No anomalies, no narrative discoveries, no "oh wow" moments beyond seeing planet stats. Science ships would add a whole discovery layer.

#### Multiplayer Fairness: 4/10 (unchanged)
Fog of war actually creates information asymmetry, which is good — different players see different parts of the galaxy. Starting positions remain evenly distributed. But multiplayer interaction is still zero. Two players in the same galaxy are playing parallel games with a shared timer. The only evidence of another player is ownership dots on fogged systems and a final scoreboard.

**Overall Score: 5.4/10 (was 4.8)** — Half a point up, driven by fog of war completing the exploration arc.

---

### 3. Top 5 Things a Playtester Would Notice

1. **"I never once talked to or interacted with the other player."** This is now the #1 issue. Colony ships and fog of war have made the single-player experience compelling. But a "multiplayer" game where players can't communicate, compete, or cooperate isn't multiplayer. Chat, scoreboard, and event ticker are the critical missing layer. This is the gap that separates "promising prototype" from "actual game."

2. **"I found a great planet but someone already colonized it."** Fog of war creates a new pain point — you push into unknown space, discover a size-18 Continental world, and an ownership dot tells you it's already taken. But there's no way to react to this. No diplomacy, no fleet to send, no way to contest. The game creates tension and then provides no resolution mechanics. Even just chat ("hey, that was my planet!") would help.

3. **"All five of my colonies feel the same."** With no personality traits, no buildings, and a solved build order (Agriculture → Housing → Mining → Industrial), managing 5 colonies feels like managing one colony five times. Planet bonuses add +1-2 to specific resources but don't change what you build or when. Colony personality traits would transform this — "my Forge World in the desert, my Academy on the ocean planet" is a story; "five colonies with the same district mix" is a chore.

4. **"I researched everything and then... nothing."** 6 techs complete in roughly 10-15 minutes. After that, research districts produce research that accumulates with no purpose except VP (at a poor rate of 1 VP per 100 research). The late-game tech experience is dead. T3 techs with game-changing effects would create a research endgame.

5. **"What's that player doing? Are they ahead of me?"** Fog of war makes you aware that other players exist (ownership dots), but you can't assess the competitive landscape at all. No scoreboard, no relative indicators, no idea whether you're winning or losing until the timer expires. A Tab-key scoreboard showing colony count, pop totals, and VP would create competitive awareness throughout the match.

---

### 4. Recommendations

### R28-1: Multiplayer Awareness Bundle — Chat, Scoreboard, Event Ticker

**Impact:** Critical
**Effort:** Low-Medium (chat infrastructure exists, scoreboard is data display, ticker is formatting)
**Category:** Multiplayer UX

**The problem:** The game is multiplayer in name only. Two players share a galaxy but have zero interaction, zero awareness, and zero competitive feedback until the final score screen. This is the single biggest gap in the player experience.

**The fix:** Three features that ship together:
1. **In-game chat** — collapsible bottom-left overlay, reuses existing WebSocket chat infrastructure, player names colored by player color. Messages visible to all players in room.
2. **Scoreboard overlay (Tab key)** — player name, color swatch, colony count, total pops, VP score, resource income rates. All public info. Toggle with Tab, auto-close on release.
3. **Event ticker** — scrolling text at top of screen narrating major events: "Player B founded a colony in Epsilon Eridani", "Player A reached 30 pops", "Player B completed Advanced Reactors". Uses existing gameEvent broadcasts with flavor text formatting.

**Why it matters:** These three features transform the psychological experience of multiplayer. Chat creates social dynamics ("nice expansion", "race you to that system"). Scoreboard creates competitive motivation ("she has 3 colonies and I only have 2 — I need to expand"). Event ticker creates narrative awareness ("he just colonized near my border — should I be worried?"). Combined, they turn parallel solitaire into a shared competitive experience. This is the highest impact-to-effort improvement available.

**Design details:**
- Chat: 200px wide collapsible panel, bottom-left, semi-transparent background. Enter key to focus, Escape to close. Last 50 messages. Player color dot next to name. System messages in gray ("Player X has disconnected")
- Scoreboard: Full-width overlay at ~60% opacity. Columns: Rank, Player (colored), Colonies, Pops, VP, Energy/mo, Minerals/mo, Alloys/mo. Sorted by VP descending. Update every 3 seconds (matches broadcast rate)
- Event ticker: Top-center, single-line scrolling, 4-second per message, max 3 queued. Color-coded by event source player. "🌍 Player B founded Kepler Colony", "📈 Player A reached 25 pops", "🔬 Player B completed Deep Mining"

### R28-2: Colony Personality Traits — Make Each Colony a Character

**Impact:** High
**Effort:** Low (server-side trait calculation + client display)
**Category:** Core Mechanic / Strategic Depth

**The problem:** Managing 5 colonies feels like managing 1 colony five times. Planet bonuses create slight differentiation but don't change build priorities. There's no reward for specialization and no empire-level strategy beyond "more colonies = more VP."

**The fix:** Already specified in design.md. When a colony has 4+ districts of one type, it earns a trait:
- **Forge World** (4+ Industrial): +10% alloy production empire-wide
- **Academy World** (4+ Research): +10% research production empire-wide
- **Mining Colony** (4+ Mining): +10% mineral production empire-wide
- **Breadbasket** (4+ Agriculture): +10% food production empire-wide
- **Power Hub** (4+ Generator): +10% energy production empire-wide

One trait per colony (highest district count wins). Traits stack across colonies. +5 VP per trait earned.

**Why it matters:** This single feature creates empire-level strategy. With 5 colonies, you can build: 1 Forge World + 1 Academy + 1 Mining Colony + 1 Breadbasket + 1 balanced capital = +10% across four resources + 20 VP. Or go aggressive: 3 Forge Worlds = +30% alloys. Or go all-in: 5 Academy Worlds = +50% research for a tech rush. Planet bonuses finally have strategic implications — a Desert world (+2 minerals/mining) is now the ideal Mining Colony. An Ocean world (+1 research/research district) is the ideal Academy. The galaxy becomes a strategic puzzle: "Which planets support which traits?"

### R28-3: Science Ships — Turn Exploration Into Gameplay

**Impact:** High
**Effort:** Medium
**Category:** Core Mechanic / Exploration

**The problem:** Exploration currently means "send colony ships into fog and read planet stats." There's no dedicated exploration unit, no graduated discovery, no anomalies, and no narrative moments. The fog creates mystery but the reveal is just numbers in a table.

**The fix:** Science ships — a cheaper, faster exploration unit:
- **Cost:** 100 minerals + 50 alloys (half a colony ship)
- **Build time:** 300 ticks (30 sec, half a colony ship)
- **Speed:** 30 ticks/hop (3 sec, faster than colony ships)
- **Survey action:** When a science ship arrives at an unexplored system, it automatically surveys for 100 ticks (10 sec). Survey reveals full planet data and has a 20% chance per planet of discovering an anomaly
- **Anomalies:** Simple one-time bonuses: "Ancient Ruins" (+50 research each track), "Mineral Deposit" (+100 minerals), "Habitable Moon" (+2 planet size), "Precursor Artifact" (+25 influence), "Derelict Ship" (+50 alloys). Anomalies fire events to the discovering player's toast system

**Why it matters:** Science ships create the classic 4X "scout then settle" loop: send a science ship into fog → it surveys the system → you learn what's there → you decide whether to colonize. This adds a planning layer to expansion (scout ahead, then send the expensive colony ship). Anomalies add narrative surprise — "I found ancient ruins!" is a memorable moment that numbers on a screen aren't. The 20% anomaly rate means ~1-2 anomalies per system, creating intermittent rewards that drive continued exploration.

**Design details:**
- Science ships share galaxy map rendering with colony ships (diamond marker, different color: cyan vs green)
- Survey progress visible as a loading bar on the galaxy view when hovering the system
- Surveyed systems remember their surveyed state per player — if you survey a system, it stays revealed even if it's outside your 2-hop visibility (persistent fog penetration)
- Science ships return to nearest colony after surveying (no permanent scout positioning needed)
- Max 3 science ships per player

### R28-4: Edict System — Make Influence Meaningful

**Impact:** Medium-High
**Effort:** Low
**Category:** Economy / Player Agency

**The problem:** Influence starts at 100 and never changes. It's a dead resource visible in the HUD that players learn to ignore. Experienced players will notice it's completely non-functional.

**The fix:** Already specified in design.md. 4 empire-wide edicts spending influence:
- **Mineral Rush** (50 influence): +50% mining output for 5 months
- **Population Drive** (75 influence): +100% pop growth for 5 months
- **Research Grant** (50 influence): +50% research output for 5 months
- **Emergency Reserves** (25 influence): Instantly grants +100 energy, +100 minerals, +100 food

Max 1 active edict at a time. No influence regeneration (100 starting = entire game budget until diplomacy exists).

**Why it matters:** With 100 influence and 4 edicts, players get 1-3 impactful timing decisions across a 20-minute match. "Do I Population Drive early for faster growth, or save for Research Grant when my Academy World is online?" Emergency Reserves becomes a clutch save when a colony ship drains your resources. The finite budget creates genuine opportunity cost — every influence spent is influence you can't spend later.

### R28-5: T3 Techs — Create a Research Endgame

**Impact:** Medium
**Effort:** Low
**Category:** Strategic Depth / Content

**The problem:** 6 techs complete in 10-15 minutes. After that, research districts produce VP at a poor rate (1 VP per 100 cumulative research). There's no research endgame and no reason to invest heavily in tech over expansion.

**The fix:** Already specified in design.md. Add 3 Tier 3 techs at cost 1000:
- **Fusion Reactors** (physics, requires Advanced Reactors): Generator districts also produce +2 alloys each. Effect: `districtBonus` for generator adding alloy production
- **Genetic Engineering** (society, requires Gene Crops): Pop growth time halved (0.5x multiplier). Effect: `growthBonus` multiplier 0.5
- **Automated Mining** (engineering, requires Deep Mining): Mining districts require 0 jobs (pop-free production). Effect: `jobOverride` district: mining, jobs: 0

**Why it matters:** T3 at cost 1000 with 2 research districts (8 research/month) takes ~125 months (~21 min at normal speed). In a 20-minute match, getting ANY T3 requires heavy research investment: multiple research districts on an Academy World colony. This creates a viable "tech rush" strategy distinct from "expansion rush." Automated Mining is a game-changer: 4 mining districts producing minerals with 0 pops means those pops can work other districts. Fusion Reactors removes the generator "tax" by making them produce alloys. Each T3 reshapes the economy in a way that rewards the research investment.

### R28-6: Colony Planet Atmosphere Rendering — Visual Identity

**Impact:** Medium
**Effort:** Low
**Category:** Visual / UX

**The problem:** All colonies look identical in the isometric view. Desert, Ocean, Arctic — same dark ground plane, same space background. With 5 colonies accessible via keyboard shortcuts, players can't visually distinguish them at a glance.

**The fix:** Already specified in design.md. Per-planet-type visual treatment:
- Ground plane color: Desert=#c4956a, Ocean=#1a3a5c, Arctic=#b8c9d4, Tropical=#2d7d46, Continental=#3d6b35, Arid=#8b7355
- Atmosphere tint on horizon: warm orange for Desert, blue for Ocean, white for Arctic, green for Tropical
- Skybox color shift matching atmosphere

**Why it matters:** When cycling between 5 colonies with keyboard shortcuts 1-5, instant visual recognition matters. "The sandy one is my Mining Colony" is faster and more immersive than reading the colony name. This is cheap to implement (material color changes) and immediately enriches the multi-colony experience. Validates the feedback about visuals being core — each planet should feel like a different place.

---

### 5. Balance Snapshot

#### Resource Flow (Post-Fog of War — No Mechanical Changes)

The balance numbers haven't changed since R27. The economy remains well-tuned:

**Starting position:** 100 energy, 300 minerals, 100 food, 50 alloys, 100 influence. 8 pops on size-16 planet with 4 pre-built districts.

**First colony ship:** ~5-6 minutes. Good pacing — expansion begins as the single-colony opener feels solved.

**5-colony empire by 20 minutes:** Achievable but tight. Creates intended tall vs. wide tension.

#### VP Formula — Needs Trait VP Bonus

Current: Pops x2 + Districts + Alloys/25 + Research/100

**Issue persists from R27:** Expansion dominates. 5 small colonies (40 pops, 20 districts = 100 VP) beats 2 big specialized colonies (30 pops, 20 districts = 80 VP). Colony personality traits need +5 VP each to make tall play competitive.

**Recommended VP formula:** Pops x2 + Districts + Alloys/25 + Research/100 + (Traits x 5)

A 3-colony empire with 3 traits (15 VP bonus + more efficient production) should be competitive with a 5-colony zero-trait empire. This creates genuine strategic diversity.

#### Tech Pacing with T3

| Tech Tier | Cost | Time (1 Research) | Time (2 Research) | Time (3 Research on Academy World) |
|-----------|------|-------------------|-------------------|------------------------------------|
| T1 | 150 | 37.5 mo (6.3 min) | 18.75 mo (3.1 min) | 12.5 mo (2.1 min) |
| T2 | 500 | 125 mo (20.8 min) | 62.5 mo (10.4 min) | 41.7 mo (6.9 min) |
| T3 | 1000 | 250 mo (41.7 min) | 125 mo (20.8 min) | 83.3 mo (13.9 min) |

**Analysis:** T3 is unreachable with 1 research district in a 20-minute match. With 2 research districts it's barely achievable (20.8 min). With 3 research districts on an Academy World (+10% bonus = 13.2 research/mo effective), it's reachable at ~14 minutes — leaving time for the T3 bonus to compound. This creates the intended "tech rush" archetype: sacrifice early economy to get a transformative late-game advantage.

#### Science Ship Economy

Proposed: 100 minerals + 50 alloys, 300 ticks build. In a small galaxy (50 systems), a player will want to survey 10-15 systems. At 30 ticks/hop + 100 ticks/survey, a science ship can survey ~3-4 systems in 5 minutes. Two science ships survey the galaxy in 10 minutes. The mineral/alloy cost means scouting competes with colony ships for alloys — creating a real "explore vs exploit" tension.

---

### 6. Content Wishlist

1. **Contested Colonization Races:** When fog is active, two players might unknowingly send colony ships toward the same unclaimed planet. The first ship to arrive wins. The losing ship gets stranded in the system with a "Colonization Failed — planet already claimed" event and a "Return Home" order. On the galaxy map, two colored diamonds converging on the same star creates beautiful visual tension. No combat needed — just racing. This emerges naturally from fog + colony ships.

2. **Galactic Wonders:** Three unique megaprojects that only one player can build (empire-wide broadcast when started, visible to all): **Dyson Sphere** (2000 alloys + 30 months: all generators produce double), **Great Library** (1000 alloys + 500 research each track: instantly complete one T3 tech), **Colony Nexus** (1500 alloys: colony cap +3, all colonies gain +5 housing). First to complete claims the wonder. Creates dramatic end-game races visible to all players. Reference: Civ VI's wonders system.

3. **Planetary Features as Tile Modifiers:** Instead of uniform colony grids, planets have special tiles: "Geothermal Vent" (+3 energy if generator built here), "Rare Crystal Deposit" (+2 research if research built here), "Ancient Ruins" (one-time +50 research on first district built). These are revealed when the colony is founded. Creates spatial puzzles on each colony surface. Reference: Civ VI's appeal/adjacency system.

4. **Empire Specialization Doctrines:** At 3 colonies, players unlock a permanent doctrine choice (pick one of three, cannot change): **Expansionist** (colony ship build time -40%, colony cap +2), **Industrialist** (all district build time -25%, +1 alloy per Industrial district), **Scholar** (research +25% empire-wide, each completed tech grants +3 VP). Creates asymmetric strategies with a permanent commitment. Replaces the "every empire plays the same" feeling.

5. **Dynamic Galactic News:** A shared scrolling ticker at top of screen narrating events in-character: "BREAKING: Commander Zhang reports mineral boom on Kepler-7b", "ALERT: Colony ship detected crossing the Orion Frontier", "MARKETS: Alloy prices spike as expansion accelerates." Takes existing gameEvent data and wraps in procedural flavor text templates. Zero mechanical impact, massive atmosphere. Makes the galaxy feel alive.

---

### 7. Roadmap Updates

Added the following new tasks to `devguide/design.md`:

**Phase 2 (2 new):**
- Science ship unit type (buildable, BFS pathfinding, survey mechanic, anomaly discovery)
- Planetary features as tile modifiers on colony grid (stretch goal)

**Phase 3 (1 new):**
- Contested colonization race resolution (first-to-arrive wins, loser ship returns)

**Phase 4 (1 new):**
- Empire specialization doctrines (pick 1 of 3 at 3 colonies)

**Phase 7 (1 new):**
- Dynamic galactic news ticker with procedural flavor text

**Total: 5 new work items added**

---

### 8. Summary

| Metric | R25 | R27 | R28 | Delta |
|--------|-----|-----|-----|-------|
| Strategic Depth | 3/10 | 5/10 | 5/10 | 0 |
| Pacing & Tension | 4/10 | 5/10 | 6/10 | +1 |
| Economy & Production | 6/10 | 7/10 | 7/10 | 0 |
| Exploration & Discovery | 2/10 | 3/10 | 5/10 | +2 |
| Multiplayer Fairness | 4/10 | 4/10 | 4/10 | 0 |
| **Overall** | **3.8/10** | **4.8/10** | **5.4/10** | **+0.6** |

**Fog of war was worth +2 on Exploration and +1 on Pacing.** The game now has a genuine exploration loop: push into fog → discover → evaluate → colonize → fog recedes → repeat. But the score plateaus without multiplayer interaction — the game's strongest systems (economy, colony ships, fog) create a compelling single-player experience that happens to have multiple players in the same galaxy.

**Critical path:** Multiplayer awareness (chat + scoreboard + ticker) → Colony personality traits → Science ships → Edicts → T3 techs → Colony planet rendering. The first item is the most important — every other feature compounds in value when players can see and react to each other.

---

## Review #27 — 2026-03-12 — The Expansion Age: Colony Ships Changed Everything

**Reviewer:** Game Design Analyst (automated)
**Build State:** 50/145 tasks complete (34%). Colony ships, multi-colony management, BFS pathfinding, planet bonuses, game speed, toast HUD, mini tech tree, VP scoring, energy deficit. 400 tests passing. ~10,800 lines.
**Focus:** Full game design audit post-colony-ships — the game's first real 4X moment.

---

### 1. Current State Audit

**What a player experiences today:**
1. Enter name, create/join room, configure galaxy size + match timer
2. Game starts: isometric 3D colony view with 4 pre-built districts on a random planet type
3. Build districts (6 types) by clicking empty tiles, manage energy balance
4. Research 6 techs across 3 tracks (2 tiers) via R key panel
5. Press G for galaxy map — star systems, hyperlanes, ownership rings, colony ship markers
6. Build colony ships (200 minerals, 100 food, 100 alloys) from colony build menu
7. Send colony ships along hyperlanes to habitable planets — found new colonies (2 pops)
8. Manage up to 5 colonies via sidebar list, keyboard shortcuts 1-5
9. Game ends on timer — highest VP wins (pops x2 + districts + alloys/25 + research/100)

**What a player CANNOT do:**
- Discover hidden space (no fog of war — entire galaxy visible from turn 1)
- See planets as 3D objects (system panel is HTML table only)
- Interact with other players (no chat, diplomacy, trade, or combat)
- Build buildings (only districts exist)
- Specialize colonies for strategic benefit (no personality/trait system)
- Choose different openings (every game starts identically)
- Survey systems or find anomalies (no science ships)
- Claim territory without colonizing (no outposts/starbases)

**The honest assessment:** Colony ships have transformed the game from a single-colony city builder into an actual proto-4X. There's now a real decision arc: invest in your economy vs. expand to new worlds. Planet type bonuses create meaningful colonization targets. The galaxy map has purpose. But the galaxy is a fishbowl — everything is visible, there's nothing to discover, and other players are ghosts you never interact with. The game needs mystery, tension, and rivalry.

---

### 2. 4X Design Pillar Scores

#### Strategic Depth: 5/10 (was 3)
Colony ships created a genuine "tall vs wide" tension. Do you invest in your homeworld or rush a second colony? Planet type bonuses mean colonization order matters — settling a Desert world first for minerals is different from settling an Ocean world for research. The 5-colony cap with shared resource pool creates empire-level decisions. But the opener is still nearly solved (Agriculture → Housing → Mining → Industrial → colony ship), and there's no branching in the tech tree (you research everything eventually). Colony specialization exists only in planet bonuses — there's no reward for going all-in on one district type.

#### Pacing & Tension: 5/10 (was 4)
The early game now has two phases: the build-up (minutes 0-5, growing your homeworld) and the expansion (minutes 5-10, colony ship rush). This creates a natural gear shift. The mid-game of developing multiple colonies is engaging. But there's no late-game crescendo — once you've filled your 5 colonies, you're back to watching numbers tick up. No crises, no scarcity, no threats from other players. The match timer creates artificial urgency but not dramatic tension.

#### Economy & Production: 7/10 (was 6)
Alloys now have purpose (colony ships cost 100). The resource pipeline is clear: minerals build things, food grows pops, energy powers industry, alloys fund expansion. Multi-colony economies create interesting trade-offs — should your new colony build food first (it only has 2 pops) or mining (to fund the next colony ship)? Planet bonuses on colony types create differentiated economic profiles. Still missing: influence spending (100 starting, no way to use), building variety, and any late-game resource sinks.

#### Exploration & Discovery: 3/10 (was 2)
Colony ships can travel to other systems, which is better than nothing. You evaluate planets in the system panel, choose targets, and send ships along hyperlanes. But the entire galaxy is visible from tick 1. There's no fog of war, no mystery, no "what's out there?" moment. Clicking a distant system reveals all its planets immediately. The scouting loop is: look at table → check habitability → send ship. No surprise, no narrative, no discovery dopamine. This remains the biggest design gap.

#### Multiplayer Fairness: 4/10 (unchanged)
Starting positions are evenly distributed. Shared galaxy means equal access to expansion targets. But multiplayer is still parallel solitaire — two players racing to colonize the same planets don't even know they're competing until a "colony founded" toast appears. No chat, no rivalry indicators, no territorial tension mechanics. The race for good planets creates implicit competition, but the game does nothing to surface or amplify it.

**Overall Score: 4.8/10 (was 3.8)** — A full point improvement driven entirely by colony ships.

---

### 3. Top 5 Things a Playtester Would Notice

1. **"I can see everything — there's nothing to explore."** The entire galaxy is laid bare. Every planet's stats are visible from tick 1. When you send a colony ship to a system 6 hops away, you already know exactly what's there. Fog of war is the most critical missing feature for creating the exploration pillar.

2. **"I never once noticed the other player."** In a multiplayer match, the only evidence of another player is an occasional toast notification ("Player B founded a colony in Epsilon Eridani"). No chat, no rivalry, no territorial competition, no ability to react to what they're doing. The game might as well be single-player.

3. **"Once I had 5 colonies, I ran out of things to do."** The colony cap means expansion ends. After that, you're optimizing 5 colonies — building districts in the same priority order on each one. No buildings to unlock, no personality traits to earn, no late-game projects. The endgame is waiting for the timer.

4. **"Why are all my colonies the same?"** Despite planet bonuses, the optimal build order barely changes. Desert colony and Ocean colony both need Agriculture first (2 starting pops need food), then Housing, then their specialty district. Colony personality traits would reward committing to a specialization, but they don't exist yet.

5. **"Planets are just rows in a table."** The system panel shows planet type, size, and habitability as HTML text. There's no visual representation of planets — no orbital view, no 3D planet rendering, no sense of scale or beauty. The isometric colony view is gorgeous; the system view is a spreadsheet. This contrast is jarring.

---

### 4. Recommendations

### R27-1: Fog of War — Make the Galaxy a Frontier

**Impact:** Critical
**Effort:** Medium (client-side only, already specified in design.md)
**Category:** Core Mechanic

**The problem:** The galaxy has zero mystery. Every system's planets are visible from tick 1. "Exploration" means reading a table and picking the best stats. There's no incentive to expand toward the unknown because nothing is unknown.

**The fix:** Implement client-side fog of war as specified. BFS 2-hop visibility from owned systems. Unknown systems render as dim gray dots with no names or planet data. System panel shows "Unexplored" for fogged systems.

**Why it matters:** This single change creates the entire exploration pillar. Sending a colony ship into fog and discovering a size-20 Continental world is a dopamine hit. Discovering an enemy colony 3 hops away creates tension. Information asymmetry makes each player's game position unique. Combined with colony ships, fog turns the galaxy from a map into a frontier.

**Design details:**
- 2-hop visibility creates a ~6-system visible radius per colony, meaning 5 colonies reveal roughly 30 systems — about 60% of a small galaxy. This leaves dark zones that create end-game mystery
- Other players' colonies appear as colored ownership dots in fog (you know someone claimed it, but not what's there)
- Colonizing a new system cascades visibility — revealing 2-3 new potential targets. This creates a "just one more turn" expansion hook
- No server changes needed — all rendering logic

### R27-2: Colony Personality System — Reward Specialization

**Impact:** High
**Effort:** Low
**Category:** Core Mechanic / Strategic Depth

**The problem:** All colonies play identically. The optimal district ratio is the same everywhere. Planet bonuses add +1-2 resources but don't change build order. There's no strategic payoff for committing to a theme.

**The fix:** Already specified in design.md (Phase 2). When a colony has 4+ districts of one type, it earns a trait: "Forge World" (4+ Industrial: +10% alloy output empire-wide), "Academy World" (4+ Research: +10% research empire-wide), "Mining Colony" (4+ Mining: +10% minerals empire-wide), "Breadbasket" (4+ Agriculture: +10% food empire-wide), "Power Hub" (4+ Generator: +10% energy empire-wide). One trait per colony, highest count wins. Traits stack across colonies.

**Why it matters:** With 5 colonies, players can create a specialized empire: 1 Forge World, 1 Academy, 1 Breadbasket, 1 Mining Colony, 1 balanced capital. Or go 3 Forge Worlds for +30% alloys. This creates meaningful empire-level strategy that compounds across the multi-colony system. Every colony placement becomes a strategic decision: "This Desert world with +2 minerals is perfect for a Mining Colony." The trait names create emotional attachment and narrative ("My empire's backbone is the Breadbasket on Tau Ceti").

### R27-3: In-Game Chat + Player Visibility — Make Multiplayer Real

**Impact:** High
**Effort:** Low (chat infrastructure exists from lobby)
**Category:** Multiplayer UX

**The problem:** Two players in the same match have zero interaction. The game is multiplayer in name only. No communication, no rivalry indicators, no awareness of what the other player is doing.

**The fix:** Two features that ship together:
1. **In-game chat** — collapsible bottom-left panel, reuses existing WebSocket chat infrastructure. Player names colored by player color. Messages visible to all players in room.
2. **Scoreboard overlay (Tab key)** — already specified. Player name, colony count, total pops, resource income rates, VP. All info public.

**Why it matters:** Chat enables the social layer that makes multiplayer games fun. Even basic messages ("nice colony spot", "I see you going wide") create engagement. The scoreboard creates competitive awareness — seeing that your opponent has 3 colonies when you have 2 creates urgency to expand. Together they transform parallel solitaire into a shared experience. This is the lowest-effort, highest-impact multiplayer improvement.

### R27-4: System Orbital View — The Visual Bridge

**Impact:** Medium-High
**Effort:** Medium
**Category:** Visual / Core UX

**The problem:** Planets are rows in an HTML table. The game has a beautiful isometric colony view and a functional galaxy map, but the bridge between them — the system where you evaluate and choose planets — is a spreadsheet. Colony ships deserve a destination that looks like a destination.

**The fix:** Build system-view.js as specified. Central star, planets on orbital rings as colored spheres, habitable planets with atmosphere halos. Click planet for details, "Colonize" button for colony ships. Navigation: Galaxy → System → Colony.

**Why it matters:** The system view is where expansion decisions happen. Seeing a green Continental world orbiting a yellow sun, with a "Colonize" button beckoning, is fundamentally more compelling than reading "Continental, Size 16, 80%". This view becomes the staging ground for colony ship targeting and eventually fleet positioning. Reference: Stellaris's system view is one of its most screenshot-worthy features.

### R27-5: T3 Techs + Tech Rush Strategy

**Impact:** Medium
**Effort:** Low
**Category:** Strategic Depth

**The problem:** The tech tree has 6 techs and no branching. Every player researches everything eventually. Research districts are built for VP, not because the techs are exciting. There's no "tech rush" strategy.

**The fix:** Already specified in design.md (Phase 4 priority). Add 3 T3 techs at cost 1000: Fusion Reactors (generators produce alloys), Genetic Engineering (pop growth halved), Automated Mining (mining jobs cost 0). These are game-changing effects that reward heavy research investment.

**Why it matters:** T3 at cost 1000 with 2 research districts (8 research/month total with bonuses) takes ~125 months (~21 min). In a 20-minute match, getting T3 requires building 3+ research districts on an Academy World — a massive investment that sacrifices near-term economy for a late-game power spike. This creates a viable "tech rush" strategy distinct from "expansion rush" (build 5 colonies fast) or "economy rush" (maximize VP through districts and alloys). The three paths make the game replayable.

*(Reviews R27-R25 and earlier trimmed for space — see git history)*
