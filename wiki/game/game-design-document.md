# Abeceus System: Game Design Document

A tactical sci-fi TTRPG built for a digital VTT, emphasizing gritty realism, consequential combat, and smart play.

---

## Design Philosophy

### Core Experience

The game should feel like a **tactical milsim set in a hard sci-fi future**. Combat is dangerous. Characters can die. But players who think tactically—scouting ahead, using cover, coordinating fire, employing the right tools—will survive and thrive. The goal is not to punish players, but to reward smart decisions and create genuine tension.

**Players should feel:**
- Relief and pride when they survive a combat encounter
- Tension when they know they're walking into danger
- Agency over their survival through preparation and tactics
- The weight of their decisions—good and bad

### Lethality Philosophy

**One good hit can kill, but preparation protects.**

- An unarmored character hit by a high-powered weapon dies or suffers catastrophic injury
- Quality armor, shields, and positioning create survivable situations
- Smart play (recon, cover, suppression, distractions) dramatically improves survival odds
- Reckless play against trained enemies is lethal—charging across open ground without protection should result in death

**Weapon lethality scales realistically:**
- Heavy weapons (railgun rifles, anti-materiel weapons) cause catastrophic, often irrecoverable wounds
- Standard firearms can kill, but wounds may be stabilized by skilled medics
- Headshots and heart shots are fatal regardless of weapon
- Location matters: gut wounds are survivable with treatment; CNS hits are not

**Recovery follows realism:**
- Field medicine stabilizes; real healing takes time
- A ship's medbay can recover almost any non-fatal injury
- Without advanced medicine, characters suffer debuffs for realistic healing periods—or may die from wounds
- Lost limbs can be replaced with augmentation, but not in the field

### Character Philosophy

**No class restrictions—characters evolve freely.**

Players define their character through a combination of:
- **Stats** (physical and mental attributes)
- **Skills** (granular competencies, grouped into categories)
- **Traits/Perks** (capabilities that change how you play)
- **Equipment** (gear defines tactical role as much as skills)

Characters are not locked into archetypes. An engineer can become a sniper. A medic can train into demolitions. Progression is player-directed.

**Traits should feel meaningful:**
- Avoid small numerical bonuses (+5% damage)
- Prefer capabilities that change playstyle (50% bonus headshot damage → "now I hunt for headshots")
- Qualitative traits are ideal (thermal invisibility, breach expertise, zero-g combat mastery)

**Physical stats can improve through training. Mental stats are more fixed.**

### Agency & Consequences

**The system should not create unwinnable situations through randomness or GM fiat.**

This is nuanced. Players should *not* always see danger coming—especially if they made poor decisions. If players fail to conduct recon when entering an area where they've been given reasonable clues that enemies could be operating, the GM is within their rights to spring an ambush.

**What we want to avoid:**
- Players in a "safe" location get ambushed by commandos and party-wiped in round one with no warning
- Players who anticipated a fight and positioned well lose a veteran to a lucky headshot
- Deaths that feel arbitrary rather than consequential

**What is acceptable:**
- Players who skip recon walk into an ambush they could have detected
- Reckless advances result in casualties
- Accumulated wounds and poor resource management lead to death

**Morale/stress systems should provide warning** before breaking points—players see it coming and can make decisions. **Combat veterans get protective options** even in ambushes. But consequences are real: characters can and will die from genuinely poor decisions.

### Tactical Depth

**Smart play is rewarded mechanically, not just narratively.**

- Cover provides real protection
- Suppression restricts enemy actions
- Flanking creates vulnerability
- Ambushes are devastating (but work both ways)
- Recon (passive and active) reveals threats before they become lethal
- Equipment choices create tradeoffs (weight, volume, capability)

### Resource Realism

**Everything is tracked because the VTT makes it painless.**

