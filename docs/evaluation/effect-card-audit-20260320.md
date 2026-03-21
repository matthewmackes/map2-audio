# Effect Card Audit

Date: 2026-03-20

Scope:
- Active JUCE Grid editor path in `web/src/app/pages/JuceGridPage.tsx`
- Custom card subsystem under `web/src/app/components/PluginCards/**`
- Live backend plugin inventory from `GET /api/plugins/discover` and `GET /api/plugins/parameter-schema`
- Static deployment inventories in `app/deployment/juce_processors.json` and `app/deployment/default_lv2_effects.json`

Evidence artifacts:
- `docs/evaluation/effect-card-audit-20260320.json`
- `npm --prefix web test -- --runInBand web/src/app/pages/JuceGridParameterAudit.test.tsx` -> pass

## Executive Summary

- Active live parameter editor coverage is broad but generic: the current JUCE Grid route renders `JuceGridParameterEditor`, which iterates `meta.parameters` directly and therefore exposes the discovered plugin metadata rather than the custom card surfaces.
- The custom effect-card subsystem is not wired into the active web app. Within `web/src/app`, `PluginCardRouter` appears only in its own source file, so 39 custom cards, their MIDI mapping dialogs, and their preset browsers are effectively dead code in the current operator flow.
- Live backend discovery on this host reports 39 non-Tesira plugins and 596 native/LV2 parameters. The parameter-schema route serializes 588 descriptors, leaving 8 missing descriptors for the parametric EQ band-type parameters.
- The existing audit test is manifest-backed, not runtime-backed. It validates 35 deployment entries from `app/deployment/*.json`, but the live host currently diverges by 10 missing deployment URIs and 15 extra discovered URIs.
- Five JUCE custom cards embed stale plugin URIs in `withMidiDialog` wrappers, which would break MIDI mapping targets even if the card router were reactivated.

## Parameter Coverage

| Scope | Source of truth | Coverage result | Notes |
| --- | --- | --- | --- |
| Active operator UI | Live `meta.parameters` consumed by `JuceGridParameterEditor` | 596/596 discovered native/LV2 parameters reachable through the generic editor on this host | `JuceGridParameterEditor` groups and renders every `meta.parameters` entry; this is the only live editor path. |
| Parameter schema hydration | `GET /api/plugins/parameter-schema` | 588/596 descriptors generated (98.7%) | 8 missing descriptors are all `map2://juce/eq/parametric` band-type parameters because the schema builder only serializes finite numeric defaults. |
| Custom-card parameter surfaces | `PluginCards/Custom/**` + card hooks/routes | Not live | Cards are currently unreachable from the active app, so card-specific parameter completeness is latent rather than operator-usable. |
| Deployment-backed test coverage | `JuceGridParameterAudit.test.tsx` with deployment manifests | Passes for 35 manifest entries | This confirms renderability of the standardized editor and registry lookups, but not live runtime inventory parity. |

Missing descriptor set:

| Parameter | API Exists | UI Exists | Bound Correctly | Documented | Notes |
| --- | --- | --- | --- | --- | --- |
| `band0_type` through `band7_type` on `map2://juce/eq/parametric` | Yes | Partially | No | No | Live discovery exposes 8 band-type params, but `/api/plugins/parameter-schema` drops them because `_build_parameter_schema_payload()` only accepts finite numeric defaults. |

## Feature Accessibility Matrix

| Feature | Accessible via UI | Interaction method | Issues | Severity |
| --- | --- | --- | --- | --- |
| Active plugin parameter editing | Yes | `JuceGridPage` bottom editor -> `JuceGridParameterEditor` | Generic metadata-driven editing works on the active route. | Informational |
| Custom card layouts, visualizations, and advanced sections | No | None in active app | `PluginCardRouter` is not mounted anywhere in `web/src/app`; the active route bypasses the entire card subsystem. | Critical |
| Card-specific preset browsers | No | None in active app | At least 14 custom cards define preset UI, but those surfaces are unreachable because the card router is inactive. | Major |
| Card-specific MIDI mapping dialogs | No | None in active app | `withMidiDialog` wraps many JUCE cards, but no active route renders those cards. | Major |
| Runtime/plugin inventory parity in the audit flow | No | Existing Jest audit uses deployment JSON only | Current live host inventory diverges from deployment manifests, so the shipped audit test does not prove live parity. | Major |
| Instance-safe editing in custom JUCE cards | No | N/A in live app | At least 16 JUCE custom cards read/write singleton `/api/engine/...` routes instead of selected-plugin instance props, so duplicate effect instances would not be safely addressable if cards were reactivated as-is. | Major |

