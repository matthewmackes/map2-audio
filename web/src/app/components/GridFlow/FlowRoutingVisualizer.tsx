/**
 * FlowRoutingVisualizer — Premium Signal Flow Topology Diagram
 *
 * Renders an SVG + HTML overlay showing exactly how signal flows between
 * Flow A, B, C, ... in the current routing mode. Adapts to:
 *   • parallel_blend — split ▸ flows side-by-side ▸ mix ▸ output
 *   • series — input ▸ Flow A ▸ Flow B ▸ Flow C ▸ output
 *   • ab_switch — input ▸ [active flow only] ▸ output
 *   • parameter_morph — input ▸ Flow A ──╮ morph ╭── Flow B ▸ output
 *   • sidechain — primary flow + sidechain source indicator
 *
 * Design language: Linear + Figma 2025 + Apple HIG
 *   – 1px hairline paths, subtle animated dashes for signal movement
 *   – Frosted-glass node badges
 *   – Mono 14/16 type scale, SF Mono / Inter weights
 *   – Spacing: 8px grid (multiples of 4/8/12/16/24/32)
 */

import { memo, useMemo } from 'react'

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

type RoutingMode =
  | 'parallel_blend'
  | 'ab_switch'
  | 'series'
  | 'parameter_morph'
  | 'sidechain'

export interface FlowInfo {
  id: string
  label: string
  color: string
  muted: boolean
  active?: boolean          // true when this is the A/B-selected flow
  blendPercent?: number     // 0–100 for parallel blend
}

export interface FlowRoutingVisualizerProps {
  mode: RoutingMode
  flows: FlowInfo[]
  morphProgress?: number    // 0–1 for parameter morph
  activeFlowId?: string | null
  morphSourceId?: string | null
  morphTargetId?: string | null
  compact?: boolean
}

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const BADGE_R = 14          // radius of flow node badge
const NODE_GAP = 56         // horizontal gap between nodes
const ROW_H = 36            // vertical spacing per parallel row
const PAD_X = 48            // horizontal padding from edge to first / last node
const PAD_Y = 20            // vertical padding
const WIRE_COLOR = 'rgba(255,255,255,0.12)'
const WIRE_ACTIVE = 'rgba(255,255,255,0.35)'
const JUNCTION_R = 3

const MODE_LABELS: Record<RoutingMode, string> = {
  parallel_blend: 'Parallel Blend',
  ab_switch: 'A / B Switch',
  series: 'Series',
  parameter_morph: 'Morph',
  sidechain: 'Sidechain',
}

const MODE_DESCRIPTIONS: Record<RoutingMode, string> = {
  parallel_blend: 'All flows process in parallel, then mix to output',
  ab_switch: 'Only the selected flow is active',
  series: 'Signal passes through each flow sequentially',
  parameter_morph: 'Crossfade between two flow parameter sets',
  sidechain: 'Primary flow receives sidechain input from another',
}

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────

