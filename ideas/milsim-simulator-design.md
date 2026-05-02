# RollHub Milsim Simulator — Design Notes

A working-document dump of an extended design discussion. Captures concepts we considered, ideas we converged on, ideas we rejected, and unresolved questions. Not a final spec. Intended to be ported to the RollHub or sci-fi project folder once the direction is firm enough to commit.

Companion document: `milsim-scenarios.md` (twenty natural-language milsim scenarios used as concrete grounding throughout this design work).

---

## 1. Purpose

A simulator + analytics tool that runs encounters from a milsim TTRPG (and eventually other RollHub-supported game systems) many times under varied conditions and reports outcome statistics, plan-failure modes, and other design feedback. Goal: give the *game designer* a fast iteration loop on rules, balance, and scenario design — analogous to how a microbenchmark gives a systems engineer a fast iteration loop on performance changes.

The audience is the game designer, not players. Players never see the simulator. The output is reports the designer reads to make rule decisions.

### Success criteria

- A rule change produces measurable, reproducible deltas in the report
- A scenario can be tested across many parameter variations (party comps, skill tiers, rule variants) automatically
- Iteration latency is short enough to be useful (single-tweak feedback in seconds; full sweeps in minutes)
- Output makes failure modes visible, not just summary stats (e.g., *"the flank failed because the defender retreated"* rather than just *"TPK 28%"*)

---

## 2. Key reframings that happened during the discussion

Each of these dissolved a significant amount of apparent complexity. Worth keeping in view.

### 2.1 Two different "Monte Carlo"s

We initially conflated:

1. **Monte Carlo simulation of the game** — running a scenario many times under varying random rolls, observing the distribution of outcomes
2. **Monte Carlo Tree Search (MCTS) for decision-making** — using simulated rollouts at decision points to pick optimal moves

These are different. (1) needs *some* policy to pick actions; (2) is one possible such policy. Trying to use (2) inside (1) creates a recursive sampling explosion. The simulator wants (1); the policy can be anything from scripted to utility AI to (2) at higher tiers.

### 2.2 Realistic, not optimal

The simulated AI doesn't need to play optimally. It needs to play *plausibly, at controllable skill tiers*. This dissolves the need for AlphaGo-class decision-making. A controllable mediocre policy is more useful than a maxed-out one because it produces realistic outcome distributions — the actual question we want answered.

### 2.3 The simulator's job is plan execution + failure reporting

Reframed mid-discussion: the simulator isn't trying to find optimal play, and it isn't even trying to play "realistically" in the sense of what one human would do. It's running plausible plans against each other and *reporting what happened, including which plans failed and why*. A failed crossfire because the defender retreated isn't a problem — it's the deliverable.

### 2.4 Plan-level enumeration replaces decision-search

Instead of treating each scenario as a decision-search problem, run a Cartesian product over (attacker plan × defender plan × seeds). Each cell is many sims. The output is a *plan interaction matrix* — direct designer-facing insight ("Pincer beats Hold but loses to Retreat"). No internal search needed.

### 2.5 Layering as a feature

The project's structure (VTT engine + game system + simulator + AI) imposes loose coupling that's actually beneficial: it forces clean interfaces, suits agent-assisted development, and means the simulator runs the same rules engine that live play does — eliminating sim-vs-play drift by construction.

### 2.6 Framework + scripting pattern

The right architecture isn't an opinionated end-to-end simulator. It's a generic test/sim *framework* (scenario lifecycle, turn loop, event capture, iteration, statistics, performance) that runs *user-authored game scripts* (decision engines, featurization, custom metrics). Same pattern as Pytest, Foundry VTT, OpenAI Gym, Jepsen.

### 2.7 Extract-then-generalize, not pre-generalize

Build game-specific code first. As patterns repeat, extract into framework libraries (utility AI helpers, MCTS scaffolding, tactical-position queries, etc.). Don't pre-design the framework SDK — let it emerge from real use.

