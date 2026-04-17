import {
  Button,
  DataTable,
  Dropdown,
  Layer,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
} from '@carbon/react'
import { useDeferredValue, useMemo, useState } from 'react'
import type { MaschineHidEvent } from '../../../map2/types'

const TRAFFIC_HEADERS = [
  { key: 'timestamp', header: 'Time' },
  { key: 'direction', header: 'Dir' },
  { key: 'decoded_type', header: 'Type' },
  { key: 'detail', header: 'Detail' },
  { key: 'raw_hex', header: 'Raw' },
] as const

function directionTagType(direction: string): 'green' | 'blue' | 'warm-gray' {
  if (direction === 'in') return 'green'
  if (direction === 'out') return 'blue'
  return 'warm-gray'
}

function typeTagColor(type: string): 'teal' | 'purple' | 'magenta' | 'cyan' | 'warm-gray' {
  if (type.includes('pad')) return 'teal'
  if (type.includes('button')) return 'purple'
  if (type.includes('encoder')) return 'magenta'
  if (type.includes('led') || type.includes('lcd')) return 'cyan'
  return 'warm-gray'
}

function formatDetail(event: MaschineHidEvent): string {
  const p = event.payload
  if (!p) return ''
  if (p.pad !== undefined) return `pad=${String(p.pad)} pressure=${String(p.pressure ?? 0)}`
  if (p.button !== undefined) return `${String(p.button)} ${String(p.state ?? '')}`
  if (p.encoder !== undefined) return `enc=${String(p.encoder)} delta=${String(p.delta ?? 0)}`
  return Object.entries(p).map(([k, v]) => `${k}=${String(v)}`).join(' ')
}

export function MaschineHidTrafficPanel({ events }: { events: MaschineHidEvent[] }) {
  const [paused, setPaused] = useState(false)
  const [filter, setFilter] = useState<string>('all')
  const deferredFilter = useDeferredValue(filter)

  const typeOptions = useMemo(
    () => ['all', ...new Set(events.map((event) => event.decoded_type).filter(Boolean))],
    [events],
  )

  const rows = useMemo(() => {
    const filtered = paused ? events : events.slice(-200)
    return filtered
      .filter((event) => deferredFilter === 'all' || event.decoded_type === deferredFilter)
      .slice(-200)
      .reverse()
      .map((event, index) => ({
        id: `${event.timestamp}-${index}`,
        timestamp: event.timestamp,
        direction: event.direction,
        decoded_type: event.decoded_type,
        detail: formatDetail(event),
        raw_hex: event.raw_hex,
      }))
  }, [deferredFilter, events, paused])

  return (
    <Layer className="maschine-page__panel" data-testid="maschine-hid-traffic-panel" style={{ gridColumn: '1 / -1' }}>
      <div className="maschine-page__panel-head">
        <h2>Input Monitor</h2>
        <Tag type="cool-gray">{rows.length} events</Tag>
      </div>
      <div className="maschine-page__toolbar">
        <Button kind="ghost" size="sm" onClick={() => setPaused((value) => !value)}>
          {paused ? 'Resume' : 'Pause'}
        </Button>
        <Dropdown
          id="maschine-input-filter"
          titleText="Type filter"
          label="Filter type"
          items={typeOptions}
          selectedItem={filter}
          onChange={({ selectedItem }) => setFilter(String(selectedItem ?? 'all'))}
          size="sm"
        />
        <Button
          kind="tertiary"
          size="sm"
          onClick={() => {
            const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const anchor = document.createElement('a')
            anchor.href = url
            anchor.download = 'maschine-input-traffic.json'
            anchor.click()
            URL.revokeObjectURL(url)
          }}
        >
          JSON export
        </Button>
      </div>
      <DataTable rows={rows} headers={[...TRAFFIC_HEADERS]} useZebraStyles>
        {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps }) => (
          <TableContainer
            {...getTableContainerProps()}
            title="USB bulk input stream"
            description="Live pad, button, and encoder events from EP 0x84 (pads) and EP 0x81 (buttons/encoders)."
          >
            <Table {...getTableProps()} size="sm" aria-label="Maschine input traffic">
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
                      {row.cells.map((cell) => {
                        if (cell.info.header === 'direction') {
                          return (
                            <TableCell key={cell.id}>
                              <Tag type={directionTagType(String(cell.value))}>{String(cell.value)}</Tag>
                            </TableCell>
                          )
                        }
                        if (cell.info.header === 'decoded_type') {
                          return (
                            <TableCell key={cell.id}>
                              <Tag type={typeTagColor(String(cell.value))} size="sm">{String(cell.value)}</Tag>
                            </TableCell>
                          )
                        }
                        return <TableCell key={cell.id}>{String(cell.value)}</TableCell>
                      })}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>
    </Layer>
  )
}

export default MaschineHidTrafficPanel
