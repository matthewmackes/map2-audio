import type { ComponentType, CSSProperties, ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { ChevronRight } from '@carbon/icons-react'
import { Layer, Tag } from '@carbon/react'

import { useSpecialSettings } from '../hooks/useSpecialSettings'
import { useHardwareMenuLocations } from '../hooks/useDeviceLocation'
import { MPX1MegaMenu } from '../components/MPX1/MPX1MegaMenu'
import { NodeNavBar } from '../components/NodeNav/NodeNavBar'
import { PageTransition } from '../components/PageTransition'
import { Map2BrandMark } from '../components/branding/map2Branding'
import { LatencyPressureShellReadout } from '../components/LatencyPressureShellReadout'
import { TaskbarClock } from '../components/TaskbarClock'
import { formatMpx1ProgramName } from '../components/MPX1/programNumber'
import { mpx1Api, useMPX1State } from '../../map2/mpx1Api'
import {
  allPinnableNavigationItems,
  allRouteNavigationItems,
  defaultPinnedRoutes,
  findPinnableNavigationItem,
  hardwareInterfaceMenuItems,
  MAX_PINNED_NAV_ITEMS,
  normalizePinnedRoutes,
  type HardwareInterfaceMenuItem,
  type NavigationMaturityState,
  type ShellNavigationItem,
} from '../data/advancedMenuItems'
import type { PlatformPinnedNavItem } from '../data/platformMenuItems'
import { useWebSocketConnection } from '../../map2/hooks/useWebSocket'
import { useTabletTouchRouteLayout } from '../hooks/useTabletTouchRouteLayout'
import { prefetchAppRoute } from '../routePrefetch'
import { buildPlatformWorkspacePath } from '../platform/routes'
import './AppShell.css'

interface TopNavItem {
  to: string
  label: string
  shortLabel?: string
  icon: ComponentType<Record<string, unknown>>
  description: string
  color: string
  maturity: NavigationMaturityState
  kind: 'link' | 'mpx1-mega-menu' | 'hardware-submenu'
}

type PinnedMenuItem = ShellNavigationItem | HardwareInterfaceMenuItem | PlatformPinnedNavItem

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

function formatShellRouteHint(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) {
    return 'landing'
  }

  return segments.join(' / ')
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
    kind: item.kind,
  }
}

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { isTabletTouchRoute } = useTabletTouchRouteLayout(location.pathname)
  const { status: websocketStatus } = useWebSocketConnection()
  const [navOpen, setNavOpen] = useState(false)
  const [mpx1MenuOpen, setMpx1MenuOpen] = useState(false)
  const [topHardwareSubmenuOpen, setTopHardwareSubmenuOpen] = useState(false)
  const navMenuRef = useRef<HTMLDivElement>(null)
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

  const { settings: specialSettings } = useSpecialSettings()

  const requestedPinnedRoutes = useMemo(
    () => normalizePinnedRoutes(specialSettings?.pinnedRoutes ?? defaultPinnedRoutes),
    [specialSettings?.pinnedRoutes],
  )

  const pinnedRouteKeys = useMemo(
    () => requestedPinnedRoutes
      .filter((route) => route !== '/')
      .map((route) => findPinnableNavigationItem(route))
      .filter((item): item is PinnedMenuItem => Boolean(item))
      .slice(0, MAX_PINNED_NAV_ITEMS)
      .map((item) => item.to),
    [requestedPinnedRoutes],
  )

  const pinnedRouteSet = useMemo(() => new Set(pinnedRouteKeys), [pinnedRouteKeys])

  const pinnedTopNavItems = useMemo<TopNavItem[]>(
    () => pinnedRouteKeys
      .map((route) => findPinnableNavigationItem(route))
      .filter((item): item is PinnedMenuItem => Boolean(item))
      .map(toTopNavItem),
    [pinnedRouteKeys],
  )

  const pinnedStartMenuItems = useMemo(
    () => [...pinnedTopNavItems].sort((left, right) => left.label.localeCompare(right.label)),
    [pinnedTopNavItems],
  )
  const startMenuStaticItems = useMemo(() => [
    { key: 'artifacts', label: 'Audio Artifacts', to: '/artifacts' },
    { key: 'platforms', label: 'Platforms', to: buildPlatformWorkspacePath('overview') },
    { key: 'catalog', label: 'Workspace Catalog', to: '/platforms/workspace-catalog' },
    { key: 'settings', label: 'Settings', to: buildPlatformWorkspacePath('theme') },
    { key: 'power', label: 'Power', to: null },
  ], [])
  const shellQuickLaunchItem = useMemo(
    () => pinnedTopNavItems.find((item) => item.kind === 'link' && !isRouteMatch(location.pathname, item.to))
      ?? pinnedTopNavItems.find((item) => item.kind === 'link')
      ?? null,
    [location.pathname, pinnedTopNavItems],
  )

  const hardwareSubmenuItems = useMemo(
    () => hardwareInterfaceMenuItems.filter((hardwareItem) => hardwareItem.showInHardwareSubmenu !== false),
    [],
  )
  const currentShellItem = useMemo(() => {
    const candidates = [...allPinnableNavigationItems, ...allRouteNavigationItems]
      .filter((item, index, items) => items.findIndex((candidate) => candidate.to === item.to) === index)
      .filter((item) => isRouteMatch(location.pathname, item.to))
      .sort((left, right) => right.to.length - left.to.length)

    return candidates[0] ?? null
  }, [location.pathname])
  const shellWorkspaceLabel = currentShellItem?.shortLabel ?? currentShellItem?.label ?? 'Workspace'
  const shellWorkspaceHint = formatShellRouteHint(location.pathname)
  const shellAccentColor = currentShellItem?.color ?? 'var(--cds-link-primary, #0f62fe)'

  const showMobileConnectionBanner = websocketStatus === 'reconnecting' || websocketStatus === 'error'
  const isPlatformWorkspaceRoute = location.pathname.startsWith('/platforms')
  const isIntegratedWorkspaceRoute =
    isPlatformWorkspaceRoute
    || location.pathname.startsWith('/midi-hub')
    || location.pathname.startsWith('/artifacts')
    || location.pathname.startsWith('/audio-artifacts')
  const isAudioGridWorkspaceRoute = location.pathname === '/juce-grid' || location.pathname === '/snapshot-editor'
  const isThemedWorkspaceRoute = isAudioGridWorkspaceRoute || isIntegratedWorkspaceRoute
  const isFullBleedRoute = location.pathname === '/' || isAudioGridWorkspaceRoute || isIntegratedWorkspaceRoute
  const showTaskbarShell = true
  const { locationsByRoute: hardwareLocationNotes } = useHardwareMenuLocations(allRouteNavigationItems)

  const closeShellMenus = () => {
    setNavOpen(false)
    setMpx1MenuOpen(false)
    setTopHardwareSubmenuOpen(false)
  }

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
    closeShellMenus()
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

  const handleMpx1Rescan = async () => {
    try {
      await mpx1Api.getMidiPorts()
      await refreshMpx1State()
    } catch (err) {
      console.error('MPX1 MIDI rescan failed:', err)
    }
  }

  const handleStartMenuStaticAction = (to: string | null) => {
    closeShellMenus()
    if (to) {
      navigate(to)
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

  const renderHardwareSubmenuPanel = () => (
    <Layer id="top-hardware-menu" className="top-hardware-menu-panel" role="menu" aria-label="Audio interfaces">
      {hardwareSubmenuItems.map((hardwareItem) => (
        <NavLink
          key={`top-hardware-${hardwareItem.label}-${hardwareItem.to}`}
          to={hardwareItem.to}
          className="top-hardware-menu-link"
          style={{ '--item-color': hardwareItem.color } as CSSProperties}
          onClick={closeShellMenus}
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
  )

  const renderStartMenuItem = (item: TopNavItem) => {
    const Icon = item.icon
    const isItemActive = item.kind === 'hardware-submenu'
      ? hardwareSubmenuItems.some((hardwareItem) => isRouteMatch(location.pathname, hardwareItem.to))
      : isRouteMatch(location.pathname, item.to)

    if (item.kind === 'mpx1-mega-menu') {
      return (
        <div
          key={`start-mpx1-${item.to}`}
          className="start-menu-card-root start-menu-card-root--submenu"
          ref={mpx1MenuRef}
        >
          <button
            type="button"
            className={`start-menu-card start-menu-card--submenu${isItemActive ? ' is-active' : ''}${mpx1MenuOpen ? ' is-open' : ''}`}
            style={{ '--item-color': item.color } as CSSProperties}
            title={`${item.description} • ${item.maturity}`}
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
            <span className="start-menu-card__icon">
              <Icon size={18} aria-hidden />
            </span>
            <span className="start-menu-card__label">{item.label}</span>
            <ChevronRight size={14} className={`start-menu-card__caret${mpx1MenuOpen ? ' is-open' : ''}`} aria-hidden />
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

    if (item.kind === 'hardware-submenu') {
      return (
        <div
          key={`start-hardware-${item.to}`}
          className="start-menu-card-root start-menu-card-root--submenu"
          ref={topHardwareMenuRef}
        >
          <button
            type="button"
            className={`start-menu-card start-menu-card--submenu${isItemActive ? ' is-active' : ''}${topHardwareSubmenuOpen ? ' is-open' : ''}`}
            style={{ '--item-color': item.color } as CSSProperties}
            title={`${item.description} • ${item.maturity}`}
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
            <span className="start-menu-card__icon">
              <Icon size={18} aria-hidden />
            </span>
            <span className="start-menu-card__label">{item.label}</span>
            <ChevronRight size={14} className={`start-menu-card__caret${topHardwareSubmenuOpen ? ' is-open' : ''}`} aria-hidden />
          </button>

          {topHardwareSubmenuOpen && renderHardwareSubmenuPanel()}
        </div>
      )
    }

    return (
      <NavLink
        key={`start-link-${item.to}`}
        to={item.to}
        className={({ isActive }) => `start-menu-card${isActive ? ' is-active' : ''}`}
        style={{ '--item-color': item.color } as CSSProperties}
        title={`${item.description} • ${item.maturity}`}
        onClick={closeShellMenus}
        onMouseEnter={() => prefetchAppRoute(item.to)}
        onFocus={() => prefetchAppRoute(item.to)}
      >
        <span className="start-menu-card__icon">
          <Icon size={18} aria-hidden />
        </span>
        <span className="start-menu-card__label">{item.label}</span>
      </NavLink>
    )
  }

  return (
    <div className={`app-shell${showMobileConnectionBanner ? ' has-mobile-connection-banner' : ''}${isTabletTouchRoute ? ' app-shell--juce-grid-tablet' : ''}${isAudioGridWorkspaceRoute ? ' app-shell--audio-grid' : ''}${isThemedWorkspaceRoute ? ' app-shell--themed-workspace' : ''}${showTaskbarShell ? ' app-shell--windowed' : ''}${location.pathname === '/' ? ' app-shell--landing' : ''}`}>
      <main className={isFullBleedRoute ? 'app-content app-content--full' : 'app-content'}>
        <PageTransition>{children}</PageTransition>
      </main>

      {showMobileConnectionBanner ? (
        <div className="mobile-connection-banner" role="status" aria-live="polite">
          <span className="mobile-connection-banner-dot" aria-hidden />
          <span>Connection lost - reconnecting...</span>
        </div>
      ) : null}

      {showTaskbarShell ? (
        <div
          className="window-taskbar"
          aria-label="Primary navigation shell"
          style={{ '--window-shell-accent': shellAccentColor } as CSSProperties}
        >
          <div className="window-taskbar__left">
            <div className="window-taskbar__start-root" ref={navMenuRef}>
              <button
                type="button"
                className={`window-taskbar__start-btn${navOpen ? ' is-active' : ''}`}
                onClick={handleMenuToggle}
                aria-label={navOpen ? 'Close Start menu' : 'Open Start menu'}
                aria-haspopup="menu"
                aria-expanded={navOpen}
                aria-controls="start-menu-panel"
              >
                <span className="window-taskbar__start-mark" aria-hidden="true">
                  <Map2BrandMark className="window-taskbar__start-mark-icon" />
                </span>
                <span>Start</span>
              </button>

              {navOpen && (
                <Layer id="start-menu-panel" className="start-menu-panel" role="menu" aria-label="Pinned navigation">
                  <div className="start-menu-panel__shell">
                    <div className="start-menu-panel__static-column" role="group" aria-label="Start Menu shortcuts">
                      {startMenuStaticItems.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          className="start-menu-panel__static-item"
                          onClick={() => handleStartMenuStaticAction(item.to)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                    <div className="start-menu-panel__tiles-column">
                      {pinnedStartMenuItems.length > 0 ? (
                        <div className="start-menu-panel__grid">
                          {pinnedStartMenuItems.map((item) => renderStartMenuItem(item))}
                        </div>
                      ) : (
                        <div className="start-menu-panel__empty" role="note">
                          No pinned routes selected.
                        </div>
                      )}
                    </div>
                  </div>
                </Layer>
              )}
            </div>

            {shellQuickLaunchItem ? (
              <NavLink
                to={shellQuickLaunchItem.to}
                className={({ isActive }) => `window-taskbar__quick-launch${isActive ? ' is-active' : ''}`}
                title={`Quick launch ${shellQuickLaunchItem.label}`}
                aria-label={`Quick launch ${shellQuickLaunchItem.label}`}
                onMouseEnter={() => prefetchAppRoute(shellQuickLaunchItem.to)}
                onFocus={() => prefetchAppRoute(shellQuickLaunchItem.to)}
              >
                <shellQuickLaunchItem.icon size={14} aria-hidden />
                <span>{shellQuickLaunchItem.shortLabel ?? shellQuickLaunchItem.label}</span>
              </NavLink>
            ) : null}
          </div>

          <div className="window-taskbar__workspace" title={`${shellWorkspaceLabel} • ${shellWorkspaceHint}`}>
            <span className="window-taskbar__workspace-kicker">Live</span>
            <span className="window-taskbar__workspace-name">{shellWorkspaceLabel}</span>
            <span className="window-taskbar__workspace-path">{shellWorkspaceHint}</span>
          </div>

          <div className="window-taskbar__right">
            <div className="window-taskbar__status window-taskbar__status--nodes">
              <NodeNavBar />
            </div>
            <div className="window-taskbar__status window-taskbar__status--latency">
              <LatencyPressureShellReadout />
            </div>
            <div className="window-taskbar__status window-taskbar__status--clock">
              <TaskbarClock />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
