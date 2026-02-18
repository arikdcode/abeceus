# Attack Resolution

## Design Decision: Cone-Based Geometric Hit Resolution

Attack resolution uses a **geometric model** rather than flat dice rolls or lookup tables. The attacker's accuracy defines an angular cone projecting from the weapon to the target. A point is sampled within that cone's projection. Whatever body region that point lands on is what gets hit. If it lands outside the target silhouette, it's a complete miss.

This unifies hit probability, miss-drift, and body-region targeting into a single geometric calculation. No separate "did you hit" roll followed by "where did the miss go" lookup — the geometry handles everything at once.

### Core Principle

The VTT makes this possible. This model would be impractical with physical dice and paper, but a digital system computes the geometry instantly and can display it visually. Players see their odds, see the cone projection on the target, and understand intuitively why certain shots are harder than others.

---

## The Cone Model

### How It Works

1. **The attacker aims at a body region** on the target (e.g., center-mass torso, head, left arm).

2. **The system computes an accuracy angle** based on all attack inputs (skill, weapon, conditions, etc.). This angle defines the attacker's spread — how tightly their shots cluster around the aim point.

3. **The accuracy angle projects a spread area at the target's range:**

```
spread_radius = range * tan(accuracy_angle / 2)
```

At close range, even a wide angle projects a small area. At long range, the same angle projects a huge area. **Range falloff is built into the geometry — no separate range modifier needed.**

4. **A random point is sampled within the spread**, using a 2D distribution centered on the aim point (likely Gaussian — most shots cluster near center, fewer at the edges).

5. **The point is checked against the target's silhouette.** Whatever body region it lands on is the hit location. If it lands outside the silhouette, it's a complete miss.

### What This Produces Naturally

- **Aiming center-mass at the torso**: Most of the cone overlaps with the torso. High probability of hitting something. Occasional drift to adjacent regions (head, arms, abdomen) on edge-case samples.

- **Aiming for the head**: The head is small. Much of the cone's area lands on the torso, shoulders, or empty space. You'll probably hit *something*, but it might not be the head.

- **Aiming for the eyes**: Tiny target. Vast majority of the cone is not on the eyes. You'll mostly hit the head, face, or miss entirely. But a tight cone (expert marksman, aimed shot, close range) puts real probability on the eyes.

- **Point-blank range**: The cone projects to a tiny area. Even a novice's wide angle covers just the intended region. Almost guaranteed hit.

- **Extreme range**: The cone projects to a massive area. Even a master's tight angle spreads across the full silhouette and beyond. Hits become unlikely, and what you hit is unpredictable.

### No Clamping (0–100%)

Hit probabilities are not clamped to an artificial range. If the geometry says a shot is effectively 100% (point-blank, large target, expert shooter), it's 100%. If it says 0% (novice with a pistol at a kilometer), it's 0%. Characters who invest in accuracy are rewarded with certainty at appropriate ranges. Characters who are outmatched face reality.

If playtesting reveals that 0–100% feels bad in practice, we can revisit with soft clipping. But we start with the honest math.

---

## Accuracy Angle: What Determines the Cone

The accuracy angle is the single computed value that drives the entire hit resolution. It's derived from all relevant combat factors:

### Factors That Tighten the Cone (Better Accuracy)

| Factor | How It Helps |
|--------|-------------|
| **Higher firearms skill** | Trained muscle memory, steadier aim |
| **Better weapon accuracy** | Tighter mechanical grouping, better optics |
| **Aimed shot** (attack type) | Extra time spent lining up the shot |
| **Stationary attacker** | Braced, stable firing platform |
| **Clear visibility** | Can see the target clearly |
| **Not suppressed** | Calm, focused |

### Factors That Widen the Cone (Worse Accuracy)

| Factor | How It Hurts |
|--------|-------------|
| **Lower firearms skill** | Untrained, unsteady |
| **Poor weapon accuracy** | Loose tolerances, no optics |
| **Snap shot** (attack type) | Rushed, minimal aiming |
| **Moving attacker** | Walking = moderate widening, running = severe |
| **Low visibility** | Darkness, smoke, rain |
| **Suppressed** | Flinching, can't hold steady |
| **Wounded** | Pain, impaired motor control |

