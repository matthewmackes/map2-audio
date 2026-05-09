/**
 * T2499-A slice 5 — MIDI Learn fallback for unknown controllers.
 *
 * The operator clicks "Bind any controller" in the device-pack
 * picker (slice 4), arrives here, picks a target brain slot, then
 * presses a single control on whatever MIDI controller they have on
 * hand. The module captures the next inbound event, displays it for
 * confirmation, and (in slice 6) commits the binding to MIDI
 * Services as `consumer_type=brain_slot`.
 *
 * The event source is supplied via the `useMidiEvents` prop so the
 * UI is testable without a live websocket. Slice 9 wires this
 * against the production MIDI Services event stream.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Dropdown,
  InlineLoading,
  InlineNotification,
  Section,
  Tag,
  TextInput,
  Tile,
} from '@carbon/react'
import { Connect, Reset } from '@carbon/icons-react'

import './MidiLearnModule.css'

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

export interface BrainSlotChoice {
  id: string
  label: string
  description?: string
}

export interface MidiLearnSubmission {
  slot: BrainSlotChoice
  event: MidiLearnEvent
  notes: string
}

/**
 * Subscribe to the next MIDI event. Implementations call `onEvent`
 * once per inbound event and return a teardown handle. The module
 * unsubscribes automatically on unmount, on stop, and after a
 * successful capture.
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
   * Slice 6 wires this to the bindings writer.
   */
  onSubmit?: (submission: MidiLearnSubmission) => void | Promise<void>
}

type LearnState =
  | { kind: 'idle' }
  | { kind: 'listening'; slot: BrainSlotChoice }
  | { kind: 'captured'; slot: BrainSlotChoice; event: MidiLearnEvent }
  | { kind: 'submitting'; slot: BrainSlotChoice; event: MidiLearnEvent }
  | { kind: 'submitted'; slot: BrainSlotChoice; event: MidiLearnEvent }
  | { kind: 'error'; message: string }

function describeEvent(event: MidiLearnEvent): string {
  const value = event.data2 !== undefined ? `, data2=${event.data2}` : ''
  return `${event.status} ch${event.channel} data1=${event.data1}${value}`
}

