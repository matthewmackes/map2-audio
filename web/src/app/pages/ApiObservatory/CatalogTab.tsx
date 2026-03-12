import { useMemo, useState } from 'react'

import type { OpenApiCatalogEndpoint, OpenApiCatalogGroup } from '../../hooks/useOpenApiSchema'
import {
  API_DEPRECATION_REGISTRY,
  API_DOMAIN_DOCS,
  API_ENDPOINT_CHANGELOG,
  API_PERFORMANCE_NOTES,
  API_SEQUENCE_DIAGRAMS,
  getEndpointDoc,
} from '../../data/apiDocumentation'
import {
  CodeSnippetGenerator,
  JsonTreeViewer,
  MethodBadge,
  SearchableList,
  type SearchableListItem,
} from '../../components/ApiObservatory/primitives'
import { safeJsonPretty } from './utils'

interface CatalogListItem extends SearchableListItem {
  endpoint: OpenApiCatalogEndpoint
  group: OpenApiCatalogGroup
}

function makeKey(endpoint: OpenApiCatalogEndpoint) {
  return `${endpoint.method.toUpperCase()} ${endpoint.path}`
}

function getDomainDescription(tag: string): string {
  const lowered = tag.toLowerCase()
  const match = Object.entries(API_DOMAIN_DOCS).find(([domain]) => lowered.includes(domain))
  return match?.[1].description ?? 'OpenAPI-generated domain documentation.'
}

function renderMermaidFallback(diagramId?: string) {
  if (!diagramId) return null
  const diagram = API_SEQUENCE_DIAGRAMS.find((item) => item.id === diagramId)
  if (!diagram) return null
  return (
    <div className="api-observatory-catalog__mermaid-block">
      <strong>{diagram.title}</strong>
      <pre><code>{diagram.mermaid}</code></pre>
    </div>
  )
}

