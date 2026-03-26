import {
  fetchUpdateApplicationJson,
  postUpdateApplicationJson,
  resetUpdateApplicationApiVariantForTests,
} from './updateApplicationApi'

function makeResponse<T>(status: number, payload?: T): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response
}

describe('updateApplicationApi', () => {
  const mockedFetch = jest.fn()

  beforeEach(() => {
    mockedFetch.mockReset()
    global.fetch = mockedFetch as unknown as typeof fetch
    resetUpdateApplicationApiVariantForTests()
  })

  it('prefers the hybrid application update routes when they are available', async () => {
    mockedFetch.mockResolvedValueOnce(makeResponse(200, { status: 'idle' }))

    await expect(fetchUpdateApplicationJson<{ status: string }>('/application/status')).resolves.toEqual({ status: 'idle' })

    expect(mockedFetch).toHaveBeenCalledWith('/api/cluster/update/hybrid/application/status', undefined)
  })

  it('falls back to legacy application update routes for POST requests after a 404', async () => {
    mockedFetch
      .mockResolvedValueOnce(makeResponse(404))
      .mockResolvedValueOnce(makeResponse(200, { status: 'ok' }))

    const body = { mode: 'auto', branch: 'master', force: false }
    await expect(postUpdateApplicationJson<{ status: string }>('/application', body)).resolves.toEqual({ status: 'ok' })

    expect(mockedFetch).toHaveBeenNthCalledWith(
      1,
      '/api/cluster/update/hybrid/application',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    )
    expect(mockedFetch).toHaveBeenNthCalledWith(
      2,
      '/api/cluster/update/application',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    )
  })

  it('switches its preferred route back to hybrid once the backend restarts onto the new endpoints', async () => {
    mockedFetch
      .mockResolvedValueOnce(makeResponse(404))
      .mockResolvedValueOnce(makeResponse(200, { status: 'legacy-ok' }))
      .mockResolvedValueOnce(makeResponse(404))
      .mockResolvedValueOnce(makeResponse(200, { status: 'hybrid-ok' }))
      .mockResolvedValueOnce(makeResponse(200, { status: 'hybrid-sticky' }))

    await expect(fetchUpdateApplicationJson<{ status: string }>('/application/status')).resolves.toEqual({ status: 'legacy-ok' })
    await expect(fetchUpdateApplicationJson<{ status: string }>('/application/status')).resolves.toEqual({ status: 'hybrid-ok' })
    await expect(fetchUpdateApplicationJson<{ status: string }>('/application/status')).resolves.toEqual({ status: 'hybrid-sticky' })

    expect(mockedFetch.mock.calls.map(([url]) => url)).toEqual([
      '/api/cluster/update/hybrid/application/status',
      '/api/cluster/update/application/status',
      '/api/cluster/update/application/status',
      '/api/cluster/update/hybrid/application/status',
      '/api/cluster/update/hybrid/application/status',
    ])
  })
})
