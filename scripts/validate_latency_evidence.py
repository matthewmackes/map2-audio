#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SCHEMA = REPO_ROOT / "docs" / "evaluation" / "latency-evidence-schema.json"


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _parse_datetime(value: str) -> bool:
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        return True
    except ValueError:
        return False


def _validate_node(schema: dict[str, Any], value: Any, path: str, errors: list[str]) -> None:
    expected_type = schema.get("type")
    if expected_type == "object":
        if not isinstance(value, dict):
            errors.append(f"{path}: expected object, got {type(value).__name__}")
            return

        required = schema.get("required", [])
        for key in required:
            if key not in value:
                errors.append(f"{path}: missing required property '{key}'")

        properties = schema.get("properties", {})
        additional_allowed = schema.get("additionalProperties", True)
        if additional_allowed is False:
            for key in value.keys():
                if key not in properties:
                    errors.append(f"{path}: unexpected property '{key}'")

        for key, child_schema in properties.items():
            if key not in value:
                continue
            child_path = f"{path}.{key}" if path else key
            _validate_node(child_schema, value[key], child_path, errors)
        return

    if expected_type == "array":
        if not isinstance(value, list):
            errors.append(f"{path}: expected array, got {type(value).__name__}")
            return
        min_items = schema.get("minItems")
        if isinstance(min_items, int) and len(value) < min_items:
            errors.append(f"{path}: expected at least {min_items} items, got {len(value)}")
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for idx, item in enumerate(value):
                _validate_node(item_schema, item, f"{path}[{idx}]", errors)
        return

    if expected_type == "string":
        if not isinstance(value, str):
            errors.append(f"{path}: expected string, got {type(value).__name__}")
            return
        min_length = schema.get("minLength")
        if isinstance(min_length, int) and len(value) < min_length:
            errors.append(f"{path}: expected minLength {min_length}, got {len(value)}")
        if schema.get("format") == "date-time" and not _parse_datetime(value):
            errors.append(f"{path}: expected ISO8601 date-time string, got '{value}'")
        enum = schema.get("enum")
        if isinstance(enum, list) and value not in enum:
            errors.append(f"{path}: expected one of {enum}, got '{value}'")
        return

    if expected_type == "integer":
        if not (isinstance(value, int) and not isinstance(value, bool)):
            errors.append(f"{path}: expected integer, got {type(value).__name__}")
            return
        minimum = schema.get("minimum")
        if _is_number(minimum) and value < minimum:
            errors.append(f"{path}: expected minimum {minimum}, got {value}")
        maximum = schema.get("maximum")
        if _is_number(maximum) and value > maximum:
            errors.append(f"{path}: expected maximum {maximum}, got {value}")
        return

    if expected_type == "number":
        if not _is_number(value):
            errors.append(f"{path}: expected number, got {type(value).__name__}")
            return
        minimum = schema.get("minimum")
        if _is_number(minimum) and value < minimum:
            errors.append(f"{path}: expected minimum {minimum}, got {value}")
        maximum = schema.get("maximum")
        if _is_number(maximum) and value > maximum:
            errors.append(f"{path}: expected maximum {maximum}, got {value}")
        return

    if expected_type == "boolean":
        if not isinstance(value, bool):
            errors.append(f"{path}: expected boolean, got {type(value).__name__}")
        return

    enum = schema.get("enum")
    if isinstance(enum, list) and value not in enum:
        errors.append(f"{path}: expected one of {enum}, got {value!r}")


def _load_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise SystemExit(f"File not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Invalid JSON in {path}: {exc}") from exc


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate MAP2 latency evidence against schema.")
    parser.add_argument("--evidence", type=Path, required=True, help="Path to latency evidence JSON file.")
    parser.add_argument("--schema", type=Path, default=DEFAULT_SCHEMA, help="Path to schema JSON file.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    schema = _load_json(args.schema)
    evidence = _load_json(args.evidence)

    errors: list[str] = []
    _validate_node(schema, evidence, "", errors)

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1

    print(f"valid: {args.evidence}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
