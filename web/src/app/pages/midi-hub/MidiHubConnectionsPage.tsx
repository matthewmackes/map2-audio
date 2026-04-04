import { useState } from 'react'
import { Button, InlineNotification, Tab, TabList, Tabs, Tag } from '@carbon/react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { MidiHubConnectedDevicesReport } from '../../components/MidiHub/MidiHubConnectedDevicesReport'
import { MidiHubPanelShell, MidiHubSurface } from '../../components/MidiHub/MidiHubHelpPrimitives'
import { MidiPatchbay } from '../../components/MidiHub/MidiPatchbay'
import { MidiHubQuickRouter } from '../../components/MidiHub/MidiHubQuickRouter'
import { MidiRoutingMatrix } from '../../components/MidiHub/MidiRoutingMatrix'
import { MidiTrafficMonitor } from '../../components/MidiHub/MidiTrafficMonitor'
import { useMidiHubOverview } from '../../components/MidiHub/useMidiHubOverview'
import { useMidiHubNodeScope } from '../../components/MidiHub/MidiHubNodeScope'
import { maschineApi } from '../../../map2/clients/maschine'
import { MidiHubAreaLayout } from './MidiHubAreaLayout'
import './MidiHubConnectionsPage.css'

type RoutingWorkspaceMode = 'matrix' | 'patchbay'

export function MidiHubConnectionsPage() {
  const [mode, setMode] = useState<RoutingWorkspaceMode>('matrix')
  const navigate = useNavigate()
  const { nodeId, scopeKey } = useMidiHubNodeScope()
  const { ports, routes, clockStatus } = useMidiHubOverview(nodeId, scopeKey)
  const maschineStatusQuery = useQuery({
    queryKey: ['maschine', 'status', 'midi-hub-card'],
    queryFn: () => maschineApi.getStatus(),
    refetchInterval: 2000,
  })
  const maschineState = maschineStatusQuery.data?.state ?? null
  const maschineTagType: 'green' | 'red' | 'warm-gray' =
    maschineState?.connected ? 'green' : maschineStatusQuery.isError ? 'red' : 'warm-gray'

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
        <MidiHubSurface className="midi-hub-connections-page__maschine-card" tone="accent" data-testid="maschine-summary-card">
          <div className="midi-hub-connections-page__maschine-head">
            <div>
              <h3>Maschine MK1</h3>
              <p>Dedicated MK1 daemon and HID surface summary, surfaced alongside the rest of the live MIDI connection inventory.</p>
            </div>
            <Tag type={maschineTagType}>
              {maschineState?.connected ? 'online' : maschineStatusQuery.isError ? 'offline' : 'probing'}
            </Tag>
          </div>
          <div className="midi-hub-connections-page__maschine-meta">
            <span>HID {maschineState?.hid_device && Object.keys(maschineState.hid_device).length > 0 ? 'ready' : 'missing'}</span>
            <span>{maschineState?.virtual_port_name ?? 'MAP2:Maschine-MK1'}</span>
            <span>{maschineState?.status ?? 'unknown'}</span>
          </div>
          <Button kind="tertiary" size="sm" onClick={() => navigate('/maschine')}>
            Configure →
          </Button>
        </MidiHubSurface>
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
