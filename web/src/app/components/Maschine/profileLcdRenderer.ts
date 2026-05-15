// T2522-B cycle 13 — Profile DSL → 255×64 LCD pixel renderer.
//
// Each of the 5 canonical templates from `profileDsl.ts` gets a
// dedicated renderer here. The renderer paints the spec into a
// 255×64 canvas that exactly matches the cabl-protocol LCD frame
// shape. Cycle 14 deepens this with the actual T700 profile catalog;
// the engine itself is feature-complete after this cycle.
//
// Design notes:
//   • All renderers paint into a 2D canvas at native resolution
//     (255×64). Callers can scale the canvas via CSS for visibility;
//     pixel art stays crisp via `image-rendering: pixelated`.
//   • The chosen palette mirrors the cabl device: dark navy
//     background (`#0b1020`), green primary text (`#42be65`), cyan
//     accent for breadcrumbs/headers (`#33b1ff`). This matches the
//     existing LCD simulator panel colors so what an operator sees
//     in the workbench preview is what they'll see on the device.
//   • The 3-block layout (top 12px / canvas 40px / bottom 12px) is
//     enforced by the engine, not by individual renderers — a
//     template only paints into the canvas band; top/bottom always
//     use the same breadcrumb/monitor strip renderer.

import type {
  MaschineProfile,
  ProfileLcdSpec,
  ProfileLcdTemplate,
} from './profileDsl'

export const LCD_WIDTH = 255
export const LCD_HEIGHT = 64
export const TOP_BAND_H = 12
export const BOTTOM_BAND_H = 12
export const CANVAS_BAND_H = LCD_HEIGHT - TOP_BAND_H - BOTTOM_BAND_H
export const CANVAS_BAND_Y = TOP_BAND_H

const COLOR_BG = '#0b1020'
const COLOR_BAND = '#0f172a'
const COLOR_BAND_TEXT = '#33b1ff'
const COLOR_PRIMARY = '#42be65'
const COLOR_DIM = '#94a3b8'
const COLOR_ACCENT = '#ff7eb6'

const FONT_TINY = '8px monospace'
const FONT_SMALL = '9px monospace'
const FONT_MEDIUM = '12px monospace'
const FONT_HUGE = '32px monospace'

function clearLcd(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = COLOR_BG
  ctx.fillRect(0, 0, LCD_WIDTH, LCD_HEIGHT)
}

function paintTopBand(ctx: CanvasRenderingContext2D, text: string | undefined): void {
  ctx.fillStyle = COLOR_BAND
  ctx.fillRect(0, 0, LCD_WIDTH, TOP_BAND_H)
  if (!text) return
  ctx.fillStyle = COLOR_BAND_TEXT
  ctx.font = FONT_TINY
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 4, TOP_BAND_H / 2 + 1)
}

function paintBottomBand(ctx: CanvasRenderingContext2D, text: string | undefined): void {
  const y = LCD_HEIGHT - BOTTOM_BAND_H
  ctx.fillStyle = COLOR_BAND
  ctx.fillRect(0, y, LCD_WIDTH, BOTTOM_BAND_H)
  if (!text) return
  ctx.fillStyle = COLOR_DIM
  ctx.font = FONT_TINY
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 4, y + BOTTOM_BAND_H / 2 + 1)
}

interface ParamListRow {
  label: string
  value: string | number
}

function renderParamList(
  ctx: CanvasRenderingContext2D,
  data: { columns?: number; rows?: number; entries?: ParamListRow[] } | undefined,
): void {
  const columns = Math.max(1, Math.min(4, data?.columns ?? 2))
  const rows = Math.max(1, Math.min(4, data?.rows ?? 4))
  const entries = data?.entries ?? []
  const colW = LCD_WIDTH / columns
  const rowH = CANVAS_BAND_H / rows
  ctx.font = FONT_SMALL
  ctx.textBaseline = 'top'
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < columns; c += 1) {
      const idx = r * columns + c
      const entry = entries[idx]
      const x = c * colW + 3
      const y = CANVAS_BAND_Y + r * rowH + 2
      if (entry) {
        ctx.fillStyle = COLOR_DIM
        ctx.fillText(entry.label, x, y)
        ctx.fillStyle = COLOR_PRIMARY
        ctx.fillText(String(entry.value), x, y + 9)
      } else {
        ctx.fillStyle = '#1f2937'
        ctx.fillText(`${idx + 1}.`, x, y)
      }
    }
  }
}

function renderBigValue(
  ctx: CanvasRenderingContext2D,
  data: {
    value?: string | number
    range?: [number, number]
    size?: 'normal' | 'huge'
  } | undefined,
): void {
  const value = data?.value
  if (typeof value === 'number' && data?.range) {
    // Horizontal bar with center tick (used for tuner cents).
    const [lo, hi] = data.range
    const width = LCD_WIDTH - 12
    const x0 = 6
    const y = CANVAS_BAND_Y + CANVAS_BAND_H / 2 - 4
    ctx.fillStyle = '#1f2937'
    ctx.fillRect(x0, y, width, 8)
    const ratio = (value - lo) / (hi - lo)
    const px = x0 + Math.max(0, Math.min(1, ratio)) * width
    ctx.fillStyle = COLOR_PRIMARY
    ctx.fillRect(px - 1, y - 2, 3, 12)
    ctx.fillStyle = COLOR_DIM
    ctx.font = FONT_TINY
    ctx.textBaseline = 'top'
    ctx.fillText(String(lo), x0, y + 11)
    const hiLabel = String(hi)
    ctx.fillText(hiLabel, x0 + width - hiLabel.length * 5, y + 11)
    return
  }
  // Big text (used for tuner note name).
  ctx.fillStyle = COLOR_PRIMARY
  ctx.font = data?.size === 'huge' ? FONT_HUGE : FONT_MEDIUM
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  const text = String(value ?? '—')
  ctx.fillText(text, LCD_WIDTH / 2, CANVAS_BAND_Y + CANVAS_BAND_H / 2)
  ctx.textAlign = 'start'
}

