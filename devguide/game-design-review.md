# ColonyGame — Game Design Review

*Living document — newest reviews first.*

---

## Review #21 — 2026-03-12 — The Paralysis of Potential

**Reviewer:** Game Design Analyst (automated)
**Build State:** 38/131 tasks complete (29%). Isometric colony builder, galaxy map with Three.js, procedural galaxy (Poisson disc + RNG), mini tech tree (6 techs, 2 tiers), VP scoring with match timer, energy deficit system, event toast HUD, pop growth, demolition with refund. 319 tests passing. ~8,840 lines.

**Key changes since Review #20:** First-3-districts build discount fix (was dead code on starting colonies due to `isStartingColony` flag). No new gameplay systems — strictly a balance/bug fix.

---

### 1. Pillar Scores

| Pillar | Score | Trend | Notes |
|--------|-------|-------|-------|
| Strategic Depth | 3/10 | → | Single-colony optimization remains the entire game. Build order is the only strategic variable. Six techs in a linear tree don't offer branching paths. The galaxy exists but is a decoration — no spatial strategy, no expansion decisions, no fleet composition. Every match plays identically after the opener |
| Pacing & Tension | 4/10 | → | Match timer provides end-game urgency. Energy deficit and food starvation create reactive moments. Toast notifications give feedback. But the game has one gear — there's no early/mid/late arc, no inflection where new systems unlock, no "oh god they're ahead of me" multiplayer pressure. Dead air dominates minutes 5-20 |
| Economy & Production | 7/10 | → | The crown jewel. District trade-offs are genuine (energy headroom vs food vs growth vs research investment). Housing cap creates pressure. Energy deficit as consequence system works. Pop-job-production chain is elegant. But two resources are broken: alloys have no active sink (only passive VP banking) and influence is a dead number on the HUD |
| Exploration & Discovery | 2/10 | → | Galaxy is fully visible, fully readable, and completely inert. No fog of war, no surveying, no science ships, no anomalies. Clicking a system shows planet stats but you cannot act on any of it. The contrast between the pretty galaxy map and the zero gameplay it offers is the game's most jarring moment |
| Multiplayer Fairness | 5/10 | → | Starting positions are balanced via equidistant greedy spread. VP is transparent with scoreboard. But there is zero player interaction — no chat in-game, no trading, no combat, no diplomacy. Multiplayer is solitaire with a shared countdown. The "multi" in multiplayer is purely cosmetic |

**Overall Score: 4.2/10** (unchanged from R20)

The score hasn't moved because no new systems were added — the build discount fix was a correctness issue. The game is in a holding pattern: the foundation is solid, the economy works, the galaxy is beautiful, but nothing connects them. The score will jump sharply when any of [colony ships, fog of war, in-game chat] lands.

---

### 2. The Core Problem: A Bridge to Nowhere

The game has built both shores but not the bridge:

**Shore 1 (Colony Management):** A well-balanced district economy with meaningful trade-offs, pop growth dynamics, housing pressure, energy crises, construction queues, tech research. This is a complete, playable city-builder.

**Shore 2 (Galaxy Map):** A procedurally generated galaxy with 50+ star systems, diverse planet types, hyperlane networks, star classifications, system detail panels, ownership visualization. This is a complete, navigable space map.

**The Bridge (Missing):** Colony ships, science ships, fog of war, fleet movement, multi-colony management — the systems that make the galaxy *matter* to the colony and the colony *project* into the galaxy.

Until that bridge exists, the game is two disconnected experiences: a SimCity on one screen and a Google Maps on the other.

---

### 3. Top 5 Things a Playtester Would Notice

1. **"Why can I see 50 star systems if I can only play on one?"** The galaxy map is the game's biggest promise and biggest letdown. It has beautiful star rendering, clickable system panels, planet habitability data — all infrastructure for decisions you can never make. The cognitive dissonance between visual scope and mechanical scope is the #1 frustration.

2. **"I figured out the optimal build order in one game."** Start: 2 Agriculture → 1 Generator → 1 Mining. Then: Research → Industrial → Housing as needed. Research Improved Power Plants first. Every game, every time. Without expansion, planet bonuses, events, or strategic variance, the optimal path is a solved puzzle.

3. **"Minutes 5-20 are boring."** After the initial build rush (~2 minutes of active decisions), the game enters a long coast. Minerals accumulate slowly, pops grow on autopilot, research ticks down. The player has nothing to *do* except wait and occasionally click a build button. There's no second wave of decisions.

4. **"Alloys and influence are fake."** Two of six resources are non-functional. Alloys passively convert to VP (no ships, no colony ships, no buildings that need them). Influence displays a number that never changes and never matters. Players who discover this feel deceived by the resource bar's implied depth.

