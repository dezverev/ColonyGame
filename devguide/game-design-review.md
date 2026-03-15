# ColonyGame — Game Design Review

*Living document — newest reviews first.*

---

## Review #51 — 2026-03-15 — The Missing Middle

**Reviewer:** Game Design Analyst (automated)
**Build State:** 91/212 tasks complete (43%). Corvette variants (Interceptor/Gunboat/Sentinel rock-paper-scissors), endgame crisis (Galactic Storm/Precursor Awakening), doctrine choice (3 asymmetric start doctrines), diplomatic stances (Neutral/Hostile/Friendly), colony occupation, PvP fleet combat, NPC raiders + defense platforms, scarcity seasons, 9 techs (3T×3 tracks), colony crises (4 types), personality traits, edicts, influence, science ships, fog of war, colony expansion (5 max), 5 game speeds + pause, match timer VP win, instant victory conditions. 1,535 tests (1 failing — doctrine research penalty). ~35,400 lines.

---

### 1. 4X Design Pillar Scores

| Pillar | Score | Trend | Assessment |
|--------|-------|-------|-----------|
| **Strategic Depth** | 8/10 | +0.5 | Corvette variants add a genuine fleet composition layer — your tech path now determines military options, creating a spy-game around T2 tech choices. The rock-paper-scissors triangle is elegant. Combined with doctrines, there are now ~9 distinct opening strategies (3 doctrines × 3 T2 tech rushes). Missing: the mid-game still lacks strategic inflection points. Once you've picked your doctrine and first T2 tech, the optimal play is largely "build more of the same." Need a 3-colony empire specialization doctrine or equivalent pivot moment. |
| **Pacing & Tension** | 7/10 | = | Three-act structure holds: early (doctrine + build), mid (expand + tech + raiders), late (crisis + VP sprint). Scarcity seasons and colony crises provide periodic jolts. The endgame crisis at 75% timer is still the game's best pacing device. But the mid-game valley (minutes 6-14 in a 20-min match) remains the weakest segment — there's a long stretch where you're optimizing production without meaningful decisions to make. The underdog bonus (planned but unimplemented) would help, but the real fix is mid-game events and diplomatic pressure. |
| **Economy & Production** | 7/10 | = | Resource system creates genuine trade-offs. Energy is the chokepoint (powers everything, limits military maintenance), minerals are the expansion fuel, alloys are the military bottleneck. Per-variant corvette maintenance costs add nuance — a fleet of 5 gunboats costs 10E + 5A/month, which is serious economic pressure. Colony traits reward specialization. But the economy is still fundamentally linear: more districts = more output, no diminishing returns, no trade-off between colony width and depth beyond the 5-colony cap. |
| **Exploration & Discovery** | 5/10 | = | This is the game's weakest pillar. Science ships survey systems, anomalies give one-time bonuses, fog of war hides the galaxy. But exploration feels like a checkbox exercise — survey everything reachable, collect bonuses, done. No branching anomaly chains, no risk/reward expeditions, no narrative discovery moments. The precursor anomaly chain (planned) would significantly improve this. Galactic leylines would add strategic depth to expansion choices. Right now, exploration is a means to an end (finding colony sites), not an experience in itself. |
| **Multiplayer Fairness** | 6/10 | = | Starting positions use procedural galaxy generation with assigned starting systems. Doctrine choice creates asymmetry by consent. But no underdog bonus exists yet — a player who loses their second colony is in a death spiral with no comeback mechanic. Occupation VP is static (no decay), meaning a dominant player can farm VP indefinitely from an occupied colony. The planned underdog bonus (+15% production per colony gap) and occupation VP decay would address both issues, but neither is implemented. |

**Overall Score: 6.6/10** (up from 6.4)

---

### 2. Top 5 Things a Playtester Would Notice

1. **"I'm bored between minutes 6 and 14."** After establishing your second or third colony and picking your T2 tech, there's little to actively decide. You're watching numbers tick up. The mid-game needs disruptive events, diplomatic pressure, or strategic pivots to keep players engaged.

2. **"Exploration feels pointless after the first 5 minutes."** Once you've found your colony sites, science ships have nothing meaningful to do. Anomalies are one-click bonuses, not stories. There's no reason to keep exploring.

3. **"I got crushed early and had no way to come back."** Without the underdog bonus, losing a colony or falling behind in expansion creates a snowball that's impossible to recover from. The winner is often decided by minute 8.

4. **"Diplomacy is just declaring war or not."** The stance system works, but there's no in-game chat, no trade proposals, no ceasefire mechanic. You can't actually negotiate. In a 1v1, diplomacy is binary (war or not). In multiplayer, there's no kingmaker prevention.

5. **"I don't know what my opponent is doing."** Beyond fog of war reveals from friendly stances, there's no intelligence system, no espionage, no scouting reports. You can't see enemy fleet composition, tech choices, or economic strength. This makes counter-play impossible — you can't react to what you can't see.

---

### 3. Recommendations

### 3.1 Mid-Game Catalyst Events

**Impact:** High | **Effort:** Medium | **Category:** Core Mechanic

**The problem:** Minutes 6-14 of a 20-minute match are a dead zone. Players have made their early choices (doctrine, first colony sites, T1 tech) but the endgame crisis hasn't hit yet. There's nothing forcing decisions.

**The fix:** Add a "Galactic Event" system that fires 2-3 timed events during the mid-game, each requiring player response:

- **Resource Rush (30% match time):** A random system is revealed to contain a "motherlode" — first player to colonize or station a military ship there gets +100 of a random resource per month for 3 minutes. Creates a land-rush moment.
- **Tech Breakthrough Auction (45% match time):** All players simultaneously bid influence on a free T2 tech completion. Highest bidder gets it, others keep their influence. Creates an information game — how much is it worth?
- **Border Incident (55% match time):** Two random players with adjacent territory get a "border incident" — both must choose: escalate (gain +3 VP, other player forced to hostile stance) or de-escalate (gain +5 VP if both de-escalate, gain nothing if opponent escalates). Prisoner's dilemma in space.

**Why it matters:** Stellaris uses mid-game crises, Civ VI uses Great People competition, Endless Space 2 uses quest stages. The mid-game needs external pressure to break the optimization loop.

**Design details:**
- Fire at fixed match-time percentages (30%, 45%, 55%) so players can anticipate them
- 60-second response window for each event
- Only in timed matches (same gate as endgame crisis)
- Each event creates a decision with no obviously correct answer

### 3.2 Underdog Production Bonus (Already Designed, Needs Implementation)

**Impact:** High | **Effort:** Low | **Category:** Balance

**The problem:** Losing a colony or falling behind in expansion creates a death spiral. The leader snowballs, the loser can't recover.

**The fix:** Implement the already-designed underdog bonus from design.md (R47-5): +15% production per colony gap vs leader, capped at +45%. This is the single highest-impact, lowest-effort change available.

**Why it matters:** Every competitive 4X needs comeback mechanics. Mario Kart has blue shells, Civ VI has era score bonuses for underdogs, Stellaris has crisis response bonuses. Without this, games are decided too early.

**Design details:**
- Already fully specified in Phase 6 of design.md
- Apply as multiplier in `_processMonthlyResources`
- Show "Underdog Bonus: +X%" indicator in HUD
- Only active in 2+ player games

### 3.3 Science Ship Expeditions (Extend Exploration into Mid-Game)

**Impact:** High | **Effort:** Medium | **Category:** Content

**The problem:** Science ships become idle after surveying reachable systems (~5 minutes in). Exploration, the first "X" in 4X, disappears from gameplay.

**The fix:** After surveying 5+ systems, unlock "Expeditions" — multi-step missions that send science ships on risky journeys:

- **Deep Space Probe:** Send ship to edge of galaxy for 120 ticks. 70% chance: discover a hidden system with rare resources. 30% chance: ship damaged, returns after 200 ticks with partial data (+50 research).
- **Precursor Signal:** Follow a chain of 3 survey targets. Each takes 60 ticks. Reward: free T1 tech completion or +25 VP.
- **Wormhole Mapping:** Survey 2 specific systems to discover a shortcut (permanent 1-hop path between distant systems). First player to find it gets exclusive use for 5 minutes.

**Why it matters:** Master of Orion II and Stellaris both keep exploration alive throughout the game with anomaly chains and special projects. Exploration should be a persistent activity, not a one-time checklist.

**Design details:**
- Already partially designed in design.md (Phase 3)
- Max 1 expedition active per science ship
- Expeditions visible on galaxy map as animated route lines
- Risk/reward creates interesting decisions (send your only science ship, or keep it safe?)

### 3.4 In-Game Chat + Diplomacy Pings

**Impact:** High | **Effort:** Low | **Category:** Core Mechanic

**The problem:** Multiplayer games are parallel solitaire. Players can't communicate, negotiate, threaten, or coordinate. Diplomacy is mechanical (click stance button), not social.

**The fix:** Enable the existing chat infrastructure during gameplay (it already works in the lobby) and add ping types:

- Chat messages visible to all players in a collapsible panel
- 4 ping types: Peace (green), Warning (yellow), Alliance (blue), Rival (red)
- Pings appear as temporary icons on the sender's territory on the galaxy map

**Why it matters:** This is the cheapest possible feature with the highest social impact. Chat transforms every other system — trades become negotiable, wars become personal, alliances become meaningful. The infrastructure already exists.

**Design details:**
- Already fully designed in design.md (R39-7)
- Reuse existing lobby chat message routing
- Add `diplomacyPing` command with 4 types
- Ping icons fade after 300 ticks

### 3.5 Occupation VP Decay (Prevent War Farming)

