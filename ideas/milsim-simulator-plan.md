# Crucible Simulator — Focused Design

A shorter, more concrete reframing of `milsim-simulator-design.md`. That doc is a long brainstorm; this one commits to scope, names what we already have, and stages the work in tiers that each produce a working artifact.

Reference: `milsim-simulator-design.md` is the catalog of techniques and architectures considered. This document is the plan we actually execute against. Pull from the catalog when the corresponding problem arises.

---

## 1. What the simulator is for, and who it's for

A tool that lets a user ask: *given a particular setup, how does combat play out?* By running scenarios many times under varying conditions and reporting aggregated outcomes, the user gets a fast iteration loop on whatever they're changing — be it the rules of the game system, or the composition of a specific encounter.

Players never see this directly. The output is reports that inform decisions made by two distinct user clusters:

**The Game Designer** — implements and tunes the rules of a game system (Crucible itself). Asks questions like:
- Does this rule change break combat math? (mechanical regression)
- Does this rule change make frontal assaults untenable in general? (engagement balance)
- How does this rule interact with character-level disparity? (matchmaking)

**The Game Master** — runs campaigns within an existing rule set, designing scenarios for a specific group of players. Doesn't usually modify the rules. Asks questions like:
- Is this encounter winnable? Is it too easy? Too brutal?
- Which strategies work against this enemy composition?
- If my players make typical mistakes, what's the casualty risk?
- I changed the cover layout — does that shift which strategies are viable?

A given person can wear both hats. Game designers test their own scenarios; some GMs design custom rules. But the two roles motivate the simulator differently. The Game Designer wants generalized truths about the system. The Game Master wants situated truths about a specific scenario. Both are valid; both should be served.

A useful framing that emerged from this: **the unit of simulation is a *scenario*, not a *location*.** A scenario is a parameterized setup — a starting state plus a description of which dimensions vary across runs (turn order, character composition, strategy assignment, weapon loadouts, cover placement, ...). The simulator's job is to run the scenario across its parameter space and report the resulting outcome distributions. Reports can slice along any of these varied dimensions. A "scenario" can be as narrow as "Alpha vs Bravo, fixed positions, fixed initiative, only RNG seed varies" or as broad as "this campaign encounter, varying player positions, weapon choices, and turn order across a parameter sweep."

Different questions become trustworthy at different points in the simulator's evolution. We don't need to answer all of them at once. Each tier of capability unlocks a class of questions.

---

## 2. Tiered usefulness model

The simulator becomes useful for *some* questions long before *all* questions. Each tier is an independently-shippable artifact whose value doesn't depend on later tiers being built.


| Tier | Capability                                                                            | Answers                                                                                             | Major additions over previous tier                                            |
| ---- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1    | Trivial AI ("shoot nearest hostile"), turn loop, iteration at low N                   | Combat-math regression. Did I break damage curves, hit rates, ammo economy? Does this scenario produce sane outcomes at all? | Damage application, end conditions, seeded RNG, iteration runner, basic stats |
| 2    | Featurization, simple utility AI, expanded action space (move, take cover, end turn)  | Engagement balance. Does this weapon dominate cover? Are certain ranges death zones?                | Cover model, movement actions, feature-scoring AI, weight presets             |
| 3    | Squad coordination, multi-turn plans, scenario phase machines                         | Scenario balance. Does flanking beat hold-the-line on this map?                                     | Plan vocabulary, multi-character coordination, mid-scenario state transitions |
| 4    | Calibrated AI validated against behavior-test fixtures, cognitive-constraint modeling | Strategic-balance questions, with known calibration bias the user has learned to adjust for         | Behavior-test framework, persona/doctrine library, calibration tooling        |


Scope estimates are intentionally omitted. They depend heavily on (a) how complete the underlying game system is, (b) how much new game-system design has to happen first, and (c) leverage available from agent-assisted development. A pure tier-1 sim *infrastructure* pass is small — hours to days of work — but it's gated on game-system prerequisites that are not pure implementation work (see §3 and §4).

Trustworthiness of answers grows with tier — and the simulator has known biases at every tier. The user is expected to learn those biases the same way they learn any tool's quirks. "The sim says 60%, in practice it's probably 50–70%" is still useful.

---

