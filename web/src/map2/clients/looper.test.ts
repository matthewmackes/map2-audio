/**
 * T2512 — looperApi client tests.
 *
 * Pins the HTTP shape of every entry point on looperApi so a backend
 * route rename (or a refactor of /api/v1/looper/* path segments)
 * trips the suite loudly rather than silently breaking the
 * LooperPage.
 */

import { looperApi } from './looper'
import { API_BASE } from '../transport'

const BASE = `${API_BASE}/v1/looper`

describe('looperApi HTTP surface', () => {
  const originalFetch = global.fetch
  const fetchMock = jest.fn(async () => ({
    ok: true,
    json: async () => ({}),
  }))

  beforeEach(() => {
    fetchMock.mockClear()
    global.fetch = fetchMock as unknown as typeof fetch
  })

  afterAll(() => {
    global.fetch = originalFetch
  })

  // ---------- GET ----------

  it('getStatus → GET /api/v1/looper/status', async () => {
    await looperApi.getStatus()
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/status`)
    const init = fetchMock.mock.calls[0]?.[1] ?? {}
    // GET — no method override expected.
    expect((init as RequestInit).method ?? 'GET').toBe('GET')
  })

  // ---------- Stomp verbs ----------

  it.each([
    ['record', 'record'],
    ['stop', 'stop'],
    ['clear', 'clear'],
    ['undo', 'undo'],
    ['redo', 'redo'],
  ])('%s(track=2) → POST /track/2/%s', async (method, segment) => {
    // @ts-expect-error — indexing by string for parametric coverage
    await looperApi[method](2)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/track/2/${segment}`)
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    expect(init?.method).toBe('POST')
  })

  // ---------- Per-track setters ----------

  it('setLevel(3, -6) → PATCH /track/3/level with {db: -6}', async () => {
    await looperApi.setLevel(3, -6)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/track/3/level`)
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    expect(init?.method).toBe('PATCH')
    expect(JSON.parse(String(init?.body))).toEqual({ db: -6 })
  })

  it('setMuted(0, true) → PATCH /track/0/muted with {value: true}', async () => {
    await looperApi.setMuted(0, true)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/track/0/muted`)
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      value: true,
    })
  })

  it('setSoloed(1, false) → PATCH /track/1/soloed with {value: false}', async () => {
    await looperApi.setSoloed(1, false)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/track/1/soloed`)
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      value: false,
    })
  })

  it('setReverse(2, true) → PATCH /track/2/reverse with {value: true}', async () => {
    await looperApi.setReverse(2, true)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/track/2/reverse`)
  })

  it('setHalfSpeed(3, true) → PATCH /track/3/half-speed with {value: true}', async () => {
    await looperApi.setHalfSpeed(3, true)
    // Note: route path uses kebab-case "half-speed" (not snake_case).
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/track/3/half-speed`)
  })

  it('setLocked(0, true) → PATCH /track/0/locked with {value: true}', async () => {
    // T2512-LOCK — write-lock toggle.
    await looperApi.setLocked(0, true)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/track/0/locked`)
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      value: true,
    })
  })

  it('setOneShot(1, true) → PATCH /track/1/one-shot with {value: true}', async () => {
    // T2512-OS — one-shot mode toggle.
    await looperApi.setOneShot(1, true)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/track/1/one-shot`)
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      value: true,
    })
  })

  it('setAutoArmed(2, true) → PATCH /track/2/auto-armed with {value: true}', async () => {
    // T2512-AUTO — operator arms input-threshold auto-record.
    await looperApi.setAutoArmed(2, true)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/track/2/auto-armed`)
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      value: true,
    })
  })

  it('setAutoThresholdDb(3, -24) → PATCH /track/3/auto-threshold with {db: -24}', async () => {
    // T2512-AUTO — set the input-threshold dB.
    await looperApi.setAutoThresholdDb(3, -24)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/track/3/auto-threshold`)
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      db: -24,
    })
  })

  // ---------- T2512-PAGE-V2: new methods exposed in cycle 10 ----------

  it('setStopMode(0, "fade") → PATCH /track/0/stop-mode with {mode}', async () => {
    await looperApi.setStopMode(0, 'fade')
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/track/0/stop-mode`)
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      mode: 'fade',
    })
  })

  it('setFadeMs(2, 750) → PATCH /track/2/fade-ms with {fade_ms}', async () => {
    await looperApi.setFadeMs(2, 750)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/track/2/fade-ms`)
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      fade_ms: 750,
    })
  })

  it('setSyncMode(3, "master") → PATCH /track/3/sync-mode with {mode}', async () => {
    await looperApi.setSyncMode(3, 'master')
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/track/3/sync-mode`)
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      mode: 'master',
    })
  })

  it('setQuantizeDivision(0, "eighth") → PATCH /track/0/quantize-division', async () => {
    await looperApi.setQuantizeDivision(0, 'eighth')
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${BASE}/track/0/quantize-division`,
    )
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      division: 'eighth',
    })
  })

  it('addSlice(1, 0, 48000, "intro") → POST /track/1/slices with body', async () => {
    await looperApi.addSlice(1, 0, 48000, 'intro')
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/track/1/slices`)
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
      start_frame: 0,
      end_frame: 48000,
      label: 'intro',
    })
  })

  it('clearSlices(2) → DELETE /track/2/slices', async () => {
    await looperApi.clearSlices(2)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/track/2/slices`)
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    expect(init?.method).toBe('DELETE')
  })

  it('deleteSlice(1, 24000) → DELETE /track/1/slices/24000', async () => {
    await looperApi.deleteSlice(1, 24000)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/track/1/slices/24000`)
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    expect(init?.method).toBe('DELETE')
  })

  it('addSliceAtPlayhead(0, "x") → POST /track/0/slices/at-playhead', async () => {
    await looperApi.addSliceAtPlayhead(0, 'x')
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${BASE}/track/0/slices/at-playhead`,
    )
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ label: 'x' })
  })

  it('resetState() → POST /state/reset (no body)', async () => {
    await looperApi.resetState()
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/state/reset`)
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    expect(init?.method).toBe('POST')
    // No body / Content-Type expected.
    expect(init?.body).toBeUndefined()
  })

  it('autoRecordPush(2, -12) → POST /track/2/auto-record/push with {level_db}', async () => {
    await looperApi.autoRecordPush(2, -12)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${BASE}/track/2/auto-record/push`,
    )
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ level_db: -12 })
  })

  // ---------- Master ----------

  it('setMasterLevel(0) → PATCH /master/level with {db: 0}', async () => {
    await looperApi.setMasterLevel(0)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/master/level`)
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      db: 0,
    })
  })

  // ---------- Headers ----------

  it('PATCH calls send Content-Type: application/json', async () => {
    await looperApi.setLevel(0, -6)
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    const headers = (init?.headers ?? {}) as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
  })
})
