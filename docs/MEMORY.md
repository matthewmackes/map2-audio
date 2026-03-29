# MAP2 Memory Index

## E-SNAP Canonical Surfaces

- Backend snapshot API: `app/routes/unified_snapshots.py`
- Backend snapshot service: `app/services/snapshot_service.py`
- Snapshot runtime helpers: `app/services/snapshot_runtime_service.py`
- Cluster snapshot deployment API: `app/routes/cluster_snapshots.py`
- Cluster snapshot deployment service: `app/services/snapshot_deployment_service.py`
- Migration script: `scripts/migrate_to_unified_snapshots.py`

## Frontend Snapshot Editor Surfaces

- Page entry: `web/src/app/pages/SnapshotEditorPage.tsx`
- Snapshot client: `web/src/map2/clients/snapshots.ts`
- Snapshot websocket hook: `web/src/app/hooks/useSnapshots.ts`
- Snapshot editor state: `web/src/app/components/SnapshotEditor/snapshotEditorState.ts`
- Snapshot editor live-chain helpers: `web/src/app/components/SnapshotEditor/snapshotEditorLiveChains.ts`
- Snapshot editor comparison helpers: `web/src/app/components/SnapshotEditor/snapshotEditorComparison.ts`

## Vocabulary

- Use `snapshot`, `channel`, and `routing` for the unified editor/runtime model.
- Avoid user-facing `flow`, `flow slot`, and `A/B mode` terminology on new snapshot-editor work.

## Legacy Removals Already Applied

- Removed: `app/routes/flow_snapshots.py`
- Removed: `app/routes/cluster_flows.py`
- Removed: `app/routes/chains_ab_mode.py`
- Removed: `app/routes/snapshot_library.py`
- Removed: `app/routes/flow_failover.py`
- Removed: `app/routes/snapshots.py`
- Removed: `app/services/flow_orchestrator.py`
- Removed legacy backend tests tied only to those route surfaces.

## Remaining E-SNAP Follow-up

- The frontend checkpoint is now coherent and build-clean, but `JuceGrid*`, `ChainFlow*`, and `*Flow*` compatibility shims still remain in the tree.
- Do not delete or rename those files blindly; retire them only after their remaining imports/tests/docs move to the canonical `SnapshotEditor*`, `ChainGraph*`, and `*SignalPath*` surfaces.
