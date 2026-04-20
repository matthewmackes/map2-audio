from types import SimpleNamespace

import pytest

import app.services.audio_io as audio_io_module
from app.services.audio_io import AudioBackendUnavailableError, RealAudioIOManager


def test_get_devices_raises_when_backend_unavailable(monkeypatch):
    """Device enumeration fails explicitly when sounddevice is unavailable."""
    monkeypatch.setattr(audio_io_module, "SOUNDDEVICE_AVAILABLE", False)
    manager = RealAudioIOManager(enable_watchdog=False, enable_signal_detection=False)

    with pytest.raises(AudioBackendUnavailableError, match="sounddevice is unavailable"):
        manager.get_devices()


def test_get_devices_wraps_sounddevice_query_failures(monkeypatch):
    """Device enumeration wraps backend query failures in the dedicated error."""
    def raise_query_error():
        raise RuntimeError("backend offline")

    monkeypatch.setattr(audio_io_module, "SOUNDDEVICE_AVAILABLE", True)
    monkeypatch.setattr(
        audio_io_module,
        "sd",
        SimpleNamespace(query_devices=raise_query_error),
        raising=False,
    )
    manager = RealAudioIOManager(enable_watchdog=False, enable_signal_detection=False)

    with pytest.raises(AudioBackendUnavailableError, match="backend offline"):
        manager.get_devices()


def test_get_devices_maps_explicit_sounddevice_fixture(monkeypatch):
    """Tests that need device data provide explicit fixtures instead of stubs."""
    monkeypatch.setattr(audio_io_module, "SOUNDDEVICE_AVAILABLE", True)
    monkeypatch.setattr(
        audio_io_module,
        "sd",
        SimpleNamespace(
            query_devices=lambda: [
                {
                    "name": "Fixture USB Interface",
                    "max_input_channels": 2,
                    "max_output_channels": 2,
                    "default_samplerate": 48000,
                    "default_low_output_latency": 0.003,
                    "default_low_input_latency": 0.002,
                }
            ]
        ),
        raising=False,
    )
    manager = RealAudioIOManager(enable_watchdog=False, enable_signal_detection=False)

    devices = manager.get_devices()

    assert len(devices) == 1
    assert devices[0].name == "Fixture USB Interface"
    assert devices[0].channels_in == 2
    assert devices[0].channels_out == 2
    assert devices[0].latency_ms == pytest.approx(5.0)
