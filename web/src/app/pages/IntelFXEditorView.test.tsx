import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { IntelFXEditorView } from './IntelFXEditorView'

const mockSetParam = jest.fn().mockResolvedValue(undefined)
const mockUseIntelFXPageContext = jest.fn()

jest.mock('./IntelFXPage', () => ({
  useIntelFXPageContext: () => mockUseIntelFXPageContext(),
}))

describe('IntelFXEditorView accessibility', () => {
  beforeEach(() => {
    mockSetParam.mockReset()
    mockSetParam.mockResolvedValue(undefined)
    mockUseIntelFXPageContext.mockReset()
  })

  it('shows loading semantics while registry data is unavailable', () => {
    mockUseIntelFXPageContext.mockReturnValue({
      intelfx: {
        registry: null,
        shadow: {},
        setParam: mockSetParam,
      },
    })

    render(<IntelFXEditorView />)

    expect(screen.getByText('Loading IntelFX registry...')).toBeTruthy()
  })

  it('renders labeled controls and updates params via checkbox/select inputs', async () => {
    mockUseIntelFXPageContext.mockReturnValue({
      intelfx: {
        registry: {
          params: [
            {
              id: 'compressor.enabled',
              address_bytes: [0, 0, 0, 0],
              display_name: 'Compressor enabled',
              block: 'compressor',
              algorithm: 'default',
              type: 'bool',
              range: { min: 0, max: 1 },
              default: 0,
              units: '',
              log_taper: false,
              widget: 'switch',
              page: 'editor',
              realtime_safe: true,
              panel_control: 'none',
            },
            {
              id: 'delay.mode',
              address_bytes: [0, 0, 0, 0],
              display_name: 'Delay mode',
              block: 'delay',
              algorithm: 'default',
              type: 'enum',
              range: { min: 0, max: 2 },
              default: 0,
              units: '',
              log_taper: false,
              widget: 'select',
              page: 'editor',
              realtime_safe: true,
              panel_control: 'none',
            },
            {
              id: 'delay.time',
              address_bytes: [0, 0, 0, 0],
              display_name: 'Delay time',
              block: 'delay',
              algorithm: 'default',
              type: 'int',
              range: { min: 10, max: 1000 },
              default: 250,
              units: 'ms',
              log_taper: false,
              widget: 'knob',
              page: 'editor',
              realtime_safe: true,
              panel_control: 'none',
            },
          ],
        },
        shadow: {
          'compressor.enabled': 1,
          'delay.mode': 2,
          'delay.time': 500,
        },
        setParam: mockSetParam,
      },
    })

    render(<IntelFXEditorView />)

    expect(screen.getByRole('heading', { name: /parameter editor/i })).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Delay time' })).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Compressor enabled'))
    fireEvent.change(screen.getByLabelText('Delay mode'), { target: { value: '1' } })

    await waitFor(() => {
      expect(mockSetParam).toHaveBeenCalledWith('compressor.enabled', 0)
      expect(mockSetParam).toHaveBeenCalledWith('delay.mode', 1)
    })
  })
})
