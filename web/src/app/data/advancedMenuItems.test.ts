import fs from 'node:fs'
import path from 'node:path'
import { MapAudioGridIcon } from '../components/icons/map'
import {
  FIXED_START_MENU_TILE_ROUTES,
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
import { HOST_MACHINE_ROUTE } from '../pages/hostMachineRoutes'

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

    // T2490 — AVB section added to homeNavigationSections (parallel to MIDI).
    expect(homeNavigationSections.map((section) => section.title)).toEqual([
      'Audio Grid',
      'AVB',
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
      if (pathname === '/workspace' || pathname.startsWith('/workspace/')) {
        return appSource.includes('path="/workspace/*"')
      }
      if (pathname.startsWith('/platforms/')) {
        return appSource.includes('path="/platforms/:workspace"') || appSource.includes('path="/workspace/*"')
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
    expect(normalizePinnedRoutes(['/grid', ' /grid ', '/welcome', '', '#oops', 'grid', '/midi', '/midi-hub', '/host-machine', '/about', '/platform'])).toEqual([
      '/platforms/about',
      HOST_MACHINE_ROUTE,
    ])
  })

  it('keeps the fixed Start Menu routes out of user-managed pins and removes legacy Grid entries from navigation', () => {
    expect(defaultPinnedRoutes).toEqual([])
    expect(FIXED_START_MENU_TILE_ROUTES).toEqual(['/brain', '/juce-grid', '/midi-hub', '/hardware-interfaces'])

    const juceGrid = navigationCatalogItems.find((item) => item.to === '/juce-grid')
    const brain = navigationCatalogItems.find((item) => item.to === '/brain')
    const legacyGrid = navigationCatalogItems.find((item) => item.to === '/grid')
    const legacyGrid3d = navigationCatalogItems.find((item) => item.to === '/grid-3d')

    expect(juceGrid).toBeDefined()
    expect(juceGrid?.showOnHome).toBe(true)
    expect(juceGrid?.includeInAdvancedMenu).toBe(false)
    expect(juceGrid?.label).toBe('Audio Grid')
    expect(juceGrid?.icon).toBe(MapAudioGridIcon)
    expect(brain).toBeDefined()
    expect(brain?.label).toBe('Brain')
    expect(brain?.pinnable).toBe(false)
    expect(brain?.showOnHome).toBe(false)
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
    // T2485-8 — 7 MIDI device entries (Push, MCU, LaunchControl,
    // MidiCommander, MPX1, IntelFX, GroundControlPro) flipped to
    // includeInAdvancedMenu=false (sidebar collapse 9→1). The single
    // MIDI Services entry at /midi remains. Iter-94 also renamed
    // /midi-hub → /midi.
    // T2490-1: added /avb entry (AVB Services canonical mount).
    // T2490-6a: /tesira entry's `to` flipped to /avb/devices/tesira
    // (canonical Tesira mount under AVB Services).
    // T2491 (cleanup) — actual menu order has /avb between /state-authority
    // and /avb/devices/tesira (the entry was added at the position the
    // T2490-1 patch landed it). Test updated to match observed order.
    expect(advancedItems.map((item) => item.to)).toEqual([
      '/midi',
      '/devices',
      '/state-authority',
      '/avb',
      '/avb/devices/tesira',
      '/edirol-ua1000',
      '/hotone-jogg',
    ])
  })

  it('keeps Workspaces on Home as the canonical hub entry instead of the removed dedicated cluster pages', () => {
    const platform = navigationCatalogItems.find((item) => item.to === '/workspace')
    expect(platform).toBeDefined()
    expect(platform?.label).toBe('Workspaces')
    expect(platform?.includeInAdvancedMenu).toBe(false)
    expect(platform?.pinnable).toBe(false)
    expect(platform?.showOnHome).toBe(true)
    expect(pinnableNavigationItems.some((item) => item.to === '/workspace')).toBe(false)

    const appearsOnHome = homeNavigationSections.some((section) =>
      section.items.some((item) => item.to === '/workspace'),
    )
    expect(appearsOnHome).toBe(true)
  })

  it('does not expose removed Nodes or Multi-System navigation cards', () => {
    const nodes = navigationCatalogItems.find((item) => item.label === 'Nodes')
    const multiSystem = navigationCatalogItems.find((item) => item.label === 'Multi-System')
    // T2482 iter 94 — /midi is now the canonical MIDI Services entry
    // (renamed from /midi-hub). It IS expected to be in the catalog.
    const midiServicesEntry = navigationCatalogItems.find((item) => item.to === '/midi')
    const audioTable = navigationCatalogItems.find((item) => item.to === '/audio-table')

    expect(nodes).toBeUndefined()
    expect(multiSystem).toBeUndefined()
    expect(midiServicesEntry).toBeDefined()
    expect(midiServicesEntry?.label).toBe('MIDI Services')
    expect(audioTable).toBeUndefined()
  })

  it('keeps MPX1 Rack, IntelFX Rack, and Tesira AVB in the navigation catalog', () => {
    // T2485-8 — MPX1/IntelFX entries flipped to includeInAdvancedMenu=false
    // (sidebar collapse 9→1) and the `to` route flipped to the unified
    // /midi/devices/<profile-key>/panel mount. The launcher catalog keeps
    // them so operators can still find them; only the sidebar entry is
    // retired. Tesira AVB stays in advanced nav unchanged.
    const routeChecks: Array<{ route: string; expectInAdvanced: boolean; tesira?: boolean }> = [
      { route: '/midi/devices/lexicon-mpx1/panel', expectInAdvanced: false },
      { route: '/midi/devices/rocktron-intelfx/panel', expectInAdvanced: false },
      // T2490-6a: Tesira fleet now lives at /avb/devices/tesira.
      { route: '/avb/devices/tesira', expectInAdvanced: true, tesira: true },
    ]
    for (const { route, expectInAdvanced, tesira } of routeChecks) {
      const item = navigationCatalogItems.find((candidate) => candidate.to === route)
      expect(item).toBeDefined()
      expect(item?.includeInAdvancedMenu).toBe(expectInAdvanced)
      expect(item?.showOnHome).toBe(false)
      if (tesira) {
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
