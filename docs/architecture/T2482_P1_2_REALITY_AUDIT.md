# T2482-P1.2 — Reality audit (supersedes iter-39 design-doc gap counts)

**Date:** 2026-04-30 (iter 61, SHIP loop 7).
**Supersedes:** [`T2482_P1_2_CONTROLLERENGINE_INTEGRATION.md`](T2482_P1_2_CONTROLLERENGINE_INTEGRATION.md) §3.
**Pattern:** mirrors the iter-41 P1.1 reality audit — the foundation turned out to be more shipped than the design doc claimed.

---

## What's already wired (re-verified live, 2026-04-30)

The iter-39 design doc's §3 listed 7 integration gaps (A–G). After re-reading `juce-engine/Source/ControllerHost/main.cpp` (1012 lines, unchanged since iter-39):

### Gap A — request dispatcher in `main.cpp` ✅ MOSTLY DONE

The "TODO" comment at `main.cpp:59` is misleading — it talks about full JSON parsing, not mapping activation. The actual dispatch is already wired for 5 of the 7 IPC envelope types defined in `IpcMessages.h`:

| Envelope | Status | Line |
|---|---|---|
| `shutdown` | ✅ wired | 770 |
| `midi_list_ports_request` | ✅ wired | 780 |
| `midi_open_input_request` | ✅ wired | 791 |
| `script_load_request` | ✅ wired | 853 |
| `mapping_activate` | ✅ wired (calls `mapping_engine.loadDescriptor()`) | 881–956 |
| `mapping_deactivate` | ❌ not in IPC schema | — |
| `mapping_reload` | ❌ not in IPC schema | — |

Real Gap A scope: just the missing 2 envelopes (deactivate + reload). Not "Gap A is unstarted" as iter-39 claimed.

### Gap B — libremidi → MappingEngine end-to-end ⚠️ PARTIALLY WIRED

`Map2MidiBackend::adapter()` exists; `LibremidiAdapter` is configured to push events into the shm event ring. The `Map2MappingEngine` has `planDispatch()` + `dispatch()`. **What's missing**: the per-event "look up controller_key from libremidi port_id, call planDispatch, dispatch, drain outbound" loop is not in `main.cpp`. The events flow into the shm ring but no consumer in the host pulls them out and runs them through the mapping engine. JS-side handlers run only when invoked via the existing IPC paths (`script_load_request`).

For SHIP loop 7 this is the **biggest remaining gap**. Estimated 2–3 iters of focused C++ work.

### Gap C — outbound MIDI back-loop ⚠️ PARTIALLY WIRED

`mapping_engine.drainShortMidi()` and `drainSysExMidi()` are called at `main.cpp:608–612` (inside the IPC writer loop) — drained outbound bytes get sent BACK to the connected Python client as `midi_send_request` IPC frames, **not** to a libremidi output port. That's the wrong destination for production: the Python backend is supposed to be a thin client of the host, not the place where outbound MIDI gets routed.

The real fix: drain into `Map2MidiBackend::adapter()`'s output port for the matching controller_key. Approximately 1 iter once Gap B is in place.

### Gap D — B5 fixture round-trip ❌ NOT STARTED

No `tests/test_controller_host_mixxx_b5_golden.py` exists. `device-packs/_mixx-imports/` does have NI Maschine MK1 fixtures imported from Mixxx but no recorded ground-truth ControllerEngine output to compare against.

This is the integration-proof gate. Two-iter shape: iter to record baseline, iter to write the comparator.

### Gap E — hot-reload + per-controller isolation ⚠️ NEEDS DESIGN VERIFICATION

`Map2MappingEngine::loadDescriptor` overwrites the descriptor for a controller_key and `mapping_engine.js()` is a single QuickJS context. Loading two descriptors for two controllers can cross-contaminate global state because both controllers' JS evaluates against the same global object. Per the iter-39 design, the recommended fix is IIFE wrapping at descriptor-load time — small change, high impact.

### Gap F — IPC schema completeness ❌ NOT WIRED

The 4 missing envelopes from the iter-39 design:
- `MAPPING_DEACTIVATE(controller_key)` — Python schema MISSING + C++ struct MISSING
- `MAPPING_RELOAD(controller_key, descriptor)` — Python schema MISSING + C++ struct MISSING
- `EVENT_FEEDBACK(controller_key, ...)` — Python schema MISSING + C++ struct MISSING
- `CONTROLLER_LIST` / `CONTROLLER_STATUS` — Python schema MISSING + C++ struct MISSING

