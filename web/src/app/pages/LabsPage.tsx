import './LabsLandingPage.css'

import { ArrowRight } from '@carbon/icons-react'
import { Button, Tag, TextInput, Tile } from '@carbon/react'
import { useDeferredValue, useMemo, useState, type CSSProperties } from 'react'
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

function routeItemKey(item: LabsMenuItem): string {
  return `${item.to}::${item.label}`
}

function isRouteMatch(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`)
}

function isBlockedOrLabItem(item: LabsMenuItem): boolean {
  return isBlockedAdvancedMenuItem(item) || item.maturity === 'experimental'
}

function getLabsSectionTitle(item: LabsMenuItem): 'Audio Grid' | 'AVB' | 'MIDI' | 'System' | 'Hardware' | 'Blocked / Lab' {
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
  return [...items].sort((left, right) => left.label.localeCompare(right.label))
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

  const blockedCount = labsItems.filter((item) => isBlockedOrLabItem(item)).length

  return (
    <div className="labs-landing">
      <PageHeader
        title="Labs"
        subtitle="Browse Labs as a uniform catalog of feature cards, each representing a different MAP2 page, service, or hardware workflow."
      />

      <Tile className="labs-landing__directory-card">
        <div className="labs-landing__directory-copy">
          <p className="labs-landing__eyebrow">Feature Catalog</p>
          <h2>Every Labs route now lives in one consistent card grid.</h2>
          <p>
            Scan advanced, experimental, and hardware-sensitive routes as one list of same-size cards,
            then jump directly into the page or service you need.
          </p>
        </div>

        <div className="labs-landing__directory-controls">
          <TextInput
            id="labs-directory-search"
            labelText="Search Labs entries"
            placeholder="Search routes, capabilities, or workflow notes"
            value={searchValue}
            onChange={(event) => setSearchValue(event.currentTarget.value)}
          />
          <div className="labs-landing__tag-row labs-landing__tag-row--summary">
            <Tag type="cool-gray">{filteredItems.length} feature cards</Tag>
            <Tag type="blue">{labsItems.length} total routes</Tag>
            {blockedCount > 0 ? <Tag type="red">{blockedCount} blocked / lab</Tag> : null}
          </div>
        </div>
      </Tile>

      <div className="labs-landing__results">
        <div className="labs-landing__results-heading">
          <div>
            <p className="labs-landing__section-label">Labs Features</p>
            <h2>Feature cards</h2>
          </div>
          <Tag type="cool-gray">{filteredItems.length} showing</Tag>
        </div>

        {filteredItems.length === 0 ? (
          <Tile className="labs-landing__empty">
            <h2>No feature cards match that search.</h2>
            <p>Clear the filter to restore the full Labs catalog.</p>
          </Tile>
        ) : (
          <div className="labs-landing__grid" role="list" aria-label="Labs feature cards">
            {filteredItems.map((item) => {
              const Icon = item.icon
              const profile = resolveHomeCardProfile(item)
              const sectionTitle = getLabsSectionTitle(item)
              const hardwareLocation = locationsByRoute[item.to]
              const isCurrentRoute = isRouteMatch(location.pathname, item.to)
              const cardStyle = { '--labs-card-accent': item.color } as CSSProperties

              return (
                <Tile key={routeItemKey(item)} className="labs-landing__card" role="listitem" style={cardStyle}>
                  <div className="labs-landing__card-header">
                    <div className="labs-landing__icon-wrap" aria-hidden="true">
                      <Icon size={20} />
                    </div>
                    <div className="labs-landing__card-copy">
                      <p className="labs-landing__card-section">{sectionTitle}</p>
                      <h3>{item.label}</h3>
                      <p className="labs-landing__card-route">{item.to}</p>
                    </div>
                  </div>

                  <div className="labs-landing__tag-row">
                    <Tag type={maturityTagType(item.maturity)}>{maturityTagLabel(item.maturity)}</Tag>
                    {isCurrentRoute ? <Tag type="cool-gray">Current route</Tag> : null}
                    {hardwareLocation ? <Tag type="green">On {hardwareLocation.hostname}</Tag> : null}
                  </div>

                  <p className="labs-landing__card-summary">{profile.summary}</p>

                  <div className="labs-landing__card-body">
                    <div className="labs-landing__card-focus">
                      <p className="labs-landing__card-footer-label">Best for</p>
                      <p className="labs-landing__card-footer-value">{profile.bestFor}</p>
                    </div>

                    <ul className="labs-landing__capabilities">
                      {profile.capabilities.slice(0, 2).map((capability) => (
                        <li key={`${item.to}-${capability}`}>{capability}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="labs-landing__card-footer">
                    <p className="labs-landing__card-description">{item.description}</p>
                    <Button kind="tertiary" size="sm" renderIcon={ArrowRight} onClick={() => navigate(item.to)}>
                      Open
                    </Button>
                  </div>
                </Tile>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default LabsPage
