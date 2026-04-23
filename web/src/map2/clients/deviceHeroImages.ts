/**
 * Frontend client for the device hero-image override endpoints (T2426-C).
 *
 * Mirrors the shape used by `irApi` — thin wrapper around `fetch` with an
 * ApiError when the backend rejects. The backend auto-crops to 1:1 and
 * downscales to 1024×1024, so callers only need to hand over the raw File.
 */
import { ApiError } from '../http'
import { API_BASE } from '../transport'

export interface DeviceHeroImageUploadResponse {
  status: string
  device_id: string
  uploaded_at: number
  original_size_bytes: number
  original_mime: string
}

export interface DeviceHeroImageErrorEnvelope {
  error: {
    code: string
    message: string
    details: unknown
  }
}

async function parseErrorEnvelope(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as DeviceHeroImageErrorEnvelope
    if (payload?.error?.message) return payload.error.message
  } catch {
    // fall through to statusText
  }
  return response.statusText || `Request failed with ${response.status}`
}

function encodeId(deviceId: string): string {
  return encodeURIComponent(deviceId.trim().toLowerCase())
}

/**
 * Build the cacheable URL used by an `<img src>` to render an override.
 *
 * A cache-busting suffix is appended when `version` is provided so the
 * browser reloads the image after an upload/revert.
 */
export function buildDeviceHeroImageUrl(deviceId: string, version?: number | string): string {
  const base = `${API_BASE}/devices/hero-images/${encodeId(deviceId)}`
  return version === undefined ? base : `${base}?v=${encodeURIComponent(String(version))}`
}

export const deviceHeroImagesApi = {
  upload: async (deviceId: string, file: File): Promise<DeviceHeroImageUploadResponse> => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await fetch(
      `${API_BASE}/devices/hero-images/${encodeId(deviceId)}`,
      { method: 'POST', body: formData },
    )
    if (!response.ok) {
      throw new ApiError(response.status, await parseErrorEnvelope(response))
    }
    return (await response.json()) as DeviceHeroImageUploadResponse
  },

  revert: async (deviceId: string): Promise<{ status: string; removed: boolean; device_id: string }> => {
    const response = await fetch(
      `${API_BASE}/devices/hero-images/${encodeId(deviceId)}`,
      { method: 'DELETE' },
    )
    if (!response.ok) {
      throw new ApiError(response.status, await parseErrorEnvelope(response))
    }
    return await response.json()
  },

  /**
   * Probe an override without downloading its bytes. Used by the store page
   * so the card can decide between the override URL and the packaged SVG
   * fallback without triggering a broken-image frame.
   */
  exists: async (deviceId: string): Promise<boolean> => {
    const response = await fetch(buildDeviceHeroImageUrl(deviceId), { method: 'HEAD' })
    return response.ok
  },
}
