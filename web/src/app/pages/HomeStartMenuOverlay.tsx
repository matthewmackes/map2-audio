import { useEffect, useRef, useMemo, useState } from 'react'
import { Layer, OverflowMenu, OverflowMenuItem } from '@carbon/react'
import { Power } from '@carbon/icons-react'

import {
  MAP2_PLATFORM_NAME,
  MAP2_PLATFORM_VERSION,
  Map2BrandMark,
} from '../components/branding/map2Branding'
import { NavigationItems, type ShellNavigationRenderItem } from '../layout/NavigationItems'
import { SystemSummary } from '../layout/SystemSummary'
import { buildStartMenuItems } from '../layout/startMenuItems'
import { useLauncherInterfaceSummary } from '../layout/useLauncherInterfaceSummary'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useHomePlatformStatus } from '../hooks/useHomePlatformStatus'
import { useHostMachineInfo } from '../hooks/useHostMachine'
import { usePushConfirmation } from '../hooks/usePushConfirmation'
import { reloadHomeDesktopShell, returnHomeDesktopToBoot } from './homeDesktopSession'
import { dispatchShellOpenRestartConfirmEvent } from '../layout/shellEvents'

// ── Component ────────────────────────────────────────────────────────────────

interface HomeStartMenuOverlayProps {
  open: boolean
  onClose: () => void
}

export function HomeStartMenuOverlay({ open, onClose }: HomeStartMenuOverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  const launcherInterfaceSummary = useLauncherInterfaceSummary(open)
  const platformStatus = useHomePlatformStatus()
  const { data: hostInfo } = useHostMachineInfo()
  const pendingPushConfirmationQuery = usePushConfirmation(undefined, {
    refetchInterval: 15_000,
  })

  const startMenuTileItems = useMemo<ShellNavigationRenderItem[]>(() => buildStartMenuItems(), [])

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

  useFocusTrap({
    enabled: open,
    containerRef: panelRef,
    onEscape: onClose,
  })

  if (!open) return null

  const handleNavigate = () => onClose()

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
            </div>
          </div>
        </div>

        <SystemSummary
          classNamePrefix="hp2-overlay"
          launcherInterfaceSummary={launcherInterfaceSummary}
          launcherSummaryItems={launcherSummaryItems}
          pendingPushConfirmation={pendingPushConfirmationQuery.data?.pending_confirmation ?? null}
          platformStatusLabels={platformStatusLabels}
        />

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