The digital platform allows granular tracking that would be tedious with pencil and paper:
- Ammunition (bullets, charges, fuel, missiles—not abstracted)
- Medical supplies (stimulants, biogel, bandages, surgical tools—not just "medkits")
- Consumables (drone batteries, grenades, flares)
- Armor condition (plates/pads degrade and must be replaced)
- Carrying capacity (weight and volume, with tradeoffs for loadout)
- Ship resources (fuel, supplies, maintenance)

**Players make meaningful loadout decisions:**
- Combat pouches for essentials vs. packs for extended operations
- Heavy armor vs. mobility
- Specialized gear vs. versatility
- What to carry vs. what to leave on the ship

---

## Turn Structure (Under Development)

### Current Direction: Initiative with Protective Reactions

**Core idea:** Initiative-based turns, but characters can take limited **Protective Actions** outside their turn to avoid being helplessly exposed.

**The Problem with Pure Initiative:**
In standard initiative systems, a faster enemy can move to flank a character who then sits motionless until their turn—unrealistic and frustrating. A commando shouldn't be able to dash 90 degrees around a target while they stand still like a statue.

**Protective Actions (proposed):**
When an enemy's action would expose or endanger a character (flanking movement, incoming attack), the character may spend a **Reaction** to take a limited protective action:
- Drop prone
- Crouch behind cover
- Sidestep to maintain cover
- Raise shield

These don't allow full movement or attacks—just reasonable self-preservation that a trained person would instinctively do.

**Ambush Rules:**
- Successful ambushes deny normal turns for the first round
- Combat veterans may take a single Protective Action (hit the dirt, dive to nearby cover)
- Non-veterans are caught in the open
- Ambushers get full actions with advantage

**This needs playtesting to validate.**

---

## Fog of War & Recon

### Hidden Information

- Enemy positions are unknown until detected
- Detection requires line of sight, sensors, or successful recon
- Enemies can also fail to detect players—ambushes work both ways

### Passive Recon

Some characters are more alert than others. High-awareness characters may:
- Notice environmental clues (disturbed ground, sounds, movement)
- Get "bad feeling" warnings before walking into ambushes
- Spot concealed enemies at greater range

This happens automatically based on skills/traits—no action required.

### Active Recon

Players can choose to scout:
- Visual observation (binoculars, scopes, drones)
- Sensor sweeps (motion, thermal, EM)
- Overwatch positions (spotters calling out contacts)
- Drone reconnaissance

Active recon takes time and may reveal the scouts, but dramatically improves situational awareness.

### Combat Veterans

Characters with significant combat experience:
- Habitually position near cover (better starting positions)
- React faster to ambushes (limited protective action)
- Higher passive awareness
- Stress immunity or high tolerance

---

## Stress & Morale

### Design Goal

Stress should create tension and consequences without stealing player agency through arbitrary dice rolls. Players see it building and can make decisions—it's not a surprise "you panic" moment.

### Stress Accumulation

Stress points accumulate from:
- Taking fire (even misses)
- Taking wounds (severity matters)
- Seeing allies wounded
- Seeing allies killed
- Horrific sights
- Extended combat without rest
- Near-death experiences

Players can see their stress level **at all times**. Approaching a breakpoint is visible—players know they're at risk.

### Stress Thresholds by Experience

| Experience Level | Breakpoint 1 | Breakpoint 2 | Breakpoint 3 | Breakpoint 4 |
|------------------|--------------|--------------|--------------|--------------|
| Raw recruit | 20 | 35 | 50 | 65 |
| Trained soldier | 40 | 60 | 80 | 100 |
| Veteran | 70 | 100 | 130 | 160 |
| Elite operator | Immune | Immune | 150 | 200 |

*Numbers are illustrative—to be tuned through playtesting.*

### Stress Reduction

- **Rally**: Leader uses action to reduce squad stress
- **Fall back**: Reaching safety reduces stress over time
- **Stims**: Chemical suppression (temporary, may have side effects)
- **Rest**: Extended rest between encounters clears stress

### Agency Preservation

The key is **visibility and choice**:
- Players see stress building
- Players can pull back stressed characters before they break
- Players can have leaders rally the team
- Players can choose to push through at risk
- Breaking doesn't happen "suddenly" from a bad roll—it happens when accumulated stress crosses a visible threshold

