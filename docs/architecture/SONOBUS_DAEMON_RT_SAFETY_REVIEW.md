# T2521-4 — SonoBus/AOO Daemon RT-Safety Review

| Field | Value |
|---|---|
| **Task** | T2521-4 (parent T2521 — SonoBus/AOO remote-audio transport) |
| **Status** | **RT-safety review — DRAFT for operator sign-off** |
| **Date** | 2026-06-02 |
| **Author** | Claude (analysis artifact, zero code) |
| **Process model** | Standalone `map2-sonobus-transport` daemon — **NOT in the JUCE engine process**. Its RT thread is its own JACK process callback. |
| **AOO version** | vendored `vendor/aoo/` @ v2.0-pre4 (commit `dc2a5be`), BSD-3-Clause |
| **Reviewer** | _(operator — sign §6 below)_ |

> **GATE STATEMENT.** No real `AooTransport` audio code (the `aoo_source`/`aoo_sink`
> `process()`/`send()`/`receive()` integration in `AooTransport.cpp` + the JACK
> callback in `JackBridge.cpp`) merges to `master` until this document is signed.
> The daemon CMake wire-up (`SONOBUS_AVAILABLE`) and the non-RT plumbing may
> proceed; the RT audio path waits for sign-off. This is a pure-analysis artifact —
> zero code, zero `juce-engine/Source/` or daemon-source touch.

---

## 1. Why this is a *different* RT review than T2511

T2511 put new nodes inside the **JUCE engine's** audio callback (cores 4,5, 1.33 ms).
The SonoBus daemon is a **separate process** (`map2-sonobus-transport`) with its **own**
JACK client and its **own** process callback. Its RT thread is the JACK callback, not
the JUCE callback. The two never share an audio thread — they communicate over a UDS
control plane (lifecycle/metrics) and, when a snapshot binds a `sonobus:` interface,
over JACK ports the daemon creates. So the RT contract here protects the **JACK
process callback of the daemon**, governed by the same three rules (no alloc/lock/
syscall on that thread), but in a distinct process with a distinct RT thread.

Crucially, the design does **not** require the JUCE engine to call AOO. The engine
binding (`setSonoBusInputId`/`setSonoBusOutputId`, T2521-4 step 5) only routes the
engine's audio to/from **JACK ports** — the daemon picks those up on its own callback.
That keeps AOO entirely out of the JUCE RT path.

## 2. The upstream AOO contract makes this clean (verified)

AOO's API is explicitly threading-annotated (verified in the vendored headers):

- **`AooSource::process(...)` / `AooSink::process(...)`** — `aoo_source.hpp:100,113` /
  `aoo_sink.hpp:100,113`: *"Threadsafe and RT-safe; call on the audio thread."* These
  move PCM in/out of AOO's internal buffers and are designed to run from the JACK
  process callback.
- **`AooSource::send(...)` / `AooSink::send(...)`** — `:78,91,96`: *"Threadsafe; call on
  the network thread."* These do the actual UDP I/O (syscalls) and MUST run off the
  RT callback.
- **`receive(...)`** — network thread, same rule.
- **AOO owns an internal audio↔network ring** — `aoo_source.hpp:275`: *"the ring buffer
  between the audio and network thread."* AOO is *built* for the split we need; we do
  not have to invent the cross-thread handoff for the AOO side.

**Consequence:** the RT-safe design is the one AOO documents — `process()` on the JACK
callback, `send()`/`receive()` on a dedicated network thread. The daemon's `poll()`
(already in the `AooTransport` stub) is the network-thread pump.

## 3. The daemon's RT boundary (the JackBridge ↔ AooTransport split)

```
  ┌─ JACK process callback (RT) ────────────────────────────────┐
  │  for each active stream:                                     │
  │    INPUT  (engine → peer):  jack_port_get_buffer (RT-safe)   │
  │                             → AooSource::process()  [RT-safe] │
  │    OUTPUT (peer → engine):  AooSink::process()      [RT-safe] │
  │                             → jack_port_get_buffer            │
  │  NO malloc / NO lock / NO socket I/O here.                   │
  └──────────────────────────────────────────────────────────────┘
                         ▲ AOO internal ring (owned by AOO)
                         ▼
  ┌─ network thread (non-RT, AooTransport::poll loop) ───────────┐
  │  AooSource::send(udp_send_fn)   → sendto()   [syscalls OK]    │
  │  AooSink::receive() ← recv loop → AooSink::handleMessage()    │
  │  AOO event pump → metrics (RTT/loss/jitter) → UDS to backend  │
  └──────────────────────────────────────────────────────────────┘
```

The JACK callback only calls `process()` (RT-safe per §2) + `jack_port_get_buffer`
(RT-safe by JACK contract). All UDP I/O, all `sendto`/`recv`, all event handling, all
UDS metric pushes live on the network thread. This is the daemon analogue of the
T2507 tap pattern: the RT thread is a pure producer/consumer against rings; the
syscalls are off-thread.

## 4. RT-safety requirements the reviewer signs against

1. **JACK process callback does ONLY `process()` + `jack_port_get_buffer` + memcpy.**
   No `aoo_source->send()`, no `recv`, no `socket`, no `malloc`, no `std::vector`
   growth, no lock that the network thread can hold.
