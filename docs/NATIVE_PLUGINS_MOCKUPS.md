# Native Plugins Advanced Controls - Visual Mockups & Code Examples

## 1. PAGE LAYOUT MOCKUPS

### Full Page Desktop View (1440px width)

```
═════════════════════════════════════════════════════════════════════════════════
                        NATIVE AUDIO PROCESSORS
           Professional guitar signal chain with real-time visualization
═════════════════════════════════════════════════════════════════════════════════

                  Input ──→ [NAM] ──→ [Cabinet] ──→ [Reverb] ──→ Output
                          Advanced Controls & Monitoring

┌─────────────────────────────────┐ ┌──────────────────────────────┐ ┌──────────────┐
│                                 │ │                              │ │              │
│     NAM PLAYER (Neural Amp)     │ │   CABINET IR (Speaker Sim)   │ │ REVERB IR    │
│                                 │ │                              │ │              │
│  ┌───────────────────────────┐  │ │  ┌────────────────────────┐  │ │ ┌──────────┐ │
│  │ Input  ▐██░░░ -6dB        │  │ │  │ Frequency Response    │  │ │ │ Decay    │ │
│  │ Output ▐███░░░ -3dB       │  │ │  │ ┌──────────────────┐  │  │ │ │ Tail (dB)│ │
│  │        (peak: +2dB)       │  │ │  │ │  ┌─────┐         │  │  │ │ │ 0│       │ │
│  └───────────────────────────┘  │ │  │  │  │     └───────┐ │  │  │ │ │ ││  ┌──  │ │
│                                 │ │  │  │  │             └─┤  │  │ │ │ ││  │    │ │
│  Model:  [My Amp v2 ▼]          │ │  │  │  │               └──┼──┤  │ │ │━━━┴──  │ │
│  Mix:    ●─────────── 100%      │ │  │  │  └──────────────────┘  │  │ │ │ -∞    │ │
│  Tone:   ●─────────── 50%       │ │  │  │  20Hz  1K   10K 20K    │  │ │ └──────────┘
│                                 │ │  │  │                        │  │ │              │
│  ☐ Bypass        [Reset Model]  │ │  │  │ In: ▐████░ -12dB      │  │ │ In: ▐████░  │
│                                 │ │  │  │ Out: ▐███░░ -9dB      │  │ │ Out: ▐███░░ │
│  Status: "Model loaded" ✓       │ │  │  │                        │  │ │              │
│  Latency: 0.5ms                 │ │  │  │ Cabinet: [1x12 ▼]     │  │ │ Mix: 30%    │
│                                 │ │  │  │ Mix: ●────────── 100% │  │ │ Decay: 2.5s │
│                                 │ │  │  │ ☐ Bypass  [Browse...]  │  │ │ ☐ Bypass   │
│                                 │ │  │  │                        │  │ │              │
│                                 │ │  │  │ Latency: 2048 samples │  │ │ Latency: 8K │
│                                 │ │  │  │                        │  │ │ Size: 4.2s  │
└─────────────────────────────────┘ └──────────────────────────────┘ └──────────────┘

───────────────────────────────────────────────────────────────────────────────────────
                            GLOBAL AUDIO STATISTICS
        Master Input: -18 dB | Master Output: -15 dB | Processing Time: 2.3ms
═════════════════════════════════════════════════════════════════════════════════════
```

### Tablet View (768px width)

