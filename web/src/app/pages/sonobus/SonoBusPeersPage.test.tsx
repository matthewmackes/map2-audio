/**
 * T2521-6c — SonoBusPeersPage tests.
 */

import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

const mockUseSonoBusPeers = jest.fn()

jest.mock('./useSonoBusBindings', () => ({
  __esModule: true,
  useSonoBusPeers: () => mockUseSonoBusPeers(),
}))

import { SonoBusPeersPage } from './SonoBusPeersPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <SonoBusPeersPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockUseSonoBusPeers.mockReturnValue({ data: [], isLoading: false, isError: false })
})

describe('SonoBusPeersPage', () => {
  it('renders the heading and the empty state when no peers', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'SonoBus Peers' })).toBeInTheDocument()
    expect(screen.getByTestId('sonobus-peers-empty')).toBeInTheDocument()
  })

  it('renders one card per peer', () => {
    mockUseSonoBusPeers.mockReturnValue({
      data: [
        {
          peer_id: 'node-beta::map2',
          listener_node_id: 'node-beta',
          listener_endpoint: '10.0.0.10:10001',
          listener_capability: 'map2',
          binding_count: 3,
          enabled_binding_count: 2,
        },
        {
          peer_id: 'node-gamma::sonobus_native',
          listener_node_id: 'node-gamma',
          listener_endpoint: '10.0.0.11:10001',
          listener_capability: 'sonobus_native',
          binding_count: 1,
          enabled_binding_count: 1,
        },
      ],
      isLoading: false,
      isError: false,
    })
    renderPage()
    expect(screen.getByTestId('sonobus-peer-node-beta::map2')).toHaveTextContent('node-beta')
    expect(screen.getByTestId('sonobus-peer-node-beta::map2')).toHaveTextContent('2 / 3')
    expect(screen.getByTestId('sonobus-peer-node-gamma::sonobus_native')).toHaveTextContent('sonobus_native')
  })

  it('shows the error tag when query fails', () => {
    mockUseSonoBusPeers.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    renderPage()
    expect(screen.getByText('Peers query failed')).toBeInTheDocument()
  })
})
