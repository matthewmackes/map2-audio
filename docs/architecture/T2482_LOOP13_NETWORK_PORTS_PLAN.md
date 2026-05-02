# T2482 SHIP loop 13 — P3.7 Network + P3.8 misc ports plan (iter 121)

**Date:** 2026-05-01 (iter 121, SHIP loop 13 start).
**Goal:** Land first-party MidiServices surfaces for the 5 MidiHub regions that haven't been ported yet — Network, Presets, Events, Processing, Lab. Per the iter-91 design D1 ("wrap, not rewrite") + per the iter-110 loop-12 closing recommendation.
**Selected over:** P3.9 per-device legacy reframing (queued for loop 14).

---

## 1. Existing surfaces audit (iter 121)

The 5 unported MidiHub region pages are **thin wrappers** around already-built `web/src/app/components/MidiHub/*Panel` components:

| Region | MidiHub page | LOC | Composed panels |
|---|---|---|---|
| Network | `MidiHubNetworkPage.tsx` | 47 | MidiNetworkPanel, Midi2Panel, TesiraPanel, VirtualGpioPanel, StringInterfacePanel |
| Presets | `MidiHubPresetsPage.tsx` | 36 | (presets-related panels) |
| Events | `MidiHubEventsPage.tsx` | 45 | (event-list panels) |
| Processing | `MidiHubProcessingPage.tsx` | 49 | (processing panels) |
| Lab | `MidiHubLabPage.tsx` | 37 | AiLearnPanel + experimental panels |

All 5 use the `MidiHubContentFrame` wrapper + `MidiHubPanelShell` per-panel chrome. Total: 214 LOC of "thin glue" — there's no operator-facing logic in these pages, just composition.

The `/midi/network`, `/midi/presets`, `/midi/events`, `/midi/processing`, `/midi/lab` paths already mount under the iter-92 MidiServicesShell wrapping — that shell re-exports the MidiHubShell which already has these routes wired. Today, these routes work — they just brand as "MIDI Hub" in the page chrome.

## 2. Loop 13 scope (iters 121-130)

The minimal-effort path is **MidiServices-branded sibling pages** that mount the same panels but use the iter-92 MidiServicesShell chrome semantics. This avoids any duplicated panel logic.

| Iter | Sub-phase | Goal |
|---|---|---|
| 121 | (this doc) | Audit + plan |
| 122 | MidiServicesNetworkPage | New `MidiServicesNetworkPage.tsx` — Carbon Section + Layer shell that mounts the same 5 panels (`MidiNetworkPanel`, `Midi2Panel`, `TesiraPanel`, `VirtualGpioPanel`, `StringInterfacePanel`). Mounted at `/midi/network` (replaces the MidiHub-shell-routed equivalent). |
| 123 | MidiServicesPresetsPage | Mirror for Presets region. |
| 124 | MidiServicesEventsPage | Mirror for Events region. |
| 125 | MidiServicesProcessingPage | Mirror for Processing region. |
| 126 | MidiServicesLabPage | Mirror for Lab region. |
| 127 | App.tsx route flip | Replace the auto-routed `<Route path="network">` etc. inside the `/midi/*` mount with explicit routes pointing at the new MidiServices* pages. The MidiHub* pages remain available for legacy `/midi-hub/*` redirects. |
| 128 | Overview Tile expansion | Add a 5th "Network" Tile (or similar) to the iter-95/96 Overview. The 4 existing tiles stay; the 5th surfaces ttp_subscription/gpio_input binding count. |
| 129 | Tests | Smoke jest suites for each new page (renders, mounts the right panel children). |
| 130 | Roll-up | SHIP loop 13 closing log + Phase 3 readiness gate v10. |

---

## 3. Key design decisions (locked for loop 13)

### D1: Reuse panels, don't fork
The `web/src/app/components/MidiHub/*Panel` components are mature. The new MidiServices* pages import them directly. No panel logic is duplicated.

### D2: Page chrome is Carbon Section + Layer (not MidiHubContentFrame)
The MidiHubContentFrame wrapper is MidiHub-shell-specific. The new pages adopt the Section + Layer + Heading pattern from the iter-95 OverviewPage / iter-103 BindingsPage / iter-118 RoutingPage so the visual language is consistent across the MidiServices surface.

### D3: Smoke tests only in iter 129
Per the iter-110 loop-11 limitation: full interactive tests need elaborate Carbon Modal + QueryClientProvider mocking. Loop 13's tests just confirm the new pages render and mount the right panel components — same scope as iter-119's catalogue tests.

### D4: Overview's 5th Tile uses a NEW count source
The iter-117 useRoutingMatrix provides `colTotals` per consumer_type. The iter-128 Network Tile counts `ttp_subscription + gpio + tesira_ttp` consumer types via a small new selector hook. No new backend endpoint.

### D5: MidiHub legacy pages stay untouched
The iter-93 redirect map already routes `/midi-hub/*` → `/midi/*`. The MidiHub pages keep working for any other internal link that hasn't been audited yet. Loop 14+ does the per-device legacy reframing (P3.9) and can sweep the MidiHub* pages then.

### D6: Carbon-only (continued)

---

## 4. Risks + mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Panels assume a MidiHubContentFrame ancestor | low | Loop-10 audit showed the MidiHub shell pages compose panels directly — no shell-specific context. iter-122 will smoke-test by rendering each panel inside Section/Layer to confirm. |
| Two pages mount the same panel, leading to double-subscription | low | The MidiHub shell wins under `/midi-hub/*`; the new MidiServices pages win under `/midi/*`. They're never mounted simultaneously by React Router. |
| Adding a 5th Overview Tile breaks the auto-fit grid | low | Iter-95 CSS uses `grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr))` so a 5th card just wraps. |
| Tests grow beyond what mocking can handle | medium | Smoke tests only (iter 129 D3). Full interactive coverage stays deferred. |

---

## 5. Cross-references

- T2482 epic Phase 3 design: `docs/architecture/MIDI_SERVICES.md` §4 (P3.7 + P3.8 sub-phases)
- iter-110/120 closing logs: where loop 13 was queued
- iter-92 MidiServicesShell re-export pattern (precedent for D1)
- iter-95 OverviewPage Section/Layer chrome (precedent for D2)
- existing panels: `web/src/app/components/MidiHub/*Panel.tsx`
- standing UI standard: `docs/design/CARBON_CONFORMANCE_STANDARD.md`
