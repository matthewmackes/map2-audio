# Parameter Controls Architecture

Updated: 2026-03-26 16:17 EDT  
Status: Planning-only architecture; no implementation in this pass

## Architectural Direction

Refactor around the existing `NumericInput` foundation instead of replacing everything from scratch, but do not preserve its current API unchanged.

The implementation should produce one shared interaction/runtime layer that can be skinned as a knob, slider, or numeric-entry field.

## Current State To Replace

- `NumericInput` already owns much of the keyboard, formatting, and reset behavior.
- `NumberInput` and `ParameterKnob` are thin wrappers over that primitive.
- `ParameterSlider` is not a real slider.
- `MPX1Knob` is a separate interaction model with canvas rendering and no keyboard support.
- Raw range/number controls still bypass the shared stack in `DrumsPage` and Tesira.

## Required Components

- `ParameterControl`
  - Orchestrator that receives a normalized `ParameterDefinition`.
  - Chooses the visual variant or renders the requested variant explicitly.
- `ParameterKnob`
  - Shared knob skin over the common interaction hook.
- `ParameterSlider`
  - Real slider implementation over the common interaction hook.
  - Replaces the current alias-only export.
- `ParameterNumericInput`
  - Direct-entry field over the same interaction hook.
- `ParameterValueDisplay`
  - Shared formatted readout component.

## Required Utilities

- `normalize(value, definition)`
  - Convert from value domain to normalized `0..1`.
- `denormalize(position, definition)`
  - Convert back from normalized space to value domain.
- `linearScale`
- `logScale`
- `skewScale`
- `clampValue`
- `snapValue`
- `formatValue`
- `parseValue`
- `dispatchLiveChange`
- `dispatchCommit`

## Shared Hook

- `useParameterControlState(definition, externalValue)`
  - Holds `liveValueRef`.
  - Tracks whether the user is currently interacting.
  - Exposes pointer, wheel, keyboard, focus, and text-entry handlers.
  - Emits:
    - `setLiveValue(nextValue)`
    - `commitValue(nextValue)`
    - `revertDraft()`
  - Keeps `committedValue` synchronized from props/store when not interacting.

## Data Contract

```ts
type ParameterDefinition = {
  id: string
  label: string
  value: number
  defaultValue: number
  min: number
  max: number
  step: number
  fineStep: number
  largeStep: number
  units: string
  scale: 'linear' | 'log' | 'skew'
  precision: number
  format: (v:number)=>string
  parse: (s:string)=>number
  onLiveChange: (v:number)=>void
  onCommit: (v:number)=>void
}
```

## Recommended Extensions

The required type above is the minimum. The implementation should also support a small extension layer:

- `variant?: 'auto' | 'knob' | 'slider' | 'numeric'`
- `classification?: 'CONTINUOUS_LINEAR' | 'CONTINUOUS_LOG' | 'CONTINUOUS_SKEWED' | 'STEPPED_NUMERIC' | 'CALIBRATION'`
- `disabled?: boolean`
- `ariaDescription?: string`
- `commitStrategy?: 'pointer-up' | 'blur' | 'idle' | 'explicit'`

## Runtime Flow

1. Parent supplies `ParameterDefinition` and current committed value.
2. `ParameterControl` derives a shared interaction model from the definition.
3. Visual variant renders from normalized position plus formatted display.
4. Pointer/keyboard/text entry drives `liveValueRef`.
5. `onLiveChange` goes to the real-time-safe adapter.
6. `onCommit` goes to persistence / undo / broader state updates.

## Adapter Strategy

The shared control layer should not know how each backend talks to the engine. It should only emit live and commit events.

Recommended adapter pattern:

- Plugin cards
  - `onLiveChange` -> existing real-time hook setter
  - `onCommit` -> optional undo / snapshot / persist path
- JUCE Grid
  - preserve the existing `onParameterChange` / `onParameterChangeEnd` split
- MPX1 / IntelFX
  - map to their runtime `setParam` calls
  - add commit hooks only where non-real-time side effects exist
- Tesira draft/apply surfaces
  - use `ParameterNumericInput` with `commitStrategy: 'explicit'` or a paired apply button wrapper

## Migration Strategy

- Phase 1
  - Keep `NumberInput` and `ParameterKnob` as compatibility wrappers.
  - Reimplement them on top of the new shared runtime.
  - Replace `ParameterSlider` with a real slider.
- Phase 2
  - Replace raw `input[type=range|number]` parameter controls.
  - Fold `MPX1Knob` into the shared interaction model with a skin-only wrapper if the MPX-1 canvas look must stay.
- Phase 3
  - Remove old one-off behavior and direct consumers of the legacy wrapper props.

## Architectural Risks

- Runtime-driven registries do not always provide enough metadata yet.
  - `step`, `scale`, `defaultValue`, `precision`, `fineStep`, and commit policy may need normalization before migration.
- The current shared primitive already has users across legacy and new app surfaces.
  - A hard cut-over would be risky.
- Some engineering surfaces are intentionally deferred-apply.
  - They still belong in the shared component system, but not with the same commit timing as live DSP controls.

## Recommended File Layout

- `web/src/app/components/ParameterControl/ParameterControl.tsx`
- `web/src/app/components/ParameterControl/ParameterKnob.tsx`
- `web/src/app/components/ParameterControl/ParameterSlider.tsx`
- `web/src/app/components/ParameterControl/ParameterNumericInput.tsx`
- `web/src/app/components/ParameterControl/ParameterValueDisplay.tsx`
- `web/src/app/components/ParameterControl/useParameterControlState.ts`
- `web/src/app/components/ParameterControl/scale.ts`
- `web/src/app/components/ParameterControl/format.ts`
- `web/src/app/components/ParameterControl/snap.ts`
- `web/src/app/components/ParameterControl/dispatch.ts`

## Testing Expectations

- Unit-test scaling and snapping utilities.
- Unit-test keyboard and reset behavior.
- Unit-test live vs commit sequencing.
- Add focused regression tests for each pilot migration surface.
- Verify that log controls actually use log motion instead of only log formatting.
