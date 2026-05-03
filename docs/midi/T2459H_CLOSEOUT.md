# T2459-H Closeout — MIDI Backend Unification

**Last updated:** 2026-05-03
**Owner:** T2459-H (parent: T2459 Controller / Mapping / Device-Pack Subsystem)
**Status:** Code-side complete on H1, H2, H7, and slices 1–17 of H3/H4/H5/H6. Bench-side HIL acceptance gates remain.

## Goal Recap

Fold all MIDI ownership into the `map2-controller-host` process: libremidi I/O, Mixxx ControllerEngine for mappings, shm event ring to the JUCE engine, devices become XML+JS device-packs. Retire `python-rtmidi`, `Map2MidiController.cpp`, and the seven legacy MIDI route modules.

## Subtask Status

### T2459-H1 — libremidi I/O foundation in `map2-controller-host` + shm event ring
**Status:** ✅ Done 2026-04-28.
- libremidi v5.1.0 vendored via FetchContent; ALSA Raw + ALSA UMP + JACK + PipeWire all probed.
- Two-ring shm: RT (1024 slots × 320 B) + Control (256 slots), p99 < 100 µs proven (90.4 µs measured).
- Status-byte classifier branchless ~5 ns.
- `MidiHostClient.list_ports()` returns a port-info parity-shape with the legacy `python-rtmidi` enumeration.

### T2459-H2 — Mixxx ControllerEngine integration (QJSEngine + XML loader)
**Status:** ✅ Done 2026-04-28.
- `Map2MappingEngine` ports the Mixxx ControllerEngine pattern, re-uses the QuickJS instance from T2459-B2.
- ControlObjectBridge: 226 well-known `[Master]` + `[ChannelN]` keys; per-pack `alias_table` overrides.
- `midi.sendShortMsg` + `midi.sendSysexMsg` JS bindings registered.
- 353 assertions / 59 cases green.

### T2459-H3 — First device-pack cutover (MeloAudio Commander)
**Status:** [>] In Progress (code-side complete; bench HIL pending).
- Slices 1–6 shipped 2026-04-28: MeloAudio device-pack on disk; ProfileRegistry alias resolution; `MidiHostClient.load_script` + `activate_mapping`; host main-loop dispatcher consumes `script_load_request` + `mapping_activate`; pre-activation guard for unresolved scripts; live libremidi ingestion → `planDispatch` → `dispatch` → engine_command emission; multi-controller routing via `Slot::controllerIndex`.
- **HIL gate (remaining):** physical MeloAudio Commander on the bench drives chain-bypass + tuner-on through the new path; HIL evidence captured under `docs/fit-for-purpose-evidence/<YYYYMMDD>/t2459h3-meloaudio-commander/`.

### T2459-H4 — Migrate device services to device-packs
**Status:** [>] In Progress (code-side complete; HID/USB control surface migration + bench HIL pending).
- Slices 1–9 shipped 2026-04-28 + 2026-05-03: shared `app/midi/curves.py` (CurveType consolidation); `app/services/sysex_tags.py` shared helper; `device-packs/_runtime/sysex-tags.js` JS runtime; `compile_mpx1_tag_map_via_js` + `compile_intelfx_tag_map_via_js` Python facades behind `MAP2_SYSEX_PARSER_USE_JS_RUNTIME`; **Slice 7 (M1 today)** wired Lexicon MPX-1 device-pack into the registry; **Slice 8 (M2 today)** wired Rocktron IntelFX; **Slice 9 (M3 today)** silent fallback when the JS runtime is unavailable + once-per-process warning. Maschine MK1 MIDI-mode pack also shipped (Slice 6) — control inventory of 60 rows.
- **HIL gate (remaining):** Maschine MK1 HID/USB control surface migration (daemon → host-client facade, LED choreography to device-pack runtime); bench HIL parity with UA-1000 + Maschine MK1 + MPX-1 + IntelFX.

