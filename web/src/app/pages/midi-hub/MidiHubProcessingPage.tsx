import { MidiHubFilterPlannerCard, MidiHubMapperPlannerCard } from '../../components/MidiHub/MidiHubWorkbenchCards'
import { MidiHubPanelShell } from '../../components/MidiHub/MidiHubHelpPrimitives'
import { MidiMacroPanel } from '../../components/MidiHub/MidiMacroPanel'
import { MidiSchedulerPanel } from '../../components/MidiHub/MidiSchedulerPanel'
import { MidiScriptEditor } from '../../components/MidiHub/MidiScriptEditor'
import { MidiHubAreaLayout } from './MidiHubAreaLayout'

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
      <section className="midi-hub-page-band">
        <div className="midi-hub-grid-two">
          <MidiHubPanelShell panelId="filters">
            <MidiHubFilterPlannerCard />
          </MidiHubPanelShell>

          <MidiHubPanelShell panelId="mapper">
            <MidiHubMapperPlannerCard />
          </MidiHubPanelShell>
        </div>

        <div className="midi-hub-grid-two">
          <MidiHubPanelShell panelId="scripts">
            <MidiScriptEditor />
          </MidiHubPanelShell>

          <MidiHubPanelShell panelId="macros">
            <MidiMacroPanel />
          </MidiHubPanelShell>
        </div>

        <MidiHubPanelShell panelId="scheduler">
          <MidiSchedulerPanel />
        </MidiHubPanelShell>
      </section>
    </MidiHubAreaLayout>
  )
}

export default MidiHubProcessingPage
