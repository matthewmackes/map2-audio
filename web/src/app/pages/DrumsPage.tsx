import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  InlineLoading,
  InlineNotification,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Tag,
  Tile,
} from '@carbon/react'
import {
  Music,
  PauseFilled,
  PlayFilled,
  StopFilled,
  VolumeUp,
  Waveform,
} from '@carbon/icons-react'

import { PageHeader } from '@/app/components/PageHeader'
import { NumberInput } from '@/app/components/Controls/NumberInput'
import {
  useDrumActiveKit,
  useDrumMachineState,
  useDrumMidiLearn,
  useDrumPattern,
  useDrumPacks,
  useSetDrumStep,
  useDrumTransport,
  useUpdateDrumMachineState,
  useUpdateDrumTransport,
} from '@/app/hooks/useDrumMachine'
import { drumsApi } from '@/map2/api'
import { normalizeDrumMachineState } from '@/map2/drumMachineState'
import type { DrumKit, DrumMachineState, DrumPattern } from '@/map2/types'

type DrumMode = DrumMachineState['ui_mode']

const MODE_ORDER: DrumMode[] = ['practice', 'advanced', 'backing_tracks']

const MODE_META: Record<DrumMode, { label: string; accent: string; description: string }> = {
  practice: {
    label: 'Practice',
    accent: '#4589ff',
    description: 'Style-driven rehearsal controls, arrangement loading, and guided repetition.',
  },
  advanced: {
    label: 'Advanced',
    accent: '#24a148',
    description: 'Sequencer, pattern tools, mixer, and MIDI editing workspace.',
  },
  backing_tracks: {
    label: 'Backing Tracks',
    accent: '#ff832b',
    description: 'Track browser and transport surface for supported accompaniment playback.',
  },
}

const shellStyle: Record<string, React.CSSProperties> = {
  page: {
    padding: '24px 24px 40px',
    maxWidth: 1480,
    margin: '0 auto',
    display: 'grid',
    gap: 24,
  },
  transport: {
    borderRadius: 18,
    border: '1px solid rgba(255,255,255,0.08)',
    background:
      'linear-gradient(145deg, rgba(18,18,18,0.98), rgba(8,8,8,0.94)),' +
      'radial-gradient(circle at top right, rgba(69,137,255,0.18), transparent 40%)',
    padding: 20,
    display: 'grid',
    gap: 18,
    boxShadow: '0 28px 60px rgba(0,0,0,0.28)',
  },
  transportRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 16,
    alignItems: 'end',
  },
  transportCluster: {
    display: 'grid',
    gap: 8,
  },
  clusterLabel: {
    fontSize: 11,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#a8a8a8',
  },
  buttonRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
  },
  sliderWrap: {
    display: 'grid',
    gap: 8,
  },
  sliderValue: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 12,
    color: '#c6c6c6',
  },
  range: {
    width: '100%',
    accentColor: '#4589ff',
  },
  modeShell: {
    display: 'grid',
    gap: 18,
    minHeight: 520,
  },
  modeGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 2.4fr) minmax(280px, 1fr)',
    gap: 18,
  },
  sequencerLayout: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 320px',
    gap: 18,
  },
  modeColumn: {
    display: 'grid',
    gap: 18,
  },
  tile: {
    borderRadius: 16,
    minHeight: 180,
    display: 'grid',
    gap: 14,
    alignContent: 'start',
    background: 'linear-gradient(180deg, rgba(30,30,30,0.92), rgba(18,18,18,0.98))',
  },
  tileHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  tileTitle: {
    margin: 0,
    fontSize: 18,
    color: '#f4f4f4',
  },
  tileText: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.6,
    color: '#c6c6c6',
  },
  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: 12,
  },
  statCard: {
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.02)',
    padding: 12,
    display: 'grid',
    gap: 6,
  },
  statLabel: {
    fontSize: 11,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#8d8d8d',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 600,
    color: '#f4f4f4',
  },
  footer: {
    borderRadius: 16,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(18,18,18,0.92)',
    padding: '12px 16px',
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'center',
  },
  dotRow: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.16)',
    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
  },
  sequencerGrid: {
    overflowX: 'auto',
    paddingBottom: 4,
  },
  sequencerHeader: {
    display: 'grid',
    gridTemplateColumns: '220px repeat(16, 40px) 120px',
    gap: 8,
    alignItems: 'center',
    minWidth: 1080,
    marginBottom: 12,
  },
  sequencerRow: {
    display: 'grid',
    gridTemplateColumns: '220px repeat(16, 40px) 120px',
    gap: 8,
    alignItems: 'center',
    minWidth: 1080,
    marginBottom: 10,
  },
  rowLabel: {
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.03)',
    padding: '10px 12px',
    display: 'grid',
    gap: 6,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#f4f4f4',
  },
  rowMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  stepButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.04)',
    color: '#f4f4f4',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    transition: 'transform 120ms ease, border-color 120ms ease, background 120ms ease',
  },
  rowSlider: {
    width: '100%',
    accentColor: '#24a148',
  },
}

