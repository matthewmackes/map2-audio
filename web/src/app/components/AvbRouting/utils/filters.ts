import type { AvbNode, Endpoint, StreamDirection } from '../types';
import type { FilterState } from '../types/state';
import { FILTER_QUALITY_OPTIONS, type FilterQuality } from '../types/state';
import { resolveAvbHostLabel } from './avbHost';
import { hasEndpointOperationalIssue } from './endpointIssues';

export const FILTER_DEVICE_TYPE_OPTIONS = ['map2', 'avdecc', 'unknown'] as const;
export const FILTER_DIRECTION_OPTIONS = ['talker', 'listener'] as const;

type EndpointIssueNodeLookup = Record<string, Pick<AvbNode, 'status'> | undefined>;

function uniqueSortedNumberValues(values: number[]): number[] {
  return Array.from(new Set(values.filter((value) => Number.isFinite(value)))).sort((a, b) => a - b);
}

function uniqueSortedStringValues(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))
  ).sort((a, b) => a.localeCompare(b));
}

function uniqueSortedEnumValues<T extends string>(
  values: T[],
  allowedValues: readonly T[]
): T[] {
  const allowedSet = new Set<string>(allowedValues);
  const rank = new Map<string, number>(allowedValues.map((value, index) => [value, index]));

  return Array.from(
    new Set(values.filter((value) => allowedSet.has(value)))
  ).sort((a, b) => (rank.get(a) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b) ?? Number.MAX_SAFE_INTEGER));
}

function arraysEqual<T>(left: T[], right: T[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) {
      return false;
    }
  }

  return true;
}

export function normalizeFilterState(filters: FilterState): FilterState {
  return {
    deviceTypes: uniqueSortedEnumValues(filters.deviceTypes, FILTER_DEVICE_TYPE_OPTIONS),
    sampleRates: uniqueSortedNumberValues(filters.sampleRates),
    channelCounts: uniqueSortedNumberValues(filters.channelCounts),
    availableOnly: Boolean(filters.availableOnly),
    issuesOnly: Boolean(filters.issuesOnly),
    showLocked: filters.showLocked !== false,
    groups: uniqueSortedStringValues(filters.groups),
    hostIds: uniqueSortedStringValues(filters.hostIds).map((hostId) => hostId.toLowerCase()),
    directions: uniqueSortedEnumValues(filters.directions, FILTER_DIRECTION_OPTIONS),
    qualities: uniqueSortedEnumValues(filters.qualities, FILTER_QUALITY_OPTIONS),
  };
}

export function mergeFilterState(
  currentFilters: FilterState,
  patch: Partial<FilterState>
): FilterState {
  return normalizeFilterState({
    ...currentFilters,
    ...patch,
  });
}

export function areFiltersEqual(left: FilterState, right: FilterState): boolean {
  const normalizedLeft = normalizeFilterState(left);
  const normalizedRight = normalizeFilterState(right);

  return (
    arraysEqual(normalizedLeft.deviceTypes, normalizedRight.deviceTypes)
    && arraysEqual(normalizedLeft.sampleRates, normalizedRight.sampleRates)
    && arraysEqual(normalizedLeft.channelCounts, normalizedRight.channelCounts)
    && normalizedLeft.availableOnly === normalizedRight.availableOnly
    && normalizedLeft.issuesOnly === normalizedRight.issuesOnly
    && normalizedLeft.showLocked === normalizedRight.showLocked
    && arraysEqual(normalizedLeft.groups, normalizedRight.groups)
    && arraysEqual(normalizedLeft.hostIds, normalizedRight.hostIds)
    && arraysEqual(normalizedLeft.directions, normalizedRight.directions)
    && arraysEqual(normalizedLeft.qualities, normalizedRight.qualities)
  );
}

