import './ClusterDashboardWorkspace.css'

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
import { useNodeTopology } from '../../hooks/useNodeTopology'
import type { PlatformHealth, PlatformLayerData } from '../../platform/model'
import { buildPlatformNodeWorkspaceHref } from '../../platform/routes'
import { useViewedNode, useViewedNodeStore } from '../../stores/viewedNodeStore'
import type { NodeAudioEdge, NodeNetworkEdge, NodeSummary } from '../../types/node'
import {
  NODE_PAGE_KEYS,
  buildNodeAlertMessage,
  computeNodeHealthPercent,
  formatNodeDisplayName,
  getNodeRoleLabel,
  getNodeStatusLabel,
  getNodeStatusTagType,
} from '../../utils/nodeDisplay'
import { PlatformGrafanaPanelDeck, type PlatformGrafanaPanelDefinition } from '../Platform/PlatformGrafanaPanel'
import { EmptyState } from '../shared/EmptyState'
import { LoadingState } from '../shared/LoadingState'
import { ClusterDashboardWorkspaceGraph } from './ClusterDashboardWorkspaceGraph'
import {
  buildClusterDashboardWorkspaceGraphModel,
  type ClusterDashboardWorkspaceAnchorId,
  type ClusterDashboardWorkspaceGraphSelection,
} from './clusterDashboardWorkspaceGraph'

type PeerLink = {
  peerNodeId: string
  latencyMs: number | null
  activeAudioCount: number
}

type NodeWorkspaceRecord = {
  node: NodeSummary
  healthPercent: number
  roleLabel: string
  statusLabel: string
  activeAudioCount: number
  peerLinks: PeerLink[]
  alertCopy: string
}

type NodePairAggregate = {
  leftNodeId: string
  rightNodeId: string
  activeAudioCount: number
  latenciesMs: number[]
}

