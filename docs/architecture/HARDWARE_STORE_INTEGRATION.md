# Hardware Store Integration Design Brief

**Status:** Locked 2026-04-27
**Worklist epic:** `T2459-G`
**Predecessor:** `docs/architecture/CONTROLLER_LAYER.md` (T2459-A1)
**Authoritative answers source:** Q1–Q20 protocol, this conversation, 2026-04-27

This brief locks the design of the Hardware Store GUI as it integrates the
T2459 controller / mapping / device-pack subsystem. It supersedes the
hand-coded `web/src/app/data/deviceRegistry.ts` storefront pattern.

---

## 1. Locked decisions (Q1–Q20)

| # | Decision | Rationale anchor |
|---|---|---|
| Q1 | **Deprecate hand-coded `deviceRegistry.ts`.** Storefront becomes profile-registry-driven. | Single source of truth, T2459-A3 |
| Q2 | **Connected-first storefront.** Connected devices render before catalogue. | Operator-respect, MAP2 bench model |
| Q3 | **Detection chain: USB + ALSA seq + ALSA card + PipeWire node graph.** All four unioned to the connection set. | Coverage of real bench permutations |
| Q4 | **Unknown-device handling: Learn Wizard + Search modal.** Unrecognised hardware routes to authoring or catalogue search. | T2459-D4 |
| Q5 | **Mixxx imports: Featured top + hidden tail.** Curated subset surfaces in main flow; full corpus reachable through "Show all imported mappings". | License attribution + UX scale |
| Q6 | **4-button card actions:** Open, Pin, Configure, Identify-or-Test. | Connected-first ergonomics |
| Q7 | **Catalogue split-pane:** top-half overview/hero, bottom-half scrollable list. | Information density |
| Q8 | **Facets: Search + Protocol + Source + Vendor.** | Carbon `MultiSelect` standard pattern |
| Q9 | **Empty state on first land** (no devices connected, no pins). | Carbon `EmptyState` |
| Q10 | **Detail surface: Hero card + tabbed detail strip.** Tabs: Overview, Audio I/O, Bindings, Diagnostics, License. | Information-density vs. scannability |
| Q11 | **Hot-plug: Global toast + nav pulse.** | Operator awareness without disruption |
| Q12 | **Disconnect: severity-tinted badge → 30s grace → "Recently disconnected" section → 24h auto-age. Pinned devices always remain in "Known to bench".** | State persistence + operator memory |
| Q13 | **Save-binding: live activate + 8s Undo toast** (Carbon `InlineNotification`). | Pin/Unpin + MPX1 A/B precedent, T2459-A6 hot-reload |
| Q14 | **Two-tier packs:** shipped in `device-packs/` + user in `~/.map2/device-packs-user/`. Shipped-pack overrides via `.MAP2.yaml` sidecars. | `app/config.py` precedent + `_mixx-imports/` immutability |
| Q15 | **Provenance: single source-tag on card + dedicated License tab + Carbon `InlineNotification` for degraded.** | AGPL/GPL attribution visibility |
| Q16 | **Learn Wizard route:** `/devices/<pack>/<model>/learn`. Reachable from card "Configure" + detail "Bindings" tab. "Learning" Tag while session active. | MPX1 Librarian routing precedent |
| Q17 | **Loopback measure:** detail-strip "Audio I/O" tab. Carbon `ProgressBar`, history list from `docs/fit-for-purpose-evidence/<YYYYMMDD>/device-loopback/`, Compare-to-baseline diff. Hidden when `loopback_ports` absent. | T2459-F4 evidence convention + soak skill pattern |
| Q18 | **Pack Sources admin tab.** "Run sync" invokes `scripts/sync_mixxx_imports.py` as subprocess; output streams to Carbon `CodeSnippet`; `IMPORT_CHECKSUMS.txt` validity surfaced inline. No auto-fetch, no auto-commit. | Operator-initiated sync per script docstring |
| Q19 | **Diagnostics: per-card badge + per-device Diagnostics tab + bench-wide `/devices/diagnostics` route** (Carbon `DataTable`, severity-tinted, deep-linkable). Aggregates `is_degraded`, `MixxxParseStats.skip_reasons`, controller-host crash log. | No-hidden-state + MPX1 diagnostics-view precedent |
| Q20 | **REST shape:** `GET /devices/packs`, `/devices/profiles`, `/devices/profiles/{...}`, `/devices/connected`, `/devices/known`, `/devices/diagnostics`, `POST /devices/profiles/{...}/bindings`, `/devices/profiles/{...}/measure-loopback`, `/devices/sources/sync-mixxx`, `WS /devices/ws`. ETag on profile reads. Structured error envelope `{detail, code, source, degraded_files[]}`. | MPX1 routing precedent + cacheability |

