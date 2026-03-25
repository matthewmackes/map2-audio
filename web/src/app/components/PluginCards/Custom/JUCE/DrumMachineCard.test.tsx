import '@testing-library/jest-dom'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { DrumMachineCard } from './DrumMachineCard'

const mockGetState = jest.fn()
const mockUpdateState = jest.fn()
const mockGetTransport = jest.fn()
const mockTapTempo = jest.fn()
const mockGetPattern = jest.fn()
const mockGetActiveKit = jest.fn()
const mockGetMetering = jest.fn()

jest.mock('../../Base/PluginCardShell', () => ({
  PluginCardShell: ({ plugin, visualization, children, footer }: any) => (
    <section aria-label={`${plugin.name} shell`}>
      <div>{visualization}</div>
      <div>{children}</div>
      <footer>{footer}</footer>
    </section>
  ),
}))

jest.mock('../../withMidiDialog', () => ({
  withMidiDialog: (Component: React.ComponentType<any>) => Component,
}))

jest.mock('./DrumMachineWorkspaceModal', () => ({
  DrumMachineWorkspaceModal: ({ open, mode }: { open: boolean; mode: string }) =>
    open ? <div data-testid="drum-workspace-modal">{mode}</div> : null,
}))

jest.mock('@/map2/api', () => ({
  drumsApi: {
    getState: () => mockGetState(),
    updateState: (...args: any[]) => mockUpdateState(...args),
    getTransport: () => mockGetTransport(),
    tapTempo: (...args: any[]) => mockTapTempo(...args),
    getPattern: (...args: any[]) => mockGetPattern(...args),
    getActiveKit: () => mockGetActiveKit(),
    getMetering: () => mockGetMetering(),
  },
}))

jest.mock('@/map2/drumMachineState', () => ({
  normalizeDrumMachineState: (state: Record<string, unknown> | undefined) => ({
    ui_mode: 'advanced',
    bpm: 120,
    volume: 80,
    pattern: 7,
    variation: 1,
    transport: true,
    swing: 0,
    active_pack: null,
    practice_style_id: null,
    practice_variation: 0,
    practice_change_quantization: 1,
    practice_count_in_bars: 0,
    practice_auto_fill: false,
    ...state,
  }),
}))

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  })
}

function makePlugin() {
  return {
    uri: 'map2://juce/drums',
    name: 'Drum Machine',
    author: 'MAP2',
    category: 'Instrument',
    class_label: 'Instrument',
    version: '1.0',
    license: 'AGPL-3.0-only',
    has_ui: false,
    in_ports: 2,
    out_ports: 2,
    parameters: [],
  }
}

function primeApi() {
  mockGetState.mockResolvedValue({
    ui_mode: 'advanced',
    bpm: 123,
    volume: 80,
    pattern: 7,
    variation: 2,
    transport: true,
    swing: 10,
    active_pack: null,
    practice_style_id: null,
    practice_variation: 0,
    practice_change_quantization: 1,
    practice_count_in_bars: 0,
    practice_auto_fill: false,
  })
  mockGetTransport.mockResolvedValue({
    is_playing: true,
    bpm: 123,
    pattern: 7,
    variation: 2,
    swing: 10,
  })
  mockGetPattern.mockResolvedValue({
    pattern_id: 7,
    length: 16,
    variation: 2,
    steps: Array.from({ length: 16 }, (_, instrument) =>
      Array.from({ length: 16 }, (_, step) => ({
        active: instrument === 0 ? step % 4 === 0 : false,
        velocity: step % 4 === 0 ? 100 : 0,
        accent: step === 8,
      })),
    ),
  })
  mockGetActiveKit.mockResolvedValue({
    kit_id: 'studio',
    name: 'Studio',
    description: 'Studio kit',
    author: 'MAP2',
    category: 'Acoustic',
    instruments: Array.from({ length: 16 }, (_, index) => ({
      pad_id: index,
      name: index === 0 ? 'Kick' : `Pad ${index + 1}`,
      sfz_path: `kit/pad-${index + 1}.sfz`,
      default_note: 36 + index,
      bus_assignment: index % 8,
      volume: 80,
      pan: 0,
      tune: 0,
      mute: false,
      solo: false,
    })),
  })
  mockGetMetering.mockResolvedValue({
    per_pad_peak: [0.8, 0.1, 0.05, 0.03, ...Array(12).fill(0)],
    per_pad_rms: Array(16).fill(0),
    per_bus_peak: [0.7, 0.45, 0.2, 0.1, 0, 0, 0, 0],
    per_bus_rms: Array(8).fill(0),
    master_peak_left: 0.5,
    master_peak_right: 0.5,
    master_rms_left: 0.2,
    master_rms_right: 0.2,
  })
  mockUpdateState.mockResolvedValue({ status: 'ok' })
  mockTapTempo.mockResolvedValue({ tempo: 123, taps: 3 })
}

function renderCard() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <DrumMachineCard
        plugin={makePlugin()}
        parameterValues={{}}
        onParameterChange={jest.fn()}
        accentColor="#24a148"
      />
    </QueryClientProvider>,
  )
}

describe('DrumMachineCard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    window.history.replaceState({}, '', '/')
    primeApi()
  })

  it('renders the compact transport, step indicator, and footer summary', async () => {
    renderCard()

    await waitFor(() => expect(screen.getByText('123')).toBeInTheDocument())

    expect(screen.getByLabelText('Active pattern label')).toHaveTextContent('P008 · Var 2')
    expect(screen.getByText('Kick')).toBeInTheDocument()
    expect(screen.getByLabelText('Bus 1 level')).toBeInTheDocument()
    expect(screen.getByLabelText('Active kit name')).toHaveTextContent('Studio')
    expect(screen.getByLabelText('Step 1 active')).toBeInTheDocument()
  })

  it('toggles transport and records tap tempo events', async () => {
    renderCard()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop drum transport' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Stop drum transport' }))
    fireEvent.click(screen.getByRole('button', { name: 'Tap tempo' }))

    expect(mockUpdateState).toHaveBeenCalledWith({ transport: false })
    expect(mockTapTempo).toHaveBeenCalled()
  })

  it('opens the full workspace modal for the selected mode and keeps the standalone page optional', async () => {
    renderCard()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Open Practice mode' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Open Practice mode' }))

    expect(mockUpdateState).toHaveBeenCalledWith({ ui_mode: 'practice' })
    expect(screen.getByTestId('drum-workspace-modal')).toHaveTextContent('practice')
    expect(window.location.pathname).toBe('/')
  })

  it('still offers a direct route to the standalone drums page', async () => {
    renderCard()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Open full drums page' })).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Open full drums page' }))

    expect(window.location.pathname).toBe('/drums')
    expect(window.location.search).toBe('?mode=advanced')
  })
})
