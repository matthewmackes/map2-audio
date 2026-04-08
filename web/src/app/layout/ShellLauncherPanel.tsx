import type { CSSProperties, ComponentType, RefObject, SVGProps } from 'react'
import { Layer } from '@carbon/react'
import { NavLink } from 'react-router-dom'

import { NodeNavBar } from '../components/NodeNav/NodeNavBar'
import {
  MAP2_PLATFORM_NAME,
  Map2BrandMark,
} from '../components/branding/map2Branding'
import { LatencyPressureShellReadout } from '../components/LatencyPressureShellReadout'
import { TaskbarClock } from '../components/TaskbarClock'
import type { NavigationMaturityState } from '../data/advancedMenuItems'
import { getLauncherCatalogMaturityLabel } from '../data/launcherCatalog'
import { prefetchAppRoute } from '../routePrefetch'

export type StartMenuTileItem = {
  route: string
  label: string
  shortLabel: string
  icon: ComponentType<{ size?: number; ariaHidden?: boolean } | SVGProps<SVGSVGElement>>
  description: string
  color: string
  maturity: NavigationMaturityState
  featured?: boolean
}

function renderStartMenuItem(item: StartMenuTileItem, onCloseMenus: () => void) {
  const Icon = item.icon

  return (
    <NavLink
      key={`start-link-${item.route}`}
      to={item.route}
      end={item.route === '/'}
      className={({ isActive }) => `start-menu-card start-menu-card--tile${item.featured ? ' start-menu-card--featured' : ''}${isActive ? ' is-active' : ''}`}
      style={{ '--item-color': item.color } as CSSProperties}
      title={`${item.description} • ${getLauncherCatalogMaturityLabel(item.maturity)}`}
      onClick={onCloseMenus}
      onMouseEnter={() => prefetchAppRoute(item.route)}
      onFocus={() => prefetchAppRoute(item.route)}
    >
      <span className="start-menu-card__icon-frame" aria-hidden="true">
        <span className="start-menu-card__icon start-menu-card__icon--tile">
          <Icon size={28} aria-hidden />
        </span>
      </span>
      <span className="start-menu-card__body">
        <span className="start-menu-card__label start-menu-card__label--tile">{item.label}</span>
        {item.maturity === 'hardware-blocked' ? (
          <span className="start-menu-card__meta">{getLauncherCatalogMaturityLabel(item.maturity)}</span>
        ) : null}
      </span>
    </NavLink>
  )
}

export function ShellLauncherPanel({
  accentColor,
  launcherRef,
  navOpen,
  powerMenuOpen,
  launcherSummaryItems,
  platformStatusLabels,
  startMenuTileItems,
  SnapshotEditorIcon,
  onToggleMenu,
  onTogglePowerMenu,
  onCloseMenus,
  onOpenSnapshotEditor,
  onOpenRestartConfirm,
  onRefreshPage,
  onLogOut,
}: {
  accentColor: string
  launcherRef: RefObject<HTMLDivElement | null>
  navOpen: boolean
  powerMenuOpen: boolean
  launcherSummaryItems: string[]
  platformStatusLabels: string[]
  startMenuTileItems: StartMenuTileItem[]
  SnapshotEditorIcon: ComponentType<SVGProps<SVGSVGElement>> | null
  onToggleMenu: () => void
  onTogglePowerMenu: () => void
  onCloseMenus: () => void
  onOpenSnapshotEditor: () => void
  onOpenRestartConfirm: () => void
  onRefreshPage: () => void
  onLogOut: () => void
}) {
  return (
    <div className="shell-launcher" ref={launcherRef} style={{ '--window-shell-accent': accentColor } as CSSProperties}>
      <div className="shell-launcher__button-wrap">
        <button
          type="button"
          className={`shell-launcher__button${navOpen ? ' is-active' : ''}`}
          onClick={onToggleMenu}
          aria-label={navOpen ? 'Close platform menu' : 'Open platform menu'}
          aria-haspopup="menu"
          aria-expanded={navOpen}
          aria-controls="shell-launcher-panel"
        >
          <Map2BrandMark className="shell-launcher__button-icon" />
        </button>

        {navOpen ? (
          <Layer
            id="shell-launcher-panel"
            className="shell-launcher__panel"
            role="menu"
            aria-label="Platform menu"
          >
            <div className="shell-launcher__header">
              <div className="shell-launcher__header-main">
                <div className="shell-launcher__header-mark" aria-hidden="true">
                  <Map2BrandMark className="shell-launcher__header-icon" />
                </div>
                <div className="shell-launcher__header-copy">
                  <strong>{MAP2_PLATFORM_NAME}</strong>
                  {launcherSummaryItems.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>
              {SnapshotEditorIcon ? (
                <button
                  type="button"
                  className="shell-launcher__header-action"
                  aria-label="Open Snapshot Editor"
                  title="Open Snapshot Editor"
                  onClick={onOpenSnapshotEditor}
                >
                  <SnapshotEditorIcon aria-hidden />
                </button>
              ) : null}
            </div>

            <div className="shell-launcher__system-summary" aria-label="System summary">
              <div className="shell-launcher__summary-row">
                <NodeNavBar />
              </div>
              <div className="shell-launcher__summary-row shell-launcher__summary-row--metrics">
                <LatencyPressureShellReadout />
                <TaskbarClock />
              </div>
              <div className="shell-launcher__summary-status-list" aria-label="Platform status">
                {platformStatusLabels.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
            </div>

            <div className="shell-launcher__body">
              <div className="shell-launcher__tile-grid">
                {startMenuTileItems.map((item) => renderStartMenuItem(item, onCloseMenus))}
              </div>
            </div>

            <div className="shell-launcher__footer">
              <div className="shell-launcher__power-root">
                <button
                  type="button"
                  className={`shell-launcher__power-button${powerMenuOpen ? ' is-active' : ''}`}
                  onClick={onTogglePowerMenu}
                  aria-haspopup="menu"
                  aria-expanded={powerMenuOpen}
                  aria-controls="shell-launcher-power-menu"
                >
                  Power
                </button>
                {powerMenuOpen ? (
                  <div id="shell-launcher-power-menu" className="start-menu-power-menu" role="menu" aria-label="Power actions">
                    <button
                      type="button"
                      className="start-menu-power-menu__item"
                      onClick={onOpenRestartConfirm}
                    >
                      Restart Backend
                    </button>
                    <button
                      type="button"
                      className="start-menu-power-menu__item"
                      onClick={onRefreshPage}
                    >
                      Refresh Desktop
                    </button>
                    <button
                      type="button"
                      className="start-menu-power-menu__item"
                      onClick={onLogOut}
                    >
                      Log Out
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </Layer>
        ) : null}
      </div>
    </div>
  )
}
