# Combat Mechanics - Working Document

This document captures design decisions as we work toward a simulatable combat system. The [[game/game-design-document|Game Design Document]] remains the philosophical reference; this document is where we get specific about implementation.

---

## Status

**Current Phase**: Pre-implementation design discussion

**Goal**: Arrive at a sufficiently precise mechanical design that can be implemented as a Python simulation for playtesting and tuning.

---

## Decisions Made

### 1. Deterministic Initiative *(Decided)*
**Full doc**: [[combat-mechanics/initiative|Initiative & Turn Order]]

Initiative is a character stat that directly determines turn order. Higher goes first. No large random component. Within-tier ties are resolved by forced alternation between sides (coin flip for which side leads, then alternate). Turn order is static for the duration of combat — wounds affect action economy, not turn position. Gear modifiers (heavy loadout = slower) create loadout-level tactical decisions.

### 2. Contact Phase *(Decided)*
**Full doc**: [[combat-mechanics/contact-phase|Contact Phase]]

Universal reaction round before the first initiative turn. Mechanically uses the same system as defensive reactions — stat-based time budget, defensive/preparatory actions only. GM sets a surprise modifier (100% for expected combat down to ~10-20% for ambush, 0% only for complete surprise which is extremely rare). Slight random variance on the budget, but veterans always have enough floor to do something meaningful. Preparatory actions allowed (ready weapon, change ammo, ditch pack) but no offensive actions. All positioning resolves simultaneously. Ambushers get full budget + optimal positioning. Hard floors rise with stats.

### 3. Core Design Principle: Randomness vs. Uncertainty
Randomness (dice rolls) creates unpredictability players cannot reason about. Uncertainty (enemy decisions) creates unpredictability players CAN reason about and is where tactical depth lives. The system should minimize randomness where it doesn't create meaningful decisions, and rely on behavioral uncertainty for engagement. This principle informs all subsystem designs.

---

## Open Design Threads

### Action Economy *(Direction decided, details TBD)*
**Full doc**: [[combat-mechanics/action-economy|Action Economy]]