function renderKitGrid(
  ctx: CanvasRenderingContext2D,
  data: { rows?: number; cols?: number; cells?: { label: string; lit?: boolean }[] } | undefined,
): void {
  const rows = data?.rows ?? 4
  const cols = data?.cols ?? 4
  const cellW = LCD_WIDTH / cols
  const cellH = CANVAS_BAND_H / rows
  const cells = data?.cells ?? []
  ctx.font = FONT_TINY
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const idx = r * cols + c
      const x = c * cellW + 1
      const y = CANVAS_BAND_Y + r * cellH + 1
      const cell = cells[idx]
      const lit = cell?.lit ?? false
      ctx.fillStyle = lit ? COLOR_PRIMARY : '#1f2937'
      ctx.fillRect(x, y, cellW - 2, cellH - 2)
      ctx.fillStyle = lit ? COLOR_BG : COLOR_DIM
      const label = cell?.label ?? `${idx + 1}`
      ctx.fillText(label.slice(0, 6), x + cellW / 2 - 1, y + cellH / 2)
    }
  }
  ctx.textAlign = 'start'
}

function renderSignalFlow(
  ctx: CanvasRenderingContext2D,
  data: { blocks?: { label: string; bypassed?: boolean }[] } | undefined,
): void {
  const blocks = data?.blocks ?? []
  if (blocks.length === 0) {
    ctx.fillStyle = COLOR_DIM
    ctx.font = FONT_SMALL
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.fillText('(no signal-flow blocks)', LCD_WIDTH / 2, CANVAS_BAND_Y + CANVAS_BAND_H / 2)
    ctx.textAlign = 'start'
    return
  }
  const blockW = (LCD_WIDTH - 8) / blocks.length
  const blockH = CANVAS_BAND_H - 8
  const y = CANVAS_BAND_Y + 4
  ctx.font = FONT_TINY
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  blocks.forEach((block, i) => {
    const x = 4 + i * blockW
    ctx.fillStyle = block.bypassed ? '#1f2937' : COLOR_PRIMARY
    ctx.fillRect(x + 2, y, blockW - 6, blockH)
    ctx.fillStyle = block.bypassed ? COLOR_DIM : COLOR_BG
    ctx.fillText(block.label.slice(0, 8), x + blockW / 2, y + blockH / 2)
    if (i < blocks.length - 1) {
      ctx.strokeStyle = COLOR_DIM
      ctx.beginPath()
      ctx.moveTo(x + blockW - 4, y + blockH / 2)
      ctx.lineTo(x + blockW + 0, y + blockH / 2)
      ctx.stroke()
    }
  })
  ctx.textAlign = 'start'
}

function renderConsole(
  ctx: CanvasRenderingContext2D,
  data: { lines?: string[] } | undefined,
): void {
  const lines = data?.lines ?? []
  ctx.font = FONT_TINY
  ctx.textBaseline = 'top'
  ctx.fillStyle = COLOR_PRIMARY
  const lineH = 9
  const maxLines = Math.floor(CANVAS_BAND_H / lineH)
  for (let i = 0; i < Math.min(lines.length, maxLines); i += 1) {
    ctx.fillText(lines[i].slice(0, 42), 4, CANVAS_BAND_Y + 1 + i * lineH)
  }
  if (lines.length === 0) {
    ctx.fillStyle = COLOR_DIM
    ctx.fillText('(empty console)', 4, CANVAS_BAND_Y + 4)
  }
}

const TEMPLATE_RENDERERS: Record<
  ProfileLcdTemplate,
  (ctx: CanvasRenderingContext2D, data: Record<string, unknown> | undefined) => void
> = {
  'param-list': (ctx, data) => renderParamList(ctx, data as never),
  'big-value': (ctx, data) => renderBigValue(ctx, data as never),
  'kit-grid': (ctx, data) => renderKitGrid(ctx, data as never),
  'signal-flow': (ctx, data) => renderSignalFlow(ctx, data as never),
  console: (ctx, data) => renderConsole(ctx, data as never),
}

/**
 * Paint a single ProfileLcdSpec into a 2D canvas context. The
 * caller supplies a canvas already sized to LCD_WIDTH × LCD_HEIGHT
 * native pixels.
 */
export function renderLcdSpec(ctx: CanvasRenderingContext2D, spec: ProfileLcdSpec): void {
  clearLcd(ctx)
  paintTopBand(ctx, spec.blocks.top?.text)
  paintBottomBand(ctx, spec.blocks.bottom?.text)
  // Faint accent line on the bottom band (cycle 13 polish).
  ctx.fillStyle = COLOR_ACCENT
  ctx.globalAlpha = 0.25
  ctx.fillRect(0, LCD_HEIGHT - BOTTOM_BAND_H, LCD_WIDTH, 1)
  ctx.globalAlpha = 1
  // Render the canvas band per template.
  const renderer = TEMPLATE_RENDERERS[spec.template]
  renderer(ctx, spec.blocks.canvas.data)
}

/** Convenience: paint both LCDs of a profile into a pair of canvases. */
export function renderProfileLcds(
  leftCtx: CanvasRenderingContext2D | null,
  rightCtx: CanvasRenderingContext2D | null,
  profile: MaschineProfile,
): void {
  if (leftCtx) renderLcdSpec(leftCtx, profile.lcd_left)
  if (rightCtx) renderLcdSpec(rightCtx, profile.lcd_right)
}
