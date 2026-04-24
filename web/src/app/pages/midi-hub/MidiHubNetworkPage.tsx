import { Tag } from '@carbon/react'
import { Midi2Panel } from '../../components/MidiHub/Midi2Panel'
import { MidiHubPanelShell } from '../../components/MidiHub/MidiHubHelpPrimitives'
import { MidiNetworkPanel } from '../../components/MidiHub/MidiNetworkPanel'
import { StringInterfacePanel } from '../../components/MidiHub/StringInterfacePanel'
import { TesiraPanel } from '../../components/MidiHub/TesiraPanel'
import { VirtualGpioPanel } from '../../components/MidiHub/VirtualGpioPanel'
import { useSetShellWindow } from '../../layout/useSetShellWindow'
import { MidiHubContentFrame } from './MidiHubContentFrame'
import './MidiHubNetworkPage.css'

export function MidiHubNetworkPage() {
  useSetShellWindow({
    subtitle: 'Run RTP-MIDI, OSC, MIDI 2.0, Tesira TTP, virtual GPIO, and string-command transport from one protocol workspace.',
    kicker: 'Platform / MIDI Hub / Network',
  }, [])

  return (
    <MidiHubContentFrame routeKey="network">
      <section className="midi-hub-page-band midi-hub-network-page">
        <div className="midi-hub-network-page__grid">
          <MidiHubPanelShell panelId="network" actionTag={<Tag type="blue">Stage links</Tag>}>
            <MidiNetworkPanel />
          </MidiHubPanelShell>

          <MidiHubPanelShell panelId="midi2" title="MIDI 2.0 and UMP" actionTag={<Tag type="green">Translation</Tag>}>
            <Midi2Panel />
          </MidiHubPanelShell>

          <MidiHubPanelShell panelId="tesira" title="Tesira TTP Integration" actionTag={<Tag type="cool-gray">Bidirectional</Tag>}>
            <TesiraPanel />
          </MidiHubPanelShell>

          <MidiHubPanelShell panelId="gpio" actionTag={<Tag type="blue">12 in / 12 out</Tag>}>
            <VirtualGpioPanel />
          </MidiHubPanelShell>

          <MidiHubPanelShell panelId="string-interface" title="String Interface" actionTag={<Tag type="cool-gray">UDP text</Tag>}>
            <StringInterfacePanel />
          </MidiHubPanelShell>
        </div>
      </section>
    </MidiHubContentFrame>
  )
}

export default MidiHubNetworkPage
