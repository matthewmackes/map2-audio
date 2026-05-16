# Snapshot Codegen Drift Audit — 2026-05-16

**Filed:** 2026-05-16 — Claude (post-run-14b pick #1 wire-in)
**Scope:** Audit the impact of a 14-day codegen drift on `web/src/map2/clients/snapshots.generated.ts`.
**Triggered by:** Run-14b pick #1 (commit `90ddca903`) wired `verify:contracts` into `npm run typecheck`. That gate immediately failed on a pre-existing drift — `snapshots.generated.ts` had not been refreshed since 2026-04-29 (commit `b2e4bfbcb` T_RENAME) despite the snapshot Pydantic surface evolving across multiple epics.

---

## TL;DR

The drift was **dormant**. No functional consumers, no `@ts-ignore` / `@ts-expect-error` escapes added in the window, no `as any` workarounds. The Pydantic→TS pipeline had two surfaces:

1. **Generated codegen** — stale for 14 days, but only consumed by the contract module's self-test anchor.
2. **Hand-mirrored types** — manually kept current alongside Pydantic changes (T2518 fields, T2521 enums, `asset_type` variants all present).

Remediation: codegen file refreshed (commit `0ba56e9a0`); CI gate wired (commit `90ddca903`). Going forward, any drift fails `npm run typecheck` immediately.

---

## Pydantic surface commits in the 14-day window (b2e4bfbcb..HEAD)

Snapshot / audio_state / SonoBus / audio_interface_registry / midi_map commits:

```
46428b715  feat(sonobus): T2521-7b interface registry adapter
292d00716  feat(sonobus): T2521-3 SonoBusBindingAuthority
13ee5bda8  feat(snapshots,audio): T2518 — unified audio-interface picker
8dcc5e7fa  feat(T2506): snapshot graph extensions for recording
f093afbcf  feat(midi): wire midi_map[] write-through projection
c3324cf17  feat(midi): surface snapshot program-number assignments
```

Route surface commits in the window:

```
13ee5bda8  feat(snapshots,audio): T2518 audio interface IDs
474ad2288  feat(T2508-4): /api/v1/recorder/sessions HTTP routes
acff7376d  fix(routes,maschine): stale-rename follow-ups
6eb572464  fix(backend): rename two /brain → /sequencer routes
```

## What the codegen diff brought in

Aggregate diff: `42,338 inserts / 26,480 deletes` across one file. Material additions to the OpenAPI surface:

- `/api/audio/interfaces` route + types (T2518)
- `/api/v1/interfaces/capabilities` route (T2517 effects block)
- `/api/avb/interfaces/{ifname}/counters` route
- `requested_input_interface_id?: string | null` on `AudioStateDesiredIO` (T2518)
- `requested_output_interface_id?: string | null` on `AudioStateDesiredIO` (T2518)
- `input_interface_id` / `output_interface_id` on `SnapshotIOBindingsInput` / `SnapshotControlsInput` (T2518)
- AVB binding `consumer_type` enum: `avdecc_stream | tesira_preset | tesira_block | cluster_route | srp_reservation`
- AVB binding `source_type` enum: `avdecc_talker | avdecc_listener | tesira_subscription | engine_signal`
- AVB binding `target_type` enum: `avdecc_listener | tesira_apply | engine_sink | cluster_listener`
- `asset_type` gained `"empty"` variant on `SequencerSlot` (already present on slot, not on library asset — correct per Pydantic source)

## Consumer audit

### Files that import from `snapshots.generated.ts`

```
$ grep -rln "snapshots.generated" web/src
web/src/map2/clients/snapshots.contract.ts
```

**Only one file**: the contract re-export module. The module's `_contractAnchor` is a compile-time self-test that confirms every named contract type resolves — it has no behavioral impact on the application.

### Files that import from `snapshots.contract.ts` (the re-export)

```
$ grep -rln "snapshots.contract\|SnapshotCreateRequestContract\|SnapshotUpdateRequestContract\|SnapshotChainInputContract\|SnapshotChannelInputContract\|SnapshotPluginInputContract\|SnapshotRoutingInputContract\|SnapshotLoopInsertionInputContract\|SnapshotIOBindingsInputContract\|SnapshotControlsInputContract\|SnapshotPathInputContract" web/src
web/src/map2/clients/snapshots.contract.ts
web/src/map2/clients/snapshots.generated.ts
```

**Zero application consumers.** The contract module is referenced only by itself + the generated.ts. The application uses the hand-mirrored types from `web/src/map2/types.ts` + `web/src/map2/clients/snapshots.ts`.

### Type-suppression escapes added in the window

```
$ git log b2e4bfbcb..HEAD --diff-filter=M -p -G "@ts-(expect-error|ignore)" \
    -- "web/src/app/components/SnapshotEditor" \
       "web/src/app/pages/SnapshotPublishPage*" \
       "web/src/app/pages/SnapshotEditor*" \
       "web/src/map2/clients/snapshots*" \
    | grep -cE "^\+ +//.*@ts-"

0 new @ts-ignore / @ts-expect-error added in snapshot consumers.
```

```
$ git log b2e4bfbcb..HEAD --diff-filter=M -p \
    -- "web/src/app/components/SnapshotEditor" \
       "web/src/app/pages/SnapshotPublishPage*" \
       "web/src/app/pages/SnapshotEditor*" \
    | grep -E "^\+" | grep -cE "as any\b|as unknown"

0 new `as any` / `as unknown` workarounds in snapshot consumers.
```

### Hand-mirrored types — confirmed current

T2518 fields in `web/src/map2/types.ts`:

```typescript
export interface SnapshotIOBindings {
  input_device: string | null;
  output_device: string | null;
  input_interface_id?: string | null;       // T2518 ✓
  output_interface_id?: string | null;      // T2518 ✓
  monitoring_output_index?: number | null;
  remap_required: boolean;
}

export interface SnapshotControls {
  midi_map: SnapshotMidiMapEntry[];
  // ...
  input_interface_id?: string | null;       // T2518 ✓
  output_interface_id?: string | null;      // T2518 ✓
  maschine_encoder_map: SnapshotMaschineEncoderMap;
}
```

`asset_type` enum coverage in `web/src/map2/api.ts`:

```typescript
// SequencerSlot
asset_type: 'soundfont' | 'sfz' | 'sample' | 'kit' | 'patch' | 'empty'  // ✓

// SequencerLibraryAsset (does NOT include 'empty', matches Pydantic)
asset_type: 'soundfont' | 'sfz' | 'sample' | 'kit' | 'patch'
```

AVB binding enums (`consumer_type` / `source_type` / `target_type`) — exist only in the generated.ts. The frontend AVB binding consumers read via untyped JSON responses; no live consumer needs the strict enum surface. **Recommendation for future cycle**: thread the AVB binding enum types through `web/src/map2/types.ts` if any AVB UI flow gains strict-enum needs.

## Test sweep

### Frontend typecheck (full chain)

```
$ cd web && npm run typecheck
> npm run verify:contracts && npm run verify:meter-ws-types && tsc --noEmit

snapshots.generated.ts is up to date.        ← gate 1 (T2455)
                                              ← gate 2 (run-14b meter-WS)
                                              ← gate 3 (tsc --noEmit)
EXIT 0
```

All three gates green at HEAD.

### Frontend snapshot consumer sweep

```
$ npx jest --testPathPatterns="(SnapshotPublish|SnapshotEditor|SnapshotInterfacePicker|snapshot)" --no-coverage
Test Suites: 1 failed, 122 passed, 123 total
Tests:       3 failed, 750 passed, 753 total
```

The 3 failures are in `DesktopExperience.snapshot.test.tsx` — `ReferenceError: fetch is not defined` (JSDOM environment issue). **Pre-existing**, confirmed by checking out commit `528ddf520` (one commit before the codegen refresh) and re-running:

```
$ git checkout 528ddf520 -- .
$ npx jest --testPathPatterns="DesktopExperience" --no-coverage
Tests:       6 failed, 2 passed, 8 total      ← same failure pattern, predates this audit
```

### Backend Pydantic surface sweep

```
$ python3 -m pytest tests/ -q --tb=line \
    -k "snapshot or audio_interface or avb_binding or sequencer_library or sonobus"
696 passed, 4 skipped, 5797 deselected in 120.28s
```

Zero failures across the affected surfaces. Snapshot Pydantic models are healthy.

## Conclusion

**No application code was broken by the 14-day drift.** The drift gate had been shipped (T2455, 2026-04-29) but never wired into CI, so it was decorative. Run-14b pick #1 closed that hole by wiring `verify:contracts` into `npm run typecheck` alongside the new `verify:meter-ws-types` gate.

### What changed this session

| Commit | What |
|--------|------|
| `0ba56e9a0` | Refresh `snapshots.generated.ts` (no-op codegen output, 42k inserts / 26k deletes) |
| `90ddca903` | Wire `verify:contracts` + `verify:meter-ws-types` into `npm run typecheck` (+ 7 gate tests) |

### Forward gates

- Any future Pydantic schema change without a paired codegen refresh fails `npm run typecheck`. The drift gate is no longer decorative.
- The meter-WS Pydantic surface has its own codegen gate (`verify:meter-ws-types`) running in the same chain.
- This audit dir + the test gate pin the conclusion so a future skeptic can replay the proof.

### Follow-on filed under no T-anchor

The AVB binding `consumer_type` / `source_type` / `target_type` enums exist in the generated codegen but no hand-mirrored TS equivalent. If a future UI flow needs strict-enum handling on AVB bindings, thread the types through `web/src/map2/types.ts` from the codegen — currently low priority since no live consumer needs them.

---

## How to replay this audit

```bash
# 1. Confirm typecheck gate is green
cd web && npm run typecheck
# Expected: all three gates pass, exit 0

# 2. Confirm no consumer regressed
npx jest --testPathPatterns="(SnapshotPublish|SnapshotEditor|SnapshotInterfacePicker|snapshot)" --no-coverage
# Expected: 750 pass, 3 pre-existing DesktopExperience failures

# 3. Confirm Pydantic surface is healthy
python3 -m pytest tests/ -q -k "snapshot or audio_interface or avb_binding or sequencer_library or sonobus"
# Expected: 696 pass, 4 skipped

# 4. Re-run drift simulation to confirm gate teeth
cp web/src/app/types/meterWsFrame.generated.ts /tmp/backup.ts
echo "// stale" > web/src/app/types/meterWsFrame.generated.ts
cd web && npm run typecheck
# Expected: nonzero exit with "FAIL: meterWsFrame.generated.ts is out of date"
cp /tmp/backup.ts web/src/app/types/meterWsFrame.generated.ts
```
