import { useEffect, useRef, useMemo, useState } from 'react'
import type { ComponentType, SVGProps } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layer, OverflowMenu, OverflowMenuItem } from '@carbon/react'
import { Power } from '@carbon/icons-react'

import {
  MAP2_PLATFORM_NAME,
  MAP2_PLATFORM_VERSION,
  Map2BrandMark,
} from '../components/branding/map2Branding'
import { NodeNavBar } from '../components/NodeNav/NodeNavBar'
import { LatencyPressureShellReadout } from '../components/LatencyPressureShellReadout'
import { TaskbarClock } from '../components/TaskbarClock'
import { PushConfirmationNoticePill } from '../layout/PushConfirmationNoticePill'
import { NavigationItems, type ShellNavigationRenderItem } from '../layout/NavigationItems'
import { useLauncherInterfaceSummary } from '../layout/useLauncherInterfaceSummary'
import { useHomePlatformStatus } from '../hooks/useHomePlatformStatus'
import { useHostMachineInfo } from '../hooks/useHostMachine'
import { usePushConfirmation } from '../hooks/usePushConfirmation'
import { reloadHomeDesktopShell, returnHomeDesktopToBoot } from './homeDesktopSession'
import { launcherCatalogDisplayItems } from '../data/launcherCatalog'
import { allRouteNavigationItems } from '../data/advancedMenuItems'
import { dispatchShellOpenRestartConfirmEvent } from '../layout/shellEvents'

// ── Build start menu tile items (same logic as useAppShellPresentation) ──────

const START_MENU_EXCLUDED_ROUTES = new Set(['/launch-control', '/midi-commander'])

function buildStartMenuTileItems(): ShellNavigationRenderItem[] {
  const launcherItems = launcherCatalogDisplayItems
    .filter((item) => item.route !== '/')
    .filter((item) => !START_MENU_EXCLUDED_ROUTES.has(item.route))
    .map((item) => ({
      route: item.route,
      label:
        item.route === '/platforms/overview'
          ? 'Platforms'
          : item.route === '/artifacts'
            ? 'Files'
            : item.label,
      shortLabel:
        item.route === '/platforms/overview'
          ? 'Platforms'
          : item.route === '/artifacts'
            ? 'Files'
            : item.shortLabel,
      icon: item.icon,
      description: item.description,
      color: item.color,
      maturity: item.maturity,
      featured: item.route === '/tesira' ? false : item.storefrontCollections.includes('featured'),
    }))

  const advancedMidiItem = allRouteNavigationItems.find((item) => item.to === '/midi-hub')
  const nextItems =
    !advancedMidiItem || launcherItems.some((item) => item.route === '/midi-hub')
      ? launcherItems
      : [
          {
            route: '/midi-hub',
            label: 'Advanced MIDI',
            shortLabel: 'Advanced MIDI',
            icon: advancedMidiItem.icon,
            description: advancedMidiItem.description,
            color: advancedMidiItem.color,
            maturity: advancedMidiItem.maturity,
            featured: true,
          } satisfies ShellNavigationRenderItem,
          ...launcherItems,
        ]

  const stageModeIndex = nextItems.findIndex((item) => item.route === '/perform')
  const physicalSurfacesIndex = nextItems.findIndex((item) => item.route === '/physical-surfaces')
  if (stageModeIndex === -1 || physicalSurfacesIndex === -1) return nextItems

  const swappedItems = [...nextItems]
  const currentStageMode = swappedItems[stageModeIndex]
  const currentPhysicalSurfaces = swappedItems[physicalSurfacesIndex]
  swappedItems[stageModeIndex] = { ...currentPhysicalSurfaces, featured: currentStageMode.featured }
  swappedItems[physicalSurfacesIndex] = { ...currentStageMode, featured: currentPhysicalSurfaces.featured }
  return swappedItems
}

// ── Snapshot editor icon lookup ──────────────────────────────────────────────

function findSnapshotEditorIcon(): ComponentType<SVGProps<SVGSVGElement>> | null {
  const item = allRouteNavigationItems.find((navItem) => navItem.to === '/juce-grid')
  return (item?.icon as ComponentType<SVGProps<SVGSVGElement>>) ?? null
}

// ── Component ────────────────────────────────────────────────────────────────

interface HomeStartMenuOverlayProps {
  open: boolean
  onClose: () => void
}

