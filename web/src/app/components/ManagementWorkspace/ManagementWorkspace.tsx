import './ManagementWorkspace.css'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
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
import { useSearchParams } from 'react-router-dom'

import { PlatformGrafanaPanelDeck, type PlatformGrafanaPanelDefinition } from '../Platform/PlatformGrafanaPanel'
import type { PlatformHealth, PlatformLayerData, PlatformTableRow } from '../../platform/model'
import { useNodeTopology } from '../../hooks/useNodeTopology'
import { useViewedNode, useViewedNodeStore } from '../../stores/viewedNodeStore'
import type { NodeSummary } from '../../types/node'
import {
  NODE_PAGE_KEYS,
  buildNodeAlertMessage,
  computeNodeHealthPercent,
  formatNodeDisplayName,
  getNodeRoleLabel,
  getNodeStatusLabel,
  getNodeStatusTagType,
} from '../../utils/nodeDisplay'
import { ManagementWorkspaceGraph } from './ManagementWorkspaceGraph'
import { EmptyState } from '../shared/EmptyState'
import { LoadingState } from '../shared/LoadingState'
import {
  buildManagementWorkspaceGraphModel,
  type ManagementWorkspaceGraphSelection,
} from './managementWorkspaceGraph'

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

function healthTagType(status: PlatformHealth): 'green' | 'warm-gray' | 'red' | 'cool-gray' {
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

function rowTagType(value: string | number | boolean | null | undefined): 'green' | 'warm-gray' | 'red' | 'cool-gray' {
  const normalized = String(value ?? '').toLowerCase()
  if (normalized === 'healthy' || normalized === 'running' || normalized === 'clear' || normalized === 'ok') {
    return 'green'
  }
  if (normalized === 'warning' || normalized === 'warn') {
    return 'warm-gray'
  }
  if (normalized === 'critical' || normalized === 'offline' || normalized === 'down' || normalized === 'error') {
    return 'red'
  }
  return 'cool-gray'
}

function queryErrorMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : null
}

function normalizeNodeId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function nodeSummaryRecord(node: NodeSummary) {
  return {
    healthPercent: computeNodeHealthPercent(node),
    statusLabel: getNodeStatusLabel(node.status),
    roleLabel: getNodeRoleLabel(node.role),
    alertCopy: buildNodeAlertMessage(node),
  }
}

function ExpandedRow({
  row,
  selectedNode,
}: {
  row: PlatformTableRow
  selectedNode: NodeSummary | null
}) {
  const selectedNodeSummary = selectedNode ? nodeSummaryRecord(selectedNode) : null
  return (
    <div className="management-workspace__expanded-row">
      <div className="management-workspace__expanded-grid">
        <article className="management-workspace__expanded-card">
          <div className="management-workspace__expanded-card-head">
            <h4>Subsystem detail</h4>
            <Tag type={rowTagType(row.status)}>{String(row.status ?? 'unknown')}</Tag>
          </div>
          <dl className="management-workspace__detail-list">
            <div>
              <dt>Service</dt>
              <dd>{String(row.name ?? row.id)}</dd>
            </div>
            <div>
              <dt>Primary detail</dt>
              <dd>{String(row.metric1 ?? 'n/a')}</dd>
            </div>
            <div>
              <dt>Supporting info</dt>
              <dd>{String(row.metric2 ?? 'n/a')}</dd>
            </div>
            <div>
              <dt>Alert posture</dt>
              <dd>{String(row.alerts ?? 'Clear')}</dd>
            </div>
          </dl>
        </article>

        <article className="management-workspace__expanded-card">
          <div className="management-workspace__expanded-card-head">
            <h4>Node context</h4>
            {selectedNode ? (
              <Tag type={getNodeStatusTagType(selectedNode.status)}>{selectedNodeSummary?.statusLabel}</Tag>
            ) : (
              <Tag type="cool-gray">pending</Tag>
            )}
          </div>
          {selectedNode ? (
            <dl className="management-workspace__detail-list">
              <div>
                <dt>Node</dt>
                <dd>{formatNodeDisplayName(selectedNode)}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>{selectedNodeSummary?.roleLabel}</dd>
              </div>
              <div>
                <dt>Health</dt>
                <dd>{selectedNodeSummary?.healthPercent}%</dd>
              </div>
              <div>
                <dt>Last seen</dt>
                <dd>{formatLastSeen(selectedNode.last_seen)}</dd>
              </div>
              <div>
                <dt>Latency</dt>
                <dd>{selectedNode.audio_latency_ms.toFixed(1)} ms</dd>
              </div>
              <div>
                <dt>Alert focus</dt>
                <dd>{selectedNodeSummary?.alertCopy}</dd>
              </div>
            </dl>
          ) : (
            <p className="management-workspace__footer-note">
              Node topology is still loading, so management context has not been attached to this row yet.
            </p>
          )}
        </article>
      </div>
      <p className="management-workspace__footer-note">
        Deep change actions stay in the management action panel below so operators can confirm update, backup, deployment-mode, and remediation flows separately from the scan-first table.
      </p>
    </div>
  )
}

