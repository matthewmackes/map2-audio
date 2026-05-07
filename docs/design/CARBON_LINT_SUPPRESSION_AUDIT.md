# Carbon Lint Suppression Audit (T2481-G3)

**Status:** Authored 2026-05-04 — burndown audit closing T2481-G3 (lint suite hardened, suppressions justified).

**Scope:** Every `// eslint-disable-line`, `// eslint-disable-next-line`, `/* eslint-disable */`, `// @ts-nocheck`, `// @ts-ignore`, `// @ts-expect-error`, and `// carbon-allow:` annotation in `web/src/`. Excludes `__snapshots__/**` and test files (which inherit per-files overrides).

**Result:** Every active suppression in `web/src/` is either (a) a §10.5 hardware-skin / device-graphics / audio-domain density carve-out (`// carbon-allow:`, ~84 sites), or (b) a narrowly-scoped per-line ESLint suppression for an unrelated rule (`react-hooks/exhaustive-deps`, `no-console`, `no-new-func`, `no-alert`, ~12 sites — down from 15 after the T2481-Z cleanup retired the 3 dead `react-refresh/only-export-components` per-line suppressions on 2026-05-04), or (c) a documented whole-file `@ts-nocheck` on the auto-generated OpenAPI artifact (1 site, header explains: T2455 cluster-proxy duplicate operation IDs).

**No active suppression references the four MAP2 lint rules** (`map2/no-mui-import`, `map2/no-ad-hoc-transition`, `map2/no-hardcoded-px-spacing`, `map2/no-hardcoded-font-family`). The lint suite at `'error'` runs clean: `npm --prefix web run lint` reports **0 errors / 0 warnings**.

---

## Category 1 — `// carbon-allow:` annotations (~84 sites)

These are the documented §10.5 carve-outs the MAP2 lint plugin's escape-hatch covers. All annotations carry a one-line rationale on the preceding source line.

**Acceptable rationales:**

