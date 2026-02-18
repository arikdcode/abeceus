"""
Core combat loop.
V1: fixed behavior (aim center-mass, fire single shot every turn).
"""

from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Optional

from .models import (
    Combatant, CharacterDef, WeaponDef, ArmorDef, CoverDef, CoverState, ArmorState,
)
from .stats import build_combatant
from .attack import resolve_attack
from .wounds import generate_wound, apply_wound, tick_pools
from .recorder import Recorder, ShotEvent

MAX_ROUNDS = 50


def load_scenario(scenario_path: Path) -> dict:
    base = scenario_path.parent.parent  # sim/ directory
    raw = json.loads(scenario_path.read_text())

    combatant_specs = []
    for spec in raw["combatants"]:
        char = CharacterDef.from_json(base / "characters" / spec["character"])
        weapon = WeaponDef.from_json(base / "equipment" / spec["weapon"])
        armor_defs = [ArmorDef.from_json(base / "equipment" / a) for a in spec.get("armor", [])]
        cover_def = CoverDef(**spec["cover"]) if spec.get("cover") else None
        position = tuple(spec["position"])

        combatant_specs.append({
            "id": spec["id"],
            "char": char,
            "weapon": weapon,
            "armor_defs": armor_defs,
            "cover_def": cover_def,
            "position": position,
        })

    return {"name": raw["name"], "description": raw["description"], "specs": combatant_specs}


def _build_combatants(specs: list[dict]) -> list[Combatant]:
    return [
        build_combatant(
            combatant_id=s["id"],
            char=s["char"],
            weapon=s["weapon"],
            armor_defs=s["armor_defs"],
            cover_def=s["cover_def"],
            position=s["position"],
        )
        for s in specs
    ]


def _determine_initiative(combatants: list[Combatant]) -> list[Combatant]:
    """Sort by initiative descending; coin flip for ties."""
    shuffled = list(combatants)
    random.shuffle(shuffled)  # randomize before stable sort for tie-breaking
    return sorted(shuffled, key=lambda c: c.initiative, reverse=True)


def _pool_snapshot(c: Combatant) -> dict:
    return {
        "blood_loss_pct": round(c.blood_loss_pct, 1),
        "bleed_rate": round(c.bleed_rate, 1),
        "pain": round(c.pain, 1),
        "stress": round(c.stress, 1),
        "ammo": c.ammo,
        "alive": c.alive,
        "conscious": c.conscious,
    }


def run_combat(specs: list[dict], recorder: Recorder, iteration: int) -> None:
    """Run a single combat iteration."""
    recorder.start_iteration(iteration)
    combatants = _build_combatants(specs)
    turn_order = _determine_initiative(combatants)

    for round_num in range(1, MAX_ROUNDS + 1):
        recorder.start_round(round_num)

        for actor in turn_order:
            if not actor.can_act:
                continue

            # Find a target (first enemy that can still act, or at least alive)
            target = _pick_target(actor, combatants)
            if target is None:
                continue

            # V1 behavior: aim center-mass, fire single shot
            # Reload if empty
            if actor.ammo <= 0:
                actor.ammo = actor.weapon.magazine_size
                # Reload consumes the turn in V1
                continue

            results = resolve_attack(actor, target, fire_mode_name="single")

            for ar in results:
                wound = None
                if ar.hit and ar.armor_result not in ("deflected", "stopped"):
                    wound = generate_wound(ar, actor.weapon.damage_type)
                    if wound:
                        apply_wound(target, wound)

                recorder.record_shot(ShotEvent(
                    round_num=round_num,
                    shooter_id=actor.id,
                    target_id=target.id,
                    fire_mode="single",
                    accuracy_angle_deg=ar.accuracy_angle_deg,
                    spread_radius_m=ar.spread_radius_m,
                    sample_x=ar.sample_x,
                    sample_y=ar.sample_y,
                    hit=ar.hit,
                    region=ar.region,
                    armor_result=ar.armor_result,
                    plate_hit=ar.plate_hit,
                    plate_durability_after=ar.plate_durability_after,
                    cover_hit=ar.cover_hit,
                    wound_severity=wound.severity if wound else None,
                    wound_description=wound.description if wound else None,
                ))

            # Check if target is down
            if not target.alive or not target.conscious:
                break

        # End-of-round: tick pools for all combatants
        for c in combatants:
            if c.alive:
                tick_pools(c)
            recorder.record_pool_snapshot(c.id, _pool_snapshot(c))

        recorder.end_round()

        # Check end conditions
        active = [c for c in combatants if c.can_act]
        if len(active) <= 1:
            winner = active[0] if active else None
            if winner:
                # Determine cause
                loser = [c for c in combatants if c.id != winner.id][0]
                cause = "killed" if not loser.alive else "incapacitated"
                recorder.end_iteration(winner.id, cause)
            else:
                recorder.end_iteration(None, "mutual_kill")
            return

    # Reached max rounds
    recorder.end_iteration(None, "draw_max_rounds")


def _pick_target(actor: Combatant, all_combatants: list[Combatant]) -> Optional[Combatant]:
    for c in all_combatants:
        if c.id != actor.id and c.alive:
            return c
    return None
