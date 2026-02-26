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


def test_scan_codebase_detects_avb_keywords(tmp_path: Path) -> None:
    pkg = _load_pkg()

    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "engine.cpp").write_text(
        "// AVB talker path\nconst char* s = \"gPTP 802.1AS\";\n",
        encoding="utf-8",
    )
    (tmp_path / "README.md").write_text("No keywords here\n", encoding="utf-8")

    result = pkg.scan_codebase(str(tmp_path), max_files=20)

    assert result.total_files_scanned >= 2
    assert any(match.keyword in {"avb", "gptp", "802.1as"} for match in result.matches)


def test_scan_codebase_keeps_default_excludes_when_custom_excludes_passed(tmp_path: Path) -> None:
    pkg = _load_pkg()

    (tmp_path / ".venv").mkdir()
    (tmp_path / ".venv" / "ignore.txt").write_text("avb should not be scanned\n", encoding="utf-8")
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "ok.txt").write_text("avb should be scanned\n", encoding="utf-8")

    result = pkg.scan_codebase(str(tmp_path), max_files=20, exclude_dirs=["custom-only"])

    assert all(not path.startswith(".venv/") for path in result.scanned_files)
    assert any(path == "src/ok.txt" for path in result.scanned_files)
