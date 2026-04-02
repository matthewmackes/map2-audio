import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Button,
  ComposedModal,
  DataTable,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Tag,
  Tile,
} from '@carbon/react'

import './PlatformLaunchersWorkspace.css'

import { MAX_PINNED_NAV_ITEMS, normalizePinnedRoutes } from '../../data/advancedMenuItems'
import {
  ensureRequiredHomeLauncher,
  getLauncherCatalogItem,
  launcherCatalogItems,
  normalizeLandingTiles,
  prioritizeRequiredHomeLauncher,
  REQUIRED_HOME_LAUNCHER_ROUTE,
  type LandingTilePlacement,
  type LauncherCatalogItem,
  type LandingTileSize,
} from '../../data/launcherCatalog'
import type { SpecialSettings } from '../../hooks/useSpecialSettings'

const DIRECTORY_LABELS: Record<LauncherCatalogItem['directory'], string> = {
  core: 'Core',
  labs: 'Advanced',
  platforms: 'Platforms',
  'nav-only': 'Nav only',
}

const SIZE_OPTIONS: LandingTileSize[] = ['small', 'medium', 'large']
const CATEGORY_FILTER_OPTIONS = ['all', 'Audio Interface', 'Human Interface', 'Platform'] as const

type LauncherCategoryFilter = typeof CATEGORY_FILTER_OPTIONS[number]

const LAUNCHER_TABLE_HEADERS = [
  { key: 'heroTitle', header: 'Hero title' },
  { key: 'description', header: 'Description' },
  { key: 'category', header: 'Category' },
  { key: 'status', header: 'Status' },
] as const

function maturityTagType(maturity: LauncherCatalogItem['maturity']): 'green' | 'cyan' | 'purple' | 'warm-gray' | 'red' {
  switch (maturity) {
    case 'production':
      return 'green'
    case 'qualified-with-waiver':
      return 'cyan'
    case 'beta':
      return 'warm-gray'
    case 'experimental':
      return 'purple'
    case 'hardware-blocked':
      return 'red'
    default:
      return 'warm-gray'
  }
}

function categoryTagType(category: LauncherCatalogItem['category']): 'blue' | 'purple' | 'green' {
  switch (category) {
    case 'Audio Interface':
      return 'blue'
    case 'Human Interface':
      return 'purple'
    case 'Platform':
    default:
      return 'green'
  }
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex || toIndex < 0 || toIndex >= items.length) {
    return items
  }

  const next = [...items]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  return next
}

function summarizeLauncherStatus(
  item: LauncherCatalogItem,
  landingTile: LandingTilePlacement | null,
  navIndex: number,
): string {
  const parts: string[] = [item.maturity, item.category]

  if (item.directory === 'nav-only') {
    parts.push(DIRECTORY_LABELS[item.directory])
  }

  if (landingTile) {
    parts.push(`Home ${landingTile.size}`)
  }

  if (navIndex >= 0) {
    parts.push(`Nav ${navIndex + 1}`)
  }

  return parts.join(' · ')
}

interface PlatformLaunchersWorkspaceProps {
  settings: SpecialSettings | null
  isLoading: boolean
  updateSettings: (newSettings: Partial<SpecialSettings>) => Promise<void>
  onLaunchRoute?: (route: string) => void
}

