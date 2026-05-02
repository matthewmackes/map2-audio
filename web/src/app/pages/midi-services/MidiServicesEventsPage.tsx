/**
 * T2482 loop 13 / iter 124 — MidiServicesEventsPage.
 *
 * MidiServices-branded sibling of MidiHubEventsPage. Per the iter-121
 * plan D1: imports the same component panels directly. Carries
 * the local selectedEventListId state that EventListManager +
 * EventListStatus + LearnModeControl + EventEditor all share.
 *
 * Panels mounted: EventListManager, EventListStatus, LearnModeControl,
 *   MscCommandBuilder, EventEditor.
 */

import { useState } from 'react'
import { Heading, Layer, Section, Tag } from '@carbon/react'

import { EventEditor } from '../../components/MidiHub/EventEditor'
import { EventListManager } from '../../components/MidiHub/EventListManager'
import { EventListStatus } from '../../components/MidiHub/EventListStatus'
import { LearnModeControl } from '../../components/MidiHub/LearnModeControl'
import { MidiHubPanelShell } from '../../components/MidiHub/MidiHubHelpPrimitives'
import { MscCommandBuilder } from '../../components/MidiHub/MscCommandBuilder'
import './MidiServicesRegionPage.css'

export function MidiServicesEventsPage() {
  const [selectedEventListId, setSelectedEventListId] = useState('')

  return (
    <Section className="midi-services-region">
      <Layer level={0}>
        <header className="midi-services-region__header">
          <Heading className="midi-services-region__title">Events</Heading>
          <p className="midi-services-region__subtitle">
            Build and run Net3-style event lists, cue learning, MSC sends, and
            timecode-driven recall — show-control surface backed by the
            canonical MIDI authority.
          </p>
        </header>
      </Layer>
      <Layer level={1}>
        <div className="midi-services-region__grid">
          <MidiHubPanelShell panelId="event-lists" actionTag={<Tag type="green">Live</Tag>}>
            <EventListManager
              selectedEventListId={selectedEventListId}
              onSelectEventList={setSelectedEventListId}
            />
          </MidiHubPanelShell>
          <MidiHubPanelShell
            panelId="event-status"
            actionTag={<Tag type="cool-gray">{selectedEventListId || 'No selection'}</Tag>}
          >
            <EventListStatus selectedEventListId={selectedEventListId} />
            <LearnModeControl selectedEventListId={selectedEventListId} />
            <MscCommandBuilder />
          </MidiHubPanelShell>
          <MidiHubPanelShell panelId="event-editor" actionTag={<Tag type="blue">MTC / RTC</Tag>}>
            <EventEditor selectedEventListId={selectedEventListId} />
          </MidiHubPanelShell>
        </div>
      </Layer>
    </Section>
  )
}

export default MidiServicesEventsPage
