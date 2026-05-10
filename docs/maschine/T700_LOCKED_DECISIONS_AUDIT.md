# T700 Locked-Decisions Audit (T2499-B Slice 1)

**Status:** Audit slice — gating prerequisite for T2499-B "Calibrate Maschine MK1" implementation.
**Filed:** 2026-05-10
**Source epics:** T700 (closed) "MK1 Headless Primary Interface" + T666 (closed) "MK1 as primary control surface".
**Source files surveyed:**
- [docs/archive/PROJECT_WORKLIST_ARCHIVE_20260504.md](../archive/PROJECT_WORKLIST_ARCHIVE_20260504.md) — T700 epic body (lines ~33778-33900) + Phases 1-5
- [docs/MASCHINE_MK1_OPERATION_GUIDE.md](../MASCHINE_MK1_OPERATION_GUIDE.md) — Phase-5 deliverable
- `/home/mm/.claude/projects/-home-mm-map2-audio/memory/project_t700_mk1_headless.md` — full Q1-Q75 lock list

---

## Why this audit exists

T2499-B's locked decision Q2 makes T700 audit a **prerequisite**:
> "audit T700's 75 locked decisions before architecting. T700 may already specify the onboarding architecture; choose between (a) wrap-existing-daemon, (b) onboarding-orchestrator, (c) state-machine-refactor based on what's already locked."

This document delivers that classification + recommendation so the next slice can start from a chosen architecture rather than re-litigating it.

---

## Section A — Per-decision classification

Each Q is tagged:
- **onboarding** — touches first-connection / calibration / pad-pressure / LCD calibration / profile selection / per-unit setup. T2499-B is bound to honor these.
- **runtime** — live operation: LED choreography, SHIFT semantics, encoder rules, navigation, profile-scope behavior. T2499-B inherits but does not author.
- **infra** — build / DSL / persistence / config / render-pipeline plumbing. T2499-B reads these as platform contracts.

