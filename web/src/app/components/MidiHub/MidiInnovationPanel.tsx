import { AiLearnPanel } from './AiLearnPanel'
import { DeviceShadowPanel } from './DeviceShadowPanel'
import { MeshNetworkPanel } from './MeshNetworkPanel'

export function MidiInnovationPanel() {
  return (
    <div className="midi-hub-panel-grid--3">
      <AiLearnPanel />
      <MeshNetworkPanel />
      <DeviceShadowPanel />
    </div>
  )
}
