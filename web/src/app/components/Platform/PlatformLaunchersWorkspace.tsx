import { type ChangeEvent, useMemo, useState } from 'react'
import {
  Button,
  Column,
  ComposedModal,
  Grid,
  Layer,
  Link,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Search,
  Tag,
  Tile,
} from '@carbon/react'

import './PlatformLaunchersWorkspace.css'

import { MAX_PINNED_NAV_ITEMS, normalizePinnedRoutes } from '../../data/advancedMenuItems'
import {
  ensureRequiredHomeLauncher,
  getLauncherCatalogItem,
  getLauncherCatalogMaturityLabel,
  launcherCatalogItems,
  normalizeLandingTiles,
  prioritizeRequiredHomeLauncher,
  REQUIRED_HOME_LAUNCHER_ROUTE,
  type LandingTilePlacement,
  type LandingTileSize,
  type LauncherCatalogItem,
} from '../../data/launcherCatalog'
import type { SpecialSettings } from '../../hooks/useSpecialSettings'
import { WorkspaceCatalogArtwork } from './WorkspaceCatalogArtwork'

const DIRECTORY_LABELS: Record<LauncherCatalogItem['directory'], string> = {
  core: 'Core',
  labs: 'Advanced',
  platforms: 'Platforms',
  'nav-only': 'Nav only',
}

const SIZE_OPTIONS: LandingTileSize[] = ['small', 'medium', 'large']
const CATEGORY_FILTER_OPTIONS = ['all', 'Audio Interface', 'Human Interface', 'Platform'] as const

type LauncherCategoryFilter = typeof CATEGORY_FILTER_OPTIONS[number]

const FULL_CATALOG_SECTION_ID = 'workspace-catalog-full-catalog'
const FULL_CATALOG_COPY = {
  title: 'Full Catalog',
  description: 'Every launcher that matches the current catalog filters, with launch and shell-management controls intact.',
}

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

