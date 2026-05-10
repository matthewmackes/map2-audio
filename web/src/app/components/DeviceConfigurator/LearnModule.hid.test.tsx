/**
 * Phase 0.4 — generic LearnModule with HID events.
 *
 * Verifies the kind-aware display path and that the module can
 * capture + submit HID events end-to-end. The same module also
 * services AVDECC events (covered in `LearnModule.avdecc.test.tsx`).
 */
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'

import { LearnModule, describeDeviceEvent } from './LearnModule'
import type { BrainSlotChoice, DeviceLearnSubmission } from './LearnModule'
import type { DeviceLearnEvent, HidDeviceLearnEvent } from './types'

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
  { id: 'slot-pad-a', label: 'Pad A' },
  { id: 'slot-pad-b', label: 'Pad B' },
]

function buildHidEvent(overrides: Partial<HidDeviceLearnEvent> = {}): HidDeviceLearnEvent {
  return {
    kind: 'hid',
    vendor_id: 0x17cc,
    product_id: 0x0808,
    control_id: 'pad-7',
    control_kind: 'pad',
    value: 0.62,
    source_id: 'hidraw:0001:1234',
    timestamp: '2026-05-09T12:00:00Z',
    ...overrides,
  }
}

describe('describeDeviceEvent — HID arm', () => {
  it('renders pad value with three-digit precision', () => {
    expect(describeDeviceEvent(buildHidEvent())).toBe(
      'hid pad=pad-7 value=0.620',
    )
  })

  it('handles encoder + button + pressure variants', () => {
    expect(
      describeDeviceEvent(buildHidEvent({ control_kind: 'encoder', control_id: 'enc-3', value: 1 })),
    ).toBe('hid encoder=enc-3 value=1.000')
    expect(
      describeDeviceEvent(buildHidEvent({ control_kind: 'button', control_id: 'btn-12', value: 1 })),
    ).toBe('hid button=btn-12 value=1.000')
    expect(
      describeDeviceEvent(buildHidEvent({ control_kind: 'pressure', control_id: 'pad-3', value: 0.05 })),
    ).toBe('hid pressure=pad-3 value=0.050')
  })
})

describe('LearnModule — HID capture + submit', () => {
  it('captures an HID event after Start listening and submits it on Bind', async () => {
    let emit: ((event: DeviceLearnEvent) => void) | null = null
    const subscribe = jest.fn().mockImplementation((onEvent: (e: DeviceLearnEvent) => void) => {
      emit = onEvent
      return () => {
        emit = null
      }
    })
    const onSubmit = jest.fn(async (_submission: DeviceLearnSubmission) => undefined)

    render(
      <LearnModule
        brainSlots={SLOTS}
        subscribeToEvents={subscribe}
        onSubmit={onSubmit}
        title="Bind any controller (HID Learn)"
      />,
    )

    expect(screen.getByText('Bind any controller (HID Learn)')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('midi-learn-start'))
    expect(screen.getByTestId('midi-learn-listening')).toBeInTheDocument()

    const captured = buildHidEvent({ control_id: 'pad-3', value: 0.81 })
    act(() => {
      emit?.(captured)
    })

    expect(screen.getByTestId('midi-learn-captured')).toBeInTheDocument()
    expect(screen.getByTestId('midi-learn-captured-detail').textContent).toContain('pad-3')
    expect(screen.getByTestId('midi-learn-captured-detail').textContent).toContain('0.810')

    await act(async () => {
      fireEvent.click(screen.getByTestId('midi-learn-confirm'))
    })

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const submission = onSubmit.mock.calls[0][0]
    expect(submission.event.kind).toBe('hid')
    expect((submission.event as HidDeviceLearnEvent).control_id).toBe('pad-3')
    expect((submission.event as HidDeviceLearnEvent).value).toBeCloseTo(0.81, 6)
    expect(submission.slot.id).toBe('slot-pad-a')
  })

  it('lets the operator retry the capture before binding', () => {
    let emit: ((event: DeviceLearnEvent) => void) | null = null
    const subscribe = jest.fn().mockImplementation((onEvent: (e: DeviceLearnEvent) => void) => {
      emit = onEvent
      return () => {
        emit = null
      }
    })

    render(
      <LearnModule brainSlots={SLOTS} subscribeToEvents={subscribe} title="Retry test" />,
    )

    fireEvent.click(screen.getByTestId('midi-learn-start'))
    act(() => {
      emit?.(buildHidEvent({ control_id: 'pad-1', value: 0.1 }))
    })
    expect(screen.getByTestId('midi-learn-captured-detail').textContent).toContain('pad-1')

    fireEvent.click(screen.getByTestId('midi-learn-retry'))
    expect(screen.getByTestId('midi-learn-start')).toBeInTheDocument()
  })
})
