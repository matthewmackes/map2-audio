/**
 * T2482 loop 11 / iter 103 — /midi/bindings filter-first list page.
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
 *
 * Iter 103 ships the read view + filter form. Iter 104 adds inline
 * toggles + per-row OverflowMenu. Iter 105 + 106 add edit + create
 * modals.
 */

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  DataTable,
  Dropdown,
  FormGroup,
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
  TextInput,
  Toggle,
} from '@carbon/react'

import {
  midiBindingsApi,
  BINDING_CONSUMER_TYPES,
  BINDING_SCOPES,
  type BindingConsumerType,
  type BindingScope,
  type BindingListFilter,
  type MidiBindingRead,
} from '../../../map2/clients/midiBindings'
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
}

const EMPTY_FILTER: FilterState = {
  strategy: 'none',
  consumer_type: '',
  consumer_id: '*',
  device_id: '',
  scope: '',
  scope_id: '',
  enabled_only: false,
}

function filterFromSearchParams(params: URLSearchParams): FilterState {
  const consumerType = params.get('consumer_type') as BindingConsumerType | null
  const deviceId = params.get('device_id')
  const scope = params.get('scope') as BindingScope | null
  if (consumerType) {
    return {
      ...EMPTY_FILTER,
      strategy: 'consumer',
      consumer_type: consumerType,
      consumer_id: params.get('consumer_id') ?? '*',
    }
  }
  if (deviceId) {
    return { ...EMPTY_FILTER, strategy: 'device', device_id: deviceId }
  }
  if (scope) {
    return {
      ...EMPTY_FILTER,
      strategy: 'scope',
      scope,
      scope_id: params.get('scope_id') ?? '',
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
]

interface BindingTableRow {
  id: string
  consumer: string
  source_type: string
  target_type: string
  scope: string
  device_id: string
  enabled: boolean
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
  }))
}

// ---------- Page ----------

export function MidiServicesBindingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [filter, setFilter] = useState<FilterState>(() => filterFromSearchParams(searchParams))

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

  const tableRows = useMemo(() => rowsFromBindings(query.data ?? []), [query.data])

  return (
    <Section className="midi-services-bindings">
      <Layer level={0}>
        <header className="midi-services-bindings__header">
          <Heading className="midi-services-bindings__title">Bindings</Heading>
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
            <FormGroup legendText="Show only enabled">
              <Toggle
                id="bindings-enabled-only"
                labelA="No"
                labelB="Yes"
                toggled={filter.enabled_only}
                onToggle={(toggled) => setFilter((prev) => ({ ...prev, enabled_only: toggled }))}
              />
            </FormGroup>
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
                              return (
                                <TableCell key={cell.id}>
                                  <Tag type={enabled ? 'green' : 'gray'} size="sm">
                                    {enabled ? 'Enabled' : 'Disabled'}
                                  </Tag>
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
    </Section>
  )
}

export default MidiServicesBindingsPage
