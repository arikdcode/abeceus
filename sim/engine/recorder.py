"""
Event recording and statistics aggregation for the combat sim.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ShotEvent:
    round_num: int
    shooter_id: str
    target_id: str
    fire_mode: str
    accuracy_angle_deg: float
    spread_radius_m: float
    sample_x: float
    sample_y: float
    hit: bool
    region: Optional[str]
    armor_result: Optional[str]
    plate_hit: Optional[str]
    plate_durability_after: int
    cover_hit: bool
    wound_severity: Optional[str]
    wound_description: Optional[str]


@dataclass
class RoundSummary:
    round_num: int
    shots: list[ShotEvent] = field(default_factory=list)
    # Pool snapshots at end of round per combatant
    pool_snapshots: dict[str, dict] = field(default_factory=dict)


@dataclass
class IterationResult:
    iteration: int
    winner_id: Optional[str]
    cause: str  # "killed", "incapacitated", "draw_max_rounds"
    rounds_played: int
    total_shots: dict[str, int] = field(default_factory=dict)
    total_hits: dict[str, int] = field(default_factory=dict)
    total_misses: dict[str, int] = field(default_factory=dict)
    wounds_inflicted: dict[str, int] = field(default_factory=dict)
    region_hits: Counter = field(default_factory=Counter)
    round_log: list[RoundSummary] = field(default_factory=list)


class Recorder:
    def __init__(self):
        self.results: list[IterationResult] = []
        self._current: Optional[IterationResult] = None
        self._current_round: Optional[RoundSummary] = None

    def start_iteration(self, iteration: int) -> None:
        self._current = IterationResult(iteration=iteration, winner_id=None, cause="", rounds_played=0)
        self._current_round = None

    def start_round(self, round_num: int) -> None:
        self._current_round = RoundSummary(round_num=round_num)

    def record_shot(self, event: ShotEvent) -> None:
        if self._current_round:
            self._current_round.shots.append(event)

        cur = self._current
        sid = event.shooter_id
        cur.total_shots[sid] = cur.total_shots.get(sid, 0) + 1
        if event.hit:
            cur.total_hits[sid] = cur.total_hits.get(sid, 0) + 1
            if event.region:
                cur.region_hits[event.region] += 1
        else:
            cur.total_misses[sid] = cur.total_misses.get(sid, 0) + 1

        if event.wound_severity:
            cur.wounds_inflicted[sid] = cur.wounds_inflicted.get(sid, 0) + 1

    def record_pool_snapshot(self, combatant_id: str, pools: dict) -> None:
        if self._current_round:
            self._current_round.pool_snapshots[combatant_id] = pools

    def end_round(self) -> None:
        if self._current_round and self._current:
            self._current.round_log.append(self._current_round)
            self._current.rounds_played = self._current_round.round_num

    def end_iteration(self, winner_id: Optional[str], cause: str) -> None:
        if self._current:
            self._current.winner_id = winner_id
            self._current.cause = cause
            self.results.append(self._current)
        self._current = None

    # --- Aggregation ---

    def aggregate(self, combatant_ids: list[str]) -> dict:
        n = len(self.results)
        if n == 0:
            return {}

        wins = Counter(r.winner_id for r in self.results)
        causes = Counter(r.cause for r in self.results)
        total_rounds = [r.rounds_played for r in self.results]
        region_hits_total = Counter()
        shots_per_id = {cid: [] for cid in combatant_ids}
        hits_per_id = {cid: [] for cid in combatant_ids}
        wounds_per_id = {cid: [] for cid in combatant_ids}

        for r in self.results:
            for cid in combatant_ids:
                shots_per_id[cid].append(r.total_shots.get(cid, 0))
                hits_per_id[cid].append(r.total_hits.get(cid, 0))
                wounds_per_id[cid].append(r.wounds_inflicted.get(cid, 0))
            region_hits_total += r.region_hits

        def avg(lst):
            return sum(lst) / len(lst) if lst else 0

        return {
            "iterations": n,
            "wins": dict(wins),
            "win_rates": {k: v / n for k, v in wins.items()},
            "causes": dict(causes),
            "avg_rounds": avg(total_rounds),
            "min_rounds": min(total_rounds) if total_rounds else 0,
            "max_rounds": max(total_rounds) if total_rounds else 0,
            "per_combatant": {
                cid: {
                    "avg_shots": round(avg(shots_per_id[cid]), 1),
                    "avg_hits": round(avg(hits_per_id[cid]), 1),
                    "avg_hit_rate": round(avg(hits_per_id[cid]) / max(1, avg(shots_per_id[cid])) * 100, 1),
                    "avg_wounds_inflicted": round(avg(wounds_per_id[cid]), 1),
                }
                for cid in combatant_ids
            },
            "region_hit_distribution": dict(region_hits_total.most_common()),
        }
