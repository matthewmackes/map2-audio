import {
  readHomeShellRecentDestinations,
  readHomeShellRecentRoute,
  readHomeShellRecentRoutes,
  writeHomeShellRecentRoute,
} from './homeShellNavigation'

describe('homeShellNavigation recent routes', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it('stores the newest recent routes first, dedupes, and keeps the list bounded', () => {
    writeHomeShellRecentRoute('/brain')
    writeHomeShellRecentRoute('/platforms/theme')
    writeHomeShellRecentRoute('/brain')
    writeHomeShellRecentRoute('/midi-hub/connections')
    writeHomeShellRecentRoute('/workspace/platforms/overview')
    writeHomeShellRecentRoute('/snapshot-editor')

    expect(readHomeShellRecentRoutes()).toEqual([
      '/snapshot-editor',
      '/workspace/platforms/overview',
      '/midi-hub/connections',
      '/brain',
    ])
    expect(readHomeShellRecentRoute()).toBe('/snapshot-editor')
  })

  it('falls back to the legacy single-route entry and resolves operator-facing metadata', () => {
    window.sessionStorage.setItem('map2:home-shell-recent-route', '/workspace/artifacts?category=snapshots')

    expect(readHomeShellRecentRoutes()).toEqual(['/workspace/artifacts?category=snapshots'])
    expect(readHomeShellRecentDestinations()).toEqual([
      {
        route: '/workspace/artifacts?category=snapshots',
        label: 'Snapshots',
        description: 'Return to Workspaces.',
        group: 'Workspaces',
      },
    ])
  })
})
