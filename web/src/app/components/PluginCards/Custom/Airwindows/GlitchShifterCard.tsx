/**
 * GlitchShifterCard - Airwindows GlitchShifter
 *
 * Granular pitch shifter with glitchy artifacts and harmonic generation.
 * Classic Airwindows sound design tool for creative pitch manipulation.
 *
 * LV2 URI: https://hannesbraun.net/ns/lv2/airwindows/glitchshifter
 * Category: Harmonizer / Pitch Shifter
 */

import { useState, useEffect, useCallback } from 'react'
import { PluginCardShell } from '../../Base/PluginCardShell'
import { ParameterSection } from '../../Base/ParameterSection'
import { ParameterRow } from '../../Base/ParameterRow'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import {
  ArrowUp,
  ArrowDown,
  Flash,
  MagicWand,
  Music,
  Reset,
  VolumeUp,
  Waveform,
} from '@carbon/icons-react'
import type { PluginCardProps } from '../../types'
import './GlitchShifterCard.css'

// Airwindows GlitchShifter LV2 control port indices
// Audio ports 0-3 (inL, inR, outL, outR), control ports start at 4
const PARAM_MAP = {
  note: 0,       // Pitch shift: -12 to +12 semitones (index 4 in LV2, but 0 for control)
  trim: 1,       // Fine tune: -1.0 to +1.0 (index 5)
  tighten: 2,    // Grain tighten: 0.0 to 1.0 (index 6)
  feedback: 3,   // Feedback: 0.0 to 1.0 (index 7)
  dryWet: 4,     // Mix: 0.0 to 1.0 (index 8)
}

// Musical intervals for quick selection
const INTERVALS = [
  { name: 'Oct Down', semitones: -12, symbol: '-8va' },
  { name: '5th Down', semitones: -7, symbol: '-5' },
  { name: '4th Down', semitones: -5, symbol: '-4' },
  { name: '3rd Down', semitones: -4, symbol: '-3' },
  { name: '2nd Down', semitones: -2, symbol: '-2' },
  { name: 'Unison', semitones: 0, symbol: '0' },
  { name: '2nd Up', semitones: 2, symbol: '+2' },
  { name: '3rd Up', semitones: 4, symbol: '+3' },
  { name: '4th Up', semitones: 5, symbol: '+4' },
  { name: '5th Up', semitones: 7, symbol: '+5' },
  { name: 'Oct Up', semitones: 12, symbol: '+8va' },
]

// Get interval name from semitones
const getIntervalName = (semitones: number): string => {
  const rounded = Math.round(semitones)
  const interval = INTERVALS.find(i => i.semitones === rounded)
  if (interval) return interval.name

  if (rounded === 0) return 'Unison'
  if (rounded > 0) return `+${rounded} st`
  return `${rounded} st`
}

