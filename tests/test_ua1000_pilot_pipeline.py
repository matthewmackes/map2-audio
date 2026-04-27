"""End-to-end integration test for the UA-1000 onboard MIDI bridge.

T2459-B4 acceptance gate. Drives the controller subsystem from
ProfileRegistry pack discovery through MappingDescriptor load through
fast-path/JS dispatch decisions, all in Python (the C++ Map2MidiController
is exercised by the C++ Catch2 suite).

Flow:
  1. ProfileRegistry loads device-packs/edirol-ua/.
  2. ControllerService.load_mapping("edirol-ua", "ua-1000", "midi") →
     MappingDescriptor with two control rows:
        - CC 64 fast_path=True   → audio.chain.1.bypass.toggle
        - CC 7  script           → UA1000Mapping.masterVolume
  3. Synthesize an inbound MIDI byte stream, classify each row by
     fast_path, assert the right action emerges.
"""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest

from app.services.controllers import (
    ControllerService,
    MappingFileHandler,
    MappingRegistry,
    ProfileRegistry,
)
from app.services.controllers.mapping_file_handler import MappingControl


REPO_ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def ua_service() -> ControllerService:
    """ControllerService backed by the real device-packs/ tree."""
    pr = ProfileRegistry(packs_root=REPO_ROOT / "device-packs")
    svc = ControllerService(profile_registry=pr,
                            mapping_registry=MappingRegistry(),
                            mapping_file_handler=MappingFileHandler())
    svc.start()
    return svc


def test_edirol_ua_pack_loads(ua_service: ControllerService) -> None:
    """The Edirol UA pack appears in ProfileRegistry."""
    packs = ua_service.list_packs()
    pack_ids = {p["pack_id"] for p in packs}
    assert "edirol-ua" in pack_ids

    pack = next(p for p in packs if p["pack_id"] == "edirol-ua")
    assert pack["vendor_name"] == "Edirol (Roland)"
    assert "ua-1000" in pack["models"]
    assert pack["is_degraded"] is False


def test_ua1000_audio_profile_resolves_by_hardware_id(ua_service: ControllerService) -> None:
    matches = ua_service.resolve_for_hardware_id("usb:0582:00ed")
    assert any(m["model"] == "ua-1000" and m["kind"] == "audio" for m in matches)


def test_ua1000_midi_profile_resolves_by_alsa_client(ua_service: ControllerService) -> None:
    matches = ua_service.resolve_for_alsa_client("UA-1000 MIDI:0")
    assert any(m["model"] == "ua-1000" and m["kind"] == "midi" for m in matches)


def test_ua1000_audio_profile_declares_loopback_ports(ua_service: ControllerService) -> None:
    """The path-c "Measure latency" GUI button (T2459-E4) needs the
    profile to declare loopback_ports for AUX0.
    """
    detail = ua_service.get_profile("edirol-ua", "ua-1000", "audio")
    assert detail is not None
    doc = detail["document"]
    assert doc["loopback_ports"]["playback"] == "EDIROL UA-1000 Pro:playback_AUX0"
    assert doc["loopback_ports"]["capture"] == "EDIROL UA-1000 Pro:capture_AUX0"


def test_ua1000_midi_profile_has_pedal_fast_path_binding(ua_service: ControllerService) -> None:
    """The acceptance gate: a fast-path CC 64 row exists, targets
    audio.chain.1.bypass with action=toggle.
    """
    descriptor = ua_service.load_mapping("edirol-ua", "ua-1000", "midi")
    fast_path_rows = [c for c in descriptor.controls if c.fast_path]
    assert len(fast_path_rows) >= 1, (
        "Expected at least one fast_path: true binding in ua-1000.midi.yaml; "
        "found none."
    )
    pedal = next(c for c in fast_path_rows if c.midino == 64)
    assert pedal.status == 0xB0
    assert pedal.target == "audio.chain.1.bypass"
    assert pedal.action == "toggle"


def test_ua1000_midi_profile_has_master_volume_js_binding(
    ua_service: ControllerService,
) -> None:
    """CC 7 routes through the JS slow path."""
    descriptor = ua_service.load_mapping("edirol-ua", "ua-1000", "midi")
    cc7 = next(c for c in descriptor.controls if c.midino == 7)
    assert cc7.fast_path is False
    assert cc7.script == "UA1000Mapping.masterVolume"
    assert cc7.target is None


