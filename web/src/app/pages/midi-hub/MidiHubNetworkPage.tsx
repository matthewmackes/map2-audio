import { Tag } from '@carbon/react'
import { Midi2Panel } from '../../components/MidiHub/Midi2Panel'
import { MidiHubPanelShell } from '../../components/MidiHub/MidiHubHelpPrimitives'
import { MidiNetworkPanel } from '../../components/MidiHub/MidiNetworkPanel'
import { StringInterfacePanel } from '../../components/MidiHub/StringInterfacePanel'
import { TesiraPanel } from '../../components/MidiHub/TesiraPanel'
import { VirtualGpioPanel } from '../../components/MidiHub/VirtualGpioPanel'
import { MidiHubAreaLayout } from './MidiHubAreaLayout'
import './MidiHubNetworkPage.css'

export function MidiHubNetworkPage() {
  return (
    <MidiHubAreaLayout
      routeKey="network"
      title="Network & Protocol"
      summary="Run RTP-MIDI, OSC, MIDI 2.0, Tesira TTP, virtual GPIO, and string-command transport from one protocol workspace."
      tags={[
        { label: 'RTP-MIDI', type: 'blue' },
        { label: 'OSC', type: 'cool-gray' },
        { label: 'Tesira', type: 'green' },
      ]}
    >
      <section className="midi-hub-page-band midi-hub-network-page">
        <div className="midi-hub-network-page__grid">
          <MidiHubPanelShell panelId="network">
            <div className="midi-hub-area-page__panel-heading">
              <h3>RTP-MIDI and OSC bridge</h3>
              <Tag type="blue">Stage links</Tag>
            </div>
            <MidiNetworkPanel />
          </MidiHubPanelShell>

          <MidiHubPanelShell panelId="midi2">
            <div className="midi-hub-area-page__panel-heading">
              <h3>MIDI 2.0 and UMP</h3>
              <Tag type="green">Translation</Tag>
            </div>
            <Midi2Panel />
          </MidiHubPanelShell>

          <MidiHubPanelShell panelId="tesira">
            <div className="midi-hub-area-page__panel-heading">
              <h3>Tesira TTP integration</h3>
              <Tag type="cool-gray">Bidirectional</Tag>
            </div>
            <TesiraPanel />
          </MidiHubPanelShell>

          <MidiHubPanelShell panelId="gpio">
            <div className="midi-hub-area-page__panel-heading">
              <h3>Virtual GPIO</h3>
              <Tag type="blue">12 in / 12 out</Tag>
            </div>
            <VirtualGpioPanel />
          </MidiHubPanelShell>

          <MidiHubPanelShell panelId="string-interface">
            <div className="midi-hub-area-page__panel-heading">
              <h3>String interface</h3>
              <Tag type="cool-gray">UDP text</Tag>
            </div>
            <StringInterfacePanel />
          </MidiHubPanelShell>
        </div>
      </section>
    </MidiHubAreaLayout>
  )
}

export default MidiHubNetworkPage
