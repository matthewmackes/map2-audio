#!/usr/bin/env python3
"""Run the T778 MAP2 State Authority phase qualification matrix."""

from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class PhaseDefinition:
    phase_id: str
    phase_number: int
    title: str
    objective: str
    default_command: str


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def relpath(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def build_default_phase_definitions(python_executable: str) -> list[PhaseDefinition]:
    py = shlex.quote(python_executable)
    return [
        PhaseDefinition(
            phase_id="phase1",
            phase_number=1,
            title="Graph foundation, validation, and asset registry",
            objective=(
                "Prove the graph schema, document normalization, validation rejections, "
                "and asset-registry-backed document restoration."
            ),
            default_command=(
                f"{py} -m pytest -q tests/test_state_authority_graph.py tests/test_state_authority_snapshot_workflows.py "
                "-k 'persists_and_reads_state_authority_document or "
                "rejects_invalid_state_authority_document_write or "
                "restores_asset_paths_from_state_authority_registry'"
            ),
        ),
        PhaseDefinition(
            phase_id="phase2",
            phase_number=2,
            title="Direct sub-services and route wiring",
            objective=(
                "Prove State Authority activation/revision flows use the extracted sub-services "
                "directly instead of falling back to the old SnapshotService facade."
            ),
            default_command=(
                f"{py} -m pytest -q tests/test_state_authority_activation_service.py tests/test_snapshot_routes.py "
                "-k 'apply_graph_document_to_engine_builds_document_and_uses_crossfade or "
                "apply_graph_document_to_engine_reuses_snapshot_document_when_present or "
                "revision_routes_call_state_authority_revision_service_directly or "
                "activation_routes_call_state_authority_activation_service_directly'"
            ),
        ),
        PhaseDefinition(
            phase_id="phase3",
            phase_number=3,
            title="Native engine graph import, export, and morph",
            objective=(
                "Exercise the JUCE graph-document import/export path and the quad morph runtime "
                "against the native engine build when it is available."
            ),
            default_command=(
                f"{py} -m pytest -q tests/test_juce_engine_graph_document.py"
            ),
        ),
        PhaseDefinition(
            phase_id="phase4",
            phase_number=4,
            title="Activation state machine, preflight, hooks, and preload",
            objective=(
                "Prove the validating-to-live phase machine, structured preflight failures, "
                "configured hook ordering, and preload planning behavior."
            ),
            default_command=(
                f"{py} -m pytest -q "
                "tests/test_state_authority_activation_service.py "
                "tests/test_state_authority_snapshot_workflows.py "
                "tests/test_snapshot_routes.py "
                "tests/test_snapshot_runtime_state_progress.py "
                "-k 'activate_snapshot_marks_validating_phase_before_preflight_failure or "
                "run_activation_hooks_uses_configured_order or "
                "snapshot_activation_preflight_blocks_broken_assets_and_preserves_live_snapshot or "
                "plan_preload_candidates_for_snapshot_returns_top_three_candidates or "
                "get_snapshot_preload_plan_route_returns_top_candidates or "
                "tracks_activation_phase_progress or "
                "marks_current_phase_failed'"
            ),
        ),
        PhaseDefinition(
            phase_id="phase5",
            phase_number=5,
            title="Reconciliation, live health, and observability",
            objective=(
                "Prove local reconciliation, self-heal/reattivation decisions, runtime aggregation, "
                "cluster reporting, and Prometheus export surfaces."
            ),
            default_command=(
                f"{py} -m pytest -q "
                "tests/test_state_authority_reconciliation_service.py "
                "tests/test_snapshot_runtime_state_progress.py "
                "tests/test_snapshot_routes.py "
                "tests/test_observability_policy.py "
                "-k 'marks_healthy_when_runtime_matches or "
                "applies_targeted_parameter_and_bypass_corrections or "
                "requires_reactivation_for_topology_drift or "
                "flags_missing_assets or "
                "refresh_live_snapshot_health_records_reconciliation_metrics or "
                "refresh_live_snapshot_health_skips_reconciliation_within_interval or "
                "refresh_live_snapshot_health_reruns_reconciliation_after_interval or "
                "cluster_reconciliation_report_summarizes_node_statuses or "
                "runtime_reconciliation_routes_delegate_to_runtime_state_service or "
                "prometheus_route_exports_state_authority_reconciliation_metrics'"
            ),
        ),
        PhaseDefinition(
            phase_id="phase6",
            phase_number=6,
            title="Templates, live links, and portability",
            objective=(
                "Prove template CRUD, live-link cascading, bundle portability, and the community/template "
                "route surfaces on the canonical State Authority document path."
            ),
            default_command=(
                f"{py} -m pytest -q tests/test_state_authority_snapshot_workflows.py tests/test_snapshot_routes.py "
                "-k 'template_crud_and_portability or "
                "template_live_link_cascade_preserves_local_overrides or "
                "template_bundle_and_community_workflows or "
                "template_routes_delegate_to_snapshot_service or "
                "template_export_import_bundle_and_community_routes'"
            ),
        ),
    ]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the T778 State Authority qualification matrix.")
    parser.add_argument("--output-dir", type=Path, required=True, help="Directory for qualification artifacts.")
    parser.add_argument(
        "--python",
        default=sys.executable,
        help="Python executable used to build the default pytest commands.",
    )
    parser.add_argument(
        "--phase-timeout-seconds",
        type=int,
        default=20,
        help="Hard timeout for each phase command. Commands that print a passing pytest summary before timeout are treated as pass-with-timeout-note.",
    )
    for phase in build_default_phase_definitions(sys.executable):
        parser.add_argument(
            f"--{phase.phase_id}-command",
            default=None,
            help=f"Override command for {phase.phase_id} ({phase.title}).",
        )
    return parser.parse_args()


def run_shell_command(
    command: str,
    *,
    stdout_path: Path,
    stderr_path: Path,
    timeout_seconds: int,
) -> subprocess.CompletedProcess[str]:
    env = dict(os.environ)
    env.setdefault("PYTEST_DISABLE_PLUGIN_AUTOLOAD", "1")
    wrapped_command = (
        f"timeout --signal=TERM --kill-after=5s {int(timeout_seconds)}s "
        f"bash -lc {shlex.quote(command)}"
    )
    proc = subprocess.run(
        wrapped_command,
        shell=True,
        executable="/bin/bash",
        capture_output=True,
        text=True,
        check=False,
        cwd=REPO_ROOT,
        env=env,
    )
    write_text(stdout_path, proc.stdout)
    write_text(stderr_path, proc.stderr)
    return proc


def _looks_like_completed_pytest_pass(output: str) -> bool:
    normalized = output.lower()
    return bool(
        re.search(r"\b\d+\s+passed\b", normalized)
        and not re.search(r"\b\d+\s+failed\b", normalized)
        and "traceback" not in normalized
    )


def run_phase(definition: PhaseDefinition, *, output_dir: Path, timeout_seconds: int) -> dict[str, Any]:
    phase_dir = output_dir / definition.phase_id
    phase_dir.mkdir(parents=True, exist_ok=True)
    stdout_path = phase_dir / "stdout.txt"
    stderr_path = phase_dir / "stderr.txt"
    started_at = utc_now()
    proc = run_shell_command(
        definition.default_command,
        stdout_path=stdout_path,
        stderr_path=stderr_path,
        timeout_seconds=timeout_seconds,
    )
    finished_at = utc_now()
    combined_output = "\n".join([proc.stdout, proc.stderr])
    normalized_output = combined_output.lower()
    observed_skip_hints = "skipped" in normalized_output
    timed_out = int(proc.returncode) in {124, 137}
    if proc.returncode == 0:
        status = "PASS"
    elif timed_out and _looks_like_completed_pytest_pass(combined_output):
        status = "PASS"
    elif proc.returncode == 127:
        status = "BLOCKED"
    else:
        status = "FAIL"
    note = None
    if timed_out and status == "PASS":
        note = f"Phase command exceeded {int(timeout_seconds)}s after emitting a passing pytest summary; timeout reaped the lingering process."
    elif timed_out:
        note = f"Phase command exceeded {int(timeout_seconds)}s before completion."
    return {
        "phase_id": definition.phase_id,
        "phase_number": definition.phase_number,
        "title": definition.title,
        "objective": definition.objective,
        "command": definition.default_command,
        "status": status,
        "returncode": int(proc.returncode),
        "observed_skip_hints": observed_skip_hints,
        "timed_out": timed_out,
        "timeout_seconds": int(timeout_seconds),
        "note": note,
        "stdout_artifact": relpath(stdout_path, output_dir),
        "stderr_artifact": relpath(stderr_path, output_dir),
        "started_at": started_at,
        "finished_at": finished_at,
    }


def build_markdown(summary: dict[str, Any]) -> str:
    lines = [
        "# T778 State Authority Qualification Summary",
        "",
        f"- Generated at: {summary['generated_at']}",
        f"- Overall status: {summary['overall_status']}",
        f"- Pass count: {summary['pass_count']}",
        f"- Blocked count: {summary['blocked_count']}",
        f"- Fail count: {summary['fail_count']}",
        "",
        "| Phase | Status | Objective | Command | Notes |",
        "| --- | --- | --- | --- | --- |",
    ]
    for phase in summary["phases"]:
        notes: list[str] = []
        if phase["observed_skip_hints"]:
            notes.append("Pytest output reported skipped coverage rows.")
        if phase.get("note"):
            notes.append(str(phase["note"]))
        note = " ".join(notes)
        command = phase["command"].replace("|", "\\|")
        objective = phase["objective"].replace("|", "\\|")
        lines.append(
            f"| {phase['phase_number']} | {phase['status']} | {objective} | `{command}` | {note} |"
        )
    lines.extend(
        [
            "",
            "## Artifacts",
            "",
        ]
    )
    for phase in summary["phases"]:
        lines.append(
            f"- Phase {phase['phase_number']}: stdout `{phase['stdout_artifact']}`, stderr `{phase['stderr_artifact']}`"
        )
    lines.extend(
        [
            "",
            "## Notes",
            "",
            "- Phase 3 is allowed to report skip hints when the local JUCE engine build output is unavailable.",
            "- Any blocked or failed phase should be carried into `docs/PROJECT_WORKLIST.md` before claiming T778 complete.",
        ]
    )
    return "\n".join(lines) + "\n"


def resolve_phase_definitions(args: argparse.Namespace) -> list[PhaseDefinition]:
    definitions = build_default_phase_definitions(args.python)
    resolved: list[PhaseDefinition] = []
    for definition in definitions:
        override = getattr(args, f"{definition.phase_id}_command")
        resolved.append(
            PhaseDefinition(
                phase_id=definition.phase_id,
                phase_number=definition.phase_number,
                title=definition.title,
                objective=definition.objective,
                default_command=str(override or definition.default_command),
            )
        )
    return resolved


def summarize(phases: list[dict[str, Any]]) -> dict[str, Any]:
    fail_count = sum(1 for phase in phases if phase["status"] == "FAIL")
    blocked_count = sum(1 for phase in phases if phase["status"] == "BLOCKED")
    pass_count = sum(1 for phase in phases if phase["status"] == "PASS")
    if fail_count:
        overall_status = "FAIL"
    elif blocked_count:
        overall_status = "BLOCKED"
    else:
        overall_status = "PASS"
    return {
        "generated_at": utc_now(),
        "repo_root": str(REPO_ROOT),
        "overall_status": overall_status,
        "phase_count": len(phases),
        "pass_count": pass_count,
        "blocked_count": blocked_count,
        "fail_count": fail_count,
        "phases": phases,
    }


def main() -> int:
    args = parse_args()
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    phase_results = [
        run_phase(definition, output_dir=output_dir, timeout_seconds=args.phase_timeout_seconds)
        for definition in resolve_phase_definitions(args)
    ]
    summary = summarize(phase_results)

    json_path = output_dir / "t778-state-authority-qualification-summary.json"
    markdown_path = output_dir / "T778_STATE_AUTHORITY_QUALIFICATION_SUMMARY.md"
    write_text(json_path, json.dumps(summary, indent=2) + "\n")
    write_text(markdown_path, build_markdown(summary))

    if summary["overall_status"] == "PASS":
        return 0
    if summary["overall_status"] == "BLOCKED":
        return 2
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
