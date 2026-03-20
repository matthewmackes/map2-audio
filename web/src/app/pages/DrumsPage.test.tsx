import '@testing-library/jest-dom'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'

import { DrumsPage } from './DrumsPage'

const mockSetStepMutate = jest.fn()
const mockUpdateStateMutate = jest.fn()
const mockUpdateTransportMutate = jest.fn()

const mockUseDrumMachineState = jest.fn()
const mockUseDrumTransport = jest.fn()
const mockUseDrumActiveKit = jest.fn()
const mockUseDrumPacks = jest.fn()
const mockUseDrumMidiLearn = jest.fn()
const mockUseDrumPattern = jest.fn()
const mockUseSetDrumStep = jest.fn()
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
  useDrumActiveKit: () => mockUseDrumActiveKit(),
  useDrumPacks: () => mockUseDrumPacks(),
  useDrumMidiLearn: () => mockUseDrumMidiLearn(),
  useDrumPattern: (patternId: number) => mockUseDrumPattern(patternId),
  useSetDrumStep: () => mockUseSetDrumStep(),
  useUpdateDrumMachineState: () => mockUseUpdateDrumMachineState(),
  useUpdateDrumTransport: () => mockUseUpdateDrumTransport(),
}))

function makePattern() {
  return {
    pattern_id: 7,
    length: 16,
    variation: 1,
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
    },
  })
  mockUseDrumActiveKit.mockReturnValue({ data: makeKit() })
  mockUseDrumPacks.mockReturnValue({
    factory: { data: [] },
    generated: { data: [] },
  })
  mockUseDrumMidiLearn.mockReturnValue({
    status: { data: { active: false, active_pad_index: null } },
    presets: { data: [] },
  })
  mockUseDrumPattern.mockReturnValue({ data: makePattern() })
  mockUseSetDrumStep.mockReturnValue({ mutate: mockSetStepMutate })
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
    mockSetStepMutate.mockReset()
    mockUpdateStateMutate.mockReset()
    mockUpdateTransportMutate.mockReset()
    mockUseDrumMachineState.mockReset()
    mockUseDrumTransport.mockReset()
    mockUseDrumActiveKit.mockReset()
    mockUseDrumPacks.mockReset()
    mockUseDrumMidiLearn.mockReset()
    mockUseDrumPattern.mockReset()
    mockUseSetDrumStep.mockReset()
    mockUseUpdateDrumMachineState.mockReset()
    mockUseUpdateDrumTransport.mockReset()
    primeHooks()
  })

  it('renders the advanced sequencer grid from live drum data', () => {
    renderPage()

    expect(screen.getByRole('grid', { name: /tr-style drum step sequencer/i })).toBeInTheDocument()
    expect(screen.getByText('Kick')).toBeInTheDocument()
    expect(screen.getByText('16 visible')).toBeInTheDocument()
    expect(screen.getByRole('gridcell', { name: 'Kick step 1' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('sends accented step mutations on shift-click', () => {
    renderPage()

    fireEvent.click(screen.getByRole('gridcell', { name: 'Kick step 2' }), { shiftKey: true })

    expect(mockSetStepMutate).toHaveBeenCalledWith({
      patternId: 7,
      instrument: 0,
      step: 1,
      velocity: 100,
      accent: true,
    })
  })
})
