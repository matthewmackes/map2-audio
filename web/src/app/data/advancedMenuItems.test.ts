import fs from 'node:fs'
import path from 'node:path'
import { MapAudioGridIcon } from '../components/icons/map'
import {
  MAX_PINNED_NAV_ITEMS,
  advancedMenuItems,
  defaultPinnedRoutes,
  hardwareInterfaceMenuItems,
  homeNavigationItem,
  homeNavigationTabSections,
  homeNavigationSections,
  navigationCatalogItems,
  navigationMaturityMeta,
  normalizePinnedRoutes,
  pinnableNavigationItems,
} from './advancedMenuItems'

describe('navigation catalog', () => {
  const appSource = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf8')

  it('defines the Home tabs in Audio Grid-first order while keeping shared groups non-empty', () => {
    expect(homeNavigationTabSections.map((section) => section.title)).toEqual([
      'Audio Grid',
      'AVB',
      'MIDI',
      'System',
      'Hardware',
    ])

    expect(homeNavigationSections.map((section) => section.title)).toEqual([
      'Audio Grid',
      'MIDI',
      'System',
    ])
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

  it('keeps hardware routes real while leaving the Home card set hardware-free', () => {
    const systemSection = homeNavigationSections.find((section) => section.title === 'System')

    expect(homeNavigationSections.some((section) => section.title === 'Hardware')).toBe(false)
    expect(systemSection?.items.some((item) => item.to === '/lcd')).toBe(false)

    for (const item of hardwareInterfaceMenuItems) {
      expect(item.to.startsWith('/')).toBe(true)
      expect(item.maturity).not.toBe('hardware-blocked')
    }
  })

  it('keeps every Home card aligned with an application route', () => {
    const hasRouteRegistration = (route: string) => {
      const pathname = new URL(route, 'https://map2.local').pathname
      if (pathname.startsWith('/platforms/')) {
        return appSource.includes('path="/platforms/:workspace"')
      }

      return appSource.includes(`path="${pathname}"`) || appSource.includes(`path="${pathname}/*"`)
    }

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
    expect(normalizePinnedRoutes(['/grid', ' /grid ', '/welcome', '', '#oops', 'grid', '/midi', '/midi-hub', '/about', '/platform'])).toEqual([
      '/juce-grid',
      '/platforms/about',
      '/midi-hub',
      '/platforms/overview',
    ])
  })

  it('pins Audio Grid by default and removes legacy Grid entries from navigation', () => {
    expect(defaultPinnedRoutes).toEqual(['/juce-grid'])

    const juceGrid = navigationCatalogItems.find((item) => item.to === '/juce-grid')
    const legacyGrid = navigationCatalogItems.find((item) => item.to === '/grid')
    const legacyGrid3d = navigationCatalogItems.find((item) => item.to === '/grid-3d')

    expect(juceGrid).toBeDefined()
    expect(juceGrid?.showOnHome).toBe(true)
    expect(juceGrid?.includeInAdvancedMenu).toBe(false)
    expect(juceGrid?.label).toBe('Audio Grid')
    expect(juceGrid?.icon).toBe(MapAudioGridIcon)
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
    const advancedItems = advancedMenuItems
    expect(advancedItems.map((item) => item.to)).toEqual([
      '/midi-hub',
      '/labs/push-surface',
      '/mpx1',
      '/intelfx',
      '/ground-control-pro',
      '/tesira',
      '/maschine',
      '/edirol-ua1000',
      '/hotone-jogg',
    ])
  })

  it('keeps Platforms on Home as the routed cluster workspace entry instead of the removed dedicated cluster pages', () => {
    const platform = navigationCatalogItems.find((item) => item.to === '/platforms/overview')
    expect(platform).toBeDefined()
    expect(platform?.label).toBe('Platforms')
    expect(platform?.includeInAdvancedMenu).toBe(false)
    expect(platform?.pinnable).toBe(false)
    expect(platform?.showOnHome).toBe(true)
    expect(pinnableNavigationItems.some((item) => item.to === '/platforms/overview')).toBe(false)

    const appearsOnHome = homeNavigationSections.some((section) =>
      section.items.some((item) => item.to === '/platforms/overview'),
    )
    expect(appearsOnHome).toBe(true)
  })

  it('does not expose removed Nodes or Multi-System navigation cards', () => {
    const nodes = navigationCatalogItems.find((item) => item.label === 'Nodes')
    const multiSystem = navigationCatalogItems.find((item) => item.label === 'Multi-System')
    const midi = navigationCatalogItems.find((item) => item.to === '/midi')

    expect(nodes).toBeUndefined()
    expect(multiSystem).toBeUndefined()
    expect(midi).toBeUndefined()
  })

  it('keeps MPX1 Rack, IntelFX Rack, and Tesira AVB in advanced navigation only', () => {
    for (const route of ['/mpx1', '/intelfx', '/tesira']) {
      const item = navigationCatalogItems.find((candidate) => candidate.to === route)
      expect(item).toBeDefined()
      expect(item?.includeInAdvancedMenu).toBe(true)
      expect(item?.showOnHome).toBe(false)
      if (route === '/tesira') {
        expect(item?.pinnable).toBe(false)
      }

      const appearsOnHome = homeNavigationSections.some((section) =>
        section.items.some((candidate) => candidate.to === route),
      )
      expect(appearsOnHome).toBe(false)
    }
  })

  it('keeps Edirol UA-1000 and HoTone JoGG in advanced navigation only', () => {
    for (const route of ['/edirol-ua1000', '/hotone-jogg']) {
      const item = hardwareInterfaceMenuItems.find((candidate) => candidate.to === route && candidate.deviceType !== 'generic-interface')
      expect(item).toBeDefined()
      expect(item?.includeInAdvancedMenu).toBe(true)
      expect(item?.pinnable).toBe(false)
      expect(item?.showOnHome).toBe(false)
      expect(item?.showInHardwareSubmenu).toBe(false)

      const appearsOnHome = homeNavigationSections.some((section) =>
        section.items.some((candidate) => candidate.to === route && candidate.deviceType === item?.deviceType),
      )
      expect(appearsOnHome).toBe(false)
    }
  })
})
