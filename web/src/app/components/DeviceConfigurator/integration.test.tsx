/**
 * T2499-A slice 8 — End-to-end integration test.
 *
 * Stitches the framework's three operator-facing components
 * together with a fake MIDI event source and a fake bindings
 * client to verify the full flow:
 *
 *   (Pack picker) → click MIDI Learn fallback
 *   (MIDI Learn module) → start listening → emit fake event
 *   (bindings writer) → list-before-post → POST → confirm
 *
 * This is the contract test that future regressions in any one
 * piece would catch even when their unit tests still pass.
 */
import '@testing-library/jest-dom'
import * as React from 'react'
import { useCallback, useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { DevicePackPicker } from './DevicePackPicker'
import {
  MidiLearnModule,
  type BrainSlotChoice,
  type MidiEventSubscriber,
  type MidiLearnSubmission,
} from './MidiLearnModule'
import { submitBrainSlotBinding } from './bindingsWriter'
import type {
  ConfiguratorPackDescriptor,
  DeviceDetectionStatus,
} from './types'
import type {
  MidiBindingCreate,
  MidiBindingRead,
} from '../../../map2/clients/midiBindings'

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

function makeStatus(packId: string): DeviceDetectionStatus {
  return {
    pack_id: packId,
    presence: 'not_present',
    transport: 'usb-sysfs',
    serial: null,
    raw: {},
  }
}

function makePack(packId: string): ConfiguratorPackDescriptor {
  return {
    packId,
    displayName: packId.toUpperCase(),
    vendorName: `${packId}-vendor`,
    summary: `Configure ${packId}`,
    supportedPrimitives: ['detection', 'push'],
    fetchStatus: jest.fn(async () => makeStatus(packId)),
    tabs: [],
  }
}

function makeRead(payload: MidiBindingCreate, id = 'b-new'): MidiBindingRead {
  return {
    binding_id: id,
    consumer_type: payload.consumer_type,
    consumer_id: payload.consumer_id,
    consumer_label: payload.consumer_label ?? '',
    source_type: payload.source_type,
    source_descriptor: payload.source_descriptor ?? {},
    target_type: payload.target_type,
    target_descriptor: payload.target_descriptor ?? {},
    device_id: payload.device_id ?? null,
    scope: payload.scope ?? 'global',
    scope_id: payload.scope_id ?? null,
    enabled: payload.enabled ?? true,
    source: payload.source ?? 'manual',
    metadata: payload.metadata ?? {},
    created_at: '2026-05-09T00:00:00Z',
    created_by: payload.created_by ?? 'unknown',
    modified_at: '2026-05-09T00:00:00Z',
    modified_by: payload.created_by ?? 'unknown',
  }
}

interface FakeMidi {
  subscribe: MidiEventSubscriber
  emit: (event: { status: string; channel: number; data1: number; data2?: number; source_id?: string }) => void
}

function makeFakeMidi(): FakeMidi {
  let onEvent: ((e: any) => void) | null = null
  return {
    subscribe(handler) {
      onEvent = handler
      return () => {
        onEvent = null
      }
    },
    emit(event) {
      onEvent?.(event)
    },
  }
}

function ConfiguratorHarness({
  packs,
  midi,
  client,
  onComplete,
}: {
  packs: ConfiguratorPackDescriptor[]
  midi: FakeMidi
  client: { list: jest.Mock; create: jest.Mock }
  onComplete?: (binding: MidiBindingRead) => void
}) {
  const [view, setView] = useState<'picker' | 'learn'>('picker')

  const handleSubmit = useCallback(
    async (submission: MidiLearnSubmission) => {
      const result = await submitBrainSlotBinding(submission, { client })
      onComplete?.(result.binding)
    },
    [client, onComplete],
  )

  if (view === 'picker') {
    return (
      <DevicePackPicker
        packs={packs}
        onPick={() => undefined}
        onPickMidiLearn={() => setView('learn')}
        pollMs={false}
      />
    )
  }
  return (
    <MidiLearnModule
      brainSlots={SLOTS}
      subscribeToMidiEvents={midi.subscribe}
      onSubmit={handleSubmit}
    />
  )
}

function renderHarness(client: { list: jest.Mock; create: jest.Mock }) {
  const midi = makeFakeMidi()
  const onComplete = jest.fn()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return {
    midi,
    onComplete,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ConfiguratorHarness
          packs={[makePack('alpha'), makePack('beta')]}
          midi={midi}
          client={client}
          onComplete={onComplete}
        />
      </QueryClientProvider>,
    ),
  }
}

