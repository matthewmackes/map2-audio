import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Checkbox, Tag, TextInput } from '@carbon/react'
import { midiHubApi } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useToasts } from '../Toasts'

function clampMidiValue(value: string, max: number): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(max, parsed))
}

export function MidiMacroPanel() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const { nodeId, scopeKey } = useMidiHubNodeScope()
  const [macroId, setMacroId] = useState('macro_1')
  const [name, setName] = useState('Macro 1')
  const [triggerCc, setTriggerCc] = useState('1')
  const [destination, setDestination] = useState('dst')
  const [value, setValue] = useState('100')
  const [enabled, setEnabled] = useState(true)

  const macrosQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'macros'],
    queryFn: () => midiHubApi.listMacros(nodeId),
    refetchInterval: 3000,
  })

  const saveMacro = useMutation({
    mutationFn: async () =>
      midiHubApi.upsertMacro(
        {
          macro_id: macroId.trim(),
          name: name.trim() || macroId.trim(),
          trigger: { message_type: 'control_change', cc: clampMidiValue(triggerCc, 127) },
          actions: [
            {
              target: destination.trim() || 'dst',
              action: 'send_midi',
              delay_ms: 0,
              params: { message: [0xb0, clampMidiValue(triggerCc, 127), clampMidiValue(value, 127)] },
            },
          ],
          enabled,
        },
        nodeId,
      ),
    onSuccess: () => {
      pushToast('Macro saved', 'success')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'macros'] })
    },
    onError: () => pushToast('Macro save failed', 'error'),
  })

  const deleteMacro = useMutation({
    mutationFn: async (id: string) => midiHubApi.deleteMacro(id, nodeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey, 'macros'] })
    },
  })

  const triggerMacro = useMutation({
    mutationFn: async (id: string) => midiHubApi.triggerMacro(id, { source: 'ui' }, nodeId),
    onSuccess: () => pushToast('Macro triggered', 'info'),
    onError: () => pushToast('Macro trigger failed', 'error'),
  })

  const macros = useMemo(() => macrosQuery.data?.macros ?? [], [macrosQuery.data?.macros])

  return (
    <div className="midi-hub-panel-grid--2">
      <div className="midi-hub-mini-surface">
        <div className="midi-hub-toolbar">
          <Tag type={macros.length > 0 ? 'green' : 'warm-gray'}>{`Macros ${macros.length}`}</Tag>
          <Tag type={enabled ? 'green' : 'warm-gray'}>{enabled ? 'Enabled' : 'Disabled'}</Tag>
        </div>

        <div className="midi-hub-form-grid">
          <TextInput
            id="midi-hub-macro-id"
            labelText="Macro ID"
            value={macroId}
            onChange={(event) => setMacroId(event.currentTarget.value)}
          />
          <TextInput
            id="midi-hub-macro-name"
            labelText="Name"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <TextInput
            id="midi-hub-macro-trigger-cc"
            labelText="Trigger CC"
            value={triggerCc}
            onChange={(event) => setTriggerCc(event.currentTarget.value)}
          />
          <TextInput
            id="midi-hub-macro-destination"
            labelText="Destination port"
            value={destination}
            onChange={(event) => setDestination(event.currentTarget.value)}
          />
          <TextInput
            id="midi-hub-macro-value"
            labelText="CC value"
            value={value}
            onChange={(event) => setValue(event.currentTarget.value)}
          />
        </div>

        <div className="midi-hub-actions">
          <Checkbox
            id="midi-hub-macro-enabled"
            labelText="Enabled"
            checked={enabled}
            onChange={(_, data) => setEnabled(data.checked)}
          />
          <Button size="sm" kind="primary" onClick={() => saveMacro.mutate()} disabled={!macroId.trim()}>
            Save macro
          </Button>
        </div>
      </div>

      <div className="midi-hub-mini-surface">
        <div className="midi-hub-record-list">
          {macros.length === 0 ? <div className="midi-hub-empty-state">No macros saved.</div> : null}
          {macros.map((macro) => (
            <div key={macro.macro_id} className="midi-hub-record-row">
              <div className="midi-hub-record-copy">
                <strong>{macro.name}</strong>
                <div className="midi-hub-record-meta">
                  <code>{macro.macro_id}</code>
                  {` · actions ${macro.actions.length} · ${macro.enabled ? 'enabled' : 'disabled'}`}
                </div>
              </div>
              <div className="midi-hub-record-actions">
                <Button size="sm" kind="secondary" onClick={() => triggerMacro.mutate(macro.macro_id)}>
                  Trigger
                </Button>
                <Button size="sm" kind="danger--tertiary" onClick={() => deleteMacro.mutate(macro.macro_id)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
