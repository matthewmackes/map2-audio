import type {
  AvbStreamDiagnostics,
  AvbStreamOwnership,
  AvbStreamPayload,
  DeviceType,
  EndpointApiPayload,
  EndpointsResponse,
  StreamDirection,
} from '../types';
import { parseHostFromNodeAddress } from './avbHost';

const LEGACY_FIELD_ALIASES: Record<string, string[]> = {
  endpoint_id: ['endpointId'],
  entity_id: ['entityId'],
  unique_id: ['uniqueId'],
  device_type: ['deviceType'],
  device_name: ['deviceName', 'name'],
  sample_rate: ['sampleRate'],
  mac_address: ['macAddress'],
  node_address: ['nodeAddress'],
  node_id: ['nodeId'],
  last_seen: ['lastSeen'],
};

const STREAM_OWNERSHIP_FIELD_ALIASES: Record<string, string[]> = {
  owner_node_id: ['ownerNodeId'],
  peer_node_id: ['peerNodeId'],
  owner_endpoint_id: ['ownerEndpointId'],
  peer_endpoint_id: ['peerEndpointId'],
  talker_node_id: ['talkerNodeId'],
  listener_node_id: ['listenerNodeId'],
  talker_endpoint_id: ['talkerEndpointId'],
  listener_endpoint_id: ['listenerEndpointId'],
  node_ids: ['nodeIds'],
  endpoint_ids: ['endpointIds'],
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return {};
  }
  return value as Record<string, unknown>;
}

function readWithAliases(
  record: Record<string, unknown>,
  canonical: string,
  aliasesByCanonical: Record<string, string[]> = LEGACY_FIELD_ALIASES
): unknown {
  if (canonical in record) {
    return record[canonical];
  }

  const aliases = aliasesByCanonical[canonical] || [];
  for (const alias of aliases) {
    if (alias in record) {
      return record[alias];
    }
  }

  return undefined;
}

function toOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = String(value).trim();
  return parsed.length > 0 ? parsed : null;
}

function toString(value: unknown, fallback: string): string {
  const parsed = toOptionalString(value);
  return parsed ?? fallback;
}

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function toNonNegativeInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function toBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
}

function toNormalizedStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const values = value
    .map((item) => toOptionalString(item))
    .filter((item): item is string => item !== null);

  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function normalizeDirection(value: unknown): StreamDirection {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'talker' ? 'talker' : 'listener';
}

function normalizeDeviceType(value: unknown): DeviceType {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'map2' || normalized === 'avdecc') {
    return normalized;
  }
  return 'unknown';
}

function parseEndpointIdParts(endpointId: string): { entityId: string; uniqueId: number } {
  const [entityIdPart, uniqueIdPart] = endpointId.split(':', 2);
  const entityId = (entityIdPart || '').trim() || '0000000000000000';
  const uniqueId = toNonNegativeInt(uniqueIdPart, 0);
  return { entityId, uniqueId };
}

export function normalizeEndpointPayload(rawEndpoint: unknown): EndpointApiPayload {
  const endpoint = asRecord(rawEndpoint);
  const endpointId = toString(readWithAliases(endpoint, 'endpoint_id'), 'unknown:0');
  const parsedId = parseEndpointIdParts(endpointId);

  const nodeAddress = toOptionalString(readWithAliases(endpoint, 'node_address'));
  const parsedHost = parseHostFromNodeAddress(nodeAddress);
  const host = toString(readWithAliases(endpoint, 'host'), parsedHost);
  const nodeIdFallback = host || 'local';

  const normalized: EndpointApiPayload = {
    endpoint_id: endpointId,
    entity_id: toString(readWithAliases(endpoint, 'entity_id'), parsedId.entityId),
    unique_id: toNonNegativeInt(readWithAliases(endpoint, 'unique_id'), parsedId.uniqueId),
    direction: normalizeDirection(readWithAliases(endpoint, 'direction')),
    device_type: normalizeDeviceType(readWithAliases(endpoint, 'device_type')),
    device_name: toString(readWithAliases(endpoint, 'device_name'), endpointId),
    channels: toPositiveInt(readWithAliases(endpoint, 'channels'), 2),
    sample_rate: toPositiveInt(readWithAliases(endpoint, 'sample_rate'), 48000),
    format: toString(readWithAliases(endpoint, 'format'), '24-bit PCM'),
    mac_address: toOptionalString(readWithAliases(endpoint, 'mac_address')),
    node_address: nodeAddress,
    host: host || undefined,
    available: toBool(readWithAliases(endpoint, 'available'), true),
    last_seen: toString(readWithAliases(endpoint, 'last_seen'), new Date(0).toISOString()),
    node_id: toString(readWithAliases(endpoint, 'node_id'), nodeIdFallback),
  };

  return normalized;
}

