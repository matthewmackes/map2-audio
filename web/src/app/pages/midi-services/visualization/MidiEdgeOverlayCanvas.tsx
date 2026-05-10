/**
 * T2500-MV-D2 — Single canvas overlay for particles + heatmap.
 *
 * Sits absolute-positioned over the SignalFlowGraph wrapper. Reads
 * node positions from React state (the laid-out node array) but
 * never re-renders on event arrival — the rAF loop reads the
 * particle/edge refs directly each frame.
 *
 * Why one big canvas instead of per-edge SVG: 200 edges × 50 particles
 * each = 10 000 draw ops per frame, comfortably within budget when
 * batched into a single canvas. Per-edge React-managed SVG would force
 * a render cycle per particle update, which is the perf trap we
 * explicitly avoid in the locked plan.
 */

import { useEffect, useRef } from 'react'

import {
  edgeKey,
  type MidiVisualizationEdge,
  type MidiVisualizationNode,
} from './midiVisualizationLayout'
import {
  edgeVisualState,
  lerp,
  particleProgress,
  pruneParticles,
  pushParticle,
  type Particle,
  type ParticleLane,
} from './edgeAnimation'
import type { MidiVisualizationEvent } from './midiVisualizationTypes'

export interface MidiEdgeOverlayCanvasProps {
  nodes: MidiVisualizationNode[]
  edges: MidiVisualizationEdge[]
  /** Most recent event ingestion ref — page sets this each rAF. */
  pendingEventsRef: React.MutableRefObject<MidiVisualizationEvent[]>
  intensity: number
}

export function MidiEdgeOverlayCanvas({
  nodes,
  edges,
  pendingEventsRef,
  intensity,
}: MidiEdgeOverlayCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const lanesRef = useRef<ParticleLane>(new Map())
  const intensityRef = useRef(intensity)
  intensityRef.current = intensity

  // Refresh per-render closures when topology changes; the rAF loop
  // reads through these refs to avoid a tear-down/restart cycle.
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const edgesRef = useRef(edges)
  edgesRef.current = edges

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    let raf = 0
    let stopped = false

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect()
      if (!rect) return
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    const ro = new ResizeObserver(resize)
    if (canvas.parentElement) ro.observe(canvas.parentElement)

    const frame = () => {
      if (stopped) return
      const now = performance.now()
      // Drain pending events into particle lanes.
      const pending = pendingEventsRef.current
      if (pending.length > 0) {
        for (const evt of pending) pushParticle(lanesRef.current, evt, now)
        pending.length = 0
      }
      pruneParticles(lanesRef.current, now)

      const w = canvas.clientWidth
      const h = canvas.clientHeight
      ctx.clearRect(0, 0, w, h)

      const positions = computeNodePositions(nodesRef.current)
      drawEdges(ctx, edgesRef.current, positions, intensityRef.current)
      drawParticles(ctx, lanesRef.current, positions, now)

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [pendingEventsRef])

  return (
    <canvas
      ref={canvasRef}
      className="midi-viz-overlay-canvas"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
      }}
      aria-hidden
    />
  )
}

// ---------------------------------------------------------------------
// Drawing helpers (kept inline; no rAF callbacks created per draw)
// ---------------------------------------------------------------------

interface NodePosition {
  cx: number
  cy: number
}

function computeNodePositions(
  nodes: MidiVisualizationNode[],
): Map<string, NodePosition> {
  const out = new Map<string, NodePosition>()
  for (const node of nodes) {
    // ReactFlow's pan/zoom is applied to its inner container; the
    // overlay canvas sits in the same coordinate space as the wrapper,
    // so we compose the same transform via the wrapper's bounding rect.
    // For the v1 we read positions directly — visualization is fine at
    // zoom=1; pan/zoom integration is a follow-up if operators ask
    // for it.
    out.set(node.id, {
      cx: node.position.x + 110,  // half of NODE_SIZE_BY_KIND.device.width
      cy: node.position.y + 42,   // half of NODE_SIZE_BY_KIND.device.height
    })
  }
  return out
}

function drawEdges(
  ctx: CanvasRenderingContext2D,
  edges: MidiVisualizationEdge[],
  positions: Map<string, NodePosition>,
  intensity: number,
): void {
  for (const edge of edges) {
    const a = positions.get(edge.source)
    const b = positions.get(edge.target)
    if (!a || !b) continue
    const visual = edgeVisualState(edge.data, intensity)
    ctx.strokeStyle = `rgba(${visual.color.r}, ${visual.color.g}, ${visual.color.b}, ${visual.color.a})`
    ctx.lineWidth = visual.thickness
    ctx.beginPath()
    ctx.moveTo(a.cx, a.cy)
    ctx.lineTo(b.cx, b.cy)
    ctx.stroke()
  }
}

function drawParticles(
  ctx: CanvasRenderingContext2D,
  lanes: ParticleLane,
  positions: Map<string, NodePosition>,
  now: number,
): void {
  for (const [key, queue] of lanes.entries()) {
    if (queue.length === 0) continue
    const sepIdx = key.indexOf('=>')
    if (sepIdx === -1) continue
    const sourceId = key.slice(0, sepIdx)
    const targetId = key.slice(sepIdx + 2)
    const a = positions.get(sourceId)
    const b = positions.get(targetId)
    if (!a || !b) continue
    for (const p of queue) drawParticle(ctx, p, a, b, now)
  }
}

function drawParticle(
  ctx: CanvasRenderingContext2D,
  particle: Particle,
  a: NodePosition,
  b: NodePosition,
  now: number,
): void {
  const t = particleProgress(particle, now)
  const x = lerp(a.cx, b.cx, t)
  const y = lerp(a.cy, b.cy, t)
  const fade = 1 - t
  ctx.fillStyle = particle.kind === 'raw'
    ? `rgba(15, 98, 254, ${fade})`     // Carbon blue-60
    : `rgba(238, 83, 150, ${fade})`    // Carbon magenta-50
  ctx.beginPath()
  ctx.arc(x, y, 3, 0, Math.PI * 2)
  ctx.fill()
}

export default MidiEdgeOverlayCanvas
