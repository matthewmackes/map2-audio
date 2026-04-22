import { stateAuthorityApi } from './stateAuthority'
import { API_BASE } from '../transport'

describe('stateAuthorityApi', () => {
  const originalFetch = global.fetch
  const fetchMock = jest.fn()

  beforeEach(() => {
    fetchMock.mockClear()
    global.fetch = fetchMock as unknown as typeof fetch
  })

  afterAll(() => {
    global.fetch = originalFetch
  })

  it('fetches the full URI catalog from /api/state-authority/uri-catalog', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        entries: [
          {
            uri: 'map2:fx:nam',
            type: 'fx',
            name: 'nam',
            label: 'Neural Amp Modeler',
            description: 'NAM loader',
            category: 'amp',
            default_parameters: { gain: 0.7 },
            default_state: {},
            aliases: ['map2://juce/nam'],
            is_system_managed: false,
          },
        ],
        count: 1,
      }),
    })

    const result = await stateAuthorityApi.getCatalog()

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API_BASE}/api/state-authority/uri-catalog`)
    expect(result.count).toBe(1)
    expect(result.entries[0].uri).toBe('map2:fx:nam')
  })

  it('fetches the type-filtered catalog from /api/state-authority/uri-catalog/{type}', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ entries: [], count: 0 }),
    })

    await stateAuthorityApi.getCatalogByType('sys')

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API_BASE}/api/state-authority/uri-catalog/sys`)
  })

  it('POSTs to /api/state-authority/uri-resolve with the provided URI', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        input: 'map2://juce/nam',
        canonical: 'map2:fx:nam',
        entry: {
          uri: 'map2:fx:nam',
          type: 'fx',
          name: 'nam',
          label: 'Neural Amp Modeler',
          description: 'NAM loader',
          category: 'amp',
          default_parameters: { gain: 0.7 },
          default_state: {},
          aliases: ['map2://juce/nam'],
          is_system_managed: false,
        },
      }),
    })

    const result = await stateAuthorityApi.resolveUri('map2://juce/nam')

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API_BASE}/api/state-authority/uri-resolve`)
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST')
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ uri: 'map2://juce/nam' }))
    expect(result.canonical).toBe('map2:fx:nam')
    expect(result.entry?.label).toBe('Neural Amp Modeler')
  })

  it('fetches the monolithic JSON Schema from /api/state-authority/schema', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ title: 'MAP2 Snapshot Graph v2026.04' }),
    })

    const schema = await stateAuthorityApi.getSchema()

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API_BASE}/api/state-authority/schema`)
    expect(schema.title).toBe('MAP2 Snapshot Graph v2026.04')
  })
})
