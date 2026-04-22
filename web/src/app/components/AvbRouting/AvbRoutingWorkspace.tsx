import './AvbRoutingWorkspace.css'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Dropdown,
  InlineLoading,
  InlineNotification,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableExpandHeader,
  TableExpandRow,
  TableExpandedRow,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Tag,
  Tile,
} from '@carbon/react'
import { Launch } from '@carbon/icons-react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { useCluster } from '../../contexts/useCluster'
import type { PlatformLayerData } from '../../platform/model'
import type { TesiraDeviceDetail, TesiraDeviceSummary } from '../Devices/Tesira/types'
import { useTesiraDevice, useTesiraDevices } from '../Devices/Tesira/hooks/useTesiraApi'
import {
  useAvbDevices,
  useAvbStreams,
  useAvdeccEntities,
  useConnections,
  useEndpoints,
} from './hooks/useAvbApi'
import { useNodes, usePtpStatus } from './hooks/useNodeApi'
import { LoadingState } from '../shared/LoadingState'
import { EmptyState } from '../shared/EmptyState'
import type {
  AvbAvdeccEntity,
  AvbNode,
  AvbStreamPayload,
  ConnectionsResponse,
  EndpointApiPayload,
} from './types'
import { buildAvbRoutingWorkspaceHref } from './avbRoutingWorkspaceHref'
import { PlatformGrafanaPanelDeck, type PlatformGrafanaPanelDefinition } from '../Platform/PlatformGrafanaPanel'
import { AvbRoutingWorkspaceGraph } from './AvbRoutingWorkspaceGraph'
import {
  buildAvbRoutingWorkspaceGraphModel,
  type AvbRoutingWorkspaceAnchorId,
  type AvbRoutingWorkspaceGraphSelection,
} from './avbRoutingWorkspaceGraph'
import { getMap2StreamEndpointIds } from './utils/avbRouteStreams'
import { sortNodesForNavigation } from './utils/nodeSorting'

type NodeOption = {
  id: string
  label: string
}

type ConnectionRecord = {
  id: string
  state: string
  talkerId: string
  listenerId: string
  talkerLabel: string
  listenerLabel: string
  sourceNodeId: string | null
  targetNodeId: string | null
  errorMessage: string | null
}

type NodeSummary = {
  node: AvbNode
  endpoints: EndpointApiPayload[]
  activeRoutes: ConnectionRecord[]
  talkerCount: number
  listenerCount: number
  streamCount: number
  tesiraDevices: TesiraDeviceSummary[]
  avdeccEntities: AvbAvdeccEntity[]
}

function normalizeNodeId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function normalizeEntityId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().toLowerCase().replace(/^0x/, '')
  return normalized ? normalized : null
}

function parseEntityIdFromEndpointId(endpointId: string | null | undefined): string | null {
  if (typeof endpointId !== 'string') {
    return null
  }

  const separatorIndex = endpointId.indexOf(':')
  if (separatorIndex <= 0) {
    return null
  }

  return normalizeEntityId(endpointId.slice(0, separatorIndex))
}

function nodeStatusTagType(node: AvbNode): 'green' | 'warm-gray' | 'red' | 'cool-gray' {
  if (node.status === 'offline') {
    return 'red'
  }

  if (node.status === 'degraded') {
    return 'warm-gray'
  }

  if (node.status === 'online') {
    return 'green'
  }

  return 'cool-gray'
}

function ptpTagType(state: string | null | undefined): 'green' | 'warm-gray' | 'red' | 'cool-gray' {
  const normalized = state?.toLowerCase() ?? 'unknown'
  if (normalized === 'master' || normalized === 'slave') {
    return 'green'
  }
  if (normalized === 'listening' || normalized === 'passive') {
    return 'warm-gray'
  }
  if (normalized === 'disabled') {
    return 'cool-gray'
  }
  return 'red'
}

function routeTagType(state: string): 'green' | 'warm-gray' | 'red' | 'cool-gray' {
  switch (state) {
    case 'connected':
      return 'green'
    case 'connecting':
      return 'warm-gray'
    case 'error':
      return 'red'
    default:
      return 'cool-gray'
  }
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return '—'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString()
}

function formatNodeContextLabel(nodeId: string | null | undefined, nodesById: Map<string, AvbNode>): string {
  if (!nodeId) {
    return 'Unknown node'
  }

  return nodesById.get(nodeId)?.name || nodeId
}

