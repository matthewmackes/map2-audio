/**
 * T2473 JSX partition (cycle 3, 2026-05-11) — Plugin Browser handlers
 * parity test.
 *
 * Asserts behavioral parity with the inline callbacks + local
 * `pluginBrowserMode` state lifted off the monolith into
 * `useSnapshotEditorPluginBrowserHandlers`:
 *   - `pluginBrowserMode` initialises to 'plugins' and round-trips
 *     through the setter.
 *   - `toggleFavorite` adds an unseen URI (success toast), removes a
 *     present URI (info toast); preserves stable identity across
 *     toggles.
 *   - `collapseAllCategories` passes the category-name Set built from
 *     `groupedPlugins` to the store setter.
 *   - `expandAllCategories` passes an empty Set to the store setter.
 *   - `handleShowDetails` forwards the Plugin reference to
 *     `setDetailsPlugin` verbatim.
 */
import { act, renderHook } from '@testing-library/react'

import type { Plugin } from '../../../map2/types'
import { useSnapshotEditorPluginBrowserHandlers } from './useSnapshotEditorPluginBrowserHandlers'

function makePlugin(uri: string): Plugin {
  return {
    uri,
    name: uri,
    category: 'EQ',
    author: 'test',
    classes: [],
    audio_inputs: 1,
    audio_outputs: 1,
    is_instrument: false,
    has_midi_input: false,
    is_internal: false,
    format: 'lv2',
  } as Plugin
}

interface HarnessOptions {
  groupedPlugins?: ReadonlyArray<readonly [string, readonly Plugin[]]>
}

function setupHandlers(options: HarnessOptions = {}) {
  const pushToast = jest.fn()
  const setDetailsPlugin = jest.fn()
  const collapsedSetterCalls: Array<Set<string>> = []
  const favoritesSetterCalls: Array<Set<string>> = []

  // Snapshot the favorites state in a closure so functional updaters
  // round-trip exactly the way the Zustand store handles them.
  let favoritesState = new Set<string>()
  const setFavoritePlugins = jest.fn((updater: any) => {
    const next = typeof updater === 'function' ? updater(favoritesState) : updater
    favoritesState = next instanceof Set ? next : new Set(next)
    favoritesSetterCalls.push(new Set(favoritesState))
  })

  const setCollapsedCategories = jest.fn((next: any) => {
    collapsedSetterCalls.push(next instanceof Set ? new Set(next) : new Set())
  })

  const groupedPlugins = options.groupedPlugins ?? []

  const hook = renderHook(() =>
    useSnapshotEditorPluginBrowserHandlers({
      groupedPlugins,
      setFavoritePlugins,
      setCollapsedCategories,
      setDetailsPlugin,
      pushToast,
    }),
  )

  return {
    hook,
    pushToast,
    setDetailsPlugin,
    setFavoritePlugins,
    setCollapsedCategories,
    favoritesSetterCalls,
    collapsedSetterCalls,
    favoritesNow: () => favoritesState,
  }
}

describe('useSnapshotEditorPluginBrowserHandlers', () => {
  it('initialises pluginBrowserMode to "plugins" and round-trips through the setter', () => {
    const { hook } = setupHandlers()

    expect(hook.result.current.pluginBrowserMode).toBe('plugins')

    act(() => hook.result.current.setPluginBrowserMode('catalog'))
    expect(hook.result.current.pluginBrowserMode).toBe('catalog')

    act(() => hook.result.current.setPluginBrowserMode('plugins'))
    expect(hook.result.current.pluginBrowserMode).toBe('plugins')
  })

  it('toggleFavorite adds an unseen URI with the success toast', () => {
    const { hook, pushToast, favoritesNow } = setupHandlers()

    act(() => hook.result.current.toggleFavorite('urn:native:nam'))

    expect(favoritesNow().has('urn:native:nam')).toBe(true)
    expect(pushToast).toHaveBeenCalledWith('Added to favorites', 'success')
    expect(pushToast).toHaveBeenCalledTimes(1)
  })

  it('toggleFavorite removes a present URI with the info toast', () => {
    const { hook, pushToast, favoritesNow } = setupHandlers()

    // Seed the favorites set with one URI.
    act(() => hook.result.current.toggleFavorite('urn:native:ir'))
    pushToast.mockClear()

    // Toggling the same URI removes it + emits the "Removed" toast.
    act(() => hook.result.current.toggleFavorite('urn:native:ir'))

    expect(favoritesNow().has('urn:native:ir')).toBe(false)
    expect(pushToast).toHaveBeenCalledWith('Removed from favorites', 'info')
    expect(pushToast).toHaveBeenCalledTimes(1)
  })

  it('toggleFavorite handles consecutive add/remove cycles without leaking entries', () => {
    const { hook, favoritesNow } = setupHandlers()

    act(() => hook.result.current.toggleFavorite('urn:a'))
    act(() => hook.result.current.toggleFavorite('urn:b'))
    act(() => hook.result.current.toggleFavorite('urn:a')) // remove

    const favs = favoritesNow()
    expect(favs.has('urn:a')).toBe(false)
    expect(favs.has('urn:b')).toBe(true)
    expect(favs.size).toBe(1)
  })

  it('collapseAllCategories passes the full category-name Set to the store setter', () => {
    const grouped = [
      ['Distortion', [makePlugin('urn:plug-1')]] as const,
      ['Dynamics', [makePlugin('urn:plug-2')]] as const,
      ['Reverb', [makePlugin('urn:plug-3')]] as const,
    ]
    const { hook, collapsedSetterCalls } = setupHandlers({ groupedPlugins: grouped })

    act(() => hook.result.current.collapseAllCategories())

    expect(collapsedSetterCalls).toHaveLength(1)
    expect(Array.from(collapsedSetterCalls[0])).toEqual(['Distortion', 'Dynamics', 'Reverb'])
  })

  it('collapseAllCategories with no groups passes an empty Set', () => {
    const { hook, collapsedSetterCalls } = setupHandlers({ groupedPlugins: [] })

    act(() => hook.result.current.collapseAllCategories())

    expect(collapsedSetterCalls).toHaveLength(1)
    expect(collapsedSetterCalls[0].size).toBe(0)
  })

  it('expandAllCategories passes an empty Set to the store setter', () => {
    const grouped = [
      ['Distortion', [makePlugin('urn:plug-1')]] as const,
    ]
    const { hook, collapsedSetterCalls } = setupHandlers({ groupedPlugins: grouped })

    act(() => hook.result.current.expandAllCategories())

    expect(collapsedSetterCalls).toHaveLength(1)
    expect(collapsedSetterCalls[0].size).toBe(0)
  })

  it('handleShowDetails forwards the Plugin reference verbatim to setDetailsPlugin', () => {
    const plugin = makePlugin('urn:nam')
    const { hook, setDetailsPlugin } = setupHandlers()

    act(() => hook.result.current.handleShowDetails(plugin))

    expect(setDetailsPlugin).toHaveBeenCalledWith(plugin)
    expect(setDetailsPlugin).toHaveBeenCalledTimes(1)
  })
})
