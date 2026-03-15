#!/usr/bin/env python3
"""Collate T102 MIDI Hub field-study participant captures into a summary."""

from __future__ import annotations

import argparse
import json
import re
import statistics
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

SEVERITY_ORDER = {
    "critical": 0,
    "major": 1,
    "moderate": 2,
    "medium": 2,
    "minor": 3,
    "low": 4,
    "note": 5,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Summarize T102 MIDI Hub field-study participant JSON files.")
    parser.add_argument("--input-dir", type=Path, required=True, help="Directory containing participant-*.json files.")
    parser.add_argument(
        "--participant-glob",
        type=str,
        default="participant-*.json",
        help="Glob pattern for participant files inside --input-dir.",
    )
    parser.add_argument("--output-json", type=Path, required=True, help="Path for machine-readable summary JSON.")
    parser.add_argument("--output-markdown", type=Path, help="Optional path for a markdown summary.")
    return parser.parse_args()


def load_participants(input_dir: Path, participant_glob: str) -> list[dict[str, Any]]:
    if not input_dir.exists():
        raise FileNotFoundError(f"Input directory does not exist: {input_dir}")

    paths = sorted(path for path in input_dir.glob(participant_glob) if path.is_file())
    if not paths:
        raise FileNotFoundError(f"No participant files matched '{participant_glob}' in {input_dir}")

    participants: list[dict[str, Any]] = []
    for path in paths:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ValueError(f"Participant file is not a JSON object: {path}")
        payload["_source_path"] = str(path)
        participants.append(payload)
    return participants


def normalize_issue_key(issue: dict[str, Any]) -> str:
    explicit = str(issue.get("issue_key", "")).strip().lower()
    if explicit:
        return explicit
    summary = str(issue.get("summary", "")).strip().lower()
    slug = re.sub(r"[^a-z0-9]+", "-", summary).strip("-")
    return slug or "unspecified-issue"


def best_severity(values: list[str]) -> str:
    if not values:
        return "note"
    return sorted(values, key=lambda value: SEVERITY_ORDER.get(value.lower(), 99))[0]


def summarize_tasks(participants: list[dict[str, Any]]) -> list[dict[str, Any]]:
    task_buckets: dict[str, dict[str, Any]] = {}

    for participant in participants:
        for task in participant.get("tasks", []):
            if not isinstance(task, dict):
                continue
            task_id = str(task.get("task_id", "")).strip()
            if not task_id:
                continue
            bucket = task_buckets.setdefault(
                task_id,
                {
                    "task_id": task_id,
                    "title": str(task.get("title", task_id)),
                    "participant_count": 0,
                    "success_count": 0,
                    "coaching_free_count": 0,
                    "times": [],
                    "assist_count": 0,
                    "confusion_point_count": 0,
                },
            )
            bucket["participant_count"] += 1
            if bool(task.get("success")):
                bucket["success_count"] += 1
            if bool(task.get("completed_without_coaching")):
                bucket["coaching_free_count"] += 1

            time_seconds = task.get("time_to_complete_seconds", 0)
            if isinstance(time_seconds, (int, float)) and time_seconds > 0:
                bucket["times"].append(float(time_seconds))

            assists = task.get("assists", [])
            if isinstance(assists, list):
                bucket["assist_count"] += len(assists)

            confusion_points = task.get("confusion_points", [])
            if isinstance(confusion_points, list):
                bucket["confusion_point_count"] += len(confusion_points)

    summary: list[dict[str, Any]] = []
    for bucket in task_buckets.values():
        times = bucket.pop("times")
        participant_count = max(bucket["participant_count"], 1)
        bucket["success_rate"] = round(bucket["success_count"] / participant_count, 4)
        bucket["coaching_free_rate"] = round(bucket["coaching_free_count"] / participant_count, 4)
        bucket["mean_time_seconds"] = round(statistics.fmean(times), 2) if times else 0.0
        bucket["median_time_seconds"] = round(statistics.median(times), 2) if times else 0.0
        summary.append(bucket)

    return sorted(summary, key=lambda row: row["task_id"])


def summarize_issues(participants: list[dict[str, Any]]) -> list[dict[str, Any]]:
    buckets: dict[str, dict[str, Any]] = {}

    for participant in participants:
        participant_id = str(participant.get("participant_id", "")).strip() or "UNKNOWN"
        source_path = str(participant.get("_source_path", ""))
        for issue in participant.get("issues", []):
            if not isinstance(issue, dict):
                continue
            key = normalize_issue_key(issue)
            bucket = buckets.setdefault(
                key,
                {
                    "issue_key": key,
                    "summary": str(issue.get("summary", "")).strip(),
                    "severities": [],
                    "participants": set(),
                    "affected_tasks": set(),
                    "recommendations": set(),
                    "evidence_files": set(),
                    "occurrence_count": 0,
                },
            )
            severity = str(issue.get("severity", "note")).strip().lower() or "note"
            bucket["severities"].append(severity)
            bucket["participants"].add(participant_id)

            task_id = str(issue.get("task_id", "")).strip()
            if task_id:
                bucket["affected_tasks"].add(task_id)

            recommendation = str(issue.get("recommendation", "")).strip()
            if recommendation:
                bucket["recommendations"].add(recommendation)

            if source_path:
                bucket["evidence_files"].add(source_path)

            bucket["occurrence_count"] += 1

    summary: list[dict[str, Any]] = []
    for bucket in buckets.values():
        summary.append(
            {
                "issue_key": bucket["issue_key"],
                "summary": bucket["summary"],
                "severity": best_severity(bucket["severities"]),
                "occurrence_count": bucket["occurrence_count"],
                "participant_count": len(bucket["participants"]),
                "participants": sorted(bucket["participants"]),
                "affected_tasks": sorted(bucket["affected_tasks"]),
                "recommendations": sorted(bucket["recommendations"]),
                "evidence_files": sorted(bucket["evidence_files"]),
            }
        )

    return sorted(
        summary,
        key=lambda row: (
            SEVERITY_ORDER.get(str(row["severity"]).lower(), 99),
            -int(row["occurrence_count"]),
            str(row["issue_key"]),
        ),
    )


def build_summary(participants: list[dict[str, Any]]) -> dict[str, Any]:
    role_counter: Counter[str] = Counter()
    developer_counter: Counter[str] = Counter()
    familiarity_counter: Counter[str] = Counter()

    for participant in participants:
        profile = participant.get("participant_profile", {})
        if not isinstance(profile, dict):
            continue
        role = str(profile.get("role", "unknown")).strip() or "unknown"
        role_counter[role] += 1
        developer_counter["developer" if bool(profile.get("developer")) else "non_developer"] += 1
        familiarity = "familiar" if bool(profile.get("familiar_with_map2")) else "unfamiliar"
        familiarity_counter[familiarity] += 1

    tasks = summarize_tasks(participants)
    issues = summarize_issues(participants)
    follow_up_candidates = [
        {
            "issue_key": row["issue_key"],
            "severity": row["severity"],
            "reason": "high-severity" if row["severity"] in {"critical", "major"} else "multi-participant",
        }
        for row in issues
        if row["severity"] in {"critical", "major"} or row["participant_count"] >= 2
    ]

    return {
        "study_id": "t102",
        "participant_count": len(participants),
        "roles": dict(sorted(role_counter.items())),
        "developer_mix": dict(sorted(developer_counter.items())),
        "map2_familiarity": dict(sorted(familiarity_counter.items())),
        "tasks": tasks,
        "issues": issues,
        "follow_up_candidates": follow_up_candidates,
    }


def render_markdown(summary: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append("# T102 Field Study Summary")
    lines.append("")
    lines.append("## Participants")
    lines.append("")
    lines.append(f"- Participant count: `{summary['participant_count']}`")

    roles = summary.get("roles", {})
    if roles:
        role_text = ", ".join(f"`{role}`={count}" for role, count in roles.items())
        lines.append(f"- Roles: {role_text}")

    developer_mix = summary.get("developer_mix", {})
    if developer_mix:
        mix_text = ", ".join(f"`{label}`={count}" for label, count in developer_mix.items())
        lines.append(f"- Developer mix: {mix_text}")

    familiarity = summary.get("map2_familiarity", {})
    if familiarity:
        familiarity_text = ", ".join(f"`{label}`={count}" for label, count in familiarity.items())
        lines.append(f"- MAP2 familiarity: {familiarity_text}")

    lines.append("")
    lines.append("## Task Outcomes")
    lines.append("")
    lines.append("| Task | Success | Coaching-free | Mean time (s) | Median time (s) | Assists | Confusion points |")
    lines.append("|---|---:|---:|---:|---:|---:|---:|")
    for row in summary.get("tasks", []):
        lines.append(
            "| {title} | {success_count}/{participant_count} | {coaching_free_count}/{participant_count} | "
            "{mean_time_seconds} | {median_time_seconds} | {assist_count} | {confusion_point_count} |".format(**row)
        )

    lines.append("")
    lines.append("## Friction Points")
    lines.append("")
    if summary.get("issues"):
        lines.append("| Severity | Issue | Participants | Tasks | Recommendations |")
        lines.append("|---|---|---:|---|---|")
        for row in summary["issues"]:
            tasks = ", ".join(row["affected_tasks"]) or "-"
            recommendations = "; ".join(row["recommendations"]) or "-"
            lines.append(
                f"| {row['severity']} | {row['summary'] or row['issue_key']} | "
                f"{row['participant_count']} | {tasks} | {recommendations} |"
            )
    else:
        lines.append("No issues were recorded.")

    lines.append("")
    lines.append("## Follow-up Candidates")
    lines.append("")
    if summary.get("follow_up_candidates"):
        for row in summary["follow_up_candidates"]:
            lines.append(f"- `{row['issue_key']}` ({row['severity']}, {row['reason']})")
    else:
        lines.append("- No follow-up candidates identified from the current captures.")

    lines.append("")
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    participants = load_participants(args.input_dir, args.participant_glob)
    summary = build_summary(participants)

    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")

    if args.output_markdown:
        args.output_markdown.parent.mkdir(parents=True, exist_ok=True)
        args.output_markdown.write_text(render_markdown(summary), encoding="utf-8")

    print(
        f"Summarized {summary['participant_count']} participant(s) "
        f"into {args.output_json}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
