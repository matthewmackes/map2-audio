from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "generate_backend_contract.py"
SPEC = importlib.util.spec_from_file_location("generate_backend_contract", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def test_extract_env_reads_from_source_and_parse_systemd_environment():
    source = """
import os
FLAG = os.getenv('MAP2_FLAG', 'true')
TOKEN = os.environ.get('SPECIAL_MODE_PASSWORD')
"""
    reads = MODULE.extract_env_reads_from_source(source, "sample.py")
    assert reads == [
        {
            "default": "'true'",
            "file": "sample.py",
            "kind": "os.getenv",
            "line": 3,
            "variable": "MAP2_FLAG",
        },
        {
            "default": None,
            "file": "sample.py",
            "kind": "os.environ.get",
            "line": 4,
            "variable": "SPECIAL_MODE_PASSWORD",
        },
    ]

    service = """
[Service]
Environment=\"MAP2_ENABLE_LCD=false\"
Environment=\"PIPEWIRE_LATENCY=64/48000\"
EnvironmentFile=-/etc/map2/environment
"""
    parsed = MODULE.parse_systemd_environment(service)
    assert parsed["environment_files"] == ["-/etc/map2/environment"]
    assert parsed["inline_environment"] == [
        {"name": "MAP2_ENABLE_LCD", "value": "false"},
        {"name": "PIPEWIRE_LATENCY", "value": "64/48000"},
    ]


def test_build_runtime_manifest_lines_contains_core_packages():
    lines = MODULE.build_runtime_manifest_lines()
    joined = "\n".join(lines)
    assert "fastapi>=0.128.0,<0.129.0" in joined
    assert "uvicorn>=0.40.0,<0.41.0" in joined
    assert "jack-client>=0.5.5,<0.6.0" in joined
    assert "python-rtmidi>=1.5.8,<2.0.0" in joined
