# Sandbox — Working Design

A greenfield tech demo. **Nothing in this folder imports or depends on RollHub / Crucible / existing engine code.** We can steal *ideas* from the wiki and old notes; we don't steal the implementation.

This file is the conversation. Keep it current. Mark decisions **Decided** once we mean them.

---

## What we're building

A **top-down tactical RPG** (turn-based, highly lethal, squad-based) whose first job is to prove a *structure*, not a look.

The structure we care about:

1. **A simulation core that does not know about graphics.** Headless-first. Same rules whether a human is clicking, an AI is playing, or a batch job is running 10,000 fights.
2. **Presentation is a consumer of the core, not a part of it.** We should be able to swap "ugly debug view" for "something that actually feels cool" without rewriting combat, wounds, or AI.
3. **Agent-friendly.** Easy for a coding agent (and for us) to inspect state, reproduce a fight, dump a turn, and know why something happened.

If those three hold, we can iterate the *game* and the *look* independently, and we can tune lethality with simulations instead of vibes.

---

## What we already believe (from earlier work)

Not binding. Useful so we don't re-litigate everything from zero.

### The feel

From the [game design document](../wiki/game/game-design-document.md):

- Tactical milsim, hard sci-fi. Combat is dangerous. Reckless play gets people killed. Smart play (cover, recon, suppression, the right tool) is what keeps a squad alive.
- No HP bar as the fiction. Wounds are *events*: blood loss, pain, stress, structural damage. One good hit can end someone; armor and positioning are why it often doesn't.
- Uncertainty over randomness. Enemy decisions and incomplete information should be the interesting unknown, not dice that occasionally murder a veteran for no reason.

### Combat mechanics we already sketched

From the [combat working doc](../wiki/game/combat-poc/combat-mechanics-working.md) and subsystem notes:

| Piece | Direction we landed on |
|---|---|
| Initiative | Deterministic. Higher stat goes first. Static order for the fight. |
| Contact phase | A universal *reaction* round before the first turn. Defensive / preparatory only. Ambush is a sliding scale, not a binary. |
| Action economy | Four concurrent channels: Hands, Legs, Focus, Voice. Across channels = simultaneous. Within a channel = queued. Proficiency compresses time. |
| Attacks | Geometric accuracy cone vs. a 2D silhouette. Cover clips the silhouette. No separate hit roll + drift table. |
| Wounds | Blood / pain / stress pools + structural impairments. No hit points. |
| Reactions | Defensive reactions (reposition, prone, brace) plus deliberate overwatch. No reaction cascades. |

The existing Crucible scripts (`resolveAttack`, hit-chance cone, a pain placeholder) were UI proofs, not a finished combat system. Treat them as sketches.

### Campaign / world (background only)

We spent a lot of time on plot: revenge vs. shadow war, lead-driven investigation board, many small mission maps instead of BG3-scale hubs. **None of that is this demo.** The campaign structure still matters later because *small, bounded mission maps* are exactly what a tactical engine wants. For now: one map, a few people, a fight.

### Simulation as a first-class tool

We already wanted "change a number, re-run 100k fights, see what moved." That only works if the core is headless, deterministic (seeded), and cheap to step. This sandbox exists to make that true *before* we couple it to a real renderer or to RollHub.

---

## Architecture (leaning hard this way)

Two layers. One interface between them.

```
                    ┌─────────────────────────┐
                    │     Scenario / data     │
                    │  (maps, units, loadouts)│
                    └────────────┬────────────┘
                                 │
                                 ▼
┌────────────────────────────────────────────────────────┐
│                     SIM CORE                           │
│  world state  →  actions  →  new state + events        │
│  no pygame, no HTML, no Godot, no sockets              │
└────────────────────────────┬───────────────────────────┘
                             │  events + snapshots
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        Headless CLI    Debug presenter   Pretty presenter
        (batch sims)    (ugly, honest)    (later)
```

### The contract

The core exposes something like:

- **State** — a serializable snapshot of the world (units, map, turn, wounds, visibility). JSON or an equivalent dump is a first-class artifact, not a debug afterthought.
- **Actions** — the *only* way to mutate state. `Move`, `Shoot`, `GoProne`, `EndTurn`, … An action is data. The core applies it and returns `(new_state, events)`.
- **Events** — a log of what happened this step (`ShotResolved`, `WoundApplied`, `UnitDown`, `TurnEnded`). Presenters animate or print these. Sims aggregate them. Agents grep them.
- **Queries** — pure reads the UI/AI need (`legal_actions(unit)`, `los(a, b)`, `hit_preview(attacker, target)`). Never mutate.

Rules:

1. Presenters never write world state. They send actions.
2. The core never imports a renderer.
3. A headless run is just "no presenter." Same binary / same library.
4. Two presenters can drive the same core. That's how we replace ugly with pretty.

