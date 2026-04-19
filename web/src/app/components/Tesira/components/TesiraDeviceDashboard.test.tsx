import '@testing-library/jest-dom'
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import { TesiraDeviceDashboard } from './TesiraDeviceDashboard'

const mockNavigate = jest.fn()
const mockUseTesiraDevice = jest.fn()

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}))

jest.mock('../hooks/useTesiraApi', () => ({
  useTesiraDevice: (...args: unknown[]) => mockUseTesiraDevice(...args),
}))

jest.mock('./TesiraFleetHealth', () => ({
  TesiraFleetHealth: () => <div>Tesira Fleet Health</div>,
}))

jest.mock('./TesiraPtpTopology', () => ({
  TesiraPtpTopology: () => <div>Tesira PTP Topology</div>,
}))

jest.mock('./TesiraDeployDialog', () => ({
  TesiraDeployDialog: () => null,
}))

jest.mock('./TesiraQuickCommandPanel', () => ({
  TesiraQuickCommandPanel: () => <div>Tesira Quick Commands</div>,
}))

describe('TesiraDeviceDashboard', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    mockUseTesiraDevice.mockReturnValue({
      data: {
        device_id: 'tesira-1',
        host: '10.0.0.20',
        port: 23,
        name: 'Forte AVB',
        connected: true,
        serial_number: 'serial-1',
        firmware_version: '4.5.1',
        fault_count: 0,
        avb_stream_count: 1,
        ptp_state: 'SLAVE',
        source_node_id: 'node-remote',
        source_hostname: 'remote-rack',
        discovered_by_node_ids: ['node-remote'],
        discovered_by_hosts: ['remote-rack'],
        hostname: 'forte-avb',
        avb_streams: [
          { stream_index: 1, direction: 'talker', name: 'Program Bus', channels: 2, entity_id: '0011aa22bb33cc44' },
        ],
        ptp_status: { state: 'SLAVE', offset_ns: 42, grandmaster_id: 'node-local' },
        faults: [],
        presets: [],
      },
      isLoading: false,
    })
  })

  it('launches the routed Platforms AVB workspace with node-aware focus', () => {
    render(<TesiraDeviceDashboard deviceId="tesira-1" />)

    fireEvent.click(screen.getByRole('button', { name: 'AVB Routing' }))

    expect(mockNavigate).toHaveBeenCalledWith('/platforms/avb-routing?focusTesiraDevice=tesira-1&focusNodeId=node-remote')
  })
})