5. **"I forgot other players existed."** No in-game communication, no visual presence (beyond ownership dots), no mechanical interaction. The only multiplayer signal is the VP scoreboard. A human opponent and a static AI would feel identical. This makes the multiplayer lobby feel like overhead, not a feature.

---

### 4. Recommendations

#### 4.1 Game Speed Controls — Unlock Comfortable Play

**Impact:** High (quality of life, enables playtesting)
**Effort:** Low
**Category:** UX

**The problem:** Fixed speed creates dead time. After the initial build rush, experienced players wait with nothing to do. New players can't pause to learn systems. Playtesters can't fast-forward to test late-game scenarios. The tick rate is hard-coded, making the game's pacing unadjustable.

**The fix:** Already specified in roadmap (R19-5). 5 speed levels + pause. Speed 1 (0.5x) through Speed 5 (5x). Keyboard shortcuts +/-/Space. Host-only in multiplayer.

**Why it matters:** This is pure QoL that costs almost nothing and improves every subsequent play session. It's the foundation for comfortable playtesting — without it, evaluating any future feature requires sitting through 20 minutes of real-time play. Should be the very next thing built.

#### 4.2 Fog of War — Galaxy as Frontier

**Impact:** High (transforms exploration pillar from 2/10 to ~4/10)
**Effort:** Low (client-only, no server changes)
**Category:** Core Mechanic

**The problem:** Complete information kills exploration. Every system's planets, types, sizes, and habitability are visible from game start. There's no mystery, no discovery, no reason to "explore." The galaxy map is an atlas, not a frontier.

**The fix:** Already specified in roadmap (R17-4). Three tiers: Known (2 hops from owned systems), Surveyed (visited), Unknown (dim gray, no details). Purely client-side rendering change.

**Why it matters:** Fog of war is the cheapest way to create exploration gameplay. It transforms the galaxy from a solved information problem into a mystery worth investigating. "What's beyond those dim stars?" becomes a real question. Combined with colony ships (when they arrive), fog creates the classic 4X "push into the unknown" tension. And it requires zero server changes — just conditional rendering.

#### 4.3 Planet Type Bonuses — Make Location Strategic

**Impact:** Medium-High (adds strategic variety to colony play)
**Effort:** Low
**Category:** Core Mechanic / Balance

**The problem:** All habitable planets play identically. Continental, Ocean, Tropical, Arctic, Desert, Arid — the only difference is habitability %, which is mechanically invisible during gameplay. There's no reason to care about planet types. The elaborate planet generation system is wasted.

**The fix:** Already specified (R19-4). Additive bonuses per district type based on planet: Continental +1 food/Agri, Ocean +1 food/Agri + +1 research/Research, Tropical +2 food/Agri, Arctic +1 mineral/Mining + +1 research/Research, Desert +2 mineral/Mining, Arid +1 energy/Generator + +1 alloy/Industrial.

**Why it matters:** Planet bonuses make the galaxy map information-rich even before colony ships. "That Desert world would be an amazing mining colony" is already interesting to think about while managing your starting colony. When colony ships arrive, planet bonuses will be the primary driver of expansion decisions. This feature has almost zero downside — it adds complexity exactly where the game needs it (location mattering) without adding cognitive load (bonuses are visible in the UI).

#### 4.4 Colony Ships — The Watershed Feature

**Impact:** Critical (transforms game from city-builder to 4X)
**Effort:** Medium
**Category:** Core Mechanic

**The problem:** The game is ColonyGame but players manage one colony. The galaxy, hyperlanes, planet diversity, starting position spread — all of this infrastructure exists for multi-colony gameplay that doesn't. The economy runs out of strategic depth at minute 5 because there's only one colony to optimize.

**The fix:** Already specified (R18-8). Colony ship built from build queue (200 minerals, 100 food, 100 alloys). Moves along hyperlanes (50 ticks/hop = 5 sec). Consumed on arrival to found new colony with 2 pops. Max 5 colonies per player.

**Why it matters:** Colony ships bridge the two halves of the game. They make alloys meaningful (200 alloy cost = ~50 months of Industrial production), make the galaxy actionable (you go to those star systems), and create the central 4X tension: expand now (sacrifice resources, weaken current colony) or optimize first (risk falling behind). This single feature would move Strategic Depth from 3/10 to 5/10 and Exploration from 2/10 to 4/10.

**Design note:** Colony ships should land *before* fog of war for maximum impact. With visible galaxy + colony ships, players immediately get spatial strategy. Fog of war then layers mystery on top.