export function normalizeEndpointsResponse(rawResponse: unknown): EndpointsResponse {
  const response = asRecord(rawResponse);
  const rawEndpoints = Array.isArray(response.endpoints) ? response.endpoints : [];
  const endpoints = rawEndpoints.map((endpoint) => normalizeEndpointPayload(endpoint));
  const count = toNonNegativeInt(response.count, endpoints.length);

  return {
    endpoints,
    count,
  };
}

function toTransportStats(raw: unknown): AvbStreamDiagnostics['transport'] {
  const obj = asRecord(raw);
  if (Object.keys(obj).length === 0) return undefined;
  const read = (key: string, fallback = 0): number => toNonNegativeInt(readWithAliases(obj, key), fallback);
  return {
    frames_sent: read('frames_sent'),
    frames_received: read('frames_received'),
    send_errors: read('send_errors'),
    receive_errors: read('receive_errors'),
    underruns: read('underruns'),
    overruns: read('overruns'),
    timestamp_errors: read('timestamp_errors'),
    sequence_errors: read('sequence_errors'),
    sequence_gap_events: read('sequence_gap_events'),
    timestamp_skew_events: read('timestamp_skew_events'),
    decode_errors: read('decode_errors'),
    max_timestamp_skew_ns: read('max_timestamp_skew_ns'),
    bytes_transferred: read('bytes_transferred'),
    max_latency_ns: read('max_latency_ns'),
    min_latency_ns: read('min_latency_ns'),
  };
}

function normalizeStreamOwnership(stream: Record<string, unknown>): AvbStreamOwnership | undefined {
  const ownership = asRecord(stream.ownership);
  const readOwnershipField = (fieldName: string): unknown => {
    const nested = readWithAliases(ownership, fieldName, STREAM_OWNERSHIP_FIELD_ALIASES);
    if (nested !== undefined) {
      return nested;
    }
    return readWithAliases(stream, fieldName, STREAM_OWNERSHIP_FIELD_ALIASES);
  };

  const ownerNodeId = toOptionalString(readOwnershipField('owner_node_id'));
  const peerNodeId = toOptionalString(readOwnershipField('peer_node_id'));
  const ownerEndpointId = toOptionalString(readOwnershipField('owner_endpoint_id'));
  const peerEndpointId = toOptionalString(readOwnershipField('peer_endpoint_id'));
  const talkerNodeId = toOptionalString(readOwnershipField('talker_node_id'));
  const listenerNodeId = toOptionalString(readOwnershipField('listener_node_id'));
  const talkerEndpointId = toOptionalString(readOwnershipField('talker_endpoint_id'));
  const listenerEndpointId = toOptionalString(readOwnershipField('listener_endpoint_id'));

  const nodeIds = toNormalizedStringArray(readOwnershipField('node_ids'));
  const endpointIds = toNormalizedStringArray(readOwnershipField('endpoint_ids'));

  const hasOwnership =
    ownerNodeId !== null ||
    peerNodeId !== null ||
    ownerEndpointId !== null ||
    peerEndpointId !== null ||
    talkerNodeId !== null ||
    listenerNodeId !== null ||
    talkerEndpointId !== null ||
    listenerEndpointId !== null ||
    nodeIds.length > 0 ||
    endpointIds.length > 0;

  if (!hasOwnership) {
    return undefined;
  }

  const inferredNodeIds = Array.from(
    new Set([ownerNodeId, peerNodeId, talkerNodeId, listenerNodeId].filter((value): value is string => Boolean(value)))
  ).sort((a, b) => a.localeCompare(b));
  const inferredEndpointIds = Array.from(
    new Set(
      [ownerEndpointId, peerEndpointId, talkerEndpointId, listenerEndpointId].filter(
        (value): value is string => Boolean(value)
      )
    )
  ).sort((a, b) => a.localeCompare(b));

  return {
    owner_node_id: ownerNodeId,
    peer_node_id: peerNodeId,
    owner_endpoint_id: ownerEndpointId,
    peer_endpoint_id: peerEndpointId,
    talker_node_id: talkerNodeId,
    listener_node_id: listenerNodeId,
    talker_endpoint_id: talkerEndpointId,
    listener_endpoint_id: listenerEndpointId,
    node_ids: nodeIds.length > 0 ? nodeIds : inferredNodeIds,
    endpoint_ids: endpointIds.length > 0 ? endpointIds : inferredEndpointIds,
  };
}

export function normalizeStreamPayload(rawStream: unknown): AvbStreamPayload {
  const stream = asRecord(rawStream);
  const normalized: AvbStreamPayload = { ...(stream as Partial<AvbStreamPayload>) } as AvbStreamPayload;

  const ownership = normalizeStreamOwnership(stream);
  if (ownership) {
    normalized.ownership = ownership;
  }

  if (stream.stats) {
    normalized.stats = toTransportStats(stream.stats);
  }
  if (stream.diagnostics && typeof stream.diagnostics === 'object') {
    const diag = asRecord(stream.diagnostics);
    const transport = toTransportStats(diag.transport);
    normalized.diagnostics = { ...diag, transport } as AvbStreamDiagnostics;
  }
  return normalized;
}
