import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'

import { pluginAppearancesApi } from '@/map2/api'

import {
  getPluginAppearance,
  PLUGIN_APPEARANCE_STORAGE_KEY,
  usePluginAppearances,
} from './usePluginAppearances'

jest.mock('@/map2/api', () => ({
  pluginAppearancesApi: {
    list: jest.fn(),
    put: jest.fn(),
    remove: jest.fn(),
    uploadIcon: jest.fn(),
  },
}))

const mockedApi = pluginAppearancesApi as jest.Mocked<typeof pluginAppearancesApi>

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('usePluginAppearances', () => {
  beforeEach(() => {
    window.localStorage.clear()
    mockedApi.list.mockReset()
    mockedApi.put.mockReset()
    mockedApi.remove.mockReset()
    mockedApi.uploadIcon.mockReset()
  })

  it('hydrates from backend and persists the cache locally', async () => {
    mockedApi.list.mockResolvedValue({
      count: 1,
      items: [
        {
          uri: 'map2://juce/nam',
          accent_color: '#112233',
          description: 'Lead NAM',
        },
      ],
    })

    const { result } = renderHook(() => usePluginAppearances(), { wrapper: makeWrapper() })

    await waitFor(() => {
      expect(result.current.appearances['map2://juce/nam']?.accent_color).toBe('#112233')
    })

    expect(JSON.parse(window.localStorage.getItem(PLUGIN_APPEARANCE_STORAGE_KEY) ?? '{}')).toMatchObject({
      'map2://juce/nam': {
        uri: 'map2://juce/nam',
        accent_color: '#112233',
      },
    })
    expect(getPluginAppearance('map2://juce/nam')?.description).toBe('Lead NAM')
  })

  it('writes through setPluginAppearance to cache and backend', async () => {
    mockedApi.list.mockResolvedValue({ count: 0, items: [] })
    mockedApi.put.mockResolvedValue({
      uri: 'hardware://lexicon-mpx1-spdif',
      accent_color: '#445566',
      icon_identifier: 'carbon:Activity',
      description: 'Rack reverb',
    })

    const { result } = renderHook(() => usePluginAppearances(), { wrapper: makeWrapper() })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    await result.current.setPluginAppearance('hardware://lexicon-mpx1-spdif', {
      accent_color: '#445566',
      icon_identifier: 'carbon:Activity',
      description: 'Rack reverb',
    })

    expect(mockedApi.put).toHaveBeenCalledWith('hardware://lexicon-mpx1-spdif', {
      accent_color: '#445566',
      icon_identifier: 'carbon:Activity',
      description: 'Rack reverb',
    })
    expect(getPluginAppearance('hardware://lexicon-mpx1-spdif')?.icon_identifier).toBe('carbon:Activity')
  })

  it('removes overrides from cache when resetPluginAppearance succeeds', async () => {
    window.localStorage.setItem(
      PLUGIN_APPEARANCE_STORAGE_KEY,
      JSON.stringify({
        'urn:test:plugin': {
          uri: 'urn:test:plugin',
          accent_color: '#abcdef',
        },
      }),
    )

    mockedApi.list.mockResolvedValue({ count: 0, items: [] })
    mockedApi.remove.mockResolvedValue({ status: 'deleted', uri: 'urn:test:plugin', removed: true })

    const { result } = renderHook(() => usePluginAppearances(), { wrapper: makeWrapper() })

    await waitFor(() => {
      expect(result.current.appearances['urn:test:plugin']?.accent_color).toBe('#abcdef')
    })

    await result.current.resetPluginAppearance('urn:test:plugin')

    expect(mockedApi.remove).toHaveBeenCalledWith('urn:test:plugin')
    expect(getPluginAppearance('urn:test:plugin')).toBeNull()
  })
})