### 2.8 Behavior tests give us ground truth

The simulator-validation problem ("how do we know the AI's behavior is right when we have no recorded data?") is solved by the designer authoring fixed `(state, doctrine) → expected_action_set` test fixtures. The designer is the ground truth. The fixtures form an alignment-scored test suite. Doctrines are effectively *defined by example* through their fixtures.

---

## 3. Architecture

### 3.1 Layers

1. **VTT engine (RollHub)** — generic platform. Already exists in some form.
2. **Game system layer** — declares characters, items, rules, actions for a specific TTRPG. Implemented as code modules, like Foundry game systems.
3. **Simulator framework** — scenario lifecycle, turn-loop driver, event capture, iteration runner, statistics aggregation, report rendering, performance scaffolding. Generic. New work.
4. **Game-specific scripts** — decision engines, featurization functions, doctrine/persona definitions, custom metrics. Written by the game developer (you). Real code, full freedom.
5. **Analytics layer** — consumes event streams, produces reports. Can be in any language.

### 3.2 Four key interfaces

The architecture is defined by what flows across these boundaries:

1. **VTT engine ↔ Game system** — already established by RollHub
2. **Game system ↔ Simulator** — simulator drives the rules engine the same way live play does, headlessly and many times
3. **Simulator ↔ AI** — simulator hands the AI `(state, character, persona, context)` and asks for an action
4. **AI ↔ Game system** — the only window the AI has into the game: legal actions for a character, transition outcomes, and named features (`cover_quality`, `flank_position`, `expected_damage_at_range`, etc.)

The featurization at interface 4 is the contract that makes the AI generic. The AI doesn't read game state directly; it asks for features by name. When mechanics change, coordinates and rules shift but feature names remain stable, so the AI keeps working.

### 3.3 What lives where

**Framework-side (generic, build once):**

