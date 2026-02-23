# AVB Endpoint Canonical Schema

Canonical contract for AVB routing endpoints returned by `/api/avb/router/endpoints` and consumed by the web routing UI.

## Canonical Fields

- `endpoint_id` (string): stable endpoint key in `entity_id:unique_id` form.
- `entity_id` (string): stable AVB/AVDECC entity identifier.
- `unique_id` (number): endpoint stream index on the entity.
- `direction` (`talker` | `listener`): source/destination role.
- `device_type` (`map2` | `avdecc` | `unknown`): endpoint origin type.
- `device_name` (string): user-visible endpoint name.
- `channels` (number): channel count (>=1).
- `sample_rate` (number): sample rate in Hz (>=1).
- `format` (string): audio format label.
- `mac_address` (string | null): endpoint MAC when known.
- `node_address` (string | null): node API location when known.
- `host` (string, optional): parsed host hint for UI labeling/routing context.
- `node_id` (string): owning node identifier for multi-node routing.
- `available` (boolean): current discovery availability.
- `last_seen` (ISO-8601 string): latest discovery timestamp.

## Backward-Compatible Input Mapping

The web client accepts legacy camelCase aliases and normalizes them to canonical fields:

- `endpointId -> endpoint_id`
- `entityId -> entity_id`
- `uniqueId -> unique_id`
- `deviceType -> device_type`
- `deviceName -> device_name`
- `sampleRate -> sample_rate`
- `macAddress -> mac_address`
- `nodeAddress -> node_address`
- `nodeId -> node_id`
- `lastSeen -> last_seen`

## Runtime Fallback Rules (Web Normalizer)

- `host`: direct `host` field, else parsed from `node_address`.
- `node_id`: direct `node_id`/`nodeId`, else inferred from `host`, else `local`.
- `channels`: defaults to `2` if missing/invalid.
- `sample_rate`: defaults to `48000` if missing/invalid.
- `format`: defaults to `24-bit PCM` if missing.

## Implementation References

- Web normalizer: `web/src/app/components/AvbRouting/utils/endpointSchema.ts`
- Canonical field constants/types: `web/src/app/components/AvbRouting/types/endpoint.ts`

## Related Stream Ownership Contract

Node-scoped AVB health telemetry also relies on explicit ownership metadata in `/api/avb/streams` payloads:

- `ownership.owner_node_id` / `ownership.peer_node_id`
- `ownership.owner_endpoint_id` / `ownership.peer_endpoint_id`
- `ownership.talker_node_id` / `ownership.listener_node_id`
- `ownership.talker_endpoint_id` / `ownership.listener_endpoint_id`
- `ownership.node_ids` (sorted unique node list)
- `ownership.endpoint_ids` (sorted unique endpoint list)

Inspector node-context stream filtering is ownership-based and intentionally does not use global fallback heuristics when ownership does not match the active node scope.
