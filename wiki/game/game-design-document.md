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

**The system should not steal agency through bad luck.**

- Players should see danger coming and have the chance to respond
- Morale/stress systems should provide warning before breaking points
- Even in ambushes, combat veterans should have limited protective options
- Death should result from accumulated mistakes or genuinely poor decisions, not pure randomness

**But consequences must be real:**
- Characters can and will die
- Injuries degrade performance
- Resources deplete
- Reckless play is punished

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

Stress should create tension and consequences without stealing player agency through arbitrary dice rolls.

### Proposed Approach: Visible Stress Accumulation

- Stressful events (taking fire, seeing allies wounded, horrific sights) add **Stress Points**
- Players can see their stress level at all times
- Approaching the **Breaking Point** is visible—players know they're at risk
- At or past the breaking point, negative effects occur (shaking hands, panic, freezing)
- Players can take actions to reduce stress (fall back, rally, use stims)

### Stress Tolerance

- Raw recruits: Low tolerance, break easily
- Experienced soldiers: Moderate tolerance
- Veterans: High tolerance
- Elite operators: May be immune to normal combat stress

### This Preserves Agency

Players see stress building and can make tactical decisions:
- Pull back a stressed character before they break
- Have the squad leader rally the team
- Use medical intervention
- Accept the risk and push forward

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

### Skills (Granular List—To Be Consolidated)

Start comprehensive, then group for gameplay:

**Combat:**
- Rifles, Pistols, Heavy Weapons, Melee, Throwing
- Tactics, Suppression, Breaching, Zero-G Combat

**Technical:**
- Mechanical Engineering, Electrical Engineering, Software
- Demolitions, Lockpicking, Security Systems
- Sensors, Communications, ECM/ECCM

**Medical:**
- First Aid, Combat Medicine, Surgery
- Pharmacology, Cybernetics, Xenobiology

**Piloting:**
- Spacecraft, Atmospheric Craft, Ground Vehicles
- Drones, EVA, Docking/Navigation

**Social:**
- Negotiation, Intimidation, Deception, Persuasion
- Streetwise, Contacts, Investigation

**Survival:**
- Navigation, Tracking, Stealth, Foraging
- Environmental Adaptation (vacuum, toxic, extreme temp)

### Traits/Perks

Examples of good trait design:

**Qualitative (new capability):**
- *Thermal Cloak Mastery*: Invisible to thermal sensors when stationary
- *Breach Specialist*: Can breach locked doors silently
- *Zero-G Native*: No penalties in microgravity

**Quantitative but Impactful:**
- *Marksman*: +50% damage on aimed headshots
- *Iron Will*: Double stress threshold
- *Combat Medic*: Stabilize wounds in half the time

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

## Open Questions

1. **Turn Structure**: Initiative + Protective Reactions needs playtesting
2. **Dice System**: Not yet specified (d20? d100? dice pools?)
3. **Hit Location**: How detailed? (zones vs. specific body parts)
4. **Vehicle Combat**: Separate rules needed
5. **Space Combat**: Ship-scale rules needed
6. **Progression System**: XP? Milestone? How do stats/skills improve?
7. **NPC Stat Blocks**: How simplified for GM ease?

---

## Next Steps

1. Define core dice mechanic (what dice, what target numbers)
2. Draft hit/wound resolution system
3. Build skill list and consolidation groups
4. Design sample traits/perks
5. Create equipment lists with stats
6. Prototype combat encounter for playtesting

---

*See also: [[game/design-notes-raw|Raw Design Notes]] for original brainstorming.*
