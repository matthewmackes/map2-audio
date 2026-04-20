import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockListCabinets = jest.fn()
const mockListReverbs = jest.fn()
const mockListModels = jest.fn()
const mockListSoundfonts = jest.fn()
const mockDiscoverPlugins = jest.fn()
const mockGetIrStatus = jest.fn()
const mockGetNamStatus = jest.fn()
const mockScanAll = jest.fn()
const mockDeleteModel = jest.fn()
const mockUseCluster = jest.fn()
const mockFetch = jest.fn()

jest.mock('../../../map2/api', () => ({
  irApi: {
    listCabinets: (...args: unknown[]) => mockListCabinets(...args),
    listReverbs: (...args: unknown[]) => mockListReverbs(...args),
    getStatus: (...args: unknown[]) => mockGetIrStatus(...args),
  },
  namApi: {
    listModels: (...args: unknown[]) => mockListModels(...args),
    getStatus: (...args: unknown[]) => mockGetNamStatus(...args),
    deleteModel: (...args: unknown[]) => mockDeleteModel(...args),
  },
  soundfontApi: {
    listSoundfonts: (...args: unknown[]) => mockListSoundfonts(...args),
  },
  pluginsApi: {
    discover: (...args: unknown[]) => mockDiscoverPlugins(...args),
  },
  foldersApi: {
    scanAll: (...args: unknown[]) => mockScanAll(...args),
  },
}))

jest.mock('../../contexts/useCluster', () => ({
  useCluster: () => mockUseCluster(),
}))

import { InstalledAssetsTable } from './InstalledAssetsTable'

function renderTable() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <InstalledAssetsTable />
    </QueryClientProvider>,
  )
}

describe('InstalledAssetsTable', () => {
  beforeEach(() => {
    mockListCabinets.mockReset()
    mockListReverbs.mockReset()
    mockListModels.mockReset()
    mockListSoundfonts.mockReset()
    mockDiscoverPlugins.mockReset()
    mockGetIrStatus.mockReset()
    mockGetNamStatus.mockReset()
    mockScanAll.mockReset()
    mockDeleteModel.mockReset()
    mockUseCluster.mockReset()
    mockFetch.mockReset()

    if (typeof window.matchMedia !== 'function') {
      Object.defineProperty(window, 'matchMedia', {
        value: jest.fn().mockImplementation((query: string) => ({
          matches: query.includes('max-width') ? false : false,
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
        configurable: true,
      })
    }

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

    Object.defineProperty(global, 'fetch', {
      value: mockFetch,
      configurable: true,
      writable: true,
    })

    mockUseCluster.mockReturnValue({
      activeNodeId: null,
      nodes: [
        {
          nodeId: 'local',
          hostname: 'local',
          role: 'LOCAL',
          isLocal: true,
          isOnline: true,
          latencyMs: 0,
          lastSeen: null,
        },
      ],
      localNodeId: 'local',
      isClusterMode: false,
      setActiveNode: jest.fn(),
    })

    mockListCabinets.mockResolvedValue({
      irs: [
        { name: 'Cab A', type: 'cabinet', path: '/irs/cab-a.wav', size: 2048, sample_rate: 48000 },
      ],
      count: 1,
    })
    mockListReverbs.mockResolvedValue({ irs: [], count: 0 })
    mockListModels.mockResolvedValue({
      models: [
        { name: 'Model 1', path: '/models/model-1.nam', size: 4096, type: 'Lead' },
      ],
      total: 1,
    })
    mockListSoundfonts.mockResolvedValue({ soundfonts: [], total: 0 })
    mockDiscoverPlugins.mockResolvedValue({ plugins: [] })
    mockGetIrStatus.mockResolvedValue({ loaded_cabinet: 'Cab A', loaded_reverb: null })
    mockGetNamStatus.mockResolvedValue({ activeModel: 'Model 1' })
    mockScanAll.mockResolvedValue({})
    mockDeleteModel.mockResolvedValue({})
  })

  it('renders assets and filters them via search', async () => {
    renderTable()

    expect(await screen.findByText('Cab A')).toBeInTheDocument()
    expect(screen.getByText('Model 1')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search assets' }), {
      target: { value: 'Model 1' },
    })

    expect(screen.getByText('Model 1')).toBeInTheDocument()
    expect(screen.queryByText('Cab A')).not.toBeInTheDocument()
  })

  it('deletes selected NAM assets from the confirmation modal', async () => {
    renderTable()

    expect(await screen.findByText('Model 1')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Select Model 1'))
    fireEvent.click(screen.getByRole('button', { name: /Delete \(1\)/ }))

    const deleteDialog = await screen.findByRole('dialog', { name: 'Asset library' })
    expect(within(deleteDialog).getByText('Delete selected assets')).toBeInTheDocument()

    fireEvent.click(within(deleteDialog).getByRole('button', { name: /Delete$/ }))

    await waitFor(() => {
      expect(mockDeleteModel).toHaveBeenCalledWith('Model 1', null)
    })
  })

  it('opens deploy modal and sends selected cluster targets', async () => {
    mockUseCluster.mockReturnValue({
      activeNodeId: null,
      nodes: [
        {
          nodeId: 'local',
          hostname: 'local',
          role: 'LOCAL',
          isLocal: true,
          isOnline: true,
          latencyMs: 0,
          lastSeen: null,
        },
        {
          nodeId: 'node-a',
          hostname: 'remote-audio',
          role: 'AUDIO-NODE',
          isLocal: false,
          isOnline: true,
          latencyMs: 2,
          lastSeen: null,
        },
      ],
      localNodeId: 'local',
      isClusterMode: true,
      setActiveNode: jest.fn(),
    })

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          nodes: {
            local: { body: { items: [] } },
            'node-a': { body: { items: [] } },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          nodes: {
            local: {
              body: {
                items: [
                  {
                    path_token: 'nam-token-1',
                    filename: 'model-1.nam',
                    size_bytes: 4096,
                    checksum: 'abc123',
                  },
                ],
              },
            },
            'node-a': { body: { items: [] } },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ successful: ['node-a'], failed: [] }),
      })

    renderTable()

    await screen.findByText('Model 1')
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
    fireEvent.click(await screen.findByRole('button', { name: /Deploy to nodes/i }))
    const deployDialog = await screen.findByRole('dialog', { name: 'Cluster deployment' })
    expect(within(deployDialog).getByText('Deploy asset to nodes')).toBeInTheDocument()

    expect(within(deployDialog).getAllByText('remote-audio').length).toBeGreaterThan(0)
    fireEvent.click(within(deployDialog).getByRole('button', { name: 'Deploy' }))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/preset-exchange/deploy',
        expect.objectContaining({
          method: 'POST',
        }),
      )
    })
  })
})
