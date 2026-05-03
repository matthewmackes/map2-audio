// Hover/focus prefetch registry. NavigationItems wires
// onMouseEnter/onFocus → prefetchAppRoute(route), so the moment a user
// hovers a nav link the corresponding lazy chunks start fetching in the
// background. Only the bundle is prefetched — no data loaders fire.
//
// Each entry in PREFETCH_RULES maps a route prefix to the dynamic
// imports to warm. Match precedence is "longest matching prefix wins"
// so subroutes like `/devices/edirol-ua1000` warm just the Edirol view,
// while `/devices/lcd/displays` warms the LCD shell + sub-views.

let prefetchedRoutes = new Set<string>()

type PrefetchLoader = () => Promise<unknown>

interface PrefetchRule {
  /**
   * URL prefix this rule covers. A route matches if it equals the prefix
   * exactly OR starts with `${prefix}/`. The empty-string `prefix: ''`
   * is reserved for the root catch-all and is currently unused.
   */
  prefix: string
  /** Lazy chunks to warm when this prefix is hovered. */
  loaders: PrefetchLoader[]
}

const PREFETCH_RULES: PrefetchRule[] = [
  // Snapshot editor surfaces — heavy chunk + publish workspace.
  {
    prefix: '/snapshot-editor',
    loaders: [
      () => import('./pages/SnapshotEditorPageContent'),
      () => import('./pages/SnapshotPublishPage'),
    ],
  },
  {
    prefix: '/snapshots',
    loaders: [
      () => import('./pages/SnapshotsBrowserPage'),
      () => import('./pages/SnapshotPublishPage'),
    ],
  },
  // Legacy aliases that redirect into the snapshot editor.
  {
    prefix: '/grid',
    loaders: [() => import('./pages/SnapshotEditorPageContent')],
  },
  {
    prefix: '/juce-grid',
    loaders: [() => import('./pages/SnapshotEditorPageContent')],
  },

  // Nav reorg 2026-05-03 (second pass) — canonical Node Ops mount
  // is `/node-ops`. Audio Artifacts is its own top-level mount at
  // `/artifacts`. Legacy `/workspace` and `/platforms` prefixes are
  // retained so prefetch still triggers when an operator follows a
  // legacy bookmark (the redirect to canonical happens after the
  // prefetch fires).
  {
    prefix: '/node-ops',
    loaders: [
      () => import('./pages/WorkspaceHubShell'),
      () => import('./pages/workspace-hub/platforms/PlatformWorkspaceSection'),
      () => import('./components/Platform/PlatformModal'),
    ],
  },
  {
    prefix: '/artifacts',
    loaders: [
      () => import('./pages/WorkspaceHubShell'),
      () => import('./pages/workspace-hub/artifacts/WorkspaceArtifactsOverviewPage'),
    ],
  },
  {
    prefix: '/workspace',
    loaders: [
      () => import('./pages/WorkspaceHubShell'),
      () => import('./pages/workspace-hub/platforms/PlatformWorkspaceSection'),
      () => import('./components/Platform/PlatformModal'),
    ],
  },
  {
    prefix: '/platforms',
    loaders: [
      () => import('./pages/WorkspaceHubShell'),
      () => import('./pages/workspace-hub/platforms/PlatformWorkspaceSection'),
      () => import('./components/Platform/PlatformModal'),
    ],
  },

  // Labs / experimental surfaces.
  {
    prefix: '/labs',
    loaders: [() => import('./pages/PushSurfacePage')],
  },

  // MIDI Services (canonical /midi/* mount; T2491 cleanup re-pointed
  // the legacy /midi-hub prefetch to the canonical sub-views).
  {
    prefix: '/midi-hub',
    loaders: [
      () => import('./pages/MidiHubShell'),
      () => import('./pages/midi-services/MidiServicesConnectionsPage'),
    ],
  },
  {
    prefix: '/midi',
    loaders: [
      () => import('./pages/MidiHubShell'),
      () => import('./pages/midi-services/MidiServicesConnectionsPage'),
    ],
  },
  {
    prefix: '/midi/assignments',
    loaders: [() => import('./pages/MidiAssignmentsPage')],
  },

  // Devices shell + per-device heavy views. Per-device prefixes win over
  // the generic /devices fallback because of longest-prefix matching.
  {
    prefix: '/devices',
    loaders: [
      () => import('./components/Devices/DevicesShell'),
      () => import('./components/Devices/HardwareStorePage'),
    ],
  },
  {
    prefix: '/devices/edirol-ua1000',
    loaders: [() => import('./components/Devices/EdirolUA1000/EdirolUA1000View')],
  },
  {
    prefix: '/devices/hotone-jogg',
    loaders: [() => import('./components/Devices/HoToneJoGG/HoToneJoGGView')],
  },
  {
    prefix: '/devices/lcd',
    loaders: [
      () => import('./components/Devices/LCD/LCDShell'),
      () => import('./components/Devices/LCD/views/LCDDisplaysView'),
    ],
  },
  {
    prefix: '/devices/tesira',
    loaders: [() => import('./components/Devices/Tesira/TesiraView')],
  },
  {
    prefix: '/devices/mpx1',
    loaders: [
      () => import('./components/Devices/MPX1/MPX1Shell'),
      () => import('./components/Devices/MPX1/views/MPX1PanelView'),
    ],
  },
  {
    prefix: '/devices/intelfx',
    loaders: [
      () => import('./components/Devices/IntelFX/IntelFXShell'),
      () => import('./components/Devices/IntelFX/views/IntelFXPanelView'),
    ],
  },

  // Standalone heavy pages.
  {
    prefix: '/maschine',
    loaders: [() => import('./pages/MaschinePage')],
  },
  {
    prefix: '/mcu',
    loaders: [() => import('./pages/McuPage')],
  },
  {
    prefix: '/launch-control',
    loaders: [() => import('./pages/LaunchControlPage')],
  },
  {
    prefix: '/midi-commander',
    loaders: [() => import('./pages/MidiCommanderPage')],
  },
  // Nav reorg 2026-05-03 — /chains route deleted; folded into
  // /node-ops/audio-engine.
  {
    prefix: '/host-machine',
    loaders: [() => import('./pages/HostMachinePage')],
  },
  {
    prefix: '/ground-control-pro',
    loaders: [() => import('./pages/GroundControlProPage')],
  },
  {
    prefix: '/motu-rme',
    loaders: [() => import('./pages/MOTURMEPage')],
  },
  {
    prefix: '/metering',
    loaders: [() => import('./pages/MeteringPage')],
  },
  {
    prefix: '/pipewire',
    loaders: [() => import('./pages/PipeWirePage')],
  },
  {
    // T2487 — /expression redirects to /midi/devices/expression/console;
    // prefetch the new canonical mount + the integrated view so the redirect
    // lands instantly (the shim ExpressionPage.tsx is no longer the working
    // module).
    prefix: '/expression',
    loaders: [
      () => import('./components/Devices/Expression/ExpressionConsoleView'),
      () => import('./components/Devices/Expression/ExpressionView'),
    ],
  },
  {
    prefix: '/midi/devices/expression',
    loaders: [
      () => import('./components/Devices/Expression/ExpressionConsoleView'),
      () => import('./components/Devices/Expression/ExpressionView'),
    ],
  },
  {
    prefix: '/sequencer',
    loaders: [() => import('./pages/SequencerPage')],
  },
  {
    prefix: '/state-authority',
    loaders: [() => import('./pages/StateAuthorityPage')],
  },
  {
    prefix: '/perform',
    loaders: [() => import('./pages/PerformPage')],
  },
  {
    prefix: '/welcome',
    loaders: [() => import('./pages/WelcomePage')],
  },
]

// Build a sorted view (longest prefix first) once at module load so each
// lookup is O(N) over a small static list with no per-call sort cost.
const sortedRules = [...PREFETCH_RULES].sort((a, b) => b.prefix.length - a.prefix.length)

function findRuleForRoute(route: string): PrefetchRule | null {
  for (const rule of sortedRules) {
    if (route === rule.prefix || route.startsWith(`${rule.prefix}/`)) {
      return rule
    }
  }
  return null
}

export function prefetchAppRoute(route: string): void {
  if (prefetchedRoutes.has(route)) {
    return
  }

  const rule = findRuleForRoute(route)
  if (!rule) {
    return
  }

  prefetchedRoutes.add(route)
  void Promise.allSettled(rule.loaders.map((loader) => loader())).catch(() => {
    prefetchedRoutes.delete(route)
  })
}

/** Test-only escape hatch: introspect which prefixes the registry covers. */
export function getPrefetchPrefixesForTests(): readonly string[] {
  return PREFETCH_RULES.map((rule) => rule.prefix)
}

export function resetPrefetchedRoutesForTests(): void {
  prefetchedRoutes = new Set<string>()
}
