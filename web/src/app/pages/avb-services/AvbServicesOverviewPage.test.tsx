/**
 * T2496-1 — AvbServicesOverviewPage smoke + live-count assertions.
 *
 * Mocks the four AVB hooks the page consumes so the test runs without
 * a QueryClient. Asserts the six tiles render and reflect the values
 * returned by the mocked hooks.
 */

import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

jest.mock('./useAvbServicesShellWindow', () => ({
  __esModule: true,
  useAvbServicesShellWindow: () => undefined,
}))

const mockUseAvbBindingsCount = jest.fn()
const mockUseAvbDiscovery = jest.fn()
const mockUseAvdeccEntities = jest.fn()
const mockUseAvbStatus = jest.fn()

jest.mock('./useAvbBindings', () => ({
  __esModule: true,
  useAvbBindingsCount: () => mockUseAvbBindingsCount(),
}))

jest.mock('./useAvbDevices', () => ({
  __esModule: true,
  useAvbDiscovery: () => mockUseAvbDiscovery(),
  useAvdeccEntities: () => mockUseAvdeccEntities(),
}))

jest.mock('./useAvbNetwork', () => ({
  __esModule: true,
  useAvbStatus: () => mockUseAvbStatus(),
}))

import { AvbServicesOverviewPage } from './AvbServicesOverviewPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <AvbServicesOverviewPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockUseAvbBindingsCount.mockReturnValue({ data: 0, isLoading: false, isError: false })
  mockUseAvbDiscovery.mockReturnValue({
    data: { enabled: true, total_discovered: 0, talker_nodes: 0, listener_nodes: 0, nodes: [] },
    isLoading: false,
    isError: false,
  })
  mockUseAvdeccEntities.mockReturnValue({
    data: { enabled: true, entities: [] },
    isLoading: false,
    isError: false,
  })
  mockUseAvbStatus.mockReturnValue({
    data: { state: 'configured', operational: false, degraded: false, ptp: { state: 'LISTENING' }, srp: { running: false }, tsn: { available: false } },
    isLoading: false,
    isError: false,
  })
})

describe('AvbServicesOverviewPage', () => {
  it('renders the heading and all six tiles', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'AVB Services' })).toBeInTheDocument()
    expect(screen.getByTestId('avb-overview-tile-bindings')).toBeInTheDocument()
    expect(screen.getByTestId('avb-overview-tile-connections')).toBeInTheDocument()
    expect(screen.getByTestId('avb-overview-tile-devices')).toBeInTheDocument()
    expect(screen.getByTestId('avb-overview-tile-routing')).toBeInTheDocument()
    expect(screen.getByTestId('avb-overview-tile-network')).toBeInTheDocument()
    expect(screen.getByTestId('avb-overview-tile-health')).toBeInTheDocument()
  })

  it('reflects live counts from the hooks', () => {
    mockUseAvbBindingsCount.mockReturnValue({ data: 7, isLoading: false, isError: false })
    mockUseAvbDiscovery.mockReturnValue({
      data: { enabled: true, total_discovered: 3, talker_nodes: 1, listener_nodes: 2, nodes: [] },
      isLoading: false,
      isError: false,
    })
    mockUseAvdeccEntities.mockReturnValue({
      data: { enabled: true, entities: [{ entity_id: 'a' }, { entity_id: 'b' }] },
      isLoading: false,
      isError: false,
    })
    renderPage()

    const bindingsTile = screen.getByTestId('avb-overview-tile-bindings')
    expect(bindingsTile).toHaveTextContent('7')

    // Devices tile sums discovered nodes (3) + AVDECC entities (2) = 5.
    const devicesTile = screen.getByTestId('avb-overview-tile-devices')
    expect(devicesTile).toHaveTextContent('5')

    // Routing tile shows talker (1) + listener (2) = 3.
    const routingTile = screen.getByTestId('avb-overview-tile-routing')
    expect(routingTile).toHaveTextContent('3')
  })

  it('renders error tone when the bindings query fails', () => {
    mockUseAvbBindingsCount.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    renderPage()
    const bindingsTile = screen.getByTestId('avb-overview-tile-bindings')
    expect(bindingsTile).toHaveTextContent('—')
  })

  it('surfaces PTP / SRP / TSN tone in the health tile', () => {
    mockUseAvbStatus.mockReturnValue({
      data: {
        state: 'operational',
        operational: true,
        degraded: false,
        ptp: { state: 'SLAVE' },
        srp: { running: true },
        tsn: { available: true },
      },
      isLoading: false,
      isError: false,
    })
    renderPage()
    const health = screen.getByTestId('avb-overview-tile-health')
    expect(health).toHaveTextContent('PTP / gPTP')
    expect(health).toHaveTextContent('SLAVE')
    expect(health).toHaveTextContent('SRP / MSRP')
    expect(health).toHaveTextContent('running')
    expect(health).toHaveTextContent('TSN qdisc')
    expect(health).toHaveTextContent('available')
  })

  it('renders no Scaffold tag (T2496-1 acceptance)', () => {
    renderPage()
    expect(screen.queryByText(/scaffold/i)).not.toBeInTheDocument()
  })
})
