import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { TesiraDspExplorer } from './TesiraDspExplorer'

jest.mock('../hooks/useTesiraApi', () => ({
  useTesiraDspBlocks: () => ({
    data: [
      { instance_tag: 'LevelControl1', block_type: 'LEVEL', channel_count: 2, parameter_map: { level: {} }, is_probed: true, last_probed_at: null },
      { instance_tag: 'Mixer1', block_type: 'MIXER', channel_count: 4, parameter_map: { crosspointLevelOut: {} }, is_probed: true, last_probed_at: null },
    ],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
  useProbeTesiraDsp: () => ({
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    isPending: false,
    isError: false,
    error: null,
    data: null,
  }),
}))

jest.mock('./TesiraDspProbeDialog', () => ({
  TesiraDspProbeDialog: () => null,
}))

jest.mock('./TesiraDspBlockPanel', () => ({
  TesiraDspBlockPanel: ({ instanceTag }: { instanceTag: string }) => (
    <div data-testid="dsp-block-panel">{instanceTag}</div>
  ),
}))

describe('TesiraDspExplorer', () => {
  it('renders discovered blocks and selects a block', () => {
    render(<TesiraDspExplorer deviceId="tesira_1" />)

    expect(screen.getAllByText('LevelControl1').length).toBeGreaterThan(0)
    expect(screen.getByText('Mixer1')).toBeTruthy()

    fireEvent.click(screen.getByText('Mixer1'))
    expect(screen.getByTestId('dsp-block-panel').textContent).toContain('Mixer1')
  })
})
