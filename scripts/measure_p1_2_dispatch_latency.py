#!/usr/bin/env python3
"""T2482-P1.2 Gap C remainder (iter 69) — host-process dispatch latency.

Measures the end-to-end IPC round-trip latency for the iter-64
mapping lifecycle envelopes against the live map2-controller-host
binary. Closest proxy we can measure today for the engine-side
path; the true audio-thread engine-side measurement (libremidi
callback → shm event ring read inside the JUCE audio callback)
waits for Gap B (libremidi → MappingEngine end-to-end loop) to
land in SHIP loop 8.

Run after a `cmake --build juce-engine/build --target
map2-controller-host`. Writes percentile distributions to stdout
+ a structured JSON report under
docs/fit-for-purpose-evidence/<date>/.
"""

from __future__ import annotations

import json
import socket
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from app.schemas.controller_host import SCHEMA_VERSION, decode_frame, encode_frame  # noqa: E402


BINARY = REPO_ROOT / "juce-engine" / "build" / "map2-controller-host"
EVIDENCE_DIR = REPO_ROOT / "docs" / "fit-for-purpose-evidence"


def _spawn_daemon():
    sock = Path(f"/tmp/map2-iter69-{uuid.uuid4().hex}.sock")
    if sock.exists():
        sock.unlink()
    proc = subprocess.Popen(
        [str(BINARY), "--socket", str(sock)],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )
    deadline = time.monotonic() + 2.0
    while time.monotonic() < deadline:
        if sock.exists():
            return proc, sock
        time.sleep(0.05)
    proc.terminate()
    raise RuntimeError(f"daemon never created socket: {sock}")


def _kill(proc, sock):
    try:
        proc.terminate()
        proc.wait(timeout=2.0)
    except subprocess.TimeoutExpired:
        proc.kill()
    if sock.exists():
        try:
            sock.unlink()
        except OSError:
            pass


def _send_recv(sock, msg):
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(2.0)
    s.connect(str(sock))
    s.sendall(encode_frame(msg))
    buf = b""
    try:
        while True:
            chunk = s.recv(4096)
            if not chunk:
                return None
            buf += chunk
            decoded, _ = decode_frame(buf)
            if decoded is not None:
                return decoded
    finally:
        s.close()


def percentile(samples_ns, p):
    samples_ns.sort()
    return samples_ns[int(len(samples_ns) * p)] / 1000.0


def measure(label, fn, n=100, inter_call_sleep_s=0.040):
    samples = []
    for _ in range(n):
        time.sleep(inter_call_sleep_s)
        t0 = time.monotonic_ns()
        fn()
        samples.append(time.monotonic_ns() - t0)
    samples.sort()
    return {
        "label": label,
        "n": n,
        "mean_us": sum(samples) / n / 1000.0,
        "p50_us": percentile(samples[:], 0.50),
        "p95_us": percentile(samples[:], 0.95),
        "p99_us": percentile(samples[:], 0.99),
        "p999_us": percentile(samples[:], 0.999) if n >= 1000 else None,
    }


def main():
    if not BINARY.exists():
        print(f"ERROR: binary not built: {BINARY}", file=sys.stderr)
        return 1

    proc, sock = _spawn_daemon()
    try:
        # Warm up
        for _ in range(5):
            _send_recv(sock, {
                "type": "mapping_deactivate",
                "msg_id": "warmup",
                "schema_version": SCHEMA_VERSION,
                "controller_key": "warmup",
            })

        # Activate once so reload/deactivate has something to find.
        _send_recv(sock, {
            "type": "mapping_activate",
            "msg_id": "seed",
            "schema_version": SCHEMA_VERSION,
            "controller_key": "iter69.bench",
            "descriptor": {
                "pack_id": "iter69", "model": "bench", "kind": "midi",
                "scripts": [],
                "controls": [], "outputs": [], "settings": [],
                "mixxx_alias_table": {},
            },
        })

        # Measurement: mapping_deactivate round-trip (host enters
        # unloadDescriptor, returns log_event)
        deact_stats = measure(
            "mapping_deactivate",
            lambda: _send_recv(sock, {
                "type": "mapping_deactivate",
                "msg_id": uuid.uuid4().hex,
                "schema_version": SCHEMA_VERSION,
                "controller_key": "nonexistent",  # always not-loaded → uniform path
            }),
        )

        # Measurement: mapping_activate round-trip (host enters
        # loadDescriptor with empty scripts, returns log_event)
        act_stats = measure(
            "mapping_activate (empty descriptor)",
            lambda: _send_recv(sock, {
                "type": "mapping_activate",
                "msg_id": uuid.uuid4().hex,
                "schema_version": SCHEMA_VERSION,
                "controller_key": f"iter69.act.{uuid.uuid4().hex[:6]}",
                "descriptor": {
                    "pack_id": "iter69", "model": "act", "kind": "midi",
                    "scripts": [], "controls": [], "outputs": [],
                    "settings": [], "mixxx_alias_table": {},
                },
            }),
        )

        # Measurement: mapping_reload (full unload + load cycle)
        reload_stats = measure(
            "mapping_reload (empty descriptor)",
            lambda: _send_recv(sock, {
                "type": "mapping_reload",
                "msg_id": uuid.uuid4().hex,
                "schema_version": SCHEMA_VERSION,
                "controller_key": "iter69.bench",
                "descriptor": {
                    "pack_id": "iter69", "model": "bench", "kind": "midi",
                    "scripts": [],
                    "controls": [], "outputs": [], "settings": [],
                    "mixxx_alias_table": {},
                },
            }),
        )

        report = {
            "title": "T2482-P1.2 Gap C remainder — host-process dispatch latency",
            "iter": 69,
            "captured_at": datetime.now(timezone.utc).isoformat(),
            "binary": str(BINARY),
            "samples_per_measurement": 100,
            "inter_call_sleep_s": 0.040,
            "measurements": [deact_stats, act_stats, reload_stats],
            "scope_note": (
                "These are HOST-PROCESS IPC round-trip times — "
                "the closest proxy we can measure today for the "
                "audio-thread engine-side path. The true engine-side "
                "measurement (libremidi callback → shm event ring "
                "read inside the JUCE audio callback) waits for Gap B "
                "(libremidi → MappingEngine end-to-end loop) to land "
                "in SHIP loop 8."
            ),
        }

        print(json.dumps(report, indent=2))

        # Write to evidence dir
        date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
        evidence = EVIDENCE_DIR / date_str
        evidence.mkdir(parents=True, exist_ok=True)
        out_path = evidence / "T2482_P1_2_DISPATCH_LATENCY.json"
        out_path.write_text(json.dumps(report, indent=2) + "\n")
        print(f"\nWrote evidence to {out_path}", file=sys.stderr)
        return 0
    finally:
        _kill(proc, sock)


if __name__ == "__main__":
    sys.exit(main())
