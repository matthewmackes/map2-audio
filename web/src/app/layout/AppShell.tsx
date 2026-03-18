import type { ComponentType, CSSProperties, ReactNode } from 'react'
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useState, useRef, useEffect, useMemo, startTransition } from 'react'
import { ChevronDown, ChevronRight, ChevronUp, Close, Menu, Pin, PinFilled, Settings } from '@carbon/icons-react'
import { Header, HeaderGlobalBar, HeaderMenuButton, HeaderNavigation, Layer, Tag } from '@carbon/react'
import { PlatformModalContent, isStandalonePanel } from '../components/Platform/PlatformModal'
import type { StandalonePanel } from '../components/Platform/PlatformModal'
import { isPlatformLayerId } from '../platform/model'
import type { PlatformLayerId } from '../platform/model'
import { useSpecialSettings } from '../hooks/useSpecialSettings'
import { useHardwareMenuLocations } from '../hooks/useDeviceLocation'
import { PasswordDialog } from '../components/PasswordDialog'
import { SpecialSettingsDialog } from '../components/SpecialSettingsDialog'
import { MPX1MegaMenu } from '../components/MPX1/MPX1MegaMenu'
import { NodeNavBar } from '../components/NodeNav/NodeNavBar'
import { Map2BrandMark } from '../components/branding/map2Branding'
import { formatMpx1ProgramName } from '../components/MPX1/programNumber'
import { mpx1Api, useMPX1State } from '../../map2/mpx1Api'
import {
  advancedMenuItems,
  defaultPinnedRoutes,
  allRouteNavigationItems,
  hardwareInterfaceMenuItems,
  homeNavigationItem,
  homeNavigationSections,
  MAX_PINNED_NAV_ITEMS,
  normalizePinnedRoutes,
  pinnableNavigationItems,
  type HardwareInterfaceMenuItem,
  type NavigationMaturityState,
  type ShellNavigationItem,
} from '../data/advancedMenuItems'
import { resolveHomeCardProfile } from '../data/homeCardProfiles'
import { useWebSocketConnection } from '../../map2/hooks/useWebSocket'
import { isBlockedAdvancedMenuItem } from './advancedMenuState'
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
}

type PinnedMenuItem = ShellNavigationItem | HardwareInterfaceMenuItem

type MobileMenuItem = ShellNavigationItem | HardwareInterfaceMenuItem

