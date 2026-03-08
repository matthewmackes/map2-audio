# Cluster Clone Reset + Rejoin Runbook

## Scope

Use this runbook when a MAP2 node was cloned and now conflicts with cluster identity/trust state (duplicate node ID, stale trust entries, or failed onboarding).

This operation resets local node identity artifacts and optionally re-registers the node to a management node.

## Preconditions

- Operator has API access to the target node (`http://<node>:8080`).
- Target node is the one being reset, not the management node.
- You understand this removes local identity/trust artifacts.
- Audio content (presets, signal chains) is preserved by design.

## Endpoints

- Preview: `GET /api/cluster/node/reset-default-rejoin/preview`
- Execute: `POST /api/cluster/node/reset-default-rejoin`

## Quick Safety Checks

1. Confirm current node identity and reset targets with preview.
2. Confirm management node IP if you want immediate rejoin.
3. Ensure cluster/network services are reachable before requesting rejoin.

## Procedure (API)

1. Preview current state.

```bash
curl -sS http://127.0.0.1:8080/api/cluster/node/reset-default-rejoin/preview | jq
```

Expected preview payload:
- `status: "ok"`
- `identity` snapshot
- `targets.existing` and `targets.missing`

2. Execute reset + rejoin.

```bash
curl -sS -X POST http://127.0.0.1:8080/api/cluster/node/reset-default-rejoin \
  -H 'Content-Type: application/json' \
  -d '{
    "management_node_ip": "10.0.0.10",
    "rejoin": true,
    "clear_registry_state": true
  }' | jq
```

3. Interpret result.

- `status: "ok"` means reset and rejoin completed.
- `status: "partial"` means reset ran but one or more post-steps failed.
- Review:
  - `files.removed`, `files.failed`
  - `registry.removed_node_ids`, `registry.failed`
  - `rejoin.success`, `rejoin.error`
  - `warnings`

## Procedure (GUI)

1. Open Cluster Dashboard.
2. Go to advanced operations tab.
3. Run "Reset to Default, Rejoin" preview.
4. Confirm target files/identity are correct.
5. Execute reset with desired options:
   - management node IP
   - rejoin on/off
   - clear local registry on/off
6. Review structured result panel.

## Verification

Run these checks after execution:

```bash
curl -sS http://127.0.0.1:8080/api/cluster/status | jq
curl -sS http://127.0.0.1:8080/api/cluster/nodes | jq
curl -sS http://127.0.0.1:8080/api/cluster/node/reset-default-rejoin/preview | jq
```

Expected:
- Node appears once in cluster listings.
- Preview shows newly generated node identity.
- No repeated duplicate-ID registration flaps in logs.

## Rollback / Recovery Guidance

If result is `partial`:

1. If identity reset succeeded but rejoin failed:
   - Fix network/reachability.
   - Re-run execute endpoint with `rejoin=true`.

2. If registry cleanup failed:
   - Inspect `registry.failed`.
   - Remove stale rows via cluster admin tooling, then retry rejoin.

3. If file removal failed:
   - Inspect `files.failed` paths and permissions.
   - Correct file ownership/permissions and retry.

4. If you must stop before rejoin:
   - Execute with `rejoin=false`.
   - Resolve environment issues, then run again with `rejoin=true`.

## Operational Notes

- Endpoint returns HTTP 200 with structured failure context for operational visibility.
- Treat `status: "partial"` as incomplete and follow the recovery guidance above.
