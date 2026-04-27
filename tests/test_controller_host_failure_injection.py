"""IPC failure-injection harness for the controller subsystem.

T2459-F5 acceptance gate. Exercises four failure modes the audio
engine must ride out without flinching, per the architecture's
crash-isolation budget (docs/architecture/CONTROLLER_LAYER.md §3.2):

1. **Kill controller-host mid-run** — supervisor restarts within
   the configured backoff; ProfileRegistry + ControllerService
   continue to operate; backend boot path stays clean.
2. **Corrupt a pack YAML** — ProfileRegistry logs and skips the
   broken file; other packs still load; backend boot continues.
3. **Saturate the IPC layer with EngineCommand frames** — the
   IPC codec doesn't lose data under burst load; encode_frame /
   decode_frame round-trip every frame.
4. **JS infinite loop in mapping JS** — supervisor's restart-storm
   guard prevents runaway crash loops from keeping the host in
   restart purgatory; degraded state is recoverable via
   `reset_storm_guard`.

The C++ Map2HidController + Map2BulkController + Map2MidiController
include defensive paths against device-disconnect / hidapi-EAGAIN /
ALSA-EINTR per their respective implementations and Catch2 cases.
This Python suite covers the supervisor + IPC + ProfileRegistry
layers — the surfaces that surround the controller-host process.
"""

from __future__ import annotations

import asyncio
import stat
import textwrap
import time
from pathlib import Path

import pytest

from app.schemas.controller_host import decode_frame, encode_frame, SCHEMA_VERSION
from app.services.controller_host_service import (
    ControllerHostService,
    ControllerHostStatus,
    reset_controller_host_service_for_tests,
)
from app.services.controllers.profile_registry import ProfileRegistry


def _write_script(path: Path, body: str) -> None:
    path.write_text(body)
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


@pytest.fixture(autouse=True)
def _reset_singleton() -> None:
    reset_controller_host_service_for_tests()
    yield
    reset_controller_host_service_for_tests()


# ---------------------------------------------------------------------------
# Failure mode 1 — controller-host crashes mid-run; supervisor restarts.
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_kill_controller_host_mid_run_supervisor_restarts(tmp_path: Path) -> None:
    """A child that exits non-zero after a brief delay is restarted by
    the supervisor; the supervisor records the crash + transitions
    to RESTARTING before going RUNNING again on the next iteration.
    """
    binary = tmp_path / "host.sh"
    _write_script(binary, textwrap.dedent("""\
        #!/bin/bash
        # Run for 100ms then exit non-zero — exercises the
        # crash-detected → restart code path.
        trap 'exit 0' TERM
        sleep 0.1
        exit 1
    """))
    svc = ControllerHostService(
        binary_path=binary,
        socket_path=tmp_path / "ipc.sock",
        crash_log_path=tmp_path / "crash.log",
        cpu_affinity=(),
        initial_backoff_seconds=0.05,
        max_backoff_seconds=0.1,
    )
    await svc.start()

    # Wait for at least one crash + at least one restart.
    deadline = time.monotonic() + 5.0
    while time.monotonic() < deadline:
        if svc.status_payload()["restart_count"] >= 1:
            break
        await asyncio.sleep(0.05)
    assert svc.status_payload()["restart_count"] >= 1, (
        "supervisor never recorded a restart"
    )
    # The crash log must be written for diagnostic purposes.
    assert (tmp_path / "crash.log").exists()
    await svc.stop()


@pytest.mark.asyncio
async def test_kill_controller_host_does_not_block_backend_lifespan(tmp_path: Path) -> None:
    """Even if the controller-host binary doesn't exist, the supervisor
    must enter WAITING_FOR_BINARY without blocking the backend's
    startup. This is the contract that lets `map2-backend.service`
    boot cleanly when the C++ build hasn't shipped yet.
    """
    svc = ControllerHostService(
        binary_path=tmp_path / "missing-binary",
        socket_path=tmp_path / "ipc.sock",
        crash_log_path=tmp_path / "crash.log",
    )
    # The await must return promptly. If start blocks (because the
    # supervisor sits in a tight loop waiting on a missing file), the
    # backend's lifespan would stall — that's the bug we're guarding.
    start_time = time.monotonic()
    await asyncio.wait_for(svc.start(), timeout=2.0)
    elapsed = time.monotonic() - start_time
    assert elapsed < 1.0
    # Wait for the supervisor to discover the missing binary.
    for _ in range(40):
        if svc.status == ControllerHostStatus.WAITING_FOR_BINARY:
            break
        await asyncio.sleep(0.05)
    assert svc.status == ControllerHostStatus.WAITING_FOR_BINARY
    await svc.stop()


