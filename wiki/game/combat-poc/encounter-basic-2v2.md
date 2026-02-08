# Basic 2v2 Encounter

Minimal scenario for bootstrapping core combat mechanics. No narrative, pure mechanics.

---

## The Space

A rectangular room, 20m x 10m.

```
       20m
  ┌──────────────────────┐
  │                      │
  │  [C1]          [C2]  │
  │                      │
  │         [W]          │  10m
  │                      │
  │  [C3]          [C4]  │
  │                      │
  └──────────────────────┘

  [W]  = Low wall (1m high, 4m wide, center of room)
  [C1] - [C4] = Chest-high crate clusters (hard cover, ~1m x 1m)
```

- **Low wall (W)**: Center of room, 1m tall, 4m wide. Can crouch behind for full cover. Can shoot over while standing (exposed from chest up). Divides the room loosely into two halves.
- **Crate clusters (C1-C4)**: One in each quadrant. Hard cover, roughly chest-high when crouching. Characters can lean out to shoot, exposing part of their body.
- **Floor**: Flat, no elevation changes.
- **Lighting**: Normal, full visibility throughout.

---

## The Combatants

Four identical soldiers. Two teams of two.

### Team Alpha: A1 and A2

**Starting position**: South wall, near C3 and C4 respectively.

### Team Bravo: B1 and B2

**Starting position**: North wall, near C1 and C2 respectively.

### Shared Stats (All Four)

| Attribute | Value |
|-----------|-------|
| Firearms | 3 (Proficient) |
| Tactics | 2 (Competent) |
| Awareness | 2 (Competent) |
| Agility | 3 |
| Endurance | 3 |
| Strength | 3 |
| Willpower | 2 |

No specializations. No traits. Baseline competent soldiers.

### Shared Loadout (All Four)

| Item | Notes |
|------|-------|
| Combat rifle | Standard semi-auto, effective at all ranges in this space |
| Sidearm | Backup |
| Medium body armor | Torso + upper arms covered, plates front and back |
| Helmet | Ballistic, covers top and sides of head, face exposed |
| Frag grenade x1 | |
| Smoke grenade x1 | |
| Combat rig | 4 rifle magazines (30 rounds each = 120 total), sidearm mag x2, medical pouch |
| Medical pouch | Bandages, hemostatic agent, one pain stim |

---

## Starting Conditions

- Both teams are aware of each other (no ambush, no surprise).
- Both teams start behind their respective crate clusters.
- Distance between opposing cover: ~8m (C3 to C1, or C4 to C2), ~10m diagonal.
- Distance across the center wall: ~3-4m from wall to nearest crate cluster.
- Everyone is in cover at the start.
- Both teams want to eliminate the other.

---

## The Fight: Reasoning Through Mechanics

### Moment 0: Initiative

Both teams are aware, both are in cover. Combat begins.

**The first question: who goes first?**

Options:
- **Individual initiative**: Each of the 4 soldiers rolls independently. Turn order might be B2, A1, B1, A2 — interleaved. This means teammates don't necessarily act together.
- **Team initiative**: Each team rolls once. Winning team's members all go first, then losing team. Feels more coordinated but creates a big advantage for the winning team.
- **Side-based with individual order**: Team that wins initiative picks which of their members goes first, then alternating sides. E.g., A1, B1, A2, B2.

**What matters for the feel**: In a milsim, coordinated team action matters. Two soldiers working together should feel different from two individuals. But pure team initiative can be crushing — the winning team gets to alpha-strike before the losers react at all.

**Proposal**: Side-based alternating. Winning side picks one member to act. Then losing side picks one. Alternate. This gives the initiative winner a slight edge (they act first) without letting them steamroll.

With identical stats, let's say Alpha wins initiative this time.

---

### Moment 1: A1's Turn

A1 is behind crate C3. B1 is behind crate C1, directly across (~8m). B2 is behind C2, diagonal (~10m).

**What does A1 want to do?**

A1 has several options a player might consider:
1. **Lean out and shoot at B1** (nearest target, 8m, but B1 is in cover)
2. **Throw the smoke grenade** toward the center wall to create concealment for a push
3. **Move toward the center wall** (closer to the enemy, but better position for grenades/flanking)
4. **Throw the frag grenade** at B1's position behind C1
5. **Stay in cover and wait** (overwatch — shoot the first enemy who exposes themselves)

