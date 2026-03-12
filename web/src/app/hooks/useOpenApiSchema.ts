import { useCallback, useEffect, useRef, useState } from 'react'

import { useWebSocketConnection, useWebSocketTopic } from '../../map2/hooks/useWebSocket'
import { apiUrl } from '../utils/apiTarget'

export interface OpenApiSchemaDiff {
  added: string[]
  removed: string[]
  modified: string[]
}

export interface OpenApiCatalogParameter {
  name: string
  in: string
  required: boolean
  description: string
  type: string
  schema: Record<string, unknown> | null
}

export interface OpenApiCatalogResponse {
  statusCode: string
  description: string
  contentTypes: string[]
  schema: Record<string, unknown> | null
}

export interface OpenApiCatalogEndpoint {
  id: string
  tag: string
  method: string
  path: string
  summary: string
  description: string
  parameters: OpenApiCatalogParameter[]
  requestBody: Record<string, unknown> | null
  responses: OpenApiCatalogResponse[]
  security: Array<Record<string, unknown>>
  diffStatus: 'added' | 'modified' | null
}

export interface OpenApiCatalogGroup {
  tag: string
  endpoints: OpenApiCatalogEndpoint[]
}

export interface UseOpenApiSchemaResult {
  schema: Record<string, unknown> | null
  catalog: OpenApiCatalogGroup[]
  loading: boolean
  error: string | null
  lastUpdated: string | null
  diff: OpenApiSchemaDiff
  refresh: () => Promise<void>
}

const EMPTY_DIFF: OpenApiSchemaDiff = {
  added: [],
  removed: [],
  modified: [],
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'] as const

type OpenApiDocument = Record<string, unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneDiff(diff: OpenApiSchemaDiff): OpenApiSchemaDiff {
  return {
    added: [...diff.added],
    removed: [...diff.removed],
    modified: [...diff.modified],
  }
}

export function normalizeOpenApiDiff(value: unknown): OpenApiSchemaDiff {
  if (!isRecord(value)) {
    return cloneDiff(EMPTY_DIFF)
  }

  const ensureList = (entry: unknown) =>
    Array.isArray(entry) ? entry.filter((item): item is string => typeof item === 'string') : []

  return {
    added: ensureList(value.added),
    removed: ensureList(value.removed),
    modified: ensureList(value.modified),
  }
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortJsonValue(entry))
  }

  if (isRecord(value)) {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortJsonValue(value[key])
        return acc
      }, {})
  }

  return value
}

function stableHash(value: unknown): string {
  return JSON.stringify(sortJsonValue(value))
}

function buildPathSignatures(schema: OpenApiDocument | null): Record<string, string> {
  if (!schema || !isRecord(schema.paths)) {
    return {}
  }

  return Object.entries(schema.paths).reduce<Record<string, string>>((acc, [path, pathItem]) => {
    acc[path] = stableHash(pathItem)
    return acc
  }, {})
}

export function calculateOpenApiDiff(
  previousSchema: OpenApiDocument | null,
  nextSchema: OpenApiDocument | null,
): OpenApiSchemaDiff {
  if (!previousSchema || !nextSchema) {
    return cloneDiff(EMPTY_DIFF)
  }

  const previous = buildPathSignatures(previousSchema)
  const next = buildPathSignatures(nextSchema)
  const previousPaths = new Set(Object.keys(previous))
  const nextPaths = new Set(Object.keys(next))
  const commonPaths = [...previousPaths].filter((path) => nextPaths.has(path))

  return {
    added: [...nextPaths].filter((path) => !previousPaths.has(path)).sort(),
    removed: [...previousPaths].filter((path) => !nextPaths.has(path)).sort(),
    modified: commonPaths.filter((path) => previous[path] !== next[path]).sort(),
  }
}

function describeSchemaType(schema: unknown): string {
  if (!isRecord(schema)) {
    return 'unknown'
  }

  if (typeof schema.$ref === 'string') {
    const refSegments = schema.$ref.split('/')
    return refSegments[refSegments.length - 1] ?? 'ref'
  }

  if (typeof schema.type === 'string') {
    return schema.type
  }

  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    return `anyOf(${schema.anyOf.length})`
  }

  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    return `oneOf(${schema.oneOf.length})`
  }

  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    return `allOf(${schema.allOf.length})`
  }

  return 'object'
}

function normalizeParameters(value: unknown): OpenApiCatalogParameter[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((parameter) => {
    if (!isRecord(parameter)) {
      return []
    }

    const schema = isRecord(parameter.schema) ? parameter.schema : null

    return [
      {
        name: typeof parameter.name === 'string' ? parameter.name : 'unnamed',
        in: typeof parameter.in === 'string' ? parameter.in : 'unknown',
        required: Boolean(parameter.required),
        description: typeof parameter.description === 'string' ? parameter.description : '',
        type: describeSchemaType(schema),
        schema,
      },
    ]
  })
}