### T2459-H5 — Absorb MIDI Hub v2 into the host
**Status:** [>] In Progress (code-side broad; HIL UMP gate + per-slice C++ ports remaining).
- Slices 1–17 shipped 2026-04-28 + 2026-05-03:
  - Slice 1: Unified `app/routes/midi.py` aggregator.
  - Slice 2: `app/main.py` route_modules registers the unified router.
  - Slices 3–8: `MIDI_HUB_AVAILABLE` boolean gating retired across `midi_v2`, `midi_service`, `midi_learn`, `midi_broadcast`, `midi_engine`, `sysex_device_bridge`. Replaced with concrete callable-availability checks.
  - Slice 9: `MIDI_HUB_AVAILABLE` retired from `midi_v2`.
  - Slice 10: Regression guard test prevents the boolean from reappearing.
  - Slice 11: Legacy MIDI surfaces marked `deprecated=True` in OpenAPI via the unified router.
  - Slice 12: 410-Gone retirement gate behind `MAP2_MIDI_LEGACY_RETIRED` env var, with `Sunset` / `Link` / `Deprecation` headers + canonical error envelope.
  - Slice 13: Host-owned UMP round-trip foundation (classifier, slot discriminator, IPC additive `format` field, `MidiHostClient.send_ump`) + recorder golden-parity plumbing.
  - **Slice 14 (M5 today):** MIDI Hub absorption audit doc + coverage gate (`docs/midi/MIDI_HUB_ABSORPTION_AUDIT.md`).
  - **Slice 15 (M6 today):** `GET /api/v2/midi/legacy_retirement_status` operator-visible retirement schedule.
  - **Slice 16 (M7 today):** `GET /api/v2/midi/ump/capabilities` honest-state envelope.
  - **Slice 17 (M8 today):** Legacy MIDI routes carry `Sunset` / `Link` / `Deprecation` headers at runtime during the deprecation window + route-registration policy fix.
- **HIL gate (remaining):** end-to-end UMP traffic against a MIDI-2.0-capable device on the bench. Blocked on libremidi v5.1.0 vendored not exposing a validated UMP I/O API for our backends; T2491-13 closes via libremidi version bump.
- **Software remaining (queued, not blocking):** Per-slice C++ ports of host-eligible modules from the absorption audit (clock-master, transforms, scheduler, router core).

### T2459-H6 — Retire `Map2MidiController` raw-ALSA path
**Status:** [ ] Todo (code-side complete; HIL soak + atomic deletion PR pending).
- Slice 1 shipped 2026-04-28: caller audit, CMake retirement gate (`MAP2_USE_LEGACY_MIDI_CONTROLLER` ON/OFF), runbook, soak-harness MIDI extension, audit-test EXPECTED set.
- **Slice 2 (M4 today):** `IpcMidiBridgeController` factory adapter — closes the deletion-blocking factory gap from Slice 1. The OFF build now returns a working `Map2Controller` (drains shm event ring) instead of `nullptr`. Both ON and OFF builds link cleanly: 17/17 (ON) + 19/19 (OFF) Catch2 assertions across 8 cases.
- **HIL gate (remaining):** 30-min soak with `--threshold-max-xruns 0 --threshold-max-peak-jitter-ms 0.35` and `--midi-driver host`; once green, atomic deletion PR per `docs/midi/MAP2MIDICONTROLLER_RETIREMENT.md` §4.

### T2459-H7 — Cluster MIDI host-to-host protocol
**Status:** ✅ Done 2026-04-28.
- Wire spec: `docs/midi/CLUSTER_MIDI_PROTOCOL.md`.
- Production runtime: `app/services/midi_hub/cluster_gateway.py`.
- C++ scaffold: `juce-engine/Source/ControllerHost/Hub/ClusterGateway.{h,cpp}`.
- `app/routes/midi_cluster_proxy.py` deleted.
- 10 pytest + 6 Catch2 cases green.

## Combined Test Surface (post-M9)

