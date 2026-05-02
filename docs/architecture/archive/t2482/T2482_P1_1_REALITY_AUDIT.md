# T2482-P1.1 — Reality audit (supersedes the iter-38 design doc estimates)

**Status:** Audit (iter 41, 2026-04-30) — live-verified on bench.
**Supersedes parts of:** [`T2482_P1_1_LIBREMIDI_FOUNDATION.md`](T2482_P1_1_LIBREMIDI_FOUNDATION.md) §2 ("Audit of current python-rtmidi usage") and §5 ("Migration plan").

---

## 1. Why this exists

The iter-38 design doc was written before a live audit of `juce-engine/Source/ControllerHost/`. This audit ran the binary, did a round-trip Python→host→libremidi enumeration, and confirms the foundation is **already shipped, not greenfield**. This doc replaces the migration timeline with a concrete remaining-work list.

---

## 2. Live-verified state (2026-04-30 bench run)

### Binary exists + works
```
$ map2-controller-host --version
map2-controller-host 0.1 (T2459-B2 scaffold)

$ map2-controller-host --socket /tmp/smoke.sock
[map2-controller-host] listening on /tmp/smoke.sock
[map2-controller-host] backend connected
[map2-controller-host] midi backend = jack_midi
```

Built artifact: `juce-engine/build/map2-controller-host` (2.4 MB, 2026-04-28).

### IPC round-trip works
Python `MidiHostClient.list_ports()` against the running daemon returns the live port list:
```
Backend: jack_midi (degraded=False)
Ports found: 9
  [IN]  Midi-Bridge:Midi Through Port-0 (capture)
  [IN]  Midi-Bridge:UA-1000 MIDI (capture)              ← real hardware, the Edirol
  [IN]  Midi-Bridge:RtMidiOut ClientMAP2:Maschine-MK1 (capture)
  [IN]  Midi-Bridge:RtMidiOut ClientRtMidi output (capture)
  [IN]  Midi-Bridge:MAP2 Audio EngineMIDI Out (capture)
  [OUT] Midi-Bridge:Midi Through Port-0 (playback)
  [OUT] Midi-Bridge:UA-1000 MIDI (playback)
  [OUT] Midi-Bridge:RtMidiIn ClientRtMidi input (playback)
  [OUT] Midi-Bridge:MAP2 Audio EngineMIDI In (playback)
```

### What's already complete (from the design doc's perspective)

| Design-doc deliverable | Reality |
|---|---|
| §5 P1.1.a vendor libremidi + write C++ shim | **DONE** — libremidi v5.1.0 vendored via FetchContent, `LibremidiAdapter.{h,cpp}` 121+ lines, Map2MidiBackend with locked JACK→PipeWire→ALSA-seq→ALSA-raw probe order, JACK MIDI binds first on this host (non-degraded). |
| §5 P1.1.b SPSC shm event ring | **DONE** — `EventRing/ShmEventRing.{h,cpp}` exists with two-ring topology (RT + control rings) — richer than the design doc's single-ring proposal. The shm rings already classify by MIDI status byte. |
| §5 P1.1.c midi_host_client UDS | **PARTIALLY DONE** — `app/services/midi_host_client.py` (343 LOC) implements `list_ports`, `load_script`, `open_midi_input`, `send_ump`, `activate_mapping`. Missing for rtmidi parity: synchronous `send_short_message(bytes)`, `send_sysex(bytes)`, `subscribe_events(callback)` — see Gap A below. |
| Build target | **DONE** — `BUILD_CONTROLLER_HOST=ON` (default), Catch2 unit tests for ShmEventRing in `juce-engine/tests/`. |
| Schema sync test | **DONE** — `tests/test_controller_host_ipc_schema.py` ensures C++ structs and Python TypedDicts stay in sync. |

### What's actually left

