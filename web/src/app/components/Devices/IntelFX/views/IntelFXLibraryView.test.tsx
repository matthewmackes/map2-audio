import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { IntelFXLibraryView } from './IntelFXLibraryView'

const mockGetLibrary = jest.fn()
const mockSetProgram = jest.fn().mockResolvedValue(undefined)
const mockSetLcdText = jest.fn()

jest.mock('../../../../../map2/intelfxApi', () => ({
  intelfxApi: {
    getLibrary: (...args: unknown[]) => mockGetLibrary(...args),
  },
}))

jest.mock('../IntelFXShell', () => ({
  useIntelFXPageContext: () => ({
    nodeId: null,
    setLcdText: mockSetLcdText,
    intelfx: {
      state: { current_program: 0 },
      setProgram: mockSetProgram,
      programs: [],
    },
  }),
}))

describe('IntelFXLibraryView accessibility', () => {
  beforeEach(() => {
    mockGetLibrary.mockReset()
    mockSetProgram.mockReset()
    mockSetLcdText.mockReset()
    mockGetLibrary.mockResolvedValue({
      entries: [
        { program: 1, name: 'Crunch', tags: ['lead'] },
      ],
    })
  })

  it('renders labeled search controls and accessible program-load buttons', async () => {
    render(<IntelFXLibraryView />)

    await waitFor(() => {
      expect(mockGetLibrary).toHaveBeenCalledWith(null)
    })

    expect(screen.getByRole('heading', { name: /preset library/i })).toBeTruthy()
    expect(screen.getByLabelText('Search presets')).toBeTruthy()

    const loadProgramButton = await screen.findByRole(
      'button',
      { name: /Load U002 Crunch/i },
      { timeout: 10000 },
    )
    fireEvent.click(loadProgramButton)

    await waitFor(() => {
      expect(mockSetProgram).toHaveBeenCalledWith(1)
    }, { timeout: 10000 })
    expect(mockSetLcdText).toHaveBeenCalledWith('LOADED U002 Crunch')
  })
})
