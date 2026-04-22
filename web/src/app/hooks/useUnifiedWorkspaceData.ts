import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'

import { pluginsApi, irApi, namApi, soundfontApi } from '../../map2/api'
import type { IRStatus, NAMModelsResponse, NAMStatus, PluginsResponse } from '../../map2/types'
import type { SoundFontListResponse } from '../types/library'
import { usePlatformShellData } from './usePlatformShellData'

export type UnifiedWorkspaceSectionKey =
  | 'platforms'
  | 'artifacts'

export type UnifiedWorkspaceSectionTone = 'info' | 'positive' | 'warning' | 'error'

export interface UnifiedWorkspaceSectionSummary {
  key: UnifiedWorkspaceSectionKey
  label: string
  metric: string
  detail: string
  tone: UnifiedWorkspaceSectionTone
  isLoading: boolean
  isError: boolean
}

export interface UnifiedWorkspaceData {
  summaries: Record<UnifiedWorkspaceSectionKey, UnifiedWorkspaceSectionSummary>
  orderedSummaries: UnifiedWorkspaceSectionSummary[]
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function formatPlatformSummary(sectionData: ReturnType<typeof usePlatformShellData>): UnifiedWorkspaceSectionSummary {
  const criticalCount = sectionData.alerts.filter((alert) => alert.severity === 'critical').length
  const warningCount = sectionData.alerts.filter((alert) => alert.severity === 'warning').length
  const offlineCount = Object.values(sectionData.layerHealth).filter((value) => value === 'offline').length
  const degradedCount = Object.values(sectionData.layerHealth).filter((value) => value === 'critical' || value === 'warning').length
  const totalAlerts = sectionData.alerts.length
  const tone: UnifiedWorkspaceSectionTone = criticalCount > 0 || offlineCount > 0
    ? 'error'
    : warningCount > 0 || degradedCount > 0
      ? 'warning'
      : sectionData.summaryMetrics.length > 0
        ? 'positive'
        : 'info'

  const detailParts: string[] = []
  detailParts.push(pluralize(sectionData.layers.length, 'layer'))
  if (totalAlerts > 0) {
    detailParts.push(pluralize(totalAlerts, 'alert'))
  }
  if (offlineCount > 0) {
    detailParts.push(pluralize(offlineCount, 'offline layer'))
  }

  return {
    key: 'platforms',
    label: 'Platforms',
    metric: pluralize(sectionData.summaryMetrics.length, 'metric'),
    detail: detailParts.join(' · '),
    tone,
    isLoading: false,
    isError: false,
  }
}

function extractPlugins(response: PluginsResponse | PluginsResponse['plugins'] | unknown): PluginsResponse['plugins'] {
  if (Array.isArray(response)) {
    return response
  }
  if (response && typeof response === 'object' && 'plugins' in response) {
    return (response as PluginsResponse).plugins ?? []
  }
  return []
}

function formatArtifactsSummary(
  pluginsResponse: PluginsResponse | PluginsResponse['plugins'] | null,
  cabinetsCount: number,
  reverbsCount: number,
  irStatus: IRStatus | null,
  namStatus: NAMStatus | null,
  namModels: NAMModelsResponse | null,
  soundfonts: SoundFontListResponse | null,
  isLoading: boolean,
  isError: boolean,
): UnifiedWorkspaceSectionSummary {
  if (isError) {
    return {
      key: 'artifacts',
      label: 'Audio Artifacts',
      metric: 'Inventory partial',
      detail: 'One or more artifact summary requests failed.',
      tone: 'error',
      isLoading: false,
      isError: true,
    }
  }

  if (isLoading && !pluginsResponse && !irStatus && !namStatus && !soundfonts) {
    return {
      key: 'artifacts',
      label: 'Audio Artifacts',
      metric: 'Loading inventory',
      detail: 'Collecting plugin and asset counts.',
      tone: 'info',
      isLoading: true,
      isError: false,
    }
  }

  const plugins = extractPlugins(pluginsResponse)
  const nativePlugins = plugins.filter((plugin) => {
    const candidate = plugin as typeof plugin & { format_name?: string; is_native?: boolean }
    return candidate.format_name === 'JUCE' || candidate.is_native === true || plugin.uri.startsWith('map2://juce/')
  })
  const totalInventory = plugins.length
    + cabinetsCount
    + reverbsCount
    + (namModels?.models.length ?? 0)
    + (soundfonts?.soundfonts.length ?? 0)
  const activeParts: string[] = []
  if (irStatus?.active_cabinet || irStatus?.loaded_cabinet) activeParts.push('cabinet loaded')
  if (irStatus?.active_reverb || irStatus?.loaded_reverb) activeParts.push('reverb loaded')
  if (namStatus?.activeModel) activeParts.push('NAM active')
  const tone: UnifiedWorkspaceSectionTone = activeParts.length > 0 || nativePlugins.length > 0
    ? 'positive'
    : totalInventory > 0
      ? 'info'
      : 'warning'

  return {
    key: 'artifacts',
    label: 'Audio Artifacts',
    metric: pluralize(totalInventory, 'asset'),
    detail: `${pluralize(nativePlugins.length, 'native plugin')} · ${pluralize(soundfonts?.soundfonts.length ?? 0, 'soundfont')}${activeParts.length > 0 ? ` · ${activeParts.join(', ')}` : ''}`,
    tone,
    isLoading: false,
    isError: false,
  }
}

export function useUnifiedWorkspaceData(): UnifiedWorkspaceData {
  const platformData = usePlatformShellData()
  const queryResults = useQueries({
    queries: [
      {
        queryKey: ['workspace-hub', 'artifacts', 'plugins'],
        queryFn: () => pluginsApi.discover(false),
        staleTime: 10_000,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: ['workspace-hub', 'artifacts', 'ir-cabinets'],
        queryFn: () => irApi.listCabinets(),
        staleTime: 10_000,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: ['workspace-hub', 'artifacts', 'ir-reverbs'],
        queryFn: () => irApi.listReverbs(),
        staleTime: 10_000,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: ['workspace-hub', 'artifacts', 'ir-status'],
        queryFn: () => irApi.getStatus(),
        staleTime: 10_000,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: ['workspace-hub', 'artifacts', 'nam-status'],
        queryFn: () => namApi.getStatus(),
        staleTime: 10_000,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: ['workspace-hub', 'artifacts', 'nam-models'],
        queryFn: () => namApi.listModels({ limit: 500 }),
        staleTime: 10_000,
        refetchOnWindowFocus: false,
      },
      {
        queryKey: ['workspace-hub', 'artifacts', 'soundfonts'],
        queryFn: () => soundfontApi.listSoundfonts({ limit: 500 } as any),
        staleTime: 10_000,
        refetchOnWindowFocus: false,
      },
    ],
  })

  const [
    pluginsQuery,
    cabinetsQuery,
    reverbsQuery,
    irStatusQuery,
    namStatusQuery,
    namModelsQuery,
    soundfontsQuery,
  ] = queryResults
  const artifactQueries = [
    pluginsQuery,
    cabinetsQuery,
    reverbsQuery,
    irStatusQuery,
    namStatusQuery,
    namModelsQuery,
    soundfontsQuery,
  ]

  return useMemo(() => {
    const summaries: Record<UnifiedWorkspaceSectionKey, UnifiedWorkspaceSectionSummary> = {
      platforms: formatPlatformSummary(platformData),
      artifacts: formatArtifactsSummary(
        (pluginsQuery.data as PluginsResponse | PluginsResponse['plugins'] | null | undefined) ?? null,
        cabinetsQuery.data?.count ?? cabinetsQuery.data?.irs?.length ?? 0,
        reverbsQuery.data?.count ?? reverbsQuery.data?.irs?.length ?? 0,
        (irStatusQuery.data as IRStatus | null | undefined) ?? null,
        (namStatusQuery.data as NAMStatus | null | undefined) ?? null,
        (namModelsQuery.data as NAMModelsResponse | null | undefined) ?? null,
        (soundfontsQuery.data as SoundFontListResponse | null | undefined) ?? null,
        artifactQueries.some((result) => result.isLoading),
        artifactQueries.some((result) => result.isError),
      ),
    }

    return {
      summaries,
      orderedSummaries: [
        summaries.platforms,
        summaries.artifacts,
      ],
    }
  }, [
    cabinetsQuery.data,
    cabinetsQuery.isError,
    cabinetsQuery.isLoading,
    namModelsQuery.data,
    namModelsQuery.isError,
    namModelsQuery.isLoading,
    namStatusQuery.data,
    namStatusQuery.isError,
    namStatusQuery.isLoading,
    platformData,
    pluginsQuery.data,
    pluginsQuery.isError,
    pluginsQuery.isLoading,
    reverbsQuery.data,
    reverbsQuery.isError,
    reverbsQuery.isLoading,
    irStatusQuery.data,
    irStatusQuery.isError,
    irStatusQuery.isLoading,
    soundfontsQuery.data,
    soundfontsQuery.isError,
    soundfontsQuery.isLoading,
  ])
}

export default useUnifiedWorkspaceData
