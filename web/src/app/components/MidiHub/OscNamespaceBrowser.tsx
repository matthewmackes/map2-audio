import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  DataTable,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  TableToolbarContent,
  Tag,
  TextInput,
} from '@carbon/react'
import { midiHubApi } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useToasts } from '../Toasts'

const HEADERS = [
  { key: 'address', header: 'Address' },
  { key: 'description', header: 'Description' },
  { key: 'direction', header: 'Direction' },
  { key: 'value', header: 'Current value' },
]

export function OscNamespaceBrowser() {
  const queryClient = useQueryClient()
  const { nodeId, scopeKey } = useMidiHubNodeScope()
  const { pushToast } = useToasts()
  const [search, setSearch] = useState('/map2/')
  const [dispatchAddress, setDispatchAddress] = useState('/map2/ping')
  const [dispatchValue, setDispatchValue] = useState('1')

  const namespaceQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'osc-namespace'],
    queryFn: () => midiHubApi.getOscNamespace(nodeId),
    refetchInterval: 4000,
  })

  const refreshNamespace = () => queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'osc-namespace'] })

  const dispatchMutation = useMutation({
    mutationFn: async () => {
      const trimmed = dispatchValue.trim()
      const parsedValue = trimmed === '' ? undefined : Number.isFinite(Number(trimmed)) ? Number(trimmed) : trimmed
      return midiHubApi.dispatchOscNamespace({ address: dispatchAddress.trim(), value: parsedValue }, nodeId)
    },
    onSuccess: async () => {
      pushToast('OSC namespace dispatch sent', 'success')
      await refreshNamespace()
    },
    onError: () => pushToast('OSC namespace dispatch failed', 'error'),
  })

  const rows = useMemo(
    () =>
      (namespaceQuery.data?.entries ?? [])
        .filter((entry) => {
          const needle = search.trim().toLowerCase()
          if (!needle) return true
          return entry.address.toLowerCase().includes(needle) || entry.description.toLowerCase().includes(needle)
        })
        .map((entry) => ({
          id: entry.address,
          address: entry.address,
          description: entry.description,
          direction: entry.direction,
          value: typeof entry.current_value === 'object' ? JSON.stringify(entry.current_value) : String(entry.current_value ?? ''),
        })),
    [namespaceQuery.data?.entries, search],
  )

  return (
    <div className="midi-hub-network-panel">
      <div className="midi-hub-network-panel__section">
        <div className="midi-hub-network-panel__toolbar">
          <Tag type="blue">{`Namespace ${namespaceQuery.data?.count ?? 0}`}</Tag>
          <Tag type="cool-gray">/map2/*</Tag>
        </div>
        <div className="midi-hub-form-grid">
          <TextInput id="osc-namespace-search" labelText="Search namespace" value={search} onChange={(event) => setSearch(event.currentTarget.value)} />
          <TextInput id="osc-namespace-dispatch-address" labelText="Dispatch address" value={dispatchAddress} onChange={(event) => setDispatchAddress(event.currentTarget.value)} />
          <TextInput id="osc-namespace-dispatch-value" labelText="Dispatch value" value={dispatchValue} onChange={(event) => setDispatchValue(event.currentTarget.value)} />
        </div>
        <div className="midi-hub-actions">
          <Button size="sm" kind="primary" onClick={() => dispatchMutation.mutate()}>
            Dispatch namespace event
          </Button>
        </div>
      </div>

      <DataTable rows={rows} headers={HEADERS} useZebraStyles>
        {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps, getToolbarProps }) => (
          <TableContainer
            {...getTableContainerProps()}
            title="OSC namespace browser"
            description="Search every `/map2/*` endpoint, inspect its current value, and dispatch test traffic."
            className="midi-hub-network-table"
          >
            <TableToolbar {...getToolbarProps()}>
              <TableToolbarContent>
                <Tag type="cool-gray">{`Recent events ${namespaceQuery.data?.recent_events.length ?? 0}`}</Tag>
              </TableToolbarContent>
            </TableToolbar>
            <Table {...getTableProps()} aria-label="OSC namespace browser">
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
                      {row.cells.map((cell) => (
                        <TableCell key={cell.id}>{String(cell.value)}</TableCell>
                      ))}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>

      <pre className="midi-hub-code-block">{JSON.stringify(namespaceQuery.data?.recent_events ?? [], null, 2)}</pre>
    </div>
  )
}