def test_ua1000_midi_profile_program_change_recalls_snapshot(
    ua_service: ControllerService,
) -> None:
    descriptor = ua_service.load_mapping("edirol-ua", "ua-1000", "midi")
    pc_row = next(c for c in descriptor.controls if c.status == 0xC0)
    assert pc_row.target == "audio.snapshot.recall"
    assert pc_row.action == "send_pc"


def test_ua1000_midi_profile_has_pedal_led_output(ua_service: ControllerService) -> None:
    descriptor = ua_service.load_mapping("edirol-ua", "ua-1000", "midi")
    led = next(c for c in descriptor.outputs if c.midino == 64)
    assert led.target == "audio.chain.1.bypass"


def test_ua1000_midi_profile_has_mixxx_alias_table(ua_service: ControllerService) -> None:
    descriptor = ua_service.load_mapping("edirol-ua", "ua-1000", "midi")
    alias = descriptor.mixxx_alias_table
    assert alias.get("[Channel1]") == "audio.chain.1"
    assert alias.get("[Master]") == "audio.master"


def test_ua1000_pack_scripts_file_exists() -> None:
    """The scripts: reference resolves to a real JS file."""
    js = REPO_ROOT / "device-packs" / "edirol-ua" / "scripts" / "ua-1000-scripts.js"
    assert js.exists()
    body = js.read_text()
    assert "UA1000Mapping" in body
    assert "masterVolume" in body


def test_ua1000_pack_scripts_file_declares_global_shim() -> None:
    """The QuickJS dispatcher looks up globals by qualified name. The
    script must hoist UA1000Mapping.masterVolume onto globalThis with
    the dotted name so the IPC dispatcher can find it.
    """
    js = REPO_ROOT / "device-packs" / "edirol-ua" / "scripts" / "ua-1000-scripts.js"
    body = js.read_text()
    assert "globalThis['UA1000Mapping.masterVolume']" in body


# ---------------------------------------------------------------------------
# Synthesized end-to-end MIDI dispatch — the Mixxx-style integration
# pattern. We classify inbound rows manually here; T2459-B2-followup
# adds the IPC dispatcher that does this in-process inside controller-
# host.
# ---------------------------------------------------------------------------

def _classify_inbound(
    descriptor_controls: tuple[MappingControl, ...],
    status: int,
    midino: int | None,
) -> tuple[str, MappingControl | None]:
    """Returns ("fast_path", row), ("js", row), ("unmapped", None)."""
    for row in descriptor_controls:
        if row.status != status:
            continue
        if row.midino is not None and row.midino != midino:
            continue
        return ("fast_path" if row.fast_path else "js", row)
    return ("unmapped", None)


def test_synthesized_pedal_press_classifies_as_fast_path(
    ua_service: ControllerService,
) -> None:
    descriptor = ua_service.load_mapping("edirol-ua", "ua-1000", "midi")
    # Pedal CC 64 with value 0x7F (pressed).
    kind, row = _classify_inbound(descriptor.controls, status=0xB0, midino=64)
    assert kind == "fast_path"
    assert row is not None
    assert row.target == "audio.chain.1.bypass"


def test_synthesized_cc7_classifies_as_js(ua_service: ControllerService) -> None:
    descriptor = ua_service.load_mapping("edirol-ua", "ua-1000", "midi")
    kind, row = _classify_inbound(descriptor.controls, status=0xB0, midino=7)
    assert kind == "js"
    assert row is not None
    assert row.script == "UA1000Mapping.masterVolume"


def test_synthesized_unknown_cc_is_unmapped(ua_service: ControllerService) -> None:
    descriptor = ua_service.load_mapping("edirol-ua", "ua-1000", "midi")
    kind, row = _classify_inbound(descriptor.controls, status=0xB0, midino=99)
    assert kind == "unmapped"
    assert row is None


def test_assign_active_mapping_e2e(ua_service: ControllerService) -> None:
    """Assigning the UA-1000 mapping to a controller key surfaces it
    in the active-mappings list — the surface the controller-host
    supervisor hands to its IPC clients.
    """
    descriptor = ua_service.load_mapping("edirol-ua", "ua-1000", "midi")
    ua_service.assign_mapping("alsa-seq:UA-1000 MIDI:0", descriptor)
    active = ua_service.active_mappings()
    assert any(
        m["controller_key"] == "alsa-seq:UA-1000 MIDI:0"
        and m["pack_id"] == "edirol-ua"
        and m["model"] == "ua-1000"
        for m in active
    )
    ua_service.clear_mapping("alsa-seq:UA-1000 MIDI:0")
