# Simulation Strategy

Working document for thinking through the simulation approach — what we want, why, and how.

*Status: Early ideation. Capturing thoughts, not committing to implementations.*

---

## Why Simulate?

The combat system is complex enough that intuition alone can't tune it. Making changes has a non-trivial impact on the strategy space and the enjoyability space. Empirical testing at scale is not optional — it's an essential part of the design process.

We need to be able to:

- **Validate mechanics**: Does the wound system produce the right lethality curve? Does cover matter enough? Too much?
- **Tune numbers**: Pain thresholds, stress multipliers, armor penetration values — these all need empirical testing at scale.
- **Test strategies**: Do certain tactics dominate? Is there a degenerate strategy that breaks the system?
- **Regression testing**: When we tweak a parameter, what ripples through the rest of the system? Run the full suite, get a readout. This is the game design equivalent of unit tests — not "did something break?" but "how did the game change when we changed the game?"

The dream: change a number, re-run 100K fights, see the impact in seconds.

---

## What We Want to Simulate

### Scenario Complexity Tiers

1. **1v1 duels** — Two combatants, fixed behavior.
2. **Small squad engagements** — 3v3, 5v5. Multiple characters with distinct loadouts.
3. **Asymmetric encounters** — Uneven sides, mixed force types, different equipment tiers.
4. **Full tactical scenarios** — Map geometry, cover positions, movement, multi-round decision-making.

### What "Good" Looks Like

We want to be able to say things like:
- "In a 3v3 with standard loadouts, the team that gets initiative wins 62% of the time. Is that too high?"
- "Flanking increases win rate by 15% — that feels right."
- "Heavy armor makes a soldier survive 2.3x longer but reduces their kill rate by 40%. Interesting tradeoff."
- "After the penetration nerf, armor is now *too* effective — 1v1s go to 12 rounds on average."
- "The 'suppress-and-flank' strategy beats 'hold-and-shoot' 70% of the time in open terrain but only 45% in dense urban maps."

---

## The Vision: Roll Hub as Scenario Editor

### The Idea

Roll Hub already has a map editor, token placement, and character management. Use it as the front end for building simulation scenarios:

1. A user (game designer, GM, playtester) opens Roll Hub
2. They create a map — place cover objects, define terrain, set up the environment visually
3. They drop characters onto the map — assign loadouts, stats, team assignments
4. They configure high-level strategy profiles for each side (aggressive, defensive, tactical, etc.)
5. They click **"Run Simulation"**
6. The engine runs the scenario N times (100, 1,000, 100K — configurable)
7. Results come back: statistics, win rates, strategy breakdowns, key insights

### Why This Matters

This turns encounter design from guesswork into science. Instead of a GM eyeballing a fight and hoping it's balanced, they get:
- Professional-grade playtesting at the click of a button
- Quantitative feedback on whether the encounter is winnable, how hard it is, what strategies work
- The ability to tweak and re-test instantly

No game system has ever offered this. D&D's encounter builder gives you a CR estimate and wishes you luck. This gives you a Monte Carlo simulation with genetic algorithm-discovered optimal strategies and an AI summary of the results.

### For Our Development Process

Before it's a product feature, this is our primary design tool. We set up scenarios, run sims, tune the system. The workflow:

1. Craft scenarios in Roll Hub (or define them in data files early on)
2. Run simulation via CLI or Roll Hub integration
3. Engine produces a detailed, dense power-user report (raw statistics, event distributions, strategy effectiveness)
4. An LLM agent reads the dense report and produces human-friendly insights and recommendations
5. We review, tweak parameters, re-run

The three-layer analysis pipeline:
- **Layer 1**: Raw simulation data (event logs, per-round state snapshots)
- **Layer 2**: Complex statistical report (aggregated metrics, distributions, correlations) — power-user readable
- **Layer 3**: AI-generated summary and insights — casual-user readable

First version: CLI tool. We define scenarios, run the sim, get the report, and the agent summarizes. Later: integrated into Roll Hub with a UI.

---

## One Engine, Two Modes

### The Principle

There is **one game engine**. Not a sim engine and a game engine. One codebase, one source of truth for all game rules.

The engine runs in two modes:

| | Interactive Mode | Simulation Mode |
|---|---|---|
| **Purpose** | Live gameplay with human players | Bulk automated analysis |
| **Input** | Human decisions via WebSocket | AI strategy functions |
| **Transport** | Socket.IO broadcast, transactions, UI state | None — direct function calls |
| **Output** | Real-time UI updates | Statistical reports, event logs |
| **Speed target** | ~30-100ms per action (fine) | As fast as possible |