export function countActiveFilters(
  filters: FilterState,
  defaultFilters: FilterState
): number {
  const normalizedFilters = normalizeFilterState(filters);
  const normalizedDefaults = normalizeFilterState(defaultFilters);

  return [
    !arraysEqual(normalizedFilters.deviceTypes, normalizedDefaults.deviceTypes),
    !arraysEqual(normalizedFilters.sampleRates, normalizedDefaults.sampleRates),
    !arraysEqual(normalizedFilters.channelCounts, normalizedDefaults.channelCounts),
    normalizedFilters.availableOnly !== normalizedDefaults.availableOnly,
    normalizedFilters.issuesOnly !== normalizedDefaults.issuesOnly,
    normalizedFilters.showLocked !== normalizedDefaults.showLocked,
    !arraysEqual(normalizedFilters.groups, normalizedDefaults.groups),
    !arraysEqual(normalizedFilters.hostIds, normalizedDefaults.hostIds),
    !arraysEqual(normalizedFilters.directions, normalizedDefaults.directions),
    !arraysEqual(normalizedFilters.qualities, normalizedDefaults.qualities),
  ].filter(Boolean).length;
}

export function resolveEndpointHostId(
  endpoint: Pick<Endpoint, 'host' | 'node_address' | 'node_id'>
): string | null {
  const hostFromEndpoint = resolveAvbHostLabel(endpoint).trim().toLowerCase();
  if (hostFromEndpoint) {
    return hostFromEndpoint;
  }

  const fallbackNodeId = typeof endpoint.node_id === 'string'
    ? endpoint.node_id.trim().toLowerCase()
    : '';
  if (fallbackNodeId) {
    return fallbackNodeId;
  }

  return null;
}

export function getEndpointQuality(
  endpoint: Pick<Endpoint, 'available' | 'node_id'>,
  nodes: EndpointIssueNodeLookup
): FilterQuality {
  const nodeStatus = nodes[endpoint.node_id]?.status;
  if (!endpoint.available || nodeStatus === 'offline') {
    return 'critical';
  }
  if (nodeStatus === 'degraded') {
    return 'warning';
  }
  return 'healthy';
}

export function applyEndpointFilters(
  endpoints: Endpoint[],
  filters: FilterState,
  nodes: EndpointIssueNodeLookup,
  direction?: StreamDirection
): Endpoint[] {
  const normalizedFilters = normalizeFilterState(filters);

  const selectedDeviceTypes = new Set(normalizedFilters.deviceTypes);
  const selectedSampleRates = new Set(normalizedFilters.sampleRates);
  const selectedChannelCounts = new Set(normalizedFilters.channelCounts);
  const selectedGroups = new Set(normalizedFilters.groups);
  const selectedHosts = new Set(normalizedFilters.hostIds);
  const selectedDirections = new Set(normalizedFilters.directions);
  const selectedQualities = new Set(normalizedFilters.qualities);

  return endpoints.filter((endpoint) => {
    if (direction && endpoint.direction !== direction) {
      return false;
    }

    if (selectedDirections.size > 0 && !selectedDirections.has(endpoint.direction)) {
      return false;
    }

    if (selectedDeviceTypes.size > 0 && !selectedDeviceTypes.has(endpoint.device_type)) {
      return false;
    }

    if (selectedSampleRates.size > 0 && !selectedSampleRates.has(endpoint.sample_rate)) {
      return false;
    }

    if (selectedChannelCounts.size > 0 && !selectedChannelCounts.has(endpoint.channels)) {
      return false;
    }

    if (normalizedFilters.availableOnly && !endpoint.available) {
      return false;
    }

    if (normalizedFilters.issuesOnly && !hasEndpointOperationalIssue(endpoint, nodes)) {
      return false;
    }

    if (!normalizedFilters.showLocked && endpoint.locked) {
      return false;
    }

    if (selectedGroups.size > 0 && !selectedGroups.has(endpoint.group)) {
      return false;
    }

    if (selectedHosts.size > 0) {
      const hostId = resolveEndpointHostId(endpoint);
      if (!hostId || !selectedHosts.has(hostId)) {
        return false;
      }
    }

    if (selectedQualities.size > 0) {
      const quality = getEndpointQuality(endpoint, nodes);
      if (!selectedQualities.has(quality)) {
        return false;
      }
    }

    return true;
  });
}