export function PlatformLaunchersWorkspace({
  settings,
  isLoading,
  updateSettings,
  onLaunchRoute,
}: PlatformLaunchersWorkspaceProps) {
  const [searchValue, setSearchValue] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<LauncherCategoryFilter>('all')
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [configureRoute, setConfigureRoute] = useState<string | null>(null)
  const controlsDisabled = isLoading || !settings || Boolean(pendingAction)

  const landingTiles = settings?.landingTiles ?? []
  const pinnedRoutes = settings?.pinnedRoutes ?? []

  const categoryCounts = useMemo(() => {
    return launcherCatalogItems.reduce<Record<LauncherCategoryFilter, number>>((counts, item) => {
      counts.all += 1
      counts[item.category] += 1
      return counts
    }, {
      all: 0,
      'Audio Interface': 0,
      'Human Interface': 0,
      Platform: 0,
    })
  }, [])

  const catalogItems = useMemo(() => {
    const needle = searchValue.trim().toLowerCase()
    const ordered = [...launcherCatalogItems].sort((left, right) => {
      const categoryCompare = left.category.localeCompare(right.category)
      if (categoryCompare !== 0) {
        return categoryCompare
      }

      return left.heroTitle.localeCompare(right.heroTitle)
    })

    if (!needle) {
      return ordered.filter((item) => selectedCategory === 'all' || item.category === selectedCategory)
    }

    return ordered.filter((item) => {
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false
      }

      return [
        item.heroTitle,
        item.label,
        item.shortLabel,
        item.description,
        item.category,
        item.route,
        DIRECTORY_LABELS[item.directory],
        item.maturity,
      ].filter(Boolean).join(' ').toLowerCase().includes(needle)
    })
  }, [searchValue, selectedCategory])

  const tableRows = useMemo(() => {
    return catalogItems.map((item) => {
      const landingTile = landingTiles.find((tile) => tile.route === item.route) ?? null
      const navIndex = pinnedRoutes.findIndex((route) => route === item.route)

      return {
        id: item.route,
        heroTitle: item.heroTitle,
        description: item.description,
        category: item.category,
        status: summarizeLauncherStatus(item, landingTile, navIndex),
      }
    })
  }, [catalogItems, landingTiles, pinnedRoutes])

  const configureItem = getLauncherCatalogItem(configureRoute)
  const configureLandingIndex = configureItem ? landingTiles.findIndex((tile) => tile.route === configureItem.route) : -1
  const configureLandingTile = configureLandingIndex >= 0 ? landingTiles[configureLandingIndex] : null
  const configureNavIndex = configureItem ? pinnedRoutes.findIndex((route) => route === configureItem.route) : -1
  const requiredHomeTileIndex = landingTiles.findIndex((tile) => tile.route === REQUIRED_HOME_LAUNCHER_ROUTE)
  const isRequiredHomeLauncher = configureItem?.route === REQUIRED_HOME_LAUNCHER_ROUTE
  const navFull = pinnedRoutes.length >= MAX_PINNED_NAV_ITEMS

  const runAction = async (key: string, fn: () => Promise<void>) => {
    setPendingAction(key)
    try {
      await fn()
    } finally {
      setPendingAction(null)
    }
  }

  const saveLandingTiles = async (nextTiles: LandingTilePlacement[]) => {
    const normalizedTiles = normalizeLandingTiles(nextTiles)
    const requiredTiles = ensureRequiredHomeLauncher(normalizedTiles)
    await updateSettings({ landingTiles: prioritizeRequiredHomeLauncher(requiredTiles) })
  }

  const savePinnedRoutes = async (nextRoutes: string[]) => {
    await updateSettings({ pinnedRoutes: normalizePinnedRoutes(nextRoutes).slice(0, MAX_PINNED_NAV_ITEMS) })
  }

  const launchRoute = (route: string) => {
    if (onLaunchRoute) {
      onLaunchRoute(route)
      return
    }

    if (typeof window !== 'undefined') {
      window.open(route, '_blank', 'noopener,noreferrer')
    }
  }

  const configureModal = configureItem ? (
    <ComposedModal
      open
      size="md"
      className="platform-launchers__configure-modal"
      onClose={() => setConfigureRoute(null)}
    >
      <ModalHeader
        title={configureItem.heroTitle}
        label="Launcher configuration"
        closeModal={() => setConfigureRoute(null)}
      />
      <ModalBody hasScrollingContent>
        <div className="platform-launchers__configure-grid">
          <section className="platform-launchers__configure-card">
            <div className="platform-launchers__configure-head">
              <div>
                <p className="platform-launchers__eyebrow">Workspace</p>
                <h4>{configureItem.heroTitle}</h4>
              </div>
              <div className="platform-launchers__status-tags">
                <Tag type={categoryTagType(configureItem.category)} size="sm">{configureItem.category}</Tag>
                <Tag type="blue" size="sm">{DIRECTORY_LABELS[configureItem.directory]}</Tag>
                <Tag type={maturityTagType(configureItem.maturity)} size="sm">{configureItem.maturity}</Tag>
              </div>
            </div>
            <div className="platform-launchers__configure-section">
              <span className="platform-launchers__configure-label">Description</span>
              <p>{configureItem.description}</p>
            </div>
            <code>{configureItem.route}</code>
          </section>

          <section className="platform-launchers__configure-card">
            <div className="platform-launchers__configure-head">
              <div>
                <p className="platform-launchers__eyebrow">Home</p>
                <h4>Landing tile</h4>
              </div>
              <Tag type={configureLandingTile ? 'green' : 'cool-gray'} size="sm">
                {configureLandingTile ? configureLandingTile.size : 'Not on Home'}
              </Tag>
            </div>

            {configureItem.landingEligible ? (
              <>
                <p>Promote this launcher onto the landing page and set its tile size or order.</p>
                <div className="platform-launchers__configure-actions">
                  <Button
                    size="sm"
                    kind={configureLandingTile ? 'secondary' : 'primary'}
                    disabled={controlsDisabled || (isRequiredHomeLauncher && Boolean(configureLandingTile))}
                    onClick={() => {
                      void runAction(`landing-toggle-${configureItem.route}`, async () => {
                        if (configureLandingTile) {
                          if (isRequiredHomeLauncher) {
                            return
                          }
                          await saveLandingTiles(landingTiles.filter((tile) => tile.route !== configureItem.route))
                          return
                        }

                        await saveLandingTiles([...landingTiles, { route: configureItem.route, size: 'medium' }])
                      })
                    }}
                  >
                    {configureLandingTile
                      ? (isRequiredHomeLauncher ? 'Required on landing' : 'Remove from landing')
                      : 'Add to landing'}
                  </Button>
                </div>
                {isRequiredHomeLauncher && configureLandingTile ? (
                  <p className="platform-launchers__configure-note">
                    Platforms is always visible on Home and remains the first launcher card.
                  </p>
                ) : null}

                {configureLandingTile ? (
                  <>
                    <div className="platform-launchers__configure-section">
                      <span className="platform-launchers__configure-label">Tile size</span>
                      <div className="platform-launchers__configure-actions">
                        {SIZE_OPTIONS.map((size) => (
                          <Button
                            key={`${configureItem.route}-${size}`}
                            size="sm"
                            kind={configureLandingTile.size === size ? 'primary' : 'tertiary'}
                            disabled={controlsDisabled || configureLandingTile.size === size}
                            onClick={() => {
                              void runAction(`landing-size-${configureItem.route}-${size}`, async () => {
                                const nextTiles = landingTiles.map((tile) => (
                                  tile.route === configureItem.route ? { ...tile, size } : tile
                                ))
                                await saveLandingTiles(nextTiles)
                              })
                            }}
                          >
                            {size}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="platform-launchers__configure-section">
                      <span className="platform-launchers__configure-label">Home order</span>
                      <div className="platform-launchers__configure-actions">
                        <Button
                          size="sm"
                          kind="tertiary"
                          disabled={
                            controlsDisabled
                            || isRequiredHomeLauncher
                            || configureLandingIndex <= (requiredHomeTileIndex >= 0 ? 1 : 0)
                          }
                          onClick={() => {
                            void runAction(`landing-up-${configureItem.route}`, async () => {
                              const boundaryIndex = requiredHomeTileIndex >= 0 ? 1 : 0
                              const targetIndex = Math.max(boundaryIndex, configureLandingIndex - 1)
                              await saveLandingTiles(moveItem(landingTiles, configureLandingIndex, targetIndex))
                            })
                          }}
                        >
                          Move up
                        </Button>
                        <Button
                          size="sm"
                          kind="tertiary"
                          disabled={controlsDisabled || isRequiredHomeLauncher || configureLandingIndex === landingTiles.length - 1}
                          onClick={() => {
                            void runAction(`landing-down-${configureItem.route}`, async () => {
                              await saveLandingTiles(moveItem(landingTiles, configureLandingIndex, configureLandingIndex + 1))
                            })
                          }}
                        >
                          Move down
                        </Button>
                      </div>
                    </div>
                  </>
                ) : null}
              </>
            ) : (
              <p>This launcher is nav-only and cannot appear on the landing page.</p>
            )}
          </section>

          <section className="platform-launchers__configure-card">
            <div className="platform-launchers__configure-head">
              <div>
                <p className="platform-launchers__eyebrow">Shell</p>
                <h4>Global nav pin</h4>
              </div>
              <Tag type={configureNavIndex >= 0 ? 'cyan' : 'cool-gray'} size="sm">
                {configureNavIndex >= 0 ? `Pinned ${configureNavIndex + 1}` : 'Not pinned'}
              </Tag>
            </div>

            {configureItem.navEligible ? (
              <>
                <p>Pin this launcher into the ordered global navigation list shared by the shell.</p>
                <div className="platform-launchers__configure-actions">
                  <Button
                    size="sm"
                    kind={configureNavIndex >= 0 ? 'secondary' : 'primary'}
                    disabled={controlsDisabled || (navFull && configureNavIndex < 0)}
                    onClick={() => {
                      void runAction(`nav-toggle-${configureItem.route}`, async () => {
                        if (configureNavIndex >= 0) {
                          await savePinnedRoutes(pinnedRoutes.filter((route) => route !== configureItem.route))
                          return
                        }

                        await savePinnedRoutes([...pinnedRoutes, configureItem.route])
                      })
                    }}
                  >
                    {configureNavIndex >= 0 ? 'Remove from nav' : navFull ? 'Nav full' : 'Pin to nav'}
                  </Button>
                </div>

                {configureNavIndex >= 0 ? (
                  <div className="platform-launchers__configure-section">
                    <span className="platform-launchers__configure-label">Nav order</span>
                    <div className="platform-launchers__configure-actions">
                      <Button
                        size="sm"
                        kind="tertiary"
                        disabled={controlsDisabled || configureNavIndex <= 0}
                        onClick={() => {
                          void runAction(`nav-up-${configureItem.route}`, async () => {
                            await savePinnedRoutes(moveItem(pinnedRoutes, configureNavIndex, configureNavIndex - 1))
                          })
                        }}
                      >
                        Move up
                      </Button>
                      <Button
                        size="sm"
                        kind="tertiary"
                        disabled={controlsDisabled || configureNavIndex === pinnedRoutes.length - 1}
                        onClick={() => {
                          void runAction(`nav-down-${configureItem.route}`, async () => {
                            await savePinnedRoutes(moveItem(pinnedRoutes, configureNavIndex, configureNavIndex + 1))
                          })
                        }}
                      >
                        Move down
                      </Button>
                    </div>
                  </div>
                ) : null}

                {navFull && configureNavIndex < 0 ? (
                  <p className="platform-launchers__configure-note">
                    The global nav is already at its {MAX_PINNED_NAV_ITEMS}-item cap. Remove or reorder an existing pin first.
                  </p>
                ) : null}
              </>
            ) : (
              <p>This launcher cannot be pinned into the global nav.</p>
            )}
          </section>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={() => setConfigureRoute(null)}>
          Close
        </Button>
      </ModalFooter>
    </ComposedModal>
  ) : null

  return (
    <section className="platform-launchers">
      <Tile className="platform-launchers__summary">
        <div>
          <p className="platform-launchers__eyebrow">Workspace Catalog</p>
          <h3>Launcher organizer</h3>
          <p>
            Use one Carbon-style table to browse every launcher by hero title, description, and operator category,
            then open routes or configure Home and nav promotion from the same workspace.
          </p>
        </div>
        <div className="platform-launchers__summary-tags">
          <Tag type="cool-gray">{landingTiles.length} landing tiles</Tag>
          <Tag type="cool-gray">{pinnedRoutes.length}/{MAX_PINNED_NAV_ITEMS} nav pins</Tag>
          {controlsDisabled ? <Tag type="blue">{isLoading ? 'Loading state' : 'Saving state'}</Tag> : null}
        </div>
      </Tile>

      <DataTable rows={tableRows} headers={[...LAUNCHER_TABLE_HEADERS]} useZebraStyles>
        {({ rows, headers, getHeaderProps, getRowProps, getTableProps, getTableContainerProps, getToolbarProps }) => (
          <TableContainer
            {...getTableContainerProps()}
            title="Launcher catalog"
            description="List route-backed launchers with hero title, description, category, and placement state from one native section."
            className="platform-launchers__table-container"
          >
            <TableToolbar {...getToolbarProps()}>
              <TableToolbarContent className="platform-launchers__toolbar">
                <div className="platform-launchers__toolbar-main">
                  <TableToolbarSearch
                    persistent
                    value={searchValue}
                    placeholder="Search launchers"
                    onChange={(_event, value) => setSearchValue(value ?? '')}
                  />
                  <div className="platform-launchers__filter-group" role="group" aria-label="Filter launchers by category">
                    {CATEGORY_FILTER_OPTIONS.map((category) => {
                      const selected = selectedCategory === category
                      const label = category === 'all' ? 'All' : category

                      return (
                        <Button
                          key={category}
                          size="sm"
                          kind={selected ? 'primary' : 'tertiary'}
                          onClick={() => setSelectedCategory(category)}
                        >
                          {`${label} (${categoryCounts[category]})`}
                        </Button>
                      )
                    })}
                  </div>
                </div>
                <div className="platform-launchers__toolbar-tags">
                  <Tag type="cool-gray">{catalogItems.length} visible</Tag>
                  <Tag type="cool-gray">{launcherCatalogItems.length} total</Tag>
                  <Tag type={selectedCategory === 'all' ? 'cool-gray' : categoryTagType(selectedCategory)}>
                    {selectedCategory === 'all' ? 'All categories' : selectedCategory}
                  </Tag>
                </div>
              </TableToolbarContent>
            </TableToolbar>

            <Table {...getTableProps()} aria-label="Launcher catalog">
              <TableHead>
                <TableRow>
                  {headers.map((header) => {
                    const { key: _key, ...headerProps } = getHeaderProps({ header })
                    return (
                      <TableHeader key={header.key} {...headerProps}>
                        {header.header}
                      </TableHeader>
                    )
                  })}
                  <TableHeader>Actions</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={headers.length + 1}>
                      <div className="platform-launchers__empty">
                        <strong>No launchers match that filter.</strong>
                        <p>Clear the search or choose another category to restore the launcher catalog.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : rows.map((row) => {
                  const item = getLauncherCatalogItem(row.id)
                  if (!item) {
                    return null
                  }

                  const landingTile = landingTiles.find((tile) => tile.route === item.route) ?? null
                  const navIndex = pinnedRoutes.findIndex((route) => route === item.route)
                  const { key: _rowKey, ...rowProps } = getRowProps({ row })

                  return (
                    <TableRow key={row.id} {...rowProps}>
                      {row.cells.map((cell) => {
                        if (cell.info.header === 'heroTitle') {
                          return (
                            <TableCell key={cell.id}>
                              <div className="platform-launchers__cell-copy">
                                <div className="platform-launchers__cell-head">
                                  <strong>{item.heroTitle}</strong>
                                  <Tag type={maturityTagType(item.maturity)} size="sm">{item.maturity}</Tag>
                                </div>
                                <code>{item.route}</code>
                              </div>
                            </TableCell>
                          )
                        }

                        if (cell.info.header === 'description') {
                          return (
                            <TableCell key={cell.id}>
                              <div className="platform-launchers__cell-copy">
                                <p>{item.description}</p>
                              </div>
                            </TableCell>
                          )
                        }

                        if (cell.info.header === 'category') {
                          return (
                            <TableCell key={cell.id}>
                              <div className="platform-launchers__status-tags">
                                <Tag type={categoryTagType(item.category)} size="sm">{item.category}</Tag>
                                {!item.landingEligible ? <Tag type="purple" size="sm">Nav only</Tag> : null}
                              </div>
                            </TableCell>
                          )
                        }

                        return (
                          <TableCell key={cell.id}>
                            <div className="platform-launchers__status-tags">
                              {landingTile ? <Tag type="green" size="sm">{`Home ${landingTile.size}`}</Tag> : <Tag type="cool-gray" size="sm">Home off</Tag>}
                              {navIndex >= 0 ? <Tag type="cyan" size="sm">{`Nav ${navIndex + 1}`}</Tag> : <Tag type="cool-gray" size="sm">Nav off</Tag>}
                            </div>
                          </TableCell>
                        )
                      })}
                      <TableCell>
                        <div className="platform-launchers__actions">
                          <Button
                            size="sm"
                            kind="ghost"
                            aria-label={`Launch ${item.label}`}
                            onClick={() => launchRoute(item.route)}
                          >
                            Launch
                          </Button>
                          <Button
                            size="sm"
                            kind="secondary"
                            aria-label={`Configure ${item.label}`}
                            onClick={() => setConfigureRoute(item.route)}
                          >
                            Configure
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>

      {configureModal && typeof document !== 'undefined'
        ? createPortal(configureModal, document.body)
        : configureModal}
    </section>
  )
}

export default PlatformLaunchersWorkspace
