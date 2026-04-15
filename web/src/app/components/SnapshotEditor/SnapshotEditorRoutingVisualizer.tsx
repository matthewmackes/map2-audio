import { memo, useMemo, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { ArrowRight } from '@carbon/icons-react'

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

// ── Carbon Design token constants ──────────────────────────────────────────────
// All fills, strokes, and text use Carbon tokens with semantically correct fallbacks.
// No hardcoded hex or rgba values outside of these constants.
const C_BACKGROUND   = 'var(--cds-background, #161616)'
const C_LAYER        = 'var(--cds-layer, #262626)'
const C_BORDER       = 'var(--cds-border-subtle, #393939)'
const C_BORDER_STRONG= 'var(--cds-border-strong, #525252)'
const C_TEXT_PRIMARY = 'var(--cds-text-primary, #f4f4f4)'
const C_TEXT_SECONDARY='var(--cds-text-secondary, #c6c6c6)'
const C_LINK         = 'var(--cds-link-primary, #0f62fe)'
const C_PURPLE       = 'var(--cds-purple-60, #8a3ffc)'
const C_FOCUS        = 'var(--cds-focus, #ffffff)'

// Unique gradient IDs for animated active-path wires (gradient sweeps signal direction)
const GRAD_ACTIVE_ID = 'jgr-wire-gradient-active'
const GRAD_MORPH_ID  = 'jgr-wire-gradient-morph'

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

  // Determine accent color for active-wire gradient (morph mode = purple, else link)
  const isMorph = mode === 'parameter_morph'
  const activeWireColor = isMorph ? C_PURPLE : C_LINK

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
          {/* Gradient for active wire — sweeps left→right in signal direction */}
          <linearGradient id={GRAD_ACTIVE_ID} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={activeWireColor} stopOpacity="0" />
            <stop offset="60%" stopColor={activeWireColor} stopOpacity="0.55" />
            <stop offset="100%" stopColor={activeWireColor} stopOpacity="1" />
          </linearGradient>
          <linearGradient id={GRAD_MORPH_ID} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={C_PURPLE} stopOpacity="0" />
            <stop offset="60%" stopColor={C_PURPLE} stopOpacity="0.55" />
            <stop offset="100%" stopColor={C_PURPLE} stopOpacity="1" />
          </linearGradient>
        </defs>

        {diagram.wires.map((wire, index) =>
          renderWire(wire.points, wire.active, wire.dashed, isMorph, `wire-${index}`)
        )}
        {diagram.terminals.map((terminal) =>
          renderTerminal(terminal, onMarkerSelect, `terminal-${terminal.id}`)
        )}
        {diagram.markers.map((marker) =>
          renderMarker(marker, onMarkerSelect, `marker-${marker.id}`)
        )}
        {diagram.morphBlock && renderMorphBlock(
          diagram.morphBlock.progress,
          diagram.morphBlock.x,
          diagram.morphBlock.y,
          compact,
        )}
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

// ── Layout constants — more generous spacing for professional look ──────────────
// Responsive: compact mode used when panel is narrow or many flows exist.
function nodeW(compact: boolean) { return compact ? 112 : 132 }
function nodeH(compact: boolean) { return compact ? 52 : 62 }
function hGap(compact: boolean)  { return compact ? 40 : 56 }
function rowGap(compact: boolean){ return compact ? 76 : 92 }

function buildSeriesDiagram(flows: JuceGridRoutingFlowInfo[], activeFlowId: string, compact: boolean): DiagramData {
  const nW = nodeW(compact)
  const nH = nodeH(compact)
  const gap = hGap(compact)
  const y = compact ? 72 : 88
  const flowY = y - nH / 2
  const firstX = 80  // more leading space for bookend
  const flowNodes = flows.map((flow, index) => ({
    id: flow.id,
    x: firstX + index * (nW + gap),
    y: flowY,
    width: nW,
    height: nH,
    label: flow.label,
    title: `Flow ${flow.label}`,
    caption: index === 0 ? 'Input stage' : 'Serial stage',
    color: flow.color,
    active: flow.id === activeFlowId,
  }))
  const lastNodeRight = flowNodes.length > 0 ? flowNodes[flowNodes.length - 1].x + nW : firstX
  const outputX = lastNodeRight + gap + 20

  const wires = [
    { points: [{ x: 32, y }, { x: firstX, y }], active: true },
    ...flowNodes.flatMap((node, index) => {
      if (index === flowNodes.length - 1) {
        return [{ points: [{ x: node.x + nW, y }, { x: outputX - 20, y }], active: true }]
      }
      return [{ points: [{ x: node.x + nW, y }, { x: flowNodes[index + 1].x, y }], active: true }]
    }),
  ]

  return {
    width: outputX + 32,
    height: compact ? 144 : 168,
    ariaLabel: 'Series',
    wires,
    terminals: [
      { id: 'input', x: 16, y, label: compact ? 'In' : 'Input', active: true },
      { id: 'output', x: outputX, y, label: compact ? 'Out' : 'Output', active: true },
    ],
    markers: [
      { id: 'series', x: firstX + (flowNodes.length * (nW + gap)) / 2, y: flowY - 24, label: 'Series', active: true },
    ],
    flows: flowNodes,
  }
}

function buildParallelDiagram(flows: JuceGridRoutingFlowInfo[], activeFlowId: string, compact: boolean): DiagramData {
  const nW = nodeW(compact)
  const nH = nodeH(compact)
  const rGap = rowGap(compact)
  const startY = compact ? 48 : 58
  const splitterX = 72
  const flowX = splitterX + 60
  const mixX = flowX + nW + 80
  const outputX = mixX + 60

  const flowNodes = flows.map((flow, index) => ({
    id: flow.id,
    x: flowX,
    y: startY + index * rGap,
    width: nW,
    height: nH,
    label: flow.label,
    title: `Flow ${flow.label}`,
    caption: `${Math.round(flow.blendPercent ?? 100)}% blend`,
    color: flow.color,
    active: flow.id === activeFlowId,
  }))
  const centerY = average(flowNodes.map((flow) => flow.y + flow.height / 2))

  const wires = [
    { points: [{ x: 16, y: centerY }, { x: splitterX, y: centerY }], active: true },
    {
      points: [
        { x: splitterX, y: flowNodes[0].y + nH / 2 },
        { x: splitterX, y: flowNodes[flowNodes.length - 1].y + nH / 2 },
      ],
      active: true,
    },
    {
      points: [
        { x: mixX, y: flowNodes[0].y + nH / 2 },
        { x: mixX, y: flowNodes[flowNodes.length - 1].y + nH / 2 },
      ],
      active: true,
    },
    { points: [{ x: mixX, y: centerY }, { x: outputX - 16, y: centerY }], active: true },
    ...flowNodes.flatMap((flow) => {
      const cy = flow.y + nH / 2
      return [
        { points: [{ x: splitterX, y: cy }, { x: flow.x, y: cy }], active: flow.active },
        { points: [{ x: flow.x + nW, y: cy }, { x: mixX, y: cy }], active: flow.active },
      ]
    }),
  ]

  return {
    width: outputX + 32,
    height: startY + flowNodes.length * rGap + 16,
    ariaLabel: 'Parallel blend',
    wires,
    terminals: [
      { id: 'input', x: 16, y: centerY, label: compact ? 'In' : 'Input', active: true },
      { id: 'output', x: outputX, y: centerY, label: compact ? 'Out' : 'Output', active: true },
    ],
    markers: [
      { id: 'split', x: splitterX, y: startY - 16, label: 'Split', active: true },
      { id: 'mix', x: mixX, y: startY - 16, label: 'Mix', active: true },
    ],
    flows: flowNodes,
  }
}

function buildABDiagram(flows: JuceGridRoutingFlowInfo[], activeFlowId: string, compact: boolean): DiagramData {
  const nW = nodeW(compact)
  const nH = nodeH(compact)
  const rGap = rowGap(compact)
  const startY = compact ? 48 : 58
  const switchX = 80
  const flowX = switchX + 64
  const outputX = flowX + nW + 80

  const flowNodes = flows.map((flow, index) => ({
    id: flow.id,
    x: flowX,
    y: startY + index * rGap,
    width: nW,
    height: nH,
    label: flow.label,
    title: `Flow ${flow.label}`,
    caption: flow.id === activeFlowId ? 'Selected path' : 'Standby path',
    color: flow.color,
    active: flow.id === activeFlowId,
  }))
  const centerY = average(flowNodes.map((flow) => flow.y + nH / 2))

  const wires = [
    { points: [{ x: 16, y: centerY }, { x: switchX, y: centerY }], active: true },
    {
      points: [
        { x: switchX, y: flowNodes[0].y + nH / 2 },
        { x: switchX, y: flowNodes[flowNodes.length - 1].y + nH / 2 },
      ],
      active: true,
    },
    ...flowNodes.flatMap((flow) => {
      const cy = flow.y + nH / 2
      return [
        { points: [{ x: switchX, y: cy }, { x: flow.x, y: cy }], active: flow.active, dashed: !flow.active },
        { points: [{ x: flow.x + nW, y: cy }, { x: outputX - 16, y: centerY }], active: flow.active, dashed: !flow.active },
      ]
    }),
  ]

  return {
    width: outputX + 32,
    height: startY + flowNodes.length * rGap + 16,
    ariaLabel: 'A/B switch',
    wires,
    terminals: [
      { id: 'input', x: 16, y: centerY, label: compact ? 'In' : 'Input', active: true },
      { id: 'output', x: outputX, y: centerY, label: compact ? 'Out' : 'Output', active: true },
    ],
    markers: [
      { id: 'ab', x: switchX, y: startY - 16, label: 'A/B', active: true },
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
  const nW = nodeW(compact)
  const nH = nodeH(compact)
  const y = compact ? 80 : 96
  const sourceX = 80
  const gap = hGap(compact)
  const morphBlockW = compact ? 60 : 72
  const morphX = sourceX + nW + gap
  const targetX = morphX + morphBlockW + gap
  const outputX = targetX + nW + gap + 20
  const clampedProgress = Math.max(0, Math.min(1, progress))

  const flows: DiagramFlowNode[] = [
    {
      id: source.id,
      x: sourceX,
      y: y - nH / 2,
      width: nW,
      height: nH,
      label: source.label,
      title: `Flow ${source.label}`,
      caption: 'Morph source',
      color: source.color,
      active: true,
    },
    {
      id: target.id,
      x: targetX,
      y: y - nH / 2,
      width: nW,
      height: nH,
      label: target.label,
      title: `Flow ${target.label}`,
      caption: 'Morph target',
      color: target.color,
      active: true,
    },
  ]

  return {
    width: outputX + 32,
    height: compact ? 160 : 184,
    ariaLabel: 'Morph',
    terminals: [
      { id: 'input', x: 16, y, label: compact ? 'In' : 'Input', active: true },
      { id: 'output', x: outputX, y, label: compact ? 'Out' : 'Output', active: true },
    ],
    markers: [
      { id: 'morph', x: morphX + morphBlockW / 2, y: y - nH / 2 - 24, label: 'Morph', active: true },
    ],
    wires: [
      { points: [{ x: 32, y }, { x: sourceX, y }], active: true },
      { points: [{ x: sourceX + nW, y }, { x: morphX, y }], active: true },
      { points: [{ x: morphX + morphBlockW, y }, { x: targetX, y }], active: true },
      { points: [{ x: targetX + nW, y }, { x: outputX - 20, y }], active: true },
    ],
    flows,
    morphBlock: {
      x: morphX,
      y: y - nH / 2,
      progress: clampedProgress,
    },
  }
}

function buildSidechainDiagram(primary: JuceGridRoutingFlowInfo, secondary: JuceGridRoutingFlowInfo, compact: boolean): DiagramData {
  if (primary.id === secondary.id) {
    return buildSeriesDiagram([primary], primary.id, compact)
  }

  const nW = nodeW(compact)
  const nH = nodeH(compact)
  const primaryY = compact ? 112 : 128
  const sidechainY = compact ? 36 : 44
  const inputX = 16
  const flowX = 160
  const outputX = flowX + nW + 80

  const primaryNode: DiagramFlowNode = {
    id: primary.id,
    x: flowX,
    y: primaryY - nH / 2,
    width: nW,
    height: nH,
    label: primary.label,
    title: `Flow ${primary.label}`,
    caption: 'Primary path',
    color: primary.color,
    active: true,
  }
  const sidechainNode: DiagramFlowNode = {
    id: secondary.id,
    x: flowX - 48,
    y: sidechainY,
    width: nW,
    height: nH,
    label: secondary.label,
    title: `Flow ${secondary.label}`,
    caption: 'Sidechain source',
    color: secondary.color,
    active: false,
  }

  return {
    width: outputX + 32,
    height: compact ? 184 : 212,
    ariaLabel: 'Sidechain',
    terminals: [
      { id: 'input', x: inputX, y: primaryY, label: compact ? 'In' : 'Input', active: true },
      { id: 'output', x: outputX, y: primaryY, label: compact ? 'Out' : 'Output', active: true },
      { id: 'key', x: inputX, y: sidechainY + nH / 2, label: 'Key', active: false },
    ],
    markers: [
      { id: 'sidechain', x: primaryNode.x - 16, y: primaryNode.y - 20, label: compact ? 'SC' : 'Sidechain', active: true },
    ],
    wires: [
      { points: [{ x: inputX + 32, y: primaryY }, { x: primaryNode.x, y: primaryY }], active: true },
      { points: [{ x: primaryNode.x + nW, y: primaryY }, { x: outputX - 32, y: primaryY }], active: true },
      { points: [{ x: inputX + 32, y: sidechainY + nH / 2 }, { x: sidechainNode.x, y: sidechainY + nH / 2 }], active: false },
      {
        points: [
          { x: sidechainNode.x + nW / 2, y: sidechainY + nH },
          { x: sidechainNode.x + nW / 2, y: primaryNode.y + nH / 2 },
          { x: primaryNode.x + 16, y: primaryNode.y + nH / 2 },
        ],
        active: false,
        dashed: true,
      },
    ],
    flows: [primaryNode, sidechainNode],
  }
}

// ── Render helpers ─────────────────────────────────────────────────────────────

function renderWire(
  points: DiagramPoint[],
  active: boolean,
  dashed: boolean | undefined,
  isMorphMode: boolean,
  key: string,
) {
  const path = pointsToPath(points)
  const gradId = isMorphMode ? GRAD_MORPH_ID : GRAD_ACTIVE_ID
  const strokeColor = active ? `url(#${gradId})` : C_BORDER
  const strokeWidth = active ? 1.5 : 1

  return (
    <g key={key}>
      {/* Base wire — always visible at low opacity */}
      <path
        d={path}
        fill="none"
        stroke={active ? (isMorphMode ? C_PURPLE : C_LINK) : C_BORDER}
        strokeWidth={strokeWidth}
        strokeOpacity={active ? 0.18 : 0.6}
        strokeDasharray={dashed ? '5 4' : undefined}
      />
      {/* Animated gradient sweep — only on active paths */}
      {active && (
        <path
          d={path}
          fill="none"
          stroke={strokeColor}
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={dashed ? '5 4' : undefined}
          className="juce-grid-page__routing-wire-sweep"
        />
      )}
    </g>
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

/**
 * Terminal nodes — purely typographic bookends with a horizontal rule on each side.
 * No box, no border, no fill. Just label + flanking rules.
 */
function renderTerminal(
  terminal: { id: JuceGridRoutingMarkerId; x: number; y: number; label: string; active?: boolean },
  onMarkerSelect: ((markerId: JuceGridRoutingMarkerId) => void) | undefined,
  key: string,
) {
  const labelWidth = terminal.label.length * 7 + 8
  const ruleLen = 22
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
      {/* Left rule */}
      <line
        x1={terminal.x - labelWidth / 2 - ruleLen - 4}
        y1={terminal.y}
        x2={terminal.x - labelWidth / 2 - 4}
        y2={terminal.y}
        stroke={terminal.active ? C_LINK : C_BORDER_STRONG}
        strokeWidth={1}
      />
      {/* Right rule */}
      <line
        x1={terminal.x + labelWidth / 2 + 4}
        y1={terminal.y}
        x2={terminal.x + labelWidth / 2 + ruleLen + 4}
        y2={terminal.y}
        stroke={terminal.active ? C_LINK : C_BORDER_STRONG}
        strokeWidth={1}
      />
      <text
        x={terminal.x}
        y={terminal.y + 4}
        textAnchor="middle"
        className="juce-grid-page__routing-terminal-label"
      >
        {terminal.label}
      </text>
    </g>
  )
}

/**
 * Marker chips — small pill labels for topology points (Series, Split, Mix, A/B, Morph…).
 * Active markers use link/purple accent; inactive use layer background.
 */
function renderMarker(
  marker: { id: JuceGridRoutingMarkerId; x: number; y: number; label: string; active?: boolean },
  onMarkerSelect: ((markerId: JuceGridRoutingMarkerId) => void) | undefined,
  key: string,
) {
  const width = Math.max(48, marker.label.length * 8 + 20)
  const isMorphMarker = marker.id === 'morph'
  const accentColor = isMorphMarker ? C_PURPLE : C_LINK
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
        y={marker.y - 11}
        width={width}
        height={22}
        rx={0}
        fill={marker.active ? C_LAYER : C_BACKGROUND}
        stroke={marker.active ? accentColor : C_BORDER}
        strokeWidth={1}
      />
      <text x={marker.x} y={marker.y + 4} textAnchor="middle" className="juce-grid-page__routing-marker-label">
        {marker.label}
      </text>
    </g>
  )
}

/**
 * Morph block — sharp-edged processor node with purple accent and animated progress bar.
 * Distinct from flow nodes: uses C_PURPLE throughout.
 */
function renderMorphBlock(progress: number, x: number, y: number, compact: boolean) {
  const width = compact ? 60 : 72
  const height = compact ? 40 : 48
  const clamped = Math.max(0, Math.min(1, progress))
  const progressBarW = (width - 8) * clamped
  const percentLabel = `${Math.round(clamped * 100)}%`

  return (
    <g>
      {/* Sharp-edge box with purple left accent stripe */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={0}
        fill={C_LAYER}
        stroke={C_PURPLE}
        strokeWidth={1}
      />
      {/* Left accent stripe — 3px, purple */}
      <rect x={x} y={y} width={3} height={height} fill={C_PURPLE} />
      {/* Labels */}
      <text x={x + width / 2 + 2} y={y + (compact ? 16 : 19)} textAnchor="middle" className="juce-grid-page__routing-morph-label">
        Morph
      </text>
      <text x={x + width / 2 + 2} y={y + (compact ? 29 : 33)} textAnchor="middle" className="juce-grid-page__routing-morph-value">
        {percentLabel}
      </text>
      {/* Animated progress bar track */}
      <rect x={x + 4} y={y + height - 6} width={width - 8} height={3} rx={0} fill={C_BORDER} />
      {/* Animated progress bar fill */}
      {progressBarW > 0 && (
        <rect
          x={x + 4}
          y={y + height - 6}
          width={progressBarW}
          height={3}
          rx={0}
          fill={C_PURPLE}
          className="juce-grid-page__routing-morph-progress"
        />
      )}
    </g>
  )
}

/**
 * Flow node — Carbon sharp-edge style.
 * Sharp rectangle, no border-radius, colored left-border stripe using --flow-color (slot accent).
 * Badge circle preserved for letter identity; node body is layer background.
 */
function renderFlowNode(flow: DiagramFlowNode, compact: boolean) {
  const badgeR = compact ? 11 : 13
  const badgeCX = flow.x + 20
  const textStartX = flow.x + (compact ? 40 : 44)
  const style = { '--flow-color': flow.color } as CSSProperties
  const stripeW = 3
  const bodyFill = C_LAYER
  const bodyStroke = flow.active ? flow.color : C_BORDER
  const badgeFill = flow.active ? flow.color : toAlphaColor(flow.color, 0.22)

  return (
    <g
      key={flow.id}
      className={`juce-grid-page__routing-node ${flow.active ? 'is-active' : ''}`}
      style={style}
    >
      {/* Node body — sharp, Carbon layer background */}
      <rect
        x={flow.x}
        y={flow.y}
        width={flow.width}
        height={flow.height}
        rx={0}
        fill={bodyFill}
        stroke={bodyStroke}
        strokeWidth={1}
      />
      {/* Left accent stripe — flow's slot color */}
      <rect
        x={flow.x}
        y={flow.y}
        width={stripeW}
        height={flow.height}
        fill={flow.color}
      />
      {/* Letter badge circle */}
      <circle
        cx={badgeCX}
        cy={flow.y + flow.height / 2}
        r={badgeR}
        fill={badgeFill}
        stroke={flow.color}
        strokeWidth={1}
      />
      <text
        x={badgeCX}
        y={flow.y + flow.height / 2 + 4}
        textAnchor="middle"
        className="juce-grid-page__routing-node-letter"
      >
        {flow.label}
      </text>
      {/* Title */}
      <text
        x={textStartX}
        y={flow.y + (compact ? 21 : 24)}
        className="juce-grid-page__routing-node-title"
      >
        {flow.title}
      </text>
      {/* Caption */}
      <text
        x={textStartX}
        y={flow.y + (compact ? 37 : 42)}
        className="juce-grid-page__routing-node-caption"
      >
        {flow.caption}
      </text>
    </g>
  )
}

// ── Wire arrow: Carbon ArrowRight icon rendered as SVG foreignObject ───────────
// Placed at mid-wire for active paths. Note: foreignObject has limited SVG export
// support, so we use a <g transform> with a React SVG icon instead via a wrapper.
// Since ArrowRight from @carbon/icons-react renders as <svg>, we embed it via
// a <g> with translate and use the icon's own SVG output inline.
export function WireArrow({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g transform={`translate(${x - 8}, ${y - 8})`} aria-hidden>
      <ArrowRight size={16} color={color} />
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
