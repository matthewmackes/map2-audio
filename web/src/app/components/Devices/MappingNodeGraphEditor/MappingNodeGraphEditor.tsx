// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Matthew Mackes — MAP2 Audio Platform
//
// MappingNodeGraphEditor — Carbon + ReactFlow visual mapping editor.
//
// First cut (T2459-C4):
//   - Reads a MIDI mapping descriptor (either MAP2 native or imported
//     Mixxx XML) and renders MIDI input nodes (left column), engine
//     target nodes (right column), and edges between them.
//   - Imports a Mixxx XML mapping via the backend's
//     /api/devices/mixxx/import endpoint.
//   - Exports a MAP2 native mapping back to Mixxx XML via
//     /api/devices/mixxx/export/<pack>/<model>.
//   - View-only nodes; drag/edit comes in a follow-up after the
//     round-trip is proven in the GUI (T2459-C4-followup).
//
// Architecture: docs/architecture/CONTROLLER_LAYER.md §7 (GUI-2).

import React, { useMemo, useState } from 'react'
import ReactFlow, { Background, Controls, type Edge, type Node } from 'reactflow'
import 'reactflow/dist/style.css'
import {
  Layer,
  Tag,
  Button,
  TextArea,
  InlineNotification,
  Loading,
} from '@carbon/react'
import { Upload, Download, Code } from '@carbon/icons-react'

import {
  exportMixxxXml,
  importMixxxXml,
  type MixxxImportResponse,
} from '../../../../map2/clients/devices'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MappingNodeGraphEditorProps {
  /** When provided, the editor renders this descriptor directly. Useful
   *  for the "imported Mixxx mapping" flow (no backend round-trip
   *  needed; we already have the parsed descriptor in hand). */
  descriptor?: MixxxImportResponse
  /** Pack + model to load from the backend on mount. Mutually
   *  exclusive with `descriptor`. */
  packId?: string
  model?: string
}

// ---------------------------------------------------------------------------
// Graph builder
// ---------------------------------------------------------------------------

interface GraphPayload {
  nodes: Node[]
  edges: Edge[]
}

