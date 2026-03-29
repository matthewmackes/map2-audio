import React, { useLayoutEffect, useRef, useState } from 'react'

import type { PatchCord } from './mpx1FlowRouting'

interface MPX1FlowPatchCordsProps {
  cords: PatchCord[]
  nodeRefs: Record<string, React.RefObject<HTMLElement | null>>
  canvasRef: React.RefObject<HTMLDivElement | null>
}

interface RenderedCord {
  id: string
  d: string
  color: string
  dashed: boolean
  animated: boolean
}

function buildBezierPath(
  fromEl: HTMLElement,
  toEl: HTMLElement,
  canvasEl: HTMLElement,
  isLowerBranch: boolean,
): string {
  const canvasRect = canvasEl.getBoundingClientRect()
  const fromRect = fromEl.getBoundingClientRect()
  const toRect = toEl.getBoundingClientRect()

  // Exit from right-center of source, enter at left-center of destination
  const x1 = fromRect.right - canvasRect.left
  const y1 = fromRect.top + fromRect.height / 2 - canvasRect.top
  const x2 = toRect.left - canvasRect.left
  const y2 = toRect.top + toRect.height / 2 - canvasRect.top

  const dx = Math.abs(x2 - x1)
  const cpOffset = Math.min(90, dx * 0.45)

  // Add a small vertical curve bias for lower-branch cords to make Y-junctions visible
  const vertBias = isLowerBranch ? 18 : 0

  return [
    `M ${x1.toFixed(1)} ${y1.toFixed(1)}`,
    `C ${(x1 + cpOffset).toFixed(1)} ${(y1 + vertBias).toFixed(1)},`,
    `  ${(x2 - cpOffset).toFixed(1)} ${(y2 + vertBias).toFixed(1)},`,
    `  ${x2.toFixed(1)} ${y2.toFixed(1)}`,
  ].join(' ')
}

export function MPX1FlowPatchCords({ cords, nodeRefs, canvasRef }: MPX1FlowPatchCordsProps) {
  const [rendered, setRendered] = useState<RenderedCord[]>([])
  const [svgSize, setSvgSize] = useState({ w: 1200, h: 400 })

  // Use a ref to hold the compute function so useLayoutEffect can always call latest version
  const computeRef = useRef<() => void>(() => {})

  computeRef.current = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const newW = canvas.scrollWidth
    const newH = canvas.scrollHeight
    // Functional updater: return prev reference if unchanged → React skips re-render
    setSvgSize((prev) =>
      prev.w === newW && prev.h === newH ? prev : { w: newW, h: newH },
    )

    const paths: RenderedCord[] = []
    for (const cord of cords) {
      const fromEl = nodeRefs[cord.fromKey]?.current
      const toEl = nodeRefs[cord.toKey]?.current
      if (!fromEl || !toEl) continue

      try {
        const d = buildBezierPath(fromEl, toEl, canvas, cord.isLowerBranch)
        paths.push({
          id: cord.id,
          d,
          color: cord.color,
          dashed: cord.dashed,
          animated: cord.animated,
        })
      } catch {
        // skip malformed rects
      }
    }

    // Use a string signature to detect changes — prevents infinite setState loops
    // from the no-dep useLayoutEffect below.
    const sig = paths.map((p) => `${p.id}|${p.d}`).join(';')
    setRendered((prev) => {
      const prevSig = prev.map((p) => `${p.id}|${p.d}`).join(';')
      return prevSig === sig ? prev : paths
    })
  }

  // Recompute after every render so cord positions track DOM layout changes
  // (e.g. zoom/pan transforms).  The equality checks inside computeRef.current
  // ensure setState is a no-op when nothing has actually moved, which stops
  // the otherwise-infinite update cycle.
  useLayoutEffect(() => {
    computeRef.current()
  })

  // Also recompute when canvas is resized
  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(() => computeRef.current())
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [canvasRef])

  if (rendered.length === 0) return null

  return (
    <svg
      className="mpx1-flow__patch-svg"
      width={svgSize.w}
      height={svgSize.h}
      aria-hidden
    >
      <defs>
        <style>{`
          @keyframes mpx1-cord-flow {
            from { stroke-dashoffset: 22; }
            to   { stroke-dashoffset: 0; }
          }
        `}</style>
      </defs>

      {rendered.map((cord) => (
        <path
          key={cord.id}
          d={cord.d}
          stroke={cord.dashed ? '#334155' : cord.color}
          strokeWidth={cord.dashed ? 1.5 : 2}
          fill="none"
          strokeDasharray={
            cord.dashed ? '5 5' : cord.animated ? '14 8' : undefined
          }
          strokeLinecap="round"
          opacity={cord.dashed ? 0.4 : 0.7}
          style={
            cord.animated
              ? { animation: 'mpx1-cord-flow 1.2s linear infinite' }
              : undefined
          }
        />
      ))}
    </svg>
  )
}

export default MPX1FlowPatchCords
