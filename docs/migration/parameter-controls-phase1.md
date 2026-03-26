# Parameter Controls Phase 1 Migration Plan

Updated: 2026-03-26 16:17 EDT  
Status: Planning-only; implementation blocked pending approval

## Selection Criteria

- Choose one surface from each required class:
  - linear
  - logarithmic
  - stepped
  - calibration / engineering
- Prefer controls that already exist in production-facing UI.
- Prefer controls that expose the current gaps clearly.
- Avoid starting with the most coupled multi-effect mega-card first.

## Phase 1 Targets

- Linear pilot
  - Old surface: `web/src/app/pages/DrumsPage.tsx`
  - Component / control: transport `Swing`
  - Old control type: raw `input[type=range]`
  - New control type: `ParameterControl` with `variant='slider'` and `scale='linear'`
  - Why this target: high-frequency, operator-visible, and currently bypasses the shared control system entirely
  - Required changes:
    - replace raw slider with shared slider
    - route live updates to `updateTransport.mutate({ swing })`
    - add commit callback for persistence/undo hooks if available
    - preserve current `0..100` percent formatting
  - Main risks:
    - transport mutations may currently assume every change is final
    - large page rerenders during drag may need isolation

- Logarithmic pilot
  - Old surface: `web/src/app/components/EQ/EQCard.tsx`
  - Component / control: `Frequency`
  - Old control type: `ParameterKnob`
  - New control type: `ParameterControl` with `variant='knob'` and `scale='log'`
  - Why this target: it is a canonical perceptual-frequency control and currently advertises log intent without actually getting log interaction
  - Required changes:
    - move the frequency binding onto the new scale utilities
    - preserve current `Hz` / `kHz` formatting
    - keep the selected-band and per-band editors behaviorally identical
  - Main risks:
    - any change in feel will be obvious to users
    - selected-band and per-band controls must stay in sync

- Stepped pilot
  - Old surface: `web/src/app/components/PluginCards/Custom/JUCE/PassionFXCard.tsx`
  - Component / control: `Stages`
  - Old control type: `ParameterKnob`
  - New control type: `ParameterControl` with `variant='knob'` and stepped snap points
  - Why this target: it is a true stepped effect parameter inside a dense custom card where snapping must be exact
  - Required changes:
    - declare step `2` and large-step behavior explicitly
    - ensure drag, keyboard, and text entry all snap to even values
    - keep the card’s current value display stable
  - Main risks:
    - dense card layout may hide any visual regression
    - current hook may assume arbitrary numeric values before snapping

- Calibration / engineering pilot
  - Old surface: `web/src/app/components/MIDICommanderSetup.tsx`
  - Component / control: expression `deadzone_low` and `deadzone_high`
  - Old control type: `NumberInput`
  - New control type: `ParameterControl` with `variant='numeric'`
  - Why this target: this is a true calibration path and should validate commit-oriented behavior without involving live DSP motion
  - Required changes:
    - give both fields explicit defaults, fine step, and commit handling
    - enforce pair validation so low cannot exceed high
    - keep the `0..127` integer contract
  - Main risks:
    - paired validation needs cross-field awareness
    - this surface should not inherit the same commit timing as a live audio knob

## Deliberately Deferred From Phase 1

- `PassionFXCard` as a whole
  - too many controls for the first rollout
- `DrumsPage` full parameter surface
  - too many raw sliders and too many independent mutation paths
- MPX1 and IntelFX runtime editors
  - metadata normalization should happen first
- Tesira draft/apply surfaces
  - they need the shared system, but they also need explicit apply semantics

## Suggested Implementation Order After Approval

1. Build the shared interaction/runtime layer.
2. Migrate `EQCard` frequency first to prove real log scaling.
3. Migrate `DrumsPage` swing to prove the new shared slider.
4. Migrate `PassionFXCard` stages to prove stepped snapping.
5. Migrate `MIDICommanderSetup` deadzone to prove calibration/commit behavior.

## Phase 1 Exit Criteria

- All four pilot controls use the shared runtime.
- Linear, log, stepped, and calibration semantics are all validated.
- Live changes and commit changes are visibly distinct in code and behavior.
- No pilot control regresses keyboard, reset, or formatting behavior.
- The migration produces clear follow-up rules for the remaining surfaces.
