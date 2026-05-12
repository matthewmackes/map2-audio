import React from 'react'
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

function renderPicker(
  overrides: Partial<React.ComponentProps<typeof SnapshotInterfacePicker>> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  const onChange = jest.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <SnapshotInterfacePicker
        nodeId="node-local"
        direction="input"
        selectedInterfaceId={null}
        onChange={onChange}
        {...overrides}
      />
    </QueryClientProvider>,
  )
  return { onChange }
}

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
      interface_id: 'avb:avb-stream-0001',
      display_name: 'MOTU 24Ai',
      transport: 'avb' as const,
      vendor: 'MOTU',
      product: null,
      serial: null,
      input_port_count: 24,
      output_port_count: 0,
      sample_rate: 48000,
      available: true,
      is_default: false,
      node_id: null,
      direction: 'talker' as const,
      notes: ['Host 10.0.0.42'],
    },
    {
      interface_id: 'cluster:peer-7:tascam',
      display_name: 'TASCAM (peer)',
      transport: 'cluster' as const,
      vendor: 'TASCAM',
      product: null,
      serial: null,
      input_port_count: 4,
      output_port_count: 4,
      sample_rate: null,
      available: true,
      is_default: false,
      node_id: 'peer-7',
      direction: null,
      notes: [],
    },
  ],
  default_interface_id: 'pipewire:usb:0x582:0x0007:edirol-0001',
  transports: ['pipewire_usb', 'pipewire_alsa', 'pipewire_other', 'avb', 'cluster'],
}

describe('SnapshotInterfacePicker', () => {
  beforeEach(() => {
    mockGetInterfaces.mockReset()
  })

  it('renders interface cards grouped by transport', async () => {
    mockGetInterfaces.mockResolvedValue(fixturePayload)
    renderPicker()

    await waitFor(() => {
      expect(screen.getByText('pipewire:usb:0x582:0x0007:edirol-0001')).toBeInTheDocument()
    })
    expect(screen.getByText('avb:avb-stream-0001')).toBeInTheDocument()
    expect(screen.getByText('cluster:peer-7:tascam')).toBeInTheDocument()
    expect(screen.getByText('Local interfaces')).toBeInTheDocument()
    expect(screen.getByText('AVB endpoints')).toBeInTheDocument()
    expect(screen.getByText('Cluster nodes')).toBeInTheDocument()
  })

  it('filters by direction — output picker hides talker-only AVB endpoints', async () => {
    mockGetInterfaces.mockResolvedValue(fixturePayload)
    renderPicker({ direction: 'output' })

    await waitFor(() => {
      expect(screen.getByText('pipewire:usb:0x582:0x0007:edirol-0001')).toBeInTheDocument()
    })
    // MOTU 24Ai has output_port_count: 0 AND direction: 'talker' so the
    // output picker should not list it.
    expect(screen.queryByText('avb:avb-stream-0001')).not.toBeInTheDocument()
    // TASCAM has both input and output ports, so still appears.
    expect(screen.getByText('cluster:peer-7:tascam')).toBeInTheDocument()
  })

  it('reports the selected interface_id via onChange and unsets on Use rig default', async () => {
    mockGetInterfaces.mockResolvedValue(fixturePayload)
    const { onChange } = renderPicker()

    await waitFor(() => {
      expect(screen.getByText('pipewire:usb:0x582:0x0007:edirol-0001')).toBeInTheDocument()
    })

    fireEvent.click(
      screen.getByTestId('snapshot-interface-card-pipewire:usb:0x582:0x0007:edirol-0001'),
    )
    expect(onChange).toHaveBeenCalledWith('pipewire:usb:0x582:0x0007:edirol-0001')

    fireEvent.click(screen.getByTestId('snapshot-interface-default-input'))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('shows an empty state when the registry returns no interfaces', async () => {
    mockGetInterfaces.mockResolvedValue({
      interfaces: [],
      default_interface_id: null,
      transports: [],
    })
    renderPicker()

    await waitFor(() => {
      expect(screen.getByText('No matching interfaces')).toBeInTheDocument()
    })
  })

  it('shows an error state when the endpoint fails', async () => {
    mockGetInterfaces.mockRejectedValue(new Error('boom'))
    renderPicker()

    await waitFor(() => {
      expect(screen.getByText("Couldn't load interfaces")).toBeInTheDocument()
    })
  })
})
