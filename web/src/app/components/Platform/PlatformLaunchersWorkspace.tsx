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
  getLauncherCatalogItem,
  launcherCatalogItems,
  normalizeLandingTiles,
  type LandingTilePlacement,
  type LauncherCatalogItem,
  type LandingTileSize,
} from '../../data/launcherCatalog'
import type { SpecialSettings } from '../../hooks/useSpecialSettings'

const DIRECTORY_LABELS: Record<LauncherCatalogItem['directory'], string> = {
  core: 'Core',
  labs: 'Labs',
  platforms: 'Platforms',
  'nav-only': 'Nav only',
}

const SIZE_OPTIONS: LandingTileSize[] = ['small', 'medium', 'large']

const LAUNCHER_TABLE_HEADERS = [
  { key: 'name', header: 'Launcher' },
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
  const parts = [item.maturity, DIRECTORY_LABELS[item.directory]]

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
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [configureRoute, setConfigureRoute] = useState<string | null>(null)
  const controlsDisabled = isLoading || !settings || Boolean(pendingAction)

  const landingTiles = settings?.landingTiles ?? []
  const pinnedRoutes = settings?.pinnedRoutes ?? []

  const catalogItems = useMemo(() => {
    const needle = searchValue.trim().toLowerCase()
    const ordered = [...launcherCatalogItems].sort((left, right) => {
      const directoryCompare = DIRECTORY_LABELS[left.directory].localeCompare(DIRECTORY_LABELS[right.directory])
      if (directoryCompare !== 0) {
        return directoryCompare
      }

      return left.label.localeCompare(right.label)
    })

    if (!needle) {
      return ordered
    }

    return ordered.filter((item) => [
      item.label,
      item.shortLabel,
      item.description,
      item.route,
      DIRECTORY_LABELS[item.directory],
      item.maturity,
    ].filter(Boolean).join(' ').toLowerCase().includes(needle))
  }, [searchValue])

  const tableRows = useMemo(() => {
    return catalogItems.map((item) => {
      const landingTile = landingTiles.find((tile) => tile.route === item.route) ?? null
      const navIndex = pinnedRoutes.findIndex((route) => route === item.route)

      return {
        id: item.route,
        name: item.label,
        category: DIRECTORY_LABELS[item.directory],
        status: summarizeLauncherStatus(item, landingTile, navIndex),
      }
    })
  }, [catalogItems, landingTiles, pinnedRoutes])

  const configureItem = getLauncherCatalogItem(configureRoute)
  const configureLandingIndex = configureItem ? landingTiles.findIndex((tile) => tile.route === configureItem.route) : -1
  const configureLandingTile = configureLandingIndex >= 0 ? landingTiles[configureLandingIndex] : null
  const configureNavIndex = configureItem ? pinnedRoutes.findIndex((route) => route === configureItem.route) : -1
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
    await updateSettings({ landingTiles: normalizeLandingTiles(nextTiles) })
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
        title={configureItem.label}
        label="Launcher configuration"
        closeModal={() => setConfigureRoute(null)}
      />
      <ModalBody hasScrollingContent>
        <div className="platform-launchers__configure-grid">
          <section className="platform-launchers__configure-card">
            <div className="platform-launchers__configure-head">
              <div>
                <p className="platform-launchers__eyebrow">Workspace</p>
                <h4>{configureItem.label}</h4>
              </div>
              <div className="platform-launchers__status-tags">
                <Tag type="blue" size="sm">{DIRECTORY_LABELS[configureItem.directory]}</Tag>
                <Tag type={maturityTagType(configureItem.maturity)} size="sm">{configureItem.maturity}</Tag>
              </div>
            </div>
            <p>{configureItem.description}</p>
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
                    disabled={controlsDisabled}
                    onClick={() => {
                      void runAction(`landing-toggle-${configureItem.route}`, async () => {
                        if (configureLandingTile) {
                          await saveLandingTiles(landingTiles.filter((tile) => tile.route !== configureItem.route))
                          return
                        }

                        await saveLandingTiles([...landingTiles, { route: configureItem.route, size: 'medium' }])
                      })
                    }}
                  >
                    {configureLandingTile ? 'Remove from landing' : 'Add to landing'}
                  </Button>
                </div>

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
                          disabled={controlsDisabled || configureLandingIndex <= 0}
                          onClick={() => {
                            void runAction(`landing-up-${configureItem.route}`, async () => {
                              await saveLandingTiles(moveItem(landingTiles, configureLandingIndex, configureLandingIndex - 1))
                            })
                          }}
                        >
                          Move up
                        </Button>
                        <Button
                          size="sm"
                          kind="tertiary"
                          disabled={controlsDisabled || configureLandingIndex === landingTiles.length - 1}
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
          <p className="platform-launchers__eyebrow">Theme workspace</p>
          <h3>Launcher organizer</h3>
          <p>
            Use one Carbon-style table to browse every launcher, open routes, and configure Home or nav promotion.
            Launch opens a workspace in a new tab so this organizer can stay open for multi-launch use.
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
            description="List route-backed launchers, then launch or configure each workspace from one modal."
            className="platform-launchers__table-container"
          >
            <TableToolbar {...getToolbarProps()}>
              <TableToolbarContent className="platform-launchers__toolbar">
                <TableToolbarSearch
                  persistent
                  value={searchValue}
                  placeholder="Search launchers"
                  onChange={(_event, value) => setSearchValue(value ?? '')}
                />
                <div className="platform-launchers__toolbar-tags">
                  <Tag type="cool-gray">{catalogItems.length} visible</Tag>
                  <Tag type="cool-gray">Configure per launcher</Tag>
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
                        <p>Clear the search to restore the full launcher catalog.</p>
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
                        if (cell.info.header === 'name') {
                          return (
                            <TableCell key={cell.id}>
                              <div className="platform-launchers__cell-copy">
                                <div className="platform-launchers__cell-head">
                                  <strong>{item.label}</strong>
                                  <Tag type={maturityTagType(item.maturity)} size="sm">{item.maturity}</Tag>
                                </div>
                                <p>{item.description}</p>
                                <code>{item.route}</code>
                              </div>
                            </TableCell>
                          )
                        }

                        if (cell.info.header === 'category') {
                          return (
                            <TableCell key={cell.id}>
                              <div className="platform-launchers__status-tags">
                                <Tag type="blue" size="sm">{DIRECTORY_LABELS[item.directory]}</Tag>
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
