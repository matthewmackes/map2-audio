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


def test_extract_avb_config_parses_numeric_and_feature_signals(tmp_path: Path) -> None:
    pkg = _load_pkg()

    (tmp_path / "config").mkdir()
    (tmp_path / "config" / "avb.conf").write_text(
        """
        sample_rate = 48000
        buffer_size = 128
        hop_count = 2
        presentation_offset_ms = 0.5
        enable gptp
        use msrp reservation
        802.1Qav cbs qdisc
        """,
        encoding="utf-8",
    )

    scan = pkg.scan_codebase(str(tmp_path), max_files=30)
    extracted = pkg.extract_avb_config(scan)

    assert extracted.features["gptp_sync"].present is True
    assert extracted.features["stream_reservation"].present is True
    assert extracted.features["credit_based_shaping"].present is True
    assert int(extracted.numeric["sample_rate_hz"]) == 48000
    assert int(extracted.numeric["buffer_size_samples"]) == 128
