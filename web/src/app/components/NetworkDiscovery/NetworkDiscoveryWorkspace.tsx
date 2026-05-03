import './NetworkDiscoveryWorkspace.css'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
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
import { usePeerDiscoveryStatus, usePeerLatencyHistory, type PeerDiscoveryPeer } from '../../hooks/usePeerDiscovery'
import { useNodeTopology } from '../../hooks/useNodeTopology'
import type { PlatformLayerData } from '../../platform/model'
import { buildPlatformNodeWorkspaceHref } from '../../platform/routes'
import { useViewedNode, useViewedNodeStore } from '../../stores/viewedNodeStore'
import type { NodeSummary } from '../../types/node'
import {
  NODE_PAGE_KEYS,
  formatNodeDisplayName,
  getNodeRoleLabel,
  getNodeStatusLabel,
  getNodeStatusTagType,
} from '../../utils/nodeDisplay'
import { NetworkDiscoveryWorkspaceGraph } from './NetworkDiscoveryWorkspaceGraph'
import { EmptyState } from '../shared/EmptyState'
import {
  buildNetworkDiscoveryWorkspaceGraphModel,
  type NetworkDiscoveryRecord,
  type NetworkDiscoveryWorkspaceGraphSelection,
} from './networkDiscoveryWorkspaceGraph'
import { PlatformGrafanaPanelDeck, type PlatformGrafanaPanelDefinition } from '../Platform/PlatformGrafanaPanel'
import { LoadingState } from '../shared/LoadingState'

type DiscoveryWorkspaceRecord = NetworkDiscoveryRecord & {
  lastSeen: string | null
  trustState: string
  adoptionState: string
  activationState: string
  readinessStatus: string
  visibilityReason: string
}

