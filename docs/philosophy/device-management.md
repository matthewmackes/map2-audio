# Philosophy — Device Management

> **Audience:** Anyone integrating new hardware, modifying device discovery, or building per-device UI.
> **Scope:** From cable insertion to a panel rendered in the browser, including profile resolution, hot-plug detection, adoption across a cluster, and the Device Context Pattern.

## 1. The thesis

A device is not C++ code. A device is a **YAML profile** validated against a schema. The platform's job is to:

1. Load every profile it can find.
2. Recognise hardware as it appears, on whatever node sees it first.
3. Expose a uniform interface to the rest of the system regardless of vendor.
4. Keep operators honest about what is and isn't connected, where, and to which node.

This is the same discipline as the MIDI subsystem applied to *every* category of hardware — audio interfaces, MIDI controllers, HID surfaces, and protocol clients (Tesira TTP, AVDECC entities).

## 2. The four layers

```
┌─────────────────────────────────────────────────────────────┐
│  4 — UI:    DeviceContextBanner / Dialog / useDeviceNodeContext│
├─────────────────────────────────────────────────────────────┤
│  3 — API:   /api/devices/* routes, REST + assets              │
├─────────────────────────────────────────────────────────────┤
│  2 — Runtime: per-device services + connection detector       │
├─────────────────────────────────────────────────────────────┤
│  1 — Static: device-packs/ + ProfileRegistry                  │
└─────────────────────────────────────────────────────────────┘
```

### Layer 1 — Static catalogue: `device-packs/` + `ProfileRegistry`

`device-packs/` is the canonical home for every supported piece of hardware. Each pack has the same shape:

```
device-packs/<vendor>/
├── pack.yaml                    # vendor, models, source URL, license
├── profiles/<model>.audio.yaml  # ALSA cards, sample rate, loopback ports
├── profiles/<model>.midi.yaml   # CC table, fast-path flags
├── profiles/<model>.hid.yaml    # HID descriptors, packet parser ref
├── overrides/                   # per-model UI overrides
└── scripts/                     # QuickJS device-specific helpers
```

`ProfileRegistry` (`app/services/controllers/profile_registry.py`) walks the directory at boot, validates every file against `device-packs/_schema/`, and exposes lookup by USB VID:PID, ALSA card regex, ALSA client pattern, or PipeWire node name. Mixxx XML mappings under `_mixx-imports/` are synthesised as virtual packs to preserve GPLv2-or-later attribution.

The registry is **non-fatal**: a malformed pack is logged, marked `is_degraded`, and the rest of the catalogue continues to load. One vendor's mistake never blocks boot.

### Layer 2 — Runtime: per-device services + Connection Detector

Every device has either:

- A **service class** for SysEx-controlled devices (`MPX1Service`, `IntelfxService`, etc., all extending `MidiSysexBridgeBase`),
- A **manager** for class-compliant USB audio (`UsbAudioManager` covers Edirol, Hotone, Focusrite, Behringer, Native Instruments, M-Audio, Roland), or
- A **protocol client** for networked gear (`TesiraClient` for Biamp TTP, `Map2AvdeccController` for AVDECC entities).

The common spine across all of them is the **Connection Detector** (`app/services/controllers/connection_detector.py`). It interrogates four independent sources:

1. USB enumeration via `/sys/bus/usb/devices/*` — authoritative for "cable is plugged in".
2. ALSA Sequencer via `aconnect -i -l` — authoritative for "kernel sees a MIDI endpoint".
3. ALSA cards via `/proc/asound/cards` — audio card visibility.
4. PipeWire graph via `pw-dump` — userspace graph availability.

Any source can fail (container without `/sys`, missing tool, no kernel module). The detector returns the *union* of sources that worked and tags the `ConnectionRecord.evidence` field so the UI can be honest: "USB sees the device, PipeWire does not — your audio stack is wedged" is not the same surface as "device is unplugged".

### Layer 3 — REST surface: `/api/devices/*`

