/**
 * AvbServicesConnectionsPage.
 *
 * Operator-visible Carbon DataTable backed by the canonical
 * `/api/avb/bindings/*` authority. Mirrors MidiServicesConnectionsPage
 * (single canonical surface, no parallel store). Rows include both
 * durable bindings and live `AvbRouter`-projected synthetic rows
 * (tagged "(live)" in the Authored-by column).
 *
 * Per-row mutation surface (Disable / Enable / Delete) lands with T2496-6.
 */

import { useMemo } from 'react'
import {
  DataTable,
  Heading,
  InlineNotification,
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
} from '@carbon/react'

import {
  isProjectedAvbBinding,
  useAvbBindingsAllScopes,
  useAvbBindingsCount,
  type AvbBindingRecord,
} from './useAvbBindings'
import { useAvbServicesShellWindow } from './useAvbServicesShellWindow'
import './AvbServicesRegionPage.css'

interface ConnectionRow {
  id: string
  consumer: string
  source: string
  target: string
  stream: string
  format: string
  srp: string
  scope: string
  enabled: 'yes' | 'no'
  source_provenance: string
}

const HEADERS: { key: keyof ConnectionRow; header: string }[] = [
  { key: 'consumer',          header: 'Consumer' },
  { key: 'source',            header: 'Source' },
  { key: 'target',            header: 'Target' },
  { key: 'stream',            header: 'Stream' },
  { key: 'format',            header: 'Format' },
  { key: 'srp',               header: 'SRP' },
  { key: 'scope',             header: 'Scope' },
  { key: 'enabled',           header: 'Enabled' },
  { key: 'source_provenance', header: 'Authored by' },
]

function describeNode(nodeId: string | null | undefined): string {
  if (!nodeId) return 'local'
  return nodeId
}

function bindingsToRows(bindings: AvbBindingRecord[]): ConnectionRow[] {
  return bindings.map((b) => {
    const live = isProjectedAvbBinding(b)
    return {
      id: b.binding_id,
      consumer: `${b.consumer_type}:${b.consumer_id}`,
      source: `${b.source_type}${b.talker_node_id ? ` @ ${describeNode(b.talker_node_id)}` : ''}`,
      target: `${b.target_type}${b.listener_node_id ? ` @ ${describeNode(b.listener_node_id)}` : ''}`,
      stream: b.stream_id ?? '—',
      format: b.stream_format ?? '—',
      srp: b.srp_class ?? '—',
      scope: b.scope_id ? `${b.scope}:${b.scope_id}` : b.scope,
      enabled: b.enabled ? 'yes' : 'no',
      source_provenance: live ? `${b.source} (live)` : b.source,
    }
  })
}

export function AvbServicesConnectionsPage() {
  useAvbServicesShellWindow(
    'Connections',
    'Talker / listener pairings sourced from the canonical AvbBindingAuthority.',
  )

  const countQuery = useAvbBindingsCount()
  const { data: bindings, isLoading, isError } = useAvbBindingsAllScopes()
  const rows = useMemo(() => bindingsToRows(bindings), [bindings])
  const count = countQuery.data ?? 0

  return (
    <Section className="avb-services-region" data-testid="avb-services-connections-page">
      <Layer level={0}>
        <header className="avb-services-region__header">
          <Heading className="avb-services-region__title">Connections</Heading>
          <p className="avb-services-region__subtitle">
            Talker / listener pairings backed by the canonical
            <code> AvbBindingAuthority</code> (
            <code>/api/avb/bindings</code>). Durable rows and live
            <code> AvbRouter</code>-projected synthetic rows are folded
            into a single read.
          </p>
          <div>
            <Tag type="cool-gray">Read-only</Tag>
            <Tag type="blue">{count} total</Tag>
          </div>
        </header>
      </Layer>

      {isError ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Could not load AVB bindings"
          subtitle="Confirm the backend service is reachable on port 8080."
        />
      ) : null}

      <Layer level={1}>
        {!isLoading && rows.length === 0 ? (
          <div className="avb-services-region__placeholder">
            No AVB connections to show. Connections populate as operators
            author talker / listener pairings, as AVDECC stream
            connections complete, or as cluster routing decisions land.
            <code>POST /api/avb/bindings</code> seeds rows directly.
          </div>
        ) : (
          <DataTable rows={rows} headers={HEADERS}>
            {({
              rows: tRows,
              headers,
              getHeaderProps,
              getRowProps,
              getTableProps,
            }) => (
              <TableContainer
                title="AVB binding connections"
                description="One row per canonical AvbBinding."
              >
                <Table {...getTableProps()} size="md">
                  <TableHead>
                    <TableRow>
                      {headers.map((h) => (
                        <TableHeader {...getHeaderProps({ header: h })} key={h.key}>
                          {h.header}
                        </TableHeader>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tRows.map((r) => (
                      <TableRow {...getRowProps({ row: r })} key={r.id}>
                        {r.cells.map((cell) => (
                          <TableCell key={cell.id}>{cell.value}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </DataTable>
        )}
      </Layer>
    </Section>
  )
}

export default AvbServicesConnectionsPage
