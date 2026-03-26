# Parameter Control Standard

Updated: 2026-03-26 16:17 EDT  
Status: Authoritative behavior spec for numeric parameter controls

## Goal

One control model must drive every numeric audio-facing parameter, regardless of whether the surface looks like a knob, slider, inline number field, or compact value display.

## Principles

- Separate UI interaction state from the audio engine state.
- Live updates must be low-latency and must not depend on heavy React rerenders.
- Commit events must be explicit and must be reserved for undo history, persistence, and non-real-time side effects.
- Visual form must not change the semantic contract.

## Interaction Model

- Pointer drag
  - `ParameterKnob`: vertical drag.
  - `ParameterSlider`: horizontal drag.
  - Both support mouse, touch, and pen.
  - Drag start captures the current committed value into a local interaction ref.
  - Drag move updates `liveValue`.
  - Pointer up commits the final value.
- Keyboard
  - `ArrowUp` / `ArrowRight`: one small step up.
  - `ArrowDown` / `ArrowLeft`: one small step down.
  - `PageUp`: one large step up.
  - `PageDown`: one large step down.
  - `Home`: minimum.
  - `End`: maximum.
  - `Enter`: commit current text-entry draft.
  - `Escape`: revert the current draft to the last committed value.
- Modifier keys
  - `Shift`: fine adjustment.
  - Fine adjustment affects drag, wheel, and arrow/page step sizes.
- Double-click
  - Reset to `defaultValue`.
  - No prompt-based editing for double-click.
- Numeric entry
  - Every control must expose direct numeric entry.
  - Text entry must show the raw editable number while focused and the formatted display value while unfocused.
  - Invalid drafts must not commit; on blur they revert to the last committed value.
- Wheel
  - Supported only when the control is focused or intentionally armed.
  - Wheel updates `liveValue`.
  - Wheel commits after a short inactivity timeout because there is no pointer-up event.

## Value Lifecycle

- `committedValue`
  - The last accepted value from the store/engine.
  - Drives persistence, undo, snapshots, and non-real-time side effects.
- `liveValue`
  - The ephemeral interaction value during drag, wheel, or keyboard stepping.
  - May differ from `committedValue` until the interaction commits.
- Update flow
  - Start interaction from `committedValue`.
  - Emit `onLiveChange(nextValue)` during motion.
  - Emit `onCommit(nextValue)` only on:
    - pointer up
    - `Enter`
    - blur
    - wheel idle timeout
  - If the value returns to the original committed value, `onCommit` may be skipped.

## Scaling

- `linear`
  - Default for gain, percent, blend, pan, and bounded engineering values.
- `log`
  - Required for frequency, time, and other perceptual exponential ranges.
  - The display domain remains the real value domain.
  - Normalization and denormalization handle the nonlinear mapping.
- `skew`
  - Required when a control needs more precision in one part of the range but is not truly logarithmic.
- `stepped`
  - Snap after scale conversion.
  - Stepped numeric controls still support drag and keyboard, but every emitted value is snapped.

## Formatting

- Units
  - Display units must be part of the parameter definition, not hardcoded per surface where avoidable.
- Precision
  - The display precision must come from explicit metadata or a deterministic derivation from `step`.
- Display rules
  - `Hz` values may render as `kHz` when large.
  - Time values may render as `ms` or `s` depending on magnitude.
  - Signed dB values should include `+` for positive values.
  - Focused text entry always shows the raw editable numeric value, not the abbreviated display string.

## Accessibility

- Every control must have a visible label or an explicit `aria-label`.
- Every interactive visual control must expose correct slider semantics:
  - `aria-valuemin`
  - `aria-valuemax`
  - `aria-valuenow`
  - `aria-valuetext`
- Focus states must be visible and consistent across knob, slider, and numeric-entry presentations.
- Keyboard navigation order must follow DOM order and must not require pointer interaction.
- If a value display is separate from the editable field, the field remains the accessibility source of truth.

## Performance Contract

- `onLiveChange` must be safe to call frequently.
- `onLiveChange` must not trigger heavyweight React tree work on every pointer move.
- Preferred live path
  - write through refs, imperative adapters, or narrowly scoped external stores.
  - batch visual mirrors with `requestAnimationFrame` if needed.
- `onCommit` may update:
  - undo history
  - persistence
  - network mutations that are not real-time safe
  - broader React query/store state

## Control Variants

- `ParameterKnob`
  - Best for dense plugin cards and compact multi-parameter layouts.
- `ParameterSlider`
  - Best for transport, mixer, trim, and wide-range linear controls.
- `ParameterNumericInput`
  - Best for calibration, engineering, and exact-value entry.
- `ParameterValueDisplay`
  - Read-only formatted value, synchronized with the active control.

## Explicit Anti-Patterns

- Do not use plain `input[type=number]` as the final shared control.
- Do not use plain `input[type=range]` as the only interaction path.
- Do not fire persistence or undo work on every pointer move.
- Do not let visual form change keyboard semantics.
- Do not keep per-surface modifier key rules.
- Do not treat `onChangeEnd` as optional if the surface needs commit semantics.

## Migration Rule

During migration, wrapper-based compatibility is acceptable, but the shared standard above is the source of truth. A surface is not considered migrated until its live path, commit path, scaling, reset behavior, and keyboard behavior all match this document.
