import { useState } from 'react'
import { InlineNotification, Tab, TabList, Tabs, Tag } from '@carbon/react'
import { MidiHubConnectedDevicesReport } from '../../components/MidiHub/MidiHubConnectedDevicesReport'
import { MidiHubPanelShell } from '../../components/MidiHub/MidiHubHelpPrimitives'
import { MidiPatchbay } from '../../components/MidiHub/MidiPatchbay'
import { MidiHubQuickRouter } from '../../components/MidiHub/MidiHubQuickRouter'
import { MidiRoutingMatrix } from '../../components/MidiHub/MidiRoutingMatrix'
import { MidiTrafficMonitor } from '../../components/MidiHub/MidiTrafficMonitor'
import { useMidiHubOverview } from '../../components/MidiHub/useMidiHubOverview'
import { useMidiHubNodeScope } from '../../components/MidiHub/MidiHubNodeScope'
import { MidiHubAreaLayout } from './MidiHubAreaLayout'
import './MidiHubConnectionsPage.css'

type RoutingWorkspaceMode = 'matrix' | 'patchbay'

export function MidiHubConnectionsPage() {
  const [mode, setMode] = useState<RoutingWorkspaceMode>('matrix')
  const { nodeId, scopeKey } = useMidiHubNodeScope()
  const { ports, routes, clockStatus } = useMidiHubOverview(nodeId, scopeKey)

  return (
    <MidiHubAreaLayout
      routeKey="connections"
      title="Connections"
      summary="Build the active route first, then confirm live events and traffic before moving deeper into recall or automation."
      tags={[
        { label: 'Primary workflow', type: 'green' },
        { label: 'Traffic monitor', type: 'cool-gray' },
      ]}
    >
      {ports.length === 0 ? (
        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title="No MIDI ports detected"
          subtitle="Confirm transport power, cable direction, browser permissions, and network reachability before editing routes."
        />
      ) : null}

      <section className="midi-hub-connections-band">
        <div className="midi-hub-connections-page">
          <MidiHubPanelShell
            panelId="routing"
            actionTag={<Tag type="blue">{mode === 'matrix' ? 'Port matrix' : 'Patchbay graph'}</Tag>}
          >
            <div className="midi-hub-connections-page__workspace-header">
              <p className="midi-hub-connections-page__workspace-copy">
                {mode === 'matrix'
                  ? 'Use the matrix to create, enable, or inspect source-to-destination routes.'
                  : 'Use the patchbay to inspect topology, fan-out, and route density at a glance.'}
              </p>
              <Tabs
                selectedIndex={mode === 'matrix' ? 0 : 1}
                onChange={({ selectedIndex }) => setMode(selectedIndex === 1 ? 'patchbay' : 'matrix')}
              >
                <TabList aria-label="Routing workspace view mode" contained>
                  <Tab>Port matrix</Tab>
                  <Tab>Patchbay graph</Tab>
                </TabList>
              </Tabs>
            </div>

            {mode === 'matrix'
              ? <MidiRoutingMatrix active />
              : <MidiPatchbay active />}
            <MidiHubQuickRouter />
          </MidiHubPanelShell>

          <MidiHubPanelShell panelId="traffic" title="Traffic Monitor" actionTag={<Tag type="cool-gray">Local only</Tag>}>
            <MidiTrafficMonitor limit={500} />
          </MidiHubPanelShell>
        </div>
      </section>

      <section className="midi-hub-connections-band midi-hub-connections-page__device-report">
        <MidiHubConnectedDevicesReport
          ports={ports}
          routes={routes}
          clockOutputPorts={clockStatus?.output_ports ?? []}
        />
      </section>
    </MidiHubAreaLayout>
  )
}

export default MidiHubConnectionsPage
