/**
 * T2521-6 — SonoBusOverviewPage smoke + live-count assertions.
 *
 * Mocks the three SonoBus hooks the page consumes so the test runs
 * without a QueryClient. Asserts the four tiles render and reflect
 * the locked-decision defaults the Overview page surfaces.
 */

import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

const mockUseSonoBusStatus = jest.fn()
const mockUseSonoBusBindingsCount = jest.fn()
const mockUseSonoBusBindingsMatrix = jest.fn()

jest.mock('./useSonoBusBindings', () => ({
  __esModule: true,
  useSonoBusStatus: () => mockUseSonoBusStatus(),
  useSonoBusBindingsCount: () => mockUseSonoBusBindingsCount(),
  useSonoBusBindingsMatrix: () => mockUseSonoBusBindingsMatrix(),
}))

import { SonoBusOverviewPage } from './SonoBusOverviewPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <SonoBusOverviewPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockUseSonoBusStatus.mockReturnValue({
    data: {
      authority_ok: true,
      table_present: true,
      binding_count: 0,
      enabled_binding_count: 0,
      daemon_running: false,
      daemon_endpoint: null,
      connection_server_enabled: true,
      connection_server_running: false,
      default_transport_priority: 'avb_preferred',
    },
    isLoading: false,
    isError: false,
  })
  mockUseSonoBusBindingsCount.mockReturnValue({
    data: 0,
    isLoading: false,
    isError: false,
  })
  mockUseSonoBusBindingsMatrix.mockReturnValue({
    data: { matrix: {}, total_bindings: 0, bindings: [] },
    isLoading: false,
    isError: false,
  })
})

describe('SonoBusOverviewPage', () => {
  it('renders the heading and the four tiles', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'SonoBus' })).toBeInTheDocument()
    expect(screen.getByTestId('sonobus-overview-tile-bindings')).toBeInTheDocument()
    expect(screen.getByTestId('sonobus-overview-tile-daemon')).toBeInTheDocument()
    expect(screen.getByTestId('sonobus-overview-tile-server')).toBeInTheDocument()
    expect(screen.getByTestId('sonobus-overview-tile-priority')).toBeInTheDocument()
  })

  it('surfaces the Q18 transport-priority default', () => {
    renderPage()
    const tile = screen.getByTestId('sonobus-overview-tile-priority')
    expect(tile.textContent).toContain('avb preferred')
  })

  it('shows the daemon as Stopped until T2521-4 lands', () => {
    renderPage()
    const tile = screen.getByTestId('sonobus-overview-tile-daemon')
    expect(tile.textContent).toContain('Stopped')
  })

  it('shows the connection server tile honouring Q3 enabled-default', () => {
    renderPage()
    const tile = screen.getByTestId('sonobus-overview-tile-server')
    // Q3: enabled by default, daemon-not-running so the runtime state is Stopped.
    expect(tile.textContent).toContain('Stopped')
  })

  it('reflects binding counts from /api/sonobus/bindings/count', () => {
    mockUseSonoBusBindingsCount.mockReturnValue({
      data: 7,
      isLoading: false,
      isError: false,
    })
    renderPage()
    const tile = screen.getByTestId('sonobus-overview-tile-bindings')
    expect(tile.textContent).toContain('7')
  })

  it('renders the per-kind breakdown rows from the matrix', () => {
    mockUseSonoBusBindingsMatrix.mockReturnValue({
      data: {
        matrix: {
          stream: { sonobus_stream: { count: 3, enabled_count: 2 } },
          peer: { sonobus_peer: { count: 1, enabled_count: 1 } },
        },
        total_bindings: 4,
        bindings: [],
      },
      isLoading: false,
      isError: false,
    })
    renderPage()
    expect(screen.getByTestId('sonobus-kind-streams').textContent).toContain('3')
    expect(screen.getByTestId('sonobus-kind-peers').textContent).toContain('1')
    expect(screen.getByTestId('sonobus-kind-groups').textContent).toContain('0')
    expect(screen.getByTestId('sonobus-kind-clients').textContent).toContain('0')
  })

  it('shows authority-error tone when the status query reports authority_ok=false', () => {
    mockUseSonoBusStatus.mockReturnValue({
      data: {
        authority_ok: false,
        table_present: false,
        binding_count: 0,
        enabled_binding_count: 0,
        daemon_running: false,
        daemon_endpoint: null,
        connection_server_enabled: true,
        connection_server_running: false,
        default_transport_priority: 'avb_preferred',
      },
      isLoading: false,
      isError: false,
    })
    renderPage()
    const tile = screen.getByTestId('sonobus-overview-tile-daemon')
    expect(tile.textContent).toContain('Authority error')
  })

  it('shows Loading tag when status query is loading', () => {
    mockUseSonoBusStatus.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    })
    renderPage()
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })
})
