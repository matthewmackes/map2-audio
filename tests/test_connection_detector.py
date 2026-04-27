"""T2459-G1 — connection detector unit tests.

Each detection source is exercised in isolation using injected readers
so tests run identically on a CI host with no USB / no PipeWire / no
ALSA. The "all four sources" union case proves the detector wires
matched_sources correctly when more than one source agrees.
"""

from __future__ import annotations

import dataclasses
from pathlib import Path

import pytest

from app.services.controllers.connection_detector import (
    ConnectionRecord,
    DetectionSnapshot,
    detect_connections,
)
from app.services.controllers.profile_registry import (
    DeviceProfile,
    ProfileRegistry,
)


def _make_audio_profile(
    *,
    pack_id: str = "edirol-ua",
    model: str = "ua-1000",
    document: dict | None = None,
) -> DeviceProfile:
    """Audio profile: matches via USB + alsa_card + pipewire."""
    doc = document or {
        "identity": {
            "hardware_id": "usb:0582:00ed",
            "alsa_card_regex": r"EDIROL.*UA-?1000|UA1000",
        },
        "pipewire": {"node_name": "alsa_card.usb-Roland_EDIROL_UA-1000"},
    }
    return DeviceProfile(
        pack_id=pack_id,
        model=model,
        kind="audio",
        path=Path(f"/tmp/{pack_id}/{model}.audio.yaml"),
        document=doc,
    )


def _make_midi_profile(
    *,
    pack_id: str = "edirol-ua",
    model: str = "ua-1000",
    document: dict | None = None,
) -> DeviceProfile:
    """MIDI profile: matches via alsa_client_pattern (USB hardware_id is
    optional on MIDI profiles)."""
    doc = document or {
        "identity": {
            "hardware_id": "usb:0582:00ed",
            "alsa_client_pattern": "EDIROL UA-1000",
        },
    }
    return DeviceProfile(
        pack_id=pack_id,
        model=model,
        kind="midi",
        path=Path(f"/tmp/{pack_id}/{model}.midi.yaml"),
        document=doc,
    )


def _make_profile(**kwargs):
    """Back-compat wrapper used by older test bodies — defaults to audio."""
    kind = kwargs.pop("kind", "audio")
    if kind == "midi":
        return _make_midi_profile(**kwargs)
    return _make_audio_profile(**kwargs)


@dataclasses.dataclass
class _StubRegistry:
    """Minimal duck-typed stand-in for ProfileRegistry.profiles()."""

    profile_list: list[DeviceProfile]

    def profiles(self, kind: str | None = None) -> tuple[DeviceProfile, ...]:
        if kind is None:
            return tuple(self.profile_list)
        return tuple(p for p in self.profile_list if p.kind == kind)


# ---------------------------------------------------------------------------
# 1. USB-only match
# ---------------------------------------------------------------------------


def test_detect_usb_only_match():
    profile = _make_profile()
    reg = _StubRegistry([profile])

    snap = detect_connections(
        reg,  # type: ignore[arg-type]
        usb_reader=lambda: [{"vid": "0582", "pid": "00ed", "path": "/sys/bus/usb/devices/2-1"}],
        alsa_seq_reader=lambda: [],
        alsa_card_reader=lambda: [],
        pipewire_reader=lambda: [],
    )

    assert len(snap.records) == 1
    rec = snap.records[0]
    assert rec.matched_sources == ("usb",)
    assert rec.evidence["usb"]["vid"] == "0582"
    assert rec.evidence["usb"]["pid"] == "00ed"
    assert rec.profile_key == "edirol-ua/ua-1000.audio"


# ---------------------------------------------------------------------------
# 2. ALSA seq client substring
# ---------------------------------------------------------------------------


