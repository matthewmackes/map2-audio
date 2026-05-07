import { useEffect, useMemo, useState } from 'react'
import { Checkbox, TextInput } from '@carbon/react'

import { EmptyState } from '../../components/shared/EmptyState'
import { CodeEditor } from './CodeEditor'
import { sendProxyRequest } from './api'
import { runScriptInSandbox } from './scriptSandbox'
import type {
  CollectionWorkspace,
  EnvironmentVariableSet,
  RequestDraft,
} from './types'
import { createDefaultDraft, draftToHeaders, draftToUrl, parseBody } from './utils'
import { CLUSTER_TEST_COLLECTIONS } from '../../data/clusterTestCollections'
import { readPersisted, writePersisted, type PersistedKey } from '../../utils/persistedState'

const WORKSPACES_KEY: PersistedKey<CollectionWorkspace[] | null> = {
  storageKey: 'map2.api_observatory.workspaces.v1',
  fallback: null,
  parse: (raw) => {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) return undefined
      return parsed as CollectionWorkspace[]
    } catch {
      return undefined
    }
  },
  serialize: (value) => (value === null ? '' : JSON.stringify(value)),
}

interface RunnerResult {
  requestId: string
  requestName: string
  pass: boolean
  status: number
  durationMs: number
  message?: string
}

function makeDefaultWorkspace(): CollectionWorkspace {
  return {
    id: `workspace-${Date.now()}`,
    name: 'Default Workspace',
    environments: [
      {
        id: 'env-local',
        name: 'Local',
        values: {
          base_url: '/api'.startsWith('/api') ? '' : '/api',
          token: '',
          cluster_node: 'local-node',
        },
      },
      {
        id: 'env-cluster',
        name: 'Cluster Node',
        values: {
          base_url: 'http://localhost:8080',
          token: '',
          cluster_node: 'all',
        },
      },
    ],
    collections: [
      {
        id: 'collection-default',
        name: 'Smoke Tests',
        requests: [
          {
            id: 'req-health',
            name: 'Health check',
            draft: {
              ...createDefaultDraft(1),
              name: 'Health check',
              method: 'GET',
              url: '{{base_url}}/api/health',
              nodeTarget: 'local-node',
            },
            dependencies: [],
            notes: 'Basic liveness check',
          },
        ],
      },
    ],
  }
}

function estimateStorageSize(value: unknown): number {
  return new Blob([JSON.stringify(value)]).size
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(href)
}

