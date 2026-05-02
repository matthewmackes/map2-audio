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

import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Heading, Layer, Section, Tag } from '@carbon/react'

import { EventEditor } from '../../components/MidiHub/EventEditor'
import { EventListManager } from '../../components/MidiHub/EventListManager'
import { EventListStatus } from '../../components/MidiHub/EventListStatus'
import { LearnModeControl } from '../../components/MidiHub/LearnModeControl'
import { MidiHubPanelShell } from '../../components/MidiHub/MidiHubHelpPrimitives'
import { MscCommandBuilder } from '../../components/MidiHub/MscCommandBuilder'
import { useMidiServicesShellWindow } from './useMidiServicesShellWindow'
import './MidiServicesRegionPage.css'

export function MidiServicesEventsPage() {
  useMidiServicesShellWindow(
    'Events',
    'Net3-style event lists, cue learning, MSC sends, timecode-driven recall.',
  )
  // T2483-6 iter 158 — selectedEventListId URL-synced so navigation away
  // and back preserves the selection.
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedEventListId = searchParams.get('event_list_id') ?? ''
  const setSelectedEventListId = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams)
      if (next) {
        params.set('event_list_id', next)
      } else {
        params.delete('event_list_id')
      }
      setSearchParams(params, { replace: true })
    },
    [searchParams, setSearchParams],
  )

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
