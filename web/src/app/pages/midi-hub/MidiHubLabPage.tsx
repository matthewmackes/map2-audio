import { Tag } from '@carbon/react'
import { AiLearnPanel } from '../../components/MidiHub/AiLearnPanel'
import { DeviceShadowPanel } from '../../components/MidiHub/DeviceShadowPanel'
import { MeshNetworkPanel } from '../../components/MidiHub/MeshNetworkPanel'
import { MidiHubPanelShell } from '../../components/MidiHub/MidiHubHelpPrimitives'
import { useSetShellWindow } from '../../layout/useSetShellWindow'
import { MidiHubContentFrame } from './MidiHubContentFrame'
import './MidiHubLabPage.css'

export function MidiHubLabPage() {
  useSetShellWindow({
    subtitle: 'Review AI mapping suggestions, mesh peers, and device-shadow drift in one controlled Carbon lab workspace.',
    kicker: 'Platform / MIDI Hub / Lab',
  }, [])

  return (
    <MidiHubContentFrame routeKey="lab">
      <section className="midi-hub-page-band midi-hub-lab-page">
        <div className="midi-hub-lab-page__grid">
          <MidiHubPanelShell panelId="ai-learn" actionTag={<Tag type="warm-gray">Assistive</Tag>}>
            <AiLearnPanel />
          </MidiHubPanelShell>

          <MidiHubPanelShell panelId="mesh" actionTag={<Tag type="blue">Peer table</Tag>}>
            <MeshNetworkPanel />
          </MidiHubPanelShell>

          <MidiHubPanelShell panelId="device-shadow" actionTag={<Tag type="cool-gray">Drift log</Tag>}>
            <DeviceShadowPanel />
          </MidiHubPanelShell>
        </div>
      </section>
    </MidiHubContentFrame>
  )
}

export default MidiHubLabPage
