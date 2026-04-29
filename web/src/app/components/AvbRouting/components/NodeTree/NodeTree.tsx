// Node Tree Component — hierarchical sidebar for network nodes.
// T2475 (E1) Carbon migration:
//   Drawer/Paper      → semantic <aside>
//   List/ListItem...  → semantic <ul>/<li> + Carbon Button (kind ghost)
//   IconButton        → Carbon Button hasIconOnly kind ghost size sm
//   Collapse          → conditional render with CSS transition
//   Chip              → StatusChip (canonical primitive)
//   Tooltip (MUI)     → Carbon Tooltip
//   Typography        → semantic spans
// useTheme/useMediaQuery removed; layout breakpoints now live in CSS.

import React, { useState, useMemo } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Devices,
  DotMark,
  Pin,
  PortInput,
  PortOutput,
  Router,
} from '@carbon/icons-react'
import { Tooltip } from '@carbon/react'

import { StatusChip } from '../../../primitives'
import { useAvbDevices, useAvbStreams } from '../../hooks/useAvbApi'
import { useNodes, useLocalNodeId } from '../../hooks/useNodeApi'
import { useRouting, useFilteredEndpoints } from '../../context/RoutingContext'
import type { AvbDiscoveredDevice, AvbNode, Endpoint, AvbStreamPayload } from '../../types'
import { sortNodesForNavigation } from '../../utils/nodeSorting'
import { getMap2StreamEndpointIds } from '../../utils/avbRouteStreams'
import { resolveAvbHostLabel } from '../../utils/avbHost'
import './NodeTree.css'

// Biamp brand red — preserved per §10.5 hardware-skin exception
// (the Tesira "b" letterform is a vendor-mark, not chrome).
const BIAMP_RED = '#E31837'

type NodeAvbHealthSummary = {
  totalEndpoints: number
  syncedEndpoints: number
  missingCacheEndpoints: number
  unavailableEndpoints: number
  cachedUnavailableEndpoints: number
  issueEndpoints: number
}

const EMPTY_NODE_HEALTH: NodeAvbHealthSummary = {
  totalEndpoints: 0,
  syncedEndpoints: 0,
  missingCacheEndpoints: 0,
  unavailableEndpoints: 0,
  cachedUnavailableEndpoints: 0,
  issueEndpoints: 0,
}

type NodeAvbFailoverSummary = {
  streamCount: number
  policySummary: string
  interfaceSummary: string
  topPolicy: string
}

const EMPTY_NODE_FAILOVER: NodeAvbFailoverSummary = {
  streamCount: 0,
  policySummary: 'No failover data',
  interfaceSummary: 'No interface candidates',
  topPolicy: 'none',
}

function summarizeFailoverCounts(counts: Record<string, number>): string {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => `${key} (${count})`)
    .join(', ') || 'No data'
}