function storefrontDocumentHref(name: string): string {
  return `/api/system/docs/${encodeURIComponent(name)}`
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

function launcherSearchIndex(item: LauncherCatalogItem): string {
  return [
    item.heroTitle,
    item.label,
    item.shortLabel,
    item.description,
    item.category,
    item.route,
    DIRECTORY_LABELS[item.directory],
    getLauncherCatalogMaturityLabel(item.maturity),
    item.availabilityNote,
    ...item.featureBullets,
    ...item.storefrontCollections,
    ...item.technicalSpecs.flatMap((spec) => [spec.label, spec.value]),
    ...item.documentLinks.flatMap((doc) => [doc.label, doc.name]),
  ].filter(Boolean).join(' ').toLowerCase()
}

function sortCatalogItems(left: LauncherCatalogItem, right: LauncherCatalogItem): number {
  const leftWeight
    = (left.storefrontCollections.includes('featured') ? 0 : 10)
    + (left.storefrontCollections.includes('platform-essentials') ? 0 : 5)
    + (left.storefrontCollections.includes('recently-added') ? 0 : 2)
  const rightWeight
    = (right.storefrontCollections.includes('featured') ? 0 : 10)
    + (right.storefrontCollections.includes('platform-essentials') ? 0 : 5)
    + (right.storefrontCollections.includes('recently-added') ? 0 : 2)

  if (leftWeight !== rightWeight) {
    return leftWeight - rightWeight
  }

  const categoryCompare = left.category.localeCompare(right.category)
  if (categoryCompare !== 0) {
    return categoryCompare
  }

  return left.heroTitle.localeCompare(right.heroTitle)
}

function PlacementPreview({
  title,
  subtitle,
  active,
  slots,
}: {
  title: string
  subtitle: string
  active: boolean
  slots: number
}) {
  return (
    <div className={`platform-launchers__placement-preview${active ? ' is-active' : ''}`} aria-label={`${title} preview`}>
      <div className="platform-launchers__placement-preview-head">
        <span>{title}</span>
        <span>{subtitle}</span>
      </div>
      <div className={`platform-launchers__placement-preview-grid platform-launchers__placement-preview-grid--${slots}`}>
        {Array.from({ length: slots }, (_, index) => (
          <span
            key={`${title}-slot-${index + 1}`}
            className={`platform-launchers__placement-preview-slot${active && index === 0 ? ' is-filled' : ''}`}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  )
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

    return [...launcherCatalogItems]
      .sort(sortCatalogItems)
      .filter((item) => (selectedCategory === 'all' ? true : item.category === selectedCategory))
      .filter((item) => (needle ? launcherSearchIndex(item).includes(needle) : true))
  }, [searchValue, selectedCategory])

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

  const renderStatusTags = (item: LauncherCatalogItem) => {
    const landingTile = landingTiles.find((tile) => tile.route === item.route) ?? null
    const navIndex = pinnedRoutes.findIndex((route) => route === item.route)

    return (
      <div className="platform-launchers__status-tags">
        <Tag type={categoryTagType(item.category)} size="sm">{item.category}</Tag>
        <Tag type={maturityTagType(item.maturity)} size="sm">{getLauncherCatalogMaturityLabel(item.maturity)}</Tag>
        <Tag type="blue" size="sm">{DIRECTORY_LABELS[item.directory]}</Tag>
        {landingTile ? <Tag type="green" size="sm">{`Desktop ${landingTile.size}`}</Tag> : <Tag type="cool-gray" size="sm">Desktop off</Tag>}
        {navIndex >= 0 ? <Tag type="cyan" size="sm">{`Start Menu ${navIndex + 1}`}</Tag> : <Tag type="cool-gray" size="sm">Start Menu off</Tag>}
      </div>
    )
  }

  const renderCard = (item: LauncherCatalogItem) => (
    <Tile key={item.route} className="platform-launchers__card" role="listitem">
      <div className="platform-launchers__art-shell">
        <WorkspaceCatalogArtwork item={item} />
      </div>

      <div className="platform-launchers__card-copy">
        <div className="platform-launchers__card-head">
          <div>
            <p className="platform-launchers__eyebrow">{item.category}</p>
            <h4>{item.heroTitle}</h4>
          </div>
          {renderStatusTags(item)}
        </div>

        <p className="platform-launchers__card-description">{item.description}</p>

        <ul className="platform-launchers__feature-list" aria-label={`${item.heroTitle} feature bullets`}>
          {item.featureBullets.map((feature) => (
            <li key={`${item.route}-${feature}`}>{feature}</li>
          ))}
        </ul>

        <dl className="platform-launchers__spec-grid">
          {item.technicalSpecs.map((spec) => (
            <div key={`${item.route}-${spec.label}`} className="platform-launchers__spec">
              <dt>{spec.label}</dt>
              <dd>{spec.value}</dd>
            </div>
          ))}
        </dl>

        <Layer className="platform-launchers__availability">
          <span className="platform-launchers__configure-label">Availability</span>
          <p>{item.availabilityNote}</p>
        </Layer>

        <div className="platform-launchers__docs">
          {item.documentLinks.map((doc) => (
            <Link
              key={`${item.route}-${doc.name}`}
              className="platform-launchers__doc-link"
              href={storefrontDocumentHref(doc.name)}
              target="_blank"
              rel="noreferrer noopener"
            >
              {doc.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="platform-launchers__actions">
        <Button
          size="sm"
          kind="primary"
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
    </Tile>
  )

  const configureModal = configureItem ? (
    <ComposedModal
      open
      size="lg"
      className="platform-launchers__configure-modal"
      onClose={() => setConfigureRoute(null)}
    >
      <ModalHeader
        title={configureItem.heroTitle}
        label="Workspace configuration"
        closeModal={() => setConfigureRoute(null)}
      />
      <ModalBody hasScrollingContent>
        <Grid condensed fullWidth className="platform-launchers__configure-grid">
          <Column sm={4} md={8} lg={16} className="platform-launchers__configure-column">
            <section className="platform-launchers__configure-card platform-launchers__configure-card--spotlight">
              <div className="platform-launchers__art-shell platform-launchers__art-shell--modal">
                <WorkspaceCatalogArtwork item={configureItem} />
              </div>
              <div className="platform-launchers__configure-head">
                <div>
                  <p className="platform-launchers__eyebrow">Workspace</p>
                  <h4>{configureItem.heroTitle}</h4>
                </div>
                {renderStatusTags(configureItem)}
              </div>
              <p>{configureItem.description}</p>
              <div className="platform-launchers__configure-section">
                <span className="platform-launchers__configure-label">Availability</span>
                <p>{configureItem.availabilityNote}</p>
              </div>
              <div className="platform-launchers__configure-section">
                <span className="platform-launchers__configure-label">Feature bullets</span>
                <ul className="platform-launchers__feature-list">
                  {configureItem.featureBullets.map((feature) => (
                    <li key={`${configureItem.route}-modal-${feature}`}>{feature}</li>
                  ))}
                </ul>
              </div>
              <div className="platform-launchers__configure-section">
                <span className="platform-launchers__configure-label">Documentation</span>
                <div className="platform-launchers__docs">
                  {configureItem.documentLinks.map((doc) => (
                    <Link
                      key={`${configureItem.route}-modal-doc-${doc.name}`}
                      className="platform-launchers__doc-link"
                      href={storefrontDocumentHref(doc.name)}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {doc.label}
                    </Link>
                  ))}
                </div>
              </div>
              <code>{configureItem.route}</code>
            </section>
          </Column>

          <Column sm={4} md={4} lg={8} className="platform-launchers__configure-column">
            <section className="platform-launchers__configure-card">
              <div className="platform-launchers__configure-head">
                <div>
                  <p className="platform-launchers__eyebrow">Catalog</p>
                  <h4>Technical specs</h4>
                </div>
              </div>
              <dl className="platform-launchers__spec-grid">
                {configureItem.technicalSpecs.map((spec) => (
                  <div key={`${configureItem.route}-modal-spec-${spec.label}`} className="platform-launchers__spec">
                    <dt>{spec.label}</dt>
                    <dd>{spec.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </Column>

          <Column sm={4} md={4} lg={8} className="platform-launchers__configure-column">
            <section className="platform-launchers__configure-card">
              <div className="platform-launchers__configure-head">
                <div>
                  <p className="platform-launchers__eyebrow">Desktop</p>
                  <h4>Desktop pin</h4>
                </div>
                <Tag type={configureLandingTile ? 'green' : 'cool-gray'} size="sm">
                  {configureLandingTile ? configureLandingTile.size : 'Not on Desktop'}
                </Tag>
              </div>
              <PlacementPreview
                title="Desktop"
                subtitle="Icon grid preview"
                active={Boolean(configureLandingTile)}
                slots={6}
              />

              {configureItem.landingEligible ? (
                <>
                  <p>Pin this workspace onto the desktop surface and control its tile scale and order.</p>
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
                        ? (isRequiredHomeLauncher ? 'Required on desktop' : 'Remove from desktop')
                        : 'Add to desktop'}
                    </Button>
                  </div>
                  {isRequiredHomeLauncher && configureLandingTile ? (
                    <p className="platform-launchers__configure-note">
                      Platforms is always visible on the desktop and remains the first launcher card.
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
                        <span className="platform-launchers__configure-label">Desktop order</span>
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
                <p>This workspace is Start Menu only and cannot appear on the desktop icon surface.</p>
              )}
            </section>
          </Column>

          <Column sm={4} md={4} lg={8} className="platform-launchers__configure-column">
            <section className="platform-launchers__configure-card">
              <div className="platform-launchers__configure-head">
                <div>
                  <p className="platform-launchers__eyebrow">Start Menu</p>
                  <h4>Start Menu pin</h4>
                </div>
                <Tag type={configureNavIndex >= 0 ? 'cyan' : 'cool-gray'} size="sm">
                  {configureNavIndex >= 0 ? `Pinned ${configureNavIndex + 1}` : 'Not in Start Menu'}
                </Tag>
              </div>
              <PlacementPreview
                title="Start Menu"
                subtitle="Live tiles preview"
                active={configureNavIndex >= 0}
                slots={9}
              />

              {configureItem.navEligible ? (
                <>
                  <p>Pin this workspace into the ordered Start Menu tile list shared by the desktop shell.</p>
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
                      {configureNavIndex >= 0 ? 'Remove from Start Menu' : navFull ? 'Start Menu full' : 'Pin to Start Menu'}
                    </Button>
                  </div>

                  {configureNavIndex >= 0 ? (
                    <div className="platform-launchers__configure-section">
                      <span className="platform-launchers__configure-label">Start Menu order</span>
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
                      The Start Menu is already at its {MAX_PINNED_NAV_ITEMS}-item cap. Remove or reorder an existing pin first.
                    </p>
                  ) : null}
                </>
              ) : (
                <p>This workspace cannot be pinned into the Start Menu.</p>
              )}
            </section>
          </Column>
        </Grid>
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={() => setConfigureRoute(null)}>
          Close
        </Button>
      </ModalFooter>
    </ComposedModal>
  ) : null

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchValue(event.currentTarget.value)
  }

  return (
    <section className="platform-launchers">
      <Tile className="platform-launchers__hero">
        <Grid condensed fullWidth className="platform-launchers__hero-grid">
          <Column sm={4} md={8} lg={16} className="platform-launchers__hero-column">
            <div className="platform-launchers__hero-copy">
              <p className="platform-launchers__eyebrow">MAP2 Workspace Catalog</p>
              <h2>Carbon storefront for MAP2 workspaces</h2>
              <p className="platform-launchers__hero-summary">
                Browse the routed MAP2 product surface in one full catalog, then launch or configure the same workspaces
                without leaving the page.
              </p>
              <div className="platform-launchers__summary-tags">
                <Tag type="green">Launch ready</Tag>
                <Tag type="cyan">Configure preserved</Tag>
                <Tag type="cool-gray">{`${launcherCatalogItems.length} catalog entries`}</Tag>
                <Tag type="cool-gray">Full catalog only</Tag>
              </div>
            </div>
          </Column>

          <Column sm={4} md={8} lg={16} className="platform-launchers__hero-column">
            <div className="platform-launchers__toolbar">
              <div className="platform-launchers__toolbar-main">
                <Search
                  labelText="Search workspaces"
                  size="lg"
                  placeholder="Search workspaces, specs, docs, or availability"
                  value={searchValue}
                  onChange={handleSearchChange}
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
                <Tag type="cool-gray">{`${catalogItems.length} visible`}</Tag>
                <Tag type="cool-gray">{`${landingTiles.length} on Desktop`}</Tag>
                <Tag type="cool-gray">{`${pinnedRoutes.length} in Start Menu`}</Tag>
                <Tag type={selectedCategory === 'all' ? 'cool-gray' : categoryTagType(selectedCategory)}>
                  {selectedCategory === 'all' ? 'All categories' : selectedCategory}
                </Tag>
              </div>
            </div>
          </Column>
        </Grid>
      </Tile>

      <section id={FULL_CATALOG_SECTION_ID} className="platform-launchers__section">
        <Grid condensed fullWidth className="platform-launchers__section-grid" role="list" aria-label="Full workspace catalog">
          <Column sm={4} md={8} lg={16} className="platform-launchers__section-column">
            <div className="platform-launchers__section-head">
              <div>
                <p className="platform-launchers__eyebrow">Browse everything</p>
                <h3>{FULL_CATALOG_COPY.title}</h3>
                <p>{FULL_CATALOG_COPY.description}</p>
              </div>
              <div className="platform-launchers__toolbar-tags">
                <Tag type="cool-gray">{`${catalogItems.length} matching`}</Tag>
              </div>
            </div>
          </Column>

          {catalogItems.length === 0 ? (
            <Column sm={4} md={8} lg={16} className="platform-launchers__section-column">
              <Tile className="platform-launchers__empty">
                <strong>No workspaces match that filter.</strong>
                <p>Clear the search or choose another category to restore the storefront catalog.</p>
              </Tile>
            </Column>
          ) : (
            catalogItems.map((item) => (
              <Column
                key={`catalog-${item.route}`}
                sm={4}
                md={4}
                lg={8}
                className="platform-launchers__card-column"
              >
                {renderCard(item)}
              </Column>
            ))
          )}
        </Grid>
      </section>

      {configureModal}
    </section>
  )
}
