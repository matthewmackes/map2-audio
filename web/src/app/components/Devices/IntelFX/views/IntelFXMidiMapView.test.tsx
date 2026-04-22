import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { IntelFXMidiMapView } from './IntelFXMidiMapView'

const mockGetMidiMaps = jest.fn()
const mockActivateMidiMap = jest.fn().mockResolvedValue(undefined)
const mockDeleteMidiMap = jest.fn().mockResolvedValue(undefined)
const mockSaveMidiMap = jest.fn().mockResolvedValue(undefined)
const mockSetMidiLearnTarget = jest.fn().mockResolvedValue(undefined)
const mockSetLcdText = jest.fn()
const mockUseIntelFXPageContext = jest.fn()

jest.mock('../../../../../map2/intelfxApi', () => ({
  intelfxApi: {
    getMidiMaps: (...args: unknown[]) => mockGetMidiMaps(...args),
    activateMidiMap: (...args: unknown[]) => mockActivateMidiMap(...args),
    deleteMidiMap: (...args: unknown[]) => mockDeleteMidiMap(...args),
    saveMidiMap: (...args: unknown[]) => mockSaveMidiMap(...args),
    setMidiLearnTarget: (...args: unknown[]) => mockSetMidiLearnTarget(...args),
  },
}))

jest.mock('../IntelFXShell', () => ({
  useIntelFXPageContext: () => mockUseIntelFXPageContext(),
}))

describe('IntelFXMidiMapView accessibility', () => {
  beforeEach(() => {
    mockGetMidiMaps.mockReset()
    mockActivateMidiMap.mockReset()
    mockDeleteMidiMap.mockReset()
    mockSaveMidiMap.mockReset()
    mockSetMidiLearnTarget.mockReset()
    mockSetLcdText.mockReset()
    mockUseIntelFXPageContext.mockReset()

    mockUseIntelFXPageContext.mockReturnValue({
      nodeId: null,
      setLcdText: mockSetLcdText,
      intelfx: {
        registry: {
          params: [
            {
              id: 'program.mix',
              display_name: 'Mix level',
              range: { min: 0, max: 127 },
            },
          ],
        },
      },
    })

    mockGetMidiMaps.mockResolvedValue({
      active_map_id: 'map-1',
      learn_target_param_id: 'program.mix',
      count: 2,
      maps: [
        {
          id: 'map-1',
          name: 'Primary map',
          mappings: [
            {
              id: 'm-1',
              cc: 12,
              channel: 1,
              target_param_id: 'program.mix',
              source_min: 0,
              source_max: 127,
              target_min: 0,
              target_max: 127,
              curve: 'linear',
              smoothing_ms: 0,
              polarity: 'normal',
              mode: 'continuous',
              enabled: true,
            },
          ],
        },
        {
          id: 'map-2',
          name: 'Backup map',
          mappings: [],
        },
      ],
    })
  })

  it('renders labeled controls and accessible map actions', async () => {
    render(<IntelFXMidiMapView />)

    await waitFor(() => {
      expect(mockGetMidiMaps).toHaveBeenCalledWith(null)
    })

    expect(screen.getByRole('heading', { name: /midi mapper/i })).toBeTruthy()
    expect(screen.getByLabelText('New MIDI map name')).toBeTruthy()
    expect(screen.getByRole('button', { name: /delete map/i })).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Active map'), { target: { value: 'map-2' } })
    await waitFor(() => {
      expect(mockActivateMidiMap).toHaveBeenCalledWith('map-2', null)
    })
    expect(mockSetLcdText).toHaveBeenCalledWith('MIDI MAP ACTIVATED')

    fireEvent.click(screen.getByRole('button', { name: 'Armed' }))
    await waitFor(() => {
      expect(mockSetMidiLearnTarget).toHaveBeenCalledWith(null, null)
    })
    expect(mockSetLcdText).toHaveBeenCalledWith('MIDI LEARN OFF')
  })

  it('keeps create action disabled until the map name is non-empty', async () => {
    render(<IntelFXMidiMapView />)

    await waitFor(() => {
      expect(mockGetMidiMaps).toHaveBeenCalledWith(null)
    })

    const createButton = screen.getByRole('button', { name: 'Create map' }) as HTMLButtonElement
    expect(createButton.disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('New MIDI map name'), { target: { value: 'My map' } })
    expect(createButton.disabled).toBe(false)
  })
})
