# MAP2 Memory Index

## E-SNAP Canonical Surfaces

- Backend snapshot API: `app/routes/unified_snapshots.py`
- Backend snapshot service: `app/services/snapshot_service.py`
- Snapshot runtime helpers: `app/services/snapshot_runtime_service.py`
- Cluster snapshot deployment API: `app/routes/cluster_snapshots.py`
- Cluster snapshot deployment service: `app/services/snapshot_deployment_service.py`
- Migration script: `scripts/migrate_to_unified_snapshots.py`

## Frontend Snapshot Editor Surfaces

- Route entry: `web/src/app/pages/SnapshotEditorPage.tsx`
- Page owner: `web/src/app/pages/SnapshotEditorPageContent.tsx`
- Snapshot client: `web/src/map2/clients/snapshots.ts`
- Snapshot websocket hook: `web/src/app/hooks/useSnapshots.ts`
- Snapshot editor state: `web/src/app/components/SnapshotEditor/snapshotEditorState.ts`
- Snapshot editor live-chain helpers: `web/src/app/components/SnapshotEditor/snapshotEditorLiveChains.ts`
- Snapshot editor comparison helpers: `web/src/app/components/SnapshotEditor/snapshotEditorComparison.ts`
- Snapshot editor live-path helpers: `web/src/app/components/SnapshotEditor/snapshotEditorLivePath.ts`
- Snapshot chain management: `web/src/app/components/SnapshotEditor/SnapshotChainManagementCard.tsx`
- Chain graph canvas owner: `web/src/map2/components/ChainBuilder/ChainGraphCanvas.tsx`
- MPX1 signal-path owner: `web/src/app/components/MPX1/MPX1SignalPathCanvas.tsx`
- IntelFX signal-path owner: `web/src/app/components/IntelFX/IntelFXSignalPathCanvas.tsx`

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

## Compatibility Wrappers

- Legacy `JuceGrid*`, `ChainFlow*`, and `*Flow*` filenames that still exist in the tree are compatibility wrappers only.
- Canonical ownership now lives under `SnapshotEditor*`, `ChainGraph*`, and `*SignalPath*` files; prefer those paths for all new imports and documentation.
