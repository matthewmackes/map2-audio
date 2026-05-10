/**
 * MIDI-specific Learn module — Phase 0 compatibility shim.
 *
 * The original T2499-A `MidiLearnModule` shipped with a MIDI-only
 * event shape. Phase 0 of the T2499 mega-epic generalised the
 * underlying module to handle MIDI / HID / AVDECC events; this file
 * preserves the legacy public surface (`MidiLearnEvent`,
 * `MidiEventSubscriber`, `MidiLearnSubmission`, `MidiLearnModule`) so
 * existing imports and tests continue to work unchanged.
 *
 * New callers should import the generic `LearnModule` directly and
 * use the `DeviceLearnEvent` discriminated union.
 */
import {
  LearnModule,
  type BrainSlotChoice,
  type DeviceLearnSubmission,
} from './LearnModule'
import type { DeviceLearnEvent, MidiDeviceLearnEvent } from './types'

export type { BrainSlotChoice }

export interface MidiLearnEvent {
  /** "cc", "pc", "note_on", etc. — used purely for display + binding shape. */
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

export interface MidiLearnSubmission {
  slot: BrainSlotChoice
  event: MidiLearnEvent
  notes: string
}

/**
 * Subscribe to the next MIDI event. Implementations call `onEvent`
 * once per inbound event and return a teardown handle.
 */
export type MidiEventSubscriber = (
  onEvent: (event: MidiLearnEvent) => void,
) => () => void

interface MidiLearnModuleProps {
  brainSlots: BrainSlotChoice[]
  /** Plug in a real or fake event subscriber. */
  subscribeToMidiEvents: MidiEventSubscriber
  /**
   * Called when the operator confirms a captured event for a slot.
   */
  onSubmit?: (submission: MidiLearnSubmission) => void | Promise<void>
}

function midiEventToDeviceEvent(event: MidiLearnEvent): MidiDeviceLearnEvent {
  return { kind: 'midi', ...event }
}

function deviceEventToMidiEvent(event: DeviceLearnEvent): MidiLearnEvent | null {
  if (event.kind !== 'midi') return null
  // Strip the discriminator so legacy consumers see the original shape.
  const { kind: _kind, ...rest } = event
  return rest
}

export function MidiLearnModule({
  brainSlots,
  subscribeToMidiEvents,
  onSubmit,
}: MidiLearnModuleProps) {
  return (
    <LearnModule
      brainSlots={brainSlots}
      title="Bind any controller (MIDI Learn)"
      subtitle="Pick a brain slot, press a control on your MIDI device, and confirm the captured event to bind it."
      subscribeToEvents={(onEvent) =>
        subscribeToMidiEvents((midiEvent) => onEvent(midiEventToDeviceEvent(midiEvent)))
      }
      onSubmit={
        onSubmit
          ? async (submission: DeviceLearnSubmission) => {
              const midiEvent = deviceEventToMidiEvent(submission.event)
              if (midiEvent === null) {
                throw new Error(
                  `MidiLearnModule received non-MIDI event kind=${submission.event.kind}`,
                )
              }
              await onSubmit({
                slot: submission.slot,
                event: midiEvent,
                notes: submission.notes,
              })
            }
          : undefined
      }
    />
  )
}
