/**
 * T2503 Set 9 — plugin inventory TS client tests.
 */
import { pluginInventoryApi } from './pluginInventory'

const originalFetch = globalThis.fetch

interface Captured {
  url: string
  init?: RequestInit
}

function installCaptureFetch(): { calls: Captured[] } {
  const calls: Captured[] = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ plugins: [], size: 0, last_scan_at: null }),
      text: async () => '{}',
    } as unknown as Response
  }) as typeof fetch
  return { calls }
}

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('pluginInventoryApi.list', () => {
  it('GETs /api/v1/plugin-inventory/', async () => {
    const { calls } = installCaptureFetch()
    await pluginInventoryApi.list()
    expect(calls[0].url).toMatch(/\/api\/v1\/plugin-inventory\/$/)
    expect(calls[0].init?.method ?? 'GET').toBe('GET')
  })
})

describe('pluginInventoryApi.get', () => {
  it('URI-encodes the URI in the path', async () => {
    const { calls } = installCaptureFetch()
    await pluginInventoryApi.get('map2:fx:nam')
    // encodeURIComponent escapes : to %3A
    expect(calls[0].url).toMatch(/\/api\/v1\/plugin-inventory\/map2%3Afx%3Anam$/)
  })

  it('handles LV2 URIs with slashes', async () => {
    const { calls } = installCaptureFetch()
    await pluginInventoryApi.get('http://lv2plug.in/plugins/eg-amp')
    // encodeURIComponent escapes / to %2F
    expect(calls[0].url).toContain('%2F')
  })
})
