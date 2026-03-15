import { useEffect, useMemo, useState } from 'react'
import { Music } from '@carbon/icons-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Accordion,
  AccordionItem,
  Button,
  InlineNotification,
  Layer,
  Select,
  SelectItem,
  Tab,
  TabList,
  Tabs,
  Tag,
} from '@carbon/react'
import { MidiRoutingMatrix } from '../components/MidiHub/MidiRoutingMatrix'
import { MidiPatchbay } from '../components/MidiHub/MidiPatchbay'
import { MidiTrafficMonitor } from '../components/MidiHub/MidiTrafficMonitor'
import { MidiHubPresetManager } from '../components/MidiHub/MidiHubPresetManager'
import { MidiScriptEditor } from '../components/MidiHub/MidiScriptEditor'
import { MidiClockPanel } from '../components/MidiHub/MidiClockPanel'
import { MidiNetworkPanel } from '../components/MidiHub/MidiNetworkPanel'
import { Midi2Panel } from '../components/MidiHub/Midi2Panel'
import { MidiMacroPanel } from '../components/MidiHub/MidiMacroPanel'
import { MidiRecorderPanel } from '../components/MidiHub/MidiRecorderPanel'
import { MidiSchedulerPanel } from '../components/MidiHub/MidiSchedulerPanel'
import { MidiInnovationPanel } from '../components/MidiHub/MidiInnovationPanel'
import { MidiHubPanelShell } from '../components/MidiHub/MidiHubHelpPrimitives'
import { MidiHubNodeScopeProvider } from '../components/MidiHub/MidiHubNodeScope'
import {
  MidiHubFilterPlannerCard,
  MidiHubMapperPlannerCard,
  MidiHubQuickRouterCard,
  readPorts,
} from '../components/MidiHub/MidiHubWorkbenchCards'
import { NodeContextBanner } from '../components/NodeContextBanner/NodeContextBanner'
import { NodeContextPicker } from '../components/NodeContextPicker/NodeContextPicker'
import { useToasts } from '../components/Toasts'
import { midiHubApi } from '../../map2/api'
import { useNodePageContext } from '../hooks/useNodePageContext'
import { NODE_PAGE_KEYS } from '../utils/nodeDisplay'
import './MidiHubPage.css'

const ACTIVE_TAB_KEY = 'map2:midi-hub:active-tab:v2'

type MidiHubTabId = 'setup' | 'automation' | 'sync' | 'future'

const TAB_ORDER: Array<{ id: MidiHubTabId; label: string }> = [
  { id: 'setup', label: 'Setup & Routing' },
  { id: 'automation', label: 'Filters & Automation' },
  { id: 'sync', label: 'Clock & Diagnostics' },
  { id: 'future', label: 'MIDI 2.0 & Labs' },
]

const ABOUT_MIDI_HUB_COPY =
  'MIDI Hub brings USB, DIN, BLE, Web MIDI, RTP-MIDI, OSC bridging, presets, clocking, capture, filtering, mapping, scripts, macros, and early MIDI 2.0 posture into one operator surface. Use Setup & Routing to prove ingress and egress, Filters & Automation to narrow or transform traffic deliberately, Clock & Diagnostics to validate sync and evidence, and MIDI 2.0 & Labs to inspect UMP readiness and future-facing workflows without disturbing the production route.'

function readRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {}
  return value as Record<string, unknown>
}

function tagTone(isHealthy: boolean, active: 'green' | 'blue' = 'green'): 'green' | 'blue' | 'warm-gray' {
  return isHealthy ? active : 'warm-gray'
}

