/**
 * T2499-A slice 2 — Configurator framework types.
 *
 * Shape contract between the framework shell and per-device tab
 * implementations. Mirrors the Python protocols in
 * `app/services/devices/_shared/protocols.py` so the wire format is
 * stable across slices.
 *
 * Phase-0 (T2499 mega-epic) extension: `DeviceLearnEvent` is a
 * discriminated union so the same Learn module + bindings writer can
 * service MIDI, HID (Maschine MK1), and AVDECC (la_avdecc entity)
 * packs. Existing `MidiLearnEvent` is preserved as the `kind: 'midi'`
 * arm; legacy code paths keep working.
 */
import type * as React from 'react'

export type DevicePresence =
  | 'not_present'
  | 'present_stock'
  | 'present_custom'
  | 'present_bootloader'
  | 'present_unknown'

export interface DeviceDetectionStatus {
  pack_id: string
  presence: DevicePresence
  transport: string
  serial?: string | null
  raw?: Record<string, unknown>
}

export type ConfiguratorPrimitive =
  | 'detection'
  | 'discovery'
  | 'override'
  | 'install'
  | 'push'

/**
 * Per-device tab descriptor. Each device-pack contributes zero or
 * more tabs; the shell renders them in `priority` order (low →
 * high) under the status card.
 */
export interface ConfiguratorTabDescriptor {
  id: string
  label: string
  /**
   * Lower priority renders first. Default `100`.
   */
  priority?: number
  /**
   * Only render this tab when the detector reports one of these
   * presence states. If omitted, the tab is always rendered.
   */
  visibleFor?: DevicePresence[]
  /**
   * The tab body. Receives the latest detection status so it can
   * react to live presence changes without re-fetching.
   */
  render: (ctx: ConfiguratorTabContext) => React.ReactNode
}

export interface ConfiguratorTabContext {
  status: DeviceDetectionStatus | null
  /**
   * Pack-level metadata supplied at registration. Free-form so tabs
   * can read e.g. vendor URLs, support links, default SysEx ports.
   */
  metadata: Record<string, unknown>
  /**
   * Force a status re-fetch (e.g. after the operator finishes a
   * destructive action like a firmware flash).
   */
  refetchStatus: () => Promise<unknown>
}

/**
 * What a per-device-pack module exports to the framework.
 */
export interface ConfiguratorPackDescriptor {
  packId: string
  displayName: string
  vendorName?: string
  /**
   * One-line operator-facing summary. Renders under the title in
   * the status card. Keep short — Carbon `Tile` truncates.
   */
  summary?: string
  supportedPrimitives: ConfiguratorPrimitive[]
  /**
   * TanStack Query function that fetches the latest detection
   * status. The shell handles retry/polling/cache; the pack just
   * supplies the call.
   */
  fetchStatus: () => Promise<DeviceDetectionStatus>
  tabs: ConfiguratorTabDescriptor[]
  metadata?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Phase-0 (T2499) — generic Learn event union
// ---------------------------------------------------------------------------

export type DeviceControlKind = 'pad' | 'encoder' | 'button' | 'pressure' | 'fader'

/**
 * MIDI Learn event arm — the original T2499-A shape. Preserved as
 * the `kind: 'midi'` variant so existing MIDI flows are unchanged.
 */
export interface MidiDeviceLearnEvent {
  kind: 'midi'
  /** "cc", "pc", "note_on", "note_off" — display + binding shape. */
  status: string
  /** MIDI channel 1..16. */
  channel: number
  /** CC#, program#, or note#. */
  data1: number
  /** Velocity / value when applicable. */
  data2?: number
  /** Coarse source identity (e.g. "alsa-seq:Foo:0") if known. */
  source_id?: string
  /** Wall-clock timestamp from the producer. */
  timestamp?: string
}

/**
 * HID Learn event — Maschine MK1 pads / encoders / buttons. Captures
 * the raw HID-side identity of a control plus its instantaneous
 * value so calibration + binding can use the same surface.
 */
export interface HidDeviceLearnEvent {
  kind: 'hid'
  /** USB vendor id (e.g. 0x17cc for Native Instruments). */
  vendor_id: number
  /** USB product id (e.g. 0x0808 for Maschine MK1). */
  product_id: number
  /** Stable identifier for the specific control (e.g. "pad-7", "encoder-3"). */
  control_id: string
  /** What kind of control fired the event. */
  control_kind: DeviceControlKind
  /** Instantaneous value: 0..1 for pressure/encoder ticks, 0/1 for buttons. */
  value: number
  /** Coarse source identity (e.g. "hidraw:0001:1234"). */
  source_id?: string
  /** Wall-clock timestamp from the producer. */
  timestamp?: string
}

/**
 * AVDECC Learn event — operator clicked an entity descriptor in the
 * browser, or la_avdecc emitted a value-change observer callback.
 */
export interface AvdeccDeviceLearnEvent {
  kind: 'avdecc'
  /** la_avdecc entity id (64-bit, hex string for JSON safety). */
  entity_id: string
  /** IEEE 1722.1 descriptor type code (0x0005 = STREAM_INPUT, etc.). */
  descriptor_type: number
  /** Index within the descriptor type. */
  descriptor_index: number
  /**
   * Free-form change payload — for stream-format changes the new
   * 64-bit format code (hex string); for control changes the new
   * value; for connect/disconnect the talker entity id + stream idx.
   */
  value_change: Record<string, unknown>
  source_id?: string
  timestamp?: string
}

/**
 * Discriminated union of every event kind a Configurator pack can
 * emit. New device classes (BLE-MIDI, OSC, ArtNet, ...) extend this
 * union and the LearnModule's display path.
 */
export type DeviceLearnEvent =
  | MidiDeviceLearnEvent
  | HidDeviceLearnEvent
  | AvdeccDeviceLearnEvent

/**
 * Subscribe to the next device event. Implementations call `onEvent`
 * once per inbound event and return a teardown handle.
 */
export type DeviceEventSubscriber = (
  onEvent: (event: DeviceLearnEvent) => void,
) => () => void
