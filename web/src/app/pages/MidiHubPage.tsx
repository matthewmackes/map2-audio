import { useEffect, useMemo, useState } from 'react'
import {
  Flow,
  Information,
  Launch,
  Music,
  Network_3 as NetworkThree,
  Renew,
  SettingsAdjust,
  TimePlot,
  TrafficFlow,
  WarningAlt,
} from '@carbon/icons-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Accordion,
  AccordionItem,
  Button,
  InlineNotification,
  Layer,
  ProgressIndicator,
  ProgressStep,
  Select,
  SelectItem,
  Tab,
  TabList,
  Tabs,
  Tag,
  Tile,
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
import { MidiHubHelpDrawer, MidiHubPanelShell } from '../components/MidiHub/MidiHubHelpPrimitives'
import {
  MidiHubFilterPlannerCard,
  MidiHubMapperPlannerCard,
  MidiHubOperatorProfileCard,
  MidiHubQuickRouterCard,
  readPorts,
} from '../components/MidiHub/MidiHubWorkbenchCards'
import {
  MIDI_HUB_CAPABILITY_BRIEFS,
  MIDI_HUB_GUIDED_FLOWS,
  MIDI_HUB_PANEL_GUIDANCE,
  MIDI_HUB_TRANSPORT_BRIEFS,
  MIDI_HUB_WIZARD_STEPS,
  type MidiHubFlowStep,
  type MidiHubPanelId,
  type MidiHubValidationKey,
  type MidiHubWizardStep,
} from '../components/MidiHub/midiHubGuidance'
import { useToasts } from '../components/Toasts'
import { midiHubApi } from '../../map2/api'
import './MidiHubPage.css'

const WIZARD_STEP_KEY = 'map2:midi-hub:wizard-step:v2'
const ACTIVE_TAB_KEY = 'map2:midi-hub:active-tab:v2'
const FLOW_MANUAL_STATE_KEY = 'map2:midi-hub:flow-manual:v2'
const SETTINGS_STORAGE_KEY = 'map2:midi-hub:settings:v2'
const LEGACY_SETTINGS_STORAGE_KEY = 'map2:midi-hub-2:settings:v1'

type ManualFlowProgress = Record<string, Record<string, boolean>>
type MidiHubTabId = 'setup' | 'automation' | 'sync' | 'future'

const TAB_ORDER: Array<{ id: MidiHubTabId; label: string }> = [
  { id: 'setup', label: 'Setup & Routing' },
  { id: 'automation', label: 'Filters & Automation' },
  { id: 'sync', label: 'Clock & Diagnostics' },
  { id: 'future', label: 'MIDI 2.0 & Labs' },
]

function readRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {}
  return value as Record<string, unknown>
}

function readNumberField(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}

function stepDone(
  step: MidiHubFlowStep,
  flowId: string,
  validationState: Record<MidiHubValidationKey, boolean>,
  manualProgress: ManualFlowProgress
): boolean {
  if (step.validationKey) {
    return Boolean(validationState[step.validationKey])
  }
  return Boolean(manualProgress[flowId]?.[step.id])
}