This is the "engine-agnostic" piece that actually matters. We don't need to pretend Unity and Godot and a terminal are interchangeable on day one. We need the *game* to not care which of them is watching.

### Presenter contract is game-shaped (Decided)

The graphics side sees **game concepts**, not graphics concepts. A frame is units, cover, facing, a shot cone, pain, whose turn it is — not sprites, meshes, shaders, or cameras. The presenter is allowed to have a camera; the core is not allowed to know that.

That is what keeps a 2D canvas and a later 3D isometric view from rewriting the engine. Verticality (multiple levels) is a *world* problem we are deferring; the core is already continuous 2D so a z-axis can be added later without changing the action protocol.

### Why this also makes the engine swappable

Once the contract is stable, the *implementation* of the core can change without the presenter noticing, as long as snapshots and events still make sense. That's the iteration story you want.

---

## Language (Decided: C++)

C++ from the start. The engine is first-class; we are writing our own, and it will stay small. Version 2 will probably keep pieces of this, so we are not paying a Python→C++ port later.

No existing utility libraries. Greenfield. This folder is an alpha we are willing to throw away — it exists to teach us what we care about.

---

## Two demo styles — pick the ugly one first

You're torn between "bare-bones but honest" and "it should feel cool."

**Do the ugly one first.** Not because we don't care about feel — because the interface is the product of this phase, and a pretty view will hide whether the interface is any good.

What "ugly but honest" means:

- Top-down grid or simple 2D plane. Colored rectangles for people. Blocks for cover. A cone drawn as lines when you shoot.
- Every relevant number is visible: action channels, pain, blood, who's next, why a shot missed.
- It can look like a board-game prototype. It must *play* like the game.

What "feels cool" becomes: a second presenter that consumes the same events. When we want juice (camera, sound, animation), we add it there. We do not grow the core to make the screenshot nicer.

If the weekend goes well, we can put a thin "cool" skin on the same core later without throwing the demo away.

---

## Agent-friendly by default

This is a design requirement, not a nicety. Things that make the program inspectable:

- **Seeded everything.** Same seed + same scenario + same action sequence = same result.
- **State dumps.** `state.json` (or equivalent) after every turn, on demand, on crash.
- **Event log.** Human-readable *and* machine-readable. "Bravo shot Alpha, sample landed on chest plate, pen 12 vs prot 18, pain +22, no structural."
- **Scenarios as files.** A fight is a markdown/YAML/JSON file we can edit without touching code.
- **Headless replay.** Feed a recorded action list back into the core; get the same log out.
- **No hidden UI state that affects rules.** If the camera, hover, or animation clock can change a hit, the interface is already broken.
- **Tests that are just scenarios.** "2v2, open ground, shoot nearest" is a file plus an assertion on the event log.

A coding agent should be able to run one fight, read the log, and propose a rule change without opening a window.

---

## First slice (Decided)

Small enough to finish; big enough to prove the split.

1. **Map** — continuous 2D bounds, a few cover AABBs. A grid is drawn as a *ruler only*; it is not a movement or occupancy system.
2. **Units** — 2v2. Circle (or oval) plus a facing tick. Enough ink that you can read team, heading, and "this one is hurting."
3. **Turn loop** — deterministic initiative, one unit at a time.
4. **Actions** — `Move` (continuous, budget-limited), `Shoot` (accuracy cone vs silhouette / cover), `EndTurn`.
5. **Outcome** — pain stub + downed flag. Fight ends when one side is down.
6. **Two drivers** — headless CLI (run / auto / replay / dump) and an HTML canvas presenter talking HTTP JSON. Same core.
7. **One scenario file** and a seed.

What we skip: campaign, inventory, full wound table, contact phase, stealth, 3D, verticality, RollHub, React/Vue (vanilla canvas + a side panel is enough to prove overlay-friendly HTML).

**Slice 1 shipped, then the combat spec was folded in.** See `README.md` and `MECHANICS.md` (the numeric interpretation of the wiki docs). Headless `run` / `replay` / `dump` and `serve` share one C++ core.

---

## Open questions (answered)

1. **Grid vs. continuous.** Continuous. Grid overlay for distance only. **Decided.**
2. **Slice-1 shooting.** Real cone, not a percentile stub. **Decided.**
3. **Presenter.** HTML/CSS/canvas, driven by a game-shaped JSON view-model from the C++ process. No pygame. 3D isometric is later, behind the same interface. **Decided.**
4. **Python libs.** Not used. **Decided.**
5. **Name.** Still just "sandbox."

---

## What this folder is allowed to be

- Ugly.
- Incomplete.
- Opinionated about architecture, sloppy about content.
- Thrown away if the interface is wrong — cheaply, because nothing else depends on it.

What it is not allowed to be: a new RollHub feature branch, a graphics experiment that owns the rules, or a rewrite of the wiki plot.
