/**
 * T2482 loop 13 / iter 123 — MidiServicesPresetsPage.
 *
 * MidiServices-branded sibling of MidiHubPresetsPage. Per the
 * iter-121 plan D1: imports the same component panels directly.
 *
 * Panels mounted: MidiHubPresetManager, MidiClockPanel, MidiRecorderPanel.
 */

import { Heading, Layer, Section } from '@carbon/react'

import { MidiClockPanel } from '../../components/MidiHub/MidiClockPanel'
import { MidiHubPanelShell } from '../../components/MidiHub/MidiHubHelpPrimitives'
import { MidiHubPresetManager } from '../../components/MidiHub/MidiHubPresetManager'
import { MidiRecorderPanel } from '../../components/MidiHub/MidiRecorderPanel'
import { useMidiServicesShellWindow } from './useMidiServicesShellWindow'
import './MidiServicesRegionPage.css'

export function MidiServicesPresetsPage() {
  useMidiServicesShellWindow(
    'Presets',
    'Lock in repeatable canonical-authority states; recall, clock, and capture.',
  )
  return (
    <Section className="midi-services-region">
      <Layer level={0}>
        <header className="midi-services-region__header">
          <Heading className="midi-services-region__title">Presets</Heading>
          <p className="midi-services-region__subtitle">
            Lock in repeatable canonical-authority states, recall, clock, and
            capture once the route is stable.
          </p>
        </header>
      </Layer>
      <Layer level={1}>
        <div className="midi-services-region__grid">
          <MidiHubPanelShell panelId="presets">
            <MidiHubPresetManager />
          </MidiHubPanelShell>
          <MidiHubPanelShell panelId="clock">
            <MidiClockPanel />
          </MidiHubPanelShell>
          <MidiHubPanelShell panelId="recorder">
            <MidiRecorderPanel />
          </MidiHubPanelShell>
        </div>
      </Layer>
    </Section>
  )
}

export default MidiServicesPresetsPage
