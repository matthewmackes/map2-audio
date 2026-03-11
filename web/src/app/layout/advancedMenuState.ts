import type { AdvancedMenuItem } from '../data/advancedMenuItems'

export function isHardwareInterfacesPopup(item: AdvancedMenuItem): boolean {
  return item.kind === 'hardware-submenu'
}

export function isBlockedAdvancedMenuItem(item: AdvancedMenuItem): boolean {
  return item.maturity === 'hardware-blocked' && !isHardwareInterfacesPopup(item)
}
