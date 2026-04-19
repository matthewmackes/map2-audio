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

  it('prefers the hybrid application update routes when they are available', async () => {
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

  it('falls back to legacy application update routes for POST requests after a 404', async () => {
    mockedFetch
      .mockResolvedValueOnce(makeResponse(404))
      .mockResolvedValueOnce(makeResponse(200, { status: 'ok', message: 'Legacy update completed' }))

    const body = { mode: 'auto', branch: 'master', force: false }
    await expect(triggerUpdateApplication(body)).resolves.toMatchObject({ status: 'ok', message: 'Legacy update completed' })

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

  it('normalizes legacy status and version payloads into the progress contract', async () => {
    mockedFetch
      .mockResolvedValueOnce(makeResponse(404))
      .mockResolvedValueOnce(makeResponse(200, {
        status: 'ok',
        mode: 'git',
        environment: 'development',
        current_version: '',
        running: false,
        last_update: null,
      }))
      .mockResolvedValueOnce(makeResponse(404))
      .mockResolvedValueOnce(makeResponse(200, { status: 'ok', nodes: {} }))
      .mockResolvedValueOnce(makeResponse(200, {
        product: 'MAP2 Audio Platform',
        version: '2026032610281001',
        build_date: '20260326',
        build_time: '102810',
        build_channel: '01',
        build_timestamp: '2026-03-26T10:28:10-04:00',
        api_version: 'v1',
      }))
      .mockResolvedValueOnce(makeResponse(200, {
        status: 'ok',
        mode: 'git',
        environment: 'development',
        current_version: '',
        running: false,
        last_update: null,
      }))

    await expect(fetchUpdateApplicationStatus()).resolves.toMatchObject({
      status: 'idle',
      mode: 'git',
      message: 'Update workflow ready',
    })
    await expect(fetchUpdateApplicationVersion()).resolves.toMatchObject({
      version: '2026032610281001',
      mode: 'git',
    })
  })

  it('preserves a legacy synchronous failure as a failed update status instead of resetting to pending', async () => {
    mockedFetch
      .mockResolvedValueOnce(makeResponse(404))
      .mockResolvedValueOnce(makeResponse(200, {
        status: 'error',
        message: 'Repository validation failed',
        commit_before: '',
        commit_after: null,
        duration_seconds: 0.08,
        success: false,
      }))
      .mockResolvedValueOnce(makeResponse(404))
      .mockResolvedValueOnce(makeResponse(200, {
        status: 'ok',
        mode: 'git',
        environment: 'development',
        current_version: '',
        running: false,
        last_update: null,
      }))

    await expect(triggerUpdateApplication({ branch: 'master' })).resolves.toMatchObject({
      status: 'error',
      message: 'Repository validation failed',
      success: false,
    })
    await expect(fetchUpdateApplicationStatus()).resolves.toMatchObject({
      status: 'failed',
      error: 'Repository validation failed',
      current_step_key: 'validate-source',
    })
  })

  it('switches its preferred route back to hybrid once the backend restarts onto the new endpoints', async () => {
    mockedFetch
      .mockResolvedValueOnce(makeResponse(404))
      .mockResolvedValueOnce(makeResponse(200, {
        status: 'ok',
        mode: 'git',
        environment: 'development',
        current_version: '',
        running: false,
        last_update: null,
      }))
      .mockResolvedValueOnce(makeResponse(404))
      .mockResolvedValueOnce(makeResponse(200, {
        status: 'running',
        mode: 'git',
        environment: 'development',
        running: true,
        message: 'Fetching branch master from origin',
        steps: [],
      }))
      .mockResolvedValueOnce(makeResponse(200, {
        status: 'completed',
        mode: 'git',
        environment: 'development',
        running: false,
        message: 'Updated successfully',
        steps: [],
      }))

    await expect(fetchUpdateApplicationStatus()).resolves.toMatchObject({ status: 'idle', mode: 'git' })
    await expect(fetchUpdateApplicationStatus()).resolves.toMatchObject({ status: 'running', mode: 'git' })
    await expect(fetchUpdateApplicationStatus()).resolves.toMatchObject({ status: 'completed', mode: 'git' })

    expect(mockedFetch.mock.calls.map(([url]) => url)).toEqual([
      '/api/cluster/update/hybrid/application/status',
      '/api/cluster/update/application/status',
      '/api/cluster/update/application/status',
      '/api/cluster/update/hybrid/application/status',
      '/api/cluster/update/hybrid/application/status',
    ])
  })
})
