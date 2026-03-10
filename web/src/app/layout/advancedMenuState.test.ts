import { advancedMenuItems, hardwareInterfaceMenuItems } from '../data/advancedMenuItems'
import { isBlockedAdvancedMenuItem, isHardwareInterfacesPopup } from './advancedMenuState'

describe('advanced menu state', () => {
  it('treats Audio Interfaces as an expandable submenu instead of a blocked entry', () => {
    const audioInterfacesItem = advancedMenuItems.find((item) => item.popupMenu === 'hardware-interfaces')

    expect(audioInterfacesItem).toBeDefined()
    expect(isHardwareInterfacesPopup(audioInterfacesItem!)).toBe(true)
    expect(isBlockedAdvancedMenuItem(audioInterfacesItem!)).toBe(false)
  })

  it('keeps hardware interface destinations openable rather than hardware-blocked', () => {
    expect(hardwareInterfaceMenuItems.length).toBeGreaterThan(0)

    for (const item of hardwareInterfaceMenuItems) {
      expect(item.maturity).not.toBe('hardware-blocked')
    }
  })
})
