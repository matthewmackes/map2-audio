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

const HID_HEADERS = [
  { key: 'timestamp', header: 'Timestamp' },
  { key: 'direction', header: 'Direction' },
  { key: 'report_id', header: 'Report ID' },
  { key: 'decoded_type', header: 'Decoded Type' },
  { key: 'raw_hex', header: 'Raw Hex' },
] as const

function directionTagType(direction: string): 'green' | 'blue' | 'warm-gray' {
  if (direction === 'in') return 'green'
  if (direction === 'out') return 'blue'
  return 'warm-gray'
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
        report_id: String(event.report_id ?? 'n/a'),
        decoded_type: event.decoded_type,
        raw_hex: event.raw_hex,
      }))
  }, [deferredFilter, events, paused])

  return (
    <Layer className="maschine-page__panel" data-testid="maschine-hid-traffic-panel">
      <div className="maschine-page__panel-head">
        <h2>HID Traffic</h2>
        <Tag type="cool-gray">{rows.length} rows</Tag>
      </div>
      <div className="maschine-page__toolbar">
        <Button kind="ghost" size="sm" onClick={() => setPaused((value) => !value)}>
          {paused ? 'Resume' : 'Pause'}
        </Button>
        <Dropdown
          id="maschine-hid-filter"
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
            anchor.download = 'maschine-hid-traffic.json'
            anchor.click()
            URL.revokeObjectURL(url)
          }}
        >
          JSON export
        </Button>
      </div>
      <DataTable rows={rows} headers={[...HID_HEADERS]} useZebraStyles>
        {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps }) => (
          <TableContainer
            {...getTableContainerProps()}
            title="Recent HID ring buffer"
            description="The panel keeps the most recent 200 inbound and outbound Maschine HID events from the dedicated websocket stream."
          >
            <Table {...getTableProps()} size="sm" aria-label="Maschine HID traffic">
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
