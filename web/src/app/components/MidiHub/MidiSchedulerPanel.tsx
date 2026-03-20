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

function parseMessage(value: string): number[] {
  return value
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const asHex = Number.parseInt(part.replace(/^0x/i, ''), 16)
      if (!Number.isNaN(asHex) && part.toLowerCase().startsWith('0x')) {
        return asHex
      }
      const asNumber = Number(part)
      return Number.isFinite(asNumber) ? asNumber : 0
    })
    .map((valueByte) => Math.max(0, Math.min(255, valueByte)))
}

export function MidiSchedulerPanel() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const { nodeId, scopeKey } = useMidiHubNodeScope()
  const [scheduleId, setScheduleId] = useState('evt1')
  const [destinationPort, setDestinationPort] = useState('dst')
  const [messageText, setMessageText] = useState('0xC0 0x0A')
  const [delayMs, setDelayMs] = useState('250')

  const queryRefresh = process.env.NODE_ENV === 'test' ? false : 1500

  const entriesQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'scheduler'],
    queryFn: () => midiHubApi.listSchedulerEntries(true, nodeId),
    refetchInterval: queryRefresh,
  })

  const scheduleMutation = useMutation({
    mutationFn: async () =>
      midiHubApi.createSchedulerEntry(
        {
          schedule_id: scheduleId.trim(),
          destination_port: destinationPort.trim() || 'dst',
          message: parseMessage(messageText),
          delay_ms: Math.max(0, Number.parseInt(delayMs || '0', 10) || 0),
        },
        nodeId,
      ),
    onSuccess: () => {
      pushToast('Message scheduled', 'success')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'scheduler'] })
    },
    onError: () => pushToast('Schedule failed', 'error'),
  })

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => midiHubApi.cancelSchedulerEntry(id, nodeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'scheduler'] })
    },
  })

  const clearFinished = useMutation({
    mutationFn: () => midiHubApi.clearFinishedSchedulerEntries(nodeId),
    onSuccess: (payload) => {
      pushToast(`Cleared ${payload.removed} entries`, 'info')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'scheduler'] })
    },
  })

  const entries = useMemo(() => entriesQuery.data?.entries ?? [], [entriesQuery.data?.entries])
  const rows = useMemo(
    () =>
      entries.map((entry) => ({
        id: entry.schedule_id,
        destination: entry.destination_port,
        message: entry.message_hex,
        status: entry.status,
      })),
    [entries],
  )

  return (
    <div className="midi-hub-processing-stack">
      <div className="midi-hub-processing-form-grid">
        <TextInput id="midi-hub-scheduler-id" labelText="Schedule ID" value={scheduleId} onChange={(event) => setScheduleId(event.currentTarget.value)} />
        <TextInput id="midi-hub-scheduler-destination" labelText="Destination port" value={destinationPort} onChange={(event) => setDestinationPort(event.currentTarget.value)} />
        <TextInput id="midi-hub-scheduler-message" labelText="Message bytes" value={messageText} onChange={(event) => setMessageText(event.currentTarget.value)} />
        <TextInput id="midi-hub-scheduler-delay" labelText="Delay (ms)" value={delayMs} onChange={(event) => setDelayMs(event.currentTarget.value)} />
      </div>

      <div className="midi-hub-processing-toolbar">
        <Tag type={entries.length > 0 ? 'green' : 'cool-gray'}>{`Entries ${entries.length}`}</Tag>
        <Button size="sm" kind="primary" onClick={() => scheduleMutation.mutate()} disabled={!scheduleId.trim()}>
          Schedule event
        </Button>
        <Button size="sm" kind="ghost" onClick={() => clearFinished.mutate()}>
          Clear finished
        </Button>
      </div>

      <DataTable rows={rows} headers={[{ key: 'destination', header: 'Destination' }, { key: 'message', header: 'Message' }, { key: 'status', header: 'Status' }]} useZebraStyles>
        {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps, getToolbarProps }) => (
          <TableContainer
            {...getTableContainerProps()}
            title="Scheduler queue"
            description="Review pending, sent, and cancelled scheduled MIDI events."
            className="midi-hub-processing-table"
          >
            <TableToolbar {...getToolbarProps()}>
              <TableToolbarContent>
                <Tag type="cool-gray">Timed send</Tag>
              </TableToolbarContent>
            </TableToolbar>
            <Table {...getTableProps()} aria-label="Scheduler queue">
              <TableHead>
                <TableRow>
                  <TableHeader>Schedule ID</TableHeader>
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
                  const source = entries.find((entry) => entry.schedule_id === row.id)
                  return (
                    <TableRow key={row.id} {...rowProps}>
                      <TableCell>{row.id}</TableCell>
                      {row.cells.map((cell) => {
                        if (cell.info.header === 'status') {
                          const status = String(cell.value)
                          const tagType = status === 'sent' ? 'green' : status === 'cancelled' ? 'red' : 'cool-gray'
                          return (
                            <TableCell key={cell.id}>
                              <Tag type={tagType}>{status}</Tag>
                            </TableCell>
                          )
                        }
                        return <TableCell key={cell.id}>{String(cell.value)}</TableCell>
                      })}
                      <TableCell>
                        <Button size="sm" kind="danger--tertiary" disabled={!source || source.status !== 'pending'} onClick={() => cancelMutation.mutate(row.id)}>
                          Cancel
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
