# ColonyGame — Game Design Review

*Living document — newest reviews first.*

---

## Review #24 — 2026-03-12 — Where Are the Planets?

**Reviewer:** Game Design Analyst (automated)
**Build State:** 41/136 tasks complete (30%). Isometric colony, galaxy map, planet bonuses, game speed controls, mini tech tree, VP scoring, energy deficit, event toasts. 344 tests passing. ~9,500 lines.
**Focus:** User asked: "Where is the link from galaxy map to planets? I see our colony and galaxy map but no planet representation."

---

### 1. The Diagnosis

The user identified the most critical UX gap in the game: **planets exist as data but have zero visual presence**. Here's the full picture:

**What exists:**
- Galaxy map: 3D star spheres, hyperlanes, ownership rings, click-to-select, hover labels
- System panel: when you click a star, a right-side panel shows star type, planet TABLE (orbit#, type, size, habitability%, bonus), and "View Colony" button if you own a colony there
- Colony view: isometric grid of district tiles on a single planet — but the planet itself is invisible. No sphere, no terrain, no atmosphere
- `system-view.js` is referenced in CLAUDE.md architecture but **does not exist**. There is no orbital system view

**What's missing — the "planet gap":**
1. **No system view** — clicking a star should zoom into the system showing the star and planets on orbital rings. Instead you get a flat HTML table. The architecture promised an orbital view but it was never built
2. **No planet rendering anywhere** — planets are rows in a table. No 3D spheres, no colors, no visual identity. The user correctly noticed this
3. **No visual bridge from galaxy → system → colony** — the navigation is galaxy star → HTML panel → "View Colony" button → colony grid. The middle layer (system with orbiting planets) doesn't exist
4. **Colony view has no planet context** — you see a district grid floating in space. No planet sphere underneath, no horizon, no sky color matching planet type. Continental and Arctic colonies look identical except for the panel text

### 2. Pillar Scores

| Pillar | Score | Trend | Notes |
|--------|-------|-------|-------|
| Strategic Depth | 3/10 | → | Planet bonuses added but single-colony limit negates them |
| Pacing & Tension | 5/10 | → | Speed controls are good. No new tension sources |
| Economy & Production | 7/10 | → | Planet bonuses are a nice addition. Still one-colony |
| Exploration & Discovery | 2/10 | → | Galaxy is a museum. Planets are a spreadsheet |
| Multiplayer Fairness | 5/10 | → | No change |

**Overall Score: 4.4/10** (unchanged — planet bonuses are invisible without expansion)

### 3. Top 5 Things a Playtester Would Notice

1. **"I clicked a star and got a table instead of planets."** The galaxy map promises exploration. The system panel delivers a spreadsheet. There's no visual payoff for discovering a system.

2. **"My colony is floating in a void."** The isometric grid has no planet underneath it. No sphere, no terrain color, no atmosphere. Desert and Ocean colonies are visually identical.

3. **"I can't expand."** Colony ships don't exist yet. Planet bonuses were just added but you can only ever play on your starting planet. The galaxy is decoration.

4. **"Where do I go from the galaxy map?"** The navigation flow is broken. Galaxy → click star → HTML panel. The system view (orbital rings with clickable planets) that every space 4X has is entirely absent.

5. **"All planets look the same."** Even in the system panel table, planets are just text rows. No color coding, no visual weight for habitability, no reason to get excited about finding a good planet.

### 4. Recommendations

### 4.1 System Orbital View — The Missing Middle Layer

**Impact:** High
**Effort:** High
**Category:** Core Mechanic / UX

**The problem:** The architecture defines three views (colony, galaxy, system) but only two exist. Clicking a star in the galaxy map shows an HTML table. There's no 3D orbital view of a system's planets.

**The fix:** Build `system-view.js` as the bridge between galaxy and colony. When a star is clicked in galaxy view, transition into a system view showing:
- Central star (large emissive sphere, colored by star type)
- Planets on orbital rings (concentric circles), each as a colored sphere sized by planet.size
- Planet type determines color/material (Continental=green/blue, Ocean=deep blue, Arctic=white, Desert=tan, etc.)
- Click planet to see details panel (type, size, habitability, bonus). If colonized, "View Colony" button
- Camera: top-down or slight angle, centered on star, zoom-scrollable

**Why it matters:** This is the "wow" moment of exploration. Finding a size-20 Continental planet in a distant system should feel like discovery, not like reading a database row. Every space 4X from Master of Orion to Stellaris has this view. It's where the galaxy comes alive.

**Design details:**
- Navigation flow becomes: Galaxy (G key) → click star → System view → click planet → Colony view (if colonized)
- Back button or Escape returns to galaxy
- Planets orbit slowly for visual interest (cosmetic only, no gameplay)
- Habitable planets get a subtle glow or atmosphere ring
- Gas giants are noticeably larger (2-3x radius)
- Stellaris reference: system view is where you order surveys, colonizations, and see fleets

### 4.2 Colony Planet Context — Give the Colony a World

**Impact:** Medium
**Effort:** Low
**Category:** Visual Polish / UX

**The problem:** The colony isometric grid floats in a void. There's no visual indication that you're on a planet. Desert and Ocean colonies are indistinguishable.

**The fix:** Add planet-type visual context to the colony view:
- Ground plane color matches planet type (Desert=sandy tan, Ocean=blue-gray, Arctic=white, etc.)
- Distant horizon glow matching atmosphere color (use a gradient quad behind the grid)
- Sky/background color shifts slightly by planet type instead of uniform #0a0a1a
- Colony panel already shows planet type text — make the 3D scene match it

**Why it matters:** Players spend most of their time in colony view. Making each colony feel like a unique world creates attachment and makes planet type bonuses feel tangible. "My Arctic Research world" vs "My Desert Mining colony" should look different, not just produce different numbers.

**Design details:**
- Continental: green-brown ground, blue-white atmosphere glow
- Ocean: blue-gray ground, deep blue atmosphere
- Arctic: white ground with blue tint, pale atmosphere
- Desert: tan-orange ground, hazy amber atmosphere
- Tropical: dark green ground, humid green-yellow atmosphere
- Arid: brown-red ground, dusty orange atmosphere
- Use MeshStandardMaterial color on existing ground plane + a background hemisphere or gradient

### 4.3 Planet Color Coding in System Panel (Quick Win)

**Impact:** Medium
**Effort:** Very Low
**Category:** UX

**The problem:** The system panel planet table treats all planets as equal text rows. A size-20 Continental is visually identical to a size-8 Barren.

**The fix:** Color-code planet rows in the existing HTML system panel:
- Planet type name colored by type (Continental=green, Ocean=blue, Desert=tan, etc.)
- Habitability column: green for 80%+, yellow for 60%, gray for 0%
- Size column: bold for 15+, red for 8-10
- Add a small colored circle/dot before the planet type name
- Highlight "best" planet in system (highest hab*size) with subtle gold border

**Why it matters:** Until the full system view exists, the HTML panel IS the planet experience. Making it visually scannable lets players quickly evaluate systems. "That system has a green dot — it has a habitable world!" This is already partially done (habClass CSS) but needs more visual weight.

### 4.4 Colony Ships — The Actual Fix

**Impact:** Critical
**Effort:** High
**Category:** Core Mechanic

**The problem:** Planet bonuses, planet types, system exploration — none of it matters when you can never leave your starting system. The galaxy is a museum exhibit. Planets are trivia.

**The fix:** This is already the #2 priority in the R23 build order. Colony ships transform the galaxy from decoration into gameplay. Once players can expand, every other planet-related feature compounds: system view becomes a colonization decision screen, planet bonuses become colony specialization strategy, fog of war creates exploration tension.

**Why it matters:** Colony ships are the keystone. Without them, the galaxy map is a screensaver and planet data is flavor text. With them, every system becomes a strategic question: "Is that Ocean world worth sending a colony ship 3 hops through unknown space?"

### 4.5 Double-Click Star to Enter System View

**Impact:** Medium
**Effort:** Low (once system view exists)
**Category:** UX

**The problem:** The current flow is click star → read HTML table. There's no spatial "entering" a system.

**The fix:** Single-click star shows the quick info panel (existing behavior). Double-click or Enter key transitions into the system orbital view. This mirrors Stellaris's galaxy-to-system zoom. Add a "View System" button to the existing system panel as an alternative entry point.

**Why it matters:** The two-level drill-down (galaxy → system → colony) is the standard 4X navigation pattern. Players expect to "zoom in" to systems. The current flat panel breaks spatial mental models.

### 5. Balance Snapshot

No balance changes needed — the user's question is about visualization and navigation, not numbers. Planet bonuses are well-tuned for when expansion becomes available.

Key observation: planet bonus values were designed for multi-colony play (+1 food on Continental only matters when you're choosing WHERE to colonize). With single-colony, they're a nice flavor addition but not strategically meaningful. Colony ships are the economic unlock, not a balance change.

### 6. Content Wishlist

1. **Planet anomaly markers in system view** — rare planets with glowing markers indicating special features (ancient ruins, resource deposits). Visible before surveying, incentivizing exploration. "What's that purple glow on the 4th planet?"

2. **Living galaxy background** — nebula clouds, asteroid fields, and cosmic dust rendered as subtle particle effects in the galaxy view. Makes exploration feel like traversing a real universe, not a node graph.

3. **Colony time-lapse on founding** — when a colony ship lands, brief 3-second animation showing the planet sphere, then zooming down to the surface as the first buildings appear. The "founding moment" should feel monumental.

### 7. Build Order Update

The user's question reveals the priority should be:
1. **Colony ships** (already R23 #2) — makes planets matter
2. **System orbital view** (new) — makes planets visible
3. **Colony planet context** (new) — makes colonies feel like worlds
4. **Planet visual polish in system panel** (new) — quick win while building above

---

## Review #23 — 2026-03-12 — The Same Score for the Third Time

**Reviewer:** Game Design Analyst (automated)
**Build State:** 41/136 tasks complete (30%). Isometric colony builder, galaxy map with Three.js, procedural galaxy, mini tech tree (6 techs, 2 tiers), VP scoring with match timer, energy deficit system, event toast HUD, pop growth, demolition with refund, game speed controls (5 speeds + pause). 333 tests passing. ~9,200 lines.

**Key changes since Review #22:** None. Zero new gameplay features. The status report shows the same build state as R22 — game speed controls were the last feature shipped. This review exists because the game hasn't moved in the direction it needs to.

---

### 1. Pillar Scores

| Pillar | Score | Trend | Notes |
|--------|-------|-------|-------|
| Strategic Depth | 3/10 | → | Three consecutive reviews at 3. The solved build order, the cosmetic galaxy, the one-colony limit — all unchanged |
| Pacing & Tension | 5/10 | → | Speed controls helped last time. Nothing new since |
| Economy & Production | 7/10 | → | Still the crown jewel, still the only thing that works. Alloys and influence still dead |
| Exploration & Discovery | 2/10 | → | Still a museum. Three reviews running |
| Multiplayer Fairness | 5/10 | → | Still cooperative solitude |

**Overall Score: 4.4/10** (unchanged from R22)

The score has not moved in three reviews. The recommendations have been the same since R20. The game is stuck in a holding pattern — the foundation works, but no new systems are being added. This review shifts focus: instead of repeating the same recommendations, I'm identifying the *minimum viable 4X loop* — the smallest set of changes that makes this feel like a complete (if small) game.

---

### 2. What a Playtester Would Notice (Top 5)

1. **"This is a city-builder, not a 4X."** The game has exactly one strategic loop: build districts, grow pops, accumulate VP. There's no explore, no expand, no exterminate. Only exploit. A player who's played one match has seen everything the game offers.

2. **"I pressed G and saw the galaxy, then pressed G again and went back to my colony forever."** The galaxy view is architecturally complete — 50 systems, hyperlanes, star types, planet tables, ownership dots — and completely inert. There's nothing to do there. It's the game's most impressive broken promise.

3. **"The opening is solved."** 2 Agri → Generator → Mining → Research → Industrial. Improved Power Plants first. There's exactly one optimal build order. Planet type doesn't differentiate it because planet bonuses aren't implemented.

4. **"Two resources don't do anything."** Alloys bank toward VP but can't be spent. Influence sits at 100 permanently. The resource bar advertises 6 economic dimensions and delivers 4.

5. **"I could be playing against bots and wouldn't know."** No chat, no interaction, no territorial tension. The "multi" in multiplayer is cosmetic.

---

### 3. The Minimum Viable 4X Loop

Previous reviews listed 7-8 ordered recommendations. This review cuts to the bone: **what is the absolute minimum to make this a real 4X game?** Three features, implemented together, transform the experience:

#### MVL-1: Planet Type Bonuses — Break the Solved Opener

**Impact:** High
**Effort:** Low (2-3 hours)
**Category:** Core Mechanic / Balance

**The problem:** Every planet plays identically. The opening build order is solved because there's no input variance.

**The fix:** Already spec'd in R19, R22. Per-type additive bonuses:
- Continental: +1 food/Agri, +1 mineral/Mining
- Ocean: +2 food/Agri
- Tropical: +1 food/Agri, +1 energy/Generator
- Arctic: +2 research (per type)/Research
- Desert: +2 mineral/Mining
- Arid: +1 energy/Generator, +1 alloy/Industrial

**Why it matters now:** This is the single lowest-effort change that affects gameplay. Starting on a Desert vs. Ocean world should change your first three builds. Even without colony ships, this adds replayability — your starting planet type becomes the first strategic variable.

**Design details:**
- `PLANET_BONUSES` lookup in game-engine.js
- Apply in `_calcProduction` after tech modifiers
- Show bonus in colony panel: "Desert World: +2 Mining per Mining district"
- Starting colonies are assigned to best habitable planet, which is usually Continental — but galaxy generation occasionally places players on other types

#### MVL-2: Colony Ships — The Bridge

**Impact:** Critical
**Effort:** Medium (6-8 hours)
**Category:** Core Mechanic

**The problem:** One colony = one game. The galaxy exists but can't be used. The entire Phase 3, 4, 5, 6, and 7 roadmap depends on multi-colony gameplay existing first.

**The fix:** Already spec'd in R18-8, R22-1. Colony ship from build queue: 200 minerals, 100 food, 100 alloys, 600 ticks. Moves along hyperlanes at 50 ticks/hop. Consumed on arrival: new colony with 2 pops on target planet. Max 5 colonies. Shared resource pool (Stellaris model).

**Critical implementation sequence:**
1. `buildColonyShip` in build queue (reuses existing queue system)
2. Colony ship state tracking: `playerState.colonyShips[]` with movement processing in tick loop
3. `sendColonyShip` command: validates target is habitable, within 2 hops, uncolonized
4. Colony founding on arrival: reuses `_createColony`
5. Galaxy view: render colony ships as diamond markers on hyperlanes
6. Colony list sidebar + keyboard shortcuts (1-5)

**First expansion pacing (at 1x speed):**
- Month 0-5: Opening build rush (2-3 min)
- Month 5-25: Economy optimization + alloy accumulation (~3 min)
- Month 25-40: Colony ship construction (60 sec build) + transit (~3 hops = 15 sec)
- Month 40+: Managing two colonies, choosing third target

#### MVL-3: Fog of War — Mystery and Motivation

**Impact:** High
**Effort:** Low (client-only, 2-3 hours)
**Category:** Core Mechanic

**The problem:** Complete information removes the "explore" from 4X. Every system is fully visible. When colony ships arrive, there's no discovery in choosing a destination.

**The fix:** Already spec'd in R17-4, R22-3. Client-side BFS from owned systems:
- **Known** (within 2 hops of owned/outposted systems): full color, name, planet details
- **Unknown**: dim gray dot (opacity 0.2), no name, no planet data, dashed hyperlanes
- Starting system + neighbors always known
- Other players' colonies visible as colored dots (no planet details)

**Why ship alongside colony ships:** Fog + colony ships creates the core exploration loop: "I can see dim stars beyond my borders. I need to expand to see what's there. That might have the Desert world I need for minerals." Without fog, colony ship destination choice is a spreadsheet exercise (compare all visible planets). With fog, it's an adventure.

---

### 4. Complementary Recommendations (after MVL)

#### R23-4: Housing Pressure — Diversify the Opener

**Impact:** Medium
**Effort:** Trivial (one number change)
**Category:** Balance

Reduce base capital housing from 10 to 8. With 8 starting pops hitting the cap immediately, players must choose: Housing first (unlock growth) or economic district first (build income). Combined with planet bonuses, this means a Desert world player might build Mining first (exploiting bonus), while an Ocean world player builds Agri first (exploiting bonus), but both need Housing soon. The opener becomes a 3-way decision tree instead of a script.

#### R23-5: T3 Techs — Late-Game Strategic Fork

**Impact:** Medium
**Effort:** Low (3 new TECH_TREE entries + effect handlers)
**Category:** Content / Balance

Add 3 Tier 3 techs at cost 1000:
- Physics T3: Fusion Reactors — +100% Generator output, generators also produce +1 alloy/month
- Society T3: Genetic Engineering — +100% Agriculture output, pop growth time halved
- Engineering T3: Automated Mining — +100% Mining output, mining districts cost 0 jobs

These are transformative effects that create a true "tech rush" strategy. At 1000 cost with 2 Research districts (8/month per type), T3 takes ~125 months — achievable only with dedicated research investment. Creates the classic 4X tension: expand (colony ships) vs. tech up (T3 power spike).

#### R23-6: In-Game Chat — Multiplayer Baseline

**Impact:** Medium
**Effort:** Low (infrastructure exists)
**Category:** UX / Multiplayer

Collapsible chat at bottom-left during gameplay. Reuse existing WebSocket chat system. Player names in player colors. Enter to focus, Escape to blur. This is the minimum viable multiplayer interaction feature.

#### R23-7: Surface Anomalies — Colony Spatial Puzzle

**Impact:** Medium
**Effort:** Medium
**Category:** Content / Core Mechanic

1-3 randomly placed tile anomalies per colony:
- "Mineral Vein": +50% Mining output on this tile
- "Thermal Vent": +50% Generator output on this tile
- "Fertile Soil": +50% Agriculture output on this tile
- "Ancient Ruins": choice — excavate (+500 research) or preserve (+2 influence/month)
- "Alien Artifact": choice — +200 alloys or +300 research

Makes district placement a spatial puzzle, not an arbitrary click. Each colony becomes unique.

---

### 5. Balance Snapshot

#### Resource Flow (unchanged — no new features)

| Metric | Value | Assessment |
|--------|-------|------------|
| Starting minerals | 300 | 3 basic districts immediately |
| Starting energy | 100 | 16+ months buffer |
| Mining income | +6/month | District every ~17s — OK |
| Food surplus (2 Agri, 8 pops) | +4/month | Slow growth tier |
| Energy margin (1 Gen) | +5/month | Thin — good tension |

#### Colony Ship Economics (projected, unchanged from R22)

| Metric | Value |
|--------|-------|
| Colony ship cost | 200 minerals + 100 food + 100 alloys |
| 100 alloys at 4/month | ~25 months = 25 sec at 1x |
| First colony ship | ~month 40-50 (~7-8 min at 1x) |
| Travel time (3 hops avg) | 150 ticks = 15 sec |
| New colony start | 2 pops, 50% build discount on first 3 districts |

#### Planet Bonus Impact (projected)

Desert starting world with 1 Mining district: 6 + 2 = 8 minerals/month (33% boost). Arctic with 1 Research district: 4 + 2 = 6 per type (50% boost). These are significant enough to shape the opening but not so large that they eliminate other considerations.

#### Recommended Number Tweaks

1. **Base capital housing: 10 → 8** — creates immediate housing pressure
2. **Starting alloys: 50 → 0** — alloys should be earned, not given (no sink exists yet)
3. **Starting influence: 100 → 50** — preserve budget for future edicts, reduce the "dead resource" feeling by showing a smaller number
4. **Colony ship alloy cost: playtest at both 100 and 80** — if first expansion is too late in 20-min matches, reduce to 80

---

### 6. Content Wishlist — "Wouldn't It Be Cool If..."

1. **Cascading Colony Events:** When one colony triggers a crisis event, nearby colonies (within 2 hops) get a related event. A "Plague" on Colony A spreads to Colony B as "Quarantine Warning" (pay 20 food to prevent, or risk 30% chance of plague spreading). Creates inter-colony narrative connections — your empire isn't isolated dots, it's a connected network where problems propagate. Inspired by Plague Inc's spread mechanics applied to colony management.

2. **Galaxy Archaeology Breadcrumb Trail:** First survey of any system has a 15% chance of finding a "Precursor Fragment." Collecting 5 fragments reveals the location of a hidden Precursor system (not on the normal map) containing a size-25 planet with all planet bonuses active. Race to collect fragments before opponents. Creates a shared exploration goal and a reason to survey aggressively. Inspired by Stellaris precursor chains but competitive.

3. **Colony Resonance Grid:** A 7th district type — "Resonance Array" (300 minerals, 50 energy, 600 ticks). Copies the output of whatever district type is most common among its grid neighbors. Place it next to 2 Mining districts and it mines. Rewards spatial planning and district clustering. Unique to ColonyGame's grid system — no other 4X has this because no other 4X has a spatial colony grid.

4. **Empire Heartbeat Visualization:** In galaxy view, owned systems pulse with a subtle "heartbeat" glow whose frequency matches their colony's growth rate. Fast-growing colonies pulse quickly (green), stagnant ones pulse slowly (amber), starving ones flash red. Creates an at-a-glance empire health dashboard through pure visual design, no UI panels needed. Makes the galaxy view feel alive rather than static.

5. **Tidal Lock Worlds:** A new planet type — "Tidally Locked" (habitability 50%). One side is permanent day (Generators produce 2x), other side is permanent night (Research districts produce 2x). Districts are randomly assigned to day or night side when built. Creates a gambling mechanic in colony building — will your Industrial district land on the useful side? Players can demolish and rebuild to reroll, but at cost. Unique, thematic, and mechanically interesting.

---

### 7. Summary

**Overall Score: 4.4/10** — unchanged for the third consecutive review.

**Top 3 recommendations:**
1. Planet type bonuses — break the solved opener (lowest effort, immediate impact)
2. Colony ships + colony list UI — the bridge between colony and galaxy
3. Fog of war — turn exploration from spreadsheet to adventure

**Most urgent balance fix:** Reduce base capital housing from 10 to 8 — diversifies the currently scripted opening.

**Big idea:** Cascading Colony Events — crises that propagate along hyperlanes between your colonies, turning your empire into a living network where problems spread and must be contained.

**New work items added to design.md:** 5 (MVL implementation sequence, colony ship validation tightening, fog of war BFS spec, housing balance change, T3 tech entries)

---

## Review #22 — 2026-03-12 — Still Waiting for Liftoff

**Reviewer:** Game Design Analyst (automated)
**Build State:** 41/133 tasks complete (31%). Isometric colony builder, galaxy map with Three.js, procedural galaxy, mini tech tree (6 techs, 2 tiers), VP scoring with match timer, energy deficit system, event toast HUD, pop growth, demolition with refund, game speed controls (5 speeds + pause). 333 tests passing. ~9,200 lines.

**Key changes since Review #21:** Game speed controls (5 speeds 0.5x–5x with pause, keyboard shortcuts +/-/Space, host-only in multiplayer). This was R21's top recommendation — it shipped. No new gameplay systems beyond that.

---

### 1. Pillar Scores

| Pillar | Score | Trend | Notes |
|--------|-------|-------|-------|
| Strategic Depth | 3/10 | → | Unchanged. One colony, one optimal build path. Galaxy is scenery. Speed controls don't add decisions — they compress the wait between them |
| Pacing & Tension | 5/10 | ↑ | Speed controls are a meaningful improvement. Players can now fast-forward dead air (minutes 5-20) and pause to think. The game *feels* better even though the decision density hasn't changed. Bumped from 4 |
| Economy & Production | 7/10 | → | Still the strongest pillar. District trade-offs, housing pressure, energy crisis, pop-job chain all work. Alloys and influence remain dead resources. No change |
| Exploration & Discovery | 2/10 | → | Galaxy is still a museum. No fog, no ships, no surveying, no agency. Speed controls don't help — you can fast-forward through nothing faster |
| Multiplayer Fairness | 5/10 | → | Speed controls add host-only enforcement (good design for multiplayer). But still zero player interaction during gameplay |

**Overall Score: 4.4/10** (up from 4.2 — speed controls earned +0.2 via pacing)

Speed controls were the right call and they shipped fast. But the fundamental problem remains: the game has one colony, one galaxy you can't touch, and one optimal build path. Every review since R17 has identified colony ships as the watershed. It's time.

---

### 2. What a Playtester Would Notice (Top 5)

1. **"I can fast-forward, but fast-forward through what?"** Speed controls exposed the dead-time problem more starkly. At 5x, the gap between meaningful decisions shrinks from 30 seconds to 6 seconds — but it's still dead time. The game needs more decisions, not just faster transitions between them.

2. **"The galaxy is gorgeous and pointless."** This remains the #1 frustration. The galaxy map is the game's visual centerpiece — 50 star systems with hyperlanes, star types, planet tables — and none of it matters. Pressing G to toggle views feels like switching between a game and a screensaver.

3. **"I solved the build order."** 2 Agri → Generator → Mining → Research → Industrial. Improved Power Plants first. This is optimal every game on every planet type because planet types don't do anything mechanically. The opening is a script, not a puzzle.

4. **"Two of my resources are decorations."** Alloys accumulate toward VP with no active use. Influence sits at 100 forever. The resource bar promises 6 dimensions of economy and delivers 4.

5. **"Is anyone else even playing?"** In multiplayer, the only evidence of other players is colored dots on the galaxy map and VP numbers on the scoreboard. No chat, no interaction, no territorial tension. Multiplayer is cooperative solitude.

---

### 3. Recommendations

#### R22-1: Colony Ships — Stop Waiting, Start Expanding

**Impact:** Critical (transforms the entire game)
**Effort:** Medium
**Category:** Core Mechanic

**The problem:** The game is called ColonyGame but has one colony. The galaxy, hyperlanes, planet diversity, starting positions — all exist for multi-colony play that doesn't. The economy runs dry at minute 3. Speed controls just compress the emptiness.

**The fix:** Already specified (R18-8). Colony ship from build queue: 200 minerals, 100 food, 100 alloys. Moves along hyperlanes at 50 ticks/hop. Consumed on arrival: new colony with 2 pops. Max 5 colonies. Colony list sidebar when 2+ colonies exist.

**Why it matters:** This is the single feature that converts the game from city-builder to 4X. It gives alloys a purpose (200 alloy cost = major investment). It makes the galaxy actionable. It creates the core 4X tension: expand early (weaken home colony) vs. optimize first (risk falling behind). Would move Strategic Depth from 3 to 5 and Exploration from 2 to 4. Every other recommendation in this review compounds with colony ships — planet bonuses matter more when you choose where to settle, fog of war matters more when you're navigating toward a target.

**Design details:**
- Colony ship should be buildable from the existing build queue (no shipyard prerequisite) — this keeps the barrier minimal
- 200 alloys means ~50 months of a single Industrial district. At 1x speed, that's ~8 minutes. First colony ship arrives around minute 10 in a 20-minute match — good pacing
- New colonies start with 2 pops, no pre-built districts, but get the first-3-districts 50% build discount
- Colony list sidebar: clickable list on left side, shows colony name + pop count + key status icon (growth/starvation/construction)
- Multi-colony resource pooling: all colonies share the same resource stockpile (Stellaris model), but each colony has its own build queue

#### R22-2: Planet Type Signature Bonuses — Make Geography Matter

**Impact:** High (strategic variety)
**Effort:** Low
**Category:** Core Mechanic / Balance

**The problem:** Continental, Ocean, Arctic, Desert — the labels are flavor text. All planets play identically. The planet generation system creates rich variety that's mechanically invisible.

**The fix:** Already specified. Per-planet-type bonuses to specific district outputs:
- Continental: +1 food/Agri, +1 mineral/Mining (balanced generalist)
- Ocean: +2 food/Agri (food specialist)
- Tropical: +1 food/Agri, +1 energy/Generator (warm climate = growth + power)
- Arctic: +2 research/Research (harsh environment = scientific focus, a la Antarctica bases)
- Desert: +2 mineral/Mining (rich mineral deposits, think Arrakis)
- Arid: +1 energy/Generator, +1 alloy/Industrial (efficient manufacturing)

**Why it matters:** Even before colony ships, this changes how players read the galaxy map. "That Arctic world would be a research powerhouse" creates aspirational planning. When colony ships land, planet bonuses become the #1 driver of expansion decisions — do you grab the nearby Arid world for alloys, or push further for the Arctic research hub? This makes each game's galaxy feel unique.

**Design note:** These bonuses should be visible in the system panel (galaxy view) as bonus tags. Show "+2 Mining" next to Desert planets so players can scout before committing.

#### R22-3: Fog of War — Turn the Atlas Into a Frontier

**Impact:** High (exploration gameplay)
**Effort:** Low (client-only)
**Category:** Core Mechanic

**The problem:** Complete information kills mystery. Every system is fully visible from turn 1. There's no "unknown" in the galaxy — no frontier to push into, no surprise around the corner.

**The fix:** Already specified (R17-4). Three visibility tiers computed client-side:
- **Known** (within 2 hyperlane hops of owned systems): full-color star, name on hover, hyperlanes visible, planet list in system panel
- **Unknown**: dim gray dot (opacity 0.2), no name, no planet details, hyperlanes shown as faded/dashed
- Starting system + direct neighbors always fully visible
- Other players' owned systems always visible as colored dots (but no planet details unless within your known range)

**Why it matters:** Fog of war is the cheapest way to transform the galaxy from a solved map into a frontier. Combined with colony ships, it creates the classic 4X "push into the unknown" — you know there are systems beyond your borders but don't know if they hold that Desert mining world you need. Client-only implementation means zero server cost.

#### R22-4: In-Game Chat — Give Multiplayer a Voice

**Impact:** Medium (social gameplay)
**Effort:** Low (infrastructure exists)
**Category:** UX / Multiplayer

**The problem:** Players in a match cannot communicate. Lobby chat vanishes on game start. Multiplayer without communication is just synchronized single-player.

**The fix:** Collapsible chat overlay at bottom-left of game screen. Reuse existing WebSocket chat infrastructure (already handles `chat` messages). Player names colored by player color. Toggle with Enter key or click. Minimize to just an unread-message indicator.

**Why it matters:** Even without formal diplomacy, chat enables emergent social dynamics: "Stay away from Kepler-7" / "Want to coordinate research?" / "GG". It's the minimum viable multiplayer feature. Chat also creates awareness of other players — seeing messages reminds you this isn't single-player.

#### R22-5: Colony Switcher & Multi-Colony UI — Support Expansion

**Impact:** High (required for colony ships to work)
**Effort:** Medium
**Category:** UX

**The problem:** The UI assumes one colony. Colony ships create 2-5 colonies. Without a colony switcher, players can't manage their empire.

**The fix:**
- Left sidebar colony list (appears when 2+ colonies): colony name, pop count, status icon (growth/building/starvation/idle)
- Click colony to switch the colony view to that colony
- Resource bar already shows pooled resources (correct for multi-colony)
- Colony panel title shows current colony name
- Keyboard shortcut: 1-5 to switch between colonies
- Status bar shows "Colony 2/3" indicator

**Why it matters:** This is the required companion to colony ships. Without it, colony ships are unshippable. Build this alongside or immediately after colony ships.

#### R22-6: Alloy Sink — Military Outpost (Pre-Fleet Territorial Marker)

**Impact:** Medium (fixes dead resource, adds spatial strategy)
**Effort:** Low-Medium
**Category:** Core Mechanic

**The problem:** Alloys accumulate with no active use. They passively convert to VP but the player never *spends* them on anything meaningful. This makes Industrial districts feel pointless to build.

**The fix:** Before full fleet/combat: add a "Military Outpost" buildable at owned systems for 100 alloys. Outposts claim the system (prevents other players from colonizing planets there), provide +1 influence/month, and extend fog-of-war visibility by 1 additional hop. Max 3 outposts per player. Build via galaxy map: click owned system → "Build Outpost" button.

**Why it matters:** Outposts create a lightweight territorial game without requiring combat. They give alloys a purpose (100 alloys = ~25 months of Industrial production = meaningful cost). They make influence dynamic (income from outposts). They extend vision (strategic advantage from fog of war). They create territorial tension in multiplayer ("they built an outpost near my border"). All of this without implementing ships, fleets, or combat. Think of it as Stellaris starbases without the military component.

**Design details:**
- Cost: 100 alloys (significant but not prohibitive)
- Build time: 200 ticks (20 sec at 1x)
- Effect: Claims system, +1 influence/month, +1 fog-of-war hop range
- Limitation: Only in systems within 2 hops of an owned system (must be "known")
- Destruction: If another player colonizes a planet in the system, outpost ownership transfers (colonization > claim)
- VP: +3 VP per outpost (incentivizes territorial play)

#### R22-7: Surface Anomalies — Colony-Level Discovery

**Impact:** Medium (replayability, spatial puzzle)
**Effort:** Medium
**Category:** Content / Core Mechanic

**The problem:** Every colony grid is identical — 16 empty slots. There's no reason to care about *which* tile you build on. District placement is arbitrary.

**The fix:** Already specified in roadmap. When founding a colony, place 1-3 tile anomalies randomly:
- "Mineral Vein": +50% output to Mining district built on this tile
- "Thermal Vent": +50% output to Generator on this tile
- "Fertile Soil": +50% output to Agriculture on this tile
- "Ancient Ruins": one-time choice: excavate (+500 research) or preserve (+2 influence/month)
- "Alien Artifact": one-time choice: +200 alloys or +300 research

**Why it matters:** Anomalies make each colony a unique spatial puzzle. "Do I build Mining on the Mineral Vein tile, or do I need a Generator there for energy?" Combined with planet bonuses, this creates genuine colony specialization. Each planet becomes a unique strategic problem rather than a blank canvas.

#### R22-8: T3 Tech Expansion — Late-Game Power Spike

**Impact:** Medium (strategic depth, late-game goals)
**Effort:** Low
**Category:** Content / Balance

**The problem:** The tech tree has 6 techs across 2 tiers. A player with 2 Research districts finishes everything by minute 10. After that, research points accumulate with no purpose — another dead resource.

**The fix:** Already specified (R17-5). Add 3 Tier 3 techs:
- Physics T3: Fusion Reactors (+100% Generator output + generators produce +1 alloy/month, cost 1000)
- Society T3: Genetic Engineering (+100% Agriculture + pop growth time halved, cost 1000)
- Engineering T3: Automated Mining (+100% Mining + mining districts cost 0 jobs, cost 1000)

**Why it matters:** T3 at 1000 cost with 2 Research districts takes ~125 months (~20 min). This is unreachable without heavy research investment, making "tech rush" a distinct strategy. T3 effects are transformative — Fusion Reactors makes generators produce alloys, Automated Mining frees pops from mining jobs. These create genuine strategic divergence in the late game.

---

### 4. Revised Priority Order

The R21 order put colony ships at #3. I'm moving them to #1. Speed controls shipped. The game needs agency, not more polish.

1. **Colony ships + colony list UI** — the watershed. Ship them together as one unit of work.
2. **Planet type bonuses** — makes colony ship destination choices meaningful
3. **Fog of war** — now layered on expansion, creates frontier
4. **In-game chat** — multiplayer pulse
5. **Military outposts** — alloy sink, territorial game
6. **Surface anomalies** — colony-level discovery
7. **T3 tech expansion** — late-game strategic depth
8. **Edict system** — influence purpose (deprioritized since outposts now generate influence income)

---

### 5. Balance Snapshot

#### Resource Flow (unchanged from R21 — no economy changes)

| Metric | Value | Assessment |
|--------|-------|------------|
| Starting minerals | 300 | 3 basic districts immediately — good |
| Starting energy | 100 | 16+ months buffer — comfortable |
| Mineral income (1 Mining) | +6/month | 100m district every ~17s — slightly slow but OK |
| Food surplus (2 Agri, 8 pops) | +4/month | Slow growth tier — intentional |
| Energy margin (1 Gen) | +5/month | Thin — one Industrial = +2. Good tension |

#### Colony Ship Economics (projected)

| Metric | Value |
|--------|-------|
| Colony ship cost | 200 minerals + 100 food + 100 alloys |
| Time to accumulate 100 alloys (1 Industrial) | ~25 months = 250 ticks = 25 sec at 1x |
| Realistic first colony ship | ~month 40-50 (~7-8 min at 1x) |
| Travel time (avg 3 hops) | 150 ticks = 15 sec |
| New colony bootstrapping | 2 pops, no districts, 50% build discount on first 3 |
| Second colony break-even | ~5 minutes after founding (builds 3 districts, grows to 5 pops) |

**Assessment:** Colony ship timing is well-paced for 20-minute matches. First expansion at minute 7-8, colony becomes productive by minute 12-13. Creates a clear early→mid→late arc: opener (0-3 min), accumulate (3-8), expand (8-13), optimize empire (13-20). This is the pacing arc the game desperately needs.

#### Game Length Target

With colony ships, a 20-minute match would look like:
- Minutes 0-3: Opening build rush (active decisions)
- Minutes 3-7: Economy optimization + alloy accumulation (moderate activity, sped up with speed controls)
- Minutes 7-9: Colony ship launch — galaxy map becomes active, destination choice
- Minutes 9-14: Multi-colony management — build second colony, manage two economies
- Minutes 14-18: Optimization sprint — maximize VP across colonies, possible third expansion
- Minutes 18-20: Final countdown tension

This is a dramatically better arc than the current one-phase game.

#### Recommended Number Tweaks

1. **Colony ship alloy cost: 100 → 80 alloys** if playtesting shows first expansion is too late. Reserve 100 for multiplayer balance.
2. **New colony starting pops: 2** (confirmed — low enough to feel like a frontier, high enough to build one district immediately)
3. **Max colonies: 5** (confirmed — enough for strategy, not so many that management becomes tedious)
4. **Outpost cost: 100 alloys** — half a colony ship, creates real choice between expanding vs. claiming

---

### 6. Content Wishlist — "Wouldn't It Be Cool If..."

1. **Supply Lines:** When you have 2+ colonies, draw faint animated lines along hyperlanes between them showing resource flow (energy = yellow particles, minerals = gray, food = green). These are purely cosmetic but create a visual sense of empire — your territory feels connected and alive. If a colony is in deficit, its supply line glows red. Inspired by Anno 1800's trade route visuals.

2. **Colony Personality Events:** Each colony develops a "personality" based on its district composition. A mining-heavy colony generates "Miners' Strike" events (lose 1 Mining output for 5 months or pay 50 energy to settle). A research-heavy colony generates "Breakthrough" events (choose: publish for +200 research, or patent for +50 alloys). 3-4 events per archetype, triggered probabilistically based on district ratios. Makes colonies feel like living communities, not spreadsheets.

3. **Galactic Archaeology:** When surveying systems (future feature), 5% chance to find a "Precursor Signal" pointing to another system. Following the chain (3-5 systems) leads to a Precursor Cache with a unique one-time reward: instant T2 tech, free colony ship, +500 of a random resource, or a unique building blueprint. Creates emergent quest chains across the galaxy. Inspired by Stellaris precursor event chains.

4. **Economic Espionage:** In multiplayer, spend 25 influence to "scan" another player's colony. For 5 months, you see their district composition and resource income (but not stockpiles). This creates information asymmetry decisions: is it worth 25 influence to know if they're militarizing (alloy-heavy) or teching (research-heavy)? Counter: players can see when they've been scanned ("Intelligence Alert: Player X scanned your colony").

5. **Resonance Districts (from R21):** Still a great idea. Special 7th district that copies the output of its most common neighbor type. 300 minerals + 50 energy, 600 ticks. Rewards spatial planning and district clustering. Unique to ColonyGame's grid-based colony system — no other 4X has this.

---

### 7. Summary

**Overall Score: 4.4/10** — up 0.2 from speed controls improving pacing.

**Top 3 recommendations:**
1. Colony ships + colony list UI — the bridge between colony and galaxy
2. Planet type bonuses — make geography strategic
3. Fog of war — turn the atlas into a frontier

**Most urgent balance fix:** Colony ship alloy cost should be playtested at both 100 and 80 to find the sweet spot for first-expansion timing (target: minute 7-8 at 1x speed).

**Big idea:** Supply Lines — cosmetic animated resource flow between colonies along hyperlanes, turning your empire from scattered dots into a visible network.

**New work items added to design.md:** 6 (military outpost system, colony ship priority reorder, outpost VP scoring, influence income from outposts, colony switcher keyboard shortcuts, anomaly bonus visibility in system panel)

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

