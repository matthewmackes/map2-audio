import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FixedSizeList as List, type ListChildComponentProps } from 'react-window'
import {
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Switch,
  TextField,
} from '@mui/material'
import { midiHubApi, type MidiHubTrafficRow } from '../../../map2/api'
import { useToasts } from '../Toasts'

const TYPE_COLORS: Record<string, string> = {
  control_change: '#3b82f6',
  note_on: '#22c55e',
  note_off: '#16a34a',
  sysex: '#f97316',
  program_change: '#a855f7',
  system_realtime: '#6b7280',
  system: '#ef4444',
}

function messageTypeOf(row: MidiHubTrafficRow): string {
  return String(row.decoded?.message_type ?? 'unknown').toLowerCase()
}

function colorOf(row: MidiHubTrafficRow): string {
  const kind = messageTypeOf(row)
  return TYPE_COLORS[kind] ?? '#94a3b8'
}

function formatTimestampNs(timestampNs: number): string {
  const ms = timestampNs / 1_000_000
  const date = new Date(ms)
  return `${date.toLocaleTimeString()}.${String(Math.floor(timestampNs % 1_000_000)).padStart(6, '0')}`
}

type SortKey = 'timestamp' | 'type' | 'source' | 'destination' | 'node'

export function MidiTrafficMonitor({
  limit = 2000,
  height = 420,
}: {
  limit?: number
  height?: number
}) {
  const { pushToast } = useToasts()
  const [paused, setPaused] = useState(false)
  const [search, setSearch] = useState('')
  const [regexMode, setRegexMode] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('timestamp')
  const [sortAsc, setSortAsc] = useState(false)
  const [selected, setSelected] = useState<MidiHubTrafficRow | null>(null)
  const [lastExportPath, setLastExportPath] = useState<string | null>(null)
  const [nodeFilter, setNodeFilter] = useState<string>('all')

  const trafficQuery = useQuery({
    queryKey: ['midi-hub', 'traffic', limit],
    queryFn: () => midiHubApi.getTrafficSnapshot({ limit }),
    refetchInterval: paused ? false : 1000,
  })

  const statsQuery = useQuery({
    queryKey: ['midi-hub', 'traffic-stats'],
    queryFn: midiHubApi.getTrafficStats,
    refetchInterval: paused ? false : 2000,
  })

  const filteredRows = useMemo(() => {
    const rows = [...(trafficQuery.data?.records ?? [])]
    if (nodeFilter !== 'all') {
      rows.splice(0, rows.length, ...rows.filter(row => row.origin_node_id === nodeFilter))
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

  const Row = ({ index, style }: ListChildComponentProps) => {
    const row = filteredRows[index]
    const kind = messageTypeOf(row)
    const color = colorOf(row)
    return (
      <div
        style={{
          ...style,
          display: 'grid',
          gridTemplateColumns: '160px 120px 1fr 1fr 120px 220px',
          alignItems: 'center',
          gap: 8,
          padding: '0 10px',
          borderBottom: '1px solid rgba(148,163,184,0.12)',
          cursor: 'pointer',
          background: index % 2 === 0 ? 'rgba(2,6,23,0.35)' : 'rgba(15,23,42,0.18)',
        }}
        onClick={() => setSelected(row)}
      >
        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1' }}>{formatTimestampNs(row.timestamp_ns)}</span>
        <Chip
          label={kind}
          size="small"
          sx={{
            width: 'fit-content',
            color,
            borderColor: `${color}80`,
            backgroundColor: `${color}1A`,
          }}
          variant="outlined"
        />
        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#94a3b8' }}>{row.source_port}</span>
        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#94a3b8' }}>{row.destination_port}</span>
        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#c084fc' }}>{row.origin_node_id ?? 'local'}</span>
        <span style={{ fontFamily: 'monospace', fontSize: 12, color }}>{row.raw_hex}</span>
      </div>
    )
  }

  const messageRate = Number((statsQuery.data as any)?.messages_per_second ?? 0)
  const capturedTotal = Number((trafficQuery.data as any)?.captured_total ?? 0)
  const visibleCount = Number((trafficQuery.data as any)?.count ?? 0)

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="flex" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button variant={paused ? 'outlined' : 'contained'} size="small" onClick={() => setPaused((value) => !value)}>
          {paused ? 'Resume' : 'Pause'}
        </Button>
        <Button
          variant="outlined"
          size="small"
          onClick={async () => {
            await midiHubApi.clearTraffic()
            pushToast('Traffic buffer cleared', 'info')
            await trafficQuery.refetch()
          }}
        >
          Clear
        </Button>
        <Button
          variant="outlined"
          size="small"
          onClick={async () => {
            const result = await midiHubApi.exportTraffic('csv', 10000)
            setLastExportPath(result.path)
            pushToast(`Traffic exported (${result.count} rows)`, 'success')
          }}
        >
          Export CSV
        </Button>
        <TextField
          size="small"
          label="Search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          sx={{ minWidth: 220 }}
        />
        <TextField
          select
          size="small"
          label="Node"
          value={nodeFilter}
          onChange={(event) => setNodeFilter(event.target.value)}
          SelectProps={{ native: true }}
          sx={{ minWidth: 160 }}
        >
          <option value="all">All nodes</option>
          {nodeOptions.map((id) => (
            <option key={id} value={id}>{id}</option>
          ))}
        </TextField>
        <FormControlLabel
          control={<Switch checked={regexMode} onChange={(event) => setRegexMode(event.target.checked)} size="small" />}
          label="Regex"
        />
        <TextField
          select
          size="small"
          label="Sort"
          value={sortKey}
          onChange={(event) => setSortKey(event.target.value as SortKey)}
          SelectProps={{ native: true }}
          sx={{ minWidth: 130 }}
        >
          <option value="timestamp">Timestamp</option>
          <option value="type">Type</option>
          <option value="source">Source</option>
          <option value="destination">Destination</option>
          <option value="node">Node</option>
        </TextField>
        <FormControlLabel
          control={<Switch checked={sortAsc} onChange={(event) => setSortAsc(event.target.checked)} size="small" />}
          label="Ascending"
        />
      </div>

      <div className="flex" style={{ gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
        <Chip size="small" label={`${visibleCount} visible`} />
        <Chip size="small" label={`${capturedTotal} captured`} />
        <Chip size="small" label={`${messageRate.toFixed(1)} msg/s`} />
        {lastExportPath ? <Chip size="small" label={`Export: ${lastExportPath}`} /> : null}
      </div>

      <div
        style={{
          border: '1px solid rgba(148,163,184,0.2)',
          borderRadius: 10,
          overflow: 'hidden',
          background: 'rgba(2,6,23,0.45)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '192px 124px 1fr 1fr 220px',
            gap: 8,
            padding: '8px 10px',
            borderBottom: '1px solid rgba(148,163,184,0.18)',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.02em',
            color: '#e2e8f0',
          }}
        >
          <span>Timestamp</span>
          <span>Type</span>
          <span>Source</span>
          <span>Destination</span>
          <span>Raw Hex</span>
        </div>
        <List height={height} width="100%" itemCount={filteredRows.length} itemSize={36}>
          {Row}
        </List>
      </div>

      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} fullWidth maxWidth="md">
        <DialogTitle>MIDI Message Detail</DialogTitle>
        <DialogContent>
          {selected ? (
            <div className="stack" style={{ gap: 10 }}>
              <div><strong>Time:</strong> {formatTimestampNs(selected.timestamp_ns)}</div>
              <div><strong>Source:</strong> <code>{selected.source_port}</code></div>
              <div><strong>Destination:</strong> <code>{selected.destination_port}</code></div>
              <div><strong>Route ID:</strong> <code>{selected.route_id ?? '—'}</code></div>
              <div><strong>Raw Hex:</strong> <code>{selected.raw_hex}</code></div>
              <pre style={{ margin: 0, padding: 12, background: '#0f172a', color: '#e2e8f0', borderRadius: 8, overflowX: 'auto' }}>
                {JSON.stringify(selected, null, 2)}
              </pre>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default MidiTrafficMonitor
