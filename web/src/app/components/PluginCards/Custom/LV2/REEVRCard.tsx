/**
 * REEVRCard - REEV-R Reverb
 *
 * FabFilter Pro-R inspired reverb interface with visual decay curve,
 * space visualization, and intuitive parameter layout.
 *
 * LV2 URI: https://github.com/clearly-broken-software/REEV-R
 */

import { useState, useMemo } from 'react'
import { PluginCardShell } from '../../Base/PluginCardShell'
import { ParameterSection } from '../../Base/ParameterSection'
import { ParameterRow } from '../../Base/ParameterRow'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react'
import type { PluginCardProps } from '../../types'
import './REEVRCard.css'

// REEV-R parameter indices (may need adjustment based on actual plugin)
const PARAM_MAP = {
  dryLevel: 0,
  wetLevel: 1,
  size: 2,
  width: 3,
  predelay: 4,
  decay: 5,
  damping: 6,
  lowCut: 7,
  highCut: 8,
  modRate: 9,
  modDepth: 10,
  earlyLevel: 11,
  lateLevel: 12,
}

// Space presets inspired by FabFilter Pro-R
const SPACE_PRESETS = [
  { name: 'Small Room', size: 20, decay: 0.8, damping: 60 },
  { name: 'Medium Room', size: 40, decay: 1.5, damping: 50 },
  { name: 'Large Hall', size: 70, decay: 3.0, damping: 40 },
  { name: 'Cathedral', size: 95, decay: 6.0, damping: 30 },
  { name: 'Plate', size: 50, decay: 2.0, damping: 70 },
  { name: 'Chamber', size: 35, decay: 1.2, damping: 55 },
]

