import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Launch, Music, PauseFilled, PlayFilled, Reset } from '@carbon/icons-react'
import { Button, InlineLoading, InlineNotification, Tag, Tile } from '@carbon/react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { PageHeader } from '@/app/components/PageHeader'
import { useBrainRuntimeStateSync } from '@/app/hooks/useBrainRuntimeState'
import {
  brainApi,
  type BrainControllerQualification,
  type BrainDiagnostics,
  type BrainLayer,
  type BrainSlot,
  type BrainState,
  type BrainTransportState,
  type PluginRuntimeScopeOptions,
} from '@/map2/api'
import { parseBrainImportSource } from './brainHandoff'
import './PerformanceBrainPage.css'

const SECTION_DEFS = [
  { id: 'overview', label: 'Overview', eyebrow: 'System posture' },
  { id: 'perform', label: 'Perform', eyebrow: 'Live control' },
  { id: 'layers', label: 'Layers', eyebrow: 'Scenes and splits' },
  { id: 'sequence', label: 'Sequence', eyebrow: 'Patterns and song' },
  { id: 'routing', label: 'Routing', eyebrow: 'Buses and master' },
  { id: 'inputs', label: 'Inputs', eyebrow: 'Zones and triggers' },
  { id: 'library', label: 'Library', eyebrow: 'Assets and import' },
  { id: 'diagnostics', label: 'Diagnostics', eyebrow: 'Latency and health' },
] as const

type SectionId = (typeof SECTION_DEFS)[number]['id']

function parseSectionSearchParam(value: string | null): SectionId | undefined {
  return SECTION_DEFS.some((section) => section.id === value) ? (value as SectionId) : undefined
}

