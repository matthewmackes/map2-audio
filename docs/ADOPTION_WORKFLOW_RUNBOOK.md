# MAP2 Adoption Workflow Runbook

## Purpose

This runbook is the canonical operator and engineering guide for bringing an unmanaged MAP2 node onto an existing platform using the shipped adoption workflow.

Use it when:

- a second MAP2 node appears on the management network but is not yet part of the cluster
- an operator needs to claim a node with a pairing code or a signed bootstrap token
- a newly adopted node must stay in standby until readiness checks pass
- a matching node should inherit safe runtime, deployment, clock, or AVB defaults from another managed node

## Core Lifecycle

Every feature should treat node state as:

`candidate -> claimable -> adopted -> ready -> active`

The important rule is:

- discovery is not trust
- trust is not readiness
- readiness is not activation

Operator surfaces and feature gates should interpret those states as follows:

- `candidate`: discovered on the management network, not trusted yet
- `claimable`: trust bootstrap succeeded; the node can be adopted
- `adopted`: stable node identity and registry membership exist, but the node is still in standby
- `ready`: readiness checks passed and the node may be promoted
- `active`: explicitly promoted and safe for cluster and AVB participation

## Where It Lives

Backend and API:

- [app/services/cluster/adoption.py](/home/mm/map2-audio/app/services/cluster/adoption.py)
- [app/routes/adoption.py](/home/mm/map2-audio/app/routes/adoption.py)
- [app/services/cluster/adoption_bootstrap.py](/home/mm/map2-audio/app/services/cluster/adoption_bootstrap.py)
- [app/routes/bootstrap.py](/home/mm/map2-audio/app/routes/bootstrap.py)

Operator UI:

- [web/src/app/pages/HomePage.tsx](/home/mm/map2-audio/web/src/app/pages/HomePage.tsx)
- [web/src/app/pages/HomePage.css](/home/mm/map2-audio/web/src/app/pages/HomePage.css)

Visibility overlays:

- [app/services/cluster/node_visibility.py](/home/mm/map2-audio/app/services/cluster/node_visibility.py)
- [app/routes/peer_discovery.py](/home/mm/map2-audio/app/routes/peer_discovery.py)
- [app/routes/cluster_health.py](/home/mm/map2-audio/app/routes/cluster_health.py)

## Operator Prerequisites

Before adoption, confirm:

- the unmanaged node is reachable on the management network
- the node is running matching MAP2 software or at least a compatible version
- the node exposes its backend API on the expected port
- the local platform can see the node in discovery
- the operator understands whether the node should be interactive-paired or token-claimed

## Standard Operator Flows

### 1. Interactive Claim With Pairing Code

Use this when a human can access the new node directly.

1. Open the Home page adoption queue.
2. Wait for the new node to appear as a `candidate`.
3. Obtain the one-time pairing code from the remote node bootstrap surface.
4. Enter the code and press `Claim`.
5. Confirm the node moves to `claimable`.
6. Press `Adopt to standby`.
7. Review readiness.
8. Press `Promote to active` only after readiness is no longer blocked.

### 2. Unattended Claim With Signed Bootstrap Token

Use this for repeated installs or field deployment when a live pairing-code exchange is unnecessary.

1. Open the Home page adoption queue.
2. Find the target node in `candidate`.
3. Press `Claim with token`.
4. The controller node issues a short-lived signed bootstrap token.
5. The remote node verifies that token through the issuer callback before accepting the claim.
6. The candidate moves to `claimable`.
7. Continue with `Adopt to standby` and later promotion.

### 3. Selective Profile Clone Before Promotion

Use this when the adopted node should inherit safe defaults from an existing managed node.

1. Adopt the target node to `standby`.
2. In the same adoption card, review the available clone sources.
3. Select the source node.
4. Review the clone preview groups.
5. Enable only the groups you want.
6. Press `Apply selected clone`.
7. Re-check readiness.
8. Promote the node only after the cloned settings settle cleanly.

## Clone Group Boundaries

The shipped clone workflow is intentionally selective. It copies safe defaults only.

Currently supported groups:

- `role_profile`
  - deployment mode
  - requested cluster role
- `runtime_profile`
  - current runtime profile from `/api/runtime-profiles/status`
- `clock_sync`
  - selected clock profile
  - profile version
  - clock master
  - engine rate
  - AVB stream rate
  - S/PDIF rate
  - buffer size
  - bit depth
  - allowed rates
  - hard-lock and resampler policy
