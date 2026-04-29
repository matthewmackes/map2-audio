// Network Topology Modal — interactive AVB graph with PTP hierarchy
// + cross-node routes. T2475 (E1) Carbon migration:
//   Dialog/DialogTitle/DialogContent/DialogActions → Carbon
//     ComposedModal/ModalHeader/ModalBody/ModalFooter
//   Paper/Stack/Typography/Box → semantic divs + spans
//   Chip → StatusChip
//   IconButton → Carbon Button hasIconOnly
//   Tooltip (MUI) → Carbon Tooltip
// MUI palette literals (#4caf50, #f44336, #ff9800, #2196f3, #ffd700,
// #9e9e9e, #1976d2, success.main, warning.main, error.main) routed
// through MAP semantic tokens. The MiniMap mask color (#0b1220 /
// rgba black) is preserved as deliberate canvas chrome —
// ReactFlow's MiniMap is operationally hardware-skin-adjacent.

import React, { useMemo, useCallback, useState } from 'react'
import { Close, FitToScreen } from '@carbon/icons-react'
import {
  Button,
  ComposedModal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Tooltip,
} from '@carbon/react'
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
  Panel,
  MarkerType,
} from 'reactflow'
import 'reactflow/dist/style.css'
import dagre from 'dagre'

import { StatusChip } from '../../../primitives'
import '../../../shared/ReactFlowTheme.css'
import { useRouting } from '../../context/RoutingContext'
import { useNodes, usePtpStatus } from '../../hooks/useNodeApi'
import type { AvbNode } from '../../types'
import './NetworkTopologyModal.css'

interface NetworkTopologyModalProps {
  open: boolean
  onClose: () => void
}

// Tokens — MAP semantic colors used in the SVG attributes / inline
// styles consumed by reactflow. SVG attributes don't resolve CSS
// custom properties everywhere, so the values are pinned to the
// same shades --map2-clock-master / --map2-state-live /
// --map2-alert-* resolve to under the default g100 shell.
const PTP_GOLD = '#f1c21b'           // == --map2-clock-master / yellow-30
const ROUTE_BLUE = '#4589ff'         // == --cds-link-primary blue-50
const ROUTE_FAIL_RED = '#fa4d56'     // == --cds-support-error red-40
const ROUTE_DIM_GREY = '#6f6f6f'     // == --cds-text-disabled gray-50

function statusToneClass(status: string): string {
  if (status === 'online') return 'topology-node--ok'
  if (status === 'degraded') return 'topology-node--warn'
  return 'topology-node--offline'
}

function healthToneClass(status?: string): string {
  if (status === 'critical') return 'topology-node__health--critical'
  if (status === 'degraded') return 'topology-node__health--warn'
  return 'topology-node__health--ok'
}

// Test contract from NetworkTopologyModal.badges.test.tsx: the
// data-health-color attribute exposes the historical MUI palette
// label so external assertions stay stable across the Carbon
// migration. Visual color is now driven by the className.
function healthColorAttr(status?: string): string {
  if (status === 'critical') return 'error.main'
  if (status === 'degraded') return 'warning.main'
  return 'success.main'
}

function AvbNodeComponent({ data }: { data: AvbNode & { selected: boolean } }) {
  const isPtpMaster = data.ptp?.is_master === true

  return (
    <div
      className={`topology-node ${data.selected ? 'topology-node--selected' : ''}`}
      style={{ borderColor: data.color }}
    >
      {isPtpMaster && (
        <div className="topology-node__ptp-master" title="PTP Master">
          M
        </div>
      )}
      <span className="topology-node__name">{data.name}</span>
      <span
        className="topology-node__type"
        style={{ background: `${data.color}40`, color: data.color }}
      >
        {data.type.toUpperCase()}
      </span>
      <div className="topology-node__status-row">
        <span
          className={`topology-node__status-dot ${statusToneClass(data.status)}`}
          aria-hidden="true"
        />
        <span className="topology-node__status-text">{data.status}</span>
      </div>
      <span className="topology-node__counts">
        {data.talker_count} talkers · {data.listener_count} listeners
      </span>
      {data.active_routes > 0 && (
        <span className="topology-node__routes">
          {data.active_routes} active route{data.active_routes !== 1 ? 's' : ''}
        </span>
      )}
      {data.ptp && (data.ptp.state === 'master' || data.ptp.state === 'slave') && (
        <span className="topology-node__ptp">PTP {data.ptp.offset_ns}ns offset</span>
      )}
      {data.health && (
        <span
          className={`topology-node__health ${healthToneClass(data.health.status)}`}
          data-testid={`topology-health-${data.node_id}`}
          data-health-color={healthColorAttr(data.health.status)}
        >
          Health: {data.health.status} · CPU {data.health.cpu_usage.toFixed(1)}% · Lat{' '}
          {data.health.latency_ms.toFixed(1)}ms
        </span>
      )}
    </div>
  )
}