**This is where the action economy question becomes concrete.**

How much can A1 do in one turn? Let's reason about it:

**Option A: Simple 2-action system**
- A character gets 2 Actions per turn.
- Moving a short distance (up to ~5m) = 1 Action
- Shooting = 1 Action
- Throwing a grenade = 1 Action
- Using a medical item = 1 Action
- Reloading = 1 Action
- Going prone / standing up = 1 Action (or free?)

Under this system, A1 could: Move + Shoot, or Shoot + Shoot (standing still), or Throw grenade + Duck back, etc.

**Option B: Time-budget system**
- A character has, say, 5 seconds of activity per turn.
- Moving 5m = ~2 seconds
- Aimed shot = ~2 seconds
- Snap shot = ~1 second
- Throwing grenade = ~2 seconds
- Reloading = ~3 seconds

Under this system, A1 could: Move 5m (2s) + snap shot (1s) + duck (1s) = 4s used. More granular but more complex.

**Option C: Move + Action**
- Like D&D: one move, one action per turn.
- Simpler, but might feel restrictive for a milsim.

**My lean**: Option A (2-action system) feels like the right balance. Simple enough to reason about, flexible enough that players have meaningful choices. The time-budget system is more realistic but might be fiddly even for a VTT. We can always refine later.

---

### Moment 1 (continued): A1 Decides to Shoot B1

Let's say A1 decides: lean out from C3, take a shot at B1 behind C1. Uses both actions to aim carefully (2 actions = aimed shot with bonus accuracy).

**Now we need: the attack resolution.**

Here's what feeds into the calculation:

| Factor | Value | Effect |
|--------|-------|--------|
| A1 Firearms skill | 3 (Proficient) | Base accuracy |
| Weapon | Combat rifle, semi-auto | Weapon accuracy modifier |
| Range | 8m | Short range for a rifle — no penalty |
| Aiming | 2 actions spent (aimed shot) | Accuracy bonus |
| A1 status | Healthy, not suppressed | No penalties |
| Target: B1 | Behind crate C1 | Only partially exposed (leaning to return fire?) or fully behind cover? |

**Key question: Is B1 exposed?**

B1 isn't doing anything right now (it's not B1's turn). B1 is behind cover. So what can A1 actually shoot at?

**This reveals an important design question: Can you shoot at someone who is fully behind cover?**

Options:
- **No**: If they're fully behind cover, you can't target them. You'd have to wait for them to expose themselves (overwatch) or force them out (grenades, flanking).
- **Suppression**: You can shoot *at* their cover. You won't hit them, but you suppress them — making it harder for them to act on their turn.
- **Partial cover is the norm**: In practice, if someone is "behind" a crate, they're probably peeking or ready to peek. The cover provides a penalty to hit, not immunity.

**My lean**: Cover should be a strong penalty to hit, but not immunity. A chest-high crate means the defender is mostly hidden but their head/shoulders might be slightly exposed, or the shooter is hoping for a moment when they shift. The alternative — no shot possible — makes the game feel static (everyone hides, nothing happens until someone moves).

**Proposal**: Cover provides a significant hit penalty AND reduces the number of body regions that can be hit (e.g., behind a chest-high crate, only head and upper shoulders are targetable).

So A1 takes an aimed shot at B1 who is behind C1.

**Proposed resolution sequence:**

1. **Compute hit probability**: Base from Firearms 3, modified by range (easy), aiming bonus (2 actions), target in cover (significant penalty). Let's say this comes out to something like 40% chance to hit.

2. **Roll**: Let's say A1 hits (rolled under 40).

3. **Determine where the hit lands**: A1 aimed center-mass, but B1 is behind a crate. The only exposed regions are head and shoulders. The hit lands on an exposed region — let's say upper left shoulder.

4. **Check armor**: Medium body armor covers upper arms. The round hits the armor plate on the shoulder.

5. **Determine penetration**: Combat rifle vs. medium armor at 8m. Let's say the armor stops full penetration but doesn't completely negate it — blunt trauma transfers through.

