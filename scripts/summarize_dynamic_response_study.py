#!/usr/bin/env python3
"""Collate T099 dynamic-response study artifacts into subjective JSON and evidence markdown."""

from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path
from typing import Any

SCORE_FIELDS = (
    "dynamic_feel",
    "pick_attack_clarity",
    "compression_sag",
    "overall_tone",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Summarize T099 dynamic-response study captures.")
    parser.add_argument("--manifest", type=Path, required=True, help="Run manifest JSON.")
    parser.add_argument("--quant-summary", type=Path, required=True, help="Quantitative summary.json from analyze_envelope.py.")
    parser.add_argument("--evaluators-dir", type=Path, required=True, help="Directory containing evaluator-*.json files.")
    parser.add_argument(
        "--evaluators-glob",
        type=str,
        default="evaluator-*.json",
        help="Glob pattern for evaluator response JSON files.",
    )
    parser.add_argument("--output-json", type=Path, required=True, help="Path for collated subjective_eval.json.")
    parser.add_argument("--output-markdown", type=Path, required=True, help="Path for generated evidence markdown.")
    return parser.parse_args()


def load_json_object(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"Expected JSON object in {path}")
    return payload


def mean_or_zero(values: list[float]) -> float:
    return round(statistics.fmean(values), 4) if values else 0.0


def load_evaluators(evaluators_dir: Path, evaluator_glob: str) -> list[dict[str, Any]]:
    if not evaluators_dir.exists():
        raise FileNotFoundError(f"Evaluator directory not found: {evaluators_dir}")

    paths = sorted(path for path in evaluators_dir.glob(evaluator_glob) if path.is_file())
    if not paths:
        raise FileNotFoundError(f"No evaluator files matched '{evaluator_glob}' in {evaluators_dir}")

    evaluators: list[dict[str, Any]] = []
    for path in paths:
        payload = load_json_object(path)
        payload["_source_path"] = str(path)
        evaluators.append(payload)
    return evaluators


def aggregate_subjective(
    evaluators: list[dict[str, Any]],
    chain_identity_map: dict[str, str],
) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]]]:
    aggregate: dict[str, dict[str, list[float]]] = {}
    by_chain: dict[str, dict[str, list[float]]] = {}
    normalized_evaluators: list[dict[str, Any]] = []

    for set_id, chain_label in chain_identity_map.items():
        aggregate[set_id] = {field: [] for field in SCORE_FIELDS}
        aggregate[set_id]["stage_rank"] = []
        by_chain[chain_label] = {field: [] for field in SCORE_FIELDS}
        by_chain[chain_label]["stage_rank"] = []

    for evaluator in evaluators:
        normalized = {
            "evaluator_id": str(evaluator.get("evaluator_id", "")).strip(),
            "role": str(evaluator.get("role", "")).strip(),
            "date": str(evaluator.get("date", "")).strip(),
            "developer": bool(evaluator.get("developer")),
            "familiar_with_map2": bool(evaluator.get("familiar_with_map2")),
            "overall_notes": str(evaluator.get("overall_notes", "")).strip(),
            "sets": {},
            "stage_rank": {},
            "source_path": evaluator.get("_source_path", ""),
        }
        set_payload = evaluator.get("sets", {})
        stage_rank = evaluator.get("stage_rank", {})
        if not isinstance(set_payload, dict) or not isinstance(stage_rank, dict):
            raise ValueError("Evaluator payload missing 'sets' or 'stage_rank' object")

        for set_id, chain_label in chain_identity_map.items():
            row = set_payload.get(set_id, {})
            if not isinstance(row, dict):
                raise ValueError(f"Evaluator set payload must be object for {set_id}")
            normalized_row = {}
            for field in SCORE_FIELDS:
                value = float(row.get(field, 0) or 0)
                aggregate[set_id][field].append(value)
                by_chain[chain_label][field].append(value)
                normalized_row[field] = value
            normalized_row["notes"] = str(row.get("notes", "")).strip()
            normalized["sets"][set_id] = normalized_row

            rank_value = float(stage_rank.get(set_id, 0) or 0)
            aggregate[set_id]["stage_rank"].append(rank_value)
            by_chain[chain_label]["stage_rank"].append(rank_value)
            normalized["stage_rank"][set_id] = rank_value

        normalized_evaluators.append(normalized)

    aggregate_summary: dict[str, Any] = {}
    for set_id, values in aggregate.items():
        aggregate_summary[set_id] = {
            "dynamic_feel_mean": mean_or_zero(values["dynamic_feel"]),
            "pick_attack_clarity_mean": mean_or_zero(values["pick_attack_clarity"]),
            "compression_sag_mean": mean_or_zero(values["compression_sag"]),
            "overall_tone_mean": mean_or_zero(values["overall_tone"]),
            "stage_rank_mean": mean_or_zero(values["stage_rank"]),
        }

    chain_summary: dict[str, Any] = {}
    for chain_label, values in by_chain.items():
        chain_summary[chain_label] = {
            "dynamic_feel_mean": mean_or_zero(values["dynamic_feel"]),
            "pick_attack_clarity_mean": mean_or_zero(values["pick_attack_clarity"]),
            "compression_sag_mean": mean_or_zero(values["compression_sag"]),
            "overall_tone_mean": mean_or_zero(values["overall_tone"]),
            "stage_rank_mean": mean_or_zero(values["stage_rank"]),
        }

    return aggregate_summary, chain_summary, normalized_evaluators