export function CatalogTab({
  catalog,
  showDiffHighlights,
  onTryIt,
}: {
  catalog: OpenApiCatalogGroup[]
  showDiffHighlights: boolean
  onTryIt: (endpoint: OpenApiCatalogEndpoint) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const items = useMemo<CatalogListItem[]>(() => {
    const mapped: CatalogListItem[] = []
    catalog.forEach((group) => {
      group.endpoints.forEach((endpoint) => {
        mapped.push({
          id: makeKey(endpoint),
          label: `${endpoint.method.toUpperCase()} ${endpoint.path}`,
          category: group.tag,
          description: `${endpoint.summary} ${endpoint.description}`,
          endpoint,
          group,
        })
      })
    })
    return mapped
  }, [catalog])

  const selected = useMemo(() => {
    if (selectedId) {
      return items.find((item) => item.id === selectedId) ?? null
    }
    return items[0] ?? null
  }, [items, selectedId])

  if (!selected) {
    return <div className="api-observatory-panel">No OpenAPI endpoints available.</div>
  }

  const endpoint = selected.endpoint
  const docs = getEndpointDoc(endpoint.method, endpoint.path)
  const methodPath = makeKey(endpoint)
  const changelog = API_ENDPOINT_CHANGELOG.filter((entry) => entry.path === endpoint.path && entry.method === endpoint.method.toUpperCase())
  const deprecation = API_DEPRECATION_REGISTRY.find(
    (entry) => entry.path === endpoint.path && entry.method === endpoint.method.toUpperCase(),
  ) ?? null
  const performance = API_PERFORMANCE_NOTES[methodPath]

  const responseSchema = endpoint.responses[0]?.schema ?? null

  return (
    <section className="api-observatory-panel api-observatory-catalog">
      <aside className="api-observatory-catalog__sidebar">
        <SearchableList
          items={items}
          selectedId={selected.id}
          onSelect={(item) => setSelectedId(item.id)}
          placeholder="Search paths, params, docs"
          maxHeight={640}
          searchDataAttribute="catalog-search"
        />
      </aside>

      <article className="api-observatory-catalog__detail">
        <header className="api-observatory-catalog__header">
          <div>
            <div className="api-observatory-catalog__method-row">
              <MethodBadge method={endpoint.method} />
              <code>{endpoint.path}</code>
              {showDiffHighlights && endpoint.diffStatus && (
                <span className={`api-observatory-catalog__diff api-observatory-catalog__diff--${endpoint.diffStatus}`}>
                  {endpoint.diffStatus === 'added' ? 'NEW' : 'UPDATED'}
                </span>
              )}
            </div>
            <h2>{endpoint.summary}</h2>
            <p>{docs?.purpose ?? (endpoint.description || 'Documentation pending.')}</p>
          </div>
          <div className="api-observatory-catalog__header-actions">
            <button type="button" onClick={() => onTryIt(endpoint)}>Try It</button>
          </div>
        </header>

        <section className="api-observatory-catalog__meta">
          <div>
            <h3>Domain</h3>
            <p>{selected.group.tag}</p>
            <p>{getDomainDescription(selected.group.tag)}</p>
          </div>
          <div>
            <h3>When To Use</h3>
            <p>{docs?.whenToUse ?? 'Use this endpoint according to OpenAPI summary and request/response schemas.'}</p>
          </div>
          <div>
            <h3>Related Endpoints</h3>
            <div className="api-observatory-chip-list">
              {(docs?.related ?? []).map((related) => (
                <span key={related}>{related}</span>
              ))}
              {docs?.related?.length === 0 && <span>No related endpoint links yet.</span>}
            </div>
          </div>
        </section>

        {deprecation && (
          <section className="api-observatory-catalog__warning">
            <strong>Deprecated endpoint</strong>
            <p>{deprecation.reason}</p>
            <p>Migration: {deprecation.migration}</p>
          </section>
        )}

        {performance && (
          <section className="api-observatory-catalog__performance">
            <strong>Performance note</strong>
            <p>{performance}</p>
          </section>
        )}

        <section className="api-observatory-catalog__schemas">
          <div>
            <h3>Parameters</h3>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>In</th>
                  <th>Type</th>
                  <th>Required</th>
                </tr>
              </thead>
              <tbody>
                {endpoint.parameters.map((param) => (
                  <tr key={`${endpoint.id}-${param.in}-${param.name}`}>
                    <td>{param.name}</td>
                    <td>{param.in}</td>
                    <td>{param.type}</td>
                    <td>{param.required ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
                {endpoint.parameters.length === 0 && (
                  <tr>
                    <td colSpan={4}>No parameters</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div>
            <h3>Request Body Schema</h3>
            <JsonTreeViewer value={endpoint.requestBody ?? { message: 'No request body schema' }} maxHeight={260} />
          </div>

          <div>
            <h3>Response Schema</h3>
            <JsonTreeViewer value={responseSchema ?? { message: 'No response schema' }} maxHeight={260} />
          </div>
        </section>

        <section className="api-observatory-catalog__examples">
          <div>
            <h3>Example Request</h3>
            <pre><code>{docs?.exampleRequest ?? '{"method":"GET"}'}</code></pre>
          </div>
          <div>
            <h3>Example Response</h3>
            <pre><code>{docs?.exampleResponse ?? safeJsonPretty(responseSchema ?? {})}</code></pre>
          </div>
        </section>

        <section>
          <h3>Copy As</h3>
          <CodeSnippetGenerator
            request={{
              method: endpoint.method,
              url: endpoint.path,
              headers: endpoint.security.length > 0 ? { Authorization: 'Bearer {{token}}' } : {},
              body: endpoint.requestBody ? safeJsonPretty(endpoint.requestBody) : '',
            }}
          />
        </section>

        {renderMermaidFallback(docs?.sequenceDiagramId)}

        <section>
          <h3>Endpoint Changelog</h3>
          {changelog.length === 0 ? (
            <p>No changelog entries yet.</p>
          ) : (
            <ul>
              {changelog.map((entry) => (
                <li key={`${entry.date}-${entry.method}-${entry.path}`}>{entry.date} - {entry.description}</li>
              ))}
            </ul>
          )}
        </section>
      </article>
    </section>
  )
}

export default CatalogTab