The difference is just the I/O layer. The core — attribute DAG, mod evaluation, action execution, combat resolution — is identical. Simulation mode strips away the transport, the session management, the UI state packaging.

### Why One Engine

- **No rule drift.** Two implementations will diverge. Bug fixes in one won't propagate. The sim stops being a reliable predictor of actual gameplay.
- **The engine core is lean.** The overhead is in Socket.IO broadcasting, transaction packaging, state serialization. The actual rule computation is fast.
- **The engine code is manageable.** The core is roughly 5-10K lines. A language rewrite is feasible.

### Target Architecture: Rust

Long-term, the engine core will be rewritten in Rust:

- **Rust core**: Attribute DAG, mod evaluation, recomputation, combat resolution
- **Embedded JS VM** (QuickJS or V8): For procedural game logic (the action script layer)
- **WASM compilation target**: Same Rust core compiled to WASM for running in Node.js or the browser
- **Native compilation target**: For maximum-speed simulation runs
- **Auto-generated TypeScript types**: From Rust struct definitions (via `ts-rs` or similar), keeping the web client in sync

The entire game server could be Rust — HTTP API, WebSocket transport, session management, engine core. The JS VM is only for user-authored game scripts.

### Local Development Mode

For day-to-day development, Roll Hub should run as a lightweight local setup — no Kubernetes, no external API, no database. Just the game server and the web client talking to each other on localhost.

Key features:
- **File-system asset loading**: Instead of loading campaign assets from a database, load them directly from a folder on disk (e.g., `crucible/` for the new game system, or `vtt-srd-campaign/` for D&D)
- **Hot reloading**: When template files (mods, actions) change on disk, the engine picks up the changes automatically. Edit a mod YAML file, see the result in the UI immediately.
- **Sim mode in-process**: The simulation layer runs in the same process as the engine — no network hop, no serialization overhead. Direct function calls.

This gives a tight feedback loop: edit rules on disk → engine hot-reloads → see results in the UI or run a sim → iterate. The full Kubernetes/API/database stack is only needed for production deployment and multi-user sessions.

### Fork Strategy

The current Roll Hub codebase includes a full D&D SRD implementation. Rather than maintaining backward compatibility with D&D as we evolve the engine for Crucible:

- **Fork Roll Hub** into a new lineage focused on the Crucible system
- **Drop D&D support** in the fork — don't maintain or test SRD templates
- **Evolve the engine freely** for Crucible's needs (JS VM migration, combat resolution, geometric systems)
- The original Roll Hub repo remains as-is for reference
- If the engine matures enough, D&D could potentially be ported to the new engine later, but it's not a priority

### Performance Path

1. **Now → Near-term**: Build the new game system's templates and combat logic using the existing TypeScript Roll Hub engine. Get the rules right first.
2. **When performance matters**: Rewrite engine core in Rust. Same templates, same rules, faster runtime.
3. **Target**: 100K squad-level sims in under 60 seconds.

Don't prematurely optimize. Stabilize the rules, then go fast.

---

## Spatial Fidelity

The attack resolution system is inherently geometric (cones, silhouettes, cover clipping). The simulation should use **full geometric fidelity** — continuous 2D positions, exact line-of-sight, cone projections onto precise silhouettes. This matches what Roll Hub computes in an actual game.

If full geometric computation proves too slow at scale, fall back to grid-based approximation. But start with the ideal and optimize only when forced to.

---

## Scenario Design

### Human-Authored First

Scenarios will be hand-crafted, not procedurally generated. Each scenario is designed to focus on a particular aspect of the system:

- An open-field engagement (tests raw combat, no cover mechanics)
- A dense urban map (tests cover, concealment, flanking)
- A corridor/chokepoint (tests overwatch, suppression)
- An ambush scenario (tests contact phase, initiative, surprise)
- An asymmetric fight (tests lethality curves, equipment balance)

We build a library of scenarios over time. Eventually, the workflow is: describe a scenario at a high level, the agent (me) creates the data definition based on knowledge of the tools and system.

Procedural generation is a future possibility but not a priority.

### Replay Capability

Individual fights should be replayable — step through a simulation turn by turn, see what each agent decided, what the outcomes were. Essential for:

- Qualitative validation ("does this fight look like something a human would experience?")
- Debugging strategy behavior ("why did the agent do that?")
- Identifying edge cases and degenerate behavior
- Making the system understandable and trustworthy

