"""
Core data models for the combat simulation.
All numbers are rough first-pass — tweak freely.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


# ---------------------------------------------------------------------------
# Raw JSON-backed definitions
# ---------------------------------------------------------------------------

@dataclass
class FireMode:
    name: str
    shots: int
    spread_mult: float
    time_s: float


@dataclass
class WeaponDef:
    name: str
    type: str
    base_spread_deg: float
    penetration: int
    damage_type: str
    fire_modes: dict[str, FireMode]
    magazine_size: int
    reload_time_s: float
    weight_kg: float

    @classmethod
    def from_json(cls, path: Path) -> WeaponDef:
        raw = json.loads(path.read_text())
        modes = {
            k: FireMode(name=k, **v) for k, v in raw["fire_modes"].items()
        }
        return cls(
            name=raw["name"],
            type=raw["type"],
            base_spread_deg=raw["base_spread_deg"],
            penetration=raw["penetration"],
            damage_type=raw["damage_type"],
            fire_modes=modes,
            magazine_size=raw["magazine_size"],
            reload_time_s=raw["reload_time_s"],
            weight_kg=raw["weight_kg"],
        )


@dataclass
class PlateDef:
    region: str
    protection: int
    durability: int


@dataclass
class ArmorDef:
    name: str
    plates: list[PlateDef]
    weight_kg: float

    @classmethod
    def from_json(cls, path: Path) -> ArmorDef:
        raw = json.loads(path.read_text())
        plates = [PlateDef(**p) for p in raw["plates"]]
        return cls(name=raw["name"], plates=plates, weight_kg=raw["weight_kg"])


@dataclass
class CharacterDef:
    name: str
    description: str
    attributes: dict[str, int]
    skills: dict[str, int]

    @classmethod
    def from_json(cls, path: Path) -> CharacterDef:
        raw = json.loads(path.read_text())
        return cls(
            name=raw["name"],
            description=raw["description"],
            attributes=raw["attributes"],
            skills=raw["skills"],
        )


@dataclass
class CoverDef:
    height_m: float
    protection: int
    durability: int


# ---------------------------------------------------------------------------
# Runtime state (mutable during combat)
# ---------------------------------------------------------------------------

@dataclass
class PlateState:
    region: str
    protection: int
    max_durability: int
    durability: int


@dataclass
class ArmorState:
    name: str
    plates: list[PlateState]

    @classmethod
    def from_def(cls, adef: ArmorDef) -> ArmorState:
        plates = [
            PlateState(
                region=p.region,
                protection=p.protection,
                max_durability=p.durability,
                durability=p.durability,
            )
            for p in adef.plates
        ]
        return cls(name=adef.name, plates=plates)

    def get_plate(self, region: str) -> Optional[PlateState]:
        for p in self.plates:
            if p.region == region:
                return p
        return None


@dataclass
class CoverState:
    height_m: float
    protection: int
    max_durability: int
    durability: int

    @classmethod
    def from_def(cls, cdef: CoverDef) -> CoverState:
        return cls(
            height_m=cdef.height_m,
            protection=cdef.protection,
            max_durability=cdef.durability,
            durability=cdef.durability,
        )


@dataclass
class Combatant:
    """Full runtime state for one fighter."""
    id: str
    name: str
    # Base
    attributes: dict[str, int]
    skills: dict[str, int]
    # Derived
    initiative: int
    reaction_budget_s: float
    contact_phase_budget_s: float
    pain_tolerance: int
    stress_threshold: int
    carry_capacity_kg: float
    walk_speed_ms: float
    sprint_speed_ms: float
    accuracy_skill_mod: int
    accuracy_agility_bonus: float
    blood_loss_threshold_shift_pct: int
    # Gear
    weapon: WeaponDef
    armor_pieces: list[ArmorState]
    cover: Optional[CoverState]
    # Position
    position: tuple[float, float]
    # Combat pools (mutable)
    ammo: int = 0
    blood_loss_pct: float = 0.0
    bleed_rate: float = 0.0  # % per round
    pain: float = 0.0
    stress: float = 0.0
    alive: bool = True
    conscious: bool = True

    @property
    def can_act(self) -> bool:
        return self.alive and self.conscious
