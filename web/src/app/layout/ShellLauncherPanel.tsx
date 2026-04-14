import { useEffect, useRef } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { Layer, OverflowMenu, OverflowMenuItem, Tag } from '@carbon/react'
import { Power } from '@carbon/icons-react'

import { NodeNavBar } from '../components/NodeNav/NodeNavBar'
import {
  MAP2_PLATFORM_NAME,
  Map2BrandMark,
} from '../components/branding/map2Branding'
import { StaticHeroIconLauncher } from './StaticHeroIconLauncher'
import { LatencyPressureShellReadout } from '../components/LatencyPressureShellReadout'
import { TaskbarClock } from '../components/TaskbarClock'
import { NavigationItems, type ShellNavigationRenderItem } from './NavigationItems'
import { PushConfirmationNoticePill } from './PushConfirmationNoticePill'
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
  const previousNavOpenRef = useRef(navOpen)

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
    function trapFocus(event: KeyboardEvent) {
      if (event.key !== 'Tab') {
        return
      }

      const scope = navOpen ? launcherPanelRef.current : null
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
  }, [navOpen])

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
                  {launcherSummaryItems.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>
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
              <div className="shell-launcher__device-summary" aria-label="Detected interfaces">
                <div className="shell-launcher__device-group">
                  <span className="shell-launcher__device-heading">Audio Interfaces</span>
                  <div className="shell-launcher__device-list">
                    {launcherInterfaceSummary.isLoading && launcherInterfaceSummary.audioInterfaces.length === 0 ? (
                      <span className="shell-launcher__device-empty">Detecting audio interfaces...</span>
                    ) : launcherInterfaceSummary.audioInterfaces.length > 0 ? (
                      launcherInterfaceSummary.audioInterfaces.map((name) => (
                        <Tag key={name} className="shell-launcher__device-tag" size="sm" type="cool-gray">
                          {name}
                        </Tag>
                      ))
                    ) : (
                      <span className="shell-launcher__device-empty">No audio interfaces detected</span>
                    )}
                  </div>
                </div>
                <div className="shell-launcher__device-group">
                  <span className="shell-launcher__device-heading">MIDI Interfaces</span>
                  <div className="shell-launcher__device-list">
                    {launcherInterfaceSummary.isLoading && launcherInterfaceSummary.midiInterfaces.length === 0 ? (
                      <span className="shell-launcher__device-empty">Detecting MIDI interfaces...</span>
                    ) : launcherInterfaceSummary.midiInterfaces.length > 0 ? (
                      launcherInterfaceSummary.midiInterfaces.map((name) => (
                        <Tag key={name} className="shell-launcher__device-tag" size="sm" type="cool-gray">
                          {name}
                        </Tag>
                      ))
                    ) : (
                      <span className="shell-launcher__device-empty">No MIDI interfaces detected</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

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
