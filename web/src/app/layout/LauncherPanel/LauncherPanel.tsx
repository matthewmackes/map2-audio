import type { RefObject } from 'react'
import { Layer, OverflowMenu, OverflowMenuItem } from '@carbon/react'
import { Power } from '@carbon/icons-react'

import './LauncherPanel.css'
import {
  MAP2_PLATFORM_NAME,
  Map2BrandMark,
} from '../../components/branding/map2Branding'
import { NavigationItems, type ShellNavigationRenderItem } from '../NavigationItems'
import { SystemSummary } from '../SystemSummary'
import type { PushSurfacePendingConfirmation } from '../../../map2/clients/pushSurface'
import type { LauncherInterfaceSummary } from '../useLauncherInterfaceSummary'

type LauncherPanelVariant = 'home' | 'workspace'

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
  return (
    <Layer
      id="shell-launcher-panel"
      className={`${variant === 'home' ? 'hp2-overlay__panel' : 'shell-launcher__panel'} map2-launcher__panel`}
      role="menu"
      aria-label="Platform menu"
      ref={panelRef}
    >
      <div className="map2-launcher__header">
        <div className="map2-launcher__header-main">
          <div className="map2-launcher__header-mark" aria-hidden="true">
            <Map2BrandMark className="map2-launcher__header-icon" />
          </div>
          <div className="map2-launcher__header-copy">
            <strong>{MAP2_PLATFORM_NAME}</strong>
          </div>
        </div>
      </div>

      <SystemSummary
        classNamePrefix="map2-launcher"
        launcherInterfaceSummary={launcherInterfaceSummary}
        launcherSummaryItems={launcherSummaryItems}
        pendingPushConfirmation={pendingPushConfirmation}
        platformStatusLabels={platformStatusLabels}
      />

      <div className="map2-launcher__body">
        <NavigationItems items={startMenuTileItems} onNavigate={onNavigate} variant="launcher" />
      </div>

      <div className="map2-launcher__footer">
        <div className="map2-launcher__power-root">
          <OverflowMenu
            aria-label="Power actions"
            className={`map2-launcher__power-menu-trigger${powerMenuOpen ? ' is-active' : ''}`}
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
