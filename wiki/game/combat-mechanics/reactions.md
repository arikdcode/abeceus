# Protective Actions & Reactions

## Design Decision: Defensive Reactions + Overwatch

Characters are never frozen while visible threats develop. Two separate systems handle out-of-turn responses:

1. **Defensive reactions** — a separate stat-based budget for repositioning and self-protection on other characters' turns
2. **Overwatch** — a deliberate turn action that sets up a conditional offensive response

These two systems do not overlap. Reactions are defensive. Overwatch is offensive. Neither triggers cascading counter-reactions.

---

## Defensive Reactions

### Core Concept

Every character has a **reaction budget** — a small amount of time (in seconds, like the action economy) available for defensive responses during other characters' turns. This budget is separate from action economy; you always get your full turn AND your reaction capacity.

The reaction budget is determined by stats (likely Awareness, combat experience, or similar — exact stats TBD). A veteran gets significantly more reaction capacity than a rookie.

### What Reactions Can Do

Reactions are **defensive and positional only**:

| Reaction | What It Does |
|----------|-------------|
| **Shift** | Move 1-2m — get behind nearby cover, adjust angle against a flanker |
| **Drop** | Go prone or crouch — reduce profile |
| **Track** | Turn to face a moving threat — negates flanking bonus |
| **Brace** | Hunker deeper into existing cover — improves cover protection |

### What Reactions Cannot Do

- **No shooting.** Firing at a target during their turn is overwatch, not a reaction.
- **No throwing.** No grenades, no equipment use.
- **No offensive actions of any kind.** Reactions reposition you — they don't threaten anyone.

### Why Defensive-Only Prevents Cascading

If your reaction is purely positional — you shifted behind a crate, you went prone, you turned to face — there's nothing for the acting player to counter-react to. You didn't threaten them. The exchange ends cleanly: they acted, you adjusted, done.

### Reaction Budget and Multiple Threats

The reaction budget is spent across the entire round, not per enemy turn. If two enemies flank you in a pincer:

- **Flanker A moves**: You spend reaction time to shift into cover against A.
- **Flanker B moves**: If you have remaining budget, you can adjust again (smaller shift, track, go prone). If you're out, B gets their flanking angle.

This means:
- **Veterans** (large reaction budget) can respond to 2-3 threats before being overwhelmed. You might need three people to successfully flank a grizzled combat vet.
- **Rookies** (small reaction budget) can react to one threat and are exposed to the second. Easier to overwhelm.
- **Multiple threats are genuinely dangerous** even to skilled characters — eventually, reaction capacity runs out.

### Turn-Based Artifact Acknowledgment

In reality, a pincer flanking maneuver happens simultaneously. In our turn-based system, flankers move sequentially, meaning the defender reacts to them one at a time. This is an accepted limitation of turn-based design. The reaction budget mitigates the worst of it — you can react to the first mover, and the sequential nature means you at least get *something* — but it doesn't perfectly simulate simultaneous movement. We accept this tradeoff.

---

## Overwatch

### Core Concept

Overwatch is a **deliberate action taken on your turn**. You commit your action economy to watching a zone — if an enemy enters or crosses that zone, you get a shot at them.

### How It Works

1. On your turn, you declare overwatch and designate a zone (a corridor, a doorway, an open area).
2. Your turn is spent: Hands (weapon ready), Focus (watching the zone), Legs (stationary, braced). Your full action economy is consumed by maintaining overwatch.
3. When an enemy enters your zone, you **choose** whether to fire. You are not forced to shoot the first target you see — you can hold for a priority target.
4. Your overwatch shot uses your action time budget (already committed), not your reaction budget. This means you can still use defensive reactions while on overwatch.

### The Tradeoff

Overwatch costs your entire turn's action economy. You don't move, you don't shoot at a guaranteed target, you don't reload or heal. You're betting your turn on someone crossing your zone. If nobody does, you spent your turn doing nothing offensive.

The payoff: you shoot at a target mid-movement, which is tactically powerful. They're exposed, possibly out of cover, and your shot is braced and aimed.

### Overwatch + Reactions

These are separate systems. While on overwatch:
- Your **action economy** is committed to watching the zone (and firing if triggered)
- Your **reaction budget** is still fully available for defensive repositioning if someone threatens you from outside your overwatch zone

You're not helpless while watching a corridor. If someone flanks you from behind, you can still track or shift.

---

## Interaction with Other Systems

- **[[combat-mechanics/action-economy|Action Economy]]**: Reactions draw from a separate budget, not from your action economy channels. Overwatch consumes your action economy for the turn. The two budgets are independent.
- **[[combat-mechanics/initiative|Initiative]]**: Turn order determines when enemies act, which determines when your reactions trigger. Higher initiative characters may have more reaction budget (TBD — initiative may influence reaction capacity).
- **[[combat-mechanics/contact-phase|Contact Phase]]**: The Contact Phase handles pre-combat positioning. Reactions handle in-combat repositioning. Both serve the same principle: you should not be caught helpless unless you genuinely failed.
- **Cover and Positioning** *(TBD)*: Reactions interact heavily with cover mechanics. Shifting behind cover, bracing in cover, tracking to deny flanking bonuses — all depend on how cover is defined mechanically.

---

## Playtest Questions

- [ ] What is the right reaction budget for different skill levels? (e.g., rookie = 1-2 seconds, veteran = 3-4 seconds?)
- [ ] Which stat(s) govern reaction budget? (Awareness? Combat experience? A derived stat?)
- [ ] How far can a "Shift" reaction move you? (1m? 2m? Stat-dependent?)
- [ ] **Alternative to test**: Shared action/reaction pool instead of separate budgets. Same total time, player decides how to split between acting and reacting. Creates a meaningful tradeoff but introduces planning complexity. Worth playtesting against the separate-budget model.
- [ ] Does overwatch consume the entire action economy, or could a "partial overwatch" exist where you act briefly then set up overwatch with remaining time?
- [ ] Can overwatch be set up as part of a turn that includes minor actions (e.g., reload then overwatch)?
- [ ] How does overwatch interact with the channel system's time budgets? Does the shot timing depend on weapon type (snap shot speed vs. aimed shot speed)?
