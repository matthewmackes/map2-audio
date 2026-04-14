import { useEffect, useRef, useMemo, useState } from 'react'

import { type ShellNavigationRenderItem } from '../layout/NavigationItems'
import { LauncherPanel } from '../layout/LauncherPanel/LauncherPanel'
import { buildStartMenuItems } from '../layout/startMenuItems'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { reloadHomeDesktopShell, returnHomeDesktopToBoot } from './homeDesktopSession'
import { dispatchShellOpenRestartConfirmEvent } from '../layout/shellEvents'

// ── Component ────────────────────────────────────────────────────────────────

interface HomeStartMenuOverlayProps {
  open: boolean
  onClose: () => void
}

export function HomeStartMenuOverlay({ open, onClose }: HomeStartMenuOverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  const startMenuTileItems = useMemo<ShellNavigationRenderItem[]>(() => buildStartMenuItems(), [])

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
        launcherInterfaceSummary={{ audioInterfaces: [], midiInterfaces: [], isLoading: false }}
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
