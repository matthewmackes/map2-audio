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

  it('POSTs morph XY coordinates to /api/state-authority/morph/position', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ x: 0.25, y: 0.75, configured_corners: ['A', 'D'] }),
    })

    const result = await stateAuthorityApi.setMorphPosition(0.25, 0.75)

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API_BASE}/api/state-authority/morph/position`)
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST')
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ x: 0.25, y: 0.75 }))
    expect(result.x).toBe(0.25)
    expect(result.y).toBe(0.75)
    expect(result.configured_corners).toEqual(['A', 'D'])
  })

  it('fetches current morph state from /api/state-authority/morph/state', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ x: 0.5, y: 0.5, configured_corners: [] }),
    })

    const state = await stateAuthorityApi.getMorphState()

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API_BASE}/api/state-authority/morph/state`)
    expect(state.x).toBe(0.5)
  })

  it('fetches the live State Authority graph document', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        snapshot_id: 42,
        snapshot_name: 'Live Tone',
        is_live: true,
        document: { version: '2026.04', meta: { name: 'Live Tone', type: 'snapshot' } },
      }),
    })

    const result = await stateAuthorityApi.getLiveDocument()

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API_BASE}/api/state-authority/live-document`)
    expect(result.snapshot_id).toBe(42)
    expect(result.is_live).toBe(true)
    expect((result.document as any).meta.name).toBe('Live Tone')
  })

  it('fetches a specific snapshot document by id', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        snapshot_id: 101,
        snapshot_name: 'Archived',
        is_live: false,
        document: { version: '2026.04' },
      }),
    })

    const result = await stateAuthorityApi.getSnapshotDocument(101)

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${API_BASE}/api/state-authority/snapshots/101/document`,
    )
    expect(result.snapshot_id).toBe(101)
    expect(result.is_live).toBe(false)
  })

  it('fetches reconciliation metrics in JSON + Prometheus format', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        metrics: {
          local_runs_total: 7,
          local_drift_detected_total: 1,
          local_corrections_applied_total: 1,
          local_reactivations_required_total: 0,
          cluster_runs_total: 0,
          cluster_nodes_with_drift_total: 0,
          last_local_reconcile_unix_s: 1_700_000_000,
          last_cluster_reconcile_unix_s: 0,
          last_local_status: 'self_healed',
          last_cluster_status: 'never_run',
          last_local_error: null,
          last_cluster_error: null,
        },
        prometheus: '# HELP map2_state_authority_local_runs_total …\n',
      }),
    })

    const payload = await stateAuthorityApi.getReconciliationMetrics()

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${API_BASE}/api/state-authority/reconciliation/metrics`,
    )
    expect(payload.metrics.local_runs_total).toBe(7)
    expect(payload.prometheus).toContain('map2_state_authority_local_runs_total')
  })
})
