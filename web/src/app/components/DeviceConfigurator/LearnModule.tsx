/**
 * Generic device Learn module (Phase 0 of the T2499 mega-epic).
 *
 * Replaces the MIDI-specific `MidiLearnModule` while preserving its
 * UX. Accepts any `DeviceLearnEvent` (MIDI / HID / AVDECC) via a
 * single `subscribe` callback and renders a kind-aware confirmation
 * panel before invoking `onSubmit`.
 *
 * The MIDI-only `MidiLearnModule` is now a thin compatibility shim
 * over this module so existing tests and imports keep working.
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
import type { DeviceEventSubscriber, DeviceLearnEvent } from './types'

export interface BrainSlotChoice {
  id: string
  label: string
  description?: string
}

export interface DeviceLearnSubmission {
  slot: BrainSlotChoice
  event: DeviceLearnEvent
  notes: string
}

interface LearnModuleProps {
  brainSlots: BrainSlotChoice[]
  /** Plug in a real or fake event subscriber. */
  subscribeToEvents: DeviceEventSubscriber
  /**
   * Called when the operator confirms a captured event for a slot.
   * The bindings writer is responsible for routing MIDI events to
   * `/api/midi/bindings` and non-MIDI events to the per-pack
   * override store.
   */
  onSubmit?: (submission: DeviceLearnSubmission) => void | Promise<void>
  /** Optional title override (default: "Bind any controller (Learn)"). */
  title?: string
  /** Optional subtitle override. */
  subtitle?: string
}

type LearnState =
  | { kind: 'idle' }
  | { kind: 'listening'; slot: BrainSlotChoice }
  | { kind: 'captured'; slot: BrainSlotChoice; event: DeviceLearnEvent }
  | { kind: 'submitting'; slot: BrainSlotChoice; event: DeviceLearnEvent }
  | { kind: 'submitted'; slot: BrainSlotChoice; event: DeviceLearnEvent }
  | { kind: 'error'; message: string }

/**
 * Format a captured event for the operator-facing confirmation line.
 * Each kind gets its own readable shape.
 */
export function describeDeviceEvent(event: DeviceLearnEvent): string {
  switch (event.kind) {
    case 'midi': {
      const value = event.data2 !== undefined ? `, data2=${event.data2}` : ''
      return `${event.status} ch${event.channel} data1=${event.data1}${value}`
    }
    case 'hid': {
      return `hid ${event.control_kind}=${event.control_id} value=${event.value.toFixed(3)}`
    }
    case 'avdecc': {
      return `avdecc entity=${event.entity_id} desc=0x${event.descriptor_type.toString(16)}#${event.descriptor_index}`
    }
  }
}

export function LearnModule({
  brainSlots,
  subscribeToEvents,
  onSubmit,
  title,
  subtitle,
}: LearnModuleProps) {
  const [selectedSlot, setSelectedSlot] = useState<BrainSlotChoice | null>(
    brainSlots.length > 0 ? brainSlots[0] : null,
  )
  const [notes, setNotes] = useState<string>('')
  const [state, setState] = useState<LearnState>({ kind: 'idle' })
  const teardownRef = useRef<(() => void) | null>(null)

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
    teardownRef.current = subscribeToEvents((event) => {
      stop()
      setState((prev) =>
        prev.kind === 'listening'
          ? { kind: 'captured', slot: prev.slot, event }
          : prev,
      )
    })
  }, [selectedSlot, stop, subscribeToEvents])

  const handleCancel = useCallback(() => {
    stop()
    setState({ kind: 'idle' })
  }, [stop])

  const handleConfirm = useCallback(async () => {
    if (state.kind !== 'captured') return
    const submission: DeviceLearnSubmission = {
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

  const headerTitle = title ?? 'Bind any controller (Learn)'
  const headerSubtitle =
    subtitle ??
    'Pick a brain slot, press a control on your device, and confirm the captured event to bind it.'

  return (
    <Section
      className="midi-learn"
      data-testid="midi-learn-module"
      aria-label={headerTitle}
    >
      <Tile className="midi-learn__tile">
        <header className="midi-learn__header">
          <h3 className="midi-learn__title">{headerTitle}</h3>
          <p className="midi-learn__subtitle">{headerSubtitle}</p>
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
                {describeDeviceEvent(state.event)}
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
              <code>{describeDeviceEvent(state.event)}</code>.
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
            title="Learn failed"
            subtitle={state.message}
          />
        ) : null}
      </Tile>
    </Section>
  )
}