export function CollectionsTab({
  onOpenRequest,
}: {
  onOpenRequest: (draft: RequestDraft) => void
}) {
  const [workspaces, setWorkspaces] = useState<CollectionWorkspace[]>([makeDefaultWorkspace()])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>('')
  const [activeCollectionId, setActiveCollectionId] = useState<string>('')
  const [activeEnvironmentId, setActiveEnvironmentId] = useState<string>('env-local')
  const [runnerResults, setRunnerResults] = useState<RunnerResult[]>([])
  const [running, setRunning] = useState(false)
  const [runParallel, setRunParallel] = useState(false)
  const [parameterRowsText, setParameterRowsText] = useState('[{}]')

  useEffect(() => {
    const stored = readPersisted(WORKSPACES_KEY)
    if (!stored || stored.length === 0) {
      const initial = [makeDefaultWorkspace()]
      setWorkspaces(initial)
      setActiveWorkspaceId(initial[0].id)
      setActiveCollectionId(initial[0].collections[0]?.id ?? '')
      return
    }
    setWorkspaces(stored)
    setActiveWorkspaceId(stored[0].id)
    setActiveCollectionId(stored[0].collections[0]?.id ?? '')
    setActiveEnvironmentId(stored[0].environments[0]?.id ?? 'env-local')
  }, [])

  useEffect(() => {
    writePersisted(WORKSPACES_KEY, workspaces)
  }, [workspaces])

  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0],
    [activeWorkspaceId, workspaces],
  )

  const activeCollection = useMemo(
    () => activeWorkspace?.collections.find((collection) => collection.id === activeCollectionId) ?? activeWorkspace?.collections[0],
    [activeCollectionId, activeWorkspace],
  )

  const activeEnvironment = useMemo(
    () => activeWorkspace?.environments.find((environment) => environment.id === activeEnvironmentId) ?? activeWorkspace?.environments[0],
    [activeEnvironmentId, activeWorkspace],
  )

  const storageSize = useMemo(() => estimateStorageSize(workspaces), [workspaces])

  const mutateWorkspace = (updater: (workspace: CollectionWorkspace) => CollectionWorkspace) => {
    if (!activeWorkspace) {
      return
    }
    setWorkspaces((prev) => prev.map((workspace) => (workspace.id === activeWorkspace.id ? updater(workspace) : workspace)))
  }

  const addWorkspace = () => {
    const workspace: CollectionWorkspace = {
      ...makeDefaultWorkspace(),
      id: `workspace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: `Workspace ${workspaces.length + 1}`,
      collections: [],
    }
    setWorkspaces((prev) => [...prev, workspace])
    setActiveWorkspaceId(workspace.id)
    setActiveCollectionId('')
    setActiveEnvironmentId(workspace.environments[0]?.id ?? 'env-local')
  }

  const addCollection = () => {
    mutateWorkspace((workspace) => {
      const collection = {
        id: `collection-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: `Collection ${workspace.collections.length + 1}`,
        requests: [],
      }
      setActiveCollectionId(collection.id)
      return {
        ...workspace,
        collections: [...workspace.collections, collection],
      }
    })
  }

  const addRequest = () => {
    if (!activeCollection) {
      return
    }
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const request = {
      id: requestId,
      name: `Request ${activeCollection.requests.length + 1}`,
      draft: createDefaultDraft(activeCollection.requests.length + 1),
      dependencies: [],
      notes: '',
    }

    mutateWorkspace((workspace) => ({
      ...workspace,
      collections: workspace.collections.map((collection) => (
        collection.id === activeCollection.id
          ? {
              ...collection,
              requests: [...collection.requests, request],
            }
          : collection
      )),
    }))
  }

  const runCollection = async () => {
    if (!activeCollection || !activeEnvironment) {
      return
    }

    let parameterRows: Array<Record<string, string>> = [{}]
    try {
      const parsed = JSON.parse(parameterRowsText)
      if (Array.isArray(parsed) && parsed.length > 0) {
        parameterRows = parsed.filter((row): row is Record<string, string> => typeof row === 'object' && row !== null)
      }
    } catch {
      parameterRows = [{}]
    }

    const executeOne = async (requestItem: (typeof activeCollection.requests)[number], iterationVars: Record<string, string>) => {
      const envVars = {
        ...(activeEnvironment.values ?? {}),
        ...iterationVars,
      }
      const url = draftToUrl(requestItem.draft, envVars)
      const headers = draftToHeaders(requestItem.draft, envVars)
      const body = parseBody(requestItem.draft, envVars)

      const preRun = requestItem.draft.preRequestScript.trim()
        ? await runScriptInSandbox(requestItem.draft.preRequestScript, {
            request: {
              method: requestItem.draft.method,
              url,
              body,
            },
            response: null,
            environment: envVars,
          })
        : null

      const started = performance.now()
      const response = await sendProxyRequest({
        method: requestItem.draft.method,
        url,
        headers,
        body,
        node_id: requestItem.draft.nodeTarget,
      })
      const durationMs = performance.now() - started

      const testRun = requestItem.draft.testScript.trim()
        ? await runScriptInSandbox(requestItem.draft.testScript, {
            request: {
              method: requestItem.draft.method,
              url,
              body,
            },
            response: {
              status: response.status,
              body: response.body,
              headers: response.headers,
              total_ms: response.timing.total_ms,
            },
            environment: preRun?.environment ?? envVars,
          })
        : null

      const pass = response.status >= 200
        && response.status < 400
        && (testRun ? testRun.tests.every((test) => test.pass) && !testRun.error : true)

      return {
        requestId: requestItem.id,
        requestName: requestItem.name,
        pass,
        status: response.status,
        durationMs,
        message: testRun?.error?.message,
      } satisfies RunnerResult
    }

    setRunning(true)
    setRunnerResults([])

    try {
      const ordered = [...activeCollection.requests].sort((left, right) => left.dependencies.length - right.dependencies.length)
      const allTasks: Array<Promise<RunnerResult>> = []

      for (const row of parameterRows) {
        for (const requestItem of ordered) {
          if (runParallel) {
            allTasks.push(executeOne(requestItem, row))
          } else {
            const result = await executeOne(requestItem, row)
            setRunnerResults((prev) => [...prev, result])
          }
        }
      }

      if (runParallel && allTasks.length > 0) {
        const results = await Promise.all(allTasks)
        setRunnerResults(results)
      }
    } finally {
      setRunning(false)
    }
  }

  const importTemplateCollection = (templateId: string) => {
    const template = CLUSTER_TEST_COLLECTIONS.find((item) => item.id === templateId)
    if (!template || !activeWorkspace) {
      return
    }

    const collectionId = `cluster-template-${template.id}-${Date.now()}`
    const requests = template.requests.map((request, index) => ({
      id: `${collectionId}-req-${index}`,
      name: request.name,
      draft: {
        ...createDefaultDraft(index + 1),
        name: request.name,
        method: request.method,
        url: `{{base_url}}${request.url}`,
        nodeTarget: request.nodeTarget === 'all' ? 'all' : 'local-node',
      },
      dependencies: [],
      notes: template.description,
    }))

    mutateWorkspace((workspace) => ({
      ...workspace,
      collections: [
        ...workspace.collections,
        {
          id: collectionId,
          name: template.name,
          requests,
        },
      ],
    }))
    setActiveCollectionId(collectionId)
  }

  useEffect(() => {
    const handleRun = () => {
      void runCollection()
    }
    const handleBackup = () => {
      downloadJson('api-observatory-backup.json', workspaces)
    }

    window.addEventListener('api-observatory:run-collections', handleRun)
    window.addEventListener('api-observatory:download-backup', handleBackup)
    return () => {
      window.removeEventListener('api-observatory:run-collections', handleRun)
      window.removeEventListener('api-observatory:download-backup', handleBackup)
    }
  }, [workspaces])

  if (!activeWorkspace) {
    return <section className="api-observatory-panel">No workspace loaded.</section>
  }

  return (
    <section className="api-observatory-panel api-observatory-collections">
      <div className="api-observatory-collections__header">
        <div>
          <h3>Workspaces</h3>
          <div className="api-observatory-collections__row">
            <select value={activeWorkspace.id} onChange={(event) => setActiveWorkspaceId(event.target.value)}>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
              ))}
            </select>
            <button type="button" onClick={addWorkspace}>New workspace</button>
            <button type="button" onClick={() => downloadJson(`api-observatory-workspaces-${Date.now()}.json`, workspaces)}>Export workspace JSON</button>
            <button type="button" onClick={() => downloadJson('api-observatory-backup.json', workspaces)}>Download Backup</button>
          </div>
        </div>

        <div>
          <h3>Environment</h3>
          <div className="api-observatory-collections__row">
            <select value={activeEnvironment?.id ?? ''} onChange={(event) => setActiveEnvironmentId(event.target.value)}>
              {(activeWorkspace.environments ?? []).map((environment: EnvironmentVariableSet) => (
                <option key={environment.id} value={environment.id}>{environment.name}</option>
              ))}
            </select>
            <span>{storageSize > 5 * 1024 * 1024 ? 'Warning: localStorage over 5MB' : `${Math.round(storageSize / 1024)} KB`}</span>
          </div>
          <CodeEditor
            language="json"
            value={JSON.stringify(activeEnvironment?.values ?? {}, null, 2)}
            onChange={(value) => {
              try {
                const parsed = JSON.parse(value) as Record<string, string>
                mutateWorkspace((workspace) => ({
                  ...workspace,
                  environments: workspace.environments.map((environment) => (
                    environment.id === activeEnvironment?.id
                      ? { ...environment, values: parsed }
                      : environment
                  )),
                }))
              } catch {
                // keep editor permissive while user types invalid JSON
              }
            }}
            height={150}
          />
        </div>
      </div>

      <div className="api-observatory-collections__content">
        <aside>
          <h3>Collections</h3>
          <div className="api-observatory-collections__row">
            <button type="button" onClick={addCollection}>New collection</button>
            <button type="button" onClick={addRequest} disabled={!activeCollection}>Add request</button>
          </div>
          <div className="api-observatory-collections__list">
            {(activeWorkspace.collections ?? []).map((collection) => (
              <button
                key={collection.id}
                type="button"
                className={collection.id === activeCollection?.id ? 'is-selected' : ''}
                onClick={() => setActiveCollectionId(collection.id)}
              >
                {collection.name} ({collection.requests.length})
              </button>
            ))}
          </div>

          <h3>Cluster templates</h3>
          <div className="api-observatory-collections__list">
            {CLUSTER_TEST_COLLECTIONS.map((template) => (
              <button key={template.id} type="button" onClick={() => importTemplateCollection(template.id)}>
                Import {template.name}
              </button>
            ))}
          </div>
        </aside>

        <section aria-label="Collection details">
          <h3>{activeCollection?.name ?? 'No collection selected'}</h3>
          {activeCollection ? (
            <>
              <div className="api-observatory-collections__requests">
                {activeCollection.requests.map((request) => (
                  <article key={request.id}>
                    <header>
                      <strong>{request.name}</strong>
                      <button type="button" onClick={() => onOpenRequest(request.draft)}>Open in Builder</button>
                    </header>
                    <p>{request.draft.method} {request.draft.url}</p>
                    <TextInput
                      id={`collection-deps-${request.id}`}
                      labelText="Dependencies (comma-separated request IDs)"
                      value={request.dependencies.join(',')}
                      onChange={(event) => {
                        const next = event.target.value.split(',').map((part) => part.trim()).filter(Boolean)
                        mutateWorkspace((workspace) => ({
                          ...workspace,
                          collections: workspace.collections.map((collection) => (
                            collection.id === activeCollection.id
                              ? {
                                  ...collection,
                                  requests: collection.requests.map((candidate) => (
                                    candidate.id === request.id
                                      ? { ...candidate, dependencies: next }
                                      : candidate
                                  )),
                                }
                              : collection
                          )),
                        }))
                      }}
                    />
                    <textarea
                      value={request.notes ?? ''}
                      onChange={(event) => {
                        mutateWorkspace((workspace) => ({
                          ...workspace,
                          collections: workspace.collections.map((collection) => (
                            collection.id === activeCollection.id
                              ? {
                                  ...collection,
                                  requests: collection.requests.map((candidate) => (
                                    candidate.id === request.id
                                      ? { ...candidate, notes: event.target.value }
                                      : candidate
                                  )),
                                }
                              : collection
                          )),
                        }))
                      }}
                      rows={2}
                    />
                  </article>
                ))}
              </div>

              <section className="api-observatory-collections__runner">
                <h4>Collection Runner</h4>
                <label>
                  Parameterized runs (JSON array)
                  <textarea value={parameterRowsText} onChange={(event) => setParameterRowsText(event.target.value)} rows={5} />
                </label>
                <div className="api-observatory-collections__row">
                  <Checkbox
                    id="collection-run-parallel"
                    labelText="Run in parallel"
                    checked={runParallel}
                    onChange={(_event, { checked }) => setRunParallel(checked)}
                  />
                  <button type="button" onClick={runCollection} disabled={running || activeCollection.requests.length === 0}>
                    {running ? 'Running…' : 'Run All Tests'}
                  </button>
                  <button type="button" onClick={() => downloadJson('collection-report.json', runnerResults)} disabled={runnerResults.length === 0}>
                    Export JSON Report
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const html = `<!doctype html><html><body><pre>${JSON.stringify(runnerResults, null, 2)}</pre></body></html>`
                      const blob = new Blob([html], { type: 'text/html' })
                      const href = URL.createObjectURL(blob)
                      const anchor = document.createElement('a')
                      anchor.href = href
                      anchor.download = 'collection-report.html'
                      anchor.click()
                      URL.revokeObjectURL(href)
                    }}
                    disabled={runnerResults.length === 0}
                  >
                    Export HTML Report
                  </button>
                </div>

                <div className="api-observatory-collections__results">
                  <h5>Results</h5>
                  <ul>
                    {runnerResults.map((result) => (
                      <li key={`${result.requestId}-${result.requestName}-${result.durationMs}`} className={result.pass ? 'is-pass' : 'is-fail'}>
                        {result.pass ? '✓' : '✗'} {result.requestName} · status {result.status} · {result.durationMs.toFixed(1)}ms
                        {result.message ? ` · ${result.message}` : ''}
                      </li>
                    ))}
                  </ul>
                  {runnerResults.length === 0 && (
                    <EmptyState
                      title="No run results yet"
                      description="Run the collection to capture request outcomes and timing."
                      compact
                      align="left"
                    />
                  )}
                </div>
              </section>
            </>
          ) : (
            <EmptyState
              title="Create or select a collection"
              description="Choose an existing collection or create a new one to begin."
              compact
              align="left"
            />
          )}
        </section>
      </div>
    </section>
  )
}

export default CollectionsTab
