import { Tag, Tile } from '@carbon/react'
import { useEffect, useMemo, useRef } from 'react'

import type {
  MaschineDaemonStatus,
  MaschineEncoderMap,
  MaschineLcdBitmap,
  MaschinePadLedState,
} from '../../../map2/types'

// T2522-A — Hardware Twin v1.
//
// SVG mirror of the NI Maschine MK1 surface. The layout matches the
// physical device: dual 255×64 LCDs at the top center, 11 encoders in
// a row beneath (vol / 1-8 / tempo / swing), 8 group buttons (A-H) on
// the left flank, 16 4×4 pads on the right half. LEDs render with
// brightness mapped from `led_state.led_array` and `led_state.pads`;
// the dual LCDs render the live framebuffer via canvas elements
// composited inside the SVG via foreignObject.
//
// Cycle 3 ships v1: live read-only mirror. Cycle 4 layers in
// hover-to-inspect tooltips and click-to-remap interactions.

// Pad grid geometry (pad index 0 = bottom-left in the cabl protocol;
// the SVG renders 0 at bottom-left, 12 at top-left, 15 at top-right
// to match the physical orientation).
const PAD_COLS = 4
const PAD_ROWS = 4
const PAD_SIZE = 60
const PAD_GAP = 8
const PAD_AREA_X = 360
const PAD_AREA_Y = 200

// Encoder geometry — 11 encoders in a row across the top of the
// device: vol, 1-8, tempo, swing.
const ENCODER_RADIUS = 22
const ENCODER_GAP = 60
const ENCODER_ROW_X = 60
const ENCODER_ROW_Y = 160
const ENCODER_LABELS = ['vol', '1', '2', '3', '4', '5', '6', '7', '8', 'tempo', 'swing'] as const

// Group buttons A-H on the left flank, two columns of 4.
const GROUP_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const
const GROUP_COL_X = 60
const GROUP_ROW_Y = 220
const GROUP_BTN_SIZE = 40
const GROUP_BTN_GAP = 10

// LCD layout: two displays side-by-side, scaled to render legibly
// inside the twin chrome (255×64 → 200×50 visually).
const LCD_DISPLAY_WIDTH = 200
const LCD_DISPLAY_HEIGHT = 50
const LCD_SOURCE_WIDTH = 255
const LCD_SOURCE_HEIGHT = 64
const LCD_LEFT_X = 60
const LCD_RIGHT_X = LCD_LEFT_X + LCD_DISPLAY_WIDTH + 16
const LCD_Y = 60

const SVG_VIEWBOX_WIDTH = 720
const SVG_VIEWBOX_HEIGHT = 520

// Map a cabl pad LED state {state, color} pair to a CSS color. The
// daemon's color enum is sparse; we mirror MaschineLedPreviewPanel's
// palette so the two surfaces agree visually.
const PAD_COLOR_MAP: Record<string, string> = {
  empty: '#1c2030',
  red: '#fa4d56',
  orange: '#ff832b',
  yellow: '#f1c21b',
  green: '#42be65',
  cyan: '#33b1ff',
  blue: '#4589ff',
  magenta: '#ff7eb6',
  white: '#f4f4f4',
}

function padColor(pad: MaschinePadLedState | undefined): string {
  if (!pad) return PAD_COLOR_MAP.empty
  const base = PAD_COLOR_MAP[pad.color] ?? PAD_COLOR_MAP.empty
  if (pad.state === 'off') return PAD_COLOR_MAP.empty
  if (pad.state === 'dim') return base
  // bright state: full saturation; selected: pulsed via CSS class.
  return base
}

function padOpacity(pad: MaschinePadLedState | undefined): number {
  if (!pad) return 0.4
  if (pad.state === 'off') return 0.4
  if (pad.state === 'dim') return 0.7
  return 1.0
}

function padCoords(padIndex: number): { x: number; y: number } {
  // pad 0 is bottom-left; pad 15 is top-right.
  const col = padIndex % PAD_COLS
  const row = Math.floor(padIndex / PAD_COLS)
  // Flip row so pad 0 sits at the bottom of the SVG.
  const visualRow = PAD_ROWS - 1 - row
  return {
    x: PAD_AREA_X + col * (PAD_SIZE + PAD_GAP),
    y: PAD_AREA_Y + visualRow * (PAD_SIZE + PAD_GAP),
  }
}

function ledBrightness(value: number | undefined): number {
  // led_array values are 0-255 from the cabl protocol's 5-tier brightness
  // (off / lo / med-lo / med-hi / hi). Normalize to [0, 1].
  if (value === undefined || value === null) return 0
  return Math.min(1, Math.max(0, value / 255))
}

