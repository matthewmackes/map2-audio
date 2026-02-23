import { safeFetchJson } from './safeJsonFetch'

function mockHeaders(contentType: string): Headers {
  return {
    get: (key: string) => (key.toLowerCase() === 'content-type' ? contentType : null),
  } as unknown as Headers
}

describe('safeFetchJson', () => {
  const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>

  beforeEach(() => {
    ;(globalThis as { fetch?: typeof fetch }).fetch = fetchMock
    fetchMock.mockReset()
  })

  afterEach(() => {
    delete (globalThis as { fetch?: typeof fetch }).fetch
  })

  it('throws actionable remediation when a successful API call returns non-JSON', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: mockHeaders('text/html; charset=utf-8'),
      text: jest.fn().mockResolvedValue('<html><body>index fallback</body></html>'),
    } as unknown as Response)

    await expect(
      safeFetchJson('/api/avb/devices')
    ).rejects.toThrow('Expected JSON from /api/avb/devices but received text/html; charset=utf-8')
  })

  it('uses error message extractor for JSON error payloads', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      headers: mockHeaders('application/json'),
      json: jest.fn().mockResolvedValue({ detail: { code: 'ERR', reason: 'conflict' } }),
    } as unknown as Response)

    await expect(
      safeFetchJson('/api/avb/router/connect', undefined, {
        fallbackError: 'Connection failed',
        errorMessageExtractor: (payload) => `parsed:${JSON.stringify(payload)}`,
      })
    ).rejects.toThrow('parsed:{"detail":{"code":"ERR","reason":"conflict"}}')
  })

  it('throws invalid JSON message when content-type is JSON but parsing fails', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: mockHeaders('application/json'),
      json: jest.fn().mockRejectedValue(new Error('parse error')),
    } as unknown as Response)

    await expect(
      safeFetchJson('/api/avb/streams')
    ).rejects.toThrow('Invalid JSON response from /api/avb/streams')
  })
})