```
═════════════════════════════════════════════════════════════════════════════
                    NATIVE AUDIO PROCESSORS
═════════════════════════════════════════════════════════════════════════════

        Input ──→ [NAM] ──→ [Cabinet] ──→ [Reverb] ──→ Output

┌──────────────────────────────────────────────┐
│                                              │
│      NAM PLAYER (Neural Amp)            [⚡] │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │ Input  ▐██░░░ -6dB                  │   │
│  │ Output ▐███░░░ -3dB (peak: +2dB)    │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  Model: [My Amp v2 ▼]                       │
│  Mix:   ●──────────────────────── 100%      │
│  Tone:  ●──────────────────────── 50%       │
│  ☐ Bypass    [Reset Model]                  │
│                                              │
│  Status: "Model loaded" ✓                   │
│  Latency: 0.5ms                             │
│                                              │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│                                              │
│      CABINET IR (Speaker Sim)            [◉] │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │ Frequency Response Chart (see above) │   │
│  │ In: ▐████░ -12dB                    │   │
│  │ Out: ▐███░░ -9dB                    │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  Cabinet: [1x12 Celestion ▼]                │
│  Mix:     ●──────────────── 100%            │
│  ☐ Bypass      [Browse IRs...]              │
│  Latency: 2048 samples                      │
│                                              │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│                                              │
│      REVERB IR                           [◉] │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │ Reverb Tail Decay (see above)        │   │
│  │ In: ▐████░ -12dB                    │   │
│  │ Out: ▐███░░ -9dB                    │   │
│  └──────────────────────────────────────┘   │
│                                              │
│  Space: [Large Hall ▼]                      │
│  Mix:   ●────────────────────────── 30%     │
│  Decay: ●────────────────────────── 2.5s    │
│  ☐ Bypass      [Browse IRs...]              │
│  Latency: 8192 samples                      │
│                                              │
└──────────────────────────────────────────────┘

───────────────────────────────────────────────────────────────────────────────
  Master Input: -18 dB | Output: -15 dB | Processing: 2.3ms
═════════════════════════════════════════════════════════════════════════════
```

### Mobile View (375px width)

```
══════════════════════════════════════════
        NATIVE PROCESSORS
══════════════════════════════════════════

Input ─→ [NAM] ─→ [CAB] ─→ [REV] ─→ Out

┌────────────────────────────────────┐
│ 🎸 NAM PLAYER              [⚡]     │
├────────────────────────────────────┤
│                                    │
│  In ▐██░░░ -6dB                   │
│  Out ▐███░░░ -3dB (✦ +2dB)        │
│                                    │
│  Model: [My Amp v2 ▼]             │
│  Mix:   ●──────────── 100%        │
│  Tone:  ●──────────── 50%         │
│  ☐ Bypass [Reset]                 │
│                                    │
│  Status: ✓ Ready (0.5ms)           │
│                                    │
└────────────────────────────────────┘

┌────────────────────────────────────┐
│ 🔊 CABINET IR              [◉]     │
├────────────────────────────────────┤
│ Frequency Response [mini chart]    │
│  In ▐████░ -12dB                  │
│  Out ▐███░░ -9dB                  │
│                                    │
│  Cabinet: [1x12 ▼]                │
│  Mix:     ●────────── 100%        │
│  ☐ Bypass [Browse...]             │
│  Latency: 2048sp (42.6ms)          │
│                                    │
└────────────────────────────────────┘

┌────────────────────────────────────┐
│ 🌊 REVERB IR               [◉]     │
├────────────────────────────────────┤
│ Decay Tail [mini chart]            │
│  In ▐████░ -12dB                  │
│  Out ▐███░░ -9dB                  │
│                                    │
│  Space: [Large Hall ▼]            │
│  Mix:   ●────────────── 30%       │
│  Decay: ●────────────── 2.5s      │
│  ☐ Bypass [Browse...]             │
│  Latency: 8192sp (170ms)           │
│                                    │
└────────────────────────────────────┘

──────────────────────────────────────
  In: -18dB | Out: -15dB | Proc: 2.3ms
══════════════════════════════════════
```

---

## 2. CODE EXAMPLES

### 2.1 NativePluginsPage.tsx - Main Page