**Impact:** Medium | **Effort:** Low | **Category:** Balance

**The problem:** A player who occupies an enemy colony earns +3 VP/colony indefinitely with no degradation. This incentivizes permanent occupation over dynamic warfare.

**The fix:** Implement the already-designed occupation VP decay from design.md (R48-8): after 500 ticks of continuous occupation, attacker VP decays by 1 per 200 ticks, reaching 0 at 900 ticks. Defender penalty decays symmetrically.

**Why it matters:** Creates natural "war seasons" — conquer, hold briefly for VP, then move on or liberate. Prevents the degenerate strategy of rushing one enemy, occupying everything, and sitting on it.

**Design details:**
- Already fully specified in Phase 5 of design.md
- Formula: `max(0, BASE_VP - floor(max(0, elapsed - 500) / 200))`
- Track `colony.occupationStartTick`
- Combined with 600-tick diplomatic cooldown, creates raid-and-release rhythm

### 3.6 Fleet Intelligence (See Enemy Composition)

**Impact:** Medium | **Effort:** Medium | **Category:** Core Mechanic

**The problem:** You can't see enemy fleet composition, so the rock-paper-scissors corvette system has no counter-play. If you don't know the enemy has interceptors, you can't build sentinels to counter them.

**The fix:** Add passive intelligence gathering:

- **Shared-system visibility:** If your ship occupies the same system as an enemy fleet (while at peace), you can see their fleet composition in the system panel.
- **Espionage action:** Spend 25 influence to reveal a specific enemy player's fleet composition for 5 minutes (galaxy-wide). 600-tick cooldown per target.
- **Friendly intel sharing:** Mutual-friendly players can always see each other's fleet composition.

**Why it matters:** Rock-paper-scissors only creates strategy when you have imperfect information that you can work to improve. Right now it's completely blind — you might as well pick randomly.

**Design details:**
- Espionage adds another sink for influence (currently underutilized)
- Intel revealed via a "Fleet Report" panel accessible from the scoreboard
- Shows ship types, counts, and approximate total HP/DPS
- Reference: Stellaris intel system, Civ VI spy mechanic

### 3.7 Colony Mood System (Tall vs Wide Tension)

**Impact:** Medium | **Effort:** Medium | **Category:** Core Mechanic

**The problem:** Expanding from 1 to 5 colonies is always good — there's no cost to going wide beyond the colony ship investment. The 5-colony hard cap is artificial. There's no organic tension between tall (fewer, better colonies) and wide (more, weaker colonies).

**The fix:** Add a colony mood system that creates diminishing returns on expansion:

- **Thriving (1-2 colonies):** +10% all production. Your empire is focused and happy.
- **Content (3 colonies):** No modifier. Normal.
- **Restless (4 colonies):** -5% all production, -25% pop growth. Bureaucratic strain.
- **Rebellious (5 colonies):** -10% all production, -50% pop growth. Empire is overstretched.

**Why it matters:** This creates the tall-vs-wide tension that defines great 4X games. Civ VI uses amenities, Stellaris uses administrative capacity, Anno 1800 uses workforce management. Going wide should be powerful but costly.

**Design details:**
- Applied as multiplier in `_calcProduction` based on `playerColonies.length`
- Doctrine bonus: Expansionist doctrine shifts thresholds up by 1 (Thriving at 1-3, Content at 4, etc.)
- Displayed in colony panel as mood indicator
- Stacks with existing production modifiers

---

### 4. Balance Snapshot

#### Resource Flow
- **Starting resources** (100E, 300M, 100F, 50A) feel appropriate for a 20-min match
- **Colony ship cost** (200M + 100F + 100A) is steep — it's ~2/3 of starting minerals + all starting alloys. A player who builds a colony ship first delays their economy by ~60 seconds
- **Recommendation:** Already planned: reduce colony ship cost. Consider 150M + 75F + 75A to make early expansion less punishing

#### District Balance
- **Generator** (6E, 1 job, 100M, 300 ticks) — Baseline. Well-tuned.
- **Mining** (6M, 1 job, 100M, 300 ticks) — Good. Minerals are always useful.
- **Agriculture** (6F, 1 job, 100M, 300 ticks) — Slightly weak. 6 food supports 6 pops, but you need 1 pop working the district, so net is +5 pops sustained. Fine for early game, but agriculture becomes irrelevant once housing is full.
- **Industrial** (4A, 3E consumption, 1 job, 200M, 400 ticks) — Strong. Alloys are the military bottleneck. The 3E consumption creates real energy tension.
- **Research** (4P+4S+4E each, 4E consumption, 1 job, 200M+20E, 400 ticks) — Slightly too expensive in energy. 4E/month consumption means 2 research districts eat 2/3 of a generator's output. This forces aggressive generator building.
- **Housing** (5 housing, 1E consumption, 0 jobs, 100M, 200 ticks) — Pure housing with no jobs feels like a tax. OK as-is.

**Key issue:** No district is truly weak, which is good. But there's no reason to specialize beyond the trait threshold (4 districts). A balanced colony (1 each + extras) is nearly always better than 4 mining + 4 industrial.

#### Corvette Variant Balance
| Stat | Interceptor | Gunboat | Sentinel | Base |
|------|-------------|---------|----------|------|
| HP | 8 | 15 | 12 | 10 |
| ATK | 5 | 4 | 3+2regen | 3 |
| Speed | 30 | 50 | 40 | 40 |
| Cost/mo | 1E | 2E+1A | 1E+2A | 1E+1A |
| DPS×HP | 40 | 60 | 36+regen | 30 |

- **Interceptor** is the glass cannon — fastest, deadliest per round, but fragile (8 HP). Good design.
- **Gunboat** is the stat ball — highest HP×ATK product (60 vs 40/36/30). Slightly overtuned. Its counter-targeting against sentinels works because raw damage overwhelms regen.
- **Sentinel** is the sustain pick — 2 HP regen/round means it effectively has 12+2N HP over N rounds. Against a 10-round fight, that's 32 effective HP. Good vs low-damage targets (interceptors), bad vs high-burst (gunboats).
- **Recommendation:** Gunboat attack could drop from 4 to 3.5 (or 3) to tighten the triangle. Currently gunboat is the default-best choice unless you know the enemy has interceptors.

#### Game Length
- Match timer options in room settings. Typical target: 20-30 minutes.
- At normal speed (10Hz), 20 minutes = 12,000 ticks = 120 months.
- T1 tech at 150 cost with 1 research district (~4 research/track/month after consumption) takes ~38 months (~6 min). Reasonable.
- T2 tech at 500 cost with 2 research districts (~8/track/month) takes ~63 months (~10 min). Right on schedule for mid-game.
- T3 tech at 1000 cost requires 3+ research districts or Scholar doctrine. At 12/track/month it takes ~84 months (~14 min). Barely achievable in 20 min. The planned 750 cost (R34) is correct — at 750 cost, it takes ~63 months (~10 min) with 2 research districts, allowing T3 in the final third of a 20-min match.

---

### 5. Content Wishlist — Making ColonyGame Distinctive

**1. Galactic Auction House (Live Resource Market)**
Instead of static trade routes, imagine a live auction system where players can post "sell orders" (100 minerals for 50 energy) and others can fill them. Prices fluctuate based on supply/demand. Creates a real economy where resource scarcity drives diplomacy — if everyone is short on alloys, the one player with surplus industrial capacity becomes kingmaker. Reference: Anno 1800's marketplace, EVE Online's player market (vastly simplified).

**2. Colony DNA — Persistent Genetic Traits Across Games**
Each colony develops "genetic traits" based on how it was played — a mining colony develops "Deep Root" (+5% mining in future games on similar planets), a research colony develops "Curious" (+5% research). These traits persist in a player profile across matches, creating a meta-progression layer. Reference: Hades' mirror system, Rogue Legacy's family tree.

**3. The Void — Negative-Space Exploration**
Between star systems, there are "void pockets" — empty spaces on the galaxy map that science ships can probe. Probing takes longer (200 ticks) and has higher risk (30% ship loss), but rewards are unique: void resources that can't be produced (used for wonders or super-weapons), hidden wormholes, or "void entities" that become allies if you communicate (a 3-step puzzle) or enemies if you ignore them.

**4. Colony Broadcast Radio**
Each colony with 10+ pops generates a "radio broadcast" visible to all players within 3 hops — it reveals the colony's specialization trait but not its exact production. Creates information asymmetry: you know your neighbor has a Forge World, but not how many alloys they're actually making. Adds flavor through procedural radio messages: "This is Radio Dusthaven, spinning the hits from the desert frontier."

**5. Time Pressure Drafting**
At game start, instead of everyone exploring simultaneously, players draft starting positions on the galaxy map in a timed round-robin. Each player has 15 seconds to pick their starting system from the revealed galaxy. First pick gets best choice but last pick gets a bonus (extra starting resources or free tech). Creates asymmetry from minute zero and eliminates the "unfair start" complaint.

---

### 6. Summary

**Overall Score: 6.6/10** — Strong foundation, weak middle. The early game (doctrine choice, colony setup) and late game (endgame crisis, VP sprint) are compelling. The mid-game is an optimization desert that needs disruptive events and social mechanics.

**Top 3 Recommendations:**
1. **Mid-game catalyst events** — Resource Rush, Tech Auction, Border Incident at 30/45/55% match time
2. **Underdog production bonus** — Already designed, just needs implementation. Biggest bang for buck.
3. **In-game chat + diplomacy pings** — Transforms parallel solitaire into social experience. Infrastructure exists.

**Most Urgent Balance Fix:** Gunboat attack from 4→3 to tighten the corvette rock-paper-scissors triangle, and implement T3 tech cost reduction from 1000→750.

