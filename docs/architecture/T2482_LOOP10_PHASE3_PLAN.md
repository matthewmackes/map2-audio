# T2482 SHIP loop 10 — Phase 3 frontend plan (iter 91 audit)

**Date:** 2026-05-01 (iter 91, SHIP loop 10 start).
**Goal:** Land the foundational pieces of T2482 Phase 3 — `/midi` mount, "MIDI Services" rename, redirect map, and overview region — without trying to do all 10 sub-phases (P3.1-P3.10) in 10 iters.
**Selected over:** post-P1.2 polish (per the iter-90 worklist queue, after user direction at SHIP-loop-9 close).

---

## Current state (iter 91 audit)

### Existing MIDI Hub frontend surface

`web/src/app/pages/midi-hub/` contains 10 pages:
- `MidiHubConnectionsPage.tsx` — "Connections" (default landing)
- `MidiHubPresetsPage.tsx` — Presets
- `MidiHubTransportPage.tsx` — Transport / clock
- `MidiHubEventsPage.tsx` — Event lists
- `MidiHubProcessingPage.tsx` — Processing pipelines
- `MidiHubNetworkPage.tsx` — Network (RTP-MIDI, Tesira TTP, GPIO, etc.)
- `MidiHubLabPage.tsx` — Lab (experimental)
- `MidiHubContentFrame.tsx` — Inner shell wrapper
- `MidiHubTabs.tsx` — Tab-bar component
- `MidiHubHealthDrawer.tsx` — Side health drawer

Plus `MidiHubShell.tsx` (top-level page shell).

`web/src/app/components/MidiHub/` has 8 components (Mapper, Filter Planner, etc.).

### Existing route mounts in `App.tsx`

```tsx
// line 497: /midi currently redirects to /midi-hub/connections
<Route path="/midi" element={<Navigate to="/midi-hub/connections" replace />} />

// line 498-499: /midi-hub-2 + /midi-hub also redirect to connections
<Route path="/midi-hub-2" element={<Navigate to="/midi-hub/connections" replace />} />
<Route path="/midi-hub" element={<Navigate to="/midi-hub/connections" replace />} />

// line 506: /midi-hub/* mounts the shell
<Route path="/midi-hub/*" element={... <MidiHubShell /> ...}>

// line 607-609: /midi/assignments already mapped to MidiAssignmentsPage
<Route path="/midi/assignments" element={... <MidiAssignmentsPage /> ...} />
<Route path="/midi-assignments" element={<Navigate to="/midi/assignments" replace />} />
<Route path="/midi-hub/assignments" element={<Navigate to="/midi/assignments" replace />} />
```

### Phase 3 design contract (from `MIDI_SERVICES.md` §4 Phase 3)

10 sub-phases (P3.1 through P3.10):
- P3.1 mount + AppShell entry + redirect map
- P3.2 Overview region
- P3.3 Devices region
- P3.4 Bindings region
- P3.5 Routing region
- P3.6 Transport region
- P3.7 Network region
- P3.8 Presets/Events/Processing/Expression/Lab regions (mostly direct ports)
- P3.9 Per-device legacy page reframing (cross-link banners)
- P3.10 Brain Setup + Brain Inputs reframed as MIDI Services consumers

**Exit criteria** (per the design doc): every operator-visible MIDI surface lives at or beneath `/midi`. Old routes redirect cleanly. No UI regressions in snapshot-editor inline MIDI editors. Per-device DSP editors untouched.

---

## Loop 10 scope (iters 91-100)

10 iters can't deliver all 10 sub-phases. Loop 10 ships **P3.1 + P3.2 + P3.3 (partial)** — the foundational mount + redirect + overview + devices region. Remaining sub-phases (P3.4-P3.10) queue for loop 11+.

