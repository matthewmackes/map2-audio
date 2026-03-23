import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { TesiraQuickCommandPanel } from './TesiraQuickCommandPanel'

const mockMutateAsync = jest.fn()
const mockProbeAsync = jest.fn()

jest.mock('../hooks/useTesiraApi', () => ({
  useTesiraDspBlocks: () => ({
    data: [
      {
        instance_tag: 'LevelControl1',
        block_type: 'LEVEL',
        channel_count: 2,
        parameter_map: { level: {}, mute: {} },
        is_probed: true,
        last_probed_at: null,
      },
    ],
    isLoading: false,
  }),
  useProbeTesiraDsp: () => ({
    mutateAsync: mockProbeAsync,
    isPending: false,
  }),
  useSendTesiraCommand: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
    isError: false,
    error: null,
  }),
}))

describe('TesiraQuickCommandPanel', () => {
  beforeEach(() => {
    mockMutateAsync.mockReset()
    mockProbeAsync.mockReset()
  })

  it('sends raw TTP commands from the dedicated dashboard panel', async () => {
    mockMutateAsync.mockResolvedValue({
      ok: true,
      command: 'DEVICE get hostname',
      raw: '+OK value="TesiraFORTE-1"',
      value: 'TesiraFORTE-1',
      message: 'Command succeeded',
    })

    render(<TesiraQuickCommandPanel deviceId="tesira-1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Hostname' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send command' }))

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        deviceId: 'tesira-1',
        command: 'DEVICE get hostname',
      })
    })

    await waitFor(() => {
      const responseField = screen.getByLabelText('Latest response') as HTMLInputElement | HTMLTextAreaElement
      expect(responseField.value).toContain('+OK value="TesiraFORTE-1"')
      expect(responseField.value).toContain('TesiraFORTE-1')
    })
  })

  it('uses discovered instance tags as command shortcuts', () => {
    render(<TesiraQuickCommandPanel deviceId="tesira-1" />)

    fireEvent.click(screen.getByText('LevelControl1'))

    expect(screen.getByDisplayValue('LevelControl1 get level')).toBeTruthy()
  })
})
