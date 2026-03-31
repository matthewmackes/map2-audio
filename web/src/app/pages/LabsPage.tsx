import './LabsLandingPage.css'

import { ArrowRight } from '@carbon/icons-react'
import { Button, Tag, TextInput, Tile } from '@carbon/react'
import { useDeferredValue, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { PageHeader } from '../components/PageHeader'
import {
  advancedMenuItems,
  allRouteNavigationItems,
  type HardwareInterfaceMenuItem,
  type NavigationMaturityState,
  type ShellNavigationItem,
} from '../data/advancedMenuItems'
import { resolveHomeCardProfile } from '../data/homeCardProfiles'
import { useHardwareMenuLocations } from '../hooks/useDeviceLocation'
import { isBlockedAdvancedMenuItem } from '../layout/advancedMenuState'

type LabsMenuItem = ShellNavigationItem | HardwareInterfaceMenuItem

const LABS_SECTION_ORDER = ['Audio Grid', 'AVB', 'MIDI', 'System', 'Hardware', 'Blocked / Lab'] as const

function routeItemKey(item: LabsMenuItem): string {
  return `${item.to}::${item.label}`
}

function isRouteMatch(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`)
}

function isBlockedOrLabItem(item: LabsMenuItem): boolean {
  return isBlockedAdvancedMenuItem(item) || item.maturity === 'experimental'
}

function getLabsSectionTitle(item: LabsMenuItem): typeof LABS_SECTION_ORDER[number] {
  return isBlockedOrLabItem(item) ? 'Blocked / Lab' : item.homeSection
}

function maturityTagType(maturity: NavigationMaturityState): 'green' | 'cyan' | 'purple' | 'warm-gray' | 'red' {
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

function maturityTagLabel(maturity: NavigationMaturityState): string {
  return maturity.replace(/-/g, ' ')
}

function sortLabsItems(items: LabsMenuItem[]): LabsMenuItem[] {
  return [...items].sort((left, right) => {
    if (left.to === '/labs/push-surface') {
      return -1
    }
    if (right.to === '/labs/push-surface') {
      return 1
    }
    return left.label.localeCompare(right.label)
  })
}

export function LabsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchValue, setSearchValue] = useState('')
  const deferredSearch = useDeferredValue(searchValue.trim().toLowerCase())

  const labsLauncherKeySet = useMemo(
    () => new Set(advancedMenuItems.map((item) => routeItemKey(item))),
    [],
  )

  const labsItems = useMemo(
    () => sortLabsItems(allRouteNavigationItems.filter(
      (item) => labsLauncherKeySet.has(routeItemKey(item)) || isBlockedOrLabItem(item),
    )),
    [labsLauncherKeySet],
  )

  const { locationsByRoute } = useHardwareMenuLocations(labsItems)

  const filteredItems = useMemo(() => {
    if (!deferredSearch) {
      return labsItems
    }
    return labsItems.filter((item) => {
      const profile = resolveHomeCardProfile(item)
      const haystack = [
        item.label,
        item.description,
        profile.summary,
        profile.bestFor,
        ...profile.capabilities,
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(deferredSearch)
    })
  }, [deferredSearch, labsItems])

  const sections = useMemo(() => {
    const grouped = new Map<string, LabsMenuItem[]>()
    for (const item of filteredItems) {
      const sectionTitle = getLabsSectionTitle(item)
      const existing = grouped.get(sectionTitle) ?? []
      existing.push(item)
      grouped.set(sectionTitle, existing)
    }

    return LABS_SECTION_ORDER
      .map((sectionTitle) => [sectionTitle, grouped.get(sectionTitle) ?? []] as const)
      .filter(([, items]) => items.length > 0)
  }, [filteredItems])

  const blockedCount = labsItems.filter((item) => isBlockedOrLabItem(item)).length
  const pushSurfaceItem = labsItems.find((item) => item.to === '/labs/push-surface') ?? null
  const pushSurfaceProfile = pushSurfaceItem ? resolveHomeCardProfile(pushSurfaceItem) : null

  return (
    <div className="labs-landing">
      <PageHeader
        title="Labs"
        subtitle="Standalone Carbon landing page for MAP2’s advanced, experimental, and hardware-sensitive routes."
        actions={pushSurfaceItem ? (
          <Button size="sm" renderIcon={ArrowRight} onClick={() => navigate(pushSurfaceItem.to)}>
            Open Push Surface
          </Button>
        ) : null}
      />

      <div className="labs-landing__hero">
        <Tile className="labs-landing__hero-card labs-landing__hero-card--intro">
          <p className="labs-landing__eyebrow">Labs Directory</p>
          <h2>Independent from Platforms</h2>
          <p>
            Labs is now its own landing page. Use it to launch advanced workflows without replacing the
            main Labs index or folding these tools into the Platforms workspace.
          </p>
          {pushSurfaceProfile ? (
            <div className="labs-landing__hero-callout">
              <p className="labs-landing__hero-label">Featured route</p>
              <h3>{pushSurfaceItem?.label}</h3>
              <p>{pushSurfaceProfile.summary}</p>
            </div>
          ) : null}
        </Tile>

        <div className="labs-landing__hero-stats">
          <Tile className="labs-landing__hero-card">
            <p className="labs-landing__eyebrow">Catalog</p>
            <h3>{labsItems.length}</h3>
            <p>Labs entries available from this landing page.</p>
          </Tile>
          <Tile className="labs-landing__hero-card">
            <p className="labs-landing__eyebrow">Sections</p>
            <h3>{sections.length}</h3>
            <p>Grouped by workflow domain for faster scanning.</p>
          </Tile>
          <Tile className="labs-landing__hero-card">
            <p className="labs-landing__eyebrow">Blocked / Lab</p>
            <h3>{blockedCount}</h3>
            <p>Entries carrying experimental or hardware-blocked posture.</p>
          </Tile>
        </div>
      </div>

      <Tile className="labs-landing__search-card">
        <TextInput
          id="labs-directory-search"
          labelText="Search Labs entries"
          placeholder="Search routes, capabilities, or workflow notes"
          value={searchValue}
          onChange={(event) => setSearchValue(event.currentTarget.value)}
        />
      </Tile>

      <div className="labs-landing__sections">
        {sections.length === 0 ? (
          <Tile className="labs-landing__empty">
            <h2>No Labs entries match that search.</h2>
            <p>Clear the filter to see the full directory again.</p>
          </Tile>
        ) : sections.map(([sectionTitle, items]) => (
          <section key={sectionTitle} className="labs-landing__section" aria-labelledby={`labs-section-${sectionTitle}`}>
            <div className="labs-landing__section-heading">
              <div>
                <p className="labs-landing__section-label">Labs Section</p>
                <h2 id={`labs-section-${sectionTitle}`}>{sectionTitle}</h2>
              </div>
              <Tag type="cool-gray">{items.length} entries</Tag>
            </div>

            <div className="labs-landing__grid">
              {items.map((item) => {
                const Icon = item.icon
                const profile = resolveHomeCardProfile(item)
                const hardwareLocation = locationsByRoute[item.to]
                const isCurrentRoute = isRouteMatch(location.pathname, item.to)

                return (
                  <Tile key={routeItemKey(item)} className="labs-landing__card">
                    <div className="labs-landing__card-header">
                      <div className="labs-landing__icon-wrap" aria-hidden="true">
                        <Icon size={20} />
                      </div>
                      <div className="labs-landing__card-copy">
                        <p className="labs-landing__card-section">{sectionTitle}</p>
                        <h3>{item.label}</h3>
                      </div>
                    </div>

                    <div className="labs-landing__tag-row">
                      <Tag type={maturityTagType(item.maturity)}>{maturityTagLabel(item.maturity)}</Tag>
                      {item.to === '/labs/push-surface' ? <Tag type="blue">Top-level Labs page</Tag> : null}
                      {isCurrentRoute ? <Tag type="cool-gray">Current route</Tag> : null}
                      {hardwareLocation ? <Tag type="green">On {hardwareLocation.hostname}</Tag> : null}
                    </div>

                    <p className="labs-landing__card-summary">{profile.summary}</p>
                    <p className="labs-landing__card-description">{item.description}</p>

                    <ul className="labs-landing__capabilities">
                      {profile.capabilities.slice(0, 3).map((capability) => (
                        <li key={`${item.to}-${capability}`}>{capability}</li>
                      ))}
                    </ul>

                    <div className="labs-landing__card-footer">
                      <div>
                        <p className="labs-landing__card-footer-label">Best for</p>
                        <p className="labs-landing__card-footer-value">{profile.bestFor}</p>
                      </div>
                      <Button kind="tertiary" size="sm" renderIcon={ArrowRight} onClick={() => navigate(item.to)}>
                        Open
                      </Button>
                    </div>
                  </Tile>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

export default LabsPage