export function MidiLearnModule({
  brainSlots,
  subscribeToMidiEvents,
  onSubmit,
}: MidiLearnModuleProps) {
  const [selectedSlot, setSelectedSlot] = useState<BrainSlotChoice | null>(
    brainSlots.length > 0 ? brainSlots[0] : null,
  )
  const [notes, setNotes] = useState<string>('')
  const [state, setState] = useState<LearnState>({ kind: 'idle' })
  const teardownRef = useRef<(() => void) | null>(null)

  // Tear down any active subscription on unmount.
  useEffect(
    () => () => {
      teardownRef.current?.()
      teardownRef.current = null
    },
    [],
  )

  const stop = useCallback(() => {
    teardownRef.current?.()
    teardownRef.current = null
  }, [])

  const handleStart = useCallback(() => {
    if (!selectedSlot) {
      setState({ kind: 'error', message: 'Pick a brain slot first.' })
      return
    }
    stop()
    setState({ kind: 'listening', slot: selectedSlot })
    teardownRef.current = subscribeToMidiEvents((event) => {
      // Capture the first event, then unsubscribe.
      stop()
      setState((prev) =>
        prev.kind === 'listening'
          ? { kind: 'captured', slot: prev.slot, event }
          : prev,
      )
    })
  }, [selectedSlot, stop, subscribeToMidiEvents])

  const handleCancel = useCallback(() => {
    stop()
    setState({ kind: 'idle' })
  }, [stop])

  const handleConfirm = useCallback(async () => {
    if (state.kind !== 'captured') return
    const submission: MidiLearnSubmission = {
      slot: state.slot,
      event: state.event,
      notes,
    }
    setState({ kind: 'submitting', slot: state.slot, event: state.event })
    try {
      await onSubmit?.(submission)
      setState({ kind: 'submitted', slot: state.slot, event: state.event })
    } catch (error) {
      setState({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to commit the captured binding.',
      })
    }
  }, [notes, onSubmit, state])

  const handleAgain = useCallback(() => {
    setState({ kind: 'idle' })
  }, [])

  const dropdownItems = useMemo(
    () =>
      brainSlots.map((slot) => ({
        id: slot.id,
        label: slot.label,
        description: slot.description,
      })),
    [brainSlots],
  )

  const isListening = state.kind === 'listening'
  const isCaptured = state.kind === 'captured'
  const isSubmitting = state.kind === 'submitting'
  const isSubmitted = state.kind === 'submitted'

  return (
    <Section
      className="midi-learn"
      data-testid="midi-learn-module"
      aria-label="MIDI Learn — bind any controller"
    >
      <Tile className="midi-learn__tile">
        <header className="midi-learn__header">
          <h3 className="midi-learn__title">Bind any controller (MIDI Learn)</h3>
          <p className="midi-learn__subtitle">
            Pick a brain slot, press a control on your MIDI device, and confirm
            the captured event to bind it.
          </p>
        </header>

        <div className="midi-learn__row">
          <Dropdown
            id="midi-learn-slot"
            titleText="Brain slot"
            label="Pick a brain slot"
            items={dropdownItems}
            itemToString={(item) => (item ? (item as BrainSlotChoice).label : '')}
            selectedItem={
              selectedSlot
                ? dropdownItems.find((i) => i.id === selectedSlot.id) ?? null
                : null
            }
            onChange={(e) => {
              const next = e.selectedItem as BrainSlotChoice | null
              setSelectedSlot(next ?? null)
            }}
            disabled={isListening || isSubmitting}
            data-testid="midi-learn-slot-picker"
          />
        </div>

        <div className="midi-learn__row">
          <TextInput
            id="midi-learn-notes"
            labelText="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. expression pedal on Stagepiano channel 4"
            disabled={isListening || isSubmitting || isSubmitted}
            data-testid="midi-learn-notes"
          />
        </div>

        {state.kind === 'idle' || state.kind === 'error' ? (
          <div className="midi-learn__actions">
            <Button
              kind="primary"
              renderIcon={Connect}
              onClick={handleStart}
              disabled={!selectedSlot}
              data-testid="midi-learn-start"
            >
              Start listening
            </Button>
          </div>
        ) : null}

        {isListening ? (
          <div className="midi-learn__listening" data-testid="midi-learn-listening">
            <InlineLoading
              status="active"
              description={`Press a control… listening for ${state.slot.label}`}
            />
            <Button kind="ghost" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        ) : null}

        {isCaptured ? (
          <div className="midi-learn__captured" data-testid="midi-learn-captured">
            <Tag type="green" size="sm">
              Captured
            </Tag>
            <p>
              Event for <strong>{state.slot.label}</strong>:{' '}
              <code data-testid="midi-learn-captured-detail">
                {describeEvent(state.event)}
              </code>
              {state.event.source_id ? (
                <>
                  {' '}
                  from <code>{state.event.source_id}</code>
                </>
              ) : null}
            </p>
            <div className="midi-learn__actions">
              <Button
                kind="primary"
                onClick={handleConfirm}
                data-testid="midi-learn-confirm"
              >
                Bind to {state.slot.label}
              </Button>
              <Button
                kind="tertiary"
                renderIcon={Reset}
                onClick={handleAgain}
                data-testid="midi-learn-retry"
              >
                Try again
              </Button>
            </div>
          </div>
        ) : null}

        {isSubmitting ? (
          <InlineLoading
            status="active"
            description={`Committing binding for ${state.slot.label}…`}
          />
        ) : null}

        {isSubmitted ? (
          <div className="midi-learn__submitted" data-testid="midi-learn-submitted">
            <Tag type="green" size="sm">
              Bound
            </Tag>
            <p>
              {state.slot.label} is now bound to{' '}
              <code>{describeEvent(state.event)}</code>.
            </p>
            <Button kind="tertiary" onClick={handleAgain}>
              Bind another
            </Button>
          </div>
        ) : null}

        {state.kind === 'error' ? (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title="MIDI Learn failed"
            subtitle={state.message}
          />
        ) : null}
      </Tile>
    </Section>
  )
}
