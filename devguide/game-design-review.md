# ColonyGame — Game Design Review

*Single latest review only. Older reviews are overwritten each run.*

---

## Review #66 — 2026-03-15 — Depth Plateau Persists, Exploration & Diplomacy Need Next Layer

**Build State:** 86/180 tasks (48%). 2,019 tests passing. Colony upkeep + scout milestones + defense repairs shipped since last review. No new systems added — incremental polish only.

### Pillar Scores

| Pillar | Score | Key Issue |
|--------|-------|-----------|
| Strategic Depth | 8/10 | Doctrine + upkeep + variants give real choices; tech tree still 9 identical % bonuses, only 3 buildings |
| Pacing & Tension | 7.5/10 | Opening strong (scout race, doctrine pick); mid-game flattens ~min 10 when colonies saturate and exploration ends |
| Economy | 8/10 | Upkeep scaling + ship maint + scarcity seasons create genuine pressure; late-game needs more sinks |
| Exploration | 6/10 | Auto-chain survey + milestones give purpose; science ships idle after ~8 min, no expeditions, no follow-up |
| Multiplayer Fairness | 8/10 | Underdog bonus + tech catch-up + gifting + fair galaxy — strongest pillar |
| Diplomacy | 5.5/10 | Stances + gifting + pings work; no binding agreements, no territory, no trade — weakest pillar |

**Overall: 7.2/10** — Core loop is functional and the opening arc is strong. The game hits a "depth plateau" around minute 10 where colonies, tech, and exploration all flatten simultaneously. Diplomacy lacks any binding mechanics for multiplayer tension.

### Top 3 Problems

1. **Exploration dead end** — Science ships become idle paperweights after ~8 minutes. No expeditions, no late-game discovery content. The explore pillar has no mid/late game.
2. **Tech tree lacks capability unlocks** — All 9 techs are production % bonuses. No new abilities, no strategic branching, no "this changes how I play" moments. Tech feels like autopilot.
3. **Diplomacy has no teeth** — Stances and pings are signals only. No system claims (territory), no trade agreements (economy), no NAPs (security). Players can't meaningfully cooperate or threaten.

### Recommendations

**R66-1: Science Ship Expeditions** — High/Med. After 5+ surveys, unlock timed missions at surveyed systems: Deep Probe (600t, +200 mixed resources), Precursor Signal (900t, +500 research, 30% ship loss risk), Wormhole Mapping (600t, +2 VP). Fills the min 8-20 exploration void. Already in design.md.

**R66-2: Trade Agreements** — High/Med. 25 influence each player. Mutual +15% energy/minerals for 5 min. Breaks on aggression (betrayer loses 50 influence). Max 2 active. First binding diplomatic mechanic that creates real alliance incentives and betrayal stakes.

**R66-3: System Claims** — Med/Low. 25 influence to claim a surveyed system. Blocks enemy colonization. +1 VP. Auto-claims on colonize. Gives influence a territorial sink and creates border friction for diplomacy.

**R66-4: Advanced Buildings T2** — Med/Med. Quantum Lab (+8 research, req Lab + T2), Advanced Foundry (+8 alloys, req Foundry + T2), Planetary Shield (+50 defense HP, req Shield Gen + T2). Extends colony management past the min-10 ceiling.

### Balance Notes

- **Starting resources** (100E/300M/100F/50A/100I): adequate for 2-3 opening districts + first expansion decision
- **Colony upkeep** (0/3/8/15/25): 5-colony = 51e/mo — well-tuned wide penalty, discourages mindless spam
- **Tech pacing**: T1 at 150 cost, ~12 research/mo = ~12.5 months (~75s). T2 at 500 = ~42 months (~4.2 min). T3 at 800 = ~67 months. Full tree ~15 min — fits 20-min match
- **Ship economy**: 10 corvettes = 20e + 10a/mo maintenance — meaningful but not crippling
- **Scout milestones** (10/15/20 VP): 45 total is significant but beatable — good carrot without being decisive
- **District balance**: Industrial (4 alloys, 3e upkeep, 200m) vs Generator (6e, 0 upkeep, 100m) — generators are clearly more efficient early; industrial needs late-game alloy sinks to justify cost
- **No urgent balance fix needed** — numbers are reasonable; the depth plateau is a content problem, not a tuning problem
