import '@testing-library/jest-dom'
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AudioArtifactsPage } from './AudioArtifactsPage'

const mockUseCluster = jest.fn()
const mockUseNodePageContext = jest.fn()
const mockUsePluginBrowser = jest.fn()
const mockIrListCabinets = jest.fn()
const mockIrListReverbs = jest.fn()
const mockIrStatus = jest.fn()
const mockIrLoadCabinet = jest.fn()
const mockIrLoadReverb = jest.fn()
const mockIrUploadCabinet = jest.fn()
const mockIrUploadReverb = jest.fn()
const mockNamStatus = jest.fn()
const mockNamModels = jest.fn()
const mockNamActivate = jest.fn()
const mockNamUpload = jest.fn()
const mockSoundfontList = jest.fn()
const mockSoundfontUpload = jest.fn()

jest.mock('../contexts/ClusterContext', () => ({
  useCluster: () => mockUseCluster(),
}))

jest.mock('../hooks/useNodePageContext', () => ({
  useNodePageContext: () => mockUseNodePageContext(),
}))

jest.mock('../hooks/usePluginBrowser', () => ({
  usePluginBrowser: () => mockUsePluginBrowser(),
}))

jest.mock('../components/artifacts/ArtifactDownloadModal', () => ({
  ArtifactDownloadModal: ({
    surface,
    initialTab,
    nodeId,
  }: {
    surface?: string
    initialTab?: string
    nodeId?: string | null
  }) => (
    <div data-testid="artifact-discovery-workspace">
      {`${surface ?? 'modal'}|${initialTab ?? 'plugin-packs'}|${nodeId ?? 'local'}`}
    </div>
  ),
}))

jest.mock('../components/artifacts/SnapshotArtifactsWorkspace', () => ({
  SnapshotArtifactsWorkspace: ({
    searchQuery,
  }: {
    searchQuery?: string
  }) => (
    <div data-testid="snapshot-artifacts-workspace">
      {searchQuery ?? ''}
    </div>
  ),
}))

jest.mock('../../map2/api', () => ({
  pluginsApi: {
    discover: jest.fn(),
    delete: jest.fn(),
  },
  irApi: {
    listCabinets: (...args: unknown[]) => mockIrListCabinets(...args),
    listReverbs: (...args: unknown[]) => mockIrListReverbs(...args),
    getStatus: (...args: unknown[]) => mockIrStatus(...args),
    loadCabinet: (...args: unknown[]) => mockIrLoadCabinet(...args),
    loadReverb: (...args: unknown[]) => mockIrLoadReverb(...args),
    uploadCabinet: (...args: unknown[]) => mockIrUploadCabinet(...args),
    uploadReverb: (...args: unknown[]) => mockIrUploadReverb(...args),
  },
  namApi: {
    getStatus: (...args: unknown[]) => mockNamStatus(...args),
    listModels: (...args: unknown[]) => mockNamModels(...args),
    activateModel: (...args: unknown[]) => mockNamActivate(...args),
    upload: (...args: unknown[]) => mockNamUpload(...args),
  },
  soundfontApi: {
    listSoundfonts: (...args: unknown[]) => mockSoundfontList(...args),
    upload: (...args: unknown[]) => mockSoundfontUpload(...args),
  },
}))

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>
}

