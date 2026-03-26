import type { ScreenDefinition, ScreenId } from './types'

export const screenRegistry: ScreenDefinition[] = [
  { id: 'home', title: 'Signal Chains Live', shortTitle: 'Live', description: '8-slot live bypass, meters, and plugin order', keyHint: '1' },
  { id: 'metering', title: 'Metering', shortTitle: 'Meters', description: 'Live input and output levels', keyHint: '2' },
  { id: 'cpu', title: 'CPU', shortTitle: 'CPU', description: 'Performance counters and latency', keyHint: '3' },
  { id: 'audio-grid', title: 'Audio Grid', shortTitle: 'Grid', description: 'Signal-chain overview and plugin flow', keyHint: '4' },
  { id: 'pipewire', title: 'PipeWire', shortTitle: 'PW', description: 'PipeWire devices and graph status', keyHint: '5' },
  { id: 'midi-hub', title: 'MIDI Hub', shortTitle: 'MIDI', description: 'Devices, routing, and activity', keyHint: '6' },
  { id: 'devices', title: 'Devices', shortTitle: 'Devices', description: 'Connected audio and control devices', keyHint: '7' },
  { id: 'mpx1', title: 'MPX1', shortTitle: 'MPX1', description: 'Lexicon MPX1 control surface', keyHint: '8' },
  { id: 'cluster', title: 'Cluster', shortTitle: 'Cluster', description: 'Nodes, health, and deployment state', keyHint: '9' },
  { id: 'avb', title: 'AVB', shortTitle: 'AVB', description: 'AVB streams and route state' },
  { id: 'tesira', title: 'Tesira', shortTitle: 'Tesira', description: 'Tesira device and fleet summary' },
  { id: 'artifacts', title: 'Artifacts', shortTitle: 'Artifacts', description: 'Snapshots, captures, and exports' },
  { id: 'settings', title: 'Settings', shortTitle: 'Settings', description: 'Runtime preferences and node selection' },
  { id: 'diagnostics', title: 'Diagnostics', shortTitle: 'Diag', description: 'Connectivity, logs, and instrumentation' },
]

export const screenRegistryById: Record<ScreenId, ScreenDefinition> = Object.fromEntries(
  screenRegistry.map((screen) => [screen.id, screen]),
) as Record<ScreenId, ScreenDefinition>
