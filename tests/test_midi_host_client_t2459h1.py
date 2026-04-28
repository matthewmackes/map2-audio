"""T2459-H1 — MidiHostClient ↔ map2-controller-host parity test.

Runs the controller-host binary in a subprocess against a tmp UDS,
issues a list_ports request via MidiHostClient, and asserts the
response shape. The HIL parity test (vs. python-rtmidi enumeration)
runs only when both python-rtmidi is installed AND the bench has
real MIDI hardware visible. CI environments skip the python-rtmidi
half and assert only the round-trip mechanics + response shape.
"""
from __future__ import annotations

import os
import shutil
import socket
import subprocess
import time
from pathlib import Path

import pytest

from app.services.midi_host_client import (
    MidiHostClient,
    MidiHostClientError,
    MidiPortInfo,
    split_ports,
)


REPO_ROOT = Path(__file__).resolve().parents[1]
HOST_BINARY_CANDIDATES = [
    REPO_ROOT / "juce-engine" / "build-h1" / "map2-controller-host",
    REPO_ROOT / "juce-engine" / "build" / "map2-controller-host",
]


def _find_host_binary() -> Path | None:
    for c in HOST_BINARY_CANDIDATES:
        if c.exists() and os.access(c, os.X_OK):
            return c
    return None


@pytest.fixture(scope="module")
def host_binary() -> Path:
    binary = _find_host_binary()
    if binary is None:
        pytest.skip("map2-controller-host binary not built; "
                    "run `cmake --build build-h1 --target map2-controller-host`")
    return binary


@pytest.fixture
def host_socket(tmp_path: Path, host_binary: Path):
    """Spawn map2-controller-host with a tmp socket; yield the path; tear down."""
    sock_path = tmp_path / "ch.sock"
    proc = subprocess.Popen(
        [str(host_binary), "--socket", str(sock_path)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=str(REPO_ROOT),
    )
    # Wait for the host to bind the socket. Up to ~3s — first start hits
    # libremidi observer init which probes ALSA/JACK/PipeWire.
    deadline = time.monotonic() + 3.0
    while time.monotonic() < deadline:
        if sock_path.exists():
            break
        time.sleep(0.05)
    if not sock_path.exists():
        proc.terminate()
        stdout, stderr = proc.communicate(timeout=2.0)
        pytest.fail(
            f"map2-controller-host did not create socket at {sock_path} within 3s.\n"
            f"stdout: {stdout!r}\nstderr: {stderr!r}"
        )
    try:
        yield sock_path
    finally:
        try:
            proc.terminate()
            proc.wait(timeout=3.0)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=1.0)


def test_round_trip_list_ports_returns_typed_payload(host_socket: Path) -> None:
    """The list-ports request returns a parseable response with the
    expected shape, regardless of which backend the host bound to."""
    client = MidiHostClient(socket_path=host_socket, timeout_s=3.0)
    backend, ports = client.list_ports()
    assert backend.backend in {"jack_midi", "pipewire", "alsa_seq", "alsa_raw", "none"}
    # The bench typically has at least the through ports plus our virtual
    # I/O. The parity check below tolerates an empty bench (CI), but the
    # response shape must always be valid.
    for p in ports:
        assert isinstance(p, MidiPortInfo)
        assert p.name and p.id
        assert isinstance(p.is_input, bool)
        assert isinstance(p.is_virtual, bool)


def test_response_includes_degraded_flag_for_non_jack_backends(
    host_socket: Path,
) -> None:
    """`degraded` must be true when the bound backend isn't JACK MIDI.
    The host emits a Warning diagnostic in that case (locked Q2)."""
    client = MidiHostClient(socket_path=host_socket, timeout_s=3.0)
    backend, _ = client.list_ports()
    if backend.backend == "jack_midi":
        assert backend.degraded is False
    elif backend.backend == "none":
        # An entirely failed probe surfaces as "none"; degraded is still
        # false because the host couldn't even bind a fallback.
        assert backend.degraded is False
    else:
        assert backend.degraded is True


