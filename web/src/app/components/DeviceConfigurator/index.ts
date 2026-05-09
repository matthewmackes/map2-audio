/**
 * T2499-A — Configurator framework public surface.
 *
 * Slice 2 ships only the shell + types. Slice 3 wires MeloAudio onto
 * this shell as the parity test. Slice 4 onwards adds the pack
 * picker + MIDI Learn fallback + bindings writer.
 */

export { DeviceConfiguratorShell } from './DeviceConfiguratorShell'
export { DeviceConfiguratorStatusCard } from './DeviceConfiguratorStatusCard'
export { DevicePackPicker } from './DevicePackPicker'
export type {
  ConfiguratorPackDescriptor,
  ConfiguratorPrimitive,
  ConfiguratorTabContext,
  ConfiguratorTabDescriptor,
  DeviceDetectionStatus,
  DevicePresence,
} from './types'