- `avb_defaults`
  - AVB enabled
  - AVB interface
  - AVB auto-connect
  - AVB PTP domain
  - AVB max streams

The clone flow does not copy:

- node identity
- trust material
- claim tokens
- hostnames
- registry primary keys
- operator ownership metadata

## API Surface

Operator-facing adoption APIs:

- `GET /api/adoption/candidates`
- `GET /api/adoption/candidates/{candidate_id}`
- `GET /api/adoption/candidates/{candidate_id}/readiness`
- `POST /api/adoption/candidates/{candidate_id}/claim`
- `POST /api/adoption/candidates/{candidate_id}/adopt`
- `POST /api/adoption/nodes/{node_id}/promote`
- `GET /api/adoption/nodes/{node_id}/clone/sources`
- `GET /api/adoption/nodes/{node_id}/clone/preview?source_node_id=...`
- `POST /api/adoption/nodes/{node_id}/clone`

Remote bootstrap APIs:

- `GET /api/bootstrap/status`
- `POST /api/bootstrap/claim`
- `POST /api/bootstrap/finalize`
- `POST /api/bootstrap/tokens/issue`
- `POST /api/bootstrap/tokens/verify`

## Readiness Interpretation

Promotion should stop when readiness is `blocked`.

Typical blocking causes:

- version mismatch
- hostname conflict
- missing management API URL
- AVB explicitly disabled when AVB capability is expected
- PTP reporting a failure state

Typical warning-only causes:

- PTP not locked yet
- runtime role not recorded yet
- API known but node not currently visible

## Troubleshooting

### Candidate Never Appears

Check:

- `/api/peers`
- `/api/cluster/discovered`
- `/api/adoption/candidates`

Likely causes:

- mDNS visibility failure
- management IP reachability failure
- remote backend not running

### Claim Fails

Pairing-code path:

- the code expired
- the code was already consumed
- the wrong code was entered

Token path:

- the bootstrap token expired
- the issuer callback was unreachable
- the token target did not match the remote node identity

Check:

- `/api/bootstrap/status`
- `/api/bootstrap/tokens/verify`
- backend logs for `Remote bootstrap claim failed` or token verification failures

### Adopt Fails

Likely causes:

- remote claim finalization failed
- registry write failed
- the candidate is still `candidate` instead of `claimable`

Check:

- `/api/adoption/candidates/{candidate_id}`
- `/api/adoption/candidates/{candidate_id}/readiness`

### Promotion Fails

Likely causes:

- readiness is still `blocked`
- cloned settings introduced a new mismatch
- AVB/PTP prerequisites are not actually satisfied

Check:

- `/api/adoption/candidates/{candidate_id}/readiness`
- `/api/audio/source-of-truth`
- `/api/avb/status`

### Clone Preview Or Apply Fails

Likely causes:

- the clone source has no usable API URL
- the target node is not yet adopted
- the source or target remote API request failed
- the selected clone group contains no valid values

Check:

- `GET /api/adoption/nodes/{node_id}/clone/sources`
- `GET /api/adoption/nodes/{node_id}/clone/preview?source_node_id=...`
- `/api/deployment/mode`
- `/api/runtime-profiles/status`
- `/api/audio/source-of-truth`
- `/api/avb/status`

## Engineering Rules

- Never let features infer trust from discovery alone.
- Never use hostname as the durable primary identity.
- Keep cloneable settings explicitly bounded to non-identity data.
- Keep new nodes in standby until readiness is re-evaluated after every material configuration change.
- If a future subsystem wants to participate in node adoption, it should hook into the shared lifecycle instead of creating its own onboarding state machine.

## Focused Validation

Current focused validation commands for this workflow:

```bash
python3 -m py_compile \
  app/services/cluster/adoption.py \
  app/routes/adoption.py \
  app/services/cluster/adoption_bootstrap.py \
  app/routes/bootstrap.py

pytest -q \
  tests/test_bootstrap_routes.py \
  tests/test_adoption_routes.py \
  tests/test_peer_discovery_routes.py \
  tests/test_cluster_visibility_routes.py \
  tests/test_avb_router_map2.py

npm --prefix web run typecheck

npm --prefix web test -- --runInBand \
  web/src/app/pages/HomePage.test.tsx \
  web/src/app/contexts/ClusterContext.test.tsx
```

## Summary Rule

If an operator asks, "The node is visible. Why is it not usable yet?", the answer is usually:

The node has been discovered, but it has not yet completed trust bootstrap, adoption, readiness validation, and explicit activation.