## 3. What's already in the repo

This is **not** a greenfield project. Inventory of relevant substrate:

- **Engine** (`vtt-game-server/src/Engine/`) — the same rules engine that runs live play. Loads a campaign, holds state, executes actions, mutates state. Already has the property the design doc calls "same interface for sim and play" — we just need to drive it headlessly.
- **MementoBuilder** (`vtt-dev-ops/cli/db/MementoBuilder.ts`) — loads a campaign's YAML source into a runtime engine state. Used by the seed pipeline; reusable for sim setup.
- **JS action scripts** (`crucible/src/_system/actions/**/*.act` with `// @engine js`) — pure CommonJS, sandboxed, full access to engine APIs (`$som`, `$toks`, `$locs`, `$turns`, etc.) via `VMApiProxy`. The runtime is `JSActionRunner`. No source transformations.
- **combatUtils library** (`crucible/src/_system/actions/combat/combatUtils.act`) — shared geometry and Gaussian model. Both `resolveAttack` (samples once for a live shot) and `calculateHitChance` (integrates the Gaussian CDF for the polling display) consume it. This is the "actions as distributions" pattern from §5.1 of the brainstorm doc, in microcosm. We have one example. We're not committing to scaling it yet.
- **ScriptTestEnv** (`vtt-game-server/tests/harness/ScriptTestEnv.ts`) — loads a campaign headlessly via MementoBuilder, runs actions through `doAction`, returns the resulting transaction. The skeleton of the simulator harness already exists.
- **combatTests.ts** (`vtt-game-server/tests/crucible/`) — single-iteration sanity check. Loads the campaign, runs `calculateHitChance` and `resolveAttack` once, asserts on outputs. Spiritually the seed of a benchmark suite.

What's **important to be honest about**: the Crucible scripts that exist today (`resolveAttack`, `calculateHitChance`, etc.) were built primarily as proof-of-concept work to validate UI integration — targeting cone, hit-chance polling, shader effects. They produce reasonable-looking outputs for those demo purposes but they are not a finished implementation of the Crucible combat system. There are real game-design questions (wound model, damage resolution, recovery, action economy, several others) that haven't been fully nailed down yet — and the existing code reflects that. Some of it is, frankly, placeholder.

What's **missing** to reach tier 1:

- The wound model itself isn't fully designed. There's a partial structure in the mod tree and design notes elsewhere, but the gap between intended design and implemented code is real and needs closing.
- `resolveAttack` doesn't apply damage to durable state. It computes `finalDamage` and reports it; nothing changes on the target SO.
- No "out of combat" condition. No way to say "Alpha is downed."
- `Math.random` and the unseeded `gaussian()` are used directly. No reproducibility across runs.
- No turn loop — we manually call one action and exit.
- No iteration runner. No statistics aggregation. No report rendering.

The first three are **Crucible game-system work**, not sim-framework work. They have to happen before any sim can produce meaningful numbers, and they involve game-design decisions, not just code. The last three are sim-framework work and are mostly mechanical.

---

## 4. Crucible and the simulator co-evolve

Important reframe: **the simulator is not built on top of a finished Crucible.** The two grow together. Crucible isn't done, and a real value of building the simulator is that it gives the game designer a tool to *help* finish Crucible — by exposing where the rules are incomplete, ambiguous, or producing nonsense numbers.

This shifts the project ordering. The first work is not "build the sim harness." It's:

1. **Sharpen Crucible's incomplete primitives** — wound model, damage application, what "downed" means, how the action economy actually works. Enough to make a single combat encounter playable end-to-end. Not all of Crucible. Just enough to simulate.
2. **Build the minimum-viable sim harness on top of that.** Drive the now-playable combat through a turn loop.
3. **Use the sim's outputs to find the next thing wrong with Crucible** — does damage scale weirdly? Does combat end in zero turns or a hundred? Does ammo economy make sense? Each of these surfaces a Crucible question, not a sim question.
4. **Iterate on Crucible (with the sim as the iteration tool), grow the sim's capabilities as new questions become askable.**

The brainstorm doc treats the simulator as a *tool applied to a game system*. A more accurate framing is the simulator and the game system as *co-evolving partners*. The game system gives the simulator something to run; the simulator gives the game system feedback on what's broken.

