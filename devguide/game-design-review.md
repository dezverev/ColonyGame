# ColonyGame — Game Design Review

*Single latest review only. Older reviews are overwritten each run.*

---

## Review #65 — 2026-03-15 — Scouting Race Live, Depth Plateau Approaching

**Build State:** 119/241 tasks (49%). Scout milestones + colony upkeep + diplomacy pings shipped. 2018/2019 tests passing.

### Pillar Scores

| Pillar | Score | Key Issue |
|--------|-------|-----------|
| Strategic Depth | 8/10 | Upkeep + doctrine + variants strong; tech tree homogeneous (9 techs = % bonuses), only 3 buildings |
| Pacing & Tension | 8/10 | Scout milestones fix opening; catalysts + crisis + scarcity cover mid/late; exploration dead by min 8 |
| Economy | 8/10 | Upkeep scaling + ship maintenance + scarcity = real pressure; building layer too thin for late-game |
| Exploration | 6.5/10 | Scout milestones add purpose; auto-chain works; science ships idle after survey, no expeditions |
| Multiplayer Fairness | 8/10 | Underdog + tech catch-up + gifting + fair starts — strongest pillar |
| Diplomacy | 6.5/10 | Stances + gifting + pings + chat functional; no binding agreements, no system claims |

**Overall: 7.5/10** — Opening-to-midgame arc is now solid. #1 gap is the "depth plateau" — colonies, tech, and exploration all flatten out by minute 10. Buildings (3 types), tech (all % bonuses), and diplomacy (no trade pacts) need the next layer.

### Top 5 Playtester Complaints

1. Science ships idle after ~8 min — exploration just stops, no expeditions or follow-up content
2. Tech tree is 9 identical-feeling % bonuses — no game-changing unlocks (no new abilities, no new units)
3. Only 3 buildings — colony management plateaus fast, all colonies feel the same by min 12
4. No trade pacts or system claims — diplomacy is signals without binding economic/territorial mechanics
5. No spatial puzzle on colony grid — district placement is pure type selection, no adjacency or anomalies

### Recommendations (by impact/effort)

**R65-1: Advanced Buildings T2** — High/Medium. Quantum Lab (+8 research, req Research Lab + T2), Advanced Foundry (+8 alloys, req Foundry + T2), Planetary Shield (+50 platform HP, req Shield Gen + T2). Doubles colony depth ceiling.

**R65-2: Trade Agreements** — High/Medium. 25 influence each. Mutual +15% energy/minerals. Breaks on aggression (betrayer -50 influence). Max 2 active. First binding diplomatic mechanic.

**R65-3: Science Ship Expeditions** — High/Medium. At surveyed systems: Deep Probe (600t, +200 resource), Precursor Signal (900t, +500 research, 30% ship loss), Wormhole Scan (600t, shortcut). Fills min 8-20 void.

**R65-4: System Claims** — Medium/Low. 25 influence to claim surveyed system. Prevents enemy colonization. +1 VP per claim. Auto-claim on colonize. First territorial mechanic — influence finally has a meaningful sink.

**R65-5: Tech Unlock Variety** — Medium/Medium. Replace 1 tech per track with capability unlock: Physics T1 "Subspace Sensors" (reveal adjacent unsurveyed systems on galaxy map), Society T1 "Colonial Charter" (+1 building slot all colonies), Engineering T1 "Modular Hulls" (+2 max corvettes). Makes tech path a real strategic choice.

**R65-6: Surface Anomalies** — Medium/Medium. 1-3 per colony. Mineral Vein/Thermal Vent/Fertile Soil: +50% matching district. Ancient Ruins: one-time choice. Adds spatial puzzle.

**R65-7: VP Timeline Graph** — Low/Low. Record VP every 10 months. Render line chart on post-game screen. Emotional payoff for close matches.

### Balance Notes

- Colony upkeep (0/3/8/15/25): 5-colony empire = 51e/mo — well-tuned wide penalty
- Scout milestones (10/15/20 VP): 45 total VP is significant but not decisive — good
- T2 at 500 cost, 12 research/mo: ~42 months (4.2 min) — consider 600 for 20-min matches
- Foundry at 250m, +4 alloys: ROI 63s — competitive with Industrial district
- Ship maintenance 2e+1a/corvette: fleet of 10 = 20e+10a — forces economic tradeoff
- **Fix needed:** T2 tech cost should be 600 (not 500) to push T2 completion to ~min 8 instead of ~min 6

### Content Wishlist

1. Galactic Wonder Race — Dyson Sphere/Library/Ring World, galaxy-wide first-to-build, massive VP
2. Mercenary fleet hire — 200 alloys for temp 3-corvette escort, alloy pressure valve
3. Colony governors — random NPC modifier on founding (+10% mining, -5% growth, etc.)
4. Nebula terrain — systems inside nebulae: +50% research, -25% sensor range
5. Pirate haven system — NPC station that sells mercenaries, buys surplus, creates a "neutral market"
