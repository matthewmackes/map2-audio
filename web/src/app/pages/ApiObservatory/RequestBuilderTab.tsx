import { useEffect, useMemo, useState } from 'react'

import type { OpenApiCatalogEndpoint } from '../../hooks/useOpenApiSchema'
import {
  CodeSnippetGenerator,
  JsonDiffViewer,
  JsonTreeViewer,
  MethodBadge,
  StatusBadge,
  TimingBreakdownChart,
} from '../../components/ApiObservatory/primitives'
import { sendProxyRequest } from './api'
import { CodeEditor } from './CodeEditor'
import { runScriptInSandbox, SCRIPT_TEMPLATES } from './scriptSandbox'
import type { ScriptRunResult } from './scriptSandbox'
import type {
  EnvironmentVariableSet,
  RequestDraft,
  RequestExecutionResult,
  RequestHistoryItem,
} from './types'
import {
  createDefaultDraft,
  draftToHeaders,
  draftToUrl,
  parseBody,
  resolveEnvironmentMap,
  safeJsonPretty,
} from './utils'

function headerRowsToText(rows: Array<{ key: string; value: string; enabled: boolean }>) {
  return rows
    .filter((row) => row.key.trim())
    .map((row) => `${row.enabled ? '' : '# '}${row.key}: ${row.value}`)
    .join('\n')
}

function updateFromHeaderText(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const disabled = line.startsWith('#')
      const normalized = disabled ? line.slice(1).trim() : line
      const separator = normalized.indexOf(':')
      if (separator < 0) {
        return {
          key: normalized,
          value: '',
          enabled: !disabled,
        }
      }
      return {
        key: normalized.slice(0, separator).trim(),
        value: normalized.slice(separator + 1).trim(),
        enabled: !disabled,
      }
    })
}

function queryRowsToText(rows: Array<{ key: string; value: string; enabled: boolean }>) {
  return rows
    .filter((row) => row.key.trim())
    .map((row) => `${row.enabled ? '' : '# '}${row.key}=${row.value}`)
    .join('\n')
}

function updateFromQueryText(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const disabled = line.startsWith('#')
      const normalized = disabled ? line.slice(1).trim() : line
      const separator = normalized.indexOf('=')
      if (separator < 0) {
        return {
          key: normalized,
          value: '',
          enabled: !disabled,
        }
      }
      return {
        key: normalized.slice(0, separator).trim(),
        value: normalized.slice(separator + 1).trim(),
        enabled: !disabled,
      }
    })
}