function buildNodeAvbFailoverById(
  nodes: AvbNode[],
  endpoints: Endpoint[],
  streams: AvbStreamPayload[],
): Record<string, NodeAvbFailoverSummary> {
  const nodeIdsByEndpointId = new Map<string, string>()
  for (const endpoint of endpoints) {
    nodeIdsByEndpointId.set(endpoint.endpoint_id, endpoint.node_id)
  }

  const streamIdsByNodeId = new Map<string, AvbStreamPayload[]>()
  for (const stream of streams) {
    const endpointIds = getMap2StreamEndpointIds(stream.stream_id)
    const matchedNodeIds = new Set<string>()
    for (const endpointId of endpointIds) {
      const nodeId = nodeIdsByEndpointId.get(endpointId)
      if (nodeId) matchedNodeIds.add(nodeId)
    }
    for (const nodeId of matchedNodeIds) {
      const list = streamIdsByNodeId.get(nodeId) || []
      list.push(stream)
      streamIdsByNodeId.set(nodeId, list)
    }
  }

  const byNodeId: Record<string, NodeAvbFailoverSummary> = {}
  for (const node of nodes) {
    const nodeStreams = streamIdsByNodeId.get(node.node_id) || []
    if (nodeStreams.length === 0) continue
    const policyCounts: Record<string, number> = {}
    const interfaceCounts: Record<string, number> = {}
    for (const stream of nodeStreams) {
      const policy = stream.diagnostics?.effective_config.failover_policy || 'none'
      policyCounts[policy] = (policyCounts[policy] || 0) + 1
      const candidates = stream.diagnostics?.effective_config.interface_candidates || []
      for (const candidate of candidates) {
        interfaceCounts[candidate] = (interfaceCounts[candidate] || 0) + 1
      }
    }
    const topPolicy = Object.entries(policyCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'none'
    byNodeId[node.node_id] = {
      streamCount: nodeStreams.length,
      policySummary: summarizeFailoverCounts(policyCounts),
      interfaceSummary: summarizeFailoverCounts(interfaceCounts),
      topPolicy,
    }
  }
  return byNodeId
}

function buildNodeAvbHealthById(
  nodes: AvbNode[],
  endpoints: Endpoint[],
  discoveredDevices: AvbDiscoveredDevice[],
): Record<string, NodeAvbHealthSummary> {
  const discoveredByEndpointId = new Map<string, AvbDiscoveredDevice>()
  for (const device of discoveredDevices) {
    if (!device.endpoint_id) continue
    discoveredByEndpointId.set(device.endpoint_id, device)
  }

  const byNodeId: Record<string, NodeAvbHealthSummary> = {}
  for (const node of nodes) {
    const nodeEndpoints = endpoints.filter((endpoint) => endpoint.node_id === node.node_id)
    let syncedEndpoints = 0
    let missingCacheEndpoints = 0
    let unavailableEndpoints = 0
    let cachedUnavailableEndpoints = 0
    let issueEndpoints = 0

    for (const endpoint of nodeEndpoints) {
      const cachedDevice = discoveredByEndpointId.get(endpoint.endpoint_id)
      const missingFromCache = cachedDevice === undefined
      const endpointUnavailable = !endpoint.available
      const cachedUnavailable = cachedDevice ? !cachedDevice.available : false

      if (cachedDevice) syncedEndpoints += 1
      else missingCacheEndpoints += 1
      if (endpointUnavailable) unavailableEndpoints += 1
      if (cachedUnavailable) cachedUnavailableEndpoints += 1
      if (missingFromCache || endpointUnavailable || cachedUnavailable) issueEndpoints += 1
    }

    byNodeId[node.node_id] = {
      totalEndpoints: nodeEndpoints.length,
      syncedEndpoints,
      missingCacheEndpoints,
      unavailableEndpoints,
      cachedUnavailableEndpoints,
      issueEndpoints,
    }
  }
  return byNodeId
}

function isActivationKey(key: string): boolean {
  return key === 'Enter' || key === ' ' || key === 'Spacebar'
}

function NodeStatusBadge({ node, avbHealth }: { node: AvbNode; avbHealth: NodeAvbHealthSummary }) {
  const ptpSynced = node.ptp?.state === 'master' || node.ptp?.state === 'slave'
  const hasAvbIssues = avbHealth.issueEndpoints > 0

  let toneClass = 'node-tree__status-dot--ok'
  if (node.status === 'offline') {
    toneClass = 'node-tree__status-dot--offline'
  } else if (node.status === 'degraded' || !ptpSynced || hasAvbIssues) {
    toneClass = 'node-tree__status-dot--warn'
  }

  const tooltipLabel = (() => {
    if (node.status === 'offline') return 'Offline'
    const parts = [ptpSynced ? `PTP ${node.ptp?.state}` : 'No PTP sync']
    if (hasAvbIssues) parts.push(`AVB issues ${avbHealth.issueEndpoints}`)
    return `Online • ${parts.join(' • ')}`
  })()

  return (
    <Tooltip label={tooltipLabel} align="top">
      <button type="button" className="node-tree__status-trigger" aria-label={tooltipLabel}>
        <DotMark size={14} className={`node-tree__status-dot ${toneClass}`} />
      </button>
    </Tooltip>
  )
}

interface EndpointItemProps {
  endpoint: Endpoint
  nodeColor: string
  hostLabel?: string
}

function EndpointItem({ endpoint, nodeColor, hostLabel }: EndpointItemProps) {
  const isTalker = endpoint.direction === 'talker'
  const hostText = hostLabel || ''
  const subText = hostText
    ? `${endpoint.channels}ch @ ${endpoint.sample_rate / 1000}k • ${hostText}`
    : `${endpoint.channels}ch @ ${endpoint.sample_rate / 1000}k`

  return (
    <li className="node-tree__endpoint">
      <span className="node-tree__endpoint-icon" style={{ color: nodeColor }}>
        {isTalker ? <PortOutput size={16} /> : <PortInput size={16} />}
      </span>
      <span className="node-tree__endpoint-copy">
        <span className="node-tree__endpoint-primary">{endpoint.device_name}</span>
        <span className="node-tree__endpoint-secondary">{subText}</span>
      </span>
      {endpoint.pinned && (
        <span className="node-tree__endpoint-pin" aria-label="Pinned">
          <Pin size={12} />
        </span>
      )}
    </li>
  )
}

interface NodeTreeItemProps {
  node: AvbNode
  isLocal: boolean
  isSelected: boolean
  avbHealth: NodeAvbHealthSummary
  avbFailover: NodeAvbFailoverSummary
  discoveredHostByEndpointId: Map<string, string>
  onSelect: () => void
}

function NodeTreeItem({
  node,
  isLocal,
  isSelected,
  avbHealth,
  avbFailover,
  discoveredHostByEndpointId,
  onSelect,
}: NodeTreeItemProps) {
  const [expanded, setExpanded] = useState(false)
  const endpoints = useFilteredEndpoints()
  const endpointListId = `node-tree-endpoints-${node.node_id}`

  const handleExpandToggle = (event: React.SyntheticEvent<HTMLElement>) => {
    event.stopPropagation()
    setExpanded((value) => !value)
  }

  const nodeEndpoints = endpoints.filter((ep) => ep.node_id === node.node_id)
  const talkers = nodeEndpoints.filter((ep) => ep.direction === 'talker')
  const listeners = nodeEndpoints.filter((ep) => ep.direction === 'listener')

  const DeviceIcon = node.type === 'tesira'
    ? null
    : node.type.startsWith('map2')
      ? Devices
      : Router

  const accentColor = node.type === 'tesira' ? BIAMP_RED : node.color
  const itemStyle = isSelected
    ? { borderLeftColor: accentColor, backgroundColor: `${accentColor}11` }
    : { borderLeftColor: 'transparent' }

  return (
    <li className="node-tree__item-wrapper">
      <div
        role="button"
        tabIndex={0}
        className={`node-tree__item ${isSelected ? 'node-tree__item--selected' : ''}`}
        style={itemStyle}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (!isActivationKey(event.key)) return
          event.preventDefault()
          onSelect()
        }}
        data-testid={`node-tree-item-${node.node_id}`}
        data-selected={isSelected ? 'true' : 'false'}
        data-node-selected={isSelected ? 'true' : 'false'}
      >
        <button
          type="button"
          tabIndex={0}
          onClick={handleExpandToggle}
          onKeyDown={(event) => {
            if (!isActivationKey(event.key)) return
            event.preventDefault()
            handleExpandToggle(event)
          }}
          aria-expanded={expanded ? 'true' : 'false'}
          aria-controls={endpointListId}
          aria-label={`Toggle endpoints for ${node.name}`}
          data-testid={`node-tree-expand-${node.node_id}`}
          className="node-tree__expand"
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>

        <span className="node-tree__device-icon">
          {node.type === 'tesira' ? (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              aria-label="Biamp Tesira"
              className="node-tree__tesira-mark"
            >
              <rect x="5" y="3" width="3" height="18" rx="1.5" fill={BIAMP_RED} />
              <path
                d="M8 10 C8 10 18 10 18 14.5 C18 19 8 19 8 19"
                stroke={BIAMP_RED}
                strokeWidth="3"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          ) : (
            DeviceIcon ? <DeviceIcon size={18} /> : null
          )}
          <NodeStatusBadge node={node} avbHealth={avbHealth} />
        </span>

        <span className="node-tree__copy">
          <span className="node-tree__name-row">
            <span
              className={`node-tree__name ${isSelected ? 'node-tree__name--selected' : ''}`}
            >
              {node.name}
            </span>
            {isLocal && <StatusChip tone="info" label="Local" size="sm" />}
            {node.type === 'tesira' && (
              <span className="node-tree__tesira-tag" style={{ background: BIAMP_RED }}>
                Tesira
              </span>
            )}
          </span>
          <span className="node-tree__chip-row">
            <Tooltip label={`${talkers.length} talkers`} align="top">
              <span data-testid={`node-tree-talkers-${node.node_id}`}>
                <StatusChip
                  tone="neutral"
                  label={
                    <span className="node-tree__chip-label">
                      <PortOutput size={12} />
                      {talkers.length}
                    </span>
                  }
                  size="sm"
                />
              </span>
            </Tooltip>
            <Tooltip label={`${listeners.length} listeners`} align="top">
              <span data-testid={`node-tree-listeners-${node.node_id}`}>
                <StatusChip
                  tone="neutral"
                  label={
                    <span className="node-tree__chip-label">
                      <PortInput size={12} />
                      {listeners.length}
                    </span>
                  }
                  size="sm"
                />
              </span>
            </Tooltip>
            <Tooltip label={`${node.active_routes} active routes`} align="top">
              <span data-testid={`node-tree-routes-${node.node_id}`}>
                <StatusChip
                  tone="neutral"
                  label={
                    <span className="node-tree__chip-label">
                      <Router size={12} />
                      {node.active_routes}
                    </span>
                  }
                  size="sm"
                />
              </span>
            </Tooltip>
            <Tooltip
              label={`${avbHealth.syncedEndpoints}/${avbHealth.totalEndpoints} endpoints synced to engine cache`}
              align="top"
            >
              <span data-testid={`node-tree-sync-chip-${node.node_id}`}>
                <StatusChip
                  tone="neutral"
                  label={`Sync ${avbHealth.syncedEndpoints}/${avbHealth.totalEndpoints}`}
                  size="sm"
                />
              </span>
            </Tooltip>
            <Tooltip
              label={
                avbHealth.issueEndpoints === 0
                  ? 'No AVB endpoint issues detected'
                  : `Issues ${avbHealth.issueEndpoints}: missing cache ${avbHealth.missingCacheEndpoints}, endpoint unavailable ${avbHealth.unavailableEndpoints}, cache unavailable ${avbHealth.cachedUnavailableEndpoints}`
              }
              align="top"
            >
              <span data-testid={`node-tree-issues-chip-${node.node_id}`}>
                <StatusChip
                  tone={avbHealth.issueEndpoints > 0 ? 'caution' : 'neutral'}
                  label={`Issues ${avbHealth.issueEndpoints}`}
                  size="sm"
                />
              </span>
            </Tooltip>
            {avbFailover.streamCount > 0 && (
              <Tooltip
                label={`Failover policies: ${avbFailover.policySummary} | Interfaces: ${avbFailover.interfaceSummary}`}
                align="top"
              >
                <span data-testid={`node-tree-failover-chip-${node.node_id}`}>
                  <StatusChip
                    tone={avbFailover.topPolicy === 'none' ? 'neutral' : 'info'}
                    label={`Failover ${avbFailover.streamCount}`}
                    size="sm"
                  />
                </span>
              </Tooltip>
            )}
          </span>
        </span>
      </div>

      {expanded && (
        <ul
          id={endpointListId}
          className="node-tree__endpoint-list"
        >
          {talkers.length > 0 && (
            <>
              <li className="node-tree__endpoint-section">
                Talkers ({talkers.length})
              </li>
              {talkers.map((ep) => (
                <EndpointItem
                  key={ep.endpoint_id}
                  endpoint={ep}
                  hostLabel={discoveredHostByEndpointId.get(ep.endpoint_id) || resolveAvbHostLabel(ep)}
                  nodeColor={node.color}
                />
              ))}
            </>
          )}
          {listeners.length > 0 && (
            <>
              <li className="node-tree__endpoint-section">
                Listeners ({listeners.length})
              </li>
              {listeners.map((ep) => (
                <EndpointItem
                  key={ep.endpoint_id}
                  endpoint={ep}
                  hostLabel={discoveredHostByEndpointId.get(ep.endpoint_id) || resolveAvbHostLabel(ep)}
                  nodeColor={node.color}
                />
              ))}
            </>
          )}
          {nodeEndpoints.length === 0 && (
            <li className="node-tree__endpoint node-tree__endpoint--empty">
              No endpoints discovered
            </li>
          )}
        </ul>
      )}
    </li>
  )
}