- Scenario loading and lifecycle (instantiate world, place actors, initial state)
- Turn-loop driver (call active character's decision engine, apply action, advance state)
- Event-stream capture (structured log per simulation)
- Iteration runner (parallel execution, RNG seeding, batch coordination)
- Statistics aggregation (collect metrics across runs, basic distributions)
- Report rendering (tables, charts, comparison views)
- Performance: state cloning, pre-allocated buffers, RNG threading, lazy feature memoization
- Eventually: extracted utility libraries (utility AI helpers, tactical-position queries, MCTS scaffolding, behavior-tree primitives) — *extracted, not pre-authored*

**Game-script-side (per-game, full freedom):**

- Decision engine implementations (utility AI, MCTS, scripted, hybrid, whatever)
- Featurization functions
- Persona / doctrine definitions
- Plan / strategy library
- Custom metrics (game-specific outcome flags)
- Behavior-test fixtures
- Scenario definitions

### 3.4 Scenario declaration format (sketch)

A scenario is declared in a YAML/JSON document specifying:

- Map and initial actor placement
- Persona/engine assignment per character or per side
- Iteration count and seeds
- Parameter sweeps (run with weapon X, then Y, compare)
- Metrics to record
- Termination conditions

The user code is the engine implementation. The framework consumes the YAML and runs the loop.

### 3.5 The "same-interface for sim and play" property

The simulator runs the *exact same* rules engine that live play uses. Same action functions, same dice resolution, same wound applications. The simulator is just a headless driver with no UI. This means the sim is testing the rules players will play, with no risk of sim-vs-play drift. Side benefit: the AI built for the simulator can later drive NPCs in live play, since they share the interface.

---

## 4. Decision engine landscape

A multi-dimensional design space we mapped during the discussion. Most real games occupy a small part of it. Listed here for reference rather than as a buffet to choose from on day one.

### 4.1 Implementation axis (the obvious dimension)


| Engine                                      | Complexity           | Quality   | Skill-tunable | Rule-change robust | Authoring cost      | Notes                                                                                |
| ------------------------------------------- | -------------------- | --------- | ------------- | ------------------ | ------------------- | ------------------------------------------------------------------------------------ |
| Heuristic rules / decision trees            | Low                  | Low–Med   | Low–Med       | Med                | High (per scenario) | Brittle, but useful for boss-like scripted NPCs                                      |
| Behavior trees                              | Low                  | Med       | Med           | Med                | Med                 | State management, often paired with utility                                          |
| Utility AI (weighted features)              | Low                  | Med       | High          | High               | Med                 | The dominant pattern in shipped tactical games                                       |
| Utility AI + 1-ply expected-value lookahead | Low–Med              | Med-High  | High          | High               | Med                 | Cheap upgrade if action distributions are analytical                                 |
| Bounded MCTS with analytical chance backups | Med                  | High      | Med           | High               | Low                 | Natural "veteran" tier                                                               |
| GOAP (Goal-Oriented Action Planning)        | Med                  | Med-High  | Low–Med       | Med                | Med-High            | F.E.A.R.-era; mostly superseded by utility                                           |
| HTN (Hierarchical Task Networks)            | Med-High             | High      | Med           | Med                | High                | Good for squad-level coordination (Killzone)                                         |
| Imitation / case-based                      | Low (if data exists) | Variable  | Low           | Low                | Low                 | We have no data, but the *behavior-test fixtures* are functionally a small case base |
| Neural net / RL self-play                   | Very high            | Very high | Low           | Low                | Very high           | Not solo-dev viable; mention only for completeness                                   |
| LLM-as-policy                               | Variable             | Variable  | High          | High               | Low                 | Not viable in-loop (cost/latency); useful at design-time and analysis-time           |


### 4.2 Other axes (orthogonal to implementation)

These cut across all engine types and are real design decisions that affect realism, even with the same engine implementation:

1. **Decomposition** — flat / 2-tier squad+individual / 3-tier formation+squad+individual
2. **Observability** — full game state / partial with shared belief / partial with per-character belief (POMDP)
3. **Temporal persistence** — re-evaluate every turn / plan-and-execute with triggered re-plan / hierarchical plans with role inheritance
4. **Opponent modeling** — ego-only / static-opponent-model / mirrored / belief-aware
5. **Human-failure modeling** — pure rationality / bounded rationality / explicit cognitive constraints (stress, fatigue, target fixation, plan inertia)
6. **Doctrine codification** — ad-hoc / explicit doctrinal action library

A novice persona vs. veteran persona isn't just an implementation switch — it's typically a different point on multiple axes (weaker coordination, worse perception, stronger plan inertia, more cognitive constraints).

### 4.3 What the literature actually does

Researched during the discussion — the dominant patterns in shipped tactical games:

- **Utility AI** for action scoring (XCOM 2, Battle Brothers, BG3, Phoenix Point, Civ)
- **Behavior trees** for high-level state and action gating (Halo, F.E.A.R., XCOM, modern AAA standard)
- **Persona / archetype** weight presets for variation (XCOM enemy types, Battle Brothers archetypes, BG3 enemy classes)
- **Scripted set pieces** for boss/narrative encounters (every shipped game)
- **HTN** for squad coordination (Killzone 2/3, less common elsewhere)
- **Need-driven simulation** for emergent behavior (Dwarf Fortress, Rimworld)

What's *not* used in shipped tactical games:

- MCTS at any meaningful depth (cost vs. benefit doesn't pencil out vs. utility AI)
- RL/learned policies (training cost, rule-change brittleness, lack of interpretability)

### 4.4 The recommendation that emerged

For your milsim, the right starting engine is almost certainly **utility AI with hand-tuned feature weights, plus simple plan-and-trigger temporal structure**. This is what XCOM, Battle Brothers, and most successful tactical games actually use. Cheap, robust to rule changes, skill-tunable via weight modulation and noise injection, and good enough to produce the kind of plausible behavior the simulator needs.

Upgrade path, only if specific gaps appear in alignment scores or behavior:

- Add 1-ply expected-value lookahead using analytical action distributions
- Add bounded MCTS as an optional "veteran" tier
- Add per-character belief state for fog-of-war scenarios
- Add hierarchical squad-level intent (HTN-flavor) for coordination scenarios
- Add cognitive constraint modulators for stress/fatigue/surprise scenarios
- Last resort: learned weights via least-squares fit to behavior-test fixtures

Each upgrade is justified by *observed* deficiencies, not anticipated ones.

---

## 5. Key technical ideas

### 5.1 Actions as distributions (not samples)

Standard TTRPG engines implement actions imperatively: roll dice, mutate state. Proposed paradigm shift: **actions are pure functions from state to a distribution of next states.** Live play samples once; analysis works with the full distribution.

Benefits:

- Authoring-time analytics (game system can show "this attack has 18% kill chance at 30m" with no sampling)
- Massive variance reduction in simulation (common random numbers, stratified sampling, importance sampling, antithetic variates — all require analytical distributions)
- MCTS chance-node backups become exact (no sampling noise at chance nodes; tree is much more sample-efficient)
- Self-consistent test pattern: sample many times, verify empirical frequencies match analytical probabilities

Costs:

- Designer must author actions as pure functions over an explicit RNG object (no `Math.random()`, no global state) — discipline, not a barrier
- Some action types resist clean distribution form (continuous spatial outcomes, durative actions, reactive interactions). Workable with discretization but not always elegant.

### 5.2 Quantile sweeping for distribution derivation

Idea: rather than asking the designer to author distributions explicitly (`[{outcome: A, prob: 0.3}, ...]`), they author imperative dice-roll code that takes an explicit `rng` argument. The framework derives the distribution by sweeping deterministic stratified samples through the function (e.g., 100 quantile points 0.005, 0.015, ..., 0.995 for a uniform variable; 2D Latin-hypercube samples for a 2D RNG; etc.).

Properties:

- Same code serves live play (sample once) and analysis (sweep)
- 100 stratified samples gets 1% precision for 1D RNG
- For purely deterministic actions, can find exact boundaries in O(log N) calls (binary search on the RNG axis)
- Multidimensional RNG costs N^k for tensor product, or N×k for LHS

This means **actions stay imperative for the designer; the framework derives analytical properties as a side effect.** A genuinely good design property.

### 5.3 Multi-tier value functions

Single-scalar utility doesn't cover scenarios with hard constraints (don't shoot the hostage), priority objectives (protect the VIP first, then engage), or non-engagement goals (avoid detection > observe > don't fire).

Shape: each persona/plan has an ordered list of `(constraints | objectives | preferences)` tiers. Actions that violate higher-tier constraints are eliminated regardless of preference scores. Actions are scored within their highest-allowed tier.

This is more elaborate than the simple weighted sum but cleanly expressible and necessary for several scenario archetypes (hostage rescue, recon, escort missions).

### 5.4 Plan-and-trigger temporal architecture

Instead of re-evaluating actions every turn, characters/squads form plans that persist across turns. Re-planning fires only on triggered events (precondition violated, casualty threshold, new contact, etc.).

Benefits:

- Cheaper computation (planner runs occasionally, not every turn)
- More human-like behavior (no jitter from small utility-shifts)
- Coherent simulation traces (characters commit to plans the way humans do)

Triggers are expressed in feature terms (`feature.percent_casualties > 0.5`), not game-specific events, keeping the architecture decoupled.

### 5.5 Scenario phase machines

Many scenarios have mid-scenario state transitions: negotiation collapse, reinforcement arrival, mission flag flip, time-based phase changes. The scenario itself is a state machine, with phase transitions triggered by world events. Personas and goals can change at phase boundaries.

Outcome reporting needs to handle this — scenarios may have qualitatively different outcome shapes per phase reached.

---

## 6. The behavior-test approach (ground truth via authored fixtures)

A late-stage idea that solves the realism-validation problem.

### 6.1 The approach

The designer authors fixtures of the form:

- **Scenario state** — actors, positions, HP, ammo, cover, visibility, etc.
- **Active character** — whose turn it is
- **Doctrine/persona** — assigned role
- **Expected action set** — ranked: best / acceptable / suboptimal / wrong
- **Rationale** — written reasoning, for debugging future failures

Decision engines are scored on **alignment** with these fixtures. The aggregate alignment percentage across the suite is the engine's quality metric. Watch it as you tune.

### 6.2 Why this matters

- Solves the no-ground-truth problem (designer is the ground truth)
- Defines doctrines by example (a doctrine *is* the set of fixtures that exemplify it)
- Provides empirical feedback on every architectural choice (utility AI vs. lookahead vs. MCTS — measure alignment, compare)
- Lets you ship the simplest engine that achieves acceptable alignment; defer complexity until alignment plateau forces it

### 6.3 Cost considerations

Each fixture takes 5–15 minutes to author. 50 fixtures is a focused day. To cover the milsim space with reasonable doctrine variety, probably 100–300 fixtures over time. Spread across normal development sessions; not a dedicated effort. Each fixture is durable (doesn't go stale unless the action space fundamentally changes).

Caveat: the designer over-fits to their own intuitions. "Alignment with Arik" isn't quite "alignment with veteran milsim player in general." For a passion project this is mostly fine; if scope ever expands to broader audience, fixtures from other players add value.

---

## 7. The benchmark approach (statistical regression test)

Complementary to behavior tests. Different problem.

### 7.1 The approach

A small set of fixed-shape scenarios (head-on engagement, fixed positions, scripted target priority) run with many seeds. The benchmark suite is committed to version control. Every rule change runs the benchmark and produces a delta report against the previous run.

### 7.2 Why it works

- **No AI required.** Scripted target priority is sufficient; "shoot closest" is a valid policy for benchmark purposes.
- **Captures combat math directly.** TPK distributions, mean rounds, casualty distributions, ammo consumption, time-to-incapacitation — all extractable from event streams.
- **Cheap.** Days to weeks of work in the existing Node engine. No new architecture required.
- **Useful from day one.** Even before any AI, the benchmark answers most "did I just break the math?" design questions.

### 7.3 What it does not address

- Tactical decisions (cover use, flanking, retreat)
- Coordination
- Scenario-specific objectives (recover hostage, etc.)
- Belief states / fog of war

The user can extrapolate these mentally based on milsim experience. The benchmark just validates that the underlying mechanical math is right.

### 7.4 Relationship to the bigger sim

The benchmark and behavior tests are complementary, not competing. The benchmark is the *statistical* tool (many runs, distribution shape). The behavior tests are the *behavioral* tool (single decisions, alignment with intent). Both run on every iteration. Together they cover most of what the full simulator was supposed to provide.

If the benchmark + behavior tests + a simple utility-AI engine are sufficient, the full general-purpose scenario simulator (with belief states, hierarchical squads, plan vocabularies, etc.) may never be necessary. Build only when forced by specific design questions the simpler tools can't answer.

---

## 8. Challenges surfaced from the 20 reference scenarios

Working through the scenarios in `milsim-scenarios.md` revealed several capabilities the simulator needs to support — some that should be in the design from the start, others that can be deferred.

### 8.1 Likely critical to have early

- **Tactical positions and spatial reasoning.** Strategies are expressed in terms like "be in cover," "flank from the east," "advance to support" — not "move 30m." Featurization must abstract above coordinates.
- **Per-character information state.** Many scenarios fundamentally turn on who has detected whom (counter-sniper, recon, meeting engagements, surprise). Belief state with decay is probably not deferrable.
- **Multi-tier value functions.** Hard constraints (don't shoot hostage), priority objectives (VIP first, then engagement), non-engagement goals (avoid detection). Single weighted sum doesn't cover these.
- **Mid-scenario phase transitions.** Negotiation collapse, reinforcement arrival, time-based shifts. Scenarios are state machines, not single modes.
- **Heterogeneous action spaces.** Engineer placing charges, VIP that can't fight, drone operator at distance, mortar team off-table, multi-turn productive actions — characters are not uniform.
- **Squad-level intent / coordination.** Pincer timing, formation discipline, bounding overwatch — only sensible at squad level, not per-character.
- **Stress/fatigue/surprise as weight modulators.** Minimum-viable cognitive realism. Without this, simulated AI handles surprise scenarios too well.

### 8.2 Polish-tier (defer until forced)

- Rich cognitive constraint models (target fixation, panic, plan inertia in detail)
- Sophisticated coordination (full HTN-style planning)
- LLM tooling at design-time
- Continuous / spatial action effects (grenade landing 4.93m from target)
- Validation tooling beyond manual review

### 8.3 Critical path vs. upgrade path

**Must be designed before code (critical path):**

1. Invariant strategy vocabulary (the engine/strategy contract — what intents do strategies express, what features do they reference)
2. Feature set + initial weights for at least one persona (the engine/value contract)

**Becomes empirically resolvable after critical path:**
3. Decision algorithm choice (utility AI vs. lookahead vs. MCTS — measure with behavior tests)
4. Speed (measure naive impl, optimize where needed)
5. Coverage (expand by use)
6. Realism (calibrate by use against fixtures)
7. Output format (iterate by use)

**Upgrade path (build only if forced):**

- Per-character belief state
- Hierarchical squad coordination
- Cognitive constraint modeling
- Native rewrite for performance
- LLM design-time and analysis-time tooling

---

## 9. Suggested build order (smallest viable progression)

A possible sequence that keeps each step bounded and produces working artifacts incrementally:

1. **Framework MVP** — scenario loader (YAML → game state), turn-loop driver, event log, iteration runner, basic statistics aggregator. No optimization yet — just correct.
2. **Trivial scripted engine** — 50 lines: "shoot the closest enemy." Verifies the harness end-to-end.
3. **One scenario fixture** — 2v2 head-on (scenario #20 from the scenarios doc), fixed positions.
4. **Simple report** — TPK rate, mean rounds, casualty distribution.
5. **Behavior-test framework** — fixture format, runner, alignment scorer.
6. **First simple utility AI engine** — feature scoring of legal actions, hand-tuned weights, run against behavior tests.
7. **Featurization for the milsim** — concrete feature set (`cover_quality`, `expected_damage_dealt`, etc.).
8. **First doctrine** — persona config (utility AI engine + weights + parameters) for, say, "veteran rifleman."
9. **First non-trivial scenario** — scenario #1 or similar from the scenarios doc, with full AI loop.
10. **Plan-and-trigger temporal layer** — when basic per-turn evaluation produces jittery behavior, add plan persistence.
11. **Iterate** — more scenarios, more doctrines, more features. Watch alignment scores, watch benchmark stability across rule changes.

Estimated time at part-time pace with AI-agent assistance: steps 1–4 in 1–3 weeks; steps 5–8 in 2–4 weeks; step 9–11 ongoing. A genuinely usable design tool in 2–3 months total.

---

## 10. Open questions / items to revisit

These were raised during the discussion but not resolved:

- **State representation shape.** Will need to be expressive enough for fog-of-war featurization but not bloated. Fixed schema or extensible bag-of-properties?
- **Action space discretization.** How fine does "move to position X" get? Tile-based, region-based, free-coordinate-with-snapping?
- **Concurrency model.** Worker-thread parallel sims vs. single-threaded with batched execution?
- **Persistence/replay format.** Event streams as JSONL? Binary? Compressible enough for many sims?
- **Behavior-test maintenance.** When the action space evolves, fixtures need updating. How is that detected, what's the migration path?
- **Cross-game generalization.** Realistically, will the framework ever support a non-milsim game system? If not, how much loose coupling is genuinely necessary?
- **Performance targets.** What latency is "fast enough" for L1/L2/L3 iteration? Need empirical measurement before optimization.

---

## 11. References

Resources mentioned during the discussion that are worth investing time in before serious design or implementation work:

**Highest priority:**

- **AI and Games YouTube channel** (Tommy Thompson). Multi-part deep-dives on XCOM 2 AI, Battle Brothers, F.E.A.R., Halo, Killzone, BG3. Probably 20–40 hours of relevant content. Best single entry point.

**Talks (GDC):**

- Damian Isla, "Handling Complexity in the Halo 2 AI" (canonical behavior tree intro)
- Dave Mark, "Improving AI Decision Modeling Through Utility Theory" (canonical utility AI intro)
- Tim Verweij, "Killzone's AI: Dynamic Procedural Combat Tactics" (HTN for squads)
- Jeff Orkin, F.E.A.R. AI (GOAP reference)
- Tactical AI talks at GDC Vault (many free)

**Books:**

- Mat Buckland, "Programming Game AI by Example" (FSM, utility, GOAP, code examples)
- Dave Mark, "Behavioral Mathematics for Game AI" (utility AI specifically)
- "AI Game Programming Wisdom" series

**Closest-analog games (study how they actually work):**

- XCOM 2 (utility AI + behavior tree)
- Battle Brothers (transparent utility AI, solo-team scope)
- BG3 (modern utility AI in tactical RPG)
- Killzone 2/3 (HTN for squads)
- Into the Breach (deterministic puzzle alternative)

**Not relevant (mention only to dismiss):**

- AlphaGo / AlphaStar / OpenAI Five — RL self-play with massive compute. Not solo-dev viable. Almost no shipped tactical game uses these techniques.

---

## 12. Glossary (for porting)

- **Action** — a discrete choice a character can take during their turn
- **Behavior test / fixture** — `(state, doctrine, expected_action_set)` triple authored by the designer to validate AI alignment
- **Benchmark sim** — narrow, scripted simulator used as a regression test for combat math
- **Decision engine** — algorithm that maps `(state, character, persona)` to an action choice
- **Doctrine** — a curated library of personas/plans expressing "how we play"
- **Featurization** — game-system function that maps state to a vector of named scalars consumed by the AI
- **Persona** — config binding a decision engine + parameters to a character archetype
- **Plan** — a multi-turn intent with conditional adaptations, expressed as a feature-weight delta + triggers
- **Plan interaction matrix** — output table showing outcomes per (attacker plan × defender plan) combination
- **Quantile sweep** — technique for deriving a distribution from imperative code by sampling along the RNG axis at deterministic stratified points
- **Scenario** — a setup (map, units, objectives, persona/plan assignments) plus iteration parameters
- **Utility AI** — decision engine that scores legal actions via weighted feature sums, picks top-scoring (with optional noise)

---

## 13. Status

As of authoring, this document captures the design discussion through the framework-+-scripting architectural commitment. Major decisions made:

- ✅ Pursue this as a passion project, accepting it's a multi-month effort
- ✅ Use the framework + scripting pattern (generic harness, game-specific scripts)
- ✅ Build benchmark sim first (regression test for combat math)
- ✅ Build behavior-test framework second (alignment ground truth)
- ✅ Start with utility AI + plan-and-trigger as the engine
- ✅ Defer full general scenario simulation indefinitely; build only when forced

Major decisions deferred:

- Specific featurization for the milsim
- Specific persona/doctrine library for the milsim
- Stack/language decisions (revisit empirically after MVP)
- Whether to ever pursue MCTS / belief states / hierarchical squad AI

Next concrete steps (TBD by user, not committed yet):

- Watch a few hours of Tommy Thompson breakdowns to ground in real game AI
- Do the strategy vocabulary exercise (express 10 milsim strategies in invariant terms)
- Define an initial feature set for the milsim
- Start framework MVP

