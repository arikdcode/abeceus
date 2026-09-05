---
title: Campaign Structure
---

# Campaign Structure

How the player moves through the campaign. Companion to [[plot/working-premise|Working Premise]] — that doc is *what the story is*; this one is *how you traverse it*. As with the premise, **Decided** marks committed shape; specifics are still open.

---

## The progression gate is information

The thing that unlocks the game is not levels, keys, or XP — it's **information**. You have a map of the system (planets, moons, stations, cities), but at the start there's nowhere with a *reason* to go. As you learn things, reasons appear.

- A **lead** unlocks a **node** (a location and/or a mission).
- Completing a mission yields **more leads**, which unlock more nodes.
- The result is a **lead-driven investigation board** — a detective's corkboard driving a mission-select map. (An in-world artifact for this is worth building: a case file / contact who assembles the board / a wall of connected faces.)

This is how the [[plot/working-premise#The Conspiracy A Hidden Org Chart|hidden org chart]] gets reverse-engineered in practice: you don't grind toward the top, you *investigate* toward it.

---

## Many small locations, not a few big hubs (Decided)

Deliberately **opposite** the big-explorable-hub structure of most CRPGs (e.g. Baldur's Gate 3's large act-locations). Instead: **lots of small, mission-focused locations**, surfaced by information rather than by wandering.

- Examples: an aristocrat's compound, an office building housing AIA operatives, a [[locations/oziri/zirta/index|Zirta]] pirate lord's personal compound, the Emperor's palace, a specific shopkeeper's shop.
- You don't roam [[locations/oziri/zirta/index|Zirta]] exploring it; you learn about *specific places of interest* and go to them. (Nodes needn't all be missions — a useful shopkeeper or contact can sit on the map too.)

**Why this is also the right production call:** small, bounded mission maps fit the [[game/game-design-document|tactical-milsim combat engine]] (discrete encounters) far better than sprawling open hubs, and are dramatically more tractable to build — and to later port to RollHub. The narrative structure and the technical foundation want the same thing.

---

## The topology and its rules

Progression is a **branching web with lots of simultaneous options** — many possible places to go and missions to pursue at any given time, multiple paths to any given target, and multiple *approaches* to each (stealth / violence / coercion; moral / immoral). This is where a lot of the player's **agency** lives — mechanical *and* moral.

Design rules that make the web work:

- **Redundant edges (the key rule).** Each node should be reachable by **two or three different leads**, not one. This gives player agency *and* is your **soft-lock insurance and testability margin** — a broken or missed path becomes a detour, not a dead end. (Directly mitigates the validation risk of a highly branching structure.)
- **Never let the frontier go empty.** The player should always have at least a couple of open leads, with a **"coldest lead" fallback**, so they're never standing on the map with nowhere to go and no idea why.
- **Optional content.** You shouldn't have to do every mission; multiple missions can lead to the same person. Branches can be skipped.
- **A jump is several missions, not one.** Climbing one rung typically means cultivating a faction, acquiring equipment or allies, and running side objectives first — not a single "do mission → advance."

> **Validation note (deferred):** heavy branching is harder to test for soft-locks and dead ends. Mitigations: redundant edges, optional content, and the option to *constrain* the branch count if needed. Treated as an implementation detail for now.

---

## Act structure (Decided in shape)

The [[plot/working-premise#The shape a leaderless peer network behind an airgap|two-layer conspiracy]] gives a natural three-act shape, and — critically — **each act should feel like a different genre**, which is the main defense against six-or-seven near-identical "trace the next link" jumps blurring together.

1. **Act I — Crossing the airgap.** Inside the [[organizations/aia|NEXUS]] cloud: nobody knows anything, everyone is deniable, *anyone* could be carrying a work order on you. Plays like **paranoid counter-intelligence** — you're not climbing a chart yet, you're hunting for the *edge* of the cloud: the first thread that leads to someone "real."
2. **Act II — The conspirators.** Out of the cloud, the genre shifts to **intrigue among named, powerful people** — politics, high society, factions courting and using you. You climb the peer network.
3. **Act III — The apex / Morrec / the choice.** The Consortium is leaderless, so there's no final boss — the climax is the [[plot/working-premise#The Two Tracks and the Final Choice|convergent choice]], with [[timeline/azure-reach-incident|Morrec]] as the detonator.

**Crossing the airgap is the midpoint** — the moment the enemy stops being a faceless cloud and becomes people you can hate. That tonal shift, not just a plot beat, is what sustains a long campaign.

---

## Where leads come from

Most leads come from the **information topology**, not from being attacked:

- Mission objectives and discovered documents
- **Interrogations / prisoners** (canonically, catching one wetwork operative is the Act I ignition)
- **Faction favor** — dealings with quest-givers across the powers
- **[[organizations/aia|NEXUS information-bidding]]** — a canonical open market where intel can be *bought* (a whole non-violent lead economy already in the setting)
- **Ambush-derived leads** — real but *occasional spice, not the staple* (see below)

---

## The hunt as pressure and feedback loop

You are [[plot/working-premise#Hunter and hunted|hunter and hunted]] throughout. The hunt is primarily **pressure and paranoia** — a constant — rather than the main source of leads.

- **Escalating heat.** Early, the conspirators treat you as an ordinary loose end — "eliminate a nobody, just in case." As you climb, they realize you're a serious threat and commit their best.
- **The self-propelling loop.** Their attempts to erase you *leak*: more resources against you means more paper trail, more clues to trace. The conspiracy's own paranoia manufactures part of your path upward — so the difficulty curve and the narrative curve are the same curve. (Use sparingly enough that not every lead is an ambush.)

---

## Still to work out

- The **faction quest-giver web** — who you talk to, in which factions ([[locations/oziri/index|Oziri]] clans, [[organizations/aia|AIA]], [[locations/mesulea/index|Mesulea]] corps, [[locations/nuilea/index|Nuilea]] military, aristocrats), to get intel / equipment / allies.
- **Event ordering & gating** — which leads open which nodes, sub-clues vs. main leads, and how the redundant edges are laid out.
- **The specific mission list** and how approaches (stealth/violence/coercion) branch within each.