Practical implication: the early phase of this project is not glamorous sim-framework engineering. It's getting Crucible to a state where simulation is meaningful. Some of that is design discussion (wound resolution, action economy decisions), some is implementation. We should be honest about that mix.

---

## 5. Tier 1 concrete plan

Smallest possible end-to-end vertical slice. Not designed for extensibility — designed to *run*. Once it runs, watching what breaks (or what's broken about Crucible) informs the next step.

### Step 0 — Crucible game-system prerequisites

Before any sim can be meaningful, Crucible needs:

1. **Wound model finalized enough to simulate.** Decide what attribute(s) damage subtracts from. Decide what threshold puts a character "out of combat." Implement those decisions in mods. This is real game-design work — there are tradeoffs around HP-style vs wound-tier vs other models that need to be picked. Pre-existing Crucible design notes are the starting point.
2. **`resolveAttack` actually applies the damage.** Once the wound model is settled, the script mutates target SO state via `target.atrAdd(...)` (or `atrSet`) accordingly.
3. **A definite "out of combat" check.** Either a derived attribute that reads true when wounds exceed threshold, or a simple inline check the sim runner can perform. Whichever is cleaner.

This is the longest pole in tier 1 and the part most resistant to pure agent acceleration — it requires real design decisions.

### Step 1 — RNG injection (sim infrastructure)

4. **Inject `$rng` into the JS sandbox.** In `VMApiProxy`, expose a seedable RNG object (`$rng.uniform()`, `$rng.gaussian()`, `$rng.int(min, max)`). The unseeded `gaussian` and `random` helpers currently in the sandbox become forbidden (removed or made to throw with a clear error message). The seeded RNG is passed in by the caller (`JSActionRunner.run`) per invocation; defaults to system entropy when unspecified.

The naive flat-PRNG approach is what we commit to at tier 1. There's a real open design question buried here — discussed in §6 — about how RNG correlates across runs and how to handle scripts that consume different amounts of randomness on different code paths. Tier 1 ignores it; the question gets revisited the moment we actually want common-random-number techniques or paired-comparison rule testing.

### Step 2 — Sim harness, AI, scenario

In `vtt-game-server/tests/crucible/sims/`:

5. **`runScenario.ts`** — generic turn-loop driver:
   - Input: `engine`, mapping of `charID → decideFn`, end-condition predicate, max-turns guard, RNG seed
   - Loop: for each character in turn order, call `decideFn(charID, engine) → action`, apply via `doAction`, check end condition
   - Output: structured per-run summary (winner, turns taken, casualties, per-character stats)
   - Turn order: fixed at tier 1 (e.g. just iterate through a hardcoded list). Crucible's `$turns` system exists and we'll use it eventually, but a fixed order is simpler for the first version. Varying turn order across runs is itself a useful sim dimension (see §8).
6. **`shootClosest.ts`** — decision function:
   - Input: `charID`, `engine`
   - Logic: find nearest living hostile token, return `{name: "resolveAttack", args: {input: {sourceID, path: weapon, targetPos: token.position}}}`
7. **`headOnEngagement.ts`** — scenario script:
   - Loads Crucible campaign
   - For seed in `0..N`: configure engine, position Alpha vs Bravo, run `runScenario`, collect summary
   - Print aggregate report: win-rate per side, mean turns, mean damage dealt, casualty distribution
   - Start at N=1. Validate it runs at all. Then N=10. Then N=100. Each step ask "are we getting more information per run? is it fast enough?" — only optimize when the answer is "no" to either.

### Explicitly **not** at tier 1

- Pluggable AI registry. `decideFn` is just a TypeScript function. No registry, no plugin discovery, no `crucible/src/_system/ai/` directory yet.
- Featurization layer. `shootClosest` reads raw token positions.
- Persona/doctrine system.
- Plan-and-trigger.
- Movement, cover, line of sight as new actions.
- Structured event log. Per-run summary object is enough.
- Performance optimization. Reloading the engine per iteration is acceptable until measurement shows it isn't.
- Variance-reduction techniques (common random numbers, antithetic variates, stratified sampling).
- Behavior-test fixtures.
- Any reporting beyond console output.

---

## 6. Architectural commitments

These choices shape everything downstream and we commit to them now.

1. **Same engine for sim and play.** Sim AI decisions go through the same `doAction` path as live human actions. Non-negotiable — it's what makes sim results meaningful evidence about live play. (At some far-future point we may port the engine to a more performant stack so simulations can run faster. Not now.)
2. **Decision functions are JavaScript.** Initially TypeScript helpers in the test directory. As soon as we want a second AI variant, they migrate to `.act` game scripts under `crucible/src/_system/ai/` so they can be authored alongside other game logic with full access to the same APIs.
3. **Pure functions over explicit RNG.** All scripts that consume randomness take it via `$rng`. No hidden state, no `Math.random`. This is the foundation for reproducibility, distribution analysis, and (eventually) variance reduction techniques like common random numbers and stratified sampling. The framework owns the RNG model — see "RNG semantics" below for what we commit to and what we defer.
4. **Game-system code lives in the game directory.** AI decision logic, featurization, personas — all under `crucible/`. The engine and the sim harness stay game-agnostic.
5. **Extract from real use, not speculation.** Framework abstractions emerge from the second use case onward. First version of anything is concrete and inline.

### RNG semantics — a real design problem we own

"Just inject a seedable PRNG" papers over a real question. Multiple consumers per script, branches that consume different amounts of RNG, and the desire to do paired-seed comparisons across rule variants make naive seeding insufficient for some uses.

What we commit to at tier 1:

- A flat seeded PRNG. Same seed → same sequence of `$rng.uniform()` returns.
- Same-seed reproducibility within a single scenario configuration.

What we explicitly **do not** commit to yet:

- Common random numbers across different scenario configurations (need named sub-streams or some other structuring).
- Stable correlation across runs that consume different amounts of randomness.
- Variance reduction techniques (antithetic variates, stratified sampling).

These get revisited the moment we want to do paired-comparison rule testing or push iteration counts high enough that variance reduction matters. Probably tier 2 or later. Mentioned here so we don't forget the question exists.

### Things we explicitly defer (not abandon — defer until forced)

- Featurization layer
- Pluggable AI / decision-engine registry
- Behavior-test framework
- Plan-and-trigger temporal architecture
- Multi-tier value functions
- Belief state / per-character information
- Hierarchical squad coordination
- Cognitive constraint modeling
- Engine cloning / parallel iteration
- Structured event log + replay format
- Refactoring the action-script engine further (e.g. dropping `// @engine js` directive once all scripts are JS, making the SDK ambient, etc.)
- Cross-game generalization (see below)

### On cross-game generalization

The simulator harness itself — campaign loading, turn-loop driver, scenario parser, iteration runner, statistics aggregation, reporting — is game-agnostic by construction. It will work for any RollHub game system, not just Crucible. That's fine and natural; it lives outside `crucible/`.

What's *game-specific* is the AI logic, featurization, personas, doctrines. Those live under `crucible/`. Eventually some of these may have generic substrate that's worth extracting into a reusable SDK for other game systems — utility-AI scaffolding, Monte Carlo Tree Search primitives, behavior-tree libraries, configurable plan vocabularies. But we don't build the SDK speculatively. We build for Crucible, and periodically review what should be generalized once a second game system actually exists to validate the extraction.

---

## 7. AI validity is the limiting factor at tiers 2+

Throughout tiers 2–4, the simulator's outputs are only as trustworthy as the AI's behavior. A sim that says "this rule change reduces flanking effectiveness by 30%" is meaningless if the AI doesn't model flanking the way humans would.

Important caveat: **perfect alignment isn't required.** The user is expected to learn the simulator's biases the same way one learns any tool's quirks. "The sim says frontal assaults fail 60% of the time; in practice it's probably more like 40% because the AI is more pessimistic than humans" is still useful information — it tells you the *direction* a rule change moves the needle, even if the absolute number is wrong. As long as the bias is consistent, it's calibratable.

The behavior-test fixture approach from the brainstorm doc (§6) is the right tool to validate alignment. Designer authors `(state, character, persona, expected_action_set, rationale)` fixtures; the engine is scored on alignment with them.

**Critically:** fixtures need to be targeted at the kinds of decisions a rule change would affect. If you're studying a cover-mechanics change, you need cover-decision fixtures specifically. A high *aggregate* alignment doesn't tell you whether the sim's answer about your specific rule change is trustworthy. Coverage of the relevant decision class does.

We don't build the fixture framework at tier 1 because we have no AI to validate. We start authoring fixtures at the start of tier 2, when the AI becomes non-trivial enough to disagree with the designer's intuition.

---

## 8. Open questions

Things to resolve as we encounter them, not now:

- **Wound model finalization (Crucible-side, blocking).** What does damage subtract from? What's the threshold for "downed"? Is recovery a thing in combat? These are real game-design decisions that need to be made before tier 1 can run. Pre-existing Crucible design notes are the starting point but the current implementation doesn't fully reflect them.
- **Turn order semantics.** Crucible has `$turns` with a (probably random) initiative roll. For tier 1 we use a fixed turn order to keep tests deterministic. Eventually, **varying turn order across runs is itself a useful simulation dimension** — a GM should be able to ask "what fraction of bad initiative rolls cause a TPK in this scenario." We may want to fix turn order in some scenarios and sweep across a sample of orderings in others. We don't need to enumerate all permutations (combinatorial explosion); a sampled subset is fine.
- **Scenario parameter sweeps generally.** Beyond turn order, scenarios may vary character composition, weapon loadouts, position, strategy assignment. The scenario format (eventually a config doc) needs to express which dimensions are fixed and which are swept, and how to slice reports across them. Defer the format design until we have a couple of concrete scenarios that need it.
- **RNG semantics beyond the flat PRNG.** See §6. When we want common random numbers, named sub-streams, or variance reduction, we'll need to revisit the API.
- **Action space at tier 2.** Movement is the obvious next action — how granular? Tile-snap, free continuous, region-based? Defer until we hit it (and ideally until Crucible's movement model is more clearly defined).
- **Engine reuse vs reload per iteration.** At N=1 to N=100 it doesn't matter much. At N=10000 it does. Defer until measurement makes it unavoidable.
- **Featurization API shape.** When we start tier 2: features as pull-API (`feat.coverQuality(char)`) or pre-computed observation snapshots? Defer.

---

## 9. Mode of work

- **Crucible game-system work first, then sim infrastructure.** The first concrete actions are design decisions about wounds and damage, plus implementing them. Sim infrastructure on top is small and follows.
- **Iterate by N.** Start at N=1. Validate. Then N=10, N=100. At each step ask: more information per run? Fast enough? Optimize only when the answer is "no" to either.
- **Run it. Watch what breaks.** Use what surfaces — both in the sim and in Crucible — as the input to what to do next. Don't pre-design tier 2 in detail before tier 1 produces numbers.
- **Each tier ends with a working artifact and a retro.** What's missing for the next class of questions? What abstractions actually proved necessary? What did we over-build?
- **The brainstorm doc is a reference catalog, not a roadmap.** When a problem arises that's covered there (utility AI patterns, MCTS, plan-and-trigger, belief state), pull the relevant section in. Don't pre-implement from the catalog.
- **Calibration over precision.** At every tier, the simulator's outputs have known biases. The deliverable isn't "perfect answers" — it's "consistent enough answers that the user can learn the bias and adjust." This is the realistic shape of the value.

---

## 10. Status / next steps

This document captures the design approach as of authoring. Concrete next actions, in order:

1. **Crucible wound-model design pass.** Review existing notes; decide what attribute(s) damage subtracts from, what "downed" means, what the action economy actually allows. Document decisions in Crucible design docs before implementation.
2. **Implement decisions in Crucible.** Wound mods, damage application via `resolveAttack`, "downed" check. Update `combatTests.ts` to assert the new behavior.
3. **RNG injection.** Add `$rng` to the sandbox; replace `Math.random` and `gaussian` usage in `combatUtils`. Make seed configurable per `JSActionRunner.run` invocation.
4. **Tier 1 sim slice.** Build `runScenario`, `shootClosest`, `headOnEngagement` in `tests/crucible/sims/`. Run at N=1, then N=10, then N=100. Print results.
5. **Look at what came out.** Are the numbers sensible? Is something obviously broken in Crucible? Is there a frustration that suggests what to add next? Use the answers to plan tier 2 or further Crucible work.

