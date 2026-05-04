/**
 * MidiServicesTransportPage.
 *
 * Reuses MidiClockPanel + MidiRecorderPanel inside MidiServicesSection.
 */

import { Heading, InlineNotification, Layer, Section } from '@carbon/react'
import { RecordingFilled, Time } from '@carbon/icons-react'

import { MidiClockPanel } from '../../components/MidiHub/MidiClockPanel'
import { MidiRecorderPanel } from '../../components/MidiHub/MidiRecorderPanel'
import { MtcGlyph } from './MidiServicesGlyphs'
import { MidiServicesSection } from './MidiServicesSection'
import { useMidiServicesShellWindow } from './useMidiServicesShellWindow'
import './MidiServicesRegionPage.css'

export function MidiServicesTransportPage() {
  useMidiServicesShellWindow(
    'Transport',
    'Clock engine, recorder, tempo provenance bound to the canonical authority.',
  )
  return (
    <Section className="midi-services-region">
      <Layer level={0}>
        <header className="midi-services-region__header">
          <Heading className="midi-services-region__title">Transport</Heading>
          <p className="midi-services-region__subtitle">
            Clock engine + recorder + tempo provenance — DAW-style transport
            controls bound to the canonical MIDI authority.
          </p>
        </header>
        <InlineNotification
          className="midi-services-region__about"
          kind="info"
          lowContrast
          hideCloseButton
          title="What this page does"
          subtitle="Run the master timing surface for the system: start, stop, and tempo-sync the MIDI clock; record sessions; surface tempo provenance from internal, external, and MTC sources."
        />
      </Layer>
      <Layer level={1}>
        <div className="midi-services-region__grid">
          <div className="midi-services-region__section-band">
            <MidiServicesSection
              panelId="clock"
              index={1}
              icon={<Time />}
              title="Clock engine"
              subtitle="Internal master, external follower, or MTC-locked. Choose ports, divisions, and free-run vs. song-position behaviour."
              status={{
                tone: 'live',
                label: 'LIVE',
                detail: '120 BPM · 24 PPQN',
                active: true,
              }}
            >
              <MidiClockPanel />
            </MidiServicesSection>
          </div>

          <div className="midi-services-region__section-band">
            <MidiServicesSection
              panelId="recorder"
              index={2}
              icon={<RecordingFilled />}
              title="Recorder & MTC"
              kicker="Capture & timecode"
              subtitle="Capture every event the authority sees; arm, monitor MTC frame counter, and export to .mid / .syx."
              status={{ tone: 'idle', label: 'ARMED', detail: '00:00:00:00' }}
            >
              <MidiRecorderPanel />
              <div className="midi-services-section__timecode-hint" aria-hidden="true">
                <MtcGlyph /> SMPTE 30 fps
              </div>
            </MidiServicesSection>
          </div>
        </div>
      </Layer>
    </Section>
  )
}

export default MidiServicesTransportPage