Iter 62 (Python schemas) + iter 63 (C++ structs + sync test) covers Gap F.1 and F.2 minus `CONTROLLER_LIST`/`STATUS` (queued post-loop-7).

### Gap G — Mixxx XML reader retirement ✅ ALREADY DECIDED

The C++ ControllerHost source contains no XML reader; iter-39's "delete it if it exists" is a no-op. Python owns conversion via `device-packs/_mixx-imports/` (offline, one-shot). Gap G is closed.

---

## Revised P1.2 timeline

| Phase | iter-39 estimate | Revised | Status |
|---|---|---|---|
| Gap A request dispatcher (deactivate + reload) | 3 days | 2 iters (62-63 IPC + 64 wire) | pending |
| Gap B libremidi → MappingEngine | 1 week | 2 iters (post-loop-7) | DEFERRED |
| Gap C outbound back-loop | 3 days | 1 iter (post-loop-7) | DEFERRED — depends on B |
| Gap D B5 golden test | 1 week | 3 iters (65-67) | pending |
| Gap E hot-reload + isolation | 1 week | 1 iter (68) | pending |
| Gap F IPC schema completeness | (not estimated) | 2 iters (62-63) — same as A | pending |
| Gap G XML reader retirement | (not estimated) | DONE | closed |

**Total remaining for full P1.2**: ~7 iters of code work + 1 of latency measurement = 8 iters. Loop 7 ships **iter 62-69 (8 iters)** = the full P1.2 implementation modulo Gaps B+C which are deeper C++ work and ship in loop 8.

This re-audit cuts the iter-39 "~3 weeks" estimate in half — most of the surface was already done; the gap was the audit's accuracy, not the implementation status.

---

## Loop 7 plan (revised based on this audit)

| Iter | Goal |
|---|---|
| 61 | THIS DOC. Re-audit identifying actually-shipped surface vs iter-39 design doc. |
| 62 | Gap F.1 — Python IPC envelopes for `MAPPING_DEACTIVATE`, `MAPPING_RELOAD`, `EVENT_FEEDBACK` |
| 63 | Gap F.2 — C++ IPC mirror structs + schema-sync test + `IpcMessages.h` documentation |
| 64 | Gap A — wire the 2 new envelopes into `main.cpp` dispatcher |
| 65 | B5 fixture prep — pick the canonical Mixxx XML mapping; record baseline ControllerEngine trace |
| 66 | B5 round-trip skeleton — `tests/test_controller_host_mixxx_b5_golden.py` shell |
| 67 | B5 byte-equal — ground truth comparator + iterate on shim gaps until green |
| 68 | Gap E — IIFE descriptor-load wrap + per-controller isolation tests |
| 69 | Audio-thread engine-side latency measurement (deferred Gap C from iter 50) |
| 70 | SHIP loop 7 roll-up + Phase 3 readiness gate v4 |

**Deferred to SHIP loop 8** (the deepest C++ surface): Gap B (libremidi → MappingEngine end-to-end loop in `main.cpp`) + Gap C (outbound back-loop to libremidi instead of IPC frame). Both depend on the iter-69 latency measurement informing how the loop should be shaped.

---

## Cross-references

- iter-39 design doc: [`T2482_P1_2_CONTROLLERENGINE_INTEGRATION.md`](T2482_P1_2_CONTROLLERENGINE_INTEGRATION.md). The audit version above the line in §1 there should now read "supersedes — see T2482_P1_2_REALITY_AUDIT.md for current state."
- iter-41 P1.1 audit: [`T2482_P1_1_REALITY_AUDIT.md`](T2482_P1_1_REALITY_AUDIT.md). Same shape — the iter-50/iter-60 SHIP loops then implemented from the realistic baseline.
- `juce-engine/Source/ControllerHost/main.cpp` lines 770/780/791/853/881 — already-wired IPC dispatch.
- `juce-engine/Source/ControllerHost/MappingEngine/Map2MappingEngine.{h,cpp}` — engine surface already complete.
- `app/schemas/controller_host.py` — Python IPC schemas; iter 62 adds the 3 missing envelopes.
- `juce-engine/Source/ControllerHost/IpcMessages.h` — C++ struct mirrors; iter 63 adds the 3 missing structs + sync test.
