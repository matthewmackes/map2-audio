# MAP2 API Quality and Integration Surface Evaluation

## Executive assessment

MAP2 exposes a very large control plane and does generate an OpenAPI spec, but it is not yet an integration-grade API. The current surface is broad enough to power most of the product, yet it is inconsistent in style, weakly secured, under-documented on failures and events, and too RPC-heavy for serious third-party automation.

## Evidence baseline

This review uses the generated inventory from `scripts/generate_api_inventory.py` and the live FastAPI app state.

- OpenAPI paths: `1106`
- HTTP operations: `1227`
- WebSocket routes: `9`
- Source-inferred event/message types: `29`
- Duplicate operation-ID warnings: `5`
- Untagged HTTP operations: `14`
- Operations with documented responses only `200` + `422`: `688`
- Operations with documented response only `200`: `539`
- Operations with documented `500` response: `0`
- Operations with request examples: `0`
- Operations with response examples: `0`

Largest API domains by `/api/<subsystem>` operation count:

- `engine`: `188`
- `midi`: `123`
- `tesira`: `78`
- `cluster`: `71`
- `audio`: `45`
- `mpx1`: `45`
- `v2`: `41`
- `avb`: `37`

## What is genuinely good

- MAP2 does expose a live OpenAPI document instead of forcing integrators to reverse-engineer route files.
- Operation summary coverage is strong: the inventory found `0` operations missing a summary.
- Path-parameter naming is internally consistent: parameter names are snake_case and the inventory found `0` camelCase parameter names.
- The API already covers many serious domains, especially engine control, MIDI, Tesira, cluster management, AVB, and diagnostics.
- The `/api/v2/midi/*` surface shows that the codebase can support explicit versioning when discipline is applied.

## Major findings

### 1. The API is too RPC-heavy for a platform this large

The route inventory found `174` action-oriented paths such as:

- `POST /api/audio/start`
- `POST /api/audio/stop`
- `POST /api/audio/restart`
- `POST /api/avb/router/connect`
- `POST /api/avb/router/disconnect`
- `POST /api/cluster/nodes/{node_id}/reboot`
- `POST /api/cluster/update/validate`

This style is workable internally, but it scales poorly for external integrators. It makes idempotency, replay safety, capability discovery, and client generation harder than a more resource-oriented contract would.

### 2. Versioning is inconsistent

MAP2 does have a versioned island, but it is narrow. The live surface currently shows `35` unique versioned paths, almost entirely under `/api/v2/midi/*`, plus `/api/version`, while the other ~`1000+` paths remain unversioned.

That creates two incompatible integration stories inside one platform:

- one part of the API signals contract evolution explicitly
- most of the API has no version boundary at all

For serious integrations, that is not enough. A client cannot tell which contract is stable, experimental, or subject to silent breakage.

### 3. Error contracts are badly under-specified

The OpenAPI spec under-describes runtime failures.

- `688` operations advertise only `200` and FastAPI's automatic `422`
- `539` operations advertise only `200`
- `0` operations advertise a `500` response

But route code clearly raises many runtime errors. For example, [auth.py](/home/mm/map2-audio/app/routes/auth.py:80) raises `HTTPException(500, ...)`, and [tesira.py](/home/mm/map2-audio/app/routes/tesira.py:544) and nearby endpoints raise `502`, `503`, `409`, `404`, and `500` failures using ad-hoc `detail` strings.

The result is an API that may be operable by the web UI, but is hostile to external automation because failure handling cannot be modeled reliably from the published contract.

### 4. Authentication and authorization are not platform-grade

The generated inventory found `0` operations with an authorization header parameter in the OpenAPI contract. The only obvious authentication route in the reviewed surface is [auth.py](/home/mm/map2-audio/app/routes/auth.py:16), which exposes `/api/auth/special-backdoor` and falls back to the default password `backdoor` when `SPECIAL_MODE_PASSWORD` is unset.

That is not a real control-plane security model. There is no evidence here of a consistent API-wide authentication dependency, token scheme, or role-based authorization boundary. For a platform that exposes cluster management, device control, reboot/shutdown flows, and system mutation, this is a critical gap.

### 5. Eventing exists, but the event contract is not formalized

MAP2 does support push-style realtime behavior.

- WebSocket routes: `9`
- Source-inferred event/message types: `29`
- Representative event/message types: `meter_update`, `pipewire_metrics`, `mpx1:state`, `heartbeat`, `flow_snapshot_loaded`, `scan_complete`

That is useful, but the event surface is not documented like a first-class contract. The WebSocket routes are not described in OpenAPI, event payload schemas are not published, and there are no request or response examples to anchor client implementations. The inventory also found `0` subscribe-style REST paths, which means external clients must infer the realtime model from source or trial-and-error.

### 6. Documentation is present, but not integration-friendly

The spec is available, summaries are present, and tags exist for most operations, but the integration ergonomics are still weak.

- request examples: `0`
- response examples: `0`
- duplicate operation-ID warnings: `5`
- untagged operations: `14`

The duplicate operation-ID warnings are especially important because client generation often depends on stable unique operation identifiers. The current warnings are:

- `upload_nam_model_api_nam_upload_post`
- `list_snapshots_api_engine_snapshots_get`
- `get_node_health_api_cluster_health__node_id__get`
- `get_update_schedule_api_cluster_update_schedule_get`
- `get_update_history_api_cluster_update_history_get`

Even if the UI tolerates this, downstream SDK generators and API diff tooling often do not.

### 7. Bulk automation support is thin relative to surface area

The inventory found only a small number of explicit bulk or batch routes across the full platform.

- bulk routes: `5`
- batch routes: `2`

Examples include Tesira DSP bulk get/set, NAM bulk rename, plugin-tag bulk actions, and upload batch handling. That is not much for a `1227`-operation platform. Integrators trying to orchestrate many nodes, channels, presets, or control points will end up making chatty multi-call sequences that are harder to keep consistent.

## Integration-grade redesign priorities

### Immediate

- Introduce a mandatory API-wide authentication and authorization model.
- Remove the implicit `backdoor` fallback behavior from special-mode authentication.
- Standardize an error envelope and document non-`200` responses in OpenAPI.
- Eliminate duplicate operation-ID warnings so client generators get stable output.

### Near term

- Publish a first-class event contract for each WebSocket route: message types, payload schemas, cadence, and backpressure expectations.
- Move the broad unversioned control plane toward explicit contract versioning.
- Add request and response examples for the highest-value domains: engine, midi, tesira, cluster, avb.
- Reduce RPC-style verbs where resource/state endpoints would be clearer and more automatable.

### Structural

- Define a canonical external API surface distinct from internal UI convenience routes.
- Add bulk and transactional operations for common orchestration workflows.
- Establish stability tiers for endpoints so integrators can distinguish stable contracts from experimental surfaces.
- Generate SDK-safe contract artifacts as part of CI, with duplicate-ID, undocumented-error, and missing-example checks.

## Final verdict

MAP2's API is powerful, but it is still an internal-product control plane masquerading as a polished public integration surface. It has the breadth needed for serious automation, yet not the contract discipline, security model, failure modeling, or realtime documentation that serious integrators will expect.

In its current state, the API is useful for MAP2 itself and for expert operators willing to read source code. It is not yet a professional external platform contract.
