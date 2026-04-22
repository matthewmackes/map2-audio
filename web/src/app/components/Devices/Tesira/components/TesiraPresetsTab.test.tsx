import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { TesiraPresetsTab } from './TesiraPresetsTab'

const mockRecallPreset = jest.fn()
const mockAddRule = jest.fn()
const mockDeleteRule = jest.fn()
let reversePresetHandler: ((event: {
  device_id: string
  preset_index: number
  matched: boolean
  map2_preset_ids: number[]
}) => void) | null = null

jest.mock('../hooks/useTesiraApi', () => ({
  useTesiraPresets: () => ({
    data: [
      { index: 7, name: 'Scene Recall' },
    ],
    isLoading: false,
  }),
  useRecallPreset: () => ({
    mutate: mockRecallPreset,
    isPending: false,
  }),
  usePresetInterlockRules: () => ({
    data: [
      { id: 1, map2_preset_id: 101, tesira_device_id: 'tesira-1', tesira_preset_index: 7 },
    ],
  }),
  useAddInterlockRule: () => ({
    mutate: mockAddRule,
    isPending: false,
    isError: false,
  }),
  useDeleteInterlockRule: () => ({
    mutate: mockDeleteRule,
    isPending: false,
  }),
}))

jest.mock('../hooks/useTesiraWebSocket', () => ({
  useTesiraReversePresetSync: (handler: (event: {
    device_id: string
    preset_index: number
    matched: boolean
    map2_preset_ids: number[]
  }) => void) => {
    reversePresetHandler = handler
  },
}))

describe('TesiraPresetsTab', () => {
  beforeAll(() => {
    if (typeof window.matchMedia !== 'function') {
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
    }

    if (typeof window.ResizeObserver === 'undefined') {
      Object.defineProperty(window, 'ResizeObserver', {
        writable: true,
        value: class ResizeObserver {
          observe() {}
          unobserve() {}
          disconnect() {}
        },
      })
    }
  })

  beforeEach(() => {
    mockRecallPreset.mockReset()
    mockAddRule.mockReset()
    mockDeleteRule.mockReset()
    reversePresetHandler = null
  })

  it('recalls a Tesira preset from the Carbon preset list', () => {
    render(<TesiraPresetsTab deviceId="tesira-1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Recall' }))

    expect(mockRecallPreset).toHaveBeenCalledWith({
      deviceId: 'tesira-1',
      presetIndex: 7,
    })
  })

  it('adds a MAP2-to-Tesira interlock rule from the Carbon form', async () => {
    render(<TesiraPresetsTab deviceId="tesira-1" />)

    fireEvent.change(screen.getByLabelText('MAP2 Preset ID'), {
      target: { value: '202' },
    })
    fireEvent.change(screen.getByLabelText('Tesira Preset #'), {
      target: { value: '8' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add rule' }))

    await waitFor(() => {
      expect(mockAddRule).toHaveBeenCalledWith({
        map2_preset_id: 202,
        tesira_device_id: 'tesira-1',
        tesira_preset_index: 8,
      })
    })
  })

  it('surfaces reverse preset sync updates for the active device', async () => {
    render(<TesiraPresetsTab deviceId="tesira-1" />)

    act(() => {
      reversePresetHandler?.({
        device_id: 'tesira-1',
        preset_index: 7,
        matched: true,
        map2_preset_ids: [101],
      })
    })

    await waitFor(() => {
      expect(screen.getByText(/Tesira preset 7 changed on-device/i)).toBeTruthy()
      expect(screen.getByText(/Mapped MAP2 preset IDs: 101/i)).toBeTruthy()
    })
  })
})
