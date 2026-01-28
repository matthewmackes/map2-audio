import { useState, useEffect } from 'react'
import { Sliders, Settings, Volume2, Zap, Link, ExternalLink, Activity } from 'lucide-react'
import { PluginCard } from './PluginCard'
import { AudioMeter } from '../Visualizations/AudioMeter'
import { ParameterSlider } from '../Controls/ParameterSlider'
import { ZLEqualizerStatus, ZLEqualizerBandStatus, ZLFilterStructure, ZLFilterType, ZLStereoMode, ZLSideChainFilterType } from '../../../map2/types/native-plugins'
import { ProjectAttribution } from './ProjectAttribution'

interface ZLEqualizerCardProps {
  status: ZLEqualizerStatus
  onOutputGainChange?: (value: number) => void
  onScaleChange?: (value: number) => void
  onMixChange?: (mix: number) => void
  onBypassChange?: (bypass: boolean) => void
  onAutoGainChange?: (enabled: boolean) => void
  onFilterStructureChange?: (structure: ZLFilterStructure) => void
  onDynamicLearnChange?: (enabled: boolean) => void
  onDynamicRelativeChange?: (enabled: boolean) => void
  onPhaseFlipChange?: (enabled: boolean) => void
  onStaticGainCompChange?: (enabled: boolean) => void
  onLookaheadChange?: (value: number) => void
  onBandChange?: (bandIndex: number, params: Partial<ZLEqualizerBandStatus>) => void
  onAnalyzerChange?: (settings: Partial<ZLEqualizerStatus['analyzer']>) => void
  onInvertGains?: () => void
  onSplitLR?: () => void
  onSplitMS?: () => void
  onResetBands?: () => void
}

const FILTER_TYPES: ZLFilterType[] = ['peak', 'low_shelf', 'low_pass', 'high_shelf', 'high_pass', 'notch', 'band_pass', 'tilt_shelf']
const FILTER_STRUCTURES: { value: ZLFilterStructure; label: string; latency: string }[] = [
  { value: 'minimum_phase', label: 'Minimum Phase', latency: '0ms' },
  { value: 'state_variable', label: 'State Variable', latency: '0ms' },
  { value: 'parallel', label: 'Parallel', latency: '0ms' },
  { value: 'matched_phase', label: 'Matched Phase', latency: '~11ms' },
  { value: 'mixed_phase', label: 'Mixed Phase', latency: '~21ms' },
  { value: 'zero_phase', label: 'Zero Phase', latency: '~171ms' }
]
const STEREO_MODES: ZLStereoMode[] = ['stereo', 'left', 'right', 'mid', 'side']
const SIDECHAIN_FILTER_TYPES: ZLSideChainFilterType[] = ['band_pass', 'low_pass', 'high_pass']
const SLOPES = [6, 12, 24, 36, 48, 72, 96]
const FFT_SLOPES = [0, 3, 4.5]