---

## The Strategy Problem

This is the hard part. Not the engine, not the performance — the question of how to make simulated characters behave like reasonable humans.

*Status: Direction established, details to be discussed in a focused session.*

### The Action Space

Each turn, a character must decide what to do with each channel:

| Channel | Possible Actions |
|---------|-----------------|
| **Hands** | Fire at target (snap/aimed/burst), reload, use item (medkit, grenade, breaching charge), melee, do nothing |
| **Legs** | Move to position, go prone, stand up, crouch, sprint, do nothing |
| **Focus** | Aim at target, scan surroundings, operate equipment, do nothing |
| **Voice** | Callout target, rally allies, request support, do nothing |

Plus between turns:

| Budget | Possible Reactions |
|--------|-------------------|
| **Reaction** | Shift to cover, drop prone, track threat, brace in cover |

And overarching considerations:
- Which target to prioritize
- Whether to hold position or reposition
- When to go aggressive vs. defensive
- When to use consumables (grenades, stims, medkits)
- When to fall back

### The State an Agent Perceives

| Category | Information |
|----------|------------|
| **Self** | Position, cover quality, posture, health (blood/pain/stress), structural damage, ammo count, equipment, armor condition |
| **Allies** | Positions, approximate health, what they're doing this turn |
| **Enemies** | Known positions (fog of war), estimated health (from observed hits), last known actions |
| **Map** | Cover locations, distances, lines of sight, flanking angles |
| **Situation** | Turn order, round number, overall momentum (winning/losing) |

### Approach: Utility-Based AI with Evolutionary Optimization

#### Why Utility-Based

The action space is discrete and enumerable. The state has clear factors that humans would weigh. This is a natural fit for utility scoring — not neural networks, not hard-coded decision trees.

For each possible action, compute a utility score:

```
U(action) = w_survival * survival_factor(action, state)
           + w_damage   * damage_potential(action, state)
           + w_position * position_value(action, state)
           + w_team     * team_support(action, state)
           + w_resource * resource_efficiency(action, state)
           + w_stress   * stress_management(action, state)
```

The agent evaluates every legal action, scores each one, and picks the highest. Ties broken randomly.

#### What the Factors Mean

| Factor | What It Evaluates | Examples |
|--------|------------------|---------|
| **survival_factor** | How much does this improve my survival? | Moving to better cover: high. Staying exposed: low. Prone behind wall: very high. |
| **damage_potential** | How likely to damage enemies? | Aimed shot at exposed target: high. Snap shot at concealed target: low. Suppressing fire at pinned enemy: medium (not damage, but denial). |
| **position_value** | Does this improve tactical position? | Flanking: high. Retreating from good cover: negative. Holding a chokepoint: high. |
| **team_support** | Does this help allies? | Suppressing the enemy flanking your medic: high. Calling out a target: medium. |
| **resource_efficiency** | Am I being smart about resources? | Full auto at long range: wasteful. Aimed shot: efficient. Using last medkit on a scratch: poor. |
| **stress_management** | Am I managing psychological state? | Falling back when stress is high: good. Pushing forward while breaking: bad. |

#### The Weight Vector IS the Strategy

The weight vector **[w_survival, w_damage, w_position, w_team, w_resource, w_stress]** defines a "strategy profile." Different vectors represent different playstyles:

| Profile | Weights (rough) | Behavior |
|---------|----------------|----------|
| Cautious | High survival, low damage | Stays in cover, takes safe shots, falls back early |
| Aggressive | High damage, low survival | Pushes forward, takes risks for kill opportunities |
| Team Player | High team support | Suppresses for allies, prioritizes callouts, shares resources |
| Methodical | Balanced, high resource | Conserves ammo, takes calculated shots, steady advance |
| Panicked Rookie | High stress mgmt, high survival | Freezes, hides, barely engages |

#### Evolutionary Discovery

Instead of hand-tuning weight vectors, evolve them:

1. **Initialize**: Create a population of random weight vectors (e.g., 200 "strategies")
2. **Tournament**: Run combat simulations — strategies compete against each other
3. **Selection**: Strategies that win more often survive
4. **Breeding**: Winning strategies are combined (crossover of weight vectors)
5. **Mutation**: Small random changes to weights introduce variety
6. **Repeat**: Over many generations, the population converges on effective strategies

