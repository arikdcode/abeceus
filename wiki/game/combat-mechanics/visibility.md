# Visibility & Fog of War

## Status: Queued

This subsystem has not been designed yet. It is a prerequisite for meaningful tactical simulation (agents need to know what they can and can't see) and interacts heavily with several existing systems.

---

## Topics To Design

- **Line-of-sight mechanics**: Geometric (using the same spatial system as attack resolution)? Ray-based? Per-cell visibility on a grid?
- **Detection / perception checks**: Passive awareness (automatic, stat-based), active scanning (Focus channel action), equipment-assisted (sensors, drones, thermal)
- **Information asymmetry**: What do you know about enemies you can't currently see? Last known position? Estimated count? Nothing?
- **Concealment vs. detection**: Smoke, darkness, and camouflage already widen the accuracy cone (see [[combat-mechanics/attack-resolution|Attack Resolution]]). How do they interact with detection? Can you detect someone you can't accurately shoot?
- **Team information sharing**: Is a spotted target visible to the whole squad, or only to the spotter? Does calling out a target (Voice channel) share the information? How accurate is shared intel?
- **Sound-based detection**: Gunfire reveals position. Suppressed weapons reduce this. Movement noise varies by speed and terrain.
- **Stealth and ambush**: How does stealth skill interact with detection? How does an ambush establish information advantage?

---

## Interactions with Other Systems

- **[[combat-mechanics/attack-resolution|Attack Resolution]]**: Concealment already widens the accuracy cone. Visibility determines whether you have a target to shoot at in the first place.
- **[[combat-mechanics/contact-phase|Contact Phase]]**: The surprise modifier is essentially a visibility/detection outcome. A more formalized visibility system would feed into how surprise is determined.
- **[[combat-mechanics/action-economy|Action Economy]]**: Scanning uses the Focus channel. Active detection competes with aiming and other cognitive tasks.
- **[[combat-mechanics/reactions|Reactions]]**: Tracking a threat (reaction) requires knowing where the threat is. Visibility determines what threats you can react to.
- **Simulation Strategy**: Agents in the sim need a visibility model to make decisions. Without it, they have perfect information, which doesn't reflect real gameplay.

---

*This document will be expanded when we design the visibility system.*
