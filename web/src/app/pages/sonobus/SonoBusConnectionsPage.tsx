/**
 * T2521-6b — SonoBusConnectionsPage.
 *
 * Operator Connections workspace for /sonobus/connections. Mirrors
 * AvbServicesConnectionsPage's DataTable shape — one row per binding,
 * with kind + talker → listener + group + capability + enabled tag.
 *
 * Data source: /api/sonobus/bindings/matrix (single round-trip — both
 * the per-row data and the aggregate cell counts come back in one
 * request).
 */

import { useMemo } from 'react'
import {
  DataTable,
  Heading,
  Layer,
  Section,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  Tile,
} from '@carbon/react'

import {
  useSonoBusBindingsMatrix,
  type SonoBusBindingRecord,
} from './useSonoBusBindings'
import './SonoBusOverviewPage.css'

const HEADERS = [
  { key: 'kind', header: 'Kind' },
  { key: 'consumer', header: 'Consumer' },
  { key: 'route', header: 'Route' },
  { key: 'group', header: 'Group / Session' },
  { key: 'capability', header: 'Capability' },
  { key: 'priority', header: 'Priority' },
  { key: 'enabled', header: 'Enabled' },
]

type CarbonTagTone = 'green' | 'red' | 'cool-gray' | 'warm-gray' | 'magenta'

function capabilityTone(cap: string | null): CarbonTagTone {
  switch (cap) {
    case 'map2':
      return 'green'
    case 'sonobus_native':
      return 'cool-gray'
    case 'aoo_native':
      return 'warm-gray'
    default:
      return 'cool-gray'
  }
}

function priorityTone(priority: string): CarbonTagTone {
  switch (priority) {
    case 'avb_preferred':
      return 'cool-gray'
    case 'sonobus_preferred':
      return 'magenta'
    case 'sonobus_only':
      return 'magenta'
    default:
      return 'cool-gray'
  }
}

function formatRoute(b: SonoBusBindingRecord): string {
  const talker = b.talker_node_id ?? 'local'
  const endpoint =
    (b.target_descriptor as Record<string, unknown>)?.listener_peer_endpoint ??
    (b.target_descriptor as Record<string, unknown>)?.endpoint ??
    b.listener_node_id ??
    '—'
  return `${talker} → ${String(endpoint)}`
}

interface RowEntry {
  id: string
  kind: string
  consumer: string
  route: string
  group: string
  capability: string | null
  priority: string
  enabled: boolean
}

function bindingToRow(b: SonoBusBindingRecord): RowEntry {
  return {
    id: b.binding_id,
    kind: b.binding_kind,
    consumer: b.consumer_label || b.consumer_id,
    route: formatRoute(b),
    group: b.group_id ? `${b.group_id}${b.session_label ? ` — ${b.session_label}` : ''}` : '—',
    capability: b.listener_capability,
    priority: b.transport_priority,
    enabled: b.enabled,
  }
}

export function SonoBusConnectionsPage() {
  const matrix = useSonoBusBindingsMatrix()
  const rows = useMemo<RowEntry[]>(() => {
    const bindings = matrix.data?.bindings ?? []
    return bindings.map(bindingToRow)
  }, [matrix.data])

  const total = matrix.data?.total_bindings ?? 0
  const enabledCount = useMemo(
    () => rows.reduce((acc, r) => acc + (r.enabled ? 1 : 0), 0),
    [rows],
  )

  return (
    <Section
      className="sonobus-overview"
      data-testid="sonobus-connections-page"
    >
      <Layer level={0}>
        <header className="sonobus-overview__header">
          <Heading className="sonobus-overview__title">SonoBus Connections</Heading>
          <p className="sonobus-overview__subtitle">
            One row per durable binding in the SonoBus binding authority.
            Live row-edit lands in a later T2521-6 slice; this page is
            read-only for now.
          </p>
          <div className="sonobus-overview__row" data-testid="sonobus-connections-summary">
            <Tag type={total > 0 ? 'green' : 'cool-gray'} size="sm">
              {`Total ${total}`}
            </Tag>
            <Tag type={enabledCount > 0 ? 'green' : 'cool-gray'} size="sm">
              {`Enabled ${enabledCount}`}
            </Tag>
            {matrix.isError && (
              <Tag type="red" size="sm">
                Matrix unavailable
              </Tag>
            )}
            {matrix.isLoading && (
              <Tag type="cool-gray" size="sm">
                Loading…
              </Tag>
            )}
          </div>
        </header>
      </Layer>

      <Layer level={1}>
        <Tile className="sonobus-overview__tile">
          <DataTable rows={rows} headers={HEADERS}>
            {({
              rows: tableRows,
              headers,
              getTableProps,
              getHeaderProps,
              getRowProps,
            }) => (
              <TableContainer
                title="Bindings"
                description={`SonoBus bindings (${total} total / ${enabledCount} enabled)`}
              >
                <Table {...getTableProps()} size="md">
                  <TableHead>
                    <TableRow>
                      {headers.map((header) => (
                        <TableHeader
                          {...getHeaderProps({ header })}
                          key={String(header.key)}
                        >
                          {header.header}
                        </TableHeader>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tableRows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={headers.length}
                          data-testid="sonobus-connections-empty"
                        >
                          No bindings yet — create a SonoBus connection
                          via the binding wizard (next T2521-6 slice).
                        </TableCell>
                      </TableRow>
                    ) : (
                      tableRows.map((row) => {
                        const source = rows.find((r) => r.id === row.id)!
                        return (
                          <TableRow
                            {...getRowProps({ row })}
                            data-testid={`sonobus-connections-row-${row.id}`}
                          >
                            {row.cells.map((cell) => {
                              if (cell.info.header === 'kind') {
                                return (
                                  <TableCell key={cell.id}>
                                    <Tag type="cool-gray" size="sm">
                                      {source.kind}
                                    </Tag>
                                  </TableCell>
                                )
                              }
                              if (cell.info.header === 'capability') {
                                return (
                                  <TableCell key={cell.id}>
                                    {source.capability ? (
                                      <Tag
                                        type={capabilityTone(source.capability)}
                                        size="sm"
                                      >
                                        {source.capability}
                                      </Tag>
                                    ) : (
                                      '—'
                                    )}
                                  </TableCell>
                                )
                              }
                              if (cell.info.header === 'priority') {
                                return (
                                  <TableCell key={cell.id}>
                                    <Tag
                                      type={priorityTone(source.priority)}
                                      size="sm"
                                    >
                                      {source.priority.replace('_', ' ')}
                                    </Tag>
                                  </TableCell>
                                )
                              }
                              if (cell.info.header === 'enabled') {
                                return (
                                  <TableCell key={cell.id}>
                                    <Tag
                                      type={source.enabled ? 'green' : 'warm-gray'}
                                      size="sm"
                                    >
                                      {source.enabled ? 'Yes' : 'No'}
                                    </Tag>
                                  </TableCell>
                                )
                              }
                              return <TableCell key={cell.id}>{cell.value}</TableCell>
                            })}
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </DataTable>
        </Tile>
      </Layer>
    </Section>
  )
}

export default SonoBusConnectionsPage