describe('T2499-A end-to-end integration', () => {
  it('completes the full picker → learn → submit flow when no duplicate exists', async () => {
    const client = {
      list: jest.fn().mockResolvedValue([]),
      create: jest.fn(async (p: MidiBindingCreate) => makeRead(p, 'b-new')),
    }
    const { midi, onComplete } = renderHarness(client)

    // 1. Picker shows MIDI Learn fallback. Click it.
    fireEvent.click(await screen.findByTestId('device-pack-tile-midi-learn'))

    // 2. MIDI Learn module rendered. Operator clicks Start.
    fireEvent.click(await screen.findByTestId('midi-learn-start'))

    // 3. Operator presses a control on their controller — fake event arrives.
    act(() => {
      midi.emit({
        status: 'cc',
        channel: 3,
        data1: 21,
        data2: 64,
        source_id: 'alsa-seq:Stagepiano:0',
      })
    })

    // 4. UI shows the captured event. Operator confirms.
    await screen.findByTestId('midi-learn-captured')
    fireEvent.click(screen.getByTestId('midi-learn-confirm'))

    // 5. Bindings writer lists then creates.
    await waitFor(() => expect(client.create).toHaveBeenCalledTimes(1))
    expect(client.list).toHaveBeenCalledWith({
      consumer_type: 'brain_slot',
      consumer_id: 'slot-1',
    })
    const created = client.create.mock.calls[0][0] as MidiBindingCreate
    expect(created).toEqual(
      expect.objectContaining({
        consumer_type: 'brain_slot',
        consumer_id: 'slot-1',
        source_type: 'midi_cc',
        source_descriptor: { channel: 3, cc: 21 },
        target_type: 'brain_slot',
        target_descriptor: { brain_slot_id: 'slot-1' },
        scope: 'global',
        source: 'configurator',
        device_id: 'alsa-seq:Stagepiano:0',
      }),
    )

    // 6. Submitted state renders and the parent's onComplete fires.
    await screen.findByTestId('midi-learn-submitted')
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete.mock.calls[0][0].binding_id).toBe('b-new')
  })

  it('detects duplicates: existing matching binding skips create()', async () => {
    // Pre-seed list() with a binding that exactly matches what the
    // operator is about to submit.
    const client = {
      list: jest.fn(),
      create: jest.fn(),
    }
    const { midi } = renderHarness(client)

    fireEvent.click(await screen.findByTestId('device-pack-tile-midi-learn'))
    fireEvent.click(await screen.findByTestId('midi-learn-start'))

    // Wire list() to return a matching binding once we know what
    // the submission shape will be.
    const expectedExisting = makeRead({
      consumer_type: 'brain_slot',
      consumer_id: 'slot-1',
      consumer_label: 'Brain slot 1',
      source_type: 'midi_cc',
      source_descriptor: { channel: 1, cc: 7 },
      target_type: 'brain_slot',
      target_descriptor: { brain_slot_id: 'slot-1' },
      scope: 'global',
      enabled: true,
      source: 'manual',
      metadata: {},
      created_by: 'someone-else',
    } satisfies MidiBindingCreate, 'b-existing')
    client.list.mockResolvedValue([expectedExisting])

    act(() => {
      midi.emit({ status: 'cc', channel: 1, data1: 7 })
    })
    fireEvent.click(await screen.findByTestId('midi-learn-confirm'))

    await waitFor(() => expect(client.list).toHaveBeenCalled())
    expect(client.create).not.toHaveBeenCalled()
    // Submitted state still renders so the operator sees success.
    await screen.findByTestId('midi-learn-submitted')
  })

  it('surfaces a backend create() error and lets the operator retry', async () => {
    const client = {
      list: jest.fn().mockResolvedValue([]),
      create: jest
        .fn()
        .mockRejectedValueOnce(new Error('binding authority unreachable'))
        .mockImplementation(async (p: MidiBindingCreate) => makeRead(p, 'b-retry')),
    }
    const { midi } = renderHarness(client)

    fireEvent.click(await screen.findByTestId('device-pack-tile-midi-learn'))
    fireEvent.click(await screen.findByTestId('midi-learn-start'))
    act(() => {
      midi.emit({ status: 'cc', channel: 1, data1: 7 })
    })
    fireEvent.click(await screen.findByTestId('midi-learn-confirm'))

    expect(
      await screen.findByText('binding authority unreachable'),
    ).toBeInTheDocument()
    // Start button reappears after error — operator can retry.
    expect(screen.getByTestId('midi-learn-start')).toBeInTheDocument()

    // Retry succeeds.
    fireEvent.click(screen.getByTestId('midi-learn-start'))
    act(() => {
      midi.emit({ status: 'cc', channel: 1, data1: 7 })
    })
    fireEvent.click(await screen.findByTestId('midi-learn-confirm'))
    await waitFor(() => expect(client.create).toHaveBeenCalledTimes(2))
    await screen.findByTestId('midi-learn-submitted')
  })
})