#### Gap A — rtmidi-equivalent client methods missing
`MidiHostClient` is fluent for the controller-host's own dispatch needs (mapping activation, UMP send) but has no drop-in replacement for the rtmidi `MidiOut.send_message(bytes)` / `MidiIn.set_callback(fn)` shape. The 5 rtmidi consumers all use those two methods primarily. Adding them requires:

- `send_short_message(controller_key, bytes)` — wraps `MidiSendRequest` with `format="midi1"` (already supported on the wire).
- `send_sysex(controller_key, bytes)` — same, with the SysEx envelope (the wire is bytes-list-agnostic; this is just sugar).
- `subscribe_events(controller_key, callback)` — currently the host emits `ControllerEvent` outbound; the client doesn't expose a subscriber API. Needs an event-loop reader thread that demuxes outbound frames by type and invokes registered callbacks.

Effort: ~1 week. Smaller than the design doc's "1 week for the whole client" estimate because the protocol layer (frame encode/decode + roundtrip) is already done.

#### Gap B — daemon lifecycle / systemd unit
The daemon must be started by hand for the smoke test to work. Production needs:
- A `systemd/map2-controller-host.service` unit (matches the existing `map2-backend.service` pattern).
- Service ordering: `After=pipewire.service jack.service`, `Requires=` not set (degrade gracefully if JACK not running — falls through to ALSA seq).
- Socket permissions: `/run/map2/controller-host.sock` mode 0660, group `audio`.
- The Python backend needs to wait for the daemon's UDS socket to appear before connecting (5-second backoff loop, surface as a degraded health event if it never appears).

Effort: ~2 days.

#### Gap C — Latency floor never measured
The design doc's DoD gate "p99 < 100 µs" is unverified. Need:
- A synthetic injector that pushes MIDI bytes via libremidi virtual port → measures shm ring read on the consumer side → reports p50/p95/p99.
- Run on the bench with the real audio system loaded so we measure under realistic CPU/cache pressure, not in isolation.
- Logged to `docs/fit-for-purpose-evidence/<YYYYMMDD>/`.

Effort: ~3 days.

#### Gap D — 5-consumer rtmidi flip still required
The 5 services in iter 38 §2 still all use `import rtmidi`:
- `app/services/ground_control_pro/midi_transport.py` (13 references)
- `app/services/maschine/maschine_mk1_daemon.py` (9 references)
- `app/services/sysex_device_bridge.py` (20 references)
- `app/services/midi_hub/ports.py` (20 references)
- `app/services/midi_engine.py` (30 references)

Each needs an env-var-gated flag-flip from rtmidi → MidiHostClient. Order remains as iter 38 §5 P1.1.d listed (smallest blast radius first).

Effort: ~1 week (one consumer per day, including pytest coverage in both modes).

#### Gap E — `python-rtmidi` retirement
Once Gap D is complete:
- Remove `python-rtmidi>=1.5.8,<2.0.0` from `requirements-backend-runtime.txt`.
- Strip the 5 services' `import rtmidi` blocks (now dead).
- Update `app/services/package_manager.py` and `app/services/backup/recovery.py` references.
- Update `MIDI_BACKEND.md` and `MIDI_SERVICES.md`.

Effort: ~2 days.

---

## 3. Revised P1.1 timeline

| Phase | Original estimate (iter 38 §5) | Revised | Status |
|---|---|---|---|
| P1.1.a libremidi vendor + C++ shim | 1 week | DONE | shipped |
| P1.1.b SPSC shm event ring | 1 week | DONE | shipped |
| P1.1.c midi_host_client.py | 1 week | ~1 week | partial — Gap A |
| P1.1.d flip 5 rtmidi consumers | 2 weeks | ~1 week | pending — Gap D |
| P1.1.e drop python-rtmidi | 2 days | 2 days | pending — Gap E |
| **Plus new from this audit:** | | | |
| Daemon lifecycle / systemd unit | (not in design doc) | 2 days | pending — Gap B |
| Latency floor measurement | (DoD only) | 3 days | pending — Gap C |
| **Total remaining** | **~5 weeks (greenfield)** | **~3 weeks (additive)** | |