`app/routes/devices.py` exposes a small, consistent set of endpoints:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/devices/packs` | Loaded packs |
| GET | `/api/devices/profiles?kind=audio\|midi\|hid` | Profiles by kind |
| GET | `/api/devices/profiles/{pack}/{model}/{kind}` | Profile detail |
| GET | `/api/devices/resolve?hardware_id=…` | Match running hardware to profile |
| POST | `/api/devices/profiles/reload/{pack}` | Hot-reload after YAML edit |
| GET | `/api/devices/{pack}/{model}/asset/{file}` | Cached datasheets/images |
| POST | `/api/devices/mixxx/import` and `/export` | Mixxx XML round-trip |

The recent commit "Expose legacy devices in hardware catalogue" (`a794284e`) widened this surface to include packs that were previously filtered for being "old"; the catalogue now reflects what the platform *can* drive, not just what was added this quarter.

### Layer 4 — UI: the Device Context Pattern

Every device panel uses the same three pieces:

- **`useDeviceNodeContext(deviceKey)`** (`web/src/app/hooks/useDeviceNodeContext.ts`) — derives a `DeviceNodeState` (`loading | not_found | node_offline | needs_switch | ready`) plus a `DeviceIssue[]` array.
- **`DeviceContextBanner`** — surfaces the top issue with a severity icon and a single "Manage" button.
- **`DeviceContextDialog`** — full issue detail, remediations (reassign, rediscover), node-switch confirmation.

This pattern is a **directive**, not a suggestion. Inline per-device "this device is on another node" banners are forbidden. The reason: the banner and dialog know how to read cluster topology and how to drive a node switch. Every reimplementation has gotten one of those wrong.

### Layer 4 — visual contract (Carbon discipline)

The Device Context Pattern composes against the platform-wide **Carbon discipline** established by T2474 (the visual system sweep) and codified in `docs/design/CARBON_CONFORMANCE_STANDARD.md` §10. Every device panel must follow the same visual rules every other operator surface follows. Specifically:

- **Severity vocabulary.** `DeviceContextBanner` routes its `info` / `warning` / `error` tones through MAP semantic alert tokens, not raw Carbon support tokens: `info` → `var(--cds-link-primary)` (operator context, not severity), `warning` → `var(--map2-alert-advisory)` (operator-correctable), `error` → `var(--map2-alert-blocking)` (prevents activation). The blocking-vs-advisory split is the canonical alert contract — operators must know at a glance whether an alert prevents work or merely informs.
- **Status pills.** Device status (online / warn / critical / offline) is rendered through the canonical `StatusChip` primitive at `web/src/app/components/primitives/StatusChip.tsx`, with tones `ok` / `caution` / `critical` / `offline` from the `--map2-health-*` token group. Per-device hand-rolled chips are forbidden — the audit found nine ad-hoc reimplementations across the codebase, every one with subtly different padding, dot size, and color.
- **Node identity is owned by the global Unified Pill.** Per `docs/CLAUDE.md`, the only node-identity UI on any page is the `NodeNavChip` pill in the global nav bar. A device panel does NOT render its own "this device is on node X" header. The Device Context Pattern instead surfaces the *node mismatch* (`needs_switch`) through `DeviceContextBanner`, while node identity itself stays in the pill. This is what keeps "which node am I looking at?" answerable from a single place.
- **Hardware-skin exception.** Device panels that *deliberately reproduce physical gear* — MPX1Panel and its mega-menu / signal-path canvas, IntelFXPanel and its signal-path canvas, the Maschine LCD/VFD/LED display simulations — are NOT subject to Q1=A's "no decorative gradients / no skeuomorphism / no glow" rules. These are device-graphics, not UI chrome. The distinction is documented in the Carbon standard §10.5: "rendering a faithful Lexicon MPX-1 face-plate is allowed; making a device-list tile *look like* an LCD panel is not." Device-pack authors adding new vendor-specific UI MUST decide which side of that line their surface falls on, and document the choice in the per-pack README.
- **Canonical primitives.** The shared primitives library at `web/src/app/components/primitives/` is the source for `DeviceNodeCard` (presence-stripe identity tile), `MetricCard` and `HealthMetric` (CPU / memory / latency readouts), `AlertPanel` (severity-typed alert), `DrawerPanel` (side-panel for inspector surfaces), `ActionButton` / `DangerButton` (intent-typed actions), `EmptyState` / `ErrorState` / `LoadingState` (lifecycle surfaces). Per-device panels SHOULD compose these instead of re-rolling local equivalents.

The spirit of these rules is the same as the Device Context Pattern itself: **every device gets the same operator story, with no per-device drift**. The visual layer is just the part of that story the operator sees first.

## 3. Device adoption — single owner, explicit transitions

Multi-node clusters need an unambiguous answer to "which node owns this device?" MAP2 enforces it at the database layer.

The adoption FSM (`app/services/cluster/adoption.py`) walks each device through:

```
candidate → claimable → adopted → ready → active
```

The `adoption_records` table has `node_id TEXT UNIQUE`. Two management nodes cannot both claim the same device — the second insertion fails. Operators see a deterministic outcome: a candidate becomes `claimable` only after readiness checks pass, becomes `adopted` only when a management node has explicitly claimed it (interactive code or signed bootstrap token), and becomes `ready` once the local services come up green.

There is **no automatic failover**. If node A owns a device and dies, node B does not silently take over. An operator re-adopts. This is deliberate: silent failover during a live show is worse than a visible error.

## 4. Hot-plug as a first-class event

A USB insertion fires a `udev` event; the connection detector picks it up on the next sweep; the matching profile is resolved by VID:PID; the per-device service is instantiated; the front-end's `useDeviceNodeContext` transitions from `not_found` to `ready`; the user sees the panel come alive. No restart, no reload.

The reverse holds. A removal that breaks an active routing surfaces as a `node_offline` or `not_found` `DeviceIssue` and the banner explains the consequence ("Tesira is offline; presets cannot be recalled until it returns") rather than letting the failure manifest as a silent no-op.

## 5. Why this shape

- **YAML-first** means a new vendor model is a directory commit, not a backend release.
- **Schema-validated** means a typo in a profile is caught at load time, not at use time.
- **Detector union** means honest UI even when half the audio stack is unavailable.
- **Single-owner adoption** means cluster behaviour is predictable.
- **Device Context Pattern** means every device gets the same multi-node story with no per-device implementation drift.

## 6. Where to read next

- `device-packs/SCHEMA.md` — the data model.
- `docs/ADOPTION_WORKFLOW_RUNBOOK.md` — operator-side adoption procedures.
- `app/services/controllers/profile_registry.py` — resolution rules.
- `web/src/app/hooks/useDeviceNodeContext.ts` — the hook every device UI must use.
- `docs/design/CARBON_CONFORMANCE_STANDARD.md` §10 — operator-state discipline (T2474), MAP semantic token vocabulary, canonical primitives library, hardware-skin exception. Device-pack authors must read §10.5 before adding new vendor-specific panel styling.
- `web/src/app/components/primitives/` — canonical primitives library (StatusChip, AlertPanel, DeviceNodeCard, DrawerPanel, MetricCard, HealthMetric, etc.).
- `docs/CLAUDE.md` Unified Pill Directive — node-identity UI rules. Device panels MUST NOT render their own "this device is on node X" header; the pill in the global nav bar owns that.