| Q# | One-line lock | Class |
|---|---|---|
| Q1 | Hardware layout IS the page; LCD profile picker inline; `/maschine/midi-map` redirects to merged page | runtime |
| Q2 | Brain instrument mapping included; silent activation when Brain is in chain | runtime |
| Q3 | Full takeover with unused key for profile cycling across all configurations | runtime |
| Q4 | "Come alive" on connect using last known configuration | **onboarding** |
| Q5 | Config persistence is automatic (no explicit save) | infra |
| Q6 | LCD profile catalog with 5 templates + opt-out; full use of 255×64 space | runtime |
| Q7-Q10 | Profile-nav / encoder-resolution / LED-feedback / Brain-precedence / pad-auto-config family | runtime |
| Q10a-Q10c | Boot detail preferences (operator-visible verbosity / skip / animation) | **onboarding** |
| Q11 | Shutdown persistence behavior | infra |
| Q12 | Health strip visualization | runtime |
| Q13 | Static controls listed in GUI React interface | infra |
| Q14 | Cozette font baseline (later expanded in Q59) | runtime |
| Q15 | NI MK1 schematic diagram as center anchor; every control clickable in React GUI | runtime |
| Q16 | WebGL2 canvas rendering for faithful MK1 GUI | infra |
| Q17 | 25 LED animation options per LED (full catalog) | runtime |
| Q18 | Full LED animation catalog per slot | runtime |
| Q19 | Pad pressure handling (curves + AutomationEngine routing — see Q42 expansion) | runtime |
| Q20 | Incident log at `~/.map2/maschine_incident_log.jsonl` | infra |
| Q21 | File management scope | infra |
| Q22 | Single user identity (matthewmackes) | infra |
| Q23 | MIDI port naming convention | infra |
| Q24 | Recovery flows | runtime |
| Q25 | Close-out | infra |
| Q26 | Accessibility deferred | infra |
| Q27 | i18n handling deferred | infra |
| Q28 | Hook into MAP2 AutomationEngine (no parallel macro system) | runtime |
| Q29 | Learn mode | runtime |
| Q30 | Hard-map MK1 keys to existing source-of-truth services | infra |
| Q31 | Snapshots are the recall primitive for all MK1 recall actions | runtime |
| Q32 | Pedal integration | runtime |
| Q33 | OSC integration | infra |
| Q34 | Sampling integration | runtime |
| Q35 | Step sequencer via Brain (`/api/engine/brain/*`) | runtime |
| Q36 | T14 Kit Browser profile — Brain kits via `/library`, encoder scroll, push-to-load, tempo-synced crossfade via C++ MorphEngine | runtime |
| Q37 | Immediate auto-save to source-of-truth services (debounced ~100 ms for encoder sweeps) | infra |
| Q38 | Single operator always (no performer profiles, no chain-context switching) | runtime |
| Q39 | Clock source user-selectable via SHIFT+TEMPO (INTERNAL / EXT-MIDI-IN / EXT-LINK) with 2 s-dropout auto-fallback | runtime |
| Q40 | Transport optimistic-local + remote transport mirroring + LCD origin toast | runtime |
| Q41 | Three-tier erase — trivial=instant+undo, heavy=hold-ERASE 500 ms, permanent=double-tap+LCD dialog | runtime |
| Q42 | Pressure routing stack — ALSA poly aftertouch + AutomationEngine + Brain per-pad curves + snapshot-scoped automation lane recording | runtime |
| Q43 | Hierarchical NAV — encoder turn=navigate at scope, push=ascend; SHIFT combos for faster navigation; `MASCHINE_MK1_OPERATION_GUIDE.md` is the epic-end deliverable | runtime |
| Q44 | 4 pad layouts — CHROMATIC / DRUM / BLOCK / SCALE via SHIFT+pad-layout-button; session-scoped; default per profile | runtime |
| Q45 | SHIFT semantic stack — momentary + caps-lock + meta-shift (double-tap) + LCD help overlay while held | runtime |
| Q46 | Error severity tiers (info / warn / error / critical) with incident log + T13 Incident Log profile | runtime |
| Q47 | T16 Monitor profile + 8-pixel bottom monitor strip on all profiles | runtime |
| Q48 | Pad LED 5-tier brightness + Q17 animations + chain-color metadata (forward-compat RGB) + SHIFT+VIEW inspection overlays | runtime |
| Q49 | MK1 state embeds in snapshot JSONB at `document.controllers.maschine_mk1`; participates in VALIDATING→STAGING→APPLYING→VERIFYING→LIVE | infra |
| Q50 | First-connection guided LCD tour (10 steps, ~2 min, skippable via ERASE) | **onboarding** |
| Q51 | Full headless admin console — MAP2 services + systemctl + power controls + OS updates + hardware health; T17 / T18 profiles | runtime |
| Q52 | T18 access — hidden, SHIFT+T-selector to enter, session unlock (hold encoder-1 push 3 s), session ends on reboot/restart/30 min idle | runtime |
| Q53 | SHIFT state — one-shot sticky rule, meta locked until explicit exit, SHIFT LED (off / solid / pulse), LCD header "SHIFT: OFF/STICKY/META" | runtime |
| Q54 | Universal encoder rule — push=commit/select, push-hold 500 ms=secondary, never push while turning, LED flash on push, ring-fill LCD on hold | runtime |
| Q55 | Modifier-first rule for simultaneity; no chord binding system | runtime |
| Q56 | 12 px top bar + 12 px bottom bar + 40 px profile canvas on both LCDs | runtime |
| Q57 | Full LED density — brightness tiers + profile signature animations (1 s on entry) + 2 dedicated heartbeat LEDs + dim-idle-glow on mapped buttons | runtime |
| Q58 | Full retained-mode render pipeline — scene graph, damage tracking, declarative layouts, double-buffered framebuffer, 60 fps daemon target | infra |
| Q59 | Six-font roster — Spleen 5×8 + Cozette 6×12 + Tamsyn 8×16 + Terminus 16×32 + Unscii (symbols) + Nerd Font/Siji (icons) + custom MAP2 Display Face (32 px hand-drawn) | infra |
| Q60 | Boot sequence — wordmark pixel-wipe → scrolling system readout → 62-slot LED chase → LCD pixel test → profile load; skippable | **onboarding** |
| Q61 | Shutdown ceremony — "Saving state…" → per-item receipts → session summary → LED farewell wave → "Goodbye" | runtime |
| Q62 | Idle screensaver (10 min) — per-LCD ambient mode + presence wake via pressure 50-200 + any button | runtime |
| Q63 | Long-op feedback — LCD progress + transport LED 4-segment bar + op-specific pad signatures + cancel via hold-ERASE | runtime |
| Q64 | Audio-reactive LEDs — beat flash + clip indication + spectrum-reactive pads + Brain-aware sequencer choreography. Profile-scoped to Brain profiles | runtime |
| Q65 | Pattern fill catalog — 4 Bayer levels + named (hatch/cross/stipple/scanline/vertical-bars/checkers) + animated variants | runtime |
| Q66 | Icon system — ~60 icons × 3 sizes (8/12/16 px) × 4 states (outline/solid/dashed/pulsing); hand-drawn per size | runtime |
| Q67 | Profile DSL two-tier — JSON+flexbox+reactive bindings for simple profiles (~80 %); Python class for complex profiles (Effect Chain Editor, Brain Step, Sampler, Monitor, Incident Log, Admin) | infra |
| Q68 | 25-profile final catalog (T1-T25 — Control / Chain / Brain / View / Sampler / Monitor / Quad-Morph / Admin / Help) | runtime |
| Q69 | Web UI role deferred | infra |
| Q70 | "Instant" precisely defined (<50 ms for normal actions) + confirm-bypass within session (30 s sudo-timeout style) + immediate LCD feedback on all gates | runtime |
| Q71 | Snapshot activation UX — phase labels visible (VALIDATING/STAGING/APPLYING/VERIFYING/LIVE) + per-phase LED signatures + rollback visibility + crossfade position read from C++ MorphEngine | runtime |
| Q72 | T15 Quad Morph Editor — LCD quad map + corner snapshot names + encoders 1-4 weight adjust + pads as XY controller + pressure=curve shape; gesture recording via existing AutomationEngine lane | runtime |
| Q73 | Snapshot lifecycle on MK1 — recall + SHIFT+REC 2 s quick-save + ERASE 500 ms delete; **NO** rename/edit/version/template authoring on MK1 | runtime |
| Q74 | MK1 config two-layer with per-key opt-in — global default + snapshot overrides; scope assignments: buttons=global, encoders=global, pad-layout=per-snapshot, profile=per-snapshot, LED-animations=per-snapshot, screensaver=global, admin-unlock=global | infra |
| Q75 | Single T700 epic, phased delivery (5 phases) | infra |

