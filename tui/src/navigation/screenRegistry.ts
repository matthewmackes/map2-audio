import type { ScreenDefinition, ScreenId } from './types'

export const screenRegistry: ScreenDefinition[] = [
  { id: 'home', group: 'Audio', title: 'Signal Chains Live', shortTitle: 'Live', description: '8-slot live bypass, meters, and plugin order', keyHint: '1' },
  { id: 'metering', group: 'Audio', title: 'Metering', shortTitle: 'Meters', description: 'Live input and output levels', keyHint: '2' },
  { id: 'cpu', group: 'Audio', title: 'CPU', shortTitle: 'CPU', description: 'Performance counters and latency', keyHint: '3' },
  { id: 'audio-grid', group: 'Audio', title: 'Audio Grid', shortTitle: 'Grid', description: 'Signal-chain overview and plugin flow', keyHint: '4' },
  { id: 'pipewire', group: 'Platform', title: 'PipeWire', shortTitle: 'PW', description: 'PipeWire devices and graph status', keyHint: '5' },
  { id: 'midi-hub', group: 'Audio', title: 'MIDI Hub', shortTitle: 'MIDI', description: 'Devices, routing, and activity', keyHint: '6' },
  { id: 'devices', group: 'Platform', title: 'Devices', shortTitle: 'Devices', description: 'Connected audio and control devices', keyHint: '7' },
  { id: 'mpx1', group: 'Audio', title: 'MPX1', shortTitle: 'MPX1', description: 'Lexicon MPX1 control surface', keyHint: '8' },
  { id: 'cluster', group: 'Platform', title: 'Cluster', shortTitle: 'Cluster', description: 'Nodes, health, and deployment state', keyHint: '9' },
  { id: 'avb', group: 'Platform', title: 'AVB', shortTitle: 'AVB', description: 'AVB streams and route state' },
  { id: 'tesira', group: 'Platform', title: 'Tesira', shortTitle: 'Tesira', description: 'Tesira device and fleet summary' },
  { id: 'artifacts', group: 'Platform', title: 'Artifacts', shortTitle: 'Artifacts', description: 'Snapshots, captures, and exports' },
  { id: 'settings', group: 'Settings', title: 'Settings', shortTitle: 'Settings', description: 'Runtime preferences and node selection' },
  { id: 'diagnostics', group: 'Settings', title: 'Diagnostics', shortTitle: 'Diag', description: 'Connectivity, logs, and instrumentation' },
]

export const screenRegistryById: Record<ScreenId, ScreenDefinition> = Object.fromEntries(
  screenRegistry.map((screen) => [screen.id, screen]),
) as Record<ScreenId, ScreenDefinition>
