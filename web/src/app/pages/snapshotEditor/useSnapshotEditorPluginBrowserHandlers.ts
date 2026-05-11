// Snapshot editor "plugin browser handlers" hook
// (T2473 JSX partition — Plugin Browser handler extraction, cycle 3
// of the autonomous Continue run shipping 2026-05-11).
//
// Lifts off the monolith four small Plugin-Browser-only callbacks plus
// the local `pluginBrowserMode` state:
//   - `pluginBrowserMode` + `setPluginBrowserMode`: which tab the
//     Plugin Browser modal is showing (the LV2 plugins index vs the
//     native-processors catalog).
//   - `toggleFavorite`: flip a plugin URI in the favorites set,
//     dispatching the user-visible toast ("Added to favorites" /
//     "Removed from favorites") in the same step.
//   - `collapseAllCategories`: collapse every grouped-plugins category
//     row at once.
//   - `expandAllCategories`: empty the collapsed-categories set so
//     every category is visible.
//   - `handleShowDetails`: open the per-plugin details overlay with a
//     specific Plugin record.
//
// Behavioral parity preserved verbatim — identical setter shape,
// identical toast routing, identical no-op semantics. The four
// callbacks here are the literal bodies that used to live inline in
// `SnapshotEditorPageContent.tsx` 3809-3835.

import { useCallback, useState } from 'react'

import type { Plugin } from '../../../map2/types'
import type { NotificationTone } from '../../components/Toasts'
import type { Updater } from '../../stores/snapshotEditorStore'

export type PluginBrowserMode = 'plugins' | 'catalog'

type GroupedPluginsEntry = readonly [string, readonly Plugin[]]

export interface UseSnapshotEditorPluginBrowserHandlersArgs {
  /** The grouped-plugin tuples derived in `useSnapshotEditorPluginBrowserData`. */
  groupedPlugins: ReadonlyArray<GroupedPluginsEntry>
  /** Setter for the favorites set on the editor store. */
  setFavoritePlugins: (favorites: Updater<Set<string>>) => void
  /** Setter for the collapsed-categories set on the editor store. */
  setCollapsedCategories: (next: Updater<Set<string>>) => void
  /** Setter for the details-plugin slot on the editor store. */
  setDetailsPlugin: (plugin: Plugin | null) => void
  /** Toast helper threaded from the page (preserves stable identity). */
  pushToast: (message: string, tone?: NotificationTone) => void
}

export interface UseSnapshotEditorPluginBrowserHandlersResult {
  pluginBrowserMode: PluginBrowserMode
  setPluginBrowserMode: (mode: PluginBrowserMode) => void
  toggleFavorite: (uri: string) => void
  collapseAllCategories: () => void
  expandAllCategories: () => void
  handleShowDetails: (plugin: Plugin) => void
}

export function useSnapshotEditorPluginBrowserHandlers({
  groupedPlugins,
  setFavoritePlugins,
  setCollapsedCategories,
  setDetailsPlugin,
  pushToast,
}: UseSnapshotEditorPluginBrowserHandlersArgs): UseSnapshotEditorPluginBrowserHandlersResult {
  const [pluginBrowserMode, setPluginBrowserMode] = useState<PluginBrowserMode>('plugins')

  const toggleFavorite = useCallback(
    (uri: string) => {
      setFavoritePlugins((prev) => {
        const next = new Set(prev)
        if (next.has(uri)) {
          next.delete(uri)
          pushToast('Removed from favorites', 'info')
        } else {
          next.add(uri)
          pushToast('Added to favorites', 'success')
        }
        return next
      })
    },
    [pushToast, setFavoritePlugins],
  )

  const collapseAllCategories = useCallback(() => {
    setCollapsedCategories(new Set(groupedPlugins.map(([name]) => name)))
  }, [groupedPlugins, setCollapsedCategories])

  const expandAllCategories = useCallback(() => {
    setCollapsedCategories(new Set())
  }, [setCollapsedCategories])

  const handleShowDetails = useCallback(
    (plugin: Plugin) => {
      setDetailsPlugin(plugin)
    },
    [setDetailsPlugin],
  )

  return {
    pluginBrowserMode,
    setPluginBrowserMode,
    toggleFavorite,
    collapseAllCategories,
    expandAllCategories,
    handleShowDetails,
  }
}
