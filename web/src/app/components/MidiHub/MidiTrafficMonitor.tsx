import { ConnectionSignal } from '@carbon/icons-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  CodeSnippet,
  ComposedModal,
  DataTable,
  ModalBody,
  ModalFooter,
  ModalHeader,
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
  Toggle,
} from '@carbon/react'
import { midiHubApi, type MidiHubTrafficRow } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { MidiHubEmptyState } from './MidiHubHelpPrimitives'
import { useToasts } from '../Toasts'

type SortKey = 'timestamp' | 'type' | 'source' | 'destination' | 'node'

type TrafficTableRow = {
  id: string
  timestamp: string
  type: string
  source: string
  destination: string
  node: string
  bytes: string
}

const HEADERS = [
  { key: 'timestamp', header: 'Timestamp' },
  { key: 'type', header: 'Type' },
  { key: 'source', header: 'Source' },
  { key: 'destination', header: 'Destination' },
  { key: 'node', header: 'Node' },
  { key: 'bytes', header: 'Bytes' },
] as const

function messageTypeOf(row: MidiHubTrafficRow): string {
  return String(row.decoded?.message_type ?? 'unknown').toLowerCase()
}

function tagTypeOf(row: MidiHubTrafficRow):
  | 'blue'
  | 'green'
  | 'purple'
  | 'magenta'
  | 'red'
  | 'cool-gray'
  | 'warm-gray' {
  const kind = messageTypeOf(row)
  if (kind === 'control_change') return 'blue'
  if (kind === 'note_on' || kind === 'note_off') return 'green'
  if (kind === 'program_change') return 'purple'
  if (kind === 'sysex') return 'magenta'
  if (kind === 'system') return 'red'
  if (kind === 'system_realtime') return 'cool-gray'
  return 'warm-gray'
}

function formatTimestampNs(timestampNs: number): string {
  const ms = timestampNs / 1_000_000
  const date = new Date(ms)
  return `${date.toLocaleTimeString()}.${String(Math.floor(timestampNs % 1_000_000)).padStart(6, '0')}`
}