function normalizeNodeId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function queryErrorMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : null
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`
}

function formatLatencyMs(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return '—'
  }
  return `${value.toFixed(1)} ms`
}

function formatLastSeen(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString()
}

function platformHealthTagType(status: PlatformHealth): 'green' | 'warm-gray' | 'red' | 'cool-gray' {
  switch (status) {
    case 'healthy':
      return 'green'
    case 'warning':
      return 'warm-gray'
    case 'critical':
      return 'red'
    default:
      return 'cool-gray'
  }
}

function pairKey(leftNodeId: string, rightNodeId: string): string {
  return [leftNodeId, rightNodeId].sort().join('::')
}

function aggregateNodePairs(audioEdges: NodeAudioEdge[], networkEdges: NodeNetworkEdge[]) {
  const aggregates = new Map<string, NodePairAggregate>()

  const getOrCreate = (leftNodeId: string, rightNodeId: string) => {
    const key = pairKey(leftNodeId, rightNodeId)
    const existing = aggregates.get(key)
    if (existing) {
      return existing
    }

    const created: NodePairAggregate = {
      leftNodeId,
      rightNodeId,
      activeAudioCount: 0,
      latenciesMs: [],
    }
    aggregates.set(key, created)
    return created
  }

  for (const edge of audioEdges) {
    if (!edge.active || edge.source_node_id === edge.dest_node_id) {
      continue
    }

    getOrCreate(edge.source_node_id, edge.dest_node_id).activeAudioCount += 1
  }

  for (const edge of networkEdges) {
    if (edge.latency_ms === null || edge.source_node_id === edge.dest_node_id) {
      continue
    }

    getOrCreate(edge.source_node_id, edge.dest_node_id).latenciesMs.push(edge.latency_ms)
  }

  return aggregates
}

function buildPeerLinksByNodeId(
  nodesById: Map<string, NodeSummary>,
  audioEdges: NodeAudioEdge[],
  networkEdges: NodeNetworkEdge[],
): Map<string, PeerLink[]> {
  const peerLinksByNodeId = new Map<string, PeerLink[]>()
  const aggregates = aggregateNodePairs(audioEdges, networkEdges)

  aggregates.forEach((aggregate) => {
    const averageLatencyMs = aggregate.latenciesMs.length > 0
      ? aggregate.latenciesMs.reduce((sum, value) => sum + value, 0) / aggregate.latenciesMs.length
      : null

    const leftLinks = peerLinksByNodeId.get(aggregate.leftNodeId) ?? []
    leftLinks.push({
      peerNodeId: aggregate.rightNodeId,
      latencyMs: averageLatencyMs,
      activeAudioCount: aggregate.activeAudioCount,
    })
    peerLinksByNodeId.set(aggregate.leftNodeId, leftLinks)

    const rightLinks = peerLinksByNodeId.get(aggregate.rightNodeId) ?? []
    rightLinks.push({
      peerNodeId: aggregate.leftNodeId,
      latencyMs: averageLatencyMs,
      activeAudioCount: aggregate.activeAudioCount,
    })
    peerLinksByNodeId.set(aggregate.rightNodeId, rightLinks)
  })

  for (const [nodeId, peerLinks] of peerLinksByNodeId.entries()) {
    peerLinks.sort((left, right) => {
      if (right.activeAudioCount !== left.activeAudioCount) {
        return right.activeAudioCount - left.activeAudioCount
      }
      if ((left.latencyMs ?? Number.POSITIVE_INFINITY) !== (right.latencyMs ?? Number.POSITIVE_INFINITY)) {
        return (left.latencyMs ?? Number.POSITIVE_INFINITY) - (right.latencyMs ?? Number.POSITIVE_INFINITY)
      }
      const leftNode = nodesById.get(left.peerNodeId)
      const rightNode = nodesById.get(right.peerNodeId)
      return formatNodeDisplayName(leftNode ?? { hostname: left.peerNodeId, display_label: null })
        .localeCompare(formatNodeDisplayName(rightNode ?? { hostname: right.peerNodeId, display_label: null }))
    })
    peerLinksByNodeId.set(nodeId, peerLinks)
  }

  return peerLinksByNodeId
}

function NodeDetailPanel({
  record,
  nodesById,
  onAdoptNodeContext,
  onOpenManagementWorkspace,
}: {
  record: NodeWorkspaceRecord
  nodesById: Map<string, NodeSummary>
  onAdoptNodeContext: (nodeId: string) => void
  onOpenManagementWorkspace: (nodeId: string) => void
}) {
  return (
    <div className="cluster-dashboard-workspace__expanded-row">
      <div className="cluster-dashboard-workspace__expanded-grid">
        <article className="cluster-dashboard-workspace__expanded-card">
          <div className="cluster-dashboard-workspace__expanded-card-head">
            <h4>Node detail</h4>
            <Tag type={getNodeStatusTagType(record.node.status)}>{record.statusLabel}</Tag>
          </div>
          <dl className="cluster-dashboard-workspace__detail-list">
            <div>
              <dt>Role</dt>
              <dd>{record.roleLabel}</dd>
            </div>
            <div>
              <dt>Health</dt>
              <dd>{record.healthPercent}%</dd>
            </div>
            <div>
              <dt>Audio latency</dt>
              <dd>{formatLatencyMs(record.node.audio_latency_ms)}</dd>
            </div>
            <div>
              <dt>XRuns</dt>
              <dd>{record.node.xrun_count}</dd>
            </div>
            <div>
              <dt>Last seen</dt>
              <dd>{formatLastSeen(record.node.last_seen)}</dd>
            </div>
            <div>
              <dt>Alert focus</dt>
              <dd>{record.alertCopy}</dd>
            </div>
          </dl>
        </article>

        <article className="cluster-dashboard-workspace__expanded-card">
          <div className="cluster-dashboard-workspace__expanded-card-head">
            <h4>Service posture</h4>
            <Tag type={record.node.services.backend && record.node.services.juce_engine && record.node.services.pipewire ? 'green' : 'warm-gray'}>
              services
            </Tag>
          </div>
          <div className="cluster-dashboard-workspace__service-row">
            <Tag type={record.node.services.backend ? 'green' : 'red'}>Backend</Tag>
            <Tag type={record.node.services.juce_engine ? 'green' : 'red'}>JUCE</Tag>
            <Tag type={record.node.services.pipewire ? 'green' : 'red'}>PipeWire</Tag>
            <Tag type={record.node.is_local ? 'cool-gray' : 'green'}>{record.node.is_local ? 'Local' : 'Peer'}</Tag>
          </div>
          <dl className="cluster-dashboard-workspace__detail-list">
            <div>
              <dt>CPU load</dt>
              <dd>{formatPercent(record.node.cpu_percent)}</dd>
            </div>
            <div>
              <dt>Memory</dt>
              <dd>{formatPercent(record.node.memory_percent)}</dd>
            </div>
            <div>
              <dt>Peer links</dt>
              <dd>{record.peerLinks.length}</dd>
            </div>
            <div>
              <dt>Audio paths</dt>
              <dd>{record.activeAudioCount}</dd>
            </div>
          </dl>
        </article>

        <article className="cluster-dashboard-workspace__expanded-card">
          <div className="cluster-dashboard-workspace__expanded-card-head">
            <h4>Peer links</h4>
            <Tag type={record.peerLinks.length > 0 ? 'green' : 'cool-gray'}>
              {record.peerLinks.length}
            </Tag>
          </div>
          <div className="cluster-dashboard-workspace__peer-list">
            {record.peerLinks.length === 0 ? (
              <p className="cluster-dashboard-workspace__muted">No active peer latency or audio-path links are currently visible for this node.</p>
            ) : (
              record.peerLinks.map((peerLink) => {
                const peerNode = nodesById.get(peerLink.peerNodeId) ?? null
                const peerLabel = peerNode ? formatNodeDisplayName(peerNode) : peerLink.peerNodeId
                return (
                  <div key={`${record.node.node_id}:${peerLink.peerNodeId}`} className="cluster-dashboard-workspace__peer-card">
                    <div className="cluster-dashboard-workspace__peer-card-head">
                      <strong>{peerLabel}</strong>
                      {peerNode ? <Tag type={getNodeStatusTagType(peerNode.status)}>{getNodeStatusLabel(peerNode.status)}</Tag> : null}
                    </div>
                    <p>{peerLink.activeAudioCount} active audio path{peerLink.activeAudioCount === 1 ? '' : 's'} · {formatLatencyMs(peerLink.latencyMs)} peer latency</p>
                    {peerNode ? <p>{getNodeRoleLabel(peerNode.role)} · {formatPercent(peerNode.cpu_percent)} CPU · {formatPercent(peerNode.memory_percent)} memory</p> : null}
                  </div>
                )
              })
            )}
          </div>
        </article>
      </div>

      <div className="cluster-dashboard-workspace__footer-actions">
        <Button kind="secondary" size="sm" onClick={() => onAdoptNodeContext(record.node.node_id)}>
          Adopt Platform Node Context
        </Button>
        <Button kind="tertiary" size="sm" renderIcon={Launch} onClick={() => onOpenManagementWorkspace(record.node.node_id)}>
          Open Management Workspace
        </Button>
      </div>
    </div>
  )
}

export function ClusterDashboardWorkspace({ layer }: { layer: PlatformLayerData }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const topologyQuery = useNodeTopology()
  const { activeNodeId, localNodeId, setActiveNode } = useCluster()
  const setViewedNode = useViewedNodeStore((state) => state.setViewedNode)
  const topology = topologyQuery.data
  const nodes = Array.isArray(topology?.nodes) ? topology.nodes : []
  const audioEdges = Array.isArray(topology?.audio_edges) ? topology.audio_edges : []
  const networkEdges = Array.isArray(topology?.network_edges) ? topology.network_edges : []
  const fallbackLocalId = nodes.find((node) => node.is_local)?.node_id ?? localNodeId ?? 'local'
  const viewedNodeId = useViewedNode(NODE_PAGE_KEYS.platform, fallbackLocalId)

  const normalizedFocusNodeId = normalizeNodeId(searchParams.get('focusNodeId'))
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(normalizedFocusNodeId ?? viewedNodeId)
  const [expandedNodeIds, setExpandedNodeIds] = useState<Record<string, boolean>>({})
  const [searchValue, setSearchValue] = useState('')
  const [highlightedAnchorId, setHighlightedAnchorId] = useState<ClusterDashboardWorkspaceAnchorId | null>(null)
  const tableSectionRef = useRef<HTMLElement | null>(null)

  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.node_id, node])), [nodes])
  const peerLinksByNodeId = useMemo(
    () => buildPeerLinksByNodeId(nodesById, audioEdges, networkEdges),
    [audioEdges, networkEdges, nodesById],
  )

  const sortedNodes = useMemo(() => (
    [...nodes].sort((left, right) => {
      const leftPriority = left.is_local ? 0 : left.node_id === viewedNodeId ? 1 : 2
      const rightPriority = right.is_local ? 0 : right.node_id === viewedNodeId ? 1 : 2
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority
      }

      const leftSeverity = left.status === 'offline' || left.status === 'critical' ? 0 : left.status === 'warn' ? 1 : 2
      const rightSeverity = right.status === 'offline' || right.status === 'critical' ? 0 : right.status === 'warn' ? 1 : 2
      if (leftSeverity !== rightSeverity) {
        return leftSeverity - rightSeverity
      }

      return formatNodeDisplayName(left).localeCompare(formatNodeDisplayName(right))
    })
  ), [nodes, viewedNodeId])

  const nodeRecords = useMemo<NodeWorkspaceRecord[]>(() => (
    sortedNodes.map((node) => ({
      node,
      healthPercent: computeNodeHealthPercent(node),
      roleLabel: getNodeRoleLabel(node.role),
      statusLabel: getNodeStatusLabel(node.status),
      activeAudioCount: audioEdges.filter((edge) => edge.active && (edge.source_node_id === node.node_id || edge.dest_node_id === node.node_id)).length,
      peerLinks: peerLinksByNodeId.get(node.node_id) ?? [],
      alertCopy: buildNodeAlertMessage(node),
    }))
  ), [audioEdges, peerLinksByNodeId, sortedNodes])

  useEffect(() => {
    if (nodeRecords.length === 0) {
      setSelectedNodeId(null)
      return
    }

    const knownNodeIds = new Set(nodeRecords.map((record) => record.node.node_id))
    const preferredNodeId = [
      normalizedFocusNodeId,
      viewedNodeId,
      activeNodeId && activeNodeId !== 'all' ? activeNodeId : null,
      fallbackLocalId,
      nodeRecords[0]?.node.node_id ?? null,
    ].find((nodeId): nodeId is string => typeof nodeId === 'string' && knownNodeIds.has(nodeId)) ?? null

    if (!preferredNodeId) {
      return
    }

    setSelectedNodeId((current) => {
      if (normalizedFocusNodeId && knownNodeIds.has(normalizedFocusNodeId)) {
        return normalizedFocusNodeId
      }
      if (current && knownNodeIds.has(current)) {
        return current
      }
      return preferredNodeId
    })
    setExpandedNodeIds((previous) => (
      previous[preferredNodeId]
        ? previous
        : { ...previous, [preferredNodeId]: true }
    ))

    if (normalizedFocusNodeId && knownNodeIds.has(normalizedFocusNodeId)) {
      setViewedNode(NODE_PAGE_KEYS.platform, normalizedFocusNodeId)
    }
  }, [activeNodeId, fallbackLocalId, nodeRecords, normalizedFocusNodeId, viewedNodeId])

  const filteredRecords = useMemo(() => {
    const needle = searchValue.trim().toLowerCase()
    if (!needle) {
      return nodeRecords
    }

    return nodeRecords.filter((record) => {
      const fields = [
        formatNodeDisplayName(record.node),
        record.roleLabel,
        record.statusLabel,
        record.alertCopy,
        ...record.peerLinks.map((peerLink) => {
          const peerNode = nodesById.get(peerLink.peerNodeId)
          return peerNode ? formatNodeDisplayName(peerNode) : peerLink.peerNodeId
        }),
      ]

      return fields.some((field) => field.toLowerCase().includes(needle))
    })
  }, [nodeRecords, nodesById, searchValue])

  const selectedRecord = useMemo(
    () => nodeRecords.find((record) => record.node.node_id === selectedNodeId) ?? null,
    [nodeRecords, selectedNodeId],
  )

  const graphModel = useMemo(() => buildClusterDashboardWorkspaceGraphModel({
    nodes: sortedNodes,
    audioEdges,
    networkEdges,
    selectedNodeId,
    viewedNodeId,
    deploymentMode: layer.summaryMetrics.find((metric) => metric.id === 'cluster-mode')?.value ?? null,
  }), [
    audioEdges,
    layer.summaryMetrics,
    networkEdges,
    selectedNodeId,
    sortedNodes,
    viewedNodeId,
  ])

  const errorMessages = [queryErrorMessage(topologyQuery.error)].filter((message): message is string => Boolean(message))
  const activePeerLinkCount = Array.from(peerLinksByNodeId.values()).reduce((sum, peerLinks) => sum + peerLinks.length, 0) / 2
  const averageCpuPercent = filteredRecords.length > 0
    ? filteredRecords.reduce((sum, record) => sum + record.node.cpu_percent, 0) / filteredRecords.length
    : null
  const averageMemoryPercent = filteredRecords.length > 0
    ? filteredRecords.reduce((sum, record) => sum + record.node.memory_percent, 0) / filteredRecords.length
    : null
  const grafanaPanels = useMemo<PlatformGrafanaPanelDefinition[]>(() => [
    {
      id: 'cluster-dashboard-fleet',
      title: 'Fleet Runtime',
      description: '24-hour fleet trend for aggregate load and active cluster audio paths.',
      yAxisDomain: [0, 100],
      series: [
        { key: 'avgCpu', label: 'Avg CPU %', value: averageCpuPercent, color: 'var(--cds-link-primary)' },
        { key: 'avgMemory', label: 'Avg Memory %', value: averageMemoryPercent, color: 'var(--cds-support-warning)' },
        { key: 'audioPaths', label: 'Audio Paths', value: audioEdges.filter((edge) => edge.active).length, color: 'var(--cds-support-success)' },
      ],
    },
    {
      id: 'cluster-dashboard-focus',
      title: 'Focused Node',
      description: 'Selected node trend for health, peer-link density, latency, and xruns.',
      yAxisDomain: [0, 100],
      series: [
        { key: 'healthPercent', label: 'Health %', value: selectedRecord?.healthPercent ?? null, color: 'var(--cds-support-success)' },
        { key: 'peerLinks', label: 'Peer Links', value: selectedRecord?.peerLinks.length ?? null, color: 'var(--cds-text-primary)' },
        { key: 'latencyMs', label: 'Latency ms', value: selectedRecord?.node.audio_latency_ms ?? null, color: 'var(--cds-support-info)' },
        { key: 'xruns', label: 'XRuns', value: selectedRecord?.node.xrun_count ?? null, color: 'var(--cds-support-error)' },
      ],
    },
  ], [audioEdges, averageCpuPercent, averageMemoryPercent, selectedRecord])

  const handleSelectNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId)
    setExpandedNodeIds((previous) => ({ ...previous, [nodeId]: true }))
  }, [])

  const handleGraphSelection = useCallback((selection: ClusterDashboardWorkspaceGraphSelection) => {
    setHighlightedAnchorId(selection.anchorId)
    handleSelectNode(selection.recordId)
    tableSectionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }, [handleSelectNode])

  const handleAdoptNodeContext = useCallback((nodeId: string) => {
    setViewedNode(NODE_PAGE_KEYS.platform, nodeId)
    setActiveNode(nodeId === fallbackLocalId ? null : nodeId)
    handleSelectNode(nodeId)
  }, [fallbackLocalId, handleSelectNode, setActiveNode, setViewedNode])

  const handleOpenManagementWorkspace = useCallback((nodeId: string) => {
    handleAdoptNodeContext(nodeId)
    navigate(buildPlatformNodeWorkspaceHref('management', nodeId))
  }, [handleAdoptNodeContext, navigate])

  const isLoading = topologyQuery.isLoading && nodes.length === 0

  return (
    <div className="cluster-dashboard-workspace">
      <section className="cluster-dashboard-workspace__section" aria-labelledby="cluster-dashboard-workspace-graph">
        <div className="cluster-dashboard-workspace__section-header">
          <div>
            <h3 id="cluster-dashboard-workspace-graph" className="cluster-dashboard-workspace__section-title">Cluster Topology Workspace</h3>
            <p className="cluster-dashboard-workspace__muted">{graphModel.pulseCopy}</p>
          </div>
          <div className="cluster-dashboard-workspace__tag-row">
            {graphModel.summaryTags.map((tag) => (
              <Tag key={tag.label} type={tag.type}>{tag.label}</Tag>
            ))}
          </div>
        </div>

        <Tile className="cluster-dashboard-workspace__hero">
          {isLoading ? (
            <div className="cluster-dashboard-workspace__graph-loading">
              <LoadingState description="Loading cluster topology" />
            </div>
          ) : (
            <ClusterDashboardWorkspaceGraph model={graphModel} onSelect={handleGraphSelection} />
          )}
        </Tile>
      </section>

      <section className="cluster-dashboard-workspace__snapshot-grid" aria-label="Cluster telemetry snapshots">
        {layer.gridItems.map((item) => (
          <Tile key={item.id} className="cluster-dashboard-workspace__snapshot-tile">
            <div className="cluster-dashboard-workspace__snapshot-head">
              <p>{item.eyebrow}</p>
              <Tag type={platformHealthTagType(item.status)}>{item.status}</Tag>
            </div>
            <strong>{item.metric}</strong>
            <span>{item.title}</span>
            <small>{item.helper}</small>
          </Tile>
        ))}
      </section>

      {errorMessages.length > 0 ? (
        <div className="cluster-dashboard-workspace__errors">
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
        ref={tableSectionRef}
        id="cluster-dashboard-nodes"
        className={`cluster-dashboard-workspace__section${highlightedAnchorId === 'cluster-dashboard-nodes' ? ' is-highlighted' : ''}`}
        aria-labelledby="cluster-dashboard-node-table"
      >
        <div className="cluster-dashboard-workspace__section-header">
          <div>
            <h3 id="cluster-dashboard-node-table" className="cluster-dashboard-workspace__section-title">Cluster nodes</h3>
            <p className="cluster-dashboard-workspace__muted">
              Expand a node row to inspect service posture, peer-link activity, and launch the node-scoped Management workspace from the same cluster context.
            </p>
          </div>
          <div className="cluster-dashboard-workspace__tag-row">
            <Tag type="cool-gray">{filteredRecords.length} node{filteredRecords.length === 1 ? '' : 's'}</Tag>
            <Tag type={activePeerLinkCount > 0 ? 'green' : 'warm-gray'}>{activePeerLinkCount} peer link{activePeerLinkCount === 1 ? '' : 's'}</Tag>
            {selectedRecord ? <Tag type={getNodeStatusTagType(selectedRecord.node.status)}>{formatNodeDisplayName(selectedRecord.node)}</Tag> : null}
          </div>
        </div>

        <Tile className="cluster-dashboard-workspace__table-tile">
          {filteredRecords.length === 0 ? (
            <EmptyState
              className="cluster-dashboard-workspace__table-state"
              title="No cluster nodes match this search"
              description="Adjust the search text to bring matching nodes back into the cluster view."
              compact
            />
          ) : (
            <TableContainer title={layer.tableTitle} className="cluster-dashboard-workspace__table-container">
              <TableToolbar>
                <TableToolbarContent>
                  <TableToolbarSearch
                    persistent
                    value={searchValue}
                    onChange={(_event, value) => setSearchValue(value ?? '')}
                  />
                  <Tag type="cool-gray">{audioEdges.filter((edge) => edge.active).length} active audio path{audioEdges.filter((edge) => edge.active).length === 1 ? '' : 's'}</Tag>
                  <Tag type="cool-gray">{networkEdges.filter((edge) => edge.latency_ms !== null).length} latency sample{networkEdges.filter((edge) => edge.latency_ms !== null).length === 1 ? '' : 's'}</Tag>
                </TableToolbarContent>
              </TableToolbar>

              <Table aria-label="Cluster topology nodes">
                <TableHead>
                  <TableRow>
                    <TableExpandHeader aria-label="Expand cluster node rows" />
                    <TableHeader>Node</TableHeader>
                    <TableHeader>Role</TableHeader>
                    <TableHeader>Status</TableHeader>
                    <TableHeader>CPU</TableHeader>
                    <TableHeader>Memory</TableHeader>
                    <TableHeader>Audio</TableHeader>
                    <TableHeader>Peers</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredRecords.map((record) => {
                    const rowId = record.node.node_id
                    const isExpanded = expandedNodeIds[rowId] ?? false
                    const expandedRowId = `${rowId}:expanded`

                    return (
                      <Fragment key={rowId}>
                        <TableExpandRow
                          aria-label={`Expand row for ${formatNodeDisplayName(record.node)}`}
                          aria-controls={expandedRowId}
                          isExpanded={isExpanded}
                          className={selectedNodeId === rowId ? 'cluster-dashboard-workspace__table-row is-highlighted' : 'cluster-dashboard-workspace__table-row'}
                          onExpand={() => {
                            setExpandedNodeIds((previous) => ({
                              ...previous,
                              [rowId]: !isExpanded,
                            }))
                            handleSelectNode(rowId)
                          }}
                        >
                          <TableCell>{formatNodeDisplayName(record.node)}</TableCell>
                          <TableCell>{record.roleLabel}</TableCell>
                          <TableCell>
                            <Tag type={getNodeStatusTagType(record.node.status)} size="sm">
                              {record.statusLabel}
                            </Tag>
                          </TableCell>
                          <TableCell>{formatPercent(record.node.cpu_percent)}</TableCell>
                          <TableCell>{formatPercent(record.node.memory_percent)}</TableCell>
                          <TableCell>{record.activeAudioCount}</TableCell>
                          <TableCell>{record.peerLinks.length}</TableCell>
                        </TableExpandRow>
                        <TableExpandedRow id={expandedRowId} colSpan={8}>
                          <NodeDetailPanel
                            record={record}
                            nodesById={nodesById}
                            onAdoptNodeContext={handleAdoptNodeContext}
                            onOpenManagementWorkspace={handleOpenManagementWorkspace}
                          />
                        </TableExpandedRow>
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Tile>
      </section>
    </div>
  )
}

export default ClusterDashboardWorkspace
