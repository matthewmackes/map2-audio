"""Node-backed facade onto `device-packs/_runtime/sysex-tags.js`.

Worklist: T2459-H4 (MPX-1 SysEx parser tag-extraction migration to device-pack
JS runtime). Routes tag-map compile + auto-tag-from-name through the canonical
JS surface so Python parsers can be migrated incrementally behind a feature
flag. Output is bit-identical to the Python `sysex_tags` module by design
(parity proven in `tests/test_sysex_tags_runtime_js_t2459h4.py`).
"""

from __future__ import annotations

import functools
import json
import os
import re
import subprocess
from pathlib import Path
from typing import Iterable

from app.services.sysex_tags import TagMap


_REPO_ROOT = Path(__file__).resolve().parents[2]
_RUNTIME_JS = _REPO_ROOT / "device-packs" / "_runtime" / "sysex-tags.js"

_FLAG_ENV_VAR = "MAP2_SYSEX_PARSER_USE_JS_RUNTIME"
_TRUTHY = {"1", "true", "yes", "on"}


class SysexJsRuntimeError(RuntimeError):
    """Raised when the Node subprocess fails to evaluate the JS runtime."""


def is_sysex_parser_js_runtime_enabled() -> bool:
    raw = os.environ.get(_FLAG_ENV_VAR, "")
    return raw.strip().lower() in _TRUTHY


def _run_node(expression: str) -> object:
    """Evaluate *expression* against the loaded JS runtime, returning JSON."""
    if not _RUNTIME_JS.is_file():
        raise SysexJsRuntimeError(
            f"sysex-tags.js runtime not found at {_RUNTIME_JS}"
        )
    script = (
        'const fs = require("fs");\n'
        'const vm = require("vm");\n'
        f'const source = fs.readFileSync({json.dumps(str(_RUNTIME_JS))}, "utf8");\n'
        'const sandbox = { globalThis: {} };\n'
        'vm.createContext(sandbox);\n'
        'vm.runInContext(source, sandbox);\n'
        f'const result = {expression};\n'
        'process.stdout.write(JSON.stringify(result));\n'
    )
    try:
        proc = subprocess.run(
            ["node", "-e", script],
            capture_output=True,
            text=True,
            check=False,
        )
    except FileNotFoundError as exc:
        raise SysexJsRuntimeError("node executable not found on PATH") from exc
    if proc.returncode != 0:
        raise SysexJsRuntimeError(
            proc.stderr.strip() or f"node exited {proc.returncode}"
        )
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise SysexJsRuntimeError(
            f"invalid JSON from node: {proc.stdout!r}"
        ) from exc


def _specs_to_tag_map(specs: Iterable[tuple[str, list[str]]]) -> TagMap:
    return [(re.compile(pattern, re.I), list(tags)) for pattern, tags in specs]


@functools.lru_cache(maxsize=1)
def compile_mpx1_tag_map_via_js() -> TagMap:
    """Compile the MPX-1 tag map via the device-pack JS runtime.

    Returns the same `(re.Pattern, list[str])` shape as
    `app.services.sysex_tags.compile_mpx1_tag_map()` so it is a drop-in
    replacement.
    """
    raw = _run_node(
        "sandbox.globalThis.MAP2SysexTags.buildMpx1TagRules()"
        ".map(function (r) { return [r.pattern.source, r.tags]; })"
    )
    if not isinstance(raw, list):
        raise SysexJsRuntimeError(f"unexpected payload shape: {type(raw)!r}")
    return _specs_to_tag_map(raw)


def auto_tag_from_name_via_js(name: str, parser: str) -> list[str]:
    """Auto-tag *name* via the JS runtime for *parser* in {"mpx1","intelfx"}."""
    if parser == "mpx1":
        builder = "buildMpx1TagRules"
    elif parser == "intelfx":
        builder = "buildIntelfxTagRules"
    else:
        raise ValueError(f"unknown parser flavor: {parser!r}")
    expr = (
        "sandbox.globalThis.MAP2SysexTags.autoTagFromName("
        f"{json.dumps(name)}, sandbox.globalThis.MAP2SysexTags.{builder}())"
    )
    raw = _run_node(expr)
    if not isinstance(raw, list):
        raise SysexJsRuntimeError(f"unexpected payload shape: {type(raw)!r}")
    return [str(tag) for tag in raw]
