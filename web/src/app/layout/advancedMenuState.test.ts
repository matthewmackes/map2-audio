import { hardwareInterfaceMenuItems, navigationCatalogItems } from '../data/advancedMenuItems'
import { isBlockedAdvancedMenuItem } from './advancedMenuState'

describe('advanced menu state', () => {
  it('keeps hardware interface destinations openable rather than hardware-blocked', () => {
    expect(hardwareInterfaceMenuItems.length).toBeGreaterThan(0)

    for (const item of hardwareInterfaceMenuItems) {
      expect(item.maturity).not.toBe('hardware-blocked')
    }
  })

  it('correctly identifies blocked items by hardware-blocked maturity', () => {
    const lcdItem = navigationCatalogItems.find((item) => item.to === '/lcd')
    expect(lcdItem).toBeDefined()
    expect(isBlockedAdvancedMenuItem(lcdItem as any)).toBe(true)
  })
})