export function RequestBuilderTab({
  environments,
  activeEnvironmentId,
  onEnvironmentChange,
  selectedNode,
  onNodeTargetChange,
  tryItEndpoint,
}: {
  environments: EnvironmentVariableSet[]
  activeEnvironmentId: string
  onEnvironmentChange: (environmentId: string) => void
  selectedNode: string
  onNodeTargetChange: (nodeId: string) => void
  tryItEndpoint: OpenApiCatalogEndpoint | null
}) {
  const [drafts, setDrafts] = useState<RequestDraft[]>([createDefaultDraft(1)])
  const [activeDraftId, setActiveDraftId] = useState<string>(drafts[0].id)
  const [history, setHistory] = useState<RequestHistoryItem[]>([])
  const [lastExecution, setLastExecution] = useState<RequestExecutionResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [historyDiffIds, setHistoryDiffIds] = useState<[string | null, string | null]>([null, null])
  const [headerEditor, setHeaderEditor] = useState('')
  const [queryEditor, setQueryEditor] = useState('')

  const activeDraft = useMemo(
    () => drafts.find((draft) => draft.id === activeDraftId) ?? drafts[0],
    [activeDraftId, drafts],
  )

  const activeEnvironmentVars = useMemo(
    () => resolveEnvironmentMap(environments, activeEnvironmentId),
    [activeEnvironmentId, environments],
  )

  useEffect(() => {
    if (!activeDraft) {
      return
    }
    setHeaderEditor(headerRowsToText(activeDraft.headers))
    setQueryEditor(queryRowsToText(activeDraft.queryParams))
  }, [activeDraft])

  useEffect(() => {
    if (!tryItEndpoint || !activeDraft) {
      return
    }

    setDrafts((prev) =>
      prev.map((draft) => {
        if (draft.id !== activeDraft.id) {
          return draft
        }

        const hasNodeParam = tryItEndpoint.parameters.some(
          (param) => param.name === 'node_id' && param.in === 'query',
        )

        const nodeAwareQuery = hasNodeParam
          ? [{ key: 'node_id', value: selectedNode === 'local-node' ? 'local-node' : selectedNode, enabled: true }]
          : draft.queryParams

        return {
          ...draft,
          name: tryItEndpoint.summary,
          method: tryItEndpoint.method.toUpperCase(),
          url: `{{base_url}}${tryItEndpoint.path}`,
          bodyMode: tryItEndpoint.requestBody ? 'json' : 'none',
          bodyText: tryItEndpoint.requestBody ? safeJsonPretty(tryItEndpoint.requestBody) : '',
          queryParams: nodeAwareQuery,
        }
      }),
    )
  }, [activeDraft, selectedNode, tryItEndpoint])

  const upsertActiveDraft = (updater: (draft: RequestDraft) => RequestDraft) => {
    if (!activeDraft) {
      return
    }
    setDrafts((prev) => prev.map((draft) => (draft.id === activeDraft.id ? updater(draft) : draft)))
  }

  const addDraft = () => {
    const next = createDefaultDraft(drafts.length + 1)
    setDrafts((prev) => [...prev, next])
    setActiveDraftId(next.id)
  }

  const removeDraft = (draftId: string) => {
    setDrafts((prev) => {
      if (prev.length === 1) {
        return prev
      }
      const next = prev.filter((draft) => draft.id !== draftId)
      if (activeDraftId === draftId && next[0]) {
        setActiveDraftId(next[0].id)
      }
      return next
    })
  }

  const executeRequest = async () => {
    if (!activeDraft) {
      return
    }

    setRunning(true)
    setError(null)

    try {
      const envBefore = { ...activeEnvironmentVars }
      const requestContext = {
        method: activeDraft.method,
        url: activeDraft.url,
        body: activeDraft.bodyText,
      }

      const preRequestRun = activeDraft.preRequestScript.trim()
        ? await runScriptInSandbox(activeDraft.preRequestScript, {
            request: requestContext,
            response: null,
            environment: envBefore,
          })
        : {
            request: requestContext,
            environment: envBefore,
            tests: [],
            logs: [],
          }

      const mergedVars = { ...envBefore, ...preRequestRun.environment }
      const url = draftToUrl({ ...activeDraft, url: String(preRequestRun.request.url ?? activeDraft.url) }, mergedVars)
      const body = parseBody(
        { ...activeDraft, bodyText: String(preRequestRun.request.body ?? activeDraft.bodyText) },
        mergedVars,
      )
      const headers = draftToHeaders(activeDraft, mergedVars)

      const proxyResponse = await sendProxyRequest({
        method: activeDraft.method,
        url,
        headers,
        body,
        node_id: activeDraft.nodeTarget,
      })

      const responseContext = {
        status: proxyResponse.status,
        headers: proxyResponse.headers,
        body: proxyResponse.body,
        total_ms: proxyResponse.timing.total_ms,
      }

      const testRun: ScriptRunResult = activeDraft.testScript.trim()
        ? await runScriptInSandbox(activeDraft.testScript, {
            request: {
              method: activeDraft.method,
              url,
              body,
            },
            response: responseContext,
            environment: preRequestRun.environment,
          })
        : {
            request: {
              method: activeDraft.method,
              url,
              body,
            },
            environment: preRequestRun.environment,
            tests: [],
            logs: [],
          }

      const historyItem: RequestHistoryItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        method: activeDraft.method,
        url,
        status: proxyResponse.status,
        durationMs: proxyResponse.timing.total_ms,
        responseSize: proxyResponse.size_bytes,
        body: proxyResponse.nodes && proxyResponse.nodes.length > 0 ? proxyResponse.nodes : proxyResponse.body,
        headers: proxyResponse.headers,
        timing: proxyResponse.timing,
      }

      setHistory((prev) => [...prev, historyItem].slice(-50))

      setLastExecution({
        request: activeDraft,
        history: historyItem,
        sandboxLogs: [...preRequestRun.logs, ...testRun.logs],
        sandboxTests: testRun.tests,
        sandboxError: testRun.error,
        environmentAfterRun: testRun.environment,
      })
    } catch (executeError) {
      setError(executeError instanceof Error ? executeError.message : 'Request failed')
    } finally {
      setRunning(false)
    }
  }

  const diffLeft = history.find((item) => item.id === historyDiffIds[0])
  const diffRight = history.find((item) => item.id === historyDiffIds[1])

  useEffect(() => {
    const handleSend = () => {
      void executeRequest()
    }
    const handleNew = () => {
      addDraft()
    }
    const handleClose = () => {
      if (activeDraft) {
        removeDraft(activeDraft.id)
      }
    }
    const handleOpenDraft = (event: Event) => {
      const customEvent = event as CustomEvent<RequestDraft>
      const incoming = customEvent.detail
      if (!incoming) {
        return
      }
      const cloned: RequestDraft = {
        ...incoming,
        id: `request-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      }
      setDrafts((prev) => [...prev, cloned])
      setActiveDraftId(cloned.id)
    }

    window.addEventListener('api-observatory:send-request', handleSend)
    window.addEventListener('api-observatory:new-request', handleNew)
    window.addEventListener('api-observatory:close-request', handleClose)
    window.addEventListener('api-observatory:open-draft', handleOpenDraft as EventListener)

    return () => {
      window.removeEventListener('api-observatory:send-request', handleSend)
      window.removeEventListener('api-observatory:new-request', handleNew)
      window.removeEventListener('api-observatory:close-request', handleClose)
      window.removeEventListener('api-observatory:open-draft', handleOpenDraft as EventListener)
    }
  }, [activeDraft, executeRequest])

  return (
    <section className="api-observatory-panel api-observatory-builder">
      <div className="api-observatory-builder__top-row">
        <div className="api-observatory-builder__tabs" role="tablist" aria-label="Request tabs">
          {drafts.map((draft) => (
            <button
              key={draft.id}
              type="button"
              role="tab"
              aria-selected={draft.id === activeDraftId}
              className={`api-observatory-builder__tab${draft.id === activeDraftId ? ' is-active' : ''}`}
              onClick={() => setActiveDraftId(draft.id)}
            >
              <MethodBadge method={draft.method} compact />
              <span>{draft.name}</span>
              {drafts.length > 1 && (
                <span
                  onClick={(event) => {
                    event.stopPropagation()
                    removeDraft(draft.id)
                  }}
                  className="api-observatory-builder__tab-close"
                  role="button"
                  aria-label={`Close ${draft.name}`}
                >
                  ×
                </span>
              )}
            </button>
          ))}
          <button type="button" className="api-observatory-builder__tab-add" onClick={addDraft}>
            +
          </button>
        </div>

        <div className="api-observatory-builder__toolbar">
          <select value={activeEnvironmentId} onChange={(event) => onEnvironmentChange(event.target.value)}>
            {environments.map((environment) => (
              <option key={environment.id} value={environment.id}>{environment.name}</option>
            ))}
          </select>
          <select value={activeDraft?.nodeTarget ?? selectedNode} onChange={(event) => {
            upsertActiveDraft((draft) => ({ ...draft, nodeTarget: event.target.value }))
            onNodeTargetChange(event.target.value)
          }}>
            <option value="local-node">Local Node</option>
            <option value="all">All Nodes</option>
            <option value={selectedNode}>{selectedNode}</option>
          </select>
          <button type="button" className="api-observatory-primary" onClick={executeRequest} disabled={running}>
            {running ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>

      {activeDraft && (
        <>
          <div className="api-observatory-builder__request-row">
            <select
              value={activeDraft.method}
              onChange={(event) => upsertActiveDraft((draft) => ({ ...draft, method: event.target.value }))}
            >
              {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((method) => (
                <option key={method} value={method}>{method}</option>
              ))}
            </select>
            <input
              data-api-observatory="builder-url"
              value={activeDraft.url}
              onChange={(event) => upsertActiveDraft((draft) => ({ ...draft, url: event.target.value }))}
              placeholder="{{base_url}}/api/..."
            />
            <button
              type="button"
              onClick={() => upsertActiveDraft((draft) => ({ ...draft, queryParams: updateFromQueryText(queryEditor) }))}
            >
              Apply Query
            </button>
            <button
              type="button"
              onClick={() => upsertActiveDraft((draft) => ({ ...draft, headers: updateFromHeaderText(headerEditor) }))}
            >
              Apply Headers
            </button>
          </div>

          <div className="api-observatory-builder__editor-grid">
            <section>
              <h3>Headers (bulk)</h3>
              <textarea
                value={headerEditor}
                onChange={(event) => setHeaderEditor(event.target.value)}
                rows={7}
              />

              <h3>Query Params (bulk)</h3>
              <textarea
                value={queryEditor}
                onChange={(event) => setQueryEditor(event.target.value)}
                rows={6}
              />

              <h3>Auth</h3>
              <div className="api-observatory-builder__auth-row">
                <select
                  value={activeDraft.authMode}
                  onChange={(event) => upsertActiveDraft((draft) => ({ ...draft, authMode: event.target.value as RequestDraft['authMode'] }))}
                >
                  <option value="none">None</option>
                  <option value="bearer">Bearer</option>
                  <option value="basic">Basic</option>
                  <option value="api-key">API Key</option>
                </select>
                <input
                  value={activeDraft.authValue}
                  onChange={(event) => upsertActiveDraft((draft) => ({ ...draft, authValue: event.target.value }))}
                  placeholder="{{token}}"
                />
              </div>
            </section>

            <section>
              <h3>Body</h3>
              <div className="api-observatory-builder__body-controls">
                {['none', 'json', 'raw'].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={activeDraft.bodyMode === mode ? 'is-active' : ''}
                    onClick={() => upsertActiveDraft((draft) => ({ ...draft, bodyMode: mode as RequestDraft['bodyMode'] }))}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              {activeDraft.bodyMode === 'json' ? (
                <CodeEditor
                  language="json"
                  value={activeDraft.bodyText}
                  onChange={(value) => upsertActiveDraft((draft) => ({ ...draft, bodyText: value }))}
                  height={220}
                />
              ) : activeDraft.bodyMode === 'raw' ? (
                <CodeEditor
                  language="plaintext"
                  value={activeDraft.bodyText}
                  onChange={(value) => upsertActiveDraft((draft) => ({ ...draft, bodyText: value }))}
                  height={220}
                />
              ) : (
                <div className="api-observatory-builder__none-body">No request body</div>
              )}

              <h3>Pre-request Script</h3>
              <CodeEditor
                language="javascript"
                value={activeDraft.preRequestScript}
                onChange={(value) => upsertActiveDraft((draft) => ({ ...draft, preRequestScript: value }))}
                height={160}
              />

              <h3>Test Script</h3>
              <CodeEditor
                language="javascript"
                value={activeDraft.testScript}
                onChange={(value) => upsertActiveDraft((draft) => ({ ...draft, testScript: value }))}
                height={160}
              />

              <div className="api-observatory-builder__templates">
                {SCRIPT_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => upsertActiveDraft((draft) => ({ ...draft, testScript: template.script }))}
                  >
                    {template.label}
                  </button>
                ))}
              </div>
            </section>
          </div>

          {error && <div className="api-observatory-error">{error}</div>}

          {lastExecution && (
            <section className="api-observatory-builder__response">
              <header>
                <StatusBadge status={lastExecution.history.status} />
                <span>{lastExecution.history.url}</span>
                <span>{lastExecution.history.durationMs.toFixed(2)}ms</span>
                <span>{lastExecution.history.responseSize} bytes</span>
              </header>

              <TimingBreakdownChart timing={lastExecution.history.timing} />

              <div className="api-observatory-builder__response-grid">
                <div>
                  <h3>Response Body</h3>
                  <JsonTreeViewer value={lastExecution.history.body} maxHeight={280} />
                </div>
                <div>
                  <h3>Response Headers</h3>
                  <pre><code>{safeJsonPretty(lastExecution.history.headers)}</code></pre>
                </div>
                <div>
                  <h3>Script Tests</h3>
                  <ul>
                    {lastExecution.sandboxTests.map((test) => (
                      <li key={test.name} className={test.pass ? 'is-pass' : 'is-fail'}>
                        {test.pass ? '✓' : '✗'} {test.name}
                        {test.message ? ` - ${test.message}` : ''}
                      </li>
                    ))}
                    {lastExecution.sandboxTests.length === 0 && <li>No tests run.</li>}
                  </ul>
                  {lastExecution.sandboxError && (
                    <p className="api-observatory-error">
                      Script error: {lastExecution.sandboxError.message}
                    </p>
                  )}
                  {lastExecution.sandboxLogs.length > 0 && (
                    <pre><code>{lastExecution.sandboxLogs.join('\n')}</code></pre>
                  )}
                </div>
              </div>

              <h3>Generate Code</h3>
              <CodeSnippetGenerator
                request={{
                  method: lastExecution.request.method,
                  url: lastExecution.history.url,
                  headers: draftToHeaders(lastExecution.request, activeEnvironmentVars),
                  body: lastExecution.request.bodyText,
                }}
              />
            </section>
          )}

          <section className="api-observatory-builder__history">
            <header>
              <h3>History</h3>
              <button type="button" onClick={() => setHistory([])}>Clear history</button>
            </header>
            <div className="api-observatory-builder__history-list">
              {history.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setLastExecution((prev) => prev
                      ? {
                          ...prev,
                          history: item,
                        }
                      : prev)
                  }}
                >
                  <MethodBadge method={item.method} compact />
                  <StatusBadge status={item.status} compact />
                  <span>{item.url}</span>
                  <span>{item.durationMs.toFixed(1)}ms</span>
                  <label>
                    <input
                      type="checkbox"
                      checked={historyDiffIds[0] === item.id || historyDiffIds[1] === item.id}
                      onChange={(event) => {
                        if (!event.target.checked) {
                          setHistoryDiffIds((prev) => [
                            prev[0] === item.id ? null : prev[0],
                            prev[1] === item.id ? null : prev[1],
                          ])
                          return
                        }
                        setHistoryDiffIds((prev) => {
                          if (!prev[0]) return [item.id, prev[1]]
                          if (!prev[1]) return [prev[0], item.id]
                          return [prev[1], item.id]
                        })
                      }}
                    />
                    Diff
                  </label>
                </button>
              ))}
            </div>
            {diffLeft && diffRight && (
              <div className="api-observatory-builder__diff">
                <h4>Response Diff</h4>
                <JsonDiffViewer left={diffLeft.body} right={diffRight.body} />
              </div>
            )}
          </section>
        </>
      )}
    </section>
  )
}

export default RequestBuilderTab
