# RollHub Milsim — The Plan

*Captured March 10, 2026. Written while pacing the living room, one beer deep, fired up for the first time since the original RollHub build.*

---

## The Core Insight

All the pieces exist. The engine is built. The world is built. The game system is designed. They just need to be connected. Stop building new pieces. Make a beeline for integration.

---

## What Already Exists

- **RollHub Engine:** Custom game engine with reactive modification system (dependency graph), custom DSL (ActionScript), manager-based architecture, serialization, Agones/K8s infrastructure. 3.5 years of development.
- **The Modification Engine:** Declarative YAML templates compile into a reactive dependency graph. Attributes auto-recompute when upstream values change. Namespaced, parameterized, composable. This is the gem. This is the competitive advantage.
- **The Abeceus System:** 140+ wiki files of internally consistent sci-fi worldbuilding. Five polities, economies, trade flows, military doctrine, pirate clans, corporations, characters, technology, history. Publishable quality.
- **The Game Design Document:** Detailed tactical milsim TTRPG design. Wound system, stress/morale, skill system with specializations, hit resolution (body as contiguous mass), equipment/loadout, fog of war, lethality philosophy. All designed for digital VTT.
- **D&D 5e SRD:** Already fully implemented in RollHub as modification templates and ActionScript. Proof the architecture works.

---

## Phase 1: The Treasure (Target: 2-4 months)

*"Sneak into the lair, steal the treasure. Come back for the dragon later."*

### 1. Fork RollHub

- Create a major branch for milsim development
- Keep the old branch running for D&D — backwards compatible, always available
- Don't touch production. This is dev-only for now.

### 2. Replace ActionScript with a JS VM (~4 hours)

- Current ActionScript is already basically JavaScript minus classes and modern features
- Replace the custom lexer/parser/compiler with Node's VM2 (or similar sandboxed JS runtime)
- Existing D&D ActionScript is mostly compatible — minimal porting needed
- Unlocks: TypeScript support, real language features, agent-readable SDK, proper debugging
- The modification engine stays exactly as-is — only the action execution layer changes

### 3. Go Full Dev Setup

- Local Docker Compose — no EC2, no cloud, no productionizing
- Hot reload for both UI and game server
- Game rules as files on the filesystem (not GCS)
- Agent can modify code → server hot reloads → test immediately
- This is the dream workflow: agent changes rules, you see results in seconds

### 4. Define Basic Milsim Rules

- Start with combat mechanics — the core loop
- Doesn't have to be perfect. Get v0.1 working and iterate.
- Key systems to implement first:
  - Hit resolution (geometric, body-as-contiguous-mass)
  - Wound system (dynamic generation, wound effects)
  - Stress/morale (visible thresholds, breakpoints)
  - Basic skill checks
  - Initiative and turn order
  - Cover and positioning
- Implement as modification templates (YAML) + JS actions
- Skip for now: vehicle combat, space combat, full equipment lists, progression system

### 5. Basic UX Features (Low-Hanging Fruit)

- Targeting: select a token on the map, trigger an action against it
- Action dialogues: context-specific popups for attacks, skills, etc.
- These are trivial for an AI agent — hours of work, not days

### 6. Playable Demo

- One map, two squads, basic combat encounter
- Rules running in the modification engine
- Playable end-to-end: move tokens, attack, resolve hits, apply wounds, track stress
- This is the milestone. When this works, the concept is proven.

---

## What NOT To Do Yet

| Temptation | Why Not Now |
|---|---|
| Rebuild the graphics engine | Babylon JS works well enough for a demo. Revisit later. |
| Monte Carlo simulations | The dragon. Incredibly cool. Also incredibly complex. Defer. |
| Rust port for performance | Only needed for Monte Carlo scale. No point until then. |
| More worldbuilding | 140+ wiki files is deep enough. Do it for fun/unwinding, not progress. |
| Productionize / deploy | Stay in local dev. Speed of iteration > production readiness. |
| Steam / native app | Browser is fine for now. Platform decisions come after the game works. |
| MCP / AI agent integration into platform | Build it after the basic game loop works. Dev workflow with agents comes first. |

---

## Phase 2: The Dragon (After Phase 1)

### Monte Carlo Simulation Engine

**The killer feature.** Two purposes:

1. **Game design tool:** Design encounters, tweak rules, run thousands of simulations, get statistical breakdowns. AI generates NPC strategies. Iterate toward the best game system faster than any human playtester could.
2. **GM tool:** Any GM sets up an encounter, hits "simulate," gets back: *"34% TPK rate. Primary failure mode: the sniper on the balcony. If players don't neutralize that position in round 2, survival drops to 20%."*

This is where the Rust port becomes necessary — thousands of fast template compilations for simulation at scale.

**This feature alone would make people never want to play another system without it.**

### MCP Integration

- AI agent as a first-class participant in the platform
- Agent can read game state, suggest actions, run NPCs, generate narrative
- Natural extension of the agent-friendly dev workflow from Phase 1

### Engine Performance

- Port the modification engine core to Rust (or optimize JS) for Monte Carlo throughput
- Keep the same interface — all existing templates and rules remain compatible
- Clear interface boundary: the game rules don't care what language the engine runs in

---

## The Scarlands (Separate Track)

Scarlands is the casual in-person campaign. Different approach entirely.

- Run in person with a battle mat and notes
- Minimal prep: 1-2 hours every week or two
- AI-generated session prep informed by existing lore (Saltspire, 50 NPCs, 3 hooks)
- "Laying tracks ahead of the freight train" — Angry GM philosophy
- Improvisation is part of the magic, not a failure of preparation
- Players: John, Caroline (maybe others)
- Does NOT need RollHub. Does NOT need the milsim system. Keep it simple.

---

## Schedule

- **Day job:** 7 hours/day, AI-assisted (maintains output of previous 9-10 hour days)
- **Milsim project:** 3× four-hour blocks per week (~12 hours)
- **Scarlands prep:** 1-2 hours every 1-2 weeks
- **Protected:** Gym, self-improvement, dating, social life, rest, Sundays off

12 hours/week of agent-assisted development ≈ 40+ hours of pre-AI solo work. In 2-4 months, that's enough to get Phase 1 done.

---

## Key Architectural Decisions

1. **The modification engine is the core.** Keep it. Don't rewrite it. It's the competitive advantage.
2. **ActionScript → JS VM.** Less maintenance, more features, agent-friendly, TypeScript support. The custom compiler was a learning experience; a real VM is the production choice.
3. **Local dev first.** Speed of iteration beats everything else. Hot reload, filesystem, Docker Compose.
4. **Agent-friendly from day one.** The dev workflow should assume an AI agent is modifying code alongside you. File-based, hot-reloadable, well-documented interfaces.
5. **Fork, don't rewrite.** Keep the old RollHub alive. Branch for milsim. Maintain backwards compatibility where possible, but don't let it block progress.
6. **Imperfect rules ship; perfect rules don't.** Get v0.1 of the combat system working. Iterate. Don't design in a vacuum.

---

## Why This Matters

Three and a half years of engine work. A fully realized sci-fi universe. A detailed game system design. A custom programming language. A reactive state engine. All of it sitting dormant.

The pieces exist. The vision is clear. The engineering skill is proven. The AI tools are here to accelerate everything.

It would be a waste not to build this.

*"I haven't felt like this in a while. This is like that scene in Lord of the Rings where Theoden gets the curse removed."*
