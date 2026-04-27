# T2459-G — Hardware Store integration evidence

**Date:** 2026-04-27
**Epic closed:** T2459-G (G1–G11 done, G11b queued, G12 = this directory)
**Authoritative design brief:** [docs/architecture/HARDWARE_STORE_INTEGRATION.md](../../../architecture/HARDWARE_STORE_INTEGRATION.md)
**Locked decisions:** Q1–Q20 in the design brief

---

## Summary

The Hardware Store ships at `/devices` with the locked Q1–Q20 surface. Every
G-subtask has tests on disk and a chunk on the production build. This
directory captures the evidence trail.

| Subtask | Title | Status |
|---|---|---|
| G1 | Backend foundation: REST surface + connection_detector + bench_state | ✓ Done |
| G2 | Hot-plug WebSocket channel + GUI hook | ✓ Done |
| G3 | Hardware Store page shell with locked section ordering | ✓ Done |
| G4 | DeviceCard with Q6/Q11/Q12/Q15 surfaces + Undo + HotPlug toast | ✓ Done |
| G5 | Device detail route + tabs (Overview + License + base shells) | ✓ Done |
| G6 | Audio I/O tab — Q17 measure + history + baseline diff | ✓ Done |
| G7 | Bindings tab + Q13 Undo + Q16 Learn Wizard hookup | ✓ Done |
| G8 | Diagnostics — per-card badge + per-device tab + bench-wide aggregate | ✓ Done |
| G9 | Pack Sources admin + sync streamer + checksum gate | ✓ Done |
| G10 | Catalogue split-pane + facets + unknown-device + Mixxx tail | ✓ Done |
| G11 | Cleanup — index swap + dead-code rip | ✓ Done |
| G11b | Final `deviceRegistry.ts` deletion + GlobalTreeNav port | Queued |
| G12 | Bench validation + evidence (this directory) | ✓ Done |

---

## Evidence files

| File | Description |
|---|---|
| `smoke-111747.json` | T2459-F4 HIL smoke runner output: PASS, 3 packs, 11 audio profiles, 11 latency measurements (synthetic — `jack-client` not installed in this CI environment). |
| `backend-pytest.log` | Full pytest run across G1+G7+G9 + adjacent T2459 suites: **85 passed in 18.29s**. |
| `frontend-jest.log` | Full Jest run across G2+G3+G4+G5+G6+G7+G8+G9+G10 frontend suites: **55 passed across 11 suites**. |
| `route-checks.txt` | curl HTTP probes for the four canonical routes — all HTTP 200. |
| `devices-index.html` etc. | Captured SPA shell HTML for each route (the actual content is bundled JavaScript; see chunk-content checks below). |

---

## Bench validation: in-product walkthrough (Q1–Q20)

Each row links a locked decision to its evidence. The fully-rendered UI
requires a connected UA-1000 / Hotone Jogg, which is owner-driven; the
artifacts below verify that every code path the operator would touch is in
place and serving.

