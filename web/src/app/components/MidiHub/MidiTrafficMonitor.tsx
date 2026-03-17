import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Checkbox,
  Modal,
  Search,
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
import { midiHubApi, type MidiHubTrafficRow } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useToasts } from '../Toasts'

type SortKey = 'timestamp' | 'type' | 'source' | 'destination' | 'node'

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
  height = 420,
}: {
  limit?: number
  height?: number
}) {
  const { pushToast } = useToasts()
  const { nodeId, scopeKey } = useMidiHubNodeScope()
  const [paused, setPaused] = useState(false)
  const [search, setSearch] = useState('')
  const [regexMode, setRegexMode] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('timestamp')
  const [sortAsc, setSortAsc] = useState(false)
  const [selected, setSelected] = useState<MidiHubTrafficRow | null>(null)
  const [lastExportPath, setLastExportPath] = useState<string | null>(null)
  const [nodeFilter, setNodeFilter] = useState<string>('all')

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
    if (nodeFilter !== 'all') {
      rows.splice(0, rows.length, ...rows.filter((row) => row.origin_node_id === nodeFilter))
    }
    if (search.trim()) {
      const term = search.trim()
      const predicate = (row: MidiHubTrafficRow) => {
        const blob = `${row.raw_hex} ${row.source_port} ${row.destination_port} ${row.route_id ?? ''} ${messageTypeOf(row)}`
        if (regexMode) {
          try {
            return new RegExp(term, 'i').test(blob)
          } catch {
            return false
          }
        }
        return blob.toLowerCase().includes(term.toLowerCase())
      }
      rows.splice(0, rows.length, ...rows.filter(predicate))
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
  }, [trafficQuery.data?.records, search, regexMode, sortKey, sortAsc, nodeFilter])

  const nodeOptions = useMemo(() => {
    const ids = new Set<string>()
    for (const row of trafficQuery.data?.records ?? []) {
      if (row.origin_node_id) ids.add(row.origin_node_id)
    }
    return Array.from(ids)
  }, [trafficQuery.data?.records])

  const renderedRows = useMemo(() => filteredRows.slice(0, 500), [filteredRows])

  const messageRate = Number((statsQuery.data as { messages_per_second?: number } | undefined)?.messages_per_second ?? 0)
  const capturedTotal = Number((trafficQuery.data as { captured_total?: number } | undefined)?.captured_total ?? 0)
  const visibleCount = Number((trafficQuery.data as { count?: number } | undefined)?.count ?? 0)

  return (
    <>
      <div className="midi-hub-mini-surface">
        <div className="midi-hub-toolbar">
          <Tag type={paused ? 'warm-gray' : 'green'}>{paused ? 'Paused' : 'Streaming'}</Tag>
          <Tag type="cool-gray">{`${messageRate.toFixed(1)} msg/s`}</Tag>
          <Tag type="cool-gray">{`Visible ${visibleCount}`}</Tag>
          <Tag type="cool-gray">{`Captured ${capturedTotal}`}</Tag>
          {lastExportPath ? <Tag type="blue">Export ready</Tag> : null}
        </div>

        <div className="midi-hub-form-grid">
          <Search
            id="midi-hub-traffic-search"
            size="lg"
            labelText="Search MIDI events"
            closeButtonLabelText="Clear search"
            placeholder="Search by bytes, route, source, or destination"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <Select
            id="midi-hub-traffic-node-filter"
            labelText="Origin node"
            value={nodeFilter}
            onChange={(event) => setNodeFilter(event.currentTarget.value)}
          >
            <SelectItem value="all" text="All nodes" />
            {nodeOptions.map((id) => (
              <SelectItem key={id} value={id} text={id} />
            ))}
          </Select>

          <Select
            id="midi-hub-traffic-sort"
            labelText="Sort"
            value={sortKey}
            onChange={(event) => setSortKey(event.currentTarget.value as SortKey)}
          >
            <SelectItem value="timestamp" text="Timestamp" />
            <SelectItem value="type" text="Type" />
            <SelectItem value="source" text="Source" />
            <SelectItem value="destination" text="Destination" />
            <SelectItem value="node" text="Node" />
          </Select>
        </div>

        <div className="midi-hub-actions">
          <Checkbox
            id="midi-hub-traffic-regex"
            labelText="Regex"
            checked={regexMode}
            onChange={(_, data) => setRegexMode(data.checked)}
          />
          <Checkbox
            id="midi-hub-traffic-ascending"
            labelText="Ascending"
            checked={sortAsc}
            onChange={(_, data) => setSortAsc(data.checked)}
          />
          <Button size="sm" kind={paused ? 'secondary' : 'ghost'} onClick={() => setPaused((value) => !value)}>
            {paused ? 'Resume monitor' : 'Pause monitor'}
          </Button>
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
        </div>
      </div>

      <div className="midi-hub-table-wrap" style={{ maxHeight: height, overflowY: 'auto' }}>
        <TableContainer>
          <Table size="sm" className="midi-hub-table">
            <TableHead>
              <TableRow>
                <TableHeader>Timestamp</TableHeader>
                <TableHeader>Type</TableHeader>
                <TableHeader>Source</TableHeader>
                <TableHeader>Destination</TableHeader>
                <TableHeader>Node</TableHeader>
                <TableHeader>Bytes</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {renderedRows.map((row) => (
                <TableRow
                  key={`${row.timestamp_ns}-${row.raw_hex}-${row.source_port}-${row.destination_port}`}
                  onClick={() => setSelected(row)}
                  style={{ cursor: 'pointer' }}
                >
                  <TableCell>
                    <code>{formatTimestampNs(row.timestamp_ns)}</code>
                  </TableCell>
                  <TableCell>
                    <Tag type={tagTypeOf(row)}>{messageTypeOf(row)}</Tag>
                  </TableCell>
                  <TableCell>
                    <code>{row.source_port}</code>
                  </TableCell>
                  <TableCell>
                    <code>{row.destination_port}</code>
                  </TableCell>
                  <TableCell>
                    <code>{row.origin_node_id ?? 'local'}</code>
                  </TableCell>
                  <TableCell>
                    <code>{row.raw_hex}</code>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </div>

      {filteredRows.length > renderedRows.length ? (
        <div className="midi-hub-panel-note">{`Showing ${renderedRows.length} of ${filteredRows.length} filtered rows.`}</div>
      ) : null}

      <Modal
        open={Boolean(selected)}
        size="lg"
        modalHeading="MIDI event detail"
        primaryButtonText="Close"
        onRequestClose={() => setSelected(null)}
        onRequestSubmit={() => setSelected(null)}
      >
        {selected ? (
          <div className="midi-hub-modal-grid">
            <div className="midi-hub-stat-grid">
              <div className="midi-hub-stat-tile">
                <span className="midi-hub-stat-tile__label">Timestamp</span>
                <strong className="midi-hub-stat-tile__value">{formatTimestampNs(selected.timestamp_ns)}</strong>
              </div>
              <div className="midi-hub-stat-tile">
                <span className="midi-hub-stat-tile__label">Type</span>
                <strong className="midi-hub-stat-tile__value">{messageTypeOf(selected)}</strong>
              </div>
              <div className="midi-hub-stat-tile">
                <span className="midi-hub-stat-tile__label">Source</span>
                <strong className="midi-hub-stat-tile__value">{selected.source_port}</strong>
              </div>
              <div className="midi-hub-stat-tile">
                <span className="midi-hub-stat-tile__label">Destination</span>
                <strong className="midi-hub-stat-tile__value">{selected.destination_port}</strong>
              </div>
            </div>
            <pre className="midi-hub-code-block">{JSON.stringify(selected, null, 2)}</pre>
          </div>
        ) : null}
      </Modal>
    </>
  )
}
