import { useEffect, useRef, useMemo, useState } from 'react'

import { MAP2_PLATFORM_VERSION } from '../components/branding/map2Branding'
import { type ShellNavigationRenderItem } from '../layout/NavigationItems'
import { LauncherPanel } from '../layout/LauncherPanel/LauncherPanel'
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
      <LauncherPanel
        variant="home"
        launcherInterfaceSummary={launcherInterfaceSummary}
        launcherSummaryItems={launcherSummaryItems}
        pendingPushConfirmation={pendingPushConfirmationQuery.data?.pending_confirmation ?? null}
        platformStatusLabels={platformStatusLabels}
        startMenuTileItems={startMenuTileItems}
        powerMenuOpen={powerMenuOpen}
        panelRef={panelRef}
        onNavigate={handleNavigate}
        onOpenRestartConfirm={handleOpenRestartConfirm}
        onRefreshPage={handleRefreshPage}
        onLogOut={handleLogOut}
        onPowerMenuOpen={() => setPowerMenuOpen(true)}
        onPowerMenuClose={() => setPowerMenuOpen(false)}
      />
    </div>
  )
}
