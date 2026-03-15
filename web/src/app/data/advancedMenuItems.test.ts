import fs from 'node:fs'
import path from 'node:path'
import { MapSignalFlowIcon } from '../components/icons/map'
import {
  MAX_PINNED_NAV_ITEMS,
  defaultPinnedRoutes,
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

  it('normalizes pinned routes by trimming, aliasing legacy paths, filtering invalid values, and deduplicating', () => {
    expect(normalizePinnedRoutes(['/grid', ' /grid ', '/welcome', '', '#oops', 'grid', '/midi-hub', '/about'])).toEqual([
      '/juce-grid',
      '/about',
      '/midi-hub',
    ])
  })

  it('pins JUCE-GRID by default and removes legacy Grid entries from navigation', () => {
    expect(defaultPinnedRoutes).toEqual(['/juce-grid'])

    const juceGrid = navigationCatalogItems.find((item) => item.to === '/juce-grid')
    const legacyGrid = navigationCatalogItems.find((item) => item.to === '/grid')
    const legacyGrid3d = navigationCatalogItems.find((item) => item.to === '/grid-3d')

    expect(juceGrid).toBeDefined()
    expect(juceGrid?.showOnHome).toBe(true)
    expect(juceGrid?.includeInAdvancedMenu).toBe(false)
    expect(juceGrid?.icon).toBe(MapSignalFlowIcon)
    expect(legacyGrid).toBeUndefined()
    expect(legacyGrid3d).toBeUndefined()
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
    expect(advancedItems.map((item) => item.to)).toEqual([
      '/avb-routing',
      '/midi-cluster',
      '/api-observatory',
      '/midi-hub',
      '/mpx1',
      '/intelfx',
      '/cluster-dashboard',
    ])
  })

  it('keeps API Observatory in advanced navigation only', () => {
    const observatory = navigationCatalogItems.find((item) => item.to === '/api-observatory')
    expect(observatory).toBeDefined()
    expect(observatory?.includeInAdvancedMenu).toBe(true)
    expect(observatory?.showOnHome).toBe(false)

    const appearsOnHome = homeNavigationSections.some((section) =>
      section.items.some((item) => item.to === '/api-observatory'),
    )
    expect(appearsOnHome).toBe(false)
  })

  it('keeps MPX1 Rack and IntelFX Rack in advanced navigation only', () => {
    for (const route of ['/mpx1', '/intelfx']) {
      const item = navigationCatalogItems.find((candidate) => candidate.to === route)
      expect(item).toBeDefined()
      expect(item?.includeInAdvancedMenu).toBe(true)
      expect(item?.showOnHome).toBe(false)

      const appearsOnHome = homeNavigationSections.some((section) =>
        section.items.some((candidate) => candidate.to === route),
      )
      expect(appearsOnHome).toBe(false)
    }
  })
})
