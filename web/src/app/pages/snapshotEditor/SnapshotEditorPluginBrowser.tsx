// SnapshotEditor plugin browser modal (T2473 part 12).
// Pure presentational sibling extracted from the page monolith.
// Renders the "Add plugin" modal with two modes: the LV2 + native
// plugin directory and the Tonechaser URI catalog (BlockPicker).
// All state is parent-owned — search query, category filter,
// collapsed-categories Set, favorites Set, browser mode, and the
// derived plugin groupings flow in as props.

import {
  Accordion,
  AccordionItem,
  Button,
  ContentSwitcher,
  Modal,
  Search,
  Select,
  SelectItem,
  Switch,
  Tag,
  Tile,
} from '@carbon/react'
import { Flow, Meter } from '@carbon/icons-react'
import { ComponentType, Dispatch, SetStateAction } from 'react'

import { EmptyState } from '../../components/shared/EmptyState'
import { BlockPicker } from '../../components/StateAuthority/BlockPicker'
import { getDisplayPluginName, sanitizeRestrictedDisplayText } from '../../../map2/displayNames'
import { getCategoryConfig } from '../../grid/shared'
import type { Chain, Plugin } from '../../../map2/types'

export interface SnapshotEditorPluginBrowserFeaturedGroup {
  key: string
  title: string
  icon: ComponentType<{ size?: number }>
  plugins: Plugin[]
}

export interface SnapshotEditorPluginBrowserProps {
  open: boolean
  mode: 'plugins' | 'catalog'
  onChangeMode: (mode: 'plugins' | 'catalog') => void
  onClose: () => void

  // Search + filter (parent-owned).
  searchQuery: string
  onChangeSearchQuery: (value: string) => void
  categories: string[]
  selectedCategory: string
  onChangeSelectedCategory: (value: string) => void

  // Counts for the header tags.
  nativeCount: number
  lv2Count: number
  favoriteVisibleCount: number

  // Derived plugin groupings.
  featuredNativeGroups: SnapshotEditorPluginBrowserFeaturedGroup[]
  remainingNativeProcessors: Plugin[]
  groupedPlugins: Array<[string, Plugin[]]>

  // Favorites + collapsed-category state (parent-owned Sets).
  favoritePlugins: Set<string>
  toggleFavorite: (uri: string) => void
  collapsedCategories: Set<string>
  setCollapsedCategories: Dispatch<SetStateAction<Set<string>>>

  // Toolbar actions.
  expandAllCategories: () => void
  collapseAllCategories: () => void

  // Plugin actions.
  currentChain: Chain | null | undefined
  snapshotEditingLocked: boolean
  onAddPluginToCurrentChain: (uri: string) => void | Promise<void>
  onShowDetails: (plugin: Plugin) => void
}

