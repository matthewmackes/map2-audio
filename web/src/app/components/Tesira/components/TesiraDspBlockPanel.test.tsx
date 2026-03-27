import React from 'react'
import { render, screen } from '@testing-library/react'
import { TesiraDspBlockPanel } from './TesiraDspBlockPanel'

jest.mock('../hooks/useTesiraApi', () => ({
  useTesiraDspBlock: () => ({
    data: {
      instance_tag: 'MatrixMixer1',
      editor: { family: 'matrix' },
      parameter_map: {
        crosspointLevelOut: { value_type: 'FLOAT' },
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
    refetch: jest.fn().mockResolvedValue(undefined),
  }),
  useSetTesiraDspParam: () => ({
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    isPending: false,
  }),
}))

describe('TesiraDspBlockPanel', () => {
  it('shows crosspoint helper for matrix-style families', () => {
    render(<TesiraDspBlockPanel deviceId="tesira_1" instanceTag="MatrixMixer1" />)
    expect(screen.getByText('Crosspoint helper')).toBeTruthy()
    expect(screen.getByText('Apply gain')).toBeTruthy()
  })
})
