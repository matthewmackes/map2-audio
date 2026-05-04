/**
 * MidiServicesNetworkPage.
 *
 * Reuses MidiNetworkPanel + Midi2Panel + TesiraPanel + VirtualGpioPanel +
 * StringInterfacePanel + MidiClusterEnableSection inside the locked
 * MidiServicesSection primitive.
 */

import { Heading, InlineNotification, Layer, Section } from '@carbon/react'
import { CharacterPatterns, GatewayApi, NetworkOverlay, NotebookReference } from '@carbon/icons-react'

import { Midi2Panel } from '../../components/MidiHub/Midi2Panel'
import { MidiClusterEnableSection } from '../../components/MidiHub/MidiClusterEnableSection'
import { MidiNetworkPanel } from '../../components/MidiHub/MidiNetworkPanel'
import { StringInterfacePanel } from '../../components/MidiHub/StringInterfacePanel'
import { TesiraPanel } from '../../components/MidiHub/TesiraPanel'
import { VirtualGpioPanel } from '../../components/MidiHub/VirtualGpioPanel'
import { UmpGlyph } from './MidiServicesGlyphs'
import { MidiServicesSection } from './MidiServicesSection'
import { useMidiServicesShellWindow } from './useMidiServicesShellWindow'
import './MidiServicesRegionPage.css'

export function MidiServicesNetworkPage() {
  useMidiServicesShellWindow(
    'Network',
    'RTP-MIDI, OSC, MIDI 2.0, Tesira TTP, virtual GPIO, and string-command transports.',
  )
  return (
    <Section className="midi-services-region">
      <Layer level={0}>
        <header className="midi-services-region__header">
          <Heading className="midi-services-region__title">Network</Heading>
          <p className="midi-services-region__subtitle">
            RTP-MIDI, OSC, MIDI 2.0, Tesira TTP, virtual GPIO, and string-command
            transports — every protocol the canonical MIDI authority can route in
            or out of.
          </p>
        </header>
        <InlineNotification
          className="midi-services-region__about"
          kind="info"
          lowContrast
          hideCloseButton
          title="What this page does"
          subtitle="Configure off-host MIDI transports: cluster MIDI fan-out, RTP-MIDI / OSC stage links, MIDI 2.0 UMP translation, Biamp Tesira TTP, virtual GPIO contact closures, and the UDP string-command interface."
        />
      </Layer>
      {/* Cluster enable is its own block (modal-driven flip) — sits above the
          numbered grid and is not banded. */}
      <div className="midi-services-region__plain-block">
        <MidiClusterEnableSection />
      </div>
      <Layer level={1}>
        <div className="midi-services-region__grid">
          <div className="midi-services-region__section-band">
            <MidiServicesSection
              panelId="network"
              index={1}
              icon={<NetworkOverlay />}
              title="RTP-MIDI & OSC bridge"
              subtitle="Discover and pair stage links over the network. Each session is its own pair of virtual ports inside the authority."
              status={{ tone: 'live', label: 'STAGE LINKS', active: true }}
            >
              <MidiNetworkPanel />
            </MidiServicesSection>
          </div>

          <div className="midi-services-region__section-band">
            <MidiServicesSection
              panelId="midi2"
              index={2}
              icon={<UmpGlyph />}
              title="MIDI 2.0 & UMP"
              subtitle="Translate Universal MIDI Packets to/from MIDI 1.0 surfaces. MIDI-CI handshake, profile negotiation, and per-session log."
              status={{ tone: 'idle', label: 'TRANSLATION' }}
            >
              <Midi2Panel />
            </MidiServicesSection>
          </div>

          <div className="midi-services-region__section-band">
            <MidiServicesSection
              panelId="tesira"
              index={3}
              icon={<GatewayApi />}
              title="Tesira TTP integration"
              subtitle="Bidirectional bridge to Biamp Tesira DSPs over TTP. Subscribes to attributes and exposes them as authority bindings."
              status={{ tone: 'idle', label: 'BIDIRECTIONAL' }}
            >
              <TesiraPanel />
            </MidiServicesSection>
          </div>

          <div className="midi-services-region__section-band">
            <MidiServicesSection
              panelId="gpio"
              index={4}
              icon={<NotebookReference />}
              title="Virtual GPIO"
              subtitle="12 in / 12 out logical contact closures the authority can route as if they were MIDI events."
              status={{ tone: 'idle', label: '12 IN / 12 OUT' }}
            >
              <VirtualGpioPanel />
            </MidiServicesSection>
          </div>

          <div className="midi-services-region__section-band">
            <MidiServicesSection
              panelId="string-interface"
              index={5}
              icon={<CharacterPatterns />}
              title="String interface"
              subtitle="UDP text protocol for cue triggers from third-party show systems. Listens on the configured port; line-delimited."
              status={{ tone: 'idle', label: 'UDP TEXT' }}
            >
              <StringInterfacePanel />
            </MidiServicesSection>
          </div>
        </div>
      </Layer>
    </Section>
  )
}

export default MidiServicesNetworkPage