function renderArtifacts(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[initialEntry]}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
          <Route
            path="/artifacts"
            element={(
              <>
                <AudioArtifactsPage />
                <LocationProbe />
              </>
            )}
          />
          <Route
            path="/artifacts/discover"
            element={(
              <>
                <AudioArtifactsPage discoverMode />
                <LocationProbe />
              </>
            )}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AudioArtifactsPage routed workspace', () => {
  beforeEach(() => {
    mockUseCluster.mockReturnValue({
      activeNodeId: null,
      localNodeId: 'node-local',
      isClusterMode: true,
      nodes: [
        { nodeId: 'node-local', hostname: 'local-rack', isLocal: true },
        { nodeId: 'node-remote', hostname: 'remote-rack', isLocal: false },
      ],
    })

    mockUseNodePageContext.mockReturnValue({
      localNode: { node_id: 'node-local', hostname: 'local-rack', is_local: true },
      topology: {
        nodes: [
          { node_id: 'node-local', hostname: 'local-rack', is_local: true },
          { node_id: 'node-remote', hostname: 'remote-rack', is_local: false },
        ],
      },
    })

    mockUsePluginBrowser.mockReturnValue({
      allPlugins: [
        {
          uri: 'plugin://studio-compressor',
          name: 'Studio Compressor',
          author: 'ACME Audio',
          format: 'LV2',
          category: 'Dynamics',
          version: '1.0.0',
        },
      ],
      isLoading: false,
      scanPlugins: jest.fn().mockResolvedValue(undefined),
    })
    mockIrListCabinets.mockResolvedValue({ irs: [] })
    mockIrListReverbs.mockResolvedValue({ irs: [] })
    mockIrStatus.mockResolvedValue({})
    mockIrLoadCabinet.mockResolvedValue({})
    mockIrLoadReverb.mockResolvedValue({})
    mockIrUploadCabinet.mockResolvedValue({})
    mockIrUploadReverb.mockResolvedValue({})
    mockNamStatus.mockResolvedValue({ activeModel: null })
    mockNamModels.mockResolvedValue({ models: [] })
    mockNamActivate.mockResolvedValue({})
    mockNamUpload.mockResolvedValue({})
    mockSoundfontList.mockResolvedValue({ soundfonts: [] })
    mockSoundfontUpload.mockResolvedValue({})

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
        configurable: true,
        value: class ResizeObserver {
          observe() {}
          unobserve() {}
          disconnect() {}
        },
      })
    }
  })

  it('renders the upgraded left rail with headed workspace navigation and status context', async () => {
    renderArtifacts('/artifacts?category=lv2-plugins')

    expect(await screen.findByRole('heading', { name: 'Artifacts Library' })).toBeInTheDocument()
    expect(screen.getByText('Move between intake and node-aware artifact families from one rail while keeping the working table and detail context in place.')).toBeInTheDocument()
    expect(screen.getByText('Open the route-native intake workspace for plugin packs, models, impulse responses, and SoundFonts.')).toBeInTheDocument()
    expect(screen.getByText('Current node')).toBeInTheDocument()
    expect(screen.getAllByText('local-rack').length).toBeGreaterThan(0)
    expect(screen.getByText('Items in view')).toBeInTheDocument()
    expect(screen.getAllByText('1 items').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Snapshots').length).toBeGreaterThan(0)
  })

  it('renders snapshots as a top-level artifacts workspace category', async () => {
    renderArtifacts('/artifacts?category=snapshots&q=dirty')

    expect(await screen.findByRole('heading', { name: 'Audio Artifacts' })).toBeInTheDocument()
    expect(screen.getAllByText('Saved signal-state artifacts with lifecycle, full content visibility, and best-effort cluster deployment context').length).toBeGreaterThan(0)
    expect(screen.getByTestId('snapshot-artifacts-workspace')).toHaveTextContent('dirty')
  })

  it('renders the library route and opens inline detail and sync panels inside the workspace', async () => {
    renderArtifacts('/artifacts?category=lv2-plugins')

    expect(await screen.findByRole('heading', { name: 'Audio Artifacts' })).toBeInTheDocument()
    expect(screen.getByText('Studio Compressor')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'View details' }))

    expect(screen.getByRole('complementary', { name: 'Artifact details' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load to Graph' })).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Sync queue' })[0])

    expect(screen.getByRole('complementary', { name: 'Sync queue' })).toBeInTheDocument()
  })

  it('navigates from the library route into the canonical discover route and preserves query state', async () => {
    renderArtifacts('/artifacts?category=lv2-plugins')

    expect(await screen.findByRole('heading', { name: 'Audio Artifacts' })).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Download & Discover' })[0])

    expect(await screen.findByTestId('location-probe')).toHaveTextContent('/artifacts/discover?category=lv2-plugins')
    expect(screen.getByTestId('artifact-discovery-workspace')).toHaveTextContent('embedded|plugin-packs|local')
  })

  it('renders discover as an embedded route-native workspace with contextual tab mapping and return navigation', async () => {
    renderArtifacts('/artifacts/discover?category=nam-models')

    expect(await screen.findByTestId('artifact-discovery-workspace')).toHaveTextContent('embedded|nam|local')

    fireEvent.click(screen.getAllByRole('button', { name: 'Return to library' })[0])

    expect(await screen.findByTestId('location-probe')).toHaveTextContent('/artifacts?category=nam-models')
  })

  it('uses Carbon loading feedback while plugin scans are running from the empty state', async () => {
    let resolveScan: (() => void) | null = null
    const scanPromise = new Promise<void>((resolve) => {
      resolveScan = resolve
    })

    mockUsePluginBrowser.mockReturnValue({
      allPlugins: [],
      isLoading: false,
      scanPlugins: jest.fn().mockImplementation(() => scanPromise),
    })

    renderArtifacts('/artifacts?category=lv2-plugins')

    expect(await screen.findByRole('heading', { name: 'Audio Artifacts' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Scan for plugins' }))

    expect(await screen.findByText('Scanning plugins')).toBeInTheDocument()

    resolveScan?.()

    await waitFor(() => {
      expect(screen.queryByText('Scanning plugins')).not.toBeInTheDocument()
    })
  })
})
