# Parameter Controls Validation

Updated: 2026-03-27 16:44 EDT  
Status: Completed for `T459`

## Scope

Validation target: the migrated parameter-control pilot surfaces and the shared metadata/runtime path introduced under `T456` through `T459`.

Included in this pass:
- `DrumsPage` transport swing
- `EQCard` frequency controls
- `PassionFXCard` phaser stages
- `MIDICommanderSetup` deadzone fields
- runtime-derived descriptor resolution in `LV2PluginParameterEditor` and `JuceGridParameterEditor`
- shared formatting, clamping, and commit-suppression helpers under `web/src/app/components/ParameterControl`

Out of scope for this validation slice:
- `T454-subN` Audio Table mutation-harness coverage
- live-host/manual feel checks beyond the current frontend regression suite

## Consistency Criteria

- Descriptor-driven controls must resolve scale, precision, large-step, and commit-strategy metadata from one shared runtime path instead of per-surface ad hoc logic.
- Performance-sensitive musical controls may keep their existing live update path only when the migration preserves the pre-existing mutation contract.
- Calibration/setup controls must defer commits until blur or another explicit commit boundary so repeated draft changes do not spam backend mutations.
- Formatting and parsing must clamp to descriptor bounds, preserve sign/unit conventions, and avoid duplicate commit callbacks when a draft snaps back to the committed value.

## Validation Matrix

| Surface | Variant | Core contract | Evidence |
| --- | --- | --- | --- |
| `DrumsPage` swing | Slider | Live mutation path preserved, `0..100` percent contract preserved | `web/src/app/pages/DrumsPage.test.tsx` |
| `EQCard` frequency | Knob / log | Shared descriptor uses log metadata, selected-band and expanded-band editors both route through the shared control | `web/src/app/components/EQ/EQCard.test.tsx` |
| `PassionFXCard` stages | Knob / stepped | Shared descriptor snaps to even values with explicit large-step metadata | `web/src/app/components/PluginCards/Custom/JUCE/PassionFXCard.test.tsx`, `web/src/app/components/ParameterControl/ParameterControl.test.tsx` |
| `MIDICommanderSetup` deadzones | Numeric / blur-commit | Live edits stay local until blur, high/low pair remains clamped | `web/src/app/components/MIDICommanderSetup.test.tsx` |
| Runtime-derived editors | Numeric | Canonical descriptors can override runtime fallback metadata by `pluginId` / `paramKey` | `web/src/app/data/parameterSchema.test.ts`, `web/src/app/components/LV2PluginParameterEditor.test.tsx`, `web/src/app/pages/JuceGridParameterAudit.test.tsx` |
| Shared formatting helpers | Runtime utility | Frequency/dB formatting and editable parsing clamp consistently across migrated controls | `web/src/app/components/ParameterControl/format.test.ts` |
| Shared commit dedupe | Runtime utility | Blur-commit controls do not emit duplicate commit callbacks when the draft returns to the committed value | `web/src/app/components/ParameterControl/ParameterControl.test.tsx` |

## Current Evidence

- Canonical pilot descriptors are seeded in `web/src/app/data/parameterSchema.ts`.
- Shared wrappers can now resolve descriptor identity via `pluginId` and `paramKey`.
- `LV2PluginParameterEditor` and `JuceGridParameterEditor` now pass runtime plugin identity into the shared metadata path.
- Shared control tests cover blur-commit separation, log presentation selection, stepped large-step keyboard behavior, duplicate commit suppression, and shared formatting/clamping behavior.

## Performance And Audio-Safety Evidence

- No backend DSP or JUCE audio-thread code changed in this slice; the work is limited to frontend runtime metadata, shared control state, and surface wiring.
- `DrumsPage` swing remains on the original live mutation path, so the migration preserved the existing musical-control behavior instead of adding new deferred commits.
- `MIDICommanderSetup` deadzones now use blur commit semantics, which reduces backend calibration mutation traffic during draft edits and is therefore safer than the previous eager path for setup-style controls.
- The shared runtime suppresses no-op commit callbacks when a draft resolves back to the committed value, preventing redundant mutation fanout on blur.

## Command Log

Latest passing validation commands in this cycle:

```bash
npm --prefix web test -- --runInBand \
  web/src/app/components/ParameterControl/format.test.ts \
  web/src/app/components/ParameterControl/ParameterControl.test.tsx \
  web/src/app/components/NumericInput/NumericInput.test.tsx \
  web/src/app/components/MIDICommanderSetup.test.tsx \
  web/src/app/data/parameterSchema.test.ts \
  web/src/app/pages/DrumsPage.test.tsx \
  web/src/app/components/EQ/EQCard.test.tsx \
  web/src/app/components/PluginCards/Custom/JUCE/PassionFXCard.test.tsx \
  web/src/app/components/LV2PluginParameterEditor.test.tsx \
  web/src/app/pages/JuceGridParameterAudit.test.tsx

npm --prefix web run typecheck
npm --prefix web run build
```

## Residual Follow-Up

- `T454-subN` remains open for a separate Audio Table mutation-harness path; it is not a blocker for the completed parameter-control validation slice.
