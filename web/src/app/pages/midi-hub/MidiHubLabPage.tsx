import { MidiHubPanelShell } from '../../components/MidiHub/MidiHubHelpPrimitives'
import { MidiInnovationPanel } from '../../components/MidiHub/MidiInnovationPanel'
import { MidiHubAreaLayout } from './MidiHubAreaLayout'

export function MidiHubLabPage() {
  return (
    <MidiHubAreaLayout
      routeKey="lab"
      title="Lab"
      summary="Keep AI-assisted, mesh, and device-shadow experiments isolated from the production signal path and show-state workflows."
      tags={[
        { label: 'AI', type: 'warm-gray' },
        { label: 'Experimental', type: 'cool-gray' },
      ]}
    >
      <section className="midi-hub-page-band">
        <MidiHubPanelShell panelId="innovation">
          <MidiInnovationPanel />
        </MidiHubPanelShell>
      </section>
    </MidiHubAreaLayout>
  )
}

export default MidiHubLabPage
