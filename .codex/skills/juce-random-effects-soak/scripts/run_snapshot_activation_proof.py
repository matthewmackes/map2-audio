#!/usr/bin/env python3
"""
Run end-to-end snapshot activation proof against the live SnapshotService path.

This script creates a temporary snapshot database, initializes the real
JuceEngineService, creates three snapshots:
- A: baseline topology
- S: same topology as A
- B: reversed topology to force a graph mutation

It then performs live activate_snapshot() transitions while audio is running and
captures both audio callback stats and the activation-scoped topology mutation
metrics persisted by SnapshotService.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import tempfile
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[4]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from app import database as database_module
from app.services.juce_engine_service import AudioEngineConfig, get_audio_engine
from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService
from app.services.snapshot_service import SnapshotService
from app.services.snapshot_tempo_service import reset_snapshot_tempo_service


DEFAULT_EFFECTS = [
    "map2://juce/amp/peavey5150",
    "map2://juce/pitch/h3000",
    "map2://juce/amp/tweedbassman",
    "map2://juce/multieffect/passionfx",
    "map2://juce/delay",
    "map2://juce/pitch/boss-xs1",
    "map2://juce/effects/eventide-h9",
    "map2://juce/eq/parametric",
    "map2://juce/delay/circular",
    "map2://juce/dynamics/limiter",
]


def utc_now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def default_output_json(repo_root: Path) -> Path:
    day_dir = repo_root / "docs" / "fit-for-purpose-evidence" / datetime.now(UTC).strftime("%Y%m%d")
    day_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    return day_dir / f"snapshot-activation-proof-{stamp}.json"


def init_temp_db(base: Path) -> None:
    database_module._tables_created = False
    database_module._pragmas_set = False
    reset_snapshot_tempo_service()
    database_module.init_async_db(f"sqlite+aiosqlite:///{base / 'snapshot-activation-proof.db'}")


def make_detail(label: str, effects: list[str], color: str) -> dict[str, Any]:
    return {
        "channels": [
            {
                "channel_key": "channel-0",
                "label": label,
                "color": color,
                "muted": False,
                "solo": False,
                "dry_wet_mix": 100.0,
                "chain_id": 1,
            }
        ],
        "chains": [
            {
                "id": 1,
                "name": f"{label}Chain",
                "plugins": [
                    {
                        "uri": uri,
                        "name": uri.rsplit("/", 1)[-1],
                        "position": idx,
                        "bypass": False,
                        "parameters": {},
                        "loader_state": {},
                    }
                    for idx, uri in enumerate(effects)
                ],
            }
        ],
        "routing": {
            "mode": "parallel_blend",
            "active_channel_key": "channel-0",
            "blend_positions": {"channel-0": 100.0},
            "morph_position": 0.0,
            "series_order": ["channel-0"],
        },
        "midi_map": [],
    }


def summarize_float(values: list[float]) -> dict[str, float]:
    if not values:
        return {"min": 0.0, "max": 0.0, "mean": 0.0}
    return {
        "min": min(values),
        "max": max(values),
        "mean": sum(values) / len(values),
    }


def build_markdown_report(result: dict[str, Any], output_json: Path, output_md: Path) -> None:
    summary = result["summary"]
    checks = summary["checks"]
    lines = [
        f"# Snapshot Activation Proof ({result['metadata']['ended_at_utc']})",
        "",
        "## Profile",
        f"- Sample rate: `{result['config']['sample_rate_hz']} Hz`",
        f"- Buffer size: `{result['config']['buffer_size_samples']}`",
        f"- Audio device: `{result['config']['audio_device']}`",
        f"- Effect count: `{len(result['config']['effects'])}`",
        f"- Transition sequence: `{result['config']['transition_sequence']}`",
        "",
        "## Overall",
        f"- Status: `{'PASS' if summary['overall_pass'] else 'FAIL'}`",
        f"- Final xrun count: `{summary['final_xrun_count']}`",
        f"- Peak callback jitter ms: `{summary['peak_callback_jitter_ms']}`",
        f"- Peak activation elapsed ms: `{summary['activation_elapsed_ms']['max']}`",
        "",
        "## Checks",
        f"- Xruns <= {result['thresholds']['max_xruns']}: `{'PASS' if checks['xruns_ok'] else 'FAIL'}`",
        f"- Peak callback jitter <= {result['thresholds']['max_peak_callback_jitter_ms']} ms: `{'PASS' if checks['jitter_ok'] else 'FAIL'}`",
        f"- All runtime states live: `{'PASS' if checks['runtime_live_ok'] else 'FAIL'}`",
        f"- Same-topology reuse observed: `{'PASS' if checks['same_topology_reuse_observed'] else 'FAIL'}`",
        f"- Topology mutation observed on changed topology: `{'PASS' if checks['changed_topology_mutation_observed'] else 'FAIL'}`",
        "",
        "## Key Metrics",
        f"- Activation elapsed ms (min/max/mean): `{summary['activation_elapsed_ms']}`",
        f"- Callback jitter ms (min/max/mean): `{summary['callback_jitter_ms']}`",
        f"- Topology last mutation duration ms (min/max/mean): `{summary['topology_last_mutation_duration_ms']}`",
        f"- Same-topology deltas: `{summary['same_topology_deltas']}`",
        f"- Changed-topology deltas: `{summary['changed_topology_deltas']}`",
        "",
        "## Artifacts",
        f"- JSON: `{output_json}`",
        "",
    ]
    output_md.write_text("\n".join(lines), encoding="utf-8")


async def run_proof(args: argparse.Namespace) -> dict[str, Any]:
    started_utc = utc_now_iso()
    output_json = args.output_json or default_output_json(args.repo_root)
    output_md = args.output_md or output_json.with_suffix(".md")

    with tempfile.TemporaryDirectory(prefix="map2-snapshot-activation-proof-") as tmp:
        temp_db_root = Path(tmp)
        init_temp_db(temp_db_root)

        engine = get_audio_engine()
        engine.config = AudioEngineConfig(
            sample_rate=args.sample_rate,
            buffer_size=args.buffer_size,
            input_channels=2,
            output_channels=2,
            audio_device=args.audio_device,
        )

        initialized = await engine.initialize()
        if not initialized:
            raise SystemExit("engine.initialize failed")

        try:
            async with database_module.get_session() as session:
                service = SnapshotService(session)
                snapshots = {
                    "A": await service.create_snapshot(
                        name="SnapA",
                        detail_payload=make_detail("A", list(args.effect_uri), "#2563eb"),
                    ),
                    "S": await service.create_snapshot(
                        name="SnapS",
                        detail_payload=make_detail("S", list(args.effect_uri), "#0f766e"),
                    ),
                    "B": await service.create_snapshot(
                        name="SnapB",
                        detail_payload=make_detail("B", list(reversed(args.effect_uri)), "#7c3aed"),
                    ),
                }

                if not await engine.start_audio():
                    raise SystemExit("engine.start_audio failed")

                try:
                    raw_engine = getattr(engine, "_engine", None)
                    if raw_engine is not None and hasattr(raw_engine, "reset_audio_io_stats"):
                        raw_engine.reset_audio_io_stats()
                    if raw_engine is not None and hasattr(raw_engine, "reset_topology_mutation_stats"):
                        raw_engine.reset_topology_mutation_stats()

                    events: list[dict[str, Any]] = []
                    previous_label: str | None = None
                    runtime_state_service = SnapshotRuntimeStateService(session)

                    for target_label in args.sequence:
                        target_snapshot = snapshots[target_label]
                        transition_type = (
                            "initial"
                            if previous_label is None
                            else "same_topology"
                            if {previous_label, target_label} == {"A", "S"}
                            else "changed_topology"
                        )
                        started_at = time.monotonic()
                        activation = await service.activate_snapshot(target_snapshot["id"])
                        elapsed_ms = (time.monotonic() - started_at) * 1000.0
                        audio_stats = await engine.get_audio_io_stats()
                        runtime_state = await runtime_state_service.get_live_state()
                        topology = activation.get("topology_mutation") or {}
                        topology_delta = topology.get("delta") or {}
                        topology_after = topology.get("after") or {}
                        event = {
                            "timestamp_utc": utc_now_iso(),
                            "from_label": previous_label,
                            "to_label": target_label,
                            "transition_type": transition_type,
                            "snapshot_id": target_snapshot["id"],
                            "activation_elapsed_ms": elapsed_ms,
                            "topology_reused": bool(activation.get("topology_reused", False)),
                            "runtime_state": runtime_state.get("state"),
                            "xrun_count": audio_stats.get("xrun_count", 0),
                            "peak_callback_jitter_ms": audio_stats.get("peak_callback_jitter_ms", 0.0),
                            "avg_callback_duration_ms": audio_stats.get("avg_callback_duration_ms", 0.0),
                            "budget_utilization_percent": audio_stats.get("budget_utilization", 0.0),
                            "topology_delta_mutation_count": topology_delta.get("mutation_count", 0),
                            "topology_delta_no_op_skip_count": topology_delta.get("no_op_skip_count", 0),
                            "topology_after_last_mutation_duration_ms": topology_after.get("last_mutation_duration_ms", 0.0),
                            "topology_after_peak_mutation_duration_ms": topology_after.get("peak_mutation_duration_ms", 0.0),
                        }
                        print(
                            "activation"
                            f" from={previous_label or 'none'}"
                            f" to={target_label}"
                            f" type={transition_type}"
                            f" elapsed_ms={elapsed_ms:.3f}"
                            f" reused={event['topology_reused']}"
                            f" xruns={event['xrun_count']}"
                            f" jitter_peak={event['peak_callback_jitter_ms']:.3f}ms"
                            f" topo_delta={event['topology_delta_mutation_count']}",
                            flush=True,
                        )
                        events.append(event)
                        previous_label = target_label
                finally:
                    await engine.stop_audio()
        finally:
            await engine.shutdown()

    ended_utc = utc_now_iso()
    activation_elapsed_values = [float(event["activation_elapsed_ms"]) for event in events]
    callback_jitter_values = [float(event["peak_callback_jitter_ms"]) for event in events]
    topology_last_mutation_values = [float(event["topology_after_last_mutation_duration_ms"]) for event in events]
    same_topology_events = [event for event in events if event["transition_type"] == "same_topology"]
    changed_topology_events = [event for event in events if event["transition_type"] == "changed_topology"]

    final_xrun_count = int(events[-1]["xrun_count"]) if events else 0
    peak_callback_jitter_ms = max(callback_jitter_values) if callback_jitter_values else 0.0
    same_topology_reuse_observed = any(
        bool(event["topology_reused"]) and int(event["topology_delta_mutation_count"]) == 0
        for event in same_topology_events
    )
    changed_topology_mutation_observed = any(int(event["topology_delta_mutation_count"]) > 0 for event in changed_topology_events)

    result = {
        "metadata": {
            "started_at_utc": started_utc,
            "ended_at_utc": ended_utc,
        },
        "config": {
            "sample_rate_hz": args.sample_rate,
            "buffer_size_samples": args.buffer_size,
            "audio_device": args.audio_device,
            "effects": list(args.effect_uri),
            "transition_sequence": list(args.sequence),
        },
        "thresholds": {
            "max_xruns": args.threshold_max_xruns,
            "max_peak_callback_jitter_ms": args.threshold_max_peak_callback_jitter_ms,
        },
        "summary": {
            "final_xrun_count": final_xrun_count,
            "peak_callback_jitter_ms": peak_callback_jitter_ms,
            "activation_elapsed_ms": summarize_float(activation_elapsed_values),
            "callback_jitter_ms": summarize_float(callback_jitter_values),
            "topology_last_mutation_duration_ms": summarize_float(topology_last_mutation_values),
            "same_topology_deltas": [
                {
                    "from": event["from_label"],
                    "to": event["to_label"],
                    "topology_reused": event["topology_reused"],
                    "mutation_count": event["topology_delta_mutation_count"],
                    "no_op_skip_count": event["topology_delta_no_op_skip_count"],
                }
                for event in same_topology_events
            ],
            "changed_topology_deltas": [
                {
                    "from": event["from_label"],
                    "to": event["to_label"],
                    "topology_reused": event["topology_reused"],
                    "mutation_count": event["topology_delta_mutation_count"],
                    "no_op_skip_count": event["topology_delta_no_op_skip_count"],
                }
                for event in changed_topology_events
            ],
            "checks": {
                "xruns_ok": final_xrun_count <= args.threshold_max_xruns,
                "jitter_ok": peak_callback_jitter_ms <= args.threshold_max_peak_callback_jitter_ms,
                "runtime_live_ok": all(str(event["runtime_state"]) == "live" for event in events),
                "same_topology_reuse_observed": same_topology_reuse_observed,
                "changed_topology_mutation_observed": changed_topology_mutation_observed,
            },
        },
        "events": events,
    }
    result["summary"]["overall_pass"] = all(result["summary"]["checks"].values())

    output_json.write_text(json.dumps(result, indent=2), encoding="utf-8")
    build_markdown_report(result, output_json, output_md)
    print(f"wrote_json={output_json}")
    print(f"wrote_md={output_md}")
    print(f"overall_pass={result['summary']['overall_pass']}")
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run snapshot activation proof against the live SnapshotService path.")
    parser.add_argument("--sample-rate", type=int, default=48000)
    parser.add_argument("--buffer-size", type=int, default=64)
    parser.add_argument("--audio-device", default="Default ALSA Output")
    parser.add_argument(
        "--effect-uri",
        action="append",
        default=[],
        help="Explicit effect URI. Repeat to override the default effect set.",
    )
    parser.add_argument(
        "--sequence",
        nargs="+",
        default=["A", "S", "B", "S"],
        help="Activation sequence using snapshot labels A, S, and B.",
    )
    parser.add_argument("--threshold-max-xruns", type=int, default=0)
    parser.add_argument("--threshold-max-peak-callback-jitter-ms", type=float, default=0.35)
    parser.add_argument("--output-json", type=Path, default=None)
    parser.add_argument("--output-md", type=Path, default=None)
    parser.set_defaults(repo_root=REPO_ROOT)
    args = parser.parse_args()
    if not args.effect_uri:
        args.effect_uri = list(DEFAULT_EFFECTS)
    invalid_labels = [label for label in args.sequence if label not in {"A", "S", "B"}]
    if invalid_labels:
        raise SystemExit(f"invalid sequence labels: {invalid_labels}")
    return args


def main() -> int:
    args = parse_args()
    asyncio.run(run_proof(args))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
