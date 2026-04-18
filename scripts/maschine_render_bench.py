#!/usr/bin/env python3
"""Benchmark the Phase 1 Maschine MK1 retained-mode render pipeline."""

from __future__ import annotations

import argparse
import statistics
import sys
import time
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services.maschine.mk1_usb_transport import MaschineMK1UsbTransport
from app.services.maschine.profiles import MaschineProfileRuntime


PROFILES = ("t1_ctrl", "t9_effect_chain_editor", "t16_monitor")


@dataclass
class BenchResult:
    profile_id: str
    median_ms: float
    p95_ms: float
    avg_damage_tiles: float


def _build_state(iteration: int) -> dict:
    blocks = [
        {
            "block_id": f"path-a:{index}",
            "plugin_name": label,
            "chain_name": "MAIN",
            "path_label": f"PATH {index + 1}",
            "bypassed": index == 2 and iteration % 4 == 0,
            "top_parameters": [
                {"param_id": "MIX", "value": str(20 + ((iteration + index) % 40))},
                {"param_id": "GAIN", "value": f"+{index + 1}.0"},
            ],
        }
        for index, label in enumerate(("EQ", "DELAY", "REVERB", "CHORUS"))
    ]
    selected_index = iteration % len(blocks)
    metrics = [
        {"key": "audio.cpu_load", "label": "AUDIO CPU LOAD", "value": round(0.2 + (iteration % 5) * 0.1, 2), "source": "AUDIO"},
        {"key": "health.cpu_percent", "label": "CPU PERCENT", "value": 14 + iteration, "source": "HEALTH"},
        {"key": "midi_hub.route_count", "label": "ROUTE COUNT", "value": 8, "source": "MIDI_HUB"},
    ]
    history_value = float(metrics[0]["value"])
    return {
        "snapshot_name": f"SNAP {iteration % 8}",
        "block_rows": [
            {"display": f"{'>' if index == selected_index else ' '} {block['plugin_name']}", "is_selected": index == selected_index}
            for index, block in enumerate(blocks)
        ],
        "blocks": blocks,
        "block_count": len(blocks),
        "selected_index": selected_index,
        "selected_index_max": max(1, len(blocks) - 1),
        "selected_block_id": blocks[selected_index]["block_id"],
        "selected_plugin_name": blocks[selected_index]["plugin_name"],
        "selected_path_label": blocks[selected_index]["path_label"],
        "selected_param_name": "MIX",
        "selected_param_value": blocks[selected_index]["top_parameters"][0]["value"],
        "selected_block": blocks[selected_index],
        "metric_rows": [
            {"display": f"{'>' if metric['key'] == 'audio.cpu_load' else ' '} {metric['label']} {metric['value']}", "is_selected": metric["key"] == "audio.cpu_load"}
            for metric in metrics
        ],
        "metric_count": len(metrics),
        "focus_metric_key": "audio.cpu_load",
        "focus_metric_label": "AUDIO CPU LOAD",
        "focus_metric_source": "AUDIO",
        "focus_metric_value": f"{history_value:.2f}",
        "focus_metric_min": "0.20",
        "focus_metric_max": "0.60",
        "focus_metric_normalized": min(1.0, max(0.0, (history_value - 0.2) / 0.4)),
        "stats_updated_at_short": f"12:0{iteration % 6}:00",
        "transport": {"connected": True},
    }


def run_benchmark(*, iterations: int, hardware: bool) -> list[BenchResult]:
    runtime = MaschineProfileRuntime()
    transport = MaschineMK1UsbTransport(allow_kernel_detach=True) if hardware else None
    results: list[BenchResult] = []
    try:
        for profile_id in PROFILES:
            durations: list[float] = []
            damage_sizes: list[int] = []
            final_render = None
            for iteration in range(iterations):
                state = _build_state(iteration)
                started = time.perf_counter()
                final_render = runtime.render(state, profile_id=profile_id)
                durations.append((time.perf_counter() - started) * 1000.0)
                damage_sizes.append(len(final_render.left.get("damage") or []) + len(final_render.right.get("damage") or []))
            if final_render and transport is not None:
                transport.write_display_frame(0, bytes.fromhex(str(final_render.left["framebuffer"])))
                transport.write_display_frame(1, bytes.fromhex(str(final_render.right["framebuffer"])))
            results.append(
                BenchResult(
                    profile_id=profile_id,
                    median_ms=statistics.median(durations),
                    p95_ms=statistics.quantiles(durations, n=20)[-1] if len(durations) > 1 else durations[0],
                    avg_damage_tiles=sum(damage_sizes) / max(1, len(damage_sizes)),
                )
            )
    finally:
        if transport is not None:
            transport.close()
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--iterations", type=int, default=60, help="Render iterations per profile")
    parser.add_argument("--hardware", action="store_true", help="Write the final frame of each profile to the connected MK1")
    args = parser.parse_args()

    results = run_benchmark(iterations=max(1, args.iterations), hardware=args.hardware)
    print("# Maschine Phase 1 Render Benchmark")
    for result in results:
        print(
            f"- {result.profile_id}: median={result.median_ms:.2f}ms p95={result.p95_ms:.2f}ms "
            f"avg_damage_tiles={result.avg_damage_tiles:.1f}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