---

## Character Creation (Framework)

### Attributes

**Physical:**
- Strength (carrying capacity, melee, physical tasks)
- Agility (movement, dodging, fine motor control)
- Endurance (stamina, wound tolerance, environmental resistance)

**Mental:**
- Perception (awareness, spotting, recon)
- Intelligence (technical skills, problem-solving, learning)
- Willpower (stress resistance, focus, morale)

*Physical attributes can improve through training. Mental attributes are largely fixed.*

### Skill Levels

Skills use **discrete levels** (not 0-100 sliding scales). Each level represents a qualitative jump in capability, not a gradual improvement.

| Level | Label | Description |
|-------|-------|-------------|
| 0 | Untrained | No formal training; rely on raw attributes |
| 1 | Novice | Basic training; knows fundamentals |
| 2 | Competent | Solid practitioner; reliable under normal conditions |
| 3 | Proficient | Experienced; handles stress and complexity well |
| 4 | Expert | Exceptional skill; recognized specialist |
| 5 | Master | Elite; among the best in the system |

**Design rationale:** When a character levels up a skill, it should *feel* significant. Leveling from 2 to 3 is a real milestone—not just +2% to some formula. Each level may unlock new capabilities or breakpoints in addition to improving base performance.

### Skill Groups

Characters have broad **Skill Groups** that cover related competencies. Within a group, related actions share competence—a rifleman can pick up an SMG and use it reasonably well.

| Skill Group | Covers |
|-------------|--------|
| **Firearms** | Rifles, pistols, SMGs, shotguns, mounted weapons |
| **Heavy Weapons** | Support weapons, launchers, emplaced weapons |
| **Melee** | Blades, bludgeons, unarmed, improvised |
| **Throwing** | Grenades, knives, improvised |
| **Tactics** | Squad coordination, breaching, ambush, defense |
| **Engineering** | Mechanical, electrical, structural |
| **Software** | Programming, hacking, AI systems |
| **Electronics** | Sensors, comms, ECM/ECCM |
| **Demolitions** | Breaching, traps, bomb disposal |
| **Security** | Locks, alarms, safes, countermeasures |
| **Medicine** | First aid, combat medicine, surgery |
| **Pharmacology** | Drugs, stims, poisons, anesthetics |
| **Cybernetics** | Installation, repair, diagnostics |
| **Spacecraft** | Small craft, capital ships, docking |
| **Atmospheric Flight** | Fixed wing, rotary, VTOL |
| **Ground Vehicles** | Wheeled, tracked, walkers |
| **Drones** | Recon, combat, utility |
| **Persuasion** | Negotiation, diplomacy, seduction |
| **Deception** | Lying, disguise, misdirection |
| **Intimidation** | Threats, interrogation, presence |
| **Streetwise** | Contacts, black market, criminal culture |
| **Awareness** | Observation, alertness, search |
| **Stealth** | Concealment, silent movement, camouflage |
| **Navigation** | Pathfinding, tracking, orienteering |
| **Environment** | Vacuum, toxic, extreme temp, zero-G |

### Specializations (Perk-Like Unlocks)

**Specializations** are not separate skills with their own levels. They are **unlockable capabilities** that enhance a skill group for specific applications.

**How they work:**
- You either **have** a specialization or you **don't**
- Having a specialization grants bonuses/capabilities for that specific use case
- The specialization's effectiveness **scales with your base skill level**
- Some advanced techniques **require** a specialization to even attempt

**Example: Precision Shooting (specialization for Firearms)**

A character with Firearms 3 and no specializations:
- Uses a sniper rifle competently at medium range
- Performance drops significantly at extreme range
- Cannot account for bullet drop, wind, breathing rhythm

A character with Firearms 3 + *Precision Shooting*:
- Full effectiveness at long range
- Can account for environmental factors
- Unlocks "called shot" techniques at extreme distance

A character with Firearms 5 + *Precision Shooting*:
- Master-level sniper
- Can make shots others consider impossible

