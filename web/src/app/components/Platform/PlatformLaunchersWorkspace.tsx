import { useMemo, useState } from 'react'
import { TextInput, Tile, Tag } from '@carbon/react'

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

interface PlatformLaunchersWorkspaceProps {
  settings: SpecialSettings | null
  isLoading: boolean
  updateSettings: (newSettings: Partial<SpecialSettings>) => Promise<void>
}

export function PlatformLaunchersWorkspace({
  settings,
  isLoading,
  updateSettings,
}: PlatformLaunchersWorkspaceProps) {
  const [searchValue, setSearchValue] = useState('')
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const controlsDisabled = isLoading || !settings || Boolean(pendingAction)

  const landingTiles = settings?.landingTiles ?? []
  const pinnedRoutes = settings?.pinnedRoutes ?? []
  const landingTileRouteSet = useMemo(() => new Set(landingTiles.map((tile) => tile.route)), [landingTiles])
  const pinnedRouteSet = useMemo(() => new Set(pinnedRoutes), [pinnedRoutes])

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
    ].filter(Boolean).join(' ').toLowerCase().includes(needle))
  }, [searchValue])

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

  return (
    <section className="platform-shell__workspace platform-shell__workspace--launchers">
      <div className="platform-shell__ws-header">
        <div className="platform-shell__ws-header-copy">
          <span className="platform-shell__ws-header-eyebrow">Organizer</span>
          <h2 className="platform-shell__ws-header-title">Launchers</h2>
          <p className="platform-shell__ws-header-summary">
            Manage landing-page tiles and global navigation pins from one place. Labs and Platforms stay read-only elsewhere.
          </p>
        </div>
      </div>

      <div className="platform-launchers">
        <Tile className="platform-launchers__summary">
          <div>
            <p className="platform-launchers__eyebrow">Placement Summary</p>
            <h3>One organizer, shared shell state.</h3>
            <p>
              Landing tiles are Windows-style size slots on the home page. Nav pins stay capped at {MAX_PINNED_NAV_ITEMS}.
            </p>
          </div>
          <div className="platform-launchers__summary-tags">
            <Tag type="cool-gray">{landingTiles.length} landing tiles</Tag>
            <Tag type="cool-gray">{pinnedRoutes.length}/{MAX_PINNED_NAV_ITEMS} nav pins</Tag>
            {controlsDisabled ? <Tag type="blue">{isLoading ? 'Loading state' : 'Saving state'}</Tag> : null}
          </div>
        </Tile>

        <div className="platform-launchers__columns">
          <Tile className="platform-launchers__section">
            <div className="platform-launchers__section-head">
              <div>
                <p className="platform-launchers__eyebrow">Home</p>
                <h3>Landing-page tiles</h3>
              </div>
              <Tag type="cool-gray">{landingTiles.length}</Tag>
            </div>

            {landingTiles.length === 0 ? (
              <div className="platform-launchers__empty">
                <strong>No landing tiles configured.</strong>
                <p>Add launchers from the catalog below.</p>
              </div>
            ) : (
              <div className="platform-launchers__list" role="list" aria-label="Landing-page tiles">
                {landingTiles.map((tile, index) => {
                  const launcher = getLauncherCatalogItem(tile.route)
                  if (!launcher) {
                    return null
                  }

                  return (
                    <article key={`landing-${tile.route}`} className="platform-launchers__item" role="listitem">
                      <div className="platform-launchers__item-copy">
                        <div className="platform-launchers__item-title-row">
                          <h4>{launcher.label}</h4>
                          <div className="platform-launchers__item-tags">
                            <Tag type="blue">{DIRECTORY_LABELS[launcher.directory]}</Tag>
                            <Tag type={maturityTagType(launcher.maturity)}>{launcher.maturity}</Tag>
                          </div>
                        </div>
                        <p>{launcher.description}</p>
                        <code>{tile.route}</code>
                      </div>

                      <div className="platform-launchers__item-controls">
                        <div className="platform-launchers__size-row" role="group" aria-label={`Tile size for ${launcher.label}`}>
                          {SIZE_OPTIONS.map((size) => (
                            <button
                              key={`${tile.route}-${size}`}
                              type="button"
                              className={`platform-launchers__size-btn${tile.size === size ? ' is-selected' : ''}`}
                              disabled={controlsDisabled || tile.size === size}
                              onClick={() => {
                                void runAction(`landing-size-${tile.route}-${size}`, async () => {
                                  const nextTiles = landingTiles.map((current) => (
                                    current.route === tile.route ? { ...current, size } : current
                                  ))
                                  await saveLandingTiles(nextTiles)
                                })
                              }}
                            >
                              {size}
                            </button>
                          ))}
                        </div>

                        <div className="platform-launchers__action-row">
                          <button
                            type="button"
                            disabled={controlsDisabled || index === 0}
                            onClick={() => {
                              void runAction(`landing-up-${tile.route}`, async () => {
                                await saveLandingTiles(moveItem(landingTiles, index, index - 1))
                              })
                            }}
                          >
                            Up
                          </button>
                          <button
                            type="button"
                            disabled={controlsDisabled || index === landingTiles.length - 1}
                            onClick={() => {
                              void runAction(`landing-down-${tile.route}`, async () => {
                                await saveLandingTiles(moveItem(landingTiles, index, index + 1))
                              })
                            }}
                          >
                            Down
                          </button>
                          <button
                            type="button"
                            disabled={controlsDisabled}
                            onClick={() => {
                              void runAction(`landing-remove-${tile.route}`, async () => {
                                await saveLandingTiles(landingTiles.filter((current) => current.route !== tile.route))
                              })
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </Tile>

          <Tile className="platform-launchers__section">
            <div className="platform-launchers__section-head">
              <div>
                <p className="platform-launchers__eyebrow">Shell</p>
                <h3>Global navigation pins</h3>
              </div>
              <Tag type="cool-gray">{pinnedRoutes.length}/{MAX_PINNED_NAV_ITEMS}</Tag>
            </div>

            {pinnedRoutes.length === 0 ? (
              <div className="platform-launchers__empty">
                <strong>No global nav pins configured.</strong>
                <p>Add route-backed launchers or nav-only submenu entries from the catalog below.</p>
              </div>
            ) : (
              <div className="platform-launchers__list" role="list" aria-label="Global navigation pins">
                {pinnedRoutes.map((route, index) => {
                  const launcher = getLauncherCatalogItem(route)
                  if (!launcher) {
                    return null
                  }

                  return (
                    <article key={`nav-${route}`} className="platform-launchers__item" role="listitem">
                      <div className="platform-launchers__item-copy">
                        <div className="platform-launchers__item-title-row">
                          <h4>{launcher.label}</h4>
                          <div className="platform-launchers__item-tags">
                            <Tag type="cool-gray">{DIRECTORY_LABELS[launcher.directory]}</Tag>
                            {!launcher.landingEligible ? <Tag type="purple">Nav only</Tag> : null}
                          </div>
                        </div>
                        <p>{launcher.description}</p>
                        <code>{route}</code>
                      </div>

                      <div className="platform-launchers__action-row">
                        <button
                          type="button"
                          disabled={controlsDisabled || index === 0}
                          onClick={() => {
                            void runAction(`nav-up-${route}`, async () => {
                              await savePinnedRoutes(moveItem(pinnedRoutes, index, index - 1))
                            })
                          }}
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          disabled={controlsDisabled || index === pinnedRoutes.length - 1}
                          onClick={() => {
                            void runAction(`nav-down-${route}`, async () => {
                              await savePinnedRoutes(moveItem(pinnedRoutes, index, index + 1))
                            })
                          }}
                        >
                          Down
                        </button>
                        <button
                          type="button"
                          disabled={controlsDisabled}
                          onClick={() => {
                            void runAction(`nav-remove-${route}`, async () => {
                              await savePinnedRoutes(pinnedRoutes.filter((current) => current !== route))
                            })
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </Tile>
        </div>

        <Tile className="platform-launchers__section platform-launchers__catalog">
          <div className="platform-launchers__section-head">
            <div>
              <p className="platform-launchers__eyebrow">Catalog</p>
              <h3>Available launchers</h3>
            </div>
            <Tag type="cool-gray">{catalogItems.length}</Tag>
          </div>

          <TextInput
            id="platform-launchers-search"
            labelText="Search launchers"
            placeholder="Search labels, routes, or directories"
            value={searchValue}
            onChange={(event) => setSearchValue(event.currentTarget.value)}
          />

          <div className="platform-launchers__list" role="list" aria-label="Launcher catalog">
            {catalogItems.map((item) => {
              const onLanding = landingTileRouteSet.has(item.route)
              const onNav = pinnedRouteSet.has(item.route)
              const navFull = pinnedRoutes.length >= MAX_PINNED_NAV_ITEMS

              return (
                <article key={item.route} className="platform-launchers__item" role="listitem">
                  <div className="platform-launchers__item-copy">
                    <div className="platform-launchers__item-title-row">
                      <h4>{item.label}</h4>
                      <div className="platform-launchers__item-tags">
                        <Tag type="blue">{DIRECTORY_LABELS[item.directory]}</Tag>
                        <Tag type={maturityTagType(item.maturity)}>{item.maturity}</Tag>
                        {onLanding ? <Tag type="green">Landing</Tag> : null}
                        {onNav ? <Tag type="green">Pinned nav</Tag> : null}
                      </div>
                    </div>
                    <p>{item.description}</p>
                    <code>{item.route}</code>
                  </div>

                  <div className="platform-launchers__action-row">
                    <button
                      type="button"
                      disabled={controlsDisabled || !item.landingEligible || onLanding}
                      onClick={() => {
                        void runAction(`catalog-landing-${item.route}`, async () => {
                          await saveLandingTiles([...landingTiles, { route: item.route, size: 'medium' }])
                        })
                      }}
                    >
                      {item.landingEligible ? (onLanding ? 'On landing' : 'Add to landing') : 'Landing unavailable'}
                    </button>
                    <button
                      type="button"
                      disabled={controlsDisabled || !item.navEligible || onNav || (navFull && !onNav)}
                      onClick={() => {
                        void runAction(`catalog-nav-${item.route}`, async () => {
                          await savePinnedRoutes([...pinnedRoutes, item.route])
                        })
                      }}
                    >
                      {item.navEligible ? (onNav ? 'Pinned nav' : navFull ? 'Nav full' : 'Pin to nav') : 'Nav unavailable'}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </Tile>
      </div>
    </section>
  )
}

export default PlatformLaunchersWorkspace