**Big Idea:** Galactic Auction House — a live resource market where players post buy/sell orders. Turns the economy from a solo optimization puzzle into a multiplayer negotiation game.

---

## Review #50 — 2026-03-15 — The Three Pillars Stand

**Reviewer:** Game Design Analyst (automated)
**Build State:** 68/160 tasks complete (43%). Endgame crisis (Galactic Storm/Precursor Awakening at 75% match timer), doctrine choice (3 asymmetric doctrines), diplomatic stances (Neutral/Hostile/Friendly with combat gating), colony occupation, PvP fleet combat with corvettes, NPC raiders, defense platforms, scarcity seasons, 9 techs (3T×3 tracks), colony crises, personality traits, edicts, influence income, science ships, fog of war, colony expansion (5 max), 5 game speeds + pause, match timer with VP win. 1,467 tests all passing. ~33,870 lines.

---

### 1. 4X Design Pillar Scores

| Pillar | Score | Assessment |
|--------|-------|-----------|
| **Strategic Depth** | 8/10 | The three-way doctrine choice (Industrialist/Scholar/Expansionist) layered on top of diplomatic stances creates genuine strategic diversity. Players face real opening decisions. The production modifier stacking (doctrine → edict → trait → scarcity → crisis) creates emergent complexity. Fleet composition is still thin (only corvettes), but the guns-vs-butter tension from ship maintenance is well-tuned. Missing: distinct victory conditions (VP timer only), fleet variety, and meaningful mid-game pivots. |
| **Pacing & Tension** | 7/10 | Strong improvement. The game now has a clear three-act structure: early (doctrine choice + initial build), mid (expansion + tech + raiders), late (endgame crisis + final VP push). Scarcity seasons create periodic urgency. Colony crises add micro-tension. The endgame crisis at 75% timer is an excellent climax mechanic. Weakness: the mid-game (minutes 5-12 in a 20-min match) can become autopilot once colonies are established and before the crisis hits. |
| **Economy & Production** | 8/10 | Six-resource economy with meaningful trade-offs. Energy as a maintenance tax on everything creates real tension. Alloys as the military currency creates guns-vs-butter. Planet type bonuses make colony placement matter. The trait system (4+ same-district type = +10% empire-wide) rewards specialization without forcing it. Concern: the 6 district types are well-balanced against each other, but the production chain lacks depth — there's no secondary processing (e.g., minerals → alloys → ships is the only chain). |
| **Exploration & Discovery** | 5/10 | Still the weakest pillar. Science ships can survey systems and find anomalies, fog of war exists, but the reward loop is thin: anomalies give one-time resource bonuses. No anomaly event chains, no narrative discovery, no "what's behind this nebula" moments. The galaxy exists as a network to traverse but not as a world to explore. Surveying feels like checkbox-filling rather than adventure. |
| **Multiplayer Fairness** | 7/10 | Diplomatic stances with combat gating (must be hostile to attack) prevent grief-rushes. The 30-second doctrine choice prevents spying on opponent picks. VP is diversified across many sources (pops, districts, alloys, research, tech, traits, exploration, military, diplomacy, crisis). Missing: underdog/comeback mechanics (proposed but not implemented), starting position balancing, and ceasefire offramps. |

**Overall Score: 7.0/10** (up from 6.8 in R49)

---

### 2. Top 5 Things a Playtester Would Notice

1. **"I killed their fleet — now what?"** After winning a fleet battle and occupying colonies, there's no path to military victory. The game just continues until the timer runs out. Conquering feels incomplete without a domination win condition.

2. **"All my corvettes look the same."** Fleet combat is binary — throw corvettes at each other, bigger stack wins. No rock-paper-scissors, no tactical decisions, no fleet composition strategy. Every military engagement has the same optimal answer: more corvettes.

3. **"I surveyed everything and got some minerals."** Exploration rewards are underwhelming. After surveying ~10 systems, you've seen all the anomaly types. There's no narrative depth, no surprises, no "I found an ancient artifact that changed my strategy" moments.

4. **"I'm losing and there's nothing I can do about it."** A player who loses their fleet and gets 2 colonies occupied is in a death spiral — production halved, no military, no way to recover. No underdog bonus, no ceasefire offramp, no comeback mechanic.

5. **"The mid-game is kind of boring."** Between minutes 5-12, if you're not being raided, the game is mostly waiting: waiting for tech, waiting for colony ships to build, waiting for pops to grow. Needs more mid-game agency moments and decision points.

---

### 3. Recommendations

### R50-1: Corvette Variants via Tech (Fleet Composition Depth)

**Impact:** High
**Effort:** Medium
**Category:** Core Mechanic