```typescript
// web/src/app/pages/NativePluginsPage.tsx

import { useEffect, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { SignalFlowVisualization } from '../components/NativePlugins/SignalFlowVisualization'
import { NAMCard } from '../components/NativePlugins/NAMCard'
import { CabinetIRCard } from '../components/NativePlugins/CabinetIRCard'
import { ReverbIRCard } from '../components/NativePlugins/ReverbIRCard'
import { useNativePlugins } from '../hooks/useNativePlugins'

export function NativePluginsPage() {
  const {
    nam,
    cabinet,
    reverb,
    isLoading,
    isError,
    updateNAMModel,
    updateNAMMix,
    updateCabinetIR,
    updateCabinetMix,
    updateReverbIR,
    updateReverbMix
  } = useNativePlugins()

  if (isError) {
    return (
      <div className="stack">
        <PageHeader 
          title="Native Plugins"
          subtitle="Error loading plugin data"
        />
        <div className="card" style={{ color: '#ef4444' }}>
          Unable to load plugin data. Please check your connection.
        </div>
      </div>
    )
  }

  return (
    <div className="stack">
      {/* Header */}
      <PageHeader
        title="Native Audio Processors"
        subtitle="Advanced controls for NAM, Cabinet IR, and Reverb IR with real-time visualization"
      />

      {/* Signal Flow Visualization */}
      <div className="card native-plugins-signal-flow">
        <SignalFlowVisualization
          namStatus={nam.bypass ? 'inactive' : 'active'}
          cabinetStatus={cabinet.bypass ? 'inactive' : 'active'}
          reverbStatus={reverb.bypass ? 'inactive' : 'active'}
        />
      </div>

      {/* Three-Column Plugin Grid */}
      <div className="plugins-grid">
        <NAMCard
          status={nam}
          onModelChange={updateNAMModel}
          onMixChange={updateNAMMix}
        />
        <CabinetIRCard
          status={cabinet}
          onIRChange={updateCabinetIR}
          onMixChange={updateCabinetMix}
        />
        <ReverbIRCard
          status={reverb}
          onIRChange={updateReverbIR}
          onMixChange={updateReverbMix}
        />
      </div>

      {/* Global Statistics Panel */}
      <div className="card native-plugins-stats">
        <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h4 style={{ marginBottom: 8 }}>Global Audio Statistics</h4>
            <div className="flex" style={{ gap: 32, fontSize: 13 }}>
              <div>
                <span style={{ color: '#888' }}>Master Input:</span>
                <span style={{ marginLeft: 8, fontWeight: 500 }}>
                  {nam.inputLevel.toFixed(1)} dB
                </span>
              </div>
              <div>
                <span style={{ color: '#888' }}>Master Output:</span>
                <span style={{ marginLeft: 8, fontWeight: 500 }}>
                  {reverb.outputLevel.toFixed(1)} dB
                </span>
              </div>
              <div>
                <span style={{ color: '#888' }}>Processing Time:</span>
                <span style={{ marginLeft: 8, fontWeight: 500 }}>
                  ~{(nam.latency + cabinet.latency + reverb.latency).toFixed(2)}ms
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

### 2.2 NAMCard.tsx Component

```typescript
// web/src/app/components/NativePlugins/NAMCard.tsx

import { useState, useEffect } from 'react'
import { Zap } from 'lucide-react'
import { PluginCard } from './PluginCard'
import { AudioMeter } from '../Visualizations/AudioMeter'
import { ParameterSlider } from '../Controls/ParameterSlider'
import { StatusBadge } from '../Visualizations/StatusBadge'

interface NAMStatus {
  available: boolean
  activeModel: string | null
  mix: number
  bypass: boolean
  inputLevel: number
  outputLevel: number
  peakInput: number
  peakOutput: number
  latency: number
  availableModels: string[]
}

interface NAMCardProps {
  status: NAMStatus
  onModelChange?: (modelName: string) => void
  onMixChange?: (mix: number) => void
  onBypassChange?: (bypass: boolean) => void
}

