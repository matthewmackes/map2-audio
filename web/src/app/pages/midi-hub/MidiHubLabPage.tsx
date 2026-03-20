import { Tag } from '@carbon/react'
import { AiLearnPanel } from '../../components/MidiHub/AiLearnPanel'
import { DeviceShadowPanel } from '../../components/MidiHub/DeviceShadowPanel'
import { MeshNetworkPanel } from '../../components/MidiHub/MeshNetworkPanel'
import { MidiHubPanelShell } from '../../components/MidiHub/MidiHubHelpPrimitives'
import { MidiHubAreaLayout } from './MidiHubAreaLayout'
import './MidiHubLabPage.css'

export function MidiHubLabPage() {
  return (
    <MidiHubAreaLayout
      routeKey="lab"
      title="Lab"
      summary="Review AI mapping suggestions, mesh peers, and device-shadow drift in one controlled Carbon lab workspace."
      tags={[
        { label: 'AI', type: 'warm-gray' },
        { label: 'Experimental', type: 'cool-gray' },
      ]}
    >
      <section className="midi-hub-page-band midi-hub-lab-page">
        <div className="midi-hub-lab-page__grid">
          <MidiHubPanelShell panelId="ai-learn">
            <div className="midi-hub-area-page__panel-heading">
              <h3>AI Learn Suggestions</h3>
              <Tag type="warm-gray">Assistive</Tag>
            </div>
            <AiLearnPanel />
          </MidiHubPanelShell>

          <MidiHubPanelShell panelId="mesh">
            <div className="midi-hub-area-page__panel-heading">
              <h3>Mesh Networking</h3>
              <Tag type="blue">Peer table</Tag>
            </div>
            <MeshNetworkPanel />
          </MidiHubPanelShell>

          <MidiHubPanelShell panelId="device-shadow">
            <div className="midi-hub-area-page__panel-heading">
              <h3>Device Shadow State</h3>
              <Tag type="cool-gray">Drift log</Tag>
            </div>
            <DeviceShadowPanel />
          </MidiHubPanelShell>
        </div>
      </section>
    </MidiHubAreaLayout>
  )
}

export default MidiHubLabPage