---

## 2. Page architecture

```
/devices                      Hardware Store root
├── Connected (Q2/Q3)         Cards, top of page
├── Recently disconnected     30s–24h window (Q12)
├── Known to this bench       Pinned + recently-seen (Q14 user-tier + history)
├── Catalogue (Q7)            Top: hero overview; bottom: scrollable filtered list
└── Pack Sources tab (Q18)    Admin surface
        Sync → subprocess invocation, CodeSnippet stream

/devices/<pack>/<model>       Device detail (Q10)
├── Hero card                 Source tag (Q15), connection status, 4 actions (Q6)
└── Tabs:
    ├── Overview              Description, capabilities, port map
    ├── Audio I/O             Q17 measure + history + baseline diff
    ├── Bindings              MIDI map editor + "Open Learn Wizard" → Q16
    ├── Diagnostics           Q19 device-scoped errors
    └── License               Q15 attribution (AGPL/GPL/user-authored)

/devices/<pack>/<model>/learn       Q16 wizard route
/devices/diagnostics                Q19 bench-wide aggregate
```

---

## 3. Backend API contract (Q20)

All routes live under `app/routes/devices.py` (new). Service layer:
`app/services/controllers/profile_registry.py` (T2459-A3) for reads,
`app/services/controller_host_service.py` (T2459-A6) for live binding writes.

### 3.1 Resource routes

| Method | Path | Returns / Body |
|---|---|---|
| GET | `/devices/packs` | `[Pack]` — id, vendor, models, source, license, is_degraded, degraded_files |
| GET | `/devices/profiles` | `[ProfileSummary]` — pack_id, model, kind, capabilities |
| GET | `/devices/profiles/{pack}/{model}/{kind}` | `Profile` (full document + provenance) — ETag-cached |
| POST | `/devices/profiles/{pack}/{model}/{kind}/bindings` | Body: `{controls, outputs}` — atomic write + hot-reload via host IPC; returns `{revision, undo_token}` |
| POST | `/devices/profiles/{pack}/{model}/{kind}/measure-loopback` | Body: `{trials, sweep_ms, tail_ms}` — returns `{result, evidence_path}` |
| GET | `/devices/connected` | `[ConnectionRecord]` — current bench state from detection chain (Q3) |
| GET | `/devices/known` | `[ConnectionRecord]` — pinned + 24h-window seen |
| GET | `/devices/diagnostics` | `[DiagnosticEntry]` — `{severity, source, code, detail, pack_id?, model?, kind?, ts}` |
| POST | `/devices/sources/sync-mixxx` | Streams subprocess output (`text/event-stream`); returns final exit code |
| WS | `/devices/ws` | Server-pushed: `device.connected`, `device.disconnected`, `pack.degraded`, `host.crash`, `binding.changed` |

### 3.2 Error envelope (every non-2xx)

```json
{
  "detail": "Human-readable message",
  "code": "PROFILE_INVALID | PACK_DEGRADED | HOST_UNAVAILABLE | BINDING_CONFLICT | ...",
  "source": "profile_registry | controller_host | mixxx_xml_reader | detection",
  "degraded_files": ["device-packs/foo/bar.yaml"]
}
```

### 3.3 ETag/If-None-Match

Profile reads cache on `(file_mtime_ns, file_sha256)` to short-circuit
unchanged reads from the GUI (SWR `revalidateIfStale`).

---

## 4. Frontend architecture

### 4.1 Removed

