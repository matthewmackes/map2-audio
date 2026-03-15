from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "summarize_dynamic_response_study.py"


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def test_dynamic_response_summary_collates_subjective_and_quantitative_data(tmp_path: Path) -> None:
    evaluators_dir = tmp_path / "evaluators"
    evaluators_dir.mkdir()

    manifest = {
        "date": "2026-03-14",
        "run_folder": "docs/fit-for-purpose-evidence/20260314/t099",
        "reference_amp": "Fender Deluxe Reverb",
        "map2_nam_model": "deluxe-reverb.nam",
        "competitor_modeler": "Quad Cortex",
        "ir_used": "Mesa 1x12 IR",
        "recording_interface_and_daw": "UA-1000 + Reaper",
        "rtl_offset_ms": 4.2,
        "map2_chain_label": "MAP2 NAM",
        "chain_identity_map": {
            "set_1": "Reference",
            "set_2": "MAP2 NAM",
            "set_3": "Competitor",
        },
        "phrases": [
            {"phrase_id": "phrase_1", "label": "Single-note lead dynamics"},
            {"phrase_id": "phrase_2", "label": "Chord swells"},
        ],
        "pairs": [
            {
                "pair_id": "phrase_1_map2_vs_ref",
                "phrase_id": "phrase_1",
                "pair_label": "MAP2 vs Ref",
                "reference_chain": "Reference",
                "candidate_chain": "MAP2 NAM",
            },
            {
                "pair_id": "phrase_1_competitor_vs_ref",
                "phrase_id": "phrase_1",
                "pair_label": "Competitor vs Ref",
                "reference_chain": "Reference",
                "candidate_chain": "Competitor",
            },
            {
                "pair_id": "phrase_2_map2_vs_ref",
                "phrase_id": "phrase_2",
                "pair_label": "MAP2 vs Ref",
                "reference_chain": "Reference",
                "candidate_chain": "MAP2 NAM",
            },
        ],
    }
    write_json(tmp_path / "manifest.json", manifest)

    quant_summary = {
        "pair_count": 3,
        "results": [
            {
                "pair_id": "phrase_1_map2_vs_ref",
                "metrics": {
                    "delta_onset_slope_db_per_ms": {"mean": 1.25},
                    "delta_peak_db": {"mean": -0.3},
                    "delta_rise_time_ms": {"mean": 0.7},
                },
                "gate": {"slope_status": "pass"},
            },
            {
                "pair_id": "phrase_1_competitor_vs_ref",
                "metrics": {
                    "delta_onset_slope_db_per_ms": {"mean": 0.55},
                    "delta_peak_db": {"mean": -0.1},
                    "delta_rise_time_ms": {"mean": 0.2},
                },
                "gate": {"slope_status": "pass"},
            },
            {
                "pair_id": "phrase_2_map2_vs_ref",
                "metrics": {
                    "delta_onset_slope_db_per_ms": {"mean": 4.4},
                    "delta_peak_db": {"mean": -1.2},
                    "delta_rise_time_ms": {"mean": 2.4},
                },
                "gate": {"slope_status": "fail"},
            },
        ],
    }
    write_json(tmp_path / "quant-summary.json", quant_summary)

    write_json(
        evaluators_dir / "evaluator-E01.json",
        {
            "evaluator_id": "E01",
            "role": "guitarist",
            "date": "2026-03-14",
            "developer": False,
            "familiar_with_map2": False,
            "sets": {
                "set_1": {
                    "dynamic_feel": 5,
                    "pick_attack_clarity": 5,
                    "compression_sag": 4,
                    "overall_tone": 5,
                    "notes": "Reference felt best.",
                },
                "set_2": {
                    "dynamic_feel": 4,
                    "pick_attack_clarity": 4,
                    "compression_sag": 4,
                    "overall_tone": 4,
                    "notes": "Close but slightly stiffer.",
                },
                "set_3": {
                    "dynamic_feel": 4,
                    "pick_attack_clarity": 5,
                    "compression_sag": 4,
                    "overall_tone": 4,
                    "notes": "Very solid.",
                },
            },
            "stage_rank": {"set_1": 1, "set_2": 2, "set_3": 3},
            "overall_notes": "Good overall.",
        },
    )
    write_json(
        evaluators_dir / "evaluator-E02.json",
        {
            "evaluator_id": "E02",
            "role": "engineer",
            "date": "2026-03-14",
            "developer": False,
            "familiar_with_map2": False,
            "sets": {
                "set_1": {
                    "dynamic_feel": 4,
                    "pick_attack_clarity": 4,
                    "compression_sag": 4,
                    "overall_tone": 4,
                    "notes": "Reference still won slightly.",
                },
                "set_2": {
                    "dynamic_feel": 3,
                    "pick_attack_clarity": 3,
                    "compression_sag": 3,
                    "overall_tone": 3,
                    "notes": "Map2 was acceptable.",
                },
                "set_3": {
                    "dynamic_feel": 4,
                    "pick_attack_clarity": 4,
                    "compression_sag": 4,
                    "overall_tone": 4,
                    "notes": "Competitor was consistent.",
                },
            },
            "stage_rank": {"set_1": 1, "set_2": 3, "set_3": 2},
            "overall_notes": "Useable comparison set.",
        },
    )

    output_json = tmp_path / "subjective_eval.json"
    output_markdown = tmp_path / "DYNAMIC_RESPONSE_EVIDENCE.md"

    completed = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--manifest",
            str(tmp_path / "manifest.json"),
            "--quant-summary",
            str(tmp_path / "quant-summary.json"),
            "--evaluators-dir",
            str(evaluators_dir),
            "--output-json",
            str(output_json),
            "--output-markdown",
            str(output_markdown),
        ],
        check=False,
        capture_output=True,
        text=True,
    )

    assert completed.returncode == 0, completed.stderr
    assert "Collated 2 evaluator(s)" in completed.stdout

    payload = json.loads(output_json.read_text(encoding="utf-8"))
    assert payload["evaluator_count"] == 2
    assert payload["chain_identity_map"]["set_2"] == "MAP2 NAM"
    assert payload["aggregate"]["set_2"]["dynamic_feel_mean"] == 3.5
    assert payload["aggregate_by_chain"]["Reference"]["overall_tone_mean"] == 4.5
    assert payload["phrase_verdicts"][0]["map2_verdict"] == "PASS"
    assert payload["phrase_verdicts"][1]["map2_verdict"] == "FAIL"
    assert payload["gaps"][0]["gap"].startswith("Chord swells")

    markdown = output_markdown.read_text(encoding="utf-8")
    assert "# T099 Dynamic Response Evidence" in markdown
    assert "| Single-note lead dynamics | MAP2 vs Ref | 1.25 | -0.3 | 0.7 | pass |" in markdown
    assert "| MAP2 NAM | 3.5 | 3.5 | 3.5 | 3.5 | 2.5 |" in markdown
    assert "Chord swells" in markdown