function streamNodeIds(stream: AvbStreamPayload, endpointNodeById: Map<string, string>): string[] {
  const explicitNodeIds = stream.ownership?.node_ids ?? []
  const fallbackNodeIds = [
    stream.ownership?.owner_node_id,
    stream.ownership?.peer_node_id,
    stream.ownership?.talker_node_id,
    stream.ownership?.listener_node_id,
  ].filter((nodeId): nodeId is string => typeof nodeId === 'string' && nodeId.length > 0)

  const nodeIds = [...explicitNodeIds, ...fallbackNodeIds]
  if (nodeIds.length > 0) {
    return Array.from(new Set(nodeIds))
  }

  return Array.from(new Set(
    getMap2StreamEndpointIds(stream.stream_id)
      .map((endpointId) => endpointNodeById.get(endpointId) ?? null)
      .filter((nodeId): nodeId is string => typeof nodeId === 'string' && nodeId.length > 0),
  ))
}

function buildConnectionRecords(
  connections: ConnectionsResponse['connections'],
  endpointNodeById: Map<string, string>,
  entityNodeById: Map<string, string>,
): ConnectionRecord[] {
  return connections.map((connection) => {
    const talkerId = connection.talker?.endpoint_id ?? ''
    const listenerId = connection.listener?.endpoint_id ?? ''
    const sourceNodeId = connection.talker?.node_id
      ?? endpointNodeById.get(talkerId)
      ?? entityNodeById.get(parseEntityIdFromEndpointId(talkerId) ?? '')
      ?? null
    const targetNodeId = connection.listener?.node_id
      ?? endpointNodeById.get(listenerId)
      ?? entityNodeById.get(parseEntityIdFromEndpointId(listenerId) ?? '')
      ?? null

    return {
      id: connection.connection_id || `${talkerId}→${listenerId}`,
      state: connection.state,
      talkerId,
      listenerId,
      talkerLabel: connection.talker?.device_name || talkerId || 'Unknown talker',
      listenerLabel: connection.listener?.device_name || listenerId || 'Unknown listener',
      sourceNodeId,
      targetNodeId,
      errorMessage: connection.error_message ?? null,
    }
  })
}

function queryErrorMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : null
}

