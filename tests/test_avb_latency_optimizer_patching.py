from __future__ import annotations

import importlib
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


def test_apply_patches_requires_confirm_flag(tmp_path: Path) -> None:
    pkg = _load_pkg()
    models = importlib.import_module(f"{PKG_NAME}.models")

    proposal = models.PatchProposal(
        id="P999",
        title="test",
        target_path="config/test.conf",
        desired_content="x=1\n",
        reason="unit-test",
    )

    results = pkg.apply_patches([proposal], str(tmp_path), confirm_apply=False)

    assert len(results) == 1
    assert results[0].status == "fail"
    assert not (tmp_path / "config" / "test.conf").exists()
