#!/usr/bin/env python3
"""
Run a JUCE soak with a configurable number of random effects active at once.

Core behavior:
- Keep exactly N random effects active per flow epoch.
- Rotate chain/parallel flow topology every flow interval.
- Rotate blend strategy between flow epochs.
- Collect callback/xrun/CPU evidence and emit pass/fail artifacts.
"""

from __future__ import annotations

import argparse
import json
import math
import platform
import random
import statistics
import sys
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Iterable, TypeVar

DEFAULT_ACTIVE_EFFECT_COUNT = 10


DEFAULT_EFFECT_FALLBACK = [
    "map2://juce/dynamics/compressor",
    "map2://juce/dynamics/limiter",
    "map2://juce/dynamics/gate",
    "map2://juce/eq/parametric",
    "map2://juce/delay",
    "map2://juce/delay/circular",
    "map2://juce/modulation/chorus",
    "map2://juce/modulation/phaser",
    "map2://juce/pitch/shifter",
    "map2://juce/modulation/intellifx",
    "map2://juce/multieffect/shoegaze",
    "map2://juce/reverb/pcm70",
    "map2://juce/pitch/interval",
    "map2://juce/pitch/h3000",
    "map2://juce/effects/eventide-h9",
    "map2://juce/amp/peavey5150",
    "map2://juce/amp/tweedbassman",
    "map2://juce/multieffect/passionfx",
]


BLEND_TYPES = (
    "hard_a",
    "hard_b",
    "step_ab",
    "triangle",
    "sine",
    "random_jump",
)


@dataclass(frozen=True)
class FlowTemplate:
    name: str
    serial_count: int
    parallel_groups: tuple[tuple[int, int], ...]

    @property
    def total_effects(self) -> int:
        return self.serial_count + sum(a + b for a, b in self.parallel_groups)


