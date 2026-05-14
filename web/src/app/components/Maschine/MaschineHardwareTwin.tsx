import { Tag, Tile } from '@carbon/react'
import * as React from 'react'
import { useEffect, useMemo, useRef } from 'react'

import type {
  MaschineDaemonStatus,
  MaschineEncoderMap,
  MaschineHidEvent,
  MaschineLcdBitmap,
  MaschinePadLedState,
} from '../../../map2/types'

// T2522-A — Hardware Twin v2 (cycle 4 polish).
//
// SVG mirror of the NI Maschine MK1 surface. The layout matches the
// physical device: dual 255×64 LCDs at the top center, 11 encoders in
// a row beneath (vol / 1-8 / tempo / swing), 8 group buttons (A-H) on
// the left flank, 16 4×4 pads on the right half. LEDs render with
// brightness mapped from `led_state.led_array` and `led_state.pads`;
// the dual LCDs render the live framebuffer via canvas elements
// composited inside the SVG via foreignObject.
//
// Cycle 4 polish:
//   • Hover-to-inspect — every pad/encoder/group button carries a
//     native SVG <title> tooltip with the live identity (pad index +
//     note + velocity + LED color OR encoder slot + label OR group
//     letter + LED brightness). Native tooltips work without any
//     extra dependency, integrate with the OS-level a11y stack, and
//     don't have to compete with the SVG hover region.
//   • Click-to-select pads — when an audio-grid block is mounted on
//     a pad, clicking the pad fires onPadClick(padIndex). Mirrors
//     the existing MaschineLedPreviewPanel behavior so the Twin and
//     the Diagnostics LED preview agree on the click contract.
//   • Live encoder rotation — the daemon emits encoder HID events
//     with a relative `delta` (-1 / +1). We accumulate per-encoder
//     deltas into a normalized angle and rotate the tick mark to
//     match. The accumulator persists across renders via useRef so
//     we don't replay the entire HID history every frame.
//   • Activity pulse — the most-recent HID event's pad/encoder/group
//     receives a brief stroke flash so the operator sees physical
//     input even when the LED isn't lit. The pulse is keyed by the
//     event timestamp so identical follow-up events still re-trigger.

const PAD_COLS = 4
const PAD_ROWS = 4
const PAD_SIZE = 60
const PAD_GAP = 8
const PAD_AREA_X = 360
const PAD_AREA_Y = 200

const ENCODER_RADIUS = 22
const ENCODER_GAP = 60
const ENCODER_ROW_X = 60
const ENCODER_ROW_Y = 160
const ENCODER_LABELS = ['vol', '1', '2', '3', '4', '5', '6', '7', '8', 'tempo', 'swing'] as const
type EncoderLabel = (typeof ENCODER_LABELS)[number]
const ENCODER_SLOT_BY_LABEL: Record<EncoderLabel, string> = {
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
// Encoders 1-8 in the cabl protocol arrive as encoder index 0-7 in
// the HID delta stream; vol/tempo/swing are dedicated controls that
// the daemon emits with their own indices. We only animate the
// numbered encoders (1-8) for live rotation; vol/tempo/swing are
// shown statically and labeled from the encoder map.
const HID_ENCODER_INDEX_BY_LABEL: Partial<Record<EncoderLabel, number>> = {
  '1': 0,
  '2': 1,
  '3': 2,
  '4': 3,
  '5': 4,
  '6': 5,
  '7': 6,
  '8': 7,
}

const GROUP_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const
const GROUP_COL_X = 60
const GROUP_ROW_Y = 220
const GROUP_BTN_SIZE = 40
const GROUP_BTN_GAP = 10

const LCD_DISPLAY_WIDTH = 200
const LCD_DISPLAY_HEIGHT = 50
const LCD_SOURCE_WIDTH = 255
const LCD_SOURCE_HEIGHT = 64
const LCD_LEFT_X = 60
const LCD_RIGHT_X = LCD_LEFT_X + LCD_DISPLAY_WIDTH + 16
const LCD_Y = 60

const SVG_VIEWBOX_WIDTH = 720
const SVG_VIEWBOX_HEIGHT = 520

// Window for the activity-pulse class (ms). Picked so a steady stream
// of HID events keeps the indicator visible without it ever feeling
// "stuck on" for a single press.
const ACTIVITY_PULSE_MS = 350

// One full encoder turn in the daemon's protocol is ~24 detents (cabl
// encoders use a 24-PPR rotary encoder). We map a normalized angle in
// [0, 1) onto a 270° sweep so the tick can swing across the visible
// portion of the ring without wrapping past the bottom dead-spot.
const ENCODER_DETENTS_PER_TURN = 24
const ENCODER_SWEEP_DEGREES = 270
const ENCODER_SWEEP_START_DEGREES = -135 // -135° puts 0% at 7-o'clock

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
  return base
}

