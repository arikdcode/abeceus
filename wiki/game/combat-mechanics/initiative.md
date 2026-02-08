# Initiative & Turn Order

## Design Decision: Deterministic Initiative

Initiative is a **character stat** that directly determines turn order. Higher initiative acts first. This is deterministic — no large random swing can override a stat advantage.

### Core Principles

1. **Predictability over randomness.** Players can reason about their position in the turn order before combat begins. This informs tactical planning, loadout decisions, and engagement choices. Randomness in turn order doesn't create interesting decisions — it just creates noise. Uncertainty from *enemy behavior* is what drives tactical thinking.

2. **Investment must matter.** If a character invests in being fast, they are fast. Always. A stat-4 character goes before a stat-2 character in every fight, every round. There is no lucky roll that reverses this. The payoff for investment is concrete and reliable.

3. **Alpha-strike prevention through design, not patches.** Rather than allowing random stacking and then bolting on a cap, the system prevents random alpha-strikes by simply not being random. If one team goes first, it's because they are genuinely faster — not because they rolled well. (See also: [[combat-mechanics/contact-phase|Contact Phase]], which handles positioning.)

4. **Numerical advantage is preserved.** A 10v2 fight feels like a 10v2 fight. The system doesn't artificially equalize unequal forces. The larger team gets more turns per round.

---

## Turn Order Resolution

### Step 1: Determine Effective Initiative

Each combatant's **effective initiative** is computed from:

- **Base initiative stat** (character attribute, range TBD — playtesting will determine whether 1-4 or 1-5 is the right scale)
- **Gear modifiers** (heavy loadout reduces effective initiative; light loadout preserves or improves it)
- **Situational modifiers** (e.g., veteran instincts, combat drugs — edge cases, to be defined)

*Playtest question*: We may also test an optional **+1 roll** — a small per-combat roll (coin flip or skill check) that can give +1 to effective initiative. This adds slight variation at tier boundaries without bridging a 2-point gap. To be evaluated during playtesting.

### Step 2: Sort by Tier (Highest First)

All combatants are grouped by their effective initiative value. Groups are ordered highest to lowest.

Example with a 4v4:

```
Alpha team: A1 (init 4), A2 (init 3), A3 (init 3), A4 (init 2)
Bravo team: B1 (init 3), B2 (init 3), B3 (init 2), B4 (init 1)

Tier 4: A1
Tier 3: A2, A3, B1, B2
Tier 2: A4, B3
Tier 1: B4
```

### Step 3: Resolve Within-Tier Ordering

When multiple combatants share the same initiative tier, the following algorithm applies:

1. **Roll to determine which side goes first** within this tier (simple coin flip or random roll — handled automatically by the VTT)
2. **Alternate between sides.** Starting with the winning side, alternate one combatant from each side until one side is exhausted within this tier.
3. **Individual ordering within a side's slots** is rolled randomly (VTT handles this).

Example (continuing from above):

```
Tier 4: A1 (only one — no tiebreak needed)
Tier 3: Roll → Bravo goes first within this tier
         B1, A2, B2, A3
Tier 2: Roll → Alpha goes first within this tier
         A4, B3
Tier 1: B4 (only one — no tiebreak needed)

Final turn order: A1, B1, A2, B2, A3, A4, B3, B4
```

### Step 4: Turn Order Holds

Once established, the turn order is **static for the duration of combat.** It does not change when characters are wounded, change gear, or have status effects applied.

Wounds, fatigue, and other impairments affect **what a character can do on their turn** (action economy, accuracy, movement), not *when* they act. A wounded character still gets their turn at the same point in the order — they're just less effective.

*Edge case to explore*: Certain extreme effects (combat stimulants, special abilities) might grant bonus turns or shift position. These would be rare exceptions, not core mechanics.

---

## What Initiative Represents

Initiative is not purely physical reflex speed. It represents a combination of:

- **Situational awareness** — reading a developing combat situation quickly
- **Trained reaction patterns** — muscle memory from drilling and combat experience
- **Decision speed** — how fast you commit to an action under pressure
- **Physical readiness** — posture, weapon position, not being encumbered

A grizzled veteran with aging joints but decades of combat instinct should have high initiative. A young rookie with fast reflexes but no experience should have lower initiative — they're fast, but they freeze, hesitate, or react to the wrong thing.

This means initiative is primarily a **trained/experiential stat**, not a raw physical one. Gear modifiers reflect the physical component — heavy equipment slows you down regardless of experience. But the base stat is mostly about how combat-ready you are.

---

## Gear Impact on Initiative

Loadout affects effective initiative. The principle: **heavier or bulkier gear slows you down.** This creates a genuine tactical decision during loadout selection.

Examples (specific values TBD during playtesting):

| Loadout Factor | Initiative Modifier |
|----------------|-------------------|
| Light weapon (SMG, pistol) | +0 or +1 |
| Standard rifle | +0 |
| Heavy weapon (LMG, railgun) | -1 |
| Light armor | +0 |
| Medium armor | +0 or -1 |
| Heavy armor / power armor | -1 |
| Full pack (travel gear) | -1 |
| Combat rig only | +0 |
| Ditched pack (dropped during Contact Phase) | Remove pack penalty |

The implication: a character might choose to go lighter against fast enemies, accepting less firepower/protection in exchange for acting earlier. Or they might load up heavy, knowing they'll act later but hit harder when they do.

---

## Interaction with Other Systems

- **[[combat-mechanics/contact-phase|Contact Phase]]**: Happens *before* initiative determines turn order. Ensures combatants are positioned (in cover, prone, etc.) before the first turn. Together with deterministic initiative, this prevents random alpha-strike wipes.
- **Action Economy** *(TBD)*: Initiative determines *when* you act. Action economy determines *what* you can do on your turn. Wounds and status effects impair action economy, not initiative.
- **Reactions** *(TBD)*: A separate system that allows limited out-of-turn responses to threats. Initiative may influence the size of a character's reaction pool (faster characters can respond to more threats).

---

## Playtest Questions

- [ ] What is the right range for the initiative stat? (1-4? 1-5? 1-6?)
- [ ] Does the +1 roll add meaningful variation at tier boundaries, or is it unnecessary noise?
- [ ] What are the right gear modifiers? How much should a heavy weapon actually slow you down?
- [ ] Should the turn order ever change mid-combat, or is fully static correct?
- [ ] Does the within-tier alternation feel fair and natural in play?