export const FlowRoutingVisualizer = memo(function FlowRoutingVisualizer({
  mode,
  flows,
  morphProgress = 0.5,
  activeFlowId,
  morphSourceId,
  morphTargetId,
  compact = false,
}: FlowRoutingVisualizerProps) {
  const visibleFlows = flows.filter(f => !f.muted)

  // Compute SVG dimensions based on mode + flow count
  const dims = useMemo(() => {
    const count = visibleFlows.length
    if (mode === 'series') {
      const w = PAD_X * 2 + (count + 1) * NODE_GAP + count * BADGE_R * 2
      return { w: Math.max(w, 320), h: compact ? 52 : 64 }
    }
    if (mode === 'parallel_blend') {
      const h = PAD_Y * 2 + count * ROW_H
      return { w: 320, h: Math.max(h, 64) }
    }
    if (mode === 'ab_switch') {
      const h = PAD_Y * 2 + count * ROW_H
      return { w: 280, h: Math.max(h, 64) }
    }
    if (mode === 'parameter_morph') {
      return { w: 320, h: compact ? 56 : 72 }
    }
    // sidechain
    return { w: 280, h: compact ? 72 : 88 }
  }, [mode, visibleFlows.length, compact])

  if (visibleFlows.length === 0) return null

  return (
    <div
      className="flow-routing-viz"
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: dims.w * 1.8,
        margin: '0 auto',
      }}
    >
      {/* Label bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginBottom: compact ? 4 : 8,
      }}>
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.8px',
          color: 'rgba(255,255,255,0.3)',
        }}>
          {MODE_LABELS[mode]}
        </span>
        <span style={{
          fontSize: 12,
          color: 'rgba(255,255,255,0.35)',
          fontStyle: 'italic',
        }}>
          {MODE_DESCRIPTIONS[mode]}
        </span>
      </div>

      {/* SVG canvas */}
      <svg
        viewBox={`0 0 ${dims.w} ${dims.h}`}
        width="100%"
        height={dims.h * 1.8}
        style={{ display: 'block', overflow: 'visible' }}
      >
        <defs>
          {/* Animated dash pattern for active wires */}
          <style>{`
            @keyframes dash-flow {
              to { stroke-dashoffset: -16; }
            }
            .wire-active {
              stroke-dasharray: 4 4;
              animation: dash-flow 0.8s linear infinite;
            }
          `}</style>
          {/* Glow filter */}
          <filter id="flow-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {mode === 'series' && renderSeries(visibleFlows, dims)}
        {mode === 'parallel_blend' && renderParallel(visibleFlows, dims)}
        {mode === 'ab_switch' && renderABSwitch(visibleFlows, dims, activeFlowId)}
        {mode === 'parameter_morph' && renderMorph(visibleFlows, dims, morphProgress, morphSourceId, morphTargetId)}
        {mode === 'sidechain' && renderSidechain(visibleFlows, dims)}
      </svg>
    </div>
  )
})

// ────────────────────────────────────────────────────────────────────────────
// Render helpers — each mode has its own topology
// ────────────────────────────────────────────────────────────────────────────

/** I/O terminal nodes */
function IoNode({ x, y, label, color }: { x: number; y: number; label: string; color: string }) {
  return (
    <g>
      <rect
        x={x - 16} y={y - 10} width={32} height={20} rx={5}
        fill={`${color}18`}
        stroke={`${color}50`}
        strokeWidth={1}
      />
      <text
        x={x} y={y + 3.5}
        textAnchor="middle"
        fontSize={8}
        fontWeight={700}
        fontFamily="Inter, system-ui, sans-serif"
        letterSpacing="0.5"
        fill={color}
      >
        {label}
      </text>
    </g>
  )
}

/** Flow badge node (circle with letter) */
function FlowNode({ x, y, flow, active = true, scale = 1 }: { x: number; y: number; flow: FlowInfo; active?: boolean; scale?: number }) {
  const r = BADGE_R * scale
  const opacity = active ? 1 : 0.35
  return (
    <g opacity={opacity}>
      {/* Glow ring for active */}
      {active && (
        <circle cx={x} cy={y} r={r + 4} fill="none" stroke={flow.color} strokeWidth={1} opacity={0.15} />
      )}
      {/* Badge background */}
      <circle
        cx={x} cy={y} r={r}
        fill={`${flow.color}20`}
        stroke={flow.color}
        strokeWidth={1.5}
      />
      {/* Letter */}
      <text
        x={x} y={y + 4 * scale}
        textAnchor="middle"
        fontSize={11 * scale}
        fontWeight={800}
        fontFamily="Inter, system-ui, sans-serif"
        fill={flow.color}
      >
        {flow.label}
      </text>
    </g>
  )
}

/** Wire line */
function Wire({ x1, y1, x2, y2, color = WIRE_COLOR, active = false, dashed = false }: {
  x1: number; y1: number; x2: number; y2: number; color?: string; active?: boolean; dashed?: boolean
}) {
  return (
    <line
      x1={x1} y1={y1} x2={x2} y2={y2}
      stroke={active ? color : WIRE_COLOR}
      strokeWidth={active ? 1.5 : 1}
      strokeLinecap="round"
      className={active ? 'wire-active' : ''}
      opacity={active ? 0.8 : 0.5}
    />
  )
}