function padOpacity(pad: MaschinePadLedState | undefined): number {
  if (!pad) return 0.4
  if (pad.state === 'off') return 0.4
  if (pad.state === 'dim') return 0.7
  return 1.0
}

function padCoords(padIndex: number): { x: number; y: number } {
  const col = padIndex % PAD_COLS
  const row = Math.floor(padIndex / PAD_COLS)
  const visualRow = PAD_ROWS - 1 - row
  return {
    x: PAD_AREA_X + col * (PAD_SIZE + PAD_GAP),
    y: PAD_AREA_Y + visualRow * (PAD_SIZE + PAD_GAP),
  }
}

function ledBrightness(value: number | undefined): number {
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
  /** Optional — recent HID events for live encoder rotation +
   * activity pulse. Pass an array windowed to the last ~200 events
   * (the diagnostics tab keeps the same window). When omitted the
   * Twin still renders correctly, just without the activity layer. */
  hidEvents?: MaschineHidEvent[]
  /** Optional — fired when the operator clicks a pad that has an
   * audio-grid block mounted. When omitted, pads render as
   * non-interactive (cursor stays default; no aria-button role). */
  onPadClick?: (padIndex: number) => void
}

interface ActivityState {
  /** Last seen HID event timestamp per element id (e.g. "pad-3",
   * "enc-1", "group-2"). Cleared after ACTIVITY_PULSE_MS via a
   * setTimeout chain in useEffect. */
  active: Map<string, number>
}

function lastEventTimestamp(events: MaschineHidEvent[] | undefined): string | null {
  if (!events || events.length === 0) return null
  return events[events.length - 1]?.timestamp ?? null
}

