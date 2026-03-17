import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Checkbox,
  Modal,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  TextArea,
  TextInput,
} from '@carbon/react'
import { midiHubApi, type MidiHubRoute, type MidiHubRouteRequest } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
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

function hasAdvancedRouteState(route: MidiHubRoute | undefined): boolean {
  if (!route) return false
  if (route.priority !== 100) return true
  if (route.route_type !== 'pass_through') return true
  if ((route.filter?.message_types?.length ?? 0) > 0) return true
  if ((route.filter?.channels?.length ?? 0) > 0) return true
  if ((route.transform_chain?.length ?? 0) > 0) return true
  return false
}

export function MidiRoutingMatrix() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const { nodeId, scopeKey } = useMidiHubNodeScope()
  const [selection, setSelection] = useState<MatrixSelection | null>(null)
  const [enabled, setEnabled] = useState(true)
  const [priority, setPriority] = useState('100')
  const [routeType, setRouteType] = useState('pass_through')
  const [messageTypesCsv, setMessageTypesCsv] = useState('')
  const [channelsCsv, setChannelsCsv] = useState('')
  const [transformJson, setTransformJson] = useState('[]')
  const [showAdvancedEditor, setShowAdvancedEditor] = useState(false)

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

  const routeMap = useMemo(() => buildRouteMap(routesQuery.data?.routes ?? []), [routesQuery.data?.routes])

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

      let parsedTransform: Array<Record<string, unknown>> = []
      try {
        const raw = JSON.parse(transformJson || '[]')
        if (!Array.isArray(raw)) {
          throw new Error('Transform JSON must be an array.')
        }
        parsedTransform = raw as Array<Record<string, unknown>>
      } catch (error) {
        throw new Error(`Transform JSON is invalid: ${error instanceof Error ? error.message : 'Unknown parse error'}`)
      }

      const payload: MidiHubRouteRequest = {
        source_port: selection.sourcePort,
        destination_ports: [selection.destinationPort],
        enabled,
        priority: Math.max(1, Number.parseInt(priority || '100', 10) || 100),
        route_type: routeType,
        filter: {
          message_types: parseCsvList(messageTypesCsv),
          channels: parseCsvNumbers(channelsCsv),
        },
        transform_chain: parsedTransform,
      }

      if (selection.route?.route_id) {
        return midiHubApi.updateRoute(selection.route.route_id, payload, nodeId)
      }
      return midiHubApi.createRoute(payload, nodeId)
    },
    onSuccess: () => {
      pushToast('Route saved', 'success')
      setSelection(null)
      setShowAdvancedEditor(false)
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey] })
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Failed to save route'
      pushToast(message, 'error')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (routeId: string) => midiHubApi.deleteRoute(routeId, nodeId),
    onSuccess: () => {
      pushToast('Route deleted', 'info')
      setSelection(null)
      setShowAdvancedEditor(false)
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey] })
    },
    onError: () => pushToast('Failed to delete route', 'error'),
  })

  const openEditor = (sourcePort: string, destinationPort: string) => {
    const route = routeMap.get(`${sourcePort}__${destinationPort}`)
    setSelection({ sourcePort, destinationPort, route })
    setEnabled(route?.enabled ?? true)
    setPriority(String(route?.priority ?? 100))
    setRouteType(route?.route_type ?? 'pass_through')
    setMessageTypesCsv((route?.filter?.message_types ?? []).join(','))
    setChannelsCsv((route?.filter?.channels ?? []).join(','))
    setTransformJson(JSON.stringify(route?.transform_chain ?? [], null, 2))
    setShowAdvancedEditor(hasAdvancedRouteState(route))
  }

  return (
    <>
      <div className="midi-hub-mini-surface">
        <div className="midi-hub-toolbar">
          <Tag type="cool-gray">{`Sources ${sources.length}`}</Tag>
          <Tag type="cool-gray">{`Destinations ${destinations.length}`}</Tag>
          <Tag type={routesQuery.data?.routes?.length ? 'green' : 'warm-gray'}>
            {`Routes ${routesQuery.data?.routes?.length ?? 0}`}
          </Tag>
        </div>

        <div className="midi-hub-route-legend">
          <Tag type="green">Active route</Tag>
          <Tag type="warm-gray">Disabled route</Tag>
          <Tag type="blue">Advanced route</Tag>
          <Tag type="cool-gray">No route</Tag>
        </div>

        <div className="midi-hub-panel-note">
          Build a pass-through route first. Add filters, route priority, or transform chains only after the source and
          destination are already proven in the event monitor.
        </div>

        <div className="midi-hub-actions">
          <Button size="sm" kind="ghost" onClick={() => void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey] })}>
            Refresh matrix
          </Button>
        </div>
      </div>

      <div className="midi-hub-route-matrix-wrap">
        <TableContainer>
          <Table size="sm" className="midi-hub-route-matrix">
            <TableHead>
              <TableRow>
                <TableHeader>Source</TableHeader>
                {destinations.map((destination) => (
                  <TableHeader key={destination.port_id}>
                    <div className="midi-hub-route-header">
                      <strong>{destination.name}</strong>
                      <span className="midi-hub-route-header-meta">{destination.kind}</span>
                    </div>
                  </TableHeader>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {sources.map((source) => (
                <TableRow key={source.port_id}>
                  <TableCell>
                    <div className="midi-hub-route-source">
                      <strong>{source.name}</strong>
                      <span className="midi-hub-route-source-meta">{source.kind}</span>
                    </div>
                  </TableCell>
                  {destinations.map((destination) => {
                    const route = routeMap.get(`${source.port_id}__${destination.port_id}`)
                    const hasAdvancedState = hasAdvancedRouteState(route)
                    return (
                      <TableCell key={destination.port_id}>
                        <button
                          type="button"
                          className={[
                            'midi-hub-route-cell',
                            route ? (route.enabled ? 'midi-hub-route-cell--active' : 'midi-hub-route-cell--disabled') : '',
                            hasAdvancedState ? 'midi-hub-route-cell--advanced' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => openEditor(source.port_id, destination.port_id)}
                        >
                          <strong>{route ? (route.enabled ? 'Active' : 'Disabled') : 'Create route'}</strong>
                          <span className="midi-hub-route-cell__meta">
                            {route
                              ? hasAdvancedState
                                ? `${route.route_type} · advanced`
                                : 'Pass-through'
                              : `${source.name} to ${destination.name}`}
                          </span>
                        </button>
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </div>

      <Modal
        open={Boolean(selection)}
        size="lg"
        modalHeading={selection?.route ? 'Edit route' : 'Create route'}
        primaryButtonText="Save route"
        onRequestClose={() => setSelection(null)}
        onRequestSubmit={() => {
          void saveMutation.mutate()
        }}
      >
        {selection ? (
          <div className="midi-hub-modal-grid">
            <div className="midi-hub-toolbar">
              <Tag type="cool-gray">{selection.sourcePort}</Tag>
              <Tag type="blue">{selection.destinationPort}</Tag>
              {selection.route ? <Tag type={selection.route.enabled ? 'green' : 'warm-gray'}>{selection.route.enabled ? 'Enabled' : 'Disabled'}</Tag> : null}
            </div>

            <div className="midi-hub-form-grid">
              <Select
                id="midi-hub-route-type"
                labelText="Route type"
                value={routeType}
                onChange={(event) => setRouteType(event.currentTarget.value)}
              >
                <SelectItem value="pass_through" text="Pass-through" />
                <SelectItem value="filter" text="Filter" />
                <SelectItem value="transform" text="Transform" />
              </Select>

              <TextInput
                id="midi-hub-route-priority"
                labelText="Route priority"
                value={priority}
                onChange={(event) => setPriority(event.currentTarget.value)}
              />
            </div>

            <div className="midi-hub-actions">
              <Checkbox
                id="midi-hub-route-enabled"
                labelText="Route enabled"
                checked={enabled}
                onChange={(_, data) => setEnabled(data.checked)}
              />
              <Checkbox
                id="midi-hub-route-advanced"
                labelText="Show advanced fields"
                checked={showAdvancedEditor}
                onChange={(_, data) => setShowAdvancedEditor(data.checked)}
              />
            </div>

            {showAdvancedEditor ? (
              <>
                <div className="midi-hub-form-grid">
                  <TextInput
                    id="midi-hub-route-message-types"
                    labelText="Message types"
                    value={messageTypesCsv}
                    onChange={(event) => setMessageTypesCsv(event.currentTarget.value)}
                    placeholder="note_on, control_change"
                  />
                  <TextInput
                    id="midi-hub-route-channels"
                    labelText="Channels"
                    value={channelsCsv}
                    onChange={(event) => setChannelsCsv(event.currentTarget.value)}
                    placeholder="1, 2, 10"
                  />
                </div>

                <TextArea
                  id="midi-hub-route-transforms"
                  labelText="Transform chain JSON"
                  value={transformJson}
                  onChange={(event) => setTransformJson(event.currentTarget.value)}
                  rows={8}
                />
              </>
            ) : null}

            {selection.route?.route_id ? (
              <div className="midi-hub-actions">
                <Button
                  size="sm"
                  kind="danger--tertiary"
                  onClick={() => {
                    void deleteMutation.mutate(selection.route!.route_id)
                  }}
                >
                  Delete route
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </>
  )
}
