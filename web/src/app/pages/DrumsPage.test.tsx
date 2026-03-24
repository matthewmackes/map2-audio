import '@testing-library/jest-dom'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'

import { DrumsPage } from './DrumsPage'

const mockSetStepMutate = jest.fn()
const mockSetPadControlMutate = jest.fn()
const mockPatchInstrumentMutate = jest.fn()
const mockClearPatternMutate = jest.fn()
const mockCopyPatternMutate = jest.fn()
const mockLoadKitMutate = jest.fn()
const mockSetPatternMutate = jest.fn()
const mockAddSongEntryMutate = jest.fn()
const mockPlaySongTransportMutate = jest.fn()
const mockRemoveSongEntryMutate = jest.fn()
const mockSetBusMixerMutate = jest.fn()
const mockSetMasterVolumeMutate = jest.fn()
const mockSetMidiMappingMutate = jest.fn()
const mockSetMidiZonesMutate = jest.fn()
const mockSetVelocityCurveMutate = jest.fn()
const mockSetTrackSwingMutate = jest.fn()
const mockSetTrackLengthMutate = jest.fn()
const mockSetSongMutate = jest.fn()
const mockStartMidiLearnMutate = jest.fn()
const mockUpdateStateMutate = jest.fn()
const mockUpdateTransportMutate = jest.fn()
const mockTriggerFillMutate = jest.fn()
const mockLoadMidiPresetMutate = jest.fn()
const mockStopMidiLearnMutate = jest.fn()
const mockStopSongTransportMutate = jest.fn()

const mockUseDrumMachineState = jest.fn()
const mockUseDrumTransport = jest.fn()
const mockUseDrumPosition = jest.fn()
const mockUseDrumActiveKit = jest.fn()
const mockUseDrumKits = jest.fn()
const mockUseDrumMidiMapping = jest.fn()
const mockUseDrumMetering = jest.fn()
const mockUseDrumSong = jest.fn()
const mockUseDrumSongTransport = jest.fn()
const mockUseDrumPacks = jest.fn()
const mockUseDrumMidiLearn = jest.fn()
const mockUseDrumMixer = jest.fn()
const mockUseDrumPattern = jest.fn()
const mockUsePatchDrumKitInstrument = jest.fn()
const mockUseClearDrumPattern = jest.fn()
const mockUseCopyDrumPattern = jest.fn()
const mockUseLoadDrumKit = jest.fn()
const mockUseSetDrumPadControl = jest.fn()
const mockUseSetDrumBusMixer = jest.fn()
const mockUseSetDrumMasterVolume = jest.fn()
const mockUseSetDrumMidiMapping = jest.fn()
const mockUseSetDrumMidiZones = jest.fn()
const mockUseSetDrumVelocityCurve = jest.fn()
const mockUseSetDrumTrackSwing = jest.fn()
const mockUseSetDrumTrackLength = jest.fn()
const mockUseSetDrumPattern = jest.fn()
const mockUseStartDrumMidiLearn = jest.fn()
const mockUseAddDrumSongEntry = jest.fn()
const mockUseLoadDrumMidiPreset = jest.fn()
const mockUsePlayDrumSongTransport = jest.fn()
const mockUseRemoveDrumSongEntry = jest.fn()
const mockUseSetDrumSong = jest.fn()
const mockUseSetDrumStep = jest.fn()
const mockUseStopDrumSongTransport = jest.fn()
const mockUseStopDrumMidiLearn = jest.fn()
const mockUseTriggerDrumFill = jest.fn()
const mockUseUpdateDrumMachineState = jest.fn()
const mockUseUpdateDrumTransport = jest.fn()

jest.mock('@/app/components/PageHeader', () => ({
  PageHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <header>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
  ),
}))

jest.mock('@/app/components/Controls/NumberInput', () => ({
  NumberInput: ({ label, value }: { label: string; value: number }) => (
    <label>
      <span>{label}</span>
      <input aria-label={label} value={value} readOnly />
    </label>
  ),
}))

