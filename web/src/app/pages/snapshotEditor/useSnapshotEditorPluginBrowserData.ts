// Snapshot editor "plugin browser data" derivation hook
// (T2473 JSX partition — Plugin Browser sibling-data extraction).
//
// Lifts the three useMemo blocks that compute Plugin Browser derived
// data off the monolith:
//   - featuredNativeGroups + remainingNativeProcessors (split native
//     processors into the FEATURED_NATIVE_BROWSER_GROUPS curated rows
//     plus the remaining "other native" tail).
//   - groupedPlugins ([category, Plugin[]] tuples for LV2; Favorites
//     row prepended when any are pinned).
//   - favoriteVisibleCount (number of currently-filtered plugins that
//     match the favorites set).
//
// Behavioral parity preserved verbatim: same memo dependencies, same
// canonicalization rules, same Favorites-first ordering, same Other
// fallback for uncategorised LV2.

import type { ComponentType } from 'react'
import { useMemo } from 'react'

import type { Plugin } from '../../../map2/types'
import { canonicalizePluginUri } from '../../utils/pluginUris'
import { FEATURED_NATIVE_BROWSER_GROUPS } from './featuredNativeBrowserGroups'

export interface FeaturedNativeBrowserGroupResolved {
  key: string
  title: string
  icon: ComponentType<{ size?: number }>
  plugins: Plugin[]
}

export interface UseSnapshotEditorPluginBrowserDataArgs {
  /** All native processors (post-filter, post-special-settings split). */
  nativeProcessors: Plugin[]
  /** All LV2 plugins (post-filter, post-special-settings split). */
  lv2Plugins: Plugin[]
  /** Plugins matching the operator's current text/category filter. */
  filteredPlugins: Plugin[]
  /** Set of plugin URIs the operator has pinned as favorites. */
  favoritePlugins: Set<string>
}

export interface UseSnapshotEditorPluginBrowserDataResult {
  featuredNativeGroups: FeaturedNativeBrowserGroupResolved[]
  remainingNativeProcessors: Plugin[]
  groupedPlugins: [string, Plugin[]][]
  favoriteVisibleCount: number
}

export function useSnapshotEditorPluginBrowserData({
  nativeProcessors,
  lv2Plugins,
  filteredPlugins,
  favoritePlugins,
}: UseSnapshotEditorPluginBrowserDataArgs): UseSnapshotEditorPluginBrowserDataResult {
  const { featuredNativeGroups, remainingNativeProcessors } = useMemo(() => {
    const nativeByUri = new Map(
      nativeProcessors.map((plugin) => [canonicalizePluginUri(plugin.uri), plugin] as const),
    )

    const featuredGroups: FeaturedNativeBrowserGroupResolved[] = FEATURED_NATIVE_BROWSER_GROUPS
      .map((group) => {
        const plugins = group.pluginUris
          .map((pluginUri) => nativeByUri.get(pluginUri))
          .filter((plugin): plugin is Plugin => plugin !== undefined)

        return {
          ...group,
          plugins,
        }
      })
      .filter((group) => group.plugins.length > 0)

    const featuredPluginUris = new Set(
      featuredGroups.flatMap((group) =>
        group.plugins.map((plugin) => canonicalizePluginUri(plugin.uri)),
      ),
    )

    const remainingNative = nativeProcessors.filter(
      (plugin) => !featuredPluginUris.has(canonicalizePluginUri(plugin.uri)),
    )

    return {
      featuredNativeGroups: featuredGroups,
      remainingNativeProcessors: remainingNative,
    }
  }, [nativeProcessors])

  const groupedPlugins = useMemo(() => {
    const groups: Record<string, Plugin[]> = {}
    const favoritesList: Plugin[] = []

    lv2Plugins.forEach((p) => {
      if (favoritePlugins.has(p.uri)) favoritesList.push(p)
      const cat = p.category || 'Other'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(p)
    })

    const sorted = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))

    if (favoritesList.length > 0) {
      return [['Favorites', favoritesList] as [string, Plugin[]], ...sorted]
    }
    return sorted
  }, [lv2Plugins, favoritePlugins])

  const favoriteVisibleCount = useMemo(
    () => filteredPlugins.filter((plugin) => favoritePlugins.has(plugin.uri)).length,
    [filteredPlugins, favoritePlugins],
  )

  return {
    featuredNativeGroups,
    remainingNativeProcessors,
    groupedPlugins,
    favoriteVisibleCount,
  }
}
