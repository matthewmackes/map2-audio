import { act, renderHook, waitFor } from '@testing-library/react'

import { calculateOpenApiDiff, parseOpenApiCatalog, useOpenApiSchema } from './useOpenApiSchema'

let schemaChangedHandler: ((data: unknown, message: { data?: unknown }) => void) | null = null

jest.mock('../../map2/hooks/useWebSocket', () => ({
  useWebSocketConnection: () => ({
    status: 'connected',
    client: null,
    isConnected: true,
  }),
  useWebSocketTopic: (_topic: string, handler: (data: unknown, message: { data?: unknown }) => void) => {
    schemaChangedHandler = handler
  },
}))

jest.mock('../utils/apiTarget', () => ({
  apiUrl: (path: string) => path,
}))

function makeJsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: jest.fn().mockResolvedValue(payload),
  } as unknown as Response
}

const SCHEMA_A = {
  openapi: '3.1.0',
  paths: {
    '/api/audio/status': {
      get: {
        tags: ['Audio'],
        summary: 'Get audio status',
        description: 'Returns the current engine state.',
        parameters: [{ name: 'detail', in: 'query', required: false, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { type: 'object' },
              },
            },
          },
        },
      },
    },
  },
}

const SCHEMA_B = {
  openapi: '3.1.0',
  paths: {
    '/api/audio/status': {
      get: {
        tags: ['Audio'],
        summary: 'Get audio status',
        description: 'Returns the current engine state.',
        parameters: [
          { name: 'detail', in: 'query', required: false, schema: { type: 'string' } },
          { name: 'node_id', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { type: 'object' },
              },
            },
          },
        },
      },
    },
    '/api/system/info': {
      get: {
        tags: ['System'],
        summary: 'System info',
        responses: {
          '200': {
            description: 'OK',
          },
        },
      },
    },
  },
}

describe('useOpenApiSchema', () => {
  const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>

  beforeEach(() => {
    schemaChangedHandler = null
    fetchMock.mockReset()
    ;(globalThis as { fetch?: typeof fetch }).fetch = fetchMock
  })

  afterEach(() => {
    delete (globalThis as { fetch?: typeof fetch }).fetch
  })

  it('calculates schema diffs and groups endpoints by tag', () => {
    expect(calculateOpenApiDiff(SCHEMA_A, SCHEMA_B)).toEqual({
      added: ['/api/system/info'],
      removed: [],
      modified: ['/api/audio/status'],
    })

    const catalog = parseOpenApiCatalog(SCHEMA_B, {
      added: ['/api/system/info'],
      removed: [],
      modified: ['/api/audio/status'],
    })

    expect(catalog.map((group) => group.tag)).toEqual(['Audio', 'System'])
    expect(catalog[0].endpoints[0].diffStatus).toBe('modified')
    expect(catalog[1].endpoints[0].diffStatus).toBe('added')
  })

  it('fetches the schema on mount and refreshes from schema_changed websocket events', async () => {
    fetchMock
      .mockResolvedValueOnce(makeJsonResponse(SCHEMA_A))
      .mockResolvedValueOnce(makeJsonResponse(SCHEMA_B))

    const { result } = renderHook(() => useOpenApiSchema())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(fetchMock).toHaveBeenCalledWith('/openapi.json')
    expect(result.current.error).toBeNull()
    expect(result.current.catalog.map((group) => group.tag)).toEqual(['Audio'])
    expect(result.current.diff).toEqual({
      added: [],
      removed: [],
      modified: [],
    })

    act(() => {
      schemaChangedHandler?.(
        {
          diff: {
            added: ['/api/system/info'],
            removed: [],
            modified: ['/api/audio/status'],
          },
        },
        {
          data: {
            diff: {
              added: ['/api/system/info'],
              removed: [],
              modified: ['/api/audio/status'],
            },
          },
        },
      )
    })

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(result.current.diff).toEqual({
        added: ['/api/system/info'],
        removed: [],
        modified: ['/api/audio/status'],
      }),
    )

    expect(result.current.catalog.map((group) => group.tag)).toEqual(['Audio', 'System'])
    expect(result.current.catalog[0].endpoints[0].diffStatus).toBe('modified')
    expect(result.current.catalog[1].endpoints[0].diffStatus).toBe('added')
    expect(result.current.lastUpdated).toBeTruthy()
  })
})
