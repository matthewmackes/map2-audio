import { useRef } from 'react'
import type { CSSProperties, RefObject } from 'react'

import { StaticHeroIconLauncher } from './StaticHeroIconLauncher'
import { type ShellNavigationRenderItem } from './NavigationItems'
import { LauncherPanel } from './LauncherPanel/LauncherPanel'
import { useFocusTrap } from '../hooks/useFocusTrap'
import type { PushSurfacePendingConfirmation } from '../../map2/clients/pushSurface'
import type { LauncherInterfaceSummary } from './useLauncherInterfaceSummary'

export type StartMenuTileItem = ShellNavigationRenderItem

export function ShellLauncherPanel({
  accentColor,
  launcherInterfaceSummary,
  launcherRef,
  navOpen,
  powerMenuOpen,
  launcherSummaryItems,
  pendingPushConfirmation,
  platformStatusLabels,
  startMenuTileItems,
  onToggleMenu,
  onTogglePowerMenu,
  onCloseMenus,
  onOpenRestartConfirm,
  onRefreshPage,
  onLogOut,
}: {
  accentColor: string
  launcherInterfaceSummary: LauncherInterfaceSummary
  launcherRef: RefObject<HTMLDivElement | null>
  navOpen: boolean
  powerMenuOpen: boolean
  launcherSummaryItems: string[]
  pendingPushConfirmation: PushSurfacePendingConfirmation | null
  platformStatusLabels: string[]
  startMenuTileItems: StartMenuTileItem[]
  onToggleMenu: () => void
  onTogglePowerMenu: () => void
  onCloseMenus: () => void
  onOpenRestartConfirm: () => void
  onRefreshPage: () => void
  onLogOut: () => void
}) {
  const launcherButtonRef = useRef<HTMLButtonElement | null>(null)
  const launcherPanelRef = useRef<HTMLDivElement | null>(null)

  useFocusTrap({
    enabled: navOpen,
    containerRef: launcherPanelRef,
    restoreFocusRef: launcherButtonRef,
  })

  return (
    <div className="shell-launcher" ref={launcherRef} style={{ '--window-shell-accent': accentColor } as CSSProperties}>
      <div className="shell-launcher__button-wrap">
        <StaticHeroIconLauncher
          isActive={navOpen}
          buttonRef={launcherButtonRef}
          onClick={onToggleMenu}
        />

        {navOpen ? (
          <LauncherPanel
            variant="workspace"
            launcherInterfaceSummary={launcherInterfaceSummary}
            launcherSummaryItems={launcherSummaryItems}
            pendingPushConfirmation={pendingPushConfirmation}
            platformStatusLabels={platformStatusLabels}
            startMenuTileItems={startMenuTileItems}
            powerMenuOpen={powerMenuOpen}
            panelRef={launcherPanelRef}
            onNavigate={onCloseMenus}
            onOpenRestartConfirm={onOpenRestartConfirm}
            onRefreshPage={onRefreshPage}
            onLogOut={onLogOut}
            onPowerMenuOpen={() => {
              if (!powerMenuOpen) {
                onTogglePowerMenu()
              }
            }}
            onPowerMenuClose={() => {
              if (powerMenuOpen) {
                onTogglePowerMenu()
              }
            }}
          />
        ) : null}
      </div>
    </div>
  )
}
