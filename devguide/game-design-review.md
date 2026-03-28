# ColonyGame — Game Design Review

*Single latest review only. Older reviews are overwritten each run.*

---

## Review #72 — 2026-03-17 — District/Pop Systems Are the Gap

**Build State:** 105/211 tasks (50%). 2419 tests passing. Recent: Colony saturation indicator, scarcity pre-warning, VP timeline graph, construction queue HUD, starting planet variety, destroyer class.

### Pillar Scores

| Pillar | Score | Key Issue |
|--------|-------|-----------|
| Strategic Depth | 6/10 | Meaningful colony decisions, but limited by missing district/pop systems. Tech choices are obvious (no branching). |
| Pacing & Tension | 5/10 | No mid-game crisis hooks yet. Military snowball unchecked. Target 20-40min but no timer enforcement. |
| Economy | 7/10 | Good trade-offs: energy deficits disable districts, scarcity seasons add tension. Alloy is bottleneck. |
| Exploration | 6/10 | Science ships work, anomalies add flavor. Limited system variety, no anomalies in unexplored systems. |
| Multiplayer Fairness | 7/10 | Fairness mode gives identical starts. Underdog catch-up exists. Diplomacy basic but functional. |

**Overall: 6.2/10** — Same as last review. The recent UX improvements (queue HUD, saturation, scarcity warning) fixed player feedback gaps. Core systems remain the gap.

### Top 3 Problems

1. **Missing district/pop systems** — Core 4X loop incomplete. Can't specialize colonies (mining vs research vs agriculture) meaningfully.
2. **No fleet cap or progression** — Only 2 ship classes (corvette, destroyer). No reason to expand beyond 5 colonies.
3. **Tiny tech tree** — 9 techs total (3/tier), no branching choices. Research feels like a chore, not strategy.

### Recommendations

**R72-1: District System** — High/High. 6 types, max = planet size, 300-tick build. Already in Phase 2 design. Creates colony specialization.

**R72-2: Starbase Upgrades (Alloy Sink)** — Med/Low. 150 alloys, +5 defense repair +5 VP. Current: alloys pile up with no use. Design.md R95.

**R72-3: Tech Tree Expansion** — Med/Med. Add 1-2 techs per tier with real trade-offs. E.g., military doctrine vs economic boost. Design.md R146.

**R72-4: Add 25-minute Timer Option** — Low/Low. Enforces pacing. Design.md R70.

**R72-5: Gene Engineering Fix** — Low/Low. Currently trap tech (+100% food, -50% growth). Replace with food→VP conversion. Design.md R74.

### Balance Notes

- **Starting**: 300m/100e/100f/50a/100i — reasonable, tight on alloys
- **District costs**: 100-200m, build 200-400 ticks — slow but manageable
- **Tech pacing**: T1=150, T2=500, T3=800. Total 9 techs = 4350 research. ~20 min game = 217.5/month needed
- **Ship economy**: Corvette 100m+50a, Destroyer 200m+100a. Industrial produces 4a, ~25-50 months per ship
- **Maintenance**: Corvette 2⚡+1🔩/mo, Destroyer 3⚡+2🔩/mo. Scarcity can tank colonies
- **Match target**: 20-40 min — realistic with current pacing
