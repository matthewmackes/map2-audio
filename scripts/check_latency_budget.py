#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BUDGET = REPO_ROOT / "docs" / "latency-budget.json"


@dataclass(frozen=True)
class RuleResult:
    metric: str
    operator: str
    threshold: float | int
    value: float | int
    passed: bool
    reason: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "metric": self.metric,
            "operator": self.operator,
            "threshold": self.threshold,
            "value": self.value,
            "passed": self.passed,
            "reason": self.reason,
        }


def compare(operator: str, value: float | int, threshold: float | int) -> bool:
    if operator == "eq":
        return value == threshold
    if operator == "le":
        return value <= threshold
    if operator == "ge":
        return value >= threshold
    raise ValueError(f"Unsupported operator: {operator}")


def evaluate_budget(budget: dict[str, Any], evidence: dict[str, Any]) -> dict[str, Any]:
    scope = evidence["scope"]
    scope_budget = budget["scopes"][scope]
    metrics = evidence["metrics"]
    results = []
    for rule in scope_budget["rules"]:
        metric = rule["metric"]
        if metric not in metrics:
            raise KeyError(f"Evidence for scope {scope!r} is missing required metric {metric!r}")
        value = metrics[metric]
        passed = compare(rule["operator"], value, rule["threshold"])
        results.append(
            RuleResult(
                metric=metric,
                operator=rule["operator"],
                threshold=rule["threshold"],
                value=value,
                passed=passed,
                reason=rule["reason"],
            )
        )
    passed = all(item.passed for item in results)
    return {
        "scope": scope,
        "passed": passed,
        "results": [item.as_dict() for item in results],
        "source": evidence.get("source"),
    }


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Check a latency evidence artifact against the MAP2 latency budget.")
    parser.add_argument("--budget", type=Path, default=DEFAULT_BUDGET)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--summary-out", type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    budget = load_json(args.budget)
    evidence = load_json(args.evidence)
    summary = evaluate_budget(budget, evidence)
    if args.summary_out is not None:
        args.summary_out.parent.mkdir(parents=True, exist_ok=True)
        args.summary_out.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(
        f"scope={summary['scope']} passed={summary['passed']} source={summary.get('source') or 'unknown'}"
    )
    return 0 if summary["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
