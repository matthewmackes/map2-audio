/**
 * T2482 loop 14 / iter 132 — MidiServicesTransportPage.
 *
 * Closes the iter-127 fallback that still routed /midi/transport to
 * MidiHubTransportPage. Per the iter-131 plan D5 + the iter-122 D1/D2
 * pattern: imports the same MidiClockPanel + MidiRecorderPanel
 * components directly. No panel logic duplicated.
 */

import { Heading, Layer, Section, Tag } from '@carbon/react'

import { MidiClockPanel } from '../../components/MidiHub/MidiClockPanel'
import { MidiHubPanelShell } from '../../components/MidiHub/MidiHubHelpPrimitives'
import { MidiRecorderPanel } from '../../components/MidiHub/MidiRecorderPanel'
import './MidiServicesRegionPage.css'

export function MidiServicesTransportPage() {
  return (
    <Section className="midi-services-region">
      <Layer level={0}>
        <header className="midi-services-region__header">
          <Heading className="midi-services-region__title">Transport</Heading>
          <p className="midi-services-region__subtitle">
            Clock engine + recorder + tempo provenance — DAW-style transport
            controls bound to the canonical MIDI authority.
          </p>
        </header>
      </Layer>
      <Layer level={1}>
        <div className="midi-services-region__grid">
          <MidiHubPanelShell panelId="clock" title="Clock Engine" actionTag={<Tag type="green">Live</Tag>}>
            <MidiClockPanel />
          </MidiHubPanelShell>
          <MidiHubPanelShell panelId="recorder" actionTag={<Tag type="cool-gray">Capture</Tag>}>
            <MidiRecorderPanel />
          </MidiHubPanelShell>
        </div>
      </Layer>
    </Section>
  )
}

export default MidiServicesTransportPage
