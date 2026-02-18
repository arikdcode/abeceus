# Wound System

## Design Decision: Pools + Structural Damage

No hit points. Instead, wounds are dynamically generated from attack inputs and produce effects across **three trackable pools** (Blood Loss, Pain, Stress) plus **persistent structural impairments** on specific body regions. Each wound is a unique narrative event with specific mechanical consequences.

### Core Principle

Wounds should feel real and consequential. A bullet to the thigh is not "-15 HP." It's a muscle tear with moderate bleeding, sharp pain, and a limp. The VTT generates, tracks, and displays all of this. Players never do wound math — they see their character's condition and act accordingly.

---

## The Three Pools

These are running totals tracked by the VTT in real time. They represent your character's overall physiological and psychological state.

### 1. Blood Loss

Starts at 0%. Increases over time based on active, untreated bleeding wounds. Each bleeding wound contributes a **bleed rate** that feeds this pool continuously.

| Threshold | Effect |
|-----------|--------|
| **0-25%** | Functional. No mechanical penalties. |
| **25-50%** | Lightheaded. Minor penalties to Focus-dependent actions (aiming, hacking). |
| **50-70%** | Seriously weakened. Major penalties across all actions. Movement reduced. Risk of passing out (Endurance check when exerting). |
| **70-90%** | Critical. Losing consciousness. Endurance check each round to remain awake. Cannot sprint. |
| **90-100%** | Dying. Unconscious. Death without immediate intervention. |

**Treatment**: Bandages and hemostatic agents reduce or stop bleed rates on individual wounds. Tourniquets stop limb bleeding entirely but the limb becomes unusable. Blood transfusion items (if available) directly reduce the blood loss percentage. A medbay can restore blood volume fully.

### 2. Pain

Starts at 0. Spikes with each wound. **Slowly decays** over time (adrenaline, your body adjusting) but remains elevated while wounds are untreated. Each wound adds a pain value based on type and severity.

| Threshold | Effect |
|-----------|--------|
| **Below tolerance** | Functional. Character is hurting but operating. Minor penalties to fine motor tasks. |
| **At tolerance** | Impaired. Actions take longer (channel time costs increase), accuracy drops, movement penalized. |
| **Above tolerance** | At risk of incapacitation. Willpower check to continue acting each round. |
| **Far above tolerance** | Incapacitated by pain. Cannot act until pain is managed. |

**Pain tolerance** is stat-based — derived from Endurance and combat experience. Veterans can take more punishment before it degrades their performance. Rookies have lower thresholds.

**Treatment**: Pain stims and analgesics push the tolerance threshold up temporarily. Consumable, limited supply. Side effects when they wear off (crash, jitteriness, dependency with repeated use). A medic can administer stronger pain management.

### 3. Stress / Morale

Accumulates from combat events — not just wounds. Taking fire, seeing allies hurt, horrific sights, extended combat without rest. Decays with rest, safety, and distance from combat.

| Threshold | Effect |
|-----------|--------|
| **Below threshold** | Alert, focused. Normal operation. |
| **Approaching threshold** | Shaken. Player can SEE the meter climbing. Minor penalties. Warning zone. |
| **At threshold** | At breaking point. Next shock event triggers a Willpower check to avoid panic. |
| **Above threshold** | Breaking. Severe penalties. May freeze, flee, or act irrationally. |
| **Far above** | Broken. Cannot function in combat. Must be removed from the situation. |

**Stress is visible and predictable.** The player always sees where they are on the meter. They can choose to fall back, take cover, catch their breath. Stress is a resource they manage, not a surprise that steals agency.

**Stress tolerance** is primarily experience-based. Hardened veterans may have near-immunity to combat stress. Rookies break faster. Specific traits can modify this (Iron Will, etc.).

**Stress sources**: Taking wounds (severity matters), seeing allies wounded, seeing allies killed, being suppressed (pinned by fire), horrific sights, extended combat, isolation.

**Stress reducers**: Rest, safety, successful actions (killing a threat, reaching cover), ally support/encouragement, specific items (mild sedatives — with tradeoffs).

---

## Structural Damage (One-Time Events)

Beyond the three pools, each wound can cause **structural damage** to the body region it hits. These are persistent impairments that last until healed.

### Body Region Structures

Each body region contains anatomical structures at different depths:

| Depth | Structures | Hit Severity Required |
|-------|------------|----------------------|
| **Surface** | Skin, superficial tissue | Any hit |
| **Shallow** | Muscle, tendons, minor blood vessels | Low-moderate |
| **Deep** | Bone, major blood vessels, nerves | Moderate-high |
| **Critical** | Organs (torso), CNS (head/spine), major arteries | High-extreme |

The wound's **severity** (determined by penetration that got through armor, weapon damage type, and hit quality) determines how deep the damage goes. A grazing hit damages surface tissue. A full-penetration rifle round reaches deep structures. A railgun round reaches critical structures.

### Structural Damage → Effects

When a structure is damaged, it automatically contributes to the pools AND creates persistent impairments:

| Structure Damaged | Pool Contributions | Persistent Impairment |
|-------------------|-------------------|----------------------|
| Skin/surface tissue | Minor pain, minimal bleed | None |
| Muscle | Moderate pain, light-moderate bleed | Reduced function of affected limb/region |
| Tendon | Sharp pain | Severe impairment to affected limb |
| Minor blood vessel | Moderate bleed | None (bleed is the issue) |
| Bone (fracture) | Severe pain, stress | Limb partially usable but movement restricted |
| Bone (break) | Extreme pain, high stress | Limb immobilized |
| Major blood vessel | Heavy-arterial bleed, shock | Rapid blood loss — minutes to treat |
| Nerve | Sharp pain then numbness | Loss of sensation/control in affected area |
| Organ (non-vital) | High pain, internal bleed, stress | Debuffs until surgical treatment |
| Organ (vital — heart, brain) | Catastrophic bleed, extreme pain | Near-instant incapacitation, death without extraordinary intervention |
| Eye | High pain, stress | Partial/full blindness |
| Ear | Moderate pain | Hearing impairment |

### Limb Loss / Traumatic Amputation

At extreme severity (catastrophic weapons like railguns, explosions at close range), a hit can cause traumatic amputation:
- Immediate massive blood loss (arterial bleed + volume)
- Extreme pain spike
- Extreme stress spike
- Permanent loss of limb function until augmentation/prosthetic
- Can be stabilized with tourniquet + trauma care, but the limb is gone

---

## Wound Generation Pipeline

When a hit penetrates armor (from the [[combat-mechanics/attack-resolution|Attack Resolution]] system):

### Inputs
- **Damage type**: Kinetic, thermal, plasma, electrical, chemical, explosive
- **Remaining penetration**: How much energy got through armor
- **Body region**: Which silhouette zone was hit
- **Hit quality**: Grazing, solid, critical (from how centered the cone sample was)
- **Environmental conditions**: Atmosphere, pressure, suit integrity

### Processing
1. **Determine severity** from remaining penetration + hit quality → maps to a depth (surface → critical)
2. **Check structures** at that depth in the hit region
3. **Generate structural damage** based on damage type (kinetic → impact/fracture, thermal → burn, etc.)
4. **Compute pool contributions**: Each damaged structure adds to Blood Loss rate, Pain value, and Stress value
5. **Generate impairments**: Persistent effects from structural damage
6. **Check environmental secondaries**: Suit breach? → chemical/vacuum/thermal exposure as additional damage event
7. **Output**: Narrative wound description + pool updates + impairment list + healing requirements

### Output Example

**Input**: 7.62mm kinetic round, moderate penetration (armor partially stopped), left thigh, solid hit.

**Generated wound**: "7.62mm GSW, left thigh — deep muscle damage, minor femoral vein involvement"

**Pool contributions**:
- Blood Loss rate: +Moderate (active bleed from vascular damage)
- Pain: +35 (deep tissue + vascular, sharp)
- Stress: +10 (wound shock)

**Persistent impairments**:
- Left leg: Limping (movement speed reduced ~40%, cannot sprint)

**Treatment needed**:
- Field: Hemostatic agent + pressure bandage to stop bleed. Pain stim for function.
- Medbay: Vascular repair + tissue regen. Full recovery in days.

---

**Input**: Railgun round, full penetration (armor failed), center chest, critical hit.

**Generated wound**: "Railgun penetration, center chest — catastrophic thoracic trauma, heart perforated, bilateral lung collapse"

**Pool contributions**:
- Blood Loss rate: +Catastrophic (heart perforated, massive internal hemorrhage)
- Pain: +100 (system shock, beyond pain threshold for almost anyone)
- Stress: +50 (mortal wound)