### Formula Structure

All factors modify the accuracy angle multiplicatively:

```
accuracy_angle = base_weapon_spread
                * (1 / skill_modifier)
                * attack_type_modifier
                * movement_modifier
                * visibility_modifier
                * suppression_modifier
                * wound_modifier
```

Where:
- `base_weapon_spread` = the weapon's inherent angular accuracy (sniper rifle = very tight, shotgun = very wide)
- `skill_modifier` = higher skill tightens the cone (divides the spread)
- Other modifiers = multipliers > 1.0 widen, < 1.0 tighten

Exact values TBD through playtesting. The structure is what matters: one number goes in (accuracy angle), geometry comes out.

### Distribution Shape

The random point within the cone is sampled from a **2D Gaussian distribution** centered on the aim point. This means:
- Most shots cluster near where you aimed
- Fewer shots land at the edges of the cone
- The occasional wild shot is possible but rare

The standard deviation of the Gaussian maps to the accuracy angle — a wider cone means a flatter distribution, a tighter cone means shots cluster tightly.

**Playtest note**: The cone edges may benefit from non-linear falloff (curves instead of straight lines from apex to base). This would make extreme-range accuracy drop off more aggressively than the linear cone model predicts. Worth experimenting with — the VTT can handle non-linear distributions as easily as linear ones.

---

## Target Silhouettes

### The 2D Cross-Section

Every creature type has a **2D front-facing silhouette** divided into named regions. For humanoids, a single base template is created and scaled by character size.

Humanoid regions (approximate):

```
        ┌───┐
        │Eye│
      ┌─┤   ├─┐
      │ │Hea│ │
      │ └─┬─┘ │
  ┌───┤   │   ├───┐
  │L. │ Neck  │R. │
  │Sho│   │   │Sho│
  │uld├───┴───┤uld│
  │er │       │er │
  ├───┤ Upper ├───┤
  │L. │ Torso │R. │
  │Arm│       │Arm│
  │   ├───────┤   │
  ├───┤ Abdo- ├───┤
  │L. │  men  │R. │
  │For│       │For│
  │arm├───┬───┤arm│
  ├───┤   │   ├───┤
  │L. │Groin│ │R. │
  │Han│   │   │Han│
  │d  ├───┤   │d  │
      │L. │R. │
      │Thi│Thi│
      │gh │gh │
      ├───┤───┤
      │L. │R. │
      │Shi│Shi│
      │n  │n  │
      ├───┤───┤
      │L. │R. │
      │Ft │Ft │
      └───┘───┘
```

