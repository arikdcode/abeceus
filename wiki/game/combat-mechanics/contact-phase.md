# Contact Phase

## Overview

The Contact Phase is a **universal reaction round** that occurs when combat is initiated, before the first initiative-based turn. It represents the split-second reactions of combatants as they transition from non-combat to combat — diving to cover, dropping prone, drawing weapons, activating shields.

Together with [[combat-mechanics/initiative|deterministic initiative]], the Contact Phase prevents the alpha-strike problem: Contact Phase handles *where you start the fight* (so no one is caught flat unless they earned it), and initiative handles *when you act* (predictable, investment-rewarding turn order).

---

## Design Principles

1. **Veterans should never be caught in the open** in a fight they knew was coming. A character built for combat should always achieve at least a reasonable defensive position.

2. **Ambushes are a sliding scale, not binary.** The GM determines how surprised the party is, which modifies how much reaction time they get. A half-second warning is still *some* warning. Total surprise (zero reaction time) is extremely rare — unconscious, drugged, genuinely zero warning.

3. **Stat floors, not luck ceilings.** At high skill levels, your reaction time budget is always enough to do something meaningful. Slight variance exists, but a veteran never gets zero.

4. **Contact Phase = Reaction Round.** Mechanically, the contact phase uses the same rules as the [[combat-mechanics/reactions|reaction system]]. Everyone gets their stat-based time budget, takes reactive actions, resolves simultaneously.

---

## Mechanic

When combat begins:

### 1. GM Sets the Surprise Modifier

The GM determines how surprised each side is, expressed as a percentage of their normal reaction time budget:

| Situation | Modifier | Example |
|-----------|----------|---------|
| **Expected engagement** | 100% (full budget) | Breaching a room you know has hostiles |
| **Partial warning** | ~60-80% | A shout or noise a half-second before contact |
| **Caught off-guard** | ~30-50% | Didn't expect contact, but in a dangerous area |
| **Ambushed** | ~10-20% | Deliberate ambush with concealed positions |
| **Complete surprise** | 0% (skip contact phase) | Unconscious, drugged, total sensory deprivation. Extremely rare, pure GM call. |

Ambushers themselves get 100% — the ambush was their plan. They may also get automatic optimal positioning (already in cover, weapons ready).

### 2. Each Combatant Gets Their Reaction Time Budget

Each character has a reaction time budget derived from their stats (the same stats that govern the [[combat-mechanics/reactions|reaction system]]). This is modified by:

- The GM's surprise modifier (above)
- Slight random variance — small enough that a veteran's floor is always meaningful (e.g., +/- half a second, never dramatic swings)

Veterans get more time. Rookies get less. But even a rookie with 60% of their budget can probably drop prone.

### 3. Everyone Takes Reactive Actions Simultaneously

Using their time budget, combatants can take **defensive and preparatory actions**:

**Allowed (defensive/preparatory):**
- Move to nearby cover (distance depends on time available)
- Drop prone / crouch
- Draw or ready a weapon
- Change ammunition type
- Activate a portable shield
- Ditch a pack (consumes some of your time budget)
- Prepare gear (ready a grenade, switch fire mode — but NOT throw/fire)

**Not allowed (offensive):**
- Attacking, shooting, throwing grenades
- No damage-dealing actions of any kind

All positioning resolves simultaneously — before the first initiative-based turn.

### 4. Turn Order Begins

After the contact phase resolves, the initiative order kicks in and the first full turn begins. Everyone is now in whatever position they achieved during the contact phase.

---

## Hard Floors

At certain stat levels, certain bad outcomes become impossible:

- A high-stat veteran **always** has enough reaction time to reach nearby cover and ready a weapon, even in an ambush (their floor is high enough that even a 20% modifier still gives them *something*).
- A mid-level trained soldier always has enough time to at least crouch or drop prone.
- Only untrained civilians with low stats AND a near-complete surprise modifier end up truly caught flat.

Exact thresholds depend on the stat system (TBD), but the principle is locked: **your floor rises with your stats.**

---

## Cover Proximity

The system does not guarantee cover is available. If you're in open ground:

- **Your best option is prone.** The contact phase gives you time to react, not a magic cover spawn.
- **High-end equipment can help** — portable shield generators, deployable barriers, even breach charges that blow a foxhole. These are gear solutions, not system solutions.
- **If you walked into the open in a dangerous area, that's on you.** The system protects against unfair situations, not bad decisions.
- **If the GM springs an ambush in a totally safe, peaceful area with zero warning and zero cover — that's a GM problem, not a system problem.** The system trusts reasonable GM behavior.

---

## Interaction with Other Systems

- **[[combat-mechanics/initiative|Initiative]]**: Contact Phase happens first (where you are), then initiative determines turn order (when you act). Complementary systems.
- **[[combat-mechanics/reactions|Reactions]]**: Contact Phase uses the same underlying mechanic — stat-based time budget, same defensive action types. Think of it as a universal reaction round.
- **[[combat-mechanics/action-economy|Action Economy]]**: Preparatory actions in the contact phase (readying weapons, ditching packs) can set up your first turn. The contact phase is not a full turn — you can't use your full action economy, only reactive/preparatory actions within your time budget.
- **Ambush mechanics**: Ambush is a modifier on the contact phase, not a separate system. The GM sets the surprise modifier based on the situation. Ambushers get full budget + optimal positioning.
- **Stats (TBD)**: Reaction time budget is stat-derived. Exact stats to be determined when we map out the full stat system.

---

## Open Design Questions

- [ ] Exact stat derivation for reaction time budget (blocked on full stat system design)
- [ ] Exact variance range — how much does the slight randomness swing? (playtest question)
- [ ] Does the surprise modifier apply per-character or per-side? (probably per-character in some cases — a scout might have better awareness than the heavy weapons guy)
