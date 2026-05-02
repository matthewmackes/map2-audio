/**
 * T2482 loop 13 / iter 126 — MidiServicesLabPage.
 *
 * MidiServices-branded sibling of MidiHubLabPage. Per the iter-121
 * plan D1: imports the same component panels directly.
 *
 * Panels mounted: AiLearnPanel, MeshNetworkPanel, DeviceShadowPanel.
 */

import { Heading, Layer, Section, Tag } from '@carbon/react'

import { AiLearnPanel } from '../../components/MidiHub/AiLearnPanel'
import { DeviceShadowPanel } from '../../components/MidiHub/DeviceShadowPanel'
import { MeshNetworkPanel } from '../../components/MidiHub/MeshNetworkPanel'
import { MidiHubPanelShell } from '../../components/MidiHub/MidiHubHelpPrimitives'
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
      </Layer>
      <Layer level={1}>
        <div className="midi-services-region__grid">
          <MidiHubPanelShell panelId="ai-learn" actionTag={<Tag type="warm-gray">Assistive</Tag>}>
            <AiLearnPanel />
          </MidiHubPanelShell>
          <MidiHubPanelShell panelId="mesh" actionTag={<Tag type="blue">Peer table</Tag>}>
            <MeshNetworkPanel />
          </MidiHubPanelShell>
          <MidiHubPanelShell panelId="device-shadow" actionTag={<Tag type="cool-gray">Drift log</Tag>}>
            <DeviceShadowPanel />
          </MidiHubPanelShell>
        </div>
      </Layer>
    </Section>
  )
}

export default MidiServicesLabPage