Net: **roughly 40% less work than the design doc estimated.** The big-ticket items (libremidi adapter, shm rings, Map2MidiBackend) are already done.

---

## 4. Loop 5 plan (revised based on this audit)

The original loop-5 plan budgeted iter 41 for "audit + smoke test" (this doc) and iters 42-50 for greenfield phases. Reality says we go straight to gaps. Revised iter map:

| Iter | Gap | Goal |
|---|---|---|
| 41 | — | THIS DOC. Live audit + smoke test confirming foundation shipped. |
| 42 | Gap A.1 | Add `MidiHostClient.send_short_message()` + pytest |
| 43 | Gap A.2 | Add `MidiHostClient.send_sysex()` + pytest |
| 44 | Gap A.3 | Add `MidiHostClient.subscribe_events()` + reader thread + pytest |
| 45 | Gap B | systemd unit + daemon-lifecycle health gate |
| 46 | Gap D.1 | Flip GCP `midi_transport.py` (smallest blast radius) |
| 47 | Gap D.2 | Flip Maschine MK1 daemon |
| 48 | Gap D.3 | Flip `sysex_device_bridge.py` (covers IntelFX + MPX-1 SysEx) |
| 49 | Gap D.4 + D.5 | Flip `midi_hub/ports.py` + `midi_engine.py` (the two heavies) |
| 50 | Gap C + Gap E + roll-up | Latency floor measurement + drop python-rtmidi from requirements + SHIP loop 5 close |

Loop 5 now ships **the entire P1.1** (not just preparation). At iter 50, P1.1 is `[✓] Done` per the design doc's 8 DoD gates.

---

## 5. Risk-register update

| iter-38 risk | Updated likelihood | Notes |
|---|---|---|
| libremidi JACK adapter has bugs we don't catch in pytest | LOW (was MEDIUM) | Live bench confirms JACK adapter selects + enumerates 9 ports correctly. |
| SPSC ring overflow under SysEx burst | LOW (was MEDIUM) | Two-ring topology already separates RT from control traffic; the design doc's worst-case (GCP bulk dump = 415 events) lands in the control ring, isolated from the RT path. |
| midi_host_client UDS adds Python-side latency | LOW (was LOW) | The RT path skips Python entirely (libremidi → shm → JUCE engine). Python only sees outbound `ControllerEvent` and the control plane. |
| Maschine MK1 virtual MIDI output behaves differently under libremidi | UNKNOWN | Maschine port enumerated correctly but virtual-output write path not yet exercised. Cover under iter 47. |
| Migration commits land in the middle of a SysEx parser cutover | RESOLVED | Iters 35-37 already shipped. P1.1 implementation no longer collides. |
| Cluster MIDI wire format diverges | LOW (was MEDIUM) | The two-ring topology + libremidi's stable port-id naming gives cluster a clean substrate. |

---

## 6. Cross-references

- iter-38 design doc: [`T2482_P1_1_LIBREMIDI_FOUNDATION.md`](T2482_P1_1_LIBREMIDI_FOUNDATION.md). The audit version above the line in §1 there should now read "supersedes — see T2482_P1_1_REALITY_AUDIT.md for current state."
- iter-39 design doc: [`T2482_P1_2_CONTROLLERENGINE_INTEGRATION.md`](T2482_P1_2_CONTROLLERENGINE_INTEGRATION.md) — the same audit pattern applied to P1.2; that doc already reflects the substantial existing scaffolding.
- Live binary: `juce-engine/build/map2-controller-host`.
- Live IPC client: `app/services/midi_host_client.py`.
- Live IPC schemas: `app/schemas/controller_host.py` + `juce-engine/Source/ControllerHost/IpcMessages.h`. Sync gate: `tests/test_controller_host_ipc_schema.py`.
