import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Checkbox, Tag } from '@carbon/react'
import { midiHubApi, type MidiHubRoute } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useToasts } from '../Toasts'

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
  const [showAdvancedTools, setShowAdvancedTools] = useState(false)

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

  const ports = useMemo(() => {
    const rows = (statusQuery.data?.ports as Array<Record<string, unknown>> | undefined) ?? []
    return rows.map((row) => ({
      id: String(row.port_id ?? ''),
      name: String(row.name ?? row.port_id ?? ''),
      direction: String(row.direction ?? 'duplex'),
    }))
  }, [statusQuery.data?.ports])

  const nodes = useMemo(() => {
    const topologyNodes = (topologyQuery.data?.nodes as string[] | undefined) ?? ports.map((row) => row.id)
    const byId = new Map(ports.map((row) => [row.id, row]))
    const sources = topologyNodes.filter((id) => {
      const port = byId.get(id)
      const direction = port?.direction ?? 'duplex'
      return direction === 'input' || direction === 'duplex'
    })
    const destinations = topologyNodes.filter((id) => {
      const port = byId.get(id)
      const direction = port?.direction ?? 'duplex'
      return direction === 'output' || direction === 'duplex'
    })

    const sourceNodes = sources.map((id, index) => ({
      id,
      name: byId.get(id)?.name ?? id,
      direction: byId.get(id)?.direction ?? 'duplex',
      x: 180,
      y: 110 + index * 90,
    }))
    const destinationNodes = destinations.map((id, index) => ({
      id,
      name: byId.get(id)?.name ?? id,
      direction: byId.get(id)?.direction ?? 'duplex',
      x: 860,
      y: 110 + index * 90,
    }))
    return [...sourceNodes, ...destinationNodes]
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
    const rows = trafficQuery.data?.records ?? []
    const counts = new Map<string, number>()
    for (const row of rows) {
      if (!row.route_id) continue
      counts.set(row.route_id, (counts.get(row.route_id) ?? 0) + 1)
    }
    return counts
  }, [trafficQuery.data?.records])

  const maxHeat = useMemo(() => {
    let max = 0
    for (const value of routeHeat.values()) {
      if (value > max) max = value
    }
    return max
  }, [routeHeat])

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
    <>
      <div className="midi-hub-mini-surface">
        <div className="midi-hub-toolbar">
          <Tag type="cool-gray">{`Nodes ${nodes.length}`}</Tag>
          <Tag type={links.length > 0 ? 'green' : 'warm-gray'}>{`Links ${links.length}`}</Tag>
          {pendingSource ? <Tag type="blue">{`Pending source ${pendingSource}`}</Tag> : null}
        </div>

        <div className="midi-hub-route-legend">
          <Tag type="green">Note traffic</Tag>
          <Tag type="blue">Control change</Tag>
          <Tag type="magenta">System exclusive</Tag>
          <Tag type="warm-gray">Disabled route</Tag>
        </div>

        <div className="midi-hub-actions">
          <Checkbox
            id="midi-hub-patchbay-heatmap"
            labelText="Heatmap overlay"
            checked={showHeatmap}
            onChange={(_, data) => setShowHeatmap(data.checked)}
          />
          <Checkbox
            id="midi-hub-patchbay-advanced"
            labelText="Show zoom controls"
            checked={showAdvancedTools}
            onChange={(_, data) => setShowAdvancedTools(data.checked)}
          />
          {showAdvancedTools ? (
            <>
              <Button size="sm" kind="ghost" onClick={() => setScale((value) => Math.max(0.6, value - 0.1))}>
                Zoom out
              </Button>
              <Button size="sm" kind="ghost" onClick={() => setScale((value) => Math.min(2, value + 0.1))}>
                Zoom in
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="midi-hub-patchbay-shell">
        <svg
          viewBox="0 0 1040 680"
          className="midi-hub-patchbay-stage"
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
              const strokeWidth = route.enabled ? 2 + normalized * 4 : 1.5
              return (
                <path
                  key={`${route.route_id}-${destination.id}`}
                  d={`M ${source.x + 72} ${source.y} C ${source.x + 260} ${source.y}, ${destination.x - 260} ${destination.y}, ${destination.x - 72} ${destination.y}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={route.enabled ? '0' : '6 4'}
                  markerEnd="url(#patchbayArrow)"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedRoute(route)}
                />
              )
            })}

            {nodes.map((node) => {
              const isPendingSource = pendingSource === node.id
              return (
                <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
                  <rect
                    x={-72}
                    y={-24}
                    width={144}
                    height={48}
                    rx={4}
                    fill={isPendingSource ? 'var(--cds-layer-selected-02, var(--cds-layer-selected))' : 'var(--cds-layer-01)'}
                    stroke={isPendingSource ? 'var(--cds-border-interactive)' : 'var(--cds-border-strong-01)'}
                    strokeWidth={isPendingSource ? 2.2 : 1.4}
                    onClick={() => handleNodeClick(node)}
                    style={{ cursor: 'pointer' }}
                  />
                  <text
                    x={0}
                    y={4}
                    textAnchor="middle"
                    fill="var(--cds-text-primary)"
                    style={{ fontSize: 12, fontWeight: 700 }}
                  >
                    {node.name}
                  </text>
                </g>
              )
            })}
          </g>
        </svg>
      </div>

      <div className="midi-hub-panel-grid--2">
        <div className="midi-hub-mini-surface">
          <div className="midi-hub-patchbay-sidecar">
            <strong>Patchbay workflow</strong>
            <p className="midi-hub-panel-note">
              Select a source port first, then select a destination port. Click any existing route line to inspect or
              disable it.
            </p>
            {selectedNode ? (
              <>
                <Tag type="cool-gray">{selectedNode.direction}</Tag>
                <code>{selectedNode.id}</code>
              </>
            ) : (
              <div className="midi-hub-empty-state">Select a node to inspect its port identity.</div>
            )}
          </div>
        </div>

        <div className="midi-hub-mini-surface">
          {selectedRoute ? (
            <div className="midi-hub-patchbay-sidecar">
              <strong>Selected route</strong>
              <code>{selectedRoute.route_id}</code>
              <div className="midi-hub-record-meta">
                {selectedRoute.source_port} → {selectedRoute.destination_ports.join(', ')}
              </div>
              <div className="midi-hub-actions">
                <Button size="sm" kind="secondary" onClick={() => toggleRoute.mutate(selectedRoute)}>
                  {selectedRoute.enabled ? 'Disable route' : 'Enable route'}
                </Button>
                <Button size="sm" kind="danger--tertiary" onClick={() => deleteRoute.mutate(selectedRoute.route_id)}>
                  Delete route
                </Button>
              </div>
            </div>
          ) : (
            <div className="midi-hub-empty-state">Select a route line to inspect or manage that connection.</div>
          )}
        </div>
      </div>
    </>
  )
}