function scrollToAnchor(anchorId: string) {
  const target = document.getElementById(anchorId)
  if (!target) return
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function stepValidationState(
  step: MidiHubWizardStep,
  validationState: Record<MidiHubValidationKey, boolean>
): boolean {
  if (!step.validationKeys || step.validationKeys.length === 0) {
    return false
  }
  return step.validationKeys.every((key) => Boolean(validationState[key]))
}

function tagTone(isHealthy: boolean, active: 'green' | 'blue' = 'green'): 'green' | 'blue' | 'warm-gray' {
  return isHealthy ? active : 'warm-gray'
}

export function MidiHubPage() {
  const [mode, setMode] = useState<'matrix' | 'patchbay'>('matrix')
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [helpPanelId, setHelpPanelId] = useState<MidiHubPanelId | null>(null)
  const [wizardIndex, setWizardIndex] = useState(0)
  const [activeTab, setActiveTab] = useState<MidiHubTabId>('setup')
  const [activeFlowId, setActiveFlowId] = useState<string>(MIDI_HUB_GUIDED_FLOWS[0]?.id ?? '')
  const [flowPaused, setFlowPaused] = useState(false)
  const [manualFlowProgress, setManualFlowProgress] = useState<ManualFlowProgress>({})

  const queryClient = useQueryClient()
  const { pushToast } = useToasts()

  const presetsQuery = useQuery({
    queryKey: ['midi-hub', 'presets'],
    queryFn: midiHubApi.listPresets,
    refetchInterval: 3000,
  })

  const statusQuery = useQuery({
    queryKey: ['midi-hub', 'status'],
    queryFn: midiHubApi.getStatus,
    refetchInterval: 3000,
  })

  const routesQuery = useQuery({
    queryKey: ['midi-hub', 'routes'],
    queryFn: midiHubApi.getRoutes,
    refetchInterval: 3000,
  })

  const clockQuery = useQuery({
    queryKey: ['midi-hub', 'clock'],
    queryFn: midiHubApi.getClockStatus,
    refetchInterval: 2500,
  })

  const trafficStatsQuery = useQuery({
    queryKey: ['midi-hub', 'traffic-stats'],
    queryFn: midiHubApi.getTrafficStats,
    refetchInterval: 2500,
  })

  const sessionsQuery = useQuery({
    queryKey: ['midi-hub', 'network-sessions'],
    queryFn: midiHubApi.listNetworkSessions,
    refetchInterval: 5000,
  })

  const midi2Query = useQuery({
    queryKey: ['midi-hub', 'midi2-status'],
    queryFn: midiHubApi.getMidi2Status,
    refetchInterval: 5000,
  })

  useEffect(() => {
    const storedStep = Number.parseInt(window.localStorage.getItem(WIZARD_STEP_KEY) ?? '0', 10)
    if (Number.isFinite(storedStep)) {
      setWizardIndex(clamp(storedStep, 0, Math.max(0, MIDI_HUB_WIZARD_STEPS.length - 1)))
    }

    const storedTab = window.localStorage.getItem(ACTIVE_TAB_KEY)
    if (storedTab && TAB_ORDER.some((tab) => tab.id === storedTab)) {
      setActiveTab(storedTab as MidiHubTabId)
    }

    const rawFlowProgress = window.localStorage.getItem(FLOW_MANUAL_STATE_KEY)
    if (rawFlowProgress) {
      try {
        const parsed = JSON.parse(rawFlowProgress) as ManualFlowProgress
        if (parsed && typeof parsed === 'object') {
          setManualFlowProgress(parsed)
        }
      } catch {
        // Ignore malformed local browser state.
      }
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(WIZARD_STEP_KEY, String(wizardIndex))
  }, [wizardIndex])

  useEffect(() => {
    window.localStorage.setItem(ACTIVE_TAB_KEY, activeTab)
  }, [activeTab])

  useEffect(() => {
    window.localStorage.setItem(FLOW_MANUAL_STATE_KEY, JSON.stringify(manualFlowProgress))
  }, [manualFlowProgress])

  const quickRecallMutation = useMutation({
    mutationFn: async (presetId: string) => midiHubApi.recallPreset(presetId),
    onSuccess: () => {
      pushToast('Preset recalled', 'success')
      void queryClient.invalidateQueries({ queryKey: ['midi-hub'] })
    },
    onError: () => pushToast('Preset recall failed', 'error'),
  })

  const statusRecord = useMemo(() => readRecord(statusQuery.data), [statusQuery.data])
  const trafficStatsRecord = useMemo(() => readRecord(trafficStatsQuery.data), [trafficStatsQuery.data])
  const ports = useMemo(() => readPorts(statusRecord.ports), [statusRecord])

  const validationState = useMemo<Record<MidiHubValidationKey, boolean>>(() => {
    const messagesPerSecond = readNumberField(trafficStatsRecord, 'messages_per_second')
    const capturedTotal = readNumberField(trafficStatsRecord, 'captured_total')
    const midi2DeviceCount = midi2Query.data?.device_count ?? 0
    return {
      has_ports: ports.length > 0,
      has_route: (routesQuery.data?.routes?.length ?? 0) > 0,
      has_preset: (presetsQuery.data?.presets?.length ?? 0) > 0,
      clock_running: Boolean(clockQuery.data?.running),
      traffic_active: messagesPerSecond > 0 || capturedTotal > 0,
      network_session: (sessionsQuery.data?.sessions?.length ?? 0) > 0,
      midi2_ready: Boolean(midi2Query.data?.enabled) || midi2DeviceCount > 0,
    }
  }, [
    clockQuery.data?.running,
    midi2Query.data?.device_count,
    midi2Query.data?.enabled,
    ports.length,
    presetsQuery.data?.presets?.length,
    routesQuery.data?.routes?.length,
    sessionsQuery.data?.sessions?.length,
    trafficStatsRecord,
  ])

  const activeWizardStep = MIDI_HUB_WIZARD_STEPS[wizardIndex] ?? MIDI_HUB_WIZARD_STEPS[0]
  const activeFlow = useMemo(
    () => MIDI_HUB_GUIDED_FLOWS.find((flow) => flow.id === activeFlowId) ?? MIDI_HUB_GUIDED_FLOWS[0] ?? null,
    [activeFlowId]
  )

  const activeFlowCompletedCount = useMemo(() => {
    if (!activeFlow) return 0
    return activeFlow.steps.filter((step) => stepDone(step, activeFlow.id, validationState, manualFlowProgress)).length
  }, [activeFlow, manualFlowProgress, validationState])

  const readinessEntries = useMemo(() => Object.values(validationState), [validationState])
  const flowReadiness = useMemo(() => {
    const complete = readinessEntries.filter(Boolean).length
    return Math.round((complete / Math.max(1, readinessEntries.length)) * 100)
  }, [readinessEntries])

  const wizardValidated = stepValidationState(activeWizardStep, validationState)
  const routesCount = routesQuery.data?.routes?.length ?? 0
  const presetsCount = presetsQuery.data?.presets?.length ?? 0
  const sessionsCount = sessionsQuery.data?.sessions?.length ?? 0
  const midi2DeviceCount = midi2Query.data?.device_count ?? 0

  const nextWizardStep = () => {
    setWizardIndex((value) => clamp(value + 1, 0, Math.max(0, MIDI_HUB_WIZARD_STEPS.length - 1)))
  }

  const previousWizardStep = () => {
    setWizardIndex((value) => clamp(value - 1, 0, Math.max(0, MIDI_HUB_WIZARD_STEPS.length - 1)))
  }

  const restartWizard = () => {
    setWizardIndex(0)
    setActiveFlowId(MIDI_HUB_GUIDED_FLOWS[0]?.id ?? '')
    setFlowPaused(false)
  }

  const beginFlow = (flowId: string) => {
    setActiveFlowId(flowId)
    setFlowPaused(false)
  }

  const toggleManualStep = (flowId: string, stepId: string) => {
    setManualFlowProgress((previous) => ({
      ...previous,
      [flowId]: {
        ...(previous[flowId] ?? {}),
        [stepId]: !(previous[flowId]?.[stepId] ?? false),
      },
    }))
  }

  return (
    <div className="midi-hub-page">
      <Layer className="midi-hub-hero" id="midi-hub-hero">
        <div className="midi-hub-hero__grid">
          <div className="midi-hub-hero__copy">
            <div className="midi-hub-hero__eyebrow">Carbon-guided MIDI services workspace</div>
            <h1>
              <Music size={28} aria-hidden="true" />
              MIDI Hub
            </h1>
            <p className="midi-hub-hero__lede">
              Build one reliable MIDI path first, then add filters, mappings, clock, network sessions, capture, presets,
              and MIDI 2.0 translation in a controlled order. This route now absorbs the useful workflow ideas from
              `midi-hub-2` so setup, automation, and diagnostics live in one operator surface.
            </p>

            <div className="midi-hub-hero__actions">
              <Button size="sm" kind="primary" renderIcon={Launch} onClick={() => scrollToAnchor('midi-hub-workbench')}>
                Open workbench
              </Button>
              <Button size="sm" kind="tertiary" renderIcon={Renew} onClick={restartWizard}>
                Restart wizard
              </Button>
              <Button
                size="sm"
                kind="ghost"
                renderIcon={Information}
                onClick={() => setHelpPanelId(activeWizardStep.relatedPanels[0] ?? 'routing')}
              >
                Step help
              </Button>
            </div>

            <div className="midi-hub-hero__tags">
              <Tag type={tagTone(validationState.has_ports)}>{`Ports ${ports.length}`}</Tag>
              <Tag type={tagTone(validationState.has_route)}>{`Routes ${routesCount}`}</Tag>
              <Tag type={tagTone(validationState.has_preset, 'blue')}>{`Presets ${presetsCount}`}</Tag>
              <Tag type={tagTone(validationState.clock_running)}>{clockQuery.data?.running ? 'Clock live' : 'Clock idle'}</Tag>
              <Tag type={tagTone(validationState.network_session, 'blue')}>{`Sessions ${sessionsCount}`}</Tag>
              <Tag type={tagTone(validationState.midi2_ready, 'blue')}>{`MIDI 2.0 devices ${midi2DeviceCount}`}</Tag>
              <Tag type={flowReadiness >= 70 ? 'green' : 'warm-gray'}>{`Readiness ${flowReadiness}%`}</Tag>
            </div>

            <InlineNotification
              kind={validationState.has_ports ? 'info' : 'warning'}
              lowContrast
              hideCloseButton
              title={validationState.has_ports ? 'Recommended operating pattern' : 'Start with discovery'}
              subtitle={validationState.has_ports
                ? 'MAP2 guidance favors one proven route, one clock master, and explicit capture evidence before you publish presets or MIDI 2.0 posture.'
                : 'No live ports are visible yet. Begin with inventory, endpoint power, transport mode, and browser or network permissions before editing deeper.'}
            />
          </div>

          <div className="midi-hub-hero__rail">
            <Tile className="midi-hub-hero__tile">
              <div className="midi-hub-hero__tile-label">Current wizard step</div>
              <h2>{activeWizardStep.title}</h2>
              <p>{activeWizardStep.description}</p>
              <div className="midi-hub-hero__tile-tags">
                <Tag type={wizardValidated ? 'green' : 'warm-gray'}>
                  {wizardValidated ? 'Validation satisfied' : 'Awaiting evidence'}
                </Tag>
                <Tag type="cool-gray">{activeWizardStep.label}</Tag>
              </div>
              <div className="midi-hub-hero__tile-actions">
                <Button size="sm" kind="ghost" disabled={wizardIndex === 0} onClick={previousWizardStep}>
                  Back
                </Button>
                <Button
                  size="sm"
                  kind="ghost"
                  disabled={wizardIndex === MIDI_HUB_WIZARD_STEPS.length - 1}
                  onClick={nextWizardStep}
                >
                  Next
                </Button>
              </div>
            </Tile>

            <Tile className="midi-hub-hero__tile">
              <div className="midi-hub-hero__tile-label">Why this page is structured this way</div>
              <ul className="midi-hub-bullet-list">
                <li>Start on one transport and one destination before you branch the graph.</li>
                <li>Use traffic evidence before filters, macros, or scripts become permanent.</li>
                <li>Publish only recallable states, not hopeful ones.</li>
              </ul>
            </Tile>
          </div>
        </div>
      </Layer>

      <section className="midi-hub-section">
        <div className="midi-hub-section__header">
          <div>
            <h2>Wizard and guided flows</h2>
            <p>
              The wizard covers the canonical setup order, while the guided flows capture common field tasks such as
              bridging legacy hardware, launching network sessions, and testing MIDI 2.0 translation without losing the
              fallback path.
            </p>
          </div>
        </div>

        <div className="midi-hub-wizard-grid">
          <Layer className="midi-hub-wizard-panel">
            <div className="midi-hub-wizard-panel__header">
              <div>
                <h3>Setup wizard</h3>
                <p>Progress only after each stage is visible and explainable. Carbon-style motion here is deliberate, not decorative.</p>
              </div>
              <Tag type={wizardValidated ? 'green' : 'warm-gray'}>
                {wizardValidated ? 'Current stage validated' : 'Current stage in review'}
              </Tag>
            </div>

            <ProgressIndicator
              currentIndex={wizardIndex}
              onChange={(index) => setWizardIndex(clamp(index, 0, Math.max(0, MIDI_HUB_WIZARD_STEPS.length - 1)))}
              spaceEqually
            >
              {MIDI_HUB_WIZARD_STEPS.map((step, index) => (
                <ProgressStep
                  key={step.id}
                  label={step.label}
                  description={step.title}
                  secondaryLabel={
                    step.validationKeys?.length
                      ? step.validationKeys.every((key) => validationState[key])
                        ? 'Validated'
                        : 'Awaiting validation'
                      : 'Review step'
                  }
                  current={wizardIndex === index}
                  complete={index < wizardIndex || stepValidationState(step, validationState)}
                />
              ))}
            </ProgressIndicator>

            <Tile className="midi-hub-wizard-current">
              <div className="midi-hub-wizard-current__header">
                <div>
                  <div className="midi-hub-wizard-current__eyebrow">{activeWizardStep.label}</div>
                  <h3>{activeWizardStep.title}</h3>
                </div>
                <Tag type={wizardValidated ? 'green' : 'warm-gray'}>
                  {wizardValidated ? 'Evidence present' : 'Needs evidence'}
                </Tag>
              </div>
              <p className="midi-hub-wizard-current__description">{activeWizardStep.description}</p>
              <p className="midi-hub-wizard-current__guidance">{activeWizardStep.guidance}</p>

              <div className="midi-hub-wizard-columns">
                <div className="midi-hub-mini-surface">
                  <h4>Recommendations</h4>
                  <ul className="midi-hub-bullet-list">
                    {activeWizardStep.recommendations.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="midi-hub-mini-surface">
                  <h4>Watch for</h4>
                  <ul className="midi-hub-bullet-list">
                    {activeWizardStep.pitfalls.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <Accordion align="start">
                <AccordionItem title="Motion and review cue">
                  <p className="midi-hub-accordion-copy">{activeWizardStep.motionCue}</p>
                </AccordionItem>
                <AccordionItem title="Jump to related workspaces">
                  <div className="midi-hub-inline-button-row">
                    {activeWizardStep.relatedPanels.map((panelId) => (
                      <Button
                        key={panelId}
                        size="sm"
                        kind="ghost"
                        onClick={() => scrollToAnchor(`midi-hub-panel-${panelId}`)}
                      >
                        {MIDI_HUB_PANEL_GUIDANCE[panelId].title}
                      </Button>
                    ))}
                  </div>
                </AccordionItem>
              </Accordion>
            </Tile>
          </Layer>

          <Layer className="midi-hub-flow-panel" id="midi-hub-guided-flows">
            <div className="midi-hub-flow-panel__header">
              <div>
                <h3>Guided flows</h3>
                <p>Operator playbooks for the most common bridge, sync, and troubleshooting jobs.</p>
              </div>
              <Select
                id="midi-hub-guided-flow-select"
                size="sm"
                labelText="Active guided flow"
                value={activeFlow?.id ?? ''}
                onChange={(event) => beginFlow(event.currentTarget.value)}
              >
                {MIDI_HUB_GUIDED_FLOWS.map((flow) => (
                  <SelectItem key={flow.id} value={flow.id} text={flow.title} />
                ))}
              </Select>
            </div>

            {activeFlow ? (
              <>
                <Tile className="midi-hub-flow-tile">
                  <div className="midi-hub-flow-tile__header">
                    <div>
                      <h4>{activeFlow.title}</h4>
                      <p>{activeFlow.objective}</p>
                    </div>
                    <Tag type={activeFlowCompletedCount === activeFlow.steps.length ? 'green' : 'warm-gray'}>
                      {`${activeFlowCompletedCount}/${activeFlow.steps.length} complete`}
                    </Tag>
                  </div>
                  <InlineNotification
                    kind="warning"
                    lowContrast
                    hideCloseButton
                    title="Risk note"
                    subtitle={activeFlow.riskNote}
                  />
                </Tile>

                {!flowPaused ? (
                  <div className="midi-hub-flow-steps">
                    {activeFlow.steps.map((step, index) => {
                      const complete = stepDone(step, activeFlow.id, validationState, manualFlowProgress)
                      return (
                        <Tile
                          key={step.id}
                          className={`midi-hub-flow-step ${complete ? 'is-complete' : ''}`}
                        >
                          <div className="midi-hub-flow-step__header">
                            <div>
                              <div className="midi-hub-flow-step__eyebrow">{`Step ${index + 1}`}</div>
                              <h5>{step.title}</h5>
                            </div>
                            <Tag type={complete ? 'green' : 'warm-gray'}>
                              {complete ? 'Complete' : 'Pending'}
                            </Tag>
                          </div>
                          <p>{step.instruction}</p>
                          <p className="midi-hub-flow-step__success">{step.successCriteria}</p>
                          <div className="midi-hub-inline-button-row">
                            <Button
                              size="sm"
                              kind="ghost"
                              onClick={() => scrollToAnchor(`midi-hub-panel-${step.panel}`)}
                            >
                              Go to workspace
                            </Button>
                            <Button
                              size="sm"
                              kind="ghost"
                              onClick={() => setHelpPanelId(step.panel)}
                            >
                              Open help
                            </Button>
                            {step.validationKey ? (
                              <Tag type={validationState[step.validationKey] ? 'green' : 'warm-gray'}>
                                {validationState[step.validationKey] ? 'Validation OK' : 'Awaiting validation'}
                              </Tag>
                            ) : (
                              <Button
                                size="sm"
                                kind={complete ? 'secondary' : 'tertiary'}
                                onClick={() => toggleManualStep(activeFlow.id, step.id)}
                              >
                                {complete ? 'Marked complete' : 'Mark complete'}
                              </Button>
                            )}
                          </div>
                        </Tile>
                      )
                    })}
                  </div>
                ) : (
                  <InlineNotification
                    kind="info"
                    lowContrast
                    hideCloseButton
                    title="Flow paused"
                    subtitle="Resume when you are ready to continue from the same step state."
                  />
                )}

                <div className="midi-hub-inline-button-row">
                  <Button size="sm" kind="tertiary" onClick={() => setFlowPaused((value) => !value)}>
                    {flowPaused ? 'Resume flow' : 'Pause flow'}
                  </Button>
                  <Button
                    size="sm"
                    kind="ghost"
                    onClick={() => {
                      setManualFlowProgress((previous) => ({ ...previous, [activeFlow.id]: {} }))
                    }}
                  >
                    Clear manual checks
                  </Button>
                </div>
              </>
            ) : null}
          </Layer>
        </div>
      </section>

      <section className="midi-hub-section">
        <div className="midi-hub-section__header">
          <div>
            <h2>Modern transport patterns</h2>
            <p>
              The page recommendations synthesize official Web MIDI, Apple network/Bluetooth MIDI, IBM motion guidance,
              and MIDI Association MIDI 2.0 material into one setup order that respects legacy gear and future-facing rigs.
            </p>
          </div>
        </div>

        <div className="midi-hub-transport-grid">
          {MIDI_HUB_TRANSPORT_BRIEFS.map((transport) => (
            <Tile key={transport.id} className="midi-hub-transport-card">
              <div className="midi-hub-transport-card__header">
                <h3>{transport.title}</h3>
                <Tag type="cool-gray">{transport.interfaces.join(' / ')}</Tag>
              </div>
              <p>{transport.summary}</p>
              <div className="midi-hub-transport-card__section">
                <h4>Best for</h4>
                <p>{transport.bestFor}</p>
              </div>
              <div className="midi-hub-transport-card__section">
                <h4>Watch for</h4>
                <p>{transport.watchFor}</p>
              </div>
              <div className="midi-hub-transport-card__section">
                <h4>MAP2 recommendation</h4>
                <p>{transport.mapRecommendation}</p>
              </div>
            </Tile>
          ))}
        </div>
      </section>

      <section className="midi-hub-section">
        <div className="midi-hub-section__header">
          <div>
            <h2>Capability coverage</h2>
            <p>
              These grouped capabilities reflect the page remit: MIDI 1.0 compatibility, MIDI 2.0 transition planning,
              modern transports, transformation, clocking, diagnostics, and automation in one operator surface.
            </p>
          </div>
        </div>

        <div className="midi-hub-capability-grid">
          {MIDI_HUB_CAPABILITY_BRIEFS.map((capability) => (
            <Tile key={capability.id} className="midi-hub-capability-card">
              <h3>{capability.title}</h3>
              <p>{capability.summary}</p>
              <ul className="midi-hub-bullet-list">
                {capability.highlights.map((highlight) => (
                  <li key={highlight}>{highlight}</li>
                ))}
              </ul>
            </Tile>
          ))}
        </div>
      </section>

      <section className="midi-hub-section" id="midi-hub-workbench">
        <div className="midi-hub-section__header">
          <div>
            <h2>Unified workbench</h2>
            <p>
              `/midi-hub` is now the canonical surface for routing, presets, filters, mapper blueprints, clock, network,
              capture, and future-readiness tooling. The older `/midi-hub-2` split is retired after this merge.
            </p>
          </div>
          <div className="midi-hub-workbench-toolbar">
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
              kind="tertiary"
              disabled={!selectedPresetId}
              onClick={() => quickRecallMutation.mutate(selectedPresetId)}
            >
              Recall preset
            </Button>
          </div>
        </div>

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
            <MidiHubPanelShell panelId="routing" onOpenHelp={setHelpPanelId}>
              <div className="midi-hub-routing-toolbar">
                <div className="midi-hub-routing-toolbar__copy">
                  <h4>{mode === 'matrix' ? 'Routing matrix' : 'Patchbay topology'}</h4>
                  <p>
                    {mode === 'matrix'
                      ? 'Use matrix mode to establish or correct the first deterministic route.'
                      : 'Use patchbay mode to reason about fanout, merge behavior, and topology at a glance.'}
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
              <MidiHubPanelShell panelId="network" onOpenHelp={setHelpPanelId}>
                <MidiNetworkPanel />
              </MidiHubPanelShell>

              <MidiHubPanelShell panelId="settings" onOpenHelp={setHelpPanelId}>
                <MidiHubOperatorProfileCard
                  storageKey={SETTINGS_STORAGE_KEY}
                  legacyStorageKey={LEGACY_SETTINGS_STORAGE_KEY}
                />
              </MidiHubPanelShell>
            </div>

            <MidiHubPanelShell panelId="presets" onOpenHelp={setHelpPanelId}>
              <MidiHubPresetManager />
            </MidiHubPanelShell>
          </div>
        ) : null}

        {activeTab === 'automation' ? (
          <div className="midi-hub-tab-panel">
            <div className="midi-hub-grid-two">
              <MidiHubPanelShell panelId="filters" onOpenHelp={setHelpPanelId}>
                <MidiHubFilterPlannerCard />
              </MidiHubPanelShell>

              <MidiHubPanelShell panelId="mapper" onOpenHelp={setHelpPanelId}>
                <MidiHubMapperPlannerCard />
              </MidiHubPanelShell>
            </div>

            <div className="midi-hub-grid-two">
              <MidiHubPanelShell panelId="scripts" onOpenHelp={setHelpPanelId}>
                <MidiScriptEditor />
              </MidiHubPanelShell>

              <MidiHubPanelShell panelId="macros" onOpenHelp={setHelpPanelId}>
                <MidiMacroPanel />
              </MidiHubPanelShell>
            </div>

            <MidiHubPanelShell panelId="scheduler" onOpenHelp={setHelpPanelId}>
              <MidiSchedulerPanel />
            </MidiHubPanelShell>
          </div>
        ) : null}

        {activeTab === 'sync' ? (
          <div className="midi-hub-tab-panel">
            <div className="midi-hub-grid-two">
              <MidiHubPanelShell panelId="clock" onOpenHelp={setHelpPanelId}>
                <MidiClockPanel />
              </MidiHubPanelShell>

              <MidiHubPanelShell panelId="traffic" onOpenHelp={setHelpPanelId}>
                <MidiTrafficMonitor />
              </MidiHubPanelShell>
            </div>

            <MidiHubPanelShell panelId="recorder" onOpenHelp={setHelpPanelId}>
              <MidiRecorderPanel />
            </MidiHubPanelShell>
          </div>
        ) : null}

        {activeTab === 'future' ? (
          <div className="midi-hub-tab-panel">
            <InlineNotification
              kind="info"
              lowContrast
              hideCloseButton
              title="Advance intentionally"
              subtitle="These tools are for deliberate capability discovery and controlled experiments after the baseline route, clock, and preset posture are already stable."
            />

            <div className="midi-hub-grid-two">
              <MidiHubPanelShell panelId="midi2" onOpenHelp={setHelpPanelId}>
                <Midi2Panel />
              </MidiHubPanelShell>

              <MidiHubPanelShell panelId="innovation" onOpenHelp={setHelpPanelId}>
                <MidiInnovationPanel />
              </MidiHubPanelShell>
            </div>
          </div>
        ) : null}
      </section>

      <MidiHubHelpDrawer
        panelId={helpPanelId}
        open={Boolean(helpPanelId)}
        onClose={() => setHelpPanelId(null)}
      />
    </div>
  )
}
