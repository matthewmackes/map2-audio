import { MidiClockPanel } from '../../components/MidiHub/MidiClockPanel'
import { MidiHubPanelShell } from '../../components/MidiHub/MidiHubHelpPrimitives'
import { MidiHubPresetManager } from '../../components/MidiHub/MidiHubPresetManager'
import { MidiRecorderPanel } from '../../components/MidiHub/MidiRecorderPanel'
import { MidiHubAreaLayout } from './MidiHubAreaLayout'

export function MidiHubPresetsPage() {
  return (
    <MidiHubAreaLayout
      routeKey="presets"
      title="Presets & Recall"
      summary="Lock in repeatable states, recall, clock, and capture behavior once the route is stable."
      tags={[
        { label: 'Presets', type: 'blue' },
        { label: 'Capture', type: 'green' },
      ]}
    >
      <section className="midi-hub-page-band">
        <div className="midi-hub-grid-two">
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
    </MidiHubAreaLayout>
  )
}

export default MidiHubPresetsPage
