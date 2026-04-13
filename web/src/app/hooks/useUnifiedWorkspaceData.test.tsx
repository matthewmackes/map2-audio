import '@testing-library/jest-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'

import { useUnifiedWorkspaceData } from './useUnifiedWorkspaceData'

const mockUsePlatformShellData = jest.fn()
const mockGetSummary = jest.fn()
const mockDiscover = jest.fn()
const mockListCabinets = jest.fn()
const mockListReverbs = jest.fn()
const mockGetIrStatus = jest.fn()
const mockGetNamStatus = jest.fn()
const mockListModels = jest.fn()
const mockListSoundfonts = jest.fn()

jest.mock('./usePlatformShellData', () => ({
  usePlatformShellData: () => mockUsePlatformShellData(),
}))

jest.mock('../../map2/clients/enrichedPhysicalSurfaces', () => ({
  enrichedPhysicalSurfacesApi: {
    getSummary: () => mockGetSummary(),
  },
}))

jest.mock('../../map2/api', () => ({
  pluginsApi: {
    discover: (...args: unknown[]) => mockDiscover(...args),
  },
  irApi: {
    listCabinets: (...args: unknown[]) => mockListCabinets(...args),
    listReverbs: (...args: unknown[]) => mockListReverbs(...args),
    getStatus: (...args: unknown[]) => mockGetIrStatus(...args),
  },
  namApi: {
    getStatus: (...args: unknown[]) => mockGetNamStatus(...args),
    listModels: (...args: unknown[]) => mockListModels(...args),
  },
  soundfontApi: {
    listSoundfonts: (...args: unknown[]) => mockListSoundfonts(...args),
  },
}))

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useUnifiedWorkspaceData', () => {
  beforeEach(() => {
    mockUsePlatformShellData.mockReturnValue({
      layers: [{ id: 'network' }, { id: 'runtime' }],
      layerHealth: { network: 'healthy', runtime: 'warning' },
      summaryMetrics: [{ id: 'cluster', label: 'Cluster', value: 'Healthy', tone: 'healthy' }],
      alerts: [{ id: 'a1', severity: 'warning' }],
    })

    mockGetSummary.mockResolvedValue({
      summary: {
        units: [{ unit_id: 'maschine-mk1', status: 'online' }, { unit_id: 'mackie-mcu-pro', status: 'attention' }],
        notifications: [{ id: 'note-1' }],
      },
    })
    mockDiscover.mockResolvedValue({
      plugins: [
        { uri: 'map2://juce/brain', format: 'JUCE' },
        { uri: 'https://example.com/lv2', format: 'LV2' },
      ],
    })
    mockListCabinets.mockResolvedValue({ count: 2, irs: [{ name: 'Cab 1' }, { name: 'Cab 2' }] })
    mockListReverbs.mockResolvedValue({ count: 1, irs: [{ name: 'Verb 1' }] })
    mockGetIrStatus.mockResolvedValue({ active_cabinet: 'Cab 1', loaded_reverb: 'Verb 1' })
    mockGetNamStatus.mockResolvedValue({ activeModel: 'JCM800' })
    mockListModels.mockResolvedValue({ models: [{ name: 'JCM800' }, { name: 'Deluxe' }] })
    mockListSoundfonts.mockResolvedValue({ soundfonts: [{ name: 'Grand', filename: 'grand.sf2', path: '/sf/grand.sf2', format: 'sf2', category: 'Piano', library: 'Factory', size: 1024 }] })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('combines platform, surface, artifact, and outboard summaries into one shell contract', async () => {
    const { result } = renderHook(() => useUnifiedWorkspaceData(), { wrapper: makeWrapper() })

    await waitFor(() => {
      expect(result.current.summaries.artifacts.metric).toBe('8 assets')
    })

    expect(result.current.orderedSummaries.map((summary) => summary.key)).toEqual([
      'platforms',
      'physical-surfaces',
      'artifacts',
      'outboard-hardware',
    ])
    expect(result.current.summaries.platforms.metric).toBe('1 metric')
    expect(result.current.summaries['physical-surfaces'].detail).toBe('1 notification · 1 online unit')
    expect(result.current.summaries.artifacts.detail).toContain('1 native plugin')
    expect(result.current.summaries.artifacts.detail).toContain('NAM active')
    expect(result.current.summaries['outboard-hardware'].metric).toBe('5 devices')
    expect(result.current.physicalSurfaces.summary?.units).toHaveLength(2)
  })

  it('isolates failing artifact queries to the artifact summary', async () => {
    mockListModels.mockRejectedValueOnce(new Error('NAM models unavailable'))

    const { result } = renderHook(() => useUnifiedWorkspaceData(), { wrapper: makeWrapper() })

    await waitFor(() => {
      expect(result.current.summaries.artifacts.isError).toBe(true)
    })

    expect(result.current.summaries.artifacts.metric).toBe('Inventory partial')
    expect(result.current.summaries.platforms.isError).toBe(false)
    expect(result.current.summaries['physical-surfaces'].isError).toBe(false)
    expect(result.current.summaries['outboard-hardware'].isError).toBe(false)
  })
})
