#!/usr/bin/env python3
"""Audit live plugin inventory parity and parameter schema coverage."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import urlopen


REPO_ROOT = Path(__file__).resolve().parents[1]
DEPLOYMENT_TESIRA_URI = "map2://tesira/avb-node"


def _normalize_parameter_key(raw_value: str, fallback: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", raw_value.strip().lower()).strip("-")
    return normalized or fallback


def _fetch_json(base_url: str, path: str) -> dict[str, Any]:
    url = f"{base_url.rstrip('/')}{path}"
    try:
        with urlopen(url, timeout=15) as response:
            return json.load(response)
    except HTTPError as exc:
        raise SystemExit(f"{path} returned HTTP {exc.code}") from exc
    except URLError as exc:
        raise SystemExit(f"Failed to reach {url}: {exc.reason}") from exc


def _load_declared_uris() -> set[str]:
    juce_processors = json.loads((REPO_ROOT / "app/deployment/juce_processors.json").read_text())
    default_lv2_effects = json.loads((REPO_ROOT / "app/deployment/default_lv2_effects.json").read_text())

    uris = {
        entry["uri"]
        for entry in [*juce_processors.get("processors", []), *default_lv2_effects.get("plugins", [])]
        if entry.get("uri") and entry.get("uri") != DEPLOYMENT_TESIRA_URI
    }
    return uris


def _schema_key(plugin: dict[str, Any], parameter: dict[str, Any]) -> str:
    index = int(parameter.get("index", 0))
    raw_key = str(parameter.get("symbol") or parameter.get("name") or "").strip()
    return f"{plugin['uri']}:{_normalize_parameter_key(raw_key, f'param-{index}')}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:8080", help="MAP2 backend base URL")
    args = parser.parse_args()

    discovery = _fetch_json(args.base_url, "/api/plugins/discover")
    schema_payload = _fetch_json(args.base_url, "/api/plugins/parameter-schema")

    runtime_plugins = [
        plugin for plugin in discovery.get("plugins", [])
        if plugin.get("uri") != DEPLOYMENT_TESIRA_URI and str(plugin.get("format", "")).upper() in {"JUCE", "LV2"}
    ]
    runtime_uris = {plugin["uri"] for plugin in runtime_plugins if plugin.get("uri")}
    declared_uris = _load_declared_uris()

    missing_schema_keys = []
    for plugin in runtime_plugins:
        for parameter in plugin.get("parameters", []):
            key = _schema_key(plugin, parameter)
            if key not in schema_payload.get("schema", {}):
                missing_schema_keys.append(key)

    report = {
        "base_url": args.base_url.rstrip("/"),
        "runtime_plugin_count": len(runtime_uris),
        "declared_plugin_count": len(declared_uris),
        "runtime_missing_declared": sorted(declared_uris - runtime_uris),
        "runtime_unexpected": sorted(runtime_uris - declared_uris),
        "missing_schema_keys": missing_schema_keys,
        "schema_count": int(schema_payload.get("count", 0)),
    }

    print(json.dumps(report, indent=2, sort_keys=True))

    if report["runtime_missing_declared"] or report["runtime_unexpected"] or report["missing_schema_keys"]:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
