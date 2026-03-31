import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import { LabsPage } from './LabsPage'

jest.mock('../hooks/useDeviceLocation', () => ({
  useHardwareMenuLocations: () => ({
    locationsByRoute: {
      '/labs/push-surface': { hostname: 'MAP2-A' },
    },
  }),
}))

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

function renderPage() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter
        initialEntries={['/labs']}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <LabsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('LabsPage', () => {
  it('renders the standalone Labs landing page with Push Surface in the Labs catalog', () => {
    renderPage()

    expect(screen.getByText('Standalone Carbon landing page for MAP2’s advanced, experimental, and hardware-sensitive routes.')).toBeTruthy()
    expect(screen.getByText('Independent from Platforms')).toBeTruthy()
    expect(screen.getAllByText('Push Surface').length).toBeGreaterThan(0)
    expect(screen.getByText('Top-level Labs page')).toBeTruthy()
    expect(screen.getByText('On MAP2-A')).toBeTruthy()
  })

  it('filters the Labs catalog using the search field', () => {
    renderPage()

    fireEvent.change(screen.getByLabelText('Search Labs entries'), { target: { value: 'push surface' } })

    expect(screen.getAllByText('Push Surface').length).toBeGreaterThan(0)
    expect(screen.queryByText('Ground Control Pro')).toBeNull()
  })
})
