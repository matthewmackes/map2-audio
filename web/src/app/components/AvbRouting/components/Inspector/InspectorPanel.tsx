// Inspector Panel — right sidebar showing endpoint/route details and
// AVB/AVDECC health snapshots. T2475 (E1) Carbon migration:
//   Paper           → semantic <aside>
//   Box             → semantic divs
//   Typography      → semantic <span>/<h3>/<p>
//   Divider         → <hr>
//   List/ListItem   → <ul>/<li> with text rows
//   ListItemText    → primary/secondary spans
//   Chip            → StatusChip (canonical primitive)
// useTheme/useMediaQuery removed; layout now driven by CSS @media.
// All text labels and data-testid attributes preserved verbatim
// for the InspectorPanel.nodeContext test suite.

import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'

import { StatusChip } from '../../../primitives'
import type { StatusChipTone } from '../../../primitives'
import { useRoutingState } from '../../context/RoutingContext'
import { useAvbDevices, useAvbStreams, useAvdeccEntities } from '../../hooks/useAvbApi'
import type { AvbDiscoveredDevice, AvbStreamPayload } from '../../types'
import { getRouteStreams } from '../../utils/avbRouteStreams'
import { resolveAvbHostLabel } from '../../utils/avbHost'
import { hasEndpointOperationalIssue } from '../../utils/endpointIssues'
import { audioApi, chainsApi } from '@/map2/api'
import { EmptyState } from '../../../shared/EmptyState'
import './InspectorPanel.css'

interface StatRowProps {
  primary: ReactNode
  secondary: ReactNode
  testId?: string
}

function StatRow({ primary, secondary, testId }: StatRowProps) {
  return (
    <li className="inspector-panel__stat" data-testid={testId}>
      <span className="inspector-panel__stat-primary">{primary}</span>
      <span className="inspector-panel__stat-secondary">{secondary}</span>
    </li>
  )
}

