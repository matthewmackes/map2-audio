# Audio State Authority - Big-Bang etcd Cutover

## Decision

MAP2 will perform a big-bang cutover to a single authoritative audio-state control plane.

- Snapshots remain the centralized durable store of saved configurations.
- etcd becomes the only live/control-plane source of truth.
- Nodes report observations; they do not declare final truth.
- UI and APIs must read committed authority state for all operator-visible live status.

## Authority Options Considered

1. MAP2-native authority service backed by one primary management node and a versioned database row/event log.
2. etcd-backed audio authority with MAP2 as the state machine. Selected.
3. PostgreSQL primary with synchronous standbys and logical decoding.
4. NATS JetStream KV/stream authority bus.
5. Consul KV/session-backed authority and leader election.

## Canonical Model

Three layers only:

- `Snapshot Store`
  - SQL-backed saved rig definitions and revisions.
- `Desired / Observed / Committed`
  - etcd-backed cluster control plane.
- `Draft`
  - local editor-only unsaved state.

There is no fourth runtime truth.

## Keyspace

```text
/map2/audio-state/v1/leader
/map2/audio-state/v1/desired
/map2/audio-state/v1/committed
/map2/audio-state/v1/observed/<node_id>
/map2/audio-state/v1/events/<revision>
/map2/audio-state/v1/acks/<node_id>
```

## Runtime Rules

- All live widgets read `/committed`.
- Snapshot activation compiles a saved snapshot revision into a `CompiledSnapshotIntent`.
- Nodes watch `/desired`, apply locally, and publish `/observed/<node_id>`.
- The authority service reconciles observations into `/committed`.
- `Snapshot.live_state` and related legacy runtime fields are no longer authoritative.

## Snapshot Reapply Contract

Snapshots stay centralized in SQL and are re-applied by compiling them into deployable intent:

1. Load snapshot definition from SQL.
2. Normalize into `CompiledSnapshotIntent`.
3. Write intent to `/desired`.
4. Wait for node observations.
5. Commit reconciled `AuthoritativeAudioState` to `/committed`.

## Fedora Installation Standard

This repo now treats etcd as a required control-plane dependency for the big-bang path.

### Recommended topology

- 3 management-capable nodes for etcd quorum
- dedicated data directory per node
- systemd-managed etcd service
- TLS enabled for production clusters
- MAP2 authority namespace isolated under `/map2/audio-state/v1`

### Installation workflow

1. Install or stage the official etcd binaries on every management-capable node.
2. Create a dedicated `etcd` system user and data directory.
3. Configure peer and client URLs explicitly, with single-node or clustered bootstrap declared intentionally.
4. Write the MAP2 authority bridge into `/etc/map2/environment` so `map2-backend.service` picks up the same endpoint, namespace, timeout, and TLS settings without unit-file edits.
5. Start etcd under systemd with restart policies enabled.
6. Verify cluster health and namespace writability before starting MAP2 authority writers.
7. Configure MAP2 runtime keys:
   - `audio_state.authority_backend=etcd`
   - `audio_state.etcd_endpoints=[...]`
   - `audio_state.etcd_namespace=/map2/audio-state/v1`
   - `audio_state.etcd_verify_tls=true|false`
   - `audio_state.etcd_ca_cert_path=/path/to/ca.crt` when TLS is enabled

### Installer expectations

- installer supports dry-run planning before any host mutation
- installer creates rollback-friendly backups for generated unit/env artifacts
- installer supports uninstall of generated files without silently removing etcd data
- installer verifies endpoint health, member status, and a writable key under the MAP2 namespace

### Operational requirements

- treat etcd quorum loss as a control-plane outage
- do not allow UI live-state writes to bypass the authority service
- do not infer live path success from local editor topology
- require monotonically increasing `state_version`
- require node observation TTLs and stale-node expiry

## Cutover Impact

- Legacy split snapshot/runtime UI readers must be removed or rewritten.
- Audio Grid hero cards, path pills, runtime summaries, and node sync status must read authority state.
- Snapshot editing remains local until explicitly saved or activated.
