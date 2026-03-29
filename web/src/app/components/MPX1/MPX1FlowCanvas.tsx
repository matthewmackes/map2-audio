/**
 * MPX1FlowCanvas — WYSIWYG Signal Flow Canvas for the Lexicon MPX1.
 *
 * Layout:
 *   ┌────────────────────────────────────────────────────────────────┐
 *   │  MPX1FlowToolbar (program nav, undo/redo, tap, A/B, zoom)     │
 *   ├────────────────────────────────────────────────────────────────┤
 *   │  Canvas area (signal flow lanes + patch cords)                │
 *   │  [IN]─[B1]─[B2]─[B3]─[B4]─[OUT]                               │
 *   │          ╲─[B5]─[B6]─╱                                        │
 *   ├────────────────────────────────────────────────────────────────┤
 *   │  Docked parameter editor box (selected block params)          │
 *   └────────────────────────────────────────────────────────────────┘
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { useMPX1PageContext } from '../../pages/MPX1Page'
import { MPX1FlowBlockCard } from './MPX1FlowBlockCard'
import { MPX1FlowPatchCords } from './MPX1FlowPatchCords'
import { MPX1FlowSidebar } from './MPX1FlowSidebar'
import { MPX1FlowToolbar } from './MPX1FlowToolbar'
import {
  BLOCK_COLORS,
  BLOCK_LABELS,
  DEFAULT_EFFECT_ORDER,
  type BlockRoutingState,
  type EffectBlockId,
  computeBlockStates,
  computeFlowLayout,
  computePatchCords,
} from './mpx1FlowRouting'
import { useFlowUndoRedo } from './useFlowUndoRedo'

const ROUTING_MODES = [
  { value: 0, label: 'Upper',  shortLabel: '↑ Upper',  title: 'Route this block through the upper signal path' },
  { value: 1, label: 'Lower',  shortLabel: '↓ Lower',  title: 'Route this block through the lower signal path' },
  { value: 2, label: 'Split',  shortLabel: '⇕ Split',  title: 'This block is in the upper path and opens a lower (parallel) branch after it' },
  { value: 3, label: 'Paral',  shortLabel: '⇅ Para',   title: 'Run this block in parallel with the upper path (lower lane)' },
  { value: 4, label: 'Merge',  shortLabel: '⥤ Merge',  title: 'This block is in the upper path and merges the lower branch back in' },
]
import './MPX1FlowCanvas.css'

interface ViewTransform {
  zoom: number
  panX: number
  panY: number
}

const MIN_ZOOM = 0.35
const MAX_ZOOM = 2.5
const ZOOM_STEP = 0.15

export function MPX1FlowCanvas() {
  const { mpx1, setLcdText } = useMPX1PageContext()

  // Selection tracked by effectType so it survives block reordering
  const [selectedEffectId, setSelectedEffectId] = useState<EffectBlockId | null>(null)
  const [viewTransform, setViewTransform] = useState<ViewTransform>({
    zoom: 1,
    panX: 0,
    panY: 0,
  })
  const [blockLevels, setBlockLevels] = useState<Record<number, number>>({})
  // Effect order — user can reorder the 6 blocks; defaults to factory order
  const [effectOrder, setEffectOrder] = useState<EffectBlockId[]>([...DEFAULT_EFFECT_ORDER])
  // Routing modes keyed by chain position (1-6); local state so changes are
  // immediately reflected without relying on hardware SysEx echo
  const [localRoutingModes, setLocalRoutingModes] = useState<Record<number, number>>({})
  const [showOrderPanel, setShowOrderPanel] = useState(false)
  const undoRedo = useFlowUndoRedo(50)

  // Panning state
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 })

  // DOM refs for the canvas and all nodes (for SVG cord geometry)
  const canvasAreaRef = useRef<HTMLDivElement>(null)
  const canvasInnerRef = useRef<HTMLDivElement>(null)
  const inputNodeRef = useRef<HTMLDivElement>(null)
  const outputNodeRef = useRef<HTMLDivElement>(null)

  // Pre-create stable refs for all 6 block cards
  const blockRefsMap = useRef<Record<string, React.RefObject<HTMLDivElement | null>>>({
    block_1: React.createRef<HTMLDivElement>(),
    block_2: React.createRef<HTMLDivElement>(),
    block_3: React.createRef<HTMLDivElement>(),
    block_4: React.createRef<HTMLDivElement>(),
    block_5: React.createRef<HTMLDivElement>(),
    block_6: React.createRef<HTMLDivElement>(),
  })

  // ── Derived data from shadow state ────────────────────────────────────────

  const blockStates = useMemo(
    () => computeBlockStates(mpx1.shadow, mpx1.registry, effectOrder, localRoutingModes),
    [mpx1.shadow, mpx1.registry, effectOrder, localRoutingModes],
  )

  const layout = useMemo(() => computeFlowLayout(blockStates), [blockStates])

  const patchCords = useMemo(
    () => computePatchCords(blockStates, layout),
    [blockStates, layout],
  )

  // Build node refs map for the patch cord renderer (stable reference)
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

  const upperBlocks = useMemo(
    () =>
      layout.upperRow
        .map((idx) => blockStates.find((b) => b.blockIndex === idx))
        .filter(Boolean) as BlockRoutingState[],
    [layout.upperRow, blockStates],
  )

  const lowerBlocks = useMemo(
    () =>
      layout.lowerRow
        .map((idx) => blockStates.find((b) => b.blockIndex === idx))
        .filter(Boolean) as BlockRoutingState[],
    [layout.lowerRow, blockStates],
  )

  const selectedBlock = useMemo(
    () =>
      selectedEffectId !== null
        ? (blockStates.find((b) => b.effectType === selectedEffectId) ?? null)
        : null,
    [selectedEffectId, blockStates],
  )

  // ── Live metering ─────────────────────────────────────────────────────────

  useEffect(() => {
    const event = mpx1.lastEvent as
      | { type: string; param_id?: string; value?: number }
      | null
    if (!event || event.type !== 'mpx1:param_rx' || !event.param_id) return
    if (!event.param_id.endsWith('.level')) return

    // Try to extract block index from the param id prefix
    for (let i = 1; i <= 6; i++) {
      const prefix = `block_${i}.`
      if (event.param_id.startsWith(prefix)) {
        const norm = Math.min(1, Math.max(0, (event.value ?? 0) / 127))
        setBlockLevels((prev) => ({ ...prev, [i]: norm }))
        break
      }
    }
  }, [mpx1.lastEvent])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isCtrl = e.ctrlKey || e.metaKey
      if (!isCtrl) return

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        const entry = undoRedo.undo()
        if (entry) {
          void mpx1.setParam(entry.paramId, entry.prevValue).catch(() => {})
          setLcdText(`Undo: reverted ${entry.paramId}`)
        }
      } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault()
        const entry = undoRedo.redo()
        if (entry) {
          void mpx1.setParam(entry.paramId, entry.nextValue).catch(() => {})
          setLcdText(`Redo: restored ${entry.paramId}`)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mpx1, setLcdText, undoRedo])

  // ── Zoom handlers ─────────────────────────────────────────────────────────

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

  // ── Pan handlers (middle-click or Ctrl+drag) ───────────────────────────────

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

  // ── Block interactions ────────────────────────────────────────────────────

  const handleBypassToggle = useCallback(
    (blockIndex: number, shouldBypass: boolean) => {
      const block = blockStates.find((b) => b.blockIndex === blockIndex)
      if (!block) return
      const algKey = `alg_${block.algorithmIndex.toString().padStart(2, '0')}`
      const bypassParamId = `${block.effectType}.${algKey}.bypass`
      const prevValue = mpx1.shadow[bypassParamId] ?? 0
      const nextValue = shouldBypass ? 1 : 0
      undoRedo.push(bypassParamId, prevValue, nextValue)
      void mpx1.setParam(bypassParamId, nextValue).catch((err) => {
        console.error('MPX1 bypass toggle:', err)
      })
      setLcdText(`${block.label} ${shouldBypass ? 'BYPASSED' : 'ENGAGED'}`)
    },
    [blockStates, mpx1, setLcdText, undoRedo],
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
      void mpx1.setParam(entry.paramId, entry.prevValue).catch(() => {})
      setLcdText(`Undo: reverted ${entry.paramId}`)
    }
  }, [mpx1, setLcdText, undoRedo])

  const handleRedo = useCallback(() => {
    const entry = undoRedo.redo()
    if (entry) {
      void mpx1.setParam(entry.paramId, entry.nextValue).catch(() => {})
      setLcdText(`Redo: restored ${entry.paramId}`)
    }
  }, [mpx1, setLcdText, undoRedo])

  // ── Routing mode change (local state only — routing.block_N is not a real SysEx param) ──

  const handleRoutingModeChange = useCallback(
    (blockIndex: number, newMode: number) => {
      setLocalRoutingModes((prev) => {
        if (prev[blockIndex] === newMode) return prev
        return { ...prev, [blockIndex]: newMode }
      })
      const modeLabel = ROUTING_MODES.find((m) => m.value === newMode)?.label ?? String(newMode)
      setLcdText(`Block ${blockIndex}: ${modeLabel}`)
    },
    [setLcdText],
  )

  // ── Effect order helpers ───────────────────────────────────────────────────

  const moveBlockInOrder = useCallback(
    (index: number, direction: -1 | 1) => {
      setEffectOrder((prev) => {
        const next = [...prev]
        const swapIdx = index + direction
        if (swapIdx < 0 || swapIdx >= next.length) return prev
        ;[next[index], next[swapIdx]] = [next[swapIdx], next[index]]
        return next
      })
    },
    [],
  )

  const resetEffectOrder = useCallback(() => {
    setEffectOrder([...DEFAULT_EFFECT_ORDER])
  }, [])

  // ── "Ord" notation (uppercase=active, lowercase=inactive) ─────────────────

  const ordNotation = effectOrder.map((id) => {
    const block = blockStates.find((b) => b.effectType === id)
    const letter = BLOCK_LABELS[id][0]
    return block?.bypassed ? letter.toLowerCase() : letter.toUpperCase()
  }).join('=')

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="mpx1-flow">
      <MPX1FlowToolbar
        mpx1={mpx1}
        zoom={viewTransform.zoom}
        canUndo={undoRedo.canUndo}
        canRedo={undoRedo.canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
        setLcdText={setLcdText}
      />

      {/* ── Effect Order bar ─────────────────────────────────────────────── */}
      <div className="mpx1-flow__order-bar">
        <span className="mpx1-flow__order-label">Ord</span>
        <span className="mpx1-flow__order-notation" title="Uppercase = active, lowercase = bypassed">
          {ordNotation}
        </span>
        <button
          type="button"
          className={`mpx1-flow__order-btn${showOrderPanel ? ' is-active' : ''}`}
          onClick={() => setShowOrderPanel((v) => !v)}
          title="Edit Effect Order (change block processing order)"
        >
          Effect Order
        </button>
        {effectOrder.join(',') !== DEFAULT_EFFECT_ORDER.join(',') && (
          <button
            type="button"
            className="mpx1-flow__order-reset-btn"
            onClick={resetEffectOrder}
            title="Reset to factory default order"
          >
            Reset
          </button>
        )}
      </div>

      {/* ── Effect Order panel ───────────────────────────────────────────── */}
      {showOrderPanel && (
        <div className="mpx1-flow__order-panel" role="region" aria-label="Effect Order editor">
          <div className="mpx1-flow__order-panel__title">
            Effect Order
            <span className="mpx1-flow__order-panel__hint">
              Drag or use arrows to change processing order · Factory: P=C=E=M=D=R
            </span>
          </div>
          <div className="mpx1-flow__order-chips">
            {effectOrder.map((id, idx) => (
              <div
                key={id}
                className="mpx1-flow__order-chip"
                style={{ '--chip-color': BLOCK_COLORS[id] } as React.CSSProperties}
              >
                <span className="mpx1-flow__order-chip__pos">{idx + 1}</span>
                <span className="mpx1-flow__order-chip__name">
                  {BLOCK_LABELS[id]}
                </span>
                <div className="mpx1-flow__order-chip__arrows">
                  <button
                    type="button"
                    title="Move earlier in chain"
                    disabled={idx === 0}
                    onClick={() => moveBlockInOrder(idx, -1)}
                    aria-label={`Move ${BLOCK_LABELS[id]} earlier`}
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    title="Move later in chain"
                    disabled={idx === effectOrder.length - 1}
                    onClick={() => moveBlockInOrder(idx, 1)}
                    aria-label={`Move ${BLOCK_LABELS[id]} later`}
                  >
                    ›
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mpx1-flow__order-panel__flow-preview">
            {['Input', ...effectOrder.map((id) => BLOCK_LABELS[id]), 'Output'].join(' → ')}
          </div>
        </div>
      )}

      <div className="mpx1-flow__workspace">
        {/* ── Canvas area ───────────────────────────────────────────────── */}
        <div
          ref={canvasAreaRef}
          className="mpx1-flow__canvas-area"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={stopPan}
          onMouseLeave={stopPan}
        >
          <div
            ref={canvasInnerRef}
            className="mpx1-flow__canvas-inner"
            style={{
              transform: `scale(${viewTransform.zoom}) translate(${viewTransform.panX / viewTransform.zoom}px, ${viewTransform.panY / viewTransform.zoom}px)`,
            }}
          >
            {/* Upper path row */}
            <div className="mpx1-flow__path-row mpx1-flow__path-row--upper">
              {/* Lane label */}
              <div className="mpx1-flow__lane-label mpx1-flow__lane-label--upper">
                {lowerBlocks.length > 0 ? 'Upper Lane' : 'Signal Path'}
              </div>

              <div ref={inputNodeRef} className="mpx1-flow__io-node" aria-label="Input">
                <span className="mpx1-flow__io-label">IN</span>
              </div>

              {upperBlocks.map((block) => (
                <MPX1FlowBlockCard
                  key={block.effectType}
                  ref={
                    blockRefsMap.current[`block_${block.blockIndex}`] as React.RefObject<HTMLDivElement>
                  }
                  block={block}
                  selected={selectedEffectId === block.effectType}
                  level={blockLevels[block.blockIndex] ?? 0}
                  onSelect={setSelectedEffectId}
                  onBypassToggle={handleBypassToggle}
                />
              ))}

              <div
                ref={outputNodeRef}
                className="mpx1-flow__io-node mpx1-flow__io-node--out"
                aria-label="Output"
              >
                <span className="mpx1-flow__io-label">OUT</span>
              </div>
            </div>

            {/* Lower path row — only rendered when parallel/split routing is active */}
            {lowerBlocks.length > 0 && (
              <div className="mpx1-flow__path-row mpx1-flow__path-row--lower">
                {/* Lane label */}
                <div className="mpx1-flow__lane-label mpx1-flow__lane-label--lower">
                  Lower Lane
                </div>

                {/* Spacer to align lower blocks under the split point */}
                {layout.splitAtBlock !== null && (
                  <div
                    className="mpx1-flow__path-spacer"
                    style={{
                      // Each IO node is 48px; each card is 120px; gap is 16px between items
                      // Spacer = 48px (input) + 16px (gap) + (splitAtBlock - 1) * (120 + 16)
                      width: `${48 + 16 + (layout.splitAtBlock - 1) * 136}px`,
                    }}
                  />
                )}
                {lowerBlocks.map((block) => (
                  <MPX1FlowBlockCard
                    key={block.effectType}
                    ref={
                      blockRefsMap.current[`block_${block.blockIndex}`] as React.RefObject<HTMLDivElement>
                    }
                    block={block}
                    selected={selectedEffectId === block.effectType}
                    level={blockLevels[block.blockIndex] ?? 0}
                    onSelect={setSelectedEffectId}
                    onBypassToggle={handleBypassToggle}
                  />
                ))}
              </div>
            )}

            {/* SVG patch cord overlay */}
            <MPX1FlowPatchCords
              cords={patchCords}
              nodeRefs={nodeRefs}
              canvasRef={canvasInnerRef}
            />
          </div>
        </div>

        {/* ── Docked editor panel below canvas ─────────────────────────── */}
        <div className="mpx1-flow__editor-dock">
          {/* ── Routing mode picker (shown when a block is selected) ──── */}
          {selectedBlock && (
            <div className="mpx1-flow__route-picker">
              <span className="mpx1-flow__route-picker__label">
                {selectedBlock.label} Route:
              </span>
              {ROUTING_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  className={`mpx1-flow__route-btn${selectedBlock.routingMode === mode.value ? ' is-active' : ''}`}
                  title={mode.title}
                  onClick={() => handleRoutingModeChange(selectedBlock.blockIndex, mode.value)}
                >
                  {mode.shortLabel}
                </button>
              ))}
            </div>
          )}

          <MPX1FlowSidebar
            selectedBlock={selectedBlock}
            mpx1={mpx1}
            onParamChange={handleSidebarParamChange}
            onClose={() => setSelectedEffectId(null)}
            setLcdText={setLcdText}
          />
        </div>
      </div>
    </div>
  )
}

export default MPX1FlowCanvas