A character with Firearms 5 and no *Precision Shooting*:
- Still better than Firearms 3 at long range
- But experiences significant dropoff compared to a specialist
- Cannot use advanced sniping techniques

**Sample Specializations:**

| Skill Group | Specializations |
|-------------|-----------------|
| Firearms | Precision Shooting, Rapid Fire, Close Quarters, Mounted Weapons |
| Heavy Weapons | Anti-Armor, Suppression Tactics, Indirect Fire |
| Melee | Blade Fighting, Grappling, Improvised Weapons |
| Tactics | Breaching, Ambush, Fire Team Leader, Zero-G Combat |
| Medicine | Trauma Surgery, Combat Stims, Field Prosthetics |
| Software | Intrusion, AI Manipulation, Cryptography |
| Spacecraft | Combat Maneuvers, Stealth Operations, Emergency Procedures |
| Stealth | Assassination, Infiltration, Counter-Surveillance |

### Traits/Perks

Beyond specializations, **Traits** provide unique capabilities that don't fit the skill system.

**Qualitative (new capability):**
- *Thermal Signature Masking*: Invisible to thermal sensors when stationary
- *Breach Expert*: Can breach locked doors silently
- *Zero-G Native*: No penalties in microgravity
- *Iron Constitution*: Resistant to poisons and drugs

**Quantitative but Impactful:**
- *Killer Instinct*: Major bonus on finishing shots against wounded targets
- *Iron Will*: Double stress threshold before first breakpoint
- *Quick Hands*: Weapon swaps and reloads take half time

---

## Equipment & Loadout

### Carrying System

Characters have:
- **Combat Rig**: Pouches, holsters, belt—always accessible, limited capacity
- **Pack**: Larger capacity, may be dropped in combat, affects mobility
- **Armor Integration**: Some armor has built-in storage

### Weight & Volume

Every item has weight and volume. Exceeding capacity:
- Reduces movement speed
- Increases fatigue
- Imposes combat penalties

### Armor System

- Armor has **coverage** (what body parts) and **protection rating**
- Plates/pads can be damaged and must be replaced
- Heavy armor protects better but reduces mobility
- Shields provide active protection but require power/attention

### Weapon Categories

| Category | Lethality | Notes |
|----------|-----------|-------|
| Sidearms | Moderate | Concealable, backup |
| Rifles | High | Standard combat weapon |
| Heavy Weapons | Extreme | Require strength/armor, devastating |
| Melee | Variable | Silent, no ammo, close range risk |
| Explosives | Extreme/Area | Grenades, breaching charges, rockets |

---

## Scale of Play

### Typical Encounter

- 2–6 Player Characters
- 0–4 Allied NPCs (under player or GM control)
- 2–20 Enemy combatants
- Total combatants usually under 20

### Large Battles (Optional)

- GM may run larger engagements (up to ~100 per side)
- VTT automation handles NPC actions
- Players remain focus; battle is context

### Campaign Structure

- Players have a ship, move freely through the system
- Manage supplies, fuel, money, reputation
- Missions at squad scale even during larger conflicts
- Vehicle and space combat rules (to be developed)

---

## Core Dice Mechanics

### Design Philosophy

This game is built exclusively for a digital VTT. There is no need to optimize for:
- Physical dice rolling
- Mental math
- Memorizable formulas

Instead, we optimize for:
- **Gameplay outcomes** (formulas that produce the desired feel)
- **Granularity** (fine-grained modifiers the VTT calculates automatically)
- **Transparency through UI** (players see probabilities, not formulas)

### Player Experience

Players don't need to know the exact formulas. The VTT provides:
- A **character builder** that lets players experiment with builds
- **Comprehensive stats pages** showing how a character performs in various scenarios
- **Real-time probability displays** during combat (chance to hit, expected damage, etc.)

This allows us to use whatever mathematical structure produces the best gameplay, regardless of complexity.

---

## Hit Resolution System

### The Body as Contiguous Mass

