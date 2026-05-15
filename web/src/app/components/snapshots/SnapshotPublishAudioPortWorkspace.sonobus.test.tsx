/**
 * T2521-7 cycle 34 — SonoBus peers section in the publish I/O panel.
 *
 * Pins the new "SonoBus peers" section that mirrors the existing
 * "AVB talker inputs" / "AVB listener outputs" sections symmetrically
 * across the Inputs and Outputs tabs. Selection state is local-only
 * for v1 (backend persistence lands with the T2521-4 daemon); the
 * tests assert the operator can:
 *
 *   - see the section header on both Inputs and Outputs tabs
 *   - see the empty-state copy that points at /sonobus
 *   - see one card per peer + toggle selection
 */
import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

import { ToastProvider } from '../Toasts'

// Mock audio API so the workspace doesn't try to network-fetch.
const mockGetPorts = jest.fn()
const mockGetRouting = jest.fn()
const mockGetChainRouting = jest.fn()
const mockGetPortPresets = jest.fn()
jest.mock('../../../map2/api', () => ({
  __esModule: true,
  audioApi: {
    getPorts: (...args: unknown[]) => mockGetPorts(...args),
    getRouting: (...args: unknown[]) => mockGetRouting(...args),
    getChainRouting: (...args: unknown[]) => mockGetChainRouting(...args),
    getPortPresets: (...args: unknown[]) => mockGetPortPresets(...args),
    setRouting: jest.fn(),
    setChainRouting: jest.fn(),
    clearChainRouting: jest.fn(),
  },
  // The Toasts provider uses these transport helpers; the workspace
  // itself doesn't need them, but the surrounding provider does.
  API_BASE: '/api',
  getWsUrl: () => 'ws://test.local/ws',
  getWsBaseUrl: () => 'ws://test.local',
}))

// Mock the SonoBus peers hook so we control the fixture in-test.
const mockUseSonoBusPeers = jest.fn()
jest.mock('../../pages/sonobus/useSonoBusBindings', () => ({
  __esModule: true,
  useSonoBusPeers: () => mockUseSonoBusPeers(),
}))

import { SnapshotPublishAudioPortWorkspace } from './SnapshotPublishAudioPortWorkspace'

function makePeer(id: string, overrides?: Record<string, unknown>) {
  return {
    peer_id: id,
    listener_node_id: `node-${id}`,
    listener_endpoint: `10.0.0.10:1000${id.length}`,
    listener_capability: 'map2',
    binding_count: 1,
    enabled_binding_count: 1,
    ...overrides,
  }
}

function renderWorkspace() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
    },
  })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <SnapshotPublishAudioPortWorkspace
            nodeId="node-local"
            title="Inputs and outputs"
          />
        </ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockGetPorts.mockReset().mockResolvedValue({
    available: true,
    device: 'Test Interface',
    inputs: [],
    outputs: [],
    input_count: 0,
    output_count: 0,
    avb_talkers: [],
    avb_listeners: [],
  })
  mockGetRouting.mockReset().mockResolvedValue({
    available: true,
    input_ports: [],
    output_ports: [],
    input_avb_endpoints: [],
    output_avb_endpoints: [],
    input_bindings: [],
    output_bindings: [],
  })
  mockGetChainRouting.mockReset().mockResolvedValue({
    input_ports: [],
    output_ports: [],
    input_avb_endpoints: [],
    output_avb_endpoints: [],
    is_override: false,
  })
  mockGetPortPresets.mockReset().mockResolvedValue({ presets: [] })
  mockUseSonoBusPeers.mockReset()
})

describe('SnapshotPublishAudioPortWorkspace — SonoBus peers section (T2521-7)', () => {
  it('renders the SonoBus peers section on the Inputs tab with empty-state copy', async () => {
    mockUseSonoBusPeers.mockReturnValue({ data: [], isLoading: false, isError: false })
    renderWorkspace()
    await waitFor(() =>
      expect(
        screen.getByTestId('sonobus-peers-input-section'),
      ).toBeInTheDocument(),
    )
    expect(screen.getByText('No SonoBus peers configured')).toBeInTheDocument()
    expect(
      screen.getByText(/Manage bindings at \/sonobus/),
    ).toBeInTheDocument()
  })

  it('renders one card per peer when the hook returns data', async () => {
    mockUseSonoBusPeers.mockReturnValue({
      data: [makePeer('A'), makePeer('B')],
      isLoading: false,
      isError: false,
    })
    renderWorkspace()
    await waitFor(() =>
      expect(
        screen.getByTestId('sonobus-peer-card-input-A'),
      ).toBeInTheDocument(),
    )
    expect(screen.getByTestId('sonobus-peer-card-input-B')).toBeInTheDocument()
  })

  it('toggles selection on click', async () => {
    mockUseSonoBusPeers.mockReturnValue({
      data: [makePeer('A')],
      isLoading: false,
      isError: false,
    })
    renderWorkspace()
    const card = await screen.findByTestId('sonobus-peer-card-input-A')
    expect(card.className).not.toContain('is-selected')
    fireEvent.click(card)
    await waitFor(() => {
      const after = screen.getByTestId('sonobus-peer-card-input-A')
      expect(after.className).toContain('is-selected')
    })
  })

  it('shows the SonoBus peers section on the Outputs tab too', async () => {
    mockUseSonoBusPeers.mockReturnValue({
      data: [makePeer('A')],
      isLoading: false,
      isError: false,
    })
    renderWorkspace()
    // Switch to the Outputs tab.
    const outputsTab = await screen.findByRole('tab', { name: /outputs/i })
    fireEvent.click(outputsTab)
    await waitFor(() =>
      expect(
        screen.getByTestId('sonobus-peers-output-section'),
      ).toBeInTheDocument(),
    )
    expect(screen.getByTestId('sonobus-peer-card-output-A')).toBeInTheDocument()
  })

  it('renders Active vs Configured tag based on enabled_binding_count', async () => {
    mockUseSonoBusPeers.mockReturnValue({
      data: [
        makePeer('Active', { enabled_binding_count: 2, binding_count: 2 }),
        makePeer('Inactive', { enabled_binding_count: 0, binding_count: 3 }),
      ],
      isLoading: false,
      isError: false,
    })
    renderWorkspace()
    await screen.findByTestId('sonobus-peer-card-input-Active')
    // Active peer has at least one enabled binding → "Active" Tag.
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0)
    // Inactive peer (all bindings disabled) → "Configured" Tag.
    expect(screen.getByText('Configured')).toBeInTheDocument()
  })
})
