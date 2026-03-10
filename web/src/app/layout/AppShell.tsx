import type { ComponentType, CSSProperties, Dispatch, ReactNode, SetStateAction } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useState, useRef, useEffect, useMemo } from 'react'
import { Sparkle, Info, List, X, Fire, CaretRight, PushPin } from '@phosphor-icons/react'
import { useSpecialSettings } from '../hooks/useSpecialSettings'
import { PasswordDialog } from '../components/PasswordDialog'
import { SpecialSettingsDialog } from '../components/SpecialSettingsDialog'
import { MPX1MegaMenu } from '../components/MPX1/MPX1MegaMenu'
import { formatMpx1ProgramName } from '../components/MPX1/programNumber'
import { mpx1Api, useMPX1State } from '../../map2/mpx1Api'
import {
  ADVANCED_NAVIGATION_ALLOWED_STATES,
  advancedMenuItems,
  defaultPromotedAdvancedRoutes,
  hardwareInterfaceMenuItems,
  navigationMaturityMeta,
  primaryOperatorMenuItems,
  secondaryInfoMenuItems,
  type AdvancedMenuItem,
  type NavigationMaturityState,
  type ShellNavigationItem,
} from '../data/advancedMenuItems'
import { useWebSocketConnection } from '../../map2/hooks/useWebSocket'
import { isBlockedAdvancedMenuItem, isHardwareInterfacesPopup } from './advancedMenuState'

const enableLegacy = import.meta.env.VITE_ENABLE_LEGACY === 'true'

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
  kind?: 'link' | 'mpx1-mega-menu' | 'hardware-submenu'
}

interface AdvancedMenuSection {
  group: string
  items: AdvancedMenuItem[]
}

function toTopNavItem(item: ShellNavigationItem): TopNavItem {
  return {
    to: item.to,
    label: item.label,
    shortLabel: item.shortLabel,
    icon: item.icon,
    description: item.description,
    color: item.color,
    maturity: item.maturity,
    gatedReason: item.gatedReason,
    kind:
      item.popupMenu === 'hardware-interfaces'
        ? 'hardware-submenu'
        : item.to === '/mpx1'
          ? 'mpx1-mega-menu'
          : 'link',
  }
}

const legacyNavItems: TopNavItem[] = enableLegacy
  ? [{
      to: '/legacy',
      label: 'Legacy',
      shortLabel: 'Legacy',
      icon: Sparkle,
      description: 'Classic interface',
      color: '#60a5fa',
      maturity: 'experimental',
      kind: 'link',
    }]
  : []

const navItemsRight: TopNavItem[] = [
  ...secondaryInfoMenuItems.map(toTopNavItem),
  {
    to: '/about',
    label: 'About',
    shortLabel: 'About',
    icon: Info,
    description: 'System info',
    color: '#9ca3af',
    maturity: 'production',
    kind: 'link',
  },
]

function groupAdvancedMenuItems(items: AdvancedMenuItem[]): AdvancedMenuSection[] {
  const sections: AdvancedMenuSection[] = []

  for (const item of items) {
    const group = item.group ?? 'Other'
    const existingSection = sections.find(section => section.group === group)
    if (existingSection) {
      existingSection.items.push(item)
      continue
    }
    sections.push({ group, items: [item] })
  }

  return sections
}

const advancedMenuSections = groupAdvancedMenuItems(advancedMenuItems)

function maturityClassName(maturity: NavigationMaturityState): string {
  return maturity.replace(/[^a-z0-9]+/gi, '-')
}

function renderMaturityBadge(maturity: NavigationMaturityState) {
  const meta = navigationMaturityMeta[maturity]

  return (
    <span
      className={`nav-maturity-badge nav-maturity-badge--${maturityClassName(maturity)}`}
      title={meta.description}
    >
      {meta.label}
    </span>
  )
}

function isRouteMatch(pathname: string, to: string): boolean {
  return pathname === to || (to !== '/' && pathname.startsWith(to + '/'))
}

