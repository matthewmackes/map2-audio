"""Shared fixtures for midi_hub tests.

T2459-H iter-78 hard-stripped the rtmidi fallback path, so any code that calls
``discover_alsa_port_descriptors()`` now requires the ``map2-controller-host``
daemon to be reachable. The unit tests under ``tests/midi_hub/`` exercise pure
registry/binding logic and never need real ALSA enumeration — they register
``VirtualMidiPort`` instances directly into the hub. Stub the discovery call to
return an empty descriptor list so these tests run cleanly without the daemon.

If a future test needs real-or-simulated descriptors, it can monkeypatch the
fixture with its own mock at the test level.
"""

import pytest


@pytest.fixture(autouse=True)
def _stub_alsa_port_discovery(monkeypatch):
    from app.services.midi_hub import device_registry, ports

    def _empty_descriptors():
        return []

    monkeypatch.setattr(device_registry, "discover_alsa_port_descriptors", _empty_descriptors)
    monkeypatch.setattr(ports, "discover_alsa_port_descriptors", _empty_descriptors)
    yield