jest.mock('@carbon/react', () => {
  const React = jest.requireActual('react')
  const TabsContext = React.createContext<{ onChange?: (payload: { selectedIndex: number }) => void } | null>(null)

  function Tabs({ selectedIndex = 0, onChange, children }: { selectedIndex?: number; onChange?: (payload: { selectedIndex: number }) => void; children: React.ReactNode }) {
    return (
      <TabsContext.Provider value={{ onChange }}>
        <div>{children}</div>
      </TabsContext.Provider>
    )
  }

  function TabList({ children, 'aria-label': ariaLabel }: { children: React.ReactNode; 'aria-label'?: string }) {
    return <div role="tablist" aria-label={ariaLabel}>{children}</div>
  }

  function Tab({ children }: { children: React.ReactNode }) {
    const context = React.useContext(TabsContext)
    return (
      <button
        role="tab"
        onClick={(event) => {
          const parent = event.currentTarget.parentElement
          const siblingTabs = parent ? Array.from(parent.querySelectorAll('[role="tab"]')) : []
          const index = siblingTabs.indexOf(event.currentTarget)
          context?.onChange?.({ selectedIndex: index })
        }}
      >
        {children}
      </button>
    )
  }

  function TabPanels({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>
  }

  function TabPanel({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>
  }

  return {
    Accordion: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    AccordionItem: ({ title, children }: { title: React.ReactNode; children: React.ReactNode }) => (
      <section>
        <h3>{title}</h3>
        <div>{children}</div>
      </section>
    ),
    Button: ({ children, renderIcon: Icon, ...props }: any) => (
      <button {...props}>{Icon ? <Icon /> : null}{children}</button>
    ),
    InlineLoading: ({ description }: { description?: string }) => <div>{description}</div>,
    InlineNotification: ({ title, subtitle }: { title: string; subtitle?: string }) => <div><strong>{title}</strong>{subtitle ? <span>{subtitle}</span> : null}</div>,
    Modal: ({ open, modalHeading, primaryButtonText, secondaryButtonText, onRequestSubmit, onRequestClose, children }: any) =>
      open ? (
        <section aria-label={modalHeading}>
          <div>{children}</div>
          <button onClick={onRequestSubmit}>{primaryButtonText}</button>
          <button onClick={onRequestClose}>{secondaryButtonText}</button>
        </section>
      ) : null,
    Tab,
    TabList,
    TabPanel,
    TabPanels,
    Tabs,
    Tag: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
    Tile: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  }
})

jest.mock('@/map2/api', () => ({
  drumsApi: {
    tapTempo: jest.fn().mockResolvedValue(undefined),
  },
}))

jest.mock('@/map2/drumMachineState', () => ({
  normalizeDrumMachineState: <T,>(state: T) => state,
}))

jest.mock('@/app/hooks/useDrumMachine', () => ({
  useDrumMachineState: () => mockUseDrumMachineState(),
  useDrumTransport: () => mockUseDrumTransport(),
  useDrumPosition: () => mockUseDrumPosition(),
  useDrumActiveKit: () => mockUseDrumActiveKit(),
  useDrumKits: () => mockUseDrumKits(),
  useDrumMidiMapping: () => mockUseDrumMidiMapping(),
  useDrumMetering: () => mockUseDrumMetering(),
  useDrumSong: () => mockUseDrumSong(),
  useDrumSongTransport: () => mockUseDrumSongTransport(),
  useDrumPacks: () => mockUseDrumPacks(),
  useDrumMidiLearn: () => mockUseDrumMidiLearn(),
  useDrumMixer: () => mockUseDrumMixer(),
  useDrumPattern: (patternId: number) => mockUseDrumPattern(patternId),
  usePatchDrumKitInstrument: () => mockUsePatchDrumKitInstrument(),
  useClearDrumPattern: () => mockUseClearDrumPattern(),
  useCopyDrumPattern: () => mockUseCopyDrumPattern(),
  useLoadDrumKit: () => mockUseLoadDrumKit(),
  useSetDrumPadControl: () => mockUseSetDrumPadControl(),
  useSetDrumBusMixer: () => mockUseSetDrumBusMixer(),
  useSetDrumMasterVolume: () => mockUseSetDrumMasterVolume(),
  useSetDrumMidiMapping: () => mockUseSetDrumMidiMapping(),
  useSetDrumMidiZones: () => mockUseSetDrumMidiZones(),
  useSetDrumVelocityCurve: () => mockUseSetDrumVelocityCurve(),
  useSetDrumTrackSwing: () => mockUseSetDrumTrackSwing(),
  useSetDrumTrackLength: () => mockUseSetDrumTrackLength(),
  useSetDrumPattern: () => mockUseSetDrumPattern(),
  useStartDrumMidiLearn: () => mockUseStartDrumMidiLearn(),
  useAddDrumSongEntry: () => mockUseAddDrumSongEntry(),
  useLoadDrumMidiPreset: () => mockUseLoadDrumMidiPreset(),
  usePlayDrumSongTransport: () => mockUsePlayDrumSongTransport(),
  useRemoveDrumSongEntry: () => mockUseRemoveDrumSongEntry(),
  useSetDrumSong: () => mockUseSetDrumSong(),
  useSetDrumStep: () => mockUseSetDrumStep(),
  useStopDrumMidiLearn: () => mockUseStopDrumMidiLearn(),
  useStopDrumSongTransport: () => mockUseStopDrumSongTransport(),
  useTriggerDrumFill: () => mockUseTriggerDrumFill(),
  useUpdateDrumMachineState: () => mockUseUpdateDrumMachineState(),
  useUpdateDrumTransport: () => mockUseUpdateDrumTransport(),
}))

function makePattern() {
  return {
    pattern_id: 7,
    length: 16,
    variation: 1,
    track_lengths: [0, 12, ...Array(14).fill(0)],
    steps: Array.from({ length: 16 }, () =>
      Array.from({ length: 16 }, () => ({
        active: false,
        velocity: 0,
        accent: false,
      })),
    ),
  }
}

function makeKit() {
  return {
    kit_id: 'studio',
    name: 'Studio',
    description: 'Studio kit',
    author: 'MAP2',
    category: 'Acoustic',
    instruments: Array.from({ length: 16 }, (_, index) => ({
      pad_id: index,
      name: index === 0 ? 'Kick' : `Pad ${index + 1}`,
      sfz_path: `kits/studio/pad-${index + 1}.sfz`,
      default_note: 36 + index,
      bus_assignment: index % 8,
      volume: 80 - index,
      pan: 0,
      tune: 0,
      mute: false,
      solo: false,
    })),
  }
}

function primeHooks() {
  mockUseDrumMachineState.mockReturnValue({
    data: {
      ui_mode: 'advanced',
      bpm: 120,
      volume: 80,
      pattern: 7,
      variation: 1,
      transport: true,
      swing: 12,
      active_pack: null,
      practice_style_id: null,
      practice_variation: 0,
      practice_change_quantization: 1,
      practice_count_in_bars: 0,
      practice_auto_fill: false,
    },
    isLoading: false,
  })
  mockUseDrumTransport.mockReturnValue({
    data: {
      is_playing: true,
      bpm: 120,
      pattern: 7,
      variation: 1,
      swing: 12,
      pending_pattern: -1,
      switch_quantization_beats: 4,
      track_swing: Array(16).fill(0),
    },
  })
  mockUseDrumPosition.mockReturnValue({
    data: {
      step: 5,
      bar: 2,
      beat: 2,
      pattern: 7,
      pattern_id: 7,
      variation: 1,
      is_playing: true,
      pending_pattern: -1,
      switch_quantization_beats: 4,
      updated_at: '2026-03-20T18:00:00Z',
    },
  })
  mockUseDrumActiveKit.mockReturnValue({ data: makeKit() })
  mockUseDrumKits.mockReturnValue({
    data: [
      makeKit(),
      {
        ...makeKit(),
        kit_id: 'electro',
        name: 'Electro',
        category: 'Electronic',
      },
    ],
  })
  mockUseDrumMidiMapping.mockReturnValue({
    mapping: {
      data: {
        global_midi_channel: 10,
        pads: Array.from({ length: 16 }, (_, index) => ({
          pad: index,
          notes: [36 + index],
          midi_channel: 9,
        })),
      },
    },
    velocityCurves: {
      data: {
        pads: Array.from({ length: 16 }, (_, index) => ({
          pad: index,
          curve_type: 0,
          fixed_velocity: 1,
          input_floor: 0,
          output_floor: 0,
          output_ceiling: 1,
          preview: [],
          last_velocity: 0.4,
        })),
      },
    },
    zones: {
      data: {
        pads: Array.from({ length: 16 }, (_, index) => ({
          pad: index,
          zones: [{ kind: 0, trigger_note: 36 + index, key_switch_note: -1, velocity_scale: 1, enabled: true }],
        })),
      },
    },
  })
  mockUseDrumMetering.mockReturnValue({
    data: {
      per_pad_peak: Array.from({ length: 16 }, (_, index) => (index === 0 ? 0.6 : 0.0)),
      per_pad_rms: Array(16).fill(0),
      per_bus_peak: Array.from({ length: 8 }, (_, index) => (index === 0 ? 0.7 : 0.1)),
      per_bus_rms: Array(8).fill(0),
      master_peak_left: 0.51,
      master_peak_right: 0.48,
      master_rms_left: 0.2,
      master_rms_right: 0.2,
    },
  })
  mockUseDrumSong.mockReturnValue({
    data: {
      entries: [{ pattern_id: 3, repeat_count: 2 }],
      loop: false,
    },
  })
  mockUseDrumSongTransport.mockReturnValue({
    data: {
      is_playing: true,
      current_entry_index: 0,
      current_repeat: 1,
      total_entries: 1,
      loop: false,
      active_pattern: 3,
    },
  })
  mockUseDrumPacks.mockReturnValue({
    factory: { data: [] },
    generated: { data: [] },
  })
  mockUseDrumMidiLearn.mockReturnValue({
    status: { data: { active: false, learn_all: false, active_pad_index: -1, next_pad_index: -1, last_received_note: -1, last_received_channel: -1, timeout_seconds: 10 } },
    presets: { data: { presets: ['Roland PD-140DS / CY-18DR / VH-14D'] } },
  })
  mockUseDrumMixer.mockReturnValue({
    pads: {
      data: Array.from({ length: 16 }, (_, index) => ({
        pad_id: index,
        volume: 80 - index,
        pan: 0,
        tune: 0,
        mute: false,
        solo: false,
        bus_assignment: index % 8,
      })),
    },
    buses: {
      data: Array.from({ length: 8 }, (_, index) => ({
        bus_id: index,
        name: `Bus ${index}`,
        eq: { low_gain: 0, mid_gain: 0, mid_freq: 800, high_gain: 0 },
        comp: { threshold: -18, ratio: 4, attack: 10, release: 80, makeup: 0 },
        level: 75,
        mute: false,
        solo: false,
      })),
    },
    master: { data: { volume: 80 } },
  })
  mockUseDrumPattern.mockReturnValue({ data: makePattern() })
  mockUsePatchDrumKitInstrument.mockReturnValue({ mutate: mockPatchInstrumentMutate })
  mockUseClearDrumPattern.mockReturnValue({ mutate: mockClearPatternMutate })
  mockUseCopyDrumPattern.mockReturnValue({ mutate: mockCopyPatternMutate })
  mockUseLoadDrumKit.mockReturnValue({ mutate: mockLoadKitMutate })
  mockUseSetDrumPadControl.mockReturnValue({ mutate: mockSetPadControlMutate })
  mockUseSetDrumBusMixer.mockReturnValue({ mutate: mockSetBusMixerMutate })
  mockUseSetDrumMasterVolume.mockReturnValue({ mutate: mockSetMasterVolumeMutate })
  mockUseSetDrumMidiMapping.mockReturnValue({ mutate: mockSetMidiMappingMutate })
  mockUseSetDrumMidiZones.mockReturnValue({ mutate: mockSetMidiZonesMutate })
  mockUseSetDrumVelocityCurve.mockReturnValue({ mutate: mockSetVelocityCurveMutate })
  mockUseSetDrumTrackSwing.mockReturnValue({ mutate: mockSetTrackSwingMutate })
  mockUseSetDrumTrackLength.mockReturnValue({ mutate: mockSetTrackLengthMutate })
  mockUseSetDrumPattern.mockReturnValue({ mutate: mockSetPatternMutate })
  mockUseStartDrumMidiLearn.mockReturnValue({ mutate: mockStartMidiLearnMutate })
  mockUseAddDrumSongEntry.mockReturnValue({ mutate: mockAddSongEntryMutate })
  mockUseLoadDrumMidiPreset.mockReturnValue({ mutate: mockLoadMidiPresetMutate })
  mockUsePlayDrumSongTransport.mockReturnValue({ mutate: mockPlaySongTransportMutate })
  mockUseRemoveDrumSongEntry.mockReturnValue({ mutate: mockRemoveSongEntryMutate })
  mockUseSetDrumSong.mockReturnValue({ mutate: mockSetSongMutate })
  mockUseSetDrumStep.mockReturnValue({ mutate: mockSetStepMutate })
  mockUseStopDrumMidiLearn.mockReturnValue({ mutate: mockStopMidiLearnMutate })
  mockUseStopDrumSongTransport.mockReturnValue({ mutate: mockStopSongTransportMutate })
  mockUseTriggerDrumFill.mockReturnValue({ mutate: mockTriggerFillMutate })
  mockUseUpdateDrumMachineState.mockReturnValue({ mutate: mockUpdateStateMutate })
  mockUseUpdateDrumTransport.mockReturnValue({ mutate: mockUpdateTransportMutate })
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <DrumsPage />
    </QueryClientProvider>,
  )
}

describe('DrumsPage', () => {
  beforeEach(() => {
    const ResizeObserverMock = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(window, 'ResizeObserver', {
      writable: true,
      value: ResizeObserverMock,
    })
    Object.defineProperty(globalThis, 'ResizeObserver', {
      writable: true,
      value: ResizeObserverMock,
    })
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    })
    mockSetPadControlMutate.mockReset()
    mockPatchInstrumentMutate.mockReset()
    mockClearPatternMutate.mockReset()
    mockCopyPatternMutate.mockReset()
    mockLoadKitMutate.mockReset()
    mockSetPatternMutate.mockReset()
    mockAddSongEntryMutate.mockReset()
    mockPlaySongTransportMutate.mockReset()
    mockRemoveSongEntryMutate.mockReset()
    mockSetBusMixerMutate.mockReset()
    mockSetMasterVolumeMutate.mockReset()
    mockSetMidiMappingMutate.mockReset()
    mockSetMidiZonesMutate.mockReset()
    mockSetVelocityCurveMutate.mockReset()
    mockSetSongMutate.mockReset()
    mockSetTrackSwingMutate.mockReset()
    mockSetTrackLengthMutate.mockReset()
    mockSetStepMutate.mockReset()
    mockStartMidiLearnMutate.mockReset()
    mockStopSongTransportMutate.mockReset()
    mockLoadMidiPresetMutate.mockReset()
    mockStopMidiLearnMutate.mockReset()
    mockTriggerFillMutate.mockReset()
    mockUpdateStateMutate.mockReset()
    mockUpdateTransportMutate.mockReset()
    mockUseDrumMachineState.mockReset()
    mockUseDrumTransport.mockReset()
    mockUseDrumPosition.mockReset()
    mockUseDrumActiveKit.mockReset()
    mockUseDrumKits.mockReset()
    mockUseDrumMidiMapping.mockReset()
    mockUseDrumMetering.mockReset()
    mockUseDrumSong.mockReset()
    mockUseDrumSongTransport.mockReset()
    mockUseDrumPacks.mockReset()
    mockUseDrumMidiLearn.mockReset()
    mockUseDrumMixer.mockReset()
    mockUseDrumPattern.mockReset()
    mockUsePatchDrumKitInstrument.mockReset()
    mockUseClearDrumPattern.mockReset()
    mockUseCopyDrumPattern.mockReset()
    mockUseLoadDrumKit.mockReset()
    mockUseSetDrumPadControl.mockReset()
    mockUseSetDrumBusMixer.mockReset()
    mockUseSetDrumMasterVolume.mockReset()
    mockUseSetDrumMidiMapping.mockReset()
    mockUseSetDrumMidiZones.mockReset()
    mockUseSetDrumVelocityCurve.mockReset()
    mockUseSetDrumTrackSwing.mockReset()
    mockUseSetDrumTrackLength.mockReset()
    mockUseSetDrumPattern.mockReset()
    mockUseStartDrumMidiLearn.mockReset()
    mockUseAddDrumSongEntry.mockReset()
    mockUseLoadDrumMidiPreset.mockReset()
    mockUsePlayDrumSongTransport.mockReset()
    mockUseRemoveDrumSongEntry.mockReset()
    mockUseSetDrumSong.mockReset()
    mockUseSetDrumStep.mockReset()
    mockUseStopDrumMidiLearn.mockReset()
    mockUseStopDrumSongTransport.mockReset()
    mockUseTriggerDrumFill.mockReset()
    mockUseUpdateDrumMachineState.mockReset()
    mockUseUpdateDrumTransport.mockReset()
    primeHooks()
  })

  it('renders the advanced sequencer grid from live drum data', () => {
    renderPage()

    expect(screen.getByRole('grid', { name: /tr-style drum step sequencer/i })).toBeInTheDocument()
    expect(screen.getAllByText('Kick').length).toBeGreaterThan(0)
    expect(screen.getByText('16 visible')).toBeInTheDocument()
    expect(screen.getByRole('gridcell', { name: 'Kick step 1' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('exposes skip links for the major drum page landmarks', () => {
    renderPage()

    expect(screen.getByRole('link', { name: 'Skip to transport' })).toHaveAttribute('href', '#drum-transport')
    expect(screen.getByRole('link', { name: 'Skip to modes' })).toHaveAttribute('href', '#drum-modes')
    expect(screen.getByRole('link', { name: 'Skip to status' })).toHaveAttribute('href', '#drum-footer')
  })

  it('sends accented step mutations on shift-click', () => {
    renderPage()

    fireEvent.click(screen.getByRole('gridcell', { name: 'Kick step 2' }), { shiftKey: true })

    expect(mockSetStepMutate).not.toHaveBeenCalledWith(expect.objectContaining({
      patternId: 7,
      instrument: 0,
      step: 1,
      velocity: 100,
    }))
    expect(screen.getByText('Parameter Locks')).toBeInTheDocument()
  })

  it('moves keyboard focus across the sequencer grid with arrow keys', () => {
    renderPage()

    const firstStep = screen.getByRole('gridcell', { name: 'Kick step 1' })
    const secondStep = screen.getByRole('gridcell', { name: 'Kick step 2' })

    firstStep.focus()
    fireEvent.keyDown(firstStep, { key: 'ArrowRight' })

    expect(document.activeElement).toBe(secondStep)
  })

  it('updates per-row mute controls through the pad control mutation', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Kick mute' }))

    expect(mockSetPadControlMutate).toHaveBeenCalledWith({
      padId: 0,
      params: { mute: true },
    })
  })

  it('updates per-row loop length through the track length mutation', () => {
    renderPage()

    fireEvent.change(screen.getByLabelText('Kick loop length'), { target: { value: '9' } })

    expect(mockSetTrackLengthMutate).toHaveBeenCalledWith({
      patternId: 7,
      instrument: 0,
      length: 9,
    })
  })

  it('updates parameter locks from the step editor', () => {
    renderPage()

    fireEvent.click(screen.getByRole('gridcell', { name: 'Kick step 2' }), { shiftKey: true })
    fireEvent.change(screen.getByLabelText('Step lock Pitch'), { target: { value: '4' } })

    expect(mockSetStepMutate).toHaveBeenCalledWith(expect.objectContaining({
      patternId: 7,
      instrument: 0,
      step: 1,
      velocity: 100,
      lock_pitch: 4,
    }))
  })

  it('nudges micro timing from the step editor', () => {
    renderPage()

    fireEvent.click(screen.getByRole('gridcell', { name: 'Kick step 2' }), { shiftKey: true })
    fireEvent.click(screen.getByRole('button', { name: '+6' }))

    expect(mockSetStepMutate).toHaveBeenCalledWith(expect.objectContaining({
      patternId: 7,
      instrument: 0,
      step: 1,
      micro_timing: 6,
    }))
  })

  it('updates step probability from the step editor', () => {
    renderPage()

    fireEvent.click(screen.getByRole('gridcell', { name: 'Kick step 2' }), { shiftKey: true })
    fireEvent.change(screen.getByLabelText('Step probability'), { target: { value: '0.35' } })

    expect(mockSetStepMutate).toHaveBeenCalledWith(expect.objectContaining({
      patternId: 7,
      instrument: 0,
      step: 1,
      probability: 0.35,
      velocity: 100,
    }))
  })

  it('commits renamed instrument labels through the kit patch mutation', () => {
    renderPage()

    const nameInput = screen.getByLabelText('Kick name')
    fireEvent.change(nameInput, { target: { value: 'Kick Main' } })
    fireEvent.blur(nameInput)

    expect(mockPatchInstrumentMutate).toHaveBeenCalledWith({
      kitId: 'studio',
      padId: 0,
      patch: { name: 'Kick Main' },
    })
  })

  it('copies and clears pattern slots from the management panel', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))
    fireEvent.click(screen.getByRole('button', { name: 'Trigger Fill' }))
    fireEvent.click(screen.getByText('Clear').closest('button') as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: /clear pattern/i }))

    expect(mockCopyPatternMutate).toHaveBeenCalledWith({
      sourcePatternId: 7,
      destinationPatternId: 8,
    })
    expect(mockTriggerFillMutate).toHaveBeenCalled()
    expect(mockClearPatternMutate).toHaveBeenCalledWith(8)
  })

  it('adds and removes song entries from the arranger panel', () => {
    renderPage()

    fireEvent.change(screen.getByLabelText('Song entry pattern'), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText('Song entry repeats'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Entry' }))
    fireEvent.click(screen.getByRole('button', { name: 'Play Song' }))
    fireEvent.click(screen.getByRole('button', { name: 'Stop Song' }))
    fireEvent.click(screen.getAllByRole('button').find((button) => button.textContent?.includes('Remove')) as HTMLElement)

    expect(mockAddSongEntryMutate).toHaveBeenCalledWith({
      pattern_id: 12,
      repeat_count: 3,
    })
    expect(mockPlaySongTransportMutate).toHaveBeenCalled()
    expect(mockStopSongTransportMutate).toHaveBeenCalled()
    expect(mockRemoveSongEntryMutate).toHaveBeenCalledWith(0)
  })

  it('loads kits through the browser confirmation flow', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Load kit Electro' }))
    fireEvent.click(screen.getByText('Load Kit').closest('button') as HTMLElement)

    expect(mockLoadKitMutate).toHaveBeenCalledWith('electro')
  })

  it('updates bus mixer and master output controls', () => {
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Bus 0 mute' }))
    fireEvent.change(screen.getByLabelText('Bus 0 Level'), { target: { value: '64' } })
    fireEvent.change(screen.getByLabelText('Mixer master volume'), { target: { value: '72' } })

    expect(mockSetBusMixerMutate).toHaveBeenCalledWith({
      busId: 0,
      params: {
        level: undefined,
        mute: true,
        solo: undefined,
        eq: undefined,
        comp: undefined,
      },
    })
    expect(mockSetBusMixerMutate).toHaveBeenCalledWith({
      busId: 0,
      params: {
        level: 64,
        mute: undefined,
        solo: undefined,
        eq: undefined,
        comp: undefined,
      },
    })
    expect(mockSetMasterVolumeMutate).toHaveBeenCalledWith(72)
  })

  it('switches to practice mode and updates rehearsal controls', () => {
    renderPage()

    fireEvent.click(screen.getByRole('tab', { name: 'Practice' }))
    fireEvent.click(screen.getByRole('button', { name: /rock 8/i }))
    fireEvent.change(screen.getByLabelText('Practice count-in bars'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Auto Fill Off' }))

    expect(mockUpdateStateMutate).toHaveBeenCalledWith({ ui_mode: 'practice' })
    expect(mockUpdateStateMutate).toHaveBeenCalledWith({ practice_style_id: 'rock_8' })
    expect(mockUpdateStateMutate).toHaveBeenCalledWith({ practice_count_in_bars: 2 })
    expect(mockUpdateStateMutate).toHaveBeenCalledWith({ practice_auto_fill: true })
  })

  it('announces transport and mode changes through the live region', () => {
    renderPage()

    const liveRegion = screen.getByRole('status')
    const transport = screen.getByLabelText('Drum transport')
    expect(liveRegion).toHaveTextContent('Drum machine workspace ready.')

    fireEvent.click(within(transport).getByRole('button', { name: 'Pause' }))
    expect(liveRegion).toHaveTextContent('Transport paused.')

    fireEvent.click(screen.getByRole('tab', { name: 'Practice' }))
    expect(liveRegion).toHaveTextContent('Practice mode selected.')
  })

  it('shows the backing track browser and filters tracks', () => {
    renderPage()

    fireEvent.click(screen.getByRole('tab', { name: 'Backing Tracks' }))

    const table = screen.getByRole('table', { name: 'Backing track browser' })
    expect(table).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Backing track search'), { target: { value: 'Copper' } })
    expect(table).toHaveTextContent('Copper Shuffle')
    expect(table).not.toHaveTextContent('Midnight Motor')
  })

  it('updates midi mapping, learning, and preset flows from the advanced panel', () => {
    renderPage()

    fireEvent.change(screen.getByLabelText('Pad 1 MIDI note'), { target: { value: '48' } })
    fireEvent.change(screen.getByLabelText('Pad 1 velocity curve'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Pad 1 head zone note'), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Learn Pad 1' }))

    expect(mockSetMidiMappingMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        global_midi_channel: 10,
        pads: expect.arrayContaining([expect.objectContaining({ pad: 0, notes: [48] })]),
      }),
    )
    expect(mockSetVelocityCurveMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        padId: 0,
        curve: expect.objectContaining({ curve_type: 3 }),
      }),
    )
    expect(mockSetMidiZonesMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        pads: expect.arrayContaining([expect.objectContaining({
          pad: 0,
          zones: expect.arrayContaining([expect.objectContaining({ trigger_note: 50 })]),
        })]),
      }),
    )
    expect(mockStartMidiLearnMutate).toHaveBeenCalledWith(0)
  })
})