function parseNumericSearchParam(value: string | null): number | undefined {
  if (value == null || value.trim() === '') {
    return undefined
  }
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

function formatPercent(value: number, scale = 1): string {
  return `${Math.round(value * scale)}%`
}

function buildScope(searchParams: URLSearchParams): PluginRuntimeScopeOptions {
  return {
    instanceId: parseNumericSearchParam(searchParams.get('instance_id')),
    pluginPosition: parseNumericSearchParam(searchParams.get('plugin_position')),
  }
}

function summaryForSlot(slot: BrainSlot | undefined): string {
  if (!slot) {
    return 'No slot selected'
  }
  return `${slot.mode} • bus ${slot.output_bus + 1} • ${slot.asset_type}`
}

function qualificationTagType(ready: boolean): 'green' | 'red' {
  return ready ? 'green' : 'red'
}

function uniqueItems(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function QualificationStrip({ qualification }: { qualification: BrainControllerQualification }) {
  const areas = [
    { key: 'keyboard', label: 'Keyboard', telemetry: qualification.keyboard },
    { key: 'triggers', label: 'Triggers', telemetry: qualification.triggers },
    { key: 'sequence', label: 'Sequence', telemetry: qualification.sequence },
    { key: 'routing', label: 'Routing', telemetry: qualification.routing },
  ] as const

  return (
    <div className="brain-page__qualification-grid">
      {areas.map((area) => (
        <Tile key={area.key} className="brain-page__summary-card brain-page__qualification-card">
          <div className="brain-page__qualification-header">
            <span className="brain-page__summary-eyebrow">{area.label}</span>
            <Tag type={qualificationTagType(area.telemetry.ready)}>
              {area.telemetry.ready ? 'Ready' : 'Attention'}
            </Tag>
          </div>
          <strong>{area.telemetry.summary}</strong>
          <span>{area.telemetry.issues[0] ?? 'Qualified for the current scoped workflow.'}</span>
        </Tile>
      ))}
    </div>
  )
}

function OverviewCards({
  state,
  diagnostics,
  transport,
}: {
  state: BrainState
  diagnostics: BrainDiagnostics
  transport: BrainTransportState
}) {
  return (
    <div className="brain-page__overview-grid">
      <Tile className="brain-page__summary-card">
        <span className="brain-page__summary-eyebrow">Realtime posture</span>
        <strong>{transport.is_playing ? 'Transport running' : 'Transport stopped'}</strong>
        <span>{diagnostics.buffer_size_samples} samples @ {diagnostics.sample_rate_hz / 1000} kHz</span>
      </Tile>
      <Tile className="brain-page__summary-card">
        <span className="brain-page__summary-eyebrow">Voice budget</span>
        <strong>{diagnostics.active_voices} active / {diagnostics.peak_voices} peak</strong>
        <span>{diagnostics.polyphony_headroom} voices headroom</span>
      </Tile>
      <Tile className="brain-page__summary-card">
        <span className="brain-page__summary-eyebrow">Sequence focus</span>
        <strong>Pattern {transport.pattern + 1} · Var {transport.variation}</strong>
        <span>Switch quantization: {transport.switch_quantization_beats} beats</span>
      </Tile>
      <Tile className="brain-page__summary-card">
        <span className="brain-page__summary-eyebrow">Snapshot authority</span>
        <strong>{state.snapshot_integration.authority_model}</strong>
        <span>{state.snapshot_integration.committed_state_id}</span>
      </Tile>
      <Tile className="brain-page__summary-card">
        <span className="brain-page__summary-eyebrow">Controller readiness</span>
        <strong>{diagnostics.controller_qualification.summary}</strong>
        <span>{diagnostics.controller_qualification.scoped_instance_key}</span>
      </Tile>
      <Tile className="brain-page__summary-card">
        <span className="brain-page__summary-eyebrow">Keyboard posture</span>
        <strong>{diagnostics.controller_qualification.keyboard.summary}</strong>
        <span>{diagnostics.controller_qualification.keyboard.aftertouch_modes.join(', ') || 'No aftertouch mode'}</span>
      </Tile>
      <Tile className="brain-page__summary-card">
        <span className="brain-page__summary-eyebrow">Trigger posture</span>
        <strong>{diagnostics.controller_qualification.triggers.summary}</strong>
        <span>{diagnostics.controller_qualification.triggers.fastest_scan_time_ms.toFixed(1)} ms fastest scan</span>
      </Tile>
      <Tile className="brain-page__summary-card">
        <span className="brain-page__summary-eyebrow">Routing posture</span>
        <strong>{diagnostics.controller_qualification.routing.summary}</strong>
        <span>{diagnostics.controller_qualification.sequence.summary}</span>
      </Tile>
    </div>
  )
}

export function PerformanceBrainPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const scope = useMemo(() => buildScope(searchParams), [searchParams])
  const routeSection = useMemo(() => parseSectionSearchParam(searchParams.get('section')), [searchParams])
  const importSource = useMemo(() => parseBrainImportSource(searchParams.get('import_source')), [searchParams])
  const scopeKey = `${scope.instanceId ?? 'workspace'}:${scope.pluginPosition ?? 'none'}`
  const autoImportRequestRef = useRef<string | null>(null)

  useBrainRuntimeStateSync(scope, scopeKey)

  const stateQuery = useQuery({
    queryKey: ['brain', 'state', scopeKey],
    queryFn: () => brainApi.getState(scope),
    staleTime: 500,
  })
  const transportQuery = useQuery({
    queryKey: ['brain', 'transport', scopeKey],
    queryFn: () => brainApi.getTransport(scope),
    staleTime: 500,
  })
  const slotsQuery = useQuery({
    queryKey: ['brain', 'slots', scopeKey],
    queryFn: () => brainApi.getSlots(scope),
    staleTime: 2_000,
  })
  const layersQuery = useQuery({
    queryKey: ['brain', 'layers', scopeKey],
    queryFn: () => brainApi.getLayers(scope),
    staleTime: 2_000,
  })
  const sequenceQuery = useQuery({
    queryKey: ['brain', 'sequence', scopeKey],
    queryFn: () => brainApi.getSequence(scope),
    staleTime: 2_000,
  })
  const mixerQuery = useQuery({
    queryKey: ['brain', 'mixer', scopeKey],
    queryFn: () => brainApi.getMixer(scope),
    staleTime: 2_000,
  })
  const inputsQuery = useQuery({
    queryKey: ['brain', 'inputs', scopeKey],
    queryFn: () => brainApi.getInputs(scope),
    staleTime: 2_000,
  })
  const libraryQuery = useQuery({
    queryKey: ['brain', 'library', scopeKey],
    queryFn: () => brainApi.getLibrary(scope),
    staleTime: 5_000,
  })
  const diagnosticsQuery = useQuery({
    queryKey: ['brain', 'diagnostics', scopeKey],
    queryFn: () => brainApi.getDiagnostics(scope),
    staleTime: 1_000,
  })

  const [setNameDraft, setSetNameDraft] = useState('')

  const stateMutation = useMutation({
    mutationFn: (patch: Parameters<typeof brainApi.updateState>[0]) => brainApi.updateState(patch, scope),
    onSuccess: (state) => {
      queryClient.setQueryData(['brain', 'state', scopeKey], state)
      setSetNameDraft(state.set_name)
    },
  })
  const transportMutation = useMutation({
    mutationFn: (patch: Parameters<typeof brainApi.setTransport>[0]) => brainApi.setTransport(patch, scope),
    onSuccess: (transport) => {
      queryClient.setQueryData(['brain', 'transport', scopeKey], transport)
      void queryClient.invalidateQueries({ queryKey: ['brain', 'state', scopeKey] })
      void queryClient.invalidateQueries({ queryKey: ['brain', 'diagnostics', scopeKey] })
    },
  })
  const slotMutation = useMutation({
    mutationFn: ({ slotId, patch }: { slotId: number; patch: Parameters<typeof brainApi.updateSlot>[1] }) =>
      brainApi.updateSlot(slotId, patch, scope),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['brain', 'slots', scopeKey] })
      void queryClient.invalidateQueries({ queryKey: ['brain', 'state', scopeKey] })
      void queryClient.invalidateQueries({ queryKey: ['brain', 'sample-editor', scopeKey] })
    },
  })
  const importDrumsMutation = useMutation({
    mutationFn: () => brainApi.importFromDrums(scope),
    onSuccess: (state) => {
      queryClient.setQueryData(['brain', 'state', scopeKey], state)
      void queryClient.invalidateQueries({ queryKey: ['brain'] })
    },
  })
  const importSynthForgeMutation = useMutation({
    mutationFn: () => brainApi.importFromSynthForge(scope),
    onSuccess: (state) => {
      queryClient.setQueryData(['brain', 'state', scopeKey], state)
      void queryClient.invalidateQueries({ queryKey: ['brain'] })
    },
  })

  useEffect(() => {
    if (!stateQuery.data) {
      return
    }
    setSetNameDraft(stateQuery.data.set_name)
  }, [stateQuery.data])

  useEffect(() => {
    if (!stateQuery.data) {
      return
    }
    const normalizedSection = routeSection ?? stateQuery.data.active_section
    if (searchParams.get('section') === normalizedSection) {
      return
    }
    const nextSearchParams = new URLSearchParams(searchParams)
    nextSearchParams.set('section', normalizedSection)
    setSearchParams(nextSearchParams, { replace: true })
  }, [routeSection, searchParams, setSearchParams, stateQuery.data])

  useEffect(() => {
    if (!importSource) {
      autoImportRequestRef.current = null
      return
    }

    const requestKey = `${scopeKey}:${importSource}`
    if (autoImportRequestRef.current === requestKey) {
      return
    }
    autoImportRequestRef.current = requestKey

    const clearImportSourceSearchParam = () => {
      const nextSearchParams = new URLSearchParams(searchParams)
      nextSearchParams.delete('import_source')
      setSearchParams(nextSearchParams, { replace: true })
    }
    const resetAutoImportRequest = () => {
      autoImportRequestRef.current = null
    }

    if (importSource === 'drums') {
      importDrumsMutation.mutate(undefined, {
        onSuccess: clearImportSourceSearchParam,
        onError: resetAutoImportRequest,
      })
      return
    }

    importSynthForgeMutation.mutate(undefined, {
      onSuccess: clearImportSourceSearchParam,
      onError: resetAutoImportRequest,
    })
  }, [importDrumsMutation, importSource, importSynthForgeMutation, scopeKey, searchParams, setSearchParams])

  const state = stateQuery.data
  const transport = transportQuery.data
  const slots = slotsQuery.data
  const layers = layersQuery.data?.layers
  const sequence = sequenceQuery.data
  const mixer = mixerQuery.data
  const inputs = inputsQuery.data
  const library = libraryQuery.data
  const diagnostics = diagnosticsQuery.data

  if (stateQuery.isLoading || transportQuery.isLoading || slotsQuery.isLoading || diagnosticsQuery.isLoading) {
    return (
      <section className="brain-page brain-page--loading">
        <InlineLoading status="active" description="Loading Performance Brain workspace" />
      </section>
    )
  }

  if (!state || !transport || !slots || !layers || !sequence || !mixer || !inputs || !library || !diagnostics) {
    return (
      <section className="brain-page">
        <InlineNotification
          lowContrast
          kind="error"
          hideCloseButton
          title="Performance Brain unavailable"
          subtitle="The routed workspace could not load its backend state."
        />
      </section>
    )
  }

  const activeSection = routeSection ?? state.active_section
  const activeSlot = slots[state.active_slot]
  const activeLayer = layers.find((layer) => layer.layer_id === state.active_layer_id)
  const qualification = diagnostics.controller_qualification
  const controllerAlerts = uniqueItems([...diagnostics.warnings, ...qualification.issues])

  const handleSectionChange = (sectionId: SectionId) => {
    if (searchParams.get('section') !== sectionId) {
      const nextSearchParams = new URLSearchParams(searchParams)
      nextSearchParams.set('section', sectionId)
      setSearchParams(nextSearchParams)
    }
    if (state.active_section !== sectionId) {
      stateMutation.mutate({ active_section: sectionId })
    }
  }

  const handleSetNameCommit = () => {
    const trimmed = setNameDraft.trim()
    if (!trimmed || trimmed === state.set_name) {
      setSetNameDraft(state.set_name)
      return
    }
    stateMutation.mutate({ set_name: trimmed })
  }

  const handleSlotSelect = (slotId: number) => {
    stateMutation.mutate({ active_slot: slotId })
  }

  return (
    <section className="brain-page">
      <PageHeader
        title="Performance Brain"
        subtitle="Unified drum-and-sequencer brain with keyboard layers, trigger nuance, routing, diagnostics, and snapshot-first workflow."
        icon={<Music size={24} />}
        actions={(
          <div className="brain-page__header-actions">
            <Button kind="ghost" size="sm" renderIcon={Reset} onClick={() => handleSectionChange('overview')}>
              Focus Overview
            </Button>
            <Button kind="secondary" size="sm" renderIcon={ArrowLeft} onClick={() => navigate('/juce-grid')}>
              Back to Audio Grid
            </Button>
          </div>
        )}
      />

      <div className="brain-page__shell">
        <aside className="brain-page__rail" aria-label="Performance Brain section navigation">
          <div className="brain-page__rail-header">
            <span className="brain-page__rail-title">Performance Brain</span>
            <span className="brain-page__rail-meta">
              {scope.instanceId != null ? `Instance ${scope.instanceId}` : 'Workspace'}
            </span>
          </div>
          {SECTION_DEFS.map((section) => (
            <button
              key={section.id}
              type="button"
              className={`brain-page__rail-button${activeSection === section.id ? ' brain-page__rail-button--active' : ''}`}
              aria-current={activeSection === section.id ? 'page' : undefined}
              onClick={() => handleSectionChange(section.id)}
            >
              <span className="brain-page__rail-eyebrow">{section.eyebrow}</span>
              <strong>{section.label}</strong>
            </button>
          ))}
        </aside>

        <div className="brain-page__main">
          <OverviewCards state={state} diagnostics={diagnostics} transport={transport} />

          <section className="brain-page__toolbar">
            <div className="brain-page__toolbar-block">
              <span className="brain-page__toolbar-label">Set</span>
              <input
                className="brain-page__text-input"
                aria-label="Performance Brain set name"
                value={setNameDraft}
                onChange={(event) => setSetNameDraft(event.target.value)}
                onBlur={handleSetNameCommit}
              />
            </div>
            <div className="brain-page__toolbar-block">
              <span className="brain-page__toolbar-label">Active slot</span>
              <Tag type="cool-gray">{activeSlot ? `${activeSlot.slot_id + 1}: ${activeSlot.name}` : 'None'}</Tag>
            </div>
            <div className="brain-page__toolbar-block">
              <span className="brain-page__toolbar-label">Layer</span>
              <Tag type="green">{activeLayer?.name ?? state.active_layer_id}</Tag>
            </div>
            <div className="brain-page__toolbar-block">
              <span className="brain-page__toolbar-label">Latency</span>
              <Tag type={diagnostics.xruns > 0 ? 'red' : 'green'}>
                {diagnostics.trigger_latency_ms.toFixed(1)} ms trigger
              </Tag>
            </div>
          </section>

          {activeSection === 'overview' ? (
            <div className="brain-page__section-grid">
              <QualificationStrip qualification={qualification} />

              <Tile className="brain-page__panel">
                <span className="brain-page__panel-title">Why this brain</span>
                <p className="brain-page__panel-copy">
                  The replacement product separates by workflow speed, routing, trigger nuance, and instant layer control.
                  Legacy `/drums` and `/synth-forge` remain live during migration, but this surface is the new command center.
                </p>
                <div className="brain-page__button-row">
                  <Button
                    size="sm"
                    renderIcon={Launch}
                    onClick={() => importDrumsMutation.mutate()}
                    disabled={importDrumsMutation.isPending}
                  >
                    Import Drum Machine
                  </Button>
                  <Button
                    size="sm"
                    kind="secondary"
                    renderIcon={Launch}
                    onClick={() => importSynthForgeMutation.mutate()}
                    disabled={importSynthForgeMutation.isPending}
                  >
                    Import SynthForge
                  </Button>
                </div>
              </Tile>

              <Tile className="brain-page__panel">
                <span className="brain-page__panel-title">Focused slot</span>
                <strong>{activeSlot?.name}</strong>
                <span>{summaryForSlot(activeSlot)}</span>
                <div className="brain-page__slot-strip">
                  {slots.slice(0, 8).map((slot) => (
                    <button
                      key={slot.slot_id}
                      type="button"
                      className={`brain-page__slot-pill${slot.slot_id === state.active_slot ? ' brain-page__slot-pill--active' : ''}`}
                      onClick={() => handleSlotSelect(slot.slot_id)}
                    >
                      {slot.slot_id + 1}
                    </button>
                  ))}
                </div>
              </Tile>

              <Tile className="brain-page__panel">
                <span className="brain-page__panel-title">Qualification posture</span>
                <div className="brain-page__qualification-header">
                  <strong>{qualification.summary}</strong>
                  <Tag type={qualificationTagType(qualification.controller_ready)}>
                    {qualification.controller_ready ? 'Qualified' : 'Needs attention'}
                  </Tag>
                </div>
                <span>{diagnostics.roundtrip_latency_ms.toFixed(1)} ms roundtrip · {diagnostics.cpu_load_percent.toFixed(1)}% CPU · scope {qualification.scoped_instance_key}</span>
                <ul className="brain-page__flat-list">
                  <li>{qualification.scope_binding_ready ? 'Authority IDs are bound to this scoped Brain instance.' : 'Authority IDs are drifting away from the scoped Brain instance.'}</li>
                  <li>{qualification.tier_a_runtime_locked ? 'Tier A runtime locks are currently preserved.' : 'Tier A runtime locks are outside the current qualification window.'}</li>
                  <li>{controllerAlerts[0] ?? 'No open controller qualification issues.'}</li>
                </ul>
              </Tile>
            </div>
          ) : null}

          {activeSection === 'perform' ? (
            <div className="brain-page__section-grid">
              <Tile className="brain-page__panel">
                <span className="brain-page__panel-title">Transport</span>
                <div className="brain-page__perform-controls">
                  <Button
                    size="sm"
                    renderIcon={transport.is_playing ? PauseFilled : PlayFilled}
                    kind={transport.is_playing ? 'danger' : 'primary'}
                    onClick={() => transportMutation.mutate({ is_playing: !transport.is_playing })}
                  >
                    {transport.is_playing ? 'Stop' : 'Play'}
                  </Button>
                  <Button
                    size="sm"
                    kind="ghost"
                    onClick={() => transportMutation.mutate({ pending_pattern: transport.pattern + 1 })}
                  >
                    Queue Next Pattern
                  </Button>
                </div>
                <div className="brain-page__metric-row">
                  <span>BPM</span>
                  <input
                    className="brain-page__number-input"
                    type="number"
                    min={40}
                    max={300}
                    value={transport.bpm}
                    onChange={(event) => transportMutation.mutate({ bpm: Number(event.target.value) })}
                  />
                </div>
                <div className="brain-page__metric-row">
                  <span>Swing</span>
                  <input
                    className="brain-page__number-input"
                    type="number"
                    min={0}
                    max={100}
                    value={transport.swing}
                    onChange={(event) => transportMutation.mutate({ swing: Number(event.target.value) })}
                  />
                </div>
              </Tile>

              <Tile className="brain-page__panel">
                <span className="brain-page__panel-title">Instant layer control</span>
                <ul className="brain-page__flat-list">
                  {layers.map((layer) => (
                    <li key={layer.layer_id}>
                      <strong>{layer.name}</strong> · slots {layer.slot_indices.map((value) => value + 1).join(', ')} · poly {layer.polyphony}
                    </li>
                  ))}
                </ul>
              </Tile>

              <Tile className="brain-page__panel">
                <span className="brain-page__panel-title">Quick slot gain</span>
                <div className="brain-page__slot-grid">
                  {slots.map((slot) => (
                    <button
                      key={slot.slot_id}
                      type="button"
                      className="brain-page__slot-card"
                      onClick={() => slotMutation.mutate({ slotId: slot.slot_id, patch: { level: Math.max(0, Math.min(1, slot.level - 0.05)) } })}
                    >
                      <span>{slot.name}</span>
                      <strong>{formatPercent(slot.level, 100)}</strong>
                    </button>
                  ))}
                </div>
              </Tile>
            </div>
          ) : null}

          {activeSection === 'layers' ? (
            <div className="brain-page__section-grid">
              <Tile className="brain-page__panel">
                <span className="brain-page__panel-title">Layer map</span>
                <table className="brain-page__table">
                  <thead>
                    <tr>
                      <th>Layer</th>
                      <th>Slots</th>
                      <th>Key range</th>
                      <th>Scene</th>
                      <th>Poly</th>
                    </tr>
                  </thead>
                  <tbody>
                    {layers.map((layer: BrainLayer) => (
                      <tr key={layer.layer_id}>
                        <td>{layer.name}</td>
                        <td>{layer.slot_indices.map((value) => value + 1).join(', ')}</td>
                        <td>{layer.key_low}-{layer.key_high}</td>
                        <td>{layer.scene_slot + 1}</td>
                        <td>{layer.polyphony}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Tile>
              <Tile className="brain-page__panel">
                <span className="brain-page__panel-title">Keyboard zones</span>
                <ul className="brain-page__flat-list">
                  {inputs.keyboard_zones.map((zone) => (
                    <li key={zone.zone_id}>
                      <strong>{zone.name}</strong> · ch {zone.midi_channel} · keys {zone.key_low}-{zone.key_high} · transpose {zone.transpose}
                    </li>
                  ))}
                </ul>
              </Tile>
            </div>
          ) : null}

          {activeSection === 'sequence' ? (
            <div className="brain-page__section-grid">
              <Tile className="brain-page__panel">
                <span className="brain-page__panel-title">Pattern bank</span>
                <table className="brain-page__table">
                  <thead>
                    <tr>
                      <th>Pattern</th>
                      <th>Name</th>
                      <th>Length</th>
                      <th>Lanes</th>
                      <th>Fill</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sequence.patterns.map((pattern) => (
                      <tr key={pattern.pattern_id}>
                        <td>{pattern.pattern_id + 1}</td>
                        <td>{pattern.name}</td>
                        <td>{pattern.length}</td>
                        <td>{pattern.active_lane_count}</td>
                        <td>{pattern.fill_enabled ? 'Yes' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Tile>
              <Tile className="brain-page__panel">
                <span className="brain-page__panel-title">Lane summaries</span>
                <ul className="brain-page__flat-list">
                  {sequence.lanes.map((lane) => (
                    <li key={lane.slot_id}>
                      <strong>{lane.name}</strong> · {lane.active_steps} steps · swing {lane.swing} · locks {lane.step_lock_targets.join(', ') || 'none'}
                    </li>
                  ))}
                </ul>
              </Tile>
            </div>
          ) : null}

          {activeSection === 'routing' ? (
            <div className="brain-page__section-grid">
              <Tile className="brain-page__panel">
                <span className="brain-page__panel-title">Bus matrix</span>
                <table className="brain-page__table">
                  <thead>
                    <tr>
                      <th>Bus</th>
                      <th>Level</th>
                      <th>Pan</th>
                      <th>Out</th>
                      <th>Send</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mixer.buses.map((bus) => (
                      <tr key={bus.bus_id}>
                        <td>{bus.name}</td>
                        <td>{formatPercent(bus.level, 100)}</td>
                        <td>{Math.round(bus.pan * 100)}</td>
                        <td>{bus.output_pair + 1}</td>
                        <td>{formatPercent(bus.reverb_send, 100)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Tile>
              <Tile className="brain-page__panel">
                <span className="brain-page__panel-title">Master section</span>
                <ul className="brain-page__flat-list">
                  <li>Volume: {formatPercent(mixer.master.master_volume, 100)}</li>
                  <li>Drive: {mixer.master.drive_db.toFixed(1)} dB</li>
                  <li>Compressor: {formatPercent(mixer.master.compressor_amount, 100)}</li>
                  <li>Reverb mix: {formatPercent(mixer.master.reverb_mix, 100)}</li>
                  <li>Limiter ceiling: {mixer.master.limiter_ceiling_db.toFixed(1)} dB</li>
                </ul>
              </Tile>
            </div>
          ) : null}

          {activeSection === 'inputs' ? (
            <div className="brain-page__section-grid">
              <Tile className="brain-page__panel">
                <span className="brain-page__panel-title">Scoped controller qualification</span>
                <div className="brain-page__qualification-header">
                  <strong>{qualification.summary}</strong>
                  <Tag type={qualificationTagType(qualification.controller_ready)}>
                    {qualification.ready_surface_count}/4 ready
                  </Tag>
                </div>
                <ul className="brain-page__flat-list">
                  <li><strong>Scope key</strong> · {qualification.scoped_instance_key}</li>
                  <li><strong>Keyboard</strong> · {qualification.keyboard.summary}</li>
                  <li><strong>Triggers</strong> · {qualification.triggers.summary}</li>
                  <li><strong>Routing</strong> · {qualification.routing.summary}</li>
                </ul>
              </Tile>
              <Tile className="brain-page__panel">
                <span className="brain-page__panel-title">Trigger nuance</span>
                <ul className="brain-page__flat-list">
                  {inputs.trigger_profiles.map((profile) => (
                    <li key={profile.profile_id}>
                      <strong>{profile.name}</strong> · pads {profile.pad_range_start + 1}-{profile.pad_range_end + 1} · scan {profile.scan_time_ms} ms · mask {profile.mask_time_ms} ms
                    </li>
                  ))}
                </ul>
              </Tile>
              <Tile className="brain-page__panel">
                <span className="brain-page__panel-title">Controller assignments</span>
                <ul className="brain-page__flat-list">
                  {inputs.controller_assignments.map((assignment) => (
                    <li key={`${assignment.source}-${assignment.target}`}>
                      <strong>{assignment.source}</strong> → {assignment.target}
                    </li>
                  ))}
                </ul>
                <span className="brain-page__panel-copy">
                  Keyboard aftertouch: {qualification.keyboard.aftertouch_modes.join(', ') || 'none'}.
                  Trigger scan floor: {qualification.triggers.fastest_scan_time_ms.toFixed(1)} ms.
                </span>
              </Tile>
            </div>
          ) : null}

          {activeSection === 'library' ? (
            <div className="brain-page__section-grid">
              {library.collections.map((collection) => (
                <Tile key={collection.collection_id} className="brain-page__panel">
                  <span className="brain-page__panel-title">{collection.label}</span>
                  <span className="brain-page__panel-copy">{collection.asset_count} assets</span>
                  <ul className="brain-page__flat-list">
                    {collection.assets.slice(0, 6).map((asset) => (
                      <li key={asset.asset_id}>
                        <strong>{asset.name}</strong> · {asset.asset_type} · {asset.source}
                      </li>
                    ))}
                  </ul>
                </Tile>
              ))}
            </div>
          ) : null}

          {activeSection === 'diagnostics' ? (
            <div className="brain-page__section-grid">
              <Tile className="brain-page__panel">
                <span className="brain-page__panel-title">Realtime metrics</span>
                <ul className="brain-page__flat-list">
                  <li>CPU: {diagnostics.cpu_load_percent.toFixed(1)}%</li>
                  <li>Trigger latency: {diagnostics.trigger_latency_ms.toFixed(1)} ms</li>
                  <li>Roundtrip latency: {diagnostics.roundtrip_latency_ms.toFixed(1)} ms</li>
                  <li>XRuns: {diagnostics.xruns}</li>
                  <li>Backend: {diagnostics.backend_mode}</li>
                </ul>
              </Tile>
              <Tile className="brain-page__panel">
                <span className="brain-page__panel-title">Controller qualification</span>
                <div className="brain-page__qualification-header">
                  <strong>{qualification.summary}</strong>
                  <Tag type={qualificationTagType(qualification.controller_ready)}>
                    {qualification.controller_ready ? 'Qualified' : 'Investigate'}
                  </Tag>
                </div>
                <ul className="brain-page__flat-list">
                  <li><strong>Scope binding</strong> · {qualification.scope_binding_ready ? 'ready' : 'drifting'}</li>
                  <li><strong>Tier A lock</strong> · {qualification.tier_a_runtime_locked ? 'preserved' : 'outside target'}</li>
                  <li><strong>Keyboard</strong> · {qualification.keyboard.summary}</li>
                  <li><strong>Triggers</strong> · {qualification.triggers.summary}</li>
                  <li><strong>Sequence</strong> · {qualification.sequence.summary}</li>
                  <li><strong>Routing</strong> · {qualification.routing.summary}</li>
                </ul>
              </Tile>
              <Tile className="brain-page__panel">
                <span className="brain-page__panel-title">Warnings & open issues</span>
                <ul className="brain-page__flat-list">
                  {(controllerAlerts.length > 0 ? controllerAlerts : ['No active warnings']).map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </Tile>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

export default PerformanceBrainPage
