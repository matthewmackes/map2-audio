/**
 * T2485-2 — generic device status bar.
 *
 * Subsumes MPX1StatusBar + IntelFXStatusBar (which were 95% identical).
 * The two original status bars stay in place during the migration; new
 * device shells (T2485-4..-10) consume this generic primitive directly,
 * and the per-device versions retire as their host shells migrate.
 *
 * Per-device differences are pushed into the props:
 *   - programState.formatNumber — the device's preferred 1-based vs
 *     0-based program-number formatting
 *   - bypassBlocks — variable-length array of toggleable effect blocks
 *     keyed by the device's natural block ids (REV/PIT/DLY/CHO/EQ/MOD,
 *     IntelFX A/B/C, etc.)
 *
 * Hidden / inactive sections collapse cleanly when the corresponding
 * prop is omitted (e.g. devices without a tap-tempo concept omit
 * `tapTempo`; the slot disappears).
 */

import { ChevronLeft, ChevronRight, Flash } from '@carbon/icons-react'

import { NumberInput } from '../../ParameterControl'
import './DeviceStatusBar.css'

export interface DeviceStatusBarBypassBlock {
  /** Stable identifier passed back to onToggleBypass. */
  id: string
  /** Short display label rendered inside the pill (typically 2-4 chars). */
  label: string
  /** True when the block is engaged (i.e. NOT bypassed). */
  engaged: boolean
}

export interface DeviceStatusBarProgramState {
  number: number
  name: string
  /** 1-based / 0-based / hex etc. — owned by the device. */
  formatNumber: (n: number) => string
}

export interface DeviceStatusBarTapTempo {
  bpm: number | null
  onTap: () => void
}

export interface DeviceStatusBarMix {
  value: number
  ariaLabel: string
  onChange: (next: number) => void
}

export interface DeviceStatusBarProps {
  connected: boolean
  deviceName: string
  lcdText: string
  /**
   * If omitted, the program stepper section is hidden — useful for
   * devices that don't have a discrete program-number concept (e.g.
   * pure-CC controllers).
   */
  programState?: DeviceStatusBarProgramState
  onProgramStep?: (delta: number) => void
  /**
   * If omitted, the mix slot is hidden.
   */
  mix?: DeviceStatusBarMix
  /**
   * If omitted, the TAP button is hidden.
   */
  tapTempo?: DeviceStatusBarTapTempo
  /**
   * If omitted or empty, the bypass-pill row is hidden.
   */
  bypassBlocks?: DeviceStatusBarBypassBlock[]
  onToggleBypass?: (blockId: string) => void
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

export function DeviceStatusBar({
  connected,
  deviceName,
  lcdText,
  programState,
  onProgramStep,
  mix,
  tapTempo,
  bypassBlocks,
  onToggleBypass,
}: DeviceStatusBarProps) {
  return (
    <div
      className="device-statusbar"
      role="status"
      aria-label={`${deviceName} status bar`}
      data-connected={connected ? 'true' : 'false'}
    >
      <div className="device-statusbar__left">
        <span
          className={`device-statusbar__dot${connected ? ' is-online' : ''}`}
          aria-hidden
        />
        <span className="device-statusbar__device">{deviceName}</span>
      </div>

      {programState && onProgramStep ? (
        <div className="device-statusbar__program">
          <button
            type="button"
            className="device-statusbar__prog-btn"
            onClick={() => onProgramStep(-1)}
            aria-label="Previous program"
          >
            <ChevronLeft size={12} aria-hidden />
          </button>
          <span className="device-statusbar__prog-number">
            {programState.formatNumber(programState.number)}
          </span>
          <span
            className="device-statusbar__prog-name"
            title={programState.name}
          >
            {programState.name}
          </span>
          <button
            type="button"
            className="device-statusbar__prog-btn"
            onClick={() => onProgramStep(1)}
            aria-label="Next program"
          >
            <ChevronRight size={12} aria-hidden />
          </button>
        </div>
      ) : null}

      <div className="device-statusbar__lcd" title={lcdText}>
        <span className="device-statusbar__lcd-track">{lcdText}</span>
      </div>

      {mix ? (
        <div className="device-statusbar__mix">
          <span className="device-statusbar__mix-label">Mix</span>
          <NumberInput
            label={mix.ariaLabel}
            value={clamp01(mix.value)}
            min={0}
            max={1}
            step={0.01}
            showLabel={false}
            showBounds={false}
            size="small"
            onChange={(value) => mix.onChange(value)}
          />
        </div>
      ) : null}

      {tapTempo ? (
        <button
          type="button"
          className="device-statusbar__tap"
          onClick={tapTempo.onTap}
          aria-label="Tap tempo"
        >
          <Flash size={12} aria-hidden />
          TAP {tapTempo.bpm ? `${Math.round(tapTempo.bpm)} BPM` : 'BPM'}
        </button>
      ) : null}

      {bypassBlocks && bypassBlocks.length > 0 && onToggleBypass ? (
        <div
          className="device-statusbar__bypass"
          aria-label="Per-block bypass state"
        >
          {bypassBlocks.map((block) => (
            <button
              key={block.id}
              type="button"
              className={`device-statusbar__pill${block.engaged ? '' : ' is-bypassed'}`}
              onClick={() => onToggleBypass(block.id)}
              title={`${block.label}: ${block.engaged ? 'Engaged' : 'Bypassed'}`}
              aria-label={`${block.label} bypass ${block.engaged ? 'engaged' : 'bypassed'}`}
              aria-pressed={!block.engaged}
            >
              {block.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
