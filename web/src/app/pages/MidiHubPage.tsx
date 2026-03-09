import { useState } from 'react'
import { MusicNoteSimple } from '@phosphor-icons/react'
import { Button } from '@mui/material'
import { PageHeader } from '../components/PageHeader'
import { MidiRoutingMatrix } from '../components/MidiHub/MidiRoutingMatrix'
import { MidiPatchbay } from '../components/MidiHub/MidiPatchbay'
import { MidiTrafficMonitor } from '../components/MidiHub/MidiTrafficMonitor'

export function MidiHubPage() {
  const [mode, setMode] = useState<'matrix' | 'patchbay'>('matrix')

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
          </div>
        </div>
        {mode === 'matrix' ? <MidiRoutingMatrix /> : <MidiPatchbay />}
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
