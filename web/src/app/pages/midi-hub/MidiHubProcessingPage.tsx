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
          <MidiHubPanelShell panelId="filters">
            <div className="midi-hub-processing-heading">
              <h3>Filter Planner</h3>
              <Tag type="blue">Live preview</Tag>
            </div>
            <MidiHubFilterPlanner />
          </MidiHubPanelShell>

          <MidiHubPanelShell panelId="mapper">
            <div className="midi-hub-processing-heading">
              <h3>Message Mapper</h3>
              <Tag type="cool-gray">Node-backed</Tag>
            </div>
            <MidiHubMessageMapper />
          </MidiHubPanelShell>
        </div>

        <div className="midi-hub-processing-layout">
          <MidiHubPanelShell panelId="scripts">
            <div className="midi-hub-processing-heading">
              <h3>Script Editor</h3>
              <Tag type="green">Toolbar</Tag>
            </div>
            <MidiScriptEditor />
          </MidiHubPanelShell>

          <MidiHubPanelShell panelId="macros">
            <div className="midi-hub-processing-heading">
              <h3>Macros</h3>
              <Tag type="blue">Inline trigger</Tag>
            </div>
            <MidiMacroPanel />
          </MidiHubPanelShell>
        </div>

        <MidiHubPanelShell panelId="scheduler">
          <div className="midi-hub-processing-heading">
            <h3>Scheduler</h3>
            <Tag type="cool-gray">Queue status</Tag>
          </div>
          <MidiSchedulerPanel />
        </MidiHubPanelShell>
      </section>
    </MidiHubAreaLayout>
  )
}

export default MidiHubProcessingPage