/** Curved wire (bezier) */
function CurvedWire({ x1, y1, x2, y2, color = WIRE_COLOR, active = false }: {
  x1: number; y1: number; x2: number; y2: number; color?: string; active?: boolean
}) {
  const mx = (x1 + x2) / 2
  return (
    <path
      d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
      fill="none"
      stroke={active ? color : WIRE_COLOR}
      strokeWidth={active ? 1.5 : 1}
      strokeLinecap="round"
      className={active ? 'wire-active' : ''}
      opacity={active ? 0.8 : 0.5}
    />
  )
}

/** Junction dot */
function Junction({ x, y, color = WIRE_ACTIVE }: { x: number; y: number; color?: string }) {
  return <circle cx={x} cy={y} r={JUNCTION_R} fill={color} opacity={0.6} />
}

// ── Series ──────────────────────────────────────────────────────────────────

function renderSeries(flows: FlowInfo[], dims: { w: number; h: number }) {
  const cy = dims.h / 2
  const totalNodes = flows.length + 2 // IN + flows + OUT
  const step = (dims.w - PAD_X * 2) / (totalNodes - 1)
  const inX = PAD_X
  const outX = dims.w - PAD_X

  return (
    <g>
      {/* Wires */}
      {flows.map((flow, i) => {
        const prevX = i === 0 ? inX : PAD_X + (i) * step
        const currX = PAD_X + (i + 1) * step
        return <Wire key={`w-${i}`} x1={prevX + (i === 0 ? 18 : BADGE_R + 4)} y1={cy} x2={currX - BADGE_R - 4} y2={cy} color={flow.color} active />
      })}
      {/* Last wire to OUT */}
      <Wire
        x1={PAD_X + flows.length * step + BADGE_R + 4} y1={cy}
        x2={outX - 18} y2={cy}
        color={flows[flows.length - 1]?.color || WIRE_ACTIVE} active
      />

      {/* IN terminal */}
      <IoNode x={inX} y={cy} label="IN" color="#22c55e" />

      {/* Flow nodes */}
      {flows.map((flow, i) => (
        <FlowNode key={flow.id} x={PAD_X + (i + 1) * step} y={cy} flow={flow} />
      ))}

      {/* OUT terminal */}
      <IoNode x={outX} y={cy} label="OUT" color="#a855f7" />

      {/* Arrow chevrons between nodes */}
      {flows.map((_, i) => {
        const x = PAD_X + (i + 1) * step - BADGE_R - 14
        return (
          <text key={`arr-${i}`} x={x} y={cy + 3} fontSize={8} fill="rgba(255,255,255,0.2)" textAnchor="middle" fontFamily="Inter, system-ui">›</text>
        )
      })}
    </g>
  )
}

// ── Parallel Blend ──────────────────────────────────────────────────────────