const ADVANCED_SECTION_ORDER = ['Audio Grid', 'AVB', 'MIDI', 'System', 'Hardware', 'Blocked / Lab'] as const

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
    gatedReason: item.gatedReason,
    deviceType: item.deviceType,
    kind: item.kind,
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
  const [searchParams, setSearchParams] = useSearchParams()
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
  const [platformModalOpen, setPlatformModalOpen] = useState(false)

  // Derive initial deep-link params from URL when modal opens
  const platformLayerParam = searchParams.get('layer')
  const platformPanelParam = searchParams.get('panel')
  const initialLayer: PlatformLayerId | null = isPlatformLayerId(platformLayerParam) ? platformLayerParam : null
  const initialPanel: StandalonePanel | null = isStandalonePanel(platformPanelParam) ? platformPanelParam : null

  // Open modal automatically when URL carries a deep-link (e.g. /platform?panel=about redirect)
  useEffect(() => {
    if (initialLayer || initialPanel) {
      setPlatformModalOpen(true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [showSpecialSettings, setShowSpecialSettings] = useState(false)

  const requestedPinnedRoutes = useMemo(
    () => normalizePinnedRoutes(specialSettings?.pinnedRoutes ?? defaultPinnedRoutes),
    [specialSettings?.pinnedRoutes],
  )

  const requestedPinnedRouteSet = useMemo(() => new Set(requestedPinnedRoutes), [requestedPinnedRoutes])

  const pinnedRouteKeys = useMemo(
    () => pinnableNavigationItems
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
    return pinnableNavigationItems
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
  const HomeIcon = homeTopNavItem.icon

  const showMobileConnectionBanner = websocketStatus === 'reconnecting' || websocketStatus === 'error'
  const isFullBleedRoute = location.pathname === '/' || location.pathname === '/juce-grid'
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

  const handlePlatformModalOpen = () => {
    startTransition(() => {
      setAdvancedMenuOpen(false)
      setNavOpen(false)
      setMpx1MenuOpen(false)
      setTopHardwareSubmenuOpen(false)
      setExpandedAdvancedCardId(null)
      setPlatformModalOpen(true)
    })
  }

  const handlePlatformModalClose = () => {
    setPlatformModalOpen(false)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('layer')
      next.delete('panel')
      return next
    }, { replace: true })
  }

  const handlePlatformNavigate = (params: { layer?: PlatformLayerId; panel?: StandalonePanel } | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('layer')
      next.delete('panel')
      if (params?.layer) next.set('layer', params.layer)
      if (params?.panel) next.set('panel', params.panel)
      return next
    }, { replace: true })
  }


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

  const handleSpecialSettingsIconClick = () => {
    if (specialSettingsLoading) return
    setShowPasswordDialog(true)
  }

  const handlePasswordSuccess = async () => {
    setShowPasswordDialog(false)
    const nextMenuLocation = specialSettings?.menuLocation ?? 'top-nav'
    const nextHiddenPlugins = specialSettings?.hiddenPlugins ?? []
    const nextPinnedRoutes = normalizePinnedRoutes(specialSettings?.pinnedRoutes ?? defaultPinnedRoutes)
    const nextEnabled = specialSettings?.enabled ?? false

    try {
      if (!nextEnabled) {
        await updateSpecialSettings({
          enabled: true,
          hiddenPlugins: nextHiddenPlugins,
          menuLocation: nextMenuLocation,
          pinnedRoutes: nextPinnedRoutes,
        })
      }
    } catch (err) {
      console.error('Failed to enable special mode after authentication:', err)
    } finally {
      setShowSpecialSettings(true)
    }
  }

  const handleSpecialSettingsSave = async (settings: {
    enabled: boolean
    hiddenPlugins: string[]
    menuLocation: 'top-nav' | 'mobile-only' | 'hidden'
  }) => {
    await updateSpecialSettings(settings)
    setShowSpecialSettings(false)
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

    const currentRoutes = pinnableNavigationItems
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
    const nextRoutes = pinnableNavigationItems
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

  const renderAdvancedLauncherCard = (item: MobileMenuItem, sectionTitle: string) => {
    const cardId = getAdvancedCardId(sectionTitle, item)
    const Icon = item.icon
    const isBlocked = isBlockedAdvancedMenuItem(item)
    const isPinned = pinnedRouteSet.has(item.to)
    const limitReached = !isPinned && pinnedRouteSet.size >= MAX_PINNED_NAV_ITEMS
    const pinDisabled = specialSettingsLoading || !item.pinnable || limitReached
    const hardwareLocation = hardwareLocationNotes[item.to]
    const profile = resolveHomeCardProfile(item)
    const isExpanded = expandedAdvancedCardId === cardId
    const isActive = isRouteMatch(location.pathname, item.to)
    const supportNotes = [
      hardwareLocation ? `On ${hardwareLocation.hostname}` : null,
      item.gatedReason ?? null,
    ].filter((note): note is string => Boolean(note))

    return (
      <article
        key={cardId}
        role="listitem"
        className={`advanced-menu-launcher-card${isBlocked ? ' is-blocked' : ''}${isActive ? ' is-active' : ''}`}
        style={{ '--advanced-menu-card-accent': item.color } as CSSProperties}
        onClick={() => openAdvancedRoute(item)}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) {
            return
          }
          if ((event.key === 'Enter' || event.key === ' ') && !isBlocked) {
            event.preventDefault()
            openAdvancedRoute(item)
          }
        }}
        tabIndex={isBlocked ? -1 : 0}
        aria-label={`Open ${item.label}`}
        aria-disabled={isBlocked || undefined}
      >
        {item.pinnable ? (
          <button
            type="button"
            className={`advanced-menu-launcher-card__pin-btn${isPinned ? ' is-pinned' : ''}`}
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
            {isPinned ? <PinFilled size={16} aria-hidden /> : <Pin size={16} aria-hidden />}
          </button>
        ) : null}

        <div className="advanced-menu-launcher-card__meta">
          <Icon className="advanced-menu-launcher-card__icon" aria-hidden />
          <div className="advanced-menu-launcher-card__badges">
            <span className="advanced-menu-launcher-card__maturity">{maturityTagLabel(item.maturity)}</span>
            {isActive ? <span className="advanced-menu-launcher-card__status">Current route</span> : null}
            {hardwareLocation ? (
              <span className="advanced-menu-launcher-card__status">On {hardwareLocation.hostname}</span>
            ) : null}
          </div>
        </div>

        <h3 className="advanced-menu-launcher-card__label">{item.label}</h3>
        <p className="advanced-menu-launcher-card__desc">{profile.summary}</p>

        {supportNotes.length > 0 ? (
          <div className="advanced-menu-launcher-card__notes">
            {supportNotes.map((note) => (
              <p key={`${cardId}-${note}`} className="advanced-menu-launcher-card__note">
                {note}
              </p>
            ))}
          </div>
        ) : null}

        <div className="advanced-menu-launcher-card__footer">
          <button
            type="button"
            className="advanced-menu-launcher-card__open-btn"
            disabled={isBlocked}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              if (!isBlocked) {
                openAdvancedRoute(item)
              }
            }}
          >
            Open interface
          </button>
          <button
            type="button"
            className="advanced-menu-launcher-card__details-btn"
            aria-expanded={isExpanded}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              setExpandedAdvancedCardId((current) => (current === cardId ? null : cardId))
            }}
          >
            {isExpanded ? (
              <>
                <ChevronUp size={14} aria-hidden /> Less
              </>
            ) : (
              <>
                <ChevronDown size={14} aria-hidden /> Details
              </>
            )}
          </button>
        </div>

        {isExpanded ? (
          <div className="advanced-menu-launcher-card__detail-panel" role="note">
            <div>
              <p className="advanced-menu-launcher-card__detail-heading">Capabilities</p>
              <ul className="advanced-menu-launcher-card__detail-list">
                {profile.capabilities.slice(0, 4).map((capability) => (
                  <li key={`${cardId}-${capability}`}>{capability}</li>
                ))}
              </ul>
            </div>

            <div>
              <p className="advanced-menu-launcher-card__detail-heading">Workflow notes</p>
              <p className="advanced-menu-launcher-card__detail-body">{profile.learnMore}</p>
            </div>

            <div>
              <p className="advanced-menu-launcher-card__detail-heading">Best for</p>
              <p className="advanced-menu-launcher-card__detail-body advanced-menu-launcher-card__detail-body--strong">
                {profile.bestFor}
              </p>
            </div>
          </div>
        ) : null}
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
    <div className={`app-shell${showMobileConnectionBanner ? ' has-mobile-connection-banner' : ''}`}>
      {showMobileConnectionBanner && (
        <div className="mobile-connection-banner" role="status" aria-live="polite">
          <span className="mobile-connection-banner-dot" aria-hidden />
          <span>Connection lost - reconnecting...</span>
        </div>
      )}
      <Header className="topbar-pro" aria-label="MAP2 primary navigation shell">
        <HeaderNavigation className="nav-tabs-left" aria-label="Primary navigation">
          {renderNavItem(homeTopNavItem)}
          <NavLink to="/" className="topbar-pro__brand" aria-label="Mackes Audio Platform home">
            <span className="topbar-pro__brand-mark-wrap" aria-hidden="true">
              <Map2BrandMark className="topbar-pro__brand-mark" />
            </span>
          </NavLink>
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
          <HeaderNavigation className="nav-tabs-right" aria-label="Settings navigation">
            <NodeNavBar />
            <div className="advanced-menu-root" ref={advancedMenuRef}>
              <button
                type="button"
                className={`nav-tab-item nav-tab-advanced${advancedMenuOpen ? ' nav-tab-advanced--open' : ''}`}
                aria-label="Open advanced menu"
                aria-haspopup="menu"
                aria-expanded={advancedMenuOpen}
                aria-controls="advanced-menu-panel"
                onClick={() => {
                  const nextOpen = !advancedMenuOpen
                  setAdvancedMenuOpen(nextOpen)
                  setExpandedAdvancedCardId(nextOpen ? currentAdvancedCardId : null)
                  if (nextOpen) {
                    setNavOpen(false)
                    setMpx1MenuOpen(false)
                    setTopHardwareSubmenuOpen(false)
                  }
                }}
                title="Open advanced routes and developer workflows"
              >
                <span className="nav-tab-advanced-label">Advanced</span>
                <ChevronRight size={12} className={`nav-tab-advanced-caret${advancedMenuOpen ? ' is-open' : ''}`} />
              </button>

              {advancedMenuOpen && (
                <div
                  id="advanced-menu-panel"
                  className="advanced-menu-panel advanced-menu-panel--launcher"
                  role="menu"
                  aria-label="Advanced menu"
                >
                  <div className="advanced-menu-launcher">
                    <div className="advanced-menu-header advanced-menu-launcher__hero">
                      <div className="advanced-menu-launcher__hero-art" aria-hidden="true">
                        <Map2BrandMark className="advanced-menu-launcher__brand-mark" />
                      </div>
                      <div className="advanced-menu-header-main advanced-menu-launcher__hero-copy">
                        <p className="advanced-menu-kicker">Advanced launcher</p>
                        <h2 className="advanced-menu-title">Developer, cluster, and non-default workflows</h2>
                        <p className="advanced-menu-subtitle">
                          Routes stay visible here even when they are not pinned into the primary shell navigation.
                        </p>
                      </div>
                      <div className="advanced-menu-launcher__hero-metrics" aria-label="Advanced launcher status">
                        <div className="advanced-menu-launcher__metric">
                          <span className="advanced-menu-launcher__metric-label">Routes</span>
                          <strong className="advanced-menu-launcher__metric-value">{advancedLauncherItems.length}</strong>
                        </div>
                        <div className="advanced-menu-launcher__metric">
                          <span className="advanced-menu-launcher__metric-label">Pinned</span>
                          <strong className="advanced-menu-launcher__metric-value">
                            {pinnedRouteSet.size}/{MAX_PINNED_NAV_ITEMS}
                          </strong>
                        </div>
                        <div className="advanced-menu-launcher__metric">
                          <span className="advanced-menu-launcher__metric-label">Sections</span>
                          <strong className="advanced-menu-launcher__metric-value">{advancedSections.length}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="advanced-menu-launcher__body">
                      {advancedSections.map(([sectionTitle, items]) => (
                        <section
                          key={`advanced-${sectionTitle}`}
                          className="advanced-menu-launcher__section"
                          aria-label={`${sectionTitle} advanced workflows`}
                        >
                          <div className="advanced-menu-launcher__section-heading">
                            <h3 className="advanced-menu-launcher__section-title">{sectionTitle}</h3>
                            <span className="advanced-menu-launcher__section-count">{items.length}</span>
                          </div>
                          <div className="advanced-menu-launcher__grid" role="list" aria-label={`${sectionTitle} launcher cards`}>
                            {items.map((item) => renderAdvancedLauncherCard(item, sectionTitle))}
                          </div>
                        </section>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              className="nav-tab-item nav-tab-special"
              disabled={specialSettingsLoading}
              aria-label="Open special settings"
              onClick={handleSpecialSettingsIconClick}
              onMouseEnter={(e) => {
                if (!specialSettingsLoading) {
                  e.currentTarget.style.borderColor = 'var(--cds-support-error)'
                }
              }}
              onMouseLeave={(e) => {
                if (!specialSettingsLoading) {
                  e.currentTarget.style.borderColor = 'transparent'
                }
              }}
              title="Open Special settings (password required)"
            >
              <Settings
                size={14}
                aria-hidden
                style={{ color: specialSettings?.enabled ? 'var(--cds-support-error)' : 'var(--cds-text-secondary)' }}
              />
            </button>
            <button
              type="button"
              className={`nav-tab-item nav-tab-platform${platformModalOpen ? ' nav-tab-platform--active' : ''}`}
              aria-label="Open Platform panel"
              aria-haspopup="dialog"
              aria-expanded={platformModalOpen}
              onClick={() => {
                if (platformModalOpen) {
                  handlePlatformModalClose()
                } else {
                  handlePlatformModalOpen()
                }
              }}
              title="Open Platform control panel"
            >
              <span className="nav-tab-platform-label">Platform</span>
            </button>
          </HeaderNavigation>

          <HeaderMenuButton
            className="nav-hamburger-btn"
            onClick={handleMenuToggle}
            isCollapsible
            isActive={navOpen}
            aria-label="Toggle navigation menu"
          />
        </HeaderGlobalBar>

        {navOpen && (
          <div className="nav-mobile-menu" ref={navMenuRef}>
            <div className="nav-mobile-menu-content">
              <section className="nav-mobile-advanced-group">
                <div className="nav-mobile-group-label">Platform</div>
                <div className="nav-mobile-group-grid">
                  <div className="nav-mobile-item-wrap">
                    <button
                      type="button"
                      className={`nav-mobile-item nav-mobile-item--platform${platformModalOpen ? ' active' : ''}`}
                      onClick={() => {
                        closeMobileNavigation()
                        handlePlatformModalOpen()
                      }}
                    >
                      <span className="nav-mobile-item-text">
                        <span className="nav-mobile-item-heading">
                          <span className="nav-mobile-item-label">Platform Stack</span>
                          <Tag type="warm-gray" size="sm" className="nav-mobile-item-maturity">beta</Tag>
                        </span>
                        <span className="nav-mobile-item-desc">Open the unified platform control panel for node, AVB, MIDI cluster, API, and fleet operations.</span>
                      </span>
                    </button>
                  </div>
                </div>
              </section>
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

      {/* Platform modal overlay — anchored below the nav bar */}
      {platformModalOpen && (
        <div className="platform-modal-overlay" role="dialog" aria-modal="true" aria-label="Platform control panel">
          <PlatformModalContent
            initialLayer={initialLayer}
            initialPanel={initialPanel}
            onNavigate={handlePlatformNavigate}
            onClose={handlePlatformModalClose}
          />
        </div>
      )}

      <PasswordDialog
        isOpen={showPasswordDialog}
        onClose={() => setShowPasswordDialog(false)}
        onSuccess={handlePasswordSuccess}
      />
      <SpecialSettingsDialog
        isOpen={showSpecialSettings}
        onClose={() => setShowSpecialSettings(false)}
        onSave={handleSpecialSettingsSave}
      />
      <main className={isFullBleedRoute ? 'app-content app-content--full' : 'app-content'}>{children}</main>
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
    </div>
  )
}
