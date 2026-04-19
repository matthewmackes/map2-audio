export type PushHotspotKind =
  | 'pad'
  | 'button'
  | 'encoder'
  | 'softkey'
  | 'touchstrip'
  | 'screen'
  | 'nav'

export interface PushHotspot {
  id: string
  label: string
  kind: PushHotspotKind
  x: number
  y: number
  width: number
  height: number
  shape?: 'rect' | 'pill' | 'circle'
  aliases?: string[]
}

export const PUSH_RENDER_WIDTH = 1536
export const PUSH_RENDER_HEIGHT = 1024

const GRID_BOUNDS = {
  x: 386,
  y: 344,
  width: 708,
  height: 564,
}

const SOFTKEY_ROW = {
  x: 386,
  y: 285,
  width: 708,
  itemWidth: 70,
  itemHeight: 22,
  gap: 19,
}

const ENCODER_ROW = {
  startX: 409,
  centerY: 94,
  size: 58,
  gap: 39,
}

const LEFT_BUTTONS: Array<{ id: string; label: string; y: number; aliases?: string[] }> = [
  { id: 'btn_01', label: 'Tap Tempo', y: 194, aliases: ['page_home'] },
  { id: 'btn_02', label: 'Metronome', y: 255, aliases: ['page_chains'] },
  { id: 'btn_03', label: 'Undo', y: 351, aliases: ['page_node_detail'] },
  { id: 'btn_04', label: 'Volume', y: 412, aliases: ['page_parameters'] },
  { id: 'btn_05', label: 'Pan / Send', y: 474, aliases: ['page_presets'] },
  { id: 'btn_06', label: 'Track', y: 536, aliases: ['page_routing'] },
  { id: 'btn_07', label: 'Clip / Device', y: 598, aliases: ['page_cluster'] },
  { id: 'btn_08', label: 'Scales', y: 660, aliases: ['page_diagnostics'] },
  { id: 'btn_16', label: 'Note', y: 742 },
  { id: 'btn_17', label: 'Automation', y: 804 },
  { id: 'btn_19', label: 'Record', y: 898 },
]

const RIGHT_BUTTONS: Array<{
  id: string
  label: string
  x: number
  y: number
  shape?: 'rect' | 'pill' | 'circle'
  width?: number
  height?: number
  aliases?: string[]
}> = [
  { id: 'btn_master', label: 'Master', x: 1155, y: 194 },
  { id: 'btn_accent', label: 'Accent', x: 1275, y: 194 },
  { id: 'btn_stop', label: 'Stop', x: 1155, y: 255, aliases: ['nav_left'] },
  { id: 'btn_browse', label: 'Browse', x: 1275, y: 255, aliases: ['nav_right'] },
  { id: 'btn_track_right', label: 'Track', x: 1155, y: 316, aliases: ['back'] },
  { id: 'btn_clip', label: 'Clip', x: 1275, y: 316, aliases: ['shift'] },
  { id: 'btn_add_effect', label: 'Add Effect', x: 1155, y: 412, aliases: ['confirm'] },
  { id: 'btn_add_track', label: 'Add Track', x: 1275, y: 474, aliases: ['bypass'] },
  { id: 'btn_duplicate', label: 'Duplicate', x: 1275, y: 535, aliases: ['select'] },
  { id: 'btn_delete', label: 'Delete', x: 1275, y: 597, aliases: ['home'] },
  { id: 'btn_double', label: 'Double', x: 1275, y: 660 },
  { id: 'btn_quantize', label: 'Quantize', x: 1275, y: 723 },
  { id: 'nav_wheel', label: 'Browse Wheel', x: 1168, y: 681, width: 72, height: 72, shape: 'circle' },
  { id: 'btn_octave_up', label: 'Octave Up', x: 1155, y: 786 },
  { id: 'nav_up', label: 'Arrow Up', x: 1275, y: 786 },
  { id: 'btn_octave_down', label: 'Octave Down', x: 1155, y: 848 },
  { id: 'nav_down', label: 'Arrow Down', x: 1275, y: 848 },
  { id: 'btn_swing', label: 'Swing', x: 1155, y: 909 },
  { id: 'btn_user', label: 'User', x: 1275, y: 909 },
]

