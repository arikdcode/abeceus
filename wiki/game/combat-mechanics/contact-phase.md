# Contact Phase

**Status**: Working document — high-level design established, details to be fleshed out.

## Overview

The Contact Phase is a **pre-combat positioning step** that occurs when combat is initiated, before the first turn of the round. It represents the split-second reactions of combatants as they transition from non-combat to combat — diving to cover, dropping prone, drawing weapons, activating shields.

Together with [[combat-mechanics/initiative|deterministic initiative]], the Contact Phase prevents the alpha-strike problem: initiative ensures turn order reflects genuine speed, and the Contact Phase ensures no one is caught completely flat-footed unless they truly were.

---

## Design Principles

1. **Veterans should never be caught in the open** in a fight they knew was coming. A character built for combat should always achieve at least a reasonable defensive position. Total failure should not be possible for high-skill characters in expected combat situations.

2. **Ambushes shift the Contact Phase, not bypass it.** Even in an ambush, the Contact Phase still occurs — but the ambushed side is penalized. A veteran caught in an ambush might still dive to nearby cover. A rookie might freeze. But the mechanic exists in all scenarios short of *complete* surprise (unconscious, drugged, etc.).

3. **Stat floors, not luck ceilings.** At certain skill levels, certain outcomes should be *impossible*. A veteran should never get "Failure" on a Contact Phase in a known engagement. The probability distribution should have hard floors based on character competence.

---

## Mechanic (High-Level)

When combat begins:

1. **Each combatant makes an Awareness-based check**, modified by:
   - Situation (ambush penalties, expected engagement bonuses)
   - Tactics skill (knowing *where* to position)
   - Proximity to cover (GM determines what's available within reach)

2. **Result determines positioning allowance:**

| Result | Positioning Allowed | When It Happens |
|--------|-------------------|-----------------|
| **Excellent** | Move up to ~3m, get behind solid cover, ready weapon, activate portable shield | Veterans in expected combat; ambushers (automatic) |
| **Good** | Move 1-2m, dive behind adjacent cover, drop prone, draw sidearm | Trained soldiers in most situations |
| **Marginal** | Crouch in place, partial cover only if within arm's reach | Rookies, or trained soldiers caught off-guard |
| **Failure** | No positioning — caught flat where you stood | Rookies in ambush, untrained civilians |

3. **All positioning resolves simultaneously** — before the first initiative-based turn.

---

## Open Design Questions

- [ ] Exact check mechanic: what dice/system produces the result tiers? (Needs to align with whatever core resolution mechanic we define)
- [ ] Hard floors: at what skill level does "Failure" become impossible? At what level does "Marginal" become impossible?
- [ ] How does proximity to cover interact? If there's no cover within 3m, does an "Excellent" result let you go prone in the open instead?
- [ ] Can the Contact Phase include offensive micro-actions? (e.g., a veteran who gets Excellent — can they ready a grenade, or is it purely defensive positioning?)
- [ ] How does this interact with gear? Can you "ditch pack" during the Contact Phase to shed an initiative penalty for the fight?
- [ ] What constitutes "complete surprise" that skips the Contact Phase entirely?

---

## Interaction with Other Systems

- **[[combat-mechanics/initiative|Initiative]]**: Contact Phase happens first, then initiative determines turn order. The two systems are complementary — Contact Phase handles *where you are*, initiative handles *when you act*.
- **Awareness (stat)**: Primary driver of Contact Phase results. High Awareness = better instinctive positioning.
- **Tactics (skill)**: Modifies Contact Phase checks. Tactically trained characters position smarter, not just faster.
- **Ambush mechanics** *(TBD)*: Ambush is a modifier on the Contact Phase, not a separate system. Ambushers get automatic Excellent; ambushed side rolls with penalty.
