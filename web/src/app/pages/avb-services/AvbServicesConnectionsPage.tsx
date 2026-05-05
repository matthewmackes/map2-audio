/**
 * AvbServicesConnectionsPage.
 *
 * Operator-visible Carbon DataTable backed by the canonical
 * `/api/avb/bindings/*` authority. Mirrors MidiServicesConnectionsPage
 * (single canonical surface, no parallel store). Rows include both
 * durable bindings and live `AvbRouter`-projected synthetic rows
 * (tagged "(live)" in the Authored-by column).
 *
 * T2496-6 — per-row OverflowMenu wires Disable / Enable / Delete to
 * the canonical `/api/avb/bindings/{id}/{disable,enable}` and
 * `DELETE /api/avb/bindings/{id}` routes. Synthetic projection rows
 * (proj-* binding_ids) cannot be mutated through this surface — the
 * action menu is hidden for them since the underlying state lives in
 * the AvbRouter, not the authority. Once T2496-2 has finished
 * rolling out across every router connection, every row will be a
 * mutable durable binding.
 */

import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  DataTable,
  Heading,
  InlineNotification,
  Layer,
  Modal,
  OverflowMenu,
  OverflowMenuItem,
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
  // T2496-6 — true iff the row is a live AvbRouter projection that
  // can't be mutated through this surface (no underlying authority row).
  projected: boolean
  // T2496-6 — needed by the action menu to decide which mutation to
  // offer (Disable vs Enable).
  raw_enabled: boolean
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
      projected: live,
      raw_enabled: b.enabled,
    }
  })
}

// ---------- T2496-6: per-row mutation API ----------

async function disableAvbBinding(bindingId: string): Promise<void> {
  const response = await fetch(
    `/api/avb/bindings/${encodeURIComponent(bindingId)}/disable?modified_by=operator`,
    { method: 'POST' },
  )
  if (!response.ok) throw new Error(`disable failed: ${response.status}`)
}

async function enableAvbBinding(bindingId: string): Promise<void> {
  const response = await fetch(
    `/api/avb/bindings/${encodeURIComponent(bindingId)}/enable?modified_by=operator`,
    { method: 'POST' },
  )
  if (!response.ok) throw new Error(`enable failed: ${response.status}`)
}

async function deleteAvbBinding(bindingId: string): Promise<void> {
  const response = await fetch(
    `/api/avb/bindings/${encodeURIComponent(bindingId)}`,
    { method: 'DELETE' },
  )
  if (!response.ok && response.status !== 204) {
    throw new Error(`delete failed: ${response.status}`)
  }
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

  const queryClient = useQueryClient()
  const invalidateAvbCaches = () => {
    queryClient.invalidateQueries({ queryKey: ['avb-bindings-matrix'] })
    queryClient.invalidateQueries({ queryKey: ['avb-bindings-count'] })
    queryClient.invalidateQueries({ queryKey: ['avb-cluster-matrix'] })
  }

  const [mutationError, setMutationError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ConnectionRow | null>(null)

  const disableMutation = useMutation({
    mutationFn: disableAvbBinding,
    onSuccess: invalidateAvbCaches,
    onError: (err) =>
      setMutationError(err instanceof Error ? err.message : String(err)),
  })

  const enableMutation = useMutation({
    mutationFn: enableAvbBinding,
    onSuccess: invalidateAvbCaches,
    onError: (err) =>
      setMutationError(err instanceof Error ? err.message : String(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteAvbBinding,
    onSuccess: () => {
      invalidateAvbCaches()
      setPendingDelete(null)
    },
    onError: (err) =>
      setMutationError(err instanceof Error ? err.message : String(err)),
  })

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

      {mutationError ? (
        <InlineNotification
          kind="error"
          lowContrast
          title="Mutation failed"
          subtitle={mutationError}
          onCloseButtonClick={() => setMutationError(null)}
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
                      <TableHeader>Actions</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tRows.map((r) => {
                      const sourceRow = rows.find((row) => row.id === r.id)
                      const isProjected = sourceRow?.projected ?? false
                      const rawEnabled = sourceRow?.raw_enabled ?? true
                      return (
                        <TableRow {...getRowProps({ row: r })} key={r.id}>
                          {r.cells.map((cell) => (
                            <TableCell key={cell.id}>{cell.value}</TableCell>
                          ))}
                          <TableCell data-testid={`avb-connection-actions-${r.id}`}>
                            {isProjected ? (
                              <Tag type="cool-gray" size="sm" title="Live router projection — manage from the AvbRouter">
                                live
                              </Tag>
                            ) : (
                              <OverflowMenu
                                aria-label="Connection actions"
                                size="sm"
                                flipped
                              >
                                {rawEnabled ? (
                                  <OverflowMenuItem
                                    itemText="Disable"
                                    onClick={() => disableMutation.mutate(r.id)}
                                    disabled={disableMutation.isPending}
                                  />
                                ) : (
                                  <OverflowMenuItem
                                    itemText="Enable"
                                    onClick={() => enableMutation.mutate(r.id)}
                                    disabled={enableMutation.isPending}
                                  />
                                )}
                                <OverflowMenuItem
                                  itemText="Delete"
                                  hasDivider
                                  isDelete
                                  onClick={() =>
                                    setPendingDelete(sourceRow ?? null)
                                  }
                                />
                              </OverflowMenu>
                            )}
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
      </Layer>

      {pendingDelete ? (
        <Modal
          open
          modalHeading="Delete AVB binding"
          modalLabel={pendingDelete.consumer}
          primaryButtonText={
            deleteMutation.isPending ? 'Deleting…' : 'Delete'
          }
          primaryButtonDisabled={deleteMutation.isPending}
          danger
          secondaryButtonText="Cancel"
          onRequestClose={() => setPendingDelete(null)}
          onRequestSubmit={() => deleteMutation.mutate(pendingDelete.id)}
        >
          <p>
            Permanently remove this binding from the canonical authority?
          </p>
          <p>
            <strong>Consumer:</strong> {pendingDelete.consumer}
            <br />
            <strong>Source → Target:</strong> {pendingDelete.source} → {pendingDelete.target}
            <br />
            <strong>Stream:</strong> {pendingDelete.stream}
          </p>
          <p>
            For router-owned rows, the underlying audio routing is
            unaffected — the AvbRouter will re-create the binding the
            next time the connection is reasserted. Delete here is for
            cleaning stale or orphaned authority rows.
          </p>
        </Modal>
      ) : null}

      {/* Hidden util buttons for accessibility test harness */}
      <div hidden>
        <Button kind="ghost" disabled>
          {disableMutation.isPending ? 'disabling' : null}
          {enableMutation.isPending ? 'enabling' : null}
          {deleteMutation.isPending ? 'deleting' : null}
        </Button>
      </div>
    </Section>
  )
}

export default AvbServicesConnectionsPage
