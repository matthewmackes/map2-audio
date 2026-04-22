import React from 'react'
import '@testing-library/jest-dom'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { PlatformsOverviewTopology } from './PlatformsOverviewTopology'
import type { PlatformLayerData } from '../../platform/model'

// ── Module mocks ─────────────────────────────────────────────────────────────

const mockRefetch = jest.fn()
let mockTopologyData: any = null
let mockTopologyError: any = null

jest.mock('../../hooks/useNodeTopology', () => ({
  useNodeTopology: () => ({
    data: mockTopologyData,
    error: mockTopologyError,
    isLoading: false,
    dataUpdatedAt: mockTopologyData ? Date.now() : undefined,
    refetch: mockRefetch,
  }),
}))

const mockPatchNodeLabel = jest.fn()
jest.mock('../../../map2/api', () => ({
  audioApi: { restart: jest.fn().mockResolvedValue({ success: true }) },
  chainsApi: { list: jest.fn().mockImplementation(() => new Promise(() => {})) },
  diagnosticsApi: { runFullDiagnostic: jest.fn().mockResolvedValue({ status: 'ok' }) },
  patchNodeLabel: (...args: any[]) => mockPatchNodeLabel(...args),
}))

jest.mock('../Toasts', () => ({
  useToasts: () => ({ pushToast: jest.fn() }),
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<{
  node_id: string
  hostname: string
  display_label: string | null
  role: 'all_in_one' | 'audio_node' | 'management_node'
  status: 'ok' | 'warn' | 'critical' | 'offline'
  cpu_percent: number
  memory_percent: number
  xrun_count: number
  audio_latency_ms: number
  is_local: boolean
  is_viewed: boolean
}> = {}) {
  return {
    node_id: 'node-a',
    hostname: 'MAP2-TESTBED',
    display_label: null,
    role: 'all_in_one' as const,
    status: 'ok' as const,
    cpu_percent: 20,
    memory_percent: 40,
    xrun_count: 0,
    audio_latency_ms: 1.33,
    services: { backend: true, juce_engine: true, pipewire: true },
    last_seen: '2026-04-22T00:00:00Z',
    is_local: true,
    is_viewed: true,
    ...overrides,
  }
}

const BLANK_LAYER: PlatformLayerData = {
  id: 'overview',
  label: 'Overview',
  shortLabel: 'Overview',
  description: '',
  accent: '',
  health: 'healthy',
  activityLevel: 0,
  alertCount: 0,
  summaryMetrics: [],
  tableRows: [],
  tableColumns: [],
  tableTitle: '',
  tableDescription: '',
  gridItems: [],
  notifications: [],
  isLoading: false,
  error: null,
}

function renderTopology(layer = BLANK_LAYER) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <PlatformsOverviewTopology layer={layer} />
    </MemoryRouter>,
  )
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PlatformsOverviewTopology', () => {
  beforeEach(() => {
    mockTopologyData = null
    mockTopologyError = null
    mockRefetch.mockReset()
    mockPatchNodeLabel.mockReset()
    mockPatchNodeLabel.mockResolvedValue({ hostname: 'MAP2-TESTBED', display_label: 'My Label' })

    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(window, 'ResizeObserver', { writable: true, value: ResizeObserverMock })
    Object.defineProperty(global, 'ResizeObserver', { writable: true, value: ResizeObserverMock })

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    })

    Object.defineProperty(window, 'URL', {
      writable: true,
      value: {
        createObjectURL: jest.fn(() => 'blob:mock'),
        revokeObjectURL: jest.fn(),
      },
    })
  })

  it('renders the cluster topology heading and four view toggles', () => {
    mockTopologyData = { nodes: [makeNode()], audio_edges: [], network_edges: [] }
    renderTopology()

    expect(screen.getByRole('heading', { name: 'Cluster topology' })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Overview view' })
    expect(within(nav).getByRole('button', { name: 'Topology' })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Heatmap' })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Signal graph' })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'List' })).toBeInTheDocument()
  })

  it('auto-selects the local node and shows it in the sidebar', () => {
    mockTopologyData = {
      nodes: [
        makeNode({ node_id: 'node-local', hostname: 'LocalRack', is_local: true }),
        makeNode({ node_id: 'node-remote', hostname: 'RemoteRack', is_local: false }),
      ],
      audio_edges: [],
      network_edges: [],
    }
    renderTopology()

    const sidebar = screen.getByRole('complementary', { name: /Details for LocalRack/ })
    expect(sidebar).toBeInTheDocument()
  })

  it('switches to heatmap view and renders CPU cells', () => {
    mockTopologyData = {
      nodes: [
        makeNode({ node_id: 'n1', hostname: 'Rack-A', cpu_percent: 55 }),
        makeNode({ node_id: 'n2', hostname: 'Rack-B', cpu_percent: 12 }),
      ],
      audio_edges: [],
      network_edges: [],
    }
    renderTopology()

    fireEvent.click(screen.getByRole('button', { name: 'Heatmap' }))

    // Each heat cell shows the CPU % as a large number inside .ptop__heatcell-cpu
    const cpuCells = document.querySelectorAll('.ptop__heatcell-cpu')
    const cpuTexts = Array.from(cpuCells).map((el) => el.textContent?.replace(/\s/g, ''))
    expect(cpuTexts).toContain('55%')
    expect(cpuTexts).toContain('12%')
  })

  it('switches to list view and shows node rows with CPU and memory meters', () => {
    mockTopologyData = {
      nodes: [
        makeNode({ node_id: 'n1', hostname: 'Rack-A', cpu_percent: 33, memory_percent: 61, xrun_count: 0 }),
      ],
      audio_edges: [],
      network_edges: [],
    }
    renderTopology()

    fireEvent.click(screen.getByRole('button', { name: 'List' }))

    // The list table's meter-val spans show the % values
    const meterVals = document.querySelectorAll('.ptop__meter-val')
    const meterTexts = Array.from(meterVals).map((el) => el.textContent?.replace(/\s/g, ''))
    expect(meterTexts).toContain('33%')
    expect(meterTexts).toContain('61%')
    expect(screen.getByText('clear')).toBeInTheDocument()
  })

  it('clicking a list row selects that node in the sidebar', () => {
    mockTopologyData = {
      nodes: [
        makeNode({ node_id: 'n-local', hostname: 'Local', is_local: true }),
        makeNode({ node_id: 'n-other', hostname: 'Other', is_local: false }),
      ],
      audio_edges: [],
      network_edges: [],
    }
    renderTopology()

    fireEvent.click(screen.getByRole('button', { name: 'List' }))

    const otherRow = screen.getByText('Other').closest('tr')!
    fireEvent.click(otherRow)

    expect(screen.getByRole('complementary', { name: /Details for Other/ })).toBeInTheDocument()
  })

  it('shows the stale banner and retry button when topology fetch errors', () => {
    // First populate lastGoodRef with valid data, then error.
    mockTopologyData = { nodes: [makeNode()], audio_edges: [], network_edges: [] }
    const { rerender } = renderTopology()

    mockTopologyData = null
    mockTopologyError = new Error('Network timeout')

    rerender(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PlatformsOverviewTopology layer={BLANK_LAYER} />
      </MemoryRouter>,
    )

    expect(screen.getByText(/Showing last-known state/)).toBeInTheDocument()
    const retryBtn = screen.getByRole('button', { name: 'Retry' })
    fireEvent.click(retryBtn)
    expect(mockRefetch).toHaveBeenCalledTimes(1)
  })

  it('shows alert count tag in the header when layer has alerts', () => {
    mockTopologyData = { nodes: [makeNode()], audio_edges: [], network_edges: [] }
    const layer: PlatformLayerData = {
      ...BLANK_LAYER,
      alertCount: 3,
      notifications: [
        { id: 'a1', title: 'High xrun count', subtitle: '12 xruns on Rack-A', severity: 'warning' },
      ],
    }
    renderTopology(layer)

    expect(screen.getByText('3 warnings')).toBeInTheDocument()
  })

  it('opens the restart confirm modal when the restart quick action is clicked', async () => {
    mockTopologyData = {
      nodes: [makeNode({ node_id: 'n1', hostname: 'LocalRack', is_local: true })],
      audio_edges: [],
      network_edges: [],
    }
    renderTopology()

    // Wait for sidebar's "Restart engine" span inside a ptop__action button.
    const restartSpans = await screen.findAllByText('Restart engine')
    // The ptop__action button is the one whose parent is .ptop__action
    const actionBtn = restartSpans
      .map((el) => el.closest('button'))
      .find((btn) => btn?.classList.contains('ptop__action'))
    expect(actionBtn).toBeTruthy()
    fireEvent.click(actionBtn!)

    expect(screen.getByText(/Restart engine on LocalRack/)).toBeInTheDocument()
  })

  it('clicking the node hostname in the sidebar activates the inline label editor', async () => {
    mockTopologyData = {
      nodes: [makeNode({ node_id: 'n1', hostname: 'LocalRack', display_label: null, is_local: true })],
      audio_edges: [],
      network_edges: [],
    }
    renderTopology()

    // The rename button wraps the hostname span
    const renameBtn = await screen.findByTitle('Click to rename this node')
    fireEvent.click(renameBtn)

    // Input should appear pre-filled with the hostname
    const input = screen.getByRole('textbox', { name: 'Node display label' })
    expect(input).toBeInTheDocument()
    expect((input as HTMLInputElement).value).toBe('LocalRack')
  })

  it('saves the renamed label via patchNodeLabel on Enter', async () => {
    mockTopologyData = {
      nodes: [makeNode({ node_id: 'n1', hostname: 'LocalRack', display_label: null, is_local: true })],
      audio_edges: [],
      network_edges: [],
    }
    renderTopology()

    const renameBtn = await screen.findByTitle('Click to rename this node')
    fireEvent.click(renameBtn)
    const input = screen.getByRole('textbox', { name: 'Node display label' })

    fireEvent.change(input, { target: { value: 'Stage Left' } })

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })

    await waitFor(() => {
      expect(mockPatchNodeLabel).toHaveBeenCalledWith('Stage Left')
    })
    expect(mockRefetch).toHaveBeenCalled()
  })

  it('cancels label editing on Escape without calling patchNodeLabel', async () => {
    mockTopologyData = {
      nodes: [makeNode({ node_id: 'n1', hostname: 'LocalRack', display_label: null, is_local: true })],
      audio_edges: [],
      network_edges: [],
    }
    renderTopology()

    const renameBtn = await screen.findByTitle('Click to rename this node')
    fireEvent.click(renameBtn)
    const input = screen.getByRole('textbox', { name: 'Node display label' })
    fireEvent.change(input, { target: { value: 'Whatever' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(mockPatchNodeLabel).not.toHaveBeenCalled()
    // Input gone, hostname button back
    expect(screen.queryByRole('textbox', { name: 'Node display label' })).toBeNull()
  })

  it('renders latency label on a network edge between two nodes', () => {
    mockTopologyData = {
      nodes: [
        makeNode({ node_id: 'n-local', hostname: 'LocalRack', is_local: true }),
        makeNode({ node_id: 'n-remote', hostname: 'RemoteRack', is_local: false }),
      ],
      audio_edges: [],
      network_edges: [
        { source_node_id: 'n-local', dest_node_id: 'n-remote', latency_ms: 3.7 },
      ],
    }
    renderTopology()

    // SVG text element with the latency value
    expect(screen.getByText('3.7ms')).toBeInTheDocument()
  })
})
