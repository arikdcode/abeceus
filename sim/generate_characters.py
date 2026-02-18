#!/usr/bin/env python3
"""
Reads character JSON bundles, computes derived combat stats, and generates
a markdown summary file.
"""

import json
import math
from pathlib import Path

CHARACTERS_DIR = Path(__file__).parent / "characters"
OUTPUT_FILE = Path(__file__).parent / "character_sheets.md"
WIKI_OUTPUT = Path(__file__).parent.parent / "wiki" / "game" / "character-sheets.md"

# --- Derivation formulas ---
# All of these are rough first-pass. Tweak and re-run.

ROUND_SECONDS = 6  # one combat round = 6 seconds

# Attribute scale: 1-5
# Skill scale: 0-5


def compute_derived(char: dict) -> dict:
    a = char["attributes"]
    s = char["skills"]

    agi = a["agility"]
    end = a["endurance"]
    per = a["perception"]
    wil = a["willpower"]
    str_ = a["strength"]

    tactics = s.get("tactics", 0)
    firearms = s.get("firearms", 0)

    initiative = agi  # gear modifier applied later

    reaction_budget = agi + tactics // 2  # seconds
    contact_phase_budget = per + tactics // 2  # seconds

    pain_tolerance = (end + wil) * 10
    stress_threshold = (wil * 2) + tactics
    carry_capacity_kg = str_ * 15

    # Movement: walk = agility * 1.5 m/s, sprint = agility * 3 m/s
    # Per round (6s): walk distance and sprint distance
    walk_speed = round(agi * 1.5, 1)  # m/s
    sprint_speed = round(agi * 3.0, 1)  # m/s
    walk_per_round = round(walk_speed * ROUND_SECONDS, 1)
    sprint_per_round = round(sprint_speed * ROUND_SECONDS, 1)

    # Accuracy modifier: skill is primary, agility gives a small bonus at 4+
    accuracy_skill_mod = firearms
    accuracy_agility_bonus = 0.5 if agi >= 4 else 0.0

    # Blood loss tolerance: maps endurance to threshold shifts
    # Higher endurance = you stay functional longer at higher blood loss %
    blood_loss_shift = (end - 2) * 5  # shifts all thresholds by this %

    return {
        "initiative": initiative,
        "reaction_budget_s": reaction_budget,
        "contact_phase_budget_s": contact_phase_budget,
        "pain_tolerance": pain_tolerance,
        "stress_threshold": stress_threshold,
        "carry_capacity_kg": carry_capacity_kg,
        "walk_speed_ms": walk_speed,
        "sprint_speed_ms": sprint_speed,
        "walk_per_round_m": walk_per_round,
        "sprint_per_round_m": sprint_per_round,
        "accuracy_skill_mod": accuracy_skill_mod,
        "accuracy_agility_bonus": accuracy_agility_bonus,
        "blood_loss_threshold_shift_pct": blood_loss_shift,
        "round_seconds": ROUND_SECONDS,
    }


def format_character_md(char: dict, derived: dict) -> str:
    lines = []
    lines.append(f"## {char['name']}")
    lines.append(f"*{char['description']}*")
    lines.append("")

    lines.append("### Base Attributes")
    lines.append("")
    lines.append("| Attribute | Score |")
    lines.append("|-----------|-------|")
    for attr, val in char["attributes"].items():
        lines.append(f"| {attr.capitalize()} | {val} |")
    lines.append("")

    lines.append("### Skills")
    lines.append("")
    lines.append("| Skill | Level | Label |")
    lines.append("|-------|-------|-------|")
    labels = {0: "Untrained", 1: "Novice", 2: "Competent", 3: "Proficient", 4: "Expert", 5: "Master"}
    for skill, val in char["skills"].items():
        label = labels.get(val, "???")
        lines.append(f"| {skill.replace('_', ' ').title()} | {val} | {label} |")
    lines.append("")

    lines.append("### Derived Combat Stats")
    lines.append("")
    lines.append(f"*Round length: {derived['round_seconds']}s*")
    lines.append("")
    lines.append("| Stat | Value | Notes |")
    lines.append("|------|-------|-------|")
    lines.append(f"| Initiative | {derived['initiative']} | Before gear modifier |")
    lines.append(f"| Reaction Budget | {derived['reaction_budget_s']}s | Defensive actions on others' turns |")
    lines.append(f"| Contact Phase Budget | {derived['contact_phase_budget_s']}s | Positioning when combat starts |")
    lines.append(f"| Pain Tolerance | {derived['pain_tolerance']} | Threshold before impairment |")
    lines.append(f"| Stress Threshold | {derived['stress_threshold']} | Threshold before breaking |")
    lines.append(f"| Carry Capacity | {derived['carry_capacity_kg']} kg | Before encumbrance penalties |")
    lines.append(f"| Walk Speed | {derived['walk_speed_ms']} m/s ({derived['walk_per_round_m']} m/round) | Tactical movement |")
    lines.append(f"| Sprint Speed | {derived['sprint_speed_ms']} m/s ({derived['sprint_per_round_m']} m/round) | Full sprint, accuracy penalty |")
    lines.append(f"| Accuracy (Skill Mod) | {derived['accuracy_skill_mod']} | Firearms skill → cone tightening |")
    if derived["accuracy_agility_bonus"] > 0:
        lines.append(f"| Accuracy (Agility Bonus) | +{derived['accuracy_agility_bonus']} | Agility 4+ steadiness bonus |")
    lines.append(f"| Blood Loss Shift | {derived['blood_loss_threshold_shift_pct']:+d}% | Threshold shift from Endurance |")
    lines.append("")

    return "\n".join(lines)


def main():
    json_files = sorted(CHARACTERS_DIR.glob("*.json"))
    if not json_files:
        print("No character JSON files found in", CHARACTERS_DIR)
        return

    all_md = ["# Character Sheets", ""]
    all_md.append("Auto-generated from JSON bundles. Edit the JSON, re-run the script.")
    all_md.append("")
    all_md.append("---")
    all_md.append("")

    for f in json_files:
        char = json.loads(f.read_text())
        derived = compute_derived(char)
        all_md.append(format_character_md(char, derived))
        all_md.append("---")
        all_md.append("")
        print(f"  {char['name']:20s}  init={derived['initiative']}  react={derived['reaction_budget_s']}s  pain={derived['pain_tolerance']}  stress={derived['stress_threshold']}")

    content = "\n".join(all_md)
    OUTPUT_FILE.write_text(content)
    print(f"Wrote {OUTPUT_FILE}")

    WIKI_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    WIKI_OUTPUT.write_text(content)
    print(f"Wrote {WIKI_OUTPUT}")


if __name__ == "__main__":
    main()
