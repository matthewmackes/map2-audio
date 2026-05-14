/**
 * T2521-6c — SonoBusDiagnosticsPage tests.
 */

import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

const mockUseSonoBusStatus = jest.fn()
const mockUseSonoBusBindingsMatrix = jest.fn()

jest.mock('./useSonoBusBindings', () => ({
  __esModule: true,
  useSonoBusStatus: () => mockUseSonoBusStatus(),
  useSonoBusBindingsMatrix: () => mockUseSonoBusBindingsMatrix(),
}))

import { SonoBusDiagnosticsPage } from './SonoBusDiagnosticsPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <SonoBusDiagnosticsPage />
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
  mockUseSonoBusBindingsMatrix.mockReturnValue({
    data: { matrix: {}, total_bindings: 0, bindings: [] },
    isLoading: false,
    isError: false,
  })
})

describe('SonoBusDiagnosticsPage', () => {
  it('renders the three status tiles', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'SonoBus Diagnostics' })).toBeInTheDocument()
    expect(screen.getByTestId('sonobus-diag-authority-tile')).toBeInTheDocument()
    expect(screen.getByTestId('sonobus-diag-daemon-tile')).toBeInTheDocument()
    expect(screen.getByTestId('sonobus-diag-matrix-tile')).toBeInTheDocument()
  })

  it('lists all five locked validation gates', () => {
    renderPage()
    const tile = screen.getByTestId('sonobus-diag-validation-tile')
    expect(tile).toHaveTextContent('Two-node LAN PCM 24-bit / 48 kHz')
    expect(tile).toHaveTextContent('Impairment: 0.1% loss + 2 ms jitter')
    expect(tile).toHaveTextContent('Impairment: 1% loss + 5 ms jitter')
    expect(tile).toHaveTextContent('Cluster matrix fan-out')
    expect(tile).toHaveTextContent('Recorder exclusion regression (Q12)')
  })

  it('shows authority Error when authority_ok=false', () => {
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
    expect(screen.getByTestId('sonobus-diag-authority-tile')).toHaveTextContent('Error')
  })
})
