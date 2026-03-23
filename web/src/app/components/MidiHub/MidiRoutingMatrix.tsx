import { useDeferredValue, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Checkbox,
  ComposedModal,
  DataTable,
  InlineNotification,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Tag,
  TextArea,
  TextInput,
} from '@carbon/react'
import { midiHubApi, type MidiHubRoute, type MidiHubRouteRequest } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useToasts } from '../Toasts'
import { readPorts } from './portUtils'

type MatrixSelection = {
  sourcePort: string
  destinationPort: string
  route?: MidiHubRoute
}

type MatrixRow = {
  id: string
  source: string
  sourceKind: string
  destination: string
  destinationKind: string
  state: string
  routeType: string
  priority: string
  detail: string
}

const HEADERS = [
  { key: 'source', header: 'Source' },
  { key: 'destination', header: 'Destination' },
  { key: 'state', header: 'State' },
  { key: 'routeType', header: 'Mode' },
  { key: 'priority', header: 'Priority' },
  { key: 'detail', header: 'Detail' },
] as const

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
  const [searchValue, setSearchValue] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [priority, setPriority] = useState('100')
  const [routeType, setRouteType] = useState('pass_through')
  const [messageTypesCsv, setMessageTypesCsv] = useState('')
  const [channelsCsv, setChannelsCsv] = useState('')
  const [transformJson, setTransformJson] = useState('[]')
  const [showAdvancedEditor, setShowAdvancedEditor] = useState(false)
  const deferredSearch = useDeferredValue(searchValue)

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

  const ports = useMemo(
    () => readPorts((statusQuery.data as Record<string, unknown> | undefined)?.ports),
    [statusQuery.data],
  )

  const sources = ports.filter((port) => port.direction === 'input' || port.direction === 'duplex')
  const destinations = ports.filter((port) => port.direction === 'output' || port.direction === 'duplex')

  const rows = useMemo<MatrixRow[]>(() => {
    return sources.flatMap((source) =>
      destinations.map((destination) => {
        const route = routeMap.get(`${source.port_id}__${destination.port_id}`)
        const advanced = hasAdvancedRouteState(route)
        return {
          id: `${source.port_id}__${destination.port_id}`,
          source: source.name,
          sourceKind: source.kind,
          destination: destination.name,
          destinationKind: destination.kind,
          state: route ? (route.enabled ? 'Active' : 'Disabled') : 'Available',
          routeType: route ? route.route_type : 'create',
          priority: String(route?.priority ?? 100),
          detail: route
            ? advanced
              ? 'Advanced filter or transform'
              : 'Pass-through'
            : `${source.name} to ${destination.name}`,
        }
      }),
    )
  }, [destinations, routeMap, sources])

  const rowsById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows])

  const filteredRows = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((row) =>
      [row.source, row.sourceKind, row.destination, row.destinationKind, row.state, row.routeType, row.detail]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }, [deferredSearch, rows])

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
      <div className="midi-hub-connections-toolbar">
        <Tag type="cool-gray">{`Sources ${sources.length}`}</Tag>
        <Tag type="cool-gray">{`Destinations ${destinations.length}`}</Tag>
        <Tag type={routesQuery.data?.routes?.length ? 'green' : 'warm-gray'}>
          {`Routes ${routesQuery.data?.routes?.length ?? 0}`}
        </Tag>
      </div>

      {rows.length === 0 ? (
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title="No route matrix available"
          subtitle="Connect at least one input and one output to build source-to-destination routes."
        />
      ) : (
        <DataTable rows={filteredRows} headers={[...HEADERS]} isSortable useZebraStyles>
          {({ rows: renderedRows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps, getToolbarProps }) => (
            <TableContainer
              {...getTableContainerProps()}
              title="Port matrix"
              description="Build the active path first, then add filters or transforms only where they are required."
              className="midi-hub-connections-table"
            >
              <TableToolbar {...getToolbarProps()}>
                <TableToolbarContent>
                  <TableToolbarSearch
                    persistent
                    value={searchValue}
                    onChange={(_event, value) => setSearchValue(value ?? '')}
                  />
                  <Button
                    size="sm"
                    kind="ghost"
                    onClick={() => void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey] })}
                  >
                    Refresh matrix
                  </Button>
                </TableToolbarContent>
              </TableToolbar>
              <Table {...getTableProps()} aria-label="MIDI routing matrix">
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
                    <TableHeader>Action</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {renderedRows.map((row) => {
                    const { key: _key, ...rowProps } = getRowProps({ row })
                    const [sourcePort, destinationPort] = row.id.split('__')
                    const route = routeMap.get(row.id)
                    const advanced = hasAdvancedRouteState(route)
                    return (
                      <TableRow key={row.id} {...rowProps}>
                        {row.cells.map((cell) => {
                          const sourceRow = rowsById.get(row.id)
                          if (cell.info.header === 'source') {
                            return (
                              <TableCell key={cell.id}>
                                <div className="midi-hub-connections-cell-copy">
                                  <span className="midi-hub-connections-cell-title">{String(cell.value)}</span>
                                  <span>{sourceRow?.sourceKind}</span>
                                </div>
                              </TableCell>
                            )
                          }
                          if (cell.info.header === 'destination') {
                            return (
                              <TableCell key={cell.id}>
                                <div className="midi-hub-connections-cell-copy">
                                  <span className="midi-hub-connections-cell-title">{String(cell.value)}</span>
                                  <span>{sourceRow?.destinationKind}</span>
                                </div>
                              </TableCell>
                            )
                          }
                          if (cell.info.header === 'state') {
                            return (
                              <TableCell key={cell.id}>
                                <Tag type={route ? (route.enabled ? 'green' : 'warm-gray') : 'cool-gray'}>
                                  {String(cell.value)}
                                </Tag>
                              </TableCell>
                            )
                          }
                          if (cell.info.header === 'routeType') {
                            return (
                              <TableCell key={cell.id}>
                                <Tag type={advanced ? 'blue' : 'cool-gray'}>{String(cell.value)}</Tag>
                              </TableCell>
                            )
                          }
                          return <TableCell key={cell.id}>{String(cell.value)}</TableCell>
                        })}
                        <TableCell>
                          <Button
                            size="sm"
                            kind={route ? 'secondary' : 'primary'}
                            onClick={() => openEditor(sourcePort, destinationPort)}
                          >
                            {route ? 'Edit route' : 'Create route'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DataTable>
      )}

      <ComposedModal
        open={Boolean(selection)}
        size="lg"
        onClose={() => setSelection(null)}
      >
        <ModalHeader title={selection?.route ? 'Edit route' : 'Create route'} />
        <ModalBody>
          {selection ? (
            <div className="midi-hub-connections-modal">
              <div className="midi-hub-connections-toolbar">
                <Tag type="cool-gray">{selection.sourcePort}</Tag>
                <Tag type="blue">{selection.destinationPort}</Tag>
                {selection.route ? (
                  <Tag type={selection.route.enabled ? 'green' : 'warm-gray'}>
                    {selection.route.enabled ? 'Enabled' : 'Disabled'}
                  </Tag>
                ) : null}
              </div>

              <div className="midi-hub-connections-form-grid">
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

              <div className="midi-hub-connections-toolbar">
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
                  <div className="midi-hub-connections-form-grid">
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
            </div>
          ) : null}
        </ModalBody>
        <ModalFooter>
          <Button kind="secondary" onClick={() => setSelection(null)}>
            Cancel
          </Button>
          {selection?.route?.route_id ? (
            <Button kind="danger--tertiary" onClick={() => void deleteMutation.mutate(selection.route.route_id)}>
              Delete route
            </Button>
          ) : null}
          <Button kind="primary" onClick={() => void saveMutation.mutate()}>
            Save route
          </Button>
        </ModalFooter>
      </ComposedModal>
    </>
  )
}
