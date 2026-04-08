import type { ComponentType, CSSProperties, ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { ChevronRight } from '@carbon/icons-react'
import { Button, ComposedModal, Layer, ModalBody, ModalFooter, ModalHeader, ProgressBar, Tag } from '@carbon/react'

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
  FIXED_START_MENU_TILE_ROUTES,
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
import { systemApi } from '../../map2/clients/platform'
import { useWebSocketConnection } from '../../map2/hooks/useWebSocket'
import { useTabletTouchRouteLayout } from '../hooks/useTabletTouchRouteLayout'
import {
  readHomeDesktopSession,
  reloadHomeDesktopShell,
  returnHomeDesktopToBoot,
  updateHomeDesktopSession,
} from '../pages/homeDesktopSession'
import { prefetchAppRoute } from '../routePrefetch'
import { buildPlatformWorkspacePath } from '../platform/routes'
import map2Logo from '../../assets/MAP2-LOGO.png'
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
type RestartProgressStage = 'idle' | 'stopping' | 'restarting' | 'reconnecting' | 'ready' | 'error'
type TaskbarIndicatorItem = TopNavItem & { route: string; pinned: boolean; active: boolean; running: boolean }

const APP_WINDOW_CLOSE_DURATION_MS = 180
const PERMANENT_TASKBAR_ROUTE = '/artifacts'

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

function findShellRouteItem(route: string): TopNavItem | null {
  const candidate = [...allRouteNavigationItems, ...allPinnableNavigationItems]
    .filter((item, index, items) => items.findIndex((other) => other.to === item.to) === index)
    .filter((item) => isRouteMatch(route, item.to))
    .sort((left, right) => right.to.length - left.to.length)[0]

  return candidate ? toTopNavItem(candidate) : null
}

function findTaskbarItem(route: string): TopNavItem | null {
  return findShellRouteItem(route)
}

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { isTabletTouchRoute } = useTabletTouchRouteLayout(location.pathname)
  const { status: websocketStatus } = useWebSocketConnection()
  const [navOpen, setNavOpen] = useState(false)
  const [mpx1MenuOpen, setMpx1MenuOpen] = useState(false)
  const [topHardwareSubmenuOpen, setTopHardwareSubmenuOpen] = useState(false)
  const [powerMenuOpen, setPowerMenuOpen] = useState(false)
  const [restartConfirmOpen, setRestartConfirmOpen] = useState(false)
  const [restartProgressStage, setRestartProgressStage] = useState<RestartProgressStage>('idle')
  const [restartError, setRestartError] = useState<string | null>(null)
  const [performFullscreen, setPerformFullscreen] = useState(location.pathname === '/perform')
  const navMenuRef = useRef<HTMLDivElement>(null)
  const mpx1MenuRef = useRef<HTMLDivElement>(null)
  const topHardwareMenuRef = useRef<HTMLDivElement>(null)
  const restartSawUnavailableRef = useRef(false)
  const restartSawReconnectRef = useRef(false)
  const restartCompletionRequestedRef = useRef(false)
  const closeWindowTimerRef = useRef<number | null>(null)
  const [closingAppRoute, setClosingAppRoute] = useState<string | null>(null)
  const [runningRoutes, setRunningRoutes] = useState<string[]>(() => (
    readHomeDesktopSession()?.runningRoutes.filter((route) => route !== '/') ?? []
  ))

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

  const fixedStartMenuItems = useMemo(
    () => FIXED_START_MENU_TILE_ROUTES
      .map((route) => findShellRouteItem(route))
      .filter((item): item is TopNavItem => Boolean(item)),
    [],
  )

  const pinnedStartMenuItems = useMemo(
    () => pinnedTopNavItems
      .filter((item) => !FIXED_START_MENU_TILE_ROUTES.includes(item.to as (typeof FIXED_START_MENU_TILE_ROUTES)[number])),
    [pinnedTopNavItems],
  )

  const startMenuTileItems = useMemo(() => {
    const seen = new Set<string>()
    return [...fixedStartMenuItems, ...pinnedStartMenuItems].filter((item) => {
      if (seen.has(item.to)) {
        return false
      }

      seen.add(item.to)
      return true
    })
  }, [fixedStartMenuItems, pinnedStartMenuItems])
  const startMenuStaticItems = useMemo(() => [
    { key: 'artifacts', label: 'Artifacts', to: '/artifacts' },
    { key: 'platforms', label: 'System Setup', to: buildPlatformWorkspacePath('overview') },
    { key: 'catalog', label: 'Program Catalog', to: '/platforms/workspace-catalog' },
    { key: 'settings', label: 'Display Settings', to: buildPlatformWorkspacePath('theme') },
    { key: 'power', label: 'Power', to: null },
  ], [])
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
  const ShellWindowIcon = currentShellItem?.icon ?? Map2BrandMark
  const shellWorkspaceLabel = currentShellItem?.shortLabel ?? currentShellItem?.label ?? 'Workspace'
  const shellAccentColor = currentShellItem?.color ?? 'var(--cds-link-primary, #0f62fe)'
  const shellRouteHint = formatShellRouteHint(location.pathname)
  const isDesktopRoute = location.pathname === '/'
  const taskbarIndicators = useMemo<TaskbarIndicatorItem[]>(() => {
    const routes = new Set<string>([PERMANENT_TASKBAR_ROUTE, ...runningRoutes.filter((route) => route !== '/')])
    if (!isDesktopRoute) {
      routes.add(location.pathname)
    }

    return Array.from(routes)
      .map((route) => {
        const item = findTaskbarItem(route)
        if (!item || item.kind !== 'link') {
          return null
        }

        return {
          ...item,
          route,
          pinned: route === PERMANENT_TASKBAR_ROUTE,
          active: isRouteMatch(location.pathname, route),
          running: runningRoutes.includes(route) || isRouteMatch(location.pathname, route),
        }
      })
      .filter((item): item is TaskbarIndicatorItem => Boolean(item))
      .sort((left, right) => {
        if (left.route === PERMANENT_TASKBAR_ROUTE) return -1
        if (right.route === PERMANENT_TASKBAR_ROUTE) return 1
        if (left.active && !right.active) return -1
        if (!left.active && right.active) return 1
        return left.label.localeCompare(right.label)
      })
  }, [isDesktopRoute, location.pathname, runningRoutes])

  const showMobileConnectionBanner = websocketStatus === 'reconnecting' || websocketStatus === 'error'
  const isPlatformWorkspaceRoute = location.pathname.startsWith('/platforms')
  const isIntegratedWorkspaceRoute =
    isPlatformWorkspaceRoute
    || location.pathname.startsWith('/midi-hub')
    || location.pathname.startsWith('/artifacts')
    || location.pathname.startsWith('/audio-artifacts')
  const isAudioGridWorkspaceRoute = location.pathname === '/juce-grid' || location.pathname === '/snapshot-editor'
  const showPerformFullscreen = location.pathname === '/perform' && performFullscreen
  const isThemedWorkspaceRoute = isAudioGridWorkspaceRoute || isIntegratedWorkspaceRoute
  const isFullBleedRoute = location.pathname === '/' || isAudioGridWorkspaceRoute || isIntegratedWorkspaceRoute || showPerformFullscreen
  const showTaskbarShell = !showPerformFullscreen
  const { locationsByRoute: hardwareLocationNotes } = useHardwareMenuLocations(allRouteNavigationItems)

  const closeShellMenus = () => {
    setNavOpen(false)
    setMpx1MenuOpen(false)
    setTopHardwareSubmenuOpen(false)
    setPowerMenuOpen(false)
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
    setPerformFullscreen(location.pathname === '/perform')
  }, [location.pathname])

  useEffect(() => {
    if (!showPerformFullscreen) {
      return undefined
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPerformFullscreen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [showPerformFullscreen])

  useEffect(() => {
    setRunningRoutes((current) => {
      const sanitized = current.filter((route) => route !== '/')
      if (isDesktopRoute || location.pathname === '/' || sanitized.includes(location.pathname)) {
        return sanitized
      }

      return [...sanitized, location.pathname]
    })

    if (closingAppRoute && closingAppRoute !== location.pathname) {
      setClosingAppRoute(null)
    }
  }, [closingAppRoute, isDesktopRoute, location.pathname])

  useEffect(() => () => {
    if (closeWindowTimerRef.current !== null) {
      window.clearTimeout(closeWindowTimerRef.current)
    }
  }, [])

  useEffect(() => {
    updateHomeDesktopSession({
      runningRoutes: runningRoutes.filter((route) => route !== '/'),
      currentRoute: location.pathname,
    })
  }, [location.pathname, runningRoutes])

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
    setPowerMenuOpen(false)
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

  const handleRefreshPage = () => {
    closeShellMenus()
    reloadHomeDesktopShell()
  }

  const handleLogOut = () => {
    closeShellMenus()
    returnHomeDesktopToBoot()
  }

  const handleCloseCurrentApp = () => {
    if (isDesktopRoute) {
      return
    }

    const routeToClose = location.pathname
    closeShellMenus()
    setClosingAppRoute(routeToClose)
    setRunningRoutes((current) => current.filter((route) => route !== routeToClose))

    if (closeWindowTimerRef.current !== null) {
      window.clearTimeout(closeWindowTimerRef.current)
    }

    closeWindowTimerRef.current = window.setTimeout(() => {
      closeWindowTimerRef.current = null
      setRunningRoutes((current) => current.filter((runningRoute) => runningRoute !== routeToClose))
      navigate('/')
    }, APP_WINDOW_CLOSE_DURATION_MS)
  }

  const handleTaskbarIndicatorClick = (route: string) => {
    closeShellMenus()

    if (isRouteMatch(location.pathname, route) && route !== '/') {
      setClosingAppRoute(route)
      setRunningRoutes((current) => current.filter((runningRoute) => runningRoute !== route))
      if (closeWindowTimerRef.current !== null) {
        window.clearTimeout(closeWindowTimerRef.current)
      }

      closeWindowTimerRef.current = window.setTimeout(() => {
        closeWindowTimerRef.current = null
        setRunningRoutes((current) => current.filter((runningRoute) => runningRoute !== route))
        navigate('/')
      }, APP_WINDOW_CLOSE_DURATION_MS)
      return
    }

    navigate(route)
  }

  const handleConfirmRestartBackend = async () => {
    setRestartConfirmOpen(false)
    closeShellMenus()
    restartSawUnavailableRef.current = false
    restartSawReconnectRef.current = false
    restartCompletionRequestedRef.current = false
    setRestartError(null)

    try {
      await systemApi.restartBackend()
      setRestartProgressStage('stopping')
    } catch (err) {
      setRestartError(err instanceof Error ? err.message : 'Failed to restart backend.')
      setRestartProgressStage('error')
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

  useEffect(() => {
    if (restartProgressStage === 'idle' || restartProgressStage === 'error') {
      return undefined
    }

    if (restartProgressStage === 'stopping') {
      const timerId = window.setTimeout(() => setRestartProgressStage('restarting'), 1100)
      return () => window.clearTimeout(timerId)
    }

    if (restartProgressStage === 'restarting') {
      const timerId = window.setTimeout(() => setRestartProgressStage('reconnecting'), 1200)
      return () => window.clearTimeout(timerId)
    }

    if (restartProgressStage === 'ready' && !restartCompletionRequestedRef.current) {
      restartCompletionRequestedRef.current = true
      const timerId = window.setTimeout(() => {
        returnHomeDesktopToBoot()
      }, 900)
      return () => window.clearTimeout(timerId)
    }

    return undefined
  }, [restartProgressStage])

  useEffect(() => {
    if (!['stopping', 'restarting', 'reconnecting'].includes(restartProgressStage)) {
      return undefined
    }

    let cancelled = false

    const probeHealth = async () => {
      try {
        const response = await fetch('/api/health', { cache: 'no-store' })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        if (!cancelled && restartSawUnavailableRef.current) {
          setRestartProgressStage('ready')
        }
      } catch {
        restartSawUnavailableRef.current = true
      }
    }

    void probeHealth()
    const intervalId = window.setInterval(() => {
      void probeHealth()
    }, 1000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [restartProgressStage])

  useEffect(() => {
    if (!['stopping', 'restarting', 'reconnecting'].includes(restartProgressStage)) {
      return
    }

    if (websocketStatus === 'reconnecting' || websocketStatus === 'error') {
      restartSawReconnectRef.current = true
      setRestartProgressStage('reconnecting')
      return
    }

    if (websocketStatus === 'connected' && restartSawReconnectRef.current) {
      setRestartProgressStage('ready')
    }
  }, [restartProgressStage, websocketStatus])

  const restartProgressSteps = [
    { key: 'stopping', label: 'Stopping engine', description: 'Closing active backend processes and preparing the shell for restart.' },
    { key: 'restarting', label: 'Restarting service', description: 'Waiting for the MAP2 backend service manager to bring the runtime back.' },
    { key: 'reconnecting', label: 'Reconnecting', description: 'Restoring live shell connectivity and validating the desktop session.' },
    { key: 'ready', label: 'Ready', description: 'Backend is reachable again. Returning to the boot splash.' },
  ] as const

  const restartProgressIndex = Math.max(
    0,
    restartProgressSteps.findIndex((step) => step.key === restartProgressStage),
  )
  const restartCurrentStep = restartProgressStage === 'error'
    ? null
    : restartProgressSteps[restartProgressIndex] ?? restartProgressSteps[0]

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
            className={`start-menu-card start-menu-card--tile start-menu-card--submenu${isItemActive ? ' is-active' : ''}${mpx1MenuOpen ? ' is-open' : ''}`}
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
            <span className="start-menu-card__icon start-menu-card__icon--tile">
              <Icon size={18} aria-hidden />
            </span>
            <span className="start-menu-card__label start-menu-card__label--tile">{item.label}</span>
            <ChevronRight size={14} className={`start-menu-card__caret start-menu-card__caret--tile${mpx1MenuOpen ? ' is-open' : ''}`} aria-hidden />
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
            className={`start-menu-card start-menu-card--tile start-menu-card--submenu${isItemActive ? ' is-active' : ''}${topHardwareSubmenuOpen ? ' is-open' : ''}`}
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
            <span className="start-menu-card__icon start-menu-card__icon--tile">
              <Icon size={18} aria-hidden />
            </span>
            <span className="start-menu-card__label start-menu-card__label--tile">{item.label}</span>
            <ChevronRight size={14} className={`start-menu-card__caret start-menu-card__caret--tile${topHardwareSubmenuOpen ? ' is-open' : ''}`} aria-hidden />
          </button>

          {topHardwareSubmenuOpen && renderHardwareSubmenuPanel()}
        </div>
      )
    }

    return (
      <NavLink
        key={`start-link-${item.to}`}
        to={item.to}
        className={({ isActive }) => `start-menu-card start-menu-card--tile${isActive ? ' is-active' : ''}`}
        style={{ '--item-color': item.color } as CSSProperties}
        title={`${item.description} • ${item.maturity}`}
        onClick={closeShellMenus}
        onMouseEnter={() => prefetchAppRoute(item.to)}
        onFocus={() => prefetchAppRoute(item.to)}
      >
        <span className="start-menu-card__icon start-menu-card__icon--tile">
          <Icon size={18} aria-hidden />
        </span>
        <span className="start-menu-card__label start-menu-card__label--tile">{item.label}</span>
      </NavLink>
    )
  }

  return (
    <div className={`app-shell${showMobileConnectionBanner ? ' has-mobile-connection-banner' : ''}${isTabletTouchRoute ? ' app-shell--juce-grid-tablet' : ''}${isAudioGridWorkspaceRoute ? ' app-shell--audio-grid' : ''}${isThemedWorkspaceRoute ? ' app-shell--themed-workspace' : ''}${showTaskbarShell ? ' app-shell--windowed' : ''}${showPerformFullscreen ? ' app-shell--perform-fullscreen' : ''}${location.pathname === '/' ? ' app-shell--landing' : ''}`}>
      <main className={isFullBleedRoute ? 'app-content app-content--full' : 'app-content'}>
        {isDesktopRoute ? (
          <PageTransition>{children}</PageTransition>
        ) : (
          <section
            className={`app-window${closingAppRoute === location.pathname ? ' is-closing' : ' is-open'}`}
            aria-label={`${shellWorkspaceLabel} window`}
            style={{ '--window-shell-accent': shellAccentColor } as CSSProperties}
          >
            {!showPerformFullscreen ? (
              <div className="window-titlebar">
                <div className="window-titlebar__lead">
                  <span className="window-titlebar__badge" aria-hidden="true">
                    <ShellWindowIcon width={16} height={16} className="window-titlebar__icon" />
                  </span>
                  <div className="window-titlebar__copy">
                    <span className="window-titlebar__eyebrow">Program object</span>
                    <div className="window-titlebar__title-row">
                      <strong className="window-titlebar__title">{shellWorkspaceLabel}</strong>
                      <span className="window-titlebar__meta">{shellRouteHint}</span>
                    </div>
                  </div>
                </div>
                <div className="app-window__controls">
                  <button
                    type="button"
                    className="app-window__close"
                    aria-label={`Close ${shellWorkspaceLabel}`}
                    onClick={handleCloseCurrentApp}
                  >
                    X
                  </button>
                </div>
              </div>
            ) : null}
            <div className="app-window__body">
              <PageTransition>{children}</PageTransition>
            </div>
          </section>
        )}
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
          data-running-route-count={runningRoutes.length}
          style={{ '--window-shell-accent': shellAccentColor } as CSSProperties}
        >
          <div className="window-taskbar__left">
            <div className="window-taskbar__start-root" ref={navMenuRef}>
              <button
                type="button"
                className={`window-taskbar__start-btn${navOpen ? ' is-active' : ''}`}
                onClick={handleMenuToggle}
                aria-label={navOpen ? 'Close desktop menu' : 'Open desktop menu'}
                aria-haspopup="menu"
                aria-expanded={navOpen}
                aria-controls="start-menu-panel"
              >
                <span className="window-taskbar__start-mark" aria-hidden="true">
                  <Map2BrandMark className="window-taskbar__start-mark-icon" />
                </span>
                <span>Desktop</span>
              </button>

              {navOpen && (
                <Layer id="start-menu-panel" className="start-menu-panel" role="menu" aria-label="Desktop menu">
                  <div className="start-menu-panel__header">
                    <div className="start-menu-panel__header-copy">
                      <div className="start-menu-panel__brand-wrap">
                        <img src={map2Logo} alt="MAP2 logo" className="start-menu-panel__brand" />
                      </div>
                      <strong>{isDesktopRoute ? 'Desktop Organizer' : 'Workplace Organizer'}</strong>
                      <span>{isDesktopRoute ? 'System objects, routed programs, and operator utilities.' : `Current object: ${shellWorkspaceLabel}.`}</span>
                    </div>
                    <div className="start-menu-panel__header-meta" aria-hidden="true">
                      <span>{startMenuTileItems.length} objects</span>
                      <span>{shellRouteHint}</span>
                    </div>
                  </div>
                  <div className="start-menu-panel__shell">
                    <div className="start-menu-panel__static-column" role="group" aria-label="Desktop menu shortcuts">
                      <div className="start-menu-panel__column-header">
                        <p className="start-menu-panel__eyebrow">System actions</p>
                        <strong>Desktop controls</strong>
                      </div>
                      {startMenuStaticItems.map((item) => (
                        item.key === 'power' ? (
                          <div key={item.key} className="start-menu-panel__static-item-root">
                            <button
                              type="button"
                              className={`start-menu-panel__static-item${powerMenuOpen ? ' is-active' : ''}`}
                              onClick={() => {
                                setPowerMenuOpen((current) => !current)
                                setMpx1MenuOpen(false)
                                setTopHardwareSubmenuOpen(false)
                              }}
                              aria-haspopup="menu"
                              aria-expanded={powerMenuOpen}
                              aria-controls="start-menu-power-menu"
                            >
                              {item.label}
                            </button>
                            {powerMenuOpen ? (
                              <div id="start-menu-power-menu" className="start-menu-power-menu" role="menu" aria-label="Power actions">
                                <button
                                  type="button"
                                  className="start-menu-power-menu__item"
                                  onClick={() => {
                                    setPowerMenuOpen(false)
                                    setRestartConfirmOpen(true)
                                  }}
                                >
                                  Restart Backend
                                </button>
                                <button
                                  type="button"
                                  className="start-menu-power-menu__item"
                                  onClick={handleRefreshPage}
                                >
                                  Refresh Page
                                </button>
                                <button
                                  type="button"
                                  className="start-menu-power-menu__item"
                                  onClick={handleLogOut}
                                >
                                  Log Out
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <button
                            key={item.key}
                            type="button"
                            className="start-menu-panel__static-item"
                            onClick={() => handleStartMenuStaticAction(item.to)}
                          >
                            {item.label}
                          </button>
                        )
                      ))}
                    </div>
                    <div className="start-menu-panel__tiles-column">
                      <div className="start-menu-panel__column-header">
                        <p className="start-menu-panel__eyebrow">Program objects</p>
                        <strong>{startMenuTileItems.length > 0 ? 'Menu launchers' : 'No menu objects'}</strong>
                      </div>
                      {startMenuTileItems.length > 0 ? (
                        <div className="start-menu-panel__grid">
                          {startMenuTileItems.map((item) => renderStartMenuItem(item))}
                        </div>
                      ) : (
                        <div className="start-menu-panel__empty" role="note">
                          <p>Add apps from the Workspace Catalog.</p>
                          <button
                            type="button"
                            className="start-menu-panel__empty-link"
                            onClick={() => handleStartMenuStaticAction('/platforms/workspace-catalog')}
                          >
                            Open Workspace Catalog
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </Layer>
              )}
            </div>

            <div className="window-taskbar__indicators" aria-label="Running applications">
              {taskbarIndicators.map((item) => {
                const Icon = item.icon
                const label = item.pinned
                  ? `${item.label} pinned taskbar app`
                  : item.active
                    ? `Taskbar close ${item.label}`
                    : `Taskbar open ${item.label}`

                return (
                  <button
                    key={item.route}
                    type="button"
                    className={`window-taskbar__indicator${item.running ? ' is-running' : ''}${item.active ? ' is-active' : ''}${item.pinned ? ' is-pinned' : ''}`}
                    aria-label={label}
                    title={item.active ? `${item.label} • click to close` : item.label}
                    onClick={() => handleTaskbarIndicatorClick(item.route)}
                    onMouseEnter={() => prefetchAppRoute(item.route)}
                    onFocus={() => prefetchAppRoute(item.route)}
                  >
                    <span className="window-taskbar__indicator-icon" aria-hidden="true">
                      <Icon size={16} />
                    </span>
                    <span className="window-taskbar__indicator-text">{item.shortLabel ?? item.label}</span>
                  </button>
                )
              })}
            </div>
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

      <ComposedModal className="shell-power-modal" open={restartConfirmOpen} onClose={() => setRestartConfirmOpen(false)} size="sm">
        <ModalHeader title="Restart backend" label="Power" closeModal={() => setRestartConfirmOpen(false)} />
        <ModalBody>
          Restart the MAP2 backend service? Audio processing will pause briefly while the shell reconnects.
        </ModalBody>
        <ModalFooter>
          <Button kind="secondary" onClick={() => setRestartConfirmOpen(false)}>
            Cancel
          </Button>
          <Button kind="primary" onClick={() => void handleConfirmRestartBackend()}>
            Confirm restart
          </Button>
        </ModalFooter>
      </ComposedModal>

      {restartProgressStage !== 'idle' ? (
        <div className="shell-restart-overlay" role="status" aria-live="polite">
          <div className="shell-restart-overlay__panel">
            <div className="shell-restart-overlay__eyebrow">Power</div>
            <h2 className="shell-restart-overlay__title">
              {restartProgressStage === 'error' ? 'Restart failed' : 'Restarting backend'}
            </h2>
            <p className="shell-restart-overlay__subtitle">
              {restartProgressStage === 'error'
                ? (restartError ?? 'The backend restart request did not complete.')
                : restartCurrentStep?.description}
            </p>
            {restartProgressStage === 'error' ? (
              <Button kind="primary" onClick={() => setRestartProgressStage('idle')}>
                Close
              </Button>
            ) : (
              <>
                <ProgressBar
                  className="shell-restart-overlay__progress"
                  label="Restart progress"
                  hideLabel
                  helperText={restartCurrentStep?.label}
                  value={((restartProgressIndex + 1) / restartProgressSteps.length) * 100}
                />
                <div className="shell-restart-overlay__steps" aria-label="Restart progress steps">
                  {restartProgressSteps.map((step, index) => {
                    const isActive = step.key === restartProgressStage
                    const isComplete = index < restartProgressIndex || restartProgressStage === 'ready'
                    return (
                      <div
                        key={step.key}
                        className={`shell-restart-overlay__step${isActive ? ' is-active' : ''}${isComplete ? ' is-complete' : ''}`}
                      >
                        <span className="shell-restart-overlay__step-label">{step.label}</span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
