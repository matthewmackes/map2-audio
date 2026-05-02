/**
 * T2483 loop 16 / iter 154 — MidiServicesConnectionsPage (T2483-2).
 *
 * Closes the iter-127 fallback that was the only remaining MidiHub-
 * routed entry under /midi/*. Per the iter-121 D1 pattern (reuse
 * panels, don't fork): imports the same MidiRoutingMatrix +
 * MidiPatchbay + MidiTrafficMonitor + MidiHubConnectedDevicesReport
 * + MidiHubQuickRouter components and wraps them in the iter-122
 * Section/Layer chrome.
 *
 * The Maschine summary card from MidiHubConnectionsPage is dropped
 * here - it duplicated information already shown in
 * MidiHubConnectedDevicesReport, and the iter-134 cross-link banner
 * on MaschinePage already provides the bidirectional navigation.
 */

import { useState } from 'react'
import { Heading, InlineNotification, Layer, Section, Tab, TabList, Tabs, Tag } from '@carbon/react'

import { MidiHubConnectedDevicesReport } from '../../components/MidiHub/MidiHubConnectedDevicesReport'
import { MidiHubPanelShell } from '../../components/MidiHub/MidiHubHelpPrimitives'
import { MidiPatchbay } from '../../components/MidiHub/MidiPatchbay'
import { MidiHubQuickRouter } from '../../components/MidiHub/MidiHubQuickRouter'
import { MidiRoutingMatrix } from '../../components/MidiHub/MidiRoutingMatrix'
import { MidiTrafficMonitor } from '../../components/MidiHub/MidiTrafficMonitor'
import { useMidiHubOverview } from '../../components/MidiHub/useMidiHubOverview'
import { useMidiHubNodeScope } from '../../components/MidiHub/MidiHubNodeScope'
import { useMidiServicesShellWindow } from './useMidiServicesShellWindow'
import './MidiServicesRegionPage.css'

type RoutingWorkspaceMode = 'matrix' | 'patchbay'

export function MidiServicesConnectionsPage() {
  useMidiServicesShellWindow(
    'Connections',
    'MIDI port inventory, routing matrix or patchbay topology, live traffic, connected devices.',
  )
  const [mode, setMode] = useState<RoutingWorkspaceMode>('matrix')
  const { nodeId, scopeKey } = useMidiHubNodeScope()
  const { ports, routes, clockStatus } = useMidiHubOverview(nodeId, scopeKey)

  return (
    <Section className="midi-services-region">
      <Layer level={0}>
        <header className="midi-services-region__header">
          <Heading className="midi-services-region__title">Connections</Heading>
          <p className="midi-services-region__subtitle">
            MIDI port inventory, routing matrix or patchbay topology, live
            traffic, and connected device report — backed by the canonical
            MIDI Services authority.
          </p>
        </header>
      </Layer>

      {ports.length === 0 ? (
        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title="No MIDI ports detected"
          subtitle="Confirm transport power, cable direction, browser permissions, and network reachability before editing routes."
        />
      ) : null}

      <Layer level={1}>
        <div className="midi-services-region__grid">
          <MidiHubPanelShell
            panelId="routing"
            actionTag={<Tag type="blue">{mode === 'matrix' ? 'Port matrix' : 'Patchbay graph'}</Tag>}
          >
            <Tabs
              selectedIndex={mode === 'matrix' ? 0 : 1}
              onChange={({ selectedIndex }) =>
                setMode(selectedIndex === 1 ? 'patchbay' : 'matrix')
              }
            >
              <TabList aria-label="Routing workspace view mode" contained>
                <Tab>Port matrix</Tab>
                <Tab>Patchbay graph</Tab>
              </TabList>
            </Tabs>
            {mode === 'matrix' ? <MidiRoutingMatrix active /> : <MidiPatchbay active />}
            <MidiHubQuickRouter />
          </MidiHubPanelShell>

          <MidiHubPanelShell
            panelId="traffic"
            title="Traffic Monitor"
            actionTag={<Tag type="cool-gray">Local only</Tag>}
          >
            <MidiTrafficMonitor limit={500} />
          </MidiHubPanelShell>

          <MidiHubConnectedDevicesReport
            ports={ports}
            routes={routes}
            clockOutputPorts={clockStatus?.output_ports ?? []}
          />
        </div>
      </Layer>
    </Section>
  )
}

export default MidiServicesConnectionsPage
