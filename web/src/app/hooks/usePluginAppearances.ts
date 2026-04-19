import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { pluginAppearancesApi } from '@/map2/api'
import type { PluginAppearanceOverride } from '@/map2/types'
import {
  getStoredPluginAppearance,
  mergeStoredPluginAppearance,
  PLUGIN_APPEARANCE_STORAGE_KEY,
  PluginAppearanceMap,
  readStoredPluginAppearances,
  subscribeStoredPluginAppearances,
  writeStoredPluginAppearances,
} from '../utils/pluginAppearanceStore'

export { PLUGIN_APPEARANCE_STORAGE_KEY, PLUGIN_APPEARANCE_SYNC_EVENT } from '../utils/pluginAppearanceStore'

function mergeOverride(current: PluginAppearanceOverride | undefined, update: Partial<PluginAppearanceOverride>, uri: string): PluginAppearanceOverride {
  return mergeStoredPluginAppearance(current, update, uri)
}

export function getPluginAppearance(uri: string): PluginAppearanceOverride | null {
  return getStoredPluginAppearance(uri)
}

export function subscribePluginAppearances(callback: () => void): () => void {
  return subscribeStoredPluginAppearances(callback)
}

export function usePluginAppearances() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['plugin-appearances'],
    initialData: () => readStoredPluginAppearances(),
    queryFn: async () => {
      const response = await pluginAppearancesApi.list()
      const normalized = Object.fromEntries(response.items.map((item) => [item.uri, item]))
      writeStoredPluginAppearances(normalized)
      return normalized
    },
    staleTime: 60_000,
    refetchOnMount: 'always',
  })

  const persistQueryData = (next: PluginAppearanceMap) => {
    writeStoredPluginAppearances(next)
    queryClient.setQueryData(['plugin-appearances'], next)
  }

  const setAppearance = useMutation({
    mutationFn: async ({ uri, overrides }: { uri: string; overrides: Partial<PluginAppearanceOverride> }) => {
      const response = await pluginAppearancesApi.put(uri, overrides)
      return { uri, response }
    },
    onSuccess: ({ uri, response }) => {
      const current = queryClient.getQueryData<PluginAppearanceMap>(['plugin-appearances']) ?? readStoredPluginAppearances()
      persistQueryData({
        ...current,
        [uri]: response,
      })
    },
  })

  const resetAppearance = useMutation({
    mutationFn: async (uri: string) => {
      await pluginAppearancesApi.remove(uri)
      return uri
    },
    onSuccess: (uri) => {
      const current = { ...(queryClient.getQueryData<PluginAppearanceMap>(['plugin-appearances']) ?? readStoredPluginAppearances()) }
      delete current[uri]
      persistQueryData(current)
    },
  })

  const uploadIcon = useMutation({
    mutationFn: async ({ uri, file }: { uri: string; file: File }) => {
      const response = await pluginAppearancesApi.uploadIcon(uri, file)
      return { uri, response }
    },
    onSuccess: ({ uri, response }) => {
      const current = queryClient.getQueryData<PluginAppearanceMap>(['plugin-appearances']) ?? readStoredPluginAppearances()
      persistQueryData({
        ...current,
        [uri]: response,
      })
    },
  })

  return {
    ...query,
    appearances: query.data ?? {},
    getPluginAppearance: (uri: string) => (query.data ?? {})[uri] ?? null,
    setPluginAppearance: async (uri: string, overrides: Partial<PluginAppearanceOverride>) => {
      const current = queryClient.getQueryData<PluginAppearanceMap>(['plugin-appearances']) ?? readStoredPluginAppearances()
      persistQueryData({
        ...current,
        [uri]: mergeOverride(current[uri], overrides, uri),
      })
      return setAppearance.mutateAsync({ uri, overrides })
    },
    resetPluginAppearance: resetAppearance.mutateAsync,
    uploadPluginAppearanceIcon: uploadIcon.mutateAsync,
  }
}