export function NAMCard({
  status,
  onModelChange,
  onMixChange,
  onBypassChange
}: NAMCardProps) {
  const [selectedModel, setSelectedModel] = useState(status.activeModel || '')
  const [mix, setMix] = useState(status.mix)

  useEffect(() => {
    setSelectedModel(status.activeModel || '')
    setMix(status.mix)
  }, [status])

  const handleModelChange = (modelName: string) => {
    setSelectedModel(modelName)
    onModelChange?.(modelName)
  }

  const handleMixChange = (newMix: number) => {
    setMix(newMix)
    onMixChange?.(newMix)
  }

  return (
    <PluginCard
      title="NAM Player"
      icon={<Zap size={24} />}
      color="nam"
      status={status.available ? (status.bypass ? 'inactive' : 'active') : 'error'}
    >
      {/* Visualization Area */}
      <div className="plugin-card__visualization" style={{ marginBottom: 20 }}>
        <div style={{ display: 'grid', gap: 12 }}>
          {/* Input/Output Meters */}
          <div>
            <AudioMeter
              label="Input"
              value={status.inputLevel}
              peak={status.peakInput}
              min={-60}
              max={12}
              unit="dB"
            />
          </div>
          <div>
            <AudioMeter
              label="Output"
              value={status.outputLevel}
              peak={status.peakOutput}
              min={-60}
              max={12}
              unit="dB"
            />
          </div>
        </div>
      </div>

      {/* Controls Section */}
      <div className="plugin-card__controls" style={{ marginBottom: 16 }}>
        {/* Model Selector */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 6 }}>
            Model
          </label>
          <select
            value={selectedModel}
            onChange={(e) => handleModelChange(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: '#252540',
              color: '#f2f6ff',
              border: '1px solid #444',
              borderRadius: 6,
              fontSize: 13,
              cursor: 'pointer'
            }}
          >
            <option value="">-- Select Model --</option>
            {status.availableModels.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </div>

        {/* Mix Slider */}
        <ParameterSlider
          label="Wet/Dry Mix"
          value={mix}
          min={0}
          max={100}
          unit="%"
          onChange={handleMixChange}
          showValue={true}
        />

        {/* Bypass Toggle */}
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            id="nam-bypass"
            checked={status.bypass}
            onChange={(e) => onBypassChange?.(e.target.checked)}
            style={{ width: 18, height: 18, cursor: 'pointer' }}
          />
          <label htmlFor="nam-bypass" style={{ fontSize: 12, cursor: 'pointer' }}>
            Bypass
          </label>
          <button
            style={{
              marginLeft: 'auto',
              padding: '6px 12px',
              background: '#252540',
              color: '#f2f6ff',
              border: '1px solid #444',
              borderRadius: 4,
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            Reset Model
          </button>
        </div>
      </div>

      {/* Info Panel */}
      <div className="plugin-card__info" style={{
        fontSize: 12,
        color: '#888',
        borderTop: '1px solid #444',
        paddingTop: 12
      }}>
        <div style={{ marginBottom: 4 }}>
          {status.activeModel ? (
            <>
              <span style={{ color: '#37d6c9' }}>✓</span> Model loaded: {status.activeModel}
            </>
          ) : (
            <>
              <span style={{ color: '#f59e0b' }}>○</span> No model selected
            </>
          )}
        </div>
        <div>Latency: {status.latency.toFixed(2)}ms</div>
      </div>
    </PluginCard>
  )
}
```

### 2.3 FrequencyResponseChart.tsx

```typescript
// web/src/app/components/Visualizations/FrequencyResponseChart.tsx

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface FrequencyResponseChartProps {
  data: Array<{ freq: number; magnitude: number }>
  width?: number
  height?: number
}

export function FrequencyResponseChart({
  data,
  width = 400,
  height = 200
}: FrequencyResponseChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 20, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#444" />
        <XAxis
          dataKey="freq"
          scale="log"
          type="number"
          domain={[20, 20000]}
          label={{ value: 'Frequency (Hz)', position: 'insideBottomRight', offset: -10 }}
          tick={{ fontSize: 11, fill: '#888' }}
        />
        <YAxis
          label={{ value: 'Magnitude (dB)', angle: -90, position: 'insideLeft' }}
          domain={[-24, 12]}
          tick={{ fontSize: 11, fill: '#888' }}
        />
        <Tooltip
          contentStyle={{
            background: '#1a1628',
            border: '1px solid #444',
            borderRadius: 6
          }}
          formatter={(value: number) => value.toFixed(1)}
          labelFormatter={(value: number) => `${value.toFixed(0)} Hz`}
        />
        <Line
          type="monotone"
          dataKey="magnitude"
          stroke="#37d6c9"
          strokeWidth={2}
          dot={false}
          isAnimationActive={true}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
```

### 2.4 AudioMeter.tsx

```typescript
// web/src/app/components/Visualizations/AudioMeter.tsx

import { useEffect, useState } from 'react'

interface AudioMeterProps {
  label?: string
  value: number
  peak: number
  min?: number
  max?: number
  unit?: string
  showPeak?: boolean
  showValue?: boolean
}

export function AudioMeter({
  label,
  value,
  peak,
  min = -60,
  max = 12,
  unit = 'dB',
  showPeak = true,
  showValue = true
}: AudioMeterProps) {
  const [peakHold, setPeakHold] = useState(peak)
  const [peakDecayTimer, setPeakDecayTimer] = useState<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (peak > peakHold) {
      setPeakHold(peak)
      
      // Clear existing timer
      if (peakDecayTimer) clearTimeout(peakDecayTimer)
      
      // Set new timer to decay peak after 2 seconds
      const timer = setTimeout(() => {
        setPeakHold(value)
      }, 2000)
      
      setPeakDecayTimer(timer)
    }
  }, [peak])

  const range = max - min
  const percentage = Math.max(0, Math.min(100, ((value - min) / range) * 100))
  const peakPercentage = Math.max(0, Math.min(100, ((peakHold - min) / range) * 100))

  // Color based on level
  let barColor = '#10b981' // Green
  if (percentage > 75) barColor = '#f59e0b' // Yellow
  if (percentage > 95) barColor = '#ef4444' // Red

  return (
    <div style={{ marginBottom: 12 }}>
      {label && (
        <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
          {label}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative', height: 16, background: '#1a1628', borderRadius: 4, overflow: 'hidden' }}>
          {/* Main meter bar */}
          <div
            style={{
              height: '100%',
              width: `${percentage}%`,
              background: barColor,
              transition: 'width 0.05s ease-out',
              borderRight: `2px solid ${barColor}`
            }}
          />
          {/* Peak indicator */}
          {showPeak && peakPercentage > 0 && (
            <div
              style={{
                position: 'absolute',
                left: `${peakPercentage}%`,
                top: 0,
                height: '100%',
                width: '2px',
                background: '#fff',
                boxShadow: '0 0 4px rgba(255, 255, 255, 0.5)'
              }}
            />
          )}
        </div>
        {showValue && (
          <div style={{ fontSize: 12, color: '#f2f6ff', minWidth: 60, textAlign: 'right' }}>
            {value.toFixed(1)} {unit}
          </div>
        )}
        {showPeak && (
          <div style={{ fontSize: 11, color: '#888', minWidth: 70, textAlign: 'right' }}>
            peak: {peakHold.toFixed(1)} {unit}
          </div>
        )}
      </div>
    </div>
  )
}
```

### 2.5 ParameterSlider.tsx

```typescript
// web/src/app/components/Controls/ParameterSlider.tsx

import { useState, useCallback } from 'react'

interface ParameterSliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange?: (value: number) => void
  showValue?: boolean
  valueFormatter?: (value: number) => string
}

export function ParameterSlider({
  label,
  value,
  min,
  max,
  step = (max - min) / 100,
  unit = '',
  onChange,
  showValue = true,
  valueFormatter = (v) => v.toFixed(1)
}: ParameterSliderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [displayValue, setDisplayValue] = useState(value)

  const handleChange = useCallback((newValue: number) => {
    setDisplayValue(newValue)
    onChange?.(newValue)
  }, [onChange])

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <label style={{ fontSize: 12, color: '#888' }}>
          {label}
        </label>
        {showValue && (
          <span style={{ fontSize: 12, color: '#f2f6ff', fontWeight: 500 }}>
            {valueFormatter(displayValue)} {unit}
          </span>
        )}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={displayValue}
        onChange={(e) => handleChange(parseFloat(e.target.value))}
        onMouseDown={() => setIsDragging(true)}
        onMouseUp={() => setIsDragging(false)}
        onTouchStart={() => setIsDragging(true)}
        onTouchEnd={() => setIsDragging(false)}
        style={{
          width: '100%',
          height: 6,
          background: '#252540',
          borderRadius: 3,
          cursor: 'pointer',
          outline: 'none',
          accentColor: isDragging ? '#ff6b9d' : '#37d6c9',
          transition: 'accentColor 0.2s ease'
        }}
      />
    </div>
  )
}
```

### 2.6 CSS Stylesheet

```css
/* web/src/app/styles/native-plugins.css */

/* ============= Page Layout ============= */

.native-plugins-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.native-plugins-signal-flow {
  padding: 16px;
  background: linear-gradient(135deg, rgba(14, 22, 37, 0.5), rgba(20, 30, 50, 0.5));
  border: 1px solid rgba(55, 214, 201, 0.1);
  border-radius: 8px;
}

.plugins-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
  margin: 16px 0;
}

