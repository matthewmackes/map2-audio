let prefetchedRoutes = new Set<string>()

function prefetchSnapshotEditor() {
  return Promise.allSettled([
    import('./pages/SnapshotEditorPage').then((module) => module),
  ])
}

function prefetchPlatformWorkspace() {
  return Promise.allSettled([
    import('./pages/PlatformWorkspacePage').then((module) => module),
    import('./pages/PlatformWorkspaceCatalogPage').then((module) => module),
    import('./components/Platform/PlatformModal').then((module) => module),
  ])
}

function prefetchPushSurfaceWorkspace() {
  return Promise.allSettled([
    import('./pages/PushSurfacePage').then((module) => module),
  ])
}

function prefetchMidiHub() {
  return Promise.allSettled([
    import('./pages/MidiHubShell').then((module) => module),
    import('./pages/midi-hub/MidiHubConnectionsPage').then((module) => module),
  ])
}

function prefetchForRoute(route: string) {
  if (route === '/snapshot-editor' || route === '/juce-grid' || route === '/grid') {
    return prefetchSnapshotEditor()
  }

  if (route.startsWith('/platforms')) {
    return prefetchPlatformWorkspace()
  }

  if (route.startsWith('/labs/')) {
    return prefetchPushSurfaceWorkspace()
  }

  if (route === '/midi-hub' || route.startsWith('/midi-hub/')) {
    return prefetchMidiHub()
  }

  return null
}

export function prefetchAppRoute(route: string) {
  if (prefetchedRoutes.has(route)) {
    return
  }

  const preload = prefetchForRoute(route)
  if (!preload) {
    return
  }

  prefetchedRoutes.add(route)
  void preload.catch(() => {
    prefetchedRoutes.delete(route)
  })
}

export function resetPrefetchedRoutesForTests() {
  prefetchedRoutes = new Set<string>()
}
