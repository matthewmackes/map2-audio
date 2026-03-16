import type { AdvancedNavigationItem, HardwareInterfaceMenuItem, ShellNavigationItem } from '../data/advancedMenuItems'

type BlockableNavigationItem = AdvancedNavigationItem | ShellNavigationItem | HardwareInterfaceMenuItem

export function isHardwareInterfacesPopup(item: BlockableNavigationItem): boolean {
  return item.kind === 'hardware-submenu'
}

export function isBlockedAdvancedMenuItem(item: BlockableNavigationItem): boolean {
  return item.maturity === 'hardware-blocked' && !isHardwareInterfacesPopup(item)
}