.native-plugins-stats {
  padding: 16px;
  background: linear-gradient(135deg, rgba(10, 63, 81, 0.3), rgba(30, 111, 127, 0.3));
  border: 1px solid rgba(55, 214, 201, 0.15);
}

/* ============= Plugin Cards ============= */

.plugin-card {
  display: flex;
  flex-direction: column;
  padding: 16px;
  background: linear-gradient(135deg, #0e1625, #141e32);
  border: 1px solid rgba(55, 214, 201, 0.2);
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
  transition: all 0.3s ease;
}

.plugin-card:hover {
  border-color: rgba(55, 214, 201, 0.4);
  box-shadow: 0 8px 12px rgba(0, 0, 0, 0.4);
  transform: translateY(-2px);
}

.plugin-card--nam {
  --plugin-accent: #ff6b9d;
  --plugin-gradient: linear-gradient(135deg, rgba(45, 27, 78, 0.3), rgba(90, 45, 143, 0.3));
}

.plugin-card--cabinet {
  --plugin-accent: #ffb84d;
  --plugin-gradient: linear-gradient(135deg, rgba(61, 40, 23, 0.3), rgba(139, 90, 43, 0.3));
}

.plugin-card--reverb {
  --plugin-accent: #37d6c9;
  --plugin-gradient: linear-gradient(135deg, rgba(10, 63, 81, 0.3), rgba(30, 111, 127, 0.3));
}

.plugin-card__header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.plugin-card__icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--plugin-gradient);
  border-radius: 6px;
  color: var(--plugin-accent);
}