6. **Generate wound**: "Blunt impact, left shoulder (armor-mitigated)" — Pain: Minor, Impairment: None, Stress: Light. B1 is shaken but functional.

If A1 had rolled higher (a worse hit), the shot might have:
- Missed entirely (>40)
- Hit the crate (cover stopped it completely)
- Grazed an exposed area (minimal wound)

If A1 had rolled very well (low number = quality hit), it might have:
- Hit the exposed head/face area — potentially fatal or severe despite helmet
- Found a gap in the armor — full penetration, serious wound

---

### Moment 2: B1's Turn (Protective Reaction?)

Before B1 takes their actual turn, A1 just shot at them. Under the "protective reactions" concept:

**Did B1 get to react when A1 leaned out?**

This is the protective reaction question. Options:
- **No reaction**: B1 just takes the hit (or not). It's not their turn.
- **Passive protection**: B1 is assumed to be staying low behind cover. The cover penalty already represents this.
- **Active reaction**: B1 can spend a reaction to duck further into cover, reducing the hit chance even more. But they "use up" something — maybe one of their actions next turn, or a limited reaction resource.

**My lean**: The cover penalty already represents the default "staying behind cover" posture. Active reactions should exist but cost something — maybe you can spend one of your next turn's actions to react now. So B1 could give up one action next turn to duck deeper into cover when A1 shoots.

---

### Moment 2 (continued): B1's Actual Turn

B1 took a minor hit (blunt impact through armor). It's now B1's turn.

B1's options:
1. **Return fire at A1** — A1 leaned out to shoot, is A1 still exposed? (Depends: did A1 duck back after shooting?)
2. **Throw frag grenade at A1's position** — C3 is 8m away. If the grenade lands behind the crate, devastating.
3. **Move to the center wall** — Better position, but has to cross open space.
4. **Suppress A1** — Keep shooting at A1's cover to pin them down.
5. **Coordinate with B2** — Call out A1's position (does communication cost an action?).

Let's say B1 decides to throw a frag grenade at C3 where A1 is hiding.

**Grenade mechanics needed:**
- Throwing accuracy: Tactics 2 + range 8m = how accurate?
- Landing point: Where exactly does it land relative to the target?
- Fuse time: Does the target get a chance to react?
- Blast radius and cover interaction: Does the crate protect A1 from a grenade that lands on the other side?
- Fragmentation pattern: Directional or uniform?

**The grenade lands near C3.** A1 hears it bounce.

**A1's reaction**: This is exactly where protective reactions matter most. A1 should be able to do *something* — dive away, kick it back, flatten themselves against the crate. The question is: what, and how effective is it?

**Proposal**: When a grenade lands near you, you get a free protective reaction (doesn't cost actions). The quality of that reaction depends on your Agility and Tactics. Options:
- Dive away (move ~2m, go prone, exposed briefly)
- Flatten behind cover (hope the cover absorbs some blast)
- Kick/throw it back (very hard — requires high Agility + Tactics check)

---

## Summary: Mechanical Questions Surfaced So Far

Just from the first two moments of this simple fight:

| Question | Options Discussed | Current Lean |
|----------|-------------------|--------------|
| **Initiative** | Individual / Team / Alternating | Side-based alternating |
| **Actions per turn** | 2-action / Time-budget / Move+Action | 2-action system |
| **Aimed shots** | Spend extra actions for accuracy | 2 actions = aimed shot bonus |
| **Cover** | Immunity / Penalty / Partial exposure | Penalty + limits targetable regions |
| **Shooting at cover** | Allowed / Not allowed / Suppression only | Allowed with heavy penalty |
| **Hit resolution** | Probability → roll → region → armor → wound | Multi-step pipeline |
| **Protective reactions** | None / Free / Costs next-turn actions | Costs next-turn action (exception: grenades are free) |
| **Grenade reactions** | None / Free dodge / Skill check | Free reaction, quality based on stats |

---

## Next: Your Call

We can continue the fight (A2's turn, B2's turn, what happens after the grenade) or we can pause and discuss any of the mechanical proposals above. Which feels more useful right now?
