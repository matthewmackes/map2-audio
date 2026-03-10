from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "check_latency_budget.py"
SPEC = importlib.util.spec_from_file_location("check_latency_budget", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def test_evaluate_budget_pass_and_fail_cases():
    budget = {
        "scopes": {
            "release-smoke": {
                "rules": [
                    {"metric": "steady_state_xruns", "operator": "le", "threshold": 0, "reason": "no xruns"},
                    {"metric": "sample_rate_hz", "operator": "eq", "threshold": 48000, "reason": "canonical rate"},
                ]
            }
        }
    }
    passing = {
        "scope": "release-smoke",
        "source": "unit-test",
        "metrics": {"steady_state_xruns": 0, "sample_rate_hz": 48000},
    }
    failing = {
        "scope": "release-smoke",
        "source": "unit-test",
        "metrics": {"steady_state_xruns": 2, "sample_rate_hz": 48000},
    }

    passing_summary = MODULE.evaluate_budget(budget, passing)
    failing_summary = MODULE.evaluate_budget(budget, failing)

    assert passing_summary["passed"] is True
    assert failing_summary["passed"] is False
    assert passing_summary["results"][0]["metric"] == "steady_state_xruns"


def test_compare_supports_eq_le_and_ge():
    assert MODULE.compare("eq", 64, 64) is True
    assert MODULE.compare("le", 64, 64) is True
    assert MODULE.compare("ge", 64, 32) is True
