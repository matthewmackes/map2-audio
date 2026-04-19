import type * as Api from '../api'
import type {
  AvbAvdeccEntitiesResponse,
  AvbAvdeccEntity,
  AvbAvdeccStats,
  AvbChannelCapabilitiesResponse,
  AvbDevicesResponse,
  AvbStreamDiagnostics,
  AvbStreamPayload,
  AvbStreamsResponse,
  EndpointsResponse,
  RoutingMatrixResponse,
  StreamDirection,
} from '../../app/components/AvbRouting/types'
import { safeFetchJson } from '../../app/components/AvbRouting/utils/safeJsonFetch'
import { appendAvbNodeQuery, appendQueryParams } from '../http'
import { API_BASE } from '../transport'

const AVB_API_BASE = `${API_BASE}/avb`
const AVB_CLUSTER_NODE_ID = 'all'

function extractAvbRemediationHint(detailObj: Record<string, unknown>): string | null {
  const remediation = detailObj.remediation

  if (typeof remediation === 'string' && remediation.trim()) {
    return remediation.trim()
  }

  if (Array.isArray(remediation)) {
    const firstHint = remediation.find(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    )
    if (firstHint) {
      return firstHint.trim()
    }
  }

  return null
}

function appendAvbRemediation(message: string, remediationHint: string | null): string {
  if (!remediationHint) {
    return message
  }

  const normalizedMessage = message.toLowerCase()
  const normalizedHint = remediationHint.toLowerCase()
  if (normalizedMessage.includes(normalizedHint)) {
    return message
  }

  const separator = message.endsWith('.') ? '' : '.'
  return `${message}${separator} Remediation: ${remediationHint}`
}

function extractAvbErrorMessage(errorData: unknown, fallback: string): string {
  if (typeof errorData === 'string' && errorData.trim()) {
    return errorData
  }

  if (errorData && typeof errorData === 'object') {
    const payload = errorData as Record<string, unknown>

    const directError = payload.error
    if (typeof directError === 'string' && directError.trim()) {
      return directError
    }

    const detail = payload.detail
    if (typeof detail === 'string' && detail.trim()) {
      return detail
    }

    if (detail && typeof detail === 'object') {
      const detailObj = detail as Record<string, unknown>
      const code = typeof detailObj.code === 'string' ? detailObj.code : null
      const message = typeof detailObj.message === 'string' ? detailObj.message : null
      const reason = typeof detailObj.reason === 'string' ? detailObj.reason : null
      const remediationHint = extractAvbRemediationHint(detailObj)

      if (message && code) {
        return appendAvbRemediation(`${message} (${code})`, remediationHint)
      }
      if (message) {
        return appendAvbRemediation(message, remediationHint)
      }
      if (reason && code) {
        return appendAvbRemediation(`${reason} (${code})`, remediationHint)
      }
      if (reason) {
        return appendAvbRemediation(reason, remediationHint)
      }
      if (code) {
        return appendAvbRemediation(code, remediationHint)
      }
    }
  }

  return fallback
}

