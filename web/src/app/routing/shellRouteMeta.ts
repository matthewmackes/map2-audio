import { matchPath } from 'react-router-dom'

export interface ShellBreadcrumbItem {
  label: string
  to?: string
}

export interface ShellRouteMeta {
  sectionLabel?: string
  windowLabel: string
  title?: string
  breadcrumbs: ShellBreadcrumbItem[]
}

type ResolverParams = Record<string, string | undefined>

type ShellRouteRule = {
  path: string
  resolve: (params: ResolverParams, pathname: string) => ShellRouteMeta
}

function startCase(input: string | undefined): string {
  if (!input) return 'Detail'
  return input
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function staticMeta(path: string, meta: ShellRouteMeta): ShellRouteRule {
  return { path, resolve: () => meta }
}

// Nav reorg 2026-05-03 (second pass) — `/node-ops/*` is the
// canonical Node Ops mount. Breadcrumbs read "Node Ops / X" with no
// "Platforms" middle level. Legacy `/workspace/platforms/*` and
// `/platforms/*` entries are retained as fallbacks (in case a redirect
// somehow fails to fire) and surface the same clean breadcrumb shape.
const NODE_OPS_PARENT_CRUMB = { label: 'Node Ops', to: '/node-ops' as const }
const HARDWARE_PARENT_CRUMB = { label: 'Hardware', to: '/devices' as const }
const SETTINGS_PARENT_CRUMB = { label: 'Settings', to: '/node-ops/theme' as const }
const ARTIFACTS_PARENT_CRUMB = { label: 'Audio Artifacts', to: '/artifacts' as const }
const AVB_PARENT_CRUMB = { label: 'AVB', to: '/avb/overview' as const }

const RULES: ShellRouteRule[] = [
  // ── Canonical Node Ops mount ──────────────────────────────────────
  staticMeta('/node-ops', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Overview',
    breadcrumbs: [NODE_OPS_PARENT_CRUMB, { label: 'Overview' }],
  }),
  staticMeta('/node-ops/overview', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Overview',
    breadcrumbs: [NODE_OPS_PARENT_CRUMB, { label: 'Overview' }],
  }),
  staticMeta('/node-ops/audio-engine', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Audio Engine',
    breadcrumbs: [NODE_OPS_PARENT_CRUMB, { label: 'Audio Engine' }],
  }),
  staticMeta('/node-ops/network-discovery', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Network Discovery',
    breadcrumbs: [NODE_OPS_PARENT_CRUMB, { label: 'Network Discovery' }],
  }),
  staticMeta('/node-ops/cluster-dashboard', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Cluster Dashboard',
    breadcrumbs: [NODE_OPS_PARENT_CRUMB, { label: 'Cluster Dashboard' }],
  }),
  staticMeta('/node-ops/midpoint', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Midpoint',
    breadcrumbs: [NODE_OPS_PARENT_CRUMB, { label: 'Midpoint' }],
  }),
  staticMeta('/node-ops/adoption', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Adoption',
    breadcrumbs: [NODE_OPS_PARENT_CRUMB, { label: 'Adoption' }],
  }),
  staticMeta('/node-ops/api-webhooks', {
    sectionLabel: 'Node Ops',
    windowLabel: 'API Webhooks',
    breadcrumbs: [NODE_OPS_PARENT_CRUMB, { label: 'API Webhooks' }],
  }),
  // Device Manager — Hardware nav, /node-ops/management URL.
  staticMeta('/node-ops/management', {
    sectionLabel: 'Hardware',
    windowLabel: 'Device Manager',
    breadcrumbs: [HARDWARE_PARENT_CRUMB, { label: 'Device Manager' }],
  }),
  // Theme — Settings nav, /node-ops/theme URL.
  staticMeta('/node-ops/theme', {
    sectionLabel: 'Settings',
    windowLabel: 'Theme',
    breadcrumbs: [SETTINGS_PARENT_CRUMB, { label: 'Theme' }],
  }),

  // ── Legacy /workspace/* and /platforms/* breadcrumb fallbacks ────
  // These fire only if a redirect somehow doesn't apply. The labels
  // match the canonical post-reorg shape so the kicker stays
  // consistent regardless of which path resolves.
  staticMeta('/workspace', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Overview',
    breadcrumbs: [NODE_OPS_PARENT_CRUMB, { label: 'Overview' }],
  }),
  staticMeta('/workspace/platforms/overview', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Overview',
    breadcrumbs: [NODE_OPS_PARENT_CRUMB, { label: 'Overview' }],
  }),
  staticMeta('/platforms/overview', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Overview',
    breadcrumbs: [NODE_OPS_PARENT_CRUMB, { label: 'Overview' }],
  }),
  staticMeta('/workspace/platforms/management', {
    sectionLabel: 'Hardware',
    windowLabel: 'Device Manager',
    breadcrumbs: [HARDWARE_PARENT_CRUMB, { label: 'Device Manager' }],
  }),
  staticMeta('/platforms/management', {
    sectionLabel: 'Hardware',
    windowLabel: 'Device Manager',
    breadcrumbs: [HARDWARE_PARENT_CRUMB, { label: 'Device Manager' }],
  }),
  staticMeta('/workspace/platforms/audio-engine', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Audio Engine',
    breadcrumbs: [NODE_OPS_PARENT_CRUMB, { label: 'Audio Engine' }],
  }),
  staticMeta('/platforms/audio-engine', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Audio Engine',
    breadcrumbs: [NODE_OPS_PARENT_CRUMB, { label: 'Audio Engine' }],
  }),
  // Nav reorg 2026-05-03 — Legacy AVB Routing breadcrumb entries
  // intentionally retained as fallbacks. The routes themselves now
  // hard-redirect to /avb/routing via LegacyPlatformWorkspaceRedirect
  // (see App.tsx) and buildLegacyPlatformWorkspaceRedirectPath. The
  // breadcrumbs here only fire if the redirect somehow fails to apply.
  staticMeta('/workspace/platforms/avb-routing', {
    sectionLabel: 'AVB',
    windowLabel: 'Routing',
    breadcrumbs: [AVB_PARENT_CRUMB, { label: 'Routing' }],
  }),
  staticMeta('/platforms/avb-routing', {
    sectionLabel: 'AVB',
    windowLabel: 'Routing',
    breadcrumbs: [AVB_PARENT_CRUMB, { label: 'Routing' }],
  }),
  // Nav reorg 2026-05-03 — full breadcrumb metadata for the AVB
  // Services shell. Backfills the gap noted in the audit (the /avb/*
  // routes previously fell through to fallback rendering, leaving
  // shell kickers to derive from path segments). Section label is
  // "AVB" to match the GlobalTreeNav top-level label.
  staticMeta('/avb', {
    sectionLabel: 'AVB',
    windowLabel: 'Overview',
    breadcrumbs: [AVB_PARENT_CRUMB, { label: 'Overview' }],
  }),
  staticMeta('/avb/overview', {
    sectionLabel: 'AVB',
    windowLabel: 'Overview',
    breadcrumbs: [AVB_PARENT_CRUMB, { label: 'Overview' }],
  }),
  staticMeta('/avb/connections', {
    sectionLabel: 'AVB',
    windowLabel: 'Connections',
    breadcrumbs: [AVB_PARENT_CRUMB, { label: 'Connections' }],
  }),
  staticMeta('/avb/bindings', {
    sectionLabel: 'AVB',
    windowLabel: 'Bindings',
    breadcrumbs: [AVB_PARENT_CRUMB, { label: 'Bindings' }],
  }),
  staticMeta('/avb/devices', {
    sectionLabel: 'AVB',
    windowLabel: 'Devices',
    breadcrumbs: [AVB_PARENT_CRUMB, { label: 'Devices' }],
  }),
  staticMeta('/avb/routing', {
    sectionLabel: 'AVB',
    windowLabel: 'Routing',
    breadcrumbs: [AVB_PARENT_CRUMB, { label: 'Routing' }],
  }),
  staticMeta('/avb/network', {
    sectionLabel: 'AVB',
    windowLabel: 'Network',
    breadcrumbs: [AVB_PARENT_CRUMB, { label: 'Network' }],
  }),
  staticMeta('/avb/devices/tesira', {
    sectionLabel: 'AVB',
    windowLabel: 'Tesira',
    breadcrumbs: [AVB_PARENT_CRUMB, { label: 'Devices', to: '/avb/devices' }, { label: 'Tesira' }],
  }),
  {
    path: '/avb/devices/tesira/*',
    resolve: () => ({
      sectionLabel: 'AVB',
      windowLabel: 'Tesira',
      breadcrumbs: [AVB_PARENT_CRUMB, { label: 'Devices', to: '/avb/devices' }, { label: 'Tesira' }],
    }),
  },
  staticMeta('/workspace/platforms/network-discovery', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Network Discovery',
    breadcrumbs: [NODE_OPS_PARENT_CRUMB, { label: 'Network Discovery' }],
  }),
  staticMeta('/platforms/network-discovery', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Network Discovery',
    breadcrumbs: [NODE_OPS_PARENT_CRUMB, { label: 'Network Discovery' }],
  }),
  staticMeta('/workspace/platforms/cluster-dashboard', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Cluster Dashboard',
    breadcrumbs: [NODE_OPS_PARENT_CRUMB, { label: 'Cluster Dashboard' }],
  }),
  staticMeta('/platforms/cluster-dashboard', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Cluster Dashboard',
    breadcrumbs: [NODE_OPS_PARENT_CRUMB, { label: 'Cluster Dashboard' }],
  }),
  staticMeta('/workspace/platforms/midpoint', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Midpoint',
    breadcrumbs: [NODE_OPS_PARENT_CRUMB, { label: 'Midpoint' }],
  }),
  staticMeta('/platforms/midpoint', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Midpoint',
    breadcrumbs: [NODE_OPS_PARENT_CRUMB, { label: 'Midpoint' }],
  }),
  staticMeta('/platforms/api-webhooks', {
    sectionLabel: 'Node Ops',
    windowLabel: 'API Webhooks',
    breadcrumbs: [NODE_OPS_PARENT_CRUMB, { label: 'API Webhooks' }],
  }),
  staticMeta('/workspace/platforms/api-webhooks', {
    sectionLabel: 'Node Ops',
    windowLabel: 'API Webhooks',
    breadcrumbs: [NODE_OPS_PARENT_CRUMB, { label: 'API Webhooks' }],
  }),
  staticMeta('/workspace/platforms/adoption', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Adoption',
    breadcrumbs: [NODE_OPS_PARENT_CRUMB, { label: 'Adoption' }],
  }),
  staticMeta('/platforms/adoption', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Adoption',
    breadcrumbs: [NODE_OPS_PARENT_CRUMB, { label: 'Adoption' }],
  }),
  staticMeta('/workspace/platforms/theme', {
    sectionLabel: 'Settings',
    windowLabel: 'Theme',
    breadcrumbs: [SETTINGS_PARENT_CRUMB, { label: 'Theme' }],
  }),
  staticMeta('/platforms/theme', {
    sectionLabel: 'Settings',
    windowLabel: 'Theme',
    breadcrumbs: [SETTINGS_PARENT_CRUMB, { label: 'Theme' }],
  }),
  // /about and its legacy /workspace/platforms/about / /platforms/about siblings
  // are retired 2026-05-04. The Platform Guide is inlined on Home; the App-level
  // route redirects them to `/#platform-guide`, so no shell breadcrumb is needed.
  // Nav reorg 2026-05-03 (second pass) — Audio Artifacts is its own
  // top-level service group at the canonical `/artifacts` URL.
  staticMeta('/artifacts', {
    sectionLabel: 'Audio Artifacts',
    windowLabel: 'Overview',
    breadcrumbs: [ARTIFACTS_PARENT_CRUMB, { label: 'Overview' }],
  }),
  staticMeta('/artifacts/discover', {
    sectionLabel: 'Audio Artifacts',
    windowLabel: 'Discover',
    breadcrumbs: [ARTIFACTS_PARENT_CRUMB, { label: 'Discover' }],
  }),
  // Legacy /workspace/artifacts breadcrumbs surface the same shape so
  // any redirect-in-flight reads correctly.
  staticMeta('/workspace/artifacts', {
    sectionLabel: 'Audio Artifacts',
    windowLabel: 'Overview',
    breadcrumbs: [ARTIFACTS_PARENT_CRUMB, { label: 'Overview' }],
  }),
  staticMeta('/workspace/artifacts/discover', {
    sectionLabel: 'Audio Artifacts',
    windowLabel: 'Discover',
    breadcrumbs: [ARTIFACTS_PARENT_CRUMB, { label: 'Discover' }],
  }),
  staticMeta('/sequencer', { windowLabel: 'Sequencer', breadcrumbs: [{ label: 'Sequencer' }] }),
  // Nav reorg 2026-05-03 — /chains route deleted; folded into
  // /node-ops/audio-engine (AudioEngineChainsSection).
  staticMeta('/metering', { windowLabel: 'Metering', breadcrumbs: [NODE_OPS_PARENT_CRUMB, { label: 'Metering' }] }),
  staticMeta('/pipewire', { windowLabel: 'PipeWire', breadcrumbs: [NODE_OPS_PARENT_CRUMB, { label: 'PipeWire' }] }),
  staticMeta('/state-authority', { windowLabel: 'State Authority', breadcrumbs: [NODE_OPS_PARENT_CRUMB, { label: 'State Authority' }] }),
  staticMeta('/ground-control-pro', { windowLabel: 'Ground Control Pro', breadcrumbs: [{ label: 'MIDI Services', to: '/midi/connections' }, { label: 'Ground Control Pro' }] }),
  staticMeta('/expression', { windowLabel: 'Expression', breadcrumbs: [{ label: 'MIDI Services', to: '/midi/connections' }, { label: 'Expression' }] }),
  staticMeta('/snapshots', { windowLabel: 'Snapshots', breadcrumbs: [{ label: 'Snapshots' }] }),
  {
    path: '/snapshots/:snapshotId/publish',
    resolve: (params) => ({
      windowLabel: 'Publish Snapshot',
      breadcrumbs: [
        { label: 'Snapshots', to: '/snapshots' },
        { label: params.snapshotId ? `#${params.snapshotId}` : 'Snapshot' },
        { label: 'Publish' },
      ],
    }),
  },
  staticMeta('/snapshot-editor', { windowLabel: 'Snapshot Editor', breadcrumbs: [{ label: 'Snapshots', to: '/snapshots' }, { label: 'Snapshot Editor' }] }),
  staticMeta('/midi/assignments', { windowLabel: 'MIDI Assignments', breadcrumbs: [{ label: 'MIDI Services', to: '/midi/connections' }, { label: 'Assignments' }] }),
  // T2491 (2026-05-02 cleanup) — canonical /midi/* breadcrumb meta.
  // The /midi-hub/* legacy paths still appear below as low-priority
  // fallbacks for stale bookmarks that haven't been redirected yet,
  // but the operator-visible labels all point at the canonical
  // /midi/* surface ("MIDI Services" + "/midi/connections").
  staticMeta('/midi/connections', { windowLabel: 'MIDI Connections', breadcrumbs: [{ label: 'MIDI Services', to: '/midi/connections' }, { label: 'Connections' }] }),
  staticMeta('/midi/devices', { windowLabel: 'MIDI Devices', breadcrumbs: [{ label: 'MIDI Services', to: '/midi/connections' }, { label: 'Devices' }] }),
  staticMeta('/midi/bindings', { windowLabel: 'MIDI Bindings', breadcrumbs: [{ label: 'MIDI Services', to: '/midi/connections' }, { label: 'Bindings' }] }),
  staticMeta('/midi/routing', { windowLabel: 'MIDI Routing', breadcrumbs: [{ label: 'MIDI Services', to: '/midi/connections' }, { label: 'Routing' }] }),
  staticMeta('/midi/presets', { windowLabel: 'MIDI Presets', breadcrumbs: [{ label: 'MIDI Services', to: '/midi/connections' }, { label: 'Presets' }] }),
  staticMeta('/midi/transport', { windowLabel: 'MIDI Transport', breadcrumbs: [{ label: 'MIDI Services', to: '/midi/connections' }, { label: 'Transport' }] }),
  staticMeta('/midi/events', { windowLabel: 'MIDI Events', breadcrumbs: [{ label: 'MIDI Services', to: '/midi/connections' }, { label: 'Events' }] }),
  staticMeta('/midi/processing', { windowLabel: 'MIDI Processing', breadcrumbs: [{ label: 'MIDI Services', to: '/midi/connections' }, { label: 'Processing' }] }),
  staticMeta('/midi/network', { windowLabel: 'MIDI Network', breadcrumbs: [{ label: 'MIDI Services', to: '/midi/connections' }, { label: 'Network' }] }),
  staticMeta('/midi/lab', { windowLabel: 'MIDI Lab', breadcrumbs: [{ label: 'MIDI Services', to: '/midi/connections' }, { label: 'Lab' }] }),
  staticMeta('/midi/overview', { windowLabel: 'MIDI Overview', breadcrumbs: [{ label: 'MIDI Services', to: '/midi/connections' }, { label: 'Overview' }] }),
  // T2491 — /midi/* wildcard moved to AFTER the deeper /midi/devices/<profile>/*
  // entries below (lines ~252+). matchPath{end:true} matches deepest-first
  // would have been ideal, but the resolver iterates in order and returns
  // first match, so deeper rules must precede the catch-all wildcard.
  // T2491 — /midi/* and /midi-hub/* wildcards moved to AFTER all
  // /midi/devices/<profile>/* entries below so the deeper rules
  // resolve first.
  staticMeta('/devices', { windowLabel: 'Hardware Store', breadcrumbs: [{ label: 'Devices' }, { label: 'Hardware Store' }] }),
  staticMeta('/devices/diagnostics', { windowLabel: 'Diagnostics', breadcrumbs: [{ label: 'Devices', to: '/devices' }, { label: 'Diagnostics' }] }),
  staticMeta('/devices/pack-sources', { windowLabel: 'Pack Sources', breadcrumbs: [{ label: 'Devices', to: '/devices' }, { label: 'Pack Sources' }] }),
  {
    path: '/devices/profile/:packId/:model',
    resolve: (params) => ({
      windowLabel: `Device ${startCase(params.model)}`,
      breadcrumbs: [{ label: 'Devices', to: '/devices' }, { label: startCase(params.packId) }, { label: startCase(params.model) }],
    }),
  },
  {
    path: '/devices/profile/:packId/:model/v2',
    resolve: (params) => ({
      windowLabel: `Device ${startCase(params.model)}`,
      breadcrumbs: [{ label: 'Devices', to: '/devices' }, { label: startCase(params.packId) }, { label: startCase(params.model) }],
    }),
  },
  staticMeta('/devices/edirol-ua1000/:view', { windowLabel: 'Edirol UA-1000', breadcrumbs: [{ label: 'Devices', to: '/devices' }, { label: 'Edirol UA-1000' }] }),
  staticMeta('/devices/edirol-ua1000', { windowLabel: 'Edirol UA-1000', breadcrumbs: [{ label: 'Devices', to: '/devices' }, { label: 'Edirol UA-1000' }] }),
  staticMeta('/devices/hotone-jogg/:view', { windowLabel: 'Hotone Jogg', breadcrumbs: [{ label: 'Devices', to: '/devices' }, { label: 'Hotone Jogg' }] }),
  staticMeta('/devices/hotone-jogg', { windowLabel: 'Hotone Jogg', breadcrumbs: [{ label: 'Devices', to: '/devices' }, { label: 'Hotone Jogg' }] }),
  staticMeta('/devices/lcd/*', { windowLabel: 'LCD', breadcrumbs: [{ label: 'Devices', to: '/devices' }, { label: 'LCD' }] }),
  staticMeta('/devices/tesira/*', { windowLabel: 'Tesira', breadcrumbs: [{ label: 'Devices', to: '/devices' }, { label: 'Tesira' }] }),
  staticMeta('/devices/mpx1/*', { windowLabel: 'MPX1', breadcrumbs: [{ label: 'Devices', to: '/devices' }, { label: 'MPX1' }] }),
  staticMeta('/devices/intelfx/*', { windowLabel: 'IntelFX Rack', breadcrumbs: [{ label: 'Devices', to: '/devices' }, { label: 'IntelFX Rack' }] }),
  // T2491 (2026-05-02 cleanup) — canonical /midi/devices/* shellRouteMeta
  // entries for the unified mounts shipped under T2485-4 (MPX1) and
  // T2485-5 (IntelFX). Required so Close-button + breadcrumb labels
  // resolve correctly when the operator lands on the unified path
  // directly. The legacy /devices/{mpx1,intelfx}/* entries above stay
  // for stale bookmarks; the canonical entries here take precedence
  // for the current operator workflow.
  staticMeta('/midi/devices/lexicon-mpx1/*', { windowLabel: 'MPX1 Rack', breadcrumbs: [{ label: 'MIDI Services', to: '/midi/connections' }, { label: 'Devices', to: '/midi/devices' }, { label: 'MPX1 Rack' }] }),
  staticMeta('/midi/devices/rocktron-intelfx/*', { windowLabel: 'IntelFX Rack', breadcrumbs: [{ label: 'MIDI Services', to: '/midi/connections' }, { label: 'Devices', to: '/midi/devices' }, { label: 'IntelFX Rack' }] }),
  staticMeta('/midi/devices/expression/*', { windowLabel: 'Expression', breadcrumbs: [{ label: 'MIDI Services', to: '/midi/connections' }, { label: 'Devices', to: '/midi/devices' }, { label: 'Expression' }] }),
  staticMeta('/midi/devices/voodoo-lab-ground-control-pro/*', { windowLabel: 'Ground Control Pro', breadcrumbs: [{ label: 'MIDI Services', to: '/midi/connections' }, { label: 'Devices', to: '/midi/devices' }, { label: 'Ground Control Pro' }] }),
  staticMeta('/midi/devices/ableton-push-3/*', { windowLabel: 'Push 3', breadcrumbs: [{ label: 'MIDI Services', to: '/midi/connections' }, { label: 'Devices', to: '/midi/devices' }, { label: 'Push 3' }] }),
  staticMeta('/midi/devices/native-instruments-maschine-mk1', { windowLabel: 'Maschine MK1', breadcrumbs: [{ label: 'MIDI Services', to: '/midi/connections' }, { label: 'Devices', to: '/midi/devices' }, { label: 'Maschine MK1' }] }),
  staticMeta('/midi/devices/mackie-mcu-pro', { windowLabel: 'MCU Pro', breadcrumbs: [{ label: 'MIDI Services', to: '/midi/connections' }, { label: 'Devices', to: '/midi/devices' }, { label: 'MCU Pro' }] }),
  staticMeta('/midi/devices/novation-launch-control-xl', { windowLabel: 'Launch Control', breadcrumbs: [{ label: 'MIDI Services', to: '/midi/connections' }, { label: 'Devices', to: '/midi/devices' }, { label: 'Launch Control' }] }),
  staticMeta('/midi/devices/meloaudio-midi-commander', { windowLabel: 'MIDI Commander', breadcrumbs: [{ label: 'MIDI Services', to: '/midi/connections' }, { label: 'Devices', to: '/midi/devices' }, { label: 'MIDI Commander' }] }),
  staticMeta('/maschine', { windowLabel: 'Maschine', breadcrumbs: [{ label: 'MIDI Services', to: '/midi/connections' }, { label: 'Maschine' }] }),
  staticMeta('/mcu', { windowLabel: 'MCU Pro', breadcrumbs: [{ label: 'MIDI Services', to: '/midi/connections' }, { label: 'MCU Pro' }] }),
  staticMeta('/launch-control', { windowLabel: 'Launch Control', breadcrumbs: [{ label: 'MIDI Services', to: '/midi/connections' }, { label: 'Launch Control' }] }),
  staticMeta('/midi-commander', { windowLabel: 'MIDI Commander', breadcrumbs: [{ label: 'MIDI Services', to: '/midi/connections' }, { label: 'MIDI Commander' }] }),
  staticMeta('/labs/push-surface', { windowLabel: 'Push Surface', breadcrumbs: [{ label: 'MIDI Services', to: '/midi/connections' }, { label: 'Push Surface' }] }),
  // T2491 (2026-05-02 cleanup) — /midi/* and /midi-hub/* wildcards
  // live AFTER all the deeper /midi/devices/<profile>/* rules above
  // so the resolver returns the most-specific match. resolveShellRouteMeta
  // iterates in array order and returns the first matched rule.
  {
    path: '/midi/*',
    resolve: (_params, pathname) => {
      const segment = pathname.split('/').filter(Boolean)[1]
      return {
        windowLabel: segment ? `MIDI ${startCase(segment)}` : 'MIDI Services',
        breadcrumbs: [{ label: 'MIDI Services', to: '/midi/connections' }, ...(segment ? [{ label: startCase(segment) }] : [])],
      }
    },
  },
  // Legacy /midi-hub/* fallback for stale operator bookmarks. The
  // breadcrumbs already point at canonical /midi/connections.
  {
    path: '/midi-hub/*',
    resolve: (_params, pathname) => {
      const segment = pathname.split('/').filter(Boolean)[1]
      return {
        windowLabel: segment ? `MIDI ${startCase(segment)}` : 'MIDI Services',
        breadcrumbs: [{ label: 'MIDI Services', to: '/midi/connections' }, ...(segment ? [{ label: startCase(segment) }] : [])],
      }
    },
  },
]

export function resolveShellRouteMeta(pathname: string): ShellRouteMeta | null {
  for (const rule of RULES) {
    const matched = matchPath({ path: rule.path, end: true }, pathname)
    if (matched) {
      return rule.resolve(matched.params as ResolverParams, pathname)
    }
  }
  return null
}
