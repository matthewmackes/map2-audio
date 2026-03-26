import type { ComponentType, CSSProperties, ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, ChevronRight, ChevronUp, Close, Menu, Pin, PinFilled } from '@carbon/icons-react'
import { Header, HeaderGlobalBar, HeaderMenuButton, HeaderNavigation, Layer, Tag } from '@carbon/react'
import { useSpecialSettings } from '../hooks/useSpecialSettings'
import { useHardwareMenuLocations } from '../hooks/useDeviceLocation'
import { MPX1MegaMenu } from '../components/MPX1/MPX1MegaMenu'
import { NodeNavBar } from '../components/NodeNav/NodeNavBar'
import { PageTransition } from '../components/PageTransition'
import { Map2BrandMark } from '../components/branding/map2Branding'
import { LatencyPressureShellReadout } from '../components/LatencyPressureShellReadout'
import { formatMpx1ProgramName } from '../components/MPX1/programNumber'
import { mpx1Api, useMPX1State } from '../../map2/mpx1Api'
import {
  allPinnableNavigationItems,
  advancedMenuItems,
  allRouteNavigationItems,
  defaultPinnedRoutes,
  hardwareInterfaceMenuItems,
  homeNavigationItem,
  homeNavigationSections,
  MAX_PINNED_NAV_ITEMS,
  normalizePinnedRoutes,
  type HardwareInterfaceMenuItem,
  type NavigationMaturityState,
  type ShellNavigationItem,
} from '../data/advancedMenuItems'
import type { PlatformPinnedNavItem } from '../data/platformMenuItems'
import { resolveHomeCardProfile } from '../data/homeCardProfiles'
import { useWebSocketConnection } from '../../map2/hooks/useWebSocket'
import { isBlockedAdvancedMenuItem } from './advancedMenuState'
import { useTabletTouchRouteLayout } from '../hooks/useTabletTouchRouteLayout'
import './AppShell.css'

interface TopNavItem {
  to: string
  label: string
  shortLabel?: string
  icon: ComponentType<Record<string, unknown>>
  description: string
  color: string
  maturity: NavigationMaturityState
  gatedReason?: string
  deviceType?: string
  kind: 'link' | 'mpx1-mega-menu' | 'hardware-submenu'
  iconOnly?: boolean
  target?: PlatformPinnedNavItem['target']
}

type PinnedMenuItem = ShellNavigationItem | HardwareInterfaceMenuItem | PlatformPinnedNavItem

type MobileMenuItem = ShellNavigationItem | HardwareInterfaceMenuItem

const ADVANCED_SECTION_ORDER = ['Audio Grid', 'AVB', 'MIDI', 'System', 'Hardware', 'Blocked / Lab'] as const

function HeroHomeIcon() {
  return <Map2BrandMark className="topbar-pro__hero-home-mark" />
}

function routeItemKey(item: MobileMenuItem): string {
  return `${item.to}::${item.label}`
}

function isBlockedOrLabItem(item: MobileMenuItem): boolean {
  return isBlockedAdvancedMenuItem(item) || item.maturity === 'experimental'
}

function getAdvancedSectionTitle(item: MobileMenuItem): typeof ADVANCED_SECTION_ORDER[number] {
  return isBlockedOrLabItem(item) ? 'Blocked / Lab' : item.homeSection
}

function getAdvancedCardId(sectionTitle: string, item: MobileMenuItem): string {
  return `advanced-${sectionTitle}-${routeItemKey(item)}`
}

function toTopNavItem(item: PinnedMenuItem): TopNavItem {
  return {
    to: item.to,
    label: item.label,
    shortLabel: item.shortLabel,
    icon: item.icon,
    description: item.description,
    color: item.color,
    maturity: item.maturity,
    gatedReason: 'gatedReason' in item ? item.gatedReason : undefined,
    deviceType: 'deviceType' in item ? item.deviceType : undefined,
    kind: item.kind,
    target: 'target' in item ? item.target : undefined,
  }
}

