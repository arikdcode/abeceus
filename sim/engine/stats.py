"""
Derived stat computation.
Extracted from generate_characters.py and extended to account for gear weight.
"""

from __future__ import annotations

from .models import Combatant, CharacterDef, WeaponDef, ArmorDef, ArmorState, CoverDef, CoverState

ROUND_SECONDS = 6


def build_combatant(
    combatant_id: str,
    char: CharacterDef,
    weapon: WeaponDef,
    armor_defs: list[ArmorDef],
    cover_def: CoverDef | None,
    position: tuple[float, float],
) -> Combatant:
    a = char.attributes
    s = char.skills

    agi = a["agility"]
    end = a["endurance"]
    per = a["perception"]
    wil = a["willpower"]
    str_ = a["strength"]
    tactics = s.get("tactics", 0)
    firearms = s.get("firearms", 0)

    total_gear_weight = weapon.weight_kg + sum(ad.weight_kg for ad in armor_defs)
    capacity = str_ * 15
    overweight = max(0.0, total_gear_weight - capacity * 0.6)
    gear_init_penalty = int(overweight // 8)  # -1 init per 8 kg over 60% capacity

    initiative = max(1, agi - gear_init_penalty)
    reaction_budget = agi + tactics // 2
    contact_phase_budget = per + tactics // 2
    pain_tolerance = (end + wil) * 10
    stress_threshold = (wil * 2) + tactics
    walk_speed = round(agi * 1.5, 1)
    sprint_speed = round(agi * 3.0, 1)
    accuracy_skill_mod = max(1, firearms)  # floor at 1 to avoid division by zero
    accuracy_agility_bonus = 0.5 if agi >= 4 else 0.0
    blood_loss_shift = (end - 2) * 5

    armor_states = [ArmorState.from_def(ad) for ad in armor_defs]
    cover_state = CoverState.from_def(cover_def) if cover_def else None

    return Combatant(
        id=combatant_id,
        name=char.name,
        attributes=dict(a),
        skills=dict(s),
        initiative=initiative,
        reaction_budget_s=reaction_budget,
        contact_phase_budget_s=contact_phase_budget,
        pain_tolerance=pain_tolerance,
        stress_threshold=stress_threshold,
        carry_capacity_kg=capacity,
        walk_speed_ms=walk_speed,
        sprint_speed_ms=sprint_speed,
        accuracy_skill_mod=accuracy_skill_mod,
        accuracy_agility_bonus=accuracy_agility_bonus,
        blood_loss_threshold_shift_pct=blood_loss_shift,
        weapon=weapon,
        armor_pieces=armor_states,
        cover=cover_state,
        position=position,
        ammo=weapon.magazine_size,
    )
