import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MusicNoteSimple } from '@phosphor-icons/react'
import { Button, MenuItem, Select } from '@mui/material'
import { PageHeader } from '../components/PageHeader'
import { MidiRoutingMatrix } from '../components/MidiHub/MidiRoutingMatrix'
import { MidiPatchbay } from '../components/MidiHub/MidiPatchbay'
import { MidiTrafficMonitor } from '../components/MidiHub/MidiTrafficMonitor'
import { MidiHubPresetManager } from '../components/MidiHub/MidiHubPresetManager'
import { MidiScriptEditor } from '../components/MidiHub/MidiScriptEditor'
import { MidiClockPanel } from '../components/MidiHub/MidiClockPanel'
import { MidiNetworkPanel } from '../components/MidiHub/MidiNetworkPanel'
import { useToasts } from '../components/Toasts'
import { midiHubApi } from '../../map2/api'

export function MidiHubPage() {
  const [mode, setMode] = useState<'matrix' | 'patchbay'>('matrix')
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()

  const presetsQuery = useQuery({
    queryKey: ['midi-hub', 'presets'],
    queryFn: midiHubApi.listPresets,
    refetchInterval: 3000,
  })

  const quickRecallMutation = useMutation({
    mutationFn: async (presetId: string) => midiHubApi.recallPreset(presetId),
    onSuccess: () => {
      pushToast('Preset recalled', 'success')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub'] })
    },
    onError: () => pushToast('Preset recall failed', 'error'),
  })

  return (
    <div className="stack" style={{ gap: 16 }}>
      <PageHeader
        title="MIDI Hub"
        subtitle="Grid routing matrix and live traffic diagnostics."
        icon={<MusicNoteSimple size={32} weight="duotone" style={{ color: '#22c55e' }} />}
      />

      <div className="card">
        <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ marginTop: 0 }}>{mode === 'matrix' ? 'Routing Matrix' : 'Patchbay'}</h3>
            <p className="subtitle" style={{ marginTop: 0 }}>
              {mode === 'matrix'
                ? 'Click any cell to create or edit a route, filter, and transform chain.'
                : 'Node-graph patching view synchronized with the same MIDI route table.'}
            </p>
          </div>
          <div className="flex" style={{ gap: 8 }}>
            <Button size="small" variant={mode === 'matrix' ? 'contained' : 'outlined'} onClick={() => setMode('matrix')}>
              Matrix
            </Button>
            <Button size="small" variant={mode === 'patchbay' ? 'contained' : 'outlined'} onClick={() => setMode('patchbay')}>
              Patchbay
            </Button>
            <Select
              size="small"
              value={selectedPresetId}
              displayEmpty
              onChange={(event) => setSelectedPresetId(String(event.target.value))}
              style={{ minWidth: 240 }}
            >
              <MenuItem value="">Quick preset recall</MenuItem>
              {(presetsQuery.data?.presets ?? []).map((preset) => (
                <MenuItem key={preset.preset_id} value={preset.preset_id}>
                  {preset.name}
                </MenuItem>
              ))}
            </Select>
            <Button
              size="small"
              variant="outlined"
              disabled={!selectedPresetId}
              onClick={() => quickRecallMutation.mutate(selectedPresetId)}
            >
              Recall
            </Button>
          </div>
        </div>
        {mode === 'matrix' ? <MidiRoutingMatrix /> : <MidiPatchbay />}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Preset Manager</h3>
        <p className="subtitle" style={{ marginTop: 0 }}>
          Snapshot/recall, default startup preset, program-change slot mapping, and chain timers.
        </p>
        <MidiHubPresetManager />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Script Engine</h3>
        <p className="subtitle" style={{ marginTop: 0 }}>
          Sandbox script editor with run/trigger controls, timer stop, and live console output.
        </p>
        <MidiScriptEditor />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Clock Engine</h3>
        <p className="subtitle" style={{ marginTop: 0 }}>
          Tempo detection/generation with tap tempo and distribution to selected MIDI outputs.
        </p>
        <MidiClockPanel />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Network MIDI + OSC</h3>
        <p className="subtitle" style={{ marginTop: 0 }}>
          RTP/UDP MIDI session management and bidirectional OSC bridge controls.
        </p>
        <MidiNetworkPanel />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Traffic Monitor</h3>
        <p className="subtitle" style={{ marginTop: 0 }}>
          Real-time MIDI diagnostics with snapshot, export, and filtering controls.
        </p>
        <MidiTrafficMonitor />
      </div>
    </div>
  )
}
