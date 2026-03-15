import { ChevronLeft, ChevronRight } from '@carbon/icons-react'

import { formatIntelFXProgramNumber } from './programNumber'

export type IntelFXBypassState = Record<string, boolean>

interface IntelFXStatusBarProps {
  connected: boolean
  deviceName: string
  programNumber: number
  programName: string
  lcdText: string
  mixValue: number
  tapTempoBpm: number
  bypassState: IntelFXBypassState
  onProgramStep: (delta: number) => void
  onMixChange: (value: number) => void
  onTapTempo: () => void
  onToggleBypass: (block: string) => void
}

export function IntelFXStatusBar({
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
}: IntelFXStatusBarProps) {
  return (
    <div className="intelfx-statusbar">
      <div className="intelfx-statusbar__left">
        <span className={`intelfx-statusbar__dot${connected ? ' is-online' : ''}`} />
        <span className="intelfx-statusbar__device">{deviceName}</span>
      </div>

      <div className="intelfx-statusbar__program">
        <button
          type="button"
          className="intelfx-statusbar__prog-btn"
          onClick={() => onProgramStep(-1)}
          aria-label="Previous program"
        >
          <ChevronLeft size={12} aria-hidden />
        </button>
        <span className="intelfx-statusbar__prog-number">{formatIntelFXProgramNumber(programNumber)}</span>
        <span className="intelfx-statusbar__prog-name">{programName}</span>
        <button
          type="button"
          className="intelfx-statusbar__prog-btn"
          onClick={() => onProgramStep(1)}
          aria-label="Next program"
        >
          <ChevronRight size={12} aria-hidden />
        </button>
      </div>

      <div className="intelfx-statusbar__lcd">
        <span className="intelfx-statusbar__lcd-track">{lcdText}</span>
      </div>

      <div className="intelfx-statusbar__mix">
        <label htmlFor="intelfx-status-mix" className="intelfx-statusbar__mix-label">
          Mix
        </label>
        <input
          id="intelfx-status-mix"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={mixValue}
          onChange={(event) => onMixChange(Number(event.target.value))}
          aria-label="Mix level"
        />
      </div>

      <button type="button" className="intelfx-statusbar__tap" onClick={onTapTempo}>
        TAP {tapTempoBpm} BPM
      </button>

      <div className="intelfx-statusbar__bypass">
        {Object.keys(bypassState).map((block) => (
          <button
            key={block}
            type="button"
            className={`intelfx-statusbar__pill${bypassState[block] ? '' : ' is-bypassed'}`}
            onClick={() => onToggleBypass(block)}
            title={`${block}: ${bypassState[block] ? 'Engaged' : 'Bypassed'}`}
            aria-label={`${block} bypass ${bypassState[block] ? 'engaged' : 'bypassed'}`}
            aria-pressed={!bypassState[block]}
          >
            {block}
          </button>
        ))}
      </div>
    </div>
  )
}

