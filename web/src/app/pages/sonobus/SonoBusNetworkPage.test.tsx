/**
 * T2521-6c — SonoBusNetworkPage tests.
 */

import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

const mockUseSonoBusStatus = jest.fn()

jest.mock('./useSonoBusBindings', () => ({
  __esModule: true,
  useSonoBusStatus: () => mockUseSonoBusStatus(),
}))

import { SonoBusNetworkPage } from './SonoBusNetworkPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <SonoBusNetworkPage />
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
})

describe('SonoBusNetworkPage', () => {
  it('renders all four locked-decision tiles', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'SonoBus Network' })).toBeInTheDocument()
    expect(screen.getByTestId('sonobus-net-server-tile')).toBeInTheDocument()
    expect(screen.getByTestId('sonobus-net-ports-tile')).toBeInTheDocument()
    expect(screen.getByTestId('sonobus-net-mdns-tile')).toBeInTheDocument()
    expect(screen.getByTestId('sonobus-net-defaults-tile')).toBeInTheDocument()
  })

  it('reflects Stopped when server enabled but not running', () => {
    renderPage()
    expect(screen.getByTestId('sonobus-net-server-tile')).toHaveTextContent('Stopped')
  })

  it('reflects Running when server enabled and running', () => {
    mockUseSonoBusStatus.mockReturnValue({
      data: {
        authority_ok: true,
        table_present: true,
        binding_count: 0,
        enabled_binding_count: 0,
        daemon_running: true,
        daemon_endpoint: null,
        connection_server_enabled: true,
        connection_server_running: true,
        default_transport_priority: 'avb_preferred',
      },
      isLoading: false,
      isError: false,
    })
    renderPage()
    expect(screen.getByTestId('sonobus-net-server-tile')).toHaveTextContent('Running')
  })

  it('shows Disabled when Q3 override applied', () => {
    mockUseSonoBusStatus.mockReturnValue({
      data: {
        authority_ok: true,
        table_present: true,
        binding_count: 0,
        enabled_binding_count: 0,
        daemon_running: false,
        daemon_endpoint: null,
        connection_server_enabled: false,
        connection_server_running: false,
        default_transport_priority: 'avb_preferred',
      },
      isLoading: false,
      isError: false,
    })
    renderPage()
    expect(screen.getByTestId('sonobus-net-server-tile')).toHaveTextContent('Disabled')
  })
})
