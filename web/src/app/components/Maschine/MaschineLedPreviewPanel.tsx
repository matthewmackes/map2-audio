import { Layer, Tag, Tile } from '@carbon/react'
import { useCallback, useMemo } from 'react'
import type { MaschineLedState } from '../../../map2/types'

/** LED slot indices matching mk1_protocol.py Led enum */
const LED_SLOTS = {
  // Pads (4×4 grid, hardware order)
  pads: [
    { slot: 3, label: 'P1' },
    { slot: 2, label: 'P2' },
    { slot: 1, label: 'P3' },
    { slot: 0, label: 'P4' },
    { slot: 7, label: 'P5' },
    { slot: 6, label: 'P6' },
    { slot: 5, label: 'P7' },
    { slot: 4, label: 'P8' },
    { slot: 11, label: 'P9' },
    { slot: 10, label: 'P10' },
    { slot: 9, label: 'P11' },
    { slot: 8, label: 'P12' },
    { slot: 15, label: 'P13' },
    { slot: 14, label: 'P14' },
    { slot: 13, label: 'P15' },
    { slot: 12, label: 'P16' },
  ],
  // Left-of-pads vertical stack
  leftButtons: [
    { slot: 16, label: 'MUTE' },
    { slot: 17, label: 'SOLO' },
    { slot: 18, label: 'SEL' },
    { slot: 19, label: 'DUP' },
    { slot: 20, label: 'NAV' },
    { slot: 21, label: 'KBD' },
    { slot: 22, label: 'PAT' },
    { slot: 23, label: 'SCN' },
  ],
  // Transport row
  transport: [
    { slot: 24, label: 'SHIFT' },
    { slot: 25, label: 'ERASE' },
    { slot: 26, label: 'GRID' },
    { slot: 27, label: 'TR-R' },
    { slot: 28, label: 'REC' },
    { slot: 29, label: 'PLAY' },
    { slot: 31, label: 'TR-L' },
    { slot: 32, label: 'LOOP' },
  ],
  // Group A-H
  groups: [
    { slot: 40, label: 'A' },
    { slot: 39, label: 'B' },
    { slot: 36, label: 'C' },
    { slot: 35, label: 'D' },
    { slot: 38, label: 'E' },
    { slot: 37, label: 'F' },
    { slot: 34, label: 'G' },
    { slot: 33, label: 'H' },
  ],
  // LCD-side buttons (left of LCD)
  lcdLeft: [
    { slot: 48, label: 'CTRL' },
    { slot: 47, label: 'STEP' },
    { slot: 46, label: 'BRWS' },
    { slot: 45, label: 'SMPL' },
    { slot: 42, label: 'SNAP' },
    { slot: 41, label: 'AUTO' },
    { slot: 44, label: 'B-L' },
    { slot: 43, label: 'B-R' },
  ],
  // Display buttons (above LCD)
  displayButtons: [
    { slot: 56, label: 'D1' },
    { slot: 55, label: 'D2' },
    { slot: 54, label: 'D3' },
    { slot: 53, label: 'D4' },
    { slot: 52, label: 'D5' },
    { slot: 51, label: 'D6' },
    { slot: 50, label: 'D7' },
    { slot: 49, label: 'D8' },
  ],
  // Misc
  misc: [
    { slot: 57, label: 'N-RPT' },
    { slot: 58, label: 'BKLT' },
  ],
} as const

function brightnessStyle(brightness: number): React.CSSProperties {
  if (brightness <= 0) return { background: 'var(--cds-layer-02)', color: 'var(--cds-text-secondary)' }
  const r = Math.round(brightness)
  const alpha = Math.max(0.15, r / 255)
  return {
    background: `rgba(220, 38, 38, ${alpha})`,
    color: r > 80 ? '#fff' : 'var(--cds-text-primary)',
    boxShadow: r > 150 ? `0 0 ${Math.round(r / 20)}px rgba(220, 38, 38, 0.5)` : 'none',
  }
}

