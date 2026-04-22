import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'

jest.mock('../../../../../map2/api', () => ({
  tesiraApi: {},
}))

import {
  useTesiraDevice,
  useTesiraDevices,
  useTesiraFleetHealth,
  useTesiraPtpTopology,
} from './useTesiraApi'

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  })

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

function makeJsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: jest.fn().mockResolvedValue(payload),
  } as unknown as Response
}

describe('useTesiraApi cluster fan-out', () => {
  const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>

  beforeEach(() => {
    ;(globalThis as { fetch?: typeof fetch }).fetch = fetchMock
    fetchMock.mockReset()
  })

  afterEach(() => {
    delete (globalThis as { fetch?: typeof fetch }).fetch
  })

  it('merges Tesira device discovery across nodes and preserves source-node metadata', async () => {
    fetchMock.mockResolvedValueOnce(
      makeJsonResponse({
        nodes: {
          'node-a': {
            status_code: 200,
            body: [
              {
                device_id: 'tesira-1',
                host: '10.0.0.10',
                port: 23,
                name: 'Stage Rack',
                connected: true,
                serial_number: 'ABC123',
                firmware_version: '4.9.0',
                fault_count: 0,
                avb_stream_count: 4,
                ptp_state: 'master',
              },
            ],
          },
          'node-b': {
            status_code: 200,
            body: [
              {
                device_id: 'tesira-1',
                host: '10.0.0.10',
                port: 23,
                name: 'Stage Rack',
                connected: true,
                serial_number: 'ABC123',
                firmware_version: '4.9.0',
                fault_count: 0,
                avb_stream_count: 4,
                ptp_state: 'master',
              },
              {
                device_id: 'tesira-2',
                host: '10.0.0.11',
                port: 23,
                name: 'Lobby DSP',
                connected: false,
                serial_number: 'XYZ987',
                firmware_version: '4.8.1',
                fault_count: 2,
                avb_stream_count: 1,
                ptp_state: 'listening',
              },
            ],
          },
        },
      }),
    )

    const { result } = renderHook(() => useTesiraDevices(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.data?.length).toBe(2))

    expect(fetchMock).toHaveBeenCalledWith('/api/tesira/devices?node_id=all')
    expect(result.current.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          device_id: 'tesira-1',
          source_node_id: 'node-a',
          source_hostname: '10.0.0.10',
          discovered_by_node_ids: expect.arrayContaining(['node-a', 'node-b']),
        }),
        expect.objectContaining({
          device_id: 'tesira-2',
          source_node_id: 'node-b',
          discovered_by_node_ids: ['node-b'],
        }),
      ]),
    )
  })

  it('routes a selected Tesira device detail request to the node that discovered it', async () => {
    fetchMock.mockImplementation((input) => {
      const url = String(input)
      if (url === '/api/tesira/devices?node_id=all') {
        return Promise.resolve(
          makeJsonResponse({
            nodes: {
              'node-b': {
                status_code: 200,
                body: [
                  {
                    device_id: 'tesira-remote',
                    host: '10.0.0.21',
                    port: 23,
                    name: 'Remote Ballroom',
                    connected: true,
                    serial_number: 'REMOTE1',
                    firmware_version: '4.9.1',
                    fault_count: 0,
                    avb_stream_count: 8,
                    ptp_state: 'slave',
                  },
                ],
              },
            },
          }),
        )
      }

      if (url === '/api/tesira/devices/tesira-remote?node_id=node-b') {
        return Promise.resolve(
          makeJsonResponse({
            device_id: 'tesira-remote',
            host: '10.0.0.21',
            hostname: 'ballroom.local',
            port: 23,
            name: 'Remote Ballroom',
            connected: true,
            serial_number: 'REMOTE1',
            firmware_version: '4.9.1',
            fault_count: 0,
            avb_stream_count: 8,
            ptp_state: 'slave',
            avb_streams: [],
            ptp_status: { state: 'slave', offset_ns: 18, grandmaster_id: 'gm-1' },
            faults: [],
            presets: [],
          }),
        )
      }

      throw new Error(`Unexpected fetch URL: ${url}`)
    })

    const { result } = renderHook(() => useTesiraDevice('tesira-remote'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.data?.device_id).toBe('tesira-remote'))

    expect(fetchMock).toHaveBeenCalledWith('/api/tesira/devices?node_id=all')
    expect(fetchMock).toHaveBeenCalledWith('/api/tesira/devices/tesira-remote?node_id=node-b')
    expect(result.current.data).toEqual(
      expect.objectContaining({
        source_node_id: 'node-b',
        source_hostname: '10.0.0.21',
        discovered_by_node_ids: ['node-b'],
      }),
    )
  })

  it('computes fleet health and merged PTP topology from cluster fan-out responses', async () => {
    fetchMock.mockImplementation((input) => {
      const url = String(input)
      if (url === '/api/tesira/devices?node_id=all') {
        return Promise.resolve(
          makeJsonResponse({
            nodes: {
              'node-a': {
                status_code: 200,
                body: [
                  {
                    device_id: 'tesira-a',
                    host: '10.0.0.31',
                    port: 23,
                    name: 'Stage Left',
                    connected: true,
                    serial_number: null,
                    firmware_version: '4.9.0',
                    fault_count: 0,
                    avb_stream_count: 2,
                    ptp_state: 'master',
                  },
                ],
              },
              'node-b': {
                status_code: 200,
                body: [
                  {
                    device_id: 'tesira-b',
                    host: '10.0.0.32',
                    port: 23,
                    name: 'Stage Right',
                    connected: false,
                    serial_number: null,
                    firmware_version: '4.9.0',
                    fault_count: 1,
                    avb_stream_count: 2,
                    ptp_state: 'slave',
                  },
                ],
              },
            },
          }),
        )
      }

      if (url === '/api/tesira/fleet/ptp-topology?node_id=all') {
        return Promise.resolve(
          makeJsonResponse({
            nodes: {
              'node-a': {
                status_code: 200,
                body: {
                  nodes: [
                    {
                      device_id: 'tesira-a',
                      name: 'Stage Left',
                      host: '10.0.0.31',
                      connected: true,
                      ptp_state: 'master',
                      offset_ns: 0,
                      grandmaster_id: 'gm-1',
                    },
                  ],
                },
              },
              'node-b': {
                status_code: 200,
                body: {
                  nodes: [
                    {
                      device_id: 'tesira-b',
                      name: 'Stage Right',
                      host: '10.0.0.32',
                      connected: false,
                      ptp_state: 'slave',
                      offset_ns: 22,
                      grandmaster_id: 'gm-1',
                    },
                  ],
                },
              },
            },
          }),
        )
      }

      throw new Error(`Unexpected fetch URL: ${url}`)
    })

    const health = renderHook(() => useTesiraFleetHealth(), { wrapper: makeWrapper() })
    const topology = renderHook(() => useTesiraPtpTopology(), { wrapper: makeWrapper() })

    await waitFor(() => expect(health.result.current.data?.total_devices).toBe(2))
    await waitFor(() => expect(topology.result.current.data?.node_count).toBe(2))

    expect(health.result.current.data).toEqual(
      expect.objectContaining({
        status: 'healthy',
        total_devices: 2,
        connected_devices: 1,
        offline_devices: 1,
      }),
    )
    expect(topology.result.current.data?.grandmaster_ids).toEqual(['gm-1'])
    expect(topology.result.current.data?.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ device_id: 'tesira-a', source_node_id: 'node-a' }),
        expect.objectContaining({ device_id: 'tesira-b', source_node_id: 'node-b' }),
      ]),
    )
  })

  it('tolerates malformed Tesira fanout payloads by returning empty device and topology lists', async () => {
    fetchMock.mockImplementation((input) => {
      const url = String(input)
      if (url === '/api/tesira/devices?node_id=all') {
        return Promise.resolve(makeJsonResponse(undefined))
      }

      if (url === '/api/tesira/fleet/ptp-topology?node_id=all') {
        return Promise.resolve(
          makeJsonResponse({
            nodes: {
              'node-a': {
                status_code: 200,
                body: {
                  nodes: { bad: true },
                },
              },
            },
          }),
        )
      }

      throw new Error(`Unexpected fetch URL: ${url}`)
    })

    const devices = renderHook(() => useTesiraDevices(), { wrapper: makeWrapper() })
    const topology = renderHook(() => useTesiraPtpTopology(), { wrapper: makeWrapper() })

    await waitFor(() => expect(devices.result.current.isSuccess).toBe(true))
    await waitFor(() => expect(topology.result.current.isSuccess).toBe(true))

    expect(devices.result.current.data).toEqual([])
    expect(topology.result.current.data).toEqual({
      nodes: [],
      grandmaster_ids: [],
      node_count: 0,
    })
  })
})
