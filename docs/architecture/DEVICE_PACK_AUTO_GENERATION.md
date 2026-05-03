# Device-Pack Auto-Generation from Discovery + Public Info

**Author:** T2492 epic kickoff (2026-05-02)
**Status:** Design — kickoff commit ships this doc + worklist entry + the T2492-1 vertical slice (Mixxx refresh + lookup index + USB-IF + backend service + frontend modal). Subsequent iters handle T2492-2 through T2492-5.
**Template precedent:** [MIDI_SERVICES.md](MIDI_SERVICES.md), [AVB_SERVICES.md](AVB_SERVICES.md).

---

## 1. Why this exists

The MAP2 device-pack model (T2459) presumes vendor-curated `.MAP2.yaml` profiles under `device-packs/<vendor>/<model>/`. In practice vendors do not write packs for niche audio platforms; operators have to. When an unknown USB MIDI adapter is plugged in, the system today shows it as a generic ALSA port with no first-party editor — every binding has to be authored from scratch.

T2492 closes that gap with an auto-generator that:

1. Detects an unknown USB MIDI adapter via the existing `useDeviceConnections` WebSocket.
2. Looks the device up in the in-tree Mixxx mapping corpus (VID:PID exact match) + USB-IF vendor table.
3. Synthesizes a draft `.MAP2.yaml` manifest + skeleton XML mapping + skeleton JS script.
4. Walks the operator through a 5-step Carbon Modal wizard to review, edit, and commit the draft to disk.

No live network calls. No vendor cooperation required. All enrichment data is staged in the repo at install time.

---

## 2. Locked decisions (5-question protocol, 2026-05-02)

Recorded in [PROJECT_WORKLIST.md T2492 entry](../PROJECT_WORKLIST.md). One-line summary per question:

| Q | Decision |
|---|---|
| Q1 | **D** — Mixxx imports + USB-IF, no live API calls. |
| Q2 | **B-via-Modal** — multi-step wizard rendered as Carbon Modal, not a separate route. |
| Q3 | **D** — dual entry: Carbon Tag on `/midi/connections` + InlineNotification banner on `/midi/devices`. |
| Q4 | **A** — VID:PID exact match only against the Mixxx index. |
| Q5 | **D** — big-bang kickoff: full T2492-1 vertical slice in one commit. |

---

## 3. Lookup index format

### 3.1 `device-packs/_lookup-index/mixxx-controllers.json`

Built at install time from `device-packs/_mixx-imports/res/controllers/*.midi.xml`. One entry per Mixxx mapping that declares a USB VID:PID in its `<info>` block.

```jsonc
{
  "schema_version": 1,
  "generated_at": "2026-05-02T...Z",
  "mixxx_upstream_commit": "<hash from MANIFEST.yaml>",
  "entries": [
    {
      "vid": "0x17cc",
      "pid": "0x0808",
      "vendor_name": "Native Instruments",
      "device_name": "Maschine MK1",
      "mapping_file": "res/controllers/Native_Instruments_Maschine_MK1.midi.xml",
      "script_files": ["res/controllers/Native_Instruments_Maschine_MK1-scripts.js"],
      "supports_sysex": false,
      "default_channel": 1
    }
  ]
}
```

### 3.2 `device-packs/_lookup-index/usb.ids`

Verbatim mirror of `http://www.linux-usb.org/usb.ids` (~600 KB, public domain content but the parser is the only thing we ship). Used as the secondary lookup for vendor-name fallback when a device's VID has no Mixxx entry.

Refreshed by `scripts/refresh_lookup_index.py` on operator demand or at install.

---

## 4. Wizard step plan

The Carbon Modal renders a `ProgressIndicator` with 5 steps. Each step is a panel inside the modal body; navigation via Next/Back buttons in the modal footer.

### Step 1 — Detected device summary

