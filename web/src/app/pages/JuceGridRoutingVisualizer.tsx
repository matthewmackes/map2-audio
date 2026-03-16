import { memo, useMemo, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react'

type RoutingMode =
  | 'parallel_blend'
  | 'ab_switch'
  | 'series'
  | 'parameter_morph'
  | 'sidechain'

export type JuceGridRoutingMarkerId =
  | 'input'
  | 'output'
  | 'series'
  | 'split'
  | 'mix'
  | 'ab'
  | 'morph'
  | 'sidechain'
  | 'key'

export interface JuceGridRoutingInspectorItem {
  id: JuceGridRoutingMarkerId
  label: string
}

export interface JuceGridRoutingFlowInfo {
  id: string
  label: string
  color: string
  muted: boolean
  active?: boolean
  blendPercent?: number
}

interface JuceGridRoutingVisualizerProps {
  mode: RoutingMode
  flows: JuceGridRoutingFlowInfo[]
  morphProgress?: number
  activeFlowId?: string | null
  morphSourceId?: string | null
  morphTargetId?: string | null
  compact?: boolean
  showFlowList?: boolean
  onMarkerSelect?: (markerId: JuceGridRoutingMarkerId) => void
}

interface DiagramPoint {
  x: number
  y: number
}

const TERMINAL_FILL = 'var(--cds-layer-accent, rgba(255,255,255,0.04))'
const TERMINAL_STROKE = 'var(--cds-border-subtle, rgba(255,255,255,0.16))'
const TERMINAL_TEXT = 'var(--cds-text-secondary, rgba(255,255,255,0.65))'
const NODE_FILL = 'var(--cds-layer, rgba(255,255,255,0.02))'
const NODE_STROKE = 'var(--cds-border-strong, rgba(255,255,255,0.24))'
const ACTIVE_WIRE = 'var(--cds-link-primary, #0f62fe)'
const WIRE = 'var(--cds-border-subtle, rgba(255,255,255,0.18))'
const ACTIVE_MARKER_FILL = 'color-mix(in srgb, var(--cds-link-primary, #0f62fe) 18%, var(--cds-layer, rgba(255,255,255,0.04)))'

export const JuceGridRoutingVisualizer = memo(function JuceGridRoutingVisualizer({
  mode,
  flows,
  morphProgress = 0.5,
  activeFlowId,
  morphSourceId,
  morphTargetId,
  compact = false,
  showFlowList = true,
  onMarkerSelect,
}: JuceGridRoutingVisualizerProps) {
  const visibleFlows = useMemo(() => flows.filter((flow) => !flow.muted), [flows])

  const diagram = useMemo(() => {
    if (visibleFlows.length === 0) {
      return null
    }

    const primaryFlow = visibleFlows.find((flow) => flow.id === activeFlowId) || visibleFlows[0]
    const secondaryFlow = visibleFlows.find((flow) => flow.id !== primaryFlow.id) || primaryFlow
    const morphSource = visibleFlows.find((flow) => flow.id === morphSourceId) || primaryFlow
    const morphTarget = visibleFlows.find((flow) => flow.id === morphTargetId) || secondaryFlow

    switch (mode) {
      case 'parallel_blend':
        return buildParallelDiagram(visibleFlows, primaryFlow.id, compact)
      case 'ab_switch':
        return buildABDiagram(visibleFlows, primaryFlow.id, compact)
      case 'parameter_morph':
        return buildMorphDiagram(morphSource, morphTarget, morphProgress, compact)
      case 'sidechain':
        return buildSidechainDiagram(primaryFlow, secondaryFlow, compact)
      case 'series':
      default:
        return buildSeriesDiagram(visibleFlows, primaryFlow.id, compact)
    }
  }, [activeFlowId, compact, mode, morphProgress, morphSourceId, morphTargetId, visibleFlows])

  if (!diagram) {
    return null
  }

  return (
    <div className="juce-grid-page__routing-diagram">
      <svg
        className="juce-grid-page__routing-svg"
        viewBox={`0 0 ${diagram.width} ${diagram.height}`}
        role="img"
        aria-label={`${diagram.ariaLabel} routing diagram`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <marker
            id="juce-grid-routing-arrow"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <path d="M0,0 L8,4 L0,8 z" fill={WIRE} />
          </marker>
          <marker
            id="juce-grid-routing-arrow-active"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
          >
            <path d="M0,0 L8,4 L0,8 z" fill={ACTIVE_WIRE} />
          </marker>
        </defs>

        {diagram.wires.map((wire, index) => renderWire(wire.points, wire.active, wire.dashed, `wire-${index}`))}
        {diagram.terminals.map((terminal) => renderTerminal(terminal, onMarkerSelect, `terminal-${terminal.id}`))}
        {diagram.markers.map((marker) => renderMarker(marker, onMarkerSelect, `marker-${marker.id}`))}
        {diagram.morphBlock && renderMorphBlock(diagram.morphBlock.progress, diagram.morphBlock.x, diagram.morphBlock.y, compact)}
        {diagram.flows.map((flow) => renderFlowNode(flow, compact))}
      </svg>

      {showFlowList && (
        <div className="juce-grid-page__routing-flow-list" role="list" aria-label="Routing flows">
          {diagram.flows.map((flow) => (
            <div
              key={`flow-legend-${flow.id}`}
              className={`juce-grid-page__routing-flow-item ${flow.active ? 'is-active' : ''}`}
              role="listitem"
            >
              <span
                className="juce-grid-page__routing-flow-dot"
                style={{
                  backgroundColor: flow.active ? flow.color : toAlphaColor(flow.color, 0.16),
                  borderColor: flow.color,
                }}
              />
              <div className="juce-grid-page__routing-flow-copy">
                <strong>{flow.title}</strong>
                <span>{flow.caption}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

interface DiagramFlowNode {
  id: string
  x: number
  y: number
  width: number
  height: number
  label: string
  title: string
  caption: string
  color: string
  active: boolean
}

interface DiagramData {
  width: number
  height: number
  ariaLabel: string
  wires: Array<{ points: DiagramPoint[]; active: boolean; dashed?: boolean }>
  terminals: Array<{ id: JuceGridRoutingMarkerId; x: number; y: number; label: string; active?: boolean }>
  markers: Array<{ id: JuceGridRoutingMarkerId; x: number; y: number; label: string; active?: boolean }>
  flows: DiagramFlowNode[]
  morphBlock?: { x: number; y: number; progress: number }
}

export function getJuceGridRoutingInspectorItems(
  mode: RoutingMode,
  compact: boolean,
): JuceGridRoutingInspectorItem[] {
  const labels: Record<JuceGridRoutingMarkerId, string> = {
    input: compact ? 'In' : 'Input',
    output: compact ? 'Out' : 'Output',
    series: 'Series',
    split: 'Split',
    mix: 'Mix',
    ab: 'A/B',
    morph: 'Morph',
    sidechain: compact ? 'SC' : 'Sidechain',
    key: 'Key',
  }

  switch (mode) {
    case 'parallel_blend':
      return [
        { id: 'input', label: labels.input },
        { id: 'split', label: labels.split },
        { id: 'mix', label: labels.mix },
        { id: 'output', label: labels.output },
      ]
    case 'ab_switch':
      return [
        { id: 'input', label: labels.input },
        { id: 'ab', label: labels.ab },
        { id: 'output', label: labels.output },
      ]
    case 'parameter_morph':
      return [
        { id: 'input', label: labels.input },
        { id: 'morph', label: labels.morph },
        { id: 'output', label: labels.output },
      ]
    case 'sidechain':
      return [
        { id: 'input', label: labels.input },
        { id: 'key', label: labels.key },
        { id: 'sidechain', label: labels.sidechain },
        { id: 'output', label: labels.output },
      ]
    case 'series':
    default:
      return [
        { id: 'input', label: labels.input },
        { id: 'series', label: labels.series },
        { id: 'output', label: labels.output },
      ]
  }
}

function buildSeriesDiagram(flows: JuceGridRoutingFlowInfo[], activeFlowId: string, compact: boolean): DiagramData {
  const nodeWidth = compact ? 100 : 116
  const nodeHeight = compact ? 48 : 56
  const gap = compact ? 24 : 32
  const terminalX = 52
  const y = compact ? 68 : 80
  const flowStartX = 124
  const flowY = y - nodeHeight / 2
  const flowNodes = flows.map((flow, index) => ({
    id: flow.id,
    x: flowStartX + index * (nodeWidth + gap),
    y: flowY,
    width: nodeWidth,
    height: nodeHeight,
    label: flow.label,
    title: `Flow ${flow.label}`,
    caption: index === 0 ? 'Input stage' : 'Serial stage',
    color: flow.color,
    active: flow.id === activeFlowId,
  }))
  const outputX = flowStartX + flowNodes.length * (nodeWidth + gap)
  const terminals = [
    { id: 'input' as const, x: terminalX, y, label: compact ? 'In' : 'Input', active: true },
    { id: 'output' as const, x: outputX, y, label: compact ? 'Out' : 'Output', active: true },
  ]

  const wires = [
    {
      points: [
        { x: terminalX + 40, y },
        { x: flowNodes[0].x, y },
      ],
      active: true,
    },
    ...flowNodes.flatMap((node, index) => {
      if (index === flowNodes.length - 1) {
        return [
          {
            points: [
              { x: node.x + node.width, y },
              { x: outputX - 40, y },
            ],
            active: true,
          },
        ]
      }

      return [
        {
          points: [
            { x: node.x + node.width, y },
            { x: flowNodes[index + 1].x, y },
          ],
          active: true,
        },
      ]
    }),
  ]

  return {
    width: outputX + 40,
    height: compact ? 136 : 152,
    ariaLabel: 'Series',
    wires,
    terminals,
    markers: [
      { id: 'series', x: flowStartX - 36, y: y - 30, label: 'Series', active: true },
    ],
    flows: flowNodes,
  }
}

function buildParallelDiagram(flows: JuceGridRoutingFlowInfo[], activeFlowId: string, compact: boolean): DiagramData {
  const nodeWidth = compact ? 100 : 116
  const nodeHeight = compact ? 48 : 56
  const rowGap = compact ? 68 : 78
  const startY = compact ? 42 : 50
  const splitterX = 128
  const flowX = 196
  const mixX = flowX + nodeWidth + 84
  const outputX = mixX + 76
  const flowNodes = flows.map((flow, index) => ({
    id: flow.id,
    x: flowX,
    y: startY + index * rowGap,
    width: nodeWidth,
    height: nodeHeight,
    label: flow.label,
    title: `Flow ${flow.label}`,
    caption: `${Math.round(flow.blendPercent ?? 100)}% blend`,
    color: flow.color,
    active: flow.id === activeFlowId,
  }))
  const centerY = average(flowNodes.map((flow) => flow.y + flow.height / 2))
  const terminals = [
    { id: 'input' as const, x: 56, y: centerY, label: compact ? 'In' : 'Input', active: true },
    { id: 'output' as const, x: outputX, y: centerY, label: compact ? 'Out' : 'Output', active: true },
  ]

  const wires = [
    {
      points: [
        { x: 96, y: centerY },
        { x: splitterX, y: centerY },
      ],
      active: true,
    },
    {
      points: [
        { x: splitterX, y: flowNodes[0].y + flowNodes[0].height / 2 },
        { x: splitterX, y: flowNodes[flowNodes.length - 1].y + flowNodes[flowNodes.length - 1].height / 2 },
      ],
      active: true,
    },
    {
      points: [
        { x: mixX, y: flowNodes[0].y + flowNodes[0].height / 2 },
        { x: mixX, y: flowNodes[flowNodes.length - 1].y + flowNodes[flowNodes.length - 1].height / 2 },
      ],
      active: true,
    },
    {
      points: [
        { x: mixX, y: centerY },
        { x: outputX - 40, y: centerY },
      ],
      active: true,
    },
    ...flowNodes.flatMap((flow) => {
      const center = flow.y + flow.height / 2
      return [
        {
          points: [
            { x: splitterX, y: center },
            { x: flow.x, y: center },
          ],
          active: flow.active,
        },
        {
          points: [
            { x: flow.x + flow.width, y: center },
            { x: mixX, y: center },
          ],
          active: flow.active,
        },
      ]
    }),
  ]

  return {
    width: outputX + 40,
    height: startY + flowNodes.length * rowGap,
    ariaLabel: 'Parallel blend',
    wires,
    terminals,
    markers: [
      { id: 'split', x: splitterX, y: startY - 12, label: 'Split', active: true },
      { id: 'mix', x: mixX, y: startY - 12, label: 'Mix', active: true },
    ],
    flows: flowNodes,
  }
}

function buildABDiagram(flows: JuceGridRoutingFlowInfo[], activeFlowId: string, compact: boolean): DiagramData {
  const nodeWidth = compact ? 100 : 116
  const nodeHeight = compact ? 48 : 56
  const rowGap = compact ? 68 : 78
  const startY = compact ? 42 : 50
  const switchX = 136
  const flowX = 208
  const outputX = flowX + nodeWidth + 112
  const flowNodes = flows.map((flow, index) => ({
    id: flow.id,
    x: flowX,
    y: startY + index * rowGap,
    width: nodeWidth,
    height: nodeHeight,
    label: flow.label,
    title: `Flow ${flow.label}`,
    caption: flow.id === activeFlowId ? 'Live path' : 'Standby path',
    color: flow.color,
    active: flow.id === activeFlowId,
  }))
  const centerY = average(flowNodes.map((flow) => flow.y + flow.height / 2))
  const terminals = [
    { id: 'input' as const, x: 56, y: centerY, label: compact ? 'In' : 'Input', active: true },
    { id: 'output' as const, x: outputX, y: centerY, label: compact ? 'Out' : 'Output', active: true },
  ]

  const wires = [
    {
      points: [
        { x: 96, y: centerY },
        { x: switchX, y: centerY },
      ],
      active: true,
    },
    {
      points: [
        { x: switchX, y: flowNodes[0].y + flowNodes[0].height / 2 },
        { x: switchX, y: flowNodes[flowNodes.length - 1].y + flowNodes[flowNodes.length - 1].height / 2 },
      ],
      active: true,
    },
    ...flowNodes.flatMap((flow) => {
      const center = flow.y + flow.height / 2
      return [
        {
          points: [
            { x: switchX, y: center },
            { x: flow.x, y: center },
          ],
          active: flow.active,
          dashed: !flow.active,
        },
        {
          points: [
            { x: flow.x + flow.width, y: center },
            { x: outputX - 40, y: centerY },
          ],
          active: flow.active,
          dashed: !flow.active,
        },
      ]
    }),
  ]

  return {
    width: outputX + 40,
    height: startY + flowNodes.length * rowGap,
    ariaLabel: 'A/B switch',
    wires,
    terminals,
    markers: [
      { id: 'ab', x: switchX, y: startY - 12, label: 'A/B', active: true },
    ],
    flows: flowNodes,
  }
}

function buildMorphDiagram(
  source: JuceGridRoutingFlowInfo,
  target: JuceGridRoutingFlowInfo,
  progress: number,
  compact: boolean,
): DiagramData {
  const nodeWidth = compact ? 100 : 116
  const nodeHeight = compact ? 48 : 56
  const y = compact ? 72 : 84
  const sourceX = 128
  const morphX = sourceX + nodeWidth + 48
  const targetX = morphX + 84
  const outputX = targetX + nodeWidth + 76
  const clampedProgress = Math.max(0, Math.min(1, progress))
  const flows: DiagramFlowNode[] = [
    {
      id: source.id,
      x: sourceX,
      y: y - nodeHeight / 2,
      width: nodeWidth,
      height: nodeHeight,
      label: source.label,
      title: `Flow ${source.label}`,
      caption: 'Morph source',
      color: source.color,
      active: true,
    },
    {
      id: target.id,
      x: targetX,
      y: y - nodeHeight / 2,
      width: nodeWidth,
      height: nodeHeight,
      label: target.label,
      title: `Flow ${target.label}`,
      caption: 'Morph target',
      color: target.color,
      active: true,
    },
  ]

  return {
    width: outputX + 40,
    height: compact ? 144 : 160,
    ariaLabel: 'Morph',
    terminals: [
      { id: 'input', x: 52, y, label: compact ? 'In' : 'Input', active: true },
      { id: 'output', x: outputX, y, label: compact ? 'Out' : 'Output', active: true },
    ],
    markers: [
      { id: 'morph', x: morphX + 26, y: y - 38, label: 'Morph', active: true },
    ],
    wires: [
      {
        points: [
          { x: 92, y },
          { x: sourceX, y },
        ],
        active: true,
      },
      {
        points: [
          { x: sourceX + nodeWidth, y },
          { x: morphX, y },
        ],
        active: true,
      },
      {
        points: [
          { x: morphX + 56, y },
          { x: targetX, y },
        ],
        active: true,
      },
      {
        points: [
          { x: targetX + nodeWidth, y },
          { x: outputX - 36, y },
        ],
        active: true,
      },
    ],
    flows,
    morphBlock: {
      x: morphX,
      y: y - 18,
      progress: clampedProgress,
    },
  }
}

function buildSidechainDiagram(primary: JuceGridRoutingFlowInfo, secondary: JuceGridRoutingFlowInfo, compact: boolean): DiagramData {
  if (primary.id === secondary.id) {
    return buildSeriesDiagram([primary], primary.id, compact)
  }

  const nodeWidth = compact ? 100 : 116
  const nodeHeight = compact ? 48 : 56
  const primaryY = compact ? 102 : 114
  const sidechainY = compact ? 32 : 40
  const inputX = 52
  const flowX = 180
  const outputX = flowX + nodeWidth + 112
  const primaryNode: DiagramFlowNode = {
    id: primary.id,
    x: flowX,
    y: primaryY - nodeHeight / 2,
    width: nodeWidth,
    height: nodeHeight,
    label: primary.label,
    title: `Flow ${primary.label}`,
    caption: 'Primary path',
    color: primary.color,
    active: true,
  }
  const sidechainNode: DiagramFlowNode = {
    id: secondary.id,
    x: flowX - 64,
    y: sidechainY,
    width: nodeWidth,
    height: nodeHeight,
    label: secondary.label,
    title: `Flow ${secondary.label}`,
    caption: 'Sidechain source',
    color: secondary.color,
    active: false,
  }

  return {
    width: outputX + 40,
    height: compact ? 168 : 188,
    ariaLabel: 'Sidechain',
    terminals: [
      { id: 'input', x: inputX, y: primaryY, label: compact ? 'In' : 'Input', active: true },
      { id: 'output', x: outputX, y: primaryY, label: compact ? 'Out' : 'Output', active: true },
      { id: 'key', x: inputX, y: sidechainY + nodeHeight / 2, label: 'Key', active: false },
    ],
    markers: [
      { id: 'sidechain', x: primaryNode.x - 20, y: primaryNode.y - 20, label: compact ? 'SC' : 'Sidechain', active: true },
    ],
    wires: [
      {
        points: [
          { x: inputX + 36, y: primaryY },
          { x: primaryNode.x, y: primaryY },
        ],
        active: true,
      },
      {
        points: [
          { x: primaryNode.x + nodeWidth, y: primaryY },
          { x: outputX - 36, y: primaryY },
        ],
        active: true,
      },
      {
        points: [
          { x: inputX + 36, y: sidechainY + nodeHeight / 2 },
          { x: sidechainNode.x, y: sidechainY + nodeHeight / 2 },
        ],
        active: false,
      },
      {
        points: [
          { x: sidechainNode.x + nodeWidth / 2, y: sidechainY + nodeHeight },
          { x: sidechainNode.x + nodeWidth / 2, y: primaryNode.y + nodeHeight / 2 },
          { x: primaryNode.x + 18, y: primaryNode.y + nodeHeight / 2 },
        ],
        active: false,
        dashed: true,
      },
    ],
    flows: [primaryNode, sidechainNode],
  }
}

function renderWire(points: DiagramPoint[], active: boolean, dashed: boolean | undefined, key: string) {
  const path = pointsToPath(points)
  return (
    <path
      key={key}
      d={path}
      className={`juce-grid-page__routing-wire ${active ? 'is-active' : ''} ${dashed ? 'is-dashed' : ''}`}
      stroke={active ? ACTIVE_WIRE : WIRE}
      markerEnd={active ? 'url(#juce-grid-routing-arrow-active)' : 'url(#juce-grid-routing-arrow)'}
    />
  )
}

function handleMarkerKeyDown(
  event: ReactKeyboardEvent<SVGGElement>,
  markerId: JuceGridRoutingMarkerId,
  onMarkerSelect?: (markerId: JuceGridRoutingMarkerId) => void,
) {
  if (!onMarkerSelect) {
    return
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    onMarkerSelect(markerId)
  }
}

function renderTerminal(
  terminal: { id: JuceGridRoutingMarkerId; x: number; y: number; label: string; active?: boolean },
  onMarkerSelect: ((markerId: JuceGridRoutingMarkerId) => void) | undefined,
  key: string,
) {
  const interactiveProps = onMarkerSelect
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onClick: () => onMarkerSelect(terminal.id),
        onKeyDown: (event: ReactKeyboardEvent<SVGGElement>) => handleMarkerKeyDown(event, terminal.id, onMarkerSelect),
        'aria-label': `${terminal.label} routing inspector`,
      }
    : {}

  return (
    <g key={key} className={`juce-grid-page__routing-terminal ${terminal.active ? 'is-active' : ''}`} {...interactiveProps}>
      <rect
        x={terminal.x - 38}
        y={terminal.y - 16}
        width={76}
        height={32}
        rx={16}
        fill={TERMINAL_FILL}
        stroke={terminal.active ? ACTIVE_WIRE : TERMINAL_STROKE}
      />
      <text x={terminal.x} y={terminal.y + 4} textAnchor="middle" className="juce-grid-page__routing-terminal-label">
        {terminal.label}
      </text>
    </g>
  )
}

function renderMarker(
  marker: { id: JuceGridRoutingMarkerId; x: number; y: number; label: string; active?: boolean },
  onMarkerSelect: ((markerId: JuceGridRoutingMarkerId) => void) | undefined,
  key: string,
) {
  const width = Math.max(52, marker.label.length * 8 + 18)
  const interactiveProps = onMarkerSelect
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onClick: () => onMarkerSelect(marker.id),
        onKeyDown: (event: ReactKeyboardEvent<SVGGElement>) => handleMarkerKeyDown(event, marker.id, onMarkerSelect),
        'aria-label': `${marker.label} routing inspector`,
      }
    : {}

  return (
    <g key={key} className={`juce-grid-page__routing-marker ${marker.active ? 'is-active' : ''}`} {...interactiveProps}>
      <rect
        x={marker.x - width / 2}
        y={marker.y - 12}
        width={width}
        height={24}
        rx={12}
        fill={marker.active ? ACTIVE_MARKER_FILL : TERMINAL_FILL}
        stroke={marker.active ? ACTIVE_WIRE : TERMINAL_STROKE}
      />
      <text x={marker.x} y={marker.y + 4} textAnchor="middle" className="juce-grid-page__routing-marker-label">
        {marker.label}
      </text>
    </g>
  )
}

function renderMorphBlock(progress: number, x: number, y: number, compact: boolean) {
  const width = compact ? 52 : 60
  const height = compact ? 32 : 38
  const clamped = Math.max(0, Math.min(1, progress))
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={10} fill={NODE_FILL} stroke={NODE_STROKE} />
      <rect
        x={x + 4}
        y={y + height - 8}
        width={(width - 8) * clamped}
        height={5}
        rx={3}
        fill={ACTIVE_WIRE}
      />
      <text x={x + width / 2} y={y + 15} textAnchor="middle" className="juce-grid-page__routing-morph-label">
        Morph
      </text>
      <text x={x + width / 2} y={y + 27} textAnchor="middle" className="juce-grid-page__routing-morph-value">
        {Math.round(clamped * 100)}%
      </text>
    </g>
  )
}

function renderFlowNode(flow: DiagramFlowNode, compact: boolean) {
  const badgeRadius = compact ? 12 : 14
  const badgeCenterX = flow.x + 18
  const textStartX = flow.x + (compact ? 38 : 40)
  const style = {
    '--routing-accent': flow.color,
  } as CSSProperties

  return (
    <g
      key={flow.id}
      className={`juce-grid-page__routing-node ${flow.active ? 'is-active' : ''}`}
      style={style}
    >
      <rect
        x={flow.x}
        y={flow.y}
        width={flow.width}
        height={flow.height}
        rx={12}
        fill={flow.active ? toAlphaColor(flow.color, 0.14) : NODE_FILL}
        stroke={flow.active ? flow.color : NODE_STROKE}
      />
      <circle
        cx={badgeCenterX}
        cy={flow.y + flow.height / 2}
        r={badgeRadius}
        fill={flow.active ? flow.color : toAlphaColor(flow.color, 0.16)}
        stroke={flow.color}
      />
      <text
        x={badgeCenterX}
        y={flow.y + flow.height / 2 + 4}
        textAnchor="middle"
        className="juce-grid-page__routing-node-letter"
      >
        {flow.label}
      </text>
      <text x={textStartX} y={flow.y + (compact ? 20 : 21)} className="juce-grid-page__routing-node-title">
        {flow.title}
      </text>
      <text x={textStartX} y={flow.y + (compact ? 36 : 38)} className="juce-grid-page__routing-node-caption">
        {flow.caption}
      </text>
    </g>
  )
}

function pointsToPath(points: DiagramPoint[]) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
}

function toAlphaColor(color: string, alpha: number) {
  if (color.startsWith('#')) {
    const normalized = color.length === 4
      ? `#${color.slice(1).split('').map((char) => char + char).join('')}`
      : color
    const red = Number.parseInt(normalized.slice(1, 3), 16)
    const green = Number.parseInt(normalized.slice(3, 5), 16)
    const blue = Number.parseInt(normalized.slice(5, 7), 16)
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`
  }

  if (color.startsWith('rgb(')) {
    return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`)
  }

  return color
}