What this discovers:
- **Dominant strategies**: If one weight profile beats everything, there might be a balance problem
- **Strategy diversity**: A healthy game should have multiple viable approaches (rock-paper-scissors dynamics)
- **Degenerate tactics**: If "always sprint to melee range" wins 90% of the time, something is broken
- **Parameter sensitivity**: Change a game parameter, re-evolve, see if the winning strategies change

#### Why Not Pure RL / Neural Networks?

- Harder to interpret what the agent "learned" (black box)
- Requires more compute for training
- May discover superhuman strategies that don't reflect reasonable human play
- Utility weights are transparent — you can look at a winning profile and understand *why* it works

But RL could be a later layer. Train a neural network to play, then analyze what it does. If it discovers something the utility system missed, that's valuable information about the game design.

### Strategy for Teams

For multi-character scenarios, two options:

1. **Shared profile**: All characters on a team use the same weight vector. Simpler, but doesn't capture role specialization.
2. **Per-role profiles**: The team has a medic profile (high team support), a pointman profile (high aggression + position), a sniper profile (high damage + resource efficiency). The team composition itself becomes part of the strategy.

Option 2 is more interesting and more realistic. In a real squad, different roles make different decisions.

### Still To Discuss

- Exact utility evaluation functions and their granularity
- How agents perceive the battlefield (imperfect information, detection mechanics)
- Team coordination mechanics (do agents communicate? Share information?)
- How to validate that agent behavior "looks human" (qualitative review of replays, reasoning about expected behavior, trial and error)
- Whether to layer RL or other ML techniques on top of the utility system later

---

## Development Sequence (Revised)

### Phase 1: Rules in Roll Hub (Now → Near-Term)

- Begin implementing the game system as Roll Hub campaign templates (mods + actions)
- Start with the character model: attributes (1-5), skills (0-5), derived stats
- Get the declarative templates working so characters compute correctly
- Keep the existing TypeScript engine — focus on getting the rules right, not performance

### Phase 2: Combat Resolution

- Implement the cone-based attack resolution as an action (or set of actions)
- Implement the wound generation pipeline
- Implement the channel-based action economy
- Full geometric spatial model
- Design visibility mechanics

### Phase 3: Simulation Layer

- Add headless/sim mode to the engine (strip transport layer)
- Implement utility-based AI agents
- Build the dense statistical report generator
- CLI interface for running sims
- Replay capability for qualitative review

### Phase 4: Strategy Evolution

- Implement genetic algorithm for evolving strategy weight vectors
- Build scenario library
- Run large-scale simulations, analyze results
- Use AI agent (LLM) to summarize reports and generate insights

### Phase 5: Roll Hub Integration

- Integrate simulation into Roll Hub UI
- Scenario setup via the map editor
- "Run Simulation" button with configurable parameters
- Results displayed in-app with AI-generated summaries
- GM encounter design workflow

### Phase 6: Performance Optimization (When Needed)

- Profile the engine, identify bottlenecks
- Rewrite engine core in Rust with embedded JS VM
- WASM target for Node.js / browser
- Native target for maximum sim speed
- Auto-generated TypeScript types for frontend

---

## Open Questions

- What's the right granularity for the utility evaluation functions?
- How do fog of war / visibility mechanics affect agent decision-making? (See [[game/combat-mechanics/visibility|Visibility & Fog of War]])
- Can we make the utility factors themselves data-driven (defined in YAML)?
- How do we validate that simulated agent behavior "looks human"? (Qualitative replay review + reasoning about expected behavior)
- What does the dense statistical report contain? What metrics matter most?
- How does the LLM agent integration work technically? (API call with report as context? Built into CLI?)
- What's the migration path from current ActionScript to JS VM?

---

## Relationship to Other Docs

- [[game/game-design-document|Game Design Document]] — The philosophy and mechanics being simulated
- [[game/combat-poc/combat-mechanics-working|Combat Mechanics Working Doc]] — Detailed combat rules
- [[game/combat-mechanics/attack-resolution|Attack Resolution]] — The geometric cone model
- [[game/combat-mechanics/wounds|Wound System]] — Pools + structural damage
- [[game/combat-mechanics/action-economy|Action Economy]] — Channel-based concurrency
- [[game/combat-mechanics/reactions|Reactions]] — Defensive reactions + overwatch
- [[game/sim-report|Sim Report]] — Output from the v1 Python sim
- [[game/character-sheets|Character Sheets]] — Reference characters
- [[game/system-name-candidates|System Name Candidates]] — What are we calling this thing?

---

*This document will evolve as we figure out what we're actually building.*
