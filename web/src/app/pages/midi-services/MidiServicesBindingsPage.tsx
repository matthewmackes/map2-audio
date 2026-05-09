/**
 * T2482 loop 11 / iter 103 — /midi/bindings filter-first list page.
 * T2482 loop 11 / iter 104 — inline Toggle + per-row OverflowMenu
 *   (Edit / Delete) wired to /enable, /disable, DELETE. Edit handler
 *   is a stub until iter 105 hooks in the edit modal; delete confirms
 *   via a Carbon Modal.
 *
 * Per the iter-101 plan D1: GET /api/midi/bindings is filter-required
 * (returns 400 if unfiltered). The list page therefore commits to a
 * filter strategy as a top-level UX decision: the operator picks
 * "By consumer", "By device", or "By scope", and the matching
 * value-input(s) appear. The empty state guides them to do so.
 *
 * Pre-selection via URL query params:
 *   ?consumer_type=plugin_param        -> consumer-strategy + that type
 *   ?device_id=xyz                     -> device-strategy + that device
 *   ?scope=node                        -> scope-strategy + that scope
 */

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DataTable,
  Dropdown,
  FormGroup,
  Heading,
  InlineNotification,
  Layer,
  Button,
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
  TextInput,
  Toggle,
} from '@carbon/react'

import {
  midiBindingsApi,
  BINDING_CONSUMER_TYPES,
  BINDING_SCOPES,
  BINDING_SOURCE_TYPES,
  type BindingConsumerType,
  type BindingScope,
  type BindingListFilter,
  type MidiBindingRead,
} from '../../../map2/clients/midiBindings'
import { BindingEditDrawer } from './BindingEditDrawer'
import { BindingCreateDrawer } from './BindingCreateDrawer'
import './MidiServicesBindingsPage.css'

// ---------- Filter strategy + URL sync ----------

type FilterStrategy = 'consumer' | 'device' | 'scope' | 'none'

interface FilterState {
  strategy: FilterStrategy
  consumer_type: BindingConsumerType | ''
  consumer_id: string  // free-text, "*" matches any
  device_id: string
  scope: BindingScope | ''
  scope_id: string
  enabled_only: boolean
  // T2483-4A iter 156 — client-side post-filter narrowing.
  // Backend `list_bindings` only filters by consumer/device/scope.
  // source_type narrowing happens after the response lands.
  source_type: string  // '' = all
}

const EMPTY_FILTER: FilterState = {
  strategy: 'none',
  consumer_type: '',
  consumer_id: '*',
  device_id: '',
  scope: '',
  scope_id: '',
  enabled_only: false,
  source_type: '',
}

function filterFromSearchParams(params: URLSearchParams): FilterState {
  const consumerType = params.get('consumer_type') as BindingConsumerType | null
  const deviceId = params.get('device_id')
  const scope = params.get('scope') as BindingScope | null
  const sourceType = params.get('source_type') ?? ''
  if (consumerType) {
    return {
      ...EMPTY_FILTER,
      strategy: 'consumer',
      consumer_type: consumerType,
      consumer_id: params.get('consumer_id') ?? '*',
      source_type: sourceType,
    }
  }
  if (deviceId) {
    return { ...EMPTY_FILTER, strategy: 'device', device_id: deviceId, source_type: sourceType }
  }
  if (scope) {
    return {
      ...EMPTY_FILTER,
      strategy: 'scope',
      scope,
      scope_id: params.get('scope_id') ?? '',
      source_type: sourceType,
    }
  }
  return EMPTY_FILTER
}

function buildApiFilter(state: FilterState): BindingListFilter | null {
  if (state.strategy === 'consumer' && state.consumer_type !== '') {
    return {
      consumer_type: state.consumer_type,
      consumer_id: state.consumer_id || '*',
      enabled_only: state.enabled_only,
    }
  }
  if (state.strategy === 'device' && state.device_id !== '') {
    return { device_id: state.device_id, enabled_only: state.enabled_only }
  }
  if (state.strategy === 'scope' && state.scope !== '') {
    return {
      scope: state.scope,
      scope_id: state.scope_id || undefined,
      enabled_only: state.enabled_only,
    }
  }
  return null
}

// ---------- DataTable ----------

const HEADERS = [
  { key: 'consumer', header: 'Consumer' },
  { key: 'source_type', header: 'Source' },
  { key: 'target_type', header: 'Target' },
  { key: 'scope', header: 'Scope' },
  { key: 'device_id', header: 'Device' },
  { key: 'enabled', header: 'Enabled' },
  { key: 'actions', header: '' },  // iter 104 — overflow menu column
]

