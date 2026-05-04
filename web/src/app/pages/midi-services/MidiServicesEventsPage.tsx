/**
 * MidiServicesEventsPage.
 *
 * Reuses EventListManager + EventListStatus + LearnModeControl +
 * MscCommandBuilder + EventEditor inside the locked MidiServicesSection
 * primitive. selectedEventListId is URL-synced.
 */

import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Heading, InlineNotification, Layer, Section } from '@carbon/react'
import { Bullhorn, Course, Edit } from '@carbon/icons-react'

import { EventEditor } from '../../components/MidiHub/EventEditor'
import { EventListManager } from '../../components/MidiHub/EventListManager'
import { EventListStatus } from '../../components/MidiHub/EventListStatus'
import { LearnModeControl } from '../../components/MidiHub/LearnModeControl'
import { MscCommandBuilder } from '../../components/MidiHub/MscCommandBuilder'
import { MscGlyph } from './MidiServicesGlyphs'
import { MidiServicesSection } from './MidiServicesSection'
import { useMidiServicesShellWindow } from './useMidiServicesShellWindow'
import './MidiServicesRegionPage.css'

export function MidiServicesEventsPage() {
  useMidiServicesShellWindow(
    'Events',
    'Net3-style event lists, cue learning, MSC sends, timecode-driven recall.',
  )
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

  const hasSelection = Boolean(selectedEventListId)

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
        <InlineNotification
          className="midi-services-region__about"
          kind="info"
          lowContrast
          hideCloseButton
          title="What this page does"
          subtitle="Author and run cue lists in the Net3 / MSC tradition: pick or create a list, watch its live execution status, capture cues by physical input (Learn), build and send MSC commands, and edit individual cue timing."
        />
      </Layer>
      <Layer level={1}>
        <div className="midi-services-region__grid">
          <div className="midi-services-region__section-band">
            <MidiServicesSection
              panelId="event-lists"
              index={1}
              icon={<Course />}
              title="Event lists"
              subtitle="Pick the working cue list. New lists, duplicates, exports, and reorder live here — selection persists in the URL."
              status={{ tone: 'live', label: 'LIVE', detail: 'Authority-backed', active: true }}
            >
              <EventListManager
                selectedEventListId={selectedEventListId}
                onSelectEventList={setSelectedEventListId}
              />
            </MidiServicesSection>
          </div>

          <div className="midi-services-region__section-band">
            <MidiServicesSection
              panelId="event-status"
              index={2}
              icon={<Bullhorn />}
              title="Status, learn & MSC"
              kicker="Show control"
              subtitle="Watch the executor, capture cues from a physical surface, and build MIDI Show Control sends."
              status={{
                tone: hasSelection ? 'live' : 'idle',
                label: hasSelection ? 'WATCHING' : 'NO SELECTION',
                detail: hasSelection ? selectedEventListId : '—',
                active: hasSelection,
              }}
              empty={
                hasSelection
                  ? undefined
                  : {
                      title: 'Select an event list to see live status',
                      description:
                        'Pick a list above to watch its current cue, follow learn mode, or send MSC commands targeted at it.',
                      icon: <MscGlyph />,
                    }
              }
            >
              <EventListStatus selectedEventListId={selectedEventListId} />
              <LearnModeControl selectedEventListId={selectedEventListId} />
              <MscCommandBuilder />
            </MidiServicesSection>
          </div>

          <div className="midi-services-region__section-band">
            <MidiServicesSection
              panelId="event-editor"
              index={3}
              icon={<Edit />}
              title="Event editor"
              subtitle="Edit cue timing, MTC follow points, and per-cue MSC payload. Changes write back to the canonical authority."
              status={{
                tone: hasSelection ? 'idle' : 'neutral',
                label: hasSelection ? 'EDITING' : 'PICK A LIST',
                detail: hasSelection ? 'MTC / RTC' : undefined,
              }}
              empty={
                hasSelection
                  ? undefined
                  : {
                      title: 'No event list selected',
                      description: 'Select a list from the manager above to edit its cues.',
                    }
              }
            >
              <EventEditor selectedEventListId={selectedEventListId} />
            </MidiServicesSection>
          </div>
        </div>
      </Layer>
    </Section>
  )
}

export default MidiServicesEventsPage
