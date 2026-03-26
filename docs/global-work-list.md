# Global Work List

## Status Legend

- `[ ]` Todo
- `[>]` In Progress
- `[✓]` Done
- `[✗]` Blocked
- `[~]` Cancelled

Last updated: 2026-03-26 16:17 EDT - Codex

## Top Tasks

ID: T001  
Status: [✓] Done  
Title: Audit all audio-facing numeric controls and classify their current behavior  
Description:  
- Goal / acceptance criteria: Scan the React codebase for numeric parameter inputs, capture the active control families, document every audio-facing numeric surface, and classify each surface into continuous linear, continuous log, stepped numeric, or calibration / engineering.  
- Why it matters: The refactor cannot be planned safely until the current surface area, behavior drift, and missing metadata are concrete.  
- Dependencies: None  
- Estimated effort: Medium  
- Required outputs: `docs/audits/numeric-controls-audit.md` with scope, inventory, and classification notes.  
Subtasks: None  
Assigned to: Codex  
Last updated: 2026-03-26 16:17 EDT - Codex  
- Completion notes:
  - What was done: Audited `web/src` for `ParameterKnob`, `NumberInput`, `NumericInput`, raw `input[type=range|number]`, and the custom `MPX1Knob` path; identified the major control families and the highest-risk surfaces.
  - Key findings: The current frontend contains 288 in-scope AST-matched audio-facing numeric widgets plus 3 `MPX1Knob` custom knob entry points; only 7 call sites currently expose any `onChangeEnd` hook, `ParameterSlider` is unused and is only an alias to `NumberInput`, and `ParameterKnob` currently ignores `isLogarithmic`.
  - Files/links produced: `docs/audits/numeric-controls-audit.md`
  - Suggested next tasks: T005, T006, T007

ID: T002  
Status: [✓] Done  
Title: Define one authoritative parameter-control behavior standard  
Description:  
- Goal / acceptance criteria: Write one spec that defines the interaction model, value lifecycle, scaling, formatting, accessibility, and performance expectations for all numeric controls.  
- Why it matters: The current control families mix live updates, deferred apply, raw sliders, and partial keyboard support; the refactor needs one stable behavioral target before implementation.  
- Dependencies: T001  
- Estimated effort: Medium  
- Required outputs: `docs/specs/parameter-control-standard.md`  
Subtasks: None  
Assigned to: Codex  
Last updated: 2026-03-26 16:17 EDT - Codex  
- Completion notes:
  - What was done: Defined the required live-value vs committed-value lifecycle, pointer and keyboard interactions, reset behavior, scaling rules, formatting rules, and accessibility contract.
  - Key findings: The current `NumericInput` primitive already covers text entry, arrow keys, Home/End, Enter/Escape, wheel, double-click reset, and touch/pen drag, but it conflates live and commit semantics and does not provide the required mouse-drag path or true logarithmic motion.
  - Files/links produced: `docs/specs/parameter-control-standard.md`
  - Suggested next tasks: T005, T006, T007

ID: T003  
Status: [✓] Done  
Title: Design the reusable parameter-control component system and data contract  
Description:  
- Goal / acceptance criteria: Define the shared component architecture, utility modules, and parameter schema that will replace the current mix of wrappers, raw inputs, and bespoke knobs.  
- Why it matters: Without a reusable architecture, the project will keep creating one-off widgets and inconsistent interaction models.  
- Dependencies: T001; T002  
- Estimated effort: Medium  
- Required outputs: `docs/architecture/parameter-controls.md`  
Subtasks: None  
Assigned to: Codex  
Last updated: 2026-03-26 16:17 EDT - Codex  
- Completion notes:
  - What was done: Proposed `ParameterControl`, `ParameterKnob`, `ParameterSlider`, `ParameterNumericInput`, `ParameterValueDisplay`, supporting utilities, and a normalized `ParameterDefinition` contract.
  - Key findings: The best path is to refactor around the existing `NumericInput` foundation instead of starting from zero, but only after adding explicit live/commit dispatch, real scaling utilities, and a real slider implementation.
  - Files/links produced: `docs/architecture/parameter-controls.md`
  - Suggested next tasks: T005, T006, T007

