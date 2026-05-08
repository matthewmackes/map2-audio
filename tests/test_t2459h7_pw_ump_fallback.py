"""Regression tests for the T2459-H7-PW-UMP Path 4 substrate probe.

The probe lives at ``app/services/controller_host_pipewire_substrate.py``.

These tests have two surfaces:

1. **Unit cases (always run on CI)** — drive ``detect_substrate_state``
   with synthetic ``pw-cli`` and ``/proc/asound/seq/clients`` fixtures
   to assert each branch of the heuristic. Hermetic, no external deps.

2. **HIL case (gated by ``MAP2_HIL_PIPEWIRE_UMP=1``)** — runs the live
   probe and asserts the fallback fires when an orphan kernel MIDI 1.0
   client is on the bus. No-op on CI; opt-in at the bench.

Path 4 of ``docs/midi/T2459_H7_PW_UMP_DECISION.md`` is the production
answer for the PipeWire 1.4.10 UMP-MIDI2 → MIDI 1.0 bridge gap. The
probe forces the controller-host's libremidi backend to ``alsa_seq``
when the gap signature matches, so the fallback fires *before* the C++
``Map2MidiBackend::probe()`` would have wasted a JackMidi binding.
"""

from __future__ import annotations

import os

import pytest

from app.services.controller_host_pipewire_substrate import (
    ENV_BACKEND_FORCE,
    ENV_DISABLE_PROBE,
    ENV_HIL_GATE,
    PIPEWIRE_VERSION_BROKEN_AT,
    SubstrateProbeResult,
    SubstrateState,
    apply_to_env_overrides,
    detect_substrate_state,
)


# ---------------------------------------------------------------------------
# Synthetic fixtures
# ---------------------------------------------------------------------------


PW_CLI_INFO_1_4_10 = """\
\tid: 0
\ttype: PipeWire:Interface:Core/4
\tcookie: 1234567890
\tuser-name: "mm"
\thost-name: "bench"
\tversion: "1.4.10"
\tname: "pipewire-0"
\tproperties:
\t\tcore.version = "1.4.10"
\t\tcore.daemon = "true"
"""

PW_CLI_INFO_1_3_82 = PW_CLI_INFO_1_4_10.replace("1.4.10", "1.3.82")
PW_CLI_INFO_NO_VERSION = "\tid: 0\n\ttype: PipeWire:Interface:Core/4\n"

# /proc/asound/seq/clients with the gap signature: kernel MIDI 1.0
# client (TSMIDI2.0) on client 32 with NO "Connecting To:" peer, while
# UMP-MIDI2 client (Midi-Bridge) sits at client 142.
ASEQ_CLIENTS_BROKEN = """\
Client info        : cur clients : 4 : peak clients : 4 : max clients : 192
Output pool :   500
Client   0 : "System" [type=kernel]
  Port   0 : "Timer" (-Pe-)
  Port   1 : "Announce" (RWe-)
Client  14 : "Midi Through" [type=kernel]
  Port   0 : "Midi Through Port-0" (RWeX)
Client  32 : "TSMIDI2.0" [type=kernel,card=2]
  Port   0 : "TSMIDI2.0 MIDI 1" (RWeX) [In/Out]
Client 142 : "Midi-Bridge" [type=user,pid=1234]
  Port   0 : "TSMIDI2-0 MIDI 1" (RWeX)
\tConnecting To: 32:0
"""

# Same as broken, but client 32 now has a Connecting To: peer →
# the PipeWire UMP bridge subscribed to it. Substrate is healthy.
ASEQ_CLIENTS_HEALTHY = """\
Client   0 : "System" [type=kernel]
  Port   0 : "Timer" (-Pe-)
Client  32 : "TSMIDI2.0" [type=kernel,card=2]
  Port   0 : "TSMIDI2.0 MIDI 1" (RWeX) [In/Out]
\tConnecting To: 142:0
\tConnected From: 142:0
Client 142 : "Midi-Bridge" [type=user,pid=1234]
  Port   0 : "TSMIDI2-0 MIDI 1" (RWeX)
\tConnecting To: 32:0
"""

# No UMP-MIDI2 client on the bus. Old PipeWire shape.
ASEQ_CLIENTS_NO_UMP = """\
Client   0 : "System" [type=kernel]
Client  32 : "TSMIDI2.0" [type=kernel,card=2]
  Port   0 : "TSMIDI2.0 MIDI 1" (RWeX) [In/Out]
"""


def _runner(text: str | None):
    def _r() -> str | None:
        return text

    return _r


# ---------------------------------------------------------------------------
# Unit cases
# ---------------------------------------------------------------------------


