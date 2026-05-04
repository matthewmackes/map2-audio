/**
 * MidiServicesPresetsPage.
 *
 * Reuses MidiHubPresetManager + MidiClockPanel + MidiRecorderPanel inside
 * the locked MidiServicesSection primitive.
 */

import { Heading, InlineNotification, Layer, Section } from '@carbon/react'
import { Music, RecordingFilled, Time } from '@carbon/icons-react'

import { MidiClockPanel } from '../../components/MidiHub/MidiClockPanel'
import { MidiHubPresetManager } from '../../components/MidiHub/MidiHubPresetManager'
import { MidiRecorderPanel } from '../../components/MidiHub/MidiRecorderPanel'
import { MidiServicesSection } from './MidiServicesSection'
import { useMidiServicesShellWindow } from './useMidiServicesShellWindow'
import './MidiServicesRegionPage.css'

export function MidiServicesPresetsPage() {
  useMidiServicesShellWindow(
    'Presets',
    'Lock in repeatable canonical-authority states; recall, clock, and capture.',
  )
  return (
    <Section className="midi-services-region">
      <Layer level={0}>
        <header className="midi-services-region__header">
          <Heading className="midi-services-region__title">Presets</Heading>
          <p className="midi-services-region__subtitle">
            Lock in repeatable canonical-authority states, recall, clock, and
            capture once the route is stable.
          </p>
        </header>
        <InlineNotification
          className="midi-services-region__about"
          kind="info"
          lowContrast
          hideCloseButton
          title="What this page does"
          subtitle="Save and recall preset slots that snapshot the current routing and processing state, drive the master MIDI clock, and capture sessions for later playback or analysis."
        />
      </Layer>
      <Layer level={1}>
        <div className="midi-services-region__grid">
          <div className="midi-services-region__section-band">
            <MidiServicesSection
              panelId="presets"
              index={1}
              icon={<Music />}
              title="Preset manager"
              subtitle="Capture, recall, and reorder named slots that snapshot the bindings authority for show-control."
              status={{ tone: 'idle', label: 'READY' }}
            >
              <MidiHubPresetManager />
            </MidiServicesSection>
          </div>

          <div className="midi-services-region__section-band">
            <MidiServicesSection
              panelId="clock"
              index={2}
              icon={<Time />}
              title="Master clock"
              subtitle="Drive 24 PPQN MIDI clock to selected output ports — local internal source, external sync, or follow MTC."
              status={{ tone: 'live', label: 'LIVE', detail: '120 BPM', active: true }}
            >
              <MidiClockPanel />
            </MidiServicesSection>
          </div>

          <div className="midi-services-region__section-band">
            <MidiServicesSection
              panelId="recorder"
              index={3}
              icon={<RecordingFilled />}
              title="Session recorder"
              subtitle="Capture every event the authority sees and dump to .mid / .syx for offline review."
              status={{ tone: 'idle', label: 'IDLE' }}
            >
              <MidiRecorderPanel />
            </MidiServicesSection>
          </div>
        </div>
      </Layer>
    </Section>
  )
}

export default MidiServicesPresetsPage
