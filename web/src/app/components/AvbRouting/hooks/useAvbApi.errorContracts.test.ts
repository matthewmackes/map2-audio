import { useBatchPatchMutation, usePatchMutation } from './useAvbApi'

const mockInvalidateQueries = jest.fn()
const mockUseMutation = jest.fn((options: unknown) => options)

jest.mock('../../../utils/apiTarget', () => ({
  apiUrl: (path: string) => path,
}))

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
  useMutation: (options: unknown) => mockUseMutation(options),
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}))

function makeErrorResponse(payload: unknown): Response {
  return {
    ok: false,
    status: 409,
    statusText: 'Conflict',
    json: jest.fn().mockResolvedValue(payload),
  } as unknown as Response
}

describe('useAvbApi 409 error contracts', () => {
  const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>

  beforeEach(() => {
    mockInvalidateQueries.mockReset()
    mockUseMutation.mockClear()
    ;(globalThis as { fetch?: typeof fetch }).fetch = fetchMock
    fetchMock.mockReset()
  })

  afterEach(() => {
    delete (globalThis as { fetch?: typeof fetch }).fetch
  })

  it('formats router/connect SRP denial payload with code and remediation hint', async () => {
    fetchMock.mockResolvedValueOnce(
      makeErrorResponse({
        detail: {
          code: 'SRP_ADMISSION_DENIED',
          reason: 'SRP admission denied for requested stream',
          remediation: [
            'Verify SRP daemon health via GET /api/avb/srp/status.',
            'Check admission logs via GET /api/avb/srp/admissions.',
          ],
        },
      })
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

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/avb/router/connect',
      expect.objectContaining({
        method: 'POST',
      })
    )
  })

  it('formats batch connect 409 payload into Batch operation failed contract', async () => {
    fetchMock.mockResolvedValueOnce(
      makeErrorResponse({
        detail: {
          code: 'SRP_DAEMON_UNAVAILABLE',
          reason: 'No SRP daemon detected for admission requests',
          remediation: 'Ensure map2-srpd.service is running before retry.',
        },
      })
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

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/avb/router/connect',
      expect.objectContaining({
        method: 'POST',
      })
    )
  })
})