When a player aims at a body part, they're not targeting an isolated hitbox—they're aiming at a region on a contiguous mass. Near-misses can hit adjacent regions.

**Example:** Aiming for the eyes (small target, hard to hit):
- Success: Hit the eyes
- Near miss: Hit the head (still potentially lethal)
- Poor shot: Hit the torso
- Complete miss: Hit nothing

**Example:** Aiming center-mass at an exposed torso:
- Highest probability of hitting *something*
- But if only stomach-up is exposed (enemy in cover), probabilities shift

### Attack Resolution Inputs

The algorithm considers:

**Attacker factors:**
- Relevant skill level
- Weapon accuracy and type
- Attack type (single shot, burst, aimed shot)
- Attacker status (wounded, suppressed, moving)

**Target selection:**
- Specific body region aimed at
- Size and position of that region
- Adjacent regions that might be hit on near-miss

**Defender factors:**
- Body layout (humanoid standard, armored, augmented)
- Armor and shields on each region
- Defensive stats (agility, size)
- Status (in cover, crouched, prone, moving)

**Environmental factors:**
- Range to target
- Visibility conditions
- Cover between attacker and defender

### Resolution Output

The system determines:
1. **Did anything get hit?** (complete miss vs. some hit)
2. **What region was hit?** (intended target or adjacent region)
3. **Was it blocked/mitigated?** (armor, shields, cover)
4. **What wound results?** (severity, type, effects)

---

## Wound System

### Core Concept: Wounds vs. Wound Effects

There is a critical distinction:

- **Wounds** are narrative descriptors: *".22 caliber gunshot wound to the left thigh"* or *"Acetylene torch burn on right forearm"*
- **Wound Effects** are the mechanical impacts: bleeding, pain, impairment, stress

Wounds are **tracked as single healable entities** with a narrative description. Wound effects are the **gameplay consequences** drawn from a well-defined system. This allows varied, realistic injuries while keeping the mechanical impact manageable.

### Wound Generation (Algorithmic)

Wounds are **not selected from a lookup table**. They are **dynamically generated** based on:

**Inputs:**
- Weapon characteristics (caliber, energy, damage type)
- Body region hit
- Armor/mitigation (reduced penetration = less severe wound)
- Hit quality (grazing vs. solid vs. critical)

**Output:**
- A narrative wound description
- A bundle of wound effects with severities
- Healing requirements

**Example:** A .22 pistol round hits an unarmored left leg.

*Generated wound:* ".22 caliber GSW, left thigh (muscle)"

*Effects:*
- Bleeding: Light
- Pain: Moderate
- Impairment: Limping (movement penalty)
- Stress: Moderate

**Example:** Same round, but target has light leg armor.

*Generated wound:* ".22 caliber GSW, left thigh (superficial, armor-mitigated)"

*Effects:*
- Bleeding: Minimal
- Pain: Minor
- Impairment: None
- Stress: Light

### Wound Effect Types

These are the **mechanical effects** wounds can produce. A wound may produce several effects simultaneously.

#### Bleeding

Blood loss over time. Multiple bleeds stack.

| Severity | Rate | Urgency |
|----------|------|---------|
| Minimal | Negligible | Self-resolving |
| Light | Slow drain | Minutes to address |
| Moderate | Steady drain | Needs treatment soon |
| Severe | Rapid drain | Immediate treatment required |
| Arterial | Critical | Seconds to unconsciousness |

**Blood Loss Track:** Characters have a blood meter with breakpoints:
- 75%: Minor debuffs (weakness)
- 50%: Moderate debuffs (dizziness, reduced accuracy)
- 25%: Severe debuffs (near-collapse, impaired cognition)
- 0%: Unconsciousness → death

#### Pain

Imposes penalties mitigated by character toughness (Endurance).

| Severity | Base Effect | Tough Character |
|----------|-------------|-----------------|
| Minor | Small penalty | Shrugged off |
| Moderate | Noticeable penalty | Small penalty |
| Severe | Major penalty | Moderate penalty |
| Overwhelming | Incapacitating | Major penalty |

