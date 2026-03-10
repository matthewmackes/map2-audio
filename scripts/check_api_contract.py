#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
import warnings
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

REQUIRED_DOCS = {
    "contract_standards": REPO_ROOT / "docs" / "api-contract-standards.md",
    "event_catalog": REPO_ROOT / "docs" / "api-event-catalog.md",
}
REQUIRED_CONTRACT_EXAMPLE_MARKERS = [
    "## Example: engine",
    "## Example: midi",
    "## Example: tesira",
    "## Example: cluster",
    "## Example: avb",
]
REQUIRED_EVENT_MARKERS = [
    "## Topic: midi_activity",
    "## Topic: meters",
    "## Topic: pipewire_metrics",
    "## Topic: mpx1",
    "## Topic: tesira:device_state",
]
HTTP_METHODS = {"delete", "get", "head", "options", "patch", "post", "put", "trace"}
DEFAULT_OUTPUT = REPO_ROOT / "docs" / "evaluation" / "api-contract-lint.json"


def load_app() -> Any:
    from app.main import app
    app.openapi_schema = None
    return app


def lint_contract() -> dict[str, Any]:
    app = load_app()
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        schema = app.openapi()

    operations = []
    missing_500 = []
    missing_503 = []
    for path, path_item in sorted(schema.get("paths", {}).items()):
        for method, operation in sorted(path_item.items()):
            if method not in HTTP_METHODS:
                continue
            operations.append({"method": method.upper(), "path": path})
            responses = operation.get("responses") or {}
            if "500" not in responses:
                missing_500.append({"method": method.upper(), "path": path})
            if "503" not in responses:
                missing_503.append({"method": method.upper(), "path": path})

    warnings_list = [str(item.message) for item in caught]
    duplicate_operation_id_warnings = [message for message in warnings_list if "Duplicate Operation ID" in message]
    api_error_present = "ApiError" in ((schema.get("components") or {}).get("schemas") or {})

    doc_checks = {}
    for name, path in REQUIRED_DOCS.items():
        text = path.read_text(encoding="utf-8") if path.exists() else ""
        doc_checks[name] = {
            "path": str(path.relative_to(REPO_ROOT)),
            "exists": path.exists(),
            "markers": REQUIRED_CONTRACT_EXAMPLE_MARKERS if name == "contract_standards" else REQUIRED_EVENT_MARKERS,
            "missing_markers": [
                marker
                for marker in (REQUIRED_CONTRACT_EXAMPLE_MARKERS if name == "contract_standards" else REQUIRED_EVENT_MARKERS)
                if marker not in text
            ],
        }

    passed = (
        api_error_present
        and not duplicate_operation_id_warnings
        and not missing_500
        and not missing_503
        and all(check["exists"] and not check["missing_markers"] for check in doc_checks.values())
    )

    return {
        "summary": {
            "api_error_schema_present": api_error_present,
            "duplicate_operation_id_warning_count": len(duplicate_operation_id_warnings),
            "http_operation_count": len(operations),
            "missing_500_count": len(missing_500),
            "missing_503_count": len(missing_503),
            "passed": passed,
        },
        "duplicate_operation_id_warnings": duplicate_operation_id_warnings,
        "docs": doc_checks,
        "missing_500": missing_500,
        "missing_503": missing_503,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Lint MAP2 API contract rules and documentation.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    result = lint_contract()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(
        "API contract lint: "
        f"passed={result['summary']['passed']} "
        f"duplicate_warnings={result['summary']['duplicate_operation_id_warning_count']} "
        f"missing_500={result['summary']['missing_500_count']} "
        f"missing_503={result['summary']['missing_503_count']}"
    )
    return 0 if result["summary"]["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