def test_detect_alsa_seq_substring():
    profile = _make_midi_profile()
    reg = _StubRegistry([profile])

    snap = detect_connections(
        reg,  # type: ignore[arg-type]
        usb_reader=lambda: [],
        alsa_seq_reader=lambda: ["EDIROL UA-1000 MIDI 1", "Some other client"],
        alsa_card_reader=lambda: [],
        pipewire_reader=lambda: [],
    )

    assert len(snap.records) == 1
    rec = snap.records[0]
    # MIDI profile matches via USB hardware_id too is False here (USB reader
    # returned empty), so only alsa_seq fires.
    assert rec.matched_sources == ("alsa_seq",)
    assert rec.evidence["alsa_seq"]["matched_name"] == "EDIROL UA-1000 MIDI 1"


# ---------------------------------------------------------------------------
# 3. ALSA card regex
# ---------------------------------------------------------------------------


def test_detect_alsa_card_regex_match():
    profile = _make_profile()
    reg = _StubRegistry([profile])

    snap = detect_connections(
        reg,  # type: ignore[arg-type]
        usb_reader=lambda: [],
        alsa_seq_reader=lambda: [],
        alsa_card_reader=lambda: ["UA1000", "EDIROL UA-1000"],
        pipewire_reader=lambda: [],
    )

    assert len(snap.records) == 1
    assert snap.records[0].matched_sources == ("alsa_card",)


# ---------------------------------------------------------------------------
# 4. PipeWire node-name substring
# ---------------------------------------------------------------------------


def test_detect_pipewire_substring():
    profile = _make_profile()
    reg = _StubRegistry([profile])

    snap = detect_connections(
        reg,  # type: ignore[arg-type]
        usb_reader=lambda: [],
        alsa_seq_reader=lambda: [],
        alsa_card_reader=lambda: [],
        pipewire_reader=lambda: ["alsa_card.usb-Roland_EDIROL_UA-1000-00"],
    )

    assert len(snap.records) == 1
    assert snap.records[0].matched_sources == ("pipewire",)


# ---------------------------------------------------------------------------
# 5. All four sources agree → matched_sources lists all four
# ---------------------------------------------------------------------------


def test_detect_union_audio_three_sources():
    """Audio profile matches USB + alsa_card + pipewire simultaneously
    (alsa_seq is gated to MIDI profiles by ProfileRegistry contract).
    """
    profile = _make_audio_profile()
    reg = _StubRegistry([profile])

    snap = detect_connections(
        reg,  # type: ignore[arg-type]
        usb_reader=lambda: [{"vid": "0582", "pid": "00ed", "path": "/sys/foo"}],
        alsa_seq_reader=lambda: ["EDIROL UA-1000 MIDI 1"],
        alsa_card_reader=lambda: ["EDIROL UA-1000"],
        pipewire_reader=lambda: ["alsa_card.usb-Roland_EDIROL_UA-1000"],
    )

    assert len(snap.records) == 1
    rec = snap.records[0]
    assert set(rec.matched_sources) == {"usb", "alsa_card", "pipewire"}


def test_detect_union_midi_two_sources():
    """MIDI profile matches USB + alsa_seq simultaneously
    (alsa_card_regex is gated to audio profiles).
    """
    profile = _make_midi_profile()
    reg = _StubRegistry([profile])

    snap = detect_connections(
        reg,  # type: ignore[arg-type]
        usb_reader=lambda: [{"vid": "0582", "pid": "00ed", "path": "/sys/foo"}],
        alsa_seq_reader=lambda: ["EDIROL UA-1000 MIDI 1"],
        alsa_card_reader=lambda: ["EDIROL UA-1000"],
        pipewire_reader=lambda: ["alsa_card.usb-Roland_EDIROL_UA-1000"],
    )

    assert len(snap.records) == 1
    rec = snap.records[0]
    assert set(rec.matched_sources) == {"usb", "alsa_seq"}


# ---------------------------------------------------------------------------
# 6. No match → no records, snapshot still returns
# ---------------------------------------------------------------------------


