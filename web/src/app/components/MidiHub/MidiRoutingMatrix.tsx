import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  FormControlLabel,
} from '@mui/material'
import { midiHubApi, type MidiHubRoute, type MidiHubRouteRequest } from '../../../map2/api'
import { useToasts } from '../Toasts'

type MatrixSelection = {
  sourcePort: string
  destinationPort: string
  route?: MidiHubRoute
}

function parseCsvList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseCsvNumbers(value: string): number[] {
  return parseCsvList(value)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))
}

function buildRouteMap(routes: MidiHubRoute[]): Map<string, MidiHubRoute> {
  const map = new Map<string, MidiHubRoute>()
  for (const route of routes) {
    for (const destination of route.destination_ports) {
      map.set(`${route.source_port}__${destination}`, route)
    }
  }
  return map
}

export function MidiRoutingMatrix() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const [selection, setSelection] = useState<MatrixSelection | null>(null)
  const [enabled, setEnabled] = useState(true)
  const [priority, setPriority] = useState(100)
  const [routeType, setRouteType] = useState('pass_through')
  const [messageTypesCsv, setMessageTypesCsv] = useState('')
  const [channelsCsv, setChannelsCsv] = useState('')
  const [transformJson, setTransformJson] = useState('[]')

  const statusQuery = useQuery({
    queryKey: ['midi-hub', 'status'],
    queryFn: midiHubApi.getStatus,
    refetchInterval: 2500,
  })

  const routesQuery = useQuery({
    queryKey: ['midi-hub', 'routes'],
    queryFn: midiHubApi.getRoutes,
    refetchInterval: 2500,
  })

  const routeMap = useMemo(
    () => buildRouteMap(routesQuery.data?.routes ?? []),
    [routesQuery.data?.routes]
  )

  const ports = useMemo(() => {
    const rows = (statusQuery.data?.ports as Array<Record<string, unknown>> | undefined) ?? []
    return rows.map((row) => ({
      port_id: String(row.port_id ?? ''),
      name: String(row.name ?? row.port_id ?? ''),
      direction: String(row.direction ?? 'duplex'),
      kind: String(row.kind ?? 'virtual'),
    }))
  }, [statusQuery.data?.ports])

  const sources = ports.filter((port) => port.direction === 'input' || port.direction === 'duplex')
  const destinations = ports.filter((port) => port.direction === 'output' || port.direction === 'duplex')

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selection) return
      const payload: MidiHubRouteRequest = {
        source_port: selection.sourcePort,
        destination_ports: [selection.destinationPort],
        enabled,
        priority,
        route_type: routeType,
        filter: {
          message_types: parseCsvList(messageTypesCsv),
          channels: parseCsvNumbers(channelsCsv),
        },
        transform_chain: JSON.parse(transformJson || '[]'),
      }
      if (selection.route?.route_id) {
        return midiHubApi.updateRoute(selection.route.route_id, payload)
      }
      return midiHubApi.createRoute(payload)
    },
    onSuccess: () => {
      pushToast('Route saved', 'success')
      setSelection(null)
      void queryClient.invalidateQueries({ queryKey: ['midi-hub'] })
    },
    onError: () => {
      pushToast('Failed to save route', 'error')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (routeId: string) => midiHubApi.deleteRoute(routeId),
    onSuccess: () => {
      pushToast('Route deleted', 'info')
      setSelection(null)
      void queryClient.invalidateQueries({ queryKey: ['midi-hub'] })
    },
    onError: () => pushToast('Failed to delete route', 'error'),
  })

  const openEditor = (sourcePort: string, destinationPort: string) => {
    const route = routeMap.get(`${sourcePort}__${destinationPort}`)
    setSelection({ sourcePort, destinationPort, route })
    setEnabled(route?.enabled ?? true)
    setPriority(route?.priority ?? 100)
    setRouteType(route?.route_type ?? 'pass_through')
    setMessageTypesCsv((route?.filter?.message_types ?? []).join(','))
    setChannelsCsv((route?.filter?.channels ?? []).join(','))
    setTransformJson(JSON.stringify(route?.transform_chain ?? [], null, 2))
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <style>
        {`@keyframes midiRoutePulse { 0% { transform: scale(1); } 50% { transform: scale(1.04); } 100% { transform: scale(1); } }`}
      </style>
      <div className="flex" style={{ gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="flex" style={{ gap: 8, alignItems: 'center' }}>
          <Chip size="small" label={`Sources: ${sources.length}`} />
          <Chip size="small" label={`Destinations: ${destinations.length}`} />
          <Chip size="small" label={`Routes: ${routesQuery.data?.routes?.length ?? 0}`} />
        </div>
        <Button
          variant="outlined"
          size="small"
          onClick={() => {
            void queryClient.invalidateQueries({ queryKey: ['midi-hub'] })
          }}
        >
          Refresh
        </Button>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 10 }}>
        <table className="table" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th>Source \\ Destination</th>
              {destinations.map((destination) => (
                <th key={destination.port_id}>
                  <div className="stack" style={{ gap: 2 }}>
                    <span>{destination.name}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{destination.kind}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr key={source.port_id}>
                <td>
                  <div className="stack" style={{ gap: 2 }}>
                    <span>{source.name}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{source.kind}</span>
                  </div>
                </td>
                {destinations.map((destination) => {
                  const route = routeMap.get(`${source.port_id}__${destination.port_id}`)
                  const tone = route
                    ? route.enabled
                      ? 'rgba(34,197,94,0.20)'
                      : 'rgba(148,163,184,0.20)'
                    : 'rgba(15,23,42,0.42)'
                  const border = route
                    ? route.enabled
                      ? '1px solid rgba(34,197,94,0.65)'
                      : '1px solid rgba(148,163,184,0.45)'
                    : '1px dashed rgba(148,163,184,0.3)'
                  return (
                    <td key={destination.port_id}>
                      <button
                        type="button"
                        onClick={() => openEditor(source.port_id, destination.port_id)}
                        style={{
                          width: '100%',
                          minHeight: 34,
                          borderRadius: 8,
                          border,
                          background: tone,
                          color: route?.enabled ? '#22c55e' : '#cbd5e1',
                          cursor: 'pointer',
                          animation: route?.enabled ? 'midiRoutePulse 1.6s ease-in-out infinite' : 'none',
                        }}
                      >
                        {route ? (route.enabled ? 'Active' : 'Disabled') : '—'}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={Boolean(selection)} onClose={() => setSelection(null)} fullWidth maxWidth="sm">
        <DialogTitle>Route Editor</DialogTitle>
        <DialogContent>
          <div className="stack" style={{ gap: 12, marginTop: 4 }}>
            <TextField
              label="Source Port"
              value={selection?.sourcePort ?? ''}
              InputProps={{ readOnly: true }}
              size="small"
            />
            <TextField
              label="Destination Port"
              value={selection?.destinationPort ?? ''}
              InputProps={{ readOnly: true }}
              size="small"
            />
            <FormControlLabel
              control={<Switch checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />}
              label="Enabled"
            />
            <TextField
              type="number"
              label="Priority"
              size="small"
              value={priority}
              onChange={(event) => setPriority(Number(event.target.value || 0))}
            />
            <FormControl size="small">
              <InputLabel id="route-type-label">Route Type</InputLabel>
              <Select
                labelId="route-type-label"
                value={routeType}
                label="Route Type"
                onChange={(event) => setRouteType(String(event.target.value))}
              >
                <MenuItem value="pass_through">Pass Through</MenuItem>
                <MenuItem value="filter">Filter</MenuItem>
                <MenuItem value="transform">Transform</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Message Types (comma separated)"
              size="small"
              value={messageTypesCsv}
              onChange={(event) => setMessageTypesCsv(event.target.value)}
            />
            <TextField
              label="Channels (comma separated)"
              size="small"
              value={channelsCsv}
              onChange={(event) => setChannelsCsv(event.target.value)}
            />
            <TextField
              label="Transform Chain (JSON)"
              multiline
              minRows={4}
              value={transformJson}
              onChange={(event) => setTransformJson(event.target.value)}
            />
          </div>
        </DialogContent>
        <DialogActions>
          {selection?.route?.route_id ? (
            <Button
              color="error"
              onClick={() => {
                if (selection.route?.route_id) {
                  deleteMutation.mutate(selection.route.route_id)
                }
              }}
            >
              Delete
            </Button>
          ) : null}
          <Button onClick={() => setSelection(null)}>Cancel</Button>
          <Button variant="contained" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