| Suite | Count |
|---|---|
| `tests/test_midi_curve_type_consolidation_t2459h4.py` | small |
| `tests/test_sysex_tags_shared_t2459h4.py` | small |
| `tests/test_sysex_tags_runtime_js_t2459h4.py` | small |
| `tests/test_mpx1_syx_parser_js_runtime_t2459h4.py` | 4 |
| `tests/test_intelfx_syx_parser_js_runtime_t2459h4.py` | 4 |
| `tests/test_maschine_mk1_pack_t2459h4.py` | 8 |
| `tests/test_lexicon_mpx1_pack_t2459h4.py` (M1) | 8 |
| `tests/test_rocktron_intelfx_pack_t2459h4.py` (M2) | 8 |
| `tests/test_sysex_parser_js_runtime_fallback_t2459h4.py` (M3) | 5 |
| `tests/test_midi_device_profiles_t2459h3.py` | 7 |
| `tests/test_midi_host_client_t2459h1.py` | small |
| `tests/test_midi_host_client_t2459h3.py` | small |
| `tests/test_controller_host_main_loop_t2459h3.py` | small |
| `tests/test_controller_host_main_loop_t2459h3_slice5.py` | small |
| `tests/test_controller_host_main_loop_t2459h3_slice6.py` | small |
| `tests/test_controller_host_ipc_schema.py` | small |
| `tests/test_controller_host_ump_roundtrip_t2459h5.py` | 5 |
| `tests/test_midi_recorder_golden_parity_t2459h5.py` | 2 |
| `tests/test_midi_unified_routes_t2459h5.py` | small |
| `tests/test_midi_v1_retirement_t2459h5.py` | 5 |
| `tests/test_midi_legacy_retirement_status_t2459h5.py` (M6) | 6 |
| `tests/test_midi_ump_capabilities_t2459h5.py` (M7) | 6 |
| `tests/test_midi_legacy_deprecation_headers_t2459h5.py` (M8) | 3 |
| `tests/test_midi_hub_absorption_audit_t2459h5.py` (M5) | 4 |
| `tests/test_midi_hub_available_guard_t2459h5.py` | small |
| `tests/test_map2midicontroller_caller_audit_t2459h6.py` | 6 |
| `tests/test_soak_harness_midi_extension_t2459h6.py` | 5 |
| `tests/test_cluster_midi_gateway.py` | 10 |
| **Catch2: `controller_host_tests`** | 435 assertions / 69 cases (post-Slice 6) |
| **Catch2: `controllers_tests` ON** | 17 assertions / 8 cases |
| **Catch2: `controllers_tests` OFF** (M4) | 19 assertions / 8 cases |

**Total MIDI test surface:** ~80+ pytest cases + 471+ Catch2 assertions.

## Remaining HIL Acceptance Gates (Hardware-bound)

| Gate | Hardware required | Worklist |
|---|---|---|
| MeloAudio Commander cutover | Bench MeloAudio Commander unit + UA-1000 | T2459-H3 |
| Maschine MK1 HID/USB migration | Bench Maschine MK1 + UA-1000 | T2459-H4 |
| MPX-1 / IntelFX SysEx parity | Bench MPX-1 + IntelFX (optional — synthetic dumps cover the parser path) | T2459-H4 |
| Map2MidiController deletion soak | UA-1000 + 30-min audio soak with `--midi-driver host` | T2459-H6 |
| MIDI 2.0 / UMP I/O | libremidi version bump + MIDI-2.0-capable device on the bench | T2459-H5 (Slice 13 follow-up) + T2491-13 |
| Cluster MIDI multi-host | Bench setup with at least one secondary host or simulator | T2459-H7 (already shipped via simulator) |

## Cross-References

- Worklist: `docs/PROJECT_WORKLIST.md` (T2459, T2459-H, T2459-H1..H7)
- Architecture: `docs/midi/MIDI_BACKEND.md`, `docs/midi/MIDI_HUB_ARCHITECTURE.md`
- Absorption audit: `docs/midi/MIDI_HUB_ABSORPTION_AUDIT.md` (M5 today)
- Cluster protocol: `docs/midi/CLUSTER_MIDI_PROTOCOL.md`
- Retirement runbook: `docs/midi/MAP2MIDICONTROLLER_RETIREMENT.md`