## Preset Validation

| Preset surface | Loads via GUI | Matches expected | Stable | Round-trip accurate | Notes |
| --- | --- | --- | --- | --- | --- |
| EVH Pitch Shifter (`VAN_HALEN_PRESETS`) | No | Not verifiable via GUI | No | No | Card is unreachable; backend preset route exists, but the live GUI path does not expose it. |
| Boss XS-1 preset browser | No | Not verifiable via GUI | No | No | Card is unreachable; backend preset route exists. |
| Peavey 5150 preset selector | No | Not verifiable via GUI | No | No | Card is unreachable; backend preset route exists. |
| Tweed Bassman preset selector | No | Not verifiable via GUI | No | No | Card is unreachable; backend preset route exists. |
| ShoeGaze / PassionFX preset selectors | No | Not verifiable via GUI | No | No | Cards are unreachable; backend preset routes exist. |
| REEV-R / Outotune / GlitchShifter / Interval / Chorus / Phaser quick presets | No | Not verifiable via GUI | No | No | Preset UI is defined in source but inaccessible because the custom card subsystem is not mounted. |

Preset failure rate in the active operator UI:
- 100% inaccessible for card-specific preset surfaces inspected in source.
- API-only preset endpoints exist for several processors, but the active editor does not expose those flows.

## Detailed Findings

### F001 - Custom effect-card subsystem is not wired into the active web app

Severity: Critical

Source:
- `web/src/app/pages/JuceGridPage.tsx`
- `web/src/app/pages/JuceGridParameterEditor.tsx`
- `web/src/app/components/PluginCards/PluginCardRouter.tsx`

Reproduction:
1. Search `web/src/app` for `PluginCardRouter`.
2. Open `JuceGridPage.tsx` and inspect the selected-plugin editor path.
3. Confirm that the page renders `JuceGridParameterEditor` directly.

Expected:
- The effect-card router should be mounted by an operator-facing route so the custom card system is reachable.

Actual:
- `JuceGridPage.tsx` imports and renders `JuceGridParameterEditor` directly, while `PluginCardRouter` is only referenced in its own file.

### F002 - Multiple JUCE cards use stale plugin URIs in MIDI mapping wrappers

Severity: Major

Source:
- `web/src/app/components/PluginCards/Custom/JUCE/NativeDelayCard.tsx`
- `web/src/app/components/PluginCards/Custom/JUCE/CabinetIRCard.tsx`
- `web/src/app/components/PluginCards/Custom/JUCE/ReverbIRCard.tsx`
- `web/src/app/components/PluginCards/Custom/JUCE/NAMCard.tsx`
- `web/src/app/components/PluginCards/Custom/JUCE/EVHPitchShifterCard.tsx`
- `web/src/app/components/PluginCards/registry.ts`

Reproduction:
1. Open each listed card and inspect the `*_URI` constant passed to `withMidiDialog(...)`.
2. Compare that URI to the exact registry URI in `registry.ts` and the live discovery URI.

Expected:
- `withMidiDialog` should use the same plugin URI the registry and discovery APIs expose.

Actual:
- The following stale URIs are embedded in card wrappers:
  - `map2://juce/delay/stereo` vs registered `map2://juce/delay`
  - `map2://juce/ir/cabinet` vs registered `map2://juce/convolution/cabinet`
  - `map2://juce/ir/reverb` vs registered `map2://juce/convolution/reverb`
  - `map2://juce/amp/nam` vs registered `map2://juce/nam`
  - `map2://juce/pitch/evh` vs registered `map2://juce/pitch/shifter`

