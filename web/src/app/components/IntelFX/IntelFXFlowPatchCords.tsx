import { useLayoutEffect, useRef, useState } from 'react'

import type { IntelFXPatchCord } from './intelfxFlowRouting'

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
): string {
  const canvasRect = canvasEl.getBoundingClientRect()
  const fromRect = fromEl.getBoundingClientRect()
  const toRect = toEl.getBoundingClientRect()

  const x1 = fromRect.right - canvasRect.left
  const y1 = fromRect.top + fromRect.height / 2 - canvasRect.top
  const x2 = toRect.left - canvasRect.left
  const y2 = toRect.top + toRect.height / 2 - canvasRect.top

  const dx = Math.abs(x2 - x1)
  const dy = Math.abs(y2 - y1)

  if (dy > 40) {
    const cpX = Math.min(90, dx * 0.45)
    const cpY = dy * 0.35
    return [
      `M ${x1.toFixed(1)} ${y1.toFixed(1)}`,
      `C ${(x1 + cpX).toFixed(1)} ${(y1 + cpY).toFixed(1)},`,
      `  ${(x2 - cpX).toFixed(1)} ${(y2 - cpY).toFixed(1)},`,
      `  ${x2.toFixed(1)} ${y2.toFixed(1)}`,
    ].join(' ')
  }

  const cpOffset = Math.min(90, dx * 0.45)
  return [
    `M ${x1.toFixed(1)} ${y1.toFixed(1)}`,
    `C ${(x1 + cpOffset).toFixed(1)} ${y1.toFixed(1)},`,
    `  ${(x2 - cpOffset).toFixed(1)} ${y2.toFixed(1)},`,
    `  ${x2.toFixed(1)} ${y2.toFixed(1)}`,
  ].join(' ')
}

interface IntelFXFlowPatchCordsProps {
  cords: IntelFXPatchCord[]
  nodeRefs: Record<string, React.RefObject<HTMLElement | null>>
  canvasRef: React.RefObject<HTMLDivElement | null>
}

export function IntelFXFlowPatchCords({ cords, nodeRefs, canvasRef }: IntelFXFlowPatchCordsProps) {
  const [rendered, setRendered] = useState<RenderedCord[]>([])
  const [svgSize, setSvgSize] = useState({ w: 1200, h: 400 })

  const computeRef = useRef<() => void>(() => {})

  computeRef.current = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const newW = canvas.scrollWidth
    const newH = canvas.scrollHeight
    setSvgSize((prev) => (prev.w === newW && prev.h === newH ? prev : { w: newW, h: newH }))

    const paths: RenderedCord[] = []
    for (const cord of cords) {
      const fromEl = nodeRefs[cord.fromKey]?.current
      const toEl = nodeRefs[cord.toKey]?.current
      if (!fromEl || !toEl) continue

      try {
        const d = buildBezierPath(fromEl, toEl, canvas)
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

    const sig = paths.map((p) => `${p.id}|${p.d}`).join(';')
    setRendered((prev) => {
      const prevSig = prev.map((p) => `${p.id}|${p.d}`).join(';')
      return prevSig === sig ? prev : paths
    })
  }

  useLayoutEffect(() => {
    computeRef.current()
  }, [cords, nodeRefs, canvasRef])

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(() => computeRef.current())
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [canvasRef])

  if (rendered.length === 0) return null

  return (
    <svg className="intelfx-flow__patch-svg" width={svgSize.w} height={svgSize.h} aria-hidden>
      {rendered.map((cord) => (
        <path
          key={cord.id}
          d={cord.d}
          stroke={cord.dashed ? 'var(--cds-icon-secondary, #8d8d8d)' : cord.color}
          strokeWidth={cord.dashed ? 1.5 : 2}
          fill="none"
          strokeDasharray={cord.dashed ? '5 5' : cord.animated ? '14 8' : undefined}
          strokeLinecap="round"
          opacity={cord.dashed ? 0.4 : 0.7}
          style={cord.animated ? { animation: 'intelfx-cord-flow 1.2s linear infinite' } : undefined}
        />
      ))}
    </svg>
  )
}

export default IntelFXFlowPatchCords