function renderParallel(flows: FlowInfo[], dims: { w: number; h: number }) {
  const inX = PAD_X
  const outX = dims.w - PAD_X
  const splitX = inX + 44
  const mergeX = outX - 44
  const centerX = dims.w / 2

  return (
    <g>
      {/* IN node */}
      <IoNode x={inX} y={dims.h / 2} label="IN" color="#22c55e" />

      {/* Split junction */}
      <Junction x={splitX} y={dims.h / 2} color="#22c55e" />

      {/* Wire IN → split */}
      <Wire x1={inX + 18} y1={dims.h / 2} x2={splitX - JUNCTION_R} y2={dims.h / 2} color="#22c55e" active />

      {/* Per-flow parallel paths */}
      {flows.map((flow, i) => {
        const rowY = PAD_Y + i * ROW_H + ROW_H / 2
        return (
          <g key={flow.id}>
            {/* Split → flow */}
            <CurvedWire x1={splitX} y1={dims.h / 2} x2={centerX - BADGE_R - 6} y2={rowY} color={flow.color} active />
            {/* Flow → merge */}
            <CurvedWire x1={centerX + BADGE_R + 6} y1={rowY} x2={mergeX} y2={dims.h / 2} color={flow.color} active />
            {/* Flow node */}
            <FlowNode x={centerX} y={rowY} flow={flow} />
          </g>
        )
      })}

      {/* Merge junction */}
      <Junction x={mergeX} y={dims.h / 2} color="#a855f7" />

      {/* Merge → OUT */}
      <Wire x1={mergeX + JUNCTION_R} y1={dims.h / 2} x2={outX - 18} y2={dims.h / 2} color="#a855f7" active />

      {/* OUT node */}
      <IoNode x={outX} y={dims.h / 2} label="OUT" color="#a855f7" />

      {/* Mix label */}
      <text
        x={mergeX} y={dims.h / 2 + 18}
        textAnchor="middle"
        fontSize={7}
        fontWeight={600}
        fill="rgba(255,255,255,0.25)"
        fontFamily="Inter, system-ui"
        letterSpacing="0.3"
      >
        MIX
      </text>
    </g>
  )
}

// ── A/B Switch ──────────────────────────────────────────────────────────────

function renderABSwitch(flows: FlowInfo[], dims: { w: number; h: number }, activeFlowId?: string | null) {
  const inX = PAD_X
  const outX = dims.w - PAD_X
  const splitX = inX + 44
  const mergeX = outX - 44
  const centerX = dims.w / 2

  return (
    <g>
      <IoNode x={inX} y={dims.h / 2} label="IN" color="#22c55e" />
      <Junction x={splitX} y={dims.h / 2} color="#22c55e" />
      <Wire x1={inX + 18} y1={dims.h / 2} x2={splitX - JUNCTION_R} y2={dims.h / 2} color="#22c55e" active />

      {flows.map((flow, i) => {
        const rowY = PAD_Y + i * ROW_H + ROW_H / 2
        const isActive = flow.id === activeFlowId
        return (
          <g key={flow.id}>
            <CurvedWire x1={splitX} y1={dims.h / 2} x2={centerX - BADGE_R - 6} y2={rowY} color={flow.color} active={isActive} />
            <CurvedWire x1={centerX + BADGE_R + 6} y1={rowY} x2={mergeX} y2={dims.h / 2} color={flow.color} active={isActive} />
            <FlowNode x={centerX} y={rowY} flow={flow} active={isActive} />
          </g>
        )
      })}

      <Junction x={mergeX} y={dims.h / 2} color="#a855f7" />
      <Wire x1={mergeX + JUNCTION_R} y1={dims.h / 2} x2={outX - 18} y2={dims.h / 2} color="#a855f7" active />
      <IoNode x={outX} y={dims.h / 2} label="OUT" color="#a855f7" />
    </g>
  )
}

// ── Parameter Morph ─────────────────────────────────────────────────────────

