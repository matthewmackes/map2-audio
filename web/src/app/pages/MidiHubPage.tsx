import { useMemo, useState } from 'react'
import { Music } from '@carbon/icons-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  ClickableTile,
  InlineNotification,
  Layer,
  Select,
  SelectItem,
  Tab,
  TabList,
  Tabs,
  Tag,
} from '@carbon/react'
import { midiHubApi } from '../../map2/api'
import { Midi2Panel } from '../components/MidiHub/Midi2Panel'
import { MidiClockPanel } from '../components/MidiHub/MidiClockPanel'
import { MidiHubPanelShell } from '../components/MidiHub/MidiHubHelpPrimitives'
import { MidiHubNodeScopeProvider } from '../components/MidiHub/MidiHubNodeScope'
import { MidiHubPresetManager } from '../components/MidiHub/MidiHubPresetManager'
import {
  MidiHubFilterPlannerCard,
  MidiHubMapperPlannerCard,
  MidiHubQuickRouterCard,
  readPorts,
} from '../components/MidiHub/MidiHubWorkbenchCards'
import { MidiInnovationPanel } from '../components/MidiHub/MidiInnovationPanel'
import { MidiMacroPanel } from '../components/MidiHub/MidiMacroPanel'
import { MidiNetworkPanel } from '../components/MidiHub/MidiNetworkPanel'
import { MidiPatchbay } from '../components/MidiHub/MidiPatchbay'
import { MidiRecorderPanel } from '../components/MidiHub/MidiRecorderPanel'
import { MidiRoutingMatrix } from '../components/MidiHub/MidiRoutingMatrix'
import { MidiSchedulerPanel } from '../components/MidiHub/MidiSchedulerPanel'
import { MidiScriptEditor } from '../components/MidiHub/MidiScriptEditor'
import { MidiTrafficMonitor } from '../components/MidiHub/MidiTrafficMonitor'
import { NodeContextBanner } from '../components/NodeContextBanner/NodeContextBanner'
import { NodeContextPicker } from '../components/NodeContextPicker/NodeContextPicker'
import { useToasts } from '../components/Toasts'
import { useNodePageContext } from '../hooks/useNodePageContext'
import { NODE_PAGE_KEYS } from '../utils/nodeDisplay'
import './MidiHubPage.css'

type RoutingWorkspaceMode = 'matrix' | 'patchbay'

type WorkflowCard = {
  id: string
  eyebrow: string
  title: string
  detail: string
  stat: string
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {}
  return value as Record<string, unknown>
}

function tagTone(isHealthy: boolean, active: 'green' | 'blue' = 'green'): 'green' | 'blue' | 'warm-gray' {
  return isHealthy ? active : 'warm-gray'
}

