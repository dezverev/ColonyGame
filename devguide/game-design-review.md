# ColonyGame — Game Design Review

*Single latest review only. Older reviews are overwritten each run.*

---

## Review #71 — 2026-03-16 — Navigation Chain Complete, Queue UX Is the Gap

**Build State:** 93/185 tasks (50%). 2237 tests passing. Since R70: System orbital view shipped (Galaxy→System→Colony nav), surface anomalies added spatial puzzle, WebGL resource leaks fixed.

### Pillar Scores

| Pillar | Score | Key Issue |
|--------|-------|-----------|
| Strategic Depth | 6/10 | Doctrine + tech + anomalies offer choices, but single ship class means no military decisions |
| Pacing & Tension | 6/10 | Scarcity seasons + crises + expeditions create mid-game pressure; endgame still flat after ~15 min |
| Economy | 7/10 | 6 districts + 6 buildings + anomaly bonuses + colony traits = real specialization. Solid. |
| Exploration | 7/10 | System orbital view + survey + expeditions + anomalies = complete exploration loop. Big jump from last review. |
| Multiplayer Fairness | 5/10 | Underdog bonus exists, but no comeback after military loss; identical starts lack variety |

**Overall: 6.2/10** — Up from 5.8. System orbital view closed the biggest visual gap. Economy and exploration are now both strong. The next wave should focus on player feedback (construction UX) and military depth (fleet composition).

### Top 3 Problems

1. **No construction queue UI** — Server has max-3 queue but client shows no progress bars, ETAs, or costs. Players can't plan builds.
2. **Single ship class** — Only corvettes + variants. No fleet composition choices, no counter-strategy beyond rock-paper-scissors variants.
3. **Identical starts kill replayability** — Every player gets the same planet type/size. No reason to adapt opening strategy.

### Recommendations

**R71-1: Construction Queue HUD** — High/Low. Show queued items with progress bars, time remaining, total cost, cancel button. Data already in `buildQueue`/`buildingQueue`. Pure client UI — no engine work.

**R71-2: Starting Planet Variety** — Med/Low. Random planet type (continental/ocean/tropical/arctic/desert/arid) and size (12-20). Fairness mode = same for all. Already in design.md. Forces different openers.

**R71-3: Destroyer Ship Class** — Med/Med. 100a, 80HP, 8atk, 6s/hop via T2 engineering. First real fleet composition decision: corvette swarm vs destroyers. Already specced in design.md.

**R71-4: VP Timeline Snapshots** — Low/Low. Snapshot VP every 10 months, render line chart on post-game screen. Gives progression feel. Already in design.md.

### Balance Notes

- **Starting resources** (100E/300M/100F/50A/100I): mineral bump to 300 is healthy, allows 3 early districts
- **District costs**: Basic 100m/300t, advanced 200m/400t — well-balanced progression
- **Tech pacing**: T1=150, T2=500, T3=800 — full tree ~15 min with 1 research district. Good for 20-40 min
- **Ship economy**: 10 corvettes × (2e+1a)/mo = 20e+10a. Meaningful cost without crippling
- **Urgent**: T3 Genetic Engineering (+100% agri, pop growth halved) is still a trap — growth penalty devastating, food surplus has no VP path. Either remove growth penalty or add food→VP conversion (e.g., 1 VP per 50 food stockpiled)
- **Surface anomalies**: +50% output on lucky slots is high variance but creates spatial puzzle. Monitor whether it snowballs