ID: T004  
Status: [✓] Done  
Title: Select the first migration slice instead of refactoring the whole platform at once  
Description:  
- Goal / acceptance criteria: Choose one linear, one logarithmic, one stepped, and one calibration / engineering control to migrate first, with explicit risks and required changes.  
- Why it matters: The current surface area is too broad for a single unsafe refactor; a pilot wave is required to validate the standard and architecture.  
- Dependencies: T001; T002; T003  
- Estimated effort: Low  
- Required outputs: `docs/migration/parameter-controls-phase1.md`  
Subtasks: None  
Assigned to: Codex  
Last updated: 2026-03-26 16:17 EDT - Codex  
- Completion notes:
  - What was done: Chose `DrumsPage` swing, `EQCard` frequency, `PassionFXCard` phaser stages, and `MIDICommanderSetup` expression deadzone as the first four migration targets.
  - Key findings: These four controls cover the highest-value interaction modes without forcing a full-platform rollout before the shared runtime exists.
  - Files/links produced: `docs/migration/parameter-controls-phase1.md`
  - Suggested next tasks: T005, T006, T007

ID: T005  
Status: [ ] Todo  
Title: Normalize missing parameter metadata before implementation  
Description:  
- Goal / acceptance criteria: Add or backfill missing defaults, explicit scale declarations, display precision, fine-step and large-step values, and commit-policy hints for runtime-driven parameter surfaces such as JUCE Grid, MPX1, IntelFX, LV2, and dynamic Tesira editors.  
- Why it matters: The shared control layer cannot behave consistently when source registries only provide min/max and leave scale, precision, default, and commit semantics implicit.  
- Dependencies: T001; T002; T003  
- Estimated effort: Medium  
- Required outputs: Updated runtime parameter metadata contracts and follow-up implementation notes.  
Subtasks: None  
Assigned to: Codex  
Last updated: 2026-03-26 16:17 EDT - Codex

ID: T006  
Status: [ ] Todo  
Title: Implement the shared live/commit parameter-control runtime after approval  
Description:  
- Goal / acceptance criteria: Build the shared interaction hook, scale utilities, formatter/parser utilities, dispatch layer, and the new `ParameterControl` family without regressing keyboard or accessibility behavior.  
- Why it matters: The current primitives conflate live and commit updates and still allow raw inputs to bypass the shared contract.  
- Dependencies: T002; T003; T005  
- Estimated effort: High  
- Required outputs: Shared component/runtime implementation, focused tests, and backwards-compatible wrappers for staged migration.  
Subtasks: None  
Assigned to: Codex  
Last updated: 2026-03-26 16:17 EDT - Codex

ID: T007  
Status: [ ] Todo  
Title: Migrate the first four pilot controls to the shared system after approval  
Description:  
- Goal / acceptance criteria: Replace the four selected pilot surfaces with the new control system, preserving correct engine behavior while adding explicit live/commit semantics.  
- Why it matters: The pilot slice is the proof point for the architecture, interaction standard, and performance plan.  
- Dependencies: T004; T006  
- Estimated effort: Medium  
- Required outputs: Pilot control migrations, focused tests, and migration notes for the next wave.  
Subtasks: None  
Assigned to: Codex  
Last updated: 2026-03-26 16:17 EDT - Codex

ID: T008  
Status: [ ] Todo  
Title: Validate consistency, performance, and audio safety after implementation  
Description:  
- Goal / acceptance criteria: Verify correct values, clamping, formatting, interaction smoothness, keyboard access, render stability, and audio-safe live updates across every migrated control; produce the required validation document.  
- Why it matters: The refactor is only complete once the shared controls feel identical across modules and do not introduce UI lag or engine artifacts.  
- Dependencies: T006; T007  
- Estimated effort: Medium  
- Required outputs: `docs/validation/parameter-controls-validation.md` and regression evidence.  
Subtasks: None  
Assigned to: Codex  
Last updated: 2026-03-26 16:17 EDT - Codex

## Backlog

ID: T900  
Status: [ ] Todo  
Title: Remove legacy wrappers and raw numeric inputs once migration coverage is broad enough  
Description:  
- Goal / acceptance criteria: Retire raw `input[type=range|number]` parameter controls, the `ParameterSlider` alias, and any remaining one-off knob widgets after the shared system covers all required surfaces.  
- Why it matters: Leaving old and new stacks active indefinitely will preserve the current inconsistency problem.  
- Dependencies: T006; T007; T008  
- Estimated effort: Medium  
- Required outputs: Cleanup plan, removals, and any compatibility notes for downstream contributors.  
Subtasks: None  
Assigned to: Unassigned  
Last updated: 2026-03-26 16:17 EDT - Codex
