import { renderHook } from '@testing-library/react'
import { useQuery } from '@tanstack/react-query'

import { useHomePlatformStatus } from './useHomePlatformStatus'

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
}))

const mockedUseQuery = useQuery as jest.MockedFunction<typeof useQuery>

describe('useHomePlatformStatus', () => {
  beforeEach(() => {
    mockedUseQuery.mockReset()
    mockedUseQuery.mockReturnValue({
      isLoading: false,
      data: { enabled: false },
    } as ReturnType<typeof useQuery>)
  })

  it('uses the default desktop polling cadence when no options are provided', () => {
    renderHook(() => useHomePlatformStatus())

    const firstCall = mockedUseQuery.mock.calls[0]?.[0] as { refetchInterval: number; staleTime: number }
    expect(firstCall.refetchInterval).toBe(10_000)
    expect(firstCall.staleTime).toBe(8_000)
  })

  it('accepts a slower background cadence override', () => {
    renderHook(() => useHomePlatformStatus({ pollMs: 30_000, staleMs: 25_000 }))

    const firstCall = mockedUseQuery.mock.calls[0]?.[0] as { refetchInterval: number; staleTime: number }
    expect(firstCall.refetchInterval).toBe(30_000)
    expect(firstCall.staleTime).toBe(25_000)
  })
})
