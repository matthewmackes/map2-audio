/**
 * GlitchShifterCard - Airwindows GlitchShifter (Carbon-compliant)
 *
 * Granular pitch shifter using PitchCategoryLayout.
 *
 * LV2 URI: https://hannesbraun.net/ns/lv2/airwindows/glitchshifter
 */

import { useState, useEffect, useCallback } from 'react'
import { PitchCategoryLayout, type ParamSlot } from '../../Layouts/PitchCategoryLayout'
import type { AdvancedSection } from '../../Base/CarbonCardShell'
import {
  ArrowUp,
  ArrowDown,
  Flash,
  Music,
  Reset,
} from '@carbon/icons-react'
import type { PluginCardProps } from '../../types'
import { resolvePluginAccentColor } from '../../../../utils/pluginAccent'

const PARAM_MAP = {
  note: 0,
  trim: 1,
  tighten: 2,
  feedback: 3,
  dryWet: 4,
}

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
  accentColor: providedAccent,
  compact = false,
}: PluginCardProps) {
  const accentColor = resolvePluginAccentColor(providedAccent, plugin.uri, plugin.category)
  const [grains, setGrains] = useState<Array<{ id: number; x: number; y: number; size: number; opacity: number }>>([])

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

  const semitones = getValue('note', 0)
  const trim = getValue('trim', 0)
  const tighten = getValue('tighten', 0.5)
  const feedback = getValue('feedback', 0)
  const dryWet = getValue('dryWet', 0.5)
  const fineCents = Math.round(trim * 100)

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

  const visualization = (
    <div style={{ position: 'relative', padding: '8px 0' }}>
      {/* Grain particle field */}
      <div style={{ height: 80, position: 'relative', background: '#0a0a14', borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path
            d={`M 0 50 Q 25 ${50 - semitones * 2} 50 50 T 100 50`}
            fill="none" stroke={accentColor} strokeWidth="0.5" opacity="0.2"
          />
          {grains.map((grain) => (
            <circle
              key={grain.id}
              cx={grain.x} cy={grain.y + (semitones * -1.5)}
              r={grain.size} fill={accentColor} opacity={grain.opacity}
            />
          ))}
          <line x1="0" y1="50" x2="100" y2="50" stroke="#444" strokeWidth="0.5" strokeDasharray="2,2" />
          <line x1="0" y1={50 - semitones * 2} x2="100" y2={50 - semitones * 2} stroke={accentColor} strokeWidth="1" opacity="0.6" />
        </svg>
      </div>

      {/* Pitch shift display */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          {semitones > 0.5 ? <ArrowUp size={20} style={{ color: accentColor }} /> :
           semitones < -0.5 ? <ArrowDown size={20} style={{ color: accentColor }} /> :
           <Reset size={16} style={{ color: '#6b7280' }} />}
          <span style={{ fontSize: 24, fontWeight: 800, color: accentColor, fontFamily: 'var(--font-mono)' }}>
            {semitones >= 0 ? '+' : ''}{semitones.toFixed(1)}
          </span>
          <span style={{ fontSize: 10, color: '#6b7280' }}>st</span>
        </div>
        <div style={{ fontSize: 11, color: '#9ca3af' }}>{getIntervalName(semitones)}</div>
        {fineCents !== 0 && (
          <div style={{ fontSize: 10, color: fineCents > 0 ? '#22c55e' : '#ef4444' }}>
            {fineCents > 0 ? '+' : ''}{fineCents}\u00a2
          </div>
        )}
        {feedback > 0.1 && (
          <div style={{ fontSize: 10, color: '#a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, marginTop: 2 }}>
            <Flash size={10} /> {Math.round(feedback * 100)}% feedback
          </div>
        )}
        {/* Glitch level bar */}
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 9, color: '#6b7280', letterSpacing: '0.5px' }}>GLITCH</span>
          <div style={{ flex: 1, height: 4, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${(1 - tighten) * 100}%`, height: '100%', background: `linear-gradient(90deg, ${accentColor}, #ef4444)`, borderRadius: 2 }} />
          </div>
        </div>
      </div>
    </div>
  )

  const presets = (
    <div className="carbon-preset-row">
      {INTERVALS.map((interval) => {
        const isActive = Math.abs(semitones - interval.semitones) < 0.5
        return (
          <button
            key={interval.name}
            className={`carbon-preset-btn ${isActive ? 'carbon-preset-btn--active' : ''}`}
            onClick={() => setValue('note', interval.semitones)}
            title={interval.name}
          >
            {interval.symbol}
          </button>
        )
      })}
    </div>
  )

  const semitonesSlot: ParamSlot = {
    label: 'Note', value: semitones,
    min: -12, max: 12, defaultValue: 0, step: 1, unit: 'st',
    onChange: (v) => setValue('note', v),
    valueFormatter: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(0)} st`,
  }

  const centsSlot: ParamSlot = {
    label: 'Trim', value: trim,
    min: -1, max: 1, defaultValue: 0,
    onChange: (v) => setValue('trim', v),
    valueFormatter: (v) => {
      const display = Math.round(v * 100)
      return `${display >= 0 ? '+' : ''}${display}`
    },
  }

  const trackingSlot: ParamSlot = {
    label: 'Tighten', value: tighten,
    min: 0, max: 1, defaultValue: 0.5,
    onChange: (v) => setValue('tighten', v),
    valueFormatter: (v) => {
      if (v > 0.8) return 'Tight'
      if (v > 0.5) return 'Clean'
      if (v > 0.2) return 'Loose'
      return 'Glitchy'
    },
  }

  const feedbackSlot: ParamSlot = {
    label: 'Feedback', value: feedback,
    min: 0, max: 1, defaultValue: 0,
    onChange: (v) => setValue('feedback', v),
    valueFormatter: (v) => `${Math.round(v * 100)}%`,
  }

  const mixSlot: ParamSlot = {
    label: 'Dry/Wet', value: dryWet,
    min: 0, max: 1, defaultValue: 0.5,
    onChange: (v) => setValue('dryWet', v),
    valueFormatter: (v) => {
      if (v < 0.05) return 'Dry'
      if (v > 0.95) return 'Wet'
      return `${Math.round(v * 100)}%`
    },
  }

  return (
    <PitchCategoryLayout
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      bypassed={plugin.bypassed}
      visualization={visualization}
      semitones={semitonesSlot}
      cents={centsSlot}
      tracking={trackingSlot}
      feedback={feedbackSlot}
      mix={mixSlot}
      presets={presets}
    />
  )
}

export default GlitchShifterCard
