"""T2454 hardening — tests for the memory-pressure cap helper.

Covers PSI-primary path, free-ratio fallback, ultimate fallback, and
edge cases (empty PSI line, malformed PSI, psutil missing).
"""

from __future__ import annotations

import builtins
from unittest.mock import patch

from app.services.snapshot import preload_memory_pressure as mp


# ---------- PSI scoring ----------


def test_psi_heavy_returns_floor_cap():
    assert mp.compute_cap_from_psi(15.0) == mp.HARD_FLOOR_CAP
    assert mp.compute_cap_from_psi(10.0) == mp.HARD_FLOOR_CAP


def test_psi_medium_returns_three():
    assert mp.compute_cap_from_psi(7.5) == 3
    assert mp.compute_cap_from_psi(5.0) == 3


def test_psi_light_returns_four():
    assert mp.compute_cap_from_psi(3.0) == 4
    assert mp.compute_cap_from_psi(1.0) == 4


def test_psi_idle_returns_ceiling():
    assert mp.compute_cap_from_psi(0.0) == mp.HARD_CEILING_CAP
    assert mp.compute_cap_from_psi(0.5) == mp.HARD_CEILING_CAP


# ---------- Free-ratio fallback ----------


def test_free_ratio_below_floor_returns_floor_cap():
    assert mp.compute_cap_from_free_ratio(0.05) == mp.HARD_FLOOR_CAP
    assert mp.compute_cap_from_free_ratio(0.10) == mp.HARD_FLOOR_CAP


def test_free_ratio_above_ceiling_returns_ceiling_cap():
    assert mp.compute_cap_from_free_ratio(0.50) == mp.HARD_CEILING_CAP
    assert mp.compute_cap_from_free_ratio(0.95) == mp.HARD_CEILING_CAP


def test_free_ratio_smooth_interp():
    # Midpoint and quarter-points — banker's rounding may pick either of
    # adjacent integers exactly at the half, so accept the band.
    assert mp.compute_cap_from_free_ratio(0.25) in (3, 4)
    assert mp.compute_cap_from_free_ratio(0.20) in (2, 3)
    assert mp.compute_cap_from_free_ratio(0.30) in (3, 4, 5)
    # Monotonic — more free RAM never returns a lower cap.
    caps = [mp.compute_cap_from_free_ratio(r) for r in (0.10, 0.20, 0.30, 0.40)]
    assert caps == sorted(caps)


# ---------- Reading PSI ----------


def test_read_psi_some_avg10_parses_real_format(tmp_path, monkeypatch):
    psi_file = tmp_path / "memory"
    psi_file.write_text(
        "some avg10=12.34 avg60=5.67 avg300=2.10 total=123456789\n"
        "full avg10=8.00 avg60=4.00 avg300=1.50 total=98765432\n"
    )
    monkeypatch.setattr(mp, "PSI_PATH", str(psi_file))
    monkeypatch.setattr(mp, "_psi_unavailable_logged", False)
    assert mp.read_psi_some_avg10() == 12.34


def test_read_psi_returns_none_on_missing_file(tmp_path, monkeypatch):
    psi_file = tmp_path / "missing-memory-pressure"
    monkeypatch.setattr(mp, "PSI_PATH", str(psi_file))
    monkeypatch.setattr(mp, "_psi_unavailable_logged", False)
    assert mp.read_psi_some_avg10() is None


def test_read_psi_returns_none_on_malformed(tmp_path, monkeypatch):
    psi_file = tmp_path / "memory"
    psi_file.write_text("garbage line\nsome avg10=NaN avg60=1.0\n")
    monkeypatch.setattr(mp, "PSI_PATH", str(psi_file))
    monkeypatch.setattr(mp, "_psi_unavailable_logged", False)
    assert mp.read_psi_some_avg10() is None


# ---------- compute_warm_cap() integration ----------


def test_compute_warm_cap_uses_psi_primary(monkeypatch):
    monkeypatch.setattr(mp, "read_psi_some_avg10", lambda: 12.0)
    monkeypatch.setattr(mp, "read_free_ratio", lambda: 0.50)  # would say "ceiling"
    snapshot = mp.compute_warm_cap()
    # PSI heavy wins, even though free-ratio is generous.
    assert snapshot.cap == mp.HARD_FLOOR_CAP
    assert snapshot.source == "psi"
    assert snapshot.psi_avg10 == 12.0
    assert snapshot.free_ratio is None


def test_compute_warm_cap_falls_back_to_free_ratio_when_psi_missing(monkeypatch):
    monkeypatch.setattr(mp, "read_psi_some_avg10", lambda: None)
    monkeypatch.setattr(mp, "read_free_ratio", lambda: 0.50)
    snapshot = mp.compute_warm_cap()
    assert snapshot.cap == mp.HARD_CEILING_CAP
    assert snapshot.source == "free_ratio"
    assert snapshot.psi_avg10 is None
    assert snapshot.free_ratio == 0.50


def test_compute_warm_cap_returns_ceiling_when_both_signals_missing(monkeypatch):
    monkeypatch.setattr(mp, "read_psi_some_avg10", lambda: None)
    monkeypatch.setattr(mp, "read_free_ratio", lambda: None)
    snapshot = mp.compute_warm_cap()
    assert snapshot.cap == mp.HARD_CEILING_CAP
    assert snapshot.source == "fallback_default"
    assert snapshot.psi_avg10 is None
    assert snapshot.free_ratio is None


def test_read_free_ratio_returns_none_when_psutil_missing(monkeypatch):
    """If psutil isn't installed, the fallback signal degrades cleanly."""
    real_import = builtins.__import__

    def faked_import(name, *args, **kwargs):
        if name == "psutil":
            raise ImportError("psutil not installed for this test")
        return real_import(name, *args, **kwargs)

    with patch("builtins.__import__", side_effect=faked_import):
        assert mp.read_free_ratio() is None
