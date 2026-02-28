/**
 * MPX1FlowCanvas — WYSIWYG Signal Flow Canvas for the Lexicon MPX1.
 *
 * Layout:
 *   ┌────────────────────────────────────────────────────────────────┐
 *   │  MPX1FlowToolbar (program nav, undo/redo, tap, A/B, zoom)     │
 *   ├──────────────────────────────────┬─────────────────────────────┤
 *   │  Canvas area (~70%)              │  MPX1FlowSidebar (~30%)     │
 *   │  [IN]─[B1]─[B2]─[B3]─[B4]─[OUT]│  (selected block params)    │
 *   │          ╲─[B5]─[B6]─╱          │                             │
 *   │  (SVG patch cord overlay)        │                             │
 *   └──────────────────────────────────┴─────────────────────────────┘
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
  type BlockRoutingState,
  computeBlockStates,
  computeFlowLayout,
  computePatchCords,
} from './mpx1FlowRouting'
import { useFlowUndoRedo } from './useFlowUndoRedo'
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

  const [selectedBlockIndex, setSelectedBlockIndex] = useState<number | null>(null)
  const [viewTransform, setViewTransform] = useState<ViewTransform>({
    zoom: 1,
    panX: 0,
    panY: 0,
  })
  const [blockLevels, setBlockLevels] = useState<Record<number, number>>({})
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
    () => computeBlockStates(mpx1.shadow, mpx1.registry),
    [mpx1.shadow, mpx1.registry],
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
      selectedBlockIndex !== null
        ? (blockStates.find((b) => b.blockIndex === selectedBlockIndex) ?? null)
        : null,
    [selectedBlockIndex, blockStates],
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

      <div className={`mpx1-flow__workspace${selectedBlock ? ' has-sidebar' : ''}`}>
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
              <div ref={inputNodeRef} className="mpx1-flow__io-node" aria-label="Input">
                <span className="mpx1-flow__io-label">IN</span>
              </div>

              {upperBlocks.map((block) => (
                <MPX1FlowBlockCard
                  key={block.blockIndex}
                  ref={
                    blockRefsMap.current[`block_${block.blockIndex}`] as React.RefObject<HTMLDivElement>
                  }
                  block={block}
                  selected={selectedBlockIndex === block.blockIndex}
                  level={blockLevels[block.blockIndex] ?? 0}
                  onSelect={setSelectedBlockIndex}
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
                    key={block.blockIndex}
                    ref={
                      blockRefsMap.current[`block_${block.blockIndex}`] as React.RefObject<HTMLDivElement>
                    }
                    block={block}
                    selected={selectedBlockIndex === block.blockIndex}
                    level={blockLevels[block.blockIndex] ?? 0}
                    onSelect={setSelectedBlockIndex}
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

        {/* ── Right sidebar ─────────────────────────────────────────────── */}
        {selectedBlock && (
          <MPX1FlowSidebar
            selectedBlock={selectedBlock}
            mpx1={mpx1}
            onParamChange={handleSidebarParamChange}
            onClose={() => setSelectedBlockIndex(null)}
            setLcdText={setLcdText}
          />
        )}
      </div>
    </div>
  )
}