export function InspectorPanel() {
  const state = useRoutingState()
  const { data: avbDevicesData } = useAvbDevices()
  const { data: avbStreamsData } = useAvbStreams()
  const { data: avdeccEntitiesData } = useAvdeccEntities()
  const { view_mode, current_node_id, selected_node_ids } = state.network.nodeSelection

  const selectedEndpointIds = state.selection.selectedEndpoints
  const selectedRouteIds = state.selection.selectedRoutes
  const hoveredCell = state.selection.hoveredCell

  const isNodeInActiveContext = (nodeId: string | undefined): boolean => {
    if (!nodeId) return false
    if (view_mode === 'single_node' && current_node_id) return nodeId === current_node_id
    if (view_mode === 'multi_select' && selected_node_ids.length > 0)
      return selected_node_ids.includes(nodeId)
    return true
  }

  const isEndpointInActiveContext = (endpoint: any): boolean => {
    if (!endpoint) return false
    return isNodeInActiveContext(endpoint.node_id)
  }

  const isRouteInActiveContext = (route: any): boolean => {
    if (!route) return false
    const talkerNodeId = state.endpoints[route.talker_id]?.node_id || route.talker_node_id
    const listenerNodeId = state.endpoints[route.listener_id]?.node_id || route.listener_node_id
    if (view_mode === 'single_node' && current_node_id) {
      return talkerNodeId === current_node_id || listenerNodeId === current_node_id
    }
    if (view_mode === 'multi_select' && selected_node_ids.length > 0) {
      return (talkerNodeId ? selected_node_ids.includes(talkerNodeId) : false) ||
        (listenerNodeId ? selected_node_ids.includes(listenerNodeId) : false)
    }
    return true
  }

  const selectedEndpointCandidate =
    selectedEndpointIds.length === 1 ? state.endpoints[selectedEndpointIds[0]] : null
  const selectedEndpoint = isEndpointInActiveContext(selectedEndpointCandidate)
    ? selectedEndpointCandidate
    : null

  const selectedRouteCandidate =
    selectedRouteIds.length === 1
      ? (state.liveRoutes[selectedRouteIds[0]] || state.pendingRoutes[selectedRouteIds[0]])
      : null
  const selectedRoute = isRouteInActiveContext(selectedRouteCandidate)
    ? selectedRouteCandidate
    : null

  const hoveredRouteCandidate = hoveredCell
    ? (state.liveRoutes[`${hoveredCell.talker_id}→${hoveredCell.listener_id}`] ||
       state.pendingRoutes[`${hoveredCell.talker_id}→${hoveredCell.listener_id}`])
    : null
  const hoveredRoute = isRouteInActiveContext(hoveredRouteCandidate)
    ? hoveredRouteCandidate
    : null

  const displayRoute = selectedRoute || hoveredRoute
  const discoveredDevices = avbDevicesData?.discovered_devices || []
  const discoveredDevicesByEndpointId = new Map<string, AvbDiscoveredDevice>(
    discoveredDevices.map((device) => [device.endpoint_id, device]),
  )
  const selectedEndpointDiscoveredDevice = selectedEndpoint
    ? discoveredDevicesByEndpointId.get(selectedEndpoint.endpoint_id)
    : null
  const endpointValues = Object.values(state.endpoints)
  const endpointIds = endpointValues.map((endpoint) => endpoint.endpoint_id)
  const missingFromEngineCache = endpointIds.filter(
    (endpointId) => !discoveredDevicesByEndpointId.has(endpointId),
  ).length
  const engineCacheOrphans = discoveredDevices.filter(
    (device) => !state.endpoints[device.endpoint_id],
  ).length
  const streamPayloads = avbStreamsData?.streams || []
  const transportReadyStreams = streamPayloads.filter((stream) => stream.health?.ready).length
  const transportIssueStreams = streamPayloads.filter((stream) => (
    stream.state === 'error' || (stream.health ? !stream.health.ready : false)
  )).length
  const diagnosticsReadyStreams = streamPayloads.filter((stream) => Boolean(stream.diagnostics)).length
  const ptpLockedStreams = streamPayloads.filter((stream) => stream.diagnostics?.ptp_lock.locked).length
  const tsnFullyConfiguredStreams = streamPayloads.filter((stream) => {
    const tsn = stream.diagnostics?.tsn_qdisc
    return Boolean(
      tsn && tsn.available && tsn.mqprio_configured && tsn.cbs_configured &&
      tsn.etf_configured && tsn.vlan_configured,
    )
  }).length
  const srpBoundStreams = streamPayloads.filter((stream) => stream.diagnostics?.srp.bound).length
  const failoverCandidateStreams = streamPayloads.filter((stream) => (
    (stream.diagnostics?.effective_config.interface_candidates.length || 0) > 1
  )).length

  const failoverPolicyCounts = streamPayloads.reduce<Record<string, number>>((acc, stream) => {
    const policy = stream.diagnostics?.effective_config.failover_policy || 'none'
    acc[policy] = (acc[policy] || 0) + 1
    return acc
  }, {})

  const failoverInterfaceCounts = streamPayloads.reduce<Record<string, number>>((acc, stream) => {
    const candidates = stream.diagnostics?.effective_config.interface_candidates || []
    candidates.forEach((iface) => { acc[iface] = (acc[iface] || 0) + 1 })
    return acc
  }, {})

  const topFailoverInterfaces = Object.entries(failoverInterfaceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([iface, count]) => `${iface} (${count})`)
    .join(', ') || '—'

  const failoverPolicySummary = Object.entries(failoverPolicyCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([policy, count]) => `${policy} (${count})`)
    .join(', ') || '—'
  const routeFailoverStreams: AvbStreamPayload[] = displayRoute ? getRouteStreams(displayRoute, streamPayloads) : []
  const isNodeScopedContext = (
    (view_mode === 'single_node' && Boolean(current_node_id)) ||
    (view_mode === 'multi_select' && selected_node_ids.length > 0)
  )
  const activeContextNodeIds = (() => {
    if (view_mode === 'single_node' && current_node_id) return [current_node_id]
    if (view_mode === 'multi_select' && selected_node_ids.length > 0) {
      return Array.from(new Set(selected_node_ids)).sort((a, b) => a.localeCompare(b))
    }
    const nodeIdsFromState = Object.keys(state.network.nodes)
    if (nodeIdsFromState.length > 0) return nodeIdsFromState.sort((a, b) => a.localeCompare(b))
    return Array.from(
      new Set(
        endpointValues
          .map((endpoint) => endpoint.node_id)
          .filter((nodeId): nodeId is string => typeof nodeId === 'string' && nodeId.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b))
  })()
  const contextEndpoints = endpointValues.filter((endpoint) => isEndpointInActiveContext(endpoint))
  const contextHosts = Array.from(
    new Set(
      contextEndpoints
        .map((endpoint) => {
          const resolvedHost = resolveAvbHostLabel({
            host: endpoint.host,
            node_address: endpoint.node_address,
          }).trim()
          return resolvedHost || endpoint.node_id
        })
        .filter((hostLabel): hostLabel is string => typeof hostLabel === 'string' && hostLabel.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b))
  const contextEndpointIssueCount = contextEndpoints.filter(
    (endpoint) => hasEndpointOperationalIssue(endpoint, state.network.nodes),
  ).length

  const activeContextNodeIdSet = new Set(activeContextNodeIds)
  const resolveNodeLabel = (nodeId: string | null | undefined): string => {
    if (!nodeId) return 'Unknown node'
    return state.network.nodes[nodeId]?.name || nodeId
  }
  const streamOwnershipNodeIds = (stream: AvbStreamPayload): string[] => {
    const ownership = stream.ownership
    if (!ownership) return []
    const explicitNodeIds = Array.isArray(ownership.node_ids) ? ownership.node_ids : []
    const fallbackNodeIds = [
      ownership.owner_node_id,
      ownership.peer_node_id,
      ownership.talker_node_id,
      ownership.listener_node_id,
    ].filter((nodeId): nodeId is string => typeof nodeId === 'string' && nodeId.length > 0)
    return Array.from(new Set([...explicitNodeIds, ...fallbackNodeIds]))
  }
  const contextStreams = isNodeScopedContext
    ? streamPayloads.filter((stream) => {
        const nodeIds = streamOwnershipNodeIds(stream)
        return nodeIds.some((nodeId) => activeContextNodeIdSet.has(nodeId))
      })
    : streamPayloads
  const contextTransportReadyStreams = contextStreams.filter((stream) => stream.health?.ready).length
  const contextTransportIssueStreams = contextStreams.filter((stream) => (
    stream.state === 'error' || (stream.health ? !stream.health.ready : false)
  )).length
  const contextDiagnosticsReadyStreams = contextStreams.filter((stream) => Boolean(stream.diagnostics)).length
  const contextPtpLockedStreams = contextStreams.filter((stream) => stream.diagnostics?.ptp_lock.locked).length
  const contextSrpBoundStreams = contextStreams.filter((stream) => stream.diagnostics?.srp.bound).length
  const contextAvdeccEntities = (avdeccEntitiesData?.entities || []).filter((entity) => {
    if (!isNodeScopedContext) return true
    if (!entity.source_node_id) return true
    return activeContextNodeIdSet.has(entity.source_node_id)
  })
  const contextLabel = view_mode === 'single_node' && current_node_id
    ? `Node ${current_node_id}`
    : view_mode === 'multi_select' && selected_node_ids.length > 0
      ? `${activeContextNodeIds.length} selected node${activeContextNodeIds.length === 1 ? '' : 's'}`
      : `All nodes (${activeContextNodeIds.length})`
  const healthSnapshotStatus: 'healthy' | 'warning' | 'critical' = (
    contextEndpointIssueCount > 0 || contextTransportIssueStreams > 0
  )
    ? (
      (contextTransportIssueStreams > 0 && contextTransportReadyStreams === 0 && contextStreams.length > 0)
      || (contextEndpointIssueCount > 0 && contextEndpointIssueCount === contextEndpoints.length && contextEndpoints.length > 0)
        ? 'critical'
        : 'warning'
    )
    : 'healthy'
  const healthSnapshotStatusLabel = healthSnapshotStatus === 'healthy'
    ? 'Healthy'
    : healthSnapshotStatus === 'critical'
      ? 'Critical'
      : 'Attention'
  const healthSnapshotTone: StatusChipTone =
    healthSnapshotStatus === 'healthy'
      ? 'ok'
      : healthSnapshotStatus === 'critical'
        ? 'critical'
        : 'caution'
  const streamScopeLabel = isNodeScopedContext ? 'Ownership-scoped' : 'Global inventory'

  const chainRoutingStudioQuery = useQuery({
    queryKey: ['audio', 'routing', 'studio'],
    queryFn: async () => {
      const chainPayload = await chainsApi.list()
      const chains = Array.isArray(chainPayload.chains)
        ? chainPayload.chains as Array<{ id: number; name?: string }>
        : []

      const routingRows = await Promise.all(chains.map(async (chain) => {
        try {
          const routing = await audioApi.getChainRouting(chain.id)
          return {
            chain_id: chain.id,
            chain_name: chain.name || `Chain ${chain.id}`,
            is_override: Boolean(routing.is_override),
            input_local_count: routing.input_ports.length,
            output_local_count: routing.output_ports.length,
            input_avb_count: routing.input_avb_endpoints.length,
            output_avb_count: routing.output_avb_endpoints.length,
            chain_exists: routing.chain_exists !== false,
            error: null as string | null,
          }
        } catch (error) {
          return {
            chain_id: chain.id,
            chain_name: chain.name || `Chain ${chain.id}`,
            is_override: false,
            input_local_count: 0,
            output_local_count: 0,
            input_avb_count: 0,
            output_avb_count: 0,
            chain_exists: true,
            error: error instanceof Error ? error.message : 'Failed to load chain routing',
          }
        }
      }))

      return routingRows.sort((a, b) => a.chain_id - b.chain_id)
    },
    refetchInterval: 5000,
    staleTime: 2000,
  })

  const chainRoutingRows = chainRoutingStudioQuery.data || []
  const chainOverrideCount = chainRoutingRows.filter((row) => row.is_override).length
  const chainAvbEnabledCount = chainRoutingRows.filter((row) => (
    row.input_avb_count > 0 || row.output_avb_count > 0
  )).length
  const chainRoutingErrorCount = chainRoutingRows.filter((row) => Boolean(row.error)).length

  return (
    <aside className="inspector-panel">
      <div className="inspector-panel__inner">
        <h3 className="inspector-panel__title">Inspector</h3>

        {selectedEndpoint && (
          <>
            <hr className="inspector-panel__divider" />
            <span className="inspector-panel__section-title">Selected Endpoint</span>
            <EndpointInfo
              endpoint={selectedEndpoint}
              discoveredDevice={selectedEndpointDiscoveredDevice || null}
            />
          </>
        )}

        {displayRoute && (
          <>
            <hr className="inspector-panel__divider" />
            <span className="inspector-panel__section-title">
              {selectedRoute ? 'Selected Route' : 'Hovered Route'}
            </span>
            <RouteInfo
              route={displayRoute}
              endpoints={state.endpoints}
              failoverStreams={routeFailoverStreams}
            />
          </>
        )}

        <hr className="inspector-panel__divider" />
        <span
          className="inspector-panel__section-title"
          data-testid="inspector-health-snapshot-title"
        >
          AVB Health Snapshot
        </span>
        <div className="inspector-panel__chip-row">
          <span data-testid="inspector-health-snapshot-status">
            <StatusChip tone={healthSnapshotTone} label={healthSnapshotStatusLabel} size="sm" />
          </span>
          <span data-testid="inspector-health-snapshot-context">
            <StatusChip tone="neutral" label={contextLabel} size="sm" />
          </span>
          <span data-testid="inspector-health-snapshot-scope">
            <StatusChip tone="neutral" label={streamScopeLabel} size="sm" />
          </span>
        </div>
        <ul className="inspector-panel__list">
          <StatRow
            testId="inspector-health-endpoints"
            primary="Endpoints"
            secondary={`${contextEndpoints.length - contextEndpointIssueCount}/${contextEndpoints.length} healthy`}
          />
          <StatRow
            testId="inspector-health-hosts"
            primary="Hosts"
            secondary={`${contextHosts.length} in context`}
          />
          <StatRow
            testId="inspector-health-streams"
            primary="Streams"
            secondary={`${contextTransportReadyStreams}/${contextStreams.length} ready • ${contextTransportIssueStreams} issues`}
          />
          <StatRow
            testId="inspector-health-ptp"
            primary="PTP Lock"
            secondary={`${contextPtpLockedStreams}/${contextDiagnosticsReadyStreams} diagnostics`}
          />
          <StatRow
            testId="inspector-health-srp"
            primary="SRP Bound"
            secondary={`${contextSrpBoundStreams}/${contextDiagnosticsReadyStreams} diagnostics`}
          />
          <StatRow
            testId="inspector-health-avdecc"
            primary="AVDECC Entities"
            secondary={`${contextAvdeccEntities.length} discovered`}
          />
        </ul>

        <hr className="inspector-panel__divider" />
        <span className="inspector-panel__section-title">AVDECC Discovery</span>
        {contextAvdeccEntities.length === 0 ? (
          <EmptyState
            title="No AVDECC entities discovered in the active node scope"
            description="Change the active node scope or wait for discovery to report AVDECC entities here."
            compact
            align="left"
          />
        ) : (
          <ul className="inspector-panel__list">
            {contextAvdeccEntities.slice(0, 6).map((entity) => (
              <li
                key={`${entity.source_node_id ?? 'unknown'}:${entity.entity_id}`}
                className="inspector-panel__entity"
              >
                <div className="inspector-panel__entity-header">
                  <div className="inspector-panel__entity-copy">
                    <span className="inspector-panel__entity-name">
                      {entity.entity_name || entity.entity_id}
                    </span>
                    <span className="inspector-panel__entity-id">
                      {entity.entity_id} · GM {entity.ptp.grandmaster_id || '—'} · domain {entity.ptp.domain}
                    </span>
                  </div>
                  <StatusChip
                    tone="info"
                    label={`Seen by ${resolveNodeLabel(entity.source_node_id)}`}
                    size="sm"
                  />
                </div>
                <div className="inspector-panel__entity-tags">
                  <StatusChip tone="neutral" label={`${entity.capabilities.talker_streams} talkers`} size="sm" />
                  <StatusChip tone="neutral" label={`${entity.capabilities.listener_streams} listeners`} size="sm" />
                  <StatusChip
                    tone={entity.available ? 'ok' : 'caution'}
                    label={entity.available ? 'Available' : 'Stale'}
                    size="sm"
                  />
                </div>
              </li>
            ))}
            {contextAvdeccEntities.length > 6 && (
              <StatRow
                primary="Additional AVDECC entities not shown"
                secondary={`${contextAvdeccEntities.length - 6} more entities in scope`}
              />
            )}
          </ul>
        )}

        <hr className="inspector-panel__divider" />
        <span
          className="inspector-panel__section-title"
          data-testid="inspector-chain-routing-title"
        >
          Signal-Chain Routing Studio
        </span>
        <div className="inspector-panel__chip-row">
          <span data-testid="inspector-chain-routing-count">
            <StatusChip tone="neutral" label={`Chains ${chainRoutingRows.length}`} size="sm" />
          </span>
          <span data-testid="inspector-chain-routing-overrides">
            <StatusChip
              tone={chainOverrideCount > 0 ? 'info' : 'neutral'}
              label={`Overrides ${chainOverrideCount}`}
              size="sm"
            />
          </span>
          <span data-testid="inspector-chain-routing-avb">
            <StatusChip
              tone={chainAvbEnabledCount > 0 ? 'ok' : 'neutral'}
              label={`AVB Mapped ${chainAvbEnabledCount}`}
              size="sm"
            />
          </span>
          <span data-testid="inspector-chain-routing-errors">
            <StatusChip
              tone={chainRoutingErrorCount > 0 ? 'caution' : 'neutral'}
              label={`Errors ${chainRoutingErrorCount}`}
              size="sm"
            />
          </span>
        </div>
        {chainRoutingStudioQuery.isLoading ? (
          <span className="inspector-panel__placeholder">Loading chain routing map...</span>
        ) : chainRoutingRows.length === 0 ? (
          <span className="inspector-panel__placeholder">No chains available for routing.</span>
        ) : (
          <ul className="inspector-panel__list">
            {chainRoutingRows.slice(0, 8).map((row) => (
              <li
                key={`chain-routing-${row.chain_id}`}
                className="inspector-panel__chain-row"
                data-testid={`inspector-chain-routing-row-${row.chain_id}`}
              >
                <div className="inspector-panel__chain-header">
                  <span className="inspector-panel__chain-name">{row.chain_name}</span>
                  <StatusChip
                    tone={row.is_override ? 'info' : 'neutral'}
                    label={row.is_override ? 'Override' : 'Global'}
                    size="sm"
                  />
                </div>
                {row.error ? (
                  <span className="inspector-panel__chain-error">{row.error}</span>
                ) : (
                  <span className="inspector-panel__chain-detail">
                    In {row.input_local_count} local + {row.input_avb_count} AVB · Out {row.output_local_count} local + {row.output_avb_count} AVB
                  </span>
                )}
              </li>
            ))}
            {chainRoutingRows.length > 8 && (
              <StatRow
                primary="Additional chains not shown"
                secondary={`${chainRoutingRows.length - 8} more chain routing rows available`}
              />
            )}
          </ul>
        )}

        {!selectedEndpoint && !displayRoute && (
          <div className="inspector-panel__empty">
            <span>Click an endpoint or route to see details</span>
          </div>
        )}

        <hr className="inspector-panel__divider" />
        <span className="inspector-panel__section-title">Statistics</span>
        <ul className="inspector-panel__list">
          <StatRow primary="Total Endpoints" secondary={Object.keys(state.endpoints).length} />
          <StatRow
            primary="Active Connections"
            secondary={Object.values(state.liveRoutes).filter(r => r.state === 'connected').length}
          />
          <StatRow
            primary="Pending Changes"
            secondary={Object.keys(state.pendingRoutes).length}
          />
          <StatRow primary="Engine AVB Devices" secondary={avbDevicesData?.count ?? 0} />
          <StatRow
            primary="Engine Cached Endpoints"
            secondary={avbDevicesData?.discovered_count ?? 0}
          />
          <StatRow
            primary="Cache Drift"
            secondary={`${missingFromEngineCache} missing, ${engineCacheOrphans} orphaned`}
          />
          <StatRow primary="Transport Ready Streams" secondary={transportReadyStreams} />
          <StatRow primary="Streams With Issues" secondary={transportIssueStreams} />
          <StatRow
            primary="Diagnostics Coverage"
            secondary={`${diagnosticsReadyStreams}/${streamPayloads.length}`}
          />
          <StatRow primary="PTP Locked Streams" secondary={ptpLockedStreams} />
          <StatRow primary="TSN Fully Configured Streams" secondary={tsnFullyConfiguredStreams} />
          <StatRow primary="SRP Bound Streams" secondary={srpBoundStreams} />
          <StatRow primary="Failover Candidate Streams" secondary={failoverCandidateStreams} />
          <StatRow primary="Failover Policies" secondary={failoverPolicySummary} />
          <StatRow primary="Failover Interfaces" secondary={topFailoverInterfaces} />
        </ul>
      </div>
    </aside>
  )
}

function EndpointInfo({
  endpoint,
  discoveredDevice,
}: {
  endpoint: any
  discoveredDevice: AvbDiscoveredDevice | null
}) {
  const hostLabel = resolveAvbHostLabel(discoveredDevice || { node_address: endpoint.node_address })

  return (
    <ul className="inspector-panel__list">
      <StatRow primary="Name" secondary={endpoint.device_name} />
      {hostLabel && <StatRow primary="Host" secondary={hostLabel} />}
      <StatRow primary="Type" secondary={endpoint.device_type.toUpperCase()} />
      <StatRow primary="Direction" secondary={endpoint.direction} />
      <StatRow
        primary="Format"
        secondary={`${endpoint.channels}ch @ ${endpoint.sample_rate / 1000}kHz`}
      />
      <StatRow
        primary="Status"
        secondary={
          <StatusChip
            tone={endpoint.available ? 'ok' : 'critical'}
            label={endpoint.available ? 'Available' : 'Offline'}
            size="sm"
          />
        }
      />
      <StatRow
        primary="Engine Cache"
        secondary={
          <StatusChip
            tone={discoveredDevice ? 'ok' : 'caution'}
            label={discoveredDevice ? 'Synced' : 'Not Indexed'}
            size="sm"
          />
        }
      />
      {discoveredDevice && (
        <StatRow
          primary="Cached Format"
          secondary={`${discoveredDevice.channels}ch @ ${discoveredDevice.sample_rate / 1000}kHz • ${discoveredDevice.audio_format}`}
        />
      )}
      {discoveredDevice && discoveredDevice.host && (
        <StatRow primary="Cached Host" secondary={discoveredDevice.host} />
      )}
      {endpoint.mac_address && (
        <StatRow primary="MAC Address" secondary={endpoint.mac_address} />
      )}
      {endpoint.tags.length > 0 && (
        <StatRow primary="Tags" secondary={endpoint.tags.join(', ')} />
      )}
    </ul>
  )
}

function RouteInfo({
  route,
  endpoints,
  failoverStreams,
}: {
  route: any
  endpoints: Record<string, any>
  failoverStreams: AvbStreamPayload[]
}) {
  const talker = endpoints[route.talker_id]
  const listener = endpoints[route.listener_id]

  const failoverPolicyCounts = failoverStreams.reduce<Record<string, number>>((acc, stream) => {
    const policy = stream.diagnostics?.effective_config.failover_policy || 'none'
    acc[policy] = (acc[policy] || 0) + 1
    return acc
  }, {})

  const failoverPolicySummary = Object.entries(failoverPolicyCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([policy, count]) => `${policy} (${count})`)
    .join(', ') || 'No policy data'

  const failoverInterfaceCounts = failoverStreams.reduce<Record<string, number>>((acc, stream) => {
    const candidates = stream.diagnostics?.effective_config.interface_candidates || []
    candidates.forEach((iface) => { acc[iface] = (acc[iface] || 0) + 1 })
    return acc
  }, {})

  const failoverInterfaceSummary = Object.entries(failoverInterfaceCounts)
    .map(([iface, count]) => `${iface} (${count})`)
    .join(', ') || 'None'

  const getStateTone = (state: string): StatusChipTone => {
    switch (state) {
      case 'connected': return 'ok'
      case 'connecting': return 'info'
      case 'disconnecting': return 'caution'
      case 'error': return 'critical'
      default: return 'neutral'
    }
  }

  return (
    <ul className="inspector-panel__list">
      <StatRow primary="Talker" secondary={talker?.device_name || route.talker_id} />
      <StatRow primary="Listener" secondary={listener?.device_name || route.listener_id} />
      <StatRow
        primary="State"
        secondary={
          <StatusChip tone={getStateTone(route.state)} label={route.state} size="sm" />
        }
      />
      {route.established_time && (
        <StatRow
          primary="Connected At"
          secondary={new Date(route.established_time).toLocaleString()}
        />
      )}
      {route.error_message && (
        <li className="inspector-panel__stat" data-error="true">
          <span className="inspector-panel__stat-primary">Error</span>
          <span className="inspector-panel__stat-secondary inspector-panel__stat-secondary--error">
            {route.error_message}
          </span>
        </li>
      )}
      {route.locked && (
        <li className="inspector-panel__stat">
          <span className="inspector-panel__stat-primary">Locked</span>
          <span className="inspector-panel__stat-secondary inspector-panel__stat-secondary--warn">
            {route.lock_reason || 'Protected route'}
          </span>
        </li>
      )}
      {route.srp_reservation_id && (
        <StatRow primary="SRP Reservation" secondary={route.srp_reservation_id} />
      )}
      <StatRow
        primary="Route Failover Policies"
        secondary={
          failoverStreams.length > 0 ? failoverPolicySummary : 'No stream diagnostics available'
        }
      />
      {failoverStreams.length > 0 && (
        <StatRow primary="Failover Interfaces" secondary={failoverInterfaceSummary} />
      )}
      {failoverStreams.length > 0 && (
        <StatRow
          primary="Failover Stream(s)"
          secondary={
            <div className="inspector-panel__stream-list">
              {failoverStreams.map((stream) => {
                const policy = stream.diagnostics?.effective_config.failover_policy || 'none'
                const candidates = stream.diagnostics?.effective_config.interface_candidates || []
                const direction = stream.diagnostics?.effective_config.direction || stream.direction || 'unknown'

                return (
                  <div key={stream.stream_id} className="inspector-panel__stream-item">
                    <span className="inspector-panel__stream-id">
                      {stream.stream_id} ({direction})
                    </span>
                    <div className="inspector-panel__stream-tags">
                      <StatusChip
                        tone={policy === 'none' ? 'neutral' : 'info'}
                        label={`Policy: ${policy}`}
                        size="sm"
                      />
                      <StatusChip
                        tone="info"
                        label={`Candidates: ${candidates.length > 0 ? candidates.join(', ') : 'none'}`}
                        size="sm"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          }
        />
      )}
    </ul>
  )
}

export default InspectorPanel