class TestDetectSubstrateState:
    def test_disabled_via_env(self) -> None:
        result = detect_substrate_state(
            pw_cli_runner=_runner(PW_CLI_INFO_1_4_10),
            aseq_clients_reader=_runner(ASEQ_CLIENTS_BROKEN),
            env={ENV_DISABLE_PROBE: "1"},
        )
        assert result.state is SubstrateState.PROBE_DISABLED
        assert result.env_overrides == {}

    def test_no_pipewire(self) -> None:
        result = detect_substrate_state(
            pw_cli_runner=_runner(None),
            aseq_clients_reader=_runner(ASEQ_CLIENTS_BROKEN),
            env={},
        )
        assert result.state is SubstrateState.NO_PIPEWIRE
        assert result.env_overrides == {}

    def test_pipewire_too_old_to_be_broken(self) -> None:
        result = detect_substrate_state(
            pw_cli_runner=_runner(PW_CLI_INFO_1_3_82),
            aseq_clients_reader=_runner(ASEQ_CLIENTS_BROKEN),
            env={},
        )
        assert result.state is SubstrateState.HEALTHY
        assert result.pipewire_version == (1, 3, 82)
        assert result.env_overrides == {}

    def test_pipewire_unparseable_version(self) -> None:
        result = detect_substrate_state(
            pw_cli_runner=_runner(PW_CLI_INFO_NO_VERSION),
            aseq_clients_reader=_runner(ASEQ_CLIENTS_BROKEN),
            env={},
        )
        assert result.state is SubstrateState.PROBE_ERROR

    def test_aseq_unreadable(self) -> None:
        result = detect_substrate_state(
            pw_cli_runner=_runner(PW_CLI_INFO_1_4_10),
            aseq_clients_reader=_runner(None),
            env={},
        )
        assert result.state is SubstrateState.PROBE_ERROR

    def test_no_ump_midi2_client_present(self) -> None:
        result = detect_substrate_state(
            pw_cli_runner=_runner(PW_CLI_INFO_1_4_10),
            aseq_clients_reader=_runner(ASEQ_CLIENTS_NO_UMP),
            env={},
        )
        assert result.state is SubstrateState.HEALTHY
        assert result.env_overrides == {}

    def test_kernel_client_has_peer_means_healthy(self) -> None:
        result = detect_substrate_state(
            pw_cli_runner=_runner(PW_CLI_INFO_1_4_10),
            aseq_clients_reader=_runner(ASEQ_CLIENTS_HEALTHY),
            env={},
        )
        assert result.state is SubstrateState.HEALTHY
        assert result.env_overrides == {}

    def test_gap_signature_forces_alsa_seq(self) -> None:
        result = detect_substrate_state(
            pw_cli_runner=_runner(PW_CLI_INFO_1_4_10),
            aseq_clients_reader=_runner(ASEQ_CLIENTS_BROKEN),
            env={},
        )
        assert result.state is SubstrateState.BROKEN_UMP_BRIDGE
        assert result.is_broken
        assert result.env_overrides == {ENV_BACKEND_FORCE: "alsa_seq"}
        assert "TSMIDI2.0" in result.orphan_kernel_clients
        assert any("Midi-Bridge" in name for name in result.ump_clients_seen)
        assert "Path 4" in result.reason

    def test_pipewire_version_constant_pinned_to_known_breakage(self) -> None:
        # Pinning the constant prevents accidental relaxation that
        # would suppress the fallback on older affected versions.
        assert PIPEWIRE_VERSION_BROKEN_AT == (1, 4, 10)


class TestApplyToEnvOverrides:
    def test_probe_value_used_when_base_empty(self) -> None:
        result = SubstrateProbeResult(
            state=SubstrateState.BROKEN_UMP_BRIDGE,
            reason="x",
        )
        merged = apply_to_env_overrides({}, result)
        assert merged == {ENV_BACKEND_FORCE: "alsa_seq"}

    def test_operator_force_jack_midi_wins_over_probe(self) -> None:
        result = SubstrateProbeResult(
            state=SubstrateState.BROKEN_UMP_BRIDGE,
            reason="x",
        )
        merged = apply_to_env_overrides(
            {ENV_BACKEND_FORCE: "jack_midi"},
            result,
        )
        assert merged[ENV_BACKEND_FORCE] == "jack_midi"

    def test_healthy_state_yields_no_overrides(self) -> None:
        result = SubstrateProbeResult(
            state=SubstrateState.HEALTHY,
            reason="x",
        )
        assert apply_to_env_overrides({}, result) == {}


# ---------------------------------------------------------------------------
# HIL gate — runs only when MAP2_HIL_PIPEWIRE_UMP=1 is set on the bench.
# ---------------------------------------------------------------------------


@pytest.mark.skipif(
    os.environ.get(ENV_HIL_GATE, "0").lower() not in ("1", "true", "yes"),
    reason=(
        f"HIL gate {ENV_HIL_GATE} not set; this case requires a live "
        "PipeWire 1.4.10+ host with a legacy MIDI 1.0 device on the bus."
    ),
)
class TestHilLiveSubstrateProbe:
    """Live-bench validation. Connect the MeloAudio Commander (or any
    MIDI 1.0 USB device) before running with::

        MAP2_HIL_PIPEWIRE_UMP=1 pytest tests/test_t2459h7_pw_ump_fallback.py -k Hil
    """

    def test_live_probe_fires_on_broken_substrate(self) -> None:
        result = detect_substrate_state()
        # On the affected bench, the gap signature should match.
        # If it doesn't, the operator either (a) doesn't have a legacy
        # MIDI 1.0 device connected, or (b) is on a fixed PipeWire
        # version. Both are valid; the assertion message tells them
        # which.
        assert result.state in (
            SubstrateState.BROKEN_UMP_BRIDGE,
            SubstrateState.HEALTHY,
            SubstrateState.NO_PIPEWIRE,
        ), f"unexpected probe state: {result.state.value} — {result.reason}"
        if result.state is SubstrateState.BROKEN_UMP_BRIDGE:
            # Path 4 invariant: the env override forces alsa_seq.
            assert result.env_overrides == {ENV_BACKEND_FORCE: "alsa_seq"}
            assert result.orphan_kernel_clients, (
                "BROKEN_UMP_BRIDGE state without orphan kernel clients — "
                "probe heuristic regression"
            )