export function SnapshotEditorPluginBrowser({
  open,
  mode,
  onChangeMode,
  onClose,
  searchQuery,
  onChangeSearchQuery,
  categories,
  selectedCategory,
  onChangeSelectedCategory,
  nativeCount,
  lv2Count,
  favoriteVisibleCount,
  featuredNativeGroups,
  remainingNativeProcessors,
  groupedPlugins,
  favoritePlugins,
  toggleFavorite,
  collapsedCategories,
  setCollapsedCategories,
  expandAllCategories,
  collapseAllCategories,
  currentChain,
  snapshotEditingLocked,
  onAddPluginToCurrentChain,
  onShowDetails,
}: SnapshotEditorPluginBrowserProps) {
  if (!open) return null

  return (
    <Modal
      open
      size="lg"
      modalHeading="Add plugin"
      primaryButtonText="Close"
      onRequestClose={onClose}
      onRequestSubmit={onClose}
    >
      <div className="juce-grid-page__modal-stack juce-grid-page__browser-modal">
        <div
          className="juce-grid-page__browser-mode-switch"
          role="group"
          aria-label="Plugin browser mode"
        >
          <ContentSwitcher
            selectedIndex={mode === 'plugins' ? 0 : 1}
            onChange={(event: { index?: number }) => {
              const nextIndex = typeof event.index === 'number' ? event.index : 0
              onChangeMode(nextIndex === 0 ? 'plugins' : 'catalog')
            }}
            size="sm"
          >
            <Switch name="plugins" text="Plugin directory" />
            <Switch name="catalog" text="Tonechaser catalog" />
          </ContentSwitcher>
        </div>

        {mode === 'catalog' ? (
          <BlockPicker
            hideSystemManaged
            onPick={(entry) => {
              void onAddPluginToCurrentChain(entry.uri)
              onClose()
              onChangeMode('plugins')
            }}
          />
        ) : (
          <>
            <Search
              labelText="Search plugins"
              placeholder="Search plugins"
              value={searchQuery}
              onChange={(event) => onChangeSearchQuery(event.target.value)}
              size="lg"
            />

            <div className="juce-grid-page__browser-toolbar">
              <div className="juce-grid-page__browser-filters">
                <Select
                  id="juce-grid-plugin-browser-category"
                  className="juce-grid-page__browser-category-select"
                  labelText="Category"
                  size="md"
                  value={selectedCategory}
                  onChange={(event) => onChangeSelectedCategory(event.target.value)}
                >
                  {categories.map((category) => (
                    <SelectItem
                      key={category}
                      value={category}
                      text={category === 'all' ? 'All plugins' : category}
                    />
                  ))}
                </Select>
              </div>

              <div className="juce-grid-page__browser-meta">
                <div className="juce-grid-page__browser-meta-tags">
                  <Tag type="cool-gray">{nativeCount} native</Tag>
                  <Tag type="cool-gray">{lv2Count} LV2</Tag>
                  <Tag type="cool-gray">{favoriteVisibleCount} favorites</Tag>
                  {!currentChain && <Tag type="warm-gray">New chain on add</Tag>}
                </div>
                <div className="juce-grid-page__browser-toolbar-actions">
                  <Button size="sm" kind="ghost" onClick={expandAllCategories}>
                    Expand all
                  </Button>
                  <Button size="sm" kind="ghost" onClick={collapseAllCategories}>
                    Collapse all
                  </Button>
                </div>
              </div>
            </div>

            {!currentChain && (
              <p className="juce-grid-page__modal-copy">
                The first processor you add will create and assign a chain to the active signal
                path automatically.
              </p>
            )}

            <div className="juce-grid-page__browser-results">
              {featuredNativeGroups.length > 0 && (
                <section
                  className={`juce-grid-page__browser-featured-groups${featuredNativeGroups.length === 1 ? ' juce-grid-page__browser-featured-groups--single' : ''}`}
                  aria-label="Featured core integrated plugins"
                >
                  {featuredNativeGroups.map((group) => {
                    const GroupIcon = group.icon
                    return (
                      <div key={group.key} className="juce-grid-page__browser-featured-group">
                        <div className="juce-grid-page__browser-section-header">
                          <div className="juce-grid-page__browser-section-title">
                            <GroupIcon size={16} />
                            <span className="juce-grid-page__browser-section-title-text">
                              {group.title}
                            </span>
                          </div>
                          <Tag type="cool-gray">{group.plugins.length}</Tag>
                        </div>

                        <div className="juce-grid-page__browser-featured-plugin-list">
                          {group.plugins.map((plugin) => {
                            const displayName = getDisplayPluginName(plugin.name, plugin.uri)
                            return (
                              <Tile
                                key={plugin.uri}
                                className="juce-grid-page__browser-plugin-tile juce-grid-page__browser-plugin-tile--native juce-grid-page__browser-plugin-tile--featured"
                              >
                                <div className="juce-grid-page__browser-plugin-header">
                                  <div className="juce-grid-page__browser-plugin-copy">
                                    <p className="juce-grid-page__browser-plugin-kicker">
                                      Integrated processor
                                    </p>
                                    <h3 className="juce-grid-page__browser-plugin-heading">
                                      {displayName}
                                    </h3>
                                    <p>
                                      {sanitizeRestrictedDisplayText(plugin.author) ||
                                        'Integrated JUCE processor'}
                                    </p>
                                  </div>
                                  <div className="juce-grid-page__browser-plugin-meta">
                                    <Tag type="cool-gray">{plugin.category}</Tag>
                                  </div>
                                </div>
                                <div className="juce-grid-page__browser-card-actions">
                                  <Button
                                    size="sm"
                                    kind="primary"
                                    onClick={() => onAddPluginToCurrentChain(plugin.uri)}
                                    disabled={snapshotEditingLocked}
                                  >
                                    Add
                                  </Button>
                                  <Button
                                    size="sm"
                                    kind="ghost"
                                    onClick={() => onShowDetails(plugin)}
                                  >
                                    Details
                                  </Button>
                                </div>
                              </Tile>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </section>
              )}

              {remainingNativeProcessors.length > 0 && (
                <section className="juce-grid-page__browser-section">
                  <div className="juce-grid-page__browser-section-header">
                    <div className="juce-grid-page__browser-section-title">
                      <Meter size={16} />
                      <span className="juce-grid-page__browser-section-title-text">
                        Core integrated
                      </span>
                    </div>
                    <div className="juce-grid-page__browser-meta-tags">
                      <Tag type="green">Zero latency</Tag>
                      <Tag type="cool-gray">{remainingNativeProcessors.length} plugins</Tag>
                    </div>
                  </div>
                  <div className="juce-grid-page__browser-native-grid">
                    {remainingNativeProcessors.map((plugin) => {
                      const displayName = getDisplayPluginName(plugin.name, plugin.uri)
                      return (
                        <Tile
                          key={plugin.uri}
                          className="juce-grid-page__browser-plugin-tile juce-grid-page__browser-plugin-tile--native"
                        >
                          <div className="juce-grid-page__browser-plugin-header">
                            <div className="juce-grid-page__browser-plugin-copy">
                              <p className="juce-grid-page__browser-plugin-kicker">
                                Integrated processor
                              </p>
                              <h3 className="juce-grid-page__browser-plugin-heading">
                                {displayName}
                              </h3>
                              <p>
                                {sanitizeRestrictedDisplayText(plugin.author) ||
                                  'Integrated JUCE processor'}
                              </p>
                            </div>
                            <div className="juce-grid-page__browser-plugin-meta">
                              <Tag type="cool-gray">{plugin.category}</Tag>
                            </div>
                          </div>
                          <div className="juce-grid-page__browser-card-actions">
                            <Button
                              size="sm"
                              kind="primary"
                              onClick={() => onAddPluginToCurrentChain(plugin.uri)}
                              disabled={snapshotEditingLocked}
                            >
                              Add
                            </Button>
                            <Button
                              size="sm"
                              kind="ghost"
                              onClick={() => onShowDetails(plugin)}
                            >
                              Details
                            </Button>
                          </div>
                        </Tile>
                      )
                    })}
                  </div>
                </section>
              )}

              {groupedPlugins.length > 0 && (
                <section className="juce-grid-page__browser-section">
                  <div className="juce-grid-page__browser-section-header">
                    <div className="juce-grid-page__browser-section-title">
                      <Flow size={14} />
                      <span className="juce-grid-page__browser-section-title-text">
                        LV2 plugin library
                      </span>
                    </div>
                    <Tag type="cool-gray">{lv2Count} plugins</Tag>
                  </div>

                  <Accordion align="start" className="juce-grid-page__browser-accordion">
                    {groupedPlugins.map(([category, plugins]) => {
                      const catConfig = getCategoryConfig(category)
                      const isOpen = !collapsedCategories.has(category)
                      return (
                        <AccordionItem
                          key={category}
                          open={isOpen}
                          onHeadingClick={({ isOpen: currentlyOpen }) => {
                            setCollapsedCategories((previous) => {
                              const next = new Set(previous)
                              if (currentlyOpen) {
                                next.add(category)
                              } else {
                                next.delete(category)
                              }
                              return next
                            })
                          }}
                          title={(
                            <span className="juce-grid-page__browser-category-title">
                              <span
                                className="juce-grid-page__browser-category-dot"
                                style={{ background: catConfig.color }}
                                aria-hidden
                              />
                              <span>{category}</span>
                              <Tag type="cool-gray">{plugins.length}</Tag>
                            </span>
                          )}
                        >
                          <div className="juce-grid-page__browser-plugin-grid">
                            {plugins.map((plugin) => {
                              const isFavorite = favoritePlugins.has(plugin.uri)
                              return (
                                <Tile
                                  key={plugin.uri}
                                  className="juce-grid-page__browser-plugin-tile"
                                >
                                  <div className="juce-grid-page__browser-plugin-header">
                                    <div className="juce-grid-page__browser-plugin-copy">
                                      <p className="juce-grid-page__browser-plugin-kicker">
                                        LV2 processor
                                      </p>
                                      <h3 className="juce-grid-page__browser-plugin-heading">
                                        {getDisplayPluginName(plugin.name, plugin.uri)}
                                      </h3>
                                      <p>
                                        {plugin.author
                                          ? sanitizeRestrictedDisplayText(plugin.author)
                                          : 'No author metadata'}
                                      </p>
                                    </div>
                                    <div className="juce-grid-page__browser-plugin-meta">
                                      {isFavorite && <Tag type="cool-gray">Favorite</Tag>}
                                    </div>
                                  </div>
                                  <div className="juce-grid-page__browser-card-meta">
                                    <Tag type="cool-gray">{plugin.category}</Tag>
                                    <Tag type="warm-gray">{plugin.format || 'LV2'}</Tag>
                                  </div>
                                  <div className="juce-grid-page__browser-card-actions">
                                    <Button
                                      size="sm"
                                      kind="primary"
                                      onClick={() => onAddPluginToCurrentChain(plugin.uri)}
                                      disabled={snapshotEditingLocked}
                                    >
                                      Add
                                    </Button>
                                    <Button
                                      size="sm"
                                      kind={isFavorite ? 'secondary' : 'ghost'}
                                      onClick={() => toggleFavorite(plugin.uri)}
                                    >
                                      {isFavorite ? 'Favorited' : 'Favorite'}
                                    </Button>
                                    <Button
                                      size="sm"
                                      kind="ghost"
                                      onClick={() => onShowDetails(plugin)}
                                    >
                                      Details
                                    </Button>
                                  </div>
                                </Tile>
                              )
                            })}
                          </div>
                        </AccordionItem>
                      )
                    })}
                  </Accordion>
                </section>
              )}

              {nativeCount === 0 && groupedPlugins.length === 0 && (
                <EmptyState
                  className="juce-grid-page__empty-state"
                  title="No plugins match the current filters"
                  description="Adjust the search or category filters to widen the results."
                />
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