function buildPadHotspots(): PushHotspot[] {
  const cellWidth = 71
  const cellHeight = 60
  const gapX = 18
  const gapY = 11
  const hotspots: PushHotspot[] = []

  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      hotspots.push({
        id: `grid_${column}_${row}`,
        label: `PAD ${column + 1},${row + 1}`,
        kind: 'pad',
        x: GRID_BOUNDS.x + column * (cellWidth + gapX),
        y: GRID_BOUNDS.y + (7 - row) * (cellHeight + gapY),
        width: cellWidth,
        height: cellHeight,
      })
    }
  }

  return hotspots
}

function buildEncoderHotspots(): PushHotspot[] {
  return Array.from({ length: 8 }, (_value, index) => ({
    id: `encoder_${index}`,
    label: `ENC_${String(index + 1).padStart(2, '0')}`,
    kind: 'encoder',
    x: ENCODER_ROW.startX + index * (ENCODER_ROW.size + ENCODER_ROW.gap),
    y: ENCODER_ROW.centerY,
    width: ENCODER_ROW.size,
    height: ENCODER_ROW.size,
    shape: 'circle',
    aliases: [`encoder_touch_${index}`],
  }))
}

function buildSoftkeyHotspots(): PushHotspot[] {
  return Array.from({ length: 8 }, (_value, index) => ({
    id: `softkey_${index}`,
    label: `Soft Key ${index + 1}`,
    kind: 'softkey',
    x: SOFTKEY_ROW.x + index * (SOFTKEY_ROW.itemWidth + SOFTKEY_ROW.gap),
    y: SOFTKEY_ROW.y,
    width: SOFTKEY_ROW.itemWidth,
    height: SOFTKEY_ROW.itemHeight,
  }))
}

function buildButtonHotspots(): PushHotspot[] {
  const hotspots: PushHotspot[] = []

  for (const button of LEFT_BUTTONS) {
    hotspots.push({
      id: button.id,
      label: button.label,
      kind: 'button',
      x: 206,
      y: button.y,
      width: 96,
      height: 28,
      aliases: button.aliases,
    })
  }

  for (const button of RIGHT_BUTTONS) {
    hotspots.push({
      id: button.id,
      label: button.label,
      kind: button.id.startsWith('nav_') ? 'nav' : 'button',
      x: button.x,
      y: button.y,
      width: button.width ?? 96,
      height: button.height ?? 28,
      shape: button.shape,
      aliases: button.aliases,
    })
  }

  return hotspots
}

// INFERRED: these overlay coordinates are aligned to the provided render PNG so
// the Labs editor can offer one-for-one hotspot editing without pretending the
// image itself is a public Ableton protocol document.
export const PUSH_HOTSPOTS: PushHotspot[] = [
  {
    id: 'touchstrip',
    label: 'Slide Strip',
    kind: 'touchstrip',
    x: 205,
    y: 96,
    width: 123,
    height: 22,
    shape: 'pill',
  },
  ...buildEncoderHotspots(),
  {
    id: 'screen_display',
    label: 'Screen',
    kind: 'screen',
    x: 386,
    y: 182,
    width: 708,
    height: 86,
  },
  ...buildSoftkeyHotspots(),
  ...buildPadHotspots(),
  ...buildButtonHotspots(),
]

export function findHotspotById(hotspotId: string | null | undefined): PushHotspot | null {
  if (!hotspotId) {
    return null
  }
  return PUSH_HOTSPOTS.find((hotspot) => hotspot.id === hotspotId) ?? null
}

export function findHotspotForControlId(controlId: string | null | undefined): PushHotspot | null {
  if (!controlId) {
    return null
  }
  return PUSH_HOTSPOTS.find(
    (hotspot) => hotspot.id === controlId || hotspot.aliases?.includes(controlId),
  ) ?? null
}