export function HomeStartMenuOverlay({ open, onClose }: HomeStartMenuOverlayProps) {
  const navigate = useNavigate()
  const panelRef = useRef<HTMLDivElement>(null)

  const launcherInterfaceSummary = useLauncherInterfaceSummary(open)
  const platformStatus = useHomePlatformStatus()
  const { data: hostInfo } = useHostMachineInfo()
  const pendingPushConfirmationQuery = usePushConfirmation(undefined, {
    refetchInterval: 15_000,
  })

  const startMenuTileItems = useMemo(buildStartMenuTileItems, [])
  const SnapshotEditorIcon = useMemo(findSnapshotEditorIcon, [])

  const launcherSummaryItems = useMemo(
    () => [
      `Platform ${MAP2_PLATFORM_VERSION}`,
      hostInfo?.os_version ?? hostInfo?.kernel_version ?? 'OS version unavailable',
      hostInfo?.hostname ?? 'Host unavailable',
    ],
    [hostInfo],
  )

  const platformStatusLabels = useMemo(
    () => [platformStatus.avb.label, platformStatus.avdecc.label, platformStatus.nodes.label],
    [platformStatus],
  )

  const [powerMenuOpen, setPowerMenuOpen] = useState(false)

  // Close power menu when overlay closes
  useEffect(() => {
    if (!open) setPowerMenuOpen(false)
  }, [open])

  // Focus trap
  useEffect(() => {
    if (!open) return undefined

    const panel = panelRef.current
    if (!panel) return undefined

    // Focus first focusable on open
    const firstFocusable = panel.querySelector<HTMLElement>(
      'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    )
    firstFocusable?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab' || !panel) return

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1)

      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  const handleNavigate = () => onClose()

  const handleOpenSnapshotEditor = () => {
    onClose()
    navigate('/juce-grid')
  }

  const handleOpenRestartConfirm = () => {
    setPowerMenuOpen(false)
    onClose()
    dispatchShellOpenRestartConfirmEvent()
  }

  const handleRefreshPage = () => {
    onClose()
    reloadHomeDesktopShell()
  }

  const handleLogOut = () => {
    onClose()
    returnHomeDesktopToBoot()
  }

  return (
    <div className="hp2-overlay">
      <div
        className="hp2-overlay__backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <Layer
        id="shell-launcher-panel"
        className="hp2-overlay__panel"
        role="menu"
        aria-label="Platform menu"
        ref={panelRef}
      >
        {/* Header */}
        <div className="hp2-overlay__header">
          <div className="hp2-overlay__header-main">
            <div className="hp2-overlay__header-mark" aria-hidden="true">
              <Map2BrandMark className="hp2-overlay__header-icon" />
            </div>
            <div className="hp2-overlay__header-copy">
              <strong>{MAP2_PLATFORM_NAME}</strong>
              {launcherSummaryItems.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>
          {SnapshotEditorIcon ? (
            <button
              type="button"
              className="hp2-overlay__header-action"
              role="menuitem"
              aria-label="Open Snapshot Editor"
              title="Open Snapshot Editor"
              onClick={handleOpenSnapshotEditor}
            >
              <SnapshotEditorIcon aria-hidden />
            </button>
          ) : null}
        </div>

        {/* System Summary */}
        <div className="hp2-overlay__summary" aria-label="System summary">
          <div className="hp2-overlay__summary-row hp2-overlay__summary-row--node-status">
            <PushConfirmationNoticePill
              pendingConfirmation={pendingPushConfirmationQuery.data?.pending_confirmation ?? null}
            />
            <NodeNavBar />
          </div>
          <div className="hp2-overlay__summary-row hp2-overlay__summary-row--metrics">
            <LatencyPressureShellReadout />
            <TaskbarClock />
          </div>
          <div className="hp2-overlay__status-list" aria-label="Platform status">
            {platformStatusLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className="hp2-overlay__device-summary" aria-label="Detected interfaces">
            <div className="hp2-overlay__device-group">
              <span className="hp2-overlay__device-heading">Audio Interfaces</span>
              <div className="hp2-overlay__device-list">
                {launcherInterfaceSummary.isLoading && launcherInterfaceSummary.audioInterfaces.length === 0 ? (
                  <span className="hp2-overlay__device-empty">Detecting audio interfaces...</span>
                ) : launcherInterfaceSummary.audioInterfaces.length > 0 ? (
                  launcherInterfaceSummary.audioInterfaces.map((name) => (
                    <span key={name} className="hp2-overlay__device-pill">{name}</span>
                  ))
                ) : (
                  <span className="hp2-overlay__device-empty">No audio interfaces detected</span>
                )}
              </div>
            </div>
            <div className="hp2-overlay__device-group">
              <span className="hp2-overlay__device-heading">MIDI Interfaces</span>
              <div className="hp2-overlay__device-list">
                {launcherInterfaceSummary.isLoading && launcherInterfaceSummary.midiInterfaces.length === 0 ? (
                  <span className="hp2-overlay__device-empty">Detecting MIDI interfaces...</span>
                ) : launcherInterfaceSummary.midiInterfaces.length > 0 ? (
                  launcherInterfaceSummary.midiInterfaces.map((name) => (
                    <span key={name} className="hp2-overlay__device-pill">{name}</span>
                  ))
                ) : (
                  <span className="hp2-overlay__device-empty">No MIDI interfaces detected</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tiles */}
        <div className="hp2-overlay__body">
          <NavigationItems items={startMenuTileItems} onNavigate={handleNavigate} variant="launcher" />
        </div>

        {/* Footer / Power */}
        <div className="hp2-overlay__footer">
          <div className="hp2-overlay__power-root">
            <OverflowMenu
              aria-label="Power actions"
              className={`hp2-overlay__power-menu-trigger${powerMenuOpen ? ' is-active' : ''}`}
              direction="top"
              flipped
              iconDescription="Power actions"
              onClose={() => setPowerMenuOpen(false)}
              onOpen={() => setPowerMenuOpen(true)}
              open={powerMenuOpen}
              renderIcon={Power}
              size="md"
            >
              <OverflowMenuItem itemText="Restart backend" onClick={handleOpenRestartConfirm} />
              <OverflowMenuItem itemText="Refresh desktop" onClick={handleRefreshPage} />
              <OverflowMenuItem itemText="Log out" onClick={handleLogOut} />
            </OverflowMenu>
          </div>
        </div>
      </Layer>
    </div>
  )
}
