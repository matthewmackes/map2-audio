import { Tag } from '@carbon/react'
import { MidiHubFilterPlanner } from '../../components/MidiHub/MidiHubFilterPlanner'
import { MidiHubPanelShell } from '../../components/MidiHub/MidiHubHelpPrimitives'
import { MidiHubMessageMapper } from '../../components/MidiHub/MidiHubMessageMapper'
import { MidiMacroPanel } from '../../components/MidiHub/MidiMacroPanel'
import { MidiSchedulerPanel } from '../../components/MidiHub/MidiSchedulerPanel'
import { MidiScriptEditor } from '../../components/MidiHub/MidiScriptEditor'
import { MidiHubAreaLayout } from './MidiHubAreaLayout'
import './MidiHubProcessingPage.css'

export function MidiHubProcessingPage() {
  return (
    <MidiHubAreaLayout
      routeKey="processing"
      title="Message Processing"
      summary="Apply filtering, mapping, scripting, macros, and scheduled automation after the signal path is verified."
      tags={[
        { label: 'Automation', type: 'green' },
        { label: 'Advanced', type: 'warm-gray' },
      ]}
    >
      <section className="midi-hub-processing-band">
        <div className="midi-hub-processing-layout">
          <MidiHubPanelShell panelId="filters" actionTag={<Tag type="blue">Live preview</Tag>}>
            <MidiHubFilterPlanner />
          </MidiHubPanelShell>

          <MidiHubPanelShell panelId="mapper" actionTag={<Tag type="cool-gray">Node-backed</Tag>}>
            <MidiHubMessageMapper />
          </MidiHubPanelShell>
        </div>

        <div className="midi-hub-processing-layout">
          <MidiHubPanelShell panelId="scripts" actionTag={<Tag type="green">Toolbar</Tag>}>
            <MidiScriptEditor />
          </MidiHubPanelShell>

          <MidiHubPanelShell panelId="macros" actionTag={<Tag type="blue">Inline trigger</Tag>}>
            <MidiMacroPanel />
          </MidiHubPanelShell>
        </div>

        <MidiHubPanelShell panelId="scheduler" actionTag={<Tag type="cool-gray">Queue status</Tag>}>
          <MidiSchedulerPanel />
        </MidiHubPanelShell>
      </section>
    </MidiHubAreaLayout>
  )
}

export default MidiHubProcessingPage