function formatLastSeen(value: string | null | undefined): string {
  if (!value) {
    return '—'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString()
}

function formatLatencyMs(value: number | null | undefined): string {
  if (value === null || !Number.isFinite(value ?? NaN)) {
    return '—'
  }
  return `${Number(value).toFixed(1)} ms`
}

function normalizeNodeId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function tagTypeForVisibility(record: DiscoveryWorkspaceRecord): 'green' | 'warm-gray' | 'red' | 'cool-gray' {
  if (!record.isOnline && !record.registrationRequired) {
    return 'red'
  }
  if (record.registrationRequired || !record.routingReady) {
    return 'warm-gray'
  }
  if (record.isOnline) {
    return 'green'
  }
  return 'cool-gray'
}

function mergeRecord(topologyNode: NodeSummary | undefined, peer: PeerDiscoveryPeer | undefined): DiscoveryWorkspaceRecord | null {
  const nodeId = peer?.node_id ?? topologyNode?.node_id
  if (!nodeId) {
    return null
  }

  const hostname = peer?.hostname || topologyNode?.hostname || peer?.host || nodeId
  const label = topologyNode ? formatNodeDisplayName(topologyNode) : hostname

  return {
    id: nodeId,
    label,
    hostname,
    host: peer?.host ?? topologyNode?.hostname ?? hostname,
    nodeMode: peer?.node_mode ?? topologyNode?.role ?? 'unknown',
    isOnline: peer?.is_online ?? (topologyNode ? topologyNode.status !== 'offline' : false),
    visibilityState: peer?.visibility_state ?? (topologyNode ? getNodeStatusLabel(topologyNode.status).toLowerCase() : 'unknown'),
    registrationRequired: peer?.registration_required ?? false,
    routingReady: peer?.routing_ready ?? false,
    latencyMs: peer?.latency_ms ?? null,
    discoverySources: peer?.discovery_sources ?? [],
    lastSeen: peer?.last_seen ?? topologyNode?.last_seen ?? null,
    trustState: peer?.trust_state ?? 'unknown',
    adoptionState: peer?.adoption_state ?? (peer?.registered ? 'ready' : 'candidate'),
    activationState: peer?.activation_state ?? (peer?.registered ? 'active' : 'standby'),
    readinessStatus: peer?.readiness_status ?? (peer?.routing_ready ? 'ready' : 'gated'),
    visibilityReason: peer?.visibility_reason ?? 'No visibility reason reported yet.',
  }
}

function ExpandedRow({
  record,
  sourceNode,
  latencySummary,
  onOpenManagement,
  onOpenCluster,
  onOpenAvb,
}: {
  record: DiscoveryWorkspaceRecord
  sourceNode: NodeSummary | null
  latencySummary: ReturnType<typeof usePeerLatencyHistory>['data'] | undefined
  onOpenManagement: (nodeId: string) => void
  onOpenCluster: (nodeId: string) => void
  onOpenAvb: (nodeId: string) => void
}) {
  return (
    <div className="network-discovery-workspace__expanded-row">
      <div className="network-discovery-workspace__expanded-grid">
        <article className="network-discovery-workspace__expanded-card">
          <div className="network-discovery-workspace__expanded-card-head">
            <h4>Visibility posture</h4>
            <Tag type={tagTypeForVisibility(record)}>{record.visibilityState}</Tag>
          </div>
          <dl className="network-discovery-workspace__detail-list">
            <div>
              <dt>Host</dt>
              <dd>{record.host}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{record.nodeMode}</dd>
            </div>
            <div>
              <dt>Discovery sources</dt>
              <dd>{record.discoverySources.join(', ') || 'No sources'}</dd>
            </div>
            <div>
              <dt>Routing ready</dt>
              <dd>{record.routingReady ? 'Yes' : 'No'}</dd>
            </div>
            <div>
              <dt>Registration</dt>
              <dd>{record.registrationRequired ? 'Required' : 'Complete'}</dd>
            </div>
            <div>
              <dt>Last seen</dt>
              <dd>{formatLastSeen(record.lastSeen)}</dd>
            </div>
          </dl>
        </article>

        <article className="network-discovery-workspace__expanded-card">
          <div className="network-discovery-workspace__expanded-card-head">
            <h4>Latency telemetry</h4>
            <Tag type={latencySummary ? 'green' : 'cool-gray'}>{latencySummary ? 'history' : 'current only'}</Tag>
          </div>
          <dl className="network-discovery-workspace__detail-list">
            <div>
              <dt>Current latency</dt>
              <dd>{formatLatencyMs(record.latencyMs)}</dd>
            </div>
            <div>
              <dt>Average</dt>
              <dd>{formatLatencyMs(latencySummary?.average_latency_ms)}</dd>
            </div>
            <div>
              <dt>Minimum</dt>
              <dd>{formatLatencyMs(latencySummary?.min_latency_ms)}</dd>
            </div>
            <div>
              <dt>Maximum</dt>
              <dd>{formatLatencyMs(latencySummary?.max_latency_ms)}</dd>
            </div>
            <div>
              <dt>Packet loss</dt>
              <dd>{latencySummary ? `${latencySummary.packet_loss_percent.toFixed(1)}%` : '—'}</dd>
            </div>
            <div>
              <dt>Perspective</dt>
              <dd>{sourceNode ? formatNodeDisplayName(sourceNode) : 'Local cluster context'}</dd>
            </div>
          </dl>
        </article>

        <article className="network-discovery-workspace__expanded-card">
          <div className="network-discovery-workspace__expanded-card-head">
            <h4>Operator handoff</h4>
            <Tag type="cool-gray">{record.readinessStatus}</Tag>
          </div>
          <dl className="network-discovery-workspace__detail-list">
            <div>
              <dt>Trust</dt>
              <dd>{record.trustState}</dd>
            </div>
            <div>
              <dt>Adoption</dt>
              <dd>{record.adoptionState}</dd>
            </div>
            <div>
              <dt>Activation</dt>
              <dd>{record.activationState}</dd>
            </div>
            <div>
              <dt>Reason</dt>
              <dd>{record.visibilityReason}</dd>
            </div>
          </dl>
          <div className="network-discovery-workspace__footer-actions">
            <Button kind="ghost" size="sm" renderIcon={Launch} onClick={() => onOpenManagement(record.id)}>
              Open Management
            </Button>
            <Button kind="ghost" size="sm" renderIcon={Launch} onClick={() => onOpenCluster(record.id)}>
              Open Cluster
            </Button>
            <Button kind="ghost" size="sm" renderIcon={Launch} onClick={() => onOpenAvb(record.id)}>
              Open AVB
            </Button>
          </div>
        </article>
      </div>
      <p className="network-discovery-workspace__footer-note">
        This workspace stays on existing peer-discovery, heartbeat, and node-topology telemetry only. Changing the host source recenters the interpretation context without launching new probes from the UI.
      </p>
    </div>
  )
}

export function NetworkDiscoveryWorkspace({
  layer,
}: {
  layer: PlatformLayerData
}) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { setActiveNode } = useCluster()
  const setViewedNode = useViewedNodeStore((state) => state.setViewedNode)
  const topologyQuery = useNodeTopology()
  const discoveryQuery = usePeerDiscoveryStatus()
  const topology = topologyQuery.data
  const nodes = Array.isArray(topology?.nodes) ? topology.nodes : []
  const localNode = nodes.find((node) => node.is_local) ?? nodes[0] ?? null
  const viewedNodeId = useViewedNode(NODE_PAGE_KEYS.platform, localNode?.node_id ?? 'local')
  const focusedNodeId = normalizeNodeId(searchParams.get('focusNodeId'))
  const effectiveViewedNodeId = focusedNodeId ?? viewedNodeId
  const sourceNode = nodes.find((node) => node.node_id === effectiveViewedNodeId) ?? localNode
  const [searchValue, setSearchValue] = useState('')
  const topologyNodeById = useMemo(
    () => new Map(nodes.map((node) => [node.node_id, node])),
    [nodes],
  )

  const records = useMemo<DiscoveryWorkspaceRecord[]>(() => {
    const peersById = new Map((discoveryQuery.data?.peers ?? []).map((peer) => [peer.node_id, peer]))
    const candidateIds = new Set<string>()

    for (const peer of discoveryQuery.data?.peers ?? []) {
      candidateIds.add(peer.node_id)
    }
    for (const node of nodes) {
      if (!node.is_local) {
        candidateIds.add(node.node_id)
      }
    }

    return Array.from(candidateIds)
      .map((nodeId) => mergeRecord(topologyNodeById.get(nodeId), peersById.get(nodeId)))
      .filter((record): record is DiscoveryWorkspaceRecord => record !== null)
      .sort((left, right) => {
        if (left.routingReady !== right.routingReady) {
          return Number(right.routingReady) - Number(left.routingReady)
        }
        if (left.isOnline !== right.isOnline) {
          return Number(right.isOnline) - Number(left.isOnline)
        }
        return left.label.localeCompare(right.label)
      })
  }, [discoveryQuery.data?.peers, nodes, topologyNodeById])

  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(focusedNodeId ?? records[0]?.id ?? null)
  const tableRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!focusedNodeId || !nodes.some((node) => node.node_id === focusedNodeId)) {
      return
    }

    setViewedNode(NODE_PAGE_KEYS.platform, focusedNodeId)
  }, [focusedNodeId, nodes, setViewedNode])

  useEffect(() => {
    const preferredPeerId = records.some((record) => record.id === focusedNodeId)
      ? focusedNodeId
      : records[0]?.id ?? null

    setSelectedPeerId((current) => {
      if (current && records.some((record) => record.id === current)) {
        return current
      }

      return preferredPeerId
    })
  }, [focusedNodeId, records])

  const filteredRecords = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase()
    if (!normalizedSearch) {
      return records
    }

    return records.filter((record) => (
      [
        record.label,
        record.host,
        record.hostname,
        record.visibilityState,
        record.discoverySources.join(' '),
        record.readinessStatus,
      ].some((value) => value.toLowerCase().includes(normalizedSearch))
    ))
  }, [records, searchValue])

  const selectedRecord = filteredRecords.find((record) => record.id === selectedPeerId)
    ?? records.find((record) => record.id === selectedPeerId)
    ?? filteredRecords[0]
    ?? null

  const latencyHistoryQuery = usePeerLatencyHistory(selectedRecord?.id ?? null)

  const graphModel = useMemo(() => (
    buildNetworkDiscoveryWorkspaceGraphModel({
      sourceNode,
      records: filteredRecords.map((record) => ({
        id: record.id,
        label: record.label,
        hostname: record.hostname,
        host: record.host,
        nodeMode: record.nodeMode,
        isOnline: record.isOnline,
        visibilityState: record.visibilityState,
        registrationRequired: record.registrationRequired,
        routingReady: record.routingReady,
        latencyMs: record.latencyMs,
        discoverySources: record.discoverySources,
      })),
      selectedPeerId,
    })
  ), [filteredRecords, selectedPeerId, sourceNode])

  const handleGraphSelect = useCallback((selection: NetworkDiscoveryWorkspaceGraphSelection) => {
    if (selection.recordId === 'network-source' || selection.recordId === 'network-fabric') {
      return
    }

    setSelectedPeerId(selection.recordId)
    if (typeof tableRef.current?.scrollIntoView === 'function') {
      tableRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const openWorkspace = useCallback((workspace: 'management' | 'cluster-dashboard' | 'avb-routing', nodeId: string) => {
    setViewedNode(NODE_PAGE_KEYS.platform, nodeId)
    setActiveNode(localNode && nodeId === localNode.node_id ? null : nodeId)
    if (workspace === 'avb-routing') {
      navigate(`/avb/routing?focusNodeId=${encodeURIComponent(nodeId)}`)
      return
    }
    navigate(buildPlatformNodeWorkspaceHref(workspace, nodeId))
  }, [localNode, navigate, setActiveNode, setViewedNode])

  const discoveryError = discoveryQuery.error instanceof Error ? discoveryQuery.error.message : null
  const topologyError = topologyQuery.error instanceof Error ? topologyQuery.error.message : null
  const onlinePeerCount = records.filter((record) => record.isOnline).length
  const routingReadyCount = records.filter((record) => record.routingReady).length
  const registrationRequiredCount = records.filter((record) => record.registrationRequired).length
  const grafanaPanels = useMemo<PlatformGrafanaPanelDefinition[]>(() => [
    {
      id: 'network-discovery-visibility',
      title: 'Peer Visibility',
      description: '24-hour discovery view for visible peers, routing-ready nodes, and registration pressure.',
      series: [
        { key: 'visiblePeers', label: 'Visible Peers', value: records.length, color: 'var(--cds-text-primary)' },
        { key: 'onlinePeers', label: 'Online Peers', value: onlinePeerCount, color: 'var(--cds-support-success)' },
        { key: 'routingReadyPeers', label: 'Routing Ready', value: routingReadyCount, color: 'var(--cds-link-primary)' },
        { key: 'registrationRequired', label: 'Registration Required', value: registrationRequiredCount, color: 'var(--cds-support-warning)' },
      ],
    },
    {
      id: 'network-discovery-focus',
      title: 'Focused Peer Latency',
      description: 'Selected peer trend for latency, packet loss, and readiness state in the current node context.',
      series: [
        { key: 'latencyMs', label: 'Latency ms', value: selectedRecord?.latencyMs ?? null, color: 'var(--cds-support-info)' },
        { key: 'packetLoss', label: 'Packet Loss %', value: latencyHistoryQuery.data?.packet_loss_percent ?? null, color: 'var(--cds-support-error)' },
        { key: 'averageLatency', label: 'Average Latency ms', value: latencyHistoryQuery.data?.average_latency_ms ?? null, color: 'var(--cds-link-primary)' },
        { key: 'readiness', label: 'Routing Ready', value: selectedRecord ? (selectedRecord.routingReady ? 1 : 0) * 100 : null, color: 'var(--cds-support-success)' },
      ],
      yAxisDomain: [0, 'auto'],
    },
  ], [latencyHistoryQuery.data?.average_latency_ms, latencyHistoryQuery.data?.packet_loss_percent, onlinePeerCount, records, registrationRequiredCount, routingReadyCount, selectedRecord])

  return (
    <div className="network-discovery-workspace">
      <section className="network-discovery-workspace__section" aria-labelledby="network-discovery-workspace-hero">
        <div className="network-discovery-workspace__section-header">
          <div>
            <h3 id="network-discovery-workspace-hero" className="network-discovery-workspace__section-title">Network discovery workspace</h3>
            <p className="network-discovery-workspace__muted">
              Heartbeat, visibility, and peer-discovery telemetry rendered as one graph-first operator surface with host-source context preserved across adopted nodes.
            </p>
          </div>
          <div className="network-discovery-workspace__tag-row">
            {graphModel.summaryTags.map((tag) => (
              <Tag key={tag.label} type={tag.type}>{tag.label}</Tag>
            ))}
          </div>
        </div>

        {sourceNode && sourceNode.node_id !== localNode?.node_id && (
          <InlineNotification
            kind="info"
            lowContrast
            hideCloseButton
            title="Remote source selected"
            subtitle={`The graph is centered on ${formatNodeDisplayName(sourceNode)}, but the workspace still relies on already collected cluster telemetry rather than launching remote probes.`}
          />
        )}

        {discoveryError && (
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title="Peer discovery loaded with gaps"
            subtitle={discoveryError}
          />
        )}
        {topologyError && (
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title="Topology loaded with gaps"
            subtitle={topologyError}
          />
        )}

        <div className="network-discovery-workspace__snapshot-grid">
          {layer.gridItems.map((item) => (
            <Tile key={item.id} className="network-discovery-workspace__snapshot-tile">
              <div className="network-discovery-workspace__snapshot-head">
                <p>{item.eyebrow}</p>
                <Tag type={item.status === 'healthy' ? 'green' : item.status === 'warning' ? 'warm-gray' : item.status === 'critical' ? 'red' : 'cool-gray'}>
                  {item.status}
                </Tag>
              </div>
              <strong>{item.metric}</strong>
              <span>{item.title}</span>
              <small>{item.helper}</small>
            </Tile>
          ))}
        </div>

        <Tile className="network-discovery-workspace__hero">
          {discoveryQuery.isLoading && filteredRecords.length === 0 ? (
            <div className="network-discovery-workspace__graph-loading">
              <LoadingState description="Loading discovery telemetry" />
            </div>
          ) : (
            <NetworkDiscoveryWorkspaceGraph model={graphModel} onSelect={handleGraphSelect} />
          )}
        </Tile>
      </section>

      <section
        ref={tableRef}
        className={`network-discovery-workspace__section${selectedRecord ? ' is-highlighted' : ''}`}
        aria-labelledby="network-discovery-workspace-peers"
      >
        <PlatformGrafanaPanelDeck panels={grafanaPanels} />
        <div className="network-discovery-workspace__section-header">
          <div>
            <h3 id="network-discovery-workspace-peers" className="network-discovery-workspace__section-title">Peer visibility and latency detail</h3>
            <p className="network-discovery-workspace__muted">{graphModel.pulseCopy}</p>
          </div>
          {sourceNode && (
            <div className="network-discovery-workspace__tag-row">
              <Tag type={getNodeStatusTagType(sourceNode.status)}>{getNodeStatusLabel(sourceNode.status)}</Tag>
              <Tag type="cool-gray">{getNodeRoleLabel(sourceNode.role)}</Tag>
              <Tag type="cool-gray">{formatNodeDisplayName(sourceNode)}</Tag>
            </div>
          )}
        </div>

        <Tile className="network-discovery-workspace__table-tile">
          <TableContainer
            title={layer.tableTitle}
            description={layer.tableDescription}
            className="network-discovery-workspace__table-container"
          >
            <TableToolbar>
              <TableToolbarContent>
                <TableToolbarSearch
                  persistent
                  value={searchValue}
                  onChange={(_event, value) => setSearchValue(value ?? '')}
                />
              </TableToolbarContent>
            </TableToolbar>
            <Table aria-label={layer.tableTitle}>
              <TableHead>
                <TableRow>
                  <TableExpandHeader aria-label="Expand discovery row" />
                  <TableHeader>Peer</TableHeader>
                  <TableHeader>Visibility</TableHeader>
                  <TableHeader>Latency</TableHeader>
                  <TableHeader>Sources</TableHeader>
                  <TableHeader>Routing</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <EmptyState
                        title="No discovery rows match this search"
                        description="Adjust the search text or wait for more discovery telemetry."
                        compact
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRecords.map((record) => {
                    const expanded = record.id === selectedRecord?.id
                    return (
                      <Fragment key={record.id}>
                        <TableExpandRow
                          aria-label={`Expand discovery row for ${record.label}`}
                          className={expanded ? 'network-discovery-workspace__table-row is-highlighted' : 'network-discovery-workspace__table-row'}
                          isExpanded={expanded}
                          onExpand={() => setSelectedPeerId(expanded ? null : record.id)}
                        >
                          <TableCell>{record.label}</TableCell>
                          <TableCell>
                            <Tag type={tagTypeForVisibility(record)}>{record.visibilityState}</Tag>
                          </TableCell>
                          <TableCell>{formatLatencyMs(record.latencyMs)}</TableCell>
                          <TableCell>{record.discoverySources.join(', ') || 'No sources'}</TableCell>
                          <TableCell>{record.routingReady ? 'Ready' : 'Gated'}</TableCell>
                        </TableExpandRow>
                        {expanded && (
                          <TableExpandedRow colSpan={6}>
                            <ExpandedRow
                              record={record}
                              sourceNode={sourceNode}
                              latencySummary={latencyHistoryQuery.data}
                              onOpenManagement={(nodeId) => openWorkspace('management', nodeId)}
                              onOpenCluster={(nodeId) => openWorkspace('cluster-dashboard', nodeId)}
                              onOpenAvb={(nodeId) => openWorkspace('avb-routing', nodeId)}
                            />
                          </TableExpandedRow>
                        )}
                      </Fragment>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Tile>
      </section>
    </div>
  )
}

export default NetworkDiscoveryWorkspace
