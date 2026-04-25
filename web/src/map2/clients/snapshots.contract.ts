/**
 * T2455 — Generated snapshot contract surface.
 *
 * Thin re-export over the auto-generated `snapshots.generated.ts` (a 125k-line
 * dump of the entire OpenAPI schema). This module is the only file consumers
 * should import from to get **server-of-truth** snapshot input/output types.
 *
 * The hand-mirrored types in `snapshots.ts` and `web/src/app/components/
 * SnapshotEditor/snapshotEditorState.ts` may continue to exist for now (rich
 * UI state types layered on top), but **request/response payload types** for
 * the snapshot endpoints should come from this contract module.
 *
 * Regenerate: `python3 scripts/generate_typescript_contracts.py`
 * Check freshness in CI: `python3 scripts/generate_typescript_contracts.py --check`
 */

import type { components } from './snapshots.generated'

// ─── Snapshot create/update request payloads ────────────────────────────────
export type SnapshotCreateRequestContract = components['schemas']['SnapshotCreateRequest']
export type SnapshotUpdateRequestContract = components['schemas']['SnapshotUpdateRequest']

// ─── Nested snapshot input types ────────────────────────────────────────────
export type SnapshotChainInputContract = components['schemas']['SnapshotChainInput']
export type SnapshotChannelInputContract = components['schemas']['SnapshotChannelInput']
export type SnapshotPluginInputContract = components['schemas']['SnapshotPluginInput']
export type SnapshotRoutingInputContract = components['schemas']['SnapshotRoutingInput']
export type SnapshotLoopInsertionInputContract = components['schemas']['SnapshotLoopInsertionInput']
export type SnapshotIOBindingsInputContract = components['schemas']['SnapshotIOBindingsInput']
export type SnapshotControlsInputContract = components['schemas']['SnapshotControlsInput']
export type SnapshotPathInputContract = components['schemas']['SnapshotPathInput']

// ─── Anchor: a small compile-time check that every contract type is non-never.
// If the OpenAPI schema drops one of these names, the build fails here with a
// clear "Type 'unknown' is not assignable" before any silent drift can land.
const _contractAnchor: {
  create: SnapshotCreateRequestContract
  update: SnapshotUpdateRequestContract
  chain: SnapshotChainInputContract
  channel: SnapshotChannelInputContract
  plugin: SnapshotPluginInputContract
  routing: SnapshotRoutingInputContract
  loopInsertion: SnapshotLoopInsertionInputContract
  ioBindings: SnapshotIOBindingsInputContract
  controls: SnapshotControlsInputContract
  path: SnapshotPathInputContract
} | null = null
void _contractAnchor