function drawLcdBitmap(
  canvas: HTMLCanvasElement | null,
  bitmap: MaschineLcdBitmap | null,
) {
  if (!canvas) return
  const context = canvas.getContext('2d')
  if (!context) return
  const width = bitmap?.width ?? LCD_SOURCE_WIDTH
  const height = bitmap?.height ?? LCD_SOURCE_HEIGHT
  canvas.width = width
  canvas.height = height
  context.fillStyle = '#0b1020'
  context.fillRect(0, 0, width, height)
  if (!bitmap?.data) return
  const bytes = new Uint8Array(
    (bitmap.data.match(/.{1,2}/g) ?? []).map((chunk) => Number.parseInt(chunk, 16) || 0),
  )
  context.fillStyle = '#42be65'
  for (let y = 0; y < height; y += 1) {
    for (let xByte = 0; xByte < Math.ceil(width / 8); xByte += 1) {
      const byte = bytes[y * Math.ceil(width / 8) + xByte] ?? 0
      for (let bit = 0; bit < 8; bit += 1) {
        if ((byte & (1 << bit)) === 0) continue
        const x = xByte * 8 + bit
        if (x < width) context.fillRect(x, y, 1, 1)
      }
    }
  }
}

interface TwinLcdProps {
  bitmap: MaschineLcdBitmap | null
  x: number
  y: number
}

function TwinLcd({ bitmap, x, y }: TwinLcdProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    drawLcdBitmap(canvasRef.current, bitmap)
  }, [bitmap])
  return (
    <foreignObject x={x} y={y} width={LCD_DISPLAY_WIDTH} height={LCD_DISPLAY_HEIGHT}>
      <canvas
        ref={canvasRef}
        className="maschine-twin__lcd-canvas"
        style={{
          width: `${LCD_DISPLAY_WIDTH}px`,
          height: `${LCD_DISPLAY_HEIGHT}px`,
          imageRendering: 'pixelated',
          display: 'block',
        }}
      />
    </foreignObject>
  )
}

interface MaschineHardwareTwinProps {
  status: MaschineDaemonStatus | null
  encoderMap: MaschineEncoderMap | null
}

