import { Midi2Panel } from '../../components/MidiHub/Midi2Panel'
import { MidiHubPanelShell } from '../../components/MidiHub/MidiHubHelpPrimitives'
import { MidiNetworkPanel } from '../../components/MidiHub/MidiNetworkPanel'
import { MidiHubAreaLayout } from './MidiHubAreaLayout'

export function MidiHubNetworkPage() {
  return (
    <MidiHubAreaLayout
      routeKey="network"
      title="Network & Protocol"
      summary="Bring RTP-MIDI, OSC, and MIDI 2.0 services online here, with shell scaffolding ready for Tesira, GPIO, and string protocol expansion."
      tags={[
        { label: 'RTP-MIDI', type: 'blue' },
        { label: 'OSC', type: 'cool-gray' },
      ]}
    >
      <section className="midi-hub-page-band">
        <div className="midi-hub-grid-two">
          <MidiHubPanelShell panelId="network">
            <MidiNetworkPanel />
          </MidiHubPanelShell>

          <MidiHubPanelShell panelId="midi2">
            <Midi2Panel />
          </MidiHubPanelShell>
        </div>
      </section>
    </MidiHubAreaLayout>
  )
}

export default MidiHubNetworkPage