export function MidiHubPage() {
  const [mode, setMode] = useState<'matrix' | 'patchbay'>('matrix')
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [activeTab, setActiveTab] = useState<MidiHubTabId>('setup')
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

  useEffect(() => {
    const storedTab = window.localStorage.getItem(ACTIVE_TAB_KEY)
    if (storedTab && TAB_ORDER.some((tab) => tab.id === storedTab)) {
      setActiveTab(storedTab as MidiHubTabId)
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(ACTIVE_TAB_KEY, activeTab)
  }, [activeTab])

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
  const routesCount = routesQuery.data?.routes?.length ?? 0
  const presetsCount = presetsQuery.data?.presets?.length ?? 0
  const sessionsCount = sessionsQuery.data?.sessions?.length ?? 0
  const midi2DeviceCount = midi2Query.data?.device_count ?? 0

  return (
    <MidiHubNodeScopeProvider nodeId={apiNodeId} scopeKey={scopeKey}>
      <div className="midi-hub-page">
        {localNode ? (
          <NodeContextBanner pageKey={NODE_PAGE_KEYS.midiHub} localNode={localNode} topology={topology} />
        ) : null}
        <Layer className="midi-hub-hero" id="midi-hub-hero">
        <div className="midi-hub-hero__grid">
          <div className="midi-hub-hero__copy">
            <h1>
              <Music size={28} aria-hidden="true" />
              MIDI Hub
            </h1>

            <div className="midi-hub-hero__tags">
              <Tag type={tagTone(ports.length > 0)}>{`Ports ${ports.length}`}</Tag>
              <Tag type={tagTone(routesCount > 0)}>{`Routes ${routesCount}`}</Tag>
              <Tag type={tagTone(presetsCount > 0, 'blue')}>{`Presets ${presetsCount}`}</Tag>
              <Tag type={tagTone(Boolean(clockQuery.data?.running))}>
                {clockQuery.data?.running ? 'Clock live' : 'Clock idle'}
              </Tag>
              <Tag type={tagTone(sessionsCount > 0, 'blue')}>{`Sessions ${sessionsCount}`}</Tag>
              <Tag type={tagTone(Boolean(midi2Query.data?.enabled) || midi2DeviceCount > 0, 'blue')}>
                {`MIDI 2.0 devices ${midi2DeviceCount}`}
              </Tag>
            </div>

            <NodeContextPicker pageKey={NODE_PAGE_KEYS.midiHub} topology={topology} />
          </div>

          <div className="midi-hub-hero__actions">
            <Select
              id="midi-hub-quick-recall"
              size="sm"
              labelText="Quick preset recall"
              value={selectedPresetId}
              onChange={(event) => setSelectedPresetId(event.currentTarget.value)}
            >
              <SelectItem value="" text="Quick preset recall" />
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
        </Layer>

        {ports.length === 0 ? (
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title="No MIDI ports detected"
            subtitle="Verify transport power, cable direction, browser permission, and session reachability before editing routes or publishing presets."
          />
        ) : null}

        <Layer className="midi-hub-tabs-layer">
          <Tabs
            selectedIndex={Math.max(0, TAB_ORDER.findIndex((tab) => tab.id === activeTab))}
            onChange={({ selectedIndex }) => setActiveTab(TAB_ORDER[selectedIndex]?.id ?? 'setup')}
          >
            <TabList aria-label="MIDI Hub workbench sections" contained>
              {TAB_ORDER.map((tab) => (
                <Tab key={tab.id}>{tab.label}</Tab>
              ))}
            </TabList>
          </Tabs>
        </Layer>

        {activeTab === 'setup' ? (
          <div className="midi-hub-tab-panel">
            <MidiHubPanelShell panelId="routing">
              <div className="midi-hub-routing-toolbar">
                <div className="midi-hub-routing-toolbar__copy">
                  <h4>{mode === 'matrix' ? 'Routing matrix' : 'Patchbay topology'}</h4>
                  <p>
                    {mode === 'matrix'
                      ? 'Use matrix mode to establish or correct the first deterministic route.'
                      : 'Use patchbay mode to inspect fanout, merge behavior, and topology at a glance.'}
                  </p>
                </div>

                <div className="midi-hub-inline-button-row">
                  <Button size="sm" kind={mode === 'matrix' ? 'primary' : 'tertiary'} onClick={() => setMode('matrix')}>
                    Matrix
                  </Button>
                  <Button size="sm" kind={mode === 'patchbay' ? 'primary' : 'tertiary'} onClick={() => setMode('patchbay')}>
                    Patchbay
                  </Button>
                </div>
              </div>

              {mode === 'matrix' ? <MidiRoutingMatrix /> : <MidiPatchbay />}
              <MidiHubQuickRouterCard />
            </MidiHubPanelShell>

            <div className="midi-hub-grid-two">
              <MidiHubPanelShell panelId="network">
                <MidiNetworkPanel />
              </MidiHubPanelShell>

              <MidiHubPanelShell panelId="presets">
                <MidiHubPresetManager />
              </MidiHubPanelShell>
            </div>
          </div>
        ) : null}

        {activeTab === 'automation' ? (
          <div className="midi-hub-tab-panel">
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
          </div>
        ) : null}

        {activeTab === 'sync' ? (
          <div className="midi-hub-tab-panel">
            <div className="midi-hub-grid-two">
              <MidiHubPanelShell panelId="clock">
                <MidiClockPanel />
              </MidiHubPanelShell>

              <MidiHubPanelShell panelId="traffic">
                <MidiTrafficMonitor />
              </MidiHubPanelShell>
            </div>

            <MidiHubPanelShell panelId="recorder">
              <MidiRecorderPanel />
            </MidiHubPanelShell>
          </div>
        ) : null}

        {activeTab === 'future' ? (
          <div className="midi-hub-tab-panel">
            <div className="midi-hub-grid-two">
              <MidiHubPanelShell panelId="midi2">
                <Midi2Panel />
              </MidiHubPanelShell>

              <MidiHubPanelShell panelId="innovation">
                <MidiInnovationPanel />
              </MidiHubPanelShell>
            </div>
          </div>
        ) : null}

        <Layer className="midi-hub-section">
          <Accordion align="start">
            <AccordionItem title="About MIDI Hub">
              <p className="midi-hub-accordion-copy">{ABOUT_MIDI_HUB_COPY}</p>
            </AccordionItem>
          </Accordion>
        </Layer>
      </div>
    </MidiHubNodeScopeProvider>
  )
}

export default MidiHubPage
