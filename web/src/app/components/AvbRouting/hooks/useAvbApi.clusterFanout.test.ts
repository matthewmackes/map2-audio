jest.mock('../../../../map2/api', () => ({
  avbApi: {
    getClusterEndpoints: jest.fn(),
    getClusterDevices: jest.fn(),
    connect: jest.fn(),
  },
}))

import { useAvbDevices, useEndpoints, usePatchMutation } from './useAvbApi'
const { avbApi: mockAvbApi } = require('../../../../map2/api')

const mockUseQuery = jest.fn((options: unknown) => options)
const mockUseMutation = jest.fn((options: unknown) => options)
const mockInvalidateQueries = jest.fn()
const mockPrefetchQuery = jest.fn()

jest.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
  useMutation: (options: unknown) => mockUseMutation(options),
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
    prefetchQuery: mockPrefetchQuery,
  }),
}))

describe('useAvbApi cluster fan-out', () => {
  beforeEach(() => {
    mockUseQuery.mockClear()
    mockUseMutation.mockClear()
    mockInvalidateQueries.mockReset()
    mockPrefetchQuery.mockReset()
    mockAvbApi.getClusterEndpoints.mockReset()
    mockAvbApi.getClusterDevices.mockReset()
    mockAvbApi.connect.mockReset()
  })

  it('merges cluster-fanout endpoint discovery and preserves per-node ownership', async () => {
    mockAvbApi.getClusterEndpoints.mockResolvedValueOnce({
      nodes: {
        'node-a': {
          status_code: 200,
          body: {
            endpoints: [
              {
                endpoint_id: 'entity-a:0',
                entity_id: 'entity-a',
                unique_id: 0,
                direction: 'talker',
                device_type: 'map2',
                device_name: 'Node A Talker',
                channels: 2,
                sample_rate: 48000,
                format: '24-bit PCM',
                mac_address: null,
                node_address: 'http://node-a:8080',
                node_id: 'node-a',
                available: true,
                last_seen: '2026-03-11T16:00:00Z',
              },
            ],
            count: 1,
          },
        },
        'node-b': {
          status_code: 200,
          body: {
            endpoints: [
              {
                endpoint_id: 'entity-b:1',
                entity_id: 'entity-b',
                unique_id: 1,
                direction: 'listener',
                device_type: 'map2',
                device_name: 'Node B Listener',
                channels: 2,
                sample_rate: 48000,
                format: '24-bit PCM',
                mac_address: null,
                node_address: 'http://node-b:8080',
                available: true,
                last_seen: '2026-03-11T16:00:00Z',
              },
            ],
            count: 1,
          },
        },
      },
    })

    const query = useEndpoints() as {
      queryFn: () => Promise<{
        endpoints: Array<{ endpoint_id: string; node_id: string }>
        count: number
      }>
    }
    const result = await query.queryFn()

    expect(mockAvbApi.getClusterEndpoints).toHaveBeenCalledWith(undefined)
    expect(result.count).toBe(2)
    expect(result.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ endpoint_id: 'entity-a:0', node_id: 'node-a' }),
        expect.objectContaining({ endpoint_id: 'entity-b:1', node_id: 'node-b' }),
      ])
    )
  })

  it('merges cluster-fanout AVB device inventory and annotates source nodes', async () => {
    mockAvbApi.getClusterDevices.mockResolvedValueOnce({
      nodes: {
        'node-a': {
          status_code: 200,
          body: {
            available: true,
            count: 1,
            device_names: ['AVB Node A'],
            discovered_count: 1,
            discovered_devices: [
              {
                endpoint_id: 'entity-a:0',
                device_name: 'AVB Node A',
                direction: 'talker',
                device_type: 'map2',
                node_address: 'http://node-a:8080',
                audio_format: '24-bit PCM',
                channels: 2,
                sample_rate: 48000,
                available: true,
              },
            ],
          },
        },
        'node-b': {
          status_code: 200,
          body: {
            available: true,
            count: 1,
            device_names: ['AVB Node B'],
            discovered_count: 1,
            discovered_devices: [
              {
                endpoint_id: 'entity-b:1',
                device_name: 'AVB Node B',
                direction: 'listener',
                device_type: 'map2',
                node_address: 'http://node-b:8080',
                audio_format: '24-bit PCM',
                channels: 2,
                sample_rate: 48000,
                available: true,
              },
            ],
          },
        },
      },
    })

    const query = useAvbDevices() as {
      queryFn: () => Promise<{
        device_names: string[]
        discovered_count: number
        discovered_devices: Array<{ endpoint_id: string; source_node_id?: string | null }>
      }>
    }
    const result = await query.queryFn()

    expect(mockAvbApi.getClusterDevices).toHaveBeenCalledTimes(1)
    expect(result.device_names).toEqual(['AVB Node A', 'AVB Node B'])
    expect(result.discovered_count).toBe(2)
    expect(result.discovered_devices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ endpoint_id: 'entity-a:0', source_node_id: 'node-a' }),
        expect.objectContaining({ endpoint_id: 'entity-b:1', source_node_id: 'node-b' }),
      ])
    )
  })

  it('routes connect mutations to an explicit node without leaking node_id into the JSON body', async () => {
    mockAvbApi.connect.mockResolvedValueOnce({ success: true, connection_id: 'route-1', message: 'ok' })

    const mutation = usePatchMutation() as {
      mutationFn: (payload: { talker_id: string; listener_id: string; node_id?: string | null }) => Promise<unknown>
    }

    await mutation.mutationFn({
      talker_id: 'entity-a:0',
      listener_id: 'entity-b:1',
      node_id: 'node-a',
    })

    expect(mockAvbApi.connect).toHaveBeenCalledWith(
      {
        talker_id: 'entity-a:0',
        listener_id: 'entity-b:1',
      },
      'node-a'
    )
  })
})