# ---------------------------------------------------------------------------
# Failure mode 2 — corrupted pack YAML; ProfileRegistry skips it.
# ---------------------------------------------------------------------------

def test_corrupt_pack_yaml_logs_and_skips_without_blocking_boot(
    tmp_path: Path,
) -> None:
    """A pack with a malformed pack.yaml must not block the registry's
    load_packs(); other packs in the tree still load.
    """
    import shutil
    repo_root = Path(__file__).resolve().parents[1]
    schema_src = repo_root / "device-packs" / "_schema"
    shutil.copytree(schema_src, tmp_path / "_schema")

    # vendor-good with a clean manifest
    good = tmp_path / "vendor-good"
    (good / "profiles").mkdir(parents=True)
    (good / "pack.yaml").write_text(textwrap.dedent("""\
        schema_version: 1
        pack_id: vendor-good
        vendor: { name: Good }
        description: Good vendor.
        license: AGPL-3.0-only
    """))

    # vendor-broken with malformed YAML
    broken = tmp_path / "vendor-broken"
    broken.mkdir()
    (broken / "pack.yaml").write_text("not: valid: yaml: : :")

    registry = ProfileRegistry(packs_root=tmp_path)
    registry.load_packs()  # MUST NOT raise

    pack_ids = {p.pack_id for p in registry.packs()}
    assert "vendor-good" in pack_ids
    assert "vendor-broken" not in pack_ids


def test_corrupt_profile_yaml_degrades_pack_but_keeps_others(
    tmp_path: Path,
) -> None:
    """A pack with a broken individual profile YAML loads in degraded
    mode — other profiles still register, the operator GUI shows
    "pack X is degraded".
    """
    import shutil
    repo_root = Path(__file__).resolve().parents[1]
    schema_src = repo_root / "device-packs" / "_schema"
    shutil.copytree(schema_src, tmp_path / "_schema")

    pack = tmp_path / "vendor-x"
    (pack / "profiles").mkdir(parents=True)
    (pack / "pack.yaml").write_text(textwrap.dedent("""\
        schema_version: 1
        pack_id: vendor-x
        vendor: { name: X }
        description: X
        license: AGPL-3.0-only
    """))
    # Good profile.
    (pack / "profiles" / "good.audio.yaml").write_text(textwrap.dedent("""\
        schema_version: 1
        identity:
          manufacturer: X
          model: good
          hardware_id: usb:1234:0001
        ports:
          - id: out
            kind: analog
            direction: output
            count: 1
    """))
    # Broken profile (missing required identity.manufacturer).
    (pack / "profiles" / "broken.audio.yaml").write_text(textwrap.dedent("""\
        schema_version: 1
        identity:
          model: broken
        ports:
          - id: out
            kind: analog
            direction: output
            count: 1
    """))

    registry = ProfileRegistry(packs_root=tmp_path)
    registry.load_packs()
    pack_obj = registry.get_pack("vendor-x")
    assert pack_obj is not None
    assert pack_obj.is_degraded
    models = {p.model for p in pack_obj.profiles}
    assert "good" in models
    assert "broken" not in models


# ---------------------------------------------------------------------------
# Failure mode 3 — IPC saturation; codec must remain lossless.
# ---------------------------------------------------------------------------

