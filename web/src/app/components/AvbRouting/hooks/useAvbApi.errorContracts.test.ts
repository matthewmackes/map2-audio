jest.mock('../../../../map2/api', () => ({
  avbApi: {
    connect: jest.fn(),
    disconnect: jest.fn(),
  },
}))

import { useBatchPatchMutation, usePatchMutation } from './useAvbApi'
const { avbApi: mockAvbApi } = require('../../../../map2/api')

const mockInvalidateQueries = jest.fn()
const mockUseMutation = jest.fn((options: unknown) => options)

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
  useMutation: (options: unknown) => mockUseMutation(options),
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}))

describe('useAvbApi 409 error contracts', () => {
  beforeEach(() => {
    mockInvalidateQueries.mockReset()
    mockUseMutation.mockClear()
    mockAvbApi.connect.mockReset()
    mockAvbApi.disconnect.mockReset()
  })

  it('formats router/connect SRP denial payload with code and remediation hint', async () => {
    mockAvbApi.connect.mockRejectedValueOnce(
      new Error(
        'SRP admission denied for requested stream (SRP_ADMISSION_DENIED). Remediation: Verify SRP daemon health via GET /api/avb/srp/status.'
      )
    )

    const mutation = usePatchMutation() as {
      mutationFn: (payload: { talker_id: string; listener_id: string }) => Promise<unknown>
    }

    await expect(
      mutation.mutationFn({
        talker_id: 'talker-1',
        listener_id: 'listener-1',
      })
    ).rejects.toThrow(
      'SRP admission denied for requested stream (SRP_ADMISSION_DENIED). Remediation: Verify SRP daemon health via GET /api/avb/srp/status.'
    )

    expect(mockAvbApi.connect).toHaveBeenCalledWith(
      {
        talker_id: 'talker-1',
        listener_id: 'listener-1',
      },
      undefined
    )
  })

  it('formats batch connect 409 payload into Batch operation failed contract', async () => {
    mockAvbApi.connect.mockRejectedValueOnce(
      new Error(
        'No SRP daemon detected for admission requests (SRP_DAEMON_UNAVAILABLE). Remediation: Ensure map2-srpd.service is running before retry.'
      )
    )

    const mutation = useBatchPatchMutation() as {
      mutationFn: (
        operations: Array<{ talker_id: string; listener_id: string; action: 'connect' | 'disconnect' }>
      ) => Promise<unknown>
    }

    await expect(
      mutation.mutationFn([
        {
          talker_id: 'talker-1',
          listener_id: 'listener-1',
          action: 'connect',
        },
      ])
    ).rejects.toThrow(
      'Batch operation failed: No SRP daemon detected for admission requests (SRP_DAEMON_UNAVAILABLE). Remediation: Ensure map2-srpd.service is running before retry.'
    )

    expect(mockAvbApi.connect).toHaveBeenCalledWith(
      {
        talker_id: 'talker-1',
        listener_id: 'listener-1',
      },
      undefined
    )
  })
})