def test_detect_no_match_returns_empty_snapshot():
    profile = _make_profile()
    reg = _StubRegistry([profile])

    snap = detect_connections(
        reg,  # type: ignore[arg-type]
        usb_reader=lambda: [{"vid": "ffff", "pid": "ffff", "path": "/sys/foo"}],
        alsa_seq_reader=lambda: ["Unrelated client"],
        alsa_card_reader=lambda: ["GenericUSB"],
        pipewire_reader=lambda: ["bluez_card.dont_care"],
    )

    assert len(snap.records) == 0
    assert snap.sources_attempted == ("usb", "alsa_seq", "alsa_card", "pipewire")
    assert snap.sources_failed == ()


# ---------------------------------------------------------------------------
# 7. Source-failure isolation: USB raises, others still succeed
# ---------------------------------------------------------------------------


def test_detect_source_failure_isolated():
    profile = _make_midi_profile()
    reg = _StubRegistry([profile])

    def _broken_usb():
        raise RuntimeError("simulated sysfs read failure")

    snap = detect_connections(
        reg,  # type: ignore[arg-type]
        usb_reader=_broken_usb,
        alsa_seq_reader=lambda: ["EDIROL UA-1000 MIDI 1"],
        alsa_card_reader=lambda: [],
        pipewire_reader=lambda: [],
    )

    assert "usb" in snap.sources_failed
    assert "usb" in snap.sources_attempted
    assert len(snap.records) == 1
    assert snap.records[0].matched_sources == ("alsa_seq",)


# ---------------------------------------------------------------------------
# 8. Two profiles, one matches, one doesn't
# ---------------------------------------------------------------------------


def test_detect_multi_profile_partial_match():
    p1 = _make_profile(model="ua-1000")
    p2 = _make_profile(
        model="ua-25",
        document={
            "identifier_rules": {
                "hardware_id": "usb:0582:00b9",
                "alsa_client_pattern": "UA-25",
            },
        },
    )
    reg = _StubRegistry([p1, p2])

    snap = detect_connections(
        reg,  # type: ignore[arg-type]
        usb_reader=lambda: [{"vid": "0582", "pid": "00ed", "path": "/sys/foo"}],
        alsa_seq_reader=lambda: [],
        alsa_card_reader=lambda: [],
        pipewire_reader=lambda: [],
    )

    assert len(snap.records) == 1
    assert snap.records[0].model == "ua-1000"


# ---------------------------------------------------------------------------
# 9. Only-some-sources enabled
# ---------------------------------------------------------------------------


def test_detect_with_subset_of_sources():
    profile = _make_midi_profile()
    reg = _StubRegistry([profile])

    snap = detect_connections(
        reg,  # type: ignore[arg-type]
        enabled_sources=["alsa_seq"],
        usb_reader=lambda: [{"vid": "0582", "pid": "00ed", "path": "/sys/foo"}],
        alsa_seq_reader=lambda: ["EDIROL UA-1000 MIDI 1"],
        alsa_card_reader=lambda: ["EDIROL UA-1000"],
        pipewire_reader=lambda: ["alsa_card.usb-Roland_EDIROL_UA-1000"],
    )

    assert snap.sources_attempted == ("alsa_seq",)
    assert len(snap.records) == 1
    # USB would have matched too, but it was not run.
    assert snap.records[0].matched_sources == ("alsa_seq",)


# ---------------------------------------------------------------------------
# 10. Real ProfileRegistry integration (loads device-packs/)
# ---------------------------------------------------------------------------


def test_detect_against_real_registry_smoke():
    """Smoke test: detector runs without crashing against the live
    device-packs/ tree, with all readers returning empty lists.
    """
    repo_root = Path(__file__).resolve().parents[1]
    reg = ProfileRegistry(packs_root=repo_root / "device-packs")
    reg.load_packs()

    snap = detect_connections(
        reg,
        usb_reader=lambda: [],
        alsa_seq_reader=lambda: [],
        alsa_card_reader=lambda: [],
        pipewire_reader=lambda: [],
    )
    assert isinstance(snap, DetectionSnapshot)
    assert snap.records == ()
    assert snap.sources_attempted == ("usb", "alsa_seq", "alsa_card", "pipewire")
