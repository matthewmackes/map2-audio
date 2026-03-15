import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, FormControlLabel, Switch, TextField } from '@mui/material'
import { midiHubApi } from '../../../map2/api'
import { useMidiHubNodeScope } from './MidiHubNodeScope'
import { useToasts } from '../Toasts'

export function MidiMacroPanel() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const { nodeId, scopeKey } = useMidiHubNodeScope()
  const [macroId, setMacroId] = useState('macro_1')
  const [name, setName] = useState('Macro 1')
  const [triggerCc, setTriggerCc] = useState(1)
  const [destination, setDestination] = useState('dst')
  const [value, setValue] = useState(100)
  const [enabled, setEnabled] = useState(true)

  const macrosQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'macros'],
    queryFn: () => midiHubApi.listMacros(nodeId),
    refetchInterval: 3000,
  })

  const saveMacro = useMutation({
    mutationFn: async () =>
      midiHubApi.upsertMacro({
        macro_id: macroId.trim(),
        name: name.trim() || macroId.trim(),
        trigger: { message_type: 'control_change', cc: triggerCc },
        actions: [
          {
            target: destination.trim() || 'dst',
            action: 'send_midi',
            delay_ms: 0,
            params: { message: [0xb0, triggerCc, Math.max(0, Math.min(127, value))] },
          },
        ],
        enabled,
      }, nodeId),
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
    <div className="stack" style={{ gap: 12 }}>
      <div className="grid grid-3" style={{ gap: 10 }}>
        <TextField label="Macro ID" size="small" value={macroId} onChange={(event) => setMacroId(event.target.value)} />
        <TextField label="Name" size="small" value={name} onChange={(event) => setName(event.target.value)} />
        <TextField
          label="Trigger CC"
          size="small"
          type="number"
          value={triggerCc}
          onChange={(event) => setTriggerCc(Math.max(0, Math.min(127, Number(event.target.value) || 0)))}
        />
        <TextField
          label="Destination Port"
          size="small"
          value={destination}
          onChange={(event) => setDestination(event.target.value)}
        />
        <TextField
          label="CC Value"
          size="small"
          type="number"
          value={value}
          onChange={(event) => setValue(Math.max(0, Math.min(127, Number(event.target.value) || 0)))}
        />
        <div className="flex" style={{ alignItems: 'center', gap: 8 }}>
          <FormControlLabel
            control={<Switch checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />}
            label="Enabled"
          />
          <Button variant="contained" size="small" onClick={() => saveMacro.mutate()} disabled={!macroId.trim()}>
            Save Macro
          </Button>
        </div>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        {macros.length === 0 ? <p className="subtitle">No macros yet.</p> : null}
        {macros.map((macro) => (
          <div key={macro.macro_id} className="card" style={{ padding: 12 }}>
            <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div>
                <strong>{macro.name}</strong> <code>{macro.macro_id}</code>
                <div className="subtitle">Actions: {macro.actions.length} | Enabled: {macro.enabled ? 'yes' : 'no'}</div>
              </div>
              <div className="flex" style={{ gap: 8 }}>
                <Button size="small" variant="outlined" onClick={() => triggerMacro.mutate(macro.macro_id)}>
                  Trigger
                </Button>
                <Button size="small" color="error" onClick={() => deleteMacro.mutate(macro.macro_id)}>
                  Delete
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
