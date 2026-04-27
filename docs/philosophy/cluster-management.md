# Philosophy — Cluster Management, and What is Synchronised between MAP Servers

> **Audience:** Operators running multi-node deployments, engineers extending the cluster control plane, and anyone wondering what happens when a peer disappears.
> **Scope:** Node identity, the control transport, what state is synchronised vs. what is local, the Raft-backed management quorum, and the deliberate gaps that exist today.

## 1. The thesis

A MAP2 cluster is a **federation of single-owner nodes** with a Raft-elected management plane and a State Authority document store. The platform commits to:

1. **Single-owner devices.** No two nodes ever drive the same hardware. Adoption is enforced by a unique constraint at the database layer.
2. **Document-shaped state.** The same graph documents that act as the snapshot single source of truth are the same documents replicated between nodes.
3. **Explicit transitions.** Node promotion/demotion, device adoption, and state failover are all operator-driven, not silent.
4. **Honest gaps.** Where clustering is partial today (backup replication, cross-node device failover), the documentation says so.

## 2. What a node is

Every MAP2 server boots with an identity:

- `node_id` of the form `AUDIO-NODE-<4-hex>` or `MANAGEMENT-NODE-<4-hex>` derived from a hostname hash (`app/services/node_identity.py`).
- A role: `AUDIO-NODE` (processes audio, hosts devices) or `MANAGEMENT-NODE` (orchestrates the cluster, drives adoption, hosts Raft state).
- An entry in the persistent cluster registry at `/var/lib/map2/cluster.db` (`app/services/cluster/registry.py`), holding IP, MAC, capabilities, status, health score, and recent metrics.

Roles are runtime-promotable: `POST /api/cluster/nodes/{id}/promote` and `/demote` move a node up or down, and a demote drains its responsibilities to its peers before completing. There is no "every node is the same" symmetry — a cluster has at least one management node, and audio nodes do not orchestrate.

## 3. Two transports, two purposes

**Control plane: HTTP + WebSocket.**

`app/routes/nodes.py` exposes `/api/node/{id}/proxy/{path}`, which forwards requests to a peer via httpx with a 3 s timeout, header sanitisation, and a 60 req/min rate limiter. This is how one node "reaches into" another to read live snapshot state, fetch diagnostic info, or trigger a remediation. It is deliberately HTTP — the same surface a browser would use — so cluster operations are debuggable with `curl`.

`WebSocketFederator` (`app/services/ws_federation.py`) layers a mesh on top: every node subscribes to peer event streams with a 5 s heartbeat. This is how parameter changes, snapshot transitions, and device events fan out without polling.

**Audio plane: AVB.**

The audio side does not use the control plane. Cross-node audio rides AVTP streams as described in *Philosophy — AVB*. The two planes meet only at the routing UI, which uses the control plane to orchestrate stream creation and the audio plane to actually carry samples.

## 4. What is synchronised between nodes

| State | Source | Replication | Notes |
|---|---|---|---|
| **Snapshot graph documents** | etcd-backed State Authority | Watch-driven across peers | The canonical state. Live cluster-wide. |
| **Node registry** | `/var/lib/map2/cluster.db` | Heartbeat + manual sync | Each node holds its own view; reconciled on heartbeat. |
| **Adoption records** | `adoption_records` table | Single writer per record | `node_id UNIQUE` prevents conflict. |
| **Special settings** | `app/services/special_settings_raft.py` | Raft log replication | Only management-plane consumer of Raft today. |
| **Live snapshot state** | Per-node `SnapshotRuntimeStateService` | Broadcast on `RUNTIME_LIVE_STATE_TOPIC` | Per-node activation phase, surfaced cluster-wide. |
| **Health metrics** | Per-node | Polled via `/api/cluster/health` | Aggregated, not replicated. |

| Local-only state | Why |
|---|---|
| **Backups** | `app/services/backup_service.py` writes to `/var/lib/map2/backups/` on the local node. Cluster-wide backup replication is future work. |
| **Asset blobs** | NAMs and IRs live on the local filesystem; the State Authority document references them by SHA-256 but does not transport them. |
| **Telemetry SQLite databases** | Cluster events, platform events, network topology — each node keeps its own. |