---

## Section B — Summary counts

| Class | Count | Decisions (representative) |
|---|---|---|
| **onboarding** | 6 | Q4, Q10a-Q10c, Q50, Q60 |
| **runtime** | 47 | Q1-Q3, Q6-Q10, Q12, Q14-Q15, Q17-Q19, Q24, Q28-Q29, Q31-Q32, Q34-Q36, Q38-Q48, Q51-Q57, Q61-Q66, Q68, Q70-Q73 |
| **infra** | 22 | Q5, Q11, Q13, Q16, Q20-Q23, Q25-Q27, Q30, Q33, Q37, Q49, Q58-Q59, Q67, Q69, Q74-Q75 |

T2499-B is bound by **6 onboarding-class** decisions. The 47 runtime locks are inherited contracts — T2499-B does not re-architect them; it composes the existing primitives.

---

## Section C — Architecture recommendation

> **Recommendation: (b) onboarding-orchestrator.**

### Why (a) wrap-existing-daemon falls short

The existing `app/services/maschine/maschine_mk1_daemon.py` + `boot_sequence.py` + `shutdown_sequence.py` + `onboarding.py` already implement Q60 / Q61 / partial Q50. Wrapping the daemon means **layering calibration steps on top of the boot sequence** — but Q50 is a 10-step *interactive* tour that happens **after** boot, driven by NOTE REPEAT / NAVIGATE / ERASE button advance. T2499-B's calibration flow (pad sensitivity → pressure curves → LCD calibration → profile selection) is the same shape: an interactive multi-step orchestration with on-LCD UI. That is not a "wrapper around boot" — it's a sibling lifecycle step.

### Why (c) state-machine refactor is overkill

MK1 is locked as **observer-only** at the state-authority level (Q1=C per State Authority audit; Q49). All state computations (snapshot phase machine, morph position, automation, Brain state) live in backend services. A unified web-UI ↔ MK1 state machine would either (a) duplicate the snapshot lifecycle's existing phase machine, violating Q49, or (b) demand a new shared state-store, violating Q31 (snapshots are the recall primitive). The dual-surface UX in T2499-B's Q3 ("operator picks the surface; state is shared via a single state machine") can be satisfied without rewriting MK1's runtime — both surfaces drive the same orchestrator, which already owns the state.

