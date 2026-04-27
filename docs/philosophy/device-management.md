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