function renderMorph(
  flows: FlowInfo[],
  dims: { w: number; h: number },
  morphProgress: number,
  morphSourceId?: string | null,
  morphTargetId?: string | null,
) {
  const cy = dims.h / 2
  const inX = PAD_X
  const outX = dims.w - PAD_X
  const srcFlow = flows.find(f => f.id === morphSourceId) || flows[0]
  const tgtFlow = flows.find(f => f.id === morphTargetId) || flows[1]

  if (!srcFlow || !tgtFlow) return null

  const srcX = inX + 68
  const tgtX = inX + 68
  const srcY = cy - 14
  const tgtY = cy + 14
  const morphX = dims.w / 2 + 20
  const morphW = 40

  // Morph indicator bar position
  const barFill = morphProgress

  return (
    <g>
      <IoNode x={inX} y={cy} label="IN" color="#22c55e" />

      {/* IN → split */}
      <Wire x1={inX + 18} y1={cy} x2={srcX - BADGE_R - 6} y2={cy} color="#22c55e" active />

      {/* Source path */}
      <CurvedWire x1={inX + 50} y1={cy} x2={srcX - BADGE_R - 4} y2={srcY} color={srcFlow.color} active />
      <FlowNode x={srcX} y={srcY} flow={srcFlow} scale={0.85} />
      <CurvedWire x1={srcX + BADGE_R + 4} y1={srcY} x2={morphX - 4} y2={cy} color={srcFlow.color} active />

      {/* Target path */}
      <CurvedWire x1={inX + 50} y1={cy} x2={tgtX - BADGE_R - 4} y2={tgtY} color={tgtFlow.color} active />
      <FlowNode x={tgtX} y={tgtY} flow={tgtFlow} scale={0.85} />
      <CurvedWire x1={tgtX + BADGE_R + 4} y1={tgtY} x2={morphX - 4} y2={cy} color={tgtFlow.color} active />

      {/* Morph bar */}
      <rect x={morphX} y={cy - 6} width={morphW} height={12} rx={3} fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)" strokeWidth={0.5} />
      <rect x={morphX + 1} y={cy - 5} width={(morphW - 2) * barFill} height={10} rx={2.5} fill={tgtFlow.color} opacity={0.5} />
      <rect x={morphX + 1} y={cy - 5} width={(morphW - 2) * (1 - barFill)} height={10} rx={2.5} fill={srcFlow.color} opacity={0.3} />
      <text x={morphX + morphW / 2} y={cy + 3} textAnchor="middle" fontSize={7} fontWeight={700} fill="#fff" fontFamily="Inter, system-ui">
        {Math.round(morphProgress * 100)}%
      </text>

      {/* Morph → OUT */}
      <Wire x1={morphX + morphW + 4} y1={cy} x2={outX - 18} y2={cy} color="#a855f7" active />

      <IoNode x={outX} y={cy} label="OUT" color="#a855f7" />
    </g>
  )
}

// ── Sidechain ───────────────────────────────────────────────────────────────

function renderSidechain(flows: FlowInfo[], dims: { w: number; h: number }) {
  const cy = dims.h / 2
  const inX = PAD_X
  const outX = dims.w - PAD_X
  const mainFlow = flows[0]
  const scFlow = flows.length > 1 ? flows[1] : null

  if (!mainFlow) return null

  const mainX = dims.w / 2
  const mainY = cy - 8
  const scY = cy + 22

  return (
    <g>
      <IoNode x={inX} y={mainY} label="IN" color="#22c55e" />
      <Wire x1={inX + 18} y1={mainY} x2={mainX - BADGE_R - 6} y2={mainY} color={mainFlow.color} active />
      <FlowNode x={mainX} y={mainY} flow={mainFlow} />
      <Wire x1={mainX + BADGE_R + 6} y1={mainY} x2={outX - 18} y2={mainY} color={mainFlow.color} active />
      <IoNode x={outX} y={mainY} label="OUT" color="#a855f7" />

      {scFlow && (
        <g>
          {/* SC label */}
          <text x={mainX} y={scY + BADGE_R + 14} textAnchor="middle" fontSize={7} fontWeight={700} fill="rgba(255,255,255,0.25)" fontFamily="Inter, system-ui" letterSpacing="0.5">
            SIDECHAIN
          </text>
          {/* SC node */}
          <FlowNode x={mainX} y={scY} flow={scFlow} scale={0.8} />
          {/* Vertical dashed line SC → main */}
          <line
            x1={mainX} y1={scY - BADGE_R * 0.8 - 2}
            x2={mainX} y2={mainY + BADGE_R + 3}
            stroke={scFlow.color}
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.5}
          />
          {/* Arrow head */}
          <polygon
            points={`${mainX - 3},${mainY + BADGE_R + 6} ${mainX + 3},${mainY + BADGE_R + 6} ${mainX},${mainY + BADGE_R + 2}`}
            fill={scFlow.color}
            opacity={0.5}
          />
        </g>
      )}
    </g>
  )
}

export default FlowRoutingVisualizer
