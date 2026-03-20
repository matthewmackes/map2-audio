import { useDeferredValue, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  DataTable,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Tag,
  TextInput,
  Toggle,
} from '@carbon/react'
import { midiHubApi, type MidiHubEventList } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useToasts } from '../Toasts'

type EventListManagerProps = {
  selectedEventListId: string
  onSelectEventList: (eventListId: string) => void
}

const HEADERS = [
  { key: 'name', header: 'List' },
  { key: 'type', header: 'Type' },
  { key: 'clock', header: 'Clock' },
  { key: 'status', header: 'Status' },
  { key: 'cursor', header: 'Cursor' },
] as const

export function EventListManager({ selectedEventListId, onSelectEventList }: EventListManagerProps) {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const { nodeId, scopeKey } = useMidiHubNodeScope()
  const [searchValue, setSearchValue] = useState('')
  const [eventListId, setEventListId] = useState('show-open')
  const [name, setName] = useState('Show Open')
  const [listType, setListType] = useState<'mtc' | 'rtc'>('mtc')
  const [sourceId, setSourceId] = useState('internal')
  const [firstTime, setFirstTime] = useState('00:00:00:00')
  const [lastTime, setLastTime] = useState('00:05:00:00')
  const [timezone, setTimezone] = useState('UTC')
  const [internalClockEnabled, setInternalClockEnabled] = useState(true)
  const deferredSearch = useDeferredValue(searchValue)

  const eventListsQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'event-lists'],
    queryFn: () => midiHubApi.listEventLists(nodeId),
    refetchInterval: 1000,
  })

  const upsertMutation = useMutation({
    mutationFn: async () =>
      midiHubApi.upsertEventList(
        {
          event_list_id: eventListId.trim(),
          name: name.trim(),
          list_type: listType,
          source_id: sourceId.trim(),
          internal_clock_enabled: internalClockEnabled,
          first_time: firstTime.trim(),
          last_time: lastTime.trim(),
          fps: 30,
          timezone: timezone.trim(),
          enabled: true,
        },
        nodeId,
      ),
    onSuccess: async (payload) => {
      pushToast('Event list saved', 'success')
      await queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'event-lists'] })
      onSelectEventList(payload.event_list.event_list_id)
    },
    onError: () => pushToast('Failed to save event list', 'error'),
  })

  const startMutation = useMutation({
    mutationFn: async (eventListIdValue: string) => midiHubApi.startEventList(eventListIdValue, nodeId),
    onSuccess: () => {
      pushToast('Event list started', 'success')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'event-lists'] })
    },
  })

  const stopMutation = useMutation({
    mutationFn: async (eventListIdValue: string) => midiHubApi.stopEventList(eventListIdValue, nodeId),
    onSuccess: () => {
      pushToast('Event list stopped', 'info')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'event-lists'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (eventListIdValue: string) => midiHubApi.deleteEventList(eventListIdValue, nodeId),
    onSuccess: () => {
      pushToast('Event list deleted', 'info')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'event-lists'] })
      onSelectEventList('')
    },
  })

  const rows = useMemo(
    () =>
      (eventListsQuery.data?.event_lists ?? []).map((row: MidiHubEventList) => ({
        id: row.event_list_id,
        name: row.name,
        type: row.list_type.toUpperCase(),
        clock: row.clock_source,
        status: row.running ? 'Running' : 'Stopped',
        cursor: row.list_type === 'rtc' ? (row.current_datetime ?? 'Waiting') : row.current_timecode,
      })),
    [eventListsQuery.data?.event_lists],
  )

  const filteredRows = useMemo(() => {
    const needle = deferredSearch.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((row) => `${row.name} ${row.type} ${row.clock} ${row.cursor}`.toLowerCase().includes(needle))
  }, [deferredSearch, rows])

  return (
    <div className="midi-hub-events-stack">
      <div className="midi-hub-events-form-grid">
        <TextInput id="event-list-id" labelText="Event list ID" value={eventListId} onChange={(event) => setEventListId(event.currentTarget.value)} />
        <TextInput id="event-list-name" labelText="Name" value={name} onChange={(event) => setName(event.currentTarget.value)} />
        <Select id="event-list-type" labelText="Type" value={listType} onChange={(event) => setListType(event.currentTarget.value === 'rtc' ? 'rtc' : 'mtc')}>
          <SelectItem value="mtc" text="MTC" />
          <SelectItem value="rtc" text="RTC" />
        </Select>
        <TextInput id="event-list-source" labelText="Source ID" value={sourceId} onChange={(event) => setSourceId(event.currentTarget.value)} />
        <TextInput id="event-list-first-time" labelText="First time" value={firstTime} onChange={(event) => setFirstTime(event.currentTarget.value)} />
        <TextInput id="event-list-last-time" labelText="Last time" value={lastTime} onChange={(event) => setLastTime(event.currentTarget.value)} />
        <TextInput id="event-list-timezone" labelText="Timezone" value={timezone} onChange={(event) => setTimezone(event.currentTarget.value)} />
        <Toggle
          id="event-list-internal-clock"
          size="sm"
          labelText="Internal clock fallback"
          labelA="External"
          labelB="Internal"
          toggled={internalClockEnabled}
          onToggle={setInternalClockEnabled}
        />
      </div>

      <div className="midi-hub-events-toolbar">
        <Button size="sm" kind="primary" disabled={!eventListId.trim() || !name.trim()} onClick={() => upsertMutation.mutate()}>
          Save event list
        </Button>
      </div>

      <DataTable rows={filteredRows} headers={[...HEADERS]} isSortable useZebraStyles>
        {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps, getToolbarProps }) => (
          <TableContainer
            {...getTableContainerProps()}
            title="Event List Manager"
            description="Create and control MTC or RTC lists with a single routed manager."
            className="midi-hub-events-table"
          >
            <TableToolbar {...getToolbarProps()}>
              <TableToolbarContent>
                <TableToolbarSearch persistent value={searchValue} onChange={(_event, value) => setSearchValue(value ?? '')} />
              </TableToolbarContent>
            </TableToolbar>
            <Table {...getTableProps()} aria-label="Event lists">
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
                  <TableHeader>Actions</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => {
                  const { key: _key, ...rowProps } = getRowProps({ row })
                  const source = (eventListsQuery.data?.event_lists ?? []).find((item) => item.event_list_id === row.id)
                  return (
                    <TableRow key={row.id} {...rowProps} aria-selected={selectedEventListId === row.id}>
                      {row.cells.map((cell) => {
                        if (cell.info.header === 'status') {
                          return (
                            <TableCell key={cell.id}>
                              <Tag type={String(cell.value) === 'Running' ? 'green' : 'warm-gray'}>{String(cell.value)}</Tag>
                            </TableCell>
                          )
                        }
                        return <TableCell key={cell.id}>{String(cell.value)}</TableCell>
                      })}
                      <TableCell>
                        <div className="midi-hub-events-inline-actions">
                          <Button size="sm" kind="ghost" onClick={() => onSelectEventList(row.id)}>
                            Open
                          </Button>
                          <Button size="sm" kind="secondary" onClick={() => void startMutation.mutate(row.id)}>
                            Start
                          </Button>
                          <Button size="sm" kind="ghost" onClick={() => void stopMutation.mutate(row.id)}>
                            Stop
                          </Button>
                          <Button
                            size="sm"
                            kind="danger--tertiary"
                            onClick={() => {
                              if (selectedEventListId === row.id) onSelectEventList('')
                              void deleteMutation.mutate(row.id)
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                        {source && selectedEventListId === row.id ? <div className="midi-hub-events-selection">Selected source: {source.source_id}</div> : null}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>
    </div>
  )
}
