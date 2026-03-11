import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpenText, Compass, MusicNoteSimple } from '@phosphor-icons/react'
import { Alert, Button, Chip, LinearProgress, MenuItem, Select } from '@mui/material'
import { PageHeader } from '../components/PageHeader'
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
  MIDI_HUB_GUIDED_FLOWS,
  MIDI_HUB_ONBOARDING_STEPS,
  type MidiHubFlowStep,
  type MidiHubPanelId,
  type MidiHubValidationKey,
} from '../components/MidiHub/midiHubGuidance'
import { useToasts } from '../components/Toasts'
import { midiHubApi } from '../../map2/api'
import './MidiHubPage.css'

const ONBOARDING_DONE_KEY = 'map2:midiHub:onboarding:done:v1'
const ONBOARDING_STEP_KEY = 'map2:midiHub:onboarding:step:v1'
const FLOW_MANUAL_STATE_KEY = 'map2:midiHub:flow:manual:v1'

type ManualFlowProgress = Record<string, Record<string, boolean>>

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

export function MidiHubPage() {
  const [mode, setMode] = useState<'matrix' | 'patchbay'>('matrix')
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [helpPanelId, setHelpPanelId] = useState<MidiHubPanelId | null>(null)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [onboardingIndex, setOnboardingIndex] = useState(0)
  const [onboardingCompleted, setOnboardingCompleted] = useState(false)
  const [activeFlowId, setActiveFlowId] = useState<string | null>(MIDI_HUB_GUIDED_FLOWS[0]?.id ?? null)
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

  useEffect(() => {
    const done = window.localStorage.getItem(ONBOARDING_DONE_KEY) === '1'
    setOnboardingCompleted(done)

    const storedStep = Number.parseInt(window.localStorage.getItem(ONBOARDING_STEP_KEY) ?? '0', 10)
    if (Number.isFinite(storedStep)) {
      setOnboardingIndex(clamp(storedStep, 0, Math.max(0, MIDI_HUB_ONBOARDING_STEPS.length - 1)))
    }

    const rawFlowProgress = window.localStorage.getItem(FLOW_MANUAL_STATE_KEY)
    if (rawFlowProgress) {
      try {
        const parsed = JSON.parse(rawFlowProgress) as ManualFlowProgress
        if (parsed && typeof parsed === 'object') {
          setManualFlowProgress(parsed)
        }
      } catch {
        // Keep defaults when parsing fails.
      }
    }

    if (!done) {
      setOnboardingOpen(true)
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(ONBOARDING_STEP_KEY, String(onboardingIndex))
  }, [onboardingIndex])

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

  const ports = useMemo(() => {
    const raw = statusRecord.ports
    return Array.isArray(raw) ? raw : []
  }, [statusRecord])

  const validationState = useMemo<Record<MidiHubValidationKey, boolean>>(() => {
    const messagesPerSecond = readNumberField(trafficStatsRecord, 'messages_per_second')
    const capturedTotal = readNumberField(trafficStatsRecord, 'captured_total')
    return {
      has_ports: ports.length > 0,
      has_route: (routesQuery.data?.routes?.length ?? 0) > 0,
      has_preset: (presetsQuery.data?.presets?.length ?? 0) > 0,
      clock_running: Boolean(clockQuery.data?.running),
      traffic_active: messagesPerSecond > 0 || capturedTotal > 0,
      network_session: (sessionsQuery.data?.sessions?.length ?? 0) > 0,
    }
  }, [clockQuery.data?.running, ports.length, presetsQuery.data?.presets?.length, routesQuery.data?.routes?.length, sessionsQuery.data?.sessions?.length, trafficStatsRecord])

  const currentOnboardingStep = MIDI_HUB_ONBOARDING_STEPS[onboardingIndex] ?? null

  const activeFlow = useMemo(
    () => MIDI_HUB_GUIDED_FLOWS.find((flow) => flow.id === activeFlowId) ?? null,
    [activeFlowId]
  )

  const activeFlowCompletedCount = useMemo(() => {
    if (!activeFlow) return 0
    return activeFlow.steps.filter((step) => stepDone(step, activeFlow.id, validationState, manualFlowProgress)).length
  }, [activeFlow, manualFlowProgress, validationState])

  const beginFlow = (flowId: string) => {
    setActiveFlowId(flowId)
    setFlowPaused(false)
  }

  const cancelFlow = () => {
    setFlowPaused(false)
    setActiveFlowId(null)
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

  const completeOnboarding = () => {
    setOnboardingOpen(false)
    setOnboardingCompleted(true)
    window.localStorage.setItem(ONBOARDING_DONE_KEY, '1')
  }

  const restartOnboarding = () => {
    setOnboardingIndex(0)
    setOnboardingOpen(true)
    setOnboardingCompleted(false)
    window.localStorage.removeItem(ONBOARDING_DONE_KEY)
  }

  const nextOnboardingStep = () => {
    if (onboardingIndex >= MIDI_HUB_ONBOARDING_STEPS.length - 1) {
      completeOnboarding()
      return
    }
    setOnboardingIndex((value) => clamp(value + 1, 0, MIDI_HUB_ONBOARDING_STEPS.length - 1))
  }

  const previousOnboardingStep = () => {
    setOnboardingIndex((value) => clamp(value - 1, 0, MIDI_HUB_ONBOARDING_STEPS.length - 1))
  }

  const flowReadiness = useMemo(() => {
    const entries = Object.entries(validationState)
    const complete = entries.filter(([, isReady]) => isReady).length
    return Math.round((complete / entries.length) * 100)
  }, [validationState])

  return (
    <div className="stack midi-hub-page" style={{ gap: 18 }}>
      <PageHeader
        title="MIDI Hub"
        subtitle="Guided routing, automation, and diagnostics with first-run help and task flows."
        icon={<MusicNoteSimple size={32} weight="duotone" style={{ color: '#34d399' }} />}
        actions={(
          <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
            {onboardingOpen ? (
              <Button size="small" variant="outlined" onClick={() => setOnboardingOpen(false)}>
                Pause Tour
              </Button>
            ) : (
              <Button size="small" variant="outlined" onClick={() => setOnboardingOpen(true)}>
                Resume Tour
              </Button>
            )}
            <Button size="small" variant="outlined" onClick={restartOnboarding}>
              Restart Tour
            </Button>
            <Button
              size="small"
              variant="contained"
              startIcon={<BookOpenText size={16} weight="duotone" />}
              onClick={() => setHelpPanelId('routing')}
            >
              Open Routing Guide
            </Button>
          </div>
        )}
      />

      <section id="midi-hub-hero" className="card midi-hub-hero">
        <div className="midi-hub-hero__header">
          <div className="stack" style={{ gap: 8 }}>
            <h2>MIDI Hub Operator Workspace</h2>
            <p className="subtitle" style={{ marginTop: 0 }}>
              Start with routing health, then follow step-based flows for setup, recall, sync, and troubleshooting.
            </p>
          </div>
          <div className="midi-hub-hero__quick-actions">
            <Button size="small" variant="contained" startIcon={<Compass size={16} weight="duotone" />} onClick={() => beginFlow('connect_device')}>
              Connect Device Flow
            </Button>
            <Button size="small" variant="outlined" onClick={() => beginFlow('save_and_recall')}>
              Save + Recall Flow
            </Button>
            <Button size="small" variant="outlined" onClick={() => beginFlow('troubleshoot_no_signal')}>
              No-Signal Triage
            </Button>
          </div>
        </div>

        <div className="midi-hub-hero__chips">
          <Chip size="small" label={`Ports: ${ports.length}`} />
          <Chip size="small" label={`Routes: ${routesQuery.data?.routes?.length ?? 0}`} />
          <Chip size="small" label={`Presets: ${presetsQuery.data?.presets?.length ?? 0}`} />
          <Chip size="small" label={`Clock: ${clockQuery.data?.running ? 'Running' : 'Stopped'}`} color={clockQuery.data?.running ? 'success' : 'default'} />
          <Chip size="small" label={`Network sessions: ${sessionsQuery.data?.sessions?.length ?? 0}`} />
          <Chip size="small" label={`Guided readiness: ${flowReadiness}%`} color={flowReadiness >= 66 ? 'success' : 'warning'} />
        </div>

        {!onboardingCompleted ? (
          <Alert severity="info" className="midi-hub-hero__alert">
            First-run onboarding is active for this browser profile. Use "Resume Tour" at any time.
          </Alert>
        ) : null}
      </section>

      <section id="midi-hub-task-flows" className="card midi-hub-flow-card">
        <div className="midi-hub-flow-card__header">
          <div className="stack" style={{ gap: 6 }}>
            <h3 style={{ marginTop: 0 }}>Guided Task Flows</h3>
            <p className="subtitle" style={{ marginTop: 0 }}>
              Step-based workflows with success criteria and live validation signals.
            </p>
          </div>
          <Select
            size="small"
            value={activeFlowId ?? ''}
            displayEmpty
            onChange={(event) => beginFlow(String(event.target.value))}
            style={{ minWidth: 260 }}
          >
            {MIDI_HUB_GUIDED_FLOWS.map((flow) => (
              <MenuItem key={flow.id} value={flow.id}>
                {flow.title}
              </MenuItem>
            ))}
          </Select>
        </div>

        {activeFlow ? (
          <>
            <div className="midi-hub-flow-card__meta">
              <p className="subtitle" style={{ marginTop: 0 }}>{activeFlow.objective}</p>
              <Alert severity="warning" sx={{ marginTop: 1, marginBottom: 1 }}>
                {activeFlow.riskNote}
              </Alert>
              <LinearProgress
                variant="determinate"
                value={(activeFlowCompletedCount / Math.max(1, activeFlow.steps.length)) * 100}
                sx={{ height: 8, borderRadius: 999 }}
              />
              <div className="flex" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <Chip size="small" label={`Progress ${activeFlowCompletedCount}/${activeFlow.steps.length}`} color={activeFlowCompletedCount === activeFlow.steps.length ? 'success' : 'default'} />
                <Chip size="small" label={flowPaused ? 'Flow paused' : 'Flow active'} color={flowPaused ? 'warning' : 'success'} />
              </div>
            </div>

            {!flowPaused ? (
              <div className="stack" style={{ gap: 10 }}>
                {activeFlow.steps.map((step, index) => {
                  const complete = stepDone(step, activeFlow.id, validationState, manualFlowProgress)
                  return (
                    <div key={step.id} className={`midi-hub-flow-step ${complete ? 'is-complete' : ''}`}>
                      <div className="midi-hub-flow-step__header">
                        <div className="stack" style={{ gap: 3 }}>
                          <strong>{index + 1}. {step.title}</strong>
                          <span>{step.instruction}</span>
                          <small>{step.successCriteria}</small>
                        </div>
                        <Chip size="small" label={complete ? 'Complete' : 'Pending'} color={complete ? 'success' : 'default'} />
                      </div>
                      <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
                        <Button size="small" variant="outlined" onClick={() => scrollToAnchor(`midi-hub-panel-${step.panel}`)}>
                          Go to Panel
                        </Button>
                        {step.validationKey ? (
                          <Chip
                            size="small"
                            color={validationState[step.validationKey] ? 'success' : 'warning'}
                            label={validationState[step.validationKey] ? 'Validation OK' : 'Awaiting validation'}
                          />
                        ) : (
                          <Button
                            size="small"
                            variant={complete ? 'contained' : 'outlined'}
                            onClick={() => toggleManualStep(activeFlow.id, step.id)}
                          >
                            {complete ? 'Marked complete' : 'Mark complete'}
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <Alert severity="info">Flow is paused. Resume when you are ready to continue from the same step state.</Alert>
            )}

            <div className="flex" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <Button size="small" variant="outlined" onClick={() => setFlowPaused((value) => !value)}>
                {flowPaused ? 'Resume' : 'Pause'} Flow
              </Button>
              <Button size="small" color="warning" variant="outlined" onClick={cancelFlow}>
                Cancel Flow
              </Button>
            </div>
          </>
        ) : (
          <Alert severity="info">Select a guided flow to begin.</Alert>
        )}
      </section>

      <section id="midi-hub-setup-section" className="midi-hub-family-section">
        <header className="midi-hub-family-section__header">
          <h3 style={{ marginTop: 0 }}>Setup & Connectivity</h3>
          <p className="subtitle" style={{ marginTop: 0 }}>
            Establish ports, routes, presets, and network sessions before deeper automation.
          </p>
        </header>

        <div id="midi-hub-routing">
          <MidiHubPanelShell panelId="routing" onOpenHelp={setHelpPanelId}>
            <div className="midi-hub-routing-toolbar">
              <div>
                <h4 style={{ marginTop: 0 }}>{mode === 'matrix' ? 'Routing Matrix' : 'Patchbay Topology'}</h4>
                <p className="subtitle" style={{ marginTop: 0 }}>
                  {mode === 'matrix'
                    ? 'Matrix mode is best for first-route setup and deterministic edits.'
                    : 'Patchbay mode is best for topology and traffic heatmap inspection.'}
                </p>
              </div>
              <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
                <Button size="small" variant={mode === 'matrix' ? 'contained' : 'outlined'} onClick={() => setMode('matrix')}>
                  Matrix
                </Button>
                <Button size="small" variant={mode === 'patchbay' ? 'contained' : 'outlined'} onClick={() => setMode('patchbay')}>
                  Patchbay
                </Button>
                <Select
                  size="small"
                  value={selectedPresetId}
                  displayEmpty
                  onChange={(event) => setSelectedPresetId(String(event.target.value))}
                  style={{ minWidth: 240 }}
                >
                  <MenuItem value="">Quick preset recall</MenuItem>
                  {(presetsQuery.data?.presets ?? []).map((preset) => (
                    <MenuItem key={preset.preset_id} value={preset.preset_id}>
                      {preset.name}
                    </MenuItem>
                  ))}
                </Select>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={!selectedPresetId}
                  onClick={() => quickRecallMutation.mutate(selectedPresetId)}
                >
                  Recall
                </Button>
              </div>
            </div>
            {mode === 'matrix' ? <MidiRoutingMatrix /> : <MidiPatchbay />}
          </MidiHubPanelShell>
        </div>

        <div className="grid two" style={{ gap: 12 }}>
          <MidiHubPanelShell panelId="presets" onOpenHelp={setHelpPanelId}>
            <MidiHubPresetManager />
          </MidiHubPanelShell>

          <MidiHubPanelShell panelId="network" onOpenHelp={setHelpPanelId}>
            <MidiNetworkPanel />
          </MidiHubPanelShell>
        </div>
      </section>

      <section id="midi-hub-control-section" className="midi-hub-family-section">
        <header className="midi-hub-family-section__header">
          <h3 style={{ marginTop: 0 }}>Control & Automation</h3>
          <p className="subtitle" style={{ marginTop: 0 }}>
            Add scripts, macros, schedules, and clocking after base connectivity is healthy.
          </p>
        </header>

        <div className="grid two" style={{ gap: 12 }}>
          <MidiHubPanelShell panelId="scripts" onOpenHelp={setHelpPanelId}>
            <MidiScriptEditor />
          </MidiHubPanelShell>

          <MidiHubPanelShell panelId="macros" onOpenHelp={setHelpPanelId}>
            <MidiMacroPanel />
          </MidiHubPanelShell>
        </div>

        <div className="grid two" style={{ gap: 12 }}>
          <MidiHubPanelShell panelId="scheduler" onOpenHelp={setHelpPanelId}>
            <MidiSchedulerPanel />
          </MidiHubPanelShell>

          <MidiHubPanelShell panelId="clock" onOpenHelp={setHelpPanelId}>
            <MidiClockPanel />
          </MidiHubPanelShell>
        </div>
      </section>

      <section id="midi-hub-capture-section" className="midi-hub-family-section">
        <header className="midi-hub-family-section__header">
          <h3 style={{ marginTop: 0 }}>Capture & Analysis</h3>
          <p className="subtitle" style={{ marginTop: 0 }}>
            Record and inspect real traffic to validate behavior and generate evidence.
          </p>
        </header>

        <div className="grid two" style={{ gap: 12 }}>
          <MidiHubPanelShell panelId="recorder" onOpenHelp={setHelpPanelId}>
            <MidiRecorderPanel />
          </MidiHubPanelShell>

          <MidiHubPanelShell panelId="traffic" onOpenHelp={setHelpPanelId}>
            <MidiTrafficMonitor />
          </MidiHubPanelShell>
        </div>
      </section>

      <section id="midi-hub-advanced-section" className="midi-hub-family-section">
        <header className="midi-hub-family-section__header">
          <h3 style={{ marginTop: 0 }}>Advanced & Experimental</h3>
          <p className="subtitle" style={{ marginTop: 0 }}>
            Use under controlled conditions with rollback plans; these surfaces are intentionally marked advanced.
          </p>
        </header>

        <div className="grid two" style={{ gap: 12 }}>
          <MidiHubPanelShell panelId="midi2" onOpenHelp={setHelpPanelId}>
            <Midi2Panel />
          </MidiHubPanelShell>

          <MidiHubPanelShell panelId="innovation" onOpenHelp={setHelpPanelId}>
            <MidiInnovationPanel />
          </MidiHubPanelShell>
        </div>
      </section>

      {onboardingOpen && currentOnboardingStep ? (
        <div className="midi-hub-tour-overlay" role="dialog" aria-modal="true" aria-label="MIDI Hub onboarding">
          <div className="stack" style={{ gap: 10 }}>
            <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>Onboarding {onboardingIndex + 1}/{MIDI_HUB_ONBOARDING_STEPS.length}</strong>
              <Button size="small" variant="outlined" onClick={() => setOnboardingOpen(false)}>
                Pause
              </Button>
            </div>
            <h4 style={{ marginTop: 0 }}>{currentOnboardingStep.title}</h4>
            <p className="subtitle" style={{ marginTop: 0 }}>{currentOnboardingStep.detail}</p>
            <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Button size="small" variant="outlined" onClick={() => scrollToAnchor(currentOnboardingStep.anchorId)}>
                Focus Section
              </Button>
              <Button size="small" variant="outlined" disabled={onboardingIndex === 0} onClick={previousOnboardingStep}>
                Back
              </Button>
              <Button size="small" variant="contained" onClick={nextOnboardingStep}>
                {onboardingIndex === MIDI_HUB_ONBOARDING_STEPS.length - 1 ? 'Finish Tour' : 'Next'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <MidiHubHelpDrawer
        panelId={helpPanelId}
        open={Boolean(helpPanelId)}
        onClose={() => setHelpPanelId(null)}
      />
    </div>
  )
}
