import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button,
  InlineLoading,
  InlineNotification,
  NumberInput,
  Tag,
  Tile,
} from '@carbon/react'
import { Copy, Renew } from '@carbon/icons-react'
import {
  stateAuthorityApi,
  type StateAuthorityDocument,
} from '../../../map2/clients/stateAuthority'
import './GraphDocumentInspector.css'

// Inspector for the canonical State Authority JSONB document (plan Q1:
// "single JSONB column, drop relational tables"). Lets operators see what
// the live snapshot really is without SQL access — the source of truth
// that every projection (chains table, engine state, metrics) derives from.

export interface GraphDocumentInspectorProps {
  /** Preload a specific snapshot id; absent → fetch the live document. */
  snapshotId?: number
  /** Skip initial fetch — callers injecting a document for test/storybook. */
  document?: StateAuthorityDocument
}

function countNodes(document: Record<string, unknown>): number {
  const graph = document.graph as Record<string, unknown> | undefined
  const nodes = graph?.nodes as unknown[] | undefined
  return Array.isArray(nodes) ? nodes.length : 0
}

function countEdges(document: Record<string, unknown>): number {
  const graph = document.graph as Record<string, unknown> | undefined
  const edges = graph?.edges as unknown[] | undefined
  return Array.isArray(edges) ? edges.length : 0
}

function countChannels(document: Record<string, unknown>): number {
  const graph = document.graph as Record<string, unknown> | undefined
  const channels = graph?.channels as unknown[] | undefined
  return Array.isArray(channels) ? channels.length : 0
}

function morphMode(document: Record<string, unknown>): string {
  const graph = document.graph as Record<string, unknown> | undefined
  const morph = graph?.morph as Record<string, unknown> | undefined
  return String(morph?.mode ?? 'off')
}

function documentVersion(document: Record<string, unknown>): string {
  return String(document.version ?? 'unknown')
}

export function GraphDocumentInspector({ snapshotId, document }: GraphDocumentInspectorProps) {
  const [current, setCurrent] = useState<StateAuthorityDocument | null>(document ?? null)
  const [loading, setLoading] = useState(!document)
  const [error, setError] = useState<string | null>(null)
  const [targetId, setTargetId] = useState<number | null>(snapshotId ?? null)
  const [copied, setCopied] = useState(false)

  const refresh = useCallback(async () => {
    if (document) return
    setLoading(true)
    setError(null)
    try {
      const payload =
        targetId === null
          ? await stateAuthorityApi.getLiveDocument()
          : await stateAuthorityApi.getSnapshotDocument(targetId)
      setCurrent(payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [document, targetId])

  useEffect(() => {
    if (document) return
    void refresh()
  }, [document, refresh])

  const summary = useMemo(() => {
    if (!current) return null
    const doc = current.document
    return {
      nodes: countNodes(doc),
      edges: countEdges(doc),
      channels: countChannels(doc),
      morph: morphMode(doc),
      version: documentVersion(doc),
    }
  }, [current])

  const rawJson = useMemo(() => {
    if (!current) return ''
    return JSON.stringify(current.document, null, 2)
  }, [current])

  const copyToClipboard = useCallback(async () => {
    if (!rawJson) return
    try {
      await navigator.clipboard.writeText(rawJson)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API not available; ignore silently.
    }
  }, [rawJson])

  return (
    <div className="graph-doc-inspector" role="region" aria-label="State Authority graph document">
      <div className="graph-doc-inspector__controls">
        <NumberInput
          id="graph-doc-snapshot-id"
          label="Snapshot id (blank = live)"
          size="sm"
          min={1}
          value={targetId ?? ''}
          onChange={(_event, { value }: { value: string | number }) => {
            const numeric = typeof value === 'number' ? value : parseInt(value, 10)
            setTargetId(Number.isFinite(numeric) && numeric > 0 ? numeric : null)
          }}
          hideSteppers
        />
        <Button size="sm" kind="ghost" renderIcon={Renew} onClick={refresh}>
          Refresh
        </Button>
        <Button
          size="sm"
          kind="ghost"
          renderIcon={Copy}
          onClick={copyToClipboard}
          disabled={!rawJson}
        >
          {copied ? 'Copied' : 'Copy JSON'}
        </Button>
      </div>

      {loading ? (
        <InlineLoading description="Loading State Authority document…" />
      ) : error ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Failed to load document"
          subtitle={error}
        />
      ) : current ? (
        <>
          <Tile className="graph-doc-inspector__summary">
            <div className="graph-doc-inspector__summary-header">
              <div>
                <p className="graph-doc-inspector__kicker">Canonical graph document</p>
                <h3>{current.snapshot_name ?? `Snapshot ${current.snapshot_id ?? '?'}`}</h3>
              </div>
              <div className="graph-doc-inspector__summary-tags">
                <Tag type={current.is_live ? 'green' : 'warm-gray'}>
                  {current.is_live ? 'LIVE' : 'archived'}
                </Tag>
                <Tag type="cool-gray">v{summary?.version ?? '?'}</Tag>
              </div>
            </div>
            {summary ? (
              <div className="graph-doc-inspector__summary-grid">
                <div>
                  <span className="graph-doc-inspector__metric-label">Nodes</span>
                  <span className="graph-doc-inspector__metric-value">{summary.nodes}</span>
                </div>
                <div>
                  <span className="graph-doc-inspector__metric-label">Edges</span>
                  <span className="graph-doc-inspector__metric-value">{summary.edges}</span>
                </div>
                <div>
                  <span className="graph-doc-inspector__metric-label">Channels</span>
                  <span className="graph-doc-inspector__metric-value">{summary.channels}</span>
                </div>
                <div>
                  <span className="graph-doc-inspector__metric-label">Morph</span>
                  <span className="graph-doc-inspector__metric-value">{summary.morph}</span>
                </div>
              </div>
            ) : null}
          </Tile>

          <pre
            className="graph-doc-inspector__json"
            aria-label="Raw graph document JSON"
            tabIndex={0}
          >
            {rawJson}
          </pre>
        </>
      ) : null}
    </div>
  )
}

export default GraphDocumentInspector