export function MidiHubPage() {
  const [mode, setMode] = useState<RoutingWorkspaceMode>('matrix')
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const { localNode, topology, viewedNodeId } = useNodePageContext(NODE_PAGE_KEYS.midiHub)
  const apiNodeId = viewedNodeId === localNode?.node_id ? null : viewedNodeId
  const scopeKey = apiNodeId ?? 'local'

  const queryClient = useQueryClient()
  const { pushToast } = useToasts()

  const presetsQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'presets'],
    queryFn: () => midiHubApi.listPresetsForNode(apiNodeId),
    refetchInterval: 3000,
  })

  const statusQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'status'],
    queryFn: () => midiHubApi.getStatusForNode(apiNodeId),
    refetchInterval: 3000,
  })

  const routesQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'routes'],
    queryFn: () => midiHubApi.getRoutesForNode(apiNodeId),
    refetchInterval: 3000,
  })

  const clockQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'clock'],
    queryFn: () => midiHubApi.getClockStatusForNode(apiNodeId),
    refetchInterval: 2500,
  })

  const sessionsQuery = useQuery({
    queryKey: ['midi-hub', scopeKey, 'network-sessions'],
    queryFn: () => midiHubApi.listNetworkSessionsForNode(apiNodeId),
    refetchInterval: 5000,
  })

  const midi2Query = useQuery({
    queryKey: ['midi-hub', scopeKey, 'midi2-status'],
    queryFn: () => midiHubApi.getMidi2StatusForNode(apiNodeId),
    refetchInterval: 5000,
  })

  const quickRecallMutation = useMutation({
    mutationFn: async (presetId: string) => midiHubApi.recallPresetForNode(presetId, apiNodeId),
    onSuccess: () => {
      pushToast('Preset recalled', 'success')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub', scopeKey] })
    },
    onError: () => pushToast('Preset recall failed', 'error'),
  })

  const statusRecord = useMemo(() => readRecord(statusQuery.data), [statusQuery.data])
  const ports = useMemo(() => readPorts(statusRecord.ports), [statusRecord])
  const inputPorts = useMemo(
    () => ports.filter((port) => port.direction === 'input' || port.direction === 'duplex'),
    [ports],
  )
  const outputPorts = useMemo(
    () => ports.filter((port) => port.direction === 'output' || port.direction === 'duplex'),
    [ports],
  )
  const routesCount = routesQuery.data?.routes?.length ?? 0
  const presetsCount = presetsQuery.data?.presets?.length ?? 0
  const sessionsCount = sessionsQuery.data?.sessions?.length ?? 0
  const midi2DeviceCount = midi2Query.data?.device_count ?? 0

  const workflowCards = useMemo<WorkflowCard[]>(
    () => [
      {
        id: 'midi-hub-routing-section',
        eyebrow: 'Start',
        title: 'Verify ports and build the active path',
        detail: 'Use the routing workspace and live event monitor first.',
        stat: `${inputPorts.length} in / ${outputPorts.length} out`,
      },
      {
        id: 'midi-hub-show-section',
        eyebrow: 'Show control',
        title: 'Recall presets and manage program change targets',
        detail: 'Keep repeatable states close to the signal path.',
        stat: `${presetsCount} presets`,
      },
      {
        id: 'midi-hub-network-section',
        eyebrow: 'Network',
        title: 'Add RTP-MIDI, OSC, and MIDI 2.0 endpoints',
        detail: 'Bring remote devices and protocol services online.',
        stat: `${sessionsCount} sessions`,
      },
      {
        id: 'midi-hub-processing-section',
        eyebrow: 'Processing',
        title: 'Filter, map, script, macro, and schedule MIDI events',
        detail: 'Deeper message processing lives after the working route.',
        stat: `${routesCount} routes`,
      },
      {
        id: 'midi-hub-experimental-section',
        eyebrow: 'Advanced',
        title: 'Inspect AI-assisted and mesh experiments',
        detail: 'Keep exploratory control systems isolated at the end.',
        stat: `${midi2DeviceCount} MIDI 2 devices`,
      },
    ],
    [inputPorts.length, outputPorts.length, presetsCount, sessionsCount, routesCount, midi2DeviceCount],
  )

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <MidiHubNodeScopeProvider nodeId={apiNodeId} scopeKey={scopeKey}>
      <div className="midi-hub-page">
        {localNode ? (
          <NodeContextBanner pageKey={NODE_PAGE_KEYS.midiHub} localNode={localNode} topology={topology} />
        ) : null}

        <Layer className="midi-hub-header-surface" id="midi-hub-hero">
          <div className="midi-hub-header">
            <div className="midi-hub-header__left">
              <div className="midi-hub-header__icon" aria-hidden="true">
                <Music size={32} />
              </div>
              <div className="midi-hub-header__copy">
                <h1 className="midi-hub-header__title">MIDI Hub</h1>
                <p className="midi-hub-header__subtitle">
                  Carbon-first operator workspace for routing, monitoring, transport, presets, automation, network MIDI,
                  and MIDI 2.0 on the selected node.
                </p>
                <div className="midi-hub-header__tags">
                  <Tag type={tagTone(inputPorts.length > 0)}>{`Inputs ${inputPorts.length}`}</Tag>
                  <Tag type={tagTone(outputPorts.length > 0)}>{`Outputs ${outputPorts.length}`}</Tag>
                  <Tag type={tagTone(routesCount > 0)}>{`Routes ${routesCount}`}</Tag>
                  <Tag type={tagTone(presetsCount > 0, 'blue')}>{`Presets ${presetsCount}`}</Tag>
                  <Tag type={tagTone(Boolean(clockQuery.data?.running))}>
                    {clockQuery.data?.running ? 'Clock running' : 'Clock stopped'}
                  </Tag>
                  <Tag type={tagTone(sessionsCount > 0, 'blue')}>{`RTP sessions ${sessionsCount}`}</Tag>
                  <Tag type={tagTone(Boolean(midi2Query.data?.enabled) || midi2DeviceCount > 0, 'blue')}>
                    {`MIDI 2 devices ${midi2DeviceCount}`}
                  </Tag>
                </div>
              </div>
            </div>

            <div className="midi-hub-header__actions">
              <Select
                id="midi-hub-preset-recall"
                size="sm"
                labelText="Preset recall"
                value={selectedPresetId}
                onChange={(event) => setSelectedPresetId(event.currentTarget.value)}
              >
                <SelectItem value="" text="Select a preset" />
                {(presetsQuery.data?.presets ?? []).map((preset) => (
                  <SelectItem key={preset.preset_id} value={preset.preset_id} text={preset.name} />
                ))}
              </Select>

              <Button
                size="sm"
                kind="primary"
                disabled={!selectedPresetId}
                onClick={() => quickRecallMutation.mutate(selectedPresetId)}
              >
                Recall preset
              </Button>
            </div>
          </div>

          <div className="midi-hub-header__node-picker">
            <NodeContextPicker pageKey={NODE_PAGE_KEYS.midiHub} topology={topology} />
          </div>

          <div className="midi-hub-workflow-strip" aria-label="MIDI Hub workflow sections">
            {workflowCards.map((card) => (
              <ClickableTile
                key={card.id}
                className="midi-hub-workflow-tile"
                onClick={() => scrollToSection(card.id)}
              >
                <span className="midi-hub-workflow-tile__eyebrow">{card.eyebrow}</span>
                <strong>{card.title}</strong>
                <span>{card.detail}</span>
                <Tag type="cool-gray">{card.stat}</Tag>
              </ClickableTile>
            ))}
          </div>
        </Layer>

        {ports.length === 0 ? (
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title="No MIDI ports detected"
            subtitle="Confirm transport power, cable direction, browser permissions, and network reachability before editing routes or recalling presets."
          />
        ) : null}

        <section className="midi-hub-page-band" id="midi-hub-routing-section">
          <div className="midi-hub-page-band__header">
            <div>
              <h2>Signal path</h2>
              <p>Build the active route first, then confirm live events before moving deeper into automation.</p>
            </div>
            <div className="midi-hub-page-band__tags">
              <Tag type="green">Primary workflow</Tag>
              <Tag type="cool-gray">Basic first</Tag>
            </div>
          </div>

          <div className="midi-hub-primary-grid">
            <MidiHubPanelShell panelId="routing">
              <div className="midi-hub-routing-mode">
                <div className="midi-hub-routing-mode__copy">
                  <h4>{mode === 'matrix' ? 'Port matrix' : 'Patchbay graph'}</h4>
                  <p>
                    {mode === 'matrix'
                      ? 'Use the matrix to create, enable, or inspect source-to-destination routes.'
                      : 'Use the patchbay to inspect topology, fan-out, and route density at a glance.'}
                  </p>
                </div>
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

              {mode === 'matrix' ? <MidiRoutingMatrix /> : <MidiPatchbay />}
              <MidiHubQuickRouterCard />
            </MidiHubPanelShell>

            <MidiHubPanelShell panelId="traffic">
              <MidiTrafficMonitor limit={500} height={440} />
            </MidiHubPanelShell>
          </div>
        </section>

        <section className="midi-hub-page-band" id="midi-hub-show-section">
          <div className="midi-hub-page-band__header">
            <div>
              <h2>Show control</h2>
              <p>Once the route is working, lock in repeatable recall, transport, and capture behavior.</p>
            </div>
            <div className="midi-hub-page-band__tags">
              <Tag type="blue">Presets</Tag>
              <Tag type="green">Transport</Tag>
            </div>
          </div>

          <div className="midi-hub-grid-two">
            <MidiHubPanelShell panelId="presets">
              <MidiHubPresetManager />
            </MidiHubPanelShell>

            <MidiHubPanelShell panelId="clock">
              <MidiClockPanel />
            </MidiHubPanelShell>
          </div>

          <MidiHubPanelShell panelId="recorder">
            <MidiRecorderPanel />
          </MidiHubPanelShell>
        </section>

        <section className="midi-hub-page-band" id="midi-hub-network-section">
          <div className="midi-hub-page-band__header">
            <div>
              <h2>Network and protocol</h2>
              <p>Bring remote sessions, OSC control, and MIDI 2.0 services online after the local path is stable.</p>
            </div>
            <div className="midi-hub-page-band__tags">
              <Tag type="blue">RTP-MIDI</Tag>
              <Tag type="cool-gray">MIDI 2.0</Tag>
            </div>
          </div>

          <div className="midi-hub-grid-two">
            <MidiHubPanelShell panelId="network">
              <MidiNetworkPanel />
            </MidiHubPanelShell>

            <MidiHubPanelShell panelId="midi2">
              <Midi2Panel />
            </MidiHubPanelShell>
          </div>
        </section>

        <section className="midi-hub-page-band" id="midi-hub-processing-section">
          <div className="midi-hub-page-band__header">
            <div>
              <h2>Message processing and automation</h2>
              <p>Apply filtering, mapping, scripting, macros, and scheduled events only after the signal path is verified.</p>
            </div>
            <div className="midi-hub-page-band__tags">
              <Tag type="warm-gray">Advanced</Tag>
              <Tag type="green">Automation</Tag>
            </div>
          </div>

          <div className="midi-hub-grid-two">
            <MidiHubPanelShell panelId="filters">
              <MidiHubFilterPlannerCard />
            </MidiHubPanelShell>

            <MidiHubPanelShell panelId="mapper">
              <MidiHubMapperPlannerCard />
            </MidiHubPanelShell>
          </div>

          <div className="midi-hub-grid-two">
            <MidiHubPanelShell panelId="scripts">
              <MidiScriptEditor />
            </MidiHubPanelShell>

            <MidiHubPanelShell panelId="macros">
              <MidiMacroPanel />
            </MidiHubPanelShell>
          </div>

          <MidiHubPanelShell panelId="scheduler">
            <MidiSchedulerPanel />
          </MidiHubPanelShell>
        </section>

        <section className="midi-hub-page-band" id="midi-hub-experimental-section">
          <div className="midi-hub-page-band__header">
            <div>
              <h2>Advanced and experimental</h2>
              <p>Keep AI-assisted and mesh features isolated from the production signal path and show-state workflows.</p>
            </div>
            <div className="midi-hub-page-band__tags">
              <Tag type="warm-gray">Advanced</Tag>
              <Tag type="cool-gray">Experimental</Tag>
            </div>
          </div>

          <MidiHubPanelShell panelId="innovation">
            <MidiInnovationPanel />
          </MidiHubPanelShell>
        </section>
      </div>
    </MidiHubNodeScopeProvider>
  )
}

export default MidiHubPage