**Persistent impairments**:
- Incapacitated (unconscious within 1 round)
- Fatal without extraordinary intervention within 1-2 rounds

---

## Damage Types

Different weapons produce different damage profiles:

| Damage Type | Primary Effects | Secondary Effects |
|-------------|----------------|-------------------|
| **Kinetic** (ballistic, railgun) | Tissue penetration, bone fracture, organ damage | Fragmentation (if round breaks up) |
| **Thermal** (fire, plasma) | Burns (surface to deep), tissue charring | Pain spike, potential cauterization (may reduce bleed) |
| **Electrical** | Electrical burns, nerve disruption, cardiac risk | Muscle spasm, temporary paralysis |
| **Chemical** | Chemical burns, systemic poisoning | Ongoing damage if not decontaminated |
| **Explosive** | Fragmentation + concussive force, amputation risk | Wide area of structural damage, hearing damage |

### Environmental Secondaries

When a wound breaches protective equipment in a hostile environment:

| Environment | Secondary Effect |
|-------------|-----------------|
| Chemical atmosphere | Chemical burns on exposed wound, potential systemic poisoning |
| Vacuum | Decompression injury, rapid heat loss, suffocation risk |
| Extreme cold | Frostbite on exposed tissue, hypothermia acceleration |
| Extreme heat | Thermal burns on exposed tissue |
| Radiation | Radiation exposure through breach |

---

## Treatment Items (Examples)

| Item | Effect | Notes |
|------|--------|-------|
| Bandage/dressing | Reduces bleed rate on a wound | Basic, common |
| Hemostatic agent | Stops bleed on a wound rapidly | Faster than bandage, limited supply |
| Tourniquet | Stops all bleed from a limb | Limb becomes unusable, time-limited before permanent damage |
| Pain stim | Raises pain tolerance temporarily | Side effects when it wears off. Diminishing returns on repeated use |
| Blood transfusion pack | Directly reduces blood loss % | Heavy, bulky, valuable |
| Combat surgery tools | Can address deep structural damage in field | Requires Medicine skill, takes significant time |
| Bone stabilizer | Immobilizes fracture, reduces pain from movement | Doesn't heal — prevents worsening |
| Burn gel | Treats thermal/chemical burns, reduces ongoing pain | Specific to burn wounds |
| Decontamination kit | Clears chemical exposure | Prevents ongoing chemical damage |

---

## Interaction with Other Systems

- **[[combat-mechanics/attack-resolution|Attack Resolution]]**: Provides hit region, penetration, damage type, and hit quality. Wound system takes these inputs.
- **[[combat-mechanics/action-economy|Action Economy]]**: Wounds degrade action economy — pain increases channel time costs, physical impairments restrict what actions are available, blood loss limits exertion.
- **[[combat-mechanics/initiative|Initiative]]**: Turn order is NOT affected by wounds (design decision). Wounds affect what you can do, not when you act.
- **[[combat-mechanics/reactions|Reactions]]**: Wounds may reduce reaction budget (if wounded character is impaired/slowed).
- **Medical skills and items**: Treating wounds consumes action economy (Hands + Focus for medical tasks). Skilled medics do it faster and better (proficiency compresses time, may not need Focus).

---

## Open Design Questions (The Remaining ~20%)

- [ ] Exact pool thresholds and values — what numbers produce the right feel?
- [ ] Bleed rates per wound severity — how fast does blood loss accumulate?
- [ ] Pain values per wound type — how quickly does pain stack?
- [ ] Pain decay rate — how fast does adrenaline/adjustment reduce pain?
- [ ] Structure definitions per body region — complete anatomical mapping for the wound generator
- [ ] Severity-to-depth mapping — exactly how much penetration reaches each structural depth?
- [ ] Damage type interactions — does plasma cauterize (reducing bleed but increasing burn)? Does explosive damage automatically involve concussion?
- [ ] Multiple wound compounding — do overlapping wounds to the same region worsen each other?
- [ ] Healing timelines — how long does each wound type take to heal at each treatment tier?
- [ ] Treatment skill checks — does medical treatment require a check, or is it automatic with the right supplies?
- [ ] Limb damage tracking — do limbs have their own "structural integrity" that degrades with multiple hits?
- [ ] Unconsciousness mechanics — what happens when you're knocked out? Can allies revive you?
