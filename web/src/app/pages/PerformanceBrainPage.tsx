import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  ArrowLeft,
  Book,
  Catalog,
  Categories,
  ConnectionSignal,
  DataStructured,
  Document,
  Flow,
  Launch,
  Music,
  PauseFilled,
  Play,
  PlayFilled,
  Reset,
} from '@carbon/icons-react'
import { Button, InlineLoading, InlineNotification, Tag, Tile } from '@carbon/react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { UnifiedWorkspaceSideNav, type UnifiedWorkspaceSideNavItem } from '@/app/components/navigation/UnifiedWorkspaceSideNav'
import { useSetShellWindow } from '@/app/layout/useSetShellWindow'
import { useBrainRuntimeStateSync } from '@/app/hooks/useBrainRuntimeState'
import {
  brainApi,
  drumsApi,
  type BrainControllerQualification,
  type BrainDiagnostics,
  type BrainLayer,
  type BrainSlot,
  type BrainState,
  type BrainTransportState,
  type PluginRuntimeScopeOptions,
} from '@/map2/api'
import type { DrumBackingTrackSummary, DrumBackingTrackTransportState, DrumPack } from '@/map2/types'
import { parseBrainImportSource } from './brainHandoff'
import { BrainOverviewShell } from './brainViews/BrainOverviewShell'
import './PerformanceBrainPage.css'

type SectionId =
  | 'overview'
  | 'perform'
  | 'layers'
  | 'sequence'
  | 'routing'
  | 'inputs'
  | 'library'
  | 'session_media'
  | 'practice_coach'
  | 'diagnostics'

interface BrainSectionDef {
  id: SectionId
  label: string
  eyebrow: string
  icon: ComponentType<any>
  description: string
  variant?: UnifiedWorkspaceSideNavItem['variant']
}

const SECTION_DEFS: readonly BrainSectionDef[] = [
  { id: 'overview', label: 'Overview', eyebrow: 'System posture', icon: DataStructured, description: 'Scope summary, qualification posture, and migration framing.' },
  { id: 'perform', label: 'Perform', eyebrow: 'Live control', icon: Play, description: 'Transport, slot focus, and immediate live control.' },
  { id: 'layers', label: 'Layers', eyebrow: 'Scenes and splits', icon: Categories, description: 'Keyboard layers, slot assignments, and split posture.' },
  { id: 'sequence', label: 'Sequence', eyebrow: 'Patterns and song', icon: Flow, description: 'Pattern, variation, and sequence authoring controls.' },
  { id: 'routing', label: 'Routing', eyebrow: 'Buses and master', icon: ConnectionSignal, description: 'Bus, mix, and routed output control.' },
  { id: 'inputs', label: 'Inputs', eyebrow: 'Zones and triggers', icon: Music, description: 'Trigger, keyboard, and controller input posture.' },
  { id: 'library', label: 'Library', eyebrow: 'Assets and import', icon: Catalog, description: 'Brain assets, imports, and scoped library state.' },
  { id: 'session_media', label: 'Session Media', eyebrow: 'Backing tracks adjunct', icon: Document, description: 'Backing tracks and adjunct session media workflows.', variant: 'utility' as const },
  { id: 'practice_coach', label: 'Practice Coach', eyebrow: 'Packs and coaching adjunct', icon: Book, description: 'Practice packs, style coaching, and adjunct drill workflows.', variant: 'utility' as const },
  { id: 'diagnostics', label: 'Diagnostics', eyebrow: 'Latency and health', icon: Activity, description: 'Latency, CPU, xrun, and controller qualification detail.' },
] as const

const PRACTICE_STYLES = [
  { id: 'rock_8', label: 'Rock 8', feel: 'Straight', signature: '4/4' },
  { id: 'rock_16', label: 'Rock 16', feel: 'Driving', signature: '4/4' },
  { id: 'shuffle_blues', label: 'Shuffle Blues', feel: 'Shuffle', signature: '12/8' },
  { id: 'funk_16', label: 'Funk 16', feel: 'Syncopated', signature: '4/4' },
  { id: 'metal_doublekick', label: 'Metal DK', feel: 'Aggressive', signature: '4/4' },
  { id: 'pop_4onfloor', label: 'Pop 4', feel: 'Four on Floor', signature: '4/4' },
  { id: 'jazz_swing', label: 'Jazz Swing', feel: 'Swing', signature: '4/4' },
  { id: 'reggae_1drop', label: 'Reggae 1', feel: 'One Drop', signature: '4/4' },
] as const

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


