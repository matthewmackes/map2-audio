import { useEffect, useRef } from 'react'
import type { CSSProperties, ComponentType, RefObject, SVGProps } from 'react'
import { Layer } from '@carbon/react'

import { NodeNavBar } from '../components/NodeNav/NodeNavBar'
import {
  MAP2_PLATFORM_NAME,
  Map2BrandMark,
} from '../components/branding/map2Branding'
import { LatencyPressureShellReadout } from '../components/LatencyPressureShellReadout'
import { TaskbarClock } from '../components/TaskbarClock'
import { NavigationItems, type ShellNavigationRenderItem } from './NavigationItems'
import { PushConfirmationNoticePill } from './PushConfirmationNoticePill'
import type { PushSurfacePendingConfirmation } from '../../map2/clients/pushSurface'

export type StartMenuTileItem = ShellNavigationRenderItem

export function ShellLauncherPanel({
  accentColor,
  launcherRef,
  navOpen,
  powerMenuOpen,
  launcherSummaryItems,
  pendingPushConfirmation,
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
  pendingPushConfirmation: PushSurfacePendingConfirmation | null
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
  const launcherButtonRef = useRef<HTMLButtonElement | null>(null)
  const launcherPanelRef = useRef<HTMLDivElement | null>(null)
  const powerButtonRef = useRef<HTMLButtonElement | null>(null)
  const powerMenuRef = useRef<HTMLDivElement | null>(null)
  const previousNavOpenRef = useRef(navOpen)
  const previousPowerMenuOpenRef = useRef(powerMenuOpen)

  useEffect(() => {
    if (navOpen) {
      const firstFocusable = launcherPanelRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      )
      firstFocusable?.focus()
    } else if (previousNavOpenRef.current) {
      launcherButtonRef.current?.focus()
    }
    previousNavOpenRef.current = navOpen
  }, [navOpen])

  useEffect(() => {
    if (powerMenuOpen) {
      const firstFocusable = powerMenuRef.current?.querySelector<HTMLElement>('button:not([disabled])')
      firstFocusable?.focus()
    } else if (previousPowerMenuOpenRef.current) {
      powerButtonRef.current?.focus()
    }
    previousPowerMenuOpenRef.current = powerMenuOpen
  }, [powerMenuOpen])

  useEffect(() => {
    function trapFocus(event: KeyboardEvent) {
      if (event.key !== 'Tab') {
        return
      }

      const scope = powerMenuOpen ? powerMenuRef.current : navOpen ? launcherPanelRef.current : null
      if (!scope) {
        return
      }

      const focusable = Array.from(
        scope.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('disabled') && element.tabIndex !== -1)

      if (focusable.length === 0) {
        return
      }

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

    if (!navOpen) {
      return undefined
    }

    window.addEventListener('keydown', trapFocus)
    return () => {
      window.removeEventListener('keydown', trapFocus)
    }
  }, [navOpen, powerMenuOpen])

  return (
    <div className="shell-launcher" ref={launcherRef} style={{ '--window-shell-accent': accentColor } as CSSProperties}>
      <div className="shell-launcher__button-wrap">
        <button
          ref={launcherButtonRef}
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
            ref={launcherPanelRef}
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
                  role="menuitem"
                  aria-label="Open Snapshot Editor"
                  title="Open Snapshot Editor"
                  onClick={onOpenSnapshotEditor}
                >
                  <SnapshotEditorIcon aria-hidden />
                </button>
              ) : null}
            </div>

            <div className="shell-launcher__system-summary" aria-label="System summary">
              <div className="shell-launcher__summary-row shell-launcher__summary-row--node-status">
                <PushConfirmationNoticePill pendingConfirmation={pendingPushConfirmation} />
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
                <NavigationItems items={startMenuTileItems} onNavigate={onCloseMenus} variant="launcher" />
              </div>
            </div>

            <div className="shell-launcher__footer">
              <div className="shell-launcher__power-root">
                <button
                  ref={powerButtonRef}
                  type="button"
                  className={`shell-launcher__power-button${powerMenuOpen ? ' is-active' : ''}`}
                  onClick={onTogglePowerMenu}
                  role="menuitem"
                  aria-haspopup="menu"
                  aria-expanded={powerMenuOpen}
                  aria-controls="shell-launcher-power-menu"
                >
                  Power
                </button>
                {powerMenuOpen ? (
                  <div
                    id="shell-launcher-power-menu"
                    className="start-menu-power-menu"
                    role="menu"
                    aria-label="Power actions"
                    ref={powerMenuRef}
                  >
                    <button
                      type="button"
                      className="start-menu-power-menu__item"
                      role="menuitem"
                      onClick={onOpenRestartConfirm}
                    >
                      Restart Backend
                    </button>
                    <button
                      type="button"
                      className="start-menu-power-menu__item"
                      role="menuitem"
                      onClick={onRefreshPage}
                    >
                      Refresh Desktop
                    </button>
                    <button
                      type="button"
                      className="start-menu-power-menu__item"
                      role="menuitem"
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
