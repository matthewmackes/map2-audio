import { useRef } from 'react'
import type { CSSProperties, RefObject } from 'react'

import { TaskbarClock } from '../components/TaskbarClock'
import {
  MAP2_PLATFORM_NAME,
  Map2BrandMark,
} from '../components/branding/map2Branding'
import { type ShellNavigationRenderItem } from './NavigationItems'
import { LauncherPanel } from './LauncherPanel/LauncherPanel'
import { TaskbarStatusStrip } from './TaskbarStatusStrip'
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
      <div className="window-taskbar">
        <div className="window-taskbar__left">
          <div className="window-taskbar__start-root">
            <button
              ref={launcherButtonRef}
              type="button"
              className={`window-taskbar__start-btn${navOpen ? ' is-active' : ''}`}
              onClick={onToggleMenu}
              aria-label={navOpen ? 'Close platform menu' : 'Open platform menu'}
              aria-haspopup="menu"
              aria-expanded={navOpen}
              aria-controls="shell-launcher-panel"
            >
              <span className="window-taskbar__start-mark" aria-hidden="true">
                <Map2BrandMark className="window-taskbar__start-mark-icon" />
              </span>
              <span className="window-taskbar__start-label">Start</span>
              <span className="window-taskbar__start-system">{MAP2_PLATFORM_NAME}</span>
            </button>

            {navOpen ? (
              <LauncherPanel
                variant="workspace"
                launcherInterfaceSummary={launcherInterfaceSummary}
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

          <TaskbarStatusStrip
            launcherSummaryItems={launcherSummaryItems}
            pendingPushConfirmation={pendingPushConfirmation}
            platformStatusLabels={platformStatusLabels}
          />
        </div>

        <div className="window-taskbar__right">
          <TaskbarClock />
        </div>
      </div>
    </div>
  )
}