- `web/src/app/data/deviceRegistry.ts` (Q1)
- `web/src/app/components/Devices/DevicesStorePage.tsx` (replaced)
- Any inline DEVICE_REGISTRY filters across the app

### 4.2 Added

```
web/src/app/components/Devices/
├── HardwareStorePage.tsx                Q2/Q7 layout shell
├── sections/
│   ├── ConnectedSection.tsx             Q2/Q3 connected devices
│   ├── RecentlyDisconnectedSection.tsx  Q12 30s grace + 24h ageing
│   ├── KnownToBenchSection.tsx          Q14 pinned + history
│   └── CatalogueSection.tsx             Q7 split-pane + Q8 facets
├── DeviceCard.tsx                        Q6 4-button card + Q15 source tag + Q12 severity badge
├── DeviceDetailRoute.tsx                 /devices/<pack>/<model> shell + Q10 tabs
├── tabs/
│   ├── OverviewTab.tsx
│   ├── AudioIoTab.tsx                   Q17 measure + history + baseline diff
│   ├── BindingsTab.tsx                  Edit bindings + entry to Q16 wizard
│   ├── DiagnosticsTab.tsx               Q19 per-device
│   └── LicenseTab.tsx                   Q15 attribution
├── PackSourcesAdminTab.tsx              Q18 admin
├── DiagnosticsAggregatePage.tsx         /devices/diagnostics, Q19
├── hooks/
│   ├── useDeviceConnections.ts          WS-driven connection state
│   ├── useDeviceProfiles.ts             SWR over /devices/profiles
│   ├── useDeviceDiagnostics.ts          /devices/diagnostics + WS
│   └── useUndoToast.ts                  Q13 8s Undo pattern
└── api/devicesApi.ts                    Typed REST client + WS subscription
```

All components use Carbon Design System primitives (`Tile`, `Tag`,
`InlineNotification`, `MultiSelect`, `Tabs`, `DataTable`, `ProgressBar`,
`CodeSnippet`). No custom badges, no custom toasts.

---

## 5. Detection chain (Q3)

`app/services/controllers/connection_detector.py` (new):

1. **USB enumeration:** read `/sys/bus/usb/devices/*/idVendor` + `idProduct`.
2. **ALSA seq:** `aconnect -i -l` parsing for MIDI client/port presence.
3. **ALSA card:** `/proc/asound/cards` + `/proc/asound/card*/id` for audio.
4. **PipeWire node graph:** `pw-cli list-objects | grep node.name` (or
   `pw-dump` JSON for structured parse).

Each profile in `device-packs/` declares one or more
**detection fingerprints** (e.g. `usb: { vid: 0x0582, pid: 0x004D }`,
`alsa_seq_name: "EDIROL UA-1000"`). The detector unions all four sources
and emits a single `ConnectionRecord` per matched fingerprint.

WS pushes `device.connected` / `device.disconnected` events; the GUI
hooks consume them.

---

## 6. Binding write path (Q13)

```
GUI Save click
  ↓
POST /devices/profiles/{...}/bindings   (REST, atomic)
  ↓
ProfileRegistry.write_profile()         (file write under flock)
  ↓
ControllerHostService.notify_reload()   (length-prefixed JSON IPC)
  ↓
map2-controller-host re-evaluates       (no process restart)
  ↓
Response: {revision, undo_token}
  ↓
GUI shows Carbon InlineNotification with Undo (8s)
  ↓
If Undo clicked within 8s:
  POST /devices/profiles/{...}/bindings   (with undo_token, atomic restore)
```

Undo tokens are stored server-side (in-memory, 60s TTL) keyed by revision.

---

## 7. Loopback measurement (Q17)

```
GUI "Measure" click
  ↓
POST /devices/profiles/{...}/measure-loopback
  ↓
scripts/measure_loopback_ir.py (T2459-E3) invoked in-process
  ↓
Result + evidence persisted to:
  docs/fit-for-purpose-evidence/<YYYYMMDD>/device-loopback/
    <pack>-<model>-<HHMMSS>.json
  ↓
GUI history list reads back the directory tree
  ↓
Compare-to-baseline: pick any prior file as baseline; diff rendered
```

Hidden when profile lacks `loopback_ports` (graceful degradation, T2459-A3).

