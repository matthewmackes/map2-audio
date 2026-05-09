import { appendNodeQuery, appendPluginRuntimeQuery, appendQueryParams } from './http'

describe('appendNodeQuery', () => {
  it('returns the URL unchanged when nodeId is undefined', () => {
    expect(appendNodeQuery('/api/ir/cabinets')).toBe('/api/ir/cabinets')
  })

  it('returns the URL unchanged when nodeId is null', () => {
    expect(appendNodeQuery('/api/ir/cabinets', null)).toBe('/api/ir/cabinets')
  })

  it('returns the URL unchanged when nodeId is "all"', () => {
    expect(appendNodeQuery('/api/ir/cabinets', 'all')).toBe('/api/ir/cabinets')
  })

  it('returns the URL unchanged when nodeId is an empty string', () => {
    expect(appendNodeQuery('/api/ir/cabinets', '')).toBe('/api/ir/cabinets')
  })

  it('appends a string nodeId as a query parameter', () => {
    expect(appendNodeQuery('/api/ir/cabinets', 'audio-node-1')).toBe(
      '/api/ir/cabinets?node_id=audio-node-1',
    )
  })

  it('appends with & when the URL already has a query string', () => {
    expect(appendNodeQuery('/api/ir/status?type=cabinet', 'node-2')).toBe(
      '/api/ir/status?type=cabinet&node_id=node-2',
    )
  })

  // Regression: T2500 — TanStack Query passes a QueryFunctionContext object
  // as the first argument to bare queryFn references. Without a type guard,
  // the object would be stringified to "[object Object]" and produce a
  // bogus `?node_id=[object Object]` query that 404s on the backend.
  it('returns the URL unchanged when nodeId is an object (TanStack Query context)', () => {
    const queryContext = { queryKey: ['ir', 'cabinets'], signal: new AbortController().signal }
    expect(
      appendNodeQuery('/api/ir/cabinets', queryContext as unknown as string),
    ).toBe('/api/ir/cabinets')
  })

  it('returns the URL unchanged when nodeId is a number', () => {
    expect(appendNodeQuery('/api/ir/cabinets', 42 as unknown as string)).toBe(
      '/api/ir/cabinets',
    )
  })

  it('encodes special characters in the nodeId', () => {
    expect(appendNodeQuery('/api/ir/cabinets', 'node with spaces')).toBe(
      '/api/ir/cabinets?node_id=node%20with%20spaces',
    )
  })
})

describe('appendQueryParams', () => {
  it('drops undefined, null, and empty-string values', () => {
    expect(
      appendQueryParams('/api/ir/status', {
        type: 'cabinet',
        instance_id: undefined,
        plugin_position: null,
        unused: '',
      }),
    ).toBe('/api/ir/status?type=cabinet')
  })

  it('returns the URL unchanged when every param is empty', () => {
    expect(
      appendQueryParams('/api/ir/cabinets', {
        instance_id: undefined,
        plugin_position: null,
      }),
    ).toBe('/api/ir/cabinets')
  })

  it('appends with & when the URL already has a query string', () => {
    expect(
      appendQueryParams('/api/ir/status?type=cabinet', { instance_id: 7 }),
    ).toBe('/api/ir/status?type=cabinet&instance_id=7')
  })
})

describe('appendPluginRuntimeQuery', () => {
  it('combines instance_id, plugin_position, and node_id', () => {
    expect(
      appendPluginRuntimeQuery('/api/ir/cabinets/foo/load', {
        instanceId: 3,
        pluginPosition: 5,
        nodeId: 'audio-node-1',
      }),
    ).toBe('/api/ir/cabinets/foo/load?instance_id=3&plugin_position=5&node_id=audio-node-1')
  })

  it('returns the URL unchanged when no options are provided', () => {
    expect(appendPluginRuntimeQuery('/api/ir/cabinets/foo/load')).toBe(
      '/api/ir/cabinets/foo/load',
    )
  })

  // Regression: T2500 — guard nodeId against non-string TanStack Query contexts
  it('returns the URL unchanged when nodeId is an object', () => {
    expect(
      appendPluginRuntimeQuery('/api/ir/cabinets/foo/load', {
        nodeId: { queryKey: ['x'] } as unknown as string,
      }),
    ).toBe('/api/ir/cabinets/foo/load')
  })
})
