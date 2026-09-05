# Implemented interpretation

The wiki specs are directions, not a finished numbers table. This file records the defaults the sandbox uses so we can massage them.

## Initiative

Effective initiative is `round(initiative_base + loadout_mod)`, clamped 1–6. Units are grouped into tiers. Within a tier, a coin flip picks which team leads, then sides alternate. Order is static for the fight. Old scenario values above 6 are treated as 3.

## Contact

Combat starts in a contact phase. Each unit gets `reaction_max * surprise * (0.9..1.1)`, with a veteran floor. Allowed: walk, change posture, ready weapon, then **Ready**. No shooting. When every living unit is ready, play begins.

Scenario: `map.surprise0` / `map.surprise1` (1.0 = expected, 0.2 = ambush).

## Channels

A turn is 5 seconds. Hands / Legs / Focus / Voice spend independently. Pain and blood stretch Hands/Focus. Typical costs:

| Action | Hands | Legs | Focus |
|---|---|---|---|
| Walk / run / sprint | 0 | dist/speed | 0 / 0.25× / up to 3s |
| Snap | 1.0 | 0 | 0.5 |
| Aimed | 3.2 (2.5 if firearms ≥ 4) | 0 | same |
| Burst (3) | 1.8 | 0 | 1.0 |
| Reload | 2.0 | 0 | 0.6 if firearms < 3 |
| Bandage | 3.6 / 2.0 skilled | 0.4 | 2.8 / 0 skilled |
| Prone / crouch | 0 | 0.8 / 0.45 | 0 |
| Overwatch | remaining Hands | 0 | remaining Focus (min 1.5) |

Sprint this turn forbids shooting. Walking while shooting is allowed; run/sprint widen the cone.

## Reactions

Separate budget: `1.0 + 0.55*awareness + 1.6*experience` seconds (about 1.5–4s). After an enemy move, one eligible unit may Shift (~1.8m), Drop, Track, Brace, or Skip. No shooting. No cascades.

## Overwatch

Spends remaining Hands+Focus. Watches a cone. If a mover crosses it, Fire or Hold. Shot is an aimed torso shot. Reaction budget still exists.

## Attack

2D Gaussian in the target plane (lateral + height). Accuracy from weapon spread / firearms, shot type, movement, posture, pain/blood/stress. Cover with **height** clips samples below that height and takes durability. Silhouette regions: head, torso, abdomen, arms, legs (prone is a low slab). Armor is per-plate, pen vs protection, durability. Burst = 3 samples. Stray hits still exist.

## Wounds

No HP. Blood / pain / stress pools plus a wound list. Depth from remaining pen. Vital criticals can down or kill. Bleed ticks at the start of that unit's turn. Pain decays 6/turn, stress 3. Blood ≥ 90 downs. Pain > 2× tolerance downs. Bandage treats the first bleeding wound.

Visibility / stealth is still queued. Numbers are playtest defaults.
