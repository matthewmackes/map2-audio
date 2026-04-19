import type { Route } from '../types';
import type { AvbStreamPayload } from '../types';

type ParsedEndpointId = {
  entityId: string;
  uniqueId: string;
};

function parseEndpointId(endpointId: string): ParsedEndpointId | null {
  const separatorIndex = endpointId.indexOf(':');

  if (separatorIndex <= 0 || separatorIndex === endpointId.length - 1) {
    return null;
  }

  return {
    entityId: endpointId.slice(0, separatorIndex),
    uniqueId: endpointId.slice(separatorIndex + 1),
  };
}

function toMap2StreamId(
  source: ParsedEndpointId,
  destination: ParsedEndpointId,
  direction: 'talker' | 'listener'
): string {
  return `map2-${direction}-${source.entityId}-${source.uniqueId}-${destination.entityId}-${destination.uniqueId}`;
}

/**
 * Returns all likely stream IDs for a route in the legacy AVB stream ID format.
 *
 * The service layer provisions two MAP2 streams for MAP2-to-MAP2 routes:
 *  - talker side with direction=talker
 *  - listener side with direction=listener
 */
export function getRouteExpectedStreamIds(route: Route): string[] {
  const talker = parseEndpointId(route.talker_id);
  const listener = parseEndpointId(route.listener_id);

  if (!talker || !listener) {
    return [];
  }

  const candidateIds = new Set<string>([
    toMap2StreamId(talker, listener, 'talker'),
    toMap2StreamId(talker, listener, 'listener'),
  ]);

  return Array.from(candidateIds);
}

/**
 * Resolve stream payloads that are likely associated with a routing connection.
 *
 * Includes direct stream_id matches for completeness in case backend payload
 * schemas diverge from expected MAP2 stream naming.
 */
export function getRouteStreams(route: Route, streams: AvbStreamPayload[]): AvbStreamPayload[] {
  if (!route || !streams || streams.length === 0) {
    return [];
  }

  const candidateIds = new Set<string>([route.id, ...getRouteExpectedStreamIds(route)]);
  const routeEndpointIds = new Set<string>([route.talker_id, route.listener_id]);
  return streams.filter((stream) => {
    if (candidateIds.has(stream.stream_id)) {
      return true;
    }

    const streamEndpointIds = new Set<string>([
      ...getOwnershipEndpointIds(stream),
      ...getMap2StreamEndpointIds(stream.stream_id),
    ]);
    if (streamEndpointIds.size === 0) {
      return false;
    }

    return Array.from(routeEndpointIds).every((endpointId) => streamEndpointIds.has(endpointId));
  });
}

/**
 * Extract endpoint IDs from map2 stream ids (directional stream name style).
 *
 * Example: map2-talker-<entity>-<uid>-<entity>-<uid>
 */
export function getMap2StreamEndpointIds(streamId: string): string[] {
  if (!streamId) {
    return [];
  }

  const match = /^map2-(?:talker|listener)-([^:]+)-([^:-]+)-([^:]+)-([^:-]+)$/.exec(streamId);
  if (!match) {
    return [];
  }

  const sourceEntity = match[1];
  const sourceUniqueId = match[2];
  const destinationEntity = match[3];
  const destinationUniqueId = match[4];

  if (!sourceEntity || !sourceUniqueId || !destinationEntity || !destinationUniqueId) {
    return [];
  }

  return [
    `${sourceEntity}:${sourceUniqueId}`,
    `${destinationEntity}:${destinationUniqueId}`,
  ];
}

function getOwnershipEndpointIds(stream: AvbStreamPayload): string[] {
  const ownership = stream.ownership;
  if (!ownership) {
    return [];
  }

  const explicitEndpointIds = Array.isArray(ownership.endpoint_ids)
    ? ownership.endpoint_ids
    : [];
  const fallbackEndpointIds = [
    ownership.owner_endpoint_id,
    ownership.peer_endpoint_id,
    ownership.talker_endpoint_id,
    ownership.listener_endpoint_id,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);

  return Array.from(new Set([...explicitEndpointIds, ...fallbackEndpointIds]));
}