function normalizeResponses(value: unknown): OpenApiCatalogResponse[] {
  if (!isRecord(value)) {
    return []
  }

  return Object.entries(value)
    .map(([statusCode, response]) => {
      if (!isRecord(response)) {
        return null
      }

      const content = isRecord(response.content) ? response.content : {}
      const firstMediaType = Object.values(content).find((entry) => isRecord(entry) && isRecord(entry.schema))
      const firstSchema = isRecord(firstMediaType) && isRecord(firstMediaType.schema) ? firstMediaType.schema : null

      return {
        statusCode,
        description: typeof response.description === 'string' ? response.description : '',
        contentTypes: Object.keys(content),
        schema: firstSchema,
      }
    })
    .filter((response): response is OpenApiCatalogResponse => response !== null)
    .sort((left, right) => left.statusCode.localeCompare(right.statusCode))
}

export function parseOpenApiCatalog(
  schema: OpenApiDocument | null,
  diff: OpenApiSchemaDiff = EMPTY_DIFF,
): OpenApiCatalogGroup[] {
  if (!schema || !isRecord(schema.paths)) {
    return []
  }

  const groups = new Map<string, OpenApiCatalogEndpoint[]>()
  const diffAdded = new Set(diff.added)
  const diffModified = new Set(diff.modified)

  Object.entries(schema.paths).forEach(([path, pathItem]) => {
    if (!isRecord(pathItem)) {
      return
    }

    const sharedParameters = normalizeParameters(pathItem.parameters)

    HTTP_METHODS.forEach((method) => {
      const operation = pathItem[method]
      if (!isRecord(operation)) {
        return
      }

      const tags = Array.isArray(operation.tags)
        ? operation.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
        : []
      const tag = tags[0] ?? 'Untagged'
      const endpoints = groups.get(tag) ?? []
      const parameters = [...sharedParameters, ...normalizeParameters(operation.parameters)]
      const requestBody =
        isRecord(operation.requestBody) && isRecord(operation.requestBody.content)
          ? (operation.requestBody as Record<string, unknown>)
          : null

      endpoints.push({
        id: `${method.toUpperCase()} ${path}`,
        tag,
        method,
        path,
        summary:
          typeof operation.summary === 'string'
            ? operation.summary
            : typeof operation.operationId === 'string'
              ? operation.operationId
              : `${method.toUpperCase()} ${path}`,
        description: typeof operation.description === 'string' ? operation.description : '',
        parameters,
        requestBody,
        responses: normalizeResponses(operation.responses),
        security: Array.isArray(operation.security)
          ? operation.security.filter((entry): entry is Record<string, unknown> => isRecord(entry))
          : [],
        diffStatus: diffAdded.has(path) ? 'added' : diffModified.has(path) ? 'modified' : null,
      })
      groups.set(tag, endpoints)
    })
  })

  return [...groups.entries()]
    .map(([tag, endpoints]) => ({
      tag,
      endpoints: endpoints.sort((left, right) =>
        left.path === right.path
          ? left.method.localeCompare(right.method)
          : left.path.localeCompare(right.path),
      ),
    }))
    .sort((left, right) => left.tag.localeCompare(right.tag))
}

export function useOpenApiSchema(): UseOpenApiSchemaResult {
  useWebSocketConnection()

  const [schema, setSchema] = useState<OpenApiDocument | null>(null)
  const [catalog, setCatalog] = useState<OpenApiCatalogGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [diff, setDiff] = useState<OpenApiSchemaDiff>(cloneDiff(EMPTY_DIFF))

  const schemaRef = useRef<OpenApiDocument | null>(null)
  const pendingDiffRef = useRef<OpenApiSchemaDiff | null>(null)
  const inFlightRefreshRef = useRef<Promise<void> | null>(null)

  const refresh = useCallback(async () => {
    if (inFlightRefreshRef.current) {
      return inFlightRefreshRef.current
    }

    if (schemaRef.current === null) {
      setLoading(true)
    }
    setError(null)

    const refreshPromise = (async () => {
      try {
        const response = await fetch(apiUrl('/openapi.json'))
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const nextSchema = (await response.json()) as OpenApiDocument
        const nextDiff = pendingDiffRef.current ?? calculateOpenApiDiff(schemaRef.current, nextSchema)
        pendingDiffRef.current = null

        schemaRef.current = nextSchema
        setSchema(nextSchema)
        setDiff(nextDiff)
        setCatalog(parseOpenApiCatalog(nextSchema, nextDiff))
        setLastUpdated(new Date().toISOString())
      } catch (fetchError) {
        const message = fetchError instanceof Error ? fetchError.message : 'Failed to load OpenAPI schema'
        setError(message)
      } finally {
        setLoading(false)
        inFlightRefreshRef.current = null
      }
    })()

    inFlightRefreshRef.current = refreshPromise
    return refreshPromise
  }, [])

  useWebSocketTopic('schema_changed', (data, message) => {
    const payload = isRecord(data) ? data : isRecord(message.data) ? message.data : {}
    pendingDiffRef.current = normalizeOpenApiDiff(payload.diff)
    void refresh()
  })

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refresh()
    }, 30000)

    return () => window.clearInterval(interval)
  }, [refresh])

  return {
    schema,
    catalog,
    loading,
    error,
    lastUpdated,
    diff,
    refresh,
  }
}