### F003 - The shipped audit test does not validate the live runtime inventory

Severity: Major

Source:
- `web/src/app/pages/JuceGridParameterAudit.test.tsx`
- Live `GET /api/plugins/discover`

Reproduction:
1. Open `JuceGridParameterAudit.test.tsx`.
2. Note that it loads `app/deployment/juce_processors.json` and `app/deployment/default_lv2_effects.json`.
3. Compare those manifest URIs to the live discovery results from `/api/plugins/discover`.

Expected:
- Effect-card audit coverage should be based on the live runtime inventory or should explicitly prove manifest/runtime parity first.

Actual:
- The host currently misses 10 deployment URIs and exposes 15 additional live URIs, so the existing test proves manifest rendering, not live runtime coverage.

### F004 - Card-specific preset flows are unreachable in the current GUI

Severity: Major

Source:
- Custom cards under `web/src/app/components/PluginCards/Custom/**`
- `web/src/app/pages/JuceGridPage.tsx`

Reproduction:
1. Inspect custom cards that define preset controls or preset arrays.
2. Trace the active JUCE Grid editor path from `JuceGridPage.tsx`.
3. Confirm the live page never mounts those preset-bearing card components.

Expected:
- Preset-bearing effect cards should have a visible and operable path in the active editor.

Actual:
- Preset UI exists in source, but the active editor route never renders those cards, so the preset flows are API-only or dead code.

### F005 - The parameter-schema route drops 8 live EQ parameters

Severity: Major

Source:
- Live `GET /api/plugins/discover`
- Live `GET /api/plugins/parameter-schema`
- `app/routes/plugins.py`

Reproduction:
1. Fetch `/api/plugins/discover` and enumerate `map2://juce/eq/parametric` parameters.
2. Fetch `/api/plugins/parameter-schema` and compare descriptor keys.
3. Inspect `_build_parameter_schema_payload()` in `app/routes/plugins.py`.

Expected:
- Every discovered native/LV2 parameter should produce a schema descriptor when the UI depends on that route for numeric fidelity.

Actual:
- `band0_type` through `band7_type` are discovered live but omitted from the schema payload because the serializer coerces defaults to finite floats only.

### F006 - Many JUCE custom cards are singleton-route driven rather than plugin-instance driven

Severity: Major

Source:
- `web/src/app/components/PluginCards/Custom/JUCE/CompressorCard.tsx`
- `web/src/app/hooks/useDynamics.ts`
- `web/src/app/hooks/useModulation.ts`

Reproduction:
1. Open a JUCE custom card such as `CompressorCard.tsx` and note that it ignores `parameterValues` from `PluginCardProps`.
2. Follow the hook call into `useDynamics()` or `useModulation()`.
3. Observe that the hook reads and writes singleton `/api/engine/...` routes rather than the selected plugin instance.

Expected:
- A card rendered for a selected block should edit that block’s instance state, even when multiple identical processors exist.

Actual:
- The card subsystem relies on global engine routes such as `/api/engine/dynamics/compressor/parameters` and `/api/engine/modulation/pitch-shifter`, so instance-safe editing is not guaranteed if those cards are reactivated.

## Remediation Plan

1. Choose one editor strategy and finish it. Either wire `PluginCardRouter` back into the active JUCE Grid/editor flow, or remove the dead card subsystem and stop treating it as shipped UI.
2. Normalize plugin URIs across registry entries, custom cards, snapshot surfaces, and tests so every feature path targets the same canonical plugin identity.
3. Replace manifest-only audit coverage with a live inventory audit that starts from `/api/plugins/discover` and `/api/plugins/parameter-schema`, then asserts parity against deployment manifests separately.
4. Make any reactivated custom card instance-safe by routing through plugin-instance state or RT parameter channels instead of singleton `/api/engine/...` endpoints.
5. Fix `_build_parameter_schema_payload()` so enum/discrete parameters such as EQ band types are serialized instead of silently dropped.