function isRouteMatch(pathname: string, to: string): boolean {
  return pathname === to || (to !== '/' && pathname.startsWith(to + '/'))
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function normalizeMidiValue(value: number, max = 127): number {
  if (!Number.isFinite(value)) return 0
  return clamp01(value / max)
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

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { isTabletTouchRoute } = useTabletTouchRouteLayout(location.pathname)
  const { status: websocketStatus } = useWebSocketConnection()
  const [navOpen, setNavOpen] = useState(false)
  const [advancedMenuOpen, setAdvancedMenuOpen] = useState(false)
  const [expandedAdvancedCardId, setExpandedAdvancedCardId] = useState<string | null>(null)
  const navMenuRef = useRef<HTMLDivElement>(null)
  const advancedMenuRef = useRef<HTMLDivElement>(null)
  const [mpx1MenuOpen, setMpx1MenuOpen] = useState(false)
  const [topHardwareSubmenuOpen, setTopHardwareSubmenuOpen] = useState(false)
  const mpx1MenuRef = useRef<HTMLDivElement>(null)
  const topHardwareMenuRef = useRef<HTMLDivElement>(null)

  const {
    state: mpx1State,
    programs: mpx1Programs,
    shadow: mpx1Shadow,
    setProgram: setMpx1Program,
    refresh: refreshMpx1State,
  } = useMPX1State({ autoConnectWs: false })

  const currentProgram = mpx1State?.current_program ?? 0
  const currentProgramEntry = mpx1Programs.find((program) => program.program === currentProgram)
  const currentProgramName = formatMpx1ProgramName(currentProgram, currentProgramEntry?.name)
  const mixMeter = normalizeMidiValue(Number(mpx1Shadow['program.master_mix'] ?? mpx1Shadow['program.mix'] ?? 0))
  const levelMeter = normalizeMidiValue(Number(mpx1Shadow['program.master_level'] ?? mpx1Shadow['program.level'] ?? 0))

  const {
    settings: specialSettings,
    isLoading: specialSettingsLoading,
    updateSettings: updateSpecialSettings,
  } = useSpecialSettings()

  const requestedPinnedRoutes = useMemo(
    () => normalizePinnedRoutes(specialSettings?.pinnedRoutes ?? defaultPinnedRoutes),
    [specialSettings?.pinnedRoutes],
  )

  const requestedPinnedRouteSet = useMemo(() => new Set(requestedPinnedRoutes), [requestedPinnedRoutes])

  const pinnedRouteKeys = useMemo(
    () => allPinnableNavigationItems
      .filter((item) => item.to !== '/' && requestedPinnedRouteSet.has(item.to))
      .map((item) => item.to)
      .slice(0, MAX_PINNED_NAV_ITEMS),
    [requestedPinnedRouteSet],
  )

  const pinnedRouteSet = useMemo(() => new Set(pinnedRouteKeys), [pinnedRouteKeys])

  const advancedLauncherKeySet = useMemo(
    () => new Set(advancedMenuItems.map((item) => routeItemKey(item))),
    [],
  )

  const pinnedTopNavItems = useMemo<TopNavItem[]>(() => {
    return allPinnableNavigationItems
      .filter((item) => item.to !== '/' && pinnedRouteSet.has(item.to))
      .map(toTopNavItem)
  }, [pinnedRouteSet])

  const mobilePinnedItems = useMemo(
    () => pinnedTopNavItems.filter((item) => item.kind !== 'hardware-submenu'),
    [pinnedTopNavItems],
  )

  const homeTopNavItem = useMemo<TopNavItem>(
    () => ({
      ...toTopNavItem(homeNavigationItem),
      iconOnly: true,
    }),
    [],
  )
  const heroHomeTopNavItem = useMemo<TopNavItem>(
    () => ({
      ...homeTopNavItem,
      icon: HeroHomeIcon,
    }),
    [homeTopNavItem],
  )
  const HomeIcon = homeTopNavItem.icon

  const showMobileConnectionBanner = websocketStatus === 'reconnecting' || websocketStatus === 'error'
  const isIntegratedWorkspaceRoute = location.pathname.startsWith('/platforms') || location.pathname === '/labs'
  const isFullBleedRoute = location.pathname === '/' || location.pathname === '/juce-grid' || isIntegratedWorkspaceRoute
  const showMobileBottomTabbar = !isIntegratedWorkspaceRoute
  const { locationsByRoute: hardwareLocationNotes } = useHardwareMenuLocations(allRouteNavigationItems)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (navMenuRef.current && !navMenuRef.current.contains(event.target as Node)) {
        setNavOpen(false)
      }
      if (advancedMenuRef.current && !advancedMenuRef.current.contains(event.target as Node)) {
        setAdvancedMenuOpen(false)
      }
      if (mpx1MenuRef.current && !mpx1MenuRef.current.contains(event.target as Node)) {
        setMpx1MenuOpen(false)
      }
      if (topHardwareMenuRef.current && !topHardwareMenuRef.current.contains(event.target as Node)) {
        setTopHardwareSubmenuOpen(false)
      }
    }

    if (navOpen || advancedMenuOpen || mpx1MenuOpen || topHardwareSubmenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [advancedMenuOpen, navOpen, mpx1MenuOpen, topHardwareSubmenuOpen])

  useEffect(() => {
    setAdvancedMenuOpen(false)
    setMpx1MenuOpen(false)
    setTopHardwareSubmenuOpen(false)
    setExpandedAdvancedCardId(null)
  }, [location.pathname])

  useEffect(() => {
    if (!pinnedRouteSet.has('/mpx1')) {
      setMpx1MenuOpen(false)
    }
    if (!pinnedRouteSet.has('/hardware-interfaces')) {
      setTopHardwareSubmenuOpen(false)
    }
  }, [pinnedRouteSet])

  const handleMenuToggle = () => {
    const nextOpen = !navOpen
    setNavOpen(nextOpen)
    setAdvancedMenuOpen(false)
    setMpx1MenuOpen(false)
    setTopHardwareSubmenuOpen(false)
    setExpandedAdvancedCardId(null)
  }

  const closeMobileNavigation = () => {
    setNavOpen(false)
    setAdvancedMenuOpen(false)
    setMpx1MenuOpen(false)
    setTopHardwareSubmenuOpen(false)
    setExpandedAdvancedCardId(null)
  }

  const closeTransientMenus = () => {
    setAdvancedMenuOpen(false)
    setMpx1MenuOpen(false)
    setTopHardwareSubmenuOpen(false)
    setExpandedAdvancedCardId(null)
  }

  const openAdvancedRoute = (item: MobileMenuItem) => {
    if (isBlockedAdvancedMenuItem(item)) {
      return
    }
    closeTransientMenus()
    navigate(item.to)
  }

  const handleMpx1Rescan = async () => {
    try {
      await mpx1Api.getMidiPorts()
      await refreshMpx1State()
    } catch (err) {
      console.error('MPX1 MIDI rescan failed:', err)
    }
  }

  const handleMpx1Disconnect = async () => {
    try {
      await mpx1Api.disconnectMidi()
      await refreshMpx1State()
    } catch (err) {
      console.error('MPX1 disconnect failed:', err)
    }
  }

  const togglePinnedRoute = async (item: PinnedMenuItem, checked: boolean) => {
    if (!item.pinnable) {
      return
    }

    const currentRoutes = allPinnableNavigationItems
      .filter((candidate) => candidate.to !== '/' && pinnedRouteSet.has(candidate.to))
      .map((candidate) => candidate.to)

    if (!checked) {
      await updateSpecialSettings({ pinnedRoutes: currentRoutes.filter((route) => route !== item.to) })
      return
    }

    if (pinnedRouteSet.size >= MAX_PINNED_NAV_ITEMS && !pinnedRouteSet.has(item.to)) {
      return
    }

    const candidateRoutes = new Set([...currentRoutes, item.to])
    const nextRoutes = allPinnableNavigationItems
      .filter((candidate) => candidate.to !== '/' && candidateRoutes.has(candidate.to))
      .map((candidate) => candidate.to)
      .slice(0, MAX_PINNED_NAV_ITEMS)

    await updateSpecialSettings({ pinnedRoutes: nextRoutes })
  }

  const renderPinToggle = (item: PinnedMenuItem) => {
    if (!item.pinnable) {
      return null
    }

    const checked = pinnedRouteSet.has(item.to)
    const limitReached = !checked && pinnedRouteSet.size >= MAX_PINNED_NAV_ITEMS
    const disabled = specialSettingsLoading || limitReached

    return (
      <button
        type="button"
        className={`nav-advanced-promote-toggle${checked ? ' is-pinned' : ''}${disabled ? ' is-disabled' : ''}`}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          if (!disabled) {
            void togglePinnedRoute(item, !checked)
          }
        }}
        title={
          limitReached
            ? `Maximum ${MAX_PINNED_NAV_ITEMS} pinned routes`
            : checked
              ? 'Unpin from navigation bar'
              : 'Pin to navigation bar'
        }
        disabled={disabled}
        aria-label={checked ? `Unpin ${item.label}` : `Pin ${item.label}`}
        aria-pressed={checked}
      >
        {checked ? <PinFilled size={12} aria-hidden /> : <Pin size={12} aria-hidden />}
      </button>
    )
  }

  const renderNavItem = (item: TopNavItem) => {
    const Icon = item.icon
    const isAudioGridTab = item.to === '/juce-grid'
    return (
      <NavLink
        key={item.to}
        to={item.to}
        className={({ isActive }) => `nav-tab-item${item.iconOnly ? ' nav-tab-item--icon-only' : ''}${isAudioGridTab ? ' nav-tab-item--audio-grid' : ''}${isActive ? ' nav-tab-item--active' : ''}`}
        aria-label={item.label}
        title={`${item.description} • ${item.maturity}`}
        style={{ '--tab-color': item.color } as CSSProperties}
        onClick={() => {
          closeTransientMenus()
        }}
      >
        <span className={`nav-tab-icon${isAudioGridTab ? ' nav-tab-icon--audio-grid' : ''}`}>
          <Icon size={isAudioGridTab ? 20 : 16} aria-hidden />
        </span>
        {!item.iconOnly && <span className={`nav-tab-label${isAudioGridTab ? ' nav-tab-label--audio-grid' : ''}`}>{item.label}</span>}
      </NavLink>
    )
  }

  const renderMpx1MegaMenuTrigger = (item: TopNavItem) => {
    const Icon = item.icon
    const isRouteActive = isRouteMatch(location.pathname, '/mpx1')

    return (
      <div key={`mpx1-mega-${item.to}`} className="mpx1-nav-root" ref={mpx1MenuRef}>
        <button
          type="button"
          className={`nav-tab-item nav-tab-item--menu${isRouteActive ? ' nav-tab-item--menu-active' : ''}${mpx1MenuOpen ? ' nav-tab-item--menu-open' : ''}`}
          title={`${item.description} • ${item.maturity}`}
          style={{ '--tab-color': item.color } as CSSProperties}
          onClick={() => {
            const nextOpen = !mpx1MenuOpen
            setMpx1MenuOpen(nextOpen)
            if (nextOpen) {
              setTopHardwareSubmenuOpen(false)
            }
          }}
          aria-haspopup="menu"
          aria-expanded={mpx1MenuOpen}
          aria-controls="mpx1-mega-menu"
        >
          <span className="nav-tab-icon">
            <Icon size={16} aria-hidden />
          </span>
          <span className="nav-tab-label">{item.label}</span>
          <ChevronRight size={12} className={`nav-tab-advanced-caret${mpx1MenuOpen ? ' is-open' : ''}`} />
        </button>

        {mpx1MenuOpen && (
          <MPX1MegaMenu
            menuId="mpx1-mega-menu"
            connected={Boolean(mpx1State?.connected)}
            currentProgram={currentProgram}
            currentProgramName={currentProgramName}
            mixMeter={mixMeter}
            levelMeter={levelMeter}
            hasMidiMappings={false}
            onClose={() => setMpx1MenuOpen(false)}
            onRescan={handleMpx1Rescan}
            onDisconnect={handleMpx1Disconnect}
            onProgramStep={async (delta) => {
              const nextProgram = Math.max(0, currentProgram + delta)
              try {
                await setMpx1Program(nextProgram)
              } catch (err) {
                console.error('MPX1 program change failed:', err)
              }
            }}
          />
        )}
      </div>
    )
  }

  const renderHardwareSubmenuTrigger = (item: TopNavItem) => {
    const Icon = item.icon
    const hardwareSubmenuItems = hardwareInterfaceMenuItems.filter((hardwareItem) => hardwareItem.showInHardwareSubmenu !== false)
    const isHardwareRouteActive = hardwareSubmenuItems.some((hardwareItem) =>
      isRouteMatch(location.pathname, hardwareItem.to)
    )

    return (
      <div key={`hardware-submenu-${item.to}`} className="top-hardware-nav-root" ref={topHardwareMenuRef}>
        <button
          type="button"
          className={`nav-tab-item nav-tab-item--menu${isHardwareRouteActive ? ' nav-tab-item--menu-active' : ''}${topHardwareSubmenuOpen ? ' nav-tab-item--menu-open' : ''}`}
          title={`${item.description} • ${item.maturity}`}
          style={{ '--tab-color': item.color } as CSSProperties}
          onClick={() => {
            const nextOpen = !topHardwareSubmenuOpen
            setTopHardwareSubmenuOpen(nextOpen)
            if (nextOpen) {
              setMpx1MenuOpen(false)
            }
          }}
          aria-haspopup="menu"
          aria-expanded={topHardwareSubmenuOpen}
          aria-controls="top-hardware-menu"
        >
          <span className="nav-tab-icon">
            <Icon size={16} aria-hidden />
          </span>
          <span className="nav-tab-label">{item.label}</span>
          <ChevronRight size={12} className={`nav-tab-advanced-caret${topHardwareSubmenuOpen ? ' is-open' : ''}`} />
        </button>

        {topHardwareSubmenuOpen && (
          <Layer id="top-hardware-menu" className="top-hardware-menu-panel" role="menu" aria-label="Audio interfaces">
            {hardwareSubmenuItems.map((hardwareItem) => (
              <NavLink
                key={`top-hardware-${hardwareItem.label}-${hardwareItem.to}`}
                to={hardwareItem.to}
                className="top-hardware-menu-link"
                style={{ '--item-color': hardwareItem.color } as CSSProperties}
                onClick={() => setTopHardwareSubmenuOpen(false)}
              >
                <hardwareItem.icon size={16} aria-hidden />
                <span className="top-hardware-menu-meta">
                  <span>{hardwareItem.label}</span>
                  {hardwareLocationNotes[hardwareItem.to] ? (
                    <Tag type="cool-gray" size="sm" className="top-hardware-menu-location">
                      On {hardwareLocationNotes[hardwareItem.to]?.hostname}
                    </Tag>
                  ) : null}
                </span>
              </NavLink>
            ))}
          </Layer>
        )}
      </div>
    )
  }

  const renderMobileMenuItem = (item: MobileMenuItem, keyPrefix: string) => {
    const Icon = item.icon
    const isBlocked = isBlockedAdvancedMenuItem(item)
    const hardwareLocation = hardwareLocationNotes[item.to]
    const itemBody = (
      <>
        <Icon size={18} aria-hidden />
        <div className="nav-mobile-item-text">
          <div className="nav-mobile-item-heading">
            <span className="nav-mobile-item-label">{item.label}</span>
            <Tag type={maturityTagType(item.maturity)} size="sm" className="nav-mobile-item-maturity">
              {maturityTagLabel(item.maturity)}
            </Tag>
          </div>
          <span className="nav-mobile-item-desc">{item.description}</span>
          {hardwareLocation && <span className="nav-mobile-item-note">On {hardwareLocation.hostname}</span>}
          {item.gatedReason && <span className="nav-mobile-item-note">{item.gatedReason}</span>}
        </div>
      </>
    )

    if (isBlocked) {
      return (
        <div key={`${keyPrefix}-${item.to}`} className="nav-mobile-item-wrap">
          <div
            className="nav-mobile-item nav-mobile-item--blocked"
            style={{ '--item-color': item.color } as CSSProperties}
            role="note"
            aria-disabled="true"
          >
            {itemBody}
          </div>
        </div>
      )
    }

    return (
      <div key={`${keyPrefix}-${item.to}`} className="nav-mobile-item-wrap">
        <NavLink
          to={item.to}
          className={({ isActive }) => `nav-mobile-item${isActive ? ' active' : ''}`}
          style={{ '--item-color': item.color } as CSSProperties}
          title={item.description}
          onClick={closeMobileNavigation}
        >
          {itemBody}
        </NavLink>
        {renderPinToggle(item)}
      </div>
    )
  }

  const renderAdvancedSectionDetail = (item: MobileMenuItem, sectionTitle: string) => {
    const cardId = getAdvancedCardId(sectionTitle, item)
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

  const renderAdvancedControlPanelItem = (item: MobileMenuItem, sectionTitle: string) => {
    const cardId = getAdvancedCardId(sectionTitle, item)
    const Icon = item.icon
    const isBlocked = isBlockedAdvancedMenuItem(item)
    const isPinned = pinnedRouteSet.has(item.to)
    const limitReached = !isPinned && pinnedRouteSet.size >= MAX_PINNED_NAV_ITEMS
    const pinDisabled = specialSettingsLoading || !item.pinnable || limitReached
    const hardwareLocation = hardwareLocationNotes[item.to]
    const isExpanded = expandedAdvancedCardId === cardId
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
        {item.pinnable ? (
          <button
            type="button"
            className={`platform-shell__cp-pin-btn advanced-menu-control-panel__pin-btn${isPinned ? ' is-pinned' : ''}`}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              if (!pinDisabled) {
                void togglePinnedRoute(item, !isPinned)
              }
            }}
            title={
              limitReached
                ? `Maximum ${MAX_PINNED_NAV_ITEMS} pinned routes`
                : isPinned
                  ? 'Unpin from navigation bar'
                  : 'Pin to navigation bar'
            }
            aria-label={isPinned ? `Unpin ${item.label}` : `Pin ${item.label}`}
            aria-pressed={isPinned}
            disabled={pinDisabled}
          >
            {isPinned ? 'PINNED' : 'PIN'}
          </button>
        ) : null}

        <button
          type="button"
          className="platform-shell__cp-item-open advanced-menu-control-panel__item-open"
          onClick={() => openAdvancedRoute(item)}
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
          <span className="advanced-menu-control-panel__item-state">{statusLabel}</span>
          <button
            type="button"
            className="advanced-menu-control-panel__details-btn"
            aria-label={isExpanded ? `Hide details for ${item.label}` : `Show details for ${item.label}`}
            aria-expanded={isExpanded}
            aria-controls={`${cardId}-details`}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              setExpandedAdvancedCardId((current) => (current === cardId ? null : cardId))
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

  const advancedLauncherItems = useMemo(
    () => allRouteNavigationItems.filter(
      (item) => advancedLauncherKeySet.has(routeItemKey(item)) || isBlockedOrLabItem(item),
    ),
    [advancedLauncherKeySet],
  )

  const advancedSections = useMemo(() => {
    const grouped = new Map<string, MobileMenuItem[]>()
    for (const item of advancedLauncherItems) {
      const sectionTitle = getAdvancedSectionTitle(item)
      const existing = grouped.get(sectionTitle) ?? []
      existing.push(item)
      grouped.set(sectionTitle, existing)
    }
    return ADVANCED_SECTION_ORDER
      .map((sectionTitle) => [sectionTitle, grouped.get(sectionTitle) ?? []] as const)
      .filter(([, items]) => items.length > 0)
  }, [advancedLauncherItems])

  const currentAdvancedCardId = useMemo(() => {
    for (const [sectionTitle, items] of advancedSections) {
      const activeItem = items.find((item) => isRouteMatch(location.pathname, item.to))
      if (activeItem) {
        return getAdvancedCardId(sectionTitle, activeItem)
      }
    }
    return null
  }, [advancedSections, location.pathname])

  useEffect(() => {
    if (!advancedMenuOpen) {
      setExpandedAdvancedCardId(null)
      return
    }
    setExpandedAdvancedCardId(currentAdvancedCardId)
  }, [advancedMenuOpen, currentAdvancedCardId])

  return (
    <div className={`app-shell${showMobileConnectionBanner ? ' has-mobile-connection-banner' : ''}${isTabletTouchRoute ? ' app-shell--juce-grid-tablet' : ''}`}>
      {showMobileConnectionBanner && (
        <div className="mobile-connection-banner" role="status" aria-live="polite">
          <span className="mobile-connection-banner-dot" aria-hidden />
          <span>Connection lost - reconnecting...</span>
        </div>
      )}
      <Header className={`topbar-pro${isTabletTouchRoute ? ' topbar-pro--juce-grid-tablet' : ''}`} aria-label="MAP2 primary navigation shell">
        <HeaderNavigation className="nav-tabs-left" aria-label="Primary navigation">
          {renderNavItem(heroHomeTopNavItem)}
        </HeaderNavigation>

        <HeaderNavigation className="nav-tabs-center" aria-label="Pinned navigation">
          {pinnedTopNavItems.map((item) => {
            if (item.kind === 'mpx1-mega-menu') {
              return renderMpx1MegaMenuTrigger(item)
            }
            if (item.kind === 'hardware-submenu') {
              return renderHardwareSubmenuTrigger(item)
            }
            return renderNavItem(item)
          })}
        </HeaderNavigation>

        <HeaderGlobalBar className="nav-tabs-right-container">
          <HeaderMenuButton
            className="nav-hamburger-btn"
            onClick={handleMenuToggle}
            isCollapsible
            isActive={navOpen}
            aria-label="Toggle navigation menu"
          />

          <HeaderNavigation className="nav-tabs-right" aria-label="Settings navigation">
            <NodeNavBar />
          </HeaderNavigation>
          <LatencyPressureShellReadout />
        </HeaderGlobalBar>

        {navOpen && (
          <div className="nav-mobile-menu" ref={navMenuRef}>
            <div className="nav-mobile-menu-content">
              {homeNavigationSections.map((section) => (
                <section key={`mobile-home-${section.title}`} className="nav-mobile-advanced-group">
                  <div className="nav-mobile-group-label">{section.title}</div>
                  <div className="nav-mobile-group-grid">
                    {section.items.map((item) => renderMobileMenuItem(item, `mobile-home-${section.title}`))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}
      </Header>

      <main className={isFullBleedRoute ? 'app-content app-content--full' : 'app-content'}>
        <PageTransition>{children}</PageTransition>
      </main>
      {showMobileBottomTabbar ? (
        <nav className="mobile-bottom-tabbar" aria-label="Mobile quick navigation">
        <NavLink
          key="mobile-home"
          to={homeTopNavItem.to}
          className={({ isActive }) => `mobile-bottom-tab${isActive ? ' is-active' : ''}`}
          onClick={closeMobileNavigation}
          title={`${homeTopNavItem.description} • ${homeTopNavItem.maturity}`}
        >
          <span className="mobile-bottom-tab-icon">
            <HomeIcon size={16} aria-hidden />
          </span>
          <span>Home</span>
        </NavLink>
        {mobilePinnedItems.map((item) => {
          const Icon = item.icon

          return (
            <NavLink
              key={`mobile-pinned-${item.to}`}
              to={item.to}
              className={({ isActive }) => `mobile-bottom-tab${isActive ? ' is-active' : ''}`}
              onClick={closeMobileNavigation}
              title={`${item.description} • ${item.maturity}`}
            >
              <span className="mobile-bottom-tab-icon">
                <Icon size={16} aria-hidden />
              </span>
              <span>{item.shortLabel ?? item.label}</span>
            </NavLink>
          )
        })}
        <button
          type="button"
          className={`mobile-bottom-tab${navOpen ? ' is-active' : ''}`}
          onClick={handleMenuToggle}
          aria-label="Toggle mobile menu"
        >
          <span className="mobile-bottom-tab-icon">
            {navOpen ? <Close size={16} aria-hidden /> : <Menu size={16} aria-hidden />}
          </span>
          <span>Menu</span>
        </button>
        </nav>
      ) : null}
    </div>
  )
}
