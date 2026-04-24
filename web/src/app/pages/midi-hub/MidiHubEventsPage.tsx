import { Tag } from '@carbon/react'
import { EventEditor } from '../../components/MidiHub/EventEditor'
import { EventListManager } from '../../components/MidiHub/EventListManager'
import { EventListStatus } from '../../components/MidiHub/EventListStatus'
import { LearnModeControl } from '../../components/MidiHub/LearnModeControl'
import { MidiHubPanelShell } from '../../components/MidiHub/MidiHubHelpPrimitives'
import { MscCommandBuilder } from '../../components/MidiHub/MscCommandBuilder'
import { useSetShellWindow } from '../../layout/useSetShellWindow'
import { MidiHubContentFrame } from './MidiHubContentFrame'
import { useState } from 'react'
import './MidiHubEventsPage.css'

export function MidiHubEventsPage() {
  const [selectedEventListId, setSelectedEventListId] = useState('')

  useSetShellWindow({
    subtitle:
      'Build and run Net3-style event lists, cue learning, MSC sends, and timecode-driven recall from one show-control workspace.',
    kicker: 'Platform / MIDI Hub / Events',
  }, [])

  return (
    <MidiHubContentFrame routeKey="events">
      <section className="midi-hub-events-band">
        <div className="midi-hub-events-layout">
          <MidiHubPanelShell panelId="event-lists" actionTag={<Tag type="green">Live</Tag>}>
            <EventListManager selectedEventListId={selectedEventListId} onSelectEventList={setSelectedEventListId} />
          </MidiHubPanelShell>

          <MidiHubPanelShell panelId="event-status" actionTag={<Tag type="cool-gray">{selectedEventListId || 'No selection'}</Tag>}>
            <EventListStatus selectedEventListId={selectedEventListId} />
            <LearnModeControl selectedEventListId={selectedEventListId} />
            <MscCommandBuilder />
          </MidiHubPanelShell>
        </div>

        <MidiHubPanelShell panelId="event-editor" actionTag={<Tag type="blue">MTC / RTC</Tag>}>
          <EventEditor selectedEventListId={selectedEventListId} />
        </MidiHubPanelShell>
      </section>
    </MidiHubContentFrame>
  )
}

export default MidiHubEventsPage
