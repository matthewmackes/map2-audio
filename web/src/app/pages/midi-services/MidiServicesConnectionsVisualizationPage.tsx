/**
 * T2500-MV-E1 — Visualization page.
 *
 * Mounted at `/midi/connections/visualization`. Composes:
 *   - MidiServicesConnectionsTabs (outer-tab strip)
 *   - MidiVisualizationFilterBar
 *   - SignalFlowGraph + custom node bodies
 *   - MidiEdgeOverlayCanvas (particles + heatmap)
 *   - MidiVisualizationDetailDrawer (right-side drawer on node click)
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import { Heading, Layer, Section, InlineNotification } from '@carbon/react'

import { SignalFlowGraph } from '../../components/shared/SignalFlowGraph'
import { useMidiVisualizationGraph } from '../../hooks/useMidiVisualizationGraph'
import MidiServicesConnectionsTabs from './MidiServicesConnectionsTabs'
import {
  buildMidiVisualizationLayout,
  type MidiVisualizationNode,
} from './visualization/midiVisualizationLayout'
import {
  MIDI_VISUALIZATION_NODE_TYPES,
} from './visualization/MidiVisualizationNodeBodies'
import MidiEdgeOverlayCanvas from './visualization/MidiEdgeOverlayCanvas'
import MidiVisualizationDetailDrawer from './visualization/MidiVisualizationDetailDrawer'
import MidiVisualizationFilterBar from './visualization/MidiVisualizationFilterBar'
import type { MidiVisualizationEvent } from './visualization/midiVisualizationTypes'
import { useMidiServicesShellWindow } from './useMidiServicesShellWindow'
import './MidiServicesRegionPage.css'

const ACTIVE_THRESHOLD_MS = 60_000

export function MidiServicesConnectionsVisualizationPage() {
  useMidiServicesShellWindow(
    'Connections — Visualization',
    'Live three-tier graph of devices, mappings, and engine targets.',
  )

  const {
    topology,
    edgeActivity,
    nodeActivity,
    status,
    filters,
    setFilters,
  } = useMidiVisualizationGraph()

  const layout = useMemo(
    () =>
      buildMidiVisualizationLayout({
        topology,
        edgeActivity,
        nodeActivity,
      }),
    [topology, edgeActivity, nodeActivity],
  )

  const visibleLayout = useMemo(() => {
    if (!filters.scopeActiveLast60s) return layout
    const now = Date.now()
    const isActiveEdge = (data: { lastEventAt: number | null }) =>
      data.lastEventAt !== null && now - data.lastEventAt < ACTIVE_THRESHOLD_MS
    const activeEdges = layout.edges.filter((e) =>
      e.data ? isActiveEdge(e.data) : false,
    )
    const activeNodeIds = new Set<string>()
    for (const e of activeEdges) {
      activeNodeIds.add(e.source)
      activeNodeIds.add(e.target)
    }
    const activeNodes = layout.nodes.filter((n) => activeNodeIds.has(n.id))
    if (activeNodes.length === 0) return layout  // fall back to full graph when nothing active
    return { nodes: activeNodes, edges: activeEdges }
  }, [layout, filters.scopeActiveLast60s])

  // Selection drives the right-side drawer.
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const handleNodeClick = useCallback(
    (_evt: React.MouseEvent, node: MidiVisualizationNode) => {
      setSelectedNodeId(node.id)
    },
    [],
  )
  const closeDrawer = useCallback(() => setSelectedNodeId(null), [])

  const selectedNode = useMemo(() => {
    if (selectedNodeId === null) return null
    const node = layout.nodes.find((n) => n.id === selectedNodeId)
    if (!node) return null
    return { id: node.id, label: node.data.label, activity: node.data }
  }, [layout.nodes, selectedNodeId])

  // Live event ingest channel for the canvas overlay. The hook batches
  // its own React state per rAF; the canvas reads directly from a ref
  // so it never has to wait for a React render to draw a particle.
  const pendingEventsRef = useRef<MidiVisualizationEvent[]>([])

  return (
    <Section className="midi-services-region">
      <MidiServicesConnectionsTabs />
      <Layer level={0}>
        <header className="midi-services-region__header">
          <Heading className="midi-services-region__title">
            Connections — Visualization
          </Heading>
          <p className="midi-services-region__subtitle">
            Live graph of devices, mappings, and engine targets. Particles travel
            along an edge each time a MIDI event flows; thickness + heatmap
            reflect the rolling rate.
          </p>
        </header>
      </Layer>

      <MidiVisualizationFilterBar filters={filters} onChange={setFilters} />

      {status === 'error' ? (
        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title="Visualization stream interrupted"
          subtitle="Topology or websocket fetch failed; check the controller-host service."
        />
      ) : null}

      <Layer level={1} style={{ position: 'relative', minHeight: 480 }}>
        <SignalFlowGraph
          nodes={visibleLayout.nodes}
          edges={visibleLayout.edges}
          nodeTypes={MIDI_VISUALIZATION_NODE_TYPES}
          wrapperClassName="midi-viz-canvas-wrapper"
          emptyState={
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--cds-text-helper)' }}>
              <p>No active MIDI connections in the last 60 seconds.</p>
              <p>Plug in a controller or send a test event to populate the graph.</p>
            </div>
          }
        />
        <MidiEdgeOverlayCanvas
          nodes={visibleLayout.nodes}
          edges={visibleLayout.edges}
          pendingEventsRef={pendingEventsRef}
          intensity={filters.intensity}
        />
      </Layer>

      <MidiVisualizationDetailDrawer
        open={selectedNodeId !== null}
        onClose={closeDrawer}
        selectedNode={selectedNode}
      />
    </Section>
  )
}

export default MidiServicesConnectionsVisualizationPage
