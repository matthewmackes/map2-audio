import React from 'react'
import '@testing-library/jest-dom'
import { fireEvent, render, screen } from '@testing-library/react'

import type { MidiClusterConnection, MidiClusterEndpoint } from '../../../map2/api'
import { MidiClusterConnectionMatrix } from './MidiClusterConnectionMatrix'

const mockConnectMutateAsync = jest.fn()
const mockDisconnectMutateAsync = jest.fn()
const mockUseConnectMidiCluster = jest.fn()
const mockUseDisconnectMidiCluster = jest.fn()

jest.mock('../../hooks/useMidiCluster', () => ({
  useConnectMidiCluster: () => mockUseConnectMidiCluster(),
  useDisconnectMidiCluster: () => mockUseDisconnectMidiCluster(),
}))

function buildEndpoint(
  endpointId: string,
  direction: 'input' | 'output',
  nodeId: string,
  portName: string,
): MidiClusterEndpoint {
  return {
    endpoint_id: endpointId,
    node_id: nodeId,
    port_name: portName,
    direction,
    device_name: `${nodeId}-${portName}`,
    node_address: '127.0.0.1',
    available: true,
  }
}

describe('MidiClusterConnectionMatrix', () => {
  const output = buildEndpoint('out-1', 'output', 'node-a', 'out-main')
  const input = buildEndpoint('in-1', 'input', 'node-b', 'in-main')

  beforeEach(() => {
    mockConnectMutateAsync.mockReset()
    mockDisconnectMutateAsync.mockReset()
    mockUseConnectMidiCluster.mockReset()
    mockUseDisconnectMidiCluster.mockReset()
    mockUseConnectMidiCluster.mockReturnValue({
      mutateAsync: mockConnectMutateAsync,
      isPending: false,
    })
    mockUseDisconnectMidiCluster.mockReturnValue({
      mutateAsync: mockDisconnectMutateAsync,
      isPending: false,
    })
  })

  it('creates a selected connection using Carbon selects and action button', () => {
    render(
      <MidiClusterConnectionMatrix
        endpoints={[output, input]}
        connections={[]}
      />,
    )

    fireEvent.change(screen.getByLabelText('Output endpoint'), { target: { value: output.endpoint_id } })
    fireEvent.change(screen.getByLabelText('Input endpoint'), { target: { value: input.endpoint_id } })
    fireEvent.click(screen.getByRole('button', { name: 'Connect selection' }))

    expect(mockConnectMutateAsync).toHaveBeenCalledWith({
      source_endpoint_id: output.endpoint_id,
      destination_endpoint_id: input.endpoint_id,
      transport: 'rtp-midi',
    })
  })

  it('disconnects an existing link directly from the matrix cell action', () => {
    const existingConnection: MidiClusterConnection = {
      connection_id: 'connection-1',
      state: 'connected',
      transport: 'http-mesh',
      messages_forwarded: 12,
      source: output,
      destination: input,
    }

    render(
      <MidiClusterConnectionMatrix
        endpoints={[output, input]}
        connections={[existingConnection]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))

    expect(mockDisconnectMutateAsync).toHaveBeenCalledWith('connection-1')
    expect(screen.getAllByText('HTTP Mesh').length).toBeGreaterThan(0)
  })

  it('shows a status note when matrix endpoints are unavailable', () => {
    render(<MidiClusterConnectionMatrix endpoints={[]} connections={[]} />)

    expect(screen.getByText('No matrix endpoints detected yet')).toBeInTheDocument()
  })
})
