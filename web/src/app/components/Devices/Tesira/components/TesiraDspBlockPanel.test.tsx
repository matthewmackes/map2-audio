import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TesiraDspBlockPanel } from './TesiraDspBlockPanel'

const mockRefetch = jest.fn().mockResolvedValue(undefined)
const mockSetTesiraDspParamMutateAsync = jest.fn().mockResolvedValue(undefined)

jest.mock('../hooks/useTesiraApi', () => ({
  useTesiraDspBlock: () => ({
    data: {
      instance_tag: 'MatrixMixer1',
      editor: { family: 'matrix' },
      parameter_map: {
        crosspointLevelOut: { value_type: 'FLOAT', min_value: -60, max_value: 12, step: 0.5 },
        crosspointMute: { value_type: 'BOOL' },
      },
    },
    isLoading: false,
    error: null,
  }),
  useTesiraDspParams: () => ({
    data: {
      values: {
        crosspointLevelOut: -6,
        crosspointMute: false,
      },
    },
    isLoading: false,
    error: null,
    refetch: mockRefetch,
  }),
  useSetTesiraDspParam: () => ({
    mutateAsync: mockSetTesiraDspParamMutateAsync,
    isPending: false,
  }),
}))

describe('TesiraDspBlockPanel', () => {
  beforeEach(() => {
    mockRefetch.mockClear()
    mockSetTesiraDspParamMutateAsync.mockClear()
  })

  it('shows crosspoint helper for matrix-style families', () => {
    render(<TesiraDspBlockPanel deviceId="tesira_1" instanceTag="MatrixMixer1" />)
    expect(screen.getByText('Crosspoint helper')).toBeTruthy()
    expect(screen.getByText('Apply gain')).toBeTruthy()
  })

  it('applies the staged crosspoint gain through the shared numeric control', async () => {
    render(<TesiraDspBlockPanel deviceId="tesira_1" instanceTag="MatrixMixer1" />)

    const gainInput = screen.getByRole('slider', { name: 'Gain dB' })
    fireEvent.focus(gainInput)
    fireEvent.change(gainInput, { target: { value: '-3.5' } })
    fireEvent.blur(gainInput)
    fireEvent.click(screen.getByRole('button', { name: 'Apply gain' }))

    await waitFor(() => {
      expect(mockSetTesiraDspParamMutateAsync).toHaveBeenCalledWith({
        deviceId: 'tesira_1',
        instanceTag: 'MatrixMixer1',
        attribute: 'crosspointLevelOut',
        value: -3.5,
        args: [1, 1],
      })
    })

    expect(mockRefetch).toHaveBeenCalled()
  })
})