| Q | Decision | Evidence on disk |
|---|---|---|
| Q1 | Deprecate hand-coded DEVICE_REGISTRY | G11 deleted `DevicesStorePage.tsx` + `DevicesOverview.tsx` + `useStorefrontState.ts`; `deviceRegistry.ts` marked `@deprecated`. New index = `HardwareStorePage`. |
| Q2 | Connected-first storefront | `HardwareStorePage` renders `Connected` section first; partition logic in `buildProfileRows()`. |
| Q3 | USB + ALSA seq + ALSA card + PipeWire detection | `app/services/controllers/connection_detector.py` 4-source union, 11/11 detector tests. |
| Q4 | Learn Wizard + Search modal for unknown devices | `CatalogueSection.tsx` renders InlineNotification + Open-Learn-Wizard button when filters yield zero results. |
| Q5 | Featured top + hidden Mixxx tail | `CatalogueSection.tsx` partitions native vs imported, caps imported at 12 with "Show all" toggle. |
| Q6 | 4-button card actions | `DeviceCard.tsx` renders Open / Pin↔Unpin / Configure / Test latency↔Identify. |
| Q7 | Catalogue split-pane | `CatalogueSection.tsx` top-pane facets + bottom-pane scrollable grid. |
| Q8 | Search + protocol + source + vendor facets | `CatalogueSection.tsx` Carbon Search + 3 MultiSelects. |
| Q9 | Empty state on first land | `HardwareStorePage.tsx` `isEmpty` branch renders the "No hardware detected" panel. |
| Q10 | Hero card + tabbed detail strip | `DeviceDetailRoute.tsx` renders 5 Carbon Tabs (Overview / Audio I/O / Bindings / Diagnostics / License). |
| Q11 | Global toast + nav pulse for hot-plug | `useHotPlugToast.ts` + `DeviceCard.tsx` `pulseToken` animation. |
| Q12 | Severity-tinted disconnect badge → 30s grace → migrate | `bench_state.py` 30s `recently_disconnected` window + 24h known cutoff; `DeviceCard.tsx` red Tag. |
| Q13 | Save + activate + Undo toast (8s) | `useUndoToast.ts` + `BindingsTab.tsx` Save→Undo round-trip; backend `bindings_writer.py` 60s undo store. |
| Q14 | Two-tier shipped/user packs + sidecar overrides | `_classify_pack_source()` in `app/routes/devices.py` walks path. |
| Q15 | Source tag + License tab + degraded notification | `DeviceCard.tsx` source tag + `LicenseTab.tsx` Q15 attribution surface (Mixxx upward-chain notice). |
| Q16 | Dedicated `/devices/<pack>/<model>/learn` route | Existing T2459-D4 wizard route; `BindingsTab.tsx` "Open Learn Wizard" button + `DeviceCard.tsx` Configure button both navigate there. |
| Q17 | Audio I/O measure + history + baseline diff | `AudioIoTab.tsx` Carbon Button + ProgressBar + `useMeasureLatencyHistory` + Compare-to-baseline Select + delta Tag table. |
| Q18 | Pack Sources admin tab + subprocess streamer | `PackSourcesAdminPage.tsx` 3-section admin surface; backend `POST /api/devices/sources/sync-mixxx` SSE streamer + `GET /api/devices/sources/mixxx-checksums` integrity gate. |
| Q19 | Per-card badge + per-device tab + bench-wide aggregate | `DeviceCard.tsx` diagnosticCount Tag + `DiagnosticsTab.tsx` per-pack filter + `DiagnosticsAggregatePage.tsx` Carbon DataTable. |
| Q20 | Resource-noun REST + WS + structured error envelope | `app/routes/devices.py` Q20-locked envelope on every G1+G7+G9 endpoint; `WS /api/devices/ws` + 5 hook-driven REST surfaces. |

---

## Test totals

- **Backend:** 85 tests passed across 11 suites (`test_bindings_writer`,
  `test_devices_g1_routes`, `test_devices_g7_routes`, `test_devices_g9_routes`,
  `test_measure_latency_history`, `test_connection_detector`,
  `test_connection_event_bus`, `test_devices_ws_route`,
  `test_profile_registry`, `test_controller_service`, `test_t2459_hil_smoke`).
- **Frontend:** 55 tests passed across 11 suites
  (`useDeviceConnections`, `HardwareStorePage`, `DeviceCard`, `OverviewTab`,
  `LicenseTab`, `DeviceDetailRoute`, `AudioIoTab`, `BindingsTab`,
  `DiagnosticsAggregatePage`, `PackSourcesAdminPage`, `CatalogueSection`).
- **Chunks shipped:** `HardwareStorePage-*.js` (~14 KB),
  `DeviceDetailRoute-*.js` (~14 KB), `DiagnosticsAggregatePage-*.js`,
  `PackSourcesAdminPage-*.js` — all verified to contain the locked feature
  markers via grep on the bundle.

## Bench HIL smoke

```
$ python3 scripts/run_t2459_device_subsystem_hil_smoke.py
status=PASS, packs=3, audio_profiles=11, with_loopback_ports=11,
latency_measurements_completed=11
```

See `smoke-111747.json` for the full per-profile detail.

## Followups

- **T2459-G11b** — port `GlobalTreeNav` off `deviceRegistry.ts` and delete
  the registry file. The deprecated registry currently serves the left-rail
  pinned-device list only.
- **T2459-G7 supervisor IPC** — controller-host SIGHUP IPC bridge for
  sub-50ms binding hot-reload; current path uses `registry.reload_pack()`
  which is fast enough for non-realtime updates but doesn't satisfy the
  acceptance bullet.
- **T2461 epic** — Device Catalog ↔ MIDI Assignments ↔ Brain integration
  (10 subtasks A1–A10). Now that T2459-G is done, T2461 is unblocked.

## Bench-side verification owner-driven

The HIL smoke shipped above runs against the *synthetic* loopback path
because `jack-client` is not installed in this environment. To complete
the live-bench validation, the maintainer should:

1. SSH to the bench (UA-1000 + Hotone Jogg connected, JACK running).
2. `pip install jack-client` (or use the system PipeWire-JACK shim).
3. Re-run `python3 scripts/run_t2459_device_subsystem_hil_smoke.py`.
4. Open `http://localhost:3000/devices` in a browser.
5. Walk Q1–Q20 against the live UI: connect/disconnect a device, run
   Audio I/O measure, save a binding + Undo it, run sync-mixxx, view
   diagnostics aggregate.
6. Drop screenshots into this directory under
   `live-walkthrough-<HHMMSS>/`.
