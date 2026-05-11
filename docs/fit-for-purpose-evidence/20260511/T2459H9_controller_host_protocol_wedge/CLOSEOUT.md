# T2459-H9 — Controller-Host Protocol Wedge — Closeout

**Date:** 2026-05-11
**Worklist task:** `T2459-H9` (parent `T2459-H`)
**Commit:** (filled in by the closing commit)
**Author:** Claude

---

## Symptom

`MidiHostClient.is_daemon_available()` returned False even though the
UDS socket file existed at `/run/map2/controller-host.sock` and the
daemon process was alive. When the probe *did* connect, the
subsequent `list_ports()` round-trip timed out at the client's
hard-coded 2.0 s `recv()` deadline. The backend's MIDI startup then
logged `controller-host daemon unreachable; MIDI discovery falling
to virtual placeholder` and the entire platform fell deaf to physical
MIDI — every Snapshot Editor learn flow, every device-pack, every
hub status surface degraded silently to simulation.

The T2459-H8 bench session (2026-05-10) reproduced the wedge twice in
the same session — initial state and after `systemctl restart
map2-backend.service`. H8 verification had to be completed via a
synthetic CC injected directly into the backend's `midi_learn_manager`,
not through the physical controller — a workaround, not a fix.

## Live reproduction (pre-fix, 2026-05-11 06:30 EDT)

A direct UDS probe against the live daemon (PID `1085573`) using the
canonical frame format produced this trace:

```
connect ok in 0.3ms
sent 81 bytes
ERROR after 2008.5ms: TimeoutError: timed out
```

- `connect()` returned in 0.3 ms — proving the kernel-level accept
  queue was healthy and the socket file was bound.
- 81-byte `midi_list_ports_request` frame was sent successfully.
- `recv(4)` for the response length prefix timed out at 2008 ms.

This decoupled the failure from `is_daemon_available()`'s probe
semantics: the daemon was alive enough to accept, but the inner
dispatch path never serviced the request within the 2-second
client deadline.

## Root cause

`juce-engine/Source/ControllerHost/main.cpp` was structured as:

```cpp
listen(listen_fd, 1);                          // backlog = 1
while (!shutdown) {
    int client_fd = accept(listen_fd, ...);    // single client at a time
    // ↓ EVERY accept ran this whole setup BEFORE the inner serve loop
    Map2MidiBackend midiBackend;
    midiBackend.probe();                       // JACK → PipeWire → ALSA seq → ALSA raw
    ShmEventRing rtRing; rtRing.open(...);     // O(1) but still kernel-side
    ShmEventRing controlRing; controlRing.open(...);
    if (auto* adapter = midiBackend.adapter()) adapter->setEventRings(...);
    // ↑ on this host, this block took >2 s end-to-end
    while (!shutdown) {
        poll(client_fd, 1ms);
        recv_frame(client_fd, ...);
        // ... dispatch ...
    }
}
```

Two compounding bugs:

1. **Per-accept heavy setup.** The libremidi probe order + shm ring
   creation ran on every backend connection. Total per-accept cost
   exceeded the 2.0 s client `recv()` timeout, so the very first
   request after a backend restart timed out at the *client* side
   before the daemon even reached `recv_frame()`.
2. **`listen(backlog=1)`.** With backlog = 1, any second probe that
   arrived while the daemon was mid-setup either piled up in a 1-slot
   accept queue or failed outright. The
   `MidiHostClient.is_daemon_available()` probes are open-then-close —
   so on a wedged daemon they accumulated, defeating the probe's
   intent of distinguishing "alive" from "wedged".

The failure was steady-state, not just startup-race: even after the
daemon had been alive for hours, a fresh backend reconnect re-paid
the whole setup cost.

## Fix

Two changes in `juce-engine/Source/ControllerHost/main.cpp`:

1. **Hoist the heavy setup out of the accept loop.** `Map2MidiBackend`,
   the probe / force-select block, the shm rings, and the
   `setEventRings()` binding all now live at process scope. The
   `Map2MappingEngine` was already process-scoped; this aligns the
   sibling state with it.
2. **Bump `listen()` backlog from 1 → 16.** Cheap kernel-side change
   that defeats probe-storm pile-ups even if a future regression
   re-introduces multi-millisecond per-accept work.

Per-connection state (`port_to_controller`, `controller_keys_by_index`,
`active_controller_key`) intentionally stays *inside* the accept
loop — it encodes the backend's per-session expectations and must
reset on each fresh backend connection.

## Regression tests

`tests/test_controller_host_h9_no_per_connect_wedge.py` — 3 cases:

1. `test_back_to_back_probes_settle_under_one_second` — three
   connect-and-close probes + a real `list_ports` complete in < 1 s.
   Catches a per-accept-setup regression.
2. `test_list_ports_first_request_responds_quickly` — the very first
   `list_ports` after daemon start completes in < 500 ms. Catches
   the steady-state form of the wedge.
3. `test_listen_backlog_accepts_concurrent_connects` — four
   concurrent connects all succeed. Catches a `listen()` backlog
   regression.

## Test sweep (post-fix)

```
tests/test_controller_host_main_loop_t2459h3.py
tests/test_controller_host_main_loop_t2459h3_slice5.py
tests/test_controller_host_main_loop_t2459h3_slice6.py
tests/test_controller_host_failure_injection.py
tests/test_controller_host_ipc_p1_2_envelopes.py
tests/test_controller_host_p1_2_lifecycle_dispatch_t2482.py
tests/test_controller_host_b5_golden_t2482p1_2.py
tests/test_controller_host_ump_roundtrip_t2459h5.py
tests/test_controller_host_h9_no_per_connect_wedge.py
tests/test_controller_host_ipc_schema.py
```

Result: **58 passed in 56.00s** — zero regressions across the
existing controller-host suite plus the three new H9 regressions.

## Build

```
[ 66%] Building CXX object CMakeFiles/map2-controller-host.dir/Source/ControllerHost/main.cpp.o
[ 75%] Linking CXX executable map2-controller-host
[100%] Built target map2-controller-host
```

## Out of scope (filed as follow-ups, not regressions)

- **`map2-controller-host.service` is in `systemd/` but not deployed.**
  The daemon today is spawned as a child of the backend via
  `app/services/controller_host_service.py`; the unit file exists at
  `systemd/map2-controller-host.service` (from T2482-P1.1 Gap B) but
  is never installed under `/etc/systemd/system/`. The wedge fix
  doesn't require systemd promotion. Deferred for an explicit
  operator-side decision.
- **No `ping`/`pong` handler in the protocol.** `is_daemon_available()`
  is still a kernel-level connect probe. With the setup hoist + larger
  backlog the probe is no longer load-bearing — but a real ping
  would be more correct. Future small slice.
- **`wait_for_daemon()` helper is still unwired.** The helper at
  `app/services/midi_host_client.py:136` is defined but never called
  at backend startup. With H9 the daemon is up before the backend
  finishes its startup probes in normal operation, but a hostile
  startup race could still bite. Future small slice.

## Operator verification gate

This closes T2459-H9 code-side. The in-bench operator verification
gate (physical Novation Launch Control wiggle → binding lands on
`/midi/bindings` within 250 ms) is independent and is consolidated
into the existing T2459 final bench session runbook —
[`docs/midi/T2459_FINAL_BENCH_SESSION.md`](../../../midi/T2459_FINAL_BENCH_SESSION.md).
