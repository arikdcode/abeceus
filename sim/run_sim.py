#!/usr/bin/env python3
"""
Monte Carlo combat simulator — CLI entry point.

Usage:
    python run_sim.py scenarios/soldier_1v1.json -n 1000
    python run_sim.py scenarios/soldier_1v1.json -n 1 --verbose
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from engine.combat import load_scenario, run_combat
from engine.recorder import Recorder


def format_report_md(scenario_name: str, stats: dict, n: int) -> str:
    lines = [
        f"# Sim Report: {scenario_name}",
        "",
        f"**Iterations:** {n}",
        "",
        "---",
        "",
        "## Outcomes",
        "",
        "| Combatant | Wins | Win Rate |",
        "|-----------|------|----------|",
    ]
    for cid, rate in sorted(stats["win_rates"].items(), key=lambda x: -(x[1] or 0)):
        wins = stats["wins"].get(cid, 0)
        pct = f"{rate * 100:.1f}%"
        label = cid if cid else "Draw"
        lines.append(f"| {label} | {wins} | {pct} |")
    lines.append("")

    lines.append("### Resolution Causes")
    lines.append("")
    lines.append("| Cause | Count | Rate |")
    lines.append("|-------|-------|------|")
    for cause, count in sorted(stats["causes"].items(), key=lambda x: -x[1]):
        lines.append(f"| {cause} | {count} | {count / n * 100:.1f}% |")
    lines.append("")

    lines.append("---")
    lines.append("")
    lines.append("## Combat Duration")
    lines.append("")
    lines.append(f"- **Average rounds:** {stats['avg_rounds']:.1f}")
    lines.append(f"- **Min rounds:** {stats['min_rounds']}")
    lines.append(f"- **Max rounds:** {stats['max_rounds']}")
    lines.append("")

    lines.append("---")
    lines.append("")
    lines.append("## Per-Combatant Stats")
    lines.append("")
    lines.append("| Combatant | Avg Shots | Avg Hits | Hit Rate | Avg Wounds Inflicted |")
    lines.append("|-----------|-----------|----------|----------|---------------------|")
    for cid, cstats in stats["per_combatant"].items():
        lines.append(
            f"| {cid} "
            f"| {cstats['avg_shots']} "
            f"| {cstats['avg_hits']} "
            f"| {cstats['avg_hit_rate']}% "
            f"| {cstats['avg_wounds_inflicted']} |"
        )
    lines.append("")

    lines.append("---")
    lines.append("")
    lines.append("## Hit Region Distribution (All Iterations)")
    lines.append("")
    lines.append("| Region | Hits | % of All Hits |")
    lines.append("|--------|------|--------------|")
    total_region_hits = sum(stats["region_hit_distribution"].values())
    for region, count in sorted(stats["region_hit_distribution"].items(), key=lambda x: -x[1]):
        pct = count / max(1, total_region_hits) * 100
        lines.append(f"| {region} | {count} | {pct:.1f}% |")
    lines.append("")

    return "\n".join(lines)


def format_verbose_log(recorder: Recorder) -> str:
    """Format a detailed transcript of the first (and only) iteration."""
    if not recorder.results:
        return "No results."

    r = recorder.results[0]
    lines = ["## Detailed Combat Log", ""]

    for rnd in r.round_log:
        lines.append(f"### Round {rnd.round_num}")
        lines.append("")
        for shot in rnd.shots:
            hit_str = f"**HIT {shot.region}**" if shot.hit else "MISS"
            if shot.cover_hit:
                hit_str += " (hit cover)"
            armor_str = f" | armor: {shot.armor_result}" if shot.armor_result else ""
            wound_str = f" | wound: {shot.wound_severity} — {shot.wound_description}" if shot.wound_severity else ""
            lines.append(
                f"- `{shot.shooter_id}` → `{shot.target_id}`: "
                f"{hit_str}{armor_str}{wound_str} "
                f"(angle={shot.accuracy_angle_deg:.2f}° spread={shot.spread_radius_m:.3f}m "
                f"sample=({shot.sample_x:.3f}, {shot.sample_y:.3f}))"
            )
        lines.append("")

        if rnd.pool_snapshots:
            lines.append("**Pool states:**")
            lines.append("")
            for cid, pools in rnd.pool_snapshots.items():
                status = "ALIVE" if pools["alive"] else "DEAD"
                if pools["alive"] and not pools["conscious"]:
                    status = "UNCONSCIOUS"
                lines.append(
                    f"- `{cid}`: blood={pools['blood_loss_pct']:.1f}% "
                    f"(+{pools['bleed_rate']:.1f}/rnd) "
                    f"pain={pools['pain']:.1f} stress={pools['stress']:.1f} "
                    f"ammo={pools['ammo']} [{status}]"
                )
            lines.append("")

    lines.append(f"**Result:** Winner = `{r.winner_id}` ({r.cause}) after {r.rounds_played} rounds")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Monte Carlo Combat Simulator")
    parser.add_argument("scenario", type=str, help="Path to scenario JSON file")
    parser.add_argument("-n", type=int, default=1000, help="Number of iterations (default: 1000)")
    parser.add_argument("--verbose", action="store_true", help="Print detailed log (use with -n 1)")
    parser.add_argument("-o", type=str, default=None, help="Output markdown file path")
    parser.add_argument("--seed", type=int, default=None, help="Random seed for reproducibility")
    args = parser.parse_args()

    scenario_path = Path(args.scenario)
    if not scenario_path.is_absolute():
        scenario_path = Path(__file__).parent / scenario_path

    if args.seed is not None:
        import random
        random.seed(args.seed)

    scenario = load_scenario(scenario_path)
    combatant_ids = [s["id"] for s in scenario["specs"]]

    print(f"Scenario: {scenario['name']}")
    print(f"Running {args.n} iterations...")
    print()

    recorder = Recorder()
    for i in range(args.n):
        run_combat(scenario["specs"], recorder, iteration=i + 1)
        if (i + 1) % 500 == 0:
            print(f"  ...{i + 1}/{args.n}")

    stats = recorder.aggregate(combatant_ids)

    # Console summary
    print(f"\n{'=' * 50}")
    print(f"Results ({args.n} iterations)")
    print(f"{'=' * 50}")
    for cid in combatant_ids:
        wins = stats["wins"].get(cid, 0)
        rate = stats["win_rates"].get(cid, 0)
        print(f"  {cid}: {wins} wins ({rate * 100:.1f}%)")
    draws = stats["wins"].get(None, 0)
    if draws:
        print(f"  draws: {draws}")
    print(f"  avg rounds: {stats['avg_rounds']:.1f} (min={stats['min_rounds']}, max={stats['max_rounds']})")
    print()

    # Markdown report
    report = format_report_md(scenario["name"], stats, args.n)
    if args.verbose and args.n == 1:
        report += "\n\n" + format_verbose_log(recorder)

    out_path = Path(args.o) if args.o else Path(__file__).parent / "sim_report.md"
    out_path.write_text(report)
    print(f"Report written to {out_path}")

    wiki_out = Path(__file__).parent.parent / "wiki" / "game" / "sim-report.md"
    wiki_out.parent.mkdir(parents=True, exist_ok=True)
    wiki_out.write_text(report)
    print(f"Wiki copy written to {wiki_out}")


if __name__ == "__main__":
    main()
