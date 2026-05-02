/**
 * T2483 loop 18 / iter 178 — MidiServicesRoutingPage peer overlay tests.
 *
 * Confirms the iter-177 peer badge renders when usePeerMatrix
 * reports a non-zero count, and stays hidden when it reports zero.
 *
 * The routing matrix queries the backend matrix endpoint (iter-162);
 * usePeerMatrix is mocked here to control the badge state.
 */

import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

const mockMatrix = jest.fn()
const mockUsePeerMatrix = jest.fn()

jest.mock('../../../map2/clients/midiBindings', () => {
  const actual = jest.requireActual('../../../map2/clients/midiBindings')
  return {
    ...actual,
    midiBindingsApi: {
      ...actual.midiBindingsApi,
      matrix: (...args: unknown[]) => mockMatrix(...args),
    },
  }
})

jest.mock('./usePeerMatrix', () => ({
  usePeerMatrix: () => mockUsePeerMatrix(),
}))

import { MidiServicesRoutingPage } from './MidiServicesRoutingPage'

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <MidiServicesRoutingPage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockMatrix.mockReset()
  mockMatrix.mockResolvedValue({
    matrix: {
      midi_cc: { plugin_param: { count: 5, enabled_count: 5 } },
    },
    total_bindings: 5,
  })
  mockUsePeerMatrix.mockReset()
})

describe('MidiServicesRoutingPage peer overlay', () => {
  it('hides the peer badge when usePeerMatrix reports 0 (today default)', async () => {
    mockUsePeerMatrix.mockReturnValue({
      peers: {},
      totalPeerBindings: 0,
      hasPeerData: false,
    })
    renderPage()
    await waitFor(() => expect(mockMatrix).toHaveBeenCalled())
    // Cell shows the count Tag '5' but no '+N' peer badge.
    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument()
  })

  it('shows a +N peer badge when usePeerMatrix reports a non-zero peer count', async () => {
    mockUsePeerMatrix.mockReturnValue({
      peers: { midi_cc: { plugin_param: 3 } },
      totalPeerBindings: 3,
      hasPeerData: true,
    })
    renderPage()
    await waitFor(() => expect(mockMatrix).toHaveBeenCalled())
    expect(await screen.findByText('+3')).toBeInTheDocument()
  })

  it('renders multiple peer badges when multiple cells have peers', async () => {
    mockUsePeerMatrix.mockReturnValue({
      peers: {
        midi_cc: { plugin_param: 2, transport: 4 },
      },
      totalPeerBindings: 6,
      hasPeerData: true,
    })
    mockMatrix.mockResolvedValue({
      matrix: {
        midi_cc: {
          plugin_param: { count: 5, enabled_count: 5 },
          transport: { count: 1, enabled_count: 1 },
        },
      },
      total_bindings: 6,
    })
    renderPage()
    await waitFor(() => expect(mockMatrix).toHaveBeenCalled())
    expect(await screen.findByText('+2')).toBeInTheDocument()
    expect(await screen.findByText('+4')).toBeInTheDocument()
  })
})
