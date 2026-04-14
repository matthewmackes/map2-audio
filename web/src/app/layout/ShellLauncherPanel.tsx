import { useRef } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { Layer, OverflowMenu, OverflowMenuItem } from '@carbon/react'
import { Power } from '@carbon/icons-react'

import {
  MAP2_PLATFORM_NAME,
  Map2BrandMark,
} from '../components/branding/map2Branding'
import { StaticHeroIconLauncher } from './StaticHeroIconLauncher'
import { NavigationItems, type ShellNavigationRenderItem } from './NavigationItems'
import { SystemSummary } from './SystemSummary'
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
          <Layer
            id="shell-launcher-panel"
            className="shell-launcher__panel"
            role="menu"
            aria-label="Platform menu"
            ref={launcherPanelRef}
          >
            <div className="shell-launcher__header">
              <div className="shell-launcher__header-main">
                <div className="shell-launcher__header-mark" aria-hidden="true">
                  <Map2BrandMark className="shell-launcher__header-icon" />
                </div>
                <div className="shell-launcher__header-copy">
                  <strong>{MAP2_PLATFORM_NAME}</strong>
                </div>
              </div>
            </div>

            <SystemSummary
              classNamePrefix="shell-launcher"
              launcherInterfaceSummary={launcherInterfaceSummary}
              launcherSummaryItems={launcherSummaryItems}
              pendingPushConfirmation={pendingPushConfirmation}
              platformStatusLabels={platformStatusLabels}
            />

            <div className="shell-launcher__body">
              <NavigationItems items={startMenuTileItems} onNavigate={onCloseMenus} variant="launcher" />
            </div>

            <div className="shell-launcher__footer">
              <div className="shell-launcher__power-root">
                <OverflowMenu
                  aria-label="Power actions"
                  className={`shell-launcher__power-menu-trigger${powerMenuOpen ? ' is-active' : ''}`}
                  direction="top"
                  flipped
                  iconDescription="Power actions"
                  onClose={() => {
                    if (powerMenuOpen) {
                      onTogglePowerMenu()
                    }
                  }}
                  onOpen={() => {
                    if (!powerMenuOpen) {
                      onTogglePowerMenu()
                    }
                  }}
                  open={powerMenuOpen}
                  renderIcon={Power}
                  size="md"
                >
                  <OverflowMenuItem itemText="Restart backend" onClick={onOpenRestartConfirm} />
                  <OverflowMenuItem itemText="Refresh desktop" onClick={onRefreshPage} />
                  <OverflowMenuItem itemText="Log out" onClick={onLogOut} />
                </OverflowMenu>
              </div>
            </div>
          </Layer>
        ) : null}
      </div>
    </div>
  )
}
