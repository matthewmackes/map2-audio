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


def test_latency_budget_estimate_uses_expected_components(tmp_path: Path) -> None:
    pkg = _load_pkg()

    (tmp_path / "cfg.txt").write_text(
        """
        sample_rate: 48000
        buffer_size: 128
        hop_count: 2
        presentation_offset_ms: 0.5
        gptp enabled
        802.1qav cbs
        """,
        encoding="utf-8",
    )

    scan = pkg.scan_codebase(str(tmp_path), max_files=10)
    extracted = pkg.extract_avb_config(scan)
    budget = pkg.estimate_latency_budget(extracted)

    assert abs(budget.worst_case_ms - 6.1833) < 0.08
    assert budget.optimized_target_ms < budget.worst_case_ms
    assert 0.45 <= budget.confidence <= 0.95
