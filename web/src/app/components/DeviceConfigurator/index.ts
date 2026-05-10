/**
 * T2499-A — Configurator framework public surface.
 *
 * Phase 0 of the T2499 mega-epic (2026-05-09) extends the original
 * MIDI-only Learn module to handle MIDI / HID / AVDECC events.
 * Both the new generic `LearnModule` and the legacy compatibility
 * shim `MidiLearnModule` are exported.
 */

export { DeviceConfiguratorShell } from './DeviceConfiguratorShell'
export { DeviceConfiguratorStatusCard } from './DeviceConfiguratorStatusCard'
export { DevicePackPicker } from './DevicePackPicker'

// Generic, kind-agnostic Learn module (preferred for new packs).
export { LearnModule, describeDeviceEvent } from './LearnModule'
export type { DeviceLearnSubmission } from './LearnModule'

// MIDI-only compatibility shim — kept stable for existing imports.
export { MidiLearnModule } from './MidiLearnModule'
export type {
  BrainSlotChoice,
  MidiEventSubscriber,
  MidiLearnEvent,
  MidiLearnSubmission,
} from './MidiLearnModule'

export {
  buildBrainSlotPayload,
  buildDeviceBindingEntry,
  eventToSource,
  stableStringify,
  submitBrainSlotBinding,
  submitConfiguratorBinding,
  submitDeviceBinding,
} from './bindingsWriter'
export type {
  BindingsWriterOptions,
  ConfiguratorBindingResult,
  ConfiguratorDeviceBindingResult,
} from './bindingsWriter'

export { createMidiLearnPollingSubscriber } from './midiLearnPollingSubscriber'
export { createDeviceLearnPollingSubscriber } from './deviceLearnPollingSubscriber'

export type {
  AvdeccDeviceLearnEvent,
  ConfiguratorPackDescriptor,
  ConfiguratorPrimitive,
  ConfiguratorTabContext,
  ConfiguratorTabDescriptor,
  DeviceControlKind,
  DeviceDetectionStatus,
  DeviceEventSubscriber,
  DeviceLearnEvent,
  DevicePresence,
  HidDeviceLearnEvent,
  MidiDeviceLearnEvent,
} from './types'
