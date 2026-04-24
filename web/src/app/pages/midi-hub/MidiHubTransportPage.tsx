import { Tag } from '@carbon/react'
import { MidiClockPanel } from '../../components/MidiHub/MidiClockPanel'
import { MidiHubPanelShell } from '../../components/MidiHub/MidiHubHelpPrimitives'
import { MidiRecorderPanel } from '../../components/MidiHub/MidiRecorderPanel'
import { useSetShellWindow } from '../../layout/useSetShellWindow'
import { MidiHubContentFrame } from './MidiHubContentFrame'

export function MidiHubTransportPage() {
  useSetShellWindow({
    subtitle: 'Keep clocking and recorder controls in one area with DAW-style transport focus and capture visibility.',
    kicker: 'Platform / MIDI Hub / Transport',
  }, [])

  return (
    <MidiHubContentFrame routeKey="transport">
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
    </MidiHubContentFrame>
  )
}

export default MidiHubTransportPage