function LedSlot({
  label,
  brightness,
  size,
  onClick,
}: {
  label: string
  brightness: number
  size: 'sm' | 'md' | 'lg'
  onClick?: () => void
}) {
  const style = brightnessStyle(brightness)
  const sizeClass =
    size === 'lg' ? 'maschine-led__slot--lg' : size === 'sm' ? 'maschine-led__slot--sm' : 'maschine-led__slot--md'

  return (
    <Tile
      className={`maschine-led__slot ${sizeClass}`}
      style={style}
      role="listitem"
      aria-label={`${label}: ${brightness}`}
      onClick={onClick}
    >
      <span className="maschine-led__label">{label}</span>
      {brightness > 0 && <span className="maschine-led__value">{brightness}</span>}
    </Tile>
  )
}

function LedGroup({
  title,
  slots,
  columns,
  ledArray,
  size,
  onPadClick,
}: {
  title: string
  slots: ReadonlyArray<{ slot: number; label: string }>
  columns: number
  ledArray: number[]
  size: 'sm' | 'md' | 'lg'
  onPadClick?: (padIndex: number) => void
}) {
  return (
    <div className="maschine-led__group">
      <span className="maschine-led__group-title">{title}</span>
      <div className="maschine-led__grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }} role="list">
        {slots.map((s, i) => (
          <LedSlot
            key={s.slot}
            label={s.label}
            brightness={ledArray[s.slot] ?? 0}
            size={size}
            onClick={onPadClick ? () => onPadClick(i) : undefined}
          />
        ))}
      </div>
    </div>
  )
}

export function MaschineLedPreviewPanel({
  ledState,
  ledArray,
  onPadClick,
}: {
  ledState: MaschineLedState | null
  ledArray?: number[] | null
  onPadClick?: (padIndex: number) => void
}) {
  const effectiveArray = useMemo(() => {
    if (ledArray && ledArray.length === 62) return ledArray
    // Fall back to pad-only state from legacy format
    const arr = new Array(62).fill(0)
    const pads = ledState?.pads ?? []
    const padSlots = LED_SLOTS.pads
    pads.forEach((pad, i) => {
      if (i < padSlots.length) {
        const state = typeof pad === 'object' ? String(((pad as unknown) as Record<string, unknown>).state ?? 'off') : 'off'
        arr[padSlots[i].slot] =
          state === 'off' ? 0 : state === 'dim' ? 40 : state === 'bright' ? 180 : state === 'pulsing' ? 220 : 0
      }
    })
    return arr
  }, [ledArray, ledState])

  const activeCount = effectiveArray.filter((v: number) => v > 0).length

  return (
    <Layer className="maschine-page__panel maschine-led-panel" data-testid="maschine-led-preview-panel">
      <div className="maschine-page__panel-head">
        <h2>LED Preview</h2>
        <div className="maschine-page__tag-row">
          <Tag type="green">62 slots</Tag>
          <Tag type={activeCount > 0 ? 'green' : 'warm-gray'}>{activeCount} active</Tag>
        </div>
      </div>

      <div className="maschine-led__layout">
        <div className="maschine-led__left-col">
          <LedGroup title="Left of Pads" slots={LED_SLOTS.leftButtons} columns={1} ledArray={effectiveArray} size="sm" />
          <LedGroup title="LCD-Side" slots={LED_SLOTS.lcdLeft} columns={2} ledArray={effectiveArray} size="sm" />
          <LedGroup title="Misc" slots={LED_SLOTS.misc} columns={2} ledArray={effectiveArray} size="sm" />
        </div>

        <div className="maschine-led__center-col">
          <LedGroup title="Display Buttons" slots={LED_SLOTS.displayButtons} columns={8} ledArray={effectiveArray} size="sm" />
          <LedGroup title="Groups A–H" slots={LED_SLOTS.groups} columns={8} ledArray={effectiveArray} size="sm" />
          <LedGroup
            title="Pads"
            slots={LED_SLOTS.pads}
            columns={4}
            ledArray={effectiveArray}
            size="lg"
            onPadClick={onPadClick}
          />
          <LedGroup title="Transport" slots={LED_SLOTS.transport} columns={8} ledArray={effectiveArray} size="sm" />
        </div>
      </div>
    </Layer>
  )
}

export default MaschineLedPreviewPanel