export function MaschineHardwareTwin({
  status,
  encoderMap,
}: MaschineHardwareTwinProps) {
  // Index pads by index for fast lookup.
  const padIndex = useMemo(() => {
    const map = new Map<number, MaschinePadLedState>()
    for (const pad of status?.led_state?.pads ?? []) {
      map.set(pad.index, pad)
    }
    return map
  }, [status])

  const ledArray = status?.led_array ?? status?.led_state?.led_array ?? []
  const lcdLeft = status?.lcd?.left ?? null
  const lcdRight = status?.lcd?.right ?? null

  // Encoder labels resolve from the encoder map (label OR fallback to
  // the slot key). Slots: enc1-enc8 + vol + tempo + swing.
  const encoderLabel = (slot: string, fallback: string): string => {
    if (!encoderMap) return fallback
    const entry = (encoderMap as unknown as Record<string, { label?: string } | null>)[slot]
    return entry?.label ?? fallback
  }

  const encoderSlotsBySlot: Record<(typeof ENCODER_LABELS)[number], string> = {
    vol: 'vol',
    '1': 'enc1',
    '2': 'enc2',
    '3': 'enc3',
    '4': 'enc4',
    '5': 'enc5',
    '6': 'enc6',
    '7': 'enc7',
    '8': 'enc8',
    tempo: 'tempo',
    swing: 'swing',
  }

  // Group LEDs map to specific slots in the led_array. The cabl
  // protocol layout puts groups A-H starting around slot 24 in the
  // led_array (verified against MaschineLedPreviewPanel mapping).
  // We use an offset so the twin lights up the right side when the
  // daemon emits group flashes.
  const groupLedSlot = (groupIndex: number) => 24 + groupIndex

  return (
    <Tile className="maschine-twin">
      <header className="maschine-twin__head">
        <div>
          <h3>Hardware Twin</h3>
          <p className="maschine-twin__subtitle">
            Live SVG mirror — pads, encoders, group buttons, dual LCDs. Reflects the daemon&apos;s WS state in real time.
          </p>
        </div>
        <Tag size="sm" type={status?.connected ? 'green' : 'warm-gray'}>
          {status?.connected ? 'Live' : 'Disconnected'}
        </Tag>
      </header>
      <div className="maschine-twin__svg-wrap">
        <svg
          viewBox={`0 0 ${SVG_VIEWBOX_WIDTH} ${SVG_VIEWBOX_HEIGHT}`}
          xmlns="http://www.w3.org/2000/svg"
          className="maschine-twin__svg"
          role="img"
          aria-label="NI Maschine MK1 hardware twin"
        >
          {/* Chassis */}
          <rect
            x={20}
            y={20}
            width={SVG_VIEWBOX_WIDTH - 40}
            height={SVG_VIEWBOX_HEIGHT - 40}
            rx={16}
            fill="#0a0e1a"
            stroke="#1f2937"
            strokeWidth={2}
          />

          {/* LCD bezels */}
          <rect
            x={LCD_LEFT_X - 6}
            y={LCD_Y - 6}
            width={LCD_DISPLAY_WIDTH + 12}
            height={LCD_DISPLAY_HEIGHT + 12}
            rx={4}
            fill="#000814"
            stroke="#1f2937"
          />
          <rect
            x={LCD_RIGHT_X - 6}
            y={LCD_Y - 6}
            width={LCD_DISPLAY_WIDTH + 12}
            height={LCD_DISPLAY_HEIGHT + 12}
            rx={4}
            fill="#000814"
            stroke="#1f2937"
          />
          <TwinLcd bitmap={lcdLeft} x={LCD_LEFT_X} y={LCD_Y} />
          <TwinLcd bitmap={lcdRight} x={LCD_RIGHT_X} y={LCD_Y} />

          {/* Encoders */}
          {ENCODER_LABELS.map((label, index) => {
            const cx = ENCODER_ROW_X + index * ENCODER_GAP + ENCODER_RADIUS
            const cy = ENCODER_ROW_Y + ENCODER_RADIUS
            const slot = encoderSlotsBySlot[label]
            const labelText = encoderLabel(slot, label)
            return (
              <g key={`enc-${label}`}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={ENCODER_RADIUS}
                  fill="#11192d"
                  stroke="#33b1ff"
                  strokeWidth={1.5}
                />
                <circle cx={cx} cy={cy} r={ENCODER_RADIUS - 8} fill="#1f2937" />
                {/* Tick mark at 12 o'clock as a placeholder for live encoder
                    angle (the daemon doesn't emit live angles in the welcome
                    payload yet — cycle 4 will wire that). */}
                <line
                  x1={cx}
                  y1={cy - ENCODER_RADIUS + 4}
                  x2={cx}
                  y2={cy - ENCODER_RADIUS + 12}
                  stroke="#42be65"
                  strokeWidth={2}
                />
                <text
                  x={cx}
                  y={cy + ENCODER_RADIUS + 14}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#94a3b8"
                  className="maschine-twin__label"
                >
                  {label}
                </text>
                <text
                  x={cx}
                  y={cy + ENCODER_RADIUS + 26}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#cbd5f5"
                  className="maschine-twin__label"
                >
                  {labelText.length > 8 ? `${labelText.slice(0, 7)}…` : labelText}
                </text>
              </g>
            )
          })}

          {/* Group buttons A-H on the left flank, 2 columns × 4 rows */}
          {GROUP_LABELS.map((label, index) => {
            const col = index % 2
            const row = Math.floor(index / 2)
            const x = GROUP_COL_X + col * (GROUP_BTN_SIZE + GROUP_BTN_GAP)
            const y = GROUP_ROW_Y + row * (GROUP_BTN_SIZE + GROUP_BTN_GAP)
            const brightness = ledBrightness(ledArray[groupLedSlot(index)])
            const fill = brightness > 0.05 ? '#33b1ff' : '#1f2937'
            return (
              <g key={`group-${label}`}>
                <rect
                  x={x}
                  y={y}
                  width={GROUP_BTN_SIZE}
                  height={GROUP_BTN_SIZE}
                  rx={6}
                  fill={fill}
                  fillOpacity={brightness > 0.05 ? 0.6 + 0.4 * brightness : 1}
                  stroke="#33b1ff"
                  strokeOpacity={brightness > 0.05 ? 0.8 : 0.2}
                />
                <text
                  x={x + GROUP_BTN_SIZE / 2}
                  y={y + GROUP_BTN_SIZE / 2 + 4}
                  textAnchor="middle"
                  fontSize={14}
                  fontWeight={700}
                  fill={brightness > 0.05 ? '#0a0e1a' : '#94a3b8'}
                >
                  {label}
                </text>
              </g>
            )
          })}

          {/* 4×4 pad grid */}
          {Array.from({ length: 16 }).map((_, padIdx) => {
            const { x, y } = padCoords(padIdx)
            const pad = padIndex.get(padIdx)
            const fill = padColor(pad)
            const isSelected = pad?.selected ?? false
            return (
              <g key={`pad-${padIdx}`}>
                <rect
                  x={x}
                  y={y}
                  width={PAD_SIZE}
                  height={PAD_SIZE}
                  rx={6}
                  fill={fill}
                  fillOpacity={padOpacity(pad)}
                  stroke={isSelected ? '#42be65' : '#1f2937'}
                  strokeWidth={isSelected ? 3 : 1}
                  className={isSelected ? 'maschine-twin__pad maschine-twin__pad--selected' : 'maschine-twin__pad'}
                  data-pad-index={padIdx}
                />
                <text
                  x={x + 6}
                  y={y + 14}
                  fontSize={9}
                  fill="#0a0e1a"
                  fontWeight={700}
                >
                  {padIdx + 1}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      <footer className="maschine-twin__legend">
        <Tag size="sm" type="green">Live data</Tag>
        <span className="maschine-twin__legend-text">
          Pad fill = LED color · brightness = LED state · selected pad pulses · group buttons reflect group LEDs · LCDs render the live framebuffer
        </span>
      </footer>
    </Tile>
  )
}
