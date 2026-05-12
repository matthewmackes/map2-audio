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
