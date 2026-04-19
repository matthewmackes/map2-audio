import { Layer, Tag } from '@carbon/react'
import { useEffect, useRef } from 'react'
import type { MaschineLcdBitmap } from '../../../map2/types'

const SCALE = 3
const LCD_WIDTH = 255
const LCD_HEIGHT = 64

function drawBitmap(canvas: HTMLCanvasElement, bitmap: MaschineLcdBitmap | null) {
  const context = canvas.getContext('2d')
  if (!context) return

  const width = bitmap?.width ?? LCD_WIDTH
  const height = bitmap?.height ?? LCD_HEIGHT
  canvas.width = width
  canvas.height = height
  canvas.style.width = `${width * SCALE}px`
  canvas.style.height = `${height * SCALE}px`

  context.fillStyle = '#1a1a2e'
  context.fillRect(0, 0, width, height)

  if (!bitmap?.data) return

  const bytes = new Uint8Array(
    (bitmap.data.match(/.{1,2}/g) ?? []).map((chunk) => Number.parseInt(chunk, 16) || 0),
  )

  for (let y = 0; y < height; y += 1) {
    for (let xByte = 0; xByte < Math.ceil(width / 8); xByte += 1) {
      const byte = bytes[y * Math.ceil(width / 8) + xByte] ?? 0
      for (let bit = 0; bit < 8; bit += 1) {
        if ((byte & (1 << bit)) === 0) continue
        const x = xByte * 8 + bit
        if (x < width) {
          context.fillStyle = '#42be65'
          context.fillRect(x, y, 1, 1)
        }
      }
    }
  }
}

function CanvasDisplay({
  label,
  bitmap,
}: {
  label: string
  bitmap: MaschineLcdBitmap | null
}) {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (ref.current) {
        drawBitmap(ref.current, bitmap)
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [bitmap])

  return (
    <div className="maschine-page__lcd-display">
      <div className="maschine-page__lcd-label-row">
        <Tag type="green">{label}</Tag>
        <span>{bitmap?.source ?? 'render cache'}</span>
      </div>
      <canvas ref={ref} className="maschine-page__lcd-canvas" />
    </div>
  )
}

export function MaschineLcdSimulatorPanel({
  left,
  right,
}: {
  left: MaschineLcdBitmap | null
  right: MaschineLcdBitmap | null
}) {
  return (
    <Layer className="maschine-page__panel" data-testid="maschine-lcd-simulator-panel">
      <div className="maschine-page__panel-head">
        <h2>LCD Simulator</h2>
        <Tag type="cool-gray">255×64 5bpp @ 3x</Tag>
      </div>
      <div className="maschine-page__lcd-grid">
        <CanvasDisplay label="LEFT DISPLAY" bitmap={left} />
        <CanvasDisplay label="RIGHT DISPLAY" bitmap={right} />
      </div>
    </Layer>
  )
}

export default MaschineLcdSimulatorPanel
