import { Tag } from '@carbon/react'
import { MidiClockPanel } from '../../components/MidiHub/MidiClockPanel'
import { MidiHubPanelShell } from '../../components/MidiHub/MidiHubHelpPrimitives'
import { MidiRecorderPanel } from '../../components/MidiHub/MidiRecorderPanel'
import { MidiHubAreaLayout } from './MidiHubAreaLayout'

export function MidiHubTransportPage() {
  return (
    <MidiHubAreaLayout
      routeKey="transport"
      title="Transport"
      summary="Keep clocking and recorder controls in one area with DAW-style transport focus and capture visibility."
      tags={[
        { label: 'Clock', type: 'green' },
        { label: 'Recorder', type: 'blue' },
      ]}
    >
      <section className="midi-hub-page-band">
        <div className="midi-hub-grid-two">
          <MidiHubPanelShell panelId="clock" title="Clock Engine" actionTag={<Tag type="green">Live</Tag>}>
            <MidiClockPanel />
          </MidiHubPanelShell>

          <MidiHubPanelShell panelId="recorder" actionTag={<Tag type="cool-gray">Capture</Tag>}>
            <MidiRecorderPanel />
          </MidiHubPanelShell>
        </div>
      </section>
    </MidiHubAreaLayout>
  )
}

export default MidiHubTransportPage
