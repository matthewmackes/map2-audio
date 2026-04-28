from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
RUNTIME_JS = REPO_ROOT / "device-packs" / "_runtime" / "sysex-tags.js"


def _node_available() -> bool:
    try:
        out = subprocess.run(["node", "--version"], capture_output=True, text=True, check=False)
    except FileNotFoundError:
        return False
    return out.returncode == 0


def _run_js_eval(expression: str) -> list[str]:
    script = f"""
const fs = require("fs");
const vm = require("vm");
const source = fs.readFileSync("{RUNTIME_JS}", "utf8");
const sandbox = {{ globalThis: {{}} }};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const result = {expression};
process.stdout.write(JSON.stringify(result));
"""
    result = subprocess.run(
        ["node", "-e", script],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise AssertionError(result.stderr.strip() or "node execution failed")
    return json.loads(result.stdout)


@pytest.mark.skipif(not _node_available(), reason="node not available on PATH")
def test_runtime_js_mpx1_rules_preserve_flange_semantics() -> None:
    tags = _run_js_eval(
        "sandbox.globalThis.MAP2SysexTags.autoTagFromName("
        "\"Wide Flange Chorus\", sandbox.globalThis.MAP2SysexTags.buildMpx1TagRules())"
    )
    assert "flange" in tags
    assert "chorus" in tags


@pytest.mark.skipif(not _node_available(), reason="node not available on PATH")
def test_runtime_js_intelfx_rules_preserve_hush_and_flanger_semantics() -> None:
    tags = _run_js_eval(
        "sandbox.globalThis.MAP2SysexTags.autoTagFromName("
        "\"Noise Hush Flange\", sandbox.globalThis.MAP2SysexTags.buildIntelfxTagRules())"
    )
    assert "hush" in tags
    assert "noise_reduction" in tags
    assert "flanger" in tags


@pytest.mark.skipif(not _node_available(), reason="node not available on PATH")
def test_runtime_js_deduplicates_tags() -> None:
    tags = _run_js_eval(
        "sandbox.globalThis.MAP2SysexTags.autoTagFromName("
        "\"Plate Plate\", sandbox.globalThis.MAP2SysexTags.buildMpx1TagRules())"
    )
    assert tags.count("plate") == 1
