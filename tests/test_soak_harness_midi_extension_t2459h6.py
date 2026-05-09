"""T2459-H6 — soak-harness MIDI extension CLI/argument tests.

Validates the new `--midi-driver`, `--midi-controller-key`,
`--midi-rate-events-per-sec`, `--midi-message-mix`, `--midi-host-socket`,
and `--soak-tag` flags added to the JUCE random-FX soak script. We do
not run the soak itself here — these are unit-level checks that the
flags parse, defaults preserve legacy behavior, and the helper driver
class is wired to MidiHostClient.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]
SOAK_SCRIPT = (
    REPO_ROOT
    / ".codex"
    / "skills"
    / "juce-random-effects-soak"
    / "scripts"
    / "run_juce_random_fx_soak.py"
)


_SOAK_MOD_NAME = "_soak_t2459h6_under_test"


def _load_soak_module():
    if _SOAK_MOD_NAME in sys.modules:
        return sys.modules[_SOAK_MOD_NAME]
    spec = importlib.util.spec_from_file_location(
        _SOAK_MOD_NAME, SOAK_SCRIPT
    )
    module = importlib.util.module_from_spec(spec)
    # Register in sys.modules BEFORE exec so dataclass decorators can
    # resolve their own __module__ during class construction.
    sys.modules[_SOAK_MOD_NAME] = module
    assert spec.loader is not None
    try:
        spec.loader.exec_module(module)
    except Exception:
        sys.modules.pop(_SOAK_MOD_NAME, None)
        raise
    return module


def test_soak_script_exists() -> None:
    assert SOAK_SCRIPT.exists(), f"missing soak script: {SOAK_SCRIPT}"


def test_midi_flags_default_preserves_legacy_behavior(monkeypatch: pytest.MonkeyPatch) -> None:
    soak = _load_soak_module()
    monkeypatch.setattr(sys, "argv", ["soak"])
    args = soak.parse_args(REPO_ROOT)
    assert args.midi_driver == "none"
    assert args.midi_controller_key == "soak-driver"
    assert args.midi_rate_events_per_sec == float(soak.DEFAULT_MIDI_RATE_EVENTS_PER_SEC)
    assert args.midi_message_mix == "mixed"
    assert args.midi_host_socket is None
    assert args.soak_tag == ""


def test_midi_flags_accept_host_driver_and_overrides(monkeypatch: pytest.MonkeyPatch) -> None:
    soak = _load_soak_module()
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "soak",
            "--midi-driver", "host",
            "--midi-controller-key", "bench-h6",
            "--midi-rate-events-per-sec", "60",
            "--midi-message-mix", "clock",
            "--midi-host-socket", "/tmp/test-controller-host.sock",
            "--soak-tag", "t2459h6-shm-ring",
        ],
    )
    args = soak.parse_args(REPO_ROOT)
    assert args.midi_driver == "host"
    assert args.midi_controller_key == "bench-h6"
    assert args.midi_rate_events_per_sec == 60.0
    assert args.midi_message_mix == "clock"
    assert args.midi_host_socket == Path("/tmp/test-controller-host.sock")
    assert args.soak_tag == "t2459h6-shm-ring"


def test_midi_message_mix_choices_are_locked() -> None:
    soak = _load_soak_module()
    assert soak.MIDI_MESSAGE_MIX_CHOICES == ("note", "cc", "clock", "mixed")
    assert soak.MIDI_DRIVER_CHOICES == ("none", "host")


def test_invalid_midi_driver_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    soak = _load_soak_module()
    monkeypatch.setattr(sys, "argv", ["soak", "--midi-driver", "totally-bogus"])
    with pytest.raises(SystemExit):
        soak.parse_args(REPO_ROOT)


def test_host_driver_class_uses_midi_host_client() -> None:
    """The driver must reach MidiHostClient when start() is called.

    We do not actually connect — we monkeypatch the import inside the
    class to confirm the contract: open_midi_input is invoked with the
    configured controller_key and the background thread is started.
    """
    soak = _load_soak_module()
    driver = soak.HostMidiSoakDriver(
        controller_key="probe",
        rate_events_per_sec=1000.0,
        message_mix="cc",
        socket_path=None,
    )

    calls: dict[str, object] = {}

    class _StubClient:
        def __init__(self, socket_path=None):
            calls["socket_path"] = socket_path

        def open_midi_input(self, *, controller_key: str, port_id: str) -> str:
            calls["open"] = (controller_key, port_id)
            return "msg-id-stub"

        def send_ump(self, *, controller_key: str, packet_bytes: bytes) -> str:
            calls.setdefault("sends", []).append((controller_key, bytes(packet_bytes)))  # type: ignore[union-attr]
            return "send-id-stub"

    stub_module = type(sys)("app.services.midi_host_client")
    stub_module.MidiHostClient = _StubClient  # type: ignore[attr-defined]
    sys.modules["app.services.midi_host_client"] = stub_module
    try:
        driver.start()
        # Let the loop fire at least once.
        import time
        for _ in range(50):
            if driver.events_pushed > 0:
                break
            time.sleep(0.01)
        driver.stop()
    finally:
        sys.modules.pop("app.services.midi_host_client", None)

    assert calls.get("open") == ("probe", "virtual:probe")
    assert driver.events_pushed >= 1
    stats = driver.stats()
    assert stats["controller_key"] == "probe"
    assert stats["events_pushed"] >= 1
    assert stats["error_count"] == 0
