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

function renderHome(ui: React.ReactNode) {
  return render(
    <MemoryRouter
      initialEntries={['/']}
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      {ui}
    </MemoryRouter>,
  )
}

describe('HomePage navigation landing', () => {
  beforeEach(() => {
    mockUpdateSettings.mockReset()
    mockSpecialSettings.pinnedRoutes = []
  })

  it('renders sectioned navigation cards with detailed feature descriptions', () => {
    renderHome(
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>,
    )

    expect(screen.getByText('MAP2')).toBeTruthy()
    expect(screen.getByText(/MAP2 Node Status/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'System' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'JUCE' })).toBeTruthy()
    expect(screen.getAllByText('System Overview').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Host Machine').length).toBeGreaterThan(0)
  })

  it('pins a card without navigating away from Home', () => {
    renderHome(
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
      </Routes>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'JUCE' }))
    fireEvent.click(screen.getByLabelText('Pin Audio Engine'))

    expect(mockUpdateSettings).toHaveBeenCalledWith({ pinnedRoutes: ['/engine'] })
    expect(screen.getByTestId('location-probe').textContent).toBe('/')
  })
})
