import { MusicNoteSimple } from '@phosphor-icons/react'
import { PageHeader } from '../components/PageHeader'
import { MidiRoutingMatrix } from '../components/MidiHub/MidiRoutingMatrix'
import { MidiTrafficMonitor } from '../components/MidiHub/MidiTrafficMonitor'

export function MidiHubPage() {
  return (
    <div className="stack" style={{ gap: 16 }}>
      <PageHeader
        title="MIDI Hub"
        subtitle="Grid routing matrix and live traffic diagnostics."
        icon={<MusicNoteSimple size={32} weight="duotone" style={{ color: '#22c55e' }} />}
      />

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Routing Matrix</h3>
        <p className="subtitle" style={{ marginTop: 0 }}>
          Click any cell to create or edit a route, filter, and transform chain.
        </p>
        <MidiRoutingMatrix />
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
