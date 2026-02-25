#!/usr/bin/env python3
"""Validate the MPX1 parameter registry schema and basic integrity gates."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


REQUIRED_FIELDS = {
    "id",
    "address_bytes",
    "display_name",
    "block",
    "algorithm",
    "type",
    "range",
    "default",
    "units",
    "log_taper",
    "widget",
    "page",
    "realtime_safe",
    "panel_control",
}

ALLOWED_TYPES = {
    "bool",
    "enum",
    "int16",
    "string",
    "uint8",
    "uint16",
}

MIN_PARAM_COUNT = 200


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _registry_path() -> Path:
    return _repo_root() / "app" / "data" / "mpx1_params.json"


def _validate_range(param: dict[str, Any], errors: list[str]) -> None:
    param_id = str(param.get("id", "<unknown>"))
    value_range = param.get("range")
    if not isinstance(value_range, dict):
        errors.append(f"{param_id}: range must be an object")
        return

    minimum = value_range.get("min")
    maximum = value_range.get("max")
    if minimum is None or maximum is None:
        errors.append(f"{param_id}: range must include min/max")
        return

    if not isinstance(minimum, (int, float)) or not isinstance(maximum, (int, float)):
        errors.append(f"{param_id}: range min/max must be numeric")
        return

    if minimum > maximum:
        errors.append(f"{param_id}: range min must be <= max")
        return

    default = param.get("default")
    ptype = param.get("type")
    if ptype == "string":
        if not isinstance(default, str):
            errors.append(f"{param_id}: string default must be str")
            return
        if len(default) > int(maximum):
            errors.append(f"{param_id}: default string exceeds max length")
        return

    if not isinstance(default, (int, float)):
        errors.append(f"{param_id}: default must be numeric for type={ptype}")
        return

    if default < minimum or default > maximum:
        errors.append(f"{param_id}: default {default} outside range [{minimum}, {maximum}]")


def _validate_alg_slot_coverage(registry: dict[str, Any], params: list[dict[str, Any]], errors: list[str]) -> None:
    coverage = registry.get("coverage", {})
    slot_map = coverage.get("algorithm_slot_coverage")
    if not isinstance(slot_map, dict):
        errors.append("coverage.algorithm_slot_coverage must be an object")
        return

    by_id = {str(p.get("id")): p for p in params}

    for block, slot_range in slot_map.items():
        if not isinstance(slot_range, str) or ".." not in slot_range:
            errors.append(f"coverage range for block={block!r} must look like '0..N'")
            continue

        lower_raw, upper_raw = slot_range.split("..", maxsplit=1)
        try:
            lower = int(lower_raw)
            upper = int(upper_raw)
        except ValueError:
            errors.append(f"coverage range for block={block!r} has non-integer bounds")
            continue

        selector_id = f"program.{block}.algorithm"
        if selector_id not in by_id:
            errors.append(f"missing selector parameter: {selector_id}")

        for algorithm_index in range(lower, upper + 1):
            algorithm_id = f"alg_{algorithm_index:02d}"
            for control in ("mix", "level", "bypass"):
                pid = f"{block}.{algorithm_id}.{control}"
                if pid not in by_id:
                    errors.append(f"missing scaffold parameter: {pid}")


def validate_registry(path: Path | None = None) -> list[str]:
    registry_path = path or _registry_path()
    errors: list[str] = []

    if not registry_path.exists():
        return [f"registry file not found: {registry_path}"]

    try:
        registry = json.loads(registry_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return [f"invalid JSON: {exc}"]

    if not isinstance(registry, dict):
        return ["registry root must be a JSON object"]

    required_top_level = {
        "schema_version",
        "device",
        "source_documents",
        "coverage",
        "modifier_matrix",
        "program_management",
        "params",
    }
    missing_top_level = sorted(required_top_level - set(registry.keys()))
    if missing_top_level:
        errors.append(f"missing top-level keys: {missing_top_level}")

    source_documents = registry.get("source_documents")
    if not isinstance(source_documents, list) or not source_documents:
        errors.append("source_documents must be a non-empty list")

    coverage = registry.get("coverage", {})
    status = coverage.get("status")
    if status not in {"bootstrap_partial", "complete"}:
        errors.append("coverage.status must be 'bootstrap_partial' or 'complete'")

    params = registry.get("params")
    if not isinstance(params, list):
        errors.append("params must be a list")
        return errors

    if len(params) < MIN_PARAM_COUNT:
        errors.append(f"params count {len(params)} below threshold {MIN_PARAM_COUNT}")

    ids: set[str] = set()
    addresses: set[tuple[int, int, int, int]] = set()

    for index, param in enumerate(params):
        if not isinstance(param, dict):
            errors.append(f"params[{index}] must be an object")
            continue

        param_id = str(param.get("id", f"<missing-{index}>"))

        missing = sorted(REQUIRED_FIELDS - set(param.keys()))
        if missing:
            errors.append(f"{param_id}: missing required fields {missing}")

        if param_id in ids:
            errors.append(f"duplicate id: {param_id}")
        ids.add(param_id)

        address = param.get("address_bytes")
        if not isinstance(address, list) or len(address) != 4:
            errors.append(f"{param_id}: address_bytes must be a 4-item list")
        else:
            if not all(isinstance(v, int) and 0 <= v <= 0xFFFF for v in address):
                errors.append(f"{param_id}: address_bytes values must be uint16 integers")
            address_key = tuple(int(v) for v in address)
            if address_key in addresses:
                errors.append(f"duplicate address_bytes: {address_key}")
            addresses.add(address_key)

        ptype = param.get("type")
        if ptype not in ALLOWED_TYPES:
            errors.append(f"{param_id}: unsupported type {ptype!r}")

        if not isinstance(param.get("display_name"), str) or not param["display_name"].strip():
            errors.append(f"{param_id}: display_name must be non-empty string")

        if not isinstance(param.get("block"), str) or not param["block"].strip():
            errors.append(f"{param_id}: block must be non-empty string")

        if not isinstance(param.get("algorithm"), str) or not param["algorithm"].strip():
            errors.append(f"{param_id}: algorithm must be non-empty string")

        if not isinstance(param.get("log_taper"), bool):
            errors.append(f"{param_id}: log_taper must be bool")

        if not isinstance(param.get("realtime_safe"), bool):
            errors.append(f"{param_id}: realtime_safe must be bool")

        _validate_range(param, errors)

    _validate_alg_slot_coverage(registry, params, errors)

    return errors


def test_validate_mpx1_registry() -> None:
    errors = validate_registry()
    assert not errors, "\n".join(errors)


def main() -> int:
    errors = validate_registry()
    if errors:
        print("MPX1 registry validation FAILED")
        for err in errors:
            print(f"- {err}")
        return 1

    print(f"MPX1 registry validation PASS ({_registry_path()})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
