import React from 'react'
import { ChevronLeft, ChevronRight, Flash } from '@carbon/icons-react'

import { formatMpx1ProgramNumber } from './programNumber'
import { NumberInput } from '../Controls/NumberInput'

type BypassBlock = 'REV' | 'PIT' | 'DLY' | 'CHO' | 'EQ' | 'MOD'

interface MPX1StatusBarProps {
  connected: boolean
  deviceName: string
  programNumber: number
  programName: string
  lcdText: string
  mixValue: number
  tapTempoBpm: number | null
  bypassState: Record<BypassBlock, boolean>
  onProgramStep: (delta: number) => void
  onMixChange: (value: number) => void
  onTapTempo: () => void
  onToggleBypass: (block: BypassBlock) => void
}

const BYPASS_ORDER: BypassBlock[] = ['REV', 'PIT', 'DLY', 'CHO', 'EQ', 'MOD']

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

export function MPX1StatusBar({
  connected,
  deviceName,
  programNumber,
  programName,
  lcdText,
  mixValue,
  tapTempoBpm,
  bypassState,
  onProgramStep,
  onMixChange,
  onTapTempo,
  onToggleBypass,
}: MPX1StatusBarProps) {
  const safeMix = clamp01(mixValue)

  return (
    <div className="mpx1-statusbar" role="status" aria-label="MPX1 status bar">
      <div className="mpx1-statusbar__left">
        <span className={`mpx1-statusbar__dot${connected ? ' is-online' : ''}`} aria-hidden />
        <span className="mpx1-statusbar__device">{deviceName}</span>
      </div>

      <div className="mpx1-statusbar__program">
        <button
          type="button"
          className="mpx1-statusbar__prog-btn"
          onClick={() => onProgramStep(-1)}
          aria-label="Previous program"
        >
          <ChevronLeft size={12} aria-hidden />
        </button>
        <span className="mpx1-statusbar__prog-number">{formatMpx1ProgramNumber(programNumber)}</span>
        <span className="mpx1-statusbar__prog-name" title={programName}>{programName}</span>
        <button
          type="button"
          className="mpx1-statusbar__prog-btn"
          onClick={() => onProgramStep(1)}
          aria-label="Next program"
        >
          <ChevronRight size={12} aria-hidden />
        </button>
      </div>

      <div className="mpx1-statusbar__lcd" title={lcdText}>
        <span className="mpx1-statusbar__lcd-track">{lcdText}</span>
      </div>

      <div className="mpx1-statusbar__mix">
        <span className="mpx1-statusbar__mix-label">Mix</span>
        <NumberInput
          label="MPX1 global mix"
          value={safeMix}
          min={0}
          max={1}
          step={0.01}
          showLabel={false}
          showBounds={false}
          size="small"
          onChange={(value) => onMixChange(value)}
        />
      </div>

      <button type="button" className="mpx1-statusbar__tap" onClick={onTapTempo}>
        <Flash size={12} aria-hidden />
        TAP {tapTempoBpm ? `${Math.round(tapTempoBpm)} BPM` : 'BPM'}
      </button>

      <div className="mpx1-statusbar__bypass" aria-label="Per-block bypass state">
        {BYPASS_ORDER.map((block) => (
          <button
            key={block}
            type="button"
            className={`mpx1-statusbar__pill${bypassState[block] ? '' : ' is-bypassed'}`}
            onClick={() => onToggleBypass(block)}
          >
            {block}
          </button>
        ))}
      </div>
    </div>
  )
}