export function ZLEqualizerCard({
  status,
  onOutputGainChange,
  onScaleChange,
  onMixChange,
  onBypassChange,
  onAutoGainChange,
  onFilterStructureChange,
  onDynamicLearnChange,
  onDynamicRelativeChange,
  onPhaseFlipChange,
  onStaticGainCompChange,
  onLookaheadChange,
  onBandChange,
  onAnalyzerChange,
  onInvertGains,
  onSplitLR,
  onSplitMS,
  onResetBands
}: ZLEqualizerCardProps) {
  const [outputGain, setOutputGain] = useState(status.outputGain)
  const [scale, setScale] = useState(status.scale * 100)
  const [mix, setMix] = useState(status.mix)
  const [selectedBand, setSelectedBand] = useState<number | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showAnalyzerSettings, setShowAnalyzerSettings] = useState(false)

  useEffect(() => {
    setOutputGain(status.outputGain)
    setScale(status.scale * 100)
    setMix(status.mix)
  }, [status])

  // ZLEqualizer's signature teal/cyan color
  const eqColor = '#06b6d4'
  const eqColorLight = 'rgba(6, 182, 212, 0.15)'
  const eqColorMid = 'rgba(6, 182, 212, 0.3)'

  // Get active bands for visualization
  const activeBands = status.bands?.filter((b: ZLEqualizerBandStatus) => b.enabled) || []

  const formatFreq = (freq: number) => {
    if (freq >= 1000) return `${(freq / 1000).toFixed(1)}k`
    return freq.toFixed(0)
  }

  return (
    <PluginCard
      title="ZL Equalizer"
      icon={<Sliders size={24} />}
      color="eq"
      status={status.available ? 'active' : 'inactive'}
    >
      {/* Project Attribution */}
      <ProjectAttribution projectId="zlequalizer" />

      {/* Top Bar: Filter Structure & Settings */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        padding: '8px 12px',
        background: 'rgba(0,0,0,0.2)',
        borderRadius: 6
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: '#888' }}>Structure:</span>
          <select
            value={status.filterStructure}
            onChange={(e) => onFilterStructureChange?.(e.target.value as ZLFilterStructure)}
            style={{
              padding: '4px 8px',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid #444',
              borderRadius: 4,
              color: eqColor,
              fontSize: 11,
              fontWeight: 600
            }}
          >
            {FILTER_STRUCTURES.map(s => (
              <option key={s.value} value={s.value}>{s.label} ({s.latency})</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowAnalyzerSettings(!showAnalyzerSettings)}
            style={{
              padding: '4px 8px',
              background: showAnalyzerSettings ? eqColorMid : 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: 4,
              color: showAnalyzerSettings ? '#fff' : '#888',
              fontSize: 10,
              cursor: 'pointer'
            }}
          >
            Analyzer
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            style={{
              padding: '4px 8px',
              background: showSettings ? eqColorMid : 'rgba(255,255,255,0.1)',
              border: 'none',
              borderRadius: 4,
              color: showSettings ? '#fff' : '#888',
              fontSize: 10,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            <Settings size={12} /> Settings
          </button>
        </div>
      </div>

      {/* Input/Output Meters */}
      <div style={{ marginBottom: 16, display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <AudioMeter label="Input" value={status.inputLevel} peak={status.peakInput} />
        <AudioMeter label="Output" value={status.outputLevel} peak={status.peakOutput} />
      </div>

      {/* Frequency Response Visualization */}
      <div style={{
        marginBottom: 16,
        padding: 12,
        background: eqColorLight,
        borderRadius: 8,
        border: `1px solid ${eqColor}30`,
        height: 140,
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Grid lines */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
          {/* Horizontal lines (dB) */}
          {[-12, -6, 0, 6, 12].map((db, i) => (
            <line
              key={`h-${i}`}
              x1="0"
              y1={`${50 - db * 3.5}%`}
              x2="100%"
              y2={`${50 - db * 3.5}%`}
              stroke="#333"
              strokeWidth="1"
              strokeDasharray={db === 0 ? "none" : "2,2"}
            />
          ))}
          {/* Vertical lines (frequency) */}
          {[100, 1000, 10000].map((freq, i) => (
            <line
              key={`v-${i}`}
              x1={`${(Math.log10(freq) - 1) * 33.3}%`}
              y1="0"
              x2={`${(Math.log10(freq) - 1) * 33.3}%`}
              y2="100%"
              stroke="#333"
              strokeWidth="1"
              strokeDasharray="2,2"
            />
          ))}
          {/* Frequency response curve */}
          {status.frequencyResponse && status.frequencyResponse.length > 1 && (
            <path
              d={status.frequencyResponse.map((point: { freq: number; magnitude: number }, i: number) => {
                const x = (Math.log10(point.freq) - 1) * 33.3
                const y = 50 - point.magnitude * 3.5
                return `${i === 0 ? 'M' : 'L'} ${x}% ${y}%`
              }).join(' ')}
              fill="none"
              stroke={eqColor}
              strokeWidth="2"
            />
          )}
        </svg>

        {/* Band markers */}
        {activeBands.map((band: ZLEqualizerBandStatus, i: number) => {
          const bandIndex = status.bands?.indexOf(band) ?? 0
          const x = (Math.log10(band.freq) - 1) * 33.3
          const y = 50 - band.gain * 3.5
          const isSelected = selectedBand === bandIndex
          const isSolo = band.solo
          return (
            <div
              key={i}
              onClick={() => setSelectedBand(isSelected ? null : bandIndex)}
              style={{
                position: 'absolute',
                left: `${x}%`,
                top: `${y}%`,
                transform: 'translate(-50%, -50%)',
                width: isSelected ? 16 : 12,
                height: isSelected ? 16 : 12,
                background: isSelected ? eqColor : isSolo ? '#fbbf24' : `${eqColor}80`,
                borderRadius: '50%',
                cursor: 'pointer',
                border: `2px solid ${isSolo ? '#fbbf24' : '#fff'}`,
                boxShadow: `0 0 8px ${isSolo ? '#fbbf24' : eqColor}`,
                zIndex: isSelected ? 20 : 10,
                transition: 'all 0.15s ease'
              }}
              title={`Band ${bandIndex + 1}: ${formatFreq(band.freq)} Hz, ${band.gain > 0 ? '+' : ''}${band.gain.toFixed(1)} dB${band.dynamicEnabled ? ' (Dynamic)' : ''}`}
            />
          )
        })}

        {/* Labels */}
        <div style={{
          position: 'absolute',
          bottom: 4,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'space-between',
          padding: '0 8px',
          fontSize: 9,
          color: '#666'
        }}>
          <span>20</span>
          <span>100</span>
          <span>1k</span>
          <span>10k</span>
          <span>20k</span>
        </div>

        {/* dB labels */}
        <div style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: 4,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '4px 0',
          fontSize: 8,
          color: '#555'
        }}>
          <span>+12</span>
          <span>0</span>
          <span>-12</span>
        </div>
      </div>

      {/* Analyzer Settings Panel */}
      {showAnalyzerSettings && (
        <div style={{
          marginBottom: 12,
          padding: 12,
          background: 'rgba(0,0,0,0.3)',
          borderRadius: 8,
          border: `1px solid ${eqColor}20`
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: eqColor, marginBottom: 8 }}>Analyzer Settings</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 8 }}>
            {['Pre', 'Post', 'Side'].map(type => (
              <label key={type} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#ddd', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={status.analyzer?.[`show${type}` as keyof typeof status.analyzer] as boolean ?? false}
                  onChange={(e) => onAnalyzerChange?.({ [`show${type}`]: e.target.checked })}
                  style={{ width: 12, height: 12, accentColor: eqColor }}
                />
                {type}
              </label>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div style={{ fontSize: 9, color: '#888', marginBottom: 2 }}>FFT Slope</div>
              <select
                value={status.analyzer?.fftSlope ?? 3}
                onChange={(e) => onAnalyzerChange?.({ fftSlope: parseFloat(e.target.value) })}
                style={{ width: '100%', padding: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid #444', borderRadius: 4, color: '#ddd', fontSize: 10 }}
              >
                {FFT_SLOPES.map(s => <option key={s} value={s}>{s} dB/oct</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 9, color: '#888', marginBottom: 2 }}>Decay</div>
              <input
                type="range"
                min={0}
                max={100}
                value={status.analyzer?.decaySpeed ?? 50}
                onChange={(e) => onAnalyzerChange?.({ decaySpeed: parseFloat(e.target.value) })}
                style={{ width: '100%', accentColor: eqColor }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#ddd', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={status.analyzer?.collisionDetection ?? false}
                onChange={(e) => onAnalyzerChange?.({ collisionDetection: e.target.checked })}
                style={{ width: 12, height: 12, accentColor: eqColor }}
              />
              Collision Detection
            </label>
            {status.analyzer?.collisionDetection && (
              <input
                type="range"
                min={0}
                max={100}
                value={status.analyzer?.collisionStrength ?? 50}
                onChange={(e) => onAnalyzerChange?.({ collisionStrength: parseFloat(e.target.value) })}
                style={{ flex: 1, accentColor: eqColor }}
              />
            )}
          </div>
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div style={{
          marginBottom: 12,
          padding: 12,
          background: 'rgba(0,0,0,0.3)',
          borderRadius: 8,
          border: `1px solid ${eqColor}20`
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: eqColor, marginBottom: 8 }}>Global Settings</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#ddd', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={status.autoGain}
                onChange={(e) => onAutoGainChange?.(e.target.checked)}
                style={{ width: 12, height: 12, accentColor: eqColor }}
              />
              Auto Gain (AGC)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#ddd', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={status.staticGainComp}
                onChange={(e) => onStaticGainCompChange?.(e.target.checked)}
                style={{ width: 12, height: 12, accentColor: eqColor }}
              />
              Static Gain (SGC)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#ddd', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={status.phaseFlip}
                onChange={(e) => onPhaseFlipChange?.(e.target.checked)}
                style={{ width: 12, height: 12, accentColor: eqColor }}
              />
              Phase Flip
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#ddd', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={status.dynamicLearn}
                onChange={(e) => onDynamicLearnChange?.(e.target.checked)}
                style={{ width: 12, height: 12, accentColor: eqColor }}
              />
              Dynamic Learn
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#ddd', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={status.dynamicRelative}
                onChange={(e) => onDynamicRelativeChange?.(e.target.checked)}
                style={{ width: 12, height: 12, accentColor: eqColor }}
              />
              Dynamic Relative
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#ddd', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={status.bypass}
                onChange={(e) => onBypassChange?.(e.target.checked)}
                style={{ width: 12, height: 12 }}
              />
              Bypass
            </label>
          </div>
          <div style={{ marginTop: 8 }}>
            <ParameterSlider
              label="Lookahead"
              value={status.lookahead}
              min={0}
              max={20}
              unit=" ms"
              onChange={(v) => onLookaheadChange?.(v)}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              onClick={onInvertGains}
              style={{ flex: 1, padding: '6px 8px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 4, color: '#ddd', fontSize: 10, cursor: 'pointer' }}
            >
              Invert Gains
            </button>
            <button
              onClick={onSplitLR}
              style={{ flex: 1, padding: '6px 8px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 4, color: '#ddd', fontSize: 10, cursor: 'pointer' }}
            >
              Split L/R
            </button>
            <button
              onClick={onSplitMS}
              style={{ flex: 1, padding: '6px 8px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 4, color: '#ddd', fontSize: 10, cursor: 'pointer' }}
            >
              Split M/S
            </button>
            <button
              onClick={onResetBands}
              style={{ flex: 1, padding: '6px 8px', background: 'rgba(225,29,72,0.2)', border: 'none', borderRadius: 4, color: '#f87171', fontSize: 10, cursor: 'pointer' }}
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Active Bands Summary */}
      <div style={{
        marginBottom: 12,
        padding: 8,
        background: 'rgba(0,0,0,0.2)',
        borderRadius: 6,
        fontSize: 11
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888' }}>
          <span>Active Bands: <span style={{ color: eqColor, fontWeight: 600 }}>{status.activeBands || 0}</span> / {status.numBands || 24}</span>
          <span>Latency: {status.latency?.toFixed(1) || 0}ms</span>
        </div>
      </div>

      {/* Main Controls */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
        <ParameterSlider
          label="Output"
          value={outputGain}
          min={-24}
          max={24}
          unit=" dB"
          onChange={(v) => { setOutputGain(v); onOutputGainChange?.(v) }}
        />
        <ParameterSlider
          label="Scale"
          value={scale}
          min={0}
          max={200}
          unit="%"
          onChange={(v) => { setScale(v); onScaleChange?.(v / 100) }}
        />
        <ParameterSlider
          label="Mix"
          value={mix}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => { setMix(v); onMixChange?.(v) }}
        />
      </div>

      {/* Selected Band Editor */}
      {selectedBand !== null && status.bands?.[selectedBand] && (
        <div style={{
          padding: 12,
          background: eqColorLight,
          borderRadius: 8,
          border: `1px solid ${eqColor}30`
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: eqColor }}>
                Band {selectedBand + 1}
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#ddd', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={status.bands[selectedBand].enabled}
                  onChange={(e) => onBandChange?.(selectedBand, { enabled: e.target.checked })}
                  style={{ width: 12, height: 12, accentColor: eqColor }}
                />
                Enabled
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#fbbf24', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={status.bands[selectedBand].solo}
                  onChange={(e) => onBandChange?.(selectedBand, { solo: e.target.checked })}
                  style={{ width: 12, height: 12, accentColor: '#fbbf24' }}
                />
                Solo
              </label>
            </div>
            <button
              onClick={() => setSelectedBand(null)}
              style={{
                padding: '2px 8px',
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                borderRadius: 4,
                color: '#888',
                fontSize: 11,
                cursor: 'pointer'
              }}
            >
              Close
            </button>
          </div>

          {/* Filter Type & Stereo Mode Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>Filter Type</div>
              <select
                value={status.bands[selectedBand].filterType}
                onChange={(e) => onBandChange?.(selectedBand, { filterType: e.target.value as ZLFilterType })}
                style={{ width: '100%', padding: '6px 8px', background: 'rgba(0,0,0,0.3)', border: '1px solid #444', borderRadius: 4, color: '#ddd', fontSize: 11 }}
              >
                {FILTER_TYPES.map(type => (
                  <option key={type} value={type}>
                    {type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>Stereo Mode</div>
              <select
                value={status.bands[selectedBand].stereoMode}
                onChange={(e) => onBandChange?.(selectedBand, { stereoMode: e.target.value as ZLStereoMode })}
                style={{ width: '100%', padding: '6px 8px', background: 'rgba(0,0,0,0.3)', border: '1px solid #444', borderRadius: 4, color: '#ddd', fontSize: 11 }}
              >
                {STEREO_MODES.map(mode => (
                  <option key={mode} value={mode}>{mode.charAt(0).toUpperCase() + mode.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>Slope</div>
              <select
                value={status.bands[selectedBand].slope}
                onChange={(e) => onBandChange?.(selectedBand, { slope: parseInt(e.target.value) })}
                style={{ width: '100%', padding: '6px 8px', background: 'rgba(0,0,0,0.3)', border: '1px solid #444', borderRadius: 4, color: '#ddd', fontSize: 11 }}
              >
                {SLOPES.map(s => <option key={s} value={s}>{s} dB/oct</option>)}
              </select>
            </div>
          </div>

          {/* Core Parameters */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 8 }}>
            <ParameterSlider
              label="Frequency"
              value={status.bands[selectedBand].freq}
              min={20}
              max={20000}
              unit=" Hz"
              onChange={(v) => onBandChange?.(selectedBand, { freq: v })}
            />
            <ParameterSlider
              label="Gain"
              value={status.bands[selectedBand].gain}
              min={-30}
              max={30}
              unit=" dB"
              onChange={(v) => onBandChange?.(selectedBand, { gain: v })}
            />
            <ParameterSlider
              label="Q"
              value={status.bands[selectedBand].q}
              min={0.1}
              max={20}
              unit=""
              onChange={(v) => onBandChange?.(selectedBand, { q: v })}
            />
          </div>

          {/* Dynamic Mode Section */}
          <div style={{
            marginTop: 8,
            padding: 8,
            background: 'rgba(0,0,0,0.2)',
            borderRadius: 6,
            border: status.bands[selectedBand].dynamicEnabled ? `1px solid ${eqColor}40` : '1px solid transparent'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Zap size={14} color={status.bands[selectedBand].dynamicEnabled ? eqColor : '#666'} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#ddd', cursor: 'pointer', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={status.bands[selectedBand].dynamicEnabled}
                  onChange={(e) => onBandChange?.(selectedBand, { dynamicEnabled: e.target.checked })}
                  style={{ width: 14, height: 14, accentColor: eqColor }}
                />
                Dynamic Mode
              </label>
            </div>
            {status.bands[selectedBand].dynamicEnabled && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <ParameterSlider
                  label="Target Gain"
                  value={status.bands[selectedBand].targetGain}
                  min={-30}
                  max={30}
                  unit=" dB"
                  onChange={(v) => onBandChange?.(selectedBand, { targetGain: v })}
                />
                <ParameterSlider
                  label="Threshold"
                  value={status.bands[selectedBand].threshold}
                  min={-60}
                  max={0}
                  unit=" dB"
                  onChange={(v) => onBandChange?.(selectedBand, { threshold: v })}
                />
                <ParameterSlider
                  label="Knee"
                  value={status.bands[selectedBand].knee}
                  min={0}
                  max={30}
                  unit=" dB"
                  onChange={(v) => onBandChange?.(selectedBand, { knee: v })}
                />
                <ParameterSlider
                  label="Attack"
                  value={status.bands[selectedBand].attack}
                  min={0}
                  max={500}
                  unit=" ms"
                  onChange={(v) => onBandChange?.(selectedBand, { attack: v })}
                />
                <ParameterSlider
                  label="Release"
                  value={status.bands[selectedBand].release}
                  min={0}
                  max={5000}
                  unit=" ms"
                  onChange={(v) => onBandChange?.(selectedBand, { release: v })}
                />
              </div>
            )}
          </div>

          {/* Side-chain Section */}
          {status.bands[selectedBand].dynamicEnabled && (
            <div style={{
              marginTop: 8,
              padding: 8,
              background: 'rgba(0,0,0,0.2)',
              borderRadius: 6
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Volume2 size={14} color="#888" />
                <span style={{ fontSize: 11, color: '#ddd', fontWeight: 600 }}>Side-chain</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#aaa', cursor: 'pointer', marginLeft: 'auto' }}>
                  <input
                    type="checkbox"
                    checked={status.bands[selectedBand].bandLink}
                    onChange={(e) => onBandChange?.(selectedBand, { bandLink: e.target.checked })}
                    style={{ width: 12, height: 12, accentColor: eqColor }}
                  />
                  <Link size={10} /> Link
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#aaa', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={status.bands[selectedBand].externalSideChain}
                    onChange={(e) => onBandChange?.(selectedBand, { externalSideChain: e.target.checked })}
                    style={{ width: 12, height: 12, accentColor: eqColor }}
                  />
                  <ExternalLink size={10} /> Ext
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 9, color: '#888', marginBottom: 2 }}>Filter Type</div>
                  <select
                    value={status.bands[selectedBand].sideChainFilterType}
                    onChange={(e) => onBandChange?.(selectedBand, { sideChainFilterType: e.target.value as ZLSideChainFilterType })}
                    style={{ width: '100%', padding: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid #444', borderRadius: 4, color: '#ddd', fontSize: 10 }}
                  >
                    {SIDECHAIN_FILTER_TYPES.map(type => (
                      <option key={type} value={type}>{type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: '#888', marginBottom: 2 }}>Slope</div>
                  <select
                    value={status.bands[selectedBand].sideChainSlope}
                    onChange={(e) => onBandChange?.(selectedBand, { sideChainSlope: parseInt(e.target.value) })}
                    style={{ width: '100%', padding: '4px', background: 'rgba(0,0,0,0.3)', border: '1px solid #444', borderRadius: 4, color: '#ddd', fontSize: 10 }}
                  >
                    {SLOPES.map(s => <option key={s} value={s}>{s} dB/oct</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <ParameterSlider
                  label="SC Freq"
                  value={status.bands[selectedBand].sideChainFreq}
                  min={20}
                  max={20000}
                  unit=" Hz"
                  onChange={(v) => onBandChange?.(selectedBand, { sideChainFreq: v })}
                />
                <ParameterSlider
                  label="SC Q"
                  value={status.bands[selectedBand].sideChainQ}
                  min={0.1}
                  max={20}
                  unit=""
                  onChange={(v) => onBandChange?.(selectedBand, { sideChainQ: v })}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Status Info */}
      <div style={{
        fontSize: 11,
        color: '#888',
        borderTop: `1px solid ${eqColor}30`,
        paddingTop: 12,
        marginTop: 12,
        lineHeight: 1.5
      }}>
        {status.available ? (
          <>
            <div style={{ color: eqColor, marginBottom: 4 }}>
              ZL Equalizer Active
            </div>
            <div style={{ fontSize: 10, color: '#666' }}>
              24-band dynamic parametric EQ by ZL-Audio
            </div>
          </>
        ) : (
          <>
            <span style={{ color: '#f59e0b' }}>Initializing...</span>
          </>
        )}
      </div>
    </PluginCard>
  )
}
