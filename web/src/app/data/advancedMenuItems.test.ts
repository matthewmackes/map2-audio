import fs from 'node:fs'
import path from 'node:path'
import {
  MAX_PINNED_NAV_ITEMS,
  hardwareInterfaceMenuItems,
  homeNavigationItem,
  homeNavigationSections,
  navigationCatalogItems,
  navigationMaturityMeta,
  normalizePinnedRoutes,
  pinnableNavigationItems,
} from './advancedMenuItems'

describe('navigation catalog', () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf8')

  it('groups all items under the five domain categories', () => {
    const validSections = new Set(['System', 'JUCE', 'MIDI', 'AVB', 'Hardware'])

    for (const section of homeNavigationSections) {
      expect(validSections.has(section.title)).toBe(true)
    }

    expect(homeNavigationSections.length).toBeGreaterThan(0)
  })

  it('exposes home sections without rendering Home as a self-link card', () => {
    expect(homeNavigationItem.to).toBe('/')

    for (const section of homeNavigationSections) {
      for (const item of section.items) {
        expect(item.to).not.toBe('/')
      }
    }
  })

  it('marks pinnable entries explicitly and limits the shell to four active pins', () => {
    expect(MAX_PINNED_NAV_ITEMS).toBe(4)
    expect(pinnableNavigationItems.length).toBeGreaterThan(0)

    for (const item of navigationCatalogItems) {
      expect(typeof item.pinnable).toBe('boolean')
    }
  })

  it('keeps hardware cards in the Hardware section with real routes', () => {
    const hardwareSection = homeNavigationSections.find((section) => section.title === 'Hardware')

    expect(hardwareSection).toBeDefined()
    expect(hardwareSection?.items.length).toBeGreaterThan(0)
    for (const item of hardwareSection?.items ?? []) {
      expect(item.to.startsWith('/')).toBe(true)
    }

    for (const item of hardwareInterfaceMenuItems) {
      expect(item.maturity).not.toBe('hardware-blocked')
    }
  })

  it('keeps every Home card aligned with an application route', () => {
    const hasRouteRegistration = (route: string) =>
      appSource.includes(`path="${route}"`) || appSource.includes(`path="${route}/*"`)

    for (const section of homeNavigationSections) {
      for (const item of section.items) {
        expect(hasRouteRegistration(item.to)).toBe(true)
      }
    }
  })

  it('gives every Home card a detailed purpose description', () => {
    for (const section of homeNavigationSections) {
      for (const item of section.items) {
        const descriptionWordCount = item.description.trim().split(/\s+/).length
        expect(descriptionWordCount).toBeGreaterThanOrEqual(12)
      }
    }
  })

  it('normalizes pinned routes by trimming, filtering invalid values, and deduplicating', () => {
    expect(normalizePinnedRoutes(['/grid', ' /grid ', '', '#oops', 'grid', '/midi-hub'])).toEqual([
      '/grid',
      '/midi-hub',
    ])
  })

  it('uses exact maturity labels for UI badges', () => {
    expect(Object.keys(navigationMaturityMeta).sort()).toEqual([
      'beta',
      'experimental',
      'hardware-blocked',
      'production',
      'qualified-with-waiver',
    ])

    for (const [state, meta] of Object.entries(navigationMaturityMeta)) {
      expect(meta.label).toBe(state)
    }
  })

  it('keeps the advanced menu limited to explicitly designated routes', () => {
    const advancedItems = navigationCatalogItems.filter((item) => item.includeInAdvancedMenu)
    expect(advancedItems.map((item) => item.to)).toEqual(['/midi-cluster'])
  })
})