function transportTag(active: boolean) {
  return active ? <Tag type="green">Playing</Tag> : <Tag type="gray">Stopped</Tag>
}

function modeIndex(mode: DrumMode | undefined) {
  return Math.max(0, MODE_ORDER.indexOf(mode ?? 'practice'))
}

function clampPatternLength(pattern: DrumPattern | undefined) {
  const length = pattern?.length ?? 16
  return Math.max(1, Math.min(64, length))
}

function resolvedStep(pattern: DrumPattern | undefined, instrumentIndex: number, stepIndex: number) {
  const step = pattern?.steps?.[instrumentIndex]?.[stepIndex]
  return {
    velocity: step?.velocity ?? 0,
    accent: Boolean(step?.accent),
    active: (step?.velocity ?? 0) > 0,
  }
}

function practicePanel(
  state: DrumMachineState,
  packCounts: { factory: number; user: number },
  accent: string,
) {
  return (
    <div style={shellStyle.modeShell}>
      <div style={shellStyle.modeGrid}>
        <div style={shellStyle.modeColumn}>
          <Tile style={{ ...shellStyle.tile, borderTop: `3px solid ${accent}` }}>
            <div style={shellStyle.tileHeader}>
              <h2 style={shellStyle.tileTitle}>Practice Workspace</h2>
              <Tag type="blue">Ready</Tag>
            </div>
            <p style={shellStyle.tileText}>
              This mode shell now carries the correct page structure for style selection, count-in,
              quantization, variation, and arrangement loading. The detailed style browser lands in
              `T217-G`.
            </p>
            <div style={shellStyle.statGrid}>
              <div style={shellStyle.statCard}>
                <span style={shellStyle.statLabel}>Variation</span>
                <span style={shellStyle.statValue}>{state.practice_variation}</span>
              </div>
              <div style={shellStyle.statCard}>
                <span style={shellStyle.statLabel}>Count-In</span>
                <span style={shellStyle.statValue}>{state.practice_count_in_bars} bars</span>
              </div>
              <div style={shellStyle.statCard}>
                <span style={shellStyle.statLabel}>Quantize</span>
                <span style={shellStyle.statValue}>{state.practice_change_quantization}</span>
              </div>
              <div style={shellStyle.statCard}>
                <span style={shellStyle.statLabel}>Auto Fill</span>
                <span style={shellStyle.statValue}>{state.practice_auto_fill ? 'On' : 'Off'}</span>
              </div>
            </div>
          </Tile>
          <Tile style={shellStyle.tile}>
            <div style={shellStyle.tileHeader}>
              <h3 style={shellStyle.tileTitle}>Arrangement Sources</h3>
              <Tag type="cool-gray">Catalog</Tag>
            </div>
            <p style={shellStyle.tileText}>
              Factory packs, user packs, and style-arrangement loading now have a dedicated content
              region instead of being split across the old placeholder tabs.
            </p>
            <div style={shellStyle.statGrid}>
              <div style={shellStyle.statCard}>
                <span style={shellStyle.statLabel}>Factory Packs</span>
                <span style={shellStyle.statValue}>{packCounts.factory}</span>
              </div>
              <div style={shellStyle.statCard}>
                <span style={shellStyle.statLabel}>User Packs</span>
                <span style={shellStyle.statValue}>{packCounts.user}</span>
              </div>
            </div>
          </Tile>
        </div>
        <div style={shellStyle.modeColumn}>
          <Tile style={shellStyle.tile}>
            <div style={shellStyle.tileHeader}>
              <h3 style={shellStyle.tileTitle}>Status Focus</h3>
              <Tag type="teal">Session</Tag>
            </div>
            <p style={shellStyle.tileText}>
              Practice mode stays simplified while preserving the same top transport and footer
              status bar as the Advanced and Backing Tracks shells.
            </p>
          </Tile>
        </div>
      </div>
    </div>
  )
}