def build_quantitative_rows(
    manifest: dict[str, Any],
    quant_summary: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    phrase_labels = {
        str(item.get("phrase_id", "")).strip(): str(item.get("label", "")).strip()
        for item in manifest.get("phrases", [])
        if isinstance(item, dict)
    }
    results_by_pair_id = {
        str(item.get("pair_id", "")).strip(): item
        for item in quant_summary.get("results", [])
        if isinstance(item, dict)
    }
    map2_chain_label = str(manifest.get("map2_chain_label", "MAP2 NAM")).strip() or "MAP2 NAM"

    quantitative_rows: list[dict[str, Any]] = []
    phrase_verdicts: list[dict[str, Any]] = []

    for pair in manifest.get("pairs", []):
        if not isinstance(pair, dict):
            continue
        pair_id = str(pair.get("pair_id", "")).strip()
        result = results_by_pair_id.get(pair_id)
        if result is None:
            continue

        phrase_id = str(pair.get("phrase_id", "")).strip()
        phrase_label = phrase_labels.get(phrase_id, phrase_id or pair_id)
        metrics = result.get("metrics", {})
        gate = result.get("gate", {})
        row = {
            "phrase_id": phrase_id,
            "phrase_label": phrase_label,
            "pair_id": pair_id,
            "pair_label": str(pair.get("pair_label", "")).strip() or pair_id,
            "reference_chain": str(pair.get("reference_chain", "")).strip(),
            "candidate_chain": str(pair.get("candidate_chain", "")).strip(),
            "delta_onset_slope_mean": round(float(metrics.get("delta_onset_slope_db_per_ms", {}).get("mean", 0.0)), 4),
            "delta_peak_mean": round(float(metrics.get("delta_peak_db", {}).get("mean", 0.0)), 4),
            "delta_rise_time_mean": round(float(metrics.get("delta_rise_time_ms", {}).get("mean", 0.0)), 4),
            "gate_status": str(gate.get("slope_status", "")).strip() or "unknown",
        }
        quantitative_rows.append(row)

        if row["candidate_chain"] == map2_chain_label:
            phrase_verdicts.append(
                {
                    "phrase_id": phrase_id,
                    "phrase_label": phrase_label,
                    "map2_verdict": "PASS" if row["gate_status"] == "pass" else "FAIL",
                    "notes": (
                        "Auto-derived from onset slope gate; review subjective results and rise/peak deltas before final sign-off."
                    ),
                    "delta_onset_slope_mean": row["delta_onset_slope_mean"],
                }
            )

    return quantitative_rows, phrase_verdicts


def build_gap_actions(phrase_verdicts: list[dict[str, Any]]) -> list[dict[str, str]]:
    gaps: list[dict[str, str]] = []
    for verdict in phrase_verdicts:
        if verdict["map2_verdict"] == "PASS":
            continue
        gaps.append(
            {
                "gap": (
                    f"{verdict['phrase_label']} missed the onset slope gate with mean delta "
                    f"{verdict['delta_onset_slope_mean']} dB/ms."
                ),
                "action": (
                    "Review NAM training material variance, input gain staging, and latency compensation before rerunning the phrase."
                ),
            }
        )
    if not gaps:
        gaps.append(
            {
                "gap": "No automatic slope-gate failures detected in the MAP2 phrase set.",
                "action": "Perform human review of subjective rankings before claiming validation.",
            }
        )
    return gaps


def render_markdown(
    manifest: dict[str, Any],
    quantitative_rows: list[dict[str, Any]],
    chain_summary: dict[str, Any],
    phrase_verdicts: list[dict[str, Any]],
    gaps: list[dict[str, str]],
    evaluator_count: int,
) -> str:
    lines: list[str] = []
    lines.append("# T099 Dynamic Response Evidence")
    lines.append("")
    lines.append(f"Date: {manifest.get('date', '')}")
    lines.append(f"Test run folder: `{manifest.get('run_folder', '')}`")
    lines.append("")
    lines.append("## 1. Test Setup Summary")
    lines.append("")
    lines.append(f"- Reference amp: {manifest.get('reference_amp', '')}")
    lines.append(f"- MAP2 NAM model: {manifest.get('map2_nam_model', '')}")
    lines.append(f"- Competitor modeler: {manifest.get('competitor_modeler', '')}")
    lines.append(f"- IR used across chains: {manifest.get('ir_used', '')}")
    lines.append(f"- Recording interface and DAW: {manifest.get('recording_interface_and_daw', '')}")
    lines.append(f"- Measured RTL offset applied: {manifest.get('rtl_offset_ms', 0)} ms")
    lines.append("")
    lines.append("## 2. Quantitative Results")
    lines.append("")
    lines.append("| Phrase | Pair | Mean Δ onset slope (dB/ms) | Mean Δ peak (dB) | Mean Δ rise time (ms) | Gate |")
    lines.append("|---|---|---:|---:|---:|---|")
    for row in quantitative_rows:
        lines.append(
            f"| {row['phrase_label']} | {row['pair_label']} | {row['delta_onset_slope_mean']} | "
            f"{row['delta_peak_mean']} | {row['delta_rise_time_mean']} | {row['gate_status']} |"
        )
    lines.append("")
    lines.append("## 3. Subjective Results")
    lines.append("")
    lines.append(f"- Evaluator count: `{evaluator_count}`")
    lines.append("")
    lines.append("| Chain | Dynamic feel | Pick attack clarity | Compression/sag | Overall tone | Stage rank |")
    lines.append("|---|---:|---:|---:|---:|---:|")
    for chain_label, metrics in chain_summary.items():
        lines.append(
            f"| {chain_label} | {metrics['dynamic_feel_mean']} | {metrics['pick_attack_clarity_mean']} | "
            f"{metrics['compression_sag_mean']} | {metrics['overall_tone_mean']} | {metrics['stage_rank_mean']} |"
        )
    lines.append("")
    lines.append("## 4. Phrase Verdicts")
    lines.append("")
    lines.append("| Phrase | MAP2 verdict (PASS/WARN/FAIL) | Notes |")
    lines.append("|---|---|---|")
    for verdict in phrase_verdicts:
        lines.append(f"| {verdict['phrase_label']} | {verdict['map2_verdict']} | {verdict['notes']} |")
    lines.append("")
    lines.append("## 5. Specific Gaps and Actions")
    lines.append("")
    for item in gaps:
        lines.append(f"- Gap: {item['gap']}")
        lines.append(f"  Action: {item['action']}")
    lines.append("")
    lines.append("## 6. Final Recommendation")
    lines.append("")
    lines.append("- Overall readiness call: Draft only; human review required after capture session.")
    lines.append("- Report update applied to `docs/PLATFORM_EVALUATION_REPORT.md`: No")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    manifest = load_json_object(args.manifest)
    quant_summary = load_json_object(args.quant_summary)
    evaluators = load_evaluators(args.evaluators_dir, args.evaluators_glob)

    chain_identity_map = manifest.get("chain_identity_map", {})
    if not isinstance(chain_identity_map, dict) or not chain_identity_map:
        raise ValueError("Manifest must include a non-empty chain_identity_map object")

    aggregate_summary, chain_summary, normalized_evaluators = aggregate_subjective(evaluators, chain_identity_map)
    quantitative_rows, phrase_verdicts = build_quantitative_rows(manifest, quant_summary)
    gaps = build_gap_actions(phrase_verdicts)

    output_payload = {
        "evaluators": normalized_evaluators,
        "evaluator_count": len(normalized_evaluators),
        "chain_identity_map": chain_identity_map,
        "aggregate": aggregate_summary,
        "aggregate_by_chain": chain_summary,
        "quantitative_rows": quantitative_rows,
        "phrase_verdicts": phrase_verdicts,
        "gaps": gaps,
        "run_metadata": {
            "date": manifest.get("date", ""),
            "run_folder": manifest.get("run_folder", ""),
            "reference_amp": manifest.get("reference_amp", ""),
            "map2_nam_model": manifest.get("map2_nam_model", ""),
            "competitor_modeler": manifest.get("competitor_modeler", ""),
            "ir_used": manifest.get("ir_used", ""),
            "recording_interface_and_daw": manifest.get("recording_interface_and_daw", ""),
            "rtl_offset_ms": manifest.get("rtl_offset_ms", 0),
        },
    }

    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(output_payload, indent=2) + "\n", encoding="utf-8")

    markdown = render_markdown(
        manifest=manifest,
        quantitative_rows=quantitative_rows,
        chain_summary=chain_summary,
        phrase_verdicts=phrase_verdicts,
        gaps=gaps,
        evaluator_count=len(normalized_evaluators),
    )
    args.output_markdown.parent.mkdir(parents=True, exist_ok=True)
    args.output_markdown.write_text(markdown, encoding="utf-8")

    print(
        f"Collated {len(normalized_evaluators)} evaluator(s) and "
        f"{len(quantitative_rows)} quantitative row(s)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
