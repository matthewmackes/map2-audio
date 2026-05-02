# T2482-P1.2 — Mixxx ControllerEngine integration (gap analysis + design)

**Status:** Design (iter 39, 2026-04-30) — implementation deferred to dedicated work cycle.
**Owns:** T2459-H2 (subsumed under T2482 epic; see Project Worklist).
**Depends on:** [`T2482_P1_1_LIBREMIDI_FOUNDATION.md`](T2482_P1_1_LIBREMIDI_FOUNDATION.md).
**Related:** [`MIDI_SERVICES.md`](MIDI_SERVICES.md), [`CONTROLLER_LAYER.md`](CONTROLLER_LAYER.md).

---

## 1. Why this exists

P1.1 lands the libremidi foundation + SPSC shm event ring — **physical MIDI bytes get into the controller-host process**. P1.2 lands what happens next: those bytes are dispatched through a **Mixxx-pattern ControllerEngine** (a `Map2MappingEngine` instance per controller) that runs the device-pack JS logic to translate hardware events into engine actions.

Without P1.2, P1.1 only gives us a faster pipe — the dispatch is still in Python land. P1.2 is what closes the loop and lets us retire `app/services/midi_hub/` entirely.

---

## 2. What's already in place (audit, 2026-04-30)

This is more advanced than the worklist implies. `juce-engine/Source/ControllerHost/` already has:

| File | Lines | Status |
|---|---|---|
| `MappingEngine/Map2MappingEngine.{h,cpp}` | 165 + 241 | Surface complete: `MappingControlSpec`, `MappingDescriptorSpec`, `OutboundShortMidi`, `OutboundSysExMidi`, `loadDescriptor()`, `planDispatch()`, `dispatch()`, `drainShortMidi()`, `drainSysExMidi()`. |
| `MappingEngine/ControlObjectBridge.{h,cpp}` | (header) + 165 | Mixxx alias-table bridge present (translates `[ChannelN]`/`group_key` Mixxx targets into MAP2 engine targets). |
| `QuickJSEngine.{h,cpp}` | (header) + 162 | QuickJS embedded; `engine.*` host surface installed via `EngineApiBindings`. |
| `EngineApiBindings.{h,cpp}` | (sized) | `engine.setValue` / `getValue` / `trigger` / `log*` — already wired. |
| `Midi/Map2MidiBackend.{h,cpp}` | (sized) | Backend wrapping libremidi; pulls events from libremidi callbacks into a queue. |
| `Midi/LibremidiAdapter.{h,cpp}` | (sized) | libremidi adapter. **Already vendored.** This rewrites the P1.1 plan: §5 P1.1.a is partially done. |
| `EventRing/ShmEventRing.{h,cpp}` | (sized) | SPSC shm event ring. **Already implemented.** P1.1 §3 is partially done. |
| `Hid/Map2HidController.{h,cpp}` | (sized) | HID controller surface (separate from MIDI; Mixxx-style HID device support). |
| `Bulk/Map2BulkController.{h,cpp}` | (sized) | Bulk-transfer USB controller surface. |
| `Hub/ClusterGateway.{h,cpp}` | (sized) | Cluster master/slave gateway scaffold (T2459-H6/H7). |
| `IpcMessages.h` | (sized) | UDS protocol envelope definitions (Python ↔ host). |
| `main.cpp` | 1012 | Process entry point with main loop (line 59 references "T2459-H2" as the proper request dispatcher). |

Python side:
- `app/services/controller_host_service.py` (408 lines) — Python's interface to the daemon.
- `app/schemas/controller_host.py` — IPC schemas.
- pytest suites: `test_controller_host_{ipc_schema,service,quickjs,failure_injection,main_loop_t2459h3,main_loop_t2459h3_slice5,main_loop_t2459h3_slice6,ump_roundtrip_t2459h5}.py` — 8 test files exercising the host's main loop, QuickJS bridge, IPC envelope, and failure modes.

**Implication:** the worklist line "P1.2 — Mixxx ControllerEngine (planned)" overstates what's missing. The infrastructure is there; the gap is **integration glue + the B5 fixture golden-test pass**, not the engine itself.

---

## 3. Gap analysis — what's actually missing

The integration gap, in priority order:

### Gap A — the request dispatcher in main.cpp:59 isn't done
`main.cpp` line 59 explicitly references "T2459-H2" as the place where IPC requests should be routed to `Map2MappingEngine::loadDescriptor()` / `dispatch()`. Today the main loop accepts MAPPING_ACTIVATE envelopes but doesn't fully wire them through to the mapping engine. The daemon can hold a Map2MappingEngine but doesn't yet **drive it** from incoming hardware events.

### Gap B — the libremidi → MappingEngine path isn't wired end-to-end
`Map2MidiBackend` produces events; `Map2MappingEngine::planDispatch()` consumes events. The plumbing **between** them — the per-event "look up which controller_key this came from, planDispatch, dispatch, drain outbound" loop — is the H2 deliverable. Currently the dispatch happens in Python land via `app/services/midi_hub/router.py`.

### Gap C — outbound MIDI back-loop
`drainShortMidi()` / `drainSysExMidi()` enqueue outbound bytes. The path from "drain queue" → "send to libremidi output port" needs a writer thread inside `Map2MidiBackend`. The plumbing exists in skeleton; the connecting code does not.

### Gap D — the B5 fixture round-trip (Mixxx XML → MappingDescriptorSpec → JS exec → outbound)
The Mixxx XML-import code (`device-packs/_mixx-imports/` + the Python `mixxx_import` service) emits something close to `MappingDescriptorSpec`; the conversion to the C++ wire form needs auditing for fidelity. The B5 golden-test pass should:
1. Take a real Mixxx XML mapping (e.g., the imported NI Maschine MK1 mapping).
2. Convert it to `MappingDescriptorSpec` Python-side.
3. Send via IPC to the host.
4. Inject a known sequence of MIDI events.
5. Capture outbound + verify byte-identical match with a recorded Mixxx baseline run.

