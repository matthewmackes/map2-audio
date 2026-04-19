import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Select, SelectItem, TextInput, Toggle } from '@carbon/react'
import { midiHubApi } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useToasts } from '../Toasts'
import { useState } from 'react'

type LearnModeControlProps = {
  selectedEventListId: string
}

export function LearnModeControl({ selectedEventListId }: LearnModeControlProps) {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const { nodeId, scopeKey } = useMidiHubNodeScope()
  const [enabled, setEnabled] = useState(false)
  const [actionType, setActionType] = useState('RecallPreset')
  const [label, setLabel] = useState('Learned cue')
  const [payloadText, setPayloadText] = useState('{"preset_id":"baseline"}')

  const learnMutation = useMutation({
    mutationFn: async () =>
      midiHubApi.setEventListLearnMode(
        selectedEventListId,
        {
          enabled,
          action_type: actionType,
          label,
          payload: JSON.parse(payloadText || '{}') as Record<string, unknown>,
        },
        nodeId,
      ),
    onSuccess: () => {
      pushToast('Learn mode updated', 'success')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'event-lists'] })
    },
  })

  const captureMutation = useMutation({
    mutationFn: async () => midiHubApi.captureEventListLearnMode(selectedEventListId, nodeId),
    onSuccess: () => {
      pushToast('Learned event captured', 'success')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'event-lists', selectedEventListId, 'events'] })
    },
    onError: () => pushToast('Learn capture failed', 'error'),
  })

  return (
    <div className="midi-hub-events-stack">
      <div className="midi-hub-events-form-grid">
        <Toggle
          id="learn-mode-enabled"
          size="sm"
          labelText="Learn mode"
          labelA="Off"
          labelB="On"
          toggled={enabled}
          onToggle={setEnabled}
        />
        <Select id="learn-action-type" labelText="Learn action" value={actionType} onChange={(event) => setActionType(event.currentTarget.value)}>
          <SelectItem value="RecallPreset" text="Recall preset" />
          <SelectItem value="FireMacro" text="Fire macro" />
          <SelectItem value="SendMSC" text="Send MSC" />
          <SelectItem value="SendMidiRaw" text="Send MIDI Raw" />
        </Select>
        <TextInput id="learn-label" labelText="Learn label" value={label} onChange={(event) => setLabel(event.currentTarget.value)} />
        <TextInput id="learn-payload" labelText="Learn payload JSON" value={payloadText} onChange={(event) => setPayloadText(event.currentTarget.value)} />
      </div>
      <div className="midi-hub-events-toolbar">
        <Button size="sm" kind="secondary" disabled={!selectedEventListId} onClick={() => learnMutation.mutate()}>
          Save learn mode
        </Button>
        <Button size="sm" kind="primary" disabled={!selectedEventListId} onClick={() => captureMutation.mutate()}>
          Capture current position
        </Button>
      </div>
    </div>
  )
}
