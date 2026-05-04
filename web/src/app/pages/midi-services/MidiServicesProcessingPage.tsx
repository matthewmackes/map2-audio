/**
 * MidiServicesProcessingPage.
 *
 * Reuses MidiHubFilterPlanner + MidiHubMessageMapper + MidiScriptEditor +
 * MidiMacroPanel + MidiSchedulerPanel inside the locked MidiServicesSection
 * primitive.
 */

import { Heading, InlineNotification, Layer, Section } from '@carbon/react'
import {
  Code,
  Filter,
  PlayFilledAlt,
  EventSchedule,
  TextLinkAnalysis,
} from '@carbon/icons-react'

import { MidiHubFilterPlanner } from '../../components/MidiHub/MidiHubFilterPlanner'
import { MidiHubMessageMapper } from '../../components/MidiHub/MidiHubMessageMapper'
import { MidiMacroPanel } from '../../components/MidiHub/MidiMacroPanel'
import { MidiSchedulerPanel } from '../../components/MidiHub/MidiSchedulerPanel'
import { MidiScriptEditor } from '../../components/MidiHub/MidiScriptEditor'
import { MidiServicesSection } from './MidiServicesSection'
import { useMidiServicesShellWindow } from './useMidiServicesShellWindow'
import './MidiServicesRegionPage.css'

export function MidiServicesProcessingPage() {
  useMidiServicesShellWindow(
    'Processing',
    'Filtering, mapping, scripting, macros, and scheduled automation between authority and engine.',
  )
  return (
    <Section className="midi-services-region">
      <Layer level={0}>
        <header className="midi-services-region__header">
          <Heading className="midi-services-region__title">Processing</Heading>
          <p className="midi-services-region__subtitle">
            Apply filtering, mapping, scripting, macros, and scheduled
            automation between the canonical bindings authority and the audio
            engine.
          </p>
        </header>
        <InlineNotification
          className="midi-services-region__about"
          kind="info"
          lowContrast
          hideCloseButton
          title="What this page does"
          subtitle="Shape the MIDI stream between input and engine: drop or transform messages with filter rules, remap CC/note ranges, run Python automation against live events, fire macro chains, and schedule timed sends."
        />
      </Layer>
      <Layer level={1}>
        <div className="midi-services-region__grid">
          <div className="midi-services-region__section-band">
            <MidiServicesSection
              panelId="filters"
              index={1}
              icon={<Filter />}
              title="Filter planner"
              subtitle="Drop, allow, and rewrite messages with rule chains. Live preview shows the surviving traffic before commit."
              status={{ tone: 'live', label: 'PREVIEW', active: true }}
            >
              <MidiHubFilterPlanner />
            </MidiServicesSection>
          </div>

          <div className="midi-services-region__section-band">
            <MidiServicesSection
              panelId="mapper"
              index={2}
              icon={<TextLinkAnalysis />}
              title="Message mapper"
              subtitle="Translate channel/CC/note/value pairs end-to-end. Maps are node-backed and shareable across pages."
              status={{ tone: 'idle', label: 'NODE-BACKED' }}
            >
              <MidiHubMessageMapper />
            </MidiServicesSection>
          </div>

          <div className="midi-services-region__section-band">
            <MidiServicesSection
              panelId="scripts"
              index={3}
              icon={<Code />}
              title="Script editor"
              subtitle="Write Python that watches live events and emits new ones. Sandboxed runtime; toolbar fires test events."
              status={{ tone: 'live', label: 'LIVE', active: true }}
            >
              <MidiScriptEditor />
            </MidiServicesSection>
          </div>

          <div className="midi-services-region__section-band">
            <MidiServicesSection
              panelId="macros"
              index={4}
              icon={<PlayFilledAlt />}
              title="Macros"
              subtitle="Author and trigger sequences of MIDI events with one click. Bind to surfaces or fire from event lists."
              status={{ tone: 'idle', label: 'READY' }}
            >
              <MidiMacroPanel />
            </MidiServicesSection>
          </div>

          <div className="midi-services-region__section-band">
            <MidiServicesSection
              panelId="scheduler"
              index={5}
              icon={<EventSchedule />}
              title="Scheduler"
              subtitle="Queue events to fire at wall-clock time, song position, or MTC frame. Queue status reflects the daemon."
              status={{ tone: 'idle', label: 'QUEUE EMPTY' }}
            >
              <MidiSchedulerPanel />
            </MidiServicesSection>
          </div>
        </div>
      </Layer>
    </Section>
  )
}

export default MidiServicesProcessingPage
