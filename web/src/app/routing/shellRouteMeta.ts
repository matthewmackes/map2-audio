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
  staticMeta('/ground-control-pro', { windowLabel: 'Ground Control Pro', breadcrumbs: [{ label: 'MIDI Hub', to: '/midi-hub/connections' }, { label: 'Ground Control Pro' }] }),
  staticMeta('/expression', { windowLabel: 'Expression', breadcrumbs: [{ label: 'MIDI Hub', to: '/midi-hub/connections' }, { label: 'Expression' }] }),
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
  staticMeta('/midi/assignments', { windowLabel: 'MIDI Assignments', breadcrumbs: [{ label: 'MIDI Hub', to: '/midi-hub/connections' }, { label: 'Assignments' }] }),
  staticMeta('/midi-hub/connections', { windowLabel: 'MIDI Connections', breadcrumbs: [{ label: 'MIDI Hub', to: '/midi-hub/connections' }, { label: 'Connections' }] }),
  staticMeta('/midi-hub/presets', { windowLabel: 'MIDI Presets', breadcrumbs: [{ label: 'MIDI Hub', to: '/midi-hub/connections' }, { label: 'Presets' }] }),
  staticMeta('/midi-hub/transport', { windowLabel: 'MIDI Transport', breadcrumbs: [{ label: 'MIDI Hub', to: '/midi-hub/connections' }, { label: 'Transport' }] }),
  staticMeta('/midi-hub/events', { windowLabel: 'MIDI Events', breadcrumbs: [{ label: 'MIDI Hub', to: '/midi-hub/connections' }, { label: 'Events' }] }),
  staticMeta('/midi-hub/processing', { windowLabel: 'MIDI Processing', breadcrumbs: [{ label: 'MIDI Hub', to: '/midi-hub/connections' }, { label: 'Processing' }] }),
  staticMeta('/midi-hub/network', { windowLabel: 'MIDI Network', breadcrumbs: [{ label: 'MIDI Hub', to: '/midi-hub/connections' }, { label: 'Network' }] }),
  staticMeta('/midi-hub/lab', { windowLabel: 'MIDI Lab', breadcrumbs: [{ label: 'MIDI Hub', to: '/midi-hub/connections' }, { label: 'Lab' }] }),
  {
    path: '/midi-hub/*',
    resolve: (_params, pathname) => {
      const segment = pathname.split('/').filter(Boolean)[1]
      return {
        windowLabel: segment ? `MIDI ${startCase(segment)}` : 'MIDI Hub',
        breadcrumbs: [{ label: 'MIDI Hub', to: '/midi-hub/connections' }, ...(segment ? [{ label: startCase(segment) }] : [])],
      }
    },
  },
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
  staticMeta('/maschine', { windowLabel: 'Maschine', breadcrumbs: [{ label: 'MIDI Hub', to: '/midi-hub/connections' }, { label: 'Maschine' }] }),
  staticMeta('/mcu', { windowLabel: 'MCU Pro', breadcrumbs: [{ label: 'MIDI Hub', to: '/midi-hub/connections' }, { label: 'MCU Pro' }] }),
  staticMeta('/launch-control', { windowLabel: 'Launch Control', breadcrumbs: [{ label: 'MIDI Hub', to: '/midi-hub/connections' }, { label: 'Launch Control' }] }),
  staticMeta('/midi-commander', { windowLabel: 'MIDI Commander', breadcrumbs: [{ label: 'MIDI Hub', to: '/midi-hub/connections' }, { label: 'MIDI Commander' }] }),
  staticMeta('/labs/push-surface', { windowLabel: 'Push Surface', breadcrumbs: [{ label: 'MIDI Hub', to: '/midi-hub/connections' }, { label: 'Push Surface' }] }),
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