export function REEVRCard({
  plugin,
  parameterValues,
  onParameterChange,
  accentColor = '#8b5cf6', // Purple for reverb
  compact = false,
}: PluginCardProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)

  const getValue = (key: keyof typeof PARAM_MAP, defaultVal: number) =>
    parameterValues[PARAM_MAP[key]] ?? defaultVal

  const setValue = (key: keyof typeof PARAM_MAP, value: number) =>
    onParameterChange(PARAM_MAP[key], value)

  // Calculate decay curve points for visualization
  const decayCurve = useMemo(() => {
    const decay = getValue('decay', 2.0)
    const damping = getValue('damping', 50)
    const predelay = getValue('predelay', 20)
    const earlyLevel = getValue('earlyLevel', 80)

    const points: { x: number; y: number }[] = []
    const width = 260
    const height = 80

    // Predelay (flat line at 0)
    const predelayX = (predelay / 200) * width * 0.2
    points.push({ x: 0, y: height })
    points.push({ x: predelayX, y: height })

    // Early reflections burst
    const earlyHeight = (earlyLevel / 100) * height * 0.9
    points.push({ x: predelayX + 5, y: height - earlyHeight * 0.7 })
    points.push({ x: predelayX + 15, y: height - earlyHeight })
    points.push({ x: predelayX + 25, y: height - earlyHeight * 0.6 })

    // Decay curve (exponential)
    const decayStart = predelayX + 30
    const decayTime = decay * 40 // Scale for visualization
    for (let i = 0; i <= 20; i++) {
      const t = i / 20
      const x = decayStart + t * (width - decayStart - 10)
      const dampingFactor = 1 - (damping / 100) * 0.5
      const y = height - (height * 0.8) * Math.exp(-t * (3 / decay)) * dampingFactor
      points.push({ x, y: Math.min(height, y) })
    }

    return points
  }, [getValue])

  // Apply preset
  const applyPreset = (preset: typeof SPACE_PRESETS[0]) => {
    setValue('size', preset.size)
    setValue('decay', preset.decay)
    setValue('damping', preset.damping)
    setSelectedPreset(preset.name)
  }

  // Visualization component
  const visualization = (
    <div className="reevr-visualization">
      <svg width="364" height="112" viewBox="0 0 260 80" className="reevr-decay-curve">
        <defs>
          <linearGradient id="reevr-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={accentColor} stopOpacity="0.6" />
            <stop offset="100%" stopColor={accentColor} stopOpacity="0.05" />
          </linearGradient>
          <filter id="reevr-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((y) => (
          <line
            key={y}
            x1="0"
            y1={y * 80}
            x2="260"
            y2={y * 80}
            stroke="#222"
            strokeWidth="1"
          />
        ))}

        {/* Decay curve fill */}
        <path
          d={`M ${decayCurve.map((p) => `${p.x},${p.y}`).join(' L ')} L 260,80 L 0,80 Z`}
          fill="url(#reevr-gradient)"
        />

        {/* Decay curve line */}
        <path
          d={`M ${decayCurve.map((p) => `${p.x},${p.y}`).join(' L ')}`}
          fill="none"
          stroke={accentColor}
          strokeWidth="2"
          filter="url(#reevr-glow)"
        />

        {/* Time markers */}
        <text x="5" y="75" fill="#444" fontSize="8">0ms</text>
        <text x="125" y="75" fill="#444" fontSize="8">{(getValue('decay', 2) / 2).toFixed(1)}s</text>
        <text x="245" y="75" fill="#444" fontSize="8">{getValue('decay', 2).toFixed(1)}s</text>
      </svg>

      {/* Space indicator */}
      <div className="reevr-space-indicator">
        <Sparkles size={12} style={{ color: accentColor }} />
        <span>{getValue('size', 50).toFixed(0)}% Space</span>
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
      {/* Space Presets */}
      <div className="reevr-presets">
        {SPACE_PRESETS.map((preset) => (
          <button
            key={preset.name}
            className={`reevr-preset-chip ${selectedPreset === preset.name ? 'active' : ''}`}
            onClick={() => applyPreset(preset)}
            style={{
              '--accent': accentColor,
            } as React.CSSProperties}
          >
            {preset.name}
          </button>
        ))}
      </div>

      {/* Main Controls */}
      <ParameterSection title="Space" accentColor={accentColor}>
        <ParameterRow>
          <ParameterKnob
            label="Size"
            value={getValue('size', 50)}
            min={0}
            max={100}
            defaultValue={50}
            unit="%"
            onChange={(v) => {
              setValue('size', v)
              setSelectedPreset(null)
            }}
            accentColor={accentColor}
            size="large"
          />
          <ParameterKnob
            label="Decay"
            value={getValue('decay', 2.0)}
            min={0.1}
            max={10}
            defaultValue={2.0}
            unit="s"
            onChange={(v) => {
              setValue('decay', v)
              setSelectedPreset(null)
            }}
            isLogarithmic
            valueFormatter={(v) => v.toFixed(1)}
            accentColor={accentColor}
            size="large"
          />
        </ParameterRow>
      </ParameterSection>

      {/* Character */}
      <ParameterSection title="Character" accentColor={accentColor}>
        <ParameterRow>
          <ParameterKnob
            label="Pre-Delay"
            value={getValue('predelay', 20)}
            min={0}
            max={200}
            defaultValue={20}
            unit="ms"
            onChange={(v) => setValue('predelay', v)}
            accentColor={accentColor}
            size="medium"
          />
          <ParameterKnob
            label="Damping"
            value={getValue('damping', 50)}
            min={0}
            max={100}
            defaultValue={50}
            unit="%"
            onChange={(v) => {
              setValue('damping', v)
              setSelectedPreset(null)
            }}
            accentColor={accentColor}
            size="medium"
          />
          <ParameterKnob
            label="Width"
            value={getValue('width', 100)}
            min={0}
            max={200}
            defaultValue={100}
            unit="%"
            onChange={(v) => setValue('width', v)}
            accentColor={accentColor}
            size="medium"
          />
        </ParameterRow>
      </ParameterSection>

      {/* Mix */}
      <ParameterSection title="Mix" accentColor={accentColor}>
        <ParameterRow>
          <ParameterKnob
            label="Dry"
            value={getValue('dryLevel', 100)}
            min={0}
            max={100}
            defaultValue={100}
            unit="%"
            onChange={(v) => setValue('dryLevel', v)}
            accentColor="#888"
            size="medium"
          />
          <ParameterKnob
            label="Wet"
            value={getValue('wetLevel', 30)}
            min={0}
            max={100}
            defaultValue={30}
            unit="%"
            onChange={(v) => setValue('wetLevel', v)}
            accentColor={accentColor}
            size="medium"
          />
        </ParameterRow>
      </ParameterSection>

      {/* Advanced Section (Collapsible) */}
      <div className="reevr-advanced-toggle">
        <button onClick={() => setShowAdvanced(!showAdvanced)}>
          {showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>Advanced</span>
          <span className="reevr-advanced-indicator" style={{
            background: (getValue('modDepth', 0) > 0 || getValue('lowCut', 20) > 20 || getValue('highCut', 20000) < 20000) ? accentColor : '#333'
          }} />
        </button>
      </div>

      {showAdvanced && (
        <>
          <ParameterSection title="Modulation" accentColor={accentColor}>
            <ParameterRow>
              <ParameterKnob
                label="Rate"
                value={getValue('modRate', 0.5)}
                min={0.1}
                max={5}
                defaultValue={0.5}
                unit="Hz"
                onChange={(v) => setValue('modRate', v)}
                isLogarithmic
                valueFormatter={(v) => v.toFixed(2)}
                accentColor={accentColor}
                size="small"
              />
              <ParameterKnob
                label="Depth"
                value={getValue('modDepth', 0)}
                min={0}
                max={100}
                defaultValue={0}
                unit="%"
                onChange={(v) => setValue('modDepth', v)}
                accentColor={accentColor}
                size="small"
              />
            </ParameterRow>
          </ParameterSection>

          <ParameterSection title="EQ" accentColor={accentColor}>
            <ParameterRow>
              <ParameterKnob
                label="Low Cut"
                value={getValue('lowCut', 20)}
                min={20}
                max={1000}
                defaultValue={20}
                unit="Hz"
                onChange={(v) => setValue('lowCut', v)}
                isLogarithmic
                valueFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : v.toFixed(0)}
                accentColor={accentColor}
                size="small"
              />
              <ParameterKnob
                label="High Cut"
                value={getValue('highCut', 20000)}
                min={1000}
                max={20000}
                defaultValue={20000}
                unit="Hz"
                onChange={(v) => setValue('highCut', v)}
                isLogarithmic
                valueFormatter={(v) => `${(v/1000).toFixed(1)}k`}
                accentColor={accentColor}
                size="small"
              />
            </ParameterRow>
          </ParameterSection>

          <ParameterSection title="Early/Late Balance" accentColor={accentColor}>
            <ParameterRow>
              <ParameterKnob
                label="Early"
                value={getValue('earlyLevel', 80)}
                min={0}
                max={100}
                defaultValue={80}
                unit="%"
                onChange={(v) => setValue('earlyLevel', v)}
                accentColor="#6b7280"
                size="small"
              />
              <ParameterKnob
                label="Late"
                value={getValue('lateLevel', 100)}
                min={0}
                max={100}
                defaultValue={100}
                unit="%"
                onChange={(v) => setValue('lateLevel', v)}
                accentColor={accentColor}
                size="small"
              />
            </ParameterRow>
          </ParameterSection>
        </>
      )}
    </PluginCardShell>
  )
}

export default REEVRCard