const nodeTypes = { avbNode: AvbNodeComponent }

function getLayoutedElements(nodes: Node[], edges: Edge[], direction = 'TB') {
  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))
  dagreGraph.setGraph({ rankdir: direction, ranksep: 100, nodesep: 80 })

  nodes.forEach((node) => dagreGraph.setNode(node.id, { width: 220, height: 160 }))
  edges.forEach((edge) => dagreGraph.setEdge(edge.source, edge.target))
  dagre.layout(dagreGraph)

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id)
    node.position = { x: nodeWithPosition.x - 110, y: nodeWithPosition.y - 80 }
  })

  return { nodes, edges }
}

function NetworkTopologyContent({ onClose }: { onClose: () => void }) {
  const { state } = useRouting()
  const { data: nodesData = [] } = useNodes()
  const { data: ptpStatus } = usePtpStatus()
  const { fitView } = useReactFlow()
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  const { nodes, edges } = useMemo(() => {
    const flowNodes: Node[] = nodesData.map((node) => ({
      id: node.node_id,
      type: 'avbNode',
      data: { ...node, selected: node.node_id === selectedNodeId },
      position: { x: 0, y: 0 },
    }))

    const flowEdges: Edge[] = []

    nodesData.forEach((node) => {
      if (ptpStatus?.master_node_id && ptpStatus.master_node_id !== node.node_id && node.ptp) {
        flowEdges.push({
          id: `ptp-${ptpStatus.master_node_id}-${node.node_id}`,
          source: ptpStatus.master_node_id,
          target: node.node_id,
          type: 'smoothstep',
          animated: node.ptp.state === 'master' || node.ptp.state === 'slave',
          label: 'PTP',
          style: { stroke: PTP_GOLD, strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: PTP_GOLD },
          labelStyle: { fontSize: 10, fontWeight: 600, fill: PTP_GOLD },
        })
      }
    })

    Object.values(state.network.crossNodeRoutes).forEach((route) => {
      const edgeId = `route-${route.route_id}`
      if (!flowEdges.find((e) => e.id === edgeId)) {
        const stroke =
          route.status === 'active'
            ? ROUTE_BLUE
            : route.status === 'failed'
              ? ROUTE_FAIL_RED
              : ROUTE_DIM_GREY
        flowEdges.push({
          id: edgeId,
          source: route.source_node_id,
          target: route.dest_node_id,
          type: 'smoothstep',
          animated: route.status === 'active',
          label: `${route.status} · ${route.bandwidth_mbps.toFixed(1)} Mbps`,
          style: {
            stroke,
            strokeWidth: Math.min(2 + Math.max(0, Math.round(route.bandwidth_mbps / 10)), 6),
          },
          markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
          labelStyle: { fontSize: 10, fill: ROUTE_BLUE },
        })
      }
    })

    return getLayoutedElements(flowNodes, flowEdges)
  }, [nodesData, state.network.crossNodeRoutes, selectedNodeId])

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id === selectedNodeId ? null : node.id)
    },
    [selectedNodeId],
  )

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2, duration: 800 })
  }, [fitView])

  const onlineCount = nodesData.filter((n) => n.status === 'online').length
  const totalRoutes = Object.keys(state.network.crossNodeRoutes).length
  const ptpRows = useMemo(
    () =>
      [...nodesData].sort((a, b) => {
        if (a.node_id === selectedNodeId) return -1
        if (b.node_id === selectedNodeId) return 1
        if (a.ptp?.is_master && !b.ptp?.is_master) return -1
        if (!a.ptp?.is_master && b.ptp?.is_master) return 1
        return a.name.localeCompare(b.name)
      }),
    [nodesData, selectedNodeId],
  )

  const onlineTone = onlineCount === nodesData.length ? 'ok' : 'caution'

  return (
    <>
      <ModalHeader
        closeModal={onClose}
        iconDescription="Close"
        className="topology-modal__header"
      >
        <span className="topology-modal__title">Network Topology</span>
        <div className="topology-modal__chip-row">
          <StatusChip
            tone={onlineTone}
            label={`${onlineCount}/${nodesData.length} nodes online`}
            size="sm"
          />
          {totalRoutes > 0 && (
            <StatusChip
              tone="info"
              label={`${totalRoutes} cross-node route${totalRoutes !== 1 ? 's' : ''}`}
              size="sm"
            />
          )}
          {ptpStatus?.synchronized && (
            <StatusChip tone="info" label="PTP Sync Active" size="sm" />
          )}
        </div>
      </ModalHeader>

      <ModalBody className="topology-modal__body">
        <div className="topology-modal__layout">
          <div className="topology-modal__canvas">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodeClick={handleNodeClick}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.1}
              maxZoom={2}
            >
              <Background color="rgba(148,163,184,0.22)" />
              <Controls />
              <MiniMap
                nodeColor={(node) => {
                  const avbNode = nodesData.find((n) => n.node_id === node.id)
                  return avbNode?.color || ROUTE_BLUE
                }}
                nodeBorderRadius={4}
                maskColor="rgba(2, 6, 23, 0.55)"
                style={{ backgroundColor: '#0b1220' }}
              />
              <Panel position="top-right">
                <Tooltip label="Fit to view" align="left">
                  <button
                    type="button"
                    onClick={handleFitView}
                    className="topology-modal__fit-button"
                    aria-label="Fit to view"
                  >
                    <FitToScreen size={16} />
                  </button>
                </Tooltip>
              </Panel>
              <Panel position="bottom-left">
                <div className="topology-modal__legend">
                  <span className="topology-modal__legend-title">Legend</span>
                  <div className="topology-modal__legend-row">
                    <span
                      className="topology-modal__legend-line"
                      style={{ background: PTP_GOLD }}
                    />
                    <span>PTP Sync (gold)</span>
                  </div>
                  <div className="topology-modal__legend-row">
                    <span
                      className="topology-modal__legend-line"
                      style={{ background: ROUTE_BLUE }}
                    />
                    <span>Active Routes (blue)</span>
                  </div>
                  <div className="topology-modal__legend-row">
                    <span
                      className="topology-modal__legend-master"
                      style={{ background: PTP_GOLD }}
                    >
                      M
                    </span>
                    <span>PTP Master</span>
                  </div>
                </div>
              </Panel>
            </ReactFlow>
          </div>

          <aside className="topology-modal__side">
            <section className="topology-modal__panel">
              <span className="topology-modal__panel-title">PTP Comparison</span>
              <span className="topology-modal__panel-caption">
                Grandmaster {ptpStatus?.master_node_id || 'unknown'} · synchronized nodes{' '}
                {ptpStatus?.synced_nodes ?? 0}/{ptpStatus?.total_nodes ?? nodesData.length}
              </span>
            </section>

            <section className="topology-modal__panel">
              <div className="topology-modal__grid topology-modal__grid--header">
                <span className="topology-modal__grid-cell">Node</span>
                <span className="topology-modal__grid-cell">State</span>
                <span className="topology-modal__grid-cell">Domain</span>
                <span className="topology-modal__grid-cell">Offset</span>
              </div>

              <div className="topology-modal__rows">
                {ptpRows.map((node) => {
                  const offset =
                    typeof node.ptp?.offset_ns === 'number'
                      ? `${node.ptp.offset_ns} ns`
                      : '—'
                  const stateLabel = node.ptp?.state || 'unknown'
                  const isMaster =
                    node.ptp?.is_master === true ||
                    ptpStatus?.master_node_id === node.node_id

                  return (
                    <div
                      key={node.node_id}
                      className={`topology-modal__grid topology-modal__grid--row ${node.node_id === selectedNodeId ? 'topology-modal__grid--selected' : ''}`}
                    >
                      <div className="topology-modal__node-cell">
                        <span className="topology-modal__node-name">{node.name}</span>
                        <div className="topology-modal__node-tags">
                          <StatusChip
                            tone="neutral"
                            label={node.status}
                            size="sm"
                          />
                          {isMaster && (
                            <StatusChip tone="caution" label="GM" size="sm" />
                          )}
                        </div>
                      </div>
                      <span className="topology-modal__grid-cell topology-modal__capitalize">
                        {stateLabel}
                      </span>
                      <span className="topology-modal__grid-cell">
                        {node.ptp?.domain ?? '—'}
                      </span>
                      <span
                        className={`topology-modal__grid-cell ${isMaster ? 'topology-modal__offset--master' : ''}`}
                      >
                        {offset}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          </aside>
        </div>
      </ModalBody>

      <ModalFooter>
        <Button kind="primary" onClick={onClose} renderIcon={Close}>
          Close
        </Button>
      </ModalFooter>
    </>
  )
}

export function NetworkTopologyModal({ open, onClose }: NetworkTopologyModalProps) {
  return (
    <ComposedModal
      open={open}
      onClose={onClose}
      size="lg"
      className="topology-modal"
    >
      <ReactFlowProvider>
        <NetworkTopologyContent onClose={onClose} />
      </ReactFlowProvider>
    </ComposedModal>
  )
}

export default NetworkTopologyModal