### Gap E — hot-reload + per-controller isolation
Today QuickJS is a single engine instance per host process. The H2 contract calls for **per-controller isolation** (one bad mapping doesn't poison sibling controllers) + **hot-reload** (operator edits a device-pack JS file → host re-compiles + swaps without dropping the controller). The header-level surface supports this; the implementation needs a per-controller QuickJS context (or, more pragmatically, a per-controller global namespace inside one shared QuickJS context with strict isolation).

### Gap F — IPC schema completeness for the operator surface
The schemas in `app/schemas/controller_host.py` cover MAPPING_ACTIVATE; they need:
- `MAPPING_DEACTIVATE(controller_key)` — operator unloads a mapping.
- `MAPPING_RELOAD(controller_key, descriptor)` — hot-reload entry point.
- `EVENT_FEEDBACK(controller_key, ...)` — host-to-Python pushback when a JS exception occurs in a mapping (so the UI can surface it).
- `CONTROLLER_LIST` / `CONTROLLER_STATUS(controller_key)` — operator UI introspection.

### Gap G — XML→Spec converter living in Python is duplicated by the C++ XML reader
The CONTROLLER_LAYER.md mentions a Mixxx XML reader. There are now two paths to a `MappingDescriptorSpec`: Python-side conversion (via `device-packs` already imported from Mixxx XML) and a hypothetical C++-side reader. **Decision** for P1.2: keep the conversion Python-side. The host accepts `MappingDescriptorSpec` over IPC and never reads XML directly. This is cleaner: Python owns the device-pack format (YAML+JS), and the Mixxx XML import is a one-shot offline conversion (the `_mixx-imports/` corpus already exists). Removes a deserializer from the audio-adjacent process.

---

## 4. Proposed P1.2 phases (4 sub-phases)

### P1.2.a — wire the request dispatcher in main.cpp (3 days)
- Implement the routing in `main.cpp` for MAPPING_ACTIVATE/DEACTIVATE/RELOAD envelopes → `Map2MappingEngine::loadDescriptor()` / `clear()`.
- Add a per-controller registry (controller_key → loaded descriptor + libremidi port handle).
- pytest: `tests/test_controller_host_main_loop_t2459h3*` already covers the main loop framework — extend with a slice for MAPPING_ACTIVATE → loadDescriptor verification.

### P1.2.b — wire libremidi → MappingEngine end-to-end (1 week)
- In `Map2MidiBackend`, on each inbound event: look up controller_key from the libremidi port_id, call `mapping_engine.planDispatch()`, then `mapping_engine.dispatch()`, then drain outbound + write back to libremidi.
- Drain interval: synchronous in the inbound thread for MIDI events (latency-critical); the engine queue drain remains async on the IPC writer for log + `engine.setValue` actions.
- Soak test: 1-hour synthetic event injector, verify steady-state CPU < 5% on the controller-host core.

### P1.2.c — outbound MIDI back-loop (3 days)
- Writer side of `Map2MidiBackend` reads from `mapping_engine.drainShortMidi()` / `drainSysExMidi()` and sends via libremidi output ports.
- The drain happens in the same loop iteration as inbound dispatch (low-latency outbound feedback for LED echo etc.).
- Test: round-trip a `midi.sendShortMsg(0xB0, 64, 127)` from a mapping JS through to a libremidi output port, capture via virtual ALSA seq port, assert byte-identical.

### P1.2.d — B5 fixture golden-test pass (1 week)
- Pick the canonical golden fixture (NI Maschine MK1 — already imported from Mixxx).
- Capture a "ground truth" run from a vanilla Mixxx with the same mapping (one-time offline; checked-in as a fixture).
- Write `tests/test_controller_host_mixxx_b5_golden.py` that:
  1. Loads the descriptor.
  2. Replays the recorded MIDI input sequence through the host.
  3. Captures `engine.setValue` calls + outbound MIDI.
  4. Asserts byte-equal match with the ground truth.
- A failing test = either a regression in the JS engine OR a divergence from Mixxx's ControllerEngine semantics. Either way it's a real bug; treat the assertion as a hard gate.

### P1.2.e — operator surface IPC + per-controller isolation (1 week, can run parallel with d)
- Implement Gap F schemas (`MAPPING_DEACTIVATE`, `MAPPING_RELOAD`, `EVENT_FEEDBACK`, `CONTROLLER_LIST`, `CONTROLLER_STATUS`).
- Per-controller isolation: namespaces on the QuickJS global so `controller_a.IntelFX` and `controller_b.IntelFX` don't collide. Either via separate global objects or by injecting controller-key prefixes on `var X = X || {}` declarations at descriptor-load time. Decision pending; both work, the former is cleaner, the latter is faster.
- Hot-reload: on `MAPPING_RELOAD`, drop the prior controller's namespace + reinstall — no need to re-create the QuickJS context.

---

## 5. Definition of Done

P1.2 is `[✓] Done` when **every** gate passes:

1. **Request dispatcher routes every IPC envelope** — `main.cpp` line 59 TODO removed; MAPPING_ACTIVATE/DEACTIVATE/RELOAD all wired.
2. **End-to-end inbound path live** — physical MIDI in → libremidi → Map2MidiBackend → Map2MappingEngine.dispatch → engine.setValue applied to MAP2 audio engine. Verified on at least 2 device-packs (one MIDI-only e.g. MPX-1 via JS port from iter 35, one HID e.g. Maschine MK1).
3. **Outbound back-loop live** — JS `midi.sendShortMsg()` reaches a real output port. Verified via the iter 35 MPX-1 `bypass_feedback()` round-trip.
4. **B5 golden-test green** — `tests/test_controller_host_mixxx_b5_golden.py` passes byte-equal against the recorded Mixxx ground truth.
5. **Per-controller isolation verified** — load 2 mappings with conflicting global names; assert no cross-contamination.
6. **Hot-reload works in-band** — operator-triggered reload drops + reinstalls without dropping the controller's port handle.
7. **`app/services/midi_hub/router.py` routing logic deleted** — the controller-host owns dispatch; the Python router is dead code.
8. **Latency p99 < 200 µs** — inbound MIDI byte → engine.setValue applied. Logged in `docs/fit-for-purpose-evidence/<YYYYMMDD>/`.
9. **Dual-pushed** — every commit on origin + gitlab.

---

## 6. Risks + mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Mixxx XML format drift across versions causes B5 fixture brittleness | low | The XML imports are checked-in (offline, one-shot conversion). Mixxx upstream changes don't affect the imported descriptors — they're frozen. |
| QuickJS lacks features Mixxx ControllerEngine relies on (e.g., `print` global, certain ES2017 features) | medium | Existing QuickJSEngine + EngineApiBindings already shim the gaps; B5 golden test is the catch-all that surfaces missing shims. |
| Per-controller isolation via shared QuickJS context has subtle bugs (one mapping leaks globals) | medium | Wrap descriptor scripts in IIFE during load (`(function() { ... })()`). Validates isolation without a per-controller context. |
| Outbound back-loop adds latency to inbound dispatch loop | low | Drain is bounded per iteration (max N events per pass); spillover left for next iteration. Measured under P1.2.b soak. |
| The hot-reload code path is rarely exercised → bugs in production | medium | Add a `MAPPING_RELOAD` invocation to the smoke test on every controller-host startup; if it fails, daemon refuses to start. |
| The 8 existing pytest suites assume current main_loop semantics; adding routing logic breaks them | medium | The slice tests (`*_slice5.py`, `*_slice6.py`) suggest an incremental pattern — each P1.2 phase ships its own slice, additive not replacing. |

---

## 7. Open questions (to resolve before P1.2.a starts)

1. **fast_path control opt-in surface.** `MappingControlSpec.fast_path` is in the wire form. The C++-side bypass (CONTROLLER_LAYER.md §4 line 119) needs a registration call from `loadDescriptor` into `Map2MidiController::dispatch()`. Does the existing `Map2MidiController` (still in `juce-engine/Source/Map2MidiController.cpp`?) survive in P1.2 form, or does the controller-host fully subsume it? Decision needed; leans toward "subsume" since the audio engine should not link libremidi or QuickJS.
2. **HID parity.** P1.2 description lists MIDI but `Map2HidController` exists with the same shape. Should HID dispatch also flow through `Map2MappingEngine`, or stay in its own engine? The Mixxx pattern uses **one** ControllerEngine for both; recommend the same — single QuickJSEngine + shared `engine.*` surface. Confirm before coding.
3. **EVENT_FEEDBACK push frequency.** Each JS exception pushes an envelope to Python. Bound the rate (e.g., max 10/sec/controller) so a runaway buggy mapping can't flood the IPC writer. Suggest token-bucket on the host side.
4. **Mixxx XML reader retirement.** If the C++ XML reader still exists in `juce-engine/Source/ControllerHost/`, P1.2 should delete it (Gap G) — Python owns conversion. Verify nothing else links it before deletion.

---

## 8. Cross-references

- T2482-P1.1 ([`T2482_P1_1_LIBREMIDI_FOUNDATION.md`](T2482_P1_1_LIBREMIDI_FOUNDATION.md)): the libremidi I/O foundation P1.2 builds on. P1.1 audit revealed the LibremidiAdapter is already vendored — accelerate P1.1 timeline.
- T2482-P1.5 (iters 35-37): MPX-1, IntelFX, GCP SysEx parsers already ported to JS in device-packs. P1.2.b can verify the ports with real hardware.
- `juce-engine/Source/ControllerHost/MappingEngine/Map2MappingEngine.{h,cpp}` — the engine class P1.2 wires up.
- `app/services/controller_host_service.py` — Python's IPC client.
- `tests/test_controller_host_*` — 8 existing test files that the P1.2 slices extend (additive pattern; preserve existing semantics).
- `device-packs/_mixx-imports/` — the imported Mixxx mappings used as B5 fixtures.

---

## 9. Iter-39 outcome

This document is **gap analysis**, not new design — the heavy architectural decisions are in `CONTROLLER_LAYER.md` and the existing `Map2MappingEngine.h` already encodes the contract. The contribution here is:

1. Inventory of what exists (§2) — corrects a worklist understatement.
2. Concrete gap list (§3) — 7 enumerated gaps with specific files/lines.
3. 5-phase implementation plan (§4) sized for ~3 weeks of focused work.
4. Hard DoD gates (§5) including a B5 golden-test as the integration proof.
5. Risk register (§6) and 4 open questions (§7) to lock down before code starts.

P1.2 implementation is **not started** as part of iter 39 — design only. Proceed to iter 40 (SHIP loop 4 roll-up) and queue P1.2 implementation as a dedicated work cycle after the SHIP loop closes.