export function GlitchShifterCard({
  plugin,
  parameterValues,
  onParameterChange,
  onParameterChangeEnd,
  accentColor = '#06b6d4', // Cyan for pitch/harmonizer
  compact = false,
}: PluginCardProps) {
  // Grain animation state
  const [grains, setGrains] = useState<Array<{ id: number; x: number; y: number; size: number; opacity: number }>>([])

  // Get parameter values with defaults
  const getValue = useCallback(
    (key: keyof typeof PARAM_MAP, defaultVal: number) =>
      parameterValues[PARAM_MAP[key]] ?? defaultVal,
    [parameterValues]
  )

  const setValue = useCallback(
    (key: keyof typeof PARAM_MAP, value: number) => {
      onParameterChange(PARAM_MAP[key], value)
    },
    [onParameterChange]
  )

  // Current values (using actual LV2 parameter ranges)
  // Note: -12 to +12 semitones directly
  const semitones = getValue('note', 0)
  // Trim: -1.0 to +1.0 for fine adjustment
  const trim = getValue('trim', 0)
  // Tighten: 0.0 to 1.0 (higher = smoother)
  const tighten = getValue('tighten', 0.5)
  // Feedback: 0.0 to 1.0
  const feedback = getValue('feedback', 0)
  // Dry/Wet: 0.0 to 1.0
  const dryWet = getValue('dryWet', 0.5)

  // Calculate fine tune display from trim (-1 to +1 maps to roughly -100 to +100 cents feel)
  const fineCents = Math.round(trim * 100)

  // Generate glitch grain particles for visualization
  useEffect(() => {
    const interval = setInterval(() => {
      const wetAmount = dryWet
      const glitchiness = 1 - tighten
      const numGrains = Math.floor(3 + (glitchiness * 8) + (wetAmount * 5))

      const newGrains = Array.from({ length: numGrains }, (_, i) => ({
        id: Date.now() + i,
        x: 10 + Math.random() * 80,
        y: 20 + Math.random() * 60,
        size: 2 + Math.random() * (4 + glitchiness * 6),
        opacity: 0.3 + Math.random() * 0.5 * wetAmount,
      }))

      setGrains(newGrains)
    }, 150)

    return () => clearInterval(interval)
  }, [tighten, dryWet])

  // Handle interval quick-select (semitones are direct values -12 to +12)
  const handleIntervalSelect = (targetSemitones: number) => {
    setValue('note', targetSemitones)
  }

  // Visualization component
  const visualization = (
    <div className="glitch-shifter-viz" style={{ '--accent': accentColor } as React.CSSProperties}>
      {/* Grain particle field */}
      <div className="glitch-grain-field">
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          {/* Background waveform hint */}
          <path
            d={`M 0 50 Q 25 ${50 - semitones * 2} 50 50 T 100 50`}
            fill="none"
            stroke={accentColor}
            strokeWidth="0.5"
            opacity="0.2"
          />

          {/* Glitch grains */}
          {grains.map((grain, i) => (
            <g key={grain.id} className="glitch-grain" style={{ animationDelay: `${i * 30}ms` }}>
              <circle
                cx={grain.x}
                cy={grain.y + (semitones * -1.5)}
                r={grain.size}
                fill={accentColor}
                opacity={grain.opacity}
              />
              {/* Glitch trail */}
              {tighten < 0.5 && (
                <line
                  x1={grain.x}
                  y1={grain.y + (semitones * -1.5)}
                  x2={grain.x + (Math.random() - 0.5) * 10}
                  y2={grain.y + (semitones * -1.5) + Math.random() * 5}
                  stroke={accentColor}
                  strokeWidth="0.5"
                  opacity={grain.opacity * 0.5}
                />
              )}
            </g>
          ))}

          {/* Center pitch line */}
          <line x1="0" y1="50" x2="100" y2="50" stroke="#444" strokeWidth="0.5" strokeDasharray="2,2" />

          {/* Shifted pitch line */}
          <line
            x1="0"
            y1={50 - semitones * 2}
            x2="100"
            y2={50 - semitones * 2}
            stroke={accentColor}
            strokeWidth="1"
            opacity="0.6"
          />
        </svg>
      </div>

      {/* Pitch shift display */}
      <div className="glitch-pitch-display">
        <div className="glitch-shift-direction">
          {semitones > 0.5 ? (
            <ArrowUp size={20} style={{ color: accentColor }} />
          ) : semitones < -0.5 ? (
            <ArrowDown size={20} style={{ color: accentColor }} />
          ) : (
            <Reset size={16} style={{ color: '#6b7280' }} />
          )}
        </div>
        <div className="glitch-shift-value">
          <span className="glitch-semitones" style={{ color: accentColor }}>
            {semitones >= 0 ? '+' : ''}{semitones.toFixed(1)}
          </span>
          <span className="glitch-unit">semitones</span>
        </div>
        <div className="glitch-interval-name">
          {getIntervalName(semitones)}
        </div>
        {fineCents !== 0 && (
          <div className="glitch-fine-tune" style={{ color: fineCents > 0 ? '#22c55e' : '#ef4444' }}>
            {fineCents > 0 ? '+' : ''}{fineCents}¢
          </div>
        )}
      </div>

      {/* Feedback indicator */}
      {feedback > 0.1 && (
        <div className="glitch-feedback-indicator" style={{ opacity: feedback }}>
          <Flash size={14} />
          <span>{Math.round(feedback * 100)}%</span>
        </div>
      )}

      {/* Glitch level indicator */}
      <div className="glitch-level-bar">
        <div className="glitch-level-label">GLITCH</div>
        <div className="glitch-level-track">
          <div
            className="glitch-level-fill"
            style={{
              width: `${(1 - tighten) * 100}%`,
              background: `linear-gradient(90deg, ${accentColor}, #ef4444)`,
            }}
          />
        </div>
      </div>
    </div>
  )

  return (
    <PluginCardShell
      plugin={plugin}
      accentColor={accentColor}
      bypassed={plugin.bypassed}
      visualization={visualization}
      compact={compact}
    >
      {/* Quick Interval Selection */}
      <div className="glitch-intervals">
        <div className="glitch-intervals-label">
          <Music size={12} />
          <span>Harmony Intervals</span>
        </div>
        <div className="glitch-interval-chips">
          {INTERVALS.map((interval) => {
            const isActive = Math.abs(semitones - interval.semitones) < 0.5
            return (
              <button
                key={interval.name}
                className={`glitch-interval-chip ${isActive ? 'active' : ''}`}
                onClick={() => handleIntervalSelect(interval.semitones)}
                style={{ '--accent': accentColor } as React.CSSProperties}
                title={interval.name}
              >
                {interval.symbol}
              </button>
            )
          })}
        </div>
      </div>

      {/* Main Pitch Control */}
      <ParameterSection
        title="Pitch Shift"
        icon={<Waveform size={14} />}
        accentColor={accentColor}
      >
        <ParameterRow justify="center">
          <ParameterKnob
            label="Note"
            value={semitones}
            min={-12}
            max={12}
            defaultValue={0}
            step={1}
            onChange={(v) => setValue('note', v)}
            onChangeEnd={onParameterChangeEnd}
            accentColor={accentColor}
            size="large"
            valueFormatter={(v) => {
              return `${v >= 0 ? '+' : ''}${v.toFixed(0)} st`
            }}
          />
          <ParameterKnob
            label="Trim"
            value={trim}
            min={-1}
            max={1}
            defaultValue={0}
            onChange={(v) => setValue('trim', v)}
            onChangeEnd={onParameterChangeEnd}
            accentColor="#94a3b8"
            size="medium"
            valueFormatter={(v) => {
              const display = Math.round(v * 100)
              return `${display >= 0 ? '+' : ''}${display}`
            }}
          />
        </ParameterRow>
      </ParameterSection>

      {/* Character Controls */}
      <ParameterSection
        title="Character"
        icon={<MagicWand size={14} />}
        accentColor={accentColor}
      >
        <ParameterRow>
          <ParameterKnob
            label="Tighten"
            value={tighten}
            min={0}
            max={1}
            defaultValue={0.5}
            onChange={(v) => setValue('tighten', v)}
            onChangeEnd={onParameterChangeEnd}
            accentColor="#f59e0b"
            size="medium"
            valueFormatter={(v) => {
              if (v > 0.8) return 'Tight'
              if (v > 0.5) return 'Clean'
              if (v > 0.2) return 'Loose'
              return 'Glitchy'
            }}
          />
          <ParameterKnob
            label="Feedback"
            value={feedback}
            min={0}
            max={1}
            defaultValue={0}
            onChange={(v) => setValue('feedback', v)}
            onChangeEnd={onParameterChangeEnd}
            accentColor="#a855f7"
            size="medium"
            valueFormatter={(v) => `${Math.round(v * 100)}%`}
          />
        </ParameterRow>
      </ParameterSection>

      {/* Output Mix */}
      <ParameterSection
        title="Mix"
        icon={<VolumeUp size={14} />}
        accentColor={accentColor}
      >
        <ParameterRow justify="center">
          <ParameterKnob
            label="Dry/Wet"
            value={dryWet}
            min={0}
            max={1}
            defaultValue={0.5}
            onChange={(v) => setValue('dryWet', v)}
            onChangeEnd={onParameterChangeEnd}
            accentColor={accentColor}
            size="large"
            valueFormatter={(v) => {
              if (v < 0.05) return 'Dry'
              if (v > 0.95) return 'Wet'
              return `${Math.round(v * 100)}%`
            }}
          />
        </ParameterRow>
      </ParameterSection>

      {/* Footer info */}
      <div className="glitch-footer">
        <div className="glitch-footer-item">
          <span className="glitch-footer-label">Airwindows</span>
          <span className="glitch-footer-value" style={{ color: accentColor }}>GlitchShifter</span>
        </div>
        <div className="glitch-footer-item">
          <span className="glitch-footer-label">Type</span>
          <span className="glitch-footer-value">Harmonizer</span>
        </div>
      </div>
    </PluginCardShell>
  )
}

export default GlitchShifterCard
