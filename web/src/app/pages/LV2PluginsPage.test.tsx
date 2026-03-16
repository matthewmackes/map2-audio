import '@testing-library/jest-dom'
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LV2PluginsPage } from './LV2PluginsPage'

const mockSetActiveNode = jest.fn()
const mockUseCluster = jest.fn()
const mockUsePluginBrowser = jest.fn()
const mockDiscover = jest.fn()
const mockDelete = jest.fn()
const mockUseNodePageContext = jest.fn()

jest.mock('../contexts/ClusterContext', () => ({
  useCluster: () => mockUseCluster(),
}))

jest.mock('../hooks/usePluginBrowser', () => ({
  usePluginBrowser: (...args: unknown[]) => mockUsePluginBrowser(...args),
}))
jest.mock('../components/NodeContextBanner/NodeContextBanner', () => ({
  NodeContextBanner: () => <div data-testid="node-context-banner">Node Context Banner</div>,
}))
jest.mock('../components/NodeContextPicker/NodeContextPicker', () => ({
  NodeContextPicker: () => <div data-testid="node-context-picker">Node Context Picker</div>,
}))

jest.mock('../hooks/useNodePageContext', () => ({
  useNodePageContext: (...args: unknown[]) => mockUseNodePageContext(...args),
}))

jest.mock('../../map2/api', () => ({
  pluginsApi: {
    discover: (...args: unknown[]) => mockDiscover(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}))

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <LV2PluginsPage />
    </QueryClientProvider>,
  )
}

describe('LV2PluginsPage', () => {
  beforeEach(() => {
    mockSetActiveNode.mockReset()
    mockUseCluster.mockReturnValue({
      activeNodeId: null,
      nodes: [
        { nodeId: 'node-local', hostname: 'local-rack', role: 'LOCAL', isLocal: true, isOnline: true, latencyMs: 0, lastSeen: null },
        { nodeId: 'node-b', hostname: 'rack-b', role: 'REMOTE', isLocal: false, isOnline: true, latencyMs: 4.2, lastSeen: null },
      ],
      localNodeId: 'node-local',
      isClusterMode: true,
      setActiveNode: mockSetActiveNode,
    })
    mockUsePluginBrowser.mockReturnValue({
      allPlugins: [
        {
          uri: 'plugin://compressor',
          name: 'Studio Compressor',
          author: 'ACME Audio',
          category: 'Dynamics',
          version: '1.0.0',
          format: 'LV2',
          installedOn: ['node-local'],
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
    })
    mockUseNodePageContext.mockReturnValue({
      localNode: { node_id: 'node-local', hostname: 'local-rack', role: 'LOCAL', is_local: true },
      topology: {
        nodes: [
          { node_id: 'node-local', hostname: 'local-rack', role: 'LOCAL', is_local: true },
          { node_id: 'node-b', hostname: 'rack-b', role: 'REMOTE', is_local: false },
        ],
      },
      viewedNode: { node_id: 'node-local', hostname: 'local-rack', role: 'LOCAL', is_local: true },
      viewedNodeId: 'node-local',
      nodeIdentityQuery: { data: { node_id: 'node-local', hostname: 'local-rack', role: 'LOCAL', is_local: true } },
      nodeTopologyQuery: {
        data: {
          nodes: [
            { node_id: 'node-local', hostname: 'local-rack', role: 'LOCAL', is_local: true },
            { node_id: 'node-b', hostname: 'rack-b', role: 'REMOTE', is_local: false },
          ],
        },
      },
    })
    mockDiscover.mockResolvedValue({ plugins: [], count: 0 })
    mockDelete.mockResolvedValue({ uri: 'plugin://compressor' })
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
    if (typeof window.ResizeObserver === 'undefined') {
      Object.defineProperty(window, 'ResizeObserver', {
        value: class ResizeObserver {
          observe() {}
          unobserve() {}
          disconnect() {}
        },
        configurable: true,
      })
    }
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        packs: [
          {
            id: 'pack-1',
            name: 'Studio Essentials',
            description: 'Core modulation and dynamics tools.',
            packages: ['studio-essentials'],
            category: 'Dynamics',
            size_estimate: '220 MB',
            plugin_count: 8,
            status: 'installed',
          },
        ],
      }),
    }) as unknown as typeof fetch
  })

  it('renders node-scoped inventory and plugin packs', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Plugin inventory')).toBeInTheDocument()
    })

    expect(screen.getByText('Studio Compressor')).toBeInTheDocument()
    expect(screen.getByText('Plugin packs')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Studio Essentials/i })).toBeInTheDocument()
    expect(screen.getByText('Installed')).toBeInTheDocument()
  })

  it('opens remediation when a plugin is missing on a cluster node', async () => {
    mockUseCluster.mockReturnValue({
      activeNodeId: 'all',
      nodes: [
        { nodeId: 'node-local', hostname: 'local-rack', role: 'LOCAL', isLocal: true, isOnline: true, latencyMs: 0, lastSeen: null },
        { nodeId: 'node-b', hostname: 'rack-b', role: 'REMOTE', isLocal: false, isOnline: true, latencyMs: 4.2, lastSeen: null },
      ],
      localNodeId: 'node-local',
      isClusterMode: true,
      setActiveNode: mockSetActiveNode,
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Cluster target')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /rack-b missing/i }))

    expect(screen.getByText(/Switch to that node/i)).toBeInTheDocument()
  })
})
