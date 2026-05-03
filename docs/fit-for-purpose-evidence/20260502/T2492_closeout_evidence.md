# T2492 — Device-Pack Auto-Generation: Closeout Evidence

**Date:** 2026-05-02
**Epic:** T2492 — Device-Pack Auto-Generation from Discovery + Public Info
**Status:** ✅ Closed (T2492-1 through T2492-5)

## Scope

End-to-end wizard that detects unknown USB MIDI adapters and synthesizes a draft device-pack from in-tree Mixxx mappings + USB-IF vendor data.

## Deliverable Coverage Matrix

| Sub-task | Description | Status | Evidence |
|---|---|---|---|
| T2492-1 | Kickoff vertical slice (lookup index, USB-IF table, backend service + route, frontend modal, /midi/devices entry, tests) | ✅ Shipped | Commit `d88ecef4`; 15 pytest cases |
| T2492-1a | Default writer target moved to runtime state dir (out of read-only repo) | ✅ Shipped | Commit `8e6b28e2` |
| T2492-2 | Connections-page Carbon Tag entry point + auto-open wizard | ✅ Shipped | Commit `64512538`; 8 Jest cases + 3 pytest cases |
| T2492-3 | Mixxx-schema-faithful skeleton + verbatim-template attribution preservation | ✅ Shipped | Commit `4427c494`; 3 new pytest cases |
| T2492-4 | Enforced provenance trail (`runtime_extra.created_via`, `mixxx_template`, `mixxx_script`, source VID/PID, license) | ✅ Shipped | Commit `df3abd1b`; 4 new pytest cases + 4 updated |
| T2492-5 | Closeout: evidence dir + doc updates + epic status flip | ✅ This commit | This document |

## Test Totals (post-closeout)

| Suite | Cases |
|---|---|
| `tests/test_device_pack_auto_gen.py` | **22 passed** |
| `tests/test_midi_hub_status_enrichment_t2492_2.py` | **3 passed** |
| `web/.../MidiHub/portUtils.test.tsx` | **8 passed** |
| `web/.../DevicePackGenerator/DevicePackGeneratorModal.test.tsx` | **5 passed** |
| **Combined T2492 surface** | **38 passed** |

Detailed runs:
- `T2492_pytest_evidence.txt` — 25 backend cases (full pytest -v)
- `T2492_jest_evidence.txt` — 13 frontend cases

## Architecture Touchpoints

- **Lookup index**: `device-packs/_lookup-index/mixxx-controllers.json` (VID:PID-keyed Mixxx mapping index, refreshed against upstream commit `9d5df54b7a81c949a40b53c5ace60c6c4f78aa3f`)
- **USB-IF table**: `device-packs/_lookup-index/usb.ids` (offline vendor-name fallback)
- **Backend service**: `app/services/device_pack_auto_gen/{lookup,synthesis,writer}.py`
- **REST surface**: `POST /api/midi/devices/auto-generate/{lookup,synthesize,commit}`
- **Frontend wizard**: `web/src/app/components/DevicePackGenerator/DevicePackGeneratorModal.tsx`
- **Status enrichment**: `app/routes/midi_hub.py::get_hub_status` joins device-registry snapshot
- **Connections-page Tag**: `web/src/app/components/MidiHub/MidiHubConnectedDevicesReport.tsx` (uses `isUnknownDevicePort` predicate from `portUtils.ts`)
- **Provenance gate**: `app/services/device_pack_auto_gen/writer.py::_enforce_provenance`
- **Design doc**: `docs/architecture/DEVICE_PACK_AUTO_GENERATION.md`

## License Posture

- Mixxx mappings under `device-packs/_mixx-imports/` are **GPL-2.0-or-later**.
- AGPLv3 imports GPL-2.0-or-later via the GPLv3 upward chain.
- When a Mixxx template seeds an auto-generated pack:
  - The upstream XML is preserved verbatim — its `<info>` block, author tags, and license headers are untouched.
  - A MAP2 attribution comment is spliced AFTER the `<?xml ... ?>` declaration declaring the source path, upstream commit, and GPL-2.0-or-later license.
  - The JS file gets a parallel attribution header.
  - The manifest's `runtime_extra.template_license` field carries `'GPL-2.0-or-later (Mixxx)'`.
- The auto-generator XML/JS skeletons (when no Mixxx template matches) follow Mixxx's schema (`<MixxxMIDIPreset>` + `function Prefix() {}`) so the same ControllerEngine reimplementation parses both seeds identically.

## Hardware-Gated Validation (Bench Owner)

The auto-generator pipeline can be exercised end-to-end **only when** the `map2-controller-host` daemon is running and a real USB MIDI adapter is plugged in (so that `/api/midi/hub/status` surfaces a live VID/PID). The code-side gates are all green; bench-side validation with the UA-1000 + Hotone Jogg + an unknown adapter remains owner-driven.

## Cross-References

- Worklist epic entry: `docs/PROJECT_WORKLIST.md` (T2492 section)
- Related epics: T2459 (controller layer), T2459-E5 (Mixxx mirror), T2485 (unified MIDI surface)
- Standing platform directive: MIDI is one of the four first-class platform services — auto-generated packs feed the same `MidiBinding` authority used by curated profiles.