def build_flow_templates(active_effect_count: int) -> tuple[FlowTemplate, ...]:
    if active_effect_count == 10:
        return (
            FlowTemplate(name="serial4_parallel3x3", serial_count=4, parallel_groups=((3, 3),)),
            FlowTemplate(name="serial2_parallel4x4", serial_count=2, parallel_groups=((4, 4),)),
            FlowTemplate(name="parallel5x5", serial_count=0, parallel_groups=((5, 5),)),
            FlowTemplate(name="parallel3x2_then3x2", serial_count=0, parallel_groups=((3, 2), (3, 2))),
        )

    if active_effect_count == 5:
        return (
            FlowTemplate(name="serial5", serial_count=5, parallel_groups=()),
            FlowTemplate(name="serial3_parallel1x1", serial_count=3, parallel_groups=((1, 1),)),
            FlowTemplate(name="serial1_parallel2x2", serial_count=1, parallel_groups=((2, 2),)),
            FlowTemplate(name="parallel2x1_then1x1", serial_count=0, parallel_groups=((2, 1), (1, 1))),
        )

    parallel_a = max(1, active_effect_count // 2)
    parallel_b = max(1, active_effect_count - parallel_a)
    serial_pref = max(0, active_effect_count - 2)
    return (
        FlowTemplate(name=f"serial{active_effect_count}", serial_count=active_effect_count, parallel_groups=()),
        FlowTemplate(name=f"serial{serial_pref}_parallel1x1", serial_count=serial_pref, parallel_groups=((1, 1),)),
        FlowTemplate(name=f"parallel{parallel_a}x{parallel_b}", serial_count=0, parallel_groups=((parallel_a, parallel_b),)),
    )

T = TypeVar("T")


def utc_now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def default_output_json(repo_root: Path) -> Path:
    day_dir = repo_root / "docs" / "fit-for-purpose-evidence" / datetime.now(UTC).strftime("%Y%m%d")
    day_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    return day_dir / f"juce-random-fx-soak-{stamp}.json"


def get_float(payload: dict[str, Any], key: str, fallback: float = 0.0) -> float:
    value = payload.get(key, fallback)
    if isinstance(value, (int, float)):
        return float(value)
    return fallback


def get_int(payload: dict[str, Any], key: str, fallback: int = 0) -> int:
    value = payload.get(key, fallback)
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    return fallback


def summarize_float(values: Iterable[float]) -> dict[str, float]:
    data = list(values)
    if not data:
        return {"min": 0.0, "max": 0.0, "mean": 0.0}
    return {"min": min(data), "max": max(data), "mean": statistics.fmean(data)}


def percentile(values: Iterable[float], fraction: float) -> float:
    data = sorted(float(v) for v in values)
    if not data:
        return 0.0
    if fraction <= 0.0:
        return data[0]
    if fraction >= 1.0:
        return data[-1]
    position = (len(data) - 1) * fraction
    lower = int(math.floor(position))
    upper = int(math.ceil(position))
    if lower == upper:
        return data[lower]
    blend = position - lower
    return data[lower] * (1.0 - blend) + data[upper] * blend


def unique_preserve_order(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for item in values:
        if item in seen:
            continue
        seen.add(item)
        ordered.append(item)
    return ordered


def discover_default_effect_pool(catalog_path: Path, active_effect_count: int) -> list[str]:
    if not catalog_path.exists():
        return DEFAULT_EFFECT_FALLBACK

    try:
        data = json.loads(catalog_path.read_text(encoding="utf-8"))
    except Exception:
        return DEFAULT_EFFECT_FALLBACK

    processors = data.get("processors", [])
    if not isinstance(processors, list):
        return DEFAULT_EFFECT_FALLBACK

    excluded_categories = {"instrument", "drums"}
    excluded_uri_prefixes = (
        "map2://juce/convolution/",
        "map2://juce/nam",
    )
    pool: list[str] = []
    for processor in processors:
        if not isinstance(processor, dict):
            continue
        uri = str(processor.get("uri", "")).strip()
        category = str(processor.get("category", "")).strip().lower()
        if not uri.startswith("map2://juce/"):
            continue
        if category in excluded_categories:
            continue
        if any(uri.startswith(prefix) for prefix in excluded_uri_prefixes):
            continue
        pool.append(uri)

    pool = unique_preserve_order(pool)
    if len(pool) < active_effect_count:
        return DEFAULT_EFFECT_FALLBACK
    return pool


def discover_runtime_loadable_pool(engine: Any) -> list[str]:
    try:
        discovered = list(engine.list_plugins())
    except Exception:
        return []

    uris: list[str] = []
    for item in discovered:
        if not isinstance(item, dict):
            continue
        uri = str(item.get("uri", "")).strip()
        if not uri:
            continue
        uris.append(uri)
    return unique_preserve_order(uris)


def clear_routing(engine: Any) -> dict[str, int]:
    removed_groups = 0
    remove_group_failures = 0
    removed_chain_nodes = 0
    remove_chain_failures = 0

    try:
        groups = list(engine.get_parallel_groups())
    except Exception:
        groups = []

    for group in groups:
        group_id = -1
        if isinstance(group, dict):
            group_id = int(group.get("id", -1))
        if group_id < 0:
            continue
        try:
            ok = bool(engine.remove_parallel_group(group_id))
        except Exception:
            ok = False
        if ok:
            removed_groups += 1
        else:
            remove_group_failures += 1

    try:
        chain_order = list(engine.get_chain_order())
    except Exception:
        chain_order = []

    for plugin_id in chain_order:
        try:
            ok = bool(engine.remove_from_chain(int(plugin_id)))
        except Exception:
            ok = False
        if ok:
            removed_chain_nodes += 1
        else:
            remove_chain_failures += 1

    return {
        "removed_groups": removed_groups,
        "remove_group_failures": remove_group_failures,
        "removed_chain_nodes": removed_chain_nodes,
        "remove_chain_failures": remove_chain_failures,
    }


def unload_effects(engine: Any, active_effects: list[dict[str, Any]]) -> tuple[int, list[str]]:
    failures: list[str] = []
    unloaded = 0
    for entry in active_effects:
        plugin_id = int(entry["instance_id"])
        uri = str(entry["uri"])
        try:
            ok = bool(engine.unload_plugin(plugin_id))
        except Exception as exc:
            failures.append(f"{plugin_id}:{uri}:exception:{exc}")
            continue
        if ok:
            unloaded += 1
        else:
            failures.append(f"{plugin_id}:{uri}:returned_false")
    return unloaded, failures


def preload_effect_pool(
    engine: Any,
    effect_pool: list[str],
    target_count: int = DEFAULT_ACTIVE_EFFECT_COUNT,
) -> tuple[list[dict[str, Any]], list[str]]:
    loaded: list[dict[str, Any]] = []
    failures: list[str] = []
    if not effect_pool:
        raise RuntimeError("empty effect pool")

    preload_targets = list(effect_pool)
    if len(preload_targets) < target_count:
        repeats = math.ceil(target_count / len(preload_targets))
        preload_targets = (preload_targets * repeats)[:target_count]

    prewarm_plugin_node = getattr(engine, "prewarm_plugin_node", None)

    for uri in preload_targets:
        try:
            instance_id = int(engine.load_plugin(uri))
        except Exception as exc:
            failures.append(f"{uri}:exception:{exc}")
            continue
        if instance_id <= 0:
            failures.append(f"{uri}:load_plugin_returned_{instance_id}")
            continue

        loaded.append({"uri": uri, "instance_id": instance_id})

        if callable(prewarm_plugin_node):
            try:
                prewarmed = bool(prewarm_plugin_node(instance_id))
            except Exception as exc:
                failures.append(f"{uri}:{instance_id}:prewarm_exception:{exc}")
                continue
            if not prewarmed:
                failures.append(f"{uri}:{instance_id}:prewarm_returned_false")

    if len(loaded) < target_count:
        for entry in loaded:
            try:
                engine.unload_plugin(int(entry["instance_id"]))
            except Exception:
                pass
        raise RuntimeError(
            f"could only preload {len(loaded)}/{target_count} effects from pool size {len(effect_pool)}"
        )

    return loaded, failures


def load_effects(
    engine: Any,
    effect_pool: list[str],
    rng: random.Random,
    target_count: int = DEFAULT_ACTIVE_EFFECT_COUNT,
    allow_duplicates: bool = False,
) -> tuple[list[dict[str, Any]], list[str]]:
    loaded: list[dict[str, Any]] = []
    failures: list[str] = []
    if not effect_pool:
        raise RuntimeError("empty effect pool")

    if allow_duplicates:
        attempts_remaining = max(target_count * 30, len(effect_pool) * 10)
        while len(loaded) < target_count and attempts_remaining > 0:
            attempts_remaining -= 1
            uri = rng.choice(effect_pool)
            try:
                instance_id = int(engine.load_plugin(uri))
            except Exception as exc:
                failures.append(f"{uri}:exception:{exc}")
                continue
            if instance_id > 0:
                loaded.append({"uri": uri, "instance_id": instance_id})
            else:
                failures.append(f"{uri}:load_plugin_returned_{instance_id}")
    else:
        candidates = list(effect_pool)
        if len(candidates) > target_count:
            rng.shuffle(candidates)
        for uri in candidates:
            if len(loaded) >= target_count:
                break
            try:
                instance_id = int(engine.load_plugin(uri))
            except Exception as exc:
                failures.append(f"{uri}:exception:{exc}")
                continue
            if instance_id > 0:
                loaded.append({"uri": uri, "instance_id": instance_id})
            else:
                failures.append(f"{uri}:load_plugin_returned_{instance_id}")

    if len(loaded) < target_count:
        for entry in loaded:
            try:
                engine.unload_plugin(int(entry["instance_id"]))
            except Exception:
                pass
        raise RuntimeError(
            f"could only load {len(loaded)}/{target_count} effects from pool size {len(effect_pool)}"
        )
    return loaded, failures


def pick_active_effects(
    loaded_effects: list[dict[str, Any]],
    rng: random.Random,
    target_count: int = DEFAULT_ACTIVE_EFFECT_COUNT,
) -> list[dict[str, Any]]:
    if len(loaded_effects) < target_count:
        raise RuntimeError(
            f"loaded effect pool size {len(loaded_effects)} is smaller than requested active count {target_count}"
        )

    candidates = list(loaded_effects)
    rng.shuffle(candidates)
    return list(candidates[:target_count])


def choose_different(items: tuple[T, ...], previous: T | None, rng: random.Random) -> T:
    if len(items) == 1:
        return items[0]
    pick = rng.choice(items)
    for _ in range(12):
        if pick != previous:
            break
        pick = rng.choice(items)
    return pick


def blend_value(blend_type: str, elapsed_in_flow: float, flow_span_seconds: float, rng: random.Random) -> float:
    if blend_type == "hard_a":
        return 0.0
    if blend_type == "hard_b":
        return 1.0
    if blend_type == "step_ab":
        return 0.0 if int(elapsed_in_flow) % 2 == 0 else 1.0
    if blend_type == "triangle":
        span = max(0.1, flow_span_seconds)
        phase = (elapsed_in_flow % span) / span
        return 2.0 * phase if phase < 0.5 else 2.0 * (1.0 - phase)
    if blend_type == "sine":
        span = max(0.1, flow_span_seconds)
        return 0.5 + 0.5 * math.sin((elapsed_in_flow / span) * math.tau)
    if blend_type == "random_jump":
        return rng.random()
    return 0.5


def apply_flow(
    engine: Any,
    flow_template: FlowTemplate,
    effect_ids_in_order: list[int],
) -> tuple[list[int], list[str]]:
    failures: list[str] = []
    if flow_template.total_effects != len(effect_ids_in_order):
        return [], [
            f"flow_template_{flow_template.name}_requires_{flow_template.total_effects}_effects_"
            f"but_got_{len(effect_ids_in_order)}"
        ]

    serial_ids = effect_ids_in_order[: flow_template.serial_count]
    branch_ids = effect_ids_in_order[flow_template.serial_count :]

    # Normalize placement first (works for both legacy auto-chain and explicit-placement behavior).
    for plugin_id in effect_ids_in_order:
        try:
            engine.remove_from_chain(plugin_id)
        except Exception as exc:
            failures.append(f"remove_from_chain_preflight:{plugin_id}:exception:{exc}")

    for plugin_id in serial_ids:
        try:
            ok = bool(engine.add_to_chain(plugin_id, -1))
        except Exception as exc:
            ok = False
            failures.append(f"add_to_chain_serial:{plugin_id}:exception:{exc}")
        if not ok:
            failures.append(f"add_to_chain_serial:{plugin_id}:returned_false")

    group_ids: list[int] = []
    cursor = 0
    for group_index, (branch_a, branch_b) in enumerate(flow_template.parallel_groups):
        try:
            group_id = int(engine.create_parallel_group(-1, 2))
        except Exception as exc:
            failures.append(f"create_parallel_group:{group_index}:exception:{exc}")
            continue
        if group_id < 0:
            failures.append(f"create_parallel_group:{group_index}:returned_{group_id}")
            continue
        group_ids.append(group_id)

        for branch_index, branch_size in enumerate((branch_a, branch_b)):
            for _ in range(branch_size):
                plugin_id = branch_ids[cursor]
                cursor += 1
                try:
                    ok = bool(engine.add_to_parallel_branch(group_id, branch_index, plugin_id, -1))
                except Exception as exc:
                    ok = False
                    failures.append(
                        f"add_to_parallel_branch:group{group_id}:branch{branch_index}:"
                        f"plugin{plugin_id}:exception:{exc}"
                    )
                if not ok:
                    failures.append(
                        f"add_to_parallel_branch:group{group_id}:branch{branch_index}:"
                        f"plugin{plugin_id}:returned_false"
                    )

    return group_ids, failures


def build_markdown_report(result: dict[str, Any], output_json: Path, output_md: Path) -> None:
    thresholds = result["thresholds"]
    summary = result["summary"]
    checks = summary["checks"]
    check_mark = lambda ok: "PASS" if ok else "FAIL"

    lines = [
        f"# JUCE Random FX Soak ({result['metadata']['ended_at_utc']})",
        "",
        "## Profile",
        f"- Duration target: `{result['metadata']['duration_seconds_target']}s`",
        f"- Duration actual: `{result['metadata']['duration_seconds_actual']}s`",
        f"- Sample rate: `{result['config']['sample_rate_hz']} Hz`",
        f"- Buffer size: `{result['config']['buffer_size_samples']}`",
        f"- Flow rotation: `{result['config']['flow_rotation_seconds']}s`",
        f"- Blend step: `{result['config']['blend_step_seconds']}s`",
        f"- Live rewire: `{result['config']['live_rewire']}`",
        f"- Effects active per flow: `{result['config']['active_effect_count']}`",
        f"- Preloaded effect pool: `{result['config']['preload_effect_pool']}`",
        f"- Preloaded instances: `{result['config']['preloaded_instance_count']}`",
        f"- Runtime pool source: `{result['config']['effect_pool_source']}`",
        "",
        "## Overall",
        f"- Status: `{'PASS' if summary['overall_pass'] else 'FAIL'}`",
        f"- Flow transitions: `{summary['flow_count']}`",
        f"- Final xrun count: `{summary['final_xrun_count']}`",
        f"- Total flow errors: `{summary['flow_apply_error_count']}`",
        "",
        "## Threshold Checks",
        f"- Xruns <= {thresholds['max_xruns']}: `{check_mark(checks['xruns_ok'])}`",
        f"- Peak callback jitter <= {thresholds['max_peak_jitter_ms']} ms: `{check_mark(checks['jitter_ok'])}`",
        f"- Peak budget utilization <= {thresholds['max_budget_utilization_percent']}%: `{check_mark(checks['budget_ok'])}`",
        f"- Flow apply errors <= {thresholds['max_flow_errors']}: `{check_mark(checks['flow_errors_ok'])}`",
        f"- Effect count always {result['config']['active_effect_count']}: `{check_mark(checks['effect_count_ok'])}`",
        "",
        "## Key Metrics",
        f"- Xruns per second: `{summary['xrun_rate_per_second']}`",
        f"- CPU total percent (min/max/mean): `{summary['cpu_total_percent']}`",
        f"- Callback jitter ms (min/max/mean): `{summary['callback_jitter_ms']}`",
        f"- Callback jitter p95 ms: `{summary['callback_jitter_p95_ms']}`",
        f"- Peak callback jitter ms: `{summary['peak_callback_jitter_ms']}`",
        f"- Budget utilization percent (min/max/mean): `{summary['budget_utilization_percent']}`",
        "",
        "## Blend Type Usage",
    ]

    max_xruns_per_second = thresholds.get("max_xruns_per_second")
    if max_xruns_per_second is not None:
        lines.insert(
            lines.index("## Key Metrics"),
            f"- Xruns/sec <= {max_xruns_per_second}: `{check_mark(checks['xrun_rate_ok'])}`",
        )

    max_callback_jitter_ms = thresholds.get("max_callback_jitter_ms")
    if max_callback_jitter_ms is not None:
        lines.insert(
            lines.index("## Key Metrics"),
            f"- Callback jitter max <= {max_callback_jitter_ms} ms: `{check_mark(checks['callback_jitter_sample_ok'])}`",
        )

    max_callback_jitter_p95_ms = thresholds.get("max_callback_jitter_p95_ms")
    if max_callback_jitter_p95_ms is not None:
        lines.insert(
            lines.index("## Key Metrics"),
            f"- Callback jitter p95 <= {max_callback_jitter_p95_ms} ms: `{check_mark(checks['callback_jitter_p95_ok'])}`",
        )

    for blend_type, count in summary["blend_type_usage"].items():
        lines.append(f"- `{blend_type}`: `{count}` flow(s)")

    lines.extend(
        [
            "",
            "## Artifacts",
            f"- JSON: `{output_json}`",
            "",
        ]
    )
    output_md.write_text("\n".join(lines), encoding="utf-8")


def parse_args(repo_root: Path) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Run a JUCE randomized soak with configurable active effects, rotating flow topology and blend types."
        )
    )
    parser.add_argument(
        "--active-effect-count",
        type=int,
        default=DEFAULT_ACTIVE_EFFECT_COUNT,
        help="Number of effects kept active per flow (recommended range: 3-10).",
    )
    parser.add_argument("--duration-seconds", type=int, default=1800, help="Total soak duration.")
    parser.add_argument("--sample-interval-seconds", type=float, default=1.0, help="Metrics sample interval.")
    parser.add_argument("--flow-rotation-seconds", type=float, default=20.0, help="How often to rotate flow/effect set.")
    parser.add_argument("--blend-step-seconds", type=float, default=0.25, help="How often to update AB blend values.")
    parser.add_argument(
        "--live-rewire",
        action="store_true",
        help="Rewire flows while audio keeps running (aggressive crash-repro mode).",
    )
    parser.add_argument(
        "--rewire-settle-seconds",
        type=float,
        default=0.05,
        help="Settle delay after restarting audio during safe rewire mode.",
    )
    parser.add_argument("--warmup-seconds", type=float, default=0.25, help="Warmup delay after start_audio.")
    parser.add_argument(
        "--reset-stats-after-warmup",
        action="store_true",
        help="Reset audio stats/xruns after warmup before measurement window.",
    )
    parser.add_argument("--sample-rate", type=int, default=48000, help="Engine sample rate.")
    parser.add_argument("--buffer-size", type=int, default=64, help="Engine buffer size.")
    parser.add_argument(
        "--module-dir",
        type=Path,
        default=repo_root / "juce-engine" / "build",
        help="Directory containing map2_audio_engine Python module.",
    )
    parser.add_argument(
        "--processor-catalog",
        type=Path,
        default=repo_root / "app" / "deployment" / "juce_processors.json",
        help="Catalog used to auto-discover effect URIs.",
    )
    parser.add_argument(
        "--effect-uri",
        action="append",
        default=[],
        help="Explicit effect URI. Repeat to build a custom pool. If set, catalog discovery is skipped.",
    )
    parser.add_argument(
        "--reuse-effects",
        action="store_true",
        help="Reuse one random 10-effect set across all flows (no unload/reload churn).",
    )
    parser.add_argument(
        "--preload-effect-pool",
        action="store_true",
        help="Preload and prewarm the full effect pool once, then rotate only resident-node topology.",
    )
    parser.add_argument("--seed", type=int, default=None, help="Random seed for deterministic replay.")
    parser.add_argument("--output-json", type=Path, default=None, help="Output JSON path.")
    parser.add_argument("--output-md", type=Path, default=None, help="Output markdown path.")
    parser.add_argument("--log-every-seconds", type=float, default=30.0, help="Progress log cadence.")
    parser.add_argument("--threshold-max-xruns", type=int, default=0, help="Pass threshold: max xruns.")
    parser.add_argument(
        "--threshold-max-xruns-per-second",
        type=float,
        default=None,
        help="Optional pass threshold: max xruns per second over the run.",
    )
    parser.add_argument(
        "--threshold-max-peak-jitter-ms",
        type=float,
        default=0.35,
        help="Pass threshold: max peak callback jitter in ms.",
    )
    parser.add_argument(
        "--threshold-max-callback-jitter-ms",
        type=float,
        default=None,
        help="Optional pass threshold: max sampled callback jitter in ms.",
    )
    parser.add_argument(
        "--threshold-max-callback-jitter-p95-ms",
        type=float,
        default=None,
        help="Optional pass threshold: p95 sampled callback jitter in ms.",
    )
    parser.add_argument(
        "--threshold-max-budget-utilization-percent",
        type=float,
        default=80.0,
        help="Pass threshold: max callback budget utilization percent.",
    )
    parser.add_argument(
        "--threshold-max-flow-errors",
        type=int,
        default=0,
        help="Pass threshold: max flow apply errors.",
    )
    return parser.parse_args()


