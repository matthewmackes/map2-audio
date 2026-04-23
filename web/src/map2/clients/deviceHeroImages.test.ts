import { buildDeviceHeroImageUrl, deviceHeroImagesApi } from './deviceHeroImages'
import { ApiError } from '../http'

const originalFetch = globalThis.fetch

function installFetch(impl: typeof fetch) {
  globalThis.fetch = impl as typeof fetch
}

function fakeResponse(status: number, body: unknown): Response {
  const serialized = typeof body === 'string' ? body : JSON.stringify(body)
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `status-${status}`,
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
    text: async () => serialized,
  } as unknown as Response
}

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('buildDeviceHeroImageUrl', () => {
  it('encodes the device id and appends a cache-buster when version is provided', () => {
    expect(buildDeviceHeroImageUrl('MPX1')).toMatch(/\/api\/devices\/hero-images\/mpx1$/)
    expect(buildDeviceHeroImageUrl('mpx1', 123)).toMatch(/\/api\/devices\/hero-images\/mpx1\?v=123$/)
  })
})

describe('deviceHeroImagesApi.upload', () => {
  it('POSTs a multipart form and returns the record on success', async () => {
    const fetchSpy = jest.fn().mockResolvedValue(
      fakeResponse(200, {
        status: 'ok',
        device_id: 'mpx1',
        uploaded_at: 42,
        original_size_bytes: 123,
        original_mime: 'image/png',
      }),
    )
    installFetch(fetchSpy)
    const file = new File([new Uint8Array([0x89, 0x50])], 'mpx1.png', { type: 'image/png' })
    const result = await deviceHeroImagesApi.upload('mpx1', file)
    expect(result.device_id).toBe('mpx1')
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/devices\/hero-images\/mpx1$/),
      expect.objectContaining({ method: 'POST' }),
    )
    const init = fetchSpy.mock.calls[0][1] as RequestInit
    expect(init.body).toBeInstanceOf(FormData)
  })

  it('throws an ApiError carrying the envelope message when the backend rejects', async () => {
    installFetch(
      jest.fn().mockResolvedValue(
        fakeResponse(413, { error: { code: 'payload_too_large', message: 'Payload exceeds 2 MB', details: null } }),
      ),
    )
    const file = new File([new Uint8Array([0])], 'huge.png', { type: 'image/png' })
    await expect(deviceHeroImagesApi.upload('mpx1', file)).rejects.toBeInstanceOf(ApiError)
    try {
      await deviceHeroImagesApi.upload('mpx1', file)
    } catch (error) {
      expect((error as ApiError).message).toContain('Payload exceeds 2 MB')
      expect((error as ApiError).status).toBe(413)
    }
  })
})

describe('deviceHeroImagesApi.revert', () => {
  it('DELETEs the endpoint and returns the ack payload', async () => {
    const fetchSpy = jest.fn().mockResolvedValue(
      fakeResponse(200, { status: 'ok', removed: true, device_id: 'mpx1' }),
    )
    installFetch(fetchSpy)
    await expect(deviceHeroImagesApi.revert('mpx1')).resolves.toEqual({
      status: 'ok',
      removed: true,
      device_id: 'mpx1',
    })
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/devices\/hero-images\/mpx1$/),
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})

describe('deviceHeroImagesApi.exists', () => {
  it('resolves true when the HEAD response is 2xx and false otherwise', async () => {
    installFetch(jest.fn().mockResolvedValue(fakeResponse(200, '')))
    await expect(deviceHeroImagesApi.exists('mpx1')).resolves.toBe(true)
    installFetch(jest.fn().mockResolvedValue(fakeResponse(404, '')))
    await expect(deviceHeroImagesApi.exists('mpx1')).resolves.toBe(false)
  })
})
