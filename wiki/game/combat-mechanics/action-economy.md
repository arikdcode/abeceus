# Action Economy

## Design Decision: Channel-Based Concurrency

Actions are not sequential slots (like D&D's Move + Action + Bonus Action). Instead, characters have access to **parallel channels** that operate concurrently during a turn. A turn represents ~5 seconds of activity. Each channel has the full turn duration available, and actions consume time within their channels.

### Core Principle

The action economy should reflect embodied reasoning: "What am I doing with my hands? Where am I going? What am I paying attention to?" Players should be able to imagine themselves in the space and intuit what their character can and can't do simultaneously. The VTT handles channel validation — players queue up desired actions and see what's compatible.

---

## The Four Channels

| Channel | Governs | Examples |
|---------|---------|----------|
| **Hands** | Weapon manipulation, throwing, reloading, medical tasks, object interaction | Firing a rifle, throwing a grenade, applying a bandage, placing a breaching charge, reloading |
| **Legs** | Movement, posture changes | Walking, running, sprinting, going prone, standing up, crouching, kneeling |
| **Focus** | Attention, concentration, observation, cognitive tasks | Aiming carefully, scanning surroundings, hacking a terminal, tracking a moving target, programming a drone |
| **Voice** | Communication | Callouts, warnings, coordination, requesting support |

### Channel Rules

1. **Across channels, actions are concurrent.** If two actions use different channels, they happen at the same time. Walking (Legs) while firing (Hands) while scanning (Focus) — all concurrent.

2. **Within a channel, actions are sequential.** If two actions need the same channel, they queue up and consume time from that channel's budget. Reload (Hands, ~2s) then snap shot (Hands, ~1s) = 3s of the Hands channel used.

3. **A turn's total duration is the longest channel.** If your Hands are busy for 4s and your Legs for 2s, your turn takes ~5s (capped at the turn length). Both channels were active concurrently — the hands just had more to do.

4. **Voice almost never conflicts.** Brief callouts and communication are fast enough (~0.5s) and use a channel that rarely overlaps with anything. In practice, players can almost always talk. The VTT reflects this — Voice actions are nearly always available. Extended conversation or complex communication (briefing, negotiation) would consume Focus as well.

5. **Channel conflicts prevent combination.** If two actions both require the same channel for overlapping time, you must choose or sequence them. You cannot aim carefully (Focus, sustained) and scan surroundings (Focus) at the same time.

---

## Time Within Channels

Each action has a **time cost** (in seconds, within a ~5 second turn). Actions consume time from the channels they use. If the total time consumed in any single channel exceeds the turn duration, the action doesn't fit.

This naturally prevents absurdity without artificial "once per turn" limits:
- A snap shot takes ~1s of Hands + ~0.5s of Focus. You could fit 3-4 in a turn if stationary and dedicated.
- An aimed shot takes ~3-4s of Hands + Focus simultaneously. Eats most of your turn's capacity.
- A breaching charge placement takes ~5s of Hands + Focus. Consumes the entire turn. Can't do anything else meaningful with those channels.

### Proficiency Compresses Time

Skill and experience reduce the time cost of actions within their channels. This is how proficiency expands what a character can do per turn:

- A **veteran marksman** might fire an aimed shot in 2.5s instead of 4s, leaving time for a quick scan or a snap shot.
- A **skilled medic** can bandage in 2s using only Hands (muscle memory — no Focus needed), whereas an unskilled character takes 4s and needs both Hands + Focus (has to look at what they're doing, concentrate on the task).
- A **trained grenadier** might throw and duck in 1.5s total, whereas an untrained character fumbles for 3s.

This means experienced characters don't just perform better — they can **do more things per turn**. A veteran's turn looks fluid and efficient. A rookie's turn is consumed by one or two clumsy actions.

---

## Interaction Between Channels

Some actions span multiple channels. The key interactions:

### Movement + Hands (Run and Gun)
- Walking (Legs) + firing (Hands) is always possible.
- **Accuracy penalty** applies when Legs are active during firing. Walking = minor penalty. Running = major penalty. Sprinting = can't effectively use Hands for aiming at all.

### Movement + Focus (Situational Awareness While Moving)
- Walking + scanning (Focus) works fine.
- Running + scanning has reduced effectiveness (Focus is partially consumed by navigating at speed).
- Sprinting consumes significant Focus (navigating terrain at full speed) — observation is minimal.

### Hands + Focus (Skilled vs. Unskilled)
- Many Hands actions require Focus for unskilled characters (bandaging, reloading unfamiliar weapons, operating unknown equipment).
- Proficiency removes the Focus requirement, freeing it for observation or other cognitive tasks.
- Some actions always require Focus regardless of skill (aimed shots, hacking, drone programming).

---

## Example Turns

### Veteran Sniper (Stationary)
- **Legs**: Idle (stationary, braced)
- **Hands**: Aimed shot (~3s)
- **Focus**: Aiming (~3s, overlaps with Hands), then scan surroundings (~1.5s)
- **Voice**: "Target down." (~0.5s)
- *Result*: Precise shot with bonus accuracy from stationary + aimed. Quick scan after firing. Callout to team.

### Aggressive Rifleman (Moving)
- **Legs**: Run to new cover (~3s, 6-8m)
- **Hands**: Snap shot (~1s) + snap shot (~1s)
- **Focus**: Tracking targets (~2s, concurrent)
- **Voice**: "Moving up!" (~0.5s)
- *Result*: Two quick shots while running. Accuracy penalized by movement. Relocates to better position.

### Skilled Medic (Treating Ally)
- **Legs**: Kneeling beside ally (~0.5s, then stationary)
- **Hands**: Apply bandage (~2s, skilled — muscle memory)
- **Focus**: Scanning surroundings (~4s, free because bandaging doesn't need it)
- **Voice**: "Patching you up, cover me." (~1s)
- *Result*: Efficiently bandages ally while maintaining situational awareness. Could potentially spot a flanking enemy.

### Unskilled Character (Treating Ally)
- **Legs**: Kneeling beside ally (~0.5s, then stationary)
- **Hands**: Apply bandage (~4s, unskilled — clumsy, slow)
- **Focus**: Concentrating on bandaging (~4s, required — has to look at what they're doing)
- **Voice**: "I'm... trying..." (~0.5s)
- *Result*: Consumes almost the entire turn. No awareness of surroundings. Extremely vulnerable.

### Full Sprint
- **Legs**: Sprint (~5s, maximum distance)
- **Hands**: Free but can't aim (too much body movement)
- **Focus**: Navigating terrain (~3s), quick glance (~1s)
- **Voice**: Free
- *Result*: Maximum repositioning. No offensive capability. Minimal awareness.

---

## VTT Presentation

The channel system runs underneath. Players don't manually manage channels. Instead:

1. Player selects desired actions from an available list (move here, shoot this, use this item, etc.)
2. VTT calculates channel usage and time costs based on character skills/stats
3. Incompatible actions are **grayed out** with hover-over explanations ("Can't scan — Focus is committed to aiming")
4. Compatible actions are highlighted
5. Player confirms their turn
6. VTT resolves all concurrent actions

The goal: players think "what does my character do?" and the system tells them what's possible. After a few sessions, they develop intuition and rarely hit conflicts — just like in reality, you develop a sense of what you can and can't do simultaneously.

---

## Open Design Questions

- [ ] Exact time costs for core actions (snap shot, aimed shot, reload, grenade throw, bandage, etc.)
- [ ] How much does proficiency compress time? Linear reduction? Threshold-based (skill 3 = "quick" version)?
- [ ] Sprint mechanics: how much extra distance? Does it fully prevent Hands use or just penalize it heavily?
- [ ] Can you "interrupt" a channel mid-action? (e.g., start aiming, then see a grenade and dive — abandoning the aim)
- [ ] **Protective actions / reactions** — how do out-of-turn actions interact with the channel system? Does reacting consume channel time from your upcoming turn, or is it a separate budget?
- [ ] **Specific action catalog** — full list of actions with channel requirements and time costs
- [ ] **Stat/skill effects** — which stats compress action times? Which reduce channel requirements? General rules vs. per-action definitions?
- [ ] How does gear affect action times? (e.g., a heavier weapon is slower to aim, a simpler weapon is faster to reload)
- [ ] Banking: can unused channel time carry over to the next turn? (Probably not — but worth considering)
