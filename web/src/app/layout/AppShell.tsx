import type { ComponentType, CSSProperties, ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useState, useRef, useEffect, useMemo } from 'react'
import { List, X, CaretRight, PushPin } from '@phosphor-icons/react'
import { useSpecialSettings } from '../hooks/useSpecialSettings'
import { useHardwareMenuLocations } from '../hooks/useDeviceLocation'
import { PasswordDialog } from '../components/PasswordDialog'
import { SpecialSettingsDialog } from '../components/SpecialSettingsDialog'
import { MPX1MegaMenu } from '../components/MPX1/MPX1MegaMenu'
import { formatMpx1ProgramName } from '../components/MPX1/programNumber'
import { mpx1Api, useMPX1State } from '../../map2/mpx1Api'
import { NodeSelector } from '../components/shared/NodeSelector'
import {
  defaultPinnedRoutes,
  allRouteNavigationItems,
  hardwareInterfaceMenuItems,
  homeNavigationItem,
  homeNavigationSections,
  MAX_PINNED_NAV_ITEMS,
  normalizePinnedRoutes,
  pinnableNavigationItems,
  type AdvancedMenuItem,
  type HardwareInterfaceMenuItem,
  type NavigationMaturityState,
  type ShellNavigationItem,
} from '../data/advancedMenuItems'
import { useWebSocketConnection } from '../../map2/hooks/useWebSocket'
import { isBlockedAdvancedMenuItem } from './advancedMenuState'

