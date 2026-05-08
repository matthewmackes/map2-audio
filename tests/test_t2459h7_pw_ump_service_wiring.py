"""T2459-H7-PW-UMP — ControllerHostService probe wiring.

Verifies that ``ControllerHostService.start()`` calls
``detect_substrate_state()`` exactly once and merges the probe's
``env_overrides`` into ``self.env_overrides`` before kicking off the
supervisor task. This is the Python-side glue that makes the C++
``main.cpp`` env-var consumer (commit ca0521e9) actually fire on
PipeWire 1.4.10+ hosts with the UMP-MIDI2 → MIDI 1.0 bridge gap.

Hermetic: we monkey-patch ``detect_substrate_state`` so the test never
touches real PipeWire. The supervisor is shut down immediately after
``start()`` returns to avoid spawning a child process.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

from app.services.controller_host_pipewire_substrate import (
    SubstrateProbeResult,
    SubstrateState,
)
from app.services.controller_host_service import (
    ControllerHostService,
    reset_controller_host_service_for_tests,
)


@pytest.fixture(autouse=True)
def _reset_singleton() -> None:
    reset_controller_host_service_for_tests()
    yield
    reset_controller_host_service_for_tests()


def _broken_probe_result() -> SubstrateProbeResult:
    return SubstrateProbeResult(
        state=SubstrateState.BROKEN_UMP_BRIDGE,
        reason="PipeWire 1.4.10 UMP-MIDI2 ALSA seq client present + 1 orphan "
               "kernel MIDI 1.0 client; forcing alsa_seq",
        pipewire_version=(1, 4, 10),
        ump_clients_seen=("PipeWire-System",),
        orphan_kernel_clients=("TSMIDI2.0",),
    )


def _healthy_probe_result() -> SubstrateProbeResult:
    return SubstrateProbeResult(
        state=SubstrateState.HEALTHY,
        reason="No broken-bridge signature detected",
    )


@pytest.mark.asyncio
async def test_start_runs_substrate_probe_and_merges_alsa_seq_when_broken(
    tmp_path: Path,
) -> None:
    # Point at a binary path that doesn't exist so the supervisor enters
    # WAITING_FOR_BINARY and never tries to spawn a child.
    svc = ControllerHostService(
        binary_path=tmp_path / "nonexistent-controller-host",
        socket_path=tmp_path / "sock",
        crash_log_path=tmp_path / "crash.log",
    )
    with patch(
        "app.services.controller_host_pipewire_substrate.detect_substrate_state",
        return_value=_broken_probe_result(),
    ) as probe_mock:
        await svc.start()
        # supervisor task started but the binary is missing — it'll loop in
        # WAITING_FOR_BINARY, so stop it before asserting.
        await svc.stop()

    probe_mock.assert_called_once()
    assert svc.env_overrides.get("MAP2_MIDI_BACKEND_FORCE") == "alsa_seq", (
        "Broken-substrate probe must inject MAP2_MIDI_BACKEND_FORCE=alsa_seq "
        "into the controller-host's spawn environment."
    )


@pytest.mark.asyncio
async def test_start_does_not_set_force_when_substrate_is_healthy(
    tmp_path: Path,
) -> None:
    svc = ControllerHostService(
        binary_path=tmp_path / "nonexistent-controller-host",
        socket_path=tmp_path / "sock",
        crash_log_path=tmp_path / "crash.log",
    )
    with patch(
        "app.services.controller_host_pipewire_substrate.detect_substrate_state",
        return_value=_healthy_probe_result(),
    ):
        await svc.start()
        await svc.stop()

    assert "MAP2_MIDI_BACKEND_FORCE" not in svc.env_overrides, (
        "Healthy substrate must not force a backend; the C++ probe order "
        "should run normally."
    )


@pytest.mark.asyncio
async def test_operator_override_wins_over_probe(tmp_path: Path) -> None:
    # Operator passed MAP2_MIDI_BACKEND_FORCE=jack_midi; the probe wants to
    # force alsa_seq. apply_to_env_overrides() is base-wins — operator wins.
    svc = ControllerHostService(
        binary_path=tmp_path / "nonexistent-controller-host",
        socket_path=tmp_path / "sock",
        crash_log_path=tmp_path / "crash.log",
        env_overrides={"MAP2_MIDI_BACKEND_FORCE": "jack_midi"},
    )
    with patch(
        "app.services.controller_host_pipewire_substrate.detect_substrate_state",
        return_value=_broken_probe_result(),
    ):
        await svc.start()
        await svc.stop()

    assert svc.env_overrides["MAP2_MIDI_BACKEND_FORCE"] == "jack_midi", (
        "Operator-supplied MAP2_MIDI_BACKEND_FORCE must win over the probe's "
        "default — apply_to_env_overrides() is base-wins."
    )


@pytest.mark.asyncio
async def test_probe_failure_is_non_fatal(tmp_path: Path) -> None:
    # If the probe raises (e.g. /proc/asound vanished, pw-cli segfaulted),
    # start() must still return successfully and the controller-host falls
    # back to its locked C++ probe order.
    svc = ControllerHostService(
        binary_path=tmp_path / "nonexistent-controller-host",
        socket_path=tmp_path / "sock",
        crash_log_path=tmp_path / "crash.log",
    )
    with patch(
        "app.services.controller_host_pipewire_substrate.detect_substrate_state",
        side_effect=RuntimeError("simulated probe explosion"),
    ):
        await svc.start()  # must not raise
        await svc.stop()

    assert "MAP2_MIDI_BACKEND_FORCE" not in svc.env_overrides
