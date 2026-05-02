# T2482 SHIP loop 14 — P3.6 Transport + P3.9 per-device + P3.10 Brain reframing plan (iter 131)

**Date:** 2026-05-01 (iter 131, SHIP loop 14 start).
**Goal:** Close the remaining 3 P3 sub-phases. Loop 14 is the **final substantive Phase 3 loop** — once shipped, P3 is fully DONE and the T2482 epic is ready for close-out (loop 15+).
**Scope:**
  1. **P3.6** — dedicated `/midi/transport` MidiServices sibling page (replaces the iter-127 fallback that still routes /midi/transport to MidiHubTransportPage).
  2. **P3.9** — cross-link banners on the 8 per-device editor pages pointing back to MidiServices.
  3. **P3.10** — Brain Setup + Brain Inputs reframing: `/brain` style pages get a cross-link banner identifying them as MidiServices consumers.

---

## 1. Existing surfaces audit (iter 131)

### Per-device editors (P3.9 targets)

8 first-party per-device editor pages, all at top-level routes:

| Page | Route | Device-pack profile_key | iter-98 mapping rule |
|---|---|---|---|
| `MaschinePage.tsx` | `/maschine` | `native-instruments/maschine-mk1.midi` | iter-98 known |
| `MaschineMidiMapPage.tsx` | `/maschine/midi-map` | `...maschine-mk1.midi-map` | iter-98 known |
| `McuPage.tsx` | `/mcu` | `mackie/mcu.midi` | iter-98 known |
| `LaunchControlPage.tsx` | `/launch-control` | `novation/launch-control-xl.midi` | iter-98 known |
| `MidiCommanderPage.tsx` | `/midi-commander` | `midi-commander/v1.midi` | iter-98 known |
| `GroundControlProPage.tsx` | `/ground-control-pro` | `ground-control-pro/v2.midi` | iter-98 known |
| `MPX1Shell` (under `components/Devices/MPX1/`) | `/mpx1/*` | `lexicon/mpx-1.midi` | iter-98 known |
| `IntelFX` (under `components/Devices/`) | `/intelfx/*` | `intel-fx/intel-fx.midi` | iter-98 known |

All 8 already have an entry in the iter-98 `devicePackEditorRoutes.ts` editor-route map — the cross-link goes the OTHER direction (per-device page → MidiServices Devices INDEX).

### Brain editor surfaces (P3.10 targets)

- `PerformanceBrainPage.tsx` — `/brain` top-level page
- `brainViews/` — sub-views nested under the brain shell
- `brainHandoff.ts` — handoff utilities (not a page)

### Transport (P3.6 target)

`/midi/transport` currently routes to `MidiHubTransportPage` per the iter-127 fallback. Need a dedicated `MidiServicesTransportPage.tsx` sibling.

## 2. Loop 14 scope (iters 131-140)

| Iter | Sub-phase | Goal |
|---|---|---|
| 131 | (this doc) | Audit + plan |
| 132 | MidiServicesTransportPage | Closes the iter-127 fallback. Mounts the same panels MidiHubTransportPage uses. |
| 133 | MidiServicesCrossLinkBanner | New shared component — `<MidiServicesCrossLinkBanner profileKey="..." />`. Renders an InlineNotification + Carbon Link to /midi/devices/{profileKey}. Single source of truth so iters 134-138 are identical 3-line additions per page. |
| 134 | MaschinePage + MaschineMidiMapPage banner | 2 pages, 1 banner each. |
| 135 | McuPage + LaunchControlPage banner | 2 pages. |
| 136 | MidiCommanderPage + GroundControlProPage banner | 2 pages. |
| 137 | MPX1Shell + IntelFX banner | 2 surfaces — both are shells, banner mounts at the top of each. |
| 138 | PerformanceBrainPage banner | 1 page; Brain banner copy is slightly different ("Brain inputs are MIDI Services consumers"). |
| 139 | Tests | jest tests for the iter-133 cross-link banner component + smoke tests confirming each per-device page renders its banner. |
| 140 | Roll-up | SHIP loop 14 closing log + Phase 3 readiness gate v11 + **T2482 Phase 3 DONE marker**. |

---

## 3. Key design decisions (locked for loop 14)

### D1: Single banner component, not 9 copies
Per the standing CLAUDE.md anti-duplication rule. The iter-133 `MidiServicesCrossLinkBanner` carries the InlineNotification + Carbon Link composition. Iters 134-138 each add 1 import + 1 JSX line per page.

### D2: Banner uses iter-98 devicePackEditorRoutes in REVERSE
The iter-98 map answers "given a profile_key, what's the editor route?". The reverse direction (editor route → profile_key) is implied by the same map — iter 133 just inverts it once at module load. No new data file.

### D3: Brain banner copy is bespoke
The 8 per-device pages get a uniform banner. Brain is a different concept (it's an INPUT consumer for MIDI events, not an editor) so iter 138 takes a slightly different copy + still uses the same banner component (the copy is a prop).

### D4: Smoke tests only
Per the same iter-121 D3 / loop-13 limitation. Render each page, assert the banner is in the document. Not asserting full interactive behavior of the underlying editor.

### D5: P3.6 Transport sibling page is minimal
Same iter-122 D1/D2 pattern. Wrap the same panel components MidiHubTransportPage uses. Iter 132 is a 50-line port.

### D6: Loop 14 is the LAST substantive Phase 3 loop
Per the iter-130 closing log. After iter 140, P3 is DONE. Loop 15+ does T2482 epic close-out (philosophy doc updates, final status fold, archive sweep) — no new feature work.

### D7: Carbon-only (continued)

---

## 4. Risks + mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Existing per-device page tests break when a banner is added | medium | Banners are inline rather than wrapping; existing tests should ignore the new InlineNotification element. Iter 139 smoke tests confirm. |
| Banner adds visual clutter at top of dense per-device pages | low | InlineNotification is dismissible; banner state stored in localStorage so dismissal persists. (Defer dismissal to loop 15+ if needed; iter 133 ships a non-dismissible info banner first.) |
| Brain page may not exist at all — only the handoff util does | low | iter-131 audit confirmed `PerformanceBrainPage.tsx` exists. iter-138 reads it before editing. |
| MPX1 + IntelFX are shells with multiple sub-views; banner placement ambiguous | medium | Mount the banner at the top of the shell so all sub-views inherit it. |
| Loop 14 close-out triggers the "Phase 3 DONE" marker — premature if a sub-phase is incomplete | low | iter 140 audits all 10 sub-phases against the design doc before marking DONE. If any gap surfaces, the marker is held back. |

---

## 5. Cross-references

- T2482 epic Phase 3 design: `docs/architecture/MIDI_SERVICES.md` §4 (P3.6, P3.9, P3.10)
- iter-130 SHIP loop 13 closing log: where P3.6/P3.9/P3.10 were queued
- iter-98 devicePackEditorRoutes (precedent for the bidirectional map): `web/src/app/pages/midi-services/devicePackEditorRoutes.ts`
- per-device pages: `web/src/app/pages/{Maschine,Mcu,LaunchControl,MidiCommander,MaschineMidiMap,GroundControlPro}Page.tsx`
- shell pages: `web/src/app/components/Devices/MPX1/MPX1Shell.tsx`, IntelFX shell
- Brain page: `web/src/app/pages/PerformanceBrainPage.tsx`
- standing UI standard: `docs/design/CARBON_CONFORMANCE_STANDARD.md`
