import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { HomePage } from './HomePage'

const mockUpdateSettings = jest.fn()
const mockSpecialSettings = {
  enabled: true,
  hiddenPlugins: [],
  menuLocation: 'top-nav' as const,
  pinnedRoutes: [] as string[],
}

jest.mock('../hooks/useSpecialSettings', () => ({
  useSpecialSettings: () => ({
    settings: mockSpecialSettings,
    isLoading: false,
    error: null,
    updateSettings: mockUpdateSettings,
    reload: jest.fn(),
  }),
}))

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-probe">{location.pathname}</div>
}

describe('HomePage navigation landing', () => {
  beforeEach(() => {
    mockUpdateSettings.mockReset()
    mockSpecialSettings.pinnedRoutes = []
  })

  it('renders sectioned navigation cards with detailed feature descriptions', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Core')).toBeTruthy()
    expect(screen.getByText('Beta workflows')).toBeTruthy()
    expect(screen.getByText('Overview')).toBeTruthy()
    expect(screen.getByText('Audio Engine')).toBeTruthy()
    expect(screen.getByText(/Monitor the realtime audio engine/i)).toBeTruthy()
    expect(screen.getByText('Guide')).toBeTruthy()
    expect(screen.getByText('MIDI Hub')).toBeTruthy()
  })

  it('pins a card without navigating away from Home', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={(
              <>
                <HomePage />
                <LocationProbe />
              </>
            )}
          />
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByLabelText('Pin Audio Engine'))

    expect(mockUpdateSettings).toHaveBeenCalledWith({ pinnedRoutes: ['/engine'] })
    expect(screen.getByTestId('location-probe').textContent).toBe('/')
  })
})