**Counter-argument to current roadmap order:** The R20 priority puts fog of war (#3) before colony ships (#5). I'd argue the reverse — colony ships without fog is fun (you can see and choose your targets), but fog without colony ships just makes an inert galaxy more mysterious. You're hiding information about a place you can't go. Colony ships should be #2 after game speed controls.

#### 4.5 In-Game Chat — Multiplayer Needs a Pulse

**Impact:** Medium (enables social gameplay)
**Effort:** Low (infrastructure exists)
**Category:** UX / Multiplayer

**The problem:** Players in a multiplayer match cannot communicate. Lobby chat disappears when the game starts. Without communication, multiplayer is single-player with network latency added.

**The fix:** Already specified (R19-6). Collapsible chat panel at bottom-left of game screen. Reuse existing WebSocket chat infrastructure. Player names colored by player color.

**Why it matters:** Chat is the cheapest social feature. "Nice colony" / "Stay away from my systems" / "Want to trade?" — even without formal trading, chat creates social dynamics. It's also the minimum requirement for multiplayer to feel multiplayer.

#### 4.6 Edict System — Give Influence a Purpose

**Impact:** Medium (fixes dead resource, adds tactical timing)
**Effort:** Low-Medium
**Category:** Core Mechanic

**The problem:** Influence shows "100" on the resource bar and never changes. It's a promise of a system that doesn't exist. Players who notice this lose trust in the game's depth.

**The fix:** Already specified in Phase 2. 4 edicts: Mineral Rush (50 influence, +50% mining 5 months), Population Drive (75 influence, +100% growth 5 months), Research Grant (50 influence, +50% research 5 months), Emergency Reserves (25 influence, instant +100 energy/minerals/food).

**Why it matters:** With only 100 starting influence and no income, edicts become a one-time strategic choice: when and what to boost. "Do I pop drive early for growth, or save for a late-game research grant?" This adds a genuine strategic dimension with minimal implementation.

#### 4.7 Revised Priority Order — Colony Ships Before Fog

**Impact:** N/A (meta-recommendation on build order)

The current R20 priority order front-loads cheap wins then builds to colony ships. I agree with the philosophy but want to adjust the sequence:

1. **Game speed controls** — immediate QoL (unchanged)
2. **Planet type bonuses** — adds variety now, pays off hugely when colony ships land (unchanged)
3. **Colony ships** — MOVED UP from #5. The bridge feature. Fog of war on an inert galaxy is less valuable than colony ships on a visible galaxy. Players need agency before mystery.
4. **Colony list sidebar** — MOVED UP, now required immediately (colony ships create multi-colony)
5. **Fog of war** — now layered on top of expansion gameplay, making exploration meaningful
6. **In-game chat** — enables social multiplayer alongside expansion
7. **Surface anomalies** — colony-level discovery
8. **Edict system** — influence purpose

This order maximizes "fun gained per feature shipped" by ensuring each feature has systems to interact with.

---

### 5. Balance Snapshot

#### Resource Flow (Single Colony, Optimal Play)

| Metric | Value | Assessment |
|--------|-------|------------|
| Starting minerals | 300 | Funds 3 basic districts immediately — good opening agency |
| Starting food | 100 | 12.5 months of zero-production buffer — comfortable |
| Mineral income (1 Mining) | +6/month (10s) | 100-mineral district every ~167 ticks (16.7s) — slightly slow |
| Food surplus (2 Agri, 8 pops) | +4/month | Growth starts at "slow" tier — intentional early pressure |
| Energy surplus (1 Gen) | +5/month (6 prod - 1 housing consumption) | Thin margin — one Industrial puts you at +2, two puts you negative. Good tension |
| First Industrial break-even | Needs ~33 months of alloy production (133 alloys) to recoup 200m cost via VP | Long payback, but correct since alloys should feel like an investment |
| First Research district | 200m + 20e, ~38 months to T1 completion | Heavy opportunity cost vs. economic districts. Creates genuine fork |

**Verdict:** Economy pacing is solid for the first 3-5 minutes. The opening build order has real trade-offs. The problem is that after the opener resolves, the player enters coast mode.

#### District Balance

All basic districts (100m) are well-balanced against each other. The advanced districts (200m) are appropriately premium. Key observations:

- **Housing is undervalued**: 5 housing for 100m. With base 10 housing and 8 starting pops, players have room for 2 pops before needing housing. By the time housing pressure hits, they often have other priorities. Housing should feel more urgent. Consider reducing base capital housing from 10 to 8 — this means housing pressure starts earlier and creates more tension.
- **Agriculture is overbuilt**: Starting with 2 Agri (+12 food) for 8 pops (consume 8) = +4 surplus. Players rarely need a 3rd Agri until pop 18+. Food is too comfortable early. Consider reducing starting Agri to 1 and increasing starting pops to 6 — this creates immediate food pressure.
- **Industrial's only purpose is VP banking**: At 4 alloys/month, it takes 50 months (8.3 min) to accumulate 200 alloys — the colony ship cost. This is actually well-paced for a 20-minute match IF colony ships exist. Without them, Industrial is just a VP trickle.

**Specific number tweak:** Reduce base capital housing from 10 to 8. This creates earlier housing pressure (pop 8 hits cap immediately), forces an earlier Housing district build, and makes the opening build order less formulaic. Trade-off: Generator → Mining → Agriculture → Housing becomes a genuine 4-way decision instead of the current solved opener.

#### Tech Pacing

| Scenario | T1 Completion | T2 Completion |
|----------|--------------|--------------|
| 1 Research district (4/month per type) | ~38 months (6.3 min) | ~125 months (20.8 min) |
| 2 Research districts (8/month per type) | ~19 months (3.2 min) | ~63 months (10.4 min) |
| 3 Research districts (12/month per type) | ~13 months (2.1 min) | ~42 months (7.0 min) |

**Verdict:** T1 is achievable in every game with even 1 Research district. T2 requires dedicated research investment (2+ districts). This creates a genuine strategic fork: invest in research for late-game multipliers, or invest in economy/expansion for immediate VP. The pacing is good.

**Note:** The proposed T2 cost increase to 750 (R18 task) would make T2 unreachable without 3 Research districts in a 20-minute match. This seems too harsh. Keep T2 at 500.

#### Game Length

20-minute matches with current systems:
- ~12 months of active decision-making (opening build rush)
- ~108 months of passive optimization (watch numbers grow)
- Typical end state: 12-14 districts, 15-20 pops, 2-3 techs, 60-100 VP

The dead time problem is severe. Colony ships would create a second wave of decisions around minute 5-8 (when you've accumulated enough alloys). Game speed controls would let players fast-forward through the dead periods.

---

### 6. Content Wishlist — "Wouldn't It Be Cool If..."

1. **Galactic Tides:** Instead of a static galaxy, systems slowly shift position over the match (1% drift per minute along random vectors). Hyperlanes stretch and eventually break if systems drift too far apart, and new connections form when systems drift close. This creates a living topology — trade routes shift, borders reorganize, chokepoints appear and disappear. Players must adapt their expansion strategy to a changing map. No game does this. It would be technically simple (adjust positions each month tick) and visually stunning (watching the galaxy breathe).

2. **Colony Ship Piracy:** When a colony ship is in transit along a hyperlane, other players within 1 hop can see it as a blip on their galaxy map. If a player sends a fleet to the same hyperlane, they can intercept and capture the colony ship (converting it to their own). This creates high-stakes moments around expansion — do you send an escort? Do you take the longer but safer route? It makes the galaxy feel dangerous without a full combat system. Inspired by submarine warfare in WW2 strategy games.

3. **The Great Filter Event:** At a random point in the mid-game (month 40-60), one random planet type becomes uninhabitable galaxy-wide. All colonies on that type get a 10-month evacuation warning — they can relocate pops at 1 pop/month to other colonies via resource spend, or lose them. This creates a mid-game crisis that forces reactive play and punishes mono-planet-type strategies. Inspired by Stellaris crisis events but more intimate and less military.

4. **Resonance Districts:** A special 7th district type that copies the output of its most common neighbor type. Place it next to 2 Mining districts and it mines. Place it next to 2 Research districts and it researches. It's expensive (300 minerals, 50 energy) and takes longer to build (600 ticks), but it rewards district clustering and spatial planning. Combined with adjacency bonuses, this creates a genuine colony layout puzzle.

5. **Galactic Leaderboard Moments:** At month 30, 60, and 90, the game announces the current leader in each category: "Most Populous Empire: Player A (23 pops)", "Richest Empire: Player B (450 minerals)", "Most Advanced: Player C (3 techs)". Leaders get a small VP bonus (+5) for each title held at announcement. This creates mid-game competitive moments and gives players something to race toward besides the final score.

---

### 7. Summary

**Overall Score: 4.2/10** — unchanged. The build discount fix was correctness, not gameplay.

**Top 3 recommendations:**
1. Game speed controls — unlock comfortable play and playtesting
2. Colony ships (moved up from #5) — the watershed that bridges colony and galaxy
3. Planet type bonuses — strategic variety with minimal effort

**Most urgent balance fix:** Reduce base capital housing from 10 to 8 to create earlier housing pressure and diversify the opening build order.

**Big idea:** Galactic Tides — a slowly drifting galaxy where hyperlane topology evolves during the match, creating a living strategic landscape no other 4X game has.

**New work items added to design.md:** 2 (housing balance tweak, revised priority order R21)

---