Read-only display of:
- USB descriptor (VID:PID, manufacturer string, product string)
- ALSA client/port name as enumerated by the controller-host daemon
- Detection timestamp + hot-plug source (USB / IPMidi / virtual)

### Step 2 — Enrichment lookup results

Calls `POST /api/midi/devices/auto-generate/lookup` with the USB descriptor.

Backend returns:
- Mixxx match: hit or miss. On hit, the matched mapping filename + its `<info>` block content.
- USB-IF match: vendor name (always present unless VID is missing).

UI shows both results as Carbon Tiles. Operator chooses "Use Mixxx template" (when match) or "Generate from scratch".

### Step 3 — Review synthesized manifest

Backend renders the `.MAP2.yaml` content in a Carbon `CodeSnippet` (read-only multiline). Manifest carries:
- `name`, `vendor`, `model` (from USB descriptor + USB-IF or Mixxx)
- `transport: midi`
- `usb_vid_pid`, `alsa_match_patterns`
- `runtime_extra.created_via: "auto-generator"`
- `runtime_extra.mixxx_template: "<filename>"` when applicable

Operator clicks "Looks good" or "Back to step 2".

### Step 4 — Edit XML / JS scaffolding

Two Carbon `TextArea` fields (one for XML, one for JS). Pre-filled with either the Mixxx template (verbatim copy preserving GPL-2.0-or-later attribution) or a minimal skeleton with TODO comments.

This step is intentionally low-tech in the kickoff slice. T2492-2 adds syntax highlighting and per-control-block inline editing.

### Step 5 — Commit

Calls `POST /api/midi/devices/auto-generate/commit` with the final manifest + XML + JS contents.

Backend:
- Validates the YAML manifest structure.
- Writes files to `device-packs/<vendor>/<model>/.MAP2.yaml`, `.../mapping.xml`, `.../scripts.js`.
- Reloads the ProfileRegistry so the new pack is immediately available without backend restart.
- Returns the canonical `profile_key` for the new pack.

UI shows a Carbon InlineNotification with a link to the new pack's detail page at `/midi/devices/<profile_key>`.

---

## 5. Backend surface

### 5.1 Service: `app/services/device_pack_auto_gen/`

```
device_pack_auto_gen/
├── __init__.py
├── lookup.py          # MixxxLookup + UsbIfLookup classes
├── synthesis.py       # ManifestSynthesizer + XmlScaffolder + JsScaffolder
└── writer.py          # PackWriter (validates + commits to disk + reloads registry)
```

### 5.2 Routes (under `/api/midi/devices/auto-generate/`)

- `POST /lookup` — body: `{ usb_vid: "0x17cc", usb_pid: "0x0808", alsa_name: "..." }`. Returns `{ mixxx_match: {...} | null, usbif_match: {...} | null }`.
- `POST /synthesize` — body: lookup result + operator's "use template / from scratch" choice. Returns `{ manifest_yaml: "...", mapping_xml: "...", scripts_js: "..." }`.
- `POST /commit` — body: final synthesized content + target `vendor` + `model`. Returns `{ profile_key: "...", path: "device-packs/<vendor>/<model>/" }`. Reloads ProfileRegistry on success.

---

## 6. Frontend surface

### 6.1 Component: `web/src/app/components/DevicePackGenerator/DevicePackGeneratorModal.tsx`

Carbon Modal with `ProgressIndicator`, 5 step panels, Next/Back/Cancel/Commit footer buttons. Lazily loaded — operators don't pay the bundle cost unless they actually open the modal.

### 6.2 Trigger entry points

- **`/midi/connections`**: each row in `MidiHubConnectedDevicesReport` gets a yellow Carbon `Tag` with copy "Unknown device — generate pack" when `device.profile_id == null`. Click opens the modal with the device's USB descriptor.
- **`/midi/devices`**: top-of-page Carbon `InlineNotification` reading "N adapters have no device-pack" when ≥1 unrecognized adapter is connected. Click opens the modal with a list-picker.

