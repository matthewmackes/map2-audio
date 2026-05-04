/**
 * MidiServicesConnectionsPage.
 *
 * Reuses the live MidiRoutingMatrix + MidiPatchbay + MidiTrafficMonitor +
 * MidiHubConnectedDevicesReport panels (D1 reuse-don't-fork pattern) and
 * wraps each one in the locked MidiServicesSection primitive.
 */

import { useState } from 'react'
import {
  Heading,
  InlineNotification,
  Layer,
  Section,
  Tab,
  TabList,
  Tabs,
} from '@carbon/react'
import { ConnectionSignal, DataTableReference, Network_3 } from '@carbon/icons-react'

import { MidiHubConnectedDevicesReport } from '../../components/MidiHub/MidiHubConnectedDevicesReport'
import { MidiPatchbay } from '../../components/MidiHub/MidiPatchbay'
import { MidiHubQuickRouter } from '../../components/MidiHub/MidiHubQuickRouter'
import { MidiRoutingMatrix } from '../../components/MidiHub/MidiRoutingMatrix'
import { MidiTrafficMonitor } from '../../components/MidiHub/MidiTrafficMonitor'
import { useMidiHubOverview } from '../../components/MidiHub/useMidiHubOverview'
import { useMidiHubNodeScope } from '../../components/MidiHub/MidiHubNodeScope'
import { DinGlyph } from './MidiServicesGlyphs'
import { MidiServicesSection } from './MidiServicesSection'
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

  const portsEmpty = ports.length === 0
  const routeCount = routes.length
  const clockOutPorts = clockStatus?.output_ports ?? []

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
        <InlineNotification
          className="midi-services-region__about"
          kind="info"
          lowContrast
          hideCloseButton
          title="What this page does"
          subtitle="Inspect every MIDI port the daemon can see, decide which sources reach which destinations (matrix or patchbay graph), confirm traffic is flowing, and audit which physical and virtual devices are currently online."
        />
      </Layer>

      <Layer level={1}>
        <div className="midi-services-region__grid">
          <div className="midi-services-region__section-band">
            <MidiServicesSection
              panelId="routing"
              index={1}
              icon={<Network_3 />}
              title={mode === 'matrix' ? 'Routing matrix' : 'Patchbay graph'}
              subtitle="Decide which input ports reach which output ports. Switch between the dense matrix and the spatial patchbay graph."
              status={{
                tone: routeCount > 0 ? 'live' : 'idle',
                label: routeCount > 0 ? 'ROUTED' : 'IDLE',
                detail:
                  routeCount > 0
                    ? `${routeCount} active route${routeCount === 1 ? '' : 's'}`
                    : 'No routes',
                active: routeCount > 0,
              }}
              empty={
                portsEmpty
                  ? {
                      title: 'No MIDI ports detected',
                      description:
                        'Confirm transport power, cable direction, browser permissions, and network reachability before editing routes.',
                      icon: <DinGlyph />,
                    }
                  : undefined
              }
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
            </MidiServicesSection>
          </div>

          <div className="midi-services-region__section-band">
            <MidiServicesSection
              panelId="traffic"
              index={2}
              icon={<ConnectionSignal />}
              title="Traffic monitor"
              subtitle="Live event stream across all selected ports. Local capture only; remote sniffing is opt-in per session."
              status={{
                tone: portsEmpty ? 'idle' : 'live',
                label: portsEmpty ? 'IDLE' : 'STREAMING',
                detail: portsEmpty ? 'No ports' : 'Local only',
                active: !portsEmpty,
              }}
            >
              <MidiTrafficMonitor limit={500} />
            </MidiServicesSection>
          </div>

          <div className="midi-services-region__section-band">
            <MidiServicesSection
              panelId="core"
              index={3}
              icon={<DataTableReference />}
              title="Connected devices"
              kicker="Inventory"
              subtitle="Physical and virtual devices the authority can address right now, including clock-source mapping."
              status={{
                tone: portsEmpty ? 'idle' : 'live',
                label: portsEmpty ? 'OFFLINE' : 'ONLINE',
                detail: `${ports.length} port${ports.length === 1 ? '' : 's'}`,
                active: !portsEmpty,
              }}
            >
              <MidiHubConnectedDevicesReport
                ports={ports}
                routes={routes}
                clockOutputPorts={clockOutPorts}
              />
            </MidiServicesSection>
          </div>
        </div>
      </Layer>
    </Section>
  )
}

export default MidiServicesConnectionsPage
