# MAP2 Release Prep Evidence — 2026-05-20

## Scope

User request: `update, and prepare for release`.

This release-prep pass sealed the existing TASCAM US-144MKII bench evidence, hardened the JUCE random-FX soak harness for device-targeted bench runs, repaired snapshot codegen drift so release builds are reproducible, ran software validation, and prepared the tree for the MAP2 `update` loop (commit, dual-push, rebuild/restart port 3000).

## Evidence accepted

- T2515 physical bench evidence: `docs/fit-for-purpose-evidence/20260518/tascam-us144mkii-soak-4h/`
- Soak summary: 4h at 48 kHz / 64 samples, 10 active effects per flow, 720 flow transitions, 0 xruns, 0 flow errors, peak callback jitter 0.0 ms (threshold ≤0.35 ms).
- Transient `.pid` markers were removed from the evidence directory and `*.pid` is ignored going forward.

## Release-prep changes

- `.codex/skills/juce-random-effects-soak/scripts/run_juce_random_fx_soak.py`
  - Added `--audio-device` CLI flag.
  - Preserved `MAP2_SOAK_AUDIO_DEVICE` as legacy environment fallback.
  - Captures the selected audio device in generated JSON/Markdown artifacts.
- `scripts/generate_typescript_contracts.py`
  - Filters OpenAPI input to the explicit snapshot schema roots used by `snapshots.contract.ts`.
  - Keeps snapshot codegen deterministic and release-build scoped to the actual frontend contract.
- `app/routes/engine.py`, `app/routes/mpx1_effects_block.py`, `app/routes/impulse_response.py`, `app/routes/soundfonts.py`
  - Renamed duplicate OpenAPI request model classes to unique names.
- `web/src/map2/clients/snapshots.generated.ts`
  - Regenerated as the filtered snapshot contract closure.
- `docs/PROJECT_WORKLIST.md`
  - Filed T2530 and moved T2515 soak evidence to accepted/done state.

## Validation commands

- `python3 -m pytest -q tests/test_soak_harness_midi_extension_t2459h6.py`
  - PASS: 7 passed.
- `python3 -m pytest -q tests/test_soak_harness_midi_extension_t2459h6.py tests/test_platform_version.py tests/test_version_manifest_resilience.py tests/test_typecheck_gate_wires_codegen_checks.py tests/test_codegen_index_doc.py`
  - PASS: 39 passed.
- `python3 scripts/generate_typescript_contracts.py --check`
  - PASS: `snapshots.generated.ts is up to date.`
- `npm --prefix web run typecheck`
  - PASS.
- `npm --prefix web run build`
  - PASS: Vite built 3556 modules; live `web/dist/index.html` updated 2026-05-20 12:37 EDT; main index bundle `assets/index-BaaTvQ3h.js`.
- Licensing audit commands:
  - `rg -n "AGPL|GNU Affero|license|LICENSE|THIRD_PARTY_NOTICES|SPDX|non-commercial|source-available|Proprietary|MIT" README.md LICENSE docs/THIRD_PARTY_NOTICES.md docs/architecture/LICENSE_COMPATIBILITY.md .codex/skills/licencing`
  - `rg --files -g 'LICENSE*' -g '*COPYING*' -g '*NOTICE*'`
  - Result: PASS; README, top-level LICENSE, THIRD_PARTY_NOTICES, and license compatibility docs still state MAP2-owned AGPL-3.0-only posture with third-party overrides preserved. No new dependencies or third-party code were added.

## Platform-layer review

No new packages, services, runtime daemons, install-time dependencies, or installer changes are required. The new audio-device selection is a bench-harness CLI option/environment fallback only; it does not change runtime service defaults. Version artifacts (`VERSION`, `version.json`) were updated by the release build.

## Remaining non-software gates

Existing hardware/lab blockers remain tracked in `docs/PROJECT_WORKLIST.md` (for example T004 and T065). This pass prepares the current software tree and accepted TASCAM evidence for release/update; it does not claim completion of unrelated lab-blocked epics.