Channel-based concurrency model. Four channels: Hands, Legs, Focus, Voice. Actions consume time within channels. Across channels, actions are concurrent. Within a channel, actions queue sequentially. Proficiency compresses action times and can remove channel requirements (e.g., skilled medic doesn't need Focus to bandage). VTT handles channel validation — players pick actions, system shows what's compatible. Still need: specific action catalog, time costs, proficiency effects, protective actions/reactions.

### Protective Actions / Reactions *(Direction decided, details TBD)*
**Full doc**: [[combat-mechanics/reactions|Protective Actions & Reactions]]

Two separate systems: defensive reactions (separate stat-based budget, repositioning only, no offensive actions, no cascading) and overwatch (deliberate turn action, conditional shot at targets entering a watched zone, player chooses when to fire). Reaction budget is stat-based — veterans can respond to multiple threats, rookies get overwhelmed. Overwatch costs your full turn but is tactically powerful. The two budgets are independent — you can react defensively while on overwatch. Playtest note: try a shared action/reaction pool as alternative to separate budgets.

### Attack Resolution *(Direction decided, details TBD)*
**Full doc**: [[combat-mechanics/attack-resolution|Attack Resolution]]

Cone-based geometric model. Accuracy angle (from skill, weapon, conditions) projects a spread at range. Random point sampled within spread, checked against target's 2D silhouette. Whatever region it lands on is what gets hit — no separate hit roll + drift table needed. Cover clips the silhouette geometrically. Armor uses penetration-vs-protection with per-plate spatial tracking and durability. VTT displays cone overlay, hit probabilities, and armor condition. No probability clamping (0–100%). Burst fire = multiple cone samples. Still need: exact accuracy angles, silhouette definitions, durability tuning, wound system (separate).

### Wound System *(Direction decided, details TBD)*
**Full doc**: [[combat-mechanics/wounds|Wound System]]

No hit points. Three tracked pools: Blood Loss (cumulative, from bleed rates), Pain (spikes with wounds, slowly decays), and Stress/Morale (accumulates from combat events). Plus one-time structural impairments from anatomical damage (fractures, organ damage, limb loss). Wounds are dynamically generated from attack inputs (damage type, penetration, body region, hit quality, environment). Each body region has structures at increasing depths — severity determines how deep damage goes. Damage type determines wound profile (kinetic → impact/fracture, thermal → burns, etc.). Environmental secondaries when suits are breached. Treatment items and medical skill interact with all of this. Still need: exact pool thresholds, bleed/pain rates, complete body region structure definitions, severity-to-depth curves, treatment checks, healing timelines.

### Contact Phase Details *(Mostly resolved)*
Remaining: exact stat derivation (blocked on full stat system), exact variance range (playtest), per-character vs per-side surprise modifier.

### Cover & Positioning *(Queued)*
Flanking, elevation, concealment. How cover interacts with the silhouette system is partly defined in attack resolution (geometric clipping), but needs fuller treatment for dynamic positioning, destructible cover, and concealment vs. cover distinction.

---

## Discussion Log

### Session: Initiative Deep-Dive
**Approaches considered**: Side-based alternating, team initiative, individual initiative, streak cap, tick timeline, compressed ranges, simultaneous declaration, phase-based thresholds, deterministic flat scores.

**Key insight**: Randomness in turn order doesn't create interesting decisions — it's noise that occasionally produces catastrophic outcomes. Uncertainty from enemy behavior provides tactical depth without requiring random turn order.

**Conclusion**: Deterministic initiative with within-tier alternation. Solves the alpha-strike problem by design rather than by patching. Investment in initiative has clear, reliable payoff. Contact Phase handles the complementary problem of initial positioning.

### Session: Action Economy Direction
**Approaches considered**: Simple 2-action system (rejected — movement and actions are independent, not equivalent), D&D Move+Action+Side (rejected — too restrictive, no concurrency), Fallout AP pool (workable but sequential, doesn't capture concurrency), channel-based concurrency (selected), hybrid structured slots (rejected — too close to D&D's model).

**Key insight**: Humans perform multiple concurrent activities using independent resources (hands, legs, attention). The bottleneck is channel conflicts, not a single "action budget." A system that models this lets interesting combinations emerge naturally — a skilled medic bandages while scanning, a veteran sprints while maintaining awareness. Proficiency expands concurrency by compressing time and removing channel requirements.

**Conclusion**: Four-channel model (Hands, Legs, Focus, Voice). Actions consume time within channels. Cross-channel concurrency is the default. Within-channel actions queue sequentially. Voice rarely conflicts and is nearly always available. VTT manages channel validation — players think in terms of "what does my character do" and the system shows what's compatible. Proficiency compresses action times and can drop channel requirements, meaning experienced characters do more per turn.

### Session: Reactions & Overwatch
**Key design constraint**: Reactions must exist (no frozen characters) but cannot cascade (no infinite counter-reaction chains). This naturally leads to: reactions are defensive only.

**Conclusion**: Two separate systems. Defensive reactions use a stat-based budget (separate from action economy) for repositioning, going prone, tracking, bracing — no offensive actions. Overwatch is a deliberate turn action where you commit your action economy to watching a zone and choosing when to fire. The two budgets are independent. Veterans have larger reaction budgets, making them harder to flank/overwhelm. Acknowledged turn-based artifact: sequential flanking doesn't perfectly simulate simultaneous movement, but reaction budgets mitigate the worst of it.

### Session: Attack Resolution
**Approaches considered**: Flat roll + drift tables (rejected — two systems approximating one thing), multiplicative modifier formula (partially adopted for accuracy angle computation), cone-based geometric model (selected).

**Key insight**: A geometric accuracy cone projected onto a 2D target silhouette unifies hit probability, miss-drift, and range falloff into a single calculation. No separate hit roll, no drift tables — the geometry handles everything. Cover clips the silhouette (no separate cover modifier). Armor is spatial (per-plate protection + durability). The VTT computes and visualizes all of this.

**Conclusion**: Cone model with 2D Gaussian sampling. Accuracy angle derived from all combat factors (skill, weapon, attack type, conditions). Target silhouettes define hittable regions. Cover clips the silhouette geometrically. Armor uses penetration-vs-protection with per-plate durability tracking. No probability clamping — 0% to 100%. Burst fire = multiple cone samples. Emergent tactical gameplay: coordinated fire on damaged plates, plate swapping, calling out weak spots.

### Session: Contact Phase Resolution
**Problem**: The contact phase had a clear concept but no defined mechanic. We needed a check system, hard floor definitions, and rulings on edge cases (offensive actions, gear, surprise levels).

**Key insight**: The contact phase doesn't need its own mechanic — it's a universal reaction round using the same system as defensive reactions. Stat-based time budget, same action types. This is elegant because we don't need to design two separate systems.

**Decisions**: No offensive actions (preparatory OK — readying weapons, changing ammo, ditching packs). Ambush is a sliding scale, not binary — GM sets a surprise modifier as a percentage of normal reaction time. Complete surprise (0%) is extremely rare and a pure GM call. Cover proximity is not guaranteed by the system — if you're in the open, prone is your best bet. Hard floors rise with stats; veterans always get enough time to do something meaningful. Exact stat derivation blocked on full stat system design.

### Session: Wound System Direction
**Problem**: How do hits produce consequences that feel real and consequential, support the milsim philosophy, and create interesting decisions (triage, fallback, treatment) without degenerating into HP attrition?

**Key insight**: Wounds are narrative events; wound *effects* are mechanical. The system dynamically generates both from attack inputs, rather than using lookup tables. Body regions have anatomical structures at different depths. Wound severity determines how deep the damage reaches. This naturally produces a spectrum from minor grazes to catastrophic trauma without special-casing.

**Design**: Three tracked pools — Blood Loss (cumulative from bleed rates, creates time pressure), Pain (spikes then decays, crosses thresholds for impairment), Stress/Morale (from combat events, visible to player, agency-preserving). Plus one-time structural impairments: fractures restrict mobility, tendon damage reduces limb function, organ hits are potentially fatal. These are NOT pools — they're persistent conditions generated by the wound event.

**Conclusion at ~80%**: The pool model and generation pipeline are solid. Remaining work is quantitative: exact values for bleed rates, pain contributions, severity-to-depth mapping, complete body region structure definitions, and treatment effectiveness. These are tuning/content problems best resolved in simulation and playtesting.