**The problem:** Only one military unit type (corvette, 10HP/3atk) means fleet combat is a pure numbers game. No tactical decisions in fleet building or engagement.
**The fix:** Unlock 3 corvette variants via T2 techs. Each variant excels against one other and is weak to the third (rock-paper-scissors triangle):
- **Interceptor** (Physics T2: Advanced Reactors): 8 HP, 5 attack. Glass cannon — kills fast, dies fast. Strong vs Gunboat (hits hard before Gunboat's HP advantage matters), weak vs Sentinel (Sentinel's regen outlasts its burst).
- **Gunboat** (Engineering T2: Deep Mining): 15 HP, 4 attack. Tanky brawler. Strong vs Sentinel (out-damages regen), weak vs Interceptor (melted before HP matters).
- **Sentinel** (Society T2: Gene Crops): 12 HP, 3 attack + 2 HP regen/combat round. Sustain fighter. Strong vs Interceptor (survives burst, regens), weak vs Gunboat (can't out-regen its DPS).
**Why it matters:** Creates fleet composition as a strategic decision. Scouting enemy fleet becomes valuable. Tech path influences military strategy. Players have a reason to diversify rather than stack.
**Design details:** Same 100m/50a cost as basic corvette. Variant replaces standard corvette in the build menu once T2 tech is researched. All 3 coexist — you keep existing corvettes but new builds use the variant. Combat targeting: ships prefer to attack the type they're strong against (if available).

### R50-2: Distinct Victory Conditions

**Impact:** High
**Effort:** Medium
**Category:** Core Mechanic

**The problem:** VP timer is the only endgame. No instant-win conditions means no dramatic "I'm going for the tech victory" moments. Every game ends the same way.
**The fix:** Add 3 instant-win conditions checked every monthly tick:
- **Scientific Victory**: Complete all 3 T3 techs + survey 80% of galaxy systems. Rewards tech-focused Scholar doctrine.
- **Military Victory**: Occupy 3+ enemy colonies simultaneously. Rewards military aggression and the Industrialist's alloy advantage.
- **Economic Victory**: Stockpile 1000 alloys + 500 influence + have 5 active colony traits. Rewards wide play and the Expansionist doctrine.
**Why it matters:** Multiple victory paths create mid-game tension ("are they going for science victory?"), enable counter-play, and give each doctrine a natural win condition to aim for. VP timer remains as fallback if no instant win is achieved.
**Design details:** Check in `_processMonthlyResources`. Show victory progress on scoreboard (3 progress bars). Victory announcement broadcasts to all players. Already spec'd in design.md Phase 7 — elevate priority.

### R50-3: Underdog Production Bonus

**Impact:** High
**Effort:** Low
**Category:** Balance

**The problem:** Players who lose colonies to occupation enter a death spiral — halved production, fewer resources, can't rebuild military. No comeback path exists.
**The fix:** Players controlling fewer colonies than the leader get +15% resource production per colony gap (max +45%, capped at 3 colony gap). Applied as multiplier in `_processMonthlyResources`.
**Why it matters:** Prevents snowballing from occupation. Keeps losing players engaged — they're behind but can still play. The leader's advantage is real but bounded. Creates dramatic comeback stories.
**Design details:** Calculate each month: find max colony count across all players, compute deficit for each player. Apply `1 + (deficit * 0.15)` multiplier to all positive production (capped at 1.45). Only active in 2+ player games. Show "Underdog Bonus: +X%" indicator in resource panel. Already spec'd in design.md Phase 6.

### R50-4: Science Ship Expeditions (Exploration Depth)

**Impact:** Medium
**Effort:** Medium
**Category:** Content

**The problem:** After surveying all reachable systems, science ships become idle dead weight. Exploration has no mid-game purpose.
**The fix:** Three one-time expedition missions for idle science ships:
- **Deep Space Probe** (cost: 50 energy, 300 ticks): Reveals a random unsurveyed system as surveyed + grants discovery bonus (random: +100 minerals, +50 alloys, or +200 research). Available once per science ship.
- **Precursor Signal** (cost: 100 energy, 500 ticks): Science ship traces an ancient signal. On completion: discover a hidden system with a unique planet (size 20, guaranteed 2 anomalies). Only 1 per game — first to complete claims it.
- **Wormhole Mapping** (cost: 75 energy, 400 ticks): Creates a permanent shortcut hyperlane between the science ship's current system and a random system 4+ hops away. Max 1 per player. Strategic galaxy manipulation.
**Why it matters:** Gives science ships mid-to-late game purpose. Creates exploration events that feel meaningful. Precursor Signal creates a race condition that adds competitive urgency.
**Design details:** Missions triggered via `startExpedition { shipId, expeditionType }` command. Ship is locked during expedition (can't move). Progress ticks each game tick. Emit events on start/complete. Show progress bar on ship icon in galaxy view.

### R50-5: Cease-fire Negotiations (Diplomatic Offramp)

**Impact:** Medium
**Effort:** Low
**Category:** Core Mechanic

**The problem:** Once two players go hostile, there's no diplomatic exit. War continues until one side is destroyed or the game ends. No de-escalation path.
**The fix:** After 600 ticks (60 seconds) of mutual hostility, either player can propose a cease-fire. If accepted within 300 ticks (30 seconds), both go to neutral stance (bypassing cooldown) and each gains +3 VP ("Peace Dividend").
**Why it matters:** Creates a war-length decision: fight long enough to achieve objectives, but don't overcommit. VP reward for cease-fire makes peace a strategic choice, not just giving up. Prevents hostage situations in 3+ player games.
**Design details:** Already spec'd in design.md Phase 6. `proposeCeasefire`, `acceptCeasefire` commands. 1200-tick cooldown between cease-fires with same player. Emit events for proposal, acceptance, expiry.

### R50-6: Galactic News Ticker (Narrative Layer)

**Impact:** Medium
**Effort:** Low
**Category:** Polish / UX

**The problem:** The galaxy feels quiet. Events happen but they're delivered as toast notifications that disappear. No persistent narrative thread connects the session.
**The fix:** Single-line scrolling text ticker at top-center of game screen. Takes existing gameEvent types and wraps them in procedural flavor text: "BREAKING: [Player] establishes [Colony] in the [System] system", "INDUSTRY: [Colony] completes new [District] district", "ALERT: Raider fleet detected near [System]". 3-4 template variants per event type for variety. 4-second cycle between messages. Max 8 queued.
**Why it matters:** Makes the galaxy feel alive. Other players' actions become visible and narratively interesting. Creates shared storytelling moments ("did you see that?"). Zero server changes — client-only reformatting of existing event data.
**Design details:** Already spec'd in design.md Phase 7. Player names colored by player color. System messages in neutral gray. Client-only feature.

### R50-7: Mid-Game Economic Pressure (Galactic Council Votes)

**Impact:** Medium
**Effort:** Medium
**Category:** Core Mechanic

**The problem:** Minutes 5-12 can become autopilot once colonies are running and before the endgame crisis hits. Not enough agency moments.
**The fix:** At 50% match time, a "Galactic Council" forms. Every 3 minutes (1800 ticks), a resolution is proposed to all players with a 60-second voting window. Resolutions from a pool of 4+ options (no repeats): "Mutual Research Pact" (+10% research for all, 3 min), "Economic Stimulus" (+10% minerals for all, 3 min), "Demilitarization Treaty" (ship build times +50% for all, 3 min), "Open Borders" (fog of war +1 hop for all, 3 min). Majority yes = passes.
**Why it matters:** Creates mid-game interaction between all players. Voting reveals information (who benefits from this?). Demilitarization during an arms race creates tension. Requires diplomatic reading of opponents.
**Design details:** Already spec'd in design.md Phase 6. Only in 2+ player games. 2-3 votes per match at most. Vote UI as centered modal overlay with countdown.

---

### 4. Balance Snapshot

**Resource Flow (20-minute match, Speed 2):**
- Starting: 100 energy, 300 minerals, 100 food, 50 alloys, 100 influence
- Starting production (4 pre-built districts): +6 energy, +6 minerals, +12 food, 0 alloys, 0 research/month
- First build decision: Mining (more minerals for growth) vs Housing (more pops for production) vs Agriculture (food buffer for growth)
- Assessment: **Well-balanced opening.** The mineral cost for all basic districts (100m) means ~17 months to earn one build from mining alone. Starting 300m buys 3 quick builds — this is the right amount of early agency.

**District Balance:**
| District | Cost | Produces | Consumes | Net Value/Month |
|----------|------|----------|----------|-----------------|
| Housing | 100m | 5 housing | 1 energy | Unlocks growth |
| Generator | 100m | 6 energy | — | +6 energy |
| Mining | 100m | 6 minerals | — | +6 minerals |
| Agriculture | 100m | 6 food | — | +6 food |
| Industrial | 200m | 4 alloys | 3 energy | +4 alloys, -3 energy |
| Research | 200m+20e | 4/4/4 phys/soc/eng | 4 energy | +12 research, -4 energy |

Assessment: **Good tiering.** Basic districts are uniformly costed and productive. Industrial and Research are "tier 2" — double cost, higher-value output, energy-hungry. The energy tax on advanced districts creates genuine tension. One concern: **Industrial output (4 alloys) feels low relative to its energy cost (3/month).** A player building 3 Industrials pays 9 energy/month for 12 alloys — nearly requiring 2 dedicated Generators just to power them. Consider increasing Industrial output to 5 alloys or reducing energy consumption to 2.

**Tech Pacing:**
- T1 (150 cost): With 1 Research district (4/type/month), T1 in ~38 months (~6.3 min). With 2 districts: ~19 months (~3.2 min).
- T2 (500 cost): With 2 Research districts (8/type/month), T2 in ~63 months (~10.5 min). Tight for 20-min matches — arrives at ~14 min if started after T1.
- T3 (1000 cost): With 3 Research districts, T3 in ~83 months (~13.8 min). Realistically, T3 won't complete in a 20-min match unless Scholar doctrine + Research Grant edict. This is intentional — T3 should be a stretch goal.
- Assessment: **Good pacing.** T1 is attainable early, T2 is a mid-game milestone, T3 requires investment and may never arrive. Scholar doctrine's +25% research and 33% T1 head start makes tech rushing viable but not dominant.

**Military Balance:**
- Corvette: 100m + 50a, 400 ticks (40 sec), 10 HP, 3 attack, 1e+1a/month maintenance
- At 4 alloys/month from 1 Industrial, saving for 1 corvette takes ~12.5 months. Building 5 corvettes takes the entire mid-game.
- Assessment: **Corvettes feel expensive for their impact.** The maintenance cost (1e+1a/month each) means a 5-corvette fleet drains 5 energy + 5 alloys/month — the equivalent of 2.5 Industrial districts. This is a good guns-vs-butter tension point, but the fact that all corvettes are identical limits strategic depth.

**Game Length:**
- 20-minute default is correct for the current feature set.
- A typical match arc: 0-3 min (doctrine + opening build), 3-8 min (expand + tech rush), 8-15 min (fleet building + conflicts), 15-20 min (endgame crisis + final push).
- The 10-min practice mode is too short for meaningful military play but good for colony-only practice.
- Recommendation: Add 25-minute option as the sweet spot once corvette variants and victory conditions add more late-game content.

**Specific Number Tweaks:**
1. **Colony ship cost reduction** (already in roadmap): 200m/100f/100a → 150m/50f/75a, build time 600 → 400 ticks. Current cost puts 2nd colony too late.
2. **Industrial alloy output**: Consider 4 → 5 alloys to make Industrial more attractive vs. Research. Currently Research (4/4/4 = 12 total research units) outvalues Industrial (4 alloys) in VP terms.
3. **Defense platform repair**: 10 → 15 HP/month (already in roadmap). Sequential raider attacks currently destroy players who can't rebuild fast enough.

---

### 5. Content Wishlist (Aspirational)

1. **Galactic Wonder Race**: 3 one-off megastructures (Dyson Sphere, Galactic Library, Ring World) that any player can attempt but only the first to complete claims. Cost: 1000+ resources over multiple months. +20 VP each. Creates visible long-term goals and dramatic race moments when two players compete for the same wonder. (Inspired by Civ VI world wonders)

2. **Colony Atmosphere Evolution**: As colonies develop, Three.js scene evolves — 25% capacity adds particle effects (dust for Desert, snow for Arctic), 50% adds city glow on the horizon (PointLight), 100% shifts the skybox from dark space to planet-appropriate atmosphere color. Makes colony progression *feel* different at each stage without any gameplay changes. Pure visual storytelling.

3. **Secret Rival Objectives**: At game start, each player receives a hidden objective targeting another player: "Control more colonies than [Player X]" (+10 VP), "Out-research [Player Y]" (+10 VP), etc. Round-robin assignment ensures everyone targets someone different. Revealed at game end. Creates invisible competitive tension — you don't know who's gunning for you.

4. **Dynamic Scarcity Cascades**: When a scarcity season hits (e.g., mineral scarcity), players who are net importers of that resource from trade routes get double-hit while self-sufficient players are insulated. Creates incentive for economic independence alongside the benefits of trade. Makes scarcity seasons more strategic and less random.

5. **Spectator Replay Time-Lapse**: After match ends, auto-play a 30-second fast-forward showing colony districts appearing, pop counters climbing, fleets moving. Compressed story of the match. "One more game" emotional hook. Uses existing state snapshots.

---

### 6. Priority Order (R50)

Build order for `/develop`:

1. **Corvette variants via tech (Phase 5, R50-1)** — Interceptor/Gunboat/Sentinel unlock at T2, rock-paper-scissors fleet composition. Biggest missing gameplay piece.
2. **Underdog production bonus (Phase 6, R50-3)** — +15% per colony gap (cap +45%). Quick balance fix preventing death spirals.
3. **Distinct victory conditions (Phase 7, R50-2)** — Scientific/Military/Economic instant-win. Transforms endgame.
4. **VP formula rebalance (Phase 1, R49-4)** — battle VP 5→3, survey VP surveyed/3, colony-founded VP +5/colony, alloy VP alloys/20. Quick number fix.
5. **Cease-fire negotiations (Phase 6, R50-5)** — Propose after 600 ticks, +3 VP Peace Dividend. Quick diplomatic offramp.
6. **Galactic news ticker (Phase 7, R50-6)** — Client-only flavor text on existing events. Zero server effort.
7. **Colony ship cost/time reduction (Phase 1, existing)** — 150m/50f/75a, 400-tick build. Expansion pacing fix.
8. **Science ship expeditions (Phase 3, R50-4)** — Deep Space Probe/Precursor Signal/Wormhole Mapping. Mid-game exploration depth.

---

## Review #49 — 2026-03-15 — The Endgame Question

**Reviewer:** Game Design Analyst (automated)
**Build State:** 87/210 tasks complete (41%). Doctrine choice (3 asymmetric doctrines with 30-second selection), diplomatic stances (Neutral/Hostile/Friendly, combat/occupation gating, production bonus, diplomacy VP), colony procedural naming, colony occupation, ship maintenance, PvP fleet combat, corvettes, NPC raiders, defense platforms, scarcity seasons, 9 techs (3T×3 tracks), colony crises, personality traits, edicts, influence income, science ships, fog of war, colony expansion (5 max), 5 game speeds + pause, match timer with VP win. 1,406 tests all passing. ~32,100 lines.

---

### 1. 4X Design Pillar Scores

| Pillar | Score | Assessment |
|--------|-------|-----------|
| **Strategic Depth** | 8/10 | Doctrine choice is a landmark addition. Three asymmetric starting paths (Industrialist/Scholar/Expansionist) create genuinely different openings with cascading consequences — Industrialist's +25% mining/industrial vs Scholar's research head start vs Expansionist's cheap colony ships. Combined with diplomatic stances (war costs influence, friendly gives +10% production), there's now a 3×3 matrix of doctrine-diplomacy strategies. Still missing: fleet composition variety (only corvettes), distinct victory paths (VP timer is the only endgame), and an endgame crisis to prevent late-game autopilot. |
| **Pacing & Tension** | 6/10 | The early game is now excellent — doctrine choice creates an immediate meaningful decision, and the 30-second timer adds pressure. Mid-game has colony crises, scarcity seasons, and raider attacks providing periodic disruption. But the **late game is the weakest phase**: once you've built your colonies and picked your techs, the last 5 minutes of a 20-minute match feel like watching numbers tick up. No endgame crisis, no escalating threat, no climactic moment. The match just... ends. This is the single biggest experience gap. |
| **Economy & Production** | 8.5/10 | The resource system is remarkably deep for a browser 4X. Six resources with real trade-offs: energy powers everything but generators produce no VP; alloys are needed for ships but Industrial districts are expensive; food is mandatory but produces no VP. Doctrine modifiers add another layer (+25% mining for Industrialist, -10% research penalty). Colony traits (+10% per specialist colony), edicts (temporary boosts), planet type bonuses, and scarcity seasons all stack multiplicatively. Ship maintenance creates genuine guns-vs-butter tension. The economy is the game's strongest pillar. |
| **Exploration & Discovery** | 5/10 | Science ships survey systems, anomalies provide resource rewards, fog of war creates information asymmetry. But exploration feels like a checkbox exercise rather than an adventure. Anomalies are static one-time rewards (no event chains, no narrative), surveyed systems rarely change your strategy, and there's no "I found something amazing" moment. The galaxy is a resource container, not a place to discover stories. Surface anomalies on the colony grid (planned but unimplemented) would help, but the galaxy itself needs mystery. |
| **Multiplayer Fairness** | 7/10 | Starting positions are balanced via galaxy generation (equal distance between players). Doctrine choice adds asymmetry but all three are competitive. Scarcity seasons affect everyone equally. However: no underdog bonus exists yet (the player who falls behind stays behind), no catch-up mechanics, and occupation can create a death spiral (occupied colony at 50% production makes recovery nearly impossible). First-mover advantage in expansion is strong — the player who gets their second colony first snowballs. |

**Overall Score: 6.9/10** (up from 6.6 in R48)

---

### 2. The Biggest Gaps (Playtester Perspective)

**1. The match ends with a whimper, not a bang.** A 20-minute match reaches its climax around minute 15 when all the VP-generating systems are running. The last 5 minutes are autopilot — you've already made all your meaningful decisions, and you're watching numbers climb. There's no endgame crisis, no dramatic final showdown, no "last stand" moment. This is the #1 thing a playtester would notice.

**2. Only one ship type.** Corvettes are the only military unit. Every fleet battle is symmetric — more corvettes wins. There's no rock-paper-scissors, no fleet composition puzzle, no tech-unlocked ship upgrades. Military strategy is just "build more corvettes than the other player."

**3. No comeback mechanic.** If you lose a fleet battle or have a colony occupied, you're at a strict disadvantage with no way to claw back. The occupied colony produces 50% less, your resources are drained, and the attacker gains VP. There's no rubber-banding, no desperation play, no underdog bonus.

**4. Colony grid is spatially flat.** You click an empty tile, pick a district type, done. The grid has no spatial puzzle — district placement doesn't matter. No adjacency bonuses, no anomalies to build around, no terrain variation. The planned surface anomalies would transform this from a list into a puzzle.

**5. Diplomacy is binary.** You can be neutral, hostile, or friendly. There's no negotiation, no trade deals, no peace treaties after war. The diplomatic stance system is a foundation, but it lacks the "deal-making" that makes multiplayer 4X social.

---

### 3. Recommendations

### R49-1: Endgame Crisis — The Climactic Moment

**Impact:** High
**Effort:** Medium
**Category:** Core Mechanic

**The problem:** The last 25% of every match is autopilot. No escalation, no drama, no shared moment.
**The fix:** At 75% match timer elapsed, trigger a galaxy-wide crisis. Two variants (random):
- **Galactic Storm** — all production reduced by 25% for remainder of match. Rewards stockpilers, punishes thin margins.
- **Precursor Awakening** — hostile super-fleet (60 HP, 15 attack) spawns at galaxy edge and moves toward nearest colony. +15 VP for killing it, -5 VP and occupation if it reaches an undefended colony. 100-tick advance warning.
**Why it matters:** Every great 4X match needs a climax. Stellaris has the crisis, Civ has the late-game world congress. This creates a shared "oh no" moment that forces adaptation and creates stories.
**Design details:**
- Only activates with match timer enabled
- 100-tick (10 second) warning before trigger
- Galactic Storm: simple 0.75 multiplier on all production in `_calcProduction`
- Precursor: reuses existing raider infrastructure for movement/combat
- Already specified in design.md Phase 7 — needs implementation

### R49-2: Corvette Variants via Tech

**Impact:** High
**Effort:** Medium
**Category:** Core Mechanic / Content

**The problem:** Military is one-dimensional. More corvettes = win. No fleet composition decisions.
**The fix:** Three corvette variants unlocked by T2 techs, each with a rock-paper-scissors role:
- **Interceptor** (Physics T2: Advanced Reactors) — 8 HP, 5 attack, fast (30 ticks/hop). Beats Gunboats (attacks first), loses to Sentinels.
- **Gunboat** (Engineering T2: Deep Mining) — 15 HP, 4 attack, slow (50 ticks/hop). Beats Sentinels (outlasts them), loses to Interceptors.
- **Sentinel** (Society T2: Gene Crops) — 12 HP, 3 attack + 2 HP regen/round, medium (40 ticks/hop). Beats Interceptors (sustains through damage), loses to Gunboats.
**Why it matters:** Fleet composition becomes a strategic puzzle. Your tech path determines your military options. Scouting enemy tech choices matters. Creates counter-play.
**Design details:**
- Same alloy cost as corvettes (100 minerals, 50 alloys)
- Build time: 500 ticks (slightly longer than corvettes)
- Combat targeting: each type prioritizes its counter (Interceptors focus Gunboats, etc.)
- Max 10 military ships total (across all types)
- Tech unlock creates the strategic lock-in — you can only build what you've researched

### R49-3: Underdog Production Bonus

**Impact:** High
**Effort:** Low
**Category:** Balance

**The problem:** Falling behind creates a death spiral. Occupation at 50% production with no comeback mechanic.
**The fix:** Players controlling fewer colonies than the leader get +15% resource production per colony gap (max +45%). Applied in `_processMonthlyResources` as a multiplier on all positive production.
**Why it matters:** Prevents snowballing without punishing the leader. A 1-colony player vs a 3-colony leader gets +30% production — meaningful but not overwhelming. The leader still has more total output, just not proportionally more.
**Design details:**
- Only active in 2+ player games
- Calculate each month: `deficit = max(0, leaderColonies - myColonies)`
- Multiplier: `min(1.45, 1 + deficit * 0.15)`
- Show "Underdog Bonus: +X%" indicator in resource panel
- Inspired by Mario Kart's rubber-banding — subtle but keeps everyone in the game

### R49-4: VP Formula Rebalance for Multiple Victory Paths

**Impact:** Medium
**Effort:** Low
**Category:** Balance

**The problem:** VP formula favors economic play. Military aggression (5 VP per battle won) is overshadowed by peaceful building. No distinct "military victory" or "explorer victory" path.
**The fix:**
- Reduce `FLEET_BATTLE_WON_VP` from 5 to 3 (less swing per fight)
- Change survey VP: `Math.floor(surveyed / 3)` instead of `/5` (exploration rewarded more)
- Add colony-founded VP: +5 VP per colony (expansion rewarded directly)
- Change alloy VP: `alloys / 20` instead of `/25` (economic stockpiling more valuable)
**Why it matters:** Creates three competitive VP paths: Military (fight + occupy), Economic (tall colonies + traits + alloy hoarding), Explorer (survey + expand wide). Players can see which path their doctrine supports.
**Design details:**
- Industrialist → Economy path (mining/industrial bonuses → alloy stockpile)
- Scholar → Tech path (research → high-tier techs at +30 VP each)
- Expansionist → Explore/Expand path (cheap colony ships → colony VP + survey VP)
- Already specified in design.md — needs implementation

### R49-5: Surface Anomalies on Colony Grid

**Impact:** Medium
**Effort:** Medium
**Category:** Core Mechanic

**The problem:** Colony building is a flat list — pick a type, click any empty tile. No spatial decision-making.
**The fix:** When creating a colony, randomly place 1-3 tile anomalies:
- **Mineral Vein** (+50% output to mining district on this tile)
- **Thermal Vent** (+50% output to generator on this tile)
- **Fertile Soil** (+50% output to agriculture on this tile)
- **Ancient Ruins** (excavate for +500 research or preserve for +2 influence/month)
- **Alien Artifact** (+200 alloys or +300 research, one-time choice)
**Why it matters:** Transforms district placement from "pick any empty slot" into a spatial puzzle. Players must consider where they place districts to maximize anomaly bonuses. Each colony becomes unique.
**Design details:**
- Already specified in design.md Phase 1 — needs implementation
- Track as `colony.anomalies = [{ tileIndex, type, resolved }]`
- Production bonuses in `_calcProduction` per district matching anomaly tile
- `resolveAnomaly` command for one-time choices
- 3D rendering: glowing crystals on ground tiles (can be deferred)

### R49-6: Cease-Fire Negotiations

**Impact:** Medium
**Effort:** Low
**Category:** Diplomacy / Content

**The problem:** Once war starts, there's no diplomatic off-ramp. War persists until the match ends.
**The fix:** After 600 ticks of war, either player can propose a cease-fire. If accepted within 300 ticks, both go neutral (bypassing cooldown) and each gains +3 VP ("Peace Dividend").
**Why it matters:** Creates a real diplomatic moment — do you keep fighting for occupation VP, or take the peace dividend? Makes wars feel like they have a narrative arc.
**Design details:**
- Track `_ceasefireProposals = Map<key, { proposerId, targetId, tick }>`
- 300-tick acceptance window, then expires
- 1200-tick cooldown between ceasefires for same pair
- +3 VP "Peace Dividend" on acceptance (for both players)
- Broadcast `ceasefireProposed`, `ceasefireAccepted`, `ceasefireExpired` events

### R49-7: Science Ship Expeditions

**Impact:** Medium
**Effort:** Medium
**Category:** Exploration / Content

**The problem:** Science ships survey systems, collect anomaly rewards, then sit idle. Exploration feels "done" too early.
**The fix:** Once surveying is complete, science ships can embark on 3 expedition types (one-time per galaxy):
- **Deep Space Probe** — send to galaxy edge, 200-tick journey, returns with +200 of a random resource
- **Precursor Signal** — investigate specific system, 150-tick duration, 50% chance of +500 research or +100 alloys
- **Wormhole Mapping** — reveals all unsurveyed systems within 3 hops of the ship's current position
**Why it matters:** Keeps science ships relevant after surveying. Creates ongoing exploration value and resource injection in mid-late game.
**Design details:**
- `embarkExpedition` command: validates ship is idle, expedition type exists, not already completed galaxy-wide
- Expeditions are one-time per player (not repeatable)
- Science ship is "busy" during expedition (can't survey or move)
- Emit `expeditionComplete` event with results

---

### 4. Balance Snapshot

**Resource Flow Analysis (20-minute match, normal speed):**

| Metric | Current Value | Assessment |
|--------|--------------|-----------|
| Starting minerals | 300 | Slightly generous — allows 2 basic + 1 basic district immediately. Consider reducing to 250 for opening tension. |
| Starting alloys | 50 | No sink until colony ships or corvettes. Reduce to 0 or 25. |
| Starting influence | 100 | Adequate — supports 4 stance changes or 2 edicts. |
| Mining output/month | 6 minerals | Good — pays for a basic district in 17 months (~2.8 min). |
| Industrial output/month | 4 alloys | Good — corvette alloy cost (50) takes 12.5 months. |
| Research output/month | 4/4/4 per type | Good — T1 tech (150 cost) in 37.5 months (~6 min) with 1 district. |
| Colony ship cost | 200m/100f/100a | **Too expensive** — second colony arrives at ~17.5 min in 20-min match. Reduce to 150m/50f/75a (already in design.md). |
| Colony ship build time | 600 ticks | **Too slow** — 60 seconds. Reduce to 400 ticks (already in design.md). |

**Colony Balance:**
- Housing: necessary evil, no VP, pure enabler. Fine.
- Generator: produces no VP directly, required for energy. Consider +1 VP per generator (already in design.md).
- Mining: workhorse, feeds construction. Balanced.
- Agriculture: mandatory for growth, low VP contribution. Fine — food enables pops which give VP.
- Industrial: 200 mineral cost is appropriate for 4 alloys/month output. Good.
- Research: 200 mineral + 20 energy cost. Best VP producer via tech completions (+30 VP for T3). Strong but gated by cost.

**Military Balance:**
- Corvette (10 HP, 3 attack, 100m/50a cost, 1e+1a/month maintenance) — the only unit. Battles last 3-4 rounds typically. Two equal-sized fleets: ~50% chance each. **Needs variants for depth.**
- Defense platform (50 HP, 15 attack) vs Raider (30 HP, 8 attack) — platform wins in ~2 rounds. Effective deterrent. Balanced.

**Doctrine Balance (new):**
- Industrialist (+25% mining/industrial, -10% research, +1 mining district): Strong early economy, slower tech. Best for military-economy path.
- Scholar (+25% research, -10% mining, T1 33% done): Fastest to T3 techs (+30 VP each = 90 VP potential). Best for tech-rush.
- Expansionist (-10% alloys, +2 pops, -25% colony ship cost/time): Best for wide play. Second colony arrives ~3 min earlier. Best for explorer path.
- Assessment: **Well-balanced.** Each doctrine naturally supports a different VP path. No dominant choice.

**Game Length:**
- 10-min practice match: ~6000 ticks at normal speed. Tight — barely time for T1 tech + second colony.
- 20-min multiplayer match: ~12000 ticks. Good pacing if colony ship costs are reduced. T2 tech reachable, T3 aspirational.
- Recommended default: 20 min (current). Add 25-min option (already in design.md) once endgame crisis exists.

---

### 5. Content Wishlist — Making ColonyGame Distinctive

**1. Galactic Wonder Race.** Three wonders that can only be built once galaxy-wide (Dyson Sphere, Galactic Library, Ring World). First to complete claims it. Creates a dramatic race in mid-late game. +20 VP each. Already in design.md as stretch goal — worth promoting.

**2. Secret Rival Objectives.** At game start, assign each player a hidden objective targeting another specific player ("Control more colonies than Player X", "Out-research Player Y"). Evaluated at game end for +10 VP bonus. Creates invisible competition and gives purpose to watching opponent stats. Makes every game personal.

**3. Colony Crisis Cascading.** When a plague hits one colony, neighboring colonies (within 2 hops) get a "Quarantine Warning" — pay 20 food to prevent, or 30% chance it spreads. Creates inter-colony narrative connections and geographic strategy for colony placement. Already in design.md as stretch.

**4. Dynamic Colony Atmosphere.** As a colony develops past 25%/50%/100% capacity, the Three.js scene changes — particle effects (dust, snow, rain), city glow on the horizon, skybox color shift from dark space to planet-appropriate atmosphere. Makes colony progression visible at the environmental level. Already in design.md as stretch.

**5. Galactic Council Votes.** At 50% match time, a "Galactic Council" forms. Every 3 minutes, a resolution is proposed (Mutual Research Pact, Demilitarization Treaty). Players vote yes/no, majority wins. Creates diplomatic interaction without formal alliance treaties. Already in design.md.

---

### 6. Recommended Build Order for /develop

**(1) Endgame crisis event** (Phase 7, R49-1) — the single highest-impact feature for game feel
**(2) VP formula rebalance** (Phase 1, R49-4) — low-effort balance fix that creates viable strategy paths
**(3) Underdog production bonus** (Phase 6, R49-3) — prevents snowballing, keeps all players engaged
**(4) Corvette variants via tech** (Phase 5, R49-2) — transforms military from one-dimensional to strategic
**(5) Surface anomalies server logic** (Phase 1, R49-5) — makes colony building a spatial puzzle
**(6) Cease-fire negotiations** (Phase 6, R49-6) — diplomatic depth with minimal code
**(7) Colony ship cost/time reduction** (Phase 1, existing) — critical timing fix for expansion pacing
**(8) Science ship expeditions** (Phase 3, R49-7) — keeps exploration relevant in mid-late game

---

## Review #48 — 2026-03-15 — The Social Contract

**Reviewer:** Game Design Analyst (automated)
**Build State:** 85/207 tasks complete (41%). Diplomatic stances (Neutral/Hostile/Friendly, influence costs, cooldowns, combat gating, occupation gating, friendly production bonus, diplomacy VP), colony procedural naming (60 themed names, 6 planet types), colony occupation (300-tick takeover, 50% penalty, liberation), ship maintenance, PvP fleet combat, corvettes, NPC raiders, defense platforms, scarcity seasons, 9 techs (3T×3 tracks), colony crises, personality traits, edicts, influence income, science ships, fog of war, colony expansion (5 max), 5 game speeds + pause, match timer with VP win. 1,327 tests all passing. ~30,578 lines.

---

### 1. 4X Design Pillar Scores

| Pillar | Score | Assessment |
|--------|-------|-----------|
| **Strategic Depth** | 7.5/10 | Diplomatic stances are a transformative addition. Declaring war now costs 25 influence and locks both players into hostility for 600 ticks — aggression becomes an economic and strategic commitment, not a free action. Friendly stance creates a coalition metagame: the +10% production bonus for nearby allies makes geographic diplomacy matter. War/peace/alliance decisions layer on top of the existing economy-vs-military tension. Still missing: asymmetric starts (doctrine choice), fleet composition (only corvettes), and distinct victory paths. |
| **Pacing & Tension** | 6/10 | Diplomacy adds a mid-game inflection point that didn't exist before. "Player A just declared war on Player B" is a galaxy-shaking event that forces all players to reassess. The cooldown timer creates windows of vulnerability and safety. But the early game (0-5 min) is still autopilot with identical starts, and the endgame still lacks a crisis climax. The game's arc is now: slow build → diplomatic maneuvering → military escalation → flat timer expiry. The middle got better; the bookends haven't. |
| **Economy & Production** | 8/10 | Best pillar, now even stronger. Influence finally has a real recurring sink: 25 per stance change means an aggressive player who declares war on 2 opponents spends 50 influence (half the starting stockpile). The friendly production bonus (+10% near allies) makes diplomacy economically meaningful — it's not just about avoiding war, it's about growing faster. Energy remains the tightest constraint, correctly gating military expansion. The economy rewards planning across all timeframes. |
| **Exploration & Discovery** | 5/10 | Unchanged. Science ships, fog of war, anomalies remain functional but shallow. Post-survey dead zone persists. Diplomacy doesn't help here — exploration needs its own content injection (expeditions, anomaly chains). Colony founding is still expensive/late. This pillar is now the weakest relative to the rest. |
| **Multiplayer Fairness** | 6/10 | Biggest jump. Diplomacy provides deterrence (declaring war is costly), de-escalation (switch to neutral after cooldown), and coalition formation (2v1 with production bonus makes ganging up on the leader viable). Asymmetric VP from friendly stances (+5/+10 VP) rewards diplomatic players. The occupation death spiral now has a diplomatic answer: ally with a third player for production bonus to fund liberation. Still missing: underdog production bonus, starting variety, and comeback mechanics beyond diplomacy. |

**Overall Score: 6.5/10** (up from 5.8 in R47 — diplomacy is the biggest single-feature jump in the game's history)

---

### 2. Top 5 Things a Playtester Would Notice

1. **"Every game starts exactly the same for 5 minutes"** — Same planet, same 4 districts, same 8 pops. No doctrine, no faction, no starting planet variety. This is now the #1 gap — diplomacy solved the multiplayer interaction problem but the autopilot opening is more glaring by contrast.

2. **"The game just... ends"** — Timer expires, VP tallied, done. No endgame crisis, no climax, no dramatic finale. With diplomacy creating mid-game drama, the flat ending is even more disappointing. The game peaks at minute 12 and flatlines.

3. **"My science ships are dead weight after surveying"** — Post-survey, science ships sit idle bleeding energy. No expeditions, no research missions. The exploration pillar is now the weakest part of the game, starved of mid-to-late game content.

4. **"There's only corvettes"** — Fleet composition is nonexistent. Military strategy is "build more corvettes." No destroyers, no variants, no tactical decisions in fleet construction. Combat feels one-dimensional despite the solid damage/retreat mechanics.

5. **"I can't tell what strategy to pursue for VP"** — Military VP still dominates. A single battle + occupation swings 13+ VP (5 battle + 3 attacker + -5 defender). Survey VP is 1 per 5 systems = negligible. Colony founding gives 0 direct VP. Economic and explorer strategies feel like consolation prizes.

---

### 3. Recommendations

### R48-1: Doctrine Choice at Game Start — Break the Autopilot

**Impact:** High
**Effort:** Low
**Category:** Core Mechanic / Replayability

**The problem:** The #1 playtester complaint. Minutes 0-5 are identical across all games and all players. The optimal build order is solved. No player expression until tech research at minute 4.

**The fix:** 3 doctrines (30-second selection before game starts):
- **Industrialist** — +25% Mining/Industrial output, start with extra Mining district (5 total), -10% research output
- **Scholar** — +25% Research output, T1 tech starts 33% complete in all 3 tracks, -10% mineral output
- **Expansionist** — Colony ships 25% cheaper and 25% faster build, start with 10 pops (not 8), -10% alloy output

**Why it matters:** Instantly creates 3 distinct opening strategies. Industrialist rushes economy, Scholar races T2 tech, Expansionist pushes early second colony. In multiplayer, scouting opponent doctrine via scoreboard informs military timing. Each doctrine has a -10% penalty preventing dominance. Reference: Endless Space 2 factions, Stellaris empire ethics.

**Design details:** Already fully specified in design.md Phase 4. Server adds 30-second `doctrineSelect` phase between game launch and first tick. Public on scoreboard. Random if no pick.

### R48-2: Endgame Crisis — Create a Climax

**Impact:** High
**Effort:** Medium
**Category:** Pacing / Tension

**The problem:** The game peaks in the middle (diplomatic maneuvering, fleet battles) and flatlines to a timer expiry. The last 3-5 minutes feel identical to minutes 8-12. No narrative climax.

**The fix:** At 75% match timer elapsed, one of two crises triggers (100-tick advance warning):
- **Galactic Storm** — All production reduced 25% for remainder. Economy players with stockpiles shine. Margin players collapse. Simple 0.75 multiplier in `_calcProduction`.
- **Precursor Awakening** — Hostile mega-fleet (60 HP, 15 attack) spawns at galaxy edge, moves toward nearest colony every 30 ticks. +15 VP for destroying it. If it reaches undefended colony: occupies it. Reuses existing raider + occupation infrastructure.

**Why it matters:** Every memorable 4X session has "the crisis." This creates the lean-forward moment where alliances matter (friendly players fight it together), stockpiles matter, and the match gets a story to tell afterward. Reference: Stellaris endgame crisis, Civ VI emergency system.

**Design details:** Already specified in design.md Phase 7. Only activates with match timer enabled. Precursor fleet can be engaged by multiple players (whoever lands the killing blow gets VP).

### R48-3: VP Formula Rebalance — Make All Strategies Viable

**Impact:** High
**Effort:** Low (number tweaks)
**Category:** Balance

**The problem:** Military VP dominates. Battle VP (5/win) + occupation VP (3 attacker, -5 defender = 8 swing) easily outpaces exploration (1 VP per 5 systems) and colony founding (0 direct VP). Diplomatic VP (+5/+10 per friendly) is the only non-military category that competes. Economic and explorer strategies are VP-disadvantaged.

**The fix:**
- Survey VP: `surveyed / 5` → `surveyed / 3` (67% increase). 15 surveyed systems = 5 VP instead of 3.
- Colony ownership VP: +5 VP per colony owned (new `coloniesVP` in breakdown). 3 colonies = 15 VP.
- Alloy VP: `alloys / 25` → `alloys / 20` (25% increase). 200 alloys = 10 VP instead of 8.
- Battle VP: 5 → 3 per battle won. Combat is already rewarded through occupation VP.

**Why it matters:** Three viable VP strategies emerge: **Military** (fight + occupy + occupation VP), **Economic** (tall colonies + traits + alloy stockpile + colony-founded VP), **Explorer** (survey + expand + colony VP). Diplomacy (friendly VP) layers on top of any strategy. A peaceful 3-colony player with good traits now competes with a militarist who won 2 battles and occupied 1 colony.

**Design details:** Already specified in design.md Phase 1. Update `_calcVPBreakdown`, `_triggerGameOver`, client scoreboard. 4 constant/formula changes + test updates.

### R48-4: Underdog Production Bonus — Prevent Snowballing

**Impact:** Medium-High
**Effort:** Low
**Category:** Balance / Multiplayer Fairness

**The problem:** Occupation creates a death spiral. Losing a colony halves its production AND costs 5 VP. The defender can't fund a liberation fleet because their economy is crippled. Diplomacy helps (ally for +10% bonus) but isn't enough to close a 50% production gap.

**The fix:** Players with fewer colonies than the leader get +15% resource production per colony gap (cap at +45%). Applied in `_processMonthlyResources` as a multiplier on all positive production. Show "Underdog Bonus: +X%" in resource panel.

**Why it matters:** Keeps all players engaged even when behind. A player who loses 1 colony to occupation gets +15% production — partially offsetting the 50% penalty on the occupied colony. Combined with friendly alliance bonus (+10%), they're at ~75% effective production instead of 50%. Snowballing is checked without eliminating the leader's advantage. Reference: Mario Kart rubber-banding, Stellaris war exhaustion.

**Design details:** Already specified in design.md Phase 6. Calculate monthly: max colonies across all players, deficit per player, apply `1 + (deficit * 0.15)` capped at 1.45. Only in 2+ player games.

### R48-5: Corvette Variants via Tech — Fleet Composition

**Impact:** Medium
**Effort:** Medium
**Category:** Core Mechanic / Strategic Depth

**The problem:** Only one military ship class. Fleet strategy is "build more corvettes." No rock-paper-scissors counter-play, no fleet composition decisions. Military depth is shallow despite solid combat mechanics.

**The fix:** 3 corvette variants unlocked by existing T2 techs (no new tech tree needed):
- **Interceptor** (T2 Physics: Advanced Reactors) — 6 HP, 5 attack, 25 ticks/hop. Fast raiders. Beat gunboats in speed, lose to sentinels in HP.
- **Gunboat** (T2 Engineering: Deep Mining) — 15 HP, 5 attack, 55 ticks/hop. Slow heavy hitters. Beat sentinels in damage, lose to interceptors who flee.
- **Sentinel** (T2 Society: Gene Crops) — 20 HP, 1 attack, 40 ticks/hop. Garrison ships. High HP absorbs damage. Perfect for occupation defense. Beat interceptors in durability, lose to gunboats.

Same build cost as base corvette (100M + 50A). Base corvette remains available (10 HP, 3 attack, 40 ticks/hop) — the balanced option. Max total military ships stays at 10.

**Why it matters:** Creates a fleet composition metagame. "Opponent built interceptors → I need sentinels to survive raids." Tech path now informs military strategy, connecting the tech tree to combat. No new ship infrastructure needed — variants are just different stat profiles on the existing corvette system.

**Design details:** Add `buildCorvetteVariant` command (or extend `buildCorvette` with `variant` parameter). Track variant type on ship object. Variants share combat resolution with base corvette (just different HP/attack/speed values). Add to client ship build UI as additional buttons when tech is completed.

### R48-6: Starting Planet Variety — Free Replayability

**Impact:** Medium
**Effort:** Low
**Category:** Replayability

**The problem:** Every player starts on a Continental planet. Planet bonuses exist (Desert +2 mining, Arctic +1 research per district, etc.) but are irrelevant because the starting planet is always the same.

**The fix:** Random habitable type per player on game start. In multiplayer fairness mode (default): all players get the same random type and size. Planet bonuses already create naturally different openings: desert leans mining, tropical leans food, arctic leans research.

**Why it matters:** Instant replayability from existing code. "I got an Arctic start, so I'm going Scholar doctrine + research rush." Planet type + doctrine choice = 18 distinct opening configurations (6 types × 3 doctrines).

**Design details:** Already specified in design.md Phase 1. Modify `_initStartingColonies` to randomize planet type. Size range 12-20 with fairness mode option.

### R48-7: Science Ship Expeditions — Fill the Exploration Dead Zone

**Impact:** Medium
**Effort:** Medium
**Category:** Content / Exploration

**The problem:** After surveying the galaxy (~8 minutes), science ships are pure liability. The exploration pillar is now the weakest part of the game. Minutes 8-20 have zero exploration content.

**The fix:** After surveying 5+ systems, science ships unlock "expeditions" — timed missions to distant systems:
- **Deep Space Probe** (600 ticks): +200 random resource, +3 VP. Safe, reliable.
- **Precursor Signal** (900 ticks): 70% chance +500 research + 5 VP, 30% ship lost. High risk/reward.
- **Wormhole Mapping** (600 ticks): temporary fast-travel between 2 owned systems for 1200 ticks, +2 VP. Tactical utility.

**Why it matters:** Transforms science ships from survey-and-idle into permanent exploration assets. Creates ongoing decisions: safe probe vs risky signal vs tactical wormhole. Explorer strategy becomes viable across the entire match. Reference: Stellaris archaeological sites.

**Design details:** Already specified in design.md Phase 3. Add `sendExpedition` command. Track expedition state on ship. Ship unavailable during expedition. Max 1 per ship.

### R48-8: War Weariness — Prevent Permanent Occupation Farming

**Impact:** Medium
**Effort:** Low
**Category:** Balance

**The problem:** Occupation VP has no time decay. A player who occupies a colony at minute 8 gets the full +3 VP and -5 VP penalty on the defender for the entire remaining match. This incentivizes early aggression and permanent occupation rather than strategic warfare.

**The fix:** After 500 ticks (50 seconds) of continuous occupation, the attacker's occupation VP decays by 1 per 200 ticks. At 900 ticks, occupation VP reaches 0. Defender's penalty also decays on the same schedule. Creates a "take, hold, profit, then move on" pattern rather than permanent parking.

**Why it matters:** Complements diplomacy — it costs 25 influence to go to war, but the occupation VP window is limited. Combined with the 600-tick diplomatic cooldown, this creates natural "war seasons" and "peace seasons." Prevents the degenerate strategy of parking corvettes on an enemy colony forever. Reference: Stellaris war exhaustion forcing peace.

**Design details:** Track `occupationStartTick` on colony. In `_calcVPBreakdown`, compute VP as `max(0, OCCUPATION_ATTACKER_VP - decay)`. No constants change — just a decay formula. Add occupation decay tests.

---

### 4. Balance Snapshot

**Resource Flow (Starting State):**
- Start: 100E, 300M, 100F, 50A, 100I — 8 pops, 4 districts (1G, 1M, 2Ag)
- Monthly: +6E(gen) -1E(housing) = +5E net, +6M, +12F -8F(pops) = +4F net, 0A
- First district: immediate (100M from 300 stockpile). Second at ~17 seconds.
- **Assessment:** Opening economy is healthy. Unchanged from R47.

**Diplomacy Economy (NEW):**
- Starting influence: 100. Income: +2/colony/month + 1/trait.
- War declaration: 25 influence. 2 wars = 50 influence = half the starting stockpile.
- At 2 colonies with 1 trait: +5 influence/month → 25 influence every 5 months (50 seconds).
- Friendly bonus: +10% production on nearby colonies = ~1-3 extra resources/month per colony.
- **Assessment:** Influence economy is now correctly tight. Going to war with 2 players is expensive. Diplomatic aggression is gated but achievable. The 600-tick cooldown (60 seconds) means stance changes are rare and strategic.

**VP Distribution (20-min match, updated with diplomacy):**
- Peaceful economist with 1 ally: ~98 VP (economy) + 10 VP (mutual friendly) = ~108 VP
- Militarist (2 battles, 1 occupation): ~83 VP (economy) + 10 VP (battles) + 3 VP (occupation) - 2 VP (ships lost) = ~94 VP
- **Assessment:** Diplomacy VP closes the gap somewhat. But with current VP formula, military player also benefits from occupation VP penalty on defender (-5 VP). Net military advantage is ~6-8 VP including the defender's loss. R48-3 VP rebalance + R48-8 war weariness would bring this into equilibrium.

**New VP Targets (post-R48-3 rebalance):**
- Explorer (15 surveyed, 3 colonies, 1 trait): 5 VP (survey) + 15 VP (colonies) + 10 VP (trait) + ~70 VP (economy) = ~100 VP
- Economist (2 colonies, 2 traits, 300 alloys): 20 VP (traits) + 15 VP (alloys) + ~85 VP (pops+districts+tech) = ~120 VP
- Militarist (2 battles, 1 occupation): 6 VP (battles) + 3 VP (occupation) + ~83 VP (economy) = ~92 VP
- Diplomat (2 mutual allies): 20 VP (diplomacy) + ~90 VP (boosted economy from 10% bonus) = ~110 VP
- **Assessment:** All four strategies become competitive. Tall economy is slightly favored, which is correct for a 4X — economic mastery should be the baseline skill.

**Specific Number Tweaks:**
1. Survey VP: `surveyed/5` → `surveyed/3`
2. Colony ownership VP: +5 per colony (new)
3. Alloy VP: `alloys/25` → `alloys/20`
4. Battle VP: 5 → 3
5. Occupation VP: add decay after 500 ticks (new)
6. Defense platform repair: 10 → 15 HP/month (already in roadmap)
7. Colony ship cost reduction (already in roadmap)

---

### 5. Content Wishlist (Aspirational)

1. **"Diplomatic Incidents"** — Random events that test alliances. "Border skirmish: your scouts encountered [Ally]'s patrol. Smooth it over (spend 10 influence) or let tensions rise (friendly → neutral automatically)." Creates drama in peaceful games. Makes alliances feel alive rather than set-and-forget. Stellaris does this with opinion modifiers and faction demands.

2. **"Galactic Leylines"** — Hidden resource veins connecting 2-3 star systems. Controlling all endpoints grants +15% production bonus. Discovered by colonizing endpoint systems. Creates an expansion puzzle beyond "settle the biggest planet." Strongly endorsed from R47.

3. **"Tech Espionage via Friendly Stance"** — When mutual-friendly with a player, gain +25% progress on techs they've already completed. Creates a reason to befriend the Scholar player. Information asymmetry: you know what techs your ally has (visible on scoreboard), but not what they're researching. Endless Space 2's influence system is a reference.

4. **"Cease-fire Negotiations"** — When two hostile players have been at war for 600+ ticks, either can propose a cease-fire. If accepted, both go to neutral and gain +3 VP each ("Peace Dividend"). Creates an incentive to end wars and a diplomatic offramp. Currently, hostility has no off-ramp besides waiting for cooldown + spending influence.

5. **"Galactic Wonders Race"** — 3 megastructures only one player can build (Dyson Sphere, Library, Ring World). Already in design.md. Endorsed as the flagship late-game feature.

---

### 6. Priority Order (R48)

Diplomacy is shipped. The game now has a social contract. The critical gaps are: **opening variety** (autopilot first 5 minutes), **endgame drama** (flat timer expiry), and **VP balance** (military dominance). All recommendations target these plus deepening what exists.

1. **Doctrine choice (R48-1)** — Breaks the solved opening. Highest impact-to-effort ratio. Low effort, massive replayability.
2. **Endgame crisis (R48-2)** — Creates the climax the game desperately needs. Medium effort, reuses raider infrastructure.
3. **VP rebalance (R48-3)** — Number tweaks enabling diverse strategies. Low effort, high impact on strategic diversity.
4. **Underdog bonus (R48-4)** — Prevents snowballing, keeps all players engaged. Low effort.
5. **Corvette variants (R48-5)** — Fleet composition decisions. Medium effort but transforms military pillar.
6. **Starting planet variety (R48-6)** — Free replayability from existing planet bonus code. Low effort.
7. **Science ship expeditions (R48-7)** — Fills exploration dead zone. Medium effort.
8. **War weariness (R48-8)** — Prevents occupation farming. Low effort, important balance complement.

---

*Earlier reviews truncated for brevity. See git history for full archive.*
