/**
 * REEVRCard - REEV-R Reverb (Carbon-compliant)
 *
 * FabFilter Pro-R inspired reverb using ReverbCategoryLayout.
 *
 * LV2 URI: https://github.com/clearly-broken-software/REEV-R
 */

import { useState, useMemo } from 'react'
import { ReverbCategoryLayout, type ParamSlot } from '../../Layouts/ReverbCategoryLayout'
import type { AdvancedSection } from '../../Base/CarbonCardShell'
import { ParameterKnob } from '../../../ParameterControl'
import { Activity, MagicWand } from '@carbon/icons-react'
import type { PluginCardProps } from '../../types'
import { resolvePluginAccentColor } from '../../../../utils/pluginAccent'

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
  accentColor: providedAccent,
  compact = false,
}: PluginCardProps) {
  const accentColor = resolvePluginAccentColor(providedAccent, plugin.uri, plugin.category)
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)

  const getValue = (key: keyof typeof PARAM_MAP, defaultVal: number) =>
    parameterValues[PARAM_MAP[key]] ?? defaultVal

  const setValue = (key: keyof typeof PARAM_MAP, value: number) =>
    onParameterChange(PARAM_MAP[key], value)

  const applyPreset = (preset: typeof SPACE_PRESETS[0]) => {
    setValue('size', preset.size)
    setValue('decay', preset.decay)
    setValue('damping', preset.damping)
    setSelectedPreset(preset.name)
  }

  // Decay curve visualization
  const decayCurve = useMemo(() => {
    const decay = getValue('decay', 2.0)
    const damping = getValue('damping', 50)
    const predelay = getValue('predelay', 20)
    const earlyLevel = getValue('earlyLevel', 80)

    const points: { x: number; y: number }[] = []
    const width = 260
    const height = 80

    const predelayX = (predelay / 200) * width * 0.2
    points.push({ x: 0, y: height })
    points.push({ x: predelayX, y: height })

    const earlyHeight = (earlyLevel / 100) * height * 0.9
    points.push({ x: predelayX + 5, y: height - earlyHeight * 0.7 })
    points.push({ x: predelayX + 15, y: height - earlyHeight })
    points.push({ x: predelayX + 25, y: height - earlyHeight * 0.6 })

    const decayStart = predelayX + 30
    for (let i = 0; i <= 20; i++) {
      const t = i / 20
      const x = decayStart + t * (width - decayStart - 10)
      const dampingFactor = 1 - (damping / 100) * 0.5
      const y = height - (height * 0.8) * Math.exp(-t * (3 / decay)) * dampingFactor
      points.push({ x, y: Math.min(height, y) })
    }

    return points
  }, [getValue])

  const visualization = (
    <div style={{ padding: '8px 0' }}>
      <svg width="364" height="112" viewBox="0 0 260 80" style={{ display: 'block', margin: '0 auto' }}>
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
        {[0.25, 0.5, 0.75].map((y) => (
          <line key={y} x1="0" y1={y * 80} x2="260" y2={y * 80} stroke="#222" strokeWidth="1" />
        ))}
        <path
          d={`M ${decayCurve.map((p) => `${p.x},${p.y}`).join(' L ')} L 260,80 L 0,80 Z`}
          fill="url(#reevr-gradient)"
        />
        <path
          d={`M ${decayCurve.map((p) => `${p.x},${p.y}`).join(' L ')}`}
          fill="none" stroke={accentColor} strokeWidth="2" filter="url(#reevr-glow)"
        />
        <text x="5" y="75" fill="#444" fontSize="8">0ms</text>
        <text x="125" y="75" fill="#444" fontSize="8">{(getValue('decay', 2) / 2).toFixed(1)}s</text>
        <text x="245" y="75" fill="#444" fontSize="8">{getValue('decay', 2).toFixed(1)}s</text>
      </svg>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center', marginTop: 4 }}>
        <MagicWand size={12} style={{ color: accentColor }} />
        <span style={{ fontSize: 11, color: '#9ca3af' }}>{getValue('size', 50).toFixed(0)}% Space</span>
      </div>
    </div>
  )

  const presets = (
    <div className="carbon-preset-row">
      {SPACE_PRESETS.map((preset) => (
        <button
          key={preset.name}
          className={`carbon-preset-btn ${selectedPreset === preset.name ? 'carbon-preset-btn--active' : ''}`}
          onClick={() => applyPreset(preset)}
        >
          {preset.name}
        </button>
      ))}
    </div>
  )

  const advancedSections: AdvancedSection[] = [
    {
      id: 'modulation',
      title: 'Modulation',
      icon: <Activity size={16} />,
      children: (
        <div className="carbon-param-row">
          <ParameterKnob
            label="Rate" value={getValue('modRate', 0.5)}
            min={0.1} max={5} defaultValue={0.5} unit="Hz"
            onChange={(v) => setValue('modRate', v)}
            isLogarithmic valueFormatter={(v) => v.toFixed(2)}
            accentColor={accentColor} size="small"
          />
          <ParameterKnob
            label="Depth" value={getValue('modDepth', 0)}
            min={0} max={100} defaultValue={0} unit="%"
            onChange={(v) => setValue('modDepth', v)}
            accentColor={accentColor} size="small"
          />
        </div>
      ),
    },
    {
      id: 'early-late',
      title: 'Early/Late Balance',
      children: (
        <div className="carbon-param-row">
          <ParameterKnob
            label="Early" value={getValue('earlyLevel', 80)}
            min={0} max={100} defaultValue={80} unit="%"
            onChange={(v) => setValue('earlyLevel', v)}
            accentColor={accentColor} size="small"
          />
          <ParameterKnob
            label="Late" value={getValue('lateLevel', 100)}
            min={0} max={100} defaultValue={100} unit="%"
            onChange={(v) => setValue('lateLevel', v)}
            accentColor={accentColor} size="small"
          />
        </div>
      ),
    },
  ]

  const size: ParamSlot = {
    label: 'Size', value: getValue('size', 50),
    min: 0, max: 100, defaultValue: 50, unit: '%',
    onChange: (v) => { setValue('size', v); setSelectedPreset(null) },
  }

  const width: ParamSlot = {
    label: 'Width', value: getValue('width', 100),
    min: 0, max: 200, defaultValue: 100, unit: '%',
    onChange: (v) => setValue('width', v),
  }

  const diffusion: ParamSlot = {
    label: 'Damping', value: getValue('damping', 50),
    min: 0, max: 100, defaultValue: 50, unit: '%',
    onChange: (v) => { setValue('damping', v); setSelectedPreset(null) },
  }

  const preDelay: ParamSlot = {
    label: 'Pre-Delay', value: getValue('predelay', 20),
    min: 0, max: 200, defaultValue: 20, unit: 'ms',
    onChange: (v) => setValue('predelay', v),
  }

  const decay: ParamSlot = {
    label: 'Decay', value: getValue('decay', 2.0),
    min: 0.1, max: 10, defaultValue: 2.0, unit: 's',
    onChange: (v) => { setValue('decay', v); setSelectedPreset(null) },
    isLogarithmic: true, valueFormatter: (v) => v.toFixed(1),
  }

  const damping: ParamSlot = {
    label: 'Lo Cut', value: getValue('lowCut', 20),
    min: 20, max: 1000, defaultValue: 20, unit: '',
    onChange: (v) => setValue('lowCut', v),
    isLogarithmic: true,
    valueFormatter: (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0) + ' Hz',
  }

  const highCut: ParamSlot = {
    label: 'Hi Cut', value: getValue('highCut', 20000),
    min: 1000, max: 20000, defaultValue: 20000, unit: '',
    onChange: (v) => setValue('highCut', v),
    isLogarithmic: true,
    valueFormatter: (v) => `${(v / 1000).toFixed(1)}k Hz`,
  }

  const dryLevel: ParamSlot = {
    label: 'Dry', value: getValue('dryLevel', 100),
    min: 0, max: 100, defaultValue: 100, unit: '%',
    onChange: (v) => setValue('dryLevel', v),
  }

  const wetLevel: ParamSlot = {
    label: 'Wet', value: getValue('wetLevel', 30),
    min: 0, max: 100, defaultValue: 30, unit: '%',
    onChange: (v) => setValue('wetLevel', v),
  }

  return (
    <ReverbCategoryLayout
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      bypassed={plugin.bypassed}
      visualization={visualization}
      size={size}
      width={width}
      diffusion={diffusion}
      preDelay={preDelay}
      decay={decay}
      damping={damping}
      highCut={highCut}
      dryLevel={dryLevel}
      wetLevel={wetLevel}
      advancedSections={advancedSections}
      presets={presets}
    />
  )
}

export default REEVRCard