interface BindingTableRow {
  id: string
  consumer: string
  source_type: string
  target_type: string
  scope: string
  device_id: string
  enabled: boolean
  actions: string  // unused — Carbon DataTable requires a property per header key
}

function rowsFromBindings(bindings: MidiBindingRead[]): BindingTableRow[] {
  return bindings.map((b) => ({
    id: b.binding_id,
    consumer: `${b.consumer_type}:${b.consumer_id}`,
    source_type: b.source_type,
    target_type: b.target_type,
    scope: b.scope_id ? `${b.scope}/${b.scope_id}` : b.scope,
    device_id: b.device_id ?? '—',
    enabled: b.enabled,
    actions: '',
  }))
}

// ---------- Page ----------

export function MidiServicesBindingsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [filter, setFilter] = useState<FilterState>(() => filterFromSearchParams(searchParams))
  const queryClient = useQueryClient()
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)

  const invalidateList = () => {
    queryClient.invalidateQueries({ queryKey: ['midi-bindings-list'] })
    queryClient.invalidateQueries({ queryKey: ['midi-services-bindings-count'] })
  }

  const enableMutation = useMutation({
    mutationFn: (bindingId: string) => midiBindingsApi.enable(bindingId),
    onSuccess: invalidateList,
    onError: (err) => setMutationError((err as Error).message),
  })

  const disableMutation = useMutation({
    mutationFn: (bindingId: string) => midiBindingsApi.disable(bindingId),
    onSuccess: invalidateList,
    onError: (err) => setMutationError((err as Error).message),
  })

  const deleteMutation = useMutation({
    mutationFn: (bindingId: string) => midiBindingsApi.delete(bindingId),
    onSuccess: () => {
      setPendingDeleteId(null)
      invalidateList()
    },
    onError: (err) => setMutationError((err as Error).message),
  })

  const handleToggle = (bindingId: string, currentlyEnabled: boolean) => {
    setMutationError(null)
    if (currentlyEnabled) {
      disableMutation.mutate(bindingId)
    } else {
      enableMutation.mutate(bindingId)
    }
  }

  const handleEdit = (bindingId: string) => {
    setMutationError(null)
    setEditId(bindingId)
  }

  const handleDeleteConfirm = (bindingId: string) => {
    setMutationError(null)
    setPendingDeleteId(bindingId)
  }

  // Sync filter strategy + value back to URL so deep-links + reloads survive.
  useEffect(() => {
    const next = new URLSearchParams()
    if (filter.strategy === 'consumer' && filter.consumer_type !== '') {
      next.set('consumer_type', filter.consumer_type)
      if (filter.consumer_id && filter.consumer_id !== '*') {
        next.set('consumer_id', filter.consumer_id)
      }
    } else if (filter.strategy === 'device' && filter.device_id !== '') {
      next.set('device_id', filter.device_id)
    } else if (filter.strategy === 'scope' && filter.scope !== '') {
      next.set('scope', filter.scope)
      if (filter.scope_id) next.set('scope_id', filter.scope_id)
    }
    if (filter.enabled_only) next.set('enabled_only', 'true')
    if (filter.source_type) next.set('source_type', filter.source_type)
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [filter, searchParams, setSearchParams])

  const apiFilter = useMemo(() => buildApiFilter(filter), [filter])

  const query = useQuery({
    queryKey: ['midi-bindings-list', apiFilter],
    queryFn: () => {
      if (!apiFilter) return Promise.resolve([] as MidiBindingRead[])
      return midiBindingsApi.list(apiFilter)
    },
    enabled: apiFilter !== null,
    refetchInterval: 5000,
    staleTime: 0,
  })

  const tableRows = useMemo(() => {
    const rows = rowsFromBindings(query.data ?? [])
    if (filter.source_type) {
      return rows.filter((r) => r.source_type === filter.source_type)
    }
    return rows
  }, [query.data, filter.source_type])

  const bindingsById = useMemo(() => {
    const map = new Map<string, MidiBindingRead>()
    for (const b of query.data ?? []) map.set(b.binding_id, b)
    return map
  }, [query.data])

  const handleOpenInSnapshots = (bindingId: string) => {
    const binding = bindingsById.get(bindingId)
    if (!binding || binding.consumer_type !== 'snapshot') return
    navigate(`/snapshots?highlight=${encodeURIComponent(binding.consumer_id)}`)
  }

  return (
    <Section className="midi-services-bindings">
      <Layer level={0}>
        <header className="midi-services-bindings__header">
          <div className="midi-services-bindings__title-row">
            <Heading className="midi-services-bindings__title">Bindings</Heading>
            <Button kind="primary" size="md" onClick={() => setCreateOpen(true)}>
              Add binding
            </Button>
          </div>
          <p className="midi-services-bindings__subtitle">
            Global filterable view of every MIDI binding in the canonical
            authority. Pick a filter strategy below to narrow the result set —
            unfiltered queries are not allowed by the backend.
          </p>
        </header>
      </Layer>

      <Layer level={1}>
        <div className="midi-services-bindings__filters">
          <FormGroup legendText="Filter strategy">
            <Dropdown
              id="bindings-filter-strategy"
              titleText=""
              label="Pick a filter strategy"
              items={['none', 'consumer', 'device', 'scope']}
              selectedItem={filter.strategy}
              itemToString={(item) =>
                item === 'none' ? 'Pick a filter…'
                : item === 'consumer' ? 'By consumer'
                : item === 'device' ? 'By device'
                : 'By scope'
              }
              onChange={({ selectedItem }) => {
                if (!selectedItem) return
                setFilter({ ...EMPTY_FILTER, strategy: selectedItem as FilterStrategy })
              }}
            />
          </FormGroup>

          {filter.strategy === 'consumer' ? (
            <>
              <FormGroup legendText="Consumer type">
                <Dropdown
                  id="bindings-consumer-type"
                  titleText=""
                  label="Pick a consumer type"
                  items={[...BINDING_CONSUMER_TYPES]}
                  selectedItem={filter.consumer_type || undefined}
                  onChange={({ selectedItem }) =>
                    setFilter((prev) => ({
                      ...prev,
                      consumer_type: (selectedItem ?? '') as BindingConsumerType | '',
                    }))
                  }
                />
              </FormGroup>
              <FormGroup legendText="Consumer ID (use * for any)">
                <TextInput
                  id="bindings-consumer-id"
                  labelText=""
                  value={filter.consumer_id}
                  onChange={(e) => setFilter((prev) => ({ ...prev, consumer_id: e.target.value }))}
                />
              </FormGroup>
            </>
          ) : null}

          {filter.strategy === 'device' ? (
            <FormGroup legendText="Device ID">
              <TextInput
                id="bindings-device-id"
                labelText=""
                value={filter.device_id}
                onChange={(e) => setFilter((prev) => ({ ...prev, device_id: e.target.value }))}
              />
            </FormGroup>
          ) : null}

          {filter.strategy === 'scope' ? (
            <>
              <FormGroup legendText="Scope">
                <Dropdown
                  id="bindings-scope"
                  titleText=""
                  label="Pick a scope"
                  items={[...BINDING_SCOPES]}
                  selectedItem={filter.scope || undefined}
                  onChange={({ selectedItem }) =>
                    setFilter((prev) => ({
                      ...prev,
                      scope: (selectedItem ?? '') as BindingScope | '',
                    }))
                  }
                />
              </FormGroup>
              <FormGroup legendText="Scope ID (optional)">
                <TextInput
                  id="bindings-scope-id"
                  labelText=""
                  value={filter.scope_id}
                  onChange={(e) => setFilter((prev) => ({ ...prev, scope_id: e.target.value }))}
                />
              </FormGroup>
            </>
          ) : null}

          {filter.strategy !== 'none' ? (
            <>
              <FormGroup legendText="Show only enabled">
                <Toggle
                  id="bindings-enabled-only"
                  labelA="No"
                  labelB="Yes"
                  toggled={filter.enabled_only}
                  onToggle={(toggled) => setFilter((prev) => ({ ...prev, enabled_only: toggled }))}
                />
              </FormGroup>
              <FormGroup legendText="Source type (client-side narrow)">
                <Dropdown
                  id="bindings-source-type"
                  titleText=""
                  label="Any source type"
                  items={['', ...BINDING_SOURCE_TYPES]}
                  selectedItem={filter.source_type || ''}
                  itemToString={(item) => (item === '' ? 'Any source type' : (item as string))}
                  onChange={({ selectedItem }) =>
                    setFilter((prev) => ({ ...prev, source_type: (selectedItem ?? '') as string }))
                  }
                />
              </FormGroup>
            </>
          ) : null}
        </div>
      </Layer>

      {query.isError ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Failed to load bindings"
          subtitle="The /api/midi/bindings endpoint returned an error. The most likely cause is a malformed filter — pick a complete filter above."
        />
      ) : null}

      {mutationError ? (
        <InlineNotification
          kind="warning"
          lowContrast
          onCloseButtonClick={() => setMutationError(null)}
          title="Mutation"
          subtitle={mutationError}
        />
      ) : null}

      <Layer level={1}>
        {apiFilter === null ? (
          <div className="midi-services-bindings__empty">
            <p>Pick a filter strategy above to load bindings. Unfiltered queries are not allowed.</p>
          </div>
        ) : (
          <DataTable rows={tableRows} headers={HEADERS}>
            {({ rows: dtRows, headers: dtHeaders, getHeaderProps, getRowProps, getTableProps }) => (
              <TableContainer
                title=""
                description={
                  query.isLoading
                    ? 'Loading bindings…'
                    : `${tableRows.length} binding${tableRows.length === 1 ? '' : 's'} match this filter`
                }
              >
                <Table {...getTableProps()} size="md">
                  <TableHead>
                    <TableRow>
                      {dtHeaders.map((h) => (
                        <TableHeader key={h.key} {...getHeaderProps({ header: h })}>
                          {h.header}
                        </TableHeader>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {dtRows.length === 0 && !query.isLoading ? (
                      <TableRow>
                        <TableCell colSpan={dtHeaders.length}>
                          <span className="midi-services-bindings__empty-row">
                            No bindings match this filter.
                          </span>
                        </TableCell>
                      </TableRow>
                    ) : (
                      dtRows.map((dtRow) => (
                        <TableRow key={dtRow.id} {...getRowProps({ row: dtRow })}>
                          {dtRow.cells.map((cell) => {
                            if (cell.info.header === 'enabled') {
                              const enabled = cell.value as boolean
                              const pending =
                                (enableMutation.isPending && enableMutation.variables === dtRow.id) ||
                                (disableMutation.isPending && disableMutation.variables === dtRow.id)
                              return (
                                <TableCell key={cell.id}>
                                  <Toggle
                                    id={`bindings-enable-${dtRow.id}`}
                                    size="sm"
                                    hideLabel
                                    labelText="Enable binding"
                                    labelA="Off"
                                    labelB="On"
                                    toggled={enabled}
                                    disabled={pending}
                                    onToggle={() => handleToggle(dtRow.id, enabled)}
                                  />
                                </TableCell>
                              )
                            }
                            if (cell.info.header === 'actions') {
                              const consumerBinding = bindingsById.get(dtRow.id)
                              const isSnapshotConsumer =
                                consumerBinding?.consumer_type === 'snapshot'
                              // Cycle 7 — differentiate the menu label so
                              // operators see the binding kind at a glance.
                              // 'program_number' rows go through snapshot
                              // recall; midi_map[] rows are per-effect maps
                              // edited inside the Snapshot Editor.
                              const snapshotKind =
                                isSnapshotConsumer && typeof consumerBinding?.metadata?.kind === 'string'
                                  ? (consumerBinding.metadata.kind as string)
                                  : null
                              const snapshotItemLabel = isSnapshotConsumer
                                ? snapshotKind === 'program_number'
                                  ? 'View snapshot (Program Change recall)'
                                  : 'View snapshot (per-effect MIDI map)'
                                : ''
                              return (
                                <TableCell key={cell.id} className="midi-services-bindings__actions-cell">
                                  <OverflowMenu
                                    iconDescription="Row actions"
                                    size="sm"
                                    flipped
                                  >
                                    <OverflowMenuItem
                                      itemText="Edit"
                                      onClick={() => handleEdit(dtRow.id)}
                                    />
                                    {isSnapshotConsumer ? (
                                      <OverflowMenuItem
                                        itemText={snapshotItemLabel}
                                        onClick={() => handleOpenInSnapshots(dtRow.id)}
                                      />
                                    ) : null}
                                    <OverflowMenuItem
                                      itemText="Delete"
                                      isDelete
                                      hasDivider
                                      onClick={() => handleDeleteConfirm(dtRow.id)}
                                    />
                                  </OverflowMenu>
                                </TableCell>
                              )
                            }
                            return <TableCell key={cell.id}>{String(cell.value)}</TableCell>
                          })}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </DataTable>
        )}
      </Layer>

      <BindingEditDrawer
        bindingId={editId}
        open={editId !== null}
        onClose={() => setEditId(null)}
      />

      <BindingCreateDrawer open={createOpen} onClose={() => setCreateOpen(false)} />

      <Modal
        open={pendingDeleteId !== null}
        modalHeading="Delete this binding?"
        modalLabel="Bindings"
        primaryButtonText="Delete"
        secondaryButtonText="Cancel"
        danger
        primaryButtonDisabled={deleteMutation.isPending}
        onRequestClose={() => setPendingDeleteId(null)}
        onRequestSubmit={() => {
          if (pendingDeleteId) deleteMutation.mutate(pendingDeleteId)
        }}
      >
        <p className="midi-services-bindings__delete-modal-body">
          Binding <code>{pendingDeleteId ?? ''}</code> will be permanently
          removed from the canonical authority. Active consumers will lose
          this binding immediately.
        </p>
      </Modal>
    </Section>
  )
}

export default MidiServicesBindingsPage