## 5. Raft, sparsely used

`app/services/cluster/raft_consensus.py` is a real Raft implementation: leader election, log replication, FSM, the standard `FOLLOWER → CANDIDATE → LEADER` transitions. As of today its only production consumer is `special_settings_raft.py`. Why so little:

- The State Authority's etcd-backed document store *already* gives compare-and-swap semantics with cluster-wide watches. Putting the heavy work in etcd means the Raft layer in MAP2 is needed only for a few management-plane decisions that benefit from a strong-consistency log replay (special settings, future cluster-wide configuration toggles).
- Layered consensus (etcd for state, Raft for management decisions) is more debuggable than one big Raft mesh holding everything.

The pattern to expect: when a new piece of cluster-wide management state appears that is *not* a snapshot graph (e.g. cluster-wide feature flags, scheduled maintenance windows), it lands in the Raft log. Snapshot state stays in etcd.

## 6. Device ownership and adoption

The single-owner rule is enforced in SQL: `adoption_records.node_id TEXT UNIQUE`. The FSM:

```
candidate → claimable → adopted → ready → active
```

Transitions:

- **candidate → claimable**: readiness checks pass (device responds, profile resolved).
- **claimable → adopted**: a management node claims the device, either interactively (one-time code) or via a signed bootstrap token.
- **adopted → ready**: local services come up green.
- **ready → active**: the device is in use by the snapshot graph.

There is no automatic failover. If the owning node dies, the device sits in `not_found` on its peers' UI until an operator re-adopts. This is a deliberate trade: silent failover during a live show is worse than a banner that says "Tesira on node B is offline; re-adopt to take over here?"

## 7. Reconciliation

Two reconcilers run on a clock:

- **State Authority reconciler** (`app/services/state_authority_cluster_reconciler.py`) — fetches each node's observed snapshot state via `/api/node/{id}/proxy/api/snapshots/live`, diffs against the desired state in etcd, reports parameter drift, topology drift, missing assets, and triggers corrections.
- **Heartbeat monitor** (`app/services/cluster/heartbeat_monitor.py`) — tracks node liveness, consecutive failures, response times. Marks a node `degraded` after configured failure thresholds.

Reconciliation reports surface as Prometheus metrics (`app/services/state_authority_reconciliation_scheduler.py`) and feed `/api/cluster/health`.

## 8. What clustering does not yet do

Honesty matters here. Today:

- **Distributed snapshot migration is manual.** Moving a snapshot from node A to node B is a `proxy` call sequence, not a single API.
- **Backup replication is local.** A node's backup directory does not mirror to its peers.
- **No cross-node device hot-failover.** As described above, adoption is single-owner and operator-driven.
- **AVB cross-node orchestration is partial.** The router has `talker_node_id` and `listener_node_id` fields and the UI exposes them, but full end-to-end cluster-wide stream choreography (especially with SRP admission across switches) is still being hardened.
- **Raft is not the cluster-wide state log.** It carries special settings only.

These are not bugs. They are deliberate scope boundaries to keep the platform predictable while the State Authority and Raft layers settle.

## 9. Operator implications

- A cluster has exactly one source of audio truth (the snapshot graph in etcd) and exactly one source of management truth (the Raft log). They do not contradict each other because they cover different state.
- A node loss is visible. Banners explain consequences. Re-adoption is one operator action, not three.
- Drift is detected on a clock, not on a hope. The reconciler reports parameter, topology, and asset divergence.
- Cluster-wide observability is `/api/cluster/health` plus Prometheus. There is no separate dashboard the platform doesn't ship.

## 10. Where to read next

- `app/services/cluster/registry.py` — node registry and CMDB.
- `app/services/cluster/adoption.py` — the adoption FSM.
- `app/services/state_authority_cluster_reconciler.py` — drift detection.
- `app/services/cluster/raft_consensus.py` — the Raft layer.
- `docs/AVB_MULTI_NODE_ARCHITECTURE.md` — audio plane.
- `docs/ADOPTION_WORKFLOW_RUNBOOK.md` — operator procedures.
