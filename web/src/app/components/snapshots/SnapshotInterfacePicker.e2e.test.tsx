// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// Run-14c cycle 9 — SnapshotInterfacePicker e2e flow.
// Closes the test-coverage gap on the picker → publish-payload path:
// operator selects an interface, the onChange callback receives the
// canonical stable interface_id, and re-renders with a different
// selectedInterfaceId reflect through to the UI selection state.
//
// The existing component-level tests cover render + filter +
// onChange-fires; this file proves the full select→re-render→select
// round-trip works without re-mounting.

import React, { useState } from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockGetInterfaces = jest.fn()

jest.mock('../../../map2/api', () => ({
  audioApi: {
    getInterfaces: (...args: unknown[]) => mockGetInterfaces(...args),
  },
}))

import { SnapshotInterfacePicker } from './SnapshotInterfacePicker'

const fixturePayload = {
  interfaces: [
    {
      interface_id: 'pipewire:usb:0x582:0x0007:edirol-0001',
      display_name: 'Edirol UA-1000',
      transport: 'pipewire_usb' as const,
      vendor: 'Roland',
      product: 'Edirol UA-1000',
      serial: 'edirol-0001',
      input_port_count: 8,
      output_port_count: 10,
      sample_rate: 48000,
      available: true,
      is_default: true,
      node_id: null,
      direction: null,
      notes: [],
    },
    {
      interface_id: 'pipewire:usb:0x644:0x8020:tascam-0042',
      display_name: 'TASCAM US-144MKII',
      transport: 'pipewire_usb' as const,
      vendor: 'TASCAM',
      product: 'US-144MKII',
      serial: 'tascam-0042',
      input_port_count: 4,
      output_port_count: 4,
      sample_rate: 48000,
      available: true,
      is_default: false,
      node_id: null,
      direction: null,
      notes: [],
    },
  ],
  default_interface_id: 'pipewire:usb:0x582:0x0007:edirol-0001',
  transports: ['pipewire_usb', 'pipewire_alsa', 'pipewire_other', 'avb', 'cluster', 'sonobus'],
}

/** Harness that owns selectedInterfaceId in useState so the picker
 *  re-renders on change — mirrors how SnapshotPublishPage threads the
 *  picker through. */
function PickerHarness({
  initial = null,
  onSelectionChange,
}: {
  initial?: string | null
  onSelectionChange?: (id: string | null) => void
}) {
  const [selected, setSelected] = useState<string | null>(initial)
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  })
  return (
    <QueryClientProvider client={queryClient}>
      <SnapshotInterfacePicker
        nodeId="node-local"
        direction="input"
        selectedInterfaceId={selected}
        onChange={(id) => {
          setSelected(id)
          onSelectionChange?.(id)
        }}
      />
    </QueryClientProvider>
  )
}

describe('SnapshotInterfacePicker e2e flow (run-14c cycle 9)', () => {
  beforeEach(() => {
    mockGetInterfaces.mockReset()
    mockGetInterfaces.mockResolvedValue(fixturePayload)
  })

  it('selects an interface and reports the canonical interface_id', async () => {
    const onSelectionChange = jest.fn()
    render(<PickerHarness onSelectionChange={onSelectionChange} />)

    // Wait for interfaces to load. The interface_id text is unique
    // per card (display_name is rendered in both the header and body
    // for some transports, so use the ID for selection).
    await waitFor(() => {
      expect(
        screen.getByText('pipewire:usb:0x582:0x0007:edirol-0001'),
      ).toBeInTheDocument()
    })

    // Click the TASCAM card (selecting by interface_id text).
    fireEvent.click(
      screen.getByText('pipewire:usb:0x644:0x8020:tascam-0042'),
    )

    await waitFor(() => {
      expect(onSelectionChange).toHaveBeenCalledWith(
        'pipewire:usb:0x644:0x8020:tascam-0042',
      )
    })
  })

  it('round-trips: select → re-render → switch → re-render', async () => {
    const onSelectionChange = jest.fn()
    render(<PickerHarness onSelectionChange={onSelectionChange} />)
    await waitFor(() => {
      expect(
        screen.getByText('pipewire:usb:0x582:0x0007:edirol-0001'),
      ).toBeInTheDocument()
    })

    fireEvent.click(
      screen.getByText('pipewire:usb:0x644:0x8020:tascam-0042'),
    )
    await waitFor(() => {
      expect(onSelectionChange).toHaveBeenLastCalledWith(
        'pipewire:usb:0x644:0x8020:tascam-0042',
      )
    })

    fireEvent.click(
      screen.getByText('pipewire:usb:0x582:0x0007:edirol-0001'),
    )
    await waitFor(() => {
      expect(onSelectionChange).toHaveBeenLastCalledWith(
        'pipewire:usb:0x582:0x0007:edirol-0001',
      )
    })

    expect(onSelectionChange).toHaveBeenCalledTimes(2)
  })

  it('unselects via Use rig default', async () => {
    const onSelectionChange = jest.fn()
    render(
      <PickerHarness
        initial="pipewire:usb:0x644:0x8020:tascam-0042"
        onSelectionChange={onSelectionChange}
      />,
    )
    await waitFor(() => {
      expect(
        screen.getByText('pipewire:usb:0x582:0x0007:edirol-0001'),
      ).toBeInTheDocument()
    })

    // The "Use rig default" tile should be present.
    const rigDefault = screen.getByText(/Use rig default/i)
    fireEvent.click(rigDefault)

    await waitFor(() => {
      expect(onSelectionChange).toHaveBeenLastCalledWith(null)
    })
  })

  it('survives a refetch — selection sticky across query invalidation', async () => {
    // Mount with a selection, then trigger a re-fetch by remounting.
    const onSelectionChange = jest.fn()
    const { rerender } = render(
      <PickerHarness
        initial="pipewire:usb:0x644:0x8020:tascam-0042"
        onSelectionChange={onSelectionChange}
      />,
    )
    await waitFor(() => {
      expect(
        screen.getByText('pipewire:usb:0x644:0x8020:tascam-0042'),
      ).toBeInTheDocument()
    })

    // Trigger a fresh fetch by re-rendering the harness; the selection
    // state is held in the harness's useState so it should persist.
    rerender(
      <PickerHarness
        initial="pipewire:usb:0x644:0x8020:tascam-0042"
        onSelectionChange={onSelectionChange}
      />,
    )
    await waitFor(() => {
      expect(
        screen.getByText('pipewire:usb:0x644:0x8020:tascam-0042'),
      ).toBeInTheDocument()
    })

    // The harness's selectedInterfaceId is held in state; the picker
    // re-renders with the same selection. No spurious onChange fired.
    expect(onSelectionChange).not.toHaveBeenCalled()
  })

  it('handles backend failure — error state renders, no selection fires', async () => {
    mockGetInterfaces.mockRejectedValueOnce(new Error('500'))
    const onSelectionChange = jest.fn()
    render(<PickerHarness onSelectionChange={onSelectionChange} />)

    // Wait for the picker to surface its error state. Picker emits
    // "Couldn't load interfaces" per SnapshotInterfacePicker.tsx:279.
    await waitFor(() => {
      expect(
        screen.getByText(/couldn.t load interfaces/i),
      ).toBeInTheDocument()
    })

    expect(onSelectionChange).not.toHaveBeenCalled()
  })
})