Each region has:
- A defined area (in the silhouette's coordinate space)
- A position (where it sits relative to center-mass)
- Associated critical structures (organs, arteries, bones) for wound generation

### Cover Interaction

Cover **clips the silhouette**. If a target is behind a waist-high barrier, the silhouette below the waist is removed. The cone now has less target area to overlap with, so the miss probability increases naturally. No separate "cover modifier" — the geometry handles it.

The VTT can display this: the target silhouette with the covered portion grayed out, and the cone projection overlay showing where shots might land.

Cover properties:
- **Height**: How high the cover extends (determines which silhouette regions are blocked)
- **Width**: How wide the protection is (full width vs. partial — leaning out from a pillar exposes one side)
- **Quality/Material**: Determines whether shots that "hit" the cover are stopped or penetrate through (see Armor & Penetration section)

### Posture Interaction

Posture changes the silhouette:
- **Standing**: Full silhouette exposed
- **Crouching**: Silhouette height reduced (~60% of standing). Legs are folded, torso is lower.
- **Prone**: Silhouette dramatically reduced from front view (mostly head and shoulders). Much wider from side view (but we're ignoring facing for now).

The VTT adjusts the active silhouette based on posture. Combined with cover, this produces situations like: crouching behind a low wall = only head exposed. The geometry reflects this automatically.

---

## Armor & Penetration

### Penetration vs. Protection

Armor doesn't modify hit probability. It determines what happens *after* a hit lands.

Every weapon has a **penetration rating** — how much energy/force the projectile delivers. Every armor piece has a **protection rating** — how much it can stop.

| Comparison | Result |
|-----------|--------|
| Penetration >> Protection | **Full penetration** — projectile passes through, wound at full severity |
| Penetration > Protection | **Penetration** — projectile gets through, wound at moderate-high severity |
| Penetration ≈ Protection | **Partial** — blunt trauma, spalling, fragmentation. Reduced wound severity |
| Penetration < Protection | **Stopped** — bruising or no wound. Armor takes durability damage |
| Penetration << Protection | **Deflected** — no effect. Minimal durability loss |

### Spatial Armor (Per-Plate System)

Armor is defined spatially on the silhouette — specific plates or sections covering specific body regions.

Example — medium body armor:
- **Front chest plate**: Covers upper torso (heart, lungs). Protection: High. Durability: 8 hits.
- **Back plate**: Covers upper back. Protection: High. Durability: 8 hits.
- **Side panels**: Cover flanks. Protection: Medium. Durability: 5 hits.
- **Shoulder pads**: Cover shoulders. Protection: Medium. Durability: 4 hits.
- **Abdomen panel**: Covers lower torso. Protection: Medium. Durability: 5 hits.

Regions NOT covered (face, arms, legs, neck) receive no armor protection.

### Armor Durability

Every hit that contacts an armor plate reduces its durability, regardless of whether the shot penetrated:
- Stopped shots still stress the plate — small durability reduction
- Penetrating shots cause major durability loss
- At zero durability, the plate is compromised — protection rating drops to near-zero

**The VTT tracks durability per plate, per character.** Players can inspect their own armor status at any time. With sufficient Perception, they can assess visible damage on enemy armor.

### Tactical Implications

- **Coordinated fire on a weak point**: A team focuses fire on one plate. After several hits, it degrades. The next shot punches through. This is emergent tactical gameplay — no special "focus fire" mechanic needed.
- **Plate swapping**: Characters can carry spare plates and swap damaged ones during combat (consuming action economy time). Creates a loadout decision — spare plates are heavy.
- **Calling out weak spots**: A perceptive character identifies damaged plates on an enemy and calls it out to the team. Uses the Voice channel. Teamwork through game mechanics.
- **Armor asymmetry as narrative**: After a firefight, your armor tells the story. "Left chest plate cracked from two rifle hits, shoulder pad intact, abdomen took a graze." The VTT displays this per character.

---

## Burst Fire & Special Attack Types

### Burst Fire

Burst fire doesn't fire one shot with better odds — it fires **multiple projectiles**, each with its own cone sample. The cone is wider than a single aimed shot (recoil, sustained fire), but multiple points are generated.

- **Short burst (3 rounds)**: 3 cone samples, moderate spread increase
- **Long burst (6+ rounds)**: More samples, significant spread increase, ammo consumption
- **Full auto / suppression**: Many samples, very wide cone, most shots miss but area is saturated

Each sample is resolved independently: check silhouette, check armor, generate wound if applicable. A burst might produce 1 hit out of 3, or 0 out of 6 at long range.

### Shotguns

Similar concept: multiple projectiles (pellets), each sampled independently from a wide cone. At close range, many pellets hit. At long range, pellets scatter across and beyond the silhouette.

---

## VTT Presentation

When a player initiates an attack:

1. **Target silhouette appears**, adjusted for posture and cover (blocked regions grayed out)
2. **Cone overlay shows** the spread projection at the target's range, centered on the aimed region
3. **Hit probabilities per region** are displayed (computed from cone-silhouette overlap)
4. **Armor overlay** (if attacker has sufficient Perception): shows plate layout and condition
5. Player confirms the shot
6. VTT samples the cone, resolves the hit, checks armor, generates wound result
7. **Visual feedback**: shot path, impact location, armor damage update

---

## Interaction with Other Systems

- **[[combat-mechanics/action-economy|Action Economy]]**: Attack type (aimed, snap, burst) is determined by how much time the attacker spends. Aimed shots use more Hands + Focus time but tighten the cone significantly.
- **[[combat-mechanics/reactions|Reactions]]**: Defensive reactions (shifting, going prone) change the target's silhouette and cover state before the shot resolves. Overwatch shots trigger when a target enters the watched zone.
- **[[combat-mechanics/initiative|Initiative]]**: Turn order determines who shoots first. In a lethal system, this matters — the first shot might be the only one needed.
- **Wound System** *(TBD)*: Attack resolution determines *what region was hit* and *how much penetration got through armor*. The wound system takes those inputs and generates the specific injury, its effects, and healing requirements.

---

## Pass-Through & Stray Hits

A missed shot doesn't just vanish. The sampled point in the cone defines a **trajectory** extending beyond the intended target. That trajectory can intersect other characters, cover objects, or anything else on the map.

### How It Works

1. A shot is resolved against the primary target — the cone samples a point, it misses the silhouette (or passes through with enough remaining penetration).
2. The VTT traces the trajectory beyond the target.
3. Any other silhouettes or objects along that line are checked for intersection.
4. If the trajectory intersects another character's silhouette, it's resolved as a hit against them (armor check, wound generation, the whole pipeline).
5. If it hits cover or a prop, it impacts that object (potentially degrading it).

This means:
- **Friendly fire from missed shots is possible.** Positioning behind your teammate's line of fire is genuinely dangerous.
- **Bystanders can be hit.** In a civilian environment, missed shots have consequences.
- **Over-penetration matters.** A high-powered round that punches clean through the target can hit someone behind them.
- **Suppressive fire in a corridor** is terrifying for everyone in the line of fire, not just the intended target.

The VTT handles all of this automatically — the player fires, the system traces the full trajectory and resolves every intersection.

---

## Concealment vs. Cover

**Cover** blocks shots physically — it clips the silhouette AND has material properties that stop or slow projectiles.

**Concealment** only blocks vision — smoke, darkness, foliage, fog. It does not clip the silhouette or stop projectiles. Instead, it **widens the accuracy cone** because the attacker can't see their target clearly.

| Concealment Level | Effect on Accuracy Cone |
|-------------------|------------------------|
| Light (rain, dim light) | Minor cone widening |
| Moderate (heavy fog, dusk) | Significant cone widening |
| Heavy (smoke grenade, total darkness) | Extreme cone widening — effectively blind fire |

### Blind Fire

When concealment is total (e.g., firing into a smoke cloud), the attacker has no silhouette to aim at. Instead:
- The attacker selects a **point on the map** (their best guess of where the target is)
- The cone projects from that point with maximum spread
- The system checks all silhouettes within the cone's projection area
- Any intersection is resolved normally

From a UX perspective: the player clicks a map location, sees a wide cone projection with no silhouette overlay, and fires. They're hoping to intersect someone. The pass-through system applies here too — the shot traces through the entire area.

### Concealment + Cover

These stack naturally. A target behind a concrete barrier in smoke is both hard to see (cone widens) AND physically blocked (silhouette clipped, barrier absorbs hits). The geometry handles the combination without any special rules.

---

## Destructible Cover

Cover degrades under fire, using the same penetration-vs-protection model as armor:

- Each cover object has a **material protection rating** and **durability**
- Shots that hit cover reduce its durability
- When durability reaches zero, the cover is compromised — protection drops, and subsequent shots pass through
- The VTT tracks and displays cover condition

A wooden crate offers concealment and light cover but degrades fast. A concrete pillar takes sustained heavy fire to degrade. A steel bulkhead might be effectively indestructible against small arms.

This means sustained fire can *destroy* someone's cover, creating another emergent tactical dynamic. Suppress and degrade, then push.

---

## Playtest Questions

- [ ] What accuracy angles produce realistic hit probabilities at various ranges? (Need to test with actual weapon/skill combinations)
- [ ] Gaussian distribution vs. uniform within cone — which feels better?
- [ ] Non-linear cone edges (curves vs. straight lines) — does aggressive long-range falloff improve feel?
- [ ] How many regions should the humanoid silhouette have? (Current sketch has ~18. Too many? Too few?)
- [ ] How fast should armor degrade? (Durability values need extensive tuning)
- [ ] Burst fire recoil modeling — how much does the cone widen per subsequent shot?
- [ ] How does Perception-based armor inspection work mechanically? (Passive check? Active action? Skill threshold?)
- [ ] Cover penetration — when a shot hits cover, does the cover's material quality act like armor (penetration vs. protection check)?
