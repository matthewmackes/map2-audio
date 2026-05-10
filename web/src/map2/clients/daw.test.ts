/**
 * T2503 Set 4 — DAW client jest coverage.
 *
 * Asserts URL shape, HTTP method, and JSON body shape for every verb the
 * client exposes. Doesn't run a real backend; mocks `fetch`.
 */
import { dawApi } from './daw'

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
      json: async () => ({ accepted: true, verb: 'daw.test' }),
      text: async () => JSON.stringify({ accepted: true, verb: 'daw.test' }),
    } as unknown as Response
  }) as typeof fetch
  return { calls }
}

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('dawApi.getMode', () => {
  it('GETs /api/daw/mode', async () => {
    const { calls } = installCaptureFetch()
    await dawApi.getMode()
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toMatch(/\/api\/daw\/mode$/)
    expect(calls[0].init?.method ?? 'GET').toBe('GET')
  })
})

describe('dawApi.setMode', () => {
  it('POSTs the mode body to /api/daw/mode', async () => {
    const { calls } = installCaptureFetch()
    await dawApi.setMode('daw')
    expect(calls[0].url).toMatch(/\/api\/daw\/mode$/)
    expect(calls[0].init?.method).toBe('POST')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ mode: 'daw' })
  })
})

describe('dawApi transport verbs', () => {
  it('play and stop hit the correct routes', async () => {
    const { calls } = installCaptureFetch()
    await dawApi.play()
    await dawApi.stop()
    expect(calls[0].url).toMatch(/\/api\/v1\/daw\/transport\/play$/)
    expect(calls[1].url).toMatch(/\/api\/v1\/daw\/transport\/stop$/)
    expect(calls[0].init?.method).toBe('POST')
    expect(calls[1].init?.method).toBe('POST')
  })

  it('setRecord posts arm flag', async () => {
    const { calls } = installCaptureFetch()
    await dawApi.setRecord(true)
    expect(calls[0].url).toMatch(/transport\/record$/)
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ arm: true })
  })

  it('setPosition posts samples', async () => {
    const { calls } = installCaptureFetch()
    await dawApi.setPosition(48000)
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ samples: 48000 })
  })
})

describe('dawApi project verbs', () => {
  it('newProject posts name', async () => {
    const { calls } = installCaptureFetch()
    await dawApi.newProject('test-song')
    expect(calls[0].url).toMatch(/\/projects$/)
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ name: 'test-song' })
  })

  it('loadProject posts path', async () => {
    const { calls } = installCaptureFetch()
    await dawApi.loadProject('/tmp/foo')
    expect(calls[0].url).toMatch(/\/projects\/load$/)
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ path: '/tmp/foo' })
  })

  it('saveProject posts no body', async () => {
    const { calls } = installCaptureFetch()
    await dawApi.saveProject()
    expect(calls[0].url).toMatch(/\/projects\/save$/)
    expect(calls[0].init?.method).toBe('POST')
  })
})

describe('dawApi track verbs', () => {
  it('createTrack posts payload', async () => {
    const { calls } = installCaptureFetch()
    await dawApi.createTrack({ type: 'audio', name: 'Lead' })
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ type: 'audio', name: 'Lead' })
  })

  it('deleteTrack uses path param', async () => {
    const { calls } = installCaptureFetch()
    await dawApi.deleteTrack(7)
    expect(calls[0].url).toMatch(/\/tracks\/7$/)
    expect(calls[0].init?.method).toBe('DELETE')
  })

  it('setTrackArm patches with armed flag', async () => {
    const { calls } = installCaptureFetch()
    await dawApi.setTrackArm(7, true)
    expect(calls[0].url).toMatch(/\/tracks\/7\/arm$/)
    expect(calls[0].init?.method).toBe('PATCH')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ armed: true })
  })
})

describe('dawApi clip verbs', () => {
  it('addClip posts payload', async () => {
    const { calls } = installCaptureFetch()
    await dawApi.addClip({
      track_id: 1,
      start_samples: 0,
      length_samples: 48000,
      source: 'audio/take1.wav',
    })
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      track_id: 1,
      start_samples: 0,
      length_samples: 48000,
      source: 'audio/take1.wav',
    })
  })

  it('removeClip uses path param', async () => {
    const { calls } = installCaptureFetch()
    await dawApi.removeClip(42)
    expect(calls[0].url).toMatch(/\/clips\/42$/)
    expect(calls[0].init?.method).toBe('DELETE')
  })

  it('moveClip patches with new_start_samples', async () => {
    const { calls } = installCaptureFetch()
    await dawApi.moveClip(42, 96000)
    expect(calls[0].url).toMatch(/\/clips\/42\/move$/)
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ new_start_samples: 96000 })
  })
})

describe('dawApi automation', () => {
  it('setAutomationPoint posts triple', async () => {
    const { calls } = installCaptureFetch()
    await dawApi.setAutomationPoint(5, 1.5, 0.75)
    expect(calls[0].url).toMatch(/\/automation\/points$/)
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      lane_id: 5,
      position: 1.5,
      value: 0.75,
    })
  })
})

describe('dawApi plugin verbs', () => {
  it('addPluginToTrack posts uri', async () => {
    const { calls } = installCaptureFetch()
    await dawApi.addPluginToTrack(2, 'http://lv2plug.in/plugins/eg-amp')
    expect(calls[0].url).toMatch(/\/tracks\/2\/plugins$/)
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      plugin_uri: 'http://lv2plug.in/plugins/eg-amp',
    })
  })

  it('removePluginFromTrack uses path params', async () => {
    const { calls } = installCaptureFetch()
    await dawApi.removePluginFromTrack(2, 0)
    expect(calls[0].url).toMatch(/\/tracks\/2\/plugins\/0$/)
    expect(calls[0].init?.method).toBe('DELETE')
  })

  it('setPluginParam patches with param_id+value', async () => {
    const { calls } = installCaptureFetch()
    await dawApi.setPluginParam(2, 0, 'gain', 0.5)
    expect(calls[0].url).toMatch(/\/tracks\/2\/plugins\/0$/)
    expect(calls[0].init?.method).toBe('PATCH')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ param_id: 'gain', value: 0.5 })
  })
})