function advancedPanel(
  patternId: number,
  variation: number,
  accent: string,
  pattern: DrumPattern | undefined,
  activeKit: DrumKit | null | undefined,
  currentStep: number,
  onToggleStep: (instrumentIndex: number, stepIndex: number, nextVelocity: number, accent: boolean) => void,
) {
  const visibleSteps = Math.min(16, clampPatternLength(pattern))
  const instruments = Array.from({ length: 16 }, (_, instrumentIndex) => {
    const kitInstrument = activeKit?.instruments?.[instrumentIndex]
    return {
      name: kitInstrument?.name ?? `Pad ${instrumentIndex + 1}`,
      bus: kitInstrument?.bus_assignment ?? (instrumentIndex % 8),
      volume: kitInstrument?.volume ?? 80,
    }
  })

  return (
    <div style={shellStyle.modeShell}>
      <div style={shellStyle.sequencerLayout}>
        <div style={shellStyle.modeColumn}>
          <Tile style={{ ...shellStyle.tile, borderTop: `3px solid ${accent}`, minHeight: 420 }}>
            <div style={shellStyle.tileHeader}>
              <h2 style={shellStyle.tileTitle}>Sequencer Workspace</h2>
              <Tag type="green">Primary View</Tag>
            </div>
            <p style={shellStyle.tileText}>
              The page now reserves a full-width advanced workspace for the TR-style grid, row
              controls, and pattern tools that follow in `T217-B` through `T217-E`.
            </p>
            <div style={shellStyle.statGrid}>
              <div style={shellStyle.statCard}>
                <span style={shellStyle.statLabel}>Pattern</span>
                <span style={shellStyle.statValue}>{patternId}</span>
              </div>
              <div style={shellStyle.statCard}>
                <span style={shellStyle.statLabel}>Variation</span>
                <span style={shellStyle.statValue}>{variation}</span>
              </div>
              <div style={shellStyle.statCard}>
                <span style={shellStyle.statLabel}>Rows</span>
                <span style={shellStyle.statValue}>16</span>
              </div>
              <div style={shellStyle.statCard}>
                <span style={shellStyle.statLabel}>Step Grid</span>
                <span style={shellStyle.statValue}>{visibleSteps} visible</span>
              </div>
            </div>

            <div style={shellStyle.sequencerGrid} role="grid" aria-label="TR-style drum step sequencer">
              <div style={shellStyle.sequencerHeader}>
                <span style={shellStyle.clusterLabel}>Instrument</span>
                {Array.from({ length: visibleSteps }, (_, stepIndex) => (
                  <Tag
                    key={`header-${stepIndex}`}
                    type={stepIndex === currentStep ? 'blue' : 'cool-gray'}
                    title={`Step ${stepIndex + 1}`}
                  >
                    {stepIndex + 1}
                  </Tag>
                ))}
                <span style={shellStyle.clusterLabel}>Level</span>
              </div>

              {instruments.map((instrument, instrumentIndex) => (
                <div key={`${instrument.name}-${instrumentIndex}`} style={shellStyle.sequencerRow} role="row">
                  <div style={shellStyle.rowLabel}>
                    <span style={shellStyle.rowTitle}>{instrument.name}</span>
                    <div style={shellStyle.rowMeta}>
                      <Tag type="green">Bus {instrument.bus}</Tag>
                      <Tag type="cool-gray">Row {instrumentIndex + 1}</Tag>
                    </div>
                  </div>

                  {Array.from({ length: visibleSteps }, (_, stepIndex) => {
                    const step = resolvedStep(pattern, instrumentIndex, stepIndex)
                    const isCurrent = stepIndex === currentStep
                    return (
                      <button
                        key={`${instrumentIndex}-${stepIndex}`}
                        type="button"
                        role="gridcell"
                        aria-label={`${instrument.name} step ${stepIndex + 1}`}
                        aria-pressed={step.active}
                        onClick={(event) => {
                          const nextVelocity = step.active ? 0 : 100
                          const nextAccent = step.active ? false : event.shiftKey || step.accent
                          onToggleStep(instrumentIndex, stepIndex, nextVelocity, nextAccent)
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            const nextVelocity = step.active ? 0 : 100
                            const nextAccent = step.active ? false : event.shiftKey || step.accent
                            onToggleStep(instrumentIndex, stepIndex, nextVelocity, nextAccent)
                          }
                        }}
                        style={{
                          ...shellStyle.stepButton,
                          background: step.active
                            ? step.accent
                              ? 'linear-gradient(180deg, rgba(69,137,255,0.95), rgba(10,132,255,0.78))'
                              : 'linear-gradient(180deg, rgba(36,161,72,0.95), rgba(14,104,38,0.78))'
                            : 'rgba(255,255,255,0.04)',
                          borderColor: isCurrent
                            ? accent
                            : step.accent
                              ? '#a6c8ff'
                              : step.active
                                ? '#42be65'
                                : 'rgba(255,255,255,0.12)',
                          boxShadow: isCurrent ? `0 0 0 1px ${accent}, 0 0 16px rgba(69,137,255,0.18)` : 'none',
                          transform: isCurrent ? 'translateY(-1px)' : 'none',
                        }}
                        title={`${instrument.name} step ${stepIndex + 1}: ${step.active ? `${step.velocity}${step.accent ? ' accent' : ''}` : 'off'}`}
                      >
                        {step.active ? (step.accent ? 'A' : step.velocity) : ''}
                      </button>
                    )
                  })}

                  <div style={shellStyle.sliderWrap}>
                    <div style={shellStyle.sliderValue}>
                      <span>Vol</span>
                      <strong>{instrument.volume}</strong>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={instrument.volume}
                      readOnly
                      aria-label={`${instrument.name} level`}
                      style={shellStyle.rowSlider}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Tile>
        </div>
        <div style={shellStyle.modeColumn}>
          <Tile style={shellStyle.tile}>
            <div style={shellStyle.tileHeader}>
              <h3 style={shellStyle.tileTitle}>Right Rail</h3>
              <Tag type="purple">Reserved</Tag>
            </div>
            <p style={shellStyle.tileText}>
              Pattern bank, kit browser, song arranger, and MIDI configuration all now have a fixed
              home in the advanced shell instead of being bolted onto the old pack-management page.
            </p>
          </Tile>
          <Tile style={shellStyle.tile}>
            <div style={shellStyle.tileHeader}>
              <h3 style={shellStyle.tileTitle}>Meter Bridge</h3>
              <Tag type="cyan">Planned</Tag>
            </div>
            <p style={shellStyle.tileText}>
              The transport bar and footer already reserve space for beat sync, meter readouts, and
              MIDI activity so later slices can plug into a stable layout.
            </p>
          </Tile>
        </div>
      </div>
    </div>
  )
}

function backingTracksPanel(accent: string) {
  return (
    <div style={shellStyle.modeShell}>
      <div style={shellStyle.modeGrid}>
        <div style={shellStyle.modeColumn}>
          <Tile style={{ ...shellStyle.tile, borderTop: `3px solid ${accent}` }}>
            <div style={shellStyle.tileHeader}>
              <h2 style={shellStyle.tileTitle}>Backing Tracks Shell</h2>
              <Tag type="warm-gray">Scaffolded</Tag>
            </div>
            <p style={shellStyle.tileText}>
              The mode now has the same page-level shell and transport integration as the other drum
              views, while detailed track browsing and waveform transport land in `T217-H`.
            </p>
            <InlineNotification
              kind="warning"
              lowContrast
              hideCloseButton
              title="Backing-track engine surface pending"
              subtitle="This shell is ready for the dedicated track browser, waveform, and loop controls."
            />
          </Tile>
        </div>
        <div style={shellStyle.modeColumn}>
          <Tile style={shellStyle.tile}>
            <div style={shellStyle.tileHeader}>
              <h3 style={shellStyle.tileTitle}>Future Panel</h3>
              <Tag type="orange">Coming Soon</Tag>
            </div>
            <p style={shellStyle.tileText}>
              Search, genre filtering, tempo/pitch offsets, and loop markers will attach here
              without changing the page navigation established in this slice.
            </p>
          </Tile>
        </div>
      </div>
    </div>
  )
}

export function DrumsPage() {
  const queryClient = useQueryClient()
  const stateQuery = useDrumMachineState()
  const transportQuery = useDrumTransport()
  const activeKitQuery = useDrumActiveKit()
  const packs = useDrumPacks()
  const midiLearn = useDrumMidiLearn()
  const patternQuery = useDrumPattern(transportQuery.data?.pattern ?? 0)
  const setStep = useSetDrumStep()
  const updateState = useUpdateDrumMachineState()
  const updateTransport = useUpdateDrumTransport()
  const tapTempo = useMutation({
    mutationFn: () => drumsApi.tapTempo(Date.now()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['drums', 'state'] })
      void queryClient.invalidateQueries({ queryKey: ['drums', 'transport'] })
    },
  })

  const rawState = stateQuery.data
  const state = rawState ? normalizeDrumMachineState(rawState) : undefined
  const transport = transportQuery.data
  const activeMode = state?.ui_mode ?? 'practice'
  const activeModeMeta = MODE_META[activeMode]
  const activeKitName = activeKitQuery.data?.name ?? 'No kit loaded'
  const activeKit = activeKitQuery.data
  const pattern = patternQuery.data
  const midiLearnState = midiLearn.status.data
  const packCounts = {
    factory: packs.factory.data?.length ?? 0,
    user: packs.generated.data?.length ?? 0,
  }

  if (stateQuery.isLoading && !state) {
    return (
      <div style={shellStyle.page}>
        <PageHeader
          title="Drum Machine"
          subtitle="Loading drum workspace"
          icon={<Music size={32} style={{ color: '#4589ff' }} />}
        />
        <Tile style={{ ...shellStyle.tile, minHeight: 240, placeItems: 'center' }}>
          <InlineLoading description="Preparing drum machine layout" status="active" />
        </Tile>
      </div>
    )
  }

  if (!state || !transport) {
    return (
      <div style={shellStyle.page}>
        <PageHeader
          title="Drum Machine"
          subtitle="Unable to resolve the drum machine state"
          icon={<Music size={32} style={{ color: '#4589ff' }} />}
        />
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Drum machine unavailable"
          subtitle="The page could not load drum transport or state data from the backend."
        />
      </div>
    )
  }

  const visibleAdvancedSteps = Math.min(16, clampPatternLength(pattern))
  const currentStep = transport.is_playing
    ? ((transport.pattern + transport.variation) % Math.max(1, visibleAdvancedSteps))
    : 0

  return (
    <div style={shellStyle.page}>
      <PageHeader
        title="Drum Machine"
        subtitle={activeModeMeta.description}
        icon={<Music size={32} style={{ color: activeModeMeta.accent }} />}
      />

      <section style={shellStyle.transport}>
        <div style={shellStyle.buttonRow}>
          <Tag type="blue">{activeModeMeta.label}</Tag>
          {transportTag(transport.is_playing)}
          <Tag type="cool-gray">Kit: {activeKitName}</Tag>
          <Tag type="warm-gray">Pattern {transport.pattern}</Tag>
        </div>

        <div style={shellStyle.transportRow}>
          <div style={shellStyle.transportCluster}>
            <span style={shellStyle.clusterLabel}>Transport</span>
            <div style={shellStyle.buttonRow}>
              <Button
                kind={transport.is_playing ? 'secondary' : 'primary'}
                size="md"
                renderIcon={transport.is_playing ? PauseFilled : PlayFilled}
                onClick={() => updateTransport.mutate({ is_playing: !transport.is_playing })}
              >
                {transport.is_playing ? 'Pause' : 'Play'}
              </Button>
              <Button
                kind="tertiary"
                size="md"
                renderIcon={StopFilled}
                onClick={() => updateTransport.mutate({ is_playing: false })}
              >
                Stop
              </Button>
              <Button
                kind="ghost"
                size="md"
                renderIcon={Waveform}
                disabled={tapTempo.isPending}
                onClick={() => tapTempo.mutate()}
              >
                Tap Tempo
              </Button>
            </div>
          </div>

          <div style={shellStyle.transportCluster}>
            <NumberInput
              label="BPM"
              value={transport.bpm}
              min={40}
              max={300}
              step={1}
              defaultValue={120}
              profile="integer"
              onChange={(value) => updateTransport.mutate({ bpm: value })}
              size="small"
              fullWidth
              accentColor={activeModeMeta.accent}
            />
          </div>

          <div style={shellStyle.transportCluster}>
            <NumberInput
              label="Pattern"
              value={transport.pattern}
              min={0}
              max={127}
              step={1}
              defaultValue={0}
              profile="integer"
              onChange={(value) => updateTransport.mutate({ pattern: value })}
              size="small"
              fullWidth
              accentColor={activeModeMeta.accent}
            />
          </div>

          <div style={shellStyle.transportCluster}>
            <NumberInput
              label="Variation"
              value={transport.variation}
              min={0}
              max={10}
              step={1}
              defaultValue={0}
              profile="integer"
              onChange={(value) => updateTransport.mutate({ variation: value })}
              size="small"
              fullWidth
              accentColor={activeModeMeta.accent}
            />
          </div>

          <div style={shellStyle.sliderWrap}>
            <span style={shellStyle.clusterLabel}>Swing</span>
            <div style={shellStyle.sliderValue}>
              <span>Groove</span>
              <strong>{transport.swing}%</strong>
            </div>
            <input
              aria-label="Swing"
              type="range"
              min={0}
              max={100}
              step={1}
              value={transport.swing}
              onChange={(event) => updateTransport.mutate({ swing: Number(event.currentTarget.value) })}
              style={shellStyle.range}
            />
          </div>

          <div style={shellStyle.sliderWrap}>
            <span style={shellStyle.clusterLabel}>Master Volume</span>
            <div style={shellStyle.sliderValue}>
              <span>Output</span>
              <strong>{state.volume}%</strong>
            </div>
            <input
              aria-label="Master volume"
              type="range"
              min={0}
              max={100}
              step={1}
              value={state.volume}
              onChange={(event) => updateState.mutate({ volume: Number(event.currentTarget.value) })}
              style={{ ...shellStyle.range, accentColor: '#24a148' }}
            />
          </div>
        </div>
      </section>

      <Tabs selectedIndex={modeIndex(activeMode)} onChange={({ selectedIndex }) => updateState.mutate({ ui_mode: MODE_ORDER[selectedIndex] })}>
        <TabList aria-label="Drum machine modes" contained>
          {MODE_ORDER.map((mode) => (
            <Tab key={mode}>{MODE_META[mode].label}</Tab>
          ))}
        </TabList>
        <TabPanels>
          <TabPanel>
            {practicePanel(state, packCounts, MODE_META.practice.accent)}
          </TabPanel>
          <TabPanel>
            {advancedPanel(
              transport.pattern,
              transport.variation,
              MODE_META.advanced.accent,
              pattern,
              activeKit,
              currentStep,
              (instrumentIndex, stepIndex, nextVelocity, accentEnabled) => {
                setStep.mutate({
                  patternId: transport.pattern,
                  instrument: instrumentIndex,
                  step: stepIndex,
                  velocity: nextVelocity,
                  accent: accentEnabled,
                })
              },
            )}
          </TabPanel>
          <TabPanel>
            {backingTracksPanel(MODE_META.backing_tracks.accent)}
          </TabPanel>
        </TabPanels>
      </Tabs>

      <footer style={shellStyle.footer}>
        <div style={shellStyle.footerGroup}>
          <Tag type="cool-gray">Active kit: {activeKitName}</Tag>
          <Tag type="warm-gray">Pattern {transport.pattern}</Tag>
          {transportTag(transport.is_playing)}
        </div>
        <div style={shellStyle.footerGroup}>
          <div style={shellStyle.dotRow} aria-hidden>
            {Array.from({ length: 4 }).map((_, index) => (
              <span
                key={index}
                style={{
                  ...shellStyle.dot,
                  background: index === ((transport.pattern + transport.variation) % 4) ? activeModeMeta.accent : shellStyle.dot.background,
                }}
              />
            ))}
          </div>
          <Tag type={midiLearnState?.active ? 'magenta' : 'gray'}>
            MIDI {midiLearnState?.active ? `Learning Pad ${midiLearnState.active_pad_index ?? '-'}` : 'Ready'}
          </Tag>
          {tapTempo.isPending ? <InlineLoading description="Capturing tap" status="active" /> : null}
          <Tag type="blue">
            <VolumeUp size={14} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
            {state.volume}%
          </Tag>
        </div>
      </footer>
    </div>
  )
}

export default DrumsPage
