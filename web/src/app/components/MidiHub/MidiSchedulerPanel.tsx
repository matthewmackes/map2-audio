import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Tag, TextInput } from '@carbon/react'
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

  const entriesQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'scheduler'],
    queryFn: () => midiHubApi.listSchedulerEntries(true, nodeId),
    refetchInterval: 1500,
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

  return (
    <div className="midi-hub-panel-grid--2">
      <div className="midi-hub-mini-surface">
        <div className="midi-hub-toolbar">
          <Tag type={entries.length > 0 ? 'green' : 'warm-gray'}>{`Entries ${entries.length}`}</Tag>
          <Tag type="cool-gray">Timed send</Tag>
        </div>

        <div className="midi-hub-form-grid">
          <TextInput
            id="midi-hub-scheduler-id"
            labelText="Schedule ID"
            value={scheduleId}
            onChange={(event) => setScheduleId(event.currentTarget.value)}
          />
          <TextInput
            id="midi-hub-scheduler-destination"
            labelText="Destination port"
            value={destinationPort}
            onChange={(event) => setDestinationPort(event.currentTarget.value)}
          />
          <TextInput
            id="midi-hub-scheduler-message"
            labelText="Message bytes"
            value={messageText}
            onChange={(event) => setMessageText(event.currentTarget.value)}
          />
          <TextInput
            id="midi-hub-scheduler-delay"
            labelText="Delay (ms)"
            value={delayMs}
            onChange={(event) => setDelayMs(event.currentTarget.value)}
          />
        </div>

        <div className="midi-hub-actions">
          <Button size="sm" kind="primary" onClick={() => scheduleMutation.mutate()} disabled={!scheduleId.trim()}>
            Schedule event
          </Button>
          <Button size="sm" kind="ghost" onClick={() => clearFinished.mutate()}>
            Clear finished
          </Button>
        </div>
      </div>

      <div className="midi-hub-mini-surface">
        <div className="midi-hub-record-list">
          {entries.length === 0 ? <div className="midi-hub-empty-state">No scheduled MIDI events.</div> : null}
          {entries.map((entry) => (
            <div key={entry.schedule_id} className="midi-hub-record-row">
              <div className="midi-hub-record-copy">
                <strong>{entry.schedule_id}</strong>
                <div className="midi-hub-record-meta">
                  <code>{entry.destination_port}</code>
                  {` · ${entry.message_hex} · ${entry.status}`}
                </div>
              </div>
              <div className="midi-hub-record-actions">
                <Button size="sm" kind="danger--tertiary" onClick={() => cancelMutation.mutate(entry.schedule_id)}>
                  Cancel
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
