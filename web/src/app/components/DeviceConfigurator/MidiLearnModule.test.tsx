import '@testing-library/jest-dom'
import * as React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import {
  MidiLearnModule,
  type BrainSlotChoice,
  type MidiEventSubscriber,
  type MidiLearnEvent,
} from './MidiLearnModule'

beforeAll(() => {
  if (typeof window.matchMedia !== 'function') {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    })
  }
})

const SLOTS: BrainSlotChoice[] = [
  { id: 'slot-1', label: 'Brain slot 1' },
  { id: 'slot-2', label: 'Brain slot 2' },
]

interface FakeSubscriber {
  subscribe: MidiEventSubscriber
  emit: (event: MidiLearnEvent) => void
  isSubscribed: () => boolean
  unsubscribeCalls: number
}

function makeFakeSubscriber(): FakeSubscriber {
  let onEvent: ((event: MidiLearnEvent) => void) | null = null
  let unsubscribeCalls = 0
  return {
    subscribe(handler) {
      onEvent = handler
      return () => {
        unsubscribeCalls += 1
        onEvent = null
      }
    },
    emit(event) {
      onEvent?.(event)
    },
    isSubscribed: () => onEvent !== null,
    get unsubscribeCalls() {
      return unsubscribeCalls
    },
  } as unknown as FakeSubscriber
}

describe('MidiLearnModule', () => {
  it('renders the start button disabled when no slots are available', () => {
    render(
      <MidiLearnModule
        brainSlots={[]}
        subscribeToMidiEvents={() => () => undefined}
      />,
    )
    expect(screen.getByTestId('midi-learn-start')).toBeDisabled()
  })

  it('starts a subscription when the operator clicks Start listening', () => {
    const sub = makeFakeSubscriber()
    render(
      <MidiLearnModule brainSlots={SLOTS} subscribeToMidiEvents={sub.subscribe} />,
    )
    expect(sub.isSubscribed()).toBe(false)
    fireEvent.click(screen.getByTestId('midi-learn-start'))
    expect(sub.isSubscribed()).toBe(true)
    expect(screen.getByTestId('midi-learn-listening')).toBeInTheDocument()
  })

  it('captures the first inbound event and unsubscribes', async () => {
    const sub = makeFakeSubscriber()
    render(
      <MidiLearnModule brainSlots={SLOTS} subscribeToMidiEvents={sub.subscribe} />,
    )
    fireEvent.click(screen.getByTestId('midi-learn-start'))
    act(() => {
      sub.emit({ status: 'cc', channel: 1, data1: 64, data2: 127 })
    })
    await waitFor(() =>
      expect(screen.getByTestId('midi-learn-captured')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('midi-learn-captured-detail')).toHaveTextContent(
      'cc ch1 data1=64, data2=127',
    )
    expect(sub.isSubscribed()).toBe(false)
  })

  it('ignores subsequent events after the first capture', async () => {
    const sub = makeFakeSubscriber()
    render(
      <MidiLearnModule brainSlots={SLOTS} subscribeToMidiEvents={sub.subscribe} />,
    )
    fireEvent.click(screen.getByTestId('midi-learn-start'))
    act(() => {
      sub.emit({ status: 'cc', channel: 1, data1: 64, data2: 127 })
    })
    await waitFor(() =>
      expect(screen.getByTestId('midi-learn-captured-detail')).toHaveTextContent(
        'data1=64',
      ),
    )
    // Second event arrives after unsubscribe — must not change the captured detail.
    act(() => {
      sub.emit({ status: 'pc', channel: 2, data1: 7 })
    })
    expect(screen.getByTestId('midi-learn-captured-detail')).toHaveTextContent(
      'data1=64',
    )
  })

  it('cancel resets state and unsubscribes', () => {
    const sub = makeFakeSubscriber()
    render(
      <MidiLearnModule brainSlots={SLOTS} subscribeToMidiEvents={sub.subscribe} />,
    )
    fireEvent.click(screen.getByTestId('midi-learn-start'))
    expect(sub.isSubscribed()).toBe(true)
    fireEvent.click(screen.getByText('Cancel'))
    expect(sub.isSubscribed()).toBe(false)
    expect(screen.getByTestId('midi-learn-start')).toBeInTheDocument()
  })

  it('confirm dispatches the captured event + slot + notes to onSubmit', async () => {
    const sub = makeFakeSubscriber()
    const onSubmit = jest.fn().mockResolvedValue(undefined)
    render(
      <MidiLearnModule
        brainSlots={SLOTS}
        subscribeToMidiEvents={sub.subscribe}
        onSubmit={onSubmit}
      />,
    )
    fireEvent.change(screen.getByTestId('midi-learn-notes'), {
      target: { value: 'expression pedal' },
    })
    fireEvent.click(screen.getByTestId('midi-learn-start'))
    act(() => {
      sub.emit({
        status: 'cc',
        channel: 1,
        data1: 7,
        data2: 64,
        source_id: 'alsa-seq:Stagepiano:0',
      })
    })
    await waitFor(() =>
      expect(screen.getByTestId('midi-learn-confirm')).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByTestId('midi-learn-confirm'))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith({
      slot: SLOTS[0],
      event: expect.objectContaining({
        status: 'cc',
        channel: 1,
        data1: 7,
        data2: 64,
        source_id: 'alsa-seq:Stagepiano:0',
      }),
      notes: 'expression pedal',
    })
    await waitFor(() =>
      expect(screen.getByTestId('midi-learn-submitted')).toBeInTheDocument(),
    )
  })

  it('surfaces an onSubmit error and lets the operator try again', async () => {
    const sub = makeFakeSubscriber()
    const onSubmit = jest.fn().mockRejectedValue(new Error('binding upsert failed'))
    render(
      <MidiLearnModule
        brainSlots={SLOTS}
        subscribeToMidiEvents={sub.subscribe}
        onSubmit={onSubmit}
      />,
    )
    fireEvent.click(screen.getByTestId('midi-learn-start'))
    act(() => {
      sub.emit({ status: 'cc', channel: 1, data1: 7 })
    })
    await screen.findByTestId('midi-learn-confirm')
    fireEvent.click(screen.getByTestId('midi-learn-confirm'))
    expect(
      await screen.findByText('binding upsert failed'),
    ).toBeInTheDocument()
    // Start button is back so the operator can retry.
    fireEvent.click(screen.getByTestId('midi-learn-start'))
    expect(sub.isSubscribed()).toBe(true)
  })

  it('Try again resets back to idle without calling onSubmit', async () => {
    const sub = makeFakeSubscriber()
    const onSubmit = jest.fn()
    render(
      <MidiLearnModule
        brainSlots={SLOTS}
        subscribeToMidiEvents={sub.subscribe}
        onSubmit={onSubmit}
      />,
    )
    fireEvent.click(screen.getByTestId('midi-learn-start'))
    act(() => {
      sub.emit({ status: 'cc', channel: 1, data1: 7 })
    })
    await screen.findByTestId('midi-learn-retry')
    fireEvent.click(screen.getByTestId('midi-learn-retry'))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByTestId('midi-learn-start')).toBeInTheDocument()
  })

  it('unmount tears down the subscription', () => {
    const sub = makeFakeSubscriber()
    const { unmount } = render(
      <MidiLearnModule brainSlots={SLOTS} subscribeToMidiEvents={sub.subscribe} />,
    )
    fireEvent.click(screen.getByTestId('midi-learn-start'))
    expect(sub.isSubscribed()).toBe(true)
    unmount()
    expect(sub.isSubscribed()).toBe(false)
  })
})