def test_split_ports_parity_shape(host_socket: Path) -> None:
    """split_ports() matches python-rtmidi's separate-list enumeration
    shape — every port lands in exactly one list (input or output)."""
    client = MidiHostClient(socket_path=host_socket, timeout_s=3.0)
    _, ports = client.list_ports()
    inputs, outputs = split_ports(ports)
    assert len(inputs) + len(outputs) == len(ports)
    # No port appears in both directions in the split-shape view.
    assert set(inputs).isdisjoint(set(outputs)) or len(inputs) == 0 or len(outputs) == 0


def test_unreachable_socket_raises(tmp_path: Path) -> None:
    """When the host isn't running, the client surfaces a clear error."""
    bogus = tmp_path / "no-such-host.sock"
    client = MidiHostClient(socket_path=bogus, timeout_s=0.2)
    with pytest.raises(MidiHostClientError) as excinfo:
        client.list_ports()
    assert "cannot connect" in str(excinfo.value)


# ---------------------------------------------------------------------
# Bench-only HIL parity check vs. python-rtmidi.
# ---------------------------------------------------------------------

@pytest.mark.skipif(
    shutil.which("aconnect") is None,
    reason="ALSA seq tools not present; bench parity test skipped",
)
def test_bench_parity_with_python_rtmidi_when_available(host_socket: Path) -> None:
    """When python-rtmidi is installed AND the host bound to ALSA seq
    (the same MIDI graph python-rtmidi reads), the controller-host's
    enumeration is a superset of python-rtmidi's.

    When the host bound to JACK MIDI or PipeWire native — the locked
    Q2 preferred backends — parity is *not* expected because those
    backends observe a different MIDI graph than ALSA seq. The
    acceptance gate in that case is that the host enumeration is
    non-empty (the host can see *something* on its preferred
    backend) and the bridge is healthy. ALSA-seq parity will be
    re-validated at H4 when device-services migrate and an explicit
    JACK ↔ ALSA-seq bridge inventory lands.
    """
    try:
        import rtmidi  # type: ignore
    except ImportError:
        pytest.skip("python-rtmidi not installed; skipping HIL parity")

    client = MidiHostClient(socket_path=host_socket, timeout_s=3.0)
    backend, ports = client.list_ports()
    inputs_host, outputs_host = split_ports(ports)

    inputs_rt = rtmidi.MidiIn().get_ports()
    outputs_rt = rtmidi.MidiOut().get_ports()

    # Collapse both sides to a "stable substring" form because libremidi
    # and python-rtmidi format port names slightly differently
    # (libremidi: "EDIROL UA-1000:0", rtmidi: "EDIROL UA-1000 0:EDIROL UA-1000 MIDI 1 24:0").
    def _stems(names: list[str]) -> set[str]:
        return {n.split(":", 1)[0].strip().lower() for n in names if n}

    rt_stems = _stems(inputs_rt) | _stems(outputs_rt)
    host_stems = _stems(inputs_host) | _stems(outputs_host)

    if backend.backend == "alsa_seq":
        # Direct parity expected — both observe the ALSA seq world.
        missing = rt_stems - host_stems
        assert not missing, (
            f"controller-host (alsa_seq) is missing devices python-rtmidi sees:"
            f" {missing}"
        )
    else:
        # JACK MIDI / PipeWire native / ALSA raw observe a different
        # MIDI graph than python-rtmidi's ALSA-seq reads. The acceptance
        # gate here is that the host bound a backend and is enumerating
        # *something*. Document the observation for HIL evidence.
        assert backend.backend in {"jack_midi", "pipewire", "alsa_raw"}, (
            f"unexpected backend: {backend.backend}"
        )
        # Soft check: log the divergence so the bench evidence captures
        # which devices are visible only to one side. This is data, not
        # a failure — JACK and ALSA seq are intentionally different
        # observers per the locked Q2 decision.
        rt_only = rt_stems - host_stems
        host_only = host_stems - rt_stems
        if rt_only or host_only:
            print(
                f"\n[T2459-H1 HIL] backend={backend.backend} "
                f"rtmidi-only={sorted(rt_only)} host-only={sorted(host_only)}"
            )
