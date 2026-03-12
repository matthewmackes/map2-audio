/**
 * IntelFXFlowCanvas — WYSIWYG Signal Flow Canvas for the Digitech IntelFX.
 *
 * Layout:
 *   +--------------------------------------------------------------------+
 *   |  Toolbar (program nav, undo/redo, zoom)                            |
 *   +--------------------------------------------------------------------+
 *   |  Chain notation bar (HSH=CMP=WAH=EQ=PIT=CHO=FLG=PHA=TRM=DLY=REV) |
 *   +--------------------------------------------------------------------+
 *   |  Canvas area (serial signal flow, 2-row grid + patch cords)        |
 *   |  [IN]-[HSH]-[CMP]-[WAH]-[EQ]-[PIT]-[CHO]                         |
 *   |       [FLG]-[PHA]-[TRM]-[DLY]-[REV]-[OUT]                         |
 *   +--------------------------------------------------------------------+
 *   |  Docked parameter editor panel (selected block params)             |
 *   +--------------------------------------------------------------------+
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { ChevronLeft, ChevronRight, Close, Redo, Undo, ZoomIn, ZoomOut, ZoomReset } from '@carbon/icons-react'
import { Button } from '@carbon/react'

import type {
  IntelFXRegistryParam,
  UseIntelFXStateResult,
} from '../../../map2/intelfxApi'
import {
  formatIntelFXProgramName,
  formatIntelFXProgramNumber,
} from './programNumber'
import {
  INTELFX_BLOCK_META,
  INTELFX_DEFAULT_EFFECT_ORDER,
  type IntelFXBlockState,
  type IntelFXEffectBlockId,
  type IntelFXPatchCord,
  computeBlockStates,
  computePatchCords,
  computeSerialLayout,
} from './intelfxFlowRouting'
import { useFlowUndoRedo } from './useFlowUndoRedo'
import './IntelFXFlowCanvas.css'

// ── View transform ──────────────────────────────────────────────────────────

interface ViewTransform {
  zoom: number
  panX: number
  panY: number
}

const MIN_ZOOM = 0.35
const MAX_ZOOM = 2.5
const ZOOM_STEP = 0.15

// ── Props ───────────────────────────────────────────────────────────────────

interface IntelFXFlowCanvasProps {
  intelfx: UseIntelFXStateResult
  setStatusText?: (text: string) => void
}

// ── Param helpers (local, avoid cross-component coupling) ───────────────────

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function getParamValue(
  param: IntelFXRegistryParam,
  shadow: Record<string, number>,
): number {
  const raw = shadow[param.id]
  if (Number.isFinite(raw)) return Number(raw)
  if (Number.isFinite(param.default)) return Number(param.default)
  return Number(param.range?.min ?? 0)
}

function formatValue(param: IntelFXRegistryParam, value: number): string {
  const units = (param.units ?? '').toLowerCase()
  if (units.includes('hz')) {
    return Math.abs(value) >= 1000
      ? `${(value / 1000).toFixed(2)} kHz`
      : `${Math.round(value)} Hz`
  }
  if (units === 's' || units === 'sec' || units === 'seconds') {
    return Math.abs(value) < 1
      ? `${Math.round(value * 1000)} ms`
      : `${value.toFixed(2)} s`
  }
  if (units.includes('ms')) {
    return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`
  }
  if (units.includes('db')) {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)} dB`
  }
  if (units && units !== 'index' && units !== 'none') {
    return `${Math.round(value * 100) / 100} ${param.units}`
  }
  return `${Math.round(value * 100) / 100}`
}

function groupParamsByPage(
  params: IntelFXRegistryParam[],
): Array<{ page: string; params: IntelFXRegistryParam[] }> {
  const pages = new Map<string, IntelFXRegistryParam[]>()
  for (const param of params) {
    const page = param.page || 'Parameters'
    const existing = pages.get(page) ?? []
    existing.push(param)
    pages.set(page, existing)
  }
  return Array.from(pages.entries()).map(([page, grouped]) => ({
    page,
    params: grouped.sort((a, b) => a.display_name.localeCompare(b.display_name)),
  }))
}

function buildEnumValues(param: IntelFXRegistryParam): number[] {
  const min = Number(param.range?.min ?? 0)
  const max = Number(param.range?.max ?? 0)
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return [0]
  const count = max - min + 1
  if (count > 64) return [Math.round(min), Math.round(max)]
  return Array.from({ length: count }, (_, i) => Math.round(min + i))
}

// ── ParamControl widget ─────────────────────────────────────────────────────

interface ParamControlProps {
  param: IntelFXRegistryParam
  value: number
  onChange: (value: number) => void
}

function ParamControl({ param, value, onChange }: ParamControlProps) {
  const min = Number(param.range?.min ?? 0)
  const max = Number(param.range?.max ?? 1)

  if (param.type === 'toggle' || param.type === 'bool' || param.type === 'boolean') {
    const active = value >= 0.5
    return (
      <button
        type="button"
        className={`intelfx-flow-sidebar__control intelfx-flow-sidebar__toggle${active ? ' is-active' : ''}`}
        onClick={() => onChange(active ? 0 : 1)}
      >
        <span className="intelfx-flow-sidebar__toggle-name">{param.display_name}</span>
        <span className="intelfx-flow-sidebar__toggle-value">{active ? 'On' : 'Off'}</span>
      </button>
    )
  }

  if (param.type === 'enum' || param.widget === 'select') {
    const options = buildEnumValues(param)
    return (
      <label className="intelfx-flow-sidebar__control intelfx-flow-sidebar__select-wrap">
        <span className="intelfx-flow-sidebar__label">{param.display_name}</span>
        <select
          value={Math.round(value)}
          onChange={(e) => onChange(Number(e.target.value))}
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {`Option ${opt.toString().padStart(2, '0')}`}
            </option>
          ))}
        </select>
      </label>
    )
  }

  // Default: slider
  return (
    <label className="intelfx-flow-sidebar__control intelfx-flow-sidebar__slider-wrap">
      <span className="intelfx-flow-sidebar__label">{param.display_name}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={Math.max(0.01, (max - min) / 200)}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="intelfx-flow-sidebar__value">{formatValue(param, value)}</span>
    </label>
  )
}

// ── Block Card (inline, simpler than MPX1 since no algorithm display) ───────

interface BlockCardProps {
  block: IntelFXBlockState
  selected: boolean
  onSelect: (effectType: IntelFXEffectBlockId) => void
  onBypassToggle: (blockIndex: number, shouldBypass: boolean) => void
}

const BlockCard = React.memo(
  React.forwardRef<HTMLDivElement, BlockCardProps>(function BlockCard(
    { block, selected, onSelect, onBypassToggle },
    ref,
  ) {
    return (
      <div
        ref={ref}
        className={`intelfx-flow-card${selected ? ' is-selected' : ''}${block.bypassed ? ' is-bypassed' : ''}`}
        style={{ '--block-accent': block.color } as React.CSSProperties}
        onClick={() => onSelect(block.effectType)}
        role="button"
        tabIndex={0}
        aria-label={`${block.label}${block.bypassed ? ', bypassed' : ''}`}
        aria-pressed={selected}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect(block.effectType)
          }
        }}
      >
        <div className="intelfx-flow-card__header">
          <span className="intelfx-flow-card__dot" aria-hidden />
          <span className="intelfx-flow-card__name">{block.label}</span>
          <button
            type="button"
            className={`intelfx-flow-card__bypass-btn${block.bypassed ? ' is-bypassed' : ''}`}
            title={block.bypassed ? `Enable ${block.label}` : `Bypass ${block.label}`}
            aria-label={block.bypassed ? `Enable ${block.label}` : `Bypass ${block.label}`}
            onClick={(e) => {
              e.stopPropagation()
              onBypassToggle(block.blockIndex, !block.bypassed)
            }}
          >
            {block.bypassed ? '\u2297' : '\u25CF'}
          </button>
        </div>

        {block.keyParamLabel && block.keyParamValue !== null && (
          <div className="intelfx-flow-card__key-param">
            {block.keyParamLabel}: {Math.round(block.keyParamValue)}
          </div>
        )}

        <div className="intelfx-flow-card__category">{block.category}</div>

        <div className="intelfx-flow-card__meter" aria-hidden>
          <div className="intelfx-flow-card__meter-fill" style={{ width: '0%' }} />
        </div>
      </div>
    )
  }),
)
BlockCard.displayName = 'IntelFXFlowBlockCard'

// ── Patch Cords SVG ─────────────────────────────────────────────────────────

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

  // For cords that wrap to the next row, use a larger curve
  if (dy > 40) {
    // Wrapping cord: goes right, down, then left-to-right on next row
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

interface PatchCordsProps {
  cords: IntelFXPatchCord[]
  nodeRefs: Record<string, React.RefObject<HTMLElement | null>>
  canvasRef: React.RefObject<HTMLDivElement | null>
}

function IntelFXFlowPatchCords({ cords, nodeRefs, canvasRef }: PatchCordsProps) {
  const [rendered, setRendered] = useState<RenderedCord[]>([])
  const [svgSize, setSvgSize] = useState({ w: 1200, h: 400 })

  const computeRef = useRef<() => void>(() => {})

  computeRef.current = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const newW = canvas.scrollWidth
    const newH = canvas.scrollHeight
    setSvgSize((prev) =>
      prev.w === newW && prev.h === newH ? prev : { w: newW, h: newH },
    )

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

  // Recompute after every render (equality checks prevent infinite loops)
  useLayoutEffect(() => {
    computeRef.current()
  })

  // Also recompute on canvas resize
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
      className="intelfx-flow__patch-svg"
      width={svgSize.w}
      height={svgSize.h}
      aria-hidden
    >
      {rendered.map((cord) => (
        <path
          key={cord.id}
          d={cord.d}
          stroke={cord.dashed ? 'var(--cds-icon-secondary, #8d8d8d)' : cord.color}
          strokeWidth={cord.dashed ? 1.5 : 2}
          fill="none"
          strokeDasharray={
            cord.dashed ? '5 5' : cord.animated ? '14 8' : undefined
          }
          strokeLinecap="round"
          opacity={cord.dashed ? 0.4 : 0.7}
          style={
            cord.animated
              ? { animation: 'intelfx-cord-flow 1.2s linear infinite' }
              : undefined
          }
        />
      ))}
    </svg>
  )
}

// ── Sidebar (docked parameter editor) ───────────────────────────────────────

interface SidebarProps {
  selectedBlock: IntelFXBlockState | null
  intelfx: UseIntelFXStateResult
  onParamChange: (paramId: string, prevValue: number, nextValue: number) => void
  onClose: () => void
  setStatusText: (text: string) => void
}

function IntelFXFlowSidebar({
  selectedBlock,
  intelfx,
  onParamChange,
  onClose,
  setStatusText,
}: SidebarProps) {
  const registryParams = intelfx.registry?.params ?? []

  const blockParams = useMemo(() => {
    if (!selectedBlock) return []
    return registryParams.filter((p) => p.block === selectedBlock.effectType)
  }, [selectedBlock, registryParams])

  const groupedPages = useMemo(() => groupParamsByPage(blockParams), [blockParams])

  const handleParamChange = useCallback(
    (param: IntelFXRegistryParam, nextValue: number) => {
      const prevValue = getParamValue(param, intelfx.shadow)
      onParamChange(param.id, prevValue, nextValue)
      void intelfx.setParam(param.id, nextValue).catch((err) => {
        console.error(`IntelFX flow sidebar setParam ${param.id}:`, err)
      })
      setStatusText(`${param.display_name}: ${formatValue(param, nextValue)}`)
    },
    [intelfx, onParamChange, setStatusText],
  )

  if (!selectedBlock) {
    return (
      <div className="intelfx-flow-sidebar intelfx-flow-sidebar--empty">
        <p>Select a block to edit its parameters.</p>
      </div>
    )
  }

  return (
    <div
      className="intelfx-flow-sidebar"
      style={{ '--block-accent': selectedBlock.color } as React.CSSProperties}
    >
      <div className="intelfx-flow-sidebar__header">
        <span className="intelfx-flow-sidebar__block-dot" aria-hidden />
        <span className="intelfx-flow-sidebar__title">{selectedBlock.label}</span>
        <span className="intelfx-flow-sidebar__category">{selectedBlock.category}</span>
        <Button
          type="button"
          kind="ghost"
          size="sm"
          hasIconOnly
          className="intelfx-flow-sidebar__close"
          renderIcon={Close}
          iconDescription="Close parameter editor"
          onClick={onClose}
        />
      </div>

      <div className="intelfx-flow-sidebar__params">
        {groupedPages.length === 0 && (
          <div className="intelfx-flow-sidebar__empty-msg">
            No parameters in registry for this effect.
          </div>
        )}
        {groupedPages.map((group) => (
          <section key={group.page} className="intelfx-flow-sidebar__page-group">
            <div className="intelfx-flow-sidebar__page-title">{group.page}</div>
            <div className="intelfx-flow-sidebar__param-grid">
              {group.params.map((param) => (
                <ParamControl
                  key={param.id}
                  param={param}
                  value={getParamValue(param, intelfx.shadow)}
                  onChange={(v) => handleParamChange(param, v)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export function IntelFXFlowCanvas({ intelfx, setStatusText: setStatusTextProp }: IntelFXFlowCanvasProps) {
  const setStatusText = setStatusTextProp ?? (() => {})

  const [selectedEffectId, setSelectedEffectId] = useState<IntelFXEffectBlockId | null>(null)
  const [viewTransform, setViewTransform] = useState<ViewTransform>({
    zoom: 1,
    panX: 0,
    panY: 0,
  })
  const undoRedo = useFlowUndoRedo(50)

  // Panning state
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 })

  // DOM refs for canvas and all nodes
  const canvasAreaRef = useRef<HTMLDivElement>(null)
  const canvasInnerRef = useRef<HTMLDivElement>(null)
  const inputNodeRef = useRef<HTMLDivElement>(null)
  const outputNodeRef = useRef<HTMLDivElement>(null)

  // Pre-create stable refs for all 11 block cards
  const blockRefsMap = useRef<Record<string, React.RefObject<HTMLDivElement | null>>>(
    Object.fromEntries(
      INTELFX_DEFAULT_EFFECT_ORDER.map((_, i) => [
        `block_${i + 1}`,
        React.createRef<HTMLDivElement>(),
      ]),
    ),
  )

  // ── Derived data ────────────────────────────────────────────────────────

  const blockStates = useMemo(
    () => computeBlockStates(intelfx.shadow, intelfx.registry),
    [intelfx.shadow, intelfx.registry],
  )

  const layout = useMemo(() => computeSerialLayout(blockStates), [blockStates])

  const patchCords = useMemo(
    () => computePatchCords(blockStates, layout),
    [blockStates, layout],
  )

  // Split blocks into top and bottom rows
  const topRowBlocks = useMemo(
    () => blockStates.slice(0, layout.topRowCount),
    [blockStates, layout.topRowCount],
  )

  const bottomRowBlocks = useMemo(
    () => blockStates.slice(layout.topRowCount),
    [blockStates, layout.topRowCount],
  )

  const selectedBlock = useMemo(
    () =>
      selectedEffectId !== null
        ? (blockStates.find((b) => b.effectType === selectedEffectId) ?? null)
        : null,
    [selectedEffectId, blockStates],
  )

  // Build node refs map for the patch cord renderer
  const nodeRefs = useMemo<Record<string, React.RefObject<HTMLElement | null>>>(() => ({
    input: inputNodeRef as React.RefObject<HTMLElement | null>,
    output: outputNodeRef as React.RefObject<HTMLElement | null>,
    ...Object.fromEntries(
      Object.entries(blockRefsMap.current).map(([k, v]) => [
        k,
        v as React.RefObject<HTMLElement | null>,
      ]),
    ),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []) // intentionally empty — refs are stable

  // ── Chain notation ──────────────────────────────────────────────────────

  const chainNotation = blockStates.map((b) => {
    const meta = INTELFX_BLOCK_META[b.effectType]
    return b.bypassed ? meta.shortLabel.toLowerCase() : meta.shortLabel
  }).join('=')

  // ── Keyboard shortcuts ────────────────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isCtrl = e.ctrlKey || e.metaKey
      if (!isCtrl) return

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        const entry = undoRedo.undo()
        if (entry) {
          void intelfx.setParam(entry.paramId, entry.prevValue).catch(() => {})
          setStatusText(`Undo: reverted ${entry.paramId}`)
        }
      } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault()
        const entry = undoRedo.redo()
        if (entry) {
          void intelfx.setParam(entry.paramId, entry.nextValue).catch(() => {})
          setStatusText(`Redo: restored ${entry.paramId}`)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [intelfx, setStatusText, undoRedo])

  // ── Zoom handlers ─────────────────────────────────────────────────────

  const handleZoomIn = useCallback(() => {
    setViewTransform((prev) => ({
      ...prev,
      zoom: Math.min(MAX_ZOOM, Math.round((prev.zoom + ZOOM_STEP) * 100) / 100),
    }))
  }, [])

  const handleZoomOut = useCallback(() => {
    setViewTransform((prev) => ({
      ...prev,
      zoom: Math.max(MIN_ZOOM, Math.round((prev.zoom - ZOOM_STEP) * 100) / 100),
    }))
  }, [])

  const handleZoomReset = useCallback(() => {
    setViewTransform({ zoom: 1, panX: 0, panY: 0 })
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey) return
    e.preventDefault()
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
    setViewTransform((prev) => ({
      ...prev,
      zoom: Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, Math.round((prev.zoom + delta) * 100) / 100),
      ),
    }))
  }, [])

  // ── Pan handlers ──────────────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
        e.preventDefault()
        isPanningRef.current = true
        panStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          panX: viewTransform.panX,
          panY: viewTransform.panY,
        }
      }
    },
    [viewTransform.panX, viewTransform.panY],
  )

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanningRef.current) return
    setViewTransform((prev) => ({
      ...prev,
      panX: panStartRef.current.panX + (e.clientX - panStartRef.current.x),
      panY: panStartRef.current.panY + (e.clientY - panStartRef.current.y),
    }))
  }, [])

  const stopPan = useCallback(() => {
    isPanningRef.current = false
  }, [])

  // ── Block interactions ────────────────────────────────────────────────

  const handleBypassToggle = useCallback(
    (blockIndex: number, shouldBypass: boolean) => {
      const block = blockStates.find((b) => b.blockIndex === blockIndex)
      if (!block) return
      // Try direct bypass param first, then algorithm-specific
      const bypassParamId = `${block.effectType}.bypass`
      const prevValue = intelfx.shadow[bypassParamId] ?? 0
      const nextValue = shouldBypass ? 1 : 0
      undoRedo.push(bypassParamId, prevValue, nextValue)
      void intelfx.setParam(bypassParamId, nextValue).catch((err) => {
        console.error('IntelFX bypass toggle:', err)
      })
      setStatusText(`${block.label} ${shouldBypass ? 'BYPASSED' : 'ENGAGED'}`)
    },
    [blockStates, intelfx, setStatusText, undoRedo],
  )

  const handleSidebarParamChange = useCallback(
    (paramId: string, prevValue: number, nextValue: number) => {
      undoRedo.push(paramId, prevValue, nextValue)
    },
    [undoRedo],
  )

  const handleUndo = useCallback(() => {
    const entry = undoRedo.undo()
    if (entry) {
      void intelfx.setParam(entry.paramId, entry.prevValue).catch(() => {})
      setStatusText(`Undo: reverted ${entry.paramId}`)
    }
  }, [intelfx, setStatusText, undoRedo])

  const handleRedo = useCallback(() => {
    const entry = undoRedo.redo()
    if (entry) {
      void intelfx.setParam(entry.paramId, entry.nextValue).catch(() => {})
      setStatusText(`Redo: restored ${entry.paramId}`)
    }
  }, [intelfx, setStatusText, undoRedo])

  // ── Program navigation ────────────────────────────────────────────────

  const currentProgram = intelfx.state?.current_program ?? 0
  const programEntry = intelfx.programs.find((p) => p.program === currentProgram)
  const programName = formatIntelFXProgramName(currentProgram, programEntry?.name)
  const maxSlots = Math.max(1, intelfx.registry?.program_management?.program_slots ?? 256)

  const handleProgramStep = useCallback(
    (delta: number) => {
      const next = Math.min(maxSlots - 1, Math.max(0, currentProgram + delta))
      void intelfx.setProgram(next).catch((err) => {
        console.error('IntelFX program step:', err)
      })
    },
    [currentProgram, maxSlots, intelfx],
  )

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="intelfx-flow">
      {/* Toolbar */}
      <div className="intelfx-flow-toolbar" role="toolbar" aria-label="Signal Flow controls">
        {/* Program navigation */}
        <div className="intelfx-flow-toolbar__program">
          <Button
            type="button"
            kind="ghost"
            size="sm"
            hasIconOnly
            className="intelfx-flow-toolbar__btn"
            renderIcon={ChevronLeft}
            iconDescription="Previous program"
            onClick={() => handleProgramStep(-1)}
          />
          <span className="intelfx-flow-toolbar__prog-num">
            {formatIntelFXProgramNumber(currentProgram)}
          </span>
          <span className="intelfx-flow-toolbar__prog-name" title={programName}>
            {programName}
          </span>
          <Button
            type="button"
            kind="ghost"
            size="sm"
            hasIconOnly
            className="intelfx-flow-toolbar__btn"
            renderIcon={ChevronRight}
            iconDescription="Next program"
            onClick={() => handleProgramStep(1)}
          />
        </div>

        <div className="intelfx-flow-toolbar__sep" aria-hidden />

        {/* Undo / Redo */}
        <div className="intelfx-flow-toolbar__group">
          <Button
            type="button"
            kind="ghost"
            size="sm"
            hasIconOnly
            className="intelfx-flow-toolbar__btn"
            renderIcon={Undo}
            iconDescription="Undo"
            onClick={handleUndo}
            disabled={!undoRedo.canUndo}
          />
          <Button
            type="button"
            kind="ghost"
            size="sm"
            hasIconOnly
            className="intelfx-flow-toolbar__btn"
            renderIcon={Redo}
            iconDescription="Redo"
            onClick={handleRedo}
            disabled={!undoRedo.canRedo}
          />
        </div>

        <div className="intelfx-flow-toolbar__spacer" />

        {/* Zoom controls */}
        <div className="intelfx-flow-toolbar__zoom">
          <Button
            type="button"
            kind="ghost"
            size="sm"
            hasIconOnly
            className="intelfx-flow-toolbar__btn"
            renderIcon={ZoomOut}
            iconDescription="Zoom out"
            onClick={handleZoomOut}
          />
          <span className="intelfx-flow-toolbar__zoom-level">
            {Math.round(viewTransform.zoom * 100)}%
          </span>
          <Button
            type="button"
            kind="ghost"
            size="sm"
            hasIconOnly
            className="intelfx-flow-toolbar__btn"
            renderIcon={ZoomIn}
            iconDescription="Zoom in"
            onClick={handleZoomIn}
          />
          <Button
            type="button"
            kind="ghost"
            size="sm"
            hasIconOnly
            className="intelfx-flow-toolbar__btn"
            renderIcon={ZoomReset}
            iconDescription="Reset zoom"
            onClick={handleZoomReset}
          />
        </div>
      </div>

      {/* Chain notation bar */}
      <div className="intelfx-flow__chain-bar">
        <span className="intelfx-flow__chain-label">Chain</span>
        <span
          className="intelfx-flow__chain-notation"
          title="Uppercase = active, lowercase = bypassed"
        >
          {chainNotation}
        </span>
      </div>

      <div className="intelfx-flow__workspace">
        {/* Canvas area */}
        <div
          ref={canvasAreaRef}
          className="intelfx-flow__canvas-area"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={stopPan}
          onMouseLeave={stopPan}
        >
          <div
            ref={canvasInnerRef}
            className="intelfx-flow__canvas-inner"
            style={{
              transform: `scale(${viewTransform.zoom}) translate(${viewTransform.panX / viewTransform.zoom}px, ${viewTransform.panY / viewTransform.zoom}px)`,
            }}
          >
            {/* Top row: INPUT + first 6 blocks */}
            <div className="intelfx-flow__path-row intelfx-flow__path-row--top">
              <div className="intelfx-flow__lane-label">Signal Path</div>

              <div ref={inputNodeRef} className="intelfx-flow__io-node" aria-label="Input">
                <span className="intelfx-flow__io-label">IN</span>
              </div>

              {topRowBlocks.map((block) => (
                <BlockCard
                  key={block.effectType}
                  ref={
                    blockRefsMap.current[`block_${block.blockIndex}`] as React.RefObject<HTMLDivElement>
                  }
                  block={block}
                  selected={selectedEffectId === block.effectType}
                  onSelect={setSelectedEffectId}
                  onBypassToggle={handleBypassToggle}
                />
              ))}
            </div>

            {/* Bottom row: remaining 5 blocks + OUTPUT */}
            <div className="intelfx-flow__path-row intelfx-flow__path-row--bottom">
              {bottomRowBlocks.map((block) => (
                <BlockCard
                  key={block.effectType}
                  ref={
                    blockRefsMap.current[`block_${block.blockIndex}`] as React.RefObject<HTMLDivElement>
                  }
                  block={block}
                  selected={selectedEffectId === block.effectType}
                  onSelect={setSelectedEffectId}
                  onBypassToggle={handleBypassToggle}
                />
              ))}

              <div
                ref={outputNodeRef}
                className="intelfx-flow__io-node"
                aria-label="Output"
              >
                <span className="intelfx-flow__io-label">OUT</span>
              </div>
            </div>

            {/* SVG patch cord overlay */}
            <IntelFXFlowPatchCords
              cords={patchCords}
              nodeRefs={nodeRefs}
              canvasRef={canvasInnerRef}
            />
          </div>
        </div>

        {/* Docked editor panel below canvas */}
        <div className="intelfx-flow__editor-dock">
          <IntelFXFlowSidebar
            selectedBlock={selectedBlock}
            intelfx={intelfx}
            onParamChange={handleSidebarParamChange}
            onClose={() => setSelectedEffectId(null)}
            setStatusText={setStatusText}
          />
        </div>
      </div>
    </div>
  )
}
