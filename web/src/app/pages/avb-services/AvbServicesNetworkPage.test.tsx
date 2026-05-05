/**
 * T2496-7 — AvbServicesNetworkPage cluster onboarding modal tests.
 *
 * Validates the cluster onboarding trigger + modal flow:
 *   - trigger button is present in the header
 *   - modal opens on trigger click
 *   - modal lists discovered peers with health tags
 *   - modal shows the no-peers placeholder when peers are empty
 *   - modal lists unreachable peers from data.errors
 */

import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

jest.mock('./useAvbServicesShellWindow', () => ({
  __esModule: true,
  useAvbServicesShellWindow: () => undefined,
}))

const mockUseAvbStatus = jest.fn()
const mockUseAvbPtpStatus = jest.fn()
const mockUseAvbSrpStatus = jest.fn()
const mockUseAvbTsnStatus = jest.fn()
const mockUseAvbSrpAdmissions = jest.fn()
const mockUseAvbClusterMatrix = jest.fn()

jest.mock('./useAvbNetwork', () => ({
  __esModule: true,
  useAvbStatus: () => mockUseAvbStatus(),
  useAvbPtpStatus: () => mockUseAvbPtpStatus(),
  useAvbSrpStatus: () => mockUseAvbSrpStatus(),
  useAvbTsnStatus: () => mockUseAvbTsnStatus(),
  useAvbSrpAdmissions: () => mockUseAvbSrpAdmissions(),
}))

jest.mock('./useAvbBindings', () => ({
  __esModule: true,
  useAvbClusterMatrix: () => mockUseAvbClusterMatrix(),
}))

import { AvbServicesNetworkPage } from './AvbServicesNetworkPage'

beforeEach(() => {
  mockUseAvbStatus.mockReturnValue({
    data: { state: 'operational', operational: true, degraded: false, interface: 'eth0' },
    isLoading: false,
    isError: false,
  })
  mockUseAvbPtpStatus.mockReturnValue({ data: { state: 'SLAVE' }, isLoading: false, isError: false })
  mockUseAvbSrpStatus.mockReturnValue({ data: { running: true }, isLoading: false, isError: false })
  mockUseAvbTsnStatus.mockReturnValue({ data: { available: true }, isLoading: false, isError: false })
  mockUseAvbSrpAdmissions.mockReturnValue({ data: { count: 0, admissions: [] }, isLoading: false, isError: false })
  mockUseAvbClusterMatrix.mockReturnValue({
    data: { local: { matrix: {}, total_bindings: 0, bindings: [] }, peers: [], errors: {} },
    isLoading: false,
    isError: false,
  })
})

function renderPage() {
  return render(
    <MemoryRouter>
      <AvbServicesNetworkPage />
    </MemoryRouter>,
  )
}

describe('AvbServicesNetworkPage — T2496-7 cluster onboarding modal', () => {
  it('renders the cluster onboarding trigger in the header', () => {
    renderPage()
    expect(screen.getByTestId('avb-cluster-onboarding-trigger')).toBeInTheDocument()
    expect(screen.getByTestId('avb-cluster-onboarding-trigger')).toHaveTextContent('Cluster onboarding')
  })

  it('opens the modal when the trigger is clicked', () => {
    renderPage()
    fireEvent.click(screen.getByTestId('avb-cluster-onboarding-trigger'))
    expect(screen.getByTestId('avb-cluster-onboarding-modal')).toBeInTheDocument()
    expect(screen.getByText('AVB cluster onboarding')).toBeInTheDocument()
  })

  it('shows the no-peers placeholder when peers list is empty', () => {
    renderPage()
    fireEvent.click(screen.getByTestId('avb-cluster-onboarding-trigger'))
    expect(screen.getByTestId('avb-cluster-modal-no-peers')).toBeInTheDocument()
    expect(screen.getByText(/No AVB peers discovered/)).toBeInTheDocument()
  })

  it('lists discovered peers with health tags', () => {
    mockUseAvbClusterMatrix.mockReturnValue({
      data: {
        local: { matrix: {}, total_bindings: 0, bindings: [] },
        peers: [
          { node_id: 'node-a', hostname: 'studio-a', matrix: {}, total_bindings: 3, health: 'ok' },
          { node_id: 'node-b', hostname: 'booth-b', matrix: {}, total_bindings: 0, health: 'warn' },
        ],
        errors: {},
      },
      isLoading: false,
      isError: false,
    })
    renderPage()
    fireEvent.click(screen.getByTestId('avb-cluster-onboarding-trigger'))
    const modal = screen.getByTestId('avb-cluster-onboarding-modal')
    expect(modal).toHaveTextContent('studio-a')
    expect(modal).toHaveTextContent('booth-b')
    expect(modal).toHaveTextContent('Discovered peers (2)')
    // No-peers placeholder should NOT appear.
    expect(screen.queryByTestId('avb-cluster-modal-no-peers')).not.toBeInTheDocument()
  })

  it('lists unreachable peers from data.errors', () => {
    mockUseAvbClusterMatrix.mockReturnValue({
      data: {
        local: { matrix: {}, total_bindings: 0, bindings: [] },
        peers: [],
        errors: {
          'node-c': 'timeout after 2s',
          'node-d': 'connection refused',
        },
      },
      isLoading: false,
      isError: false,
    })
    renderPage()
    fireEvent.click(screen.getByTestId('avb-cluster-onboarding-trigger'))
    const modal = screen.getByTestId('avb-cluster-onboarding-modal')
    expect(modal).toHaveTextContent('Unreachable peers (2)')
    expect(modal).toHaveTextContent('node-c')
    expect(modal).toHaveTextContent('timeout after 2s')
    expect(modal).toHaveTextContent('node-d')
    expect(modal).toHaveTextContent('connection refused')
  })

  it('surfaces the loading state while the cluster query is pending', () => {
    mockUseAvbClusterMatrix.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    })
    renderPage()
    fireEvent.click(screen.getByTestId('avb-cluster-onboarding-trigger'))
    expect(screen.getByText('Probing peers')).toBeInTheDocument()
  })

  it('surfaces the error state when the cluster query fails', () => {
    mockUseAvbClusterMatrix.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    })
    renderPage()
    fireEvent.click(screen.getByTestId('avb-cluster-onboarding-trigger'))
    expect(screen.getByText('Cluster matrix unavailable')).toBeInTheDocument()
  })
})
