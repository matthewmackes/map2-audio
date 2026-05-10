/**
 * Phase 0.4 — generic LearnModule with AVDECC events.
 */
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'

import { LearnModule, describeDeviceEvent } from './LearnModule'
import type { BrainSlotChoice, DeviceLearnSubmission } from './LearnModule'
import type { AvdeccDeviceLearnEvent, DeviceLearnEvent } from './types'

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
  { id: 'slot-stream-1', label: 'AVB Stream 1' },
]

function buildAvdeccEvent(
  overrides: Partial<AvdeccDeviceLearnEvent> = {},
): AvdeccDeviceLearnEvent {
  return {
    kind: 'avdecc',
    entity_id: '0x70b3d52c1234567',
    descriptor_type: 0x0005, // STREAM_INPUT
    descriptor_index: 0,
    value_change: { format: '0x0000020000800000' },
    source_id: 'avb:eth0',
    timestamp: '2026-05-09T12:00:00Z',
    ...overrides,
  }
}

describe('describeDeviceEvent — AVDECC arm', () => {
  it('renders entity + descriptor type as hex', () => {
    expect(describeDeviceEvent(buildAvdeccEvent())).toBe(
      'avdecc entity=0x70b3d52c1234567 desc=0x5#0',
    )
  })

  it('renders STREAM_OUTPUT (0x0006) at the right index', () => {
    const ev = buildAvdeccEvent({ descriptor_type: 0x0006, descriptor_index: 3 })
    expect(describeDeviceEvent(ev)).toBe(
      'avdecc entity=0x70b3d52c1234567 desc=0x6#3',
    )
  })

  it('renders CONTROL descriptor (0x001a) — large hex value', () => {
    const ev = buildAvdeccEvent({ descriptor_type: 0x001a, descriptor_index: 12 })
    expect(describeDeviceEvent(ev)).toBe(
      'avdecc entity=0x70b3d52c1234567 desc=0x1a#12',
    )
  })
})

describe('LearnModule — AVDECC capture + submit', () => {
  it('captures an AVDECC event and surfaces value_change to the submission', async () => {
    let emit: ((event: DeviceLearnEvent) => void) | null = null
    const subscribe = jest.fn().mockImplementation((onEvent: (e: DeviceLearnEvent) => void) => {
      emit = onEvent
      return () => {
        emit = null
      }
    })
    const onSubmit = jest.fn(async (_s: DeviceLearnSubmission) => undefined)

    render(
      <LearnModule
        brainSlots={SLOTS}
        subscribeToEvents={subscribe}
        onSubmit={onSubmit}
        title="Bind any controller (AVDECC Learn)"
      />,
    )

    fireEvent.click(screen.getByTestId('midi-learn-start'))
    act(() => {
      emit?.(
        buildAvdeccEvent({
          descriptor_type: 0x0006,
          descriptor_index: 2,
          value_change: { format: '0x0000020000A00000', sample_rate: 96000 },
        }),
      )
    })

    expect(screen.getByTestId('midi-learn-captured-detail').textContent).toContain('desc=0x6#2')

    await act(async () => {
      fireEvent.click(screen.getByTestId('midi-learn-confirm'))
    })

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const submission = onSubmit.mock.calls[0][0]
    expect(submission.event.kind).toBe('avdecc')
    expect((submission.event as AvdeccDeviceLearnEvent).descriptor_type).toBe(0x0006)
    expect((submission.event as AvdeccDeviceLearnEvent).descriptor_index).toBe(2)
    expect(
      ((submission.event as AvdeccDeviceLearnEvent).value_change as Record<string, unknown>)
        .sample_rate,
    ).toBe(96000)
  })

  it('disables Start listening when no brain slots are available', () => {
    render(
      <LearnModule
        brainSlots={[]}
        subscribeToEvents={jest.fn().mockReturnValue(() => undefined)}
      />,
    )

    const startBtn = screen.getByTestId('midi-learn-start')
    expect(startBtn).toBeDisabled()
  })
})
