/**
 * T2496-1 — AvbServicesBindingsPage.
 *
 * Filter-first list view sourced from the canonical
 * `/api/avb/bindings/matrix?include_router=true` (T2490-2 + T2490-3a).
 * Operators can narrow by consumer type, scope, and enabled-only;
 * router-projected rows are tagged inline.
 *
 * Per-row mutation (Disable / Enable / Delete) + Create drawer land
 * with T2496-6.
 */

import { useMemo, useState } from 'react'
import {
  DataTable,
  Dropdown,
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
  Toggle,
} from '@carbon/react'

import {
  isProjectedAvbBinding,
  useAvbBindingsAllScopes,
  useAvbBindingsCount,
  type AvbBindingRecord,
} from './useAvbBindings'
import { useAvbServicesShellWindow } from './useAvbServicesShellWindow'
import './AvbServicesRegionPage.css'

const CONSUMER_TYPE_OPTIONS = [
  { id: 'any',                  label: 'Any consumer type' },
  { id: 'avdecc_stream',        label: 'AVDECC stream' },
  { id: 'tesira_preset',        label: 'Tesira preset' },
  { id: 'tesira_block',         label: 'Tesira block' },
  { id: 'cluster_route',        label: 'Cluster route' },
  { id: 'srp_reservation',      label: 'SRP reservation' },
] as const

const SCOPE_OPTIONS = [
  { id: 'any',      label: 'Any scope' },
  { id: 'global',   label: 'Global' },
  { id: 'snapshot', label: 'Snapshot' },
  { id: 'node',     label: 'Node' },
  { id: 'cluster',  label: 'Cluster' },
] as const

interface BindingRow {
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

const HEADERS: { key: keyof BindingRow; header: string }[] = [
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

function bindingsToRows(bindings: AvbBindingRecord[]): BindingRow[] {
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

export function AvbServicesBindingsPage() {
  useAvbServicesShellWindow(
    'Bindings',
    'Canonical AvbBinding authority — talker / listener / stream / format.',
  )

  const countQuery = useAvbBindingsCount()
  const { data: bindings, isLoading, isError } = useAvbBindingsAllScopes()

  const [consumerType, setConsumerType] = useState<string>('any')
  const [scope, setScope] = useState<string>('any')
  const [enabledOnly, setEnabledOnly] = useState<boolean>(false)

  const filteredBindings = useMemo(() => {
    return bindings.filter((b) => {
      if (consumerType !== 'any' && b.consumer_type !== consumerType) return false
      if (scope !== 'any' && b.scope !== scope) return false
      if (enabledOnly && !b.enabled) return false
      return true
    })
  }, [bindings, consumerType, scope, enabledOnly])

  const rows = useMemo(() => bindingsToRows(filteredBindings), [filteredBindings])
  const total = countQuery.data ?? 0

  return (
    <Section className="avb-services-region" data-testid="avb-services-bindings-page">
      <Layer level={0}>
        <header className="avb-services-region__header">
          <Heading className="avb-services-region__title">Bindings</Heading>
          <p className="avb-services-region__subtitle">
            Canonical authority for AVB talker / listener pairings, AVDECC
            stream connections, Tesira preset / design recall, and SRP class.
            Mirrors <code>/midi/bindings</code>. Filter by consumer type,
            scope, or enabled-only; router-projected rows are tagged inline.
          </p>
          <div>
            <Tag type="blue">{total} total</Tag>
            <Tag type="cool-gray">{rows.length} shown</Tag>
          </div>
        </header>
      </Layer>

      <Layer level={1}>
        <div className="avb-services-bindings__filters">
          <Dropdown
            id="avb-bindings-consumer-type"
            titleText="Consumer type"
            label="Any consumer type"
            items={[...CONSUMER_TYPE_OPTIONS]}
            itemToString={(i) => (i ? i.label : '')}
            selectedItem={
              CONSUMER_TYPE_OPTIONS.find((i) => i.id === consumerType) ??
              CONSUMER_TYPE_OPTIONS[0]
            }
            onChange={({ selectedItem }) => {
              if (selectedItem) setConsumerType(selectedItem.id)
            }}
            size="md"
          />
          <Dropdown
            id="avb-bindings-scope"
            titleText="Scope"
            label="Any scope"
            items={[...SCOPE_OPTIONS]}
            itemToString={(i) => (i ? i.label : '')}
            selectedItem={
              SCOPE_OPTIONS.find((i) => i.id === scope) ?? SCOPE_OPTIONS[0]
            }
            onChange={({ selectedItem }) => {
              if (selectedItem) setScope(selectedItem.id)
            }}
            size="md"
          />
          <Toggle
            id="avb-bindings-enabled-only"
            labelA="All"
            labelB="Enabled only"
            labelText="Enabled filter"
            toggled={enabledOnly}
            onToggle={(v) => setEnabledOnly(v)}
            size="md"
          />
        </div>
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
            {bindings.length === 0
              ? 'No AVB bindings yet. Bindings populate as operators author talker / listener pairings, as AVDECC stream connections complete, or as cluster routing decisions land.'
              : 'No bindings match the current filter. Adjust the consumer type, scope, or enabled-only toggle to widen the view.'}
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
                title="AVB binding authority"
                description="One row per canonical AvbBinding (durable + live router projections)."
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

export default AvbServicesBindingsPage