const DragonIcon = ({ size = 16, color = '#dc2626' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 2C10.5 2 9 3 8.5 4.5C8 6 8.5 7.5 9.5 8.5L7 11C6 10.5 4.5 10.5 3.5 11.5C2.5 12.5 2.5 14 3 15L2 16L3 17L4 16C5 16.5 6.5 16.5 7.5 15.5L10 18C9 19 9 20.5 9.5 21.5C10 22.5 11.5 23 13 22.5C14.5 22 15.5 20.5 15.5 19L18.5 16C19.5 17 21 17 22 16C22 14.5 21.5 13 20 12.5L21 10L19.5 9.5L18.5 11C17.5 10.5 16 11 15 12L12.5 9.5C13.5 8.5 14 7 13.5 5.5C13 4 11.5 3 10 3"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill={color}
      fillOpacity="0.2"
    />
    <circle cx="10" cy="5" r="1" fill={color} />
  </svg>
)

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

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { status: websocketStatus } = useWebSocketConnection()
  const [navOpen, setNavOpen] = useState(false)
  const navMenuRef = useRef<HTMLDivElement>(null)
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
  const isFullBleedRoute = location.pathname === '/avb-routing' || location.pathname.startsWith('/avb-routing/')
  const { locationsByRoute: hardwareLocationNotes } = useHardwareMenuLocations(allRouteNavigationItems)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (navMenuRef.current && !navMenuRef.current.contains(event.target as Node)) {
        setNavOpen(false)
      }
      if (mpx1MenuRef.current && !mpx1MenuRef.current.contains(event.target as Node)) {
        setMpx1MenuOpen(false)
      }
      if (topHardwareMenuRef.current && !topHardwareMenuRef.current.contains(event.target as Node)) {
        setTopHardwareSubmenuOpen(false)
      }
    }

    if (navOpen || mpx1MenuOpen || topHardwareSubmenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [navOpen, mpx1MenuOpen, topHardwareSubmenuOpen])

  useEffect(() => {
    setMpx1MenuOpen(false)
    setTopHardwareSubmenuOpen(false)
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
    setMpx1MenuOpen(false)
    setTopHardwareSubmenuOpen(false)
  }

  const closeMobileNavigation = () => {
    setNavOpen(false)
    setMpx1MenuOpen(false)
    setTopHardwareSubmenuOpen(false)
  }

  const handleDragonIconClick = () => {
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
        <PushPin size={11} weight={checked ? 'fill' : 'regular'} aria-hidden />
      </button>
    )
  }

  const renderNavItem = (item: TopNavItem) => {
    const Icon = item.icon
    return (
      <NavLink
        key={item.to}
        to={item.to}
        className={({ isActive }) => `nav-tab-item${item.iconOnly ? ' nav-tab-item--icon-only' : ''}${isActive ? ' nav-tab-item--active' : ''}`}
        aria-label={item.label}
        title={`${item.description} • ${item.maturity}`}
        style={{ '--tab-color': item.color } as CSSProperties}
        onClick={() => {
          setMpx1MenuOpen(false)
          setTopHardwareSubmenuOpen(false)
        }}
      >
        <span className="nav-tab-icon">
          <Icon size={16} weight="duotone" aria-hidden />
        </span>
        {!item.iconOnly && <span className="nav-tab-label">{item.label}</span>}
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
            <Icon size={16} weight="duotone" aria-hidden />
          </span>
          <span className="nav-tab-label">{item.label}</span>
          <CaretRight size={12} weight="bold" className={`nav-tab-advanced-caret${mpx1MenuOpen ? ' is-open' : ''}`} />
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
    const isHardwareRouteActive = hardwareInterfaceMenuItems.some((hardwareItem) =>
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
            <Icon size={16} weight="duotone" aria-hidden />
          </span>
          <span className="nav-tab-label">{item.label}</span>
          <CaretRight size={12} weight="bold" className={`nav-tab-advanced-caret${topHardwareSubmenuOpen ? ' is-open' : ''}`} />
        </button>

        {topHardwareSubmenuOpen && (
          <div id="top-hardware-menu" className="top-hardware-menu-panel" role="menu" aria-label="Audio interfaces">
            {hardwareInterfaceMenuItems.map((hardwareItem) => (
              <NavLink
                key={`top-hardware-${hardwareItem.label}-${hardwareItem.to}`}
                to={hardwareItem.to}
                className="top-hardware-menu-link"
                style={{ '--item-color': hardwareItem.color } as CSSProperties}
                onClick={() => setTopHardwareSubmenuOpen(false)}
              >
                <hardwareItem.icon size={16} weight="duotone" aria-hidden />
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span>{hardwareItem.label}</span>
                  {hardwareLocationNotes[hardwareItem.to] ? (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      On {hardwareLocationNotes[hardwareItem.to]?.hostname}
                    </span>
                  ) : null}
                </span>
              </NavLink>
            ))}
          </div>
        )}
      </div>
    )
  }

  const renderMobileMenuItem = (item: MobileMenuItem, keyPrefix: string) => {
    const Icon = item.icon
    const isBlocked = 'includeInAdvancedMenu' in item ? isBlockedAdvancedMenuItem(item as AdvancedMenuItem) : false
    const hardwareLocation = hardwareLocationNotes[item.to]
    const itemBody = (
      <>
        <Icon size={18} weight="duotone" aria-hidden />
        <div className="nav-mobile-item-text">
          <div className="nav-mobile-item-heading">
            <span className="nav-mobile-item-label">{item.label}</span>
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

  return (
    <div className={`app-shell${showMobileConnectionBanner ? ' has-mobile-connection-banner' : ''}`}>
      {showMobileConnectionBanner && (
        <div className="mobile-connection-banner" role="status" aria-live="polite">
          <span className="mobile-connection-banner-dot" aria-hidden />
          <span>Connection lost - reconnecting...</span>
        </div>
      )}
      <header className="topbar-pro">
        <nav className="nav-tabs-left" aria-label="Primary navigation">
          {renderNavItem(homeTopNavItem)}
        </nav>

        <nav className="nav-tabs-center" aria-label="Pinned navigation">
          {pinnedTopNavItems.map((item) => {
            if (item.kind === 'mpx1-mega-menu') {
              return renderMpx1MegaMenuTrigger(item)
            }
            if (item.kind === 'hardware-submenu') {
              return renderHardwareSubmenuTrigger(item)
            }
            return renderNavItem(item)
          })}
        </nav>

        <div className="nav-tabs-right-container">
          <nav className="nav-tabs-right" aria-label="Settings navigation">
            <NodeSelector />
            <button
              type="button"
              className="nav-tab-item nav-tab-special"
              disabled={specialSettingsLoading}
              aria-label="Open special settings"
              onClick={handleDragonIconClick}
              onMouseEnter={(e) => {
                if (!specialSettingsLoading) {
                  e.currentTarget.style.borderColor = 'rgba(220, 38, 38, 0.45)'
                }
              }}
              onMouseLeave={(e) => {
                if (!specialSettingsLoading) {
                  e.currentTarget.style.borderColor = 'transparent'
                }
              }}
              title="Open Special settings (password required)"
            >
              <DragonIcon size={14} color={specialSettings?.enabled ? '#dc2626' : '#6b7280'} />
            </button>
          </nav>

          <button
            className="nav-hamburger-btn"
            onClick={handleMenuToggle}
            aria-label="Toggle navigation menu"
            title="Toggle menu"
          >
            {navOpen ? <X size={20} weight="bold" /> : <List size={20} weight="bold" />}
          </button>
        </div>

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
      </header>
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
            <HomeIcon size={16} weight="duotone" aria-hidden />
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
                <Icon size={16} weight="duotone" aria-hidden />
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
            {navOpen ? <X size={16} weight="duotone" aria-hidden /> : <List size={16} weight="duotone" aria-hidden />}
          </span>
          <span>Menu</span>
        </button>
      </nav>
    </div>
  )
}