### Why (b) onboarding-orchestrator wins

A new top-level service `app/services/maschine/onboarding_orchestrator.py` that:

1. **Subscribes** to backend readiness events (engine ready, SnapshotRuntimeService ready, MK1 USB connect) — reuses existing boot/shutdown subscribers.
2. **Coordinates** the on-initial-connection guided tour (Q50 steps 1-10) as a state machine local to the orchestrator. Persists current step index + skip flag to per-unit YAML at `~/.map2/devices/maschine-mk1-<USB_SERIAL>-calibrated.yaml` (T2499-B Q4 locked path).
3. **Adds** the T2499-B-specific calibration phases: pad sensitivity sweep, pressure curve fit, LCD calibration grid, profile-catalog selection (Q68 25 profiles).
4. **Delegates** rendering + button dispatch to the existing `MaschineProfileRuntime` — the calibration/onboarding UI is just a **temporary profile** in the existing render pipeline (Q58 retained-mode + Q67 profile DSL).
5. **Delegates** boot/shutdown ceremonies (Q60/Q61) to existing `boot_sequence.py` / `shutdown_sequence.py` — orchestrator runs **after** boot.
6. **Drives both surfaces** (web UI ↔ MK1 LCD) from one source of truth: the orchestrator's state machine emits ProfileEvent frames consumed by the daemon's render pipeline, and emits WebSocket frames consumed by the React UI. Both surfaces accept input via the same in-flight command schema, so dual-surface (T2499-B Q3) drops out for free.

### Bound contracts the orchestrator must honor

- **Q4** "come alive with last known config" — orchestrator probes the per-unit YAML on USB connect; if `calibrated_at` is set and within freshness window, skip calibration and hot-load.
- **Q10a-Q10c** boot detail prefs — orchestrator reads, doesn't author.
- **Q50** 10-step LCD tour — orchestrator owns; the calibration steps come **after** the tour for first-time MK1s.
- **Q60** boot sequence — runs first; orchestrator activates after `boot_sequence.complete` signal.
- **Q49** snapshot embedding — calibration data does **not** embed in snapshot JSONB. Per-unit YAML at `~/.map2/devices/...` is the canonical store (matches MeloAudio override pattern).
- **Q74** two-layer config — onboarding writes to "global default" layer; snapshot-recallable items (profile, pad-layout, LED-anims) write through the existing snapshot service.

### Estimated next-slice effort

- Slice 2 (per-unit calibration YAML schema + atomic writer + tests): 1 day.
- Slice 3 (orchestrator state-machine skeleton + happy-path tour replay): 2 days.
- Slice 4 (pad sensitivity sweep): 1-2 days.
- Slice 5 (pressure curve fit): 1-2 days.
- Slice 6 (LCD calibration grid): 1 day.
- Slice 7 (profile-catalog selection — 25-profile picker over Q68): 1 day.
- Slice 8 (dual-surface React page + WebSocket frame contract): 2-3 days.
- Slice 9 (HIL parity bench gate — operator-side, **not** code-side).

Total ~9-12 days code-side; bench gate is operator-driven.

---

## Section D — Files the next slice will touch

(Pre-flight reference only; not a commitment to a specific edit.)

- New: `app/services/maschine/onboarding_orchestrator.py`
- New: `app/services/maschine/calibration_store.py` (per-unit YAML CRUD)
- New: `app/schemas/maschine_calibration.py` (Pydantic + JSON-Schema)
- New: `web/src/app/pages/maschine/MaschineOnboardingPage.tsx`
- New: `web/src/app/components/Maschine/Onboarding/` (shared UI primitives)
- Touch: `app/services/maschine/maschine_mk1_daemon.py` (subscribe to orchestrator events)
- Touch: `app/services/maschine/boot_sequence.py` (emit `boot_sequence.complete`)
- Tests: `tests/test_maschine_onboarding_orchestrator.py`, `tests/test_maschine_calibration_store.py`, paired jest tests.

---

## Decision

T2499-B opens with **Slice 2: per-unit calibration YAML schema + writer + tests** following architecture (b). No further T700 audit is needed; the onboarding contracts (Q4, Q10a-c, Q50, Q60) are read-only inheritance from this point.

Last updated: 2026-05-10 EDT — Claude.
