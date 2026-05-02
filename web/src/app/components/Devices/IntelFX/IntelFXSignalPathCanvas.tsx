/**
 * IntelFXSignalPathCanvas — WYSIWYG signal-path canvas for the Digitech IntelFX.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { MAP2_SPRING } from '../../../styles/motionPrimitives'

import type { UseIntelFXStateResult } from '../../../../map2/intelfxApi'
import {
  INTELFX_BLOCK_META,
  INTELFX_DEFAULT_EFFECT_ORDER,
  type IntelFXEffectBlockId,
  computeBlockStates,
  computePatchCords,
  computeSerialLayout,
} from './intelfxSignalPathRouting'
import { useFlowUndoRedo } from './useFlowUndoRedo'
import { IntelFXFlowBlockCard } from './IntelFXFlowBlockCard'
import { IntelFXSignalPathPatchCords } from './IntelFXSignalPathPatchCords'
import { IntelFXFlowSidebar } from './IntelFXFlowSidebar'
import { IntelFXFlowToolbar } from './IntelFXFlowToolbar'
import './IntelFXSignalPathCanvas.css'

const MIN_ZOOM = 0.35
const MAX_ZOOM = 2.5
const ZOOM_STEP = 0.15

interface IntelFXSignalPathCanvasProps {
  intelfx: UseIntelFXStateResult
  setStatusText?: (text: string) => void
}

export function IntelFXSignalPathCanvas({ intelfx, setStatusText: setStatusTextProp }: IntelFXSignalPathCanvasProps) {
  const setStatusText = setStatusTextProp ?? (() => {})

  const [selectedEffectId, setSelectedEffectId] = useState<IntelFXEffectBlockId | null>(null)
  const [zoom, setZoom] = useState(1)
  const panX = useMotionValue(0)
  const panY = useMotionValue(0)
  const canvasTransform = useTransform(
    [panX, panY],
    ([x, y]: number[]) =>
      `scale(${zoom}) translate(${x / zoom}px, ${y / zoom}px)`,
  )

  const undoRedo = useFlowUndoRedo(50)

  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 })

  const canvasAreaRef = useRef<HTMLDivElement>(null)
  const canvasInnerRef = useRef<HTMLDivElement>(null)
  const inputNodeRef = useRef<HTMLDivElement>(null)
  const outputNodeRef = useRef<HTMLDivElement>(null)

  const blockRefsMap = useRef<Record<string, React.RefObject<HTMLDivElement | null>>>(
    Object.fromEntries(
      INTELFX_DEFAULT_EFFECT_ORDER.map((_, i) => [
        `block_${i + 1}`,
        React.createRef<HTMLDivElement>(),
      ]),
    ),
  )

  const blockStates = useMemo(
    () => computeBlockStates(intelfx.shadow, intelfx.registry),
    [intelfx.shadow, intelfx.registry],
  )

  const layout = useMemo(() => computeSerialLayout(blockStates), [blockStates])

  const patchCords = useMemo(
    () => computePatchCords(blockStates, layout),
    [blockStates, layout],
  )

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
  }), [])

  const chainNotation = blockStates.map((b) => {
    const meta = INTELFX_BLOCK_META[b.effectType]
    return b.bypassed ? meta.shortLabel.toLowerCase() : meta.shortLabel
  }).join('=')

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

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(MAX_ZOOM, Math.round((prev + ZOOM_STEP) * 100) / 100))
  }, [])

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(MIN_ZOOM, Math.round((prev - ZOOM_STEP) * 100) / 100))
  }, [])

  const handleZoomReset = useCallback(() => {
    setZoom(1)
    panX.set(0)
    panY.set(0)
  }, [panX, panY])

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey) return
    e.preventDefault()
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
    setZoom((prev) =>
      Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((prev + delta) * 100) / 100)),
    )
  }, [])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
        e.preventDefault()
        isPanningRef.current = true
        panStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          panX: panX.get(),
          panY: panY.get(),
        }
      }
    },
    [panX, panY],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isPanningRef.current) return
      panX.set(panStartRef.current.panX + (e.clientX - panStartRef.current.x))
      panY.set(panStartRef.current.panY + (e.clientY - panStartRef.current.y))
    },
    [panX, panY],
  )

  const stopPan = useCallback(() => {
    if (!isPanningRef.current) return
    isPanningRef.current = false
    void animate(panX, panX.get(), { ...MAP2_SPRING.slotTap })
    void animate(panY, panY.get(), { ...MAP2_SPRING.slotTap })
  }, [panX, panY])

  const handleBypassToggle = useCallback(
    (blockIndex: number, shouldBypass: boolean) => {
      const block = blockStates.find((b) => b.blockIndex === blockIndex)
      if (!block) return
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

  const currentProgram = intelfx.state?.current_program ?? 0
  const programEntry = intelfx.programs.find((p) => p.program === currentProgram)
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

  return (
    <div className="intelfx-flow">
      <IntelFXFlowToolbar
        currentProgram={currentProgram}
        programName={programEntry?.name ?? ''}
        onProgramStep={handleProgramStep}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={undoRedo.canUndo}
        canRedo={undoRedo.canRedo}
        zoom={zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
      />

      <div className="intelfx-flow__chain-bar">
        <span className="intelfx-flow__chain-label">Chain</span>
        <span className="intelfx-flow__chain-notation" title="Uppercase = active, lowercase = bypassed">
          {chainNotation}
        </span>
      </div>

      <div className="intelfx-flow__workspace">
        <div
          ref={canvasAreaRef}
          className="intelfx-flow__canvas-area"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={stopPan}
          onMouseLeave={stopPan}
        >
          <motion.div
            ref={canvasInnerRef}
            className="intelfx-flow__canvas-inner"
            style={{ transform: canvasTransform }}
          >
            <div className="intelfx-flow__path-row intelfx-flow__path-row--top">
              <div className="intelfx-flow__lane-label">Signal Path</div>

              <div ref={inputNodeRef} className="intelfx-flow__io-node" aria-label="Input">
                <span className="intelfx-flow__io-label">IN</span>
              </div>

              {topRowBlocks.map((block) => (
                <IntelFXFlowBlockCard
                  key={block.effectType}
                  ref={blockRefsMap.current[`block_${block.blockIndex}`] as React.RefObject<HTMLDivElement>}
                  block={block}
                  selected={selectedEffectId === block.effectType}
                  onSelect={setSelectedEffectId}
                  onBypassToggle={handleBypassToggle}
                />
              ))}
            </div>

            <div className="intelfx-flow__path-row intelfx-flow__path-row--bottom">
              {bottomRowBlocks.map((block) => (
                <IntelFXFlowBlockCard
                  key={block.effectType}
                  ref={blockRefsMap.current[`block_${block.blockIndex}`] as React.RefObject<HTMLDivElement>}
                  block={block}
                  selected={selectedEffectId === block.effectType}
                  onSelect={setSelectedEffectId}
                  onBypassToggle={handleBypassToggle}
                />
              ))}

              <div ref={outputNodeRef} className="intelfx-flow__io-node" aria-label="Output">
                <span className="intelfx-flow__io-label">OUT</span>
              </div>
            </div>

            <IntelFXSignalPathPatchCords cords={patchCords} nodeRefs={nodeRefs} canvasRef={canvasInnerRef} />
          </motion.div>
        </div>

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

export { IntelFXSignalPathCanvas as IntelFXFlowCanvas }
export default IntelFXSignalPathCanvas
