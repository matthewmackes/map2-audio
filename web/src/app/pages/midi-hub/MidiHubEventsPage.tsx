import { Tag } from '@carbon/react'
import { EventEditor } from '../../components/MidiHub/EventEditor'
import { EventListManager } from '../../components/MidiHub/EventListManager'
import { EventListStatus } from '../../components/MidiHub/EventListStatus'
import { LearnModeControl } from '../../components/MidiHub/LearnModeControl'
import { MidiHubPanelShell } from '../../components/MidiHub/MidiHubHelpPrimitives'
import { MscCommandBuilder } from '../../components/MidiHub/MscCommandBuilder'
import { MidiHubAreaLayout } from './MidiHubAreaLayout'
import { useState } from 'react'
import './MidiHubEventsPage.css'

export function MidiHubEventsPage() {
  const [selectedEventListId, setSelectedEventListId] = useState('')

  return (
    <MidiHubAreaLayout
      routeKey="events"
      title="Event Lists"
      summary="Build and run Net3-style event lists, cue learning, MSC sends, and timecode-driven recall from one show-control workspace."
      tags={[
        { label: 'Cue engine', type: 'green' },
        { label: 'Timecode', type: 'blue' },
      ]}
    >
      <section className="midi-hub-events-band">
        <div className="midi-hub-events-layout">
          <MidiHubPanelShell panelId="event-lists">
            <div className="midi-hub-events-heading">
              <h3>Event List Manager</h3>
              <Tag type="green">Live</Tag>
            </div>
            <EventListManager selectedEventListId={selectedEventListId} onSelectEventList={setSelectedEventListId} />
          </MidiHubPanelShell>

          <MidiHubPanelShell panelId="event-status">
            <div className="midi-hub-events-heading">
              <h3>Event List Status</h3>
              <Tag type="cool-gray">{selectedEventListId || 'No selection'}</Tag>
            </div>
            <EventListStatus selectedEventListId={selectedEventListId} />
            <LearnModeControl selectedEventListId={selectedEventListId} />
            <MscCommandBuilder />
          </MidiHubPanelShell>
        </div>

        <MidiHubPanelShell panelId="event-editor">
          <div className="midi-hub-events-heading">
            <h3>Event Editor</h3>
            <Tag type="blue">MTC / RTC</Tag>
          </div>
          <EventEditor selectedEventListId={selectedEventListId} />
        </MidiHubPanelShell>
      </section>
    </MidiHubAreaLayout>
  )
}

export default MidiHubEventsPage
