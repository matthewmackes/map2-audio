/**
 * T2482 loop 13 / iter 122 — MidiServicesNetworkPage.
 *
 * MidiServices-branded sibling of MidiHubNetworkPage. Per the
 * iter-121 plan D1: imports the same 5 component panels directly
 * (no panel logic duplicated). Per D2: page chrome is Carbon
 * Section + Layer + Heading, matching the iter-95 OverviewPage
 * visual language.
 *
 * Panels mounted: MidiNetworkPanel, Midi2Panel, TesiraPanel,
 *   VirtualGpioPanel, StringInterfacePanel.
 */

import { Heading, Layer, Section, Tag } from '@carbon/react'

import { MidiHubPanelShell } from '../../components/MidiHub/MidiHubHelpPrimitives'
import { Midi2Panel } from '../../components/MidiHub/Midi2Panel'
import { MidiNetworkPanel } from '../../components/MidiHub/MidiNetworkPanel'
import { StringInterfacePanel } from '../../components/MidiHub/StringInterfacePanel'
import { TesiraPanel } from '../../components/MidiHub/TesiraPanel'
import { VirtualGpioPanel } from '../../components/MidiHub/VirtualGpioPanel'
import './MidiServicesRegionPage.css'

export function MidiServicesNetworkPage() {
  return (
    <Section className="midi-services-region">
      <Layer level={0}>
        <header className="midi-services-region__header">
          <Heading className="midi-services-region__title">Network</Heading>
          <p className="midi-services-region__subtitle">
            RTP-MIDI, OSC, MIDI 2.0, Tesira TTP, virtual GPIO, and string-command
            transports — every protocol the canonical MIDI authority can route in
            or out of.
          </p>
        </header>
      </Layer>
      <Layer level={1}>
        <div className="midi-services-region__grid">
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
      </Layer>
    </Section>
  )
}

export default MidiServicesNetworkPage
