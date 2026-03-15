from __future__ import annotations

import importlib.util
from pathlib import Path
import sys


PKG_NAME = "avb_latency_optimizer_testpkg"


def _load_pkg():
    if PKG_NAME in sys.modules:
        return sys.modules[PKG_NAME]

    repo_root = Path(__file__).resolve().parents[1]
    pkg_dir = repo_root / "scripts" / "avb_latency_optimizer"
    spec = importlib.util.spec_from_file_location(
        PKG_NAME,
        pkg_dir / "__init__.py",
        submodule_search_locations=[str(pkg_dir)],
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[PKG_NAME] = module
    spec.loader.exec_module(module)
    return module


def test_verification_accepts_tcpdump_as_packet_capture_tool(tmp_path: Path, monkeypatch) -> None:
    pkg = _load_pkg()
    verification = sys.modules[f"{PKG_NAME}.verification"]

    def fake_which(name: str):
        if name == "tcpdump":
            return "/usr/bin/tcpdump"
        return None

    def fake_run(command: list[str], timeout_sec: int = 30):
        if command[:2] == ["tcpdump", "--version"]:
            return 0, "tcpdump version 4.99"
        return 0, "ok"

    monkeypatch.setattr(verification.shutil, "which", fake_which)
    monkeypatch.setattr(verification, "_run_command", fake_run)

    results = pkg.run_verification_tests(str(tmp_path))
    packet_check = next(result for result in results if result.id == "V004")

    assert packet_check.status == "pass"
    assert packet_check.command == "tcpdump --version"
