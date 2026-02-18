"""
Attack resolution: cone model, 2D Gaussian sampling, silhouette hit checking,
armor penetration.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import Optional

from .models import Combatant, PlateState


# ---------------------------------------------------------------------------
# Silhouette definition (simplified V1 — rectangular regions, front-facing)
# All coordinates in meters, origin at feet-center of a standing figure.
# Height ~1.8m total.
# ---------------------------------------------------------------------------

@dataclass
class SilhouetteRegion:
    name: str
    x_min: float
    x_max: float
    y_min: float  # 0 = feet
    y_max: float
    lethality: str  # "fatal", "critical", "severe", "moderate", "light"


HUMANOID_SILHOUETTE: list[SilhouetteRegion] = [
    SilhouetteRegion("head",         -0.10, 0.10, 1.55, 1.80, "fatal"),
    SilhouetteRegion("neck",         -0.06, 0.06, 1.45, 1.55, "fatal"),
    SilhouetteRegion("upper_torso",  -0.20, 0.20, 1.10, 1.45, "critical"),
    SilhouetteRegion("abdomen",      -0.18, 0.18, 0.85, 1.10, "severe"),
    SilhouetteRegion("groin",        -0.10, 0.10, 0.75, 0.85, "severe"),
    SilhouetteRegion("left_arm",     -0.35, -0.20, 1.00, 1.45, "moderate"),
    SilhouetteRegion("right_arm",     0.20,  0.35, 1.00, 1.45, "moderate"),
    SilhouetteRegion("left_thigh",   -0.12, -0.02, 0.45, 0.75, "moderate"),
    SilhouetteRegion("right_thigh",   0.02,  0.12, 0.45, 0.75, "moderate"),
    SilhouetteRegion("left_shin",    -0.10, -0.02, 0.10, 0.45, "light"),
    SilhouetteRegion("right_shin",    0.02,  0.10, 0.10, 0.45, "light"),
]

SILHOUETTE_CENTER_MASS = (0.0, 1.20)  # center of upper torso


@dataclass
class AttackResult:
    hit: bool
    region: Optional[str] = None
    lethality: Optional[str] = None
    sample_x: float = 0.0
    sample_y: float = 0.0
    accuracy_angle_deg: float = 0.0
    spread_radius_m: float = 0.0
    armor_result: Optional[str] = None  # "deflected","stopped","partial","penetrated","full_pen"
    armor_remaining_pen: int = 0  # penetration that got through
    plate_hit: Optional[str] = None
    plate_durability_after: int = 0
    cover_hit: bool = False


def compute_accuracy_angle(
    attacker: Combatant,
    fire_mode_spread_mult: float = 1.0,
    wound_modifier: float = 1.0,
) -> float:
    """Compute the accuracy cone half-angle in degrees."""
    base = attacker.weapon.base_spread_deg
    skill = attacker.accuracy_skill_mod + attacker.accuracy_agility_bonus
    skill_factor = 1.0 / max(0.5, skill)

    # Pain degrades accuracy: each 10 pain above 50% tolerance = +10% spread
    pain_ratio = attacker.pain / max(1, attacker.pain_tolerance)
    pain_factor = 1.0 + max(0.0, (pain_ratio - 0.5) * 2.0)

    angle = base * skill_factor * fire_mode_spread_mult * pain_factor * wound_modifier
    return max(0.1, angle)


def _apply_cover_clip(
    regions: list[SilhouetteRegion],
    cover_height: float,
) -> list[SilhouetteRegion]:
    """Remove or clip silhouette regions behind cover."""
    clipped = []
    for r in regions:
        if r.y_max <= cover_height:
            continue  # fully behind cover
        if r.y_min >= cover_height:
            clipped.append(r)  # fully above cover
        else:
            # Partially clipped — adjust y_min
            clipped.append(SilhouetteRegion(
                name=r.name,
                x_min=r.x_min, x_max=r.x_max,
                y_min=cover_height, y_max=r.y_max,
                lethality=r.lethality,
            ))
    return clipped


def resolve_attack(
    attacker: Combatant,
    target: Combatant,
    fire_mode_name: str = "single",
) -> list[AttackResult]:
    """Resolve one attack action. Returns a list of results (one per shot)."""
    fire_mode = attacker.weapon.fire_modes.get(fire_mode_name)
    if fire_mode is None:
        fire_mode = list(attacker.weapon.fire_modes.values())[0]

    results = []
    for _ in range(fire_mode.shots):
        if attacker.ammo <= 0:
            break
        attacker.ammo -= 1
        result = _resolve_single_shot(attacker, target, fire_mode.spread_mult)
        results.append(result)

    return results


def _resolve_single_shot(
    attacker: Combatant,
    target: Combatant,
    spread_mult: float,
) -> AttackResult:
    dx = target.position[0] - attacker.position[0]
    dy = target.position[1] - attacker.position[1]
    range_m = math.sqrt(dx * dx + dy * dy)
    range_m = max(1.0, range_m)

    accuracy_deg = compute_accuracy_angle(attacker, spread_mult)
    spread_radius = range_m * math.tan(math.radians(accuracy_deg))

    # 2D Gaussian sample centered on aim point (center mass)
    aim_x, aim_y = SILHOUETTE_CENTER_MASS
    sigma = spread_radius / 2.0  # ~95% of shots within the cone radius
    sample_x = random.gauss(aim_x, sigma)
    sample_y = random.gauss(aim_y, sigma)

    result = AttackResult(
        hit=False,
        sample_x=sample_x,
        sample_y=sample_y,
        accuracy_angle_deg=accuracy_deg,
        spread_radius_m=spread_radius,
    )

    # Apply cover clipping to silhouette
    effective_silhouette = HUMANOID_SILHOUETTE
    if target.cover and target.cover.durability > 0:
        effective_silhouette = _apply_cover_clip(
            HUMANOID_SILHOUETTE, target.cover.height_m
        )
        # Check if the shot hits the cover itself
        for region in HUMANOID_SILHOUETTE:
            if region.y_max <= target.cover.height_m:
                if (region.x_min <= sample_x <= region.x_max
                        and region.y_min <= sample_y <= region.y_max):
                    result.cover_hit = True
                    pen = attacker.weapon.penetration
                    if pen < target.cover.protection:
                        target.cover.durability = max(0, target.cover.durability - 1)
                    else:
                        target.cover.durability = max(0, target.cover.durability - 2)
                    break

    # Check which region (if any) the sample lands in
    hit_region: Optional[SilhouetteRegion] = None
    for region in effective_silhouette:
        if (region.x_min <= sample_x <= region.x_max
                and region.y_min <= sample_y <= region.y_max):
            hit_region = region
            break

    if hit_region is None:
        return result

    result.hit = True
    result.region = hit_region.name
    result.lethality = hit_region.lethality

    # Armor check
    pen = attacker.weapon.penetration
    plate = _find_plate(target, hit_region.name)

    if plate is None or plate.durability <= 0:
        result.armor_result = "full_pen"
        result.armor_remaining_pen = pen
    else:
        result.plate_hit = plate.region
        diff = pen - plate.protection
        if diff >= 3:
            result.armor_result = "full_pen"
            result.armor_remaining_pen = pen - plate.protection // 2
            plate.durability = max(0, plate.durability - 3)
        elif diff >= 0:
            result.armor_result = "penetrated"
            result.armor_remaining_pen = max(1, diff + 1)
            plate.durability = max(0, plate.durability - 2)
        elif diff >= -2:
            result.armor_result = "partial"
            result.armor_remaining_pen = 1
            plate.durability = max(0, plate.durability - 1)
        elif diff >= -4:
            result.armor_result = "stopped"
            result.armor_remaining_pen = 0
            plate.durability = max(0, plate.durability - 1)
        else:
            result.armor_result = "deflected"
            result.armor_remaining_pen = 0

        result.plate_durability_after = plate.durability

    return result


def _find_plate(target: Combatant, region_name: str) -> Optional[PlateState]:
    for armor in target.armor_pieces:
        plate = armor.get_plate(region_name)
        if plate is not None:
            return plate
    return None