function normalizePromotedRoutes(routes: string[] | null | undefined): string[] {
  if (!routes || routes.length === 0) {
    return []
  }

  const normalized: string[] = []
  const seen = new Set<string>()

  for (const rawRoute of routes) {
    const route = typeof rawRoute === 'string' ? rawRoute.trim() : ''
    if (!route || !route.startsWith('/') || seen.has(route)) {
      continue
    }
    seen.add(route)
    normalized.push(route)
  }

  return normalized
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
  const [advancedMenuOpen, setAdvancedMenuOpen] = useState(false)
  const [hardwareInterfacesOpen, setHardwareInterfacesOpen] = useState(false)
  const [mobileHardwareInterfacesOpen, setMobileHardwareInterfacesOpen] = useState(false)
  const [mpx1MenuOpen, setMpx1MenuOpen] = useState(false)
  const [topHardwareSubmenuOpen, setTopHardwareSubmenuOpen] = useState(false)
  const advancedMenuRef = useRef<HTMLDivElement>(null)
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

  const promotedRoutes = useMemo(
    () => normalizePromotedRoutes(specialSettings?.promotedAdvancedRoutes ?? defaultPromotedAdvancedRoutes),
    [specialSettings?.promotedAdvancedRoutes],
  )

  const promotedRouteSet = useMemo(() => new Set(promotedRoutes), [promotedRoutes])

  const promotedTopNavItems = useMemo<TopNavItem[]>(() => {
    return advancedMenuItems
      .filter(item =>
        item.promotable !== false &&
        promotedRouteSet.has(item.promotionKey) &&
        !ADVANCED_NAVIGATION_ALLOWED_STATES.includes(item.maturity)
      )
      .map(toTopNavItem)
  }, [promotedRouteSet])

  const primaryTopNavItems = useMemo(() => primaryOperatorMenuItems.map(toTopNavItem), [])

  const leftNavItems = useMemo(
    () => [...primaryTopNavItems, ...promotedTopNavItems, ...legacyNavItems],
    [primaryTopNavItems, promotedTopNavItems]
  )
  const rightNavItems = navItemsRight

  const activeNav = useMemo(() => {
    const advancedNavItems = [
      ...advancedMenuItems.filter(item => !item.popupMenu),
      ...hardwareInterfaceMenuItems,
    ]

    const underTheHoodMatch = advancedNavItems.find(item => isRouteMatch(location.pathname, item.to))
    if (underTheHoodMatch) {
      return { type: 'under-the-hood' as const, item: underTheHoodMatch }
    }

    const allMainItems = [...leftNavItems, ...rightNavItems]
    const mainMatch = allMainItems.find(item => isRouteMatch(location.pathname, item.to))
    if (mainMatch) {
      return { type: 'main' as const, item: mainMatch }
    }

    return { type: 'main' as const, item: primaryTopNavItems[0] ?? rightNavItems[0] ?? legacyNavItems[0] }
  }, [location.pathname, leftNavItems, primaryTopNavItems, rightNavItems])

  const showAdvancedMenu = specialSettings?.enabled && specialSettings?.menuLocation !== 'hidden'
  const showInTopNav = specialSettings?.menuLocation === 'top-nav'
  const showMobileConnectionBanner = websocketStatus === 'reconnecting' || websocketStatus === 'error'

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (navMenuRef.current && !navMenuRef.current.contains(event.target as Node)) {
        setNavOpen(false)
        setMobileHardwareInterfacesOpen(false)
      }
      if (advancedMenuRef.current && !advancedMenuRef.current.contains(event.target as Node)) {
        setAdvancedMenuOpen(false)
        setHardwareInterfacesOpen(false)
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
  }, [navOpen, advancedMenuOpen, mpx1MenuOpen, topHardwareSubmenuOpen])

  useEffect(() => {
    setMpx1MenuOpen(false)
    setTopHardwareSubmenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!promotedRouteSet.has('/mpx1')) {
      setMpx1MenuOpen(false)
    }
    if (!promotedRouteSet.has('/hardware-interfaces')) {
      setTopHardwareSubmenuOpen(false)
    }
  }, [promotedRouteSet])

  const isFullBleedRoute = location.pathname === '/avb-routing' || location.pathname.startsWith('/avb-routing/')

  const handleMenuToggle = () => {
    const nextOpen = !navOpen
    setNavOpen(nextOpen)
    setMpx1MenuOpen(false)
    setTopHardwareSubmenuOpen(false)
    if (!nextOpen) {
      setMobileHardwareInterfacesOpen(false)
    }
  }

  const closeMobileNavigation = () => {
    setNavOpen(false)
    setMobileHardwareInterfacesOpen(false)
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
    const nextPromotedRoutes = normalizePromotedRoutes(specialSettings?.promotedAdvancedRoutes ?? defaultPromotedAdvancedRoutes)
    const nextEnabled = specialSettings?.enabled ?? false

    try {
      if (!nextEnabled) {
        await updateSpecialSettings({
          enabled: true,
          hiddenPlugins: nextHiddenPlugins,
          menuLocation: nextMenuLocation,
          promotedAdvancedRoutes: nextPromotedRoutes,
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

  const togglePromotedRoute = async (item: AdvancedMenuItem, checked: boolean) => {
    if (item.promotable === false) {
      return
    }

    const currentRoutes = normalizePromotedRoutes(specialSettings?.promotedAdvancedRoutes ?? defaultPromotedAdvancedRoutes)
    const nextRoutes = checked
      ? Array.from(new Set([...currentRoutes, item.promotionKey]))
      : currentRoutes.filter(route => route !== item.promotionKey)

    await updateSpecialSettings({ promotedAdvancedRoutes: nextRoutes })
  }

  const renderPromotionToggle = (item: AdvancedMenuItem) => {
    const promotable = item.promotable !== false
    if (!promotable) {
      return null
    }

    const checked = promotable && promotedRouteSet.has(item.promotionKey)
    const disabled = specialSettingsLoading || !promotable

    return (
      <button
        type="button"
        className={`nav-advanced-promote-toggle${checked ? ' is-pinned' : ''}${disabled ? ' is-disabled' : ''}`}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          if (!disabled) {
            void togglePromotedRoute(item, !checked)
          }
        }}
        title={
          !promotable
            ? 'This entry cannot be pinned to the nav bar'
            : checked
              ? 'Unpin from navigation bar'
              : 'Pin to navigation bar'
        }
        disabled={disabled}
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
        className="nav-tab-item"
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
        <span className="nav-tab-label">{item.label}</span>
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
              setAdvancedMenuOpen(false)
              setHardwareInterfacesOpen(false)
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
              setAdvancedMenuOpen(false)
              setHardwareInterfacesOpen(false)
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
                <span>{hardwareItem.label}</span>
              </NavLink>
            ))}
          </div>
        )}
      </div>
    )
  }

  const renderAdvancedMenuGroups = ({
    keyPrefix,
    hardwareOpen,
    setHardwareOpen,
    onNavigate,
  }: {
    keyPrefix: string
    hardwareOpen: boolean
    setHardwareOpen: Dispatch<SetStateAction<boolean>>
    onNavigate: () => void
  }) => (
    <>
      {showAdvancedMenu && advancedMenuSections.map((section) => (
        <section key={`${keyPrefix}-${section.group}`} className="nav-mobile-advanced-group">
          <div className="nav-mobile-group-label">{section.group}</div>
          <div className="nav-mobile-group-grid">
            {section.items.map((item) => {
              const Icon = item.icon
              const isHardwareSubmenu = isHardwareInterfacesPopup(item)
              const isBlocked = isBlockedAdvancedMenuItem(item)
              const gatedReason = item.gatedReason
              const itemBody = (
                <>
                  <Icon size={18} weight="duotone" aria-hidden />
                  <div className="nav-mobile-item-text">
                    <div className="nav-mobile-item-heading">
                      <span className="nav-mobile-item-label">{item.label}</span>
                      {renderMaturityBadge(item.maturity)}
                    </div>
                    <span className="nav-mobile-item-desc">{item.description}</span>
                    {gatedReason && <span className="nav-mobile-item-note">{gatedReason}</span>}
                  </div>
                </>
              )

              if (isHardwareSubmenu) {
                const isHardwareRouteActive = hardwareInterfaceMenuItems.some((hardwareItem) =>
                  isRouteMatch(location.pathname, hardwareItem.to)
                )

                return (
                  <div key={`${keyPrefix}-${section.group}-${item.to}`} className="nav-mobile-submenu-wrap">
                    <button
                      type="button"
                      className={`nav-mobile-item nav-mobile-item--submenu${hardwareOpen || isHardwareRouteActive ? ' active' : ''}`}
                      style={{ '--item-color': item.color } as CSSProperties}
                      title={`${item.description} • ${item.maturity}`}
                      onClick={() => setHardwareOpen((current) => !current)}
                      aria-expanded={hardwareOpen}
                      aria-controls={`${keyPrefix}-hardware-submenu`}
                    >
                      {itemBody}
                      <CaretRight size={14} weight="bold" className={`nav-mobile-item-caret${hardwareOpen ? ' is-open' : ''}`} />
                    </button>

                    {hardwareOpen && (
                      <div id={`${keyPrefix}-hardware-submenu`} className="nav-mobile-submenu-grid">
                        {hardwareInterfaceMenuItems.map((hardwareItem) => {
                          const HardwareIcon = hardwareItem.icon

                          return (
                            <NavLink
                              key={`${keyPrefix}-hardware-${hardwareItem.label}-${hardwareItem.to}`}
                              to={hardwareItem.to}
                              className={({ isActive }) => `nav-mobile-item nav-mobile-item--child${isActive ? ' active' : ''}`}
                              style={{ '--item-color': hardwareItem.color } as CSSProperties}
                              title={`${hardwareItem.description} • ${hardwareItem.maturity}`}
                              onClick={() => {
                                setHardwareOpen(false)
                                onNavigate()
                              }}
                            >
                              <HardwareIcon size={18} weight="duotone" aria-hidden />
                              <div className="nav-mobile-item-text">
                                <div className="nav-mobile-item-heading">
                                  <span className="nav-mobile-item-label">{hardwareItem.label}</span>
                                  {renderMaturityBadge(hardwareItem.maturity)}
                                </div>
                                <span className="nav-mobile-item-desc">{hardwareItem.description}</span>
                                {hardwareItem.gatedReason && <span className="nav-mobile-item-note">{hardwareItem.gatedReason}</span>}
                              </div>
                            </NavLink>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              }

              if (isBlocked) {
                return (
                  <div key={`${keyPrefix}-${section.group}-${item.to}`} className="nav-mobile-item-wrap">
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
                <div key={`${keyPrefix}-${section.group}-${item.to}`} className="nav-mobile-item-wrap">
                  <NavLink
                    to={item.to}
                    className={({ isActive }) => `nav-mobile-item${isActive ? ' active' : ''}`}
                    style={{ '--item-color': item.color } as CSSProperties}
                    title={`${item.description} • ${item.maturity}`}
                    onClick={() => {
                      setHardwareOpen(false)
                      onNavigate()
                    }}
                  >
                    {itemBody}
                  </NavLink>
                  {renderPromotionToggle(item)}
                </div>
              )
            })}
          </div>
        </section>
      ))}

      {!showAdvancedMenu && (
        <div className="nav-mobile-disabled-note">
          Advanced features not enabled.
          <br />
          Enable via dragon icon.
        </div>
      )}
    </>
  )

  return (
    <div className={`app-shell${showMobileConnectionBanner ? ' has-mobile-connection-banner' : ''}`}>
      {showMobileConnectionBanner && (
        <div className="mobile-connection-banner" role="status" aria-live="polite">
          <span className="mobile-connection-banner-dot" aria-hidden />
          <span>Connection lost - reconnecting...</span>
        </div>
      )}
      <header className="topbar-pro">
        <nav className="nav-tabs-left" aria-label="Main navigation">
          {leftNavItems.map((item) => {
            if (item.kind === 'mpx1-mega-menu') {
              return renderMpx1MegaMenuTrigger(item)
            }
            if (item.kind === 'hardware-submenu') {
              return renderHardwareSubmenuTrigger(item)
            }
            return renderNavItem(item)
          })}
        </nav>

        <div
          className="nav-active-title"
          style={{ '--active-color': activeNav.item.color } as CSSProperties}
        >
          <activeNav.item.icon size={14} weight="duotone" className="nav-active-icon" aria-hidden />
          <div className="nav-active-copy">
            <span className="nav-active-text">{activeNav.item.label}</span>
            {renderMaturityBadge(activeNav.item.maturity)}
          </div>
        </div>

        <div className="nav-tabs-right-container">
          <nav className="nav-tabs-right" aria-label="Settings navigation">
            {rightNavItems.map(renderNavItem)}
            {showAdvancedMenu && showInTopNav && (
              <div className="advanced-menu-root" ref={advancedMenuRef}>
                <button
                  type="button"
                  className={`nav-tab-item nav-tab-advanced${advancedMenuOpen ? ' nav-tab-advanced--open' : ''}`}
                  onClick={() => {
                    const nextOpen = !advancedMenuOpen
                    setAdvancedMenuOpen(nextOpen)
                    setMpx1MenuOpen(false)
                    setTopHardwareSubmenuOpen(false)
                    if (!nextOpen) {
                      setHardwareInterfacesOpen(false)
                    }
                  }}
                  title="Beta, experimental, and hardware-gated surfaces"
                  aria-haspopup="menu"
                  aria-expanded={advancedMenuOpen}
                  aria-controls="advanced-nav-menu"
                >
                  <Fire size={16} weight="duotone" className="nav-tab-advanced-flame" />
                  <span className="nav-tab-advanced-label">Advanced</span>
                  <CaretRight size={12} weight="bold" className={`nav-tab-advanced-caret${advancedMenuOpen ? ' is-open' : ''}`} />
                </button>

                {advancedMenuOpen && (
                  <div id="advanced-nav-menu" className="advanced-menu-panel" role="menu">
                    <div className="advanced-menu-header">
                      <div className="advanced-menu-header-main">
                        <p className="advanced-menu-kicker">Deprioritized surfaces</p>
                        <p className="advanced-menu-title">Beta, experimental, and hardware-gated</p>
                      </div>
                      <p className="advanced-menu-subtitle">
                        Primary navigation is reserved for operator-safe workflows. Everything here is intentionally non-default.
                      </p>
                    </div>

                    <div className="nav-mobile-menu-content nav-mobile-menu-content--desktop">
                      {renderAdvancedMenuGroups({
                        keyPrefix: 'desktop-advanced',
                        hardwareOpen: hardwareInterfacesOpen,
                        setHardwareOpen: setHardwareInterfacesOpen,
                        onNavigate: () => setAdvancedMenuOpen(false),
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

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
              {renderAdvancedMenuGroups({
                keyPrefix: 'mobile-nav',
                hardwareOpen: mobileHardwareInterfacesOpen,
                setHardwareOpen: setMobileHardwareInterfacesOpen,
                onNavigate: () => setNavOpen(false),
              })}
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
        {primaryTopNavItems.map((item) => {
          const Icon = item.icon

          return (
            <NavLink
              key={`mobile-primary-${item.to}`}
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