export function NodeTree() {
  const { state, dispatch } = useRouting()
  const { data: nodes = [] } = useNodes()
  const { data: avbDevicesData } = useAvbDevices()
  const { data: avbStreamsData } = useAvbStreams()
  const localNodeId = useLocalNodeId()

  const {
    current_node_id: currentNodeId,
    show_offline: showOfflineNodes,
    view_mode: viewMode,
    selected_node_ids: selectedNodeIds,
  } = state.network.nodeSelection
  const visibleNodes = showOfflineNodes ? nodes : nodes.filter((node) => node.status === 'online')
  const allEndpoints = Object.values((state.endpoints || {}) as Record<string, Endpoint>)

  const discoveredHostByEndpointId = useMemo(() => {
    const hostByEndpointId = new Map<string, string>()
    const discovered = avbDevicesData?.discovered_devices || []
    discovered.forEach((device) => {
      const hostLabel = resolveAvbHostLabel(device)
      if (hostLabel) hostByEndpointId.set(device.endpoint_id, hostLabel)
    })
    return hostByEndpointId
  }, [avbDevicesData?.discovered_devices])

  const nodeAvbHealthById = useMemo(
    () => buildNodeAvbHealthById(nodes, allEndpoints, avbDevicesData?.discovered_devices || []),
    [nodes, allEndpoints, avbDevicesData?.discovered_devices],
  )
  const nodeAvbFailoverById = useMemo(
    () => buildNodeAvbFailoverById(nodes, allEndpoints, avbStreamsData?.streams || []),
    [nodes, allEndpoints, avbStreamsData?.streams],
  )

  const sortedNodes = sortNodesForNavigation(visibleNodes, localNodeId)

  const handleNodeSelect = (nodeId: string) => {
    if (viewMode === 'multi_select') {
      dispatch({ type: 'TOGGLE_NODE_SELECTION', payload: nodeId })
      return
    }
    dispatch({ type: 'SELECT_NODE', payload: nodeId })
    dispatch({ type: 'SET_VIEW_MODE', payload: 'single_node' })
  }

  return (
    <aside className="node-tree">
      <div className="node-tree__header">
        <span className="node-tree__title">Network Nodes</span>
        <span className="node-tree__subtitle">
          {nodes.filter((n) => n.status === 'online').length} of {nodes.length} online
        </span>
      </div>

      <ul className="node-tree__list">
        {sortedNodes.map((node) => (
          <NodeTreeItem
            key={node.node_id}
            node={node}
            isLocal={node.node_id === localNodeId}
            avbHealth={nodeAvbHealthById[node.node_id] || EMPTY_NODE_HEALTH}
            avbFailover={nodeAvbFailoverById[node.node_id] || EMPTY_NODE_FAILOVER}
            discoveredHostByEndpointId={discoveredHostByEndpointId}
            isSelected={
              viewMode === 'single_node'
                ? currentNodeId === node.node_id
                : viewMode === 'multi_select'
                  ? selectedNodeIds.includes(node.node_id)
                  : false
            }
            onSelect={() => handleNodeSelect(node.node_id)}
          />
        ))}

        {nodes.length === 0 && (
          <li className="node-tree__empty">
            <span className="node-tree__empty-primary">No nodes discovered</span>
            <span className="node-tree__empty-secondary">Waiting for AVB discovery...</span>
          </li>
        )}
      </ul>
    </aside>
  )
}

export default NodeTree