---

## 8. Mixxx pack sync (Q18)

```
Pack Sources admin tab → "Run sync" button
  ↓
POST /devices/sources/sync-mixxx        (text/event-stream)
  ↓
subprocess: python3 scripts/sync_mixxx_imports.py <user-supplied path>
  ↓
stdout streams to Carbon CodeSnippet
  ↓
On exit-0:
  - device-packs/_mixx-imports/MANIFEST.yaml updated
  - device-packs/_mixx-imports/IMPORT_CHECKSUMS.txt regenerated
  - GUI re-renders pack list
  - User commits via standard `update` shorthand (out-of-band)
```

`IMPORT_CHECKSUMS.txt` validity is surfaced inline by hashing the corpus
on tab mount and comparing against the file. Mismatch → Carbon
`InlineNotification` ("Imported corpus has been modified — restore from
upstream or remove the modification").

---

## 9. Diagnostics aggregation (Q19)

`/devices/diagnostics` reads from three structured sources:

1. **`ProfileRegistry.diagnostics()`** — `{severity: "warning"|"error",
   source: "profile_registry", pack_id, file, message}` for `is_degraded`
   packs.
2. **`MixxxParseStats.skip_reasons`** — collected during pack load; one
   entry per skipped binding.
3. **`ControllerHostService.recent_crashes()`** — `{severity: "error",
   source: "controller_host", pid, exit_code, restart_count, message}`.

GUI renders a Carbon `DataTable` with severity-tinted Tag column, filter
by source/severity/pack, and deep-link from card badges into the
filtered table.

---

## 10. Test coverage targets

| Layer | Test |
|---|---|
| `connection_detector.py` | Unit tests with fixture data for each detection source; combination tests; hot-plug simulation |
| `routes/devices.py` | FastAPI TestClient: every route, error envelope shape, ETag round-trip |
| `controller_host_service.notify_reload()` | Mock IPC; assert reload-without-restart |
| Undo path | `/bindings` POST → undo_token → POST with undo_token → original state restored |
| Sync subprocess | Test with a fake Mixxx clone; assert MANIFEST + CHECKSUMS regenerated |
| Frontend hooks | `useDeviceConnections`, `useUndoToast` — Vitest + RTL |
| Frontend pages | `HardwareStorePage`, `DeviceDetailRoute`, `DiagnosticsAggregatePage` — render + interaction |
| End-to-end | Bench HIL run hits at least one connected device, measures loopback, verifies evidence written |

---

## 11. Migration plan

Phase ordering for `T2459-G` execution:

1. **G1 — Backend foundation:** routes, service layer, detection chain, error envelope.
2. **G2 — WS channel + hot-plug:** `WS /devices/ws`, broker, GUI subscription hook.
3. **G3 — Page shell:** `HardwareStorePage` + sections + Carbon layout (Q2/Q7/Q9/Q12).
4. **G4 — Device cards:** `DeviceCard` with Q6/Q11/Q12/Q15 surfaces.
5. **G5 — Detail route + tabs:** `DeviceDetailRoute` + Overview/License/Bindings tabs (Q10).
6. **G6 — Audio I/O tab + measurement:** Q17 full path (button + ProgressBar + history + baseline diff).
7. **G7 — Bindings tab + Learn Wizard hook-up:** binding editor + Q16 routing + Q13 Undo.
8. **G8 — Diagnostics:** per-device tab + `/devices/diagnostics` aggregate (Q19).
9. **G9 — Pack Sources admin tab:** Q18 subprocess streamer + checksum gate.
10. **G10 — Catalogue + facets:** filtered list + Q4 Search/Learn entry for unknown devices + Q5 Mixxx tail.
11. **G11 — Cleanup:** delete `deviceRegistry.ts` + `DevicesStorePage.tsx` + dead routes; update `web/src/router.tsx`; refresh evidence tree.
12. **G12 — Bench validation:** HIL smoke run + UI walkthrough on real UA-1000 + Hotone Jogg; record evidence.

Each phase: code → tests → typecheck → build → restart `:3000` →
in-browser visual verification → commit → dual-push (per CLAUDE.md DoD).