function NodeDetailPanel({
  summary,
  nodesById,
  focusedTesiraDeviceId,
  focusedTesiraDetail,
  tesiraDetailLoading,
  tesiraDetailError,
  onSelectTesiraDevice,
  onAdoptNodeContext,
  onOpenTesiraRoute,
}: {
  summary: NodeSummary
  nodesById: Map<string, AvbNode>
  focusedTesiraDeviceId: string | null
  focusedTesiraDetail: TesiraDeviceDetail | null
  tesiraDetailLoading: boolean
  tesiraDetailError: string | null
  onSelectTesiraDevice: (deviceId: string) => void
  onAdoptNodeContext: (nodeId: string) => void
  onOpenTesiraRoute: (route: string) => void
}) {
  const focusedTesiraSummary = summary.tesiraDevices.find((device) => device.device_id === focusedTesiraDeviceId) ?? summary.tesiraDevices[0] ?? null
  const focusedTesiraBelongsToRow = Boolean(
    focusedTesiraSummary &&
      focusedTesiraDetail &&
      focusedTesiraDetail.device_id === focusedTesiraSummary.device_id,
  )

  return (
    <div className="avb-routing-workspace__expanded-row">
      <div className="avb-routing-workspace__expanded-grid">
        <article className="avb-routing-workspace__expanded-card">
          <div className="avb-routing-workspace__expanded-card-head">
            <h4>AVB node detail</h4>
            <Tag type={nodeStatusTagType(summary.node)}>{summary.node.status}</Tag>
          </div>
          <dl className="avb-routing-workspace__detail-list">
            <div>
              <dt>Address</dt>
              <dd>{summary.node.address}</dd>
            </div>
            <div>
              <dt>API</dt>
              <dd>{summary.node.api_url ?? 'Unavailable'}</dd>
            </div>
            <div>
              <dt>Entity</dt>
              <dd>{summary.node.entity_id ?? '—'}</dd>
            </div>
            <div>
              <dt>PTP</dt>
              <dd>{summary.node.ptp?.state ?? 'pending'}</dd>
            </div>
            <div>
              <dt>Offset</dt>
              <dd>{summary.node.ptp?.offset_ns != null ? `${summary.node.ptp.offset_ns} ns` : '—'}</dd>
            </div>
            <div>
              <dt>Last seen</dt>
              <dd>{formatTimestamp(summary.node.last_seen)}</dd>
            </div>
          </dl>
        </article>

        <article className="avb-routing-workspace__expanded-card">
          <div className="avb-routing-workspace__expanded-card-head">
            <h4>Transport inventory</h4>
            <Tag type="cool-gray">{summary.endpoints.length} endpoints</Tag>
          </div>
          <dl className="avb-routing-workspace__detail-list">
            <div>
              <dt>Talkers</dt>
              <dd>{summary.talkerCount}</dd>
            </div>
            <div>
              <dt>Listeners</dt>
              <dd>{summary.listenerCount}</dd>
            </div>
            <div>
              <dt>Streams</dt>
              <dd>{summary.streamCount}</dd>
            </div>
            <div>
              <dt>AVDECC</dt>
              <dd>{summary.avdeccEntities.length}</dd>
            </div>
            <div>
              <dt>Manufacturer</dt>
              <dd>{summary.node.manufacturer ?? '—'}</dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd>{summary.node.model ?? '—'}</dd>
            </div>
          </dl>
        </article>

        <article className="avb-routing-workspace__expanded-card">
          <div className="avb-routing-workspace__expanded-card-head">
            <h4>Active routes</h4>
            <Tag type={summary.activeRoutes.length > 0 ? 'green' : 'cool-gray'}>
              {summary.activeRoutes.length} routes
            </Tag>
          </div>
          {summary.activeRoutes.length === 0 ? (
            <EmptyState
              title="No active AVB routes touch this node"
              description="Select another AVB node or publish a route to populate this summary."
              compact
              align="left"
            />
          ) : (
            <div className="avb-routing-workspace__route-list">
              {summary.activeRoutes.slice(0, 6).map((route) => (
                <div key={route.id} className="avb-routing-workspace__route-card">
                  <div className="avb-routing-workspace__route-card-head">
                    <strong>{route.talkerLabel} → {route.listenerLabel}</strong>
                    <Tag type={routeTagType(route.state)} size="sm">{route.state}</Tag>
                  </div>
                  <p>
                    {formatNodeContextLabel(route.sourceNodeId, nodesById)} → {formatNodeContextLabel(route.targetNodeId, nodesById)}
                  </p>
                  {route.errorMessage ? <p>{route.errorMessage}</p> : null}
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="avb-routing-workspace__expanded-card">
          <div className="avb-routing-workspace__expanded-card-head">
            <h4>Tesira interface detail</h4>
            <Tag type={summary.tesiraDevices.length > 0 ? 'green' : 'cool-gray'}>
              {summary.tesiraDevices.length} devices
            </Tag>
          </div>

          {summary.tesiraDevices.length === 0 ? (
            <EmptyState
              title="No Tesira devices are bound to this AVB node"
              description="Bind a Tesira device to this node to inspect device-specific AVB routing details here."
              compact
              align="left"
            />
          ) : (
            <>
              <div className="avb-routing-workspace__tesira-chip-row">
                {summary.tesiraDevices.map((device) => (
                  <Button
                    key={device.device_id}
                    kind={device.device_id === focusedTesiraDeviceId ? 'primary' : 'ghost'}
                    size="sm"
                    onClick={() => onSelectTesiraDevice(device.device_id)}
                  >
                    {device.name || device.host}
                  </Button>
                ))}
              </div>

              {tesiraDetailLoading && focusedTesiraSummary ? (
                <div className="avb-routing-workspace__tesira-loading">
                  <InlineLoading description={`Loading ${focusedTesiraSummary.name || focusedTesiraSummary.host}`} />
                </div>
              ) : null}

              {tesiraDetailError && focusedTesiraSummary ? (
                <InlineNotification
                  kind="warning"
                  lowContrast
                  hideCloseButton
                  title="Tesira detail unavailable"
                  subtitle={tesiraDetailError}
                />
              ) : null}

              {focusedTesiraSummary ? (
                <dl className="avb-routing-workspace__detail-list">
                  <div>
                    <dt>Host</dt>
                    <dd>{focusedTesiraSummary.host}:{focusedTesiraSummary.port}</dd>
                  </div>
                  <div>
                    <dt>Connected</dt>
                    <dd>{focusedTesiraSummary.connected ? 'Yes' : 'No'}</dd>
                  </div>
                  <div>
                    <dt>PTP</dt>
                    <dd>{focusedTesiraBelongsToRow ? focusedTesiraDetail?.ptp_status.state ?? 'unknown' : focusedTesiraSummary.ptp_state ?? 'unknown'}</dd>
                  </div>
                  <div>
                    <dt>Offset</dt>
                    <dd>{focusedTesiraBelongsToRow && focusedTesiraDetail?.ptp_status.offset_ns != null ? `${focusedTesiraDetail.ptp_status.offset_ns} ns` : '—'}</dd>
                  </div>
                  <div>
                    <dt>AVB streams</dt>
                    <dd>{focusedTesiraBelongsToRow ? focusedTesiraDetail?.avb_streams.length ?? 0 : focusedTesiraSummary.avb_stream_count}</dd>
                  </div>
                  <div>
                    <dt>Discovery node</dt>
                    <dd>{focusedTesiraSummary.source_hostname ?? focusedTesiraSummary.source_node_id ?? '—'}</dd>
                  </div>
                </dl>
              ) : null}

              {focusedTesiraBelongsToRow && focusedTesiraDetail?.avb_streams.length ? (
                <div className="avb-routing-workspace__tesira-stream-list">
                  {focusedTesiraDetail.avb_streams.slice(0, 6).map((stream) => (
                    <div key={`${stream.stream_index}-${stream.direction}`} className="avb-routing-workspace__route-card">
                      <div className="avb-routing-workspace__route-card-head">
                        <strong>{stream.name}</strong>
                        <Tag type={stream.direction === 'talker' ? 'blue' : 'teal'} size="sm">{stream.direction}</Tag>
                      </div>
                      <p>{stream.channels} ch · entity {stream.entity_id || '—'}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </article>
      </div>

      <div className="avb-routing-workspace__expanded-actions">
        <Button kind="tertiary" size="sm" onClick={() => onAdoptNodeContext(summary.node.node_id)}>
          Use {summary.node.name} as cluster context
        </Button>
        {focusedTesiraSummary ? (
          <>
            <Button
              kind="ghost"
              size="sm"
              renderIcon={Launch}
              onClick={() => onOpenTesiraRoute(`/tesira/${focusedTesiraSummary.device_id}/dashboard`)}
            >
              Open Tesira dashboard
            </Button>
            <Button
              kind="ghost"
              size="sm"
              renderIcon={Launch}
              onClick={() => onOpenTesiraRoute(`/tesira/${focusedTesiraSummary.device_id}/avb`)}
            >
              Open Tesira AVB tab
            </Button>
          </>
        ) : null}
      </div>
    </div>
  )
}

export function AvbRoutingWorkspace({ layer }: { layer: PlatformLayerData }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { activeNodeId, nodes: clusterNodes, isClusterMode, localNodeId, setActiveNode } = useCluster()

  const nodesQuery = useNodes()
  const ptpStatusQuery = usePtpStatus()
  const endpointsQuery = useEndpoints()
  const connectionsQuery = useConnections()
  const streamsQuery = useAvbStreams()
  const avbDevicesQuery = useAvbDevices()
  const avdeccEntitiesQuery = useAvdeccEntities()
  const tesiraDevicesQuery = useTesiraDevices()

  const avbNodes = nodesQuery.data ?? []
  const endpoints = endpointsQuery.data?.endpoints ?? []
  const connections = connectionsQuery.data?.connections ?? []
  const streams = streamsQuery.data?.streams ?? []
  const avdeccEntities = avdeccEntitiesQuery.data?.entities ?? []
  const tesiraDevices = tesiraDevicesQuery.data ?? []

  const nodesById = useMemo(() => new Map(avbNodes.map((node) => [node.node_id, node])), [avbNodes])
  const endpointNodeById = useMemo(() => new Map(endpoints.map((endpoint) => [endpoint.endpoint_id, endpoint.node_id])), [endpoints])
  const entityNodeById = useMemo(() => {
    const next = new Map<string, string>()

    endpoints.forEach((endpoint) => {
      const entityId = normalizeEntityId(endpoint.entity_id)
      if (entityId) {
        next.set(entityId, endpoint.node_id)
      }
    })

    avdeccEntities.forEach((entity) => {
      const entityId = normalizeEntityId(entity.entity_id)
      if (entityId && entity.source_node_id) {
        next.set(entityId, entity.source_node_id)
      }
    })

    return next
  }, [avdeccEntities, endpoints])
  const tesiraDevicesByNodeId = useMemo(() => {
    const next: Record<string, TesiraDeviceSummary[]> = {}

    tesiraDevices.forEach((device) => {
      const nodeId = normalizeNodeId(device.source_node_id)
      if (!nodeId) {
        return
      }

      next[nodeId] = [...(next[nodeId] ?? []), device]
    })

    return next
  }, [tesiraDevices])

  const normalizedFocusTesiraDeviceId = normalizeNodeId(searchParams.get('focusTesiraDevice'))
  const normalizedFocusNodeId = normalizeNodeId(searchParams.get('focusNodeId'))
  const normalizedFocusEntityId = normalizeEntityId(searchParams.get('focusEntity'))

  const connectionRecords = useMemo(
    () => buildConnectionRecords(connections, endpointNodeById, entityNodeById),
    [connections, endpointNodeById, entityNodeById],
  )
  const activeConnectionRecords = useMemo(
    () => connectionRecords.filter((connection) => connection.state !== 'disconnected'),
    [connectionRecords],
  )

  const routeCountsByNode = useMemo(() => {
    const next = new Map<string, number>()

    activeConnectionRecords.forEach((connection) => {
      const nodeIds = [connection.sourceNodeId, connection.targetNodeId].filter((nodeId): nodeId is string => Boolean(nodeId))
      Array.from(new Set(nodeIds)).forEach((nodeId) => {
        next.set(nodeId, (next.get(nodeId) ?? 0) + 1)
      })
    })

    return next
  }, [activeConnectionRecords])

  const streamsByNode = useMemo(() => {
    const next = new Map<string, number>()

    streams.forEach((stream) => {
      streamNodeIds(stream, endpointNodeById).forEach((nodeId) => {
        next.set(nodeId, (next.get(nodeId) ?? 0) + 1)
      })
    })

    return next
  }, [endpointNodeById, streams])

  const aggregatedRouteEdges = useMemo(() => {
    const next = new Map<string, { sourceNodeId: string; targetNodeId: string; routeCount: number }>()

    activeConnectionRecords.forEach((connection) => {
      if (!connection.sourceNodeId || !connection.targetNodeId || connection.sourceNodeId === connection.targetNodeId) {
        return
      }

      const key = `${connection.sourceNodeId}:${connection.targetNodeId}`
      const existing = next.get(key)
      if (existing) {
        existing.routeCount += 1
        return
      }

      next.set(key, {
        sourceNodeId: connection.sourceNodeId,
        targetNodeId: connection.targetNodeId,
        routeCount: 1,
      })
    })

    return Array.from(next.values())
  }, [activeConnectionRecords])

  const summaryByNodeId = useMemo(() => {
    const next: Record<string, { endpointCount: number; routeCount: number; tesiraCount: number }> = {}

    avbNodes.forEach((node) => {
      next[node.node_id] = {
        endpointCount: endpoints.filter((endpoint) => endpoint.node_id === node.node_id).length,
        routeCount: routeCountsByNode.get(node.node_id) ?? 0,
        tesiraCount: tesiraDevicesByNodeId[node.node_id]?.length ?? 0,
      }
    })

    return next
  }, [avbNodes, endpoints, routeCountsByNode, tesiraDevicesByNodeId])

  const sortedNodes = useMemo(() => sortNodesForNavigation(avbNodes, localNodeId), [avbNodes, localNodeId])
  const nodeSummaries = useMemo<NodeSummary[]>(() => sortedNodes.map((node) => ({
    node,
    endpoints: endpoints.filter((endpoint) => endpoint.node_id === node.node_id),
    activeRoutes: activeConnectionRecords.filter((connection) => connection.sourceNodeId === node.node_id || connection.targetNodeId === node.node_id),
    talkerCount: endpoints.filter((endpoint) => endpoint.node_id === node.node_id && endpoint.direction === 'talker').length,
    listenerCount: endpoints.filter((endpoint) => endpoint.node_id === node.node_id && endpoint.direction === 'listener').length,
    streamCount: streamsByNode.get(node.node_id) ?? 0,
    tesiraDevices: tesiraDevicesByNodeId[node.node_id] ?? [],
    avdeccEntities: avdeccEntities.filter((entity) => entity.source_node_id === node.node_id),
  })), [activeConnectionRecords, avdeccEntities, endpoints, sortedNodes, streamsByNode, tesiraDevicesByNodeId])

  const focusNodeIdFromEntity = useMemo(() => {
    if (!normalizedFocusEntityId) {
      return null
    }

    return entityNodeById.get(normalizedFocusEntityId) ?? null
  }, [entityNodeById, normalizedFocusEntityId])

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedTesiraDeviceId, setSelectedTesiraDeviceId] = useState<string | null>(normalizedFocusTesiraDeviceId)
  const [expandedNodeIds, setExpandedNodeIds] = useState<Record<string, boolean>>({})
  const [searchValue, setSearchValue] = useState('')
  const [highlightedAnchorId, setHighlightedAnchorId] = useState<AvbRoutingWorkspaceAnchorId | null>(null)
  const initialFocusAppliedRef = useRef(false)

  useEffect(() => {
    if (initialFocusAppliedRef.current) {
      return
    }

    if (normalizedFocusTesiraDeviceId) {
      const focusedDevice = tesiraDevices.find((device) => device.device_id === normalizedFocusTesiraDeviceId)
      if (!focusedDevice) {
        return
      }

      const nextNodeId = normalizeNodeId(focusedDevice.source_node_id) ?? normalizedFocusNodeId ?? focusNodeIdFromEntity ?? localNodeId
      setSelectedTesiraDeviceId(focusedDevice.device_id)
      setSelectedNodeId(nextNodeId)
      setExpandedNodeIds((previous) => ({ ...previous, [nextNodeId]: true }))
      setActiveNode(nextNodeId === localNodeId ? null : nextNodeId)
      initialFocusAppliedRef.current = true
      return
    }

    const nextNodeId = normalizedFocusNodeId ?? focusNodeIdFromEntity ?? (activeNodeId && activeNodeId !== 'all' ? activeNodeId : localNodeId)
    if (!nextNodeId) {
      return
    }

    setSelectedNodeId(nextNodeId)
    setExpandedNodeIds((previous) => ({ ...previous, [nextNodeId]: true }))
    setActiveNode(nextNodeId === localNodeId ? null : nextNodeId)
    initialFocusAppliedRef.current = true
  }, [
    activeNodeId,
    focusNodeIdFromEntity,
    localNodeId,
    normalizedFocusNodeId,
    normalizedFocusTesiraDeviceId,
    setActiveNode,
    tesiraDevices,
  ])

  useEffect(() => {
    if (!selectedNodeId) {
      return
    }

    const devicesOnNode = tesiraDevicesByNodeId[selectedNodeId] ?? []
    if (devicesOnNode.length === 0) {
      if (selectedTesiraDeviceId) {
        setSelectedTesiraDeviceId(null)
      }
      return
    }

    if (selectedTesiraDeviceId && devicesOnNode.some((device) => device.device_id === selectedTesiraDeviceId)) {
      return
    }

    setSelectedTesiraDeviceId(devicesOnNode[0].device_id)
  }, [selectedNodeId, selectedTesiraDeviceId, tesiraDevicesByNodeId])

  const selectedTesiraDeviceQuery = useTesiraDevice(selectedTesiraDeviceId ?? '')
  const selectedTesiraDetail = selectedTesiraDeviceQuery.data ?? null
  const selectedTesiraDetailError = queryErrorMessage(selectedTesiraDeviceQuery.error)

  const clusterOptions = useMemo<NodeOption[]>(
    () => [
      { id: 'all', label: 'All nodes' },
      ...clusterNodes.map((node) => ({ id: node.nodeId, label: `${node.hostname}${node.isLocal ? ' (Local)' : ''}` })),
    ],
    [clusterNodes],
  )
  const selectedScopeOption = useMemo(
    () => clusterOptions.find((option) => option.id === (activeNodeId === 'all' ? 'all' : (activeNodeId ?? localNodeId))) ?? clusterOptions[0] ?? null,
    [activeNodeId, clusterOptions, localNodeId],
  )

  const filteredNodeSummaries = useMemo(() => {
    const needle = searchValue.trim().toLowerCase()
    if (!needle) {
      return nodeSummaries
    }

    return nodeSummaries.filter((summary) => {
      const fields = [
        summary.node.name,
        summary.node.node_id,
        summary.node.address,
        summary.node.api_url ?? '',
        summary.tesiraDevices.map((device) => device.name || device.host).join(' '),
        summary.endpoints.map((endpoint) => endpoint.device_name).join(' '),
      ]

      return fields.some((field) => field.toLowerCase().includes(needle))
    })
  }, [nodeSummaries, searchValue])

  const selectedNodeSummary = useMemo(
    () => nodeSummaries.find((summary) => summary.node.node_id === selectedNodeId) ?? null,
    [nodeSummaries, selectedNodeId],
  )

  const graphModel = useMemo(() => buildAvbRoutingWorkspaceGraphModel({
    nodes: sortedNodes,
    aggregatedRouteEdges,
    tesiraDevices,
    ptpMasterNodeId: ptpStatusQuery.data?.master_node_id ?? null,
    selectedNodeId,
    selectedTesiraDeviceId,
    focusedEntityId: normalizedFocusEntityId,
    summaryByNodeId,
    tesiraDevicesByNodeId,
  }), [
    aggregatedRouteEdges,
    normalizedFocusEntityId,
    ptpStatusQuery.data?.master_node_id,
    selectedNodeId,
    selectedTesiraDeviceId,
    sortedNodes,
    summaryByNodeId,
    tesiraDevices,
    tesiraDevicesByNodeId,
  ])

  const errorMessages = [
    queryErrorMessage(nodesQuery.error),
    queryErrorMessage(endpointsQuery.error),
    queryErrorMessage(connectionsQuery.error),
    queryErrorMessage(streamsQuery.error),
    queryErrorMessage(avbDevicesQuery.error),
    queryErrorMessage(avdeccEntitiesQuery.error),
    queryErrorMessage(tesiraDevicesQuery.error),
  ].filter((message): message is string => Boolean(message))

  const handleSelectNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId)
    setExpandedNodeIds((previous) => ({ ...previous, [nodeId]: true }))
  }, [])

  const handleGraphSelection = useCallback((selection: AvbRoutingWorkspaceGraphSelection) => {
    setHighlightedAnchorId(selection.anchorId)

    if (selection.selectionKind === 'tesira') {
      setSelectedTesiraDeviceId(selection.recordId)
      if (selection.contextNodeId) {
        handleSelectNode(selection.contextNodeId)
      }
    } else {
      handleSelectNode(selection.recordId)
    }

    const target = document.getElementById(selection.anchorId)
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [handleSelectNode])

  const handleAdoptNodeContext = useCallback((nodeId: string) => {
    handleSelectNode(nodeId)
    setActiveNode(nodeId === localNodeId ? null : nodeId)
  }, [handleSelectNode, localNodeId, setActiveNode])

  const handleSelectTesiraDevice = useCallback((deviceId: string) => {
    setSelectedTesiraDeviceId(deviceId)
    const device = tesiraDevices.find((entry) => entry.device_id === deviceId)
    if (device?.source_node_id) {
      handleSelectNode(device.source_node_id)
    }
  }, [handleSelectNode, tesiraDevices])

  const isLoading = nodesQuery.isLoading || endpointsQuery.isLoading || connectionsQuery.isLoading
  const readyStreamCount = streams.filter((stream) => stream.health?.ready).length
  const grafanaPanels = useMemo<PlatformGrafanaPanelDefinition[]>(() => [
    {
      id: 'avb-routing-fabric',
      title: 'Fabric Throughput',
      description: '24-hour AVB transport view for active routes, ready streams, and discovered endpoints.',
      series: [
        { key: 'activeRoutes', label: 'Active Routes', value: activeConnectionRecords.length, color: 'var(--cds-link-primary)' },
        { key: 'readyStreams', label: 'Ready Streams', value: readyStreamCount, color: 'var(--cds-support-success)' },
        { key: 'discoveredEndpoints', label: 'Endpoints', value: avbDevicesQuery.data?.discovered_count ?? null, color: 'var(--cds-text-primary)' },
      ],
    },
    {
      id: 'avb-routing-focus',
      title: 'Focused Transport Node',
      description: 'Selected node trend for endpoint inventory, route pressure, Tesira footprint, and timing offset.',
      series: [
        { key: 'endpoints', label: 'Endpoints', value: selectedNodeSummary?.endpoints.length ?? null, color: 'var(--cds-support-info)' },
        { key: 'routes', label: 'Routes', value: selectedNodeSummary?.activeRoutes.length ?? null, color: 'var(--cds-link-primary)' },
        { key: 'tesira', label: 'Tesira Devices', value: selectedNodeSummary?.tesiraDevices.length ?? null, color: 'var(--cds-support-warning)' },
        { key: 'ptpOffsetNs', label: 'PTP Offset ns', value: selectedNodeSummary?.node.ptp?.offset_ns ?? null, color: 'var(--cds-support-error)' },
      ],
    },
  ], [activeConnectionRecords.length, avbDevicesQuery.data?.discovered_count, readyStreamCount, selectedNodeSummary])

  return (
    <div className="avb-routing-workspace">
      <section className="avb-routing-workspace__section" aria-labelledby="avb-routing-workspace-graph">
        <div className="avb-routing-workspace__section-header">
          <div>
            <h3 id="avb-routing-workspace-graph" className="avb-routing-workspace__section-title">AVB Flow Workspace</h3>
            <p className="avb-routing-workspace__muted">{graphModel.pulseCopy}</p>
          </div>
          <div className="avb-routing-workspace__tag-row">
            {isClusterMode ? (
              <div className="avb-routing-workspace__scope-control">
                <Dropdown
                  id="avb-routing-node-scope"
                  titleText="Cluster scope"
                  label="Select a node"
                  items={clusterOptions}
                  selectedItem={selectedScopeOption}
                  itemToString={(item) => item?.label ?? ''}
                  onChange={({ selectedItem }) => {
                    if (!selectedItem) {
                      return
                    }

                    if (selectedItem.id === 'all') {
                      setActiveNode('all')
                      return
                    }

                    setActiveNode(selectedItem.id === localNodeId ? null : selectedItem.id)
                  }}
                />
              </div>
            ) : null}
            {graphModel.summaryTags.map((tag) => (
              <Tag key={tag.label} type={tag.type}>{tag.label}</Tag>
            ))}
          </div>
        </div>

        <Tile className="avb-routing-workspace__hero">
          {isLoading && sortedNodes.length === 0 ? (
            <div className="avb-routing-workspace__graph-loading">
              <LoadingState description="Loading AVB discovery fabric" />
            </div>
          ) : (
            <AvbRoutingWorkspaceGraph model={graphModel} onSelect={handleGraphSelection} />
          )}
        </Tile>
      </section>

      <section className="avb-routing-workspace__snapshot-grid" aria-label="AVB telemetry snapshots">
        {layer.gridItems.map((item) => (
          <Tile key={item.id} className="avb-routing-workspace__snapshot-tile">
            <div className="avb-routing-workspace__snapshot-head">
              <p>{item.eyebrow}</p>
              <Tag type={item.status === 'healthy' ? 'green' : item.status === 'critical' ? 'red' : 'warm-gray'}>
                {item.status}
              </Tag>
            </div>
            <strong>{item.metric}</strong>
            <span>{item.title}</span>
            <small>{item.helper}</small>
          </Tile>
        ))}
      </section>

      {errorMessages.length > 0 ? (
        <div className="avb-routing-workspace__errors">
          {errorMessages.map((message) => (
            <InlineNotification
              key={message}
              kind="warning"
              lowContrast
              hideCloseButton
              title="Workspace data loaded with gaps"
              subtitle={message}
            />
          ))}
        </div>
      ) : null}

      <PlatformGrafanaPanelDeck panels={grafanaPanels} />

      <section
        id="avb-routing-nodes"
        className={`avb-routing-workspace__section${highlightedAnchorId === 'avb-routing-nodes' ? ' is-highlighted' : ''}`}
        aria-labelledby="avb-routing-node-table"
      >
        <div className="avb-routing-workspace__section-header">
          <div>
            <h3 id="avb-routing-node-table" className="avb-routing-workspace__section-title">Transport nodes</h3>
            <p className="avb-routing-workspace__muted">
              Expand a node row to inspect AVB route pressure, endpoint ownership, and Tesira interface detail in the same node context.
            </p>
          </div>
          <div className="avb-routing-workspace__tag-row">
            <Tag type="cool-gray">{filteredNodeSummaries.length} nodes</Tag>
            <Tag type={readyStreamCount === streams.length && streams.length > 0 ? 'green' : 'warm-gray'}>
              {readyStreamCount}/{streams.length} streams ready
            </Tag>
            {selectedNodeSummary ? <Tag type={nodeStatusTagType(selectedNodeSummary.node)}>{selectedNodeSummary.node.name}</Tag> : null}
          </div>
        </div>

        <Tile className="avb-routing-workspace__table-tile">
          <TableContainer title="AVB discovery nodes" className="avb-routing-workspace__table-container">
            <TableToolbar>
              <TableToolbarContent>
                <TableToolbarSearch
                  persistent
                  value={searchValue}
                  onChange={(_event, value) => setSearchValue(value ?? '')}
                />
                <Tag type="cool-gray">{activeConnectionRecords.length} active routes</Tag>
                <Tag type="cool-gray">{avbDevicesQuery.data?.discovered_count ?? 0} discovered endpoints</Tag>
              </TableToolbarContent>
            </TableToolbar>

            <Table aria-label="AVB discovery nodes">
              <TableHead>
                <TableRow>
                  <TableExpandHeader aria-label="Expand AVB node rows" />
                  <TableHeader>Node</TableHeader>
                  <TableHeader>Type</TableHeader>
                  <TableHeader>PTP</TableHeader>
                  <TableHeader>Endpoints</TableHeader>
                  <TableHeader>Routes</TableHeader>
                  <TableHeader>Tesira</TableHeader>
                  <TableHeader>Status</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredNodeSummaries.map((summary) => {
                  const rowId = summary.node.node_id
                  const isExpanded = expandedNodeIds[rowId] ?? false
                  const expandedRowId = `${rowId}:expanded`

                  return (
                    <Fragment key={rowId}>
                      <TableExpandRow
                        aria-label={`Expand row for ${summary.node.name}`}
                        aria-controls={expandedRowId}
                        isExpanded={isExpanded}
                        className={selectedNodeId === rowId ? 'avb-routing-workspace__table-row is-highlighted' : 'avb-routing-workspace__table-row'}
                        onExpand={() => {
                          setExpandedNodeIds((previous) => ({
                            ...previous,
                            [rowId]: !isExpanded,
                          }))
                          handleSelectNode(rowId)
                        }}
                      >
                        <TableCell>{summary.node.name}</TableCell>
                        <TableCell>{summary.node.type.replace(/_/g, ' ')}</TableCell>
                        <TableCell>
                          <Tag type={ptpTagType(summary.node.ptp?.state)} size="sm">
                            {summary.node.ptp?.state ?? 'pending'}
                          </Tag>
                        </TableCell>
                        <TableCell>{summary.endpoints.length}</TableCell>
                        <TableCell>{summary.activeRoutes.length}</TableCell>
                        <TableCell>{summary.tesiraDevices.length}</TableCell>
                        <TableCell>
                          <Tag type={nodeStatusTagType(summary.node)} size="sm">
                            {summary.node.status}
                          </Tag>
                        </TableCell>
                      </TableExpandRow>
                      <TableExpandedRow id={expandedRowId} colSpan={8}>
                        <NodeDetailPanel
                          summary={summary}
                          nodesById={nodesById}
                          focusedTesiraDeviceId={selectedTesiraDeviceId}
                          focusedTesiraDetail={selectedTesiraDetail}
                          tesiraDetailLoading={selectedTesiraDeviceQuery.isLoading}
                          tesiraDetailError={selectedTesiraDetailError}
                          onSelectTesiraDevice={handleSelectTesiraDevice}
                          onAdoptNodeContext={handleAdoptNodeContext}
                          onOpenTesiraRoute={(route) => navigate(route)}
                        />
                      </TableExpandedRow>
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Tile>
      </section>

      {selectedNodeSummary ? (
        <div className="avb-routing-workspace__footer-actions">
          <Button
            kind="tertiary"
            size="sm"
            renderIcon={Launch}
            onClick={() => navigate(buildAvbRoutingWorkspaceHref({
              tesiraDeviceId: selectedTesiraDeviceId,
              nodeId: selectedNodeSummary.node.node_id,
              entityId: normalizedFocusEntityId,
            }))}
          >
            Refresh deep link for {selectedNodeSummary.node.name}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export default AvbRoutingWorkspace
