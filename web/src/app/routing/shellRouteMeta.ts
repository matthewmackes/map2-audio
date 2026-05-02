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

const RULES: ShellRouteRule[] = [
  staticMeta('/workspace', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Overview',
    breadcrumbs: [{ label: 'Node Ops', to: '/workspace' }, { label: 'Overview' }],
  }),
  staticMeta('/workspace/platforms/overview', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Overview',
    breadcrumbs: [{ label: 'Node Ops', to: '/workspace' }, { label: 'Platforms', to: '/workspace/platforms/overview' }, { label: 'Overview' }],
  }),
  staticMeta('/platforms/overview', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Overview',
    breadcrumbs: [{ label: 'Node Ops', to: '/workspace' }, { label: 'Platforms', to: '/workspace/platforms/overview' }, { label: 'Overview' }],
  }),
  staticMeta('/workspace/platforms/management', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Device Manager',
    breadcrumbs: [{ label: 'Node Ops', to: '/workspace' }, { label: 'Platforms', to: '/workspace/platforms/overview' }, { label: 'Device Manager' }],
  }),
  staticMeta('/platforms/management', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Device Manager',
    breadcrumbs: [{ label: 'Node Ops', to: '/workspace' }, { label: 'Platforms', to: '/workspace/platforms/overview' }, { label: 'Device Manager' }],
  }),
  staticMeta('/workspace/platforms/audio-engine', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Audio Engine',
    breadcrumbs: [{ label: 'Node Ops', to: '/workspace' }, { label: 'Platforms', to: '/workspace/platforms/overview' }, { label: 'Audio Engine' }],
  }),
  staticMeta('/platforms/audio-engine', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Audio Engine',
    breadcrumbs: [{ label: 'Node Ops', to: '/workspace' }, { label: 'Platforms', to: '/workspace/platforms/overview' }, { label: 'Audio Engine' }],
  }),
  staticMeta('/workspace/platforms/avb-routing', {
    sectionLabel: 'Node Ops',
    windowLabel: 'AVB Routing',
    breadcrumbs: [{ label: 'Node Ops', to: '/workspace' }, { label: 'Platforms', to: '/workspace/platforms/overview' }, { label: 'AVB Routing' }],
  }),
  staticMeta('/platforms/avb-routing', {
    sectionLabel: 'Node Ops',
    windowLabel: 'AVB Routing',
    breadcrumbs: [{ label: 'Node Ops', to: '/workspace' }, { label: 'Platforms', to: '/workspace/platforms/overview' }, { label: 'AVB Routing' }],
  }),
  staticMeta('/workspace/platforms/network-discovery', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Network Discovery',
    breadcrumbs: [{ label: 'Node Ops', to: '/workspace' }, { label: 'Platforms', to: '/workspace/platforms/overview' }, { label: 'Network Discovery' }],
  }),
  staticMeta('/platforms/network-discovery', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Network Discovery',
    breadcrumbs: [{ label: 'Node Ops', to: '/workspace' }, { label: 'Platforms', to: '/workspace/platforms/overview' }, { label: 'Network Discovery' }],
  }),
  staticMeta('/workspace/platforms/cluster-dashboard', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Cluster Dashboard',
    breadcrumbs: [{ label: 'Node Ops', to: '/workspace' }, { label: 'Platforms', to: '/workspace/platforms/overview' }, { label: 'Cluster Dashboard' }],
  }),
  staticMeta('/platforms/cluster-dashboard', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Cluster Dashboard',
    breadcrumbs: [{ label: 'Node Ops', to: '/workspace' }, { label: 'Platforms', to: '/workspace/platforms/overview' }, { label: 'Cluster Dashboard' }],
  }),
  staticMeta('/workspace/platforms/midpoint', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Midpoint',
    breadcrumbs: [{ label: 'Node Ops', to: '/workspace' }, { label: 'Platforms', to: '/workspace/platforms/overview' }, { label: 'Midpoint' }],
  }),
  staticMeta('/platforms/midpoint', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Midpoint',
    breadcrumbs: [{ label: 'Node Ops', to: '/workspace' }, { label: 'Platforms', to: '/workspace/platforms/overview' }, { label: 'Midpoint' }],
  }),
  staticMeta('/platforms/api-webhooks', {
    sectionLabel: 'Node Ops',
    windowLabel: 'API Webhooks',
    breadcrumbs: [{ label: 'Node Ops', to: '/workspace' }, { label: 'Platforms', to: '/workspace/platforms/overview' }, { label: 'API Webhooks' }],
  }),
  staticMeta('/workspace/platforms/api-webhooks', {
    sectionLabel: 'Node Ops',
    windowLabel: 'API Webhooks',
    breadcrumbs: [{ label: 'Node Ops', to: '/workspace' }, { label: 'Platforms', to: '/workspace/platforms/overview' }, { label: 'API Webhooks' }],
  }),
  staticMeta('/workspace/platforms/adoption', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Adoption',
    breadcrumbs: [{ label: 'Node Ops', to: '/workspace' }, { label: 'Platforms', to: '/workspace/platforms/overview' }, { label: 'Adoption' }],
  }),
  staticMeta('/platforms/adoption', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Adoption',
    breadcrumbs: [{ label: 'Node Ops', to: '/workspace' }, { label: 'Platforms', to: '/workspace/platforms/overview' }, { label: 'Adoption' }],
  }),
  staticMeta('/workspace/platforms/theme', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Theme',
    breadcrumbs: [{ label: 'Node Ops', to: '/workspace' }, { label: 'Platforms', to: '/workspace/platforms/overview' }, { label: 'Theme' }],
  }),
  staticMeta('/platforms/theme', {
    sectionLabel: 'Node Ops',
    windowLabel: 'Theme',
    breadcrumbs: [{ label: 'Node Ops', to: '/workspace' }, { label: 'Platforms', to: '/workspace/platforms/overview' }, { label: 'Theme' }],
  }),
  staticMeta('/workspace/platforms/about', {
    sectionLabel: 'Node Ops',
    windowLabel: 'About',
    breadcrumbs: [{ label: 'Node Ops', to: '/workspace' }, { label: 'Platforms', to: '/workspace/platforms/overview' }, { label: 'About' }],
  }),
  staticMeta('/platforms/about', {
    sectionLabel: 'Node Ops',
    windowLabel: 'About',
    breadcrumbs: [{ label: 'Node Ops', to: '/workspace' }, { label: 'Platforms', to: '/workspace/platforms/overview' }, { label: 'About' }],
  }),
  staticMeta('/workspace/artifacts', {
    windowLabel: 'Audio Artifacts',
    breadcrumbs: [{ label: 'Workspace', to: '/workspace' }, { label: 'Audio Artifacts' }],
  }),
  staticMeta('/workspace/artifacts/discover', {
    windowLabel: 'Discover Artifacts',
    breadcrumbs: [{ label: 'Workspace', to: '/workspace' }, { label: 'Audio Artifacts', to: '/workspace/artifacts' }, { label: 'Discover' }],
  }),
  staticMeta('/brain', { windowLabel: 'Brain', breadcrumbs: [{ label: 'Workspace', to: '/workspace' }, { label: 'Brain' }] }),
  staticMeta('/chains', { sectionLabel: 'Node Ops', windowLabel: 'Chains', breadcrumbs: [{ label: 'Node Ops', to: '/workspace' }, { label: 'Chains' }] }),
  staticMeta('/metering', { windowLabel: 'Metering', breadcrumbs: [{ label: 'Workspace', to: '/workspace' }, { label: 'Metering' }] }),
  staticMeta('/pipewire', { windowLabel: 'PipeWire', breadcrumbs: [{ label: 'Workspace', to: '/workspace' }, { label: 'PipeWire' }] }),
  staticMeta('/state-authority', { windowLabel: 'State Authority', breadcrumbs: [{ label: 'Workspace', to: '/workspace' }, { label: 'State Authority' }] }),
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