---

## 7. License + provenance

When the generator copies a Mixxx mapping XML/JS as the template:
- Original Mixxx file headers are preserved verbatim (GPL-2.0-or-later license lines stay intact).
- The synthesized `.MAP2.yaml` carries `runtime_extra.mixxx_template` and `runtime_extra.mixxx_upstream_commit` for traceability.
- The MAP2 manifest itself is AGPL-3.0-or-later (the platform's license); the embedded XML+JS retain their Mixxx GPL-2.0-or-later headers because that's where the substance came from.

This matches the T2459 license posture: AGPLv3 is allowed to import GPL-2.0-or-later via the GPLv3 upward chain. License-compatible direction.

---

## 8. Subtask breakdown

T2492-1 (this kickoff) ships an end-to-end thin slice across all 7 surfaces. T2492-2 through T2492-5 polish:

- **T2492-2** — Operator-curated edits inside steps 3-4 (Carbon SyntaxHighlighter + per-block edit).
- **T2492-3** — XML/JS scaffolding sophistication for the no-Mixxx-match path.
- **T2492-4** — Commit auditability: structured `runtime_extra` provenance fields enforced at write time.
- **T2492-5** — Closeout: evidence run, doc updates, test totals.

---

## 8.5 Runtime state directory (T2492-1a fix, 2026-05-02)

**Bug surfaced post-kickoff**: the original PackWriter wrote to the
in-tree `device-packs/` directory, which is read-only on production
backends (the systemd unit mounts the repo r/o for isolation).
Operator-generated packs need a writable, durable target that's
distinct from the version-controlled vendor catalog.

**Fix**: per CLAUDE.md's Configuration Authority Model, operator-state
that survives reinstalls lives under `/var/lib/map2/`. PackWriter
now resolves its target dir in this order:

1. `MAP2_DEVICE_PACKS_RUNTIME_DIR` env var — explicit override; used
   by tests + advanced operators who want a custom path.
2. `/var/lib/map2/device-packs/` if writable.
3. `~/.map2/device-packs/` as the user-state fallback. Always
   creatable from the backend's process user.

The in-tree `device-packs/` mirror stays for vendor-curated profiles
(read-only catalog). The runtime ProfileRegistry needs to load packs
from BOTH directories — in-tree for the vendor catalog, runtime-state
for operator-generated packs. The registry-merge wiring is queued as
**T2492-2** because it requires changes to `MidiDeviceRegistry` that
need bench validation with the controller-host daemon.

The commit response carries `runtime_packs_dir` so operators can see
where their pack landed; `GET /api/midi/devices/auto-generate/diagnostics`
also reports the resolved target + writable status as a quick health
check.

The route also wraps `OSError` into `HTTPException(400, detail=…)`
with operator-actionable text (the previous version bubbled a raw
500 + `Internal Server Error`, which surfaced the bug to operators
as an opaque generic message instead of a "set this env var or grant
write access to that path" instruction).

---

## 9. Honest scope notes

- **No fuzzy name matching in T2492-1.** Mixxx mappings without VID:PID are invisible to the lookup. Operator can still go through the wizard with "Generate from scratch" path. Future T2492-followup may add name-string fuzzy matching.
- **No live API calls.** All enrichment data is in-tree at runtime. Refresh of Mixxx + USB-IF is a separate operator-driven script (`scripts/refresh_lookup_index.py`).
- **Daemon dependency.** The trigger entry points only fire when `useDeviceConnections` reports unknown devices, which itself requires the `map2-controller-host` daemon to be running. This epic does not fix the daemon-not-running case (separate T2459-H operational issue).
- **No bundled vendor SysEx ID database.** The MIDI Manufacturers Association SysEx ID list is publicly available but not staged in T2492-1. If operators need SysEx-based device identification (for adapters that don't expose USB descriptors meaningfully) that's a T2492-followup.