def run() -> int:
    repo_root = Path(__file__).resolve().parents[4]
    args = parse_args(repo_root)

    active_effect_count = int(args.active_effect_count)
    if active_effect_count < 1:
        raise SystemExit("active effect count must be >= 1")
    if active_effect_count > len(DEFAULT_EFFECT_FALLBACK):
        raise SystemExit(
            f"active effect count {active_effect_count} exceeds fallback pool size {len(DEFAULT_EFFECT_FALLBACK)}"
        )

    flow_templates = build_flow_templates(active_effect_count)
    for template in flow_templates:
        if template.total_effects != active_effect_count:
            raise SystemExit(f"invalid flow template {template.name}: expected total {active_effect_count}")

    if not args.module_dir.exists():
        raise SystemExit(f"module dir does not exist: {args.module_dir}")

    effect_pool = (
        unique_preserve_order(args.effect_uri)
        if args.effect_uri
        else discover_default_effect_pool(args.processor_catalog, active_effect_count)
    )
    if not effect_pool:
        raise SystemExit("effect pool is empty")

    output_json = args.output_json or default_output_json(repo_root)
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_md = args.output_md or output_json.with_suffix(".md")

    seed = args.seed if args.seed is not None else int(time.time_ns() & 0xFFFFFFFF)
    rng = random.Random(seed)

    sys.path.insert(0, str(args.module_dir))
    import map2_audio_engine  # pylint: disable=import-error

    engine = map2_audio_engine.create_engine()

    flow_events: list[dict[str, Any]] = []
    samples: list[dict[str, Any]] = []
    load_failures: list[str] = []
    unload_failures: list[str] = []
    routing_cleanup_failures = 0
    flow_apply_failures: list[str] = []

    active_effects: list[dict[str, Any]] = []
    preloaded_effects: list[dict[str, Any]] = []
    current_group_ids: list[int] = []
    current_blend_type: str | None = None
    current_flow_template: FlowTemplate | None = None
    current_flow_start = 0.0
    current_blend_value = 0.5
    flow_index = 0
    last_log = 0.0
    start_monotonic = 0.0
    runtime_effect_pool: list[str] = []
    preloaded_instance_count = 0
    effect_pool_source = "requested"
    reuse_effects = bool(args.reuse_effects)
    preload_effect_pool_enabled = bool(args.preload_effect_pool)
    auto_reuse_reason: str | None = None

    started_utc = utc_now_iso()
    start_ok = False
    audio_running = False
    init_ok = False
    begin_topology_update = None
    end_topology_update = None

    engine.set_sample_rate(args.sample_rate)
    engine.set_buffer_size(args.buffer_size)

    try:
        init_ok = bool(engine.initialize(""))
        if not init_ok:
            raise SystemExit("engine.initialize failed")

        start_ok = bool(engine.start_audio())
        if not start_ok:
            raise SystemExit("engine.start_audio failed")
        audio_running = True
        begin_topology_update = getattr(engine, "begin_topology_update", None)
        end_topology_update = getattr(engine, "end_topology_update", None)

        runtime_discovered = discover_runtime_loadable_pool(engine)
        runtime_effect_pool = list(effect_pool)
        if args.effect_uri:
            # For explicit pools, preserve user-provided mix (e.g., native + external)
            # and let load failures naturally prune unavailable entries.
            effect_pool_source = "explicit_requested"
        elif runtime_discovered:
            runtime_set = set(runtime_discovered)
            intersection = [uri for uri in effect_pool if uri in runtime_set]
            if intersection:
                runtime_effect_pool = unique_preserve_order(intersection)
                effect_pool_source = "requested_intersection"
            else:
                # Keep requested pool when runtime discovery does not enumerate
                # native MAP2 URIs (prevents accidental third-party plugin churn).
                effect_pool_source = "requested_not_in_runtime_inventory"
        else:
            effect_pool_source = "requested_no_runtime_inventory"

        if (
            not reuse_effects
            and runtime_effect_pool
            and all(uri.startswith("LV2-") for uri in runtime_effect_pool)
        ):
            reuse_effects = True
            auto_reuse_reason = "all_effects_are_lv2_runtime_plugins"

        if preload_effect_pool_enabled:
            try:
                preloaded_effects, preload_errors = preload_effect_pool(
                    engine,
                    runtime_effect_pool,
                    active_effect_count,
                )
            except RuntimeError as exc:
                raise SystemExit(f"failed to preload effect pool: {exc}") from exc
            load_failures.extend(preload_errors)
            preloaded_instance_count = len(preloaded_effects)

        time.sleep(max(0.0, args.warmup_seconds))
        if args.reset_stats_after_warmup:
            reset_stats = getattr(engine, "reset_audio_io_stats", None)
            if callable(reset_stats):
                reset_stats()
            reset_xruns = getattr(engine, "reset_xrun_counter", None)
            if callable(reset_xruns):
                reset_xruns()

        start_monotonic = time.monotonic()
        next_flow_at = start_monotonic
        next_blend_at = start_monotonic
        next_sample_at = start_monotonic + max(0.05, args.sample_interval_seconds)

        while True:
            now = time.monotonic()
            elapsed = now - start_monotonic
            if elapsed >= args.duration_seconds:
                break

            if now >= next_flow_at:
                flow_index += 1

                if not args.live_rewire and audio_running:
                    try:
                        stopped = bool(engine.stop_audio())
                    except Exception as exc:
                        stopped = False
                        flow_apply_failures.append(f"stop_audio_before_rewire:exception:{exc}")
                    if stopped:
                        audio_running = False
                    else:
                        flow_apply_failures.append("stop_audio_before_rewire:returned_false")

                topology_batch_started = False
                if callable(begin_topology_update):
                    begin_topology_update()
                    topology_batch_started = True

                try:
                    cleanup_result = clear_routing(engine)
                    routing_cleanup_failures += (
                        cleanup_result["remove_group_failures"] + cleanup_result["remove_chain_failures"]
                    )

                    if active_effects and not reuse_effects and not preload_effect_pool_enabled:
                        unloaded, failures = unload_effects(engine, active_effects)
                        if unloaded != len(active_effects):
                            unload_failures.extend(failures)
                        active_effects = []

                    if preload_effect_pool_enabled:
                        try:
                            if not active_effects or not reuse_effects:
                                active_effects = pick_active_effects(
                                    preloaded_effects,
                                    rng,
                                    active_effect_count,
                                )
                        except RuntimeError as exc:
                            raise SystemExit(f"failed to pick active effect set: {exc}") from exc
                    elif not active_effects:
                        allow_duplicates = len(runtime_effect_pool) < active_effect_count
                        try:
                            active_effects, load_errors = load_effects(
                                engine,
                                runtime_effect_pool,
                                rng,
                                active_effect_count,
                                allow_duplicates=allow_duplicates,
                            )
                        except RuntimeError as exc:
                            fallback_used = False
                            if runtime_discovered and runtime_effect_pool != runtime_discovered:
                                fallback_pool = unique_preserve_order(runtime_discovered)
                                fallback_allow_duplicates = len(fallback_pool) < active_effect_count
                                try:
                                    active_effects, load_errors = load_effects(
                                        engine,
                                        fallback_pool,
                                        rng,
                                        active_effect_count,
                                        allow_duplicates=fallback_allow_duplicates,
                                    )
                                    runtime_effect_pool = fallback_pool
                                    effect_pool_source = "runtime_discovered_fallback_after_load_failure"
                                    fallback_used = True
                                    if (
                                        not reuse_effects
                                        and runtime_effect_pool
                                        and all(uri.startswith("LV2-") for uri in runtime_effect_pool)
                                    ):
                                        reuse_effects = True
                                        auto_reuse_reason = "all_effects_are_lv2_runtime_plugins"
                                except RuntimeError:
                                    fallback_used = False
                            if not fallback_used:
                                raise SystemExit(f"failed to load active effect set: {exc}") from exc
                        load_failures.extend(load_errors)

                    effect_order = [int(entry["instance_id"]) for entry in active_effects]
                    rng.shuffle(effect_order)

                    current_flow_template = choose_different(flow_templates, current_flow_template, rng)
                    current_blend_type = choose_different(BLEND_TYPES, current_blend_type, rng)
                    current_group_ids, apply_failures = apply_flow(engine, current_flow_template, effect_order)
                    flow_apply_failures.extend(apply_failures)
                    current_flow_start = now
                    current_blend_value = 0.5

                    flow_events.append(
                        {
                            "timestamp_utc": utc_now_iso(),
                            "flow_index": flow_index,
                            "elapsed_seconds": round(elapsed, 3),
                            "flow_template": current_flow_template.name,
                            "blend_type": current_blend_type,
                            "active_effect_count": len(active_effects),
                            "active_effect_uris": [entry["uri"] for entry in active_effects],
                            "group_ids": list(current_group_ids),
                            "apply_failure_count": len(apply_failures),
                            "apply_failures": list(apply_failures),
                            "live_rewire": bool(args.live_rewire),
                        }
                    )
                finally:
                    if topology_batch_started and callable(end_topology_update):
                        end_topology_update()

                if not args.live_rewire:
                    try:
                        started = bool(engine.start_audio())
                    except Exception as exc:
                        started = False
                        flow_apply_failures.append(f"start_audio_after_rewire:exception:{exc}")
                    if not started:
                        raise SystemExit("engine.start_audio failed after flow rewire")
                    audio_running = True
                    time.sleep(max(0.0, args.rewire_settle_seconds))

                next_flow_at = now + max(1.0, args.flow_rotation_seconds)
                next_blend_at = now

            if current_group_ids and current_blend_type and now >= next_blend_at:
                blend = blend_value(
                    current_blend_type,
                    elapsed_in_flow=max(0.0, now - current_flow_start),
                    flow_span_seconds=max(1.0, args.flow_rotation_seconds),
                    rng=rng,
                )
                current_blend_value = min(1.0, max(0.0, blend))
                for group_id in current_group_ids:
                    try:
                        engine.set_parallel_ab_blend(group_id, current_blend_value)
                    except Exception as exc:
                        flow_apply_failures.append(f"set_parallel_ab_blend:group{group_id}:exception:{exc}")
                next_blend_at = now + max(0.05, args.blend_step_seconds)

            if now >= next_sample_at:
                cpu_metrics = engine.get_cpu_metrics()
                audio_stats = engine.get_audio_io_stats()
                samples.append(
                    {
                        "timestamp_utc": utc_now_iso(),
                        "elapsed_seconds": round(elapsed, 3),
                        "flow_index": flow_index,
                        "flow_template": current_flow_template.name if current_flow_template else "",
                        "blend_type": current_blend_type or "",
                        "blend_value": current_blend_value,
                        "active_effect_count": len(active_effects),
                        "group_count": len(current_group_ids),
                        "cpu_total_percent": get_float(cpu_metrics, "total_cpu_percent"),
                        "cpu_headroom_percent": get_float(cpu_metrics, "headroom_percent"),
                        "cpu_avg_percent": get_float(cpu_metrics, "average_cpu_percent"),
                        "xrun_count": get_int(audio_stats, "xrun_count"),
                        "callback_jitter_ms": get_float(audio_stats, "callback_jitter_ms"),
                        "peak_callback_jitter_ms": get_float(audio_stats, "peak_callback_jitter_ms"),
                        "avg_callback_duration_ms": get_float(audio_stats, "avg_callback_duration_ms"),
                        "peak_callback_duration_ms": get_float(audio_stats, "peak_callback_duration_ms"),
                        "budget_utilization_percent": get_float(audio_stats, "budget_utilization"),
                    }
                )
                next_sample_at = now + max(0.05, args.sample_interval_seconds)

            if elapsed - last_log >= max(5.0, args.log_every_seconds):
                if samples:
                    latest = samples[-1]
                    print(
                        "progress"
                        f" elapsed={int(elapsed)}s"
                        f" flow={latest['flow_index']}"
                        f" template={latest['flow_template']}"
                        f" blend={latest['blend_type']}:{latest['blend_value']:.3f}"
                        f" effects={latest['active_effect_count']}"
                        f" xruns={latest['xrun_count']}"
                        f" cpu={latest['cpu_total_percent']:.2f}%"
                        f" jitter_peak={latest['peak_callback_jitter_ms']:.3f}ms"
                    )
                last_log = elapsed

            time.sleep(0.01)
    finally:
        if audio_running:
            try:
                engine.stop_audio()
            except Exception:
                pass
            audio_running = False

        cleanup_result = clear_routing(engine)
        routing_cleanup_failures += cleanup_result["remove_group_failures"] + cleanup_result["remove_chain_failures"]

        if preloaded_effects:
            _, failures = unload_effects(engine, preloaded_effects)
            unload_failures.extend(failures)
            preloaded_effects = []
            active_effects = []
        elif active_effects:
            _, failures = unload_effects(engine, active_effects)
            unload_failures.extend(failures)
            active_effects = []

        if init_ok:
            try:
                engine.shutdown()
            except Exception:
                pass

    if not samples:
        raise SystemExit("no samples captured")

    ended_utc = utc_now_iso()
    actual_duration = round(time.monotonic() - start_monotonic, 3)

    cpu_total_values = [s["cpu_total_percent"] for s in samples]
    jitter_values = [s["callback_jitter_ms"] for s in samples]
    peak_jitter_values = [s["peak_callback_jitter_ms"] for s in samples]
    budget_values = [s["budget_utilization_percent"] for s in samples]

    final_xrun_count = samples[-1]["xrun_count"]
    xrun_rate_per_second = final_xrun_count / actual_duration if actual_duration > 0 else float(final_xrun_count)
    callback_jitter_p95_ms = percentile(jitter_values, 0.95)
    blend_usage: dict[str, int] = {}
    effect_count_ok = True
    for event in flow_events:
        blend = str(event.get("blend_type", ""))
        blend_usage[blend] = blend_usage.get(blend, 0) + 1
        if int(event.get("active_effect_count", -1)) != active_effect_count:
            effect_count_ok = False

    checks = {
        "xruns_ok": final_xrun_count <= args.threshold_max_xruns,
        "jitter_ok": max(peak_jitter_values) <= args.threshold_max_peak_jitter_ms,
        "budget_ok": max(budget_values) <= args.threshold_max_budget_utilization_percent,
        "flow_errors_ok": len(flow_apply_failures) <= args.threshold_max_flow_errors,
        "effect_count_ok": effect_count_ok,
    }
    if args.threshold_max_xruns_per_second is not None:
        checks["xrun_rate_ok"] = xrun_rate_per_second <= args.threshold_max_xruns_per_second
    if args.threshold_max_callback_jitter_ms is not None:
        checks["callback_jitter_sample_ok"] = max(jitter_values) <= args.threshold_max_callback_jitter_ms
    if args.threshold_max_callback_jitter_p95_ms is not None:
        checks["callback_jitter_p95_ok"] = callback_jitter_p95_ms <= args.threshold_max_callback_jitter_p95_ms

    result = {
        "metadata": {
            "started_at_utc": started_utc,
            "ended_at_utc": ended_utc,
            "duration_seconds_target": args.duration_seconds,
            "duration_seconds_actual": actual_duration,
            "host": platform.node(),
            "platform": platform.platform(),
            "python_version": sys.version,
            "module_dir": str(args.module_dir),
            "seed": seed,
        },
        "config": {
            "sample_rate_hz": args.sample_rate,
            "buffer_size_samples": args.buffer_size,
            "flow_rotation_seconds": args.flow_rotation_seconds,
            "blend_step_seconds": args.blend_step_seconds,
            "live_rewire": bool(args.live_rewire),
            "rewire_settle_seconds": args.rewire_settle_seconds,
            "sample_interval_seconds": args.sample_interval_seconds,
            "warmup_seconds": args.warmup_seconds,
            "reset_stats_after_warmup": bool(args.reset_stats_after_warmup),
            "reuse_effects": bool(reuse_effects),
            "auto_reuse_reason": auto_reuse_reason,
            "preload_effect_pool": preload_effect_pool_enabled,
            "preloaded_instance_count": preloaded_instance_count,
            "requested_effect_pool_size": len(effect_pool),
            "requested_effect_pool": effect_pool,
            "runtime_effect_pool_size": len(runtime_effect_pool),
            "runtime_effect_pool": runtime_effect_pool,
            "effect_pool_source": effect_pool_source,
            "active_effect_count": active_effect_count,
            "flow_templates": [t.name for t in flow_templates],
            "blend_types": list(BLEND_TYPES),
        },
        "thresholds": {
            "max_xruns": args.threshold_max_xruns,
            "max_xruns_per_second": args.threshold_max_xruns_per_second,
            "max_peak_jitter_ms": args.threshold_max_peak_jitter_ms,
            "max_callback_jitter_ms": args.threshold_max_callback_jitter_ms,
            "max_callback_jitter_p95_ms": args.threshold_max_callback_jitter_p95_ms,
            "max_budget_utilization_percent": args.threshold_max_budget_utilization_percent,
            "max_flow_errors": args.threshold_max_flow_errors,
        },
        "events": {
            "flow_events": flow_events,
            "flow_apply_failures": flow_apply_failures,
            "effect_load_failures": load_failures,
            "effect_unload_failures": unload_failures,
            "routing_cleanup_failure_count": routing_cleanup_failures,
        },
        "summary": {
            "sample_count": len(samples),
            "flow_count": len(flow_events),
            "final_xrun_count": final_xrun_count,
            "xrun_rate_per_second": xrun_rate_per_second,
            "cpu_total_percent": summarize_float(cpu_total_values),
            "callback_jitter_ms": summarize_float(jitter_values),
            "callback_jitter_p95_ms": callback_jitter_p95_ms,
            "peak_callback_jitter_ms": max(peak_jitter_values),
            "budget_utilization_percent": summarize_float(budget_values),
            "flow_apply_error_count": len(flow_apply_failures),
            "blend_type_usage": blend_usage,
            "checks": checks,
            "overall_pass": all(checks.values()),
        },
        "samples": samples,
    }

    output_json.write_text(json.dumps(result, indent=2), encoding="utf-8")
    build_markdown_report(result, output_json, output_md)

    print(f"wrote_json={output_json}")
    print(f"wrote_md={output_md}")
    print(f"overall_pass={result['summary']['overall_pass']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