- **Audio-domain motion** — meter ballistics 0.05s, gate state-LED 0.1s, tuner needle 0.05s, AVB grid hover 60ms, UnifiedChannelGrid column-resize 60ms linear. Below the design-language scale by spec (T2466 SHIP-loop convention; CARBON_FIT_AND_FINISH_RUBRIC §3 last paragraph).
- **Hardware-skin / device-graphics density** — pixel-exact spacing on rendered hardware faceplates, vendor-skin panels, and pad/encoder/LED visualizations (PluginCards/Custom/**, Devices/<vendor>/**, MPX-1 SVG panel, IntelFX signal-flow canvas, Maschine MK1 grid, etc.). Part of the rendered device's visual identity per §10.5.
- **Dense surface off-grid** — capability-matrix rows, pass/fail status pills, optional-tag pills, dense service-control buttons, inline label-value pairs that need sub-Carbon spacing (6/10/12px shapes between Carbon stops). Documented as deliberate density choices.
- **Plugin-parameter chrome** — LV2PluginParameterEditor + PluginBrowser dense rows. Per-parameter chrome is plugin-specific, not platform chrome.

The full per-file list is too long to enumerate here; `grep -rn "carbon-allow" web/src/` produces it.

**Drift posture:** Future `// carbon-allow:` annotations land alongside the rule violation they suppress. CI builds fail on new violations without the annotation; future refactors should *retire* the suppression by moving to a token-based shape rather than adding more.

---

## Category 2 — narrowly-scoped per-line ESLint suppressions (~12 sites)

> **Update 2026-05-04:** the original audit listed 15 sites including 3 `react-refresh/only-export-components` per-line annotations on `MPX1Shell.tsx:48`, `IntelFXShell.tsx:63`, `LCDShell.tsx:37`. Those were retired in cycle 49 (commit `e359ccbb`) because the rule is globally `'off'` in 6 different blocks of `web/eslint.config.js` (root + 5 per-files overrides) — the suppressions were dead code. The table below reflects the current 12-site state.

| File | Line | Rule | Rationale |
|---|---|---|---|
| `app/layout/useSetShellWindow.ts` | 17 | `react-hooks/exhaustive-deps` | Intentional deps stabilization on a one-shot mount effect. |
| `components/MidiHub/MidiClusterEnableSection.tsx` | 59, 79 | `no-console` | Operator-facing console diagnostics for cluster-enable failures. |
| `components/Devices/MPX1/MPX1SignalPathCanvas.tsx` | 123 | `react-hooks/exhaustive-deps` | Canvas redraw effect intentionally fires only on layout changes, not on every prop tick. |
| `components/Devices/IntelFX/IntelFXSignalPathCanvas.tsx` | 105 | `react-hooks/exhaustive-deps` | Same canvas-redraw pattern as MPX1. |
| `components/Devices/DeviceProfilePanel/overrideLoader.ts` | 44 | `no-new-func` | The override loader compiles user-authored JS for device-pack overrides; `new Function` is the documented JS-eval mechanism (sandboxed by the calling context). |
| `components/Devices/hooks/useDeviceProfiles.ts` | 156 | `react-hooks/exhaustive-deps` | Intentional once-per-mount fetch. |
| `components/primitives/DangerButton.tsx` | 33 | `no-alert` | Confirmation dialog for destructive actions; intentional `window.confirm()` pending Carbon `<Modal>` migration in T2481-E3. |
| `components/SequencerKeyboardVisualizer/useMidiDeviceEvents.ts` | 169 | `no-console` | MIDI event diagnostics. |
| `pages/MidiAssignmentsPage.tsx` | 568, 1775 | `react-hooks/exhaustive-deps` | Calibration form + walkthrough mount effects. |
| `pages/ApiWebhooksPage/ApiWebhooksPage.tsx` | 113 | `react-hooks/exhaustive-deps` | Webhook fetch on mount. |

**Drift posture:** None of these touch MAP2's four lint rules. The 3 `react-refresh/only-export-components` remnants could be deleted (the rule is globally off per eslint.config.js since the project removed Vite HMR — see "react-refresh-rule-removed" annotation). Filed as `T2481-Z-cleanup-react-refresh-suppressions` follow-up.

---

## Category 3 — `@ts-nocheck` on the auto-generated OpenAPI artifact (1 site)

`web/src/map2/clients/snapshots.generated.ts` has a whole-file `@ts-nocheck` documented in its header:

> The OpenAPI surface contains duplicate operation ids on cluster-proxy routes (one id per method); openapi-typescript emits them as duplicate keys which trip TS2300 under `tsc -b`. This module is consumed only through `snapshots.contract.ts` (type-only re-exports for snapshot endpoints), so type checking happens at the contract surface, not on the raw schema dump.

**Drift posture:** Tracked under T2455 (the upstream openapi-typescript / cluster-proxy duplicate-op-id issue). The `@typescript-eslint/ban-ts-comment` rule is turned off via per-files override at `web/eslint.config.js` for `src/map2/clients/*.generated.ts`.

---

## Summary

- **MAP2 lint suite (4 rules at `'error'`):** 0 active suppressions; suite reports 0 errors / 0 warnings.
- **`// carbon-allow:` annotations (84 sites):** every site documents the §10.5 audio-domain / hardware-skin / density rationale.
- **`react-hooks/exhaustive-deps` per-line (8 sites):** intentional once-per-mount or layout-pinned effects; documented inline.
- **`no-console` (3 sites):** operator-facing diagnostics; Carbon doesn't model a console-replacement primitive.
- **`no-new-func` (1 site):** sandboxed device-pack override loader.
- **`no-alert` (1 site):** pending `T2481-E3` Carbon `<Modal>` migration.
- **`@ts-nocheck` (1 site):** documented OpenAPI generated artifact; tracked under T2455.

T2481-G3 closes with a clean lint-suppression contract: every active suppression is either justified inline or covered by a per-files override with rationale. The 3 `react-refresh/only-export-components` per-line suppressions called out in the original audit were retired in cycle 49 (T2481-Z follow-up).

---

## Update 2026-05-06 — Phase E lint-rule additions

The lint plugin gained four new primitive-banning rules during the T2481-E1 canary work (commit `5445507b`):

- `map2/no-raw-button` — initial snapshot 681 sites, all at `'warn'`
- `map2/no-raw-input` — initial snapshot 113 sites, all at `'warn'`
- `map2/no-raw-select` — initial snapshot 73 sites, all at `'warn'`
- `map2/no-raw-dialog` — initial snapshot 0 sites (modal sweep already complete from prior work) — could ratchet to `'error'` immediately if desired.

After the 2026-05-06 sweep cycles 1-6 (AudioInterfaceControl + OnboardingWizard + WebSocketInspectorTab + TrafficMonitorTab + RequestBuilderTab), the snapshot is **672 / 87 / 61 / 0** — net retired so far: **9 button, 26 input, 12 select, 0 dialog** = **47 total raw primitives migrated to Carbon equivalents** across 5 files. Each migration commit is dual-pushed and verified against typecheck + atomic build + targeted jest suites where they exist.

**Where the remaining bulk lives:**

- **Button (672 sites):** dominant cluster. Most are bespoke-affordance triggers (custom tablists in ThemePage, color-themed action buttons with `style.background` overrides in the MidiAssignmentsPage walkthrough, dense walkthrough micro-buttons, switch-style toggles in plugin cards under §10.5 device viewers). Each migration is its own focused refactor; they don't fold into Carbon `<Button>` without per-site redesign. Tracked as natural follow-ups under owning Epics (T2459-H deeper Carbon refactor for MIDI Assignments, T2475 follow-up for ThemePage tabs → Carbon `<Tabs>`).
- **Input (87 sites):** mostly dense plugin cards (LCD settings, MPX-1 librarian, Sequencer page) and hand-rolled forms scattered across pages.
- **Select (61 sites):** smaller cluster; most are filter/scope dropdowns that fold cleanly into Carbon `<Select>`. The remaining ones are inside §10.5 plugin-card chrome where `<Select>` would conflict with the device's per-parameter visual contract.

The lint rules stay at `'warn'` so the violations remain visible in CI without blocking it. T2481-E-lint will ratchet `no-raw-dialog` to `'error'` immediately (already at 0) and the others as their respective sweep work closes.

**Sweep cycles 1-6 (this session):**

| Commit | Cycle | Surface | Migrations | Net retired |
|---|---|---|---|---|
| `5445507b` | E1 canary | MidiAssignmentsPage calibration form | 1 TextInput, 1 Select, 9 NumberInput, 3 Toggle | -3 button, -10 input, -1 select |
| `8f3240fa` | E4 sweep | TesiraOfflineBanner | hand-rolled banner → ActionableNotification | (notification, not counted in raw-primitive snapshot) |
| `23f14ca6` | Cycle 1 | AudioInterfaceControl | 4 Select, 7 Button | -9 button, -5 select |
| `cb7bc9c5` | Cycle 2 | OnboardingWizard step-3 | 2 TextInput, 1 Select, 2 Checkbox | -4 input, -1 select |
| `3982e4fc` | Cycle 4 | WebSocketInspectorTab | 4 TextInput, 3 Select, 1 Checkbox | -5 input, -3 select |
| `62051739` | Cycle 5 | TrafficMonitorTab | 4 TextInput, 1 Select | -4 input, -1 select |
| `33bac9a0` | Cycle 6 | RequestBuilderTab | 2 Select, 2 TextInput, 1 Checkbox | -3 input, -2 select |

**`// carbon-allow:` annotations added during the sweep (5 new sites):**

- `AudioInterfaceControl.tsx`: 2× input gain / output gain range sliders (Carbon `<Slider>` labelText collision with existing test contract — operator session needed for slider+test bundled migration).
- `OnboardingWizard.tsx`: 2× radio inputs (deployment mode + cert mode, clickable-card pattern incompatible with Carbon `<RadioButton>`'s dot+label-only visual).
- `TrafficMonitorTab.tsx`: 1× file input (Carbon `<FileUploader>` is a fuller surface; intentional dense toolbar).