export const avbApi = {
  getStatus: (nodeId?: string | null) =>
    safeFetchJson<Api.AvbStatusResponse>(appendAvbNodeQuery(`${AVB_API_BASE}/status`, nodeId), undefined, {
      fallbackError: 'Failed to fetch AVB status',
    }),

  getPtpStatus: (nodeId?: string | null) =>
    safeFetchJson<Api.AvbPtpStatusResponse>(appendAvbNodeQuery(`${AVB_API_BASE}/ptp/status`, nodeId), undefined, {
      fallbackError: 'Failed to fetch AVB PTP status',
    }),

  getDiscovery: (nodeId?: string | null) =>
    safeFetchJson<Api.AvbDiscoverySummaryResponse>(appendAvbNodeQuery(`${AVB_API_BASE}/discovery`, nodeId), undefined, {
      fallbackError: 'Failed to fetch AVB discovery summary',
    }),

  getDiscoveredNodes: (nodeId?: string | null) =>
    safeFetchJson<Api.AvbDiscoveryNodesResponse>(appendAvbNodeQuery(`${AVB_API_BASE}/discovery/nodes`, nodeId), undefined, {
      fallbackError: 'Failed to fetch discovered AVB nodes',
    }),

  getDiscoveredNode: (discoveredNodeId: string, nodeId?: string | null) =>
    safeFetchJson<Api.AvbDiscoveryNodePayload>(
      appendAvbNodeQuery(`${AVB_API_BASE}/discovery/nodes/${encodeURIComponent(discoveredNodeId)}`, nodeId),
      undefined,
      { fallbackError: `Failed to fetch node ${discoveredNodeId}` },
    ),

  getEndpoints: (direction?: StreamDirection, nodeId?: string | null) =>
    safeFetchJson<EndpointsResponse>(
      appendAvbNodeQuery(appendQueryParams(`${AVB_API_BASE}/router/endpoints`, { direction }), nodeId),
      undefined,
      { fallbackError: 'Failed to fetch endpoints' },
    ),

  getClusterEndpoints: (direction?: StreamDirection) =>
    safeFetchJson<Api.AvbClusterFanoutResponse<EndpointsResponse>>(
      appendAvbNodeQuery(appendQueryParams(`${AVB_API_BASE}/router/endpoints`, { direction }), AVB_CLUSTER_NODE_ID),
      undefined,
      { fallbackError: 'Failed to fetch endpoints' },
    ),

  getConnections: (nodeId?: string | null) =>
    safeFetchJson<Api.AvbRouterConnectionsResponse>(appendAvbNodeQuery(`${AVB_API_BASE}/router/connections`, nodeId), undefined, {
      fallbackError: 'Failed to fetch connections',
    }),

  getClusterConnections: () =>
    safeFetchJson<Api.AvbClusterFanoutResponse<Api.AvbRouterConnectionsResponse>>(
      appendAvbNodeQuery(`${AVB_API_BASE}/router/connections`, AVB_CLUSTER_NODE_ID),
      undefined,
      { fallbackError: 'Failed to fetch connections' },
    ),

  getRoutingMatrix: (nodeId?: string | null) =>
    safeFetchJson<RoutingMatrixResponse>(appendAvbNodeQuery(`${AVB_API_BASE}/router/matrix`, nodeId), undefined, {
      fallbackError: 'Failed to fetch routing matrix',
    }),

  getRouterStats: (nodeId?: string | null) =>
    safeFetchJson<Api.AvbRouterStatsResponse>(appendAvbNodeQuery(`${AVB_API_BASE}/router/stats`, nodeId), undefined, {
      fallbackError: 'Failed to fetch router stats',
    }),

  connect: (payload: Api.AvbRouterPatchRequest, nodeId?: string | null) =>
    safeFetchJson<Api.AvbRouterPatchResponse>(
      appendAvbNodeQuery(`${AVB_API_BASE}/router/connect`, nodeId),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      {
        fallbackError: 'Connection failed',
        errorMessageExtractor: extractAvbErrorMessage,
      },
    ),

  disconnect: (payload: Api.AvbRouterPatchRequest, nodeId?: string | null) =>
    safeFetchJson<Api.AvbRouterPatchResponse>(
      appendAvbNodeQuery(`${AVB_API_BASE}/router/disconnect`, nodeId),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
      {
        fallbackError: 'Disconnection failed',
        errorMessageExtractor: extractAvbErrorMessage,
      },
    ),

  getStreams: (nodeId?: string | null) =>
    safeFetchJson<AvbStreamsResponse>(appendAvbNodeQuery(`${AVB_API_BASE}/streams`, nodeId), undefined, {
      fallbackError: 'Failed to fetch AVB streams',
    }),

  getClusterStreams: () =>
    safeFetchJson<Api.AvbClusterFanoutResponse<AvbStreamsResponse>>(
      appendAvbNodeQuery(`${AVB_API_BASE}/streams`, AVB_CLUSTER_NODE_ID),
      undefined,
      { fallbackError: 'Failed to fetch AVB streams' },
    ),

  getStream: (streamId: string, nodeId?: string | null) =>
    safeFetchJson<AvbStreamPayload>(
      appendAvbNodeQuery(`${AVB_API_BASE}/streams/${encodeURIComponent(streamId)}`, nodeId),
      undefined,
      { fallbackError: `Failed to fetch AVB stream ${streamId}` },
    ),

  getStreamDiagnostics: (streamId: string, nodeId?: string | null) =>
    safeFetchJson<AvbStreamDiagnostics>(
      appendAvbNodeQuery(`${AVB_API_BASE}/streams/${encodeURIComponent(streamId)}/diagnostics`, nodeId),
      undefined,
      { fallbackError: `Failed to fetch AVB stream diagnostics for ${streamId}` },
    ),

  getStreamStats: (streamId: string, nodeId?: string | null) =>
    safeFetchJson<Record<string, unknown>>(
      appendAvbNodeQuery(`${AVB_API_BASE}/streams/${encodeURIComponent(streamId)}/stats`, nodeId),
      undefined,
      { fallbackError: `Failed to fetch AVB stream stats for ${streamId}` },
    ),

  getDevices: (nodeId?: string | null) =>
    safeFetchJson<AvbDevicesResponse>(appendAvbNodeQuery(`${AVB_API_BASE}/devices`, nodeId), undefined, {
      fallbackError: 'Failed to fetch AVB devices',
    }),

  getClusterDevices: () =>
    safeFetchJson<Api.AvbClusterFanoutResponse<AvbDevicesResponse>>(
      appendAvbNodeQuery(`${AVB_API_BASE}/devices`, AVB_CLUSTER_NODE_ID),
      undefined,
      { fallbackError: 'Failed to fetch AVB devices' },
    ),

  getChannelCapabilities: (nodeId?: string | null) =>
    safeFetchJson<AvbChannelCapabilitiesResponse>(
      appendAvbNodeQuery(`${AVB_API_BASE}/capabilities/channels`, nodeId),
      undefined,
      { fallbackError: 'Failed to fetch AVB channel capabilities' },
    ),

  getAvdeccEntities: (nodeId?: string | null) =>
    safeFetchJson<AvbAvdeccEntitiesResponse>(
      appendAvbNodeQuery(`${AVB_API_BASE}/avdecc/entities`, nodeId),
      undefined,
      { fallbackError: 'Failed to fetch AVDECC entities' },
    ),

  getClusterAvdeccEntities: () =>
    safeFetchJson<Api.AvbClusterFanoutResponse<AvbAvdeccEntitiesResponse>>(
      appendAvbNodeQuery(`${AVB_API_BASE}/avdecc/entities`, AVB_CLUSTER_NODE_ID),
      undefined,
      { fallbackError: 'Failed to fetch AVDECC entities' },
    ),

  getAvdeccEntity: (entityId: string, nodeId?: string | null) =>
    safeFetchJson<AvbAvdeccEntity>(
      appendAvbNodeQuery(`${AVB_API_BASE}/avdecc/entities/${encodeURIComponent(entityId)}`, nodeId),
      undefined,
      { fallbackError: `Failed to fetch AVDECC entity ${entityId}` },
    ),

  getAvdeccStats: (nodeId?: string | null) =>
    safeFetchJson<AvbAvdeccStats>(appendAvbNodeQuery(`${AVB_API_BASE}/avdecc/stats`, nodeId), undefined, {
      fallbackError: 'Failed to fetch AVDECC stats',
    }),
}
