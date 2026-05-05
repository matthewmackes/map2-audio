/**
 * T2473 JSX partition — Plugin Browser derived-data parity test.
 *
 * Asserts behavioral parity with the inline useMemo blocks lifted off
 * the monolith:
 *   - featuredNativeGroups filters out groups whose plugins are absent.
 *   - remainingNativeProcessors excludes any URI in a featured group.
 *   - groupedPlugins sorts categories alphabetically, prepends a
 *     Favorites row when any are pinned, and uses 'Other' for missing
 *     categories.
 *   - favoriteVisibleCount counts only filtered + favorited plugins.
 */
import { renderHook } from '@testing-library/react'

import type { Plugin } from '../../../map2/types'
import { useSnapshotEditorPluginBrowserData } from './useSnapshotEditorPluginBrowserData'

// A stand-in Carbon icon shape — the hook just passes the icon
// through to the consumer, so a no-op component satisfies the type.
const FakeIcon = () => null

jest.mock('./featuredNativeBrowserGroups', () => ({
  __esModule: true,
  FEATURED_NATIVE_BROWSER_GROUPS: [
    {
      key: 'group-a',
      title: 'Group A',
      icon: FakeIcon,
      pluginUris: ['urn:native:a1', 'urn:native:a2'],
    },
    {
      key: 'group-b',
      title: 'Group B',
      icon: FakeIcon,
      pluginUris: ['urn:native:b1'],
    },
    {
      key: 'group-empty',
      title: 'Empty Group',
      icon: FakeIcon,
      pluginUris: ['urn:native:never'],
    },
  ],
}))

function makePlugin(uri: string, category = 'EQ'): Plugin {
  return {
    uri,
    name: uri,
    category,
  } as unknown as Plugin
}

describe('useSnapshotEditorPluginBrowserData', () => {
  it('builds featuredNativeGroups + remainingNativeProcessors with proper partitioning', () => {
    const native = [
      makePlugin('urn:native:a1'),
      makePlugin('urn:native:a2'),
      makePlugin('urn:native:b1'),
      makePlugin('urn:native:tail-1'),
      makePlugin('urn:native:tail-2'),
    ]
    const { result } = renderHook(() =>
      useSnapshotEditorPluginBrowserData({
        nativeProcessors: native,
        lv2Plugins: [],
        filteredPlugins: [],
        favoritePlugins: new Set(),
      }),
    )
    // Empty group filtered out.
    expect(result.current.featuredNativeGroups.map((g) => g.key)).toEqual([
      'group-a',
      'group-b',
    ])
    expect(result.current.featuredNativeGroups[0].plugins.map((p) => p.uri)).toEqual(
      ['urn:native:a1', 'urn:native:a2'],
    )
    // Tail rows are everything not in a featured group.
    expect(result.current.remainingNativeProcessors.map((p) => p.uri)).toEqual([
      'urn:native:tail-1',
      'urn:native:tail-2',
    ])
  })

  it('groups LV2 plugins by category alphabetically and prepends Favorites when pinned', () => {
    const lv2 = [
      makePlugin('urn:lv2:reverb-1', 'Reverb'),
      makePlugin('urn:lv2:eq-1', 'EQ'),
      makePlugin('urn:lv2:eq-2', 'EQ'),
      makePlugin('urn:lv2:misc-1', ''), // missing → 'Other'
    ]
    const favorites = new Set(['urn:lv2:eq-1'])
    const { result } = renderHook(() =>
      useSnapshotEditorPluginBrowserData({
        nativeProcessors: [],
        lv2Plugins: lv2,
        filteredPlugins: [],
        favoritePlugins: favorites,
      }),
    )
    const groupNames = result.current.groupedPlugins.map(([name]) => name)
    // Favorites row first, then EQ < Other < Reverb alphabetically.
    expect(groupNames).toEqual(['Favorites', 'EQ', 'Other', 'Reverb'])
    expect(
      result.current.groupedPlugins[0][1].map((p) => p.uri),
    ).toEqual(['urn:lv2:eq-1'])
    expect(
      result.current.groupedPlugins.find(([n]) => n === 'EQ')?.[1].map((p) => p.uri),
    ).toEqual(['urn:lv2:eq-1', 'urn:lv2:eq-2'])
  })

  it('omits the Favorites row when no plugins are pinned', () => {
    const lv2 = [
      makePlugin('urn:lv2:reverb-1', 'Reverb'),
      makePlugin('urn:lv2:eq-1', 'EQ'),
    ]
    const { result } = renderHook(() =>
      useSnapshotEditorPluginBrowserData({
        nativeProcessors: [],
        lv2Plugins: lv2,
        filteredPlugins: [],
        favoritePlugins: new Set(),
      }),
    )
    const groupNames = result.current.groupedPlugins.map(([name]) => name)
    expect(groupNames).toEqual(['EQ', 'Reverb'])
  })

  it('counts only filtered + favorited plugins for favoriteVisibleCount', () => {
    const filtered = [
      makePlugin('urn:lv2:eq-1'),
      makePlugin('urn:lv2:eq-2'),
      makePlugin('urn:lv2:rev-1'),
    ]
    const favorites = new Set(['urn:lv2:eq-1', 'urn:lv2:rev-1', 'urn:lv2:not-shown'])
    const { result } = renderHook(() =>
      useSnapshotEditorPluginBrowserData({
        nativeProcessors: [],
        lv2Plugins: [],
        filteredPlugins: filtered,
        favoritePlugins: favorites,
      }),
    )
    // 'urn:lv2:not-shown' is in favorites but NOT in filteredPlugins
    // so it doesn't count.
    expect(result.current.favoriteVisibleCount).toBe(2)
  })
})