.plugin-card__title {
  flex: 1;
  font-weight: 600;
  font-size: 14px;
  color: #f2f6ff;
}

.plugin-card__status {
  width: 24px;
  height: 24px;
}

.plugin-card__visualization {
  width: 100%;
  margin-bottom: 12px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.plugin-card__controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.plugin-card__info {
  font-size: 11px;
  color: #888;
  line-height: 1.4;
}

/* ============= Status Badge ============= */

.status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-weight: bold;
  transition: all 0.3s ease;
}

.status-badge--active {
  background: #10b981;
  color: white;
  animation: pulse 2s infinite;
}

.status-badge--inactive {
  background: #6b7280;
  color: white;
}

.status-badge--error {
  background: #ef4444;
  color: white;
  animation: shake 0.3s ease-out;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
  50% { box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}

/* ============= Audio Meter ============= */

.audio-meter {
  width: 100%;
}

.audio-meter__bar {
  height: 16px;
  background: #1a1628;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 4px;
}

.audio-meter__fill {
  height: 100%;
  transition: width 0.05s ease-out;
  border-radius: 2px;
}

/* ============= Responsive Design ============= */

@media (max-width: 1024px) {
  .plugins-grid {
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  }
}

@media (max-width: 768px) {
  .plugins-grid {
    grid-template-columns: 1fr;
  }
  
  .plugin-card {
    padding: 12px;
  }

  .native-plugins-stats {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 12px;
  }
}

@media (max-width: 480px) {
  .plugins-grid {
    gap: 12px;
  }

  .plugin-card {
    padding: 10px;
    border-radius: 6px;
  }

  .plugin-card__header {
    gap: 8px;
  }

  input[type="range"] {
    height: 8px !important;
  }

  button {
    font-size: 11px !important;
    padding: 6px 10px !important;
  }
}

/* ============= Animations ============= */

@media (prefers-reduced-motion: reduce) {
  .plugin-card,
  .audio-meter__fill,
  .status-badge {
    transition: none !important;
    animation: none !important;
  }
}
```

---

## 3. API Integration Example

### useNativePlugins Hook

```typescript
// web/src/app/hooks/useNativePlugins.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'

const NAM_QUERY_KEY = ['native-plugins', 'nam']
const CABINET_QUERY_KEY = ['native-plugins', 'cabinet']
const REVERB_QUERY_KEY = ['native-plugins', 'reverb']

export function useNativePlugins() {
  const queryClient = useQueryClient()

  // Fetch NAM status
  const namQuery = useQuery({
    queryKey: NAM_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch('/api/nam/status')
      return res.json()
    },
    refetchInterval: 100, // Update every 100ms for real-time feel
  })

  // Fetch Cabinet IR status
  const cabinetQuery = useQuery({
    queryKey: CABINET_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch('/api/ir/status?type=cabinet')
      return res.json()
    },
    refetchInterval: 100,
  })

  // Fetch Reverb IR status
  const reverbQuery = useQuery({
    queryKey: REVERB_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch('/api/ir/status?type=reverb')
      return res.json()
    },
    refetchInterval: 100,
  })

  // Mutations
  const updateNAMModelMutation = useMutation({
    mutationFn: async (modelName: string) => {
      const res = await fetch(`/api/nam/set-model/${modelName}`, {
        method: 'POST'
      })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NAM_QUERY_KEY })
    }
  })

  const updateNAMMixMutation = useMutation({
    mutationFn: async (mix: number) => {
      const res = await fetch(`/api/nam/set-mix/${mix}`, {
        method: 'POST'
      })
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NAM_QUERY_KEY })
    }
  })

  // Similar for Cabinet and Reverb...

  return {
    nam: namQuery.data || {},
    cabinet: cabinetQuery.data || {},
    reverb: reverbQuery.data || {},
    isLoading: namQuery.isLoading || cabinetQuery.isLoading || reverbQuery.isLoading,
    isError: namQuery.isError || cabinetQuery.isError || reverbQuery.isError,
    updateNAMModel: updateNAMModelMutation.mutate,
    updateNAMMix: updateNAMMixMutation.mutate,
  }
}
```

---

## 4. Deployment Notes

### Before going live:

1. **Verify API endpoints** are returning correct data format
2. **Test WebSocket** connection for real-time updates
3. **Performance test** with all 3 charts updating simultaneously
4. **Mobile testing** on actual devices (iOS Safari, Android Chrome)
5. **Accessibility audit** with screen readers
6. **Cross-browser testing** (Chrome, Firefox, Safari, Edge)

### Performance optimization checklist:

- [ ] Memoize all sub-components with React.memo
- [ ] Debounce slider changes to 100ms
- [ ] Use Canvas rendering for charts if needed
- [ ] Lazy load frequency/reverb data
- [ ] Cache IR file lists (5min TTL)
- [ ] Profile with React DevTools Profiler

