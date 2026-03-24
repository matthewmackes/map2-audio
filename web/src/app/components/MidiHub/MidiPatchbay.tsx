import { type KeyboardEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, InlineNotification, Layer, Tag, Toggle } from '@carbon/react'
import { midiHubApi, type MidiHubRoute } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useToasts } from '../Toasts'
import { normalizePatchbayTopologyNodeIds } from './patchbayTopology'
import { readPorts } from './portUtils'

type NodeInfo = {
  id: string
  name: string
  direction: string
  x: number
  y: number
}

function routeColor(route: MidiHubRoute): string {
  const type = route.filter?.message_types?.[0] ?? 'default'
  if (type === 'control_change') return 'var(--cds-link-primary)'
  if (type === 'note_on' || type === 'note_off') return 'var(--cds-support-success)'
  if (type === 'program_change') return 'var(--cds-support-info)'
  if (type === 'sysex') return 'var(--cds-support-warning)'
  return route.enabled ? 'var(--cds-support-error)' : 'var(--cds-border-strong-01)'
}

function handleSvgActionKey(event: KeyboardEvent<SVGElement>, action: () => void) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  action()
}

export function MidiPatchbay() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const { nodeId, scopeKey } = useMidiHubNodeScope()
  const [pendingSource, setPendingSource] = useState<string | null>(null)
  const [selectedRoute, setSelectedRoute] = useState<MidiHubRoute | null>(null)
  const [selectedNode, setSelectedNode] = useState<NodeInfo | null>(null)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [showHeatmap, setShowHeatmap] = useState(true)

  const statusQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'status'],
    queryFn: () => midiHubApi.getStatus(nodeId),
    refetchInterval: 2500,
  })

  const routesQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'routes'],
    queryFn: () => midiHubApi.getRoutes(nodeId),
    refetchInterval: 2500,
  })

  const topologyQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'topology'],
    queryFn: () => midiHubApi.getTopology(nodeId),
    refetchInterval: 2500,
  })

  const trafficQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'traffic', 'patchbay-heatmap'],
    queryFn: () => midiHubApi.getTrafficSnapshot({ limit: 1000 }, nodeId),
    refetchInterval: 1000,
  })

  const ports = useMemo(
    () => readPorts((statusQuery.data as Record<string, unknown> | undefined)?.ports),
    [statusQuery.data],
  )

  const nodes = useMemo(() => {
    const topologyNodes = normalizePatchbayTopologyNodeIds(
      topologyQuery.data?.nodes,
      ports.map((row) => row.port_id),
    )
    const byId = new Map(ports.map((row) => [row.port_id, row]))
    const sources = topologyNodes.filter((id) => {
      const direction = byId.get(id)?.direction ?? 'duplex'
      return direction === 'input' || direction === 'duplex'
    })
    const destinations = topologyNodes.filter((id) => {
      const direction = byId.get(id)?.direction ?? 'duplex'
      return direction === 'output' || direction === 'duplex'
    })

    return [
      ...sources.map((id, index) => ({
        id,
        name: byId.get(id)?.name ?? id,
        direction: byId.get(id)?.direction ?? 'duplex',
        x: 180,
        y: 110 + index * 90,
      })),
      ...destinations.map((id, index) => ({
        id,
        name: byId.get(id)?.name ?? id,
        direction: byId.get(id)?.direction ?? 'duplex',
        x: 860,
        y: 110 + index * 90,
      })),
    ]
  }, [ports, topologyQuery.data?.nodes])

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])

  const createRoute = useMutation({
    mutationFn: async (payload: { source: string; destination: string }) =>
      midiHubApi.createRoute(
        {
          source_port: payload.source,
          destination_ports: [payload.destination],
          enabled: true,
          priority: 100,
          route_type: 'pass_through',
          filter: { message_types: [], channels: [] },
          transform_chain: [],
        },
        nodeId,
      ),
    onSuccess: () => {
      pushToast('Route created', 'success')
      setPendingSource(null)
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey] })
    },
    onError: () => pushToast('Failed to create route', 'error'),
  })

  const toggleRoute = useMutation({
    mutationFn: async (route: MidiHubRoute) =>
      route.enabled ? midiHubApi.disableRoute(route.route_id, nodeId) : midiHubApi.enableRoute(route.route_id, nodeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey] })
    },
  })

  const deleteRoute = useMutation({
    mutationFn: async (routeId: string) => midiHubApi.deleteRoute(routeId, nodeId),
    onSuccess: () => {
      pushToast('Route deleted', 'info')
      setSelectedRoute(null)
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey] })
    },
    onError: () => pushToast('Failed to delete route', 'error'),
  })

  const links = useMemo(() => {
    const routes = routesQuery.data?.routes ?? []
    const rows: Array<{ route: MidiHubRoute; source: NodeInfo; destination: NodeInfo }> = []
    for (const route of routes) {
      const source = nodeById.get(route.source_port)
      if (!source) continue
      for (const destinationId of route.destination_ports) {
        const destination = nodeById.get(destinationId)
        if (!destination) continue
        rows.push({ route, source, destination })
      }
    }
    return rows
  }, [routesQuery.data?.routes, nodeById])

  const routeHeat = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of trafficQuery.data?.records ?? []) {
      if (!row.route_id) continue
      counts.set(row.route_id, (counts.get(row.route_id) ?? 0) + 1)
    }
    return counts
  }, [trafficQuery.data?.records])

  const maxHeat = useMemo(() => Math.max(0, ...routeHeat.values()), [routeHeat])

  const handleNodeClick = (node: NodeInfo) => {
    setSelectedNode(node)
    if (!pendingSource) {
      setPendingSource(node.id)
      return
    }
    if (pendingSource === node.id) {
      setPendingSource(null)
      return
    }
    createRoute.mutate({ source: pendingSource, destination: node.id })
  }

  return (
    <div className="midi-hub-connections-stack">
      <div className="midi-hub-connections-toolbar">
        <Tag type="cool-gray">{`Nodes ${nodes.length}`}</Tag>
        <Tag type={links.length > 0 ? 'green' : 'warm-gray'}>{`Links ${links.length}`}</Tag>
        {pendingSource ? <Tag type="blue">{`Pending source ${pendingSource}`}</Tag> : null}
        <Toggle
          id="midi-hub-patchbay-heatmap"
          size="sm"
          labelText="Heatmap overlay"
          labelA="Off"
          labelB="On"
          toggled={showHeatmap}
          onToggle={setShowHeatmap}
        />
        <Button size="sm" kind="ghost" onClick={() => setScale((value) => Math.max(0.6, value - 0.1))}>
          Zoom out
        </Button>
        <Button size="sm" kind="ghost" onClick={() => setScale((value) => Math.min(2, value + 0.1))}>
          Zoom in
        </Button>
      </div>

      {nodes.length === 0 ? (
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title="No patchbay topology available"
          subtitle="Visible MIDI ports are required before the graph can render."
        />
      ) : null}

      <Layer className="midi-hub-connections-patchbay">
        <svg
          viewBox="0 0 1040 680"
          className="midi-hub-connections-patchbay__stage"
          onMouseDown={(event) => setDragStart({ x: event.clientX - offset.x, y: event.clientY - offset.y })}
          onMouseMove={(event) => {
            if (!dragStart) return
            setOffset({ x: event.clientX - dragStart.x, y: event.clientY - dragStart.y })
          }}
          onMouseUp={() => setDragStart(null)}
          onMouseLeave={() => setDragStart(null)}
        >
          <defs>
            <marker id="patchbayArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <polygon points="0,0 8,4 0,8" fill="var(--cds-text-primary)" />
            </marker>
          </defs>

          <rect x="0" y="0" width="1040" height="680" fill="var(--cds-layer-02)" />

          <g transform={`translate(${offset.x}, ${offset.y}) scale(${scale})`}>
            {links.map(({ route, source, destination }) => {
              const baselineColor = routeColor(route)
              const hits = routeHeat.get(route.route_id) ?? 0
              const normalized = maxHeat > 0 ? hits / maxHeat : 0
              const color = showHeatmap
                ? normalized > 0.66
                  ? 'var(--cds-support-error)'
                  : normalized > 0.33
                    ? 'var(--cds-support-warning)'
                    : normalized > 0
                      ? 'var(--cds-support-success)'
                      : 'var(--cds-border-strong-01)'
                : baselineColor
              return (
                <path
                  key={`${route.route_id}-${destination.id}`}
                  className="midi-hub-connections-patchbay__route"
                  d={`M ${source.x + 72} ${source.y} C ${source.x + 260} ${source.y}, ${destination.x - 260} ${destination.y}, ${destination.x - 72} ${destination.y}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={route.enabled ? 2 + normalized * 4 : 1.5}
                  strokeDasharray={route.enabled ? '0' : '6 4'}
                  markerEnd="url(#patchbayArrow)"
                  tabIndex={0}
                  role="button"
                  aria-label={`Select route from ${source.name} to ${destination.name}`}
                  onClick={() => setSelectedRoute(route)}
                  onKeyDown={(event) => handleSvgActionKey(event, () => setSelectedRoute(route))}
                />
              )
            })}

            {nodes.map((node) => {
              const isPendingSource = pendingSource === node.id
              return (
                <g
                  key={node.id}
                  className="midi-hub-connections-patchbay__node"
                  transform={`translate(${node.x}, ${node.y})`}
                  tabIndex={0}
                  role="button"
                  aria-label={`Select patchbay node ${node.name}`}
                  onClick={() => handleNodeClick(node)}
                  onKeyDown={(event) => handleSvgActionKey(event, () => handleNodeClick(node))}
                >
                  <rect
                    x={-72}
                    y={-24}
                    width={144}
                    height={48}
                    rx={4}
                    fill={isPendingSource ? 'var(--cds-layer-selected-02, var(--cds-layer-selected))' : 'var(--cds-layer-01)'}
                    stroke={isPendingSource ? 'var(--cds-border-interactive)' : 'var(--cds-border-strong-01)'}
                    strokeWidth={isPendingSource ? 2.2 : 1.4}
                  />
                  <text
                    className="midi-hub-connections-patchbay__node-label"
                    x={0}
                    y={4}
                    textAnchor="middle"
                    fill="var(--cds-text-primary)"
                  >
                    {node.name}
                  </text>
                </g>
              )
            })}
          </g>
        </svg>
      </Layer>

      <div className="midi-hub-connections-detail-grid">
        <Layer className="midi-hub-connections-detail-card">
          <p className="midi-hub-connections-detail-title">Patchbay workflow</p>
          <p>Select a source node first, then a destination node. Click a route line to inspect or disable it.</p>
          {selectedNode ? (
            <div className="midi-hub-connections-detail-meta">
              <Tag type="cool-gray">{selectedNode.direction}</Tag>
              <code>{selectedNode.id}</code>
            </div>
          ) : (
            <p>Select a node to inspect its port identity.</p>
          )}
        </Layer>

        <Layer className="midi-hub-connections-detail-card">
          {selectedRoute ? (
            <>
              <p className="midi-hub-connections-detail-title">Selected route</p>
              <code>{selectedRoute.route_id}</code>
              <p>{selectedRoute.source_port} to {selectedRoute.destination_ports.join(', ')}</p>
              <div className="midi-hub-connections-toolbar">
                <Button size="sm" kind="secondary" onClick={() => toggleRoute.mutate(selectedRoute)}>
                  {selectedRoute.enabled ? 'Disable route' : 'Enable route'}
                </Button>
                <Button size="sm" kind="danger--tertiary" onClick={() => deleteRoute.mutate(selectedRoute.route_id)}>
                  Delete route
                </Button>
              </div>
            </>
          ) : (
            <p>Select a route line to inspect or manage that connection.</p>
          )}
        </Layer>
      </div>
    </div>
  )
}
