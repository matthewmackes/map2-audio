# T2459-H Closeout — MIDI Backend Unification

**Last updated:** 2026-05-06
**Owner:** T2459-H (parent: T2459 Controller / Mapping / Device-Pack Subsystem)
**Status:** Code-side complete on H1, H2, H7, all H4 software (Maschine MK1 HID/USB migration code-side complete through slice 16), and slices 1–20 across H3/H4/H5/H6. Bench-side HIL acceptance gates remain.

## Goal Recap

Fold all MIDI ownership into the `map2-controller-host` process: libremidi I/O, Mixxx ControllerEngine for mappings, shm event ring to the JUCE engine, devices become XML+JS device-packs. Retire `python-rtmidi`, `Map2MidiController.cpp`, and the seven legacy MIDI route modules.

## Subtask Status

### Cycle 65 (2026-05-06) update

Delta since 2026-05-03: H4 advanced through seven Maschine-MK1 HID/USB migration slices (10–16), closing the previously-pending code-side migration. The new path now has a documented scope (slice 10), a host-client transport facade (slice 11), env-flag-gated daemon wiring (slice 12), an IPC envelope contract (slice 13), an engine-side HID parser (slice 14), a bulk-frame router (slice 15), and a caller-audit pin replacing the originally-planned build-time flag (slice 16). H5 also picked up slice 20: an operator-visible v1 retirement banner that wires slice 15's `legacy_retirement_status` API into the MIDI Services UI. All H3/H4/H5/H6 subtasks remain `[>] In Progress` pending bench HIL gates.

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
**Status:** [>] In Progress (code-side complete including Maschine MK1 HID/USB migration through slice 16; bench HIL pending).
- Slices 1–9 shipped 2026-04-28 + 2026-05-03: shared `app/midi/curves.py` (CurveType consolidation); `app/services/sysex_tags.py` shared helper; `device-packs/_runtime/sysex-tags.js` JS runtime; `compile_mpx1_tag_map_via_js` + `compile_intelfx_tag_map_via_js` Python facades behind `MAP2_SYSEX_PARSER_USE_JS_RUNTIME`; **Slice 7 (M1)** wired Lexicon MPX-1 device-pack into the registry; **Slice 8 (M2)** wired Rocktron IntelFX; **Slice 9 (M3)** silent fallback when the JS runtime is unavailable + once-per-process warning. Maschine MK1 MIDI-mode pack also shipped (Slice 6) — control inventory of 60 rows.
- **Slice 10 shipped 2026-05-06:** Maschine MK1 HID/USB migration scope doc (`docs/midi/MASCHINE_MK1_HID_MIGRATION.md`) — caller audit, 18-module per-file inventory (Stays Python / Retire / Move to Host), 8-slice plan, Definition of Done — plus an audit-test pin (`tests/test_maschine_mk1_module_inventory_t2459h4.py`, 6 cases) that fails when classifications drift.
- **Slice 11 shipped 2026-05-06:** `MaschineMK1HostClientTransport` facade — `app/services/maschine/mk1_host_client_transport.py` (264 LoC), drop-in replacement for `mk1_usb_transport.py` with byte-identical public surface (open/close/initialize_device/write_leds/write_display_frame/read_pads/read_buttons_encoders/is_open). Stub mode until slices 13–15 wire IPC: client-construct failures logged, reads return `None`, writes counted as "dropped". 9-counter diagnostics snapshot exposed.
- **Slice 12 shipped 2026-05-06:** Wire host-client facade into `app/services/maschine/maschine_mk1_daemon.py` (line 360 onward) behind `MAP2_MASCHINE_HOST_CLIENT_TRANSPORT` env flag. New `_maschine_use_host_client_transport()` helper + `_build_maschine_mk1_transport()` factory; default-env returns legacy, truthy returns facade. Greppable pins enforce that direct `MaschineMK1UsbTransport(...)` calls in the run loop are forbidden.
- **Slice 13 shipped 2026-05-06:** Maschine IPC envelope contract — three new message types (`MaschineHidEvent`, `MaschineBulkFrame`, `MaschineInitRequest`) added to both `juce-engine/Source/ControllerHost/IpcMessages.h` and `app/schemas/controller_host.py`. All carry `controller_key="maschine-mk1"` to share the existing UDS connection. Direction pins enforce HidEvent in Outbound only, BulkFrame + InitRequest in Inbound only.
- **Slice 14 shipped 2026-05-06:** Maschine MK1 HID parser ported to controller-host — header-only `juce-engine/Source/ControllerHost/Hid/Map2MaschineMK1.h` with C++ ports of `decodePadReport` (12-bit pressure + threshold/release tracking), `decodeButtonReport` (gate-bit guard, Shift exclusion, 42 buttons), `decodeEncoderReport` (11 encoders, init-suppress, nibble-quadrant direction), and `isShiftHeld`. Wired into `controller_host_tests` Catch2 target. Regex parity guard caught a real drift on first run (kButtonShiftIndex 8 vs Python's 11).
- **Slice 15 shipped 2026-05-06:** Maschine MK1 bulk-frame router — header-only `juce-engine/Source/ControllerHost/Hid/Map2MaschineMK1Router.h` with `Map2MaschineMK1Router` consuming the slice-13 IPC envelopes and dispatching LED frames to `kEpControlOut`, display frames to `kEpDisplayOut`, and init packet sequences. Takes raw HID input from `EP_PADS_IN`/`EP_BUTTONS_IN`, runs slice-14 decoders, publishes `MaschineHidEvent` records via injectable callback. Transport + publisher are `std::function` injection points; 9-counter `RouterDiagnostics` mirrors the daemon-side counters.
- **Slice 16 shipped 2026-05-06:** Caller-audit pin for `mk1_usb_transport` (`tests/test_maschine_mk1_caller_audit_t2459h4.py`, 7 cases) — replaces the originally-planned `MAP2_USE_MASCHINE_USB_DIRECT` build-time flag (the slice-12 runtime flag already controls selection). Walks the repo and classifies every load-bearing import: 1 daemon caller (slice 18 deletes it), 12 bench scripts (survive slice 18 — they talk USB directly for diagnostics), 2 parity tests (compare facade vs. legacy surface). Total count pinned at 15.
- **HIL gate (remaining):** bench HIL parity with UA-1000 + Maschine MK1 + MPX-1 + IntelFX.

### T2459-H5 — Absorb MIDI Hub v2 into the host
**Status:** [✓] Done 2026-05-08 — code-side complete across 20 slices. The end-to-end UMP HIL gate is split into a sibling task (`T2459-H5-UMP-HIL`, Blocked) because it is double-blocked on (a) libremidi exposing a validated UMP I/O API and (b) MIDI-2.0-capable hardware on the bench — neither is a MAP2 source-side issue.
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
  - **Slice 17 (M8):** Legacy MIDI routes carry `Sunset` / `Link` / `Deprecation` headers at runtime during the deprecation window + route-registration policy fix.
  - **Slice 20 shipped 2026-05-06:** Operator-visible v1 retirement banner — closes the slice-15 loop (the API existed but was never wired into the UI). New `useMidiLegacyRetirement` TanStack Query hook (60 s poll). New `MidiLegacyRetirementBanner` Carbon InlineNotification renders four states: hidden during loading/error, info-tone countdown when `days_remaining > 7`, warning-tone countdown when ≤ 7, warning-tone "MIDI v1 routes retired" notification once `MAP2_MIDI_LEGACY_RETIRED` flips. Dismissible per-day via localStorage keyed on current `days_remaining`. Mounted in `MidiHubShell` above `<Outlet />` so it appears on every MIDI Services page.
- **HIL gate (split into sibling):** End-to-end UMP traffic against a MIDI-2.0-capable device is tracked under the new sibling `T2459-H5-UMP-HIL` (Blocked). Splitting unblocks H5 closure because the gate is hardware/library-blocked, not architectural — the engine-side UMP plumbing (classifier, slot discriminator, IPC `format` field, `MidiHostClient.send_ump`, `/api/v2/midi/ump/capabilities` honest-state surface) is fully shipped and self-tests.
- **Software remaining (queued, not blocking):** Per-slice C++ ports of host-eligible modules from the absorption audit (clock-master, transforms, scheduler, router core) tracked outside the H epic.

### T2459-H6 — Retire `Map2MidiController` raw-ALSA path
**Status:** [✓] Done 2026-05-08. Atomic deletion landed; the OFF build is the production build.
- Slice 1 (2026-04-28): caller audit, CMake retirement gate (`MAP2_USE_LEGACY_MIDI_CONTROLLER` ON/OFF), runbook, soak-harness MIDI extension, audit-test EXPECTED set.
- Slice 2 (2026-05-03): `IpcMidiBridgeController` factory adapter — OFF build returns a working `Map2Controller` draining the shm event ring. 17/17 ON + 19/19 OFF Catch2 assertions across 8 cases.
- Slice 3 (2026-05-07): one-command retirement-soak wrapper `./scripts/run_t2459h6_retirement_soak.sh` + runbook §C.
- **Closeout (2026-05-08):** Paired ON-vs-OFF 5-min soaks (JACK direct on UA-1000) showed OFF ≥ ON across every metric, 6.7× better on peak block jitter. `Map2MidiController.{cpp,h}` deleted; cmake option `MAP2_USE_LEGACY_MIDI_CONTROLLER` removed; factory returns `IpcMidiBridgeController` unconditionally. controllers_tests 19/19 + audit pytest 11/11 pass. Evidence at `docs/fit-for-purpose-evidence/20260508/t2459h6-shm-ring/CLOSEOUT.md`.

### T2459-H7 — Cluster MIDI host-to-host protocol
**Status:** ✅ Done 2026-04-28.
- Wire spec: `docs/midi/CLUSTER_MIDI_PROTOCOL.md`.
- Production runtime: `app/services/midi_hub/cluster_gateway.py`.
- C++ scaffold: `juce-engine/Source/ControllerHost/Hub/ClusterGateway.{h,cpp}`.
- `app/routes/midi_cluster_proxy.py` deleted.
- 10 pytest + 6 Catch2 cases green.

## Combined Test Surface (post-cycle-65)

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
| `tests/test_maschine_mk1_module_inventory_t2459h4.py` (Slice 10) | 6 |
| `tests/test_maschine_mk1_host_client_transport_t2459h4.py` (Slice 11) | 11 |
| `tests/test_maschine_mk1_daemon_transport_factory_t2459h4.py` (Slice 12) | 16 |
| `tests/test_maschine_ipc_envelopes_t2459h4.py` (Slice 13) | 16 |
| `tests/test_maschine_mk1_cpp_python_parity_t2459h4.py` (Slice 14) | 10 |
| `tests/test_maschine_mk1_router_pin_t2459h4.py` (Slice 15) | 11 |
| `tests/test_maschine_mk1_caller_audit_t2459h4.py` (Slice 16) | 7 |
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
| `web/.../MidiLegacyRetirementBanner.test.tsx` (Slice 20, jest) | 7 |
| **Catch2: `controller_host_tests`** | 435 assertions / 69 cases (pre-Slice 14) + Slice 14 `Map2MaschineMK1Tests.cpp` 16 cases + Slice 15 `Map2MaschineMK1RouterTests.cpp` 13 cases |
| **Catch2: `controllers_tests` ON** | 17 assertions / 8 cases |
| **Catch2: `controllers_tests` OFF** (M4) | 19 assertions / 8 cases |

**Total MIDI test surface:** ~165+ pytest cases + 7 jest cases (Slice 20) + 471+ Catch2 assertions across `controller_host_tests`/`controllers_tests` (post-cycle-65; running counts pinned by per-slice commit-message validations).

## Remaining HIL Acceptance Gates (Hardware-bound)

All remaining T2459-H gates are consolidated into a single bench-session runbook so an operator can close them in one sitting:

**Canonical bench-session runbook:** [`docs/midi/T2459_FINAL_BENCH_SESSION.md`](T2459_FINAL_BENCH_SESSION.md)

| Gate | Hardware required | Worklist |
|---|---|---|
| MeloAudio Commander cutover (closes H3 + H3-CFG) | Bench MeloAudio Commander unit + UA-1000 | T2459-H3, T2459-H3-CFG |
| Maschine MK1 + (optional) MPX-1 / IntelFX device-pack parity | Bench Maschine MK1 + UA-1000 (MPX-1 / IntelFX optional — JS-runtime parity already covered in CI) | T2459-H4 |
| PipeWire UMP-MIDI2 substrate Path 4 evidence (G1–G5) | Bench host with broken PipeWire UMP-MIDI2 substrate (already present on this rig) | T2459-H7-PW-UMP |
| MIDI 2.0 / UMP I/O end-to-end | libremidi version bump + MIDI-2.0-capable device on the bench | **Sibling: T2459-H5-UMP-HIL (Blocked)** — split out of T2459-H5 because it is hardware + library blocked, not architectural |
| Cluster MIDI multi-host | n/a (already shipped via simulator) | T2459-H7 ✅ |
| Map2MidiController deletion soak | n/a (closed 2026-05-08 via paired ON/OFF soak) | T2459-H6 ✅ |

## Cross-References

- Worklist: `docs/PROJECT_WORKLIST.md` (T2459, T2459-H, T2459-H1..H7)
- Architecture: `docs/midi/MIDI_BACKEND.md`, `docs/midi/MIDI_HUB_ARCHITECTURE.md`
- Absorption audit: `docs/midi/MIDI_HUB_ABSORPTION_AUDIT.md` (M5 today)
- Cluster protocol: `docs/midi/CLUSTER_MIDI_PROTOCOL.md`
- Retirement runbook: `docs/midi/MAP2MIDICONTROLLER_RETIREMENT.md`
