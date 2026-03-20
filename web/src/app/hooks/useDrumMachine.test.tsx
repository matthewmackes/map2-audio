import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'

import { drumsApi } from '@/map2/api'
import {
  useDrumKits,
  useDrumMidiLearn,
  useDrumMixer,
  useDrumPattern,
  usePatchDrumKitInstrument,
} from './useDrumMachine'

jest.mock('@/map2/api', () => ({
  drumsApi: {
    getState: jest.fn(),
    updateState: jest.fn(),
    getTransport: jest.fn(),
    setTransport: jest.fn(),
    getPattern: jest.fn(),
    setPattern: jest.fn(),
    setStep: jest.fn(),
    clearPattern: jest.fn(),
    copyPattern: jest.fn(),
    getSong: jest.fn(),
    setSong: jest.fn(),
    addSongEntry: jest.fn(),
    removeSongEntry: jest.fn(),
    getFactoryPacks: jest.fn(),
    getGeneratedPacks: jest.fn(),
    getKits: jest.fn(),
    getActiveKit: jest.fn(),
    loadKit: jest.fn(),
    patchKitInstrument: jest.fn(),
    getPadControls: jest.fn(),
    setPadControl: jest.fn(),
    getBusMixer: jest.fn(),
    setBusMixer: jest.fn(),
    getMasterVolume: jest.fn(),
    setMasterVolume: jest.fn(),
    getMetering: jest.fn(),
    getMidiMapping: jest.fn(),
    setMidiMapping: jest.fn(),
    getVelocityCurves: jest.fn(),
    setVelocityCurve: jest.fn(),
    startMidiLearn: jest.fn(),
    stopMidiLearn: jest.fn(),
    getMidiLearnStatus: jest.fn(),
    getMidiPresets: jest.fn(),
    loadMidiPreset: jest.fn(),
  },
}))

const mockDrumsApi = drumsApi as jest.Mocked<typeof drumsApi>

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  })

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useDrumMachine hooks', () => {
  beforeEach(() => {
    Object.values(mockDrumsApi).forEach((fn) => fn.mockReset())
  })

  it('loads a drum pattern by id', async () => {
    mockDrumsApi.getPattern.mockResolvedValue({
      pattern_id: 7,
      length: 16,
      variation: 0,
      steps: [],
    })

    const { result } = renderHook(() => useDrumPattern(7), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockDrumsApi.getPattern).toHaveBeenCalledWith(7)
    expect(result.current.data?.pattern_id).toBe(7)
  })

  it('loads the kit list with the expected query', async () => {
    mockDrumsApi.getKits.mockResolvedValue([
      {
        kit_id: 'studio',
        name: 'Studio',
        description: '',
        author: 'MAP2',
        category: 'Acoustic',
        instruments: [],
      },
    ])

    const { result } = renderHook(() => useDrumKits(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockDrumsApi.getKits).toHaveBeenCalledTimes(1)
    expect(result.current.data?.[0].kit_id).toBe('studio')
  })

  it('returns grouped mixer queries', async () => {
    mockDrumsApi.getPadControls.mockResolvedValue([{ pad_id: 0, volume: 80, pan: 0, tune: 0, mute: false, solo: false, bus_assignment: 0 }])
    mockDrumsApi.getBusMixer.mockResolvedValue([{ bus_id: 0, name: 'Bus A', eq: { low_gain: 0, mid_gain: 0, mid_freq: 1000, high_gain: 0 }, comp: { threshold: -12, ratio: 4, attack: 10, release: 100, makeup: 0 }, level: 80, mute: false, solo: false }])
    mockDrumsApi.getMasterVolume.mockResolvedValue({ volume: 75 })

    const { result } = renderHook(() => useDrumMixer(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.pads.isSuccess).toBe(true))
    await waitFor(() => expect(result.current.buses.isSuccess).toBe(true))
    await waitFor(() => expect(result.current.master.isSuccess).toBe(true))

    expect(result.current.pads.data?.[0].pad_id).toBe(0)
    expect(result.current.buses.data?.[0].name).toBe('Bus A')
    expect(result.current.master.data?.volume).toBe(75)
  })

  it('loads MIDI learn status and presets together', async () => {
    mockDrumsApi.getMidiLearnStatus.mockResolvedValue({
      active: true,
      active_pad_id: 3,
      last_received_note: 38,
      last_received_channel: 10,
    })
    mockDrumsApi.getMidiPresets.mockResolvedValue([
      {
        preset_id: 'roland-vad',
        name: 'Roland VAD',
        manufacturer: 'Roland',
        description: 'Default Roland note map',
      },
    ])

    const { result } = renderHook(() => useDrumMidiLearn(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.status.isSuccess).toBe(true))
    await waitFor(() => expect(result.current.presets.isSuccess).toBe(true))

    expect(result.current.status.data?.active_pad_id).toBe(3)
    expect(result.current.presets.data?.[0].preset_id).toBe('roland-vad')
  })

  it('patches a kit instrument through the dedicated mutation hook', async () => {
    mockDrumsApi.patchKitInstrument.mockResolvedValue({
      kit_id: 'studio',
      name: 'Studio',
      description: '',
      author: 'MAP2',
      category: 'Acoustic',
      instruments: [],
    })

    const { result } = renderHook(() => usePatchDrumKitInstrument(), { wrapper: makeWrapper() })

    result.current.mutate({
      kitId: 'studio',
      padId: 2,
      patch: { name: 'Snare Rim' },
    })

    await waitFor(() => expect(mockDrumsApi.patchKitInstrument).toHaveBeenCalledWith('studio', 2, { name: 'Snare Rim' }))
  })
})