function buildGraph(descriptor: MixxxImportResponse): GraphPayload {
  const nodes: Node[] = []
  const edges: Edge[] = []

  const inputColumnX = 50
  const targetColumnX = 600
  const yStride = 80

  descriptor.controls.forEach((c, idx) => {
    const inputId = `in-${idx}`
    const targetId = `tg-${idx}`
    const y = idx * yStride

    // Left input node — labelled with status hex + midino.
    const statusHex = c.status != null ? `0x${c.status.toString(16).toUpperCase().padStart(2, '0')}` : '—'
    const midino = c.midino != null ? c.midino : '—'
    const inputLabel = `${statusHex} / ${midino}`
    nodes.push({
      id: inputId,
      data: {
        label: (
          <div>
            <strong>{inputLabel}</strong>
            {c.mixxx_group && c.mixxx_key ? (
              <div style={{ fontSize: '0.75rem' }}>
                <code>{c.mixxx_group}.{c.mixxx_key}</code>
              </div>
            ) : null}
          </div>
        ),
      },
      position: { x: inputColumnX, y },
      style: { width: 240, padding: '0.5rem' },
      type: 'default',
    })

    // Right target / script node.
    const targetLabel = c.target ?? c.script ?? 'unknown'
    const isFastPath = c.fast_path
    const isScript = !!c.script
    nodes.push({
      id: targetId,
      data: {
        label: (
          <div>
            <code style={{ fontSize: '0.875rem' }}>{targetLabel}</code>
            <div style={{ marginTop: '0.25rem' }}>
              {isFastPath && <Tag type="green" size="sm">fast-path</Tag>}
              {isScript && !isFastPath && <Tag type="purple" size="sm">JS</Tag>}
              {!isScript && !isFastPath && <Tag type="cool-gray" size="sm">direct</Tag>}
            </div>
          </div>
        ),
      },
      position: { x: targetColumnX, y },
      style: { width: 280, padding: '0.5rem' },
      type: 'default',
    })

    edges.push({
      id: `e-${idx}`,
      source: inputId,
      target: targetId,
      animated: isFastPath,
      style: { strokeWidth: isFastPath ? 2.5 : 1 },
    })
  })

  return { nodes, edges }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MappingNodeGraphEditor({
  descriptor,
  packId,
  model,
}: MappingNodeGraphEditorProps): React.JSX.Element {
  const [importedDescriptor, setImportedDescriptor] = useState<MixxxImportResponse | null>(null)
  const [importXmlBody, setImportXmlBody] = useState('')
  const [exportedXml, setExportedXml] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeDescriptor = importedDescriptor ?? descriptor ?? null

  const graph = useMemo<GraphPayload>(() => {
    if (activeDescriptor == null) return { nodes: [], edges: [] }
    return buildGraph(activeDescriptor)
  }, [activeDescriptor])

  const handleImport = async () => {
    if (importXmlBody.trim().length === 0) return
    setBusy(true)
    setError(null)
    try {
      const result = await importMixxxXml({
        pack_id: packId ?? '_imported',
        xml_body: importXmlBody,
      })
      setImportedDescriptor(result)
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : String(exc))
    } finally {
      setBusy(false)
    }
  }

  const handleExport = async () => {
    if (!packId || !model) {
      setError('Cannot export — pack/model not provided.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await exportMixxxXml({ pack_id: packId, model })
      setExportedXml(result.xml_body)
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : String(exc))
    } finally {
      setBusy(false)
    }
  }

  const skipReasons = importedDescriptor?.stats.skip_reasons ?? []

  return (
    <Layer level={0} data-testid="mapping-node-graph-editor">
      <div style={{ padding: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <Button
          kind="primary"
          renderIcon={Download}
          onClick={handleExport}
          disabled={busy || !packId || !model}
        >
          Export to Mixxx XML
        </Button>
        {exportedXml && (
          <Button
            kind="ghost"
            renderIcon={Code}
            onClick={() => {
              const blob = new Blob([exportedXml], { type: 'application/xml' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `${packId}-${model}.midi.xml`
              a.click()
              URL.revokeObjectURL(url)
            }}
          >
            Download XML
          </Button>
        )}
      </div>

      {busy && <Loading description="Working..." withOverlay={false} />}

      {error && (
        <InlineNotification
          kind="error"
          title="Mapping editor error"
          subtitle={error}
          hideCloseButton
        />
      )}

      <div
        style={{ width: '100%', height: 600, border: '1px solid var(--cds-border-subtle)' }}
        data-testid="mapping-node-graph-flow"
      >
        {activeDescriptor ? (
          <ReactFlow
            nodes={graph.nodes}
            edges={graph.edges}
            fitView
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable
          >
            <Background />
            <Controls />
          </ReactFlow>
        ) : (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            No mapping loaded. Paste a Mixxx XML below to import.
          </div>
        )}
      </div>

      <Layer level={1} style={{ padding: '1rem', marginTop: '1rem' }}>
        <h4>Import Mixxx XML</h4>
        <p style={{ fontSize: '0.875rem' }}>
          Paste an upstream Mixxx <code>.midi.xml</code> mapping. The editor
          will resolve every binding through the bridge layer and render
          the result as a node graph above. Bindings that touch
          unsupported Mixxx features (scratch, beatgrid, AutoDJ, sampler)
          will be skipped — the count is shown after import.
        </p>
        <TextArea
          id="mixxx-xml-import"
          labelText="Mixxx XML body"
          rows={8}
          value={importXmlBody}
          onChange={(e) => setImportXmlBody(e.target.value)}
        />
        <div style={{ marginTop: '0.5rem' }}>
          <Button
            kind="secondary"
            renderIcon={Upload}
            onClick={handleImport}
            disabled={busy || importXmlBody.trim().length === 0}
          >
            Import
          </Button>
        </div>
        {importedDescriptor && (
          <div style={{ marginTop: '1rem', fontSize: '0.875rem' }}>
            <p>
              <strong>Imported:</strong> {importedDescriptor.stats.resolved_controls}{' '}
              of {importedDescriptor.stats.total_controls} bindings resolved.
            </p>
            {skipReasons.length > 0 && (
              <details>
                <summary>{skipReasons.length} bindings skipped</summary>
                <ul style={{ margin: '0.5rem 0 0 1rem' }}>
                  {skipReasons.map((reason, idx) => (
                    <li key={idx}><code>{reason}</code></li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </Layer>
    </Layer>
  )
}
