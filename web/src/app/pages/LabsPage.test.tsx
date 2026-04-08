import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import { LabsPage } from './LabsPage'

jest.mock('../hooks/useDeviceLocation', () => ({
  useHardwareMenuLocations: () => ({
    locationsByRoute: {},
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
  it('renders the Labs feature-card catalog without duplicate dedicated physical-surface launchers', () => {
    renderPage()

    expect(screen.getByText('Browse Labs as a uniform catalog of feature cards, each representing a different MAP2 page, service, or hardware workflow.')).toBeTruthy()
    expect(screen.getByText('Every Labs route now lives in one consistent card grid.')).toBeTruthy()
    expect(screen.getByRole('list', { name: 'Labs feature cards' })).toBeTruthy()
    expect(screen.queryByText('Push Surface')).toBeNull()
    expect(screen.queryByText('Ground Control Pro')).toBeNull()
    expect(screen.queryByText('Maschine MK1')).toBeNull()
  })

  it('filters the Labs feature-card catalog using the search field', () => {
    renderPage()

    fireEvent.change(screen.getByLabelText('Search Labs entries'), { target: { value: 'tesira' } })

    expect(screen.getAllByText('Tesira AVB').length).toBeGreaterThan(0)
    expect(screen.queryByText('IntelFX Rack')).toBeNull()
  })
})
