/**
 * T2482 loop 13 / iter 125 — MidiServicesProcessingPage.
 *
 * MidiServices-branded sibling of MidiHubProcessingPage. Per the
 * iter-121 plan D1: imports the same component panels directly.
 *
 * Panels mounted: MidiHubFilterPlanner, MidiHubMessageMapper,
 *   MidiScriptEditor, MidiMacroPanel, MidiSchedulerPanel.
 */

import { Heading, Layer, Section, Tag } from '@carbon/react'

import { MidiHubFilterPlanner } from '../../components/MidiHub/MidiHubFilterPlanner'
import { MidiHubPanelShell } from '../../components/MidiHub/MidiHubHelpPrimitives'
import { MidiHubMessageMapper } from '../../components/MidiHub/MidiHubMessageMapper'
import { MidiMacroPanel } from '../../components/MidiHub/MidiMacroPanel'
import { MidiSchedulerPanel } from '../../components/MidiHub/MidiSchedulerPanel'
import { MidiScriptEditor } from '../../components/MidiHub/MidiScriptEditor'
import { useMidiServicesShellWindow } from './useMidiServicesShellWindow'
import './MidiServicesRegionPage.css'

export function MidiServicesProcessingPage() {
  useMidiServicesShellWindow(
    'Processing',
    'Filtering, mapping, scripting, macros, and scheduled automation between authority and engine.',
  )
  return (
    <Section className="midi-services-region">
      <Layer level={0}>
        <header className="midi-services-region__header">
          <Heading className="midi-services-region__title">Processing</Heading>
          <p className="midi-services-region__subtitle">
            Apply filtering, mapping, scripting, macros, and scheduled
            automation between the canonical bindings authority and the audio
            engine.
          </p>
        </header>
      </Layer>
      <Layer level={1}>
        <div className="midi-services-region__grid">
          <MidiHubPanelShell panelId="filters" actionTag={<Tag type="blue">Live preview</Tag>}>
            <MidiHubFilterPlanner />
          </MidiHubPanelShell>
          <MidiHubPanelShell panelId="mapper" actionTag={<Tag type="cool-gray">Node-backed</Tag>}>
            <MidiHubMessageMapper />
          </MidiHubPanelShell>
          <MidiHubPanelShell panelId="scripts" actionTag={<Tag type="green">Toolbar</Tag>}>
            <MidiScriptEditor />
          </MidiHubPanelShell>
          <MidiHubPanelShell panelId="macros" actionTag={<Tag type="blue">Inline trigger</Tag>}>
            <MidiMacroPanel />
          </MidiHubPanelShell>
          <MidiHubPanelShell panelId="scheduler" actionTag={<Tag type="cool-gray">Queue status</Tag>}>
            <MidiSchedulerPanel />
          </MidiHubPanelShell>
        </div>
      </Layer>
    </Section>
  )
}

export default MidiServicesProcessingPage
