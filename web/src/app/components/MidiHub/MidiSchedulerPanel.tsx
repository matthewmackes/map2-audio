import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, TextField } from '@mui/material'
import { midiHubApi } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useToasts } from '../Toasts'
import { NumberInput } from '../Controls/NumberInput'

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
  const [delayMs, setDelayMs] = useState(250)

  const entriesQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'scheduler'],
    queryFn: () => midiHubApi.listSchedulerEntries(true, nodeId),
    refetchInterval: 1500,
  })

  const scheduleMutation = useMutation({
    mutationFn: async () =>
      midiHubApi.createSchedulerEntry({
        schedule_id: scheduleId.trim(),
        destination_port: destinationPort.trim() || 'dst',
        message: parseMessage(messageText),
        delay_ms: Math.max(0, delayMs),
      }, nodeId),
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

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="grid grid-4" style={{ gap: 10 }}>
        <TextField label="Schedule ID" size="small" value={scheduleId} onChange={(event) => setScheduleId(event.target.value)} />
        <TextField
          label="Destination Port"
          size="small"
          value={destinationPort}
          onChange={(event) => setDestinationPort(event.target.value)}
        />
        <TextField label="Message Bytes" size="small" value={messageText} onChange={(event) => setMessageText(event.target.value)} />
        <div className="flex" style={{ alignItems: 'center', gap: 8 }}>
          <NumberInput
            label="Delay ms"
            value={delayMs}
            min={0}
            max={86400000}
            step={1}
            profile="integer"
            onChange={(value) => setDelayMs(Math.max(0, value))}
            size="small"
            style={{ width: 120 }}
          />
          <Button size="small" variant="contained" onClick={() => scheduleMutation.mutate()} disabled={!scheduleId.trim()}>
            Schedule
          </Button>
          <Button size="small" variant="outlined" onClick={() => clearFinished.mutate()}>
            Clear Finished
          </Button>
        </div>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        {entries.length === 0 ? <p className="subtitle">No scheduled MIDI events.</p> : null}
        {entries.map((entry) => (
          <div key={entry.schedule_id} className="card" style={{ padding: 12 }}>
            <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div>
                <strong>{entry.schedule_id}</strong> <code>{entry.destination_port}</code>
                <div className="subtitle">{entry.message_hex} | {entry.status}</div>
              </div>
              <Button size="small" color="error" onClick={() => cancelMutation.mutate(entry.schedule_id)}>
                Cancel
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