#### Physical Impairment

Functional limitations based on wound location.

| Type | Cause | Effect |
|------|-------|--------|
| Limping | Leg/foot wound | Movement speed reduced |
| Arm impairment | Arm/shoulder wound | Penalty to actions using that arm |
| Hand impairment | Hand/wrist wound | Severe penalty to manipulation |
| Immobilized limb | Broken bone, tendon damage | Limb unusable |
| Lost limb | Traumatic amputation | Permanent (until augmentation) |
| Torso trauma | Organ damage | General debuffs, internal bleeding |

#### Sensory Impairment

| Type | Cause | Effect | Duration |
|------|-------|--------|----------|
| Dazzled | Flash, bright light | Accuracy penalty | Short |
| Blurred vision | Blood in eyes, concussion | Perception penalty | Until cleared |
| Partial blindness | Eye damage | Severe perception penalty | Permanent |
| Full blindness | Both eyes destroyed | Cannot target visually | Permanent |
| Hearing impaired | Explosion, sonic | Communication/awareness penalty | Variable |
| Concussed | Head trauma | Penalty to all actions | Hours–days |

#### Stress/Morale Impact

All wounds cause stress in addition to physical effects:

| Wound Severity | Stress Impact |
|----------------|---------------|
| Minor wound | Light stress |
| Moderate wound | Moderate stress |
| Severe wound | Heavy stress |
| Near-fatal wound | Extreme stress |

### Critical/Fatal Wounds

Some wounds are immediately life-threatening or fatal:

| Location | Unarmored Result | Armored Result |
|----------|------------------|----------------|
| Head (CNS) | Fatal | Severe trauma, possible death |
| Heart | Fatal | Severe trauma, possible death |
| Spine | Paralysis or death | Severe trauma |
| Major artery | Fatal in seconds | Arterial bleed |
| Organ rupture | Fatal without surgery | Severe internal damage |

### Healing

Healing is also **dynamic based on wound characteristics**:

| Wound Type | Field Treatment | Medbay Treatment | Natural Healing |
|------------|-----------------|------------------|-----------------|
| Superficial | First aid clears | Quick | Days |
| Moderate | Stabilizes, debuffs remain | Full recovery | Weeks |
| Severe | Stabilizes only | Full recovery (slow) | Months |
| Critical | Buys time only | Possible recovery | Not possible |
| Lost limb | Stabilize stump | Augmentation required | N/A |

### Morale Breakpoints

As stress accumulates, behavior becomes restricted:

| Level | Name | Effect |
|-------|------|--------|
| 0 | Calm | Full agency |
| 1 | Shaken | Unwilling to take *risky* maneuvers |
| 2 | Stressed | Unwilling to advance; will hold position and fire |
| 3 | Breaking | Will only take defensive actions; may freeze |
| 4 | Broken | Cowers, flees, or surrenders |

**Mitigation:**
- Veterans have higher thresholds (or immunity)
- Rally actions from leaders reduce stress
- Stims can temporarily suppress effects
- Reaching safety reduces stress over time

---

## Open Questions

1. **Turn Structure**: Initiative + Protective Reactions needs playtesting
2. **Exact Formulas**: Mathematical structure for hit resolution, wound severity
3. **Vehicle Combat**: Separate rules needed
4. **Space Combat**: Ship-scale rules needed
5. **Progression System**: XP? Milestone? How do stats/skills/specializations improve?
6. **NPC Stat Blocks**: How simplified for GM ease?
7. **Wound Interaction**: How do multiple wounds compound?

---

## Next Steps

1. Draft mathematical formulas for hit resolution
2. Define complete wound type list with specific effects
3. Finalize skill groups and specializations
4. Design sample traits/perks
5. Create equipment lists with stats
6. Prototype combat encounter for playtesting

---

*See also:*
- [[game/design-notes-raw|Raw Design Notes (Session 1)]]
- [[game/design-notes-raw-2|Raw Design Notes (Session 2)]]*
