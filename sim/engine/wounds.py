"""
Wound generation and pool management.
Takes attack results and updates combatant blood/pain/stress pools.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .models import Combatant
from .attack import AttackResult


@dataclass
class Wound:
    region: str
    severity: str        # "graze", "light", "moderate", "severe", "critical", "fatal"
    damage_type: str
    bleed_rate: float    # % blood loss per round
    pain: float          # immediate pain added
    stress: float        # immediate stress added
    description: str


# Penetration-to-severity mapping (remaining_pen after armor)
def _severity_from_pen(remaining_pen: int, lethality: str) -> str:
    if lethality == "fatal":
        if remaining_pen >= 4:
            return "fatal"
        elif remaining_pen >= 2:
            return "critical"
        else:
            return "severe"
    elif lethality == "critical":
        if remaining_pen >= 6:
            return "fatal"
        elif remaining_pen >= 4:
            return "critical"
        elif remaining_pen >= 2:
            return "severe"
        else:
            return "moderate"
    elif lethality == "severe":
        if remaining_pen >= 5:
            return "critical"
        elif remaining_pen >= 3:
            return "severe"
        elif remaining_pen >= 1:
            return "moderate"
        else:
            return "light"
    elif lethality == "moderate":
        if remaining_pen >= 5:
            return "severe"
        elif remaining_pen >= 3:
            return "moderate"
        else:
            return "light"
    else:  # "light"
        if remaining_pen >= 4:
            return "moderate"
        elif remaining_pen >= 2:
            return "light"
        else:
            return "graze"


# Wound effect tables — rough first pass
WOUND_EFFECTS: dict[str, dict] = {
    "fatal":    {"bleed_rate": 15.0, "pain": 100.0, "stress": 30.0},
    "critical": {"bleed_rate": 8.0,  "pain": 60.0,  "stress": 20.0},
    "severe":   {"bleed_rate": 4.0,  "pain": 35.0,  "stress": 12.0},
    "moderate": {"bleed_rate": 2.0,  "pain": 20.0,  "stress": 8.0},
    "light":    {"bleed_rate": 0.5,  "pain": 10.0,  "stress": 4.0},
    "graze":    {"bleed_rate": 0.1,  "pain": 5.0,   "stress": 2.0},
}

WOUND_DESCRIPTIONS: dict[str, dict[str, str]] = {
    "head":         {"fatal": "Catastrophic head trauma", "critical": "Severe head wound", "severe": "Deep laceration to skull", "moderate": "Scalp wound", "light": "Grazed head", "graze": "Near miss — scalp nick"},
    "neck":         {"fatal": "Severed carotid artery", "critical": "Deep neck wound", "severe": "Neck laceration", "moderate": "Neck graze", "light": "Superficial neck wound", "graze": "Barely grazed neck"},
    "upper_torso":  {"fatal": "Heart/lung destruction", "critical": "Chest cavity penetration", "severe": "Deep chest wound", "moderate": "Rib fracture, tissue damage", "light": "Flesh wound, chest", "graze": "Chest graze"},
    "abdomen":      {"fatal": "Massive abdominal trauma", "critical": "Gut penetration, organ damage", "severe": "Deep abdominal wound", "moderate": "Abdominal flesh wound", "light": "Shallow abdominal cut", "graze": "Abdomen graze"},
    "groin":        {"fatal": "Femoral artery severed", "critical": "Deep groin wound", "severe": "Groin laceration", "moderate": "Groin flesh wound", "light": "Inner thigh hit", "graze": "Groin area graze"},
    "left_arm":     {"fatal": "Arm destroyed", "critical": "Shattered arm", "severe": "Deep arm wound", "moderate": "Arm muscle damage", "light": "Arm flesh wound", "graze": "Arm graze"},
    "right_arm":    {"fatal": "Arm destroyed", "critical": "Shattered arm", "severe": "Deep arm wound", "moderate": "Arm muscle damage", "light": "Arm flesh wound", "graze": "Arm graze"},
    "left_thigh":   {"fatal": "Femoral artery severed", "critical": "Shattered femur", "severe": "Deep thigh wound", "moderate": "Thigh muscle damage", "light": "Thigh flesh wound", "graze": "Thigh graze"},
    "right_thigh":  {"fatal": "Femoral artery severed", "critical": "Shattered femur", "severe": "Deep thigh wound", "moderate": "Thigh muscle damage", "light": "Thigh flesh wound", "graze": "Thigh graze"},
    "left_shin":    {"fatal": "Lower leg destroyed", "critical": "Shattered tibia", "severe": "Deep shin wound", "moderate": "Shin muscle damage", "light": "Shin flesh wound", "graze": "Shin graze"},
    "right_shin":   {"fatal": "Lower leg destroyed", "critical": "Shattered tibia", "severe": "Deep shin wound", "moderate": "Shin muscle damage", "light": "Shin flesh wound", "graze": "Shin graze"},
}


def generate_wound(
    attack_result: AttackResult,
    damage_type: str,
) -> Optional[Wound]:
    if not attack_result.hit:
        return None
    if attack_result.armor_result in ("deflected", "stopped"):
        return None

    remaining_pen = attack_result.armor_remaining_pen
    lethality = attack_result.lethality or "light"
    severity = _severity_from_pen(remaining_pen, lethality)
    effects = WOUND_EFFECTS[severity]

    region = attack_result.region or "upper_torso"
    desc_map = WOUND_DESCRIPTIONS.get(region, WOUND_DESCRIPTIONS["upper_torso"])
    description = desc_map.get(severity, f"{severity} wound to {region}")

    return Wound(
        region=region,
        severity=severity,
        damage_type=damage_type,
        bleed_rate=effects["bleed_rate"],
        pain=effects["pain"],
        stress=effects["stress"],
        description=description,
    )


def apply_wound(target: Combatant, wound: Wound) -> None:
    target.bleed_rate += wound.bleed_rate
    target.pain += wound.pain
    target.stress += wound.stress

    if wound.severity == "fatal":
        target.alive = False
        target.conscious = False


def tick_pools(combatant: Combatant) -> None:
    """End-of-round pool updates."""
    # Blood loss increases by bleed rate
    combatant.blood_loss_pct += combatant.bleed_rate
    combatant.blood_loss_pct = min(100.0, combatant.blood_loss_pct)

    # Pain decays slightly each round (adrenaline)
    combatant.pain = max(0.0, combatant.pain * 0.92 - 1.0)

    # Check blood loss incapacitation
    bl_shift = combatant.blood_loss_threshold_shift_pct
    if combatant.blood_loss_pct >= (90 + bl_shift):
        combatant.alive = False
        combatant.conscious = False
    elif combatant.blood_loss_pct >= (70 + bl_shift):
        combatant.conscious = False

    # Check pain incapacitation
    if combatant.pain > combatant.pain_tolerance * 1.5:
        combatant.conscious = False

    # Check stress break
    if combatant.stress > combatant.stress_threshold * 2:
        combatant.conscious = False
