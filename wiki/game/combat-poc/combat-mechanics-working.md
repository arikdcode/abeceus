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

### 2. Contact Phase *(High-level decided, details TBD)*
**Full doc**: [[combat-mechanics/contact-phase|Contact Phase]]

Pre-combat positioning step. Every combatant gets an Awareness-based check to position before the first turn. Result tiers (Excellent → Failure) determine how much reactive positioning you get. Veterans have hard floors — certain bad outcomes are impossible for high-skill characters. Ambushes penalize the check, they don't skip it. Works in tandem with deterministic initiative to prevent alpha-strike wipes.

### 3. Core Design Principle: Randomness vs. Uncertainty
Randomness (dice rolls) creates unpredictability players cannot reason about. Uncertainty (enemy decisions) creates unpredictability players CAN reason about and is where tactical depth lives. The system should minimize randomness where it doesn't create meaningful decisions, and rely on behavioral uncertainty for engagement. This principle informs all subsystem designs.

---

## Open Design Threads

### Action Economy *(Direction decided, details TBD)*
**Full doc**: [[combat-mechanics/action-economy|Action Economy]]

Channel-based concurrency model. Four channels: Hands, Legs, Focus, Voice. Actions consume time within channels. Across channels, actions are concurrent. Within a channel, actions queue sequentially. Proficiency compresses action times and can remove channel requirements (e.g., skilled medic doesn't need Focus to bandage). VTT handles channel validation — players pick actions, system shows what's compatible. Still need: specific action catalog, time costs, proficiency effects, protective actions/reactions.

### Protective Actions / Reactions *(Queued — next up)*
Out-of-turn defensive actions. Characters should never be "frozen" while visible threats develop. Key question: how do reactions interact with the channel system? Does reacting consume channel time from your upcoming turn, or separate budget? Reaction pool concept (limited reactions per round). Grenade reactions should probably be free. Need to define scope, types, and limits of protective actions.

### Attack Resolution Pipeline *(Queued)*
Hit probability → hit region → armor check → penetration → wound generation. Multi-step pipeline established conceptually, needs mechanical precision.

### Contact Phase Details *(Queued)*
Hard floors at skill thresholds, exact check mechanic, interaction with gear (ditch pack?), offensive micro-actions, definition of "complete surprise."

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