export function MaschineHardwareTwin({
  status,
  encoderMap,
  hidEvents,
  onPadClick,
}: MaschineHardwareTwinProps) {
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

  // Audio-grid block lookup keyed by pad index — used both for
  // tooltip content and to gate the click-to-select interaction.
  const blocksByPad = useMemo(() => {
    const map = new Map<number, { name: string; bypassed: boolean; blockId: string }>()
    for (const block of status?.audio_grid?.blocks ?? []) {
      const padIdx = block.pad_index
      if (padIdx === undefined || padIdx === null) continue
      map.set(padIdx, {
        name: block.plugin_name ?? block.chain_name ?? block.path_label ?? `Block ${block.block_id}`,
        bypassed: Boolean(block.bypassed),
        blockId: block.block_id,
      })
    }
    return map
  }, [status])

  const encoderLabel = (slot: string, fallback: string): string => {
    if (!encoderMap) return fallback
    const entry = (encoderMap as unknown as Record<string, { label?: string } | null>)[slot]
    return entry?.label ?? fallback
  }

  const groupLedSlot = (groupIndex: number) => 24 + groupIndex

  // Cycle 4 — accumulate per-encoder rotation deltas. We process new
  // HID events incrementally by tracking the last event timestamp we
  // already folded in; this keeps the work O(new events) per render.
  const encoderRotationsRef = useRef<Map<number, number>>(new Map())
  const lastFoldedTimestampRef = useRef<string | null>(null)

  if (hidEvents && hidEvents.length > 0) {
    const lastFolded = lastFoldedTimestampRef.current
    let foundAnchor = lastFolded === null
    for (const event of hidEvents) {
      if (!foundAnchor) {
        if (event.timestamp === lastFolded) foundAnchor = true
        continue
      }
      if (event.decoded_type !== 'encoder') continue
      const payload = (event.payload ?? {}) as { encoder?: number; delta?: number }
      const idx = payload.encoder
      const delta = payload.delta ?? 0
      if (typeof idx !== 'number') continue
      const current = encoderRotationsRef.current.get(idx) ?? 0
      const next = current + delta
      encoderRotationsRef.current.set(idx, next)
    }
    lastFoldedTimestampRef.current = lastEventTimestamp(hidEvents)
  }

  // Cycle 4 — activity-pulse map. Latest HID event flashes its
  // matching SVG element. State lives in useRef + a forced timestamp
  // dependency so React doesn't treat it as state for re-renders.
  const activityRef = useRef<ActivityState>({ active: new Map() })
  const latestEventTimestamp = lastEventTimestamp(hidEvents)
  if (hidEvents && hidEvents.length > 0) {
    const event = hidEvents[hidEvents.length - 1]
    const elementId = activityElementId(event)
    if (elementId && event.timestamp) {
      activityRef.current.active.set(elementId, Date.parse(event.timestamp))
    }
  }
  // Re-render to clear pulses once the window has elapsed.
  useEffect(() => {
    if (!latestEventTimestamp) return
    const t = window.setTimeout(() => {
      activityRef.current.active.clear()
    }, ACTIVITY_PULSE_MS)
    return () => window.clearTimeout(t)
  }, [latestEventTimestamp])

  const isActive = (elementId: string): boolean => {
    const stamp = activityRef.current.active.get(elementId)
    if (!stamp) return false
    return Date.now() - stamp < ACTIVITY_PULSE_MS
  }

  return (
    <Tile className="maschine-twin">
      <header className="maschine-twin__head">
        <div>
          <h3>Hardware Twin</h3>
          <p className="maschine-twin__subtitle">
            Live SVG mirror — pads, encoders, group buttons, dual LCDs. Reflects the daemon&apos;s WS state in real time. Hover any control for live identity; click a pad with a block mounted to focus it.
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
            const slot = ENCODER_SLOT_BY_LABEL[label]
            const labelText = encoderLabel(slot, label)
            const hidIdx = HID_ENCODER_INDEX_BY_LABEL[label]
            const elementId = hidIdx !== undefined ? `enc-${hidIdx}` : `enc-${label}`
            const active = isActive(elementId)

            // Rotation: the dedicated encoders (vol/tempo/swing)
            // don't have HID indexes wired here so they stay at 0
            // rotation; the numbered encoders read their accumulator.
            let rotation = 0
            if (hidIdx !== undefined) {
              const totalDelta = encoderRotationsRef.current.get(hidIdx) ?? 0
              const normalized =
                ((totalDelta % ENCODER_DETENTS_PER_TURN) + ENCODER_DETENTS_PER_TURN) %
                ENCODER_DETENTS_PER_TURN
              rotation =
                ENCODER_SWEEP_START_DEGREES +
                (normalized / ENCODER_DETENTS_PER_TURN) * ENCODER_SWEEP_DEGREES
            }

            return (
              <g
                key={`enc-${label}`}
                className={active ? 'maschine-twin__active' : undefined}
              >
                <title>
                  {`Encoder: ${label}\nLabel: ${labelText}${
                    hidIdx !== undefined
                      ? `\nDetent count: ${encoderRotationsRef.current.get(hidIdx) ?? 0}`
                      : ''
                  }`}
                </title>
                <circle
                  cx={cx}
                  cy={cy}
                  r={ENCODER_RADIUS}
                  fill="#11192d"
                  stroke={active ? '#42be65' : '#33b1ff'}
                  strokeWidth={active ? 2.5 : 1.5}
                  data-encoder-label={label}
                />
                <circle cx={cx} cy={cy} r={ENCODER_RADIUS - 8} fill="#1f2937" />
                <line
                  x1={cx}
                  y1={cy - ENCODER_RADIUS + 4}
                  x2={cx}
                  y2={cy - ENCODER_RADIUS + 12}
                  stroke="#42be65"
                  strokeWidth={2}
                  transform={`rotate(${rotation} ${cx} ${cy})`}
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

          {/* Group buttons A-H */}
          {GROUP_LABELS.map((label, index) => {
            const col = index % 2
            const row = Math.floor(index / 2)
            const x = GROUP_COL_X + col * (GROUP_BTN_SIZE + GROUP_BTN_GAP)
            const y = GROUP_ROW_Y + row * (GROUP_BTN_SIZE + GROUP_BTN_GAP)
            const brightness = ledBrightness(ledArray[groupLedSlot(index)])
            const fill = brightness > 0.05 ? '#33b1ff' : '#1f2937'
            const elementId = `group-${index}`
            const active = isActive(elementId)
            return (
              <g
                key={`group-${label}`}
                className={active ? 'maschine-twin__active' : undefined}
              >
                <title>
                  {`Group: ${label}\nLED: ${(brightness * 100).toFixed(0)}%${
                    active ? '\nLast HID: pressed' : ''
                  }`}
                </title>
                <rect
                  x={x}
                  y={y}
                  width={GROUP_BTN_SIZE}
                  height={GROUP_BTN_SIZE}
                  rx={6}
                  fill={fill}
                  fillOpacity={brightness > 0.05 ? 0.6 + 0.4 * brightness : 1}
                  stroke={active ? '#42be65' : '#33b1ff'}
                  strokeOpacity={active ? 1 : brightness > 0.05 ? 0.8 : 0.2}
                  strokeWidth={active ? 2.5 : 1}
                  data-group-index={index}
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
            const elementId = `pad-${padIdx}`
            const active = isActive(elementId)
            const block = blocksByPad.get(padIdx)
            const isClickable = Boolean(block && onPadClick)
            const handleClick = isClickable
              ? () => {
                  onPadClick?.(padIdx)
                }
              : undefined
            const handleKey = isClickable
              ? (event: React.KeyboardEvent<SVGRectElement>) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onPadClick?.(padIdx)
                  }
                }
              : undefined
            const tooltipLines: string[] = [
              `Pad ${padIdx + 1} (index ${padIdx})`,
              `MIDI note ${36 + padIdx}`,
              pad ? `LED: ${pad.color} · ${pad.state}${pad.selected ? ' · selected' : ''}` : 'LED: empty',
            ]
            if (block) {
              tooltipLines.push(`Block: ${block.name}${block.bypassed ? ' (bypassed)' : ''}`)
              tooltipLines.push('Click to focus this block')
            }
            return (
              <g
                key={`pad-${padIdx}`}
                className={active ? 'maschine-twin__active' : undefined}
              >
                <title>{tooltipLines.join('\n')}</title>
                <rect
                  x={x}
                  y={y}
                  width={PAD_SIZE}
                  height={PAD_SIZE}
                  rx={6}
                  fill={fill}
                  fillOpacity={padOpacity(pad)}
                  stroke={isSelected ? '#42be65' : active ? '#42be65' : '#1f2937'}
                  strokeWidth={isSelected ? 3 : active ? 2.5 : 1}
                  className={
                    [
                      'maschine-twin__pad',
                      isSelected ? 'maschine-twin__pad--selected' : '',
                      isClickable ? 'maschine-twin__pad--clickable' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')
                  }
                  data-pad-index={padIdx}
                  data-clickable={isClickable ? 'true' : 'false'}
                  onClick={handleClick}
                  onKeyDown={handleKey}
                  tabIndex={isClickable ? 0 : undefined}
                  role={isClickable ? 'button' : undefined}
                  aria-label={isClickable ? `Focus pad ${padIdx + 1} block: ${block?.name}` : undefined}
                  style={{ cursor: isClickable ? 'pointer' : 'default' }}
                />
                <text
                  x={x + 6}
                  y={y + 14}
                  fontSize={9}
                  fill="#0a0e1a"
                  fontWeight={700}
                  pointerEvents="none"
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
          Pad fill = LED color · brightness = LED state · selected pad pulses · group buttons reflect group LEDs · LCDs render the live framebuffer · hover for identity · pads with mounted blocks click-to-focus.
        </span>
      </footer>
    </Tile>
  )
}

// Map an HID event to the SVG element id that should pulse. Only
// pad / encoder / group events get an activity element here; transport
// + button events render in the Diagnostics HID-traffic panel.
function activityElementId(event: MaschineHidEvent): string | null {
  const payload = (event.payload ?? {}) as {
    pad_index?: number
    encoder?: number
    group_index?: number
  }
  switch (event.decoded_type) {
    case 'pad_press':
    case 'pad_aftertouch':
      // Pad activity flashes only on press/aftertouch; release leaves
      // the pad to settle back to its LED-driven static color.
      if (typeof payload.pad_index === 'number') return `pad-${payload.pad_index}`
      return null
    case 'encoder':
      if (typeof payload.encoder === 'number') return `enc-${payload.encoder}`
      return null
    case 'group_press':
      if (typeof payload.group_index === 'number') return `group-${payload.group_index}`
      return null
    default:
      return null
  }
}
