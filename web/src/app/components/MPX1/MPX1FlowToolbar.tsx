import React, { useCallback, useRef, useState } from 'react'
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowsOut,
  CaretLeft,
  CaretRight,
  Lightning,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  Power,
} from '@phosphor-icons/react'

import type { UseMPX1StateResult } from '../../../map2/mpx1Api'
import { formatMpx1ProgramName, formatMpx1ProgramNumber } from './programNumber'

interface MPX1FlowToolbarProps {
  mpx1: UseMPX1StateResult
  zoom: number
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
  setLcdText: (text: string) => void
}

export function MPX1FlowToolbar({
  mpx1,
  zoom,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  setLcdText,
}: MPX1FlowToolbarProps) {
  const currentProgram = mpx1.state?.current_program ?? 0
  const programEntry = mpx1.programs.find((p) => p.program === currentProgram)
  const programName = formatMpx1ProgramName(currentProgram, programEntry?.name)
  const maxSlots = Math.max(1, mpx1.registry?.program_management?.program_slots ?? 250)

  const tapTimesRef = useRef<number[]>([])
  const [tapBpm, setTapBpm] = useState<number | null>(null)

  const compareSnapshotRef = useRef<Record<string, number> | null>(null)
  const [comparing, setComparing] = useState(false)

  const handleProgramStep = useCallback(
    (delta: number) => {
      const next = Math.min(maxSlots - 1, Math.max(0, currentProgram + delta))
      void mpx1.setProgram(next).catch((err) => {
        console.error('MPX1 program step:', err)
      })
    },
    [currentProgram, maxSlots, mpx1],
  )

  const handleTapTempo = useCallback(() => {
    const now = Date.now()
    tapTimesRef.current = [...tapTimesRef.current, now].slice(-6)
    const times = tapTimesRef.current
    if (times.length < 2) return

    const intervals: number[] = []
    for (let i = 1; i < times.length; i++) {
      const d = times[i] - times[i - 1]
      if (d > 120 && d < 2200) intervals.push(d)
    }
    if (intervals.length === 0) return

    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const bpm = Math.round(Math.max(30, Math.min(300, 60000 / avg)))
    setTapBpm(bpm)
    setLcdText(`TAP TEMPO • ${bpm} BPM`)
  }, [setLcdText])

  const handleABCompare = useCallback(() => {
    if (!comparing) {
      compareSnapshotRef.current = { ...mpx1.shadow }
      setComparing(true)
      setLcdText('A/B: B snapshot saved — click again to restore')
    } else {
      const snapshot = compareSnapshotRef.current
      if (snapshot) {
        const updates = Object.entries(snapshot).map(([param_id, value]) => ({
          param_id,
          value,
        }))
        void mpx1.setParams(updates).catch((err) => {
          console.error('A/B compare restore:', err)
        })
        setLcdText('A/B: B settings restored')
      }
      compareSnapshotRef.current = null
      setComparing(false)
    }
  }, [comparing, mpx1, setLcdText])

  const handleBypassAll = useCallback(() => {
    setLcdText('BYPASS ALL — use block bypass buttons')
  }, [setLcdText])

  return (
    <div className="mpx1-flow-toolbar" role="toolbar" aria-label="Signal Flow controls">
      {/* Program navigation */}
      <div className="mpx1-flow-toolbar__program">
        <button
          type="button"
          className="mpx1-flow-toolbar__btn"
          onClick={() => handleProgramStep(-1)}
          aria-label="Previous program"
          title="Previous program"
        >
          <CaretLeft size={12} weight="bold" aria-hidden />
        </button>
        <span className="mpx1-flow-toolbar__prog-num">
          {formatMpx1ProgramNumber(currentProgram)}
        </span>
        <span className="mpx1-flow-toolbar__prog-name" title={programName}>
          {programName}
        </span>
        <button
          type="button"
          className="mpx1-flow-toolbar__btn"
          onClick={() => handleProgramStep(1)}
          aria-label="Next program"
          title="Next program"
        >
          <CaretRight size={12} weight="bold" aria-hidden />
        </button>
      </div>

      <div className="mpx1-flow-toolbar__sep" aria-hidden />

      {/* Undo / Redo */}
      <div className="mpx1-flow-toolbar__group">
        <button
          type="button"
          className="mpx1-flow-toolbar__btn"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <ArrowCounterClockwise size={14} aria-hidden />
        </button>
        <button
          type="button"
          className="mpx1-flow-toolbar__btn"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
          aria-label="Redo"
        >
          <ArrowClockwise size={14} aria-hidden />
        </button>
      </div>

      <div className="mpx1-flow-toolbar__sep" aria-hidden />

      {/* Tap Tempo */}
      <button
        type="button"
        className="mpx1-flow-toolbar__tap"
        onClick={handleTapTempo}
        title="Tap Tempo"
        aria-label={tapBpm != null ? `Tap Tempo — ${tapBpm} BPM` : 'Tap Tempo'}
      >
        <Lightning size={12} weight="bold" aria-hidden />
        TAP {tapBpm != null ? `${tapBpm}` : '–'} BPM
      </button>

      {/* A/B Compare */}
      <button
        type="button"
        className={`mpx1-flow-toolbar__ab${comparing ? ' is-comparing' : ''}`}
        onClick={handleABCompare}
        title={comparing ? 'Restore B snapshot' : 'Save A/B snapshot'}
        aria-label={comparing ? 'Restore B snapshot' : 'Save A/B snapshot'}
      >
        {comparing ? 'B' : 'A/B'}
      </button>

      {/* Bypass All indicator */}
      <button
        type="button"
        className="mpx1-flow-toolbar__bypass-all"
        onClick={handleBypassAll}
        title="Toggle all bypasses"
        aria-label="Toggle all bypasses"
      >
        <Power size={14} aria-hidden />
      </button>

      <div className="mpx1-flow-toolbar__spacer" />

      {/* Zoom controls */}
      <div className="mpx1-flow-toolbar__zoom">
        <button
          type="button"
          className="mpx1-flow-toolbar__btn"
          onClick={onZoomOut}
          title="Zoom out"
          aria-label="Zoom out"
        >
          <MagnifyingGlassMinus size={13} aria-hidden />
        </button>
        <span className="mpx1-flow-toolbar__zoom-level">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          className="mpx1-flow-toolbar__btn"
          onClick={onZoomIn}
          title="Zoom in"
          aria-label="Zoom in"
        >
          <MagnifyingGlassPlus size={13} aria-hidden />
        </button>
        <button
          type="button"
          className="mpx1-flow-toolbar__btn"
          onClick={onZoomReset}
          title="Reset zoom (100%)"
          aria-label="Reset zoom"
        >
          <ArrowsOut size={13} aria-hidden />
        </button>
      </div>
    </div>
  )
}
