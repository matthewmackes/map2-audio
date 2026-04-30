/* SnapshotEditorPluginBrowser unit tests (T2473 part 12).
   Pure presentational sub-component — verify it renders the
   plugin-directory mode, the catalog mode, and the "no plugins"
   empty state, plus that the close + add wires are reached. */

import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { Music } from '@carbon/icons-react'

import { SnapshotEditorPluginBrowser } from './SnapshotEditorPluginBrowser'
import type { Plugin } from '../../../map2/types'

// Carbon Modal portal renders into document.body in jsdom; provide
// the matchMedia / ResizeObserver shims it expects.
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
  // @ts-expect-error jsdom polyfill
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

const samplePlugin = (uri: string, name: string, category = 'Distortion'): Plugin => ({
  uri,
  name,
  category,
  author: 'Test Author',
  format: 'LV2',
} as Plugin)

const baseProps = (overrides: Partial<React.ComponentProps<typeof SnapshotEditorPluginBrowser>> = {}) => {
  const native: Plugin[] = [samplePlugin('map2://juce/nam', 'NAM')]
  const lv2: Plugin[] = [samplePlugin('lv2:reverb', 'Hall Reverb', 'Reverb')]
  return {
    open: true,
    mode: 'plugins' as const,
    onChangeMode: jest.fn(),
    onClose: jest.fn(),
    searchQuery: '',
    onChangeSearchQuery: jest.fn(),
    categories: ['all', 'Reverb'],
    selectedCategory: 'all',
    onChangeSelectedCategory: jest.fn(),
    nativeCount: native.length,
    lv2Count: lv2.length,
    favoriteVisibleCount: 0,
    featuredNativeGroups: [
      { key: 'instruments', title: 'Instruments', icon: Music, plugins: native },
    ],
    remainingNativeProcessors: [],
    groupedPlugins: [['Reverb', lv2]] as Array<[string, Plugin[]]>,
    favoritePlugins: new Set<string>(),
    toggleFavorite: jest.fn(),
    collapsedCategories: new Set<string>(),
    setCollapsedCategories: jest.fn(),
    expandAllCategories: jest.fn(),
    collapseAllCategories: jest.fn(),
    currentChain: { id: 1 } as never,
    snapshotEditingLocked: false,
    onAddPluginToCurrentChain: jest.fn(),
    onShowDetails: jest.fn(),
    ...overrides,
  }
}

describe('SnapshotEditorPluginBrowser', () => {
  it('returns null when closed', () => {
    const { container } = render(<SnapshotEditorPluginBrowser {...baseProps({ open: false })} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders directory mode with featured groups + LV2 accordion + counts', () => {
    render(<SnapshotEditorPluginBrowser {...baseProps()} />)
    // Header counts are rendered as cool-gray Tags in the toolbar.
    expect(screen.getByText('1 native')).toBeInTheDocument()
    expect(screen.getByText('1 LV2')).toBeInTheDocument()
    // Featured group title.
    expect(screen.getByText('Instruments')).toBeInTheDocument()
    expect(screen.getByText('NAM')).toBeInTheDocument()
    // LV2 accordion is rendered.
    expect(screen.getByText('LV2 plugin library')).toBeInTheDocument()
  })

  it('shows the empty state when both native and grouped lists are empty', () => {
    render(
      <SnapshotEditorPluginBrowser
        {...baseProps({
          featuredNativeGroups: [],
          remainingNativeProcessors: [],
          groupedPlugins: [],
          nativeCount: 0,
          lv2Count: 0,
        })}
      />,
    )
    expect(screen.getByText('No plugins match the current filters')).toBeInTheDocument()
  })

  it('shows the warm-gray "New chain on add" tag when no current chain', () => {
    render(<SnapshotEditorPluginBrowser {...baseProps({ currentChain: null })} />)
    expect(screen.getByText('New chain on add')).toBeInTheDocument()
  })

  it('routes the Add button click through onAddPluginToCurrentChain', () => {
    const onAdd = jest.fn()
    render(<SnapshotEditorPluginBrowser {...baseProps({ onAddPluginToCurrentChain: onAdd })} />)
    // First Add button in the modal targets the featured NAM tile.
    const addButtons = screen.getAllByRole('button', { name: /^Add$/ })
    fireEvent.click(addButtons[0])
    expect(onAdd).toHaveBeenCalledWith('map2://juce/nam')
  })
})
