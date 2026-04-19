import { brainApi } from './brain'
import { API_BASE } from '../transport'

describe('brainApi runtime scoping', () => {
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

  it('appends instance, plugin position, and node scope to state requests', async () => {
    await brainApi.getState({ instanceId: 17, pluginPosition: 3, nodeId: 'node-a' })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${API_BASE}/engine/brain/state?instance_id=17&plugin_position=3&node_id=node-a`,
    )
  })

  it('preserves existing query parameters when sample-editor requests add plugin scope', async () => {
    await brainApi.getSampleEditor(2, { pluginPosition: 4 })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${API_BASE}/engine/brain/sample-editor?slot_id=2&plugin_position=4`,
    )
  })
})
