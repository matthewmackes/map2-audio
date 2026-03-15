import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Switch } from '@mui/material'
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
  if (type === 'control_change') return '#3b82f6'
  if (type === 'note_on' || type === 'note_off') return '#22c55e'
  if (type === 'program_change') return '#a855f7'
  if (type === 'sysex') return '#f97316'
  return route.enabled ? '#ef4444' : '#94a3b8'
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
      midiHubApi.createRoute({
        source_port: payload.source,
        destination_ports: [payload.destination],
        enabled: true,
        priority: 100,
        route_type: 'pass_through',
        filter: { message_types: [], channels: [] },
        transform_chain: [],
      }, nodeId),
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
    <div className="stack" style={{ gap: 12 }}>
      <Alert severity="info">
        Patchbay creation flow: select source node, then destination node, then confirm a new link appears. Right-click any node for metadata.
      </Alert>

      <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
        <Chip size="small" label="Green line = note traffic" color="success" />
        <Chip size="small" label="Blue line = CC traffic" color="info" />
        <Chip size="small" label="Dashed line = disabled route" variant="outlined" />
        <Chip size="small" label="Heatmap colors show traffic intensity" color={showHeatmap ? 'warning' : 'default'} />
      </div>

      <div className="flex" style={{ gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="flex" style={{ gap: 8 }}>
          <Chip size="small" label={`Nodes: ${nodes.length}`} />
          <Chip size="small" label={`Links: ${links.length}`} />
          {pendingSource ? <Chip size="small" color="warning" label={`Source selected: ${pendingSource}`} /> : null}
        </div>
        <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Button size="small" variant="outlined" onClick={() => setShowHeatmap((value) => !value)}>
            Heatmap {showHeatmap ? 'On' : 'Off'}
          </Button>
          <Button size="small" variant="outlined" onClick={() => setShowAdvancedTools((value) => !value)}>
            {showAdvancedTools ? 'Hide Advanced Tools' : 'Show Advanced Tools'}
          </Button>
          {showAdvancedTools ? (
            <>
              <Button size="small" variant="outlined" onClick={() => setScale((value) => Math.max(0.6, value - 0.1))}>
                -
              </Button>
              <Chip size="small" label={`Zoom ${(scale * 100).toFixed(0)}%`} />
              <Button size="small" variant="outlined" onClick={() => setScale((value) => Math.min(2.0, value + 0.1))}>
                +
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div
        style={{
          border: '1px solid rgba(148,163,184,0.2)',
          borderRadius: 12,
          overflow: 'hidden',
          background: 'radial-gradient(circle at 10% 10%, rgba(30,41,59,0.65), rgba(2,6,23,0.95))',
        }}
      >
        <svg
          viewBox="0 0 1040 680"
          style={{ width: '100%', height: 520, cursor: dragStart ? 'grabbing' : 'grab' }}
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
              <polygon points="0,0 8,4 0,8" fill="#e11d48" />
            </marker>
          </defs>

          <g transform={`translate(${offset.x}, ${offset.y}) scale(${scale})`}>
            {links.map(({ route, source, destination }) => {
              const baselineColor = routeColor(route)
              const hits = routeHeat.get(route.route_id) ?? 0
              const normalized = maxHeat > 0 ? hits / maxHeat : 0
              const color = showHeatmap
                ? normalized > 0.66
                  ? '#ef4444'
                  : normalized > 0.33
                    ? '#f59e0b'
                    : normalized > 0
                      ? '#22c55e'
                      : '#334155'
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
                    rx={10}
                    fill={isPendingSource ? 'rgba(234,179,8,0.3)' : 'rgba(15,23,42,0.88)'}
                    stroke={isPendingSource ? '#eab308' : '#334155'}
                    strokeWidth={isPendingSource ? 2.2 : 1.4}
                    onClick={() => handleNodeClick(node)}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      setSelectedNode(node)
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                  <text
                    x={0}
                    y={4}
                    textAnchor="middle"
                    fill="#e2e8f0"
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

      <Alert severity="warning">
        Example: select keyboard input node, select synth output node, verify the link, then open Route Control and keep route enabled.
      </Alert>

      <Dialog open={Boolean(selectedRoute)} onClose={() => setSelectedRoute(null)} fullWidth maxWidth="sm">
        <DialogTitle>Route Control</DialogTitle>
        <DialogContent>
          {selectedRoute ? (
            <div className="stack" style={{ gap: 10 }}>
              <div><strong>Route:</strong> <code>{selectedRoute.route_id}</code></div>
              <div><strong>Source:</strong> <code>{selectedRoute.source_port}</code></div>
              <div><strong>Destinations:</strong> <code>{selectedRoute.destination_ports.join(', ')}</code></div>
              <FormControlLabel
                control={
                  <Switch
                    checked={selectedRoute.enabled}
                    onChange={() => {
                      toggleRoute.mutate(selectedRoute)
                      setSelectedRoute({ ...selectedRoute, enabled: !selectedRoute.enabled })
                    }}
                  />
                }
                label="Enabled"
              />
            </div>
          ) : null}
        </DialogContent>
        <DialogActions>
          {selectedRoute ? (
            <Button color="error" onClick={() => deleteRoute.mutate(selectedRoute.route_id)}>
              Delete
            </Button>
          ) : null}
          <Button onClick={() => setSelectedRoute(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(selectedNode)} onClose={() => setSelectedNode(null)} fullWidth maxWidth="xs">
        <DialogTitle>Node Info</DialogTitle>
        <DialogContent>
          {selectedNode ? (
            <div className="stack" style={{ gap: 8 }}>
              <div><strong>Port:</strong> <code>{selectedNode.id}</code></div>
              <div><strong>Name:</strong> {selectedNode.name}</div>
              <div><strong>Direction:</strong> {selectedNode.direction}</div>
            </div>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedNode(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