function selectedBackingTrack(
  tracks: DrumBackingTrackSummary[],
  transport: DrumBackingTrackTransportState) {
  return tracks.find((track) => track.track_id === transport.track_id)
}

function selectedPracticeStyle(styleId: string | null | undefined) {
  return PRACTICE_STYLES.find((style) => style.id === styleId)
}

function selectedPracticePack(
  packs: DrumPack[],
  activePackId: string | null | undefined,
) {
  return packs.find((pack) => pack.pack_id === activePackId)
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
  const backingTracksQuery = useQuery({
    queryKey: ['brain', 'session-media', 'backing-tracks'],
    queryFn: () => drumsApi.getBackingTracks(),
    staleTime: 60_000,
  })
  const backingTrackTransportQuery = useQuery({
    queryKey: ['brain', 'session-media', 'backing-tracks', 'transport'],
    queryFn: () => drumsApi.getBackingTrackTransport(),
    refetchInterval: (query) => (query.state.data?.is_playing ? 500 : 2_000),
    staleTime: 250,
  })
  const drumPracticeStateQuery = useQuery({
    queryKey: ['brain', 'practice-coach', 'drum-state'],
    queryFn: () => drumsApi.getState(),
    staleTime: 2_000,
  })
  const factoryPracticePacksQuery = useQuery({
    queryKey: ['brain', 'practice-coach', 'packs', 'factory'],
    queryFn: () => drumsApi.getFactoryPacks(),
    staleTime: 60_000,
  })
  const generatedPracticePacksQuery = useQuery({
    queryKey: ['brain', 'practice-coach', 'packs', 'generated'],
    queryFn: () => drumsApi.getGeneratedPacks(),
    staleTime: 60_000,
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
  const backingTrackTransportMutation = useMutation({
    mutationFn: (patch: Parameters<typeof drumsApi.setBackingTrackTransport>[0]) => drumsApi.setBackingTrackTransport(patch),
    onSuccess: (transportState) => {
      queryClient.setQueryData(['brain', 'session-media', 'backing-tracks', 'transport'], transportState)
    },
  })
  const drumPracticeStateMutation = useMutation({
    mutationFn: (patch: Parameters<typeof drumsApi.updateState>[0]) => drumsApi.updateState(patch),
    onSuccess: (nextState) => {
      queryClient.setQueryData(['brain', 'practice-coach', 'drum-state'], nextState)
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
  const backingTracks = backingTracksQuery.data ?? []
  const backingTrackTransport = backingTrackTransportQuery.data
  const drumPracticeState = drumPracticeStateQuery.data
  const practicePacks = [
    ...(factoryPracticePacksQuery.data ?? []),
    ...(generatedPracticePacksQuery.data ?? []),
  ]
  const activeSection = routeSection ?? state?.active_section ?? 'overview'
  const currentSetName = state?.set_name ?? ''

  const handleSectionChange = useCallback((sectionId: SectionId) => {
    if (searchParams.get('section') !== sectionId) {
      const nextSearchParams = new URLSearchParams(searchParams)
      nextSearchParams.set('section', sectionId)
      setSearchParams(nextSearchParams)
    }
    if (activeSection !== sectionId) {
      stateMutation.mutate({ active_section: sectionId })
    }
  }, [activeSection, searchParams, setSearchParams, stateMutation])

  const { primaryNavItems, utilityNavItems } = useMemo(() => {
    const baseItems: UnifiedWorkspaceSideNavItem[] = SECTION_DEFS.map((section) => ({
      key: section.id,
      label: section.label,
      description: `${section.eyebrow} • ${section.description}`,
      to: `/brain?section=${section.id}`,
      icon: section.icon,
      active: activeSection === section.id,
      onOpen: () => handleSectionChange(section.id),
      meta: activeSection === section.id ? 'Current' : undefined,
      variant: section.variant ?? 'default',
    }))

    return {
      primaryNavItems: baseItems.filter((item) => item.variant !== 'utility'),
      utilityNavItems: baseItems.filter((item) => item.variant === 'utility'),
    }
  }, [activeSection, handleSectionChange])

  useSetShellWindow({
    title: 'Performance Brain',
    subtitle: 'Unified drum-and-sequencer brain with keyboard layers, trigger nuance, routing, diagnostics, and snapshot-first workflow.',
    kicker: 'Platform / Performance Brain',
    actions: [
      { id: 'focus-overview', label: 'Focus Overview', icon: Reset, onClick: () => handleSectionChange('overview'), active: activeSection === 'overview' },
      { id: 'back-audio-grid', label: 'Back to Audio Grid', icon: ArrowLeft, onClick: () => navigate('/juce-grid') },
    ],
  }, [activeSection, handleSectionChange, navigate])

  if (
    stateQuery.isLoading
    || transportQuery.isLoading
    || slotsQuery.isLoading
    || diagnosticsQuery.isLoading
    || backingTracksQuery.isLoading
    || backingTrackTransportQuery.isLoading
    || drumPracticeStateQuery.isLoading
    || factoryPracticePacksQuery.isLoading
    || generatedPracticePacksQuery.isLoading
  ) {
    return (
      <section className="brain-page brain-page--loading">
        <InlineLoading status="active" description="Loading Performance Brain workspace" />
      </section>
    )
  }

  if (
    !state
    || !transport
    || !slots
    || !layers
    || !sequence
    || !mixer
    || !inputs
    || !library
    || !diagnostics
    || !backingTrackTransport
    || !drumPracticeState
  ) {
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

  const activeSlot = slots[state.active_slot]
  const activeLayer = layers.find((layer) => layer.layer_id === state.active_layer_id)
  const qualification = diagnostics.controller_qualification
  const controllerAlerts = uniqueItems([...diagnostics.warnings, ...qualification.issues])
  const activeBackingTrack = selectedBackingTrack(backingTracks, backingTrackTransport)
  const activePracticeStyle = selectedPracticeStyle(drumPracticeState.practice_style_id)
  const activePracticePack = selectedPracticePack(practicePacks, drumPracticeState.active_pack)

  const handleSetNameCommit = () => {
    const trimmed = setNameDraft.trim()
    if (!trimmed || trimmed === currentSetName) {
      setSetNameDraft(currentSetName)
      return
    }
    stateMutation.mutate({ set_name: trimmed })
  }

  const handleSlotSelect = (slotId: number) => {
    stateMutation.mutate({ active_slot: slotId })
  }

  return (
    <section className="brain-page">
      <div className="brain-page__shell">
        <UnifiedWorkspaceSideNav
          ariaLabel="Performance Brain section navigation"
          className="brain-page__rail"
          eyebrow="Unified brain"
          title="Performance Brain"
          description="One routed tree for overview, live play, layers, sequence, routing, inputs, library, and adjunct operator workflows."
          items={primaryNavItems}
          footerTitle="Adjunct Workflows"
          footerItems={utilityNavItems}
          metaBlocks={[
            { key: 'brain-scope', label: 'Scope', value: scope.instanceId != null ? `Instance ${scope.instanceId}` : 'Workspace' },
            { key: 'brain-slot', label: 'Active slot', value: activeSlot ? `${activeSlot.slot_id + 1}: ${activeSlot.name}` : 'None' },
            { key: 'brain-layer', label: 'Active layer', value: activeLayer?.name ?? state.active_layer_id },
          ]}
          callout={{
            kind: qualification.controller_ready ? 'info' : 'warning',
            text: qualification.controller_ready
              ? 'Controller qualification is currently ready for the scoped Brain workflow.'
              : 'Controller qualification needs attention before this scoped Brain workflow is considered operator-safe.',
          }}
          storageKey="performance-brain"
        />

        <div className="brain-page__main">
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

          <hr className="brain-page__divider" role="separator" aria-hidden="true" />

          {activeSection === 'overview' ? (
            <BrainOverviewShell
              state={state}
              transport={transport}
              slots={slots}
              layers={layers}
              sequence={sequence}
              mixer={mixer}
              inputs={inputs}
              diagnostics={diagnostics}
              onTransportPatch={(patch) => transportMutation.mutate(patch)}
              onSlotSelect={(slotId) => handleSlotSelect(slotId)}
              onSlotUpdate={(slotId, patch) => slotMutation.mutate({ slotId, patch })}
            />
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
              <Tile className="brain-page__panel">
                <span className="brain-page__panel-title">Migration & import</span>
                <p className="brain-page__panel-copy">
                  Replacement surface for legacy Drums + SynthForge. Both remain live during migration; this is the new command center.
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

          {activeSection === 'session_media' ? (
            <div className="brain-page__section-grid">
              <Tile className="brain-page__panel">
                <span className="brain-page__panel-title">Session media adjunct</span>
                <strong>{backingTrackTransport.track_name}</strong>
                <p className="brain-page__panel-copy">
                  Backing tracks stay outside the core Performance Brain transport and sequence identity.
                  This adjunct reuses the shared session-media runtime without folding rehearsal media into the V1 Brain core.
                </p>
                <ul className="brain-page__flat-list">
                  <li><strong>Track</strong> · {activeBackingTrack?.name ?? backingTrackTransport.track_name}</li>
                  <li><strong>Style</strong> · {backingTrackTransport.genre} · key {backingTrackTransport.key} · {backingTrackTransport.tempo} BPM</li>
                  <li><strong>Position</strong> · {backingTrackTransport.position_label} / {backingTrackTransport.duration_label}</li>
                </ul>
              </Tile>

              <Tile className="brain-page__panel">
                <span className="brain-page__panel-title">Adjunct transport</span>
                <div className="brain-page__button-row">
                  <Button
                    size="sm"
                    kind={backingTrackTransport.is_playing ? 'danger' : 'primary'}
                    renderIcon={backingTrackTransport.is_playing ? PauseFilled : PlayFilled}
                    onClick={() => backingTrackTransportMutation.mutate({ is_playing: !backingTrackTransport.is_playing })}
                  >
                    {backingTrackTransport.is_playing ? 'Stop session media' : 'Play session media'}
                  </Button>
                  <Button
                    size="sm"
                    kind="secondary"
                    onClick={() => backingTrackTransportMutation.mutate({ loop_enabled: !backingTrackTransport.loop_enabled })}
                  >
                    {backingTrackTransport.loop_enabled ? 'Disable loop' : 'Enable loop'}
                  </Button>
                </div>
                <div className="brain-page__metric-row">
                  <span>Tempo shift</span>
                  <input
                    className="brain-page__number-input"
                    aria-label="Session media tempo shift"
                    type="number"
                    min={-50}
                    max={50}
                    value={backingTrackTransport.tempo_shift}
                    onChange={(event) => backingTrackTransportMutation.mutate({ tempo_shift: Number(event.target.value) })}
                  />
                </div>
                <div className="brain-page__metric-row">
                  <span>Pitch shift</span>
                  <input
                    className="brain-page__number-input"
                    aria-label="Session media pitch shift"
                    type="number"
                    min={-12}
                    max={12}
                    value={backingTrackTransport.pitch_shift}
                    onChange={(event) => backingTrackTransportMutation.mutate({ pitch_shift: Number(event.target.value) })}
                  />
                </div>
              </Tile>

              <Tile className="brain-page__panel">
                <span className="brain-page__panel-title">Backing-track catalog</span>
                <ul className="brain-page__flat-list">
                  {backingTracks.map((track) => (
                    <li key={track.track_id}>
                      <strong>{track.name}</strong> · {track.genre} · key {track.key} · {track.tempo} BPM · {track.duration_label}
                      {' '}
                      <Button
                        size="sm"
                        kind={track.track_id === backingTrackTransport.track_id ? 'ghost' : 'secondary'}
                        onClick={() => backingTrackTransportMutation.mutate({ track_id: track.track_id, position_seconds: 0, is_playing: false })}
                      >
                        {track.track_id === backingTrackTransport.track_id ? `Loaded ${track.name}` : `Load ${track.name}`}
                      </Button>
                    </li>
                  ))}
                </ul>
              </Tile>
            </div>
          ) : null}

          {activeSection === 'practice_coach' ? (
            <div className="brain-page__section-grid">
              <Tile className="brain-page__panel">
                <span className="brain-page__panel-title">Practice and coaching adjunct</span>
                <strong>{activePracticeStyle?.label ?? 'Select a coaching style'}</strong>
                <p className="brain-page__panel-copy">
                  Practice packs and coaching cues stay outside the core Performance Brain transport,
                  slot graph, and sequence identity. This adjunct reuses the Drum Machine rehearsal runtime
                  without collapsing Brain V1 back into a multi-identity monolith.
                </p>
                <ul className="brain-page__flat-list">
                  <li><strong>Active style</strong> · {activePracticeStyle?.label ?? 'Unassigned'} · {activePracticeStyle?.feel ?? 'Choose a feel'} · {activePracticeStyle?.signature ?? 'No signature'}</li>
                  <li><strong>Active pack</strong> · {activePracticePack?.name ?? 'No pack assigned'}</li>
                  <li><strong>Mode source</strong> · Drum practice runtime · count-in {drumPracticeState.practice_count_in_bars} bars</li>
                </ul>
              </Tile>

              <Tile className="brain-page__panel">
                <span className="brain-page__panel-title">Style coaching</span>
                <div className="brain-page__button-row">
                  {PRACTICE_STYLES.map((style) => (
                    <Button
                      key={style.id}
                      size="sm"
                      kind={style.id === drumPracticeState.practice_style_id ? 'primary' : 'secondary'}
                      onClick={() => drumPracticeStateMutation.mutate({ practice_style_id: style.id })}
                    >
                      {style.label}
                    </Button>
                  ))}
                </div>
                <div className="brain-page__metric-row">
                  <span>Count-in bars</span>
                  <input
                    className="brain-page__number-input"
                    aria-label="Practice count-in bars"
                    type="number"
                    min={0}
                    max={4}
                    value={drumPracticeState.practice_count_in_bars}
                    onChange={(event) => drumPracticeStateMutation.mutate({ practice_count_in_bars: Number(event.target.value) })}
                  />
                </div>
                <div className="brain-page__metric-row">
                  <span>Change quantization</span>
                  <input
                    className="brain-page__number-input"
                    aria-label="Practice change quantization"
                    type="number"
                    min={1}
                    max={8}
                    value={drumPracticeState.practice_change_quantization}
                    onChange={(event) => drumPracticeStateMutation.mutate({ practice_change_quantization: Number(event.target.value) })}
                  />
                </div>
                <div className="brain-page__metric-row">
                  <span>Variation</span>
                  <input
                    className="brain-page__number-input"
                    aria-label="Practice variation"
                    type="number"
                    min={0}
                    max={10}
                    value={drumPracticeState.practice_variation}
                    onChange={(event) => drumPracticeStateMutation.mutate({ practice_variation: Number(event.target.value) })}
                  />
                </div>
                <div className="brain-page__button-row">
                  <Button
                    size="sm"
                    kind={drumPracticeState.practice_auto_fill ? 'primary' : 'secondary'}
                    onClick={() => drumPracticeStateMutation.mutate({ practice_auto_fill: !drumPracticeState.practice_auto_fill })}
                  >
                    Auto Fill {drumPracticeState.practice_auto_fill ? 'On' : 'Off'}
                  </Button>
                </div>
              </Tile>

              <Tile className="brain-page__panel">
                <span className="brain-page__panel-title">Practice-pack catalog</span>
                <ul className="brain-page__flat-list">
                  {practicePacks.map((pack) => (
                    <li key={pack.pack_id}>
                      <strong>{pack.name}</strong> · {pack.source} · {pack.description}
                      {' '}
                      <Button
                        size="sm"
                        kind={pack.pack_id === drumPracticeState.active_pack ? 'ghost' : 'secondary'}
                        onClick={() => drumPracticeStateMutation.mutate({ active_pack: pack.pack_id })}
                      >
                        {pack.pack_id === drumPracticeState.active_pack ? `Loaded ${pack.name}` : `Load ${pack.name}`}
                      </Button>
                    </li>
                  ))}
                </ul>
              </Tile>
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
