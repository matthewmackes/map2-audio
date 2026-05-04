/**
 * MidiServicesLabPage.
 *
 * Reuses AiLearnPanel + MeshNetworkPanel + DeviceShadowPanel inside the
 * locked MidiServicesSection primitive.
 */

import { Heading, InlineNotification, Layer, Section } from '@carbon/react'
import { Flash, MachineLearning, Network_4 } from '@carbon/icons-react'

import { AiLearnPanel } from '../../components/MidiHub/AiLearnPanel'
import { DeviceShadowPanel } from '../../components/MidiHub/DeviceShadowPanel'
import { MeshNetworkPanel } from '../../components/MidiHub/MeshNetworkPanel'
import { MidiServicesSection } from './MidiServicesSection'
import { useMidiServicesShellWindow } from './useMidiServicesShellWindow'
import './MidiServicesRegionPage.css'

export function MidiServicesLabPage() {
  useMidiServicesShellWindow(
    'Lab',
    'AI mapping suggestions, mesh peers, and device-shadow drift. Experimental surfaces only.',
  )
  return (
    <Section className="midi-services-region">
      <Layer level={0}>
        <header className="midi-services-region__header">
          <Heading className="midi-services-region__title">Lab</Heading>
          <p className="midi-services-region__subtitle">
            Review AI mapping suggestions, mesh peers, and device-shadow drift
            against the canonical MIDI authority. Experimental surfaces only.
          </p>
        </header>
        <InlineNotification
          className="midi-services-region__about"
          kind="info"
          lowContrast
          hideCloseButton
          title="What this page does"
          subtitle="Stage experimental MIDI surfaces before they graduate to production: assistive AI mapping suggestions, mesh-network peer routing, and live device-shadow drift comparison against the canonical authority."
        />
      </Layer>
      <Layer level={1}>
        <div className="midi-services-region__grid">
          <div className="midi-services-region__section-band">
            <MidiServicesSection
              panelId="ai-learn"
              index={1}
              icon={<MachineLearning />}
              title="AI learn"
              subtitle="Watch the user perform a workflow; receive suggested mappings ranked by confidence. Suggestions are advisory until accepted."
              status={{ tone: 'idle', label: 'ASSISTIVE' }}
            >
              <AiLearnPanel />
            </MidiServicesSection>
          </div>

          <div className="midi-services-region__section-band">
            <MidiServicesSection
              panelId="mesh"
              index={2}
              icon={<Network_4 />}
              title="Mesh network"
              subtitle="Peer table and routing reachability across MAP2 nodes. Healthy peers participate in cluster MIDI fan-out."
              status={{ tone: 'idle', label: 'PEER TABLE' }}
            >
              <MeshNetworkPanel />
            </MidiServicesSection>
          </div>

          <div className="midi-services-region__section-band">
            <MidiServicesSection
              panelId="device-shadow"
              index={3}
              icon={<Flash />}
              title="Device shadow"
              subtitle="Compare the authority's expected device state to what the device reports. Drift entries are addressable individually."
              status={{ tone: 'idle', label: 'DRIFT LOG' }}
            >
              <DeviceShadowPanel />
            </MidiServicesSection>
          </div>
        </div>
      </Layer>
    </Section>
  )
}

export default MidiServicesLabPage
