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
