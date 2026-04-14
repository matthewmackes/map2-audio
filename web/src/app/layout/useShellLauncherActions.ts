import { useMemo } from 'react'

import { reloadHomeDesktopShell, returnHomeDesktopToBoot } from '../pages/homeDesktopSession'

type UseShellLauncherActionsOptions = {
  closeShellMenus: () => void
  navOpen: boolean
  setNavOpen: (open: boolean) => void
  setPowerMenuOpen: (value: boolean | ((current: boolean) => boolean)) => void
  setRestartConfirmOpen: (open: boolean) => void
}

export function useShellLauncherActions({
  closeShellMenus,
  navOpen,
  setNavOpen,
  setPowerMenuOpen,
  setRestartConfirmOpen,
}: UseShellLauncherActionsOptions) {
  return useMemo(
    () => ({
      onCloseMenus: closeShellMenus,
      onLogOut: () => {
        closeShellMenus()
        returnHomeDesktopToBoot()
      },
      onOpenRestartConfirm: () => {
        setPowerMenuOpen(false)
        setRestartConfirmOpen(true)
      },
      onRefreshPage: () => {
        closeShellMenus()
        reloadHomeDesktopShell()
      },
      onToggleMenu: () => {
        setNavOpen(!navOpen)
        setPowerMenuOpen(false)
      },
      onTogglePowerMenu: () => {
        setPowerMenuOpen((current) => !current)
      },
    }),
    [closeShellMenus, navOpen, setNavOpen, setPowerMenuOpen, setRestartConfirmOpen],
  )
}
