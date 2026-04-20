import {
  fetchUpdateApplicationStatus,
  fetchUpdateApplicationVersion,
  resetUpdateApplicationApiVariantForTests,
  triggerUpdateApplication,
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

  it('uses the hybrid application update status route', async () => {
    mockedFetch.mockResolvedValueOnce(makeResponse(200, {
      status: 'idle',
      mode: 'git',
      environment: 'development',
      running: false,
      message: 'No update in progress',
      steps: [],
    }))

    await expect(fetchUpdateApplicationStatus()).resolves.toMatchObject({ status: 'idle', mode: 'git' })

    expect(mockedFetch).toHaveBeenCalledWith('/api/cluster/update/hybrid/application/status', undefined)
  })

  it('uses the hybrid application update version route', async () => {
    mockedFetch.mockResolvedValueOnce(makeResponse(200, {
      version: '2026042006480001',
      mode: 'git',
      updated_at: '2026-04-20T06:48:00-04:00',
      branch: 'master',
    }))

    await expect(fetchUpdateApplicationVersion()).resolves.toMatchObject({
      version: '2026042006480001',
      mode: 'git',
    })

    expect(mockedFetch).toHaveBeenCalledWith('/api/cluster/update/hybrid/application/version', undefined)
  })

  it('posts update requests only to the hybrid route', async () => {
    mockedFetch.mockResolvedValueOnce(makeResponse(200, { status: 'ok', message: 'Update started' }))

    const request = { branch: 'master', force: true }
    await expect(triggerUpdateApplication(request)).resolves.toMatchObject({ status: 'ok', message: 'Update started' })

    expect(mockedFetch).toHaveBeenCalledTimes(1)
    expect(mockedFetch).toHaveBeenCalledWith(
      '/api/cluster/update/hybrid/application',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'auto',
          version: undefined,
          branch: 'master',
          force: true,
        }),
      },
    )
  })

  it('surfaces hybrid route failures without a second request', async () => {
    mockedFetch.mockResolvedValueOnce(makeResponse(404))

    await expect(fetchUpdateApplicationStatus()).rejects.toThrow('HTTP 404')
    expect(mockedFetch).toHaveBeenCalledTimes(1)
  })
})