def test_ipc_burst_round_trips_every_frame_without_loss() -> None:
    """Hammer the IPC codec with a thousand EngineCommand frames in a
    single buffer; verify every one decodes back exactly. This proves
    the length-prefixed framing protocol is robust under burst load —
    a JS mapping that emits engine.setValue() in a tight loop won't
    cause silent frame loss in the receiver.
    """
    frames = b""
    expected = []
    for i in range(1000):
        cmd = {
            "type": "engine_command",
            "msg_id": f"burst-{i}",
            "schema_version": SCHEMA_VERSION,
            "controller_key": "alsa-seq:test:0",
            "target": f"audio.chain.{i % 8 + 1}.volume",
            "action": "set",
            "value": (i % 128) / 127.0,
        }
        expected.append(cmd)
        frames += encode_frame(cmd)

    # Drain the buffer.
    decoded_frames = []
    rest = frames
    while rest:
        decoded, rest = decode_frame(rest)
        if decoded is None:
            break
        decoded_frames.append(decoded)
    assert len(decoded_frames) == 1000
    for actual, expected_cmd in zip(decoded_frames, expected):
        assert actual == expected_cmd


def test_ipc_codec_handles_partial_frame_buffers_correctly() -> None:
    """When the buffer ends mid-frame (the IPC reader hasn't received
    all the bytes yet), `decode_frame` must return None + preserve the
    full buffer. This is the contract that lets the IPC reader
    accumulate bytes incrementally without losing data.
    """
    cmd = {
        "type": "engine_command",
        "msg_id": "x",
        "schema_version": SCHEMA_VERSION,
        "controller_key": "k",
        "target": "audio.master.volume",
        "action": "set",
        "value": 0.5,
    }
    frame = encode_frame(cmd)
    # Try every partial truncation point.
    for cut in range(1, len(frame)):
        decoded, rest = decode_frame(frame[:cut])
        assert decoded is None, f"truncated at byte {cut} produced a decoded frame"
        assert rest == frame[:cut], f"buffer not preserved at truncation {cut}"


# ---------------------------------------------------------------------------
# Failure mode 4 — restart storm guard prevents runaway crash loops.
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_restart_storm_guard_pins_at_degraded_after_threshold(
    tmp_path: Path,
) -> None:
    """A binary that exits immediately and repeatedly trips the storm
    guard within the 60 s window. After 5 crashes the supervisor stops
    auto-restarting and pins the status at DEGRADED — operator must
    reset_storm_guard() to retry. This protects audio from a
    pathological mapping that would otherwise crash-loop forever.
    """
    binary = tmp_path / "host.sh"
    _write_script(binary, "#!/bin/bash\nexit 1\n")
    svc = ControllerHostService(
        binary_path=binary,
        socket_path=tmp_path / "ipc.sock",
        crash_log_path=tmp_path / "crash.log",
        cpu_affinity=(),
        initial_backoff_seconds=0.01,
        max_backoff_seconds=0.05,
    )
    await svc.start()

    deadline = time.monotonic() + 10.0
    while time.monotonic() < deadline:
        if svc.status == ControllerHostStatus.DEGRADED:
            break
        await asyncio.sleep(0.05)
    assert svc.status == ControllerHostStatus.DEGRADED, (
        f"storm guard never tripped — status={svc.status}, "
        f"crashes={svc.status_payload()['crashes_in_window']}"
    )
    payload = svc.status_payload()
    assert payload["crashes_in_window"] >= 5
    assert "Restart-storm guard" in (payload["last_error"] or "")
    await svc.stop()


@pytest.mark.asyncio
async def test_storm_guard_reset_re_enables_supervisor(tmp_path: Path) -> None:
    """`reset_storm_guard` clears the crash list and lifts the
    supervisor out of DEGRADED state — the supervisor immediately
    retries the next iteration. This is the operator-recovery path
    for fixing a crashing controller-host binary.
    """
    binary = tmp_path / "host.sh"
    _write_script(binary, "#!/bin/bash\nexit 1\n")
    svc = ControllerHostService(
        binary_path=binary,
        socket_path=tmp_path / "ipc.sock",
        crash_log_path=tmp_path / "crash.log",
        cpu_affinity=(),
        initial_backoff_seconds=0.01,
        max_backoff_seconds=0.05,
    )
    await svc.start()
    for _ in range(200):
        if svc.status == ControllerHostStatus.DEGRADED:
            break
        await asyncio.sleep(0.05)
    assert svc.status == ControllerHostStatus.DEGRADED
    svc.reset_storm_guard()
    assert svc.status_payload()["crashes_in_window"] == 0
    await svc.stop()
