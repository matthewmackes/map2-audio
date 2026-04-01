import type { CSSProperties } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp } from '@carbon/icons-react'
import { Tag } from '@carbon/react'
import { useLocation } from 'react-router-dom'

import {
  advancedMenuItems,
  allRouteNavigationItems,
  type HardwareInterfaceMenuItem,
  type NavigationMaturityState,
  type ShellNavigationItem,
} from '../../data/advancedMenuItems'
import { resolveHomeCardProfile } from '../../data/homeCardProfiles'
import { useHardwareMenuLocations } from '../../hooks/useDeviceLocation'
import { isBlockedAdvancedMenuItem } from '../../layout/advancedMenuState'

type LabsMenuItem = ShellNavigationItem | HardwareInterfaceMenuItem

const LABS_SECTION_ORDER = ['Audio Grid', 'AVB', 'MIDI', 'System', 'Hardware', 'Blocked / Lab'] as const

function routeItemKey(item: LabsMenuItem): string {
  return `${item.to}::${item.label}`
}

function isRouteMatch(pathname: string, to: string): boolean {
  return pathname === to || (to !== '/' && pathname.startsWith(`${to}/`))
}

function isBlockedOrLabItem(item: LabsMenuItem): boolean {
  return isBlockedAdvancedMenuItem(item) || item.maturity === 'experimental'
}

function getLabsSectionTitle(item: LabsMenuItem): typeof LABS_SECTION_ORDER[number] {
  return isBlockedOrLabItem(item) ? 'Blocked / Lab' : item.homeSection
}

