import type { RefObject } from 'react'
import { Layer, OverflowMenu, OverflowMenuItem } from '@carbon/react'
import { Power } from '@carbon/icons-react'

import {
  MAP2_PLATFORM_NAME,
  Map2BrandMark,
} from '../../components/branding/map2Branding'
import { NavigationItems, type ShellNavigationRenderItem } from '../NavigationItems'
import { SystemSummary } from '../SystemSummary'
import type { PushSurfacePendingConfirmation } from '../../../map2/clients/pushSurface'
import type { LauncherInterfaceSummary } from '../useLauncherInterfaceSummary'

type LauncherPanelVariant = 'home' | 'workspace'

const PANEL_CLASSNAME_PREFIX: Record<LauncherPanelVariant, 'hp2-overlay' | 'shell-launcher'> = {
  home: 'hp2-overlay',
  workspace: 'shell-launcher',
}

type LauncherPanelProps = {
  variant: LauncherPanelVariant
  launcherInterfaceSummary: LauncherInterfaceSummary
  launcherSummaryItems: string[]
  pendingPushConfirmation: PushSurfacePendingConfirmation | null
  platformStatusLabels: string[]
  startMenuTileItems: ShellNavigationRenderItem[]
  powerMenuOpen: boolean
  panelRef: RefObject<HTMLDivElement | null>
  onNavigate: () => void
  onOpenRestartConfirm: () => void
  onRefreshPage: () => void
  onLogOut: () => void
  onPowerMenuOpen: () => void
  onPowerMenuClose: () => void
}

export function LauncherPanel({
  variant,
  launcherInterfaceSummary,
  launcherSummaryItems,
  pendingPushConfirmation,
  platformStatusLabels,
  startMenuTileItems,
  powerMenuOpen,
  panelRef,
  onNavigate,
  onOpenRestartConfirm,
  onRefreshPage,
  onLogOut,
  onPowerMenuOpen,
  onPowerMenuClose,
}: LauncherPanelProps) {
  const classNamePrefix = PANEL_CLASSNAME_PREFIX[variant]

  return (
    <Layer
      id="shell-launcher-panel"
      className={`${classNamePrefix}__panel`}
      role="menu"
      aria-label="Platform menu"
      ref={panelRef}
    >
      <div className={`${classNamePrefix}__header`}>
        <div className={`${classNamePrefix}__header-main`}>
          <div className={`${classNamePrefix}__header-mark`} aria-hidden="true">
            <Map2BrandMark className={`${classNamePrefix}__header-icon`} />
          </div>
          <div className={`${classNamePrefix}__header-copy`}>
            <strong>{MAP2_PLATFORM_NAME}</strong>
          </div>
        </div>
      </div>

      <SystemSummary
        classNamePrefix={classNamePrefix}
        launcherInterfaceSummary={launcherInterfaceSummary}
        launcherSummaryItems={launcherSummaryItems}
        pendingPushConfirmation={pendingPushConfirmation}
        platformStatusLabels={platformStatusLabels}
      />

      <div className={`${classNamePrefix}__body`}>
        <NavigationItems items={startMenuTileItems} onNavigate={onNavigate} variant="launcher" />
      </div>

      <div className={`${classNamePrefix}__footer`}>
        <div className={`${classNamePrefix}__power-root`}>
          <OverflowMenu
            aria-label="Power actions"
            className={`${classNamePrefix}__power-menu-trigger${powerMenuOpen ? ' is-active' : ''}`}
            direction="top"
            flipped
            iconDescription="Power actions"
            onClose={onPowerMenuClose}
            onOpen={onPowerMenuOpen}
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
  )
}