export function MidiTrafficMonitor({
  limit = 2000,
}: {
  limit?: number
}) {
  const { pushToast } = useToasts()
  const { nodeId, scopeKey } = useMidiHubNodeScope()
  const [paused, setPaused] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('timestamp')
  const [sortAsc, setSortAsc] = useState(false)
  const [selected, setSelected] = useState<MidiHubTrafficRow | null>(null)
  const [lastExportPath, setLastExportPath] = useState<string | null>(null)
  const deferredSearch = useDeferredValue(searchValue)

  const trafficQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'traffic', limit],
    queryFn: () => midiHubApi.getTrafficSnapshot({ limit }, nodeId),
    refetchInterval: paused ? false : 1000,
  })

  const statsQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'traffic-stats'],
    queryFn: () => midiHubApi.getTrafficStats(nodeId),
    refetchInterval: paused ? false : 2000,
  })

  const filteredRows = useMemo(() => {
    const rows = [...(trafficQuery.data?.records ?? [])]
    const needle = deferredSearch.trim().toLowerCase()
    if (needle) {
      rows.splice(
        0,
        rows.length,
        ...rows.filter((row) =>
          `${row.raw_hex} ${row.source_port} ${row.destination_port} ${row.route_id ?? ''} ${messageTypeOf(row)}`
            .toLowerCase()
            .includes(needle),
        ),
      )
    }

    rows.sort((a, b) => {
      const direction = sortAsc ? 1 : -1
      if (sortKey === 'timestamp') return (a.timestamp_ns - b.timestamp_ns) * direction
      if (sortKey === 'type') return messageTypeOf(a).localeCompare(messageTypeOf(b)) * direction
      if (sortKey === 'source') return a.source_port.localeCompare(b.source_port) * direction
      if (sortKey === 'node') return (a.origin_node_id || '').localeCompare(b.origin_node_id || '') * direction
      return a.destination_port.localeCompare(b.destination_port) * direction
    })
    return rows
  }, [deferredSearch, sortAsc, sortKey, trafficQuery.data?.records])

  const tableRows = useMemo<TrafficTableRow[]>(
    () =>
      filteredRows.slice(0, 500).map((row) => ({
        id: `${row.timestamp_ns}-${row.raw_hex}-${row.source_port}-${row.destination_port}`,
        timestamp: formatTimestampNs(row.timestamp_ns),
        type: messageTypeOf(row),
        source: row.source_port,
        destination: row.destination_port,
        node: row.origin_node_id ?? 'local',
        bytes: row.raw_hex,
      })),
    [filteredRows],
  )

  const selectedById = useMemo(() => new Map(filteredRows.map((row) => [`${row.timestamp_ns}-${row.raw_hex}-${row.source_port}-${row.destination_port}`, row])), [filteredRows])
  const messageRate = Number((statsQuery.data as { messages_per_second?: number } | undefined)?.messages_per_second ?? 0)
  const capturedTotal = Number((trafficQuery.data as { captured_total?: number } | undefined)?.captured_total ?? 0)
  const visibleCount = Number((trafficQuery.data as { count?: number } | undefined)?.count ?? 0)
  return (
    <>
      <div className="midi-hub-connections-toolbar">
        <Tag type={paused ? 'warm-gray' : 'green'}>{paused ? 'Paused' : 'Streaming'}</Tag>
        <Tag type="cool-gray">{`${messageRate.toFixed(1)} msg/s`}</Tag>
        <Tag type="cool-gray">{`Visible ${visibleCount}`}</Tag>
        <Tag type="cool-gray">{`Captured ${capturedTotal}`}</Tag>
        {lastExportPath ? <Tag type="blue">Export ready</Tag> : null}
      </div>

      <DataTable rows={tableRows} headers={[...HEADERS]} isSortable useZebraStyles>
        {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps, getToolbarProps }) => (
          <TableContainer
            {...getTableContainerProps()}
            title="Traffic monitor"
            description="Search, pause, and export the local event stream without leaving the connections area."
            className="midi-hub-connections-table"
          >
            <TableToolbar {...getToolbarProps()}>
              <TableToolbarContent className="midi-hub-connections-toolbar">
                <TableToolbarSearch
                  persistent
                  value={searchValue}
                  onChange={(_event, value) => setSearchValue(value ?? '')}
                />
                <Button size="sm" kind={sortKey === 'timestamp' ? 'secondary' : 'ghost'} onClick={() => setSortKey('timestamp')}>
                  Time
                </Button>
                <Button size="sm" kind={sortKey === 'type' ? 'secondary' : 'ghost'} onClick={() => setSortKey('type')}>
                  Type
                </Button>
                <Button size="sm" kind={sortKey === 'source' ? 'secondary' : 'ghost'} onClick={() => setSortKey('source')}>
                  Source
                </Button>
                <Button size="sm" kind={sortKey === 'destination' ? 'secondary' : 'ghost'} onClick={() => setSortKey('destination')}>
                  Destination
                </Button>
                <Button size="sm" kind={sortKey === 'node' ? 'secondary' : 'ghost'} onClick={() => setSortKey('node')}>
                  Node
                </Button>
                <Toggle
                  id="midi-hub-traffic-paused"
                  size="sm"
                  labelText="Pause stream"
                  labelA="Live"
                  labelB="Paused"
                  toggled={paused}
                  onToggle={setPaused}
                />
                <Toggle
                  id="midi-hub-traffic-ascending"
                  size="sm"
                  labelText="Ascending"
                  labelA="Desc"
                  labelB="Asc"
                  toggled={sortAsc}
                  onToggle={setSortAsc}
                />
                <Button
                  size="sm"
                  kind="ghost"
                  onClick={async () => {
                    await midiHubApi.clearTraffic(nodeId)
                    pushToast('Traffic buffer cleared', 'info')
                    await trafficQuery.refetch()
                  }}
                >
                  Clear buffer
                </Button>
                <Button
                  size="sm"
                  kind="secondary"
                  onClick={async () => {
                    const result = await midiHubApi.exportTraffic('csv', 10000, nodeId)
                    setLastExportPath(result.path)
                    pushToast(`Traffic exported (${result.count} rows)`, 'success')
                  }}
                >
                  Export CSV
                </Button>
              </TableToolbarContent>
            </TableToolbar>
            <div className="midi-hub-connections-table-scroll midi-hub-traffic-monitor__table-scroll">
              {rows.length === 0 ? (
                <MidiHubEmptyState
                  title="No traffic captured yet"
                  description="Send MIDI through an active route, then search, pause, or export the live event stream from this workspace."
                  icon={<ConnectionSignal size={20} />}
                />
              ) : (
                <Table {...getTableProps()} aria-label="MIDI traffic monitor">
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
                    {rows.map((row) => {
                      const { key: _key, ...rowProps } = getRowProps({ row })
                      const source = selectedById.get(row.id)
                      return (
                        <TableRow key={row.id} {...rowProps}>
                          {row.cells.map((cell) => {
                            if (cell.info.header === 'type' && source) {
                              return (
                                <TableCell key={cell.id}>
                                  <Tag type={tagTypeOf(source)}>{String(cell.value)}</Tag>
                                </TableCell>
                              )
                            }
                            return <TableCell key={cell.id}>{String(cell.value)}</TableCell>
                          })}
                          <TableCell>
                            <Button size="sm" kind="ghost" onClick={() => setSelected(source ?? null)} disabled={!source}>
                              Inspect
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          </TableContainer>
        )}
      </DataTable>

      <ComposedModal open={Boolean(selected)} size="lg" onClose={() => setSelected(null)}>
        <ModalHeader title="MIDI event detail" />
        <ModalBody>
          {selected ? (
            <CodeSnippet className="midi-hub-connections-code-block" type="multi">
              {JSON.stringify(selected, null, 2)}
            </CodeSnippet>
          ) : null}
        </ModalBody>
        <ModalFooter>
          <Button kind="primary" onClick={() => setSelected(null)}>
            Close
          </Button>
        </ModalFooter>
      </ComposedModal>
    </>
  )
}