function getLabsCardId(sectionTitle: string, item: LabsMenuItem): string {
  return `labs-${sectionTitle}-${routeItemKey(item)}`
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

interface LabsWorkspaceProps {
  pinnedRouteSet: Set<string>
  landingTileRouteSet: Set<string>
  onLaunchRoute: (to: string) => void
}

export function LabsWorkspace({
  pinnedRouteSet,
  landingTileRouteSet,
  onLaunchRoute,
}: LabsWorkspaceProps) {
  const location = useLocation()
  const { locationsByRoute: hardwareLocationNotes } = useHardwareMenuLocations(allRouteNavigationItems)
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null)

  const labsLauncherKeySet = useMemo(
    () => new Set(advancedMenuItems.map((item) => routeItemKey(item))),
    [],
  )

  const labsItems = useMemo(
    () => allRouteNavigationItems.filter(
      (item) => labsLauncherKeySet.has(routeItemKey(item)) || isBlockedOrLabItem(item),
    ),
    [labsLauncherKeySet],
  )

  const labsSections = useMemo(() => {
    const grouped = new Map<string, LabsMenuItem[]>()
    for (const item of labsItems) {
      const sectionTitle = getLabsSectionTitle(item)
      const existing = grouped.get(sectionTitle) ?? []
      existing.push(item)
      grouped.set(sectionTitle, existing)
    }

    return LABS_SECTION_ORDER
      .map((sectionTitle) => [sectionTitle, grouped.get(sectionTitle) ?? []] as const)
      .filter(([, items]) => items.length > 0)
  }, [labsItems])

  const currentCardId = useMemo(() => {
    for (const [sectionTitle, items] of labsSections) {
      const activeItem = items.find((item) => isRouteMatch(location.pathname, item.to))
      if (activeItem) {
        return getLabsCardId(sectionTitle, activeItem)
      }
    }
    return null
  }, [labsSections, location.pathname])

  useEffect(() => {
    setExpandedCardId(currentCardId)
  }, [currentCardId])

  const openLabsRoute = (item: LabsMenuItem) => {
    if (isBlockedAdvancedMenuItem(item)) {
      return
    }

    onLaunchRoute(item.to)
  }

  const renderLabsSectionDetail = (item: LabsMenuItem, sectionTitle: string) => {
    const cardId = getLabsCardId(sectionTitle, item)
    const Icon = item.icon
    const hardwareLocation = hardwareLocationNotes[item.to]
    const profile = resolveHomeCardProfile(item)
    const isActive = isRouteMatch(location.pathname, item.to)
    const supportNotes = [
      item.description,
      hardwareLocation ? `On ${hardwareLocation.hostname}` : null,
      item.gatedReason ?? null,
    ].filter((note): note is string => Boolean(note))

    return (
      <div
        id={`${cardId}-details`}
        className="advanced-menu-control-panel__details"
        role="note"
        aria-label={`${item.label} details`}
      >
        <div className="advanced-menu-control-panel__details-header">
          <div className="advanced-menu-control-panel__details-title-wrap">
            <span className="advanced-menu-control-panel__details-icon" aria-hidden>
              <Icon size={20} />
            </span>
            <div className="advanced-menu-control-panel__details-title-copy">
              <p className="advanced-menu-control-panel__details-section">{sectionTitle}</p>
              <h3 className="advanced-menu-control-panel__details-title">{item.label}</h3>
            </div>
          </div>
          <div className="advanced-menu-control-panel__details-tags">
            <Tag type={maturityTagType(item.maturity)} size="sm">
              {maturityTagLabel(item.maturity)}
            </Tag>
            {isActive ? (
              <Tag type="cool-gray" size="sm">
                Current route
              </Tag>
            ) : null}
            {hardwareLocation ? (
              <Tag type="cool-gray" size="sm">
                On {hardwareLocation.hostname}
              </Tag>
            ) : null}
          </div>
        </div>

        <p className="advanced-menu-control-panel__details-summary">{profile.summary}</p>

        {supportNotes.length > 0 ? (
          <div className="advanced-menu-control-panel__details-notes">
            {supportNotes.map((note) => (
              <p key={`${cardId}-${note}`} className="advanced-menu-control-panel__details-note">
                {note}
              </p>
            ))}
          </div>
        ) : null}

        <div className="advanced-menu-control-panel__details-grid">
          <div className="advanced-menu-control-panel__details-block">
            <p className="advanced-menu-control-panel__details-heading">Capabilities</p>
            <ul className="advanced-menu-control-panel__details-list">
              {profile.capabilities.slice(0, 4).map((capability) => (
                <li key={`${cardId}-${capability}`}>{capability}</li>
              ))}
            </ul>
          </div>

          <div className="advanced-menu-control-panel__details-block">
            <p className="advanced-menu-control-panel__details-heading">Workflow notes</p>
            <p className="advanced-menu-control-panel__details-body">{profile.learnMore}</p>
          </div>

          <div className="advanced-menu-control-panel__details-block">
            <p className="advanced-menu-control-panel__details-heading">Best for</p>
            <p className="advanced-menu-control-panel__details-body advanced-menu-control-panel__details-body--strong">
              {profile.bestFor}
            </p>
          </div>
        </div>
      </div>
    )
  }

  const renderLabsItem = (item: LabsMenuItem, sectionTitle: string) => {
    const cardId = getLabsCardId(sectionTitle, item)
    const Icon = item.icon
    const isBlocked = isBlockedAdvancedMenuItem(item)
    const isPinned = pinnedRouteSet.has(item.to)
    const isOnLanding = landingTileRouteSet.has(item.to)
    const hardwareLocation = hardwareLocationNotes[item.to]
    const isExpanded = expandedCardId === cardId
    const isActive = isRouteMatch(location.pathname, item.to)
    const statusLabel = hardwareLocation
      ? `On ${hardwareLocation.hostname}`
      : isBlocked
        ? 'Blocked'
        : isActive
          ? 'Current route'
          : maturityTagLabel(item.maturity)

    return (
      <article
        key={cardId}
        role="listitem"
        className={`platform-shell__cp-item advanced-menu-control-panel__item${isBlocked ? ' is-blocked' : ''}${isActive ? ' is-active' : ''}${isExpanded ? ' is-expanded' : ''}`}
        style={{ '--advanced-menu-item-accent': item.color } as CSSProperties}
      >
        <button
          type="button"
          className="platform-shell__cp-item-open advanced-menu-control-panel__item-open"
          onClick={() => openLabsRoute(item)}
          aria-label={isBlocked ? `${item.label} unavailable` : item.label}
          title={item.description}
          disabled={isBlocked}
        >
          <span className="platform-shell__cp-icon advanced-menu-control-panel__item-icon" aria-hidden>
            <Icon size={45} />
          </span>
          <span className="platform-shell__cp-label advanced-menu-control-panel__item-label">{item.label}</span>
        </button>

        <div className="advanced-menu-control-panel__item-footer">
          <div className="advanced-menu-control-panel__item-state-wrap">
            <span className="advanced-menu-control-panel__item-state">{statusLabel}</span>
            <div className="advanced-menu-control-panel__item-placement-tags">
              {isPinned ? <Tag type="green" size="sm">Pinned nav</Tag> : null}
              {isOnLanding ? <Tag type="blue" size="sm">Landing tile</Tag> : null}
            </div>
          </div>
          <button
            type="button"
            className="advanced-menu-control-panel__details-btn"
            aria-label={isExpanded ? `Hide details for ${item.label}` : `Show details for ${item.label}`}
            aria-expanded={isExpanded}
            aria-controls={`${cardId}-details`}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              setExpandedCardId((current) => (current === cardId ? null : cardId))
            }}
          >
            {isExpanded ? (
              <>
                <ChevronUp size={12} aria-hidden /> Hide
              </>
            ) : (
              <>
                <ChevronDown size={12} aria-hidden /> Details
              </>
            )}
          </button>
        </div>
      </article>
    )
  }

  return (
    <section className="platform-shell__workspace platform-shell__workspace--labs">
      <div className="platform-shell__ws-header">
        <div className="platform-shell__ws-header-copy">
          <span className="platform-shell__ws-header-eyebrow">Advanced</span>
          <h2 className="platform-shell__ws-header-title">Labs</h2>
          <p className="platform-shell__ws-header-summary">
            The old Advanced launchers now live here, grouped by domain and kept on the same icon grammar.
          </p>
        </div>
      </div>

      <div className="advanced-menu-control-panel">
        {labsSections.map(([sectionTitle, items]) => {
          const expandedItem = items.find((item) => getLabsCardId(sectionTitle, item) === expandedCardId) ?? null

          return (
            <section
              key={`labs-${sectionTitle}`}
              className="platform-shell__cp-panel advanced-menu-control-panel__section"
              aria-label={`${sectionTitle} lab workflows`}
            >
              <div className="advanced-menu-control-panel__section-heading">
                <h2 className="platform-shell__cp-title advanced-menu-control-panel__section-title">{sectionTitle}</h2>
                <span className="advanced-menu-control-panel__section-count" aria-label={`${items.length} routes in ${sectionTitle}`}>
                  {items.length}
                </span>
              </div>
              <div className="platform-shell__cp-grid advanced-menu-control-panel__grid" role="list" aria-label={`${sectionTitle} launcher tiles`}>
                {items.map((item) => renderLabsItem(item, sectionTitle))}
              </div>
              {expandedItem ? renderLabsSectionDetail(expandedItem, sectionTitle) : null}
            </section>
          )
        })}
      </div>
    </section>
  )
}
