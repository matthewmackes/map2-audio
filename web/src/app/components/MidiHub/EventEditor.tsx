import { useMemo, useState } from 'react'
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
  Tag,
  TextInput,
  Toggle,
} from '@carbon/react'
import { midiHubApi, type MidiHubEventListEvent } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useToasts } from '../Toasts'

type EventEditorProps = {
  selectedEventListId: string
}

const HEADERS = [
  { key: 'order', header: 'Event #' },
  { key: 'timeAddress', header: 'Time/Address' },
  { key: 'action', header: 'Action' },
  { key: 'label', header: 'Label' },
  { key: 'enabled', header: 'Enabled' },
] as const

export function EventEditor({ selectedEventListId }: EventEditorProps) {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const { nodeId, scopeKey } = useMidiHubNodeScope()
  const [eventId, setEventId] = useState('cue-1')
  const [order, setOrder] = useState('1')
  const [timeAddress, setTimeAddress] = useState('00:00:10:00')
  const [actionType, setActionType] = useState('RecallPreset')
  const [label, setLabel] = useState('Cue 1')
  const [payloadText, setPayloadText] = useState('{"preset_id":"baseline"}')
  const [enabled, setEnabled] = useState(true)

  const eventsQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'event-lists', selectedEventListId, 'events'],
    queryFn: () => midiHubApi.listEventListEvents(selectedEventListId, nodeId),
    enabled: Boolean(selectedEventListId),
    refetchInterval: 1000,
  })

  const upsertMutation = useMutation({
    mutationFn: async () =>
      midiHubApi.upsertEventListEvent(
        selectedEventListId,
        {
          event_id: eventId.trim(),
          order: Math.max(1, Number.parseInt(order || '1', 10) || 1),
          time_address: timeAddress.trim(),
          action_type: actionType.trim(),
          label: label.trim(),
          payload: JSON.parse(payloadText || '{}') as Record<string, unknown>,
          enabled,
        },
        nodeId,
      ),
    onSuccess: () => {
      pushToast('Event saved', 'success')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'event-lists', selectedEventListId, 'events'] })
    },
    onError: () => pushToast('Failed to save event', 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (eventIdValue: string) => midiHubApi.deleteEventListEvent(selectedEventListId, eventIdValue, nodeId),
    onSuccess: () => {
      pushToast('Event removed', 'info')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'event-lists', selectedEventListId, 'events'] })
    },
  })

  const rows = useMemo(
    () =>
      (eventsQuery.data?.events ?? []).map((row: MidiHubEventListEvent) => ({
        id: row.event_id,
        order: String(row.order),
        timeAddress: row.time_address,
        action: row.action_type,
        label: row.label,
        enabled: row.enabled ? 'Enabled' : 'Disabled',
      })),
    [eventsQuery.data?.events],
  )

  return (
    <div className="midi-hub-events-stack">
      <div className="midi-hub-events-form-grid">
        <TextInput id="event-id" labelText="Event ID" value={eventId} onChange={(event) => setEventId(event.currentTarget.value)} />
        <TextInput id="event-order" labelText="Event order" value={order} onChange={(event) => setOrder(event.currentTarget.value)} />
        <TextInput id="event-time-address" labelText="Time/Address" value={timeAddress} onChange={(event) => setTimeAddress(event.currentTarget.value)} />
        <Select id="event-action-type" labelText="Action" value={actionType} onChange={(event) => setActionType(event.currentTarget.value)}>
          <SelectItem value="RecallPreset" text="Recall preset" />
          <SelectItem value="FireMacro" text="Fire macro" />
          <SelectItem value="SendMSC" text="Send MSC" />
          <SelectItem value="SendMidiRaw" text="Send MIDI Raw" />
        </Select>
        <TextInput id="event-label" labelText="Label" value={label} onChange={(event) => setLabel(event.currentTarget.value)} />
        <TextInput id="event-payload" labelText="Payload JSON" value={payloadText} onChange={(event) => setPayloadText(event.currentTarget.value)} />
        <Toggle id="event-enabled" size="sm" labelText="Enabled" labelA="Off" labelB="On" toggled={enabled} onToggle={setEnabled} />
      </div>
      <div className="midi-hub-events-toolbar">
        <Button size="sm" kind="primary" disabled={!selectedEventListId} onClick={() => upsertMutation.mutate()}>
          Save event
        </Button>
      </div>

      <DataTable rows={rows} headers={[...HEADERS]} useZebraStyles>
        {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps, getToolbarProps }) => (
          <TableContainer
            {...getTableContainerProps()}
            title="Event Editor"
            description="Stage cue timing and action payloads for the selected event list."
            className="midi-hub-events-table"
          >
            <TableToolbar {...getToolbarProps()}>
              <TableToolbarContent>
                <Tag type={selectedEventListId ? 'blue' : 'warm-gray'}>
                  {selectedEventListId ? `Selected list ${selectedEventListId}` : 'Select an event list to edit'}
                </Tag>
              </TableToolbarContent>
            </TableToolbar>
            <Table {...getTableProps()} aria-label="Event editor">
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
                  <TableHeader>Action</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => {
                  const { key: _key, ...rowProps } = getRowProps({ row })
                  return (
                    <TableRow key={row.id} {...rowProps}>
                      {row.cells.map((cell) => {
                        if (cell.info.header === 'enabled') {
                          return (
                            <TableCell key={cell.id}>
                              <Tag type={String(cell.value) === 'Enabled' ? 'green' : 'warm-gray'}>{String(cell.value)}</Tag>
                            </TableCell>
                          )
                        }
                        return <TableCell key={cell.id}>{String(cell.value)}</TableCell>
                      })}
                      <TableCell>
                        <Button size="sm" kind="danger--tertiary" onClick={() => void deleteMutation.mutate(row.id)}>
                          Delete
                        </Button>
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
