# T2481-E1 Canary — MidiAssignmentsPage Calibration Form Carbon Migration

**Status:** Scoped 2026-05-04 (cycle 52 of autonomous-loop session) — execution deferred to a focused operator session because the form's dense layout + visual contract requires bench-side visual verification per the rubric's "canary first, soak for one session, then sweep" rule.

**Filed by:** the T2481-G4 closing audit (cycle 51) — the only sub-4 axis-page in the entire 25-page rubric walk.

## Why this is the canary

T2481-E1's spec explicitly names this surface:

> E1 Forms: canary = MIDI Mapping wizard form. Sweep = every `<input>` / `<select>` / `<textarea>` / `<form>` site → Carbon `<TextInput>` / `<NumberInput>` / `<Dropdown>` / `<MultiSelect>` / `<TextArea>` / `<Form>`. Validation rules use Carbon's `invalidText` / `warnText` patterns. React Hook Form integration verified.

The calibration form is the canonical example of the pattern (raw `<input>` / `<select>` with separate `<div className="lbl">` labels, dense per-field layout, switch-style toggles, conditional render-arms based on mapping kind). Every other form in the codebase will follow the same migration shape; getting the canary right defines the sweep pattern.

## Surface

`web/src/app/pages/MidiAssignmentsPage.tsx` lines 1312-1408 — the `<div className="cal">` calibration block.

**Inventory:**

| Site | Current | Carbon target |
|---|---|---|
| Line 1316 | `<input type="text">` (mapping name) | `<TextInput labelText="Mapping name" id="mapping-name">` |
| Line 1320 | `<select>` (scope: global / per-chain) | `<Select labelText="Scope" id="scope">` + 2× `<SelectItem>` |
| Lines 1331, 1333 | `<input type="number">` (input range min, max) | 2× `<NumberInput labelText="...">` in a flex pair |
| Lines 1339, 1341 | `<input type="number">` (output range min, max) | 2× `<NumberInput>` |
| Lines 1347, 1349 | `<input type="number">` (deadzone L, H) | 2× `<NumberInput>` |
| Lines 1354-1361 | `<button role="switch">` (invert) | `<Toggle labelText="Invert">` |
| Lines 1365-1372 | `<button role="switch">` (LED feedback) | `<Toggle labelText="LED feedback">` |
| Line 1380 | `<input type="number" min="0" max="127">` (velocity threshold) | `<NumberInput min={0} max={127}>` |
| Line 1388 | `<input type="number" min="0">` (from flow) | `<NumberInput min={0}>` |
| Line 1392 | `<input type="number" min="0">` (to flow) | `<NumberInput min={0}>` |
| Lines 1399-1406 | `<button role="switch">` (enabled) | `<Toggle labelText="Enabled">` |

**Total:** 1 `<TextInput>`, 1 `<Select>`, 8 `<NumberInput>`, 3 `<Toggle>` — 13 primitive swaps.

## Risk + soak plan

The calibration form is the most-visible mapping-management surface (rendered for every selected MIDI assignment). Visual regression risk:

1. **Carbon `<NumberInput>` brings spinner buttons** — the existing `<input type="number">` is bare. The dense `range-pair` layout (`min → max` two-input row) may need explicit `<NumberInput hideSteppers>` or a custom CSS override to keep the side-by-side rhythm.
2. **Carbon `<TextInput>` / `<Select>` embed the label** — the current code uses `<div className="lbl">Mapping name</div><input>`. The `.lbl` `<div>` becomes redundant and must be removed (one per field), but the `.field` wrapper's flex / spacing rules may need updates.
3. **Carbon `<Toggle>` is wider than the current 36px switch** — needs visual approval; may need `size="sm"` to match the existing density.
4. **Conditional render-arms** (`isContinuous`, `isTrigger`, `isRouting`) drive different field subsets. Each arm needs its own visual sign-off.

**Per the spec:** "every primitive phase migrates a canary surface first and soaks for one session before the sweep. Bespoke validation, async hydration, and live-sync semantics (especially MPX1 + Mixxx round-trip + Brain library) explicitly tested per canary."

## Why this can't be done in an autonomous-loop cycle

- Visual regression check requires operator at the browser. The Carbon `<NumberInput>` spinner / `<Toggle>` width / `.field` wrapper changes are all visual contracts.
- The lint rules `no-raw-button` / `no-raw-input` / `no-raw-select` / `no-raw-dialog` (called for in T2481-E-lint) aren't yet in the MAP2 plugin; they should be authored alongside the canary so the sweep can ratchet them to `'error'` after the canary soaks.
- The "soak for one session before the sweep" phrase is from the spec — non-negotiable.

## Execution runbook (for the focused session)

1. Add the four lint rules to `web/eslint-rules/index.js`: `no-raw-button`, `no-raw-input`, `no-raw-select`, `no-raw-dialog`. Land them at `'warn'` so the existing violation count surfaces without breaking CI.
2. Migrate the calibration form per the inventory table above. Update the surrounding `.cal` / `.field` CSS to match Carbon's intrinsic spacing / label rhythm.
3. Run `npm --prefix web run typecheck` + `npm --prefix web run lint` + `npm --prefix web run build`.
4. Operator visual check at `localhost:3000/midi/assignments` — exercise each conditional arm (continuous / trigger / routing).
5. Soak for one session — leave the canary live, watch for regressions in Maschine / MPX-1 / Brain library forms (which use related primitives).
6. After soak, sweep every other raw `<input>` / `<select>` / `<textarea>` / `<form>` in `web/src/app/` (5+ pages, ~30+ sites total — see `grep -rn "<input " web/src/app/` for the inventory).
7. Ratchet the four `no-raw-*` lint rules to `'error'` after the sweep clears.
8. Update `docs/design/CARBON_FIT_AND_FINISH_RUBRIC.md` Audit-progress section to mark page #7 (MIDI Assignments) Primitives axis 3 → 5.

## Acceptance

- All 13 primitives in the calibration form route through Carbon.
- The `.cal` form maintains visual parity with the pre-migration look (sign-off via operator).
- No regressions in `MidiAssignmentsPage.test.tsx` or related integration tests.
- Lint `no-raw-*` rules at `'warn'` (or `'error'` after the post-sweep ratchet).
- Rubric Audit-progress section updated.

---

This document is the contract for the next operator session that picks up T2481-E1.