2. **All AOO source/sink CREATION/DESTRUCTION happens off the RT thread.** `createSource`/
   `createSink` (allocation, port creation) run on the UDS-handler / network thread.
   The JACK callback observes the active-stream set through a published atomic snapshot
   (the same acquire/release discipline as `TapNode::armed_`), never mutates it.
3. **Stream add/remove uses an atomic-swap + deferred-free**, exactly like T2511's
   `ChainInputSwitch`: the callback reads a `std::atomic<StreamTable*>` once per block;
   the control thread swaps it and retires the old table after a grace period. No
   stream object is freed while the callback might touch it.
4. **The network thread is the single owner of all sockets + the AOO `send`/`receive`
   path.** No two threads touch one AOO source's network side.
5. **Metrics (RTT/loss/jitter) are collected on the network thread**, pushed to the
   backend over UDS (already `MetricsCollector` + `UdsProtocol`), never computed on the
   JACK callback.
6. **JACK xrun / buffer-size-change handling** stops/reconfigures off the callback (JACK
   delivers these on its own thread), mirroring the engine's stop-before-reconfig rule.
7. **Degraded mode is silent + non-blocking:** if the JACK server is unreachable
   (`JackBridge::initialize` returns -1) or AOO isn't initialized, the daemon keeps the
   UDS control plane alive and audio simply doesn't move — the callback is never
   installed, so there is no RT path to violate.

## 5. Per-file audit checklist (reviewer walks each as the code lands)

| File | Function | Operation | RT-Safe? | Sign-off | Notes |
|---|---|---|:---:|---|---|
| `JackBridge.cpp` | JACK process callback | `jack_port_get_buffer` + `AooSource/Sink::process()` + memcpy | ✅ (target) | ☐ | The ONLY RT thread. AOO process() is RT-safe per §2. |
| `JackBridge.cpp` | JACK process callback | **any `send`/`recv`/`socket`/`malloc`/lock** | ❌ MUST NOT APPEAR | ☐ | §4 rule 1. |
| `JackBridge.cpp` | stream-table read | `std::atomic<StreamTable*>.load(acquire)` once/block | ✅ (target) | ☐ | Mirror `ChainInputSwitch`. §4 rule 3. |
| `AooTransport.cpp` | `poll` (network thread) | `AooSource::send` / `AooSink::receive` / `sendto` / `recv` | ✅ (target) | ☐ | All UDP I/O here, off the JACK callback. §2. |
| `AooTransport.cpp` | `createSource`/`createSink` | AOO object alloc + port creation | ✅ (target) | ☐ | Control/network thread only; never the callback. §4 rule 2. |
| `AooTransport.cpp` | stream add/remove | atomic-swap + deferred-free of the stream table | ✅ (target) | ☐ | §4 rule 3 (RCU-style, like T2511). |
| `MetricsCollector.cpp` | metric snapshot | RTT/loss/jitter compute + UDS push | ✅ (target) | ☐ | Network thread; never the callback. §4 rule 5. |
| `DaemonServer.cpp` | UDS handler | bind/unbind streams from backend messages | ✅ (target) | ☐ | Control thread; drives create/destroy off-RT. |

## 6. Verification gates (software now; hardware = T2521-10 post-release)

**Software (this release — what the build + Catch2/unit gate proves):**
- ☐ Daemon builds clean with `SONOBUS_AVAILABLE=TRUE` linking the vendored core `aoo/`
  lib + **system libopus** (`AOO_LOCAL_OPUS=OFF` → `find_package(Opus REQUIRED)`); also
  builds clean in `SONOBUS_BUILD_STUB` mode (no AOO).
- ☐ Unit tests: UDS protocol framing round-trip; stream-table atomic-swap + deferred-free
  under a synthetic concurrent stress loop (the TSan-ready test, mirroring T2511's
  ChainInputSwitch stress test); MetricsCollector aggregation; degraded-mode (no JACK)
  keeps the UDS plane up.
- ☐ A no-tearing test on the stream table: the JACK-callback read path always sees a
  whole, consistent stream set under a concurrent control-thread swap.

**Hardware / runtime (T2521-10, POST-RELEASE DEBT — already in § Post-Release Hardware Debt):**
- ☐ Daemon starts via `systemctl start map2-sonobus-transport.service`, reaches
  `/api/sonobus/status` `daemon_running=True` within 5 s.
- ☐ Live metrics populate `/api/sonobus/diagnostics`; WS events reach the GUI.
- ☐ **Paired ON-vs-OFF 5-min RT soak** on the JACK callback: no jitter-percentile delta
  attributable to the daemon; 0 xruns. (The engine `setSonoBusInputId` binding's RT
  proof rides here too.)

---

### Reviewer sign-off

> By signing, the operator attests that the §1 process model, the §2 AOO contract
> mapping, the §3 JackBridge↔AooTransport split, and the §4 RT requirements are the
> design the implementation must follow. The §5 audit + §6 software gates are walked as
> the code lands; the §6 hardware soak is T2521-10 post-release debt.

| | |
|---|---|
| **Reviewer** | ______________________ |
| **Signature** | ______________________ |
| **Date** | ______________________ |

---

*Pure-analysis artifact. Modifies no code. It is the RT contract the T2521-4 transport
implementation must satisfy before merge. AOO's own RT/threading annotations (§2) are
the upstream guarantee this design leans on.*
