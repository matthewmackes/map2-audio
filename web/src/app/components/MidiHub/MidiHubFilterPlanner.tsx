import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  DataTable,
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
} from '@carbon/react'
import { midiHubApi, type MidiHubRoute } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useToasts } from '../Toasts'
import { readPorts } from './portUtils'

const FILTER_MESSAGE_OPTIONS = ['note_on', 'note_off', 'control_change', 'program_change', 'pitch_bend', 'clock', 'sysex']
const FILTER_HEADERS = [
  { key: 'source', header: 'Source' },
  { key: 'destinations', header: 'Destinations' },
  { key: 'routeType', header: 'Route type' },
  { key: 'channels', header: 'Channels' },
  { key: 'messages', header: 'Messages' },
] as const

function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

export function MidiHubFilterPlanner() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const { nodeId, scopeKey } = useMidiHubNodeScope()
  const [selectedRouteId, setSelectedRouteId] = useState('')
  const [selectedSourcePort, setSelectedSourcePort] = useState('')
  const [filterChannels, setFilterChannels] = useState<number[]>([])
  const [filterMessages, setFilterMessages] = useState<string[]>([])

  const queryRefresh = process.env.NODE_ENV === 'test' ? false : 3000

  const statusQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'status'],
    queryFn: () => midiHubApi.getStatus(nodeId),
    refetchInterval: queryRefresh,
  })

  const routesQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'routes'],
    queryFn: () => midiHubApi.getRoutes(nodeId),
    refetchInterval: queryRefresh,
  })

  const ports = useMemo(() => readPorts((statusQuery.data as Record<string, unknown> | undefined)?.ports), [statusQuery.data])
  const routes = routesQuery.data?.routes ?? []
  const selectedRoute = routes.find((route) => route.route_id === selectedRouteId) ?? null

  useEffect(() => {
    if (!selectedRouteId && routes.length > 0) {
      setSelectedRouteId(routes[0].route_id)
    }
  }, [routes, selectedRouteId])

  useEffect(() => {
    if (!selectedRoute) return
    setSelectedSourcePort(selectedRoute.source_port)
    setFilterChannels(selectedRoute.filter.channels ?? [])
    setFilterMessages(selectedRoute.filter.message_types ?? [])
  }, [selectedRoute])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRoute) throw new Error('route_required')
      return midiHubApi.updateRoute(
        selectedRoute.route_id,
        {
          source_port: selectedSourcePort || selectedRoute.source_port,
          destination_ports: selectedRoute.destination_ports,
          enabled: selectedRoute.enabled,
          priority: selectedRoute.priority,
          route_type: 'filter',
          filter: {
            channels: filterChannels,
            message_types: filterMessages,
            cc_range: selectedRoute.filter.cc_range ?? null,
            note_range: selectedRoute.filter.note_range ?? null,
            velocity_range: selectedRoute.filter.velocity_range ?? null,
          },
          transform_chain: selectedRoute.transform_chain,
          latency_compensation_enabled: selectedRoute.latency_compensation_enabled,
          destination_latency_ms: selectedRoute.destination_latency_ms,
        },
        nodeId,
      )
    },
    onSuccess: async () => {
      pushToast('Filter route saved', 'success')
      await queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'routes'] })
    },
    onError: () => pushToast('Failed to save filter route', 'error'),
  })

  const previewRows = useMemo(
    () =>
      routes
        .filter((route) => !selectedSourcePort || route.source_port === selectedSourcePort)
        .filter((route) => filterChannels.length === 0 || route.filter.channels.some((channel) => filterChannels.includes(channel)))
        .filter((route) => filterMessages.length === 0 || route.filter.message_types.some((message) => filterMessages.includes(message)))
        .map((route) => ({
          id: route.route_id,
          source: route.source_port,
          destinations: route.destination_ports.join(', '),
          routeType: route.route_type,
          channels: route.filter.channels.length > 0 ? route.filter.channels.join(', ') : 'Any',
          messages: route.filter.message_types.length > 0 ? route.filter.message_types.join(', ') : 'Any',
        })),
    [filterChannels, filterMessages, routes, selectedSourcePort],
  )

  return (
    <div className="midi-hub-processing-stack">
      <div className="midi-hub-processing-form-grid">
        <Select id="processing-filter-route" labelText="Filter route" value={selectedRouteId} onChange={(event) => setSelectedRouteId(event.currentTarget.value)}>
          <SelectItem value="" text="Select route" />
          {routes.map((route) => (
            <SelectItem key={route.route_id} value={route.route_id} text={`${route.source_port} -> ${route.destination_ports.join(', ')}`} />
          ))}
        </Select>
        <Select id="processing-filter-port" labelText="Port focus" value={selectedSourcePort} onChange={(event) => setSelectedSourcePort(event.currentTarget.value)}>
          <SelectItem value="" text="All ports" />
          {ports.map((port) => (
            <SelectItem key={port.port_id} value={port.port_id} text={port.name} />
          ))}
        </Select>
      </div>

      <div className="midi-hub-processing-choice-section">
        <div className="midi-hub-processing-choice-group">
          <h4>Channels</h4>
          <div className="midi-hub-processing-tag-grid">
            {Array.from({ length: 16 }).map((_, index) => {
              const channel = index + 1
              const active = filterChannels.includes(channel)
              return (
                <Button
                  key={channel}
                  size="sm"
                  kind={active ? 'primary' : 'ghost'}
                  onClick={() => setFilterChannels((current) => toggleValue(current, channel))}
                >
                  {`Ch ${channel}`}
                </Button>
              )
            })}
          </div>
        </div>
        <div className="midi-hub-processing-choice-group">
          <h4>Message families</h4>
          <div className="midi-hub-processing-tag-grid">
            {FILTER_MESSAGE_OPTIONS.map((message) => {
              const active = filterMessages.includes(message)
              return (
                <Button
                  key={message}
                  size="sm"
                  kind={active ? 'secondary' : 'ghost'}
                  onClick={() => setFilterMessages((current) => toggleValue(current, message))}
                >
                  {message}
                </Button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="midi-hub-processing-toolbar">
        <Tag type="cool-gray">{`Preview routes ${previewRows.length}`}</Tag>
        <Button size="sm" kind="ghost" onClick={() => {
          setFilterChannels([])
          setFilterMessages([])
        }}>
          Reset filters
        </Button>
        <Button size="sm" kind="primary" disabled={!selectedRoute} onClick={() => saveMutation.mutate()}>
          Save filter route
        </Button>
      </div>

      <DataTable rows={previewRows} headers={[...FILTER_HEADERS]} useZebraStyles>
        {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps }) => (
          <TableContainer
            {...getTableContainerProps()}
            title="Live preview"
            description="Preview the routes affected by the current port, channel, and message filter choices."
            className="midi-hub-processing-table"
          >
            <Table {...getTableProps()} aria-label="Filter preview">
              <TableHead>
                <TableRow>
                  {headers.map((header) => {
                    const { key: _key, ...headerProps } = getHeaderProps({ header })
                    return (
                      <TableHeader key={header.key} {...headerProps}>
                        {header.header}
                      </TableHeader>
                    )
                  })}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => {
                  const { key: _key, ...rowProps } = getRowProps({ row })
                  return (
                    <TableRow key={row.id} {...rowProps}>
                      {row.cells.map((cell) => (
                        <TableCell key={cell.id}>{String(cell.value)}</TableCell>
                      ))}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>
    </div>
  )
}