| Iter | Sub-phase | Goal |
|---|---|---|
| 91 | (this doc) | Audit + plan |
| 92 | P3.1 mount | New `/midi` route mounting `MidiServicesShell.tsx` (wraps the existing MidiHubShell content with the new label). The flip is **renaming** the shell, not rewriting it. |
| 93 | P3.1 redirect | `/midi-hub/*` → `/midi/*` redirect map (reverse of today's `/midi → /midi-hub`). Preserve every legacy URL. |
| 94 | P3.1 nav rename | Update the GlobalTreeNav + AppShell + WorkspaceBar labels. "MIDI Hub" → "MIDI Services" everywhere user-visible. |
| 95 | P3.2 overview | New `MidiServicesOverviewPage.tsx` — landing page that aggregates state via the iter-46/etc. canonical APIs. |
| 96 | P3.2 cards | 4 Carbon Tile cards (Devices, Bindings, Routing, Transport) on the Overview page with live counts via TanStack Query polling `/api/midi/bindings/count` + the existing endpoints. |
| 97 | P3.3 prep | Re-audit: which existing MidiHub pages actually map to "Devices" region intent vs others. Identify the smallest possible Devices landing surface. |
| 98 | P3.3 list | `/midi/devices` page — Carbon DataTable of MIDI devices populated from `/api/midi/bindings?consumer_type=device_pack` aggregations. |
| 99 | P3.3 detail | `/midi/devices/:device_id` per-device editor pane stub with the iter-46 inline editors retained. |
| 100 | Roll-up | SHIP loop 10 closing log + Phase 3 readiness gate v7. |

---

## Key design decisions (locked for loop 10)

### D1: shell wrapping, not rewriting

`MidiHubShell` is mature (~10 pages + 8 components + multiple test files). Iter 92 introduces `MidiServicesShell.tsx` as a thin wrapper that mounts the existing MidiHub pages under the new `/midi` mount point. **No frontend code is rewritten in loop 10**; the change is routing + labels + 1 new overview page + 1 new devices page.

This matches the iter-50 pattern of the reality audit revealing existing surfaces are more complete than the design doc claimed.

### D2: redirect direction flip

Today: `/midi → /midi-hub/connections`.
Loop 10: `/midi-hub/* → /midi/*` (preserve every legacy URL via React Router `<Navigate>`).

The `/midi/assignments` route is already separate and stays as-is — it predates Phase 3.

### D3: Overview page as a NEW surface, not a port

Phase 3 P3.2 says "Overview region (the new landing page)" — explicitly NEW, not a rebranded existing page. Iter 95 ships a brand-new component using Carbon `Tile`s + `useQuery` polling against the existing `/api/midi/bindings/count` and friends.

### D4: Devices region uses the canonical `/api/midi/bindings` filtering

Iter 98 doesn't add a new backend route; it filters `/api/midi/bindings` via the existing `consumer_type=device_pack` query parameter. Aggregations are computed client-side from the binding list.

### D5: Carbon-only

Per the standing CARBON_CONFORMANCE_STANDARD doc — every new component is `@carbon/react` based. No MUI, no Phosphor expansion, no inline styles for colors.

---

## Risks + mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Existing MidiHub tests fail when shell is renamed/wrapped | medium | Iter 92 introduces the new shell as a wrapper; existing tests continue against MidiHubShell internals. Tests exercising the route URL change (rare) get updated in the same commit. |
| Operators get confused by mid-flight rename ("MIDI Hub" → "MIDI Services") | low | Per the iter-91 design doc, every legacy URL redirects; the rename is purely cosmetic from the operator's point of view. Toast/banner on first visit could ease the transition (deferred to a future iter if needed). |
| `/midi/assignments` collision with the new `/midi/*` mount | low | iter 92 explicitly orders the routes so `/midi/assignments` continues to win (predates Phase 3). React Router matches in declaration order. |
| Overview page polling adds load to `/api/midi/bindings/count` | low | The existing endpoint is cheap (single SQL COUNT); 5-second poll cadence matches other Carbon surfaces. |
| `MidiHubShell` internal navigation hardcodes `/midi-hub/*` paths that break under the new `/midi/*` mount | medium | Iter 92 audits + updates internal navigation to use relative routes; iter 93 ensures the redirect catches anything missed. |

---

## Cross-references

- T2482 epic Phase 3 design: `docs/architecture/MIDI_SERVICES.md` §4 (lines 249-262)
- iter-50 SHIP loop 5 closing log: where Phase 3 was first deferred behind P1.1/P1.2
- iter-90 SHIP loop 9 closing log: "Recommended next loop: Loop 10: Phase 3 frontend `/midi` Carbon canonical surface"
- Existing MidiHub frontend: `web/src/app/pages/MidiHubShell.tsx` + `web/src/app/pages/midi-hub/` (10 pages) + `web/src/app/components/MidiHub/` (8 components)
- Existing routes in `web/src/app/App.tsx`: lines 497-506 + 607-609
- Standing UI standard: `docs/design/CARBON_CONFORMANCE_STANDARD.md`
