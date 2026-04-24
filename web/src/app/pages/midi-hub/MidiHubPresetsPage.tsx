import { MidiClockPanel } from '../../components/MidiHub/MidiClockPanel'
import { MidiHubPanelShell } from '../../components/MidiHub/MidiHubHelpPrimitives'
import { MidiHubPresetManager } from '../../components/MidiHub/MidiHubPresetManager'
import { MidiRecorderPanel } from '../../components/MidiHub/MidiRecorderPanel'
import { useSetShellWindow } from '../../layout/useSetShellWindow'
import { MidiHubContentFrame } from './MidiHubContentFrame'
import './MidiHubPresetsPage.css'

export function MidiHubPresetsPage() {
  useSetShellWindow({
    subtitle: 'Lock in repeatable states, recall, clock, and capture behavior once the route is stable.',
    kicker: 'Platform / MIDI Hub / Presets',
  }, [])

  return (
    <MidiHubContentFrame routeKey="presets">
      <section className="midi-hub-presets-band">
        <div className="midi-hub-presets-layout">
          <MidiHubPanelShell panelId="presets">
            <MidiHubPresetManager />
          </MidiHubPanelShell>

          <MidiHubPanelShell panelId="clock">
            <MidiClockPanel />
          </MidiHubPanelShell>
        </div>

        <MidiHubPanelShell panelId="recorder">
          <MidiRecorderPanel />
        </MidiHubPanelShell>
      </section>
    </MidiHubContentFrame>
  )
}

export default MidiHubPresetsPage