export function ManagementWorkspace({
  layer,
}: {
  layer: PlatformLayerData
}) {
  const [searchParams] = useSearchParams()
  const topologyQuery = useNodeTopology()
  const setViewedNode = useViewedNodeStore((state) => state.setViewedNode)
  const topology = topologyQuery.data
  const nodes = Array.isArray(topology?.nodes) ? topology.nodes : []
  const localNode = nodes.find((node) => node.is_local) ?? nodes[0] ?? null
  const viewedNodeId = useViewedNode(NODE_PAGE_KEYS.platform, localNode?.node_id ?? 'local')
  const focusedNodeId = normalizeNodeId(searchParams.get('focusNodeId'))
  const effectiveViewedNodeId = focusedNodeId ?? viewedNodeId
  const selectedNode = nodes.find((node) => node.node_id === effectiveViewedNodeId) ?? localNode
  const [searchValue, setSearchValue] = useState('')
  const [selectedRowId, setSelectedRowId] = useState<string | null>(layer.tableRows[0]?.id ?? null)
  const tableRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!focusedNodeId || !nodes.some((node) => node.node_id === focusedNodeId)) {
      return
    }

    setViewedNode(NODE_PAGE_KEYS.platform, focusedNodeId)
  }, [focusedNodeId, nodes, setViewedNode])

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase()
    if (!normalizedSearch) {
      return layer.tableRows
    }

    return layer.tableRows.filter((row) => (
      Object.values(row)
        .some((value) => String(value ?? '').toLowerCase().includes(normalizedSearch))
    ))
  }, [layer.tableRows, searchValue])

  const graphModel = useMemo(() => (
    buildManagementWorkspaceGraphModel({
      selectedNode,
      tableRows: filteredRows,
      summaryMetrics: layer.summaryMetrics,
      selectedRowId,
    })
  ), [filteredRows, layer.summaryMetrics, selectedNode, selectedRowId])

  const handleGraphSelect = useCallback((selection: ManagementWorkspaceGraphSelection) => {
    if (selection.recordId === 'management-hub') {
      return
    }

    setSelectedRowId(selection.recordId)
    if (typeof tableRef.current?.scrollIntoView === 'function') {
      tableRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const topologyError = queryErrorMessage(topologyQuery.error)
  const selectedNodeSummary = selectedNode ? nodeSummaryRecord(selectedNode) : null
  const grafanaPanels = useMemo<PlatformGrafanaPanelDefinition[]>(() => {
    const servicesOnline = selectedNode
      ? Number(Boolean(selectedNode.services.backend))
        + Number(Boolean(selectedNode.services.juce_engine))
        + Number(Boolean(selectedNode.services.pipewire))
      : null

    return [
      {
        id: 'management-node-runtime',
        title: 'Node Runtime',
        description: 'Context-sensitive runtime trend for the currently viewed management node.',
        yAxisDomain: [0, 100],
        series: [
          { key: 'healthPercent', label: 'Health %', value: selectedNodeSummary?.healthPercent ?? null, color: 'var(--cds-support-success)' },
          { key: 'cpuPercent', label: 'CPU %', value: selectedNode?.cpu_percent ?? null, color: 'var(--cds-link-primary)' },
          { key: 'memoryPercent', label: 'Memory %', value: selectedNode?.memory_percent ?? null, color: 'var(--cds-support-warning)' },
        ],
      },
      {
        id: 'management-audio-stability',
        title: 'Audio Stability',
        description: 'Latency, xruns, and service readiness for the same node context.',
        series: [
          { key: 'latencyMs', label: 'Latency ms', value: selectedNode?.audio_latency_ms ?? null, color: 'var(--cds-support-info)' },
          { key: 'xruns', label: 'XRuns', value: selectedNode?.xrun_count ?? null, color: 'var(--cds-support-error)' },
          { key: 'servicesOnline', label: 'Services Online', value: servicesOnline, color: 'var(--cds-text-primary)' },
        ],
      },
    ]
  }, [selectedNode, selectedNodeSummary?.healthPercent])

  return (
    <div className="management-workspace">
      <section className="management-workspace__section" aria-labelledby="management-workspace-hero">
        <div className="management-workspace__section-header">
          <div>
            <h3 id="management-workspace-hero" className="management-workspace__section-title">Management workspace</h3>
            <p className="management-workspace__muted">
              Graph-first management posture for service readiness, deployment identity, and maintenance actions across the currently viewed node context.
            </p>
          </div>
          <div className="management-workspace__tag-row">
            {graphModel.summaryTags.map((tag) => (
              <Tag key={tag.label} type={tag.type}>{tag.label}</Tag>
            ))}
          </div>
        </div>

        {topologyError && (
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title="Topology loaded with gaps"
            subtitle={topologyError}
          />
        )}

        <div className="management-workspace__snapshot-grid">
          {layer.gridItems.map((item) => (
            <Tile key={item.id} className="management-workspace__snapshot-tile">
              <div className="management-workspace__snapshot-head">
                <p>{item.eyebrow}</p>
                <Tag type={healthTagType(item.status)}>{item.status}</Tag>
              </div>
              <strong>{item.metric}</strong>
              <span>{item.title}</span>
              <small>{item.helper}</small>
            </Tile>
          ))}
        </div>

        <Tile className="management-workspace__hero">
          {topologyQuery.isLoading && nodes.length === 0 ? (
            <div className="management-workspace__graph-loading">
              <LoadingState description="Loading management telemetry" />
            </div>
          ) : (
            <ManagementWorkspaceGraph model={graphModel} onSelect={handleGraphSelect} />
          )}
        </Tile>
      </section>

      <section
        ref={tableRef}
        className={`management-workspace__section${selectedRowId ? ' is-highlighted' : ''}`}
        aria-labelledby="management-workspace-services"
      >
        <PlatformGrafanaPanelDeck panels={grafanaPanels} />
        <div className="management-workspace__section-header">
          <div>
            <h3 id="management-workspace-services" className="management-workspace__section-title">Services and platform operations</h3>
            <p className="management-workspace__muted">{graphModel.pulseCopy}</p>
          </div>
          {selectedNode && (
            <div className="management-workspace__tag-row">
              <Tag type={getNodeStatusTagType(selectedNode.status)}>{selectedNodeSummary?.statusLabel}</Tag>
              <Tag type="cool-gray">{selectedNodeSummary?.roleLabel}</Tag>
              <Tag type="cool-gray">{formatNodeDisplayName(selectedNode)}</Tag>
            </div>
          )}
        </div>

        <Tile className="management-workspace__table-tile">
          <TableContainer
            title={layer.tableTitle}
            description={layer.tableDescription}
            className="management-workspace__table-container"
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
                  <TableExpandHeader aria-label="Expand management row" />
                  {layer.tableColumns.map((column) => (
                    <TableHeader key={column.key}>{column.header}</TableHeader>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={layer.tableColumns.length + 1}>
                      <EmptyState
                        title="No management rows match this search"
                        description="Clear or adjust the search text to show more management records."
                        compact
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((row) => {
                    const expanded = row.id === selectedRowId
                    return (
                      <Fragment key={row.id}>
                        <TableExpandRow
                          aria-label={`Expand management row for ${String(row.name ?? row.id)}`}
                          className={expanded ? 'management-workspace__table-row is-highlighted' : 'management-workspace__table-row'}
                          isExpanded={expanded}
                          onExpand={() => setSelectedRowId(expanded ? null : row.id)}
                        >
                          {layer.tableColumns.map((column) => (
                            <TableCell key={`${row.id}-${column.key}`}>
                              {column.key === 'status' ? (
                                <Tag type={rowTagType(row[column.key])}>{String(row[column.key] ?? 'unknown')}</Tag>
                              ) : (
                                String(row[column.key] ?? 'n/a')
                              )}
                            </TableCell>
                          ))}
                        </TableExpandRow>
                        {expanded && (
                          <TableExpandedRow colSpan={layer.tableColumns.length + 1}>
                            <ExpandedRow row={row} selectedNode={selectedNode} />
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

export default ManagementWorkspace
