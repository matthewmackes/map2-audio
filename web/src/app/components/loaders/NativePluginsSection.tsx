import { useState } from 'react'
import { useNativePlugins } from '../../hooks/useNativePlugins'
import { NAMCard } from '../NativePlugins/NAMCard'
import { GraphicalCabinetIRCard } from '../NativePlugins/GraphicalCabinetIRCard'
import { ReverbIRCard } from '../NativePlugins/ReverbIRCard'
import { CocoaDelayCard } from '../NativePlugins/CocoaDelayCard'
import { ZitaAT1Card } from '../NativePlugins/ZitaAT1Card'
import { TripleSpreadCard } from '../NativePlugins/TripleSpreadCard'
import { ValentineCard } from '../NativePlugins/ValentineCard'
import { ZLEqualizerCard } from '../NativePlugins/ZLEqualizerCard'
import { Freeverb3Card } from '../NativePlugins/Freeverb3Card'
import { Loader2, ChevronRight, Power, Activity, BarChart3, Clock, Radio } from 'lucide-react'

// Import visualization components
import { SpectrumAnalyzer } from '../Visualizations/SpectrumAnalyzer'
import { LoudnessMeter } from '../Visualizations/LoudnessMeter'
import { CPUMeterPanel } from '../Visualizations/CPUMeterPanel'
import { LatencyDisplay } from '../Visualizations/LatencyDisplay'
import { PhaseCorrelationMeter } from '../Visualizations/PhaseCorrelationMeter'

// Plugin configuration with colors and metadata
const PLUGINS = {
  nam: {
    id: 'nam',
    name: 'Neural Amp Modeler',
    shortName: 'NAM',
    icon: '🎸',
    creator: 'Steven Atkinson',
    logo: 'https://raw.githubusercontent.com/sdatkinson/NeuralAmpModelerPlugin/main/NeuralAmpModeler/resources/img/ModelIcon.svg',
    url: 'https://www.neuralampmodeler.com/',
    color: '#ff6b35',
    colorRgb: '255, 107, 53',
    description: 'AI-powered amp simulation'
  },
  cabinet: {
    id: 'cabinet',
    name: 'Cabinet IR',
    shortName: 'Cabinet',
    icon: '🎛️',
    creator: 'James Stubbs',
    logo: 'https://raw.githubusercontent.com/JamesStubbsEng/GraphicalIRLoader/master/Resources/icon.png',
    url: 'https://github.com/JamesStubbsEng/GraphicalIRLoader',
    color: '#ffb84d',
    colorRgb: '255, 184, 77',
    description: 'FFT-based IR visualization'
  },
  reverb: {
    id: 'reverb',
    name: 'Reverb IR',
    shortName: 'Reverb',
    icon: '✨',
    creator: 'MAP2 Audio',
    logo: '/assets/map2-logo.svg',
    url: 'https://github.com/map2-audio',
    color: '#a855f7',
    colorRgb: '168, 85, 247',
    description: 'Zero-latency IR convolution'
  },
  delay: {
    id: 'delay',
    name: 'Cocoa Delay',
    shortName: 'Delay',
    icon: '☕',
    creator: 'tesselode',
    logo: 'https://raw.githubusercontent.com/tesselode/cocoa-delay/master/images/screenshot.png',
    url: 'https://github.com/tesselode/cocoa-delay',
    color: '#d4a574',
    colorRgb: '212, 165, 116',
    description: 'Warm delay with drift & ducking'
  },
  autotune: {
    id: 'autotune',
    name: 'Zita AT1',
    shortName: 'AT1',
    icon: '🎤',
    creator: 'Fons Adriaensen',
    logo: 'https://kokkinizita.linuxaudio.org/ostlogo.png',
    url: 'https://github.com/royvegard/zita-at1',
    color: '#4ade80',
    colorRgb: '74, 222, 128',
    description: 'Auto-tune with clean resampling'
  },
  triplespread: {
    id: 'triplespread',
    name: 'TripleSpread',
    shortName: 'Spread',
    icon: '↔️',
    creator: 'Chris Johnson',
    logo: 'https://www.airwindows.com/wp-content/uploads/2023/01/cropped-airwindowslogo-1-192x192.png',
    url: 'https://github.com/airwindows/airwindows',
    color: '#a78bfa',
    colorRgb: '167, 139, 250',
    description: 'Stereo width spreading'
  },
  valentine: {
    id: 'valentine',
    name: 'Valentine',
    shortName: 'Val',
    icon: '💔',
    creator: 'Tote Bag Labs',
    logo: 'https://raw.githubusercontent.com/tote-bag-labs/valentine/main/valentine/Resources/logo.png',
    url: 'https://github.com/tote-bag-labs/valentine',
    color: '#e11d48',
    colorRgb: '225, 29, 72',
    description: 'Aggressive compressor/saturator'
  },
  zlequalizer: {
    id: 'zlequalizer',
    name: 'ZL Equalizer',
    shortName: 'ZL EQ',
    icon: '📊',
    creator: 'ZL-Audio',
    logo: 'https://raw.githubusercontent.com/ZL-Audio/ZLEqualizer/master/docs/screenshot.png',
    url: 'https://github.com/ZL-Audio/ZLEqualizer',
    color: '#06b6d4',
    colorRgb: '6, 182, 212',
    description: '24-band dynamic parametric EQ'
  },
  freeverb3: {
    id: 'freeverb3',
    name: 'Freeverb3',
    shortName: 'FV3',
    icon: '🌊',
    creator: 'Teru Kamogashira',
    logo: 'https://www.gnu.org/graphics/heckert_gnu.transp.small.png',
    url: 'https://github.com/gitGNU/gnu_freeverb3',
    color: '#6366f1',
    colorRgb: '99, 102, 241',
    description: 'SIMD-optimized algorithmic reverb'
  }
} as const

type PluginId = keyof typeof PLUGINS
type PluginConfig = typeof PLUGINS[PluginId]

// Mini mix slider for collapsed header
function QuickMixSlider({
  value,
  onChange,
  color,
  disabled
}: {
  value: number
  onChange: (v: number) => void
  color: string
  disabled?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        opacity: disabled ? 0.5 : 1,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        style={{
          width: 70,
          height: 4,
          appearance: 'none',
          background: `linear-gradient(to right, ${color} ${value}%, rgba(255,255,255,0.15) ${value}%)`,
          borderRadius: 2,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      />
      <span style={{
        fontSize: 11,
        fontWeight: 600,
        color: color,
        minWidth: 32,
        textAlign: 'right',
        fontFamily: 'monospace',
      }}>
        {value}%
      </span>
    </div>
  )
}

// Bypass toggle button
function BypassToggle({
  bypassed,
  onToggle,
  color,
  disabled
}: {
  bypassed: boolean
  onToggle: () => void
  color: string
  disabled?: boolean
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      disabled={disabled}
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        border: `1px solid ${bypassed ? 'rgba(255,255,255,0.2)' : color}`,
        background: bypassed ? 'rgba(255,255,255,0.05)' : `rgba(${PLUGINS.nam.colorRgb}, 0.2)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s ease',
        opacity: disabled ? 0.5 : 1,
      }}
      title={bypassed ? 'Enable' : 'Bypass'}
    >
      <Power
        size={14}
        style={{
          color: bypassed ? '#666' : color,
          filter: bypassed ? 'none' : `drop-shadow(0 0 4px ${color})`,
        }}
      />
    </button>
  )
}

// Status indicator dot
function StatusDot({ active, color }: { active: boolean; color: string }) {
  return (
    <div
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: active ? color : '#444',
        boxShadow: active ? `0 0 8px ${color}, 0 0 12px ${color}` : 'none',
        transition: 'all 0.3s ease',
      }}
    />
  )
}

// Collapsible plugin row component
function CollapsiblePluginRow({
  plugin,
  isExpanded,
  onToggle,
  isActive,
  isBypassed,
  mixValue,
  onMixChange,
  onBypassChange,
  chainName,
  onAddToChain,
  children,
}: {
  plugin: PluginConfig
  isExpanded: boolean
  onToggle: () => void
  isActive: boolean
  isBypassed: boolean
  mixValue: number
  onMixChange: (v: number) => void
  onBypassChange: () => void
  chainName?: string
  onAddToChain?: () => void
  children: React.ReactNode
}) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      style={{
        marginBottom: 6,
        borderRadius: isExpanded ? 12 : 8,
        overflow: 'hidden',
        background: isExpanded
          ? `linear-gradient(135deg, rgba(${plugin.colorRgb}, 0.12), rgba(0,0,0,0.4))`
          : `linear-gradient(135deg, rgba(20, 30, 50, 0.95), rgba(14, 22, 37, 0.98))`,
        borderLeft: `4px solid ${plugin.color}`,
        border: `1px solid rgba(${plugin.colorRgb}, ${isExpanded ? 0.3 : isHovered ? 0.25 : 0.15})`,
        borderLeftWidth: 4,
        boxShadow: isExpanded
          ? `0 0 30px rgba(${plugin.colorRgb}, 0.15), 0 8px 32px rgba(0,0,0,0.4)`
          : isHovered
            ? `0 0 20px rgba(${plugin.colorRgb}, 0.1), 0 4px 16px rgba(0,0,0,0.3)`
            : '0 2px 8px rgba(0,0,0,0.2)',
        transition: 'all 0.25s ease-out',
        transform: isHovered && !isExpanded ? 'translateX(2px)' : 'none',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Collapsed Header */}
      <div
        onClick={onToggle}
        style={{
          height: 52,
          padding: '0 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          cursor: 'pointer',
          background: isExpanded
            ? `linear-gradient(90deg, rgba(${plugin.colorRgb}, 0.08), transparent)`
            : 'transparent',
        }}
      >
        {/* Expand indicator */}
        <ChevronRight
          size={16}
          style={{
            color: plugin.color,
            transition: 'transform 0.2s ease',
            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            flexShrink: 0,
          }}
        />

        {/* Plugin icon */}
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: `linear-gradient(135deg, ${plugin.color}30, ${plugin.color}10)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            flexShrink: 0,
            border: `1px solid ${plugin.color}40`,
          }}
        >
          {plugin.icon}
        </div>

        {/* Plugin name */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14,
            fontWeight: 600,
            color: plugin.color,
            letterSpacing: 0.3,
          }}>
            {plugin.name}
          </div>
          <div style={{
            fontSize: 10,
            color: '#666',
            marginTop: 1,
          }}>
            {plugin.description}
          </div>
        </div>

        {/* Status dot */}
        <StatusDot active={isActive && !isBypassed} color={plugin.color} />

        {/* Bypass toggle */}
        <BypassToggle
          bypassed={isBypassed}
          onToggle={onBypassChange}
          color={plugin.color}
          disabled={!isActive}
        />

        {/* Quick mix slider */}
        <QuickMixSlider
          value={mixValue}
          onChange={onMixChange}
          color={plugin.color}
          disabled={!isActive || isBypassed}
        />
      </div>

      {/* Expandable content */}
      <div
        style={{
          display: 'grid',
          gridTemplateRows: isExpanded ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.25s ease-out',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          <div style={{ padding: '0 16px 16px 16px' }}>
            {/* Divider */}
            <div style={{
              height: 1,
              background: `linear-gradient(90deg, ${plugin.color}40, transparent)`,
              marginBottom: 16,
            }} />

            {/* Full plugin interface */}
            <div style={{ marginBottom: chainName ? 16 : 0 }}>
              {children}
            </div>

            {/* Add to chain button */}
            {chainName && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onAddToChain?.()
                }}
                disabled={!isActive}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: isActive
                    ? `linear-gradient(135deg, ${plugin.color}, ${plugin.color}cc)`
                    : 'rgba(255,255,255,0.05)',
                  color: isActive ? '#fff' : '#666',
                  border: `1px solid ${plugin.color}`,
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: isActive ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s ease',
                  opacity: isActive ? 1 : 0.5,
                  textShadow: isActive ? '0 1px 2px rgba(0,0,0,0.3)' : 'none',
                }}
                onMouseEnter={(e) => {
                  if (isActive) {
                    e.currentTarget.style.transform = 'translateY(-2px)'
                    e.currentTarget.style.boxShadow = `0 0 20px rgba(${plugin.colorRgb}, 0.5), 0 4px 15px rgba(0,0,0,0.3)`
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                + Add {plugin.shortName} to Chain
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

interface NativePluginsSectionProps {
  onLoadNAM?: (path: string) => void
  onLoadCabinetIR?: (path: string) => void
  onLoadReverbIR?: (path: string) => void
  chainName?: string
  onAddToChain?: (type: string) => void
}

// Metering panel tab type
type MeteringTab = 'spectrum' | 'loudness' | 'cpu' | 'latency' | 'phase'

export function NativePluginsSection({
  chainName,
  onAddToChain,
}: NativePluginsSectionProps) {
  const [expandedPlugin, setExpandedPlugin] = useState<PluginId | null>(null)
  const [showMetering, setShowMetering] = useState(true)
  const [activeTab, setActiveTab] = useState<MeteringTab>('spectrum')

  const {
    nam,
    cabinet,
    reverb,
    cocoaDelay,
    zitaAT1,
    tripleSpread,
    valentine,
    zlEqualizer,
    freeverb3,
    isLoading,
    updateNAMModel,
    updateNAMMix,
    updateNAMBypass,
    updateCabinetIR,
    updateCabinetMix,
    updateCabinetBypass,
    updateReverbIR,
    updateReverbMix,
    updateReverbBypass,
    updateCocoaDelayMix,
    updateCocoaDelayTime,
    updateCocoaDelayFeedback,
    updateCocoaDelayDrift,
    updateCocoaDelayDucking,
    updateCocoaDelayPanMode,
    updateCocoaDelayDrive,
    updateCocoaDelayBypass,
    updateZitaAT1Tuning,
    updateZitaAT1Bias,
    updateZitaAT1Filter,
    updateZitaAT1Correction,
    updateZitaAT1Offset,
    updateZitaAT1Notes,
    updateZitaAT1Midi,
    updateZitaAT1LowLatency,
    updateZitaAT1Bypass,
    updateTripleSpreadSpread,
    updateTripleSpreadMix,
    updateTripleSpreadBypass,
    updateValentineCrush,
    updateValentineCompress,
    updateValentineSaturate,
    updateValentineRatio,
    updateValentineAttack,
    updateValentineRelease,
    updateValentineOutput,
    updateValentineMix,
    updateValentineClipOutput,
    updateValentineBypass,
    updateZLEqualizerOutputGain,
    updateZLEqualizerScale,
    updateZLEqualizerMix,
    updateZLEqualizerBypass,
    updateZLEqualizerAutoGain,
    updateZLEqualizerBand,
    updateFreeverb3ReverbType,
    updateFreeverb3RoomSize,
    updateFreeverb3Damping,
    updateFreeverb3Width,
    updateFreeverb3Predelay,
    updateFreeverb3Decay,
    updateFreeverb3LowCut,
    updateFreeverb3HighCut,
    updateFreeverb3Modulation,
    updateFreeverb3ModFreq,
    updateFreeverb3EarlyMix,
    updateFreeverb3EarlySize,
    updateFreeverb3Mix,
    updateFreeverb3OutputGain,
    updateFreeverb3Diffusion,
    updateFreeverb3Spin,
    updateFreeverb3Wander,
    updateFreeverb3Bypass,
  } = useNativePlugins()

  const togglePlugin = (id: PluginId) => {
    setExpandedPlugin(prev => prev === id ? null : id)
  }

  if (isLoading) {
    return (
      <div className="card" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 60,
        background: 'linear-gradient(135deg, rgba(14, 22, 37, 0.95), rgba(20, 30, 50, 0.9))',
      }}>
        <Loader2 className="animate-spin" size={28} style={{ color: '#37d6c9' }} />
        <span style={{ marginLeft: 16, color: '#888', fontSize: 14 }}>Loading native plugins...</span>
      </div>
    )
  }

  return (
    <div
      className="card"
      style={{
        background: 'linear-gradient(135deg, rgba(14, 22, 37, 0.95), rgba(20, 30, 50, 0.9))',
        borderColor: 'rgba(55, 214, 201, 0.2)',
        padding: 20,
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
      }}>
        <div>
          <h2 style={{
            fontSize: 20,
            fontWeight: 700,
            marginBottom: 4,
            color: '#f2f6ff',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <span style={{
              background: 'linear-gradient(135deg, #37d6c9, #00d4ff)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              Native Plugins
            </span>
            <span style={{
              fontSize: 11,
              fontWeight: 500,
              padding: '3px 8px',
              background: 'rgba(55, 214, 201, 0.15)',
              border: '1px solid rgba(55, 214, 201, 0.3)',
              borderRadius: 12,
              color: '#37d6c9',
            }}>
              9 processors
            </span>
          </h2>
          <p style={{ fontSize: 12, color: '#666', margin: 0 }}>
            Purpose-built audio processors compiled directly into the application
          </p>
        </div>

        {/* Collapse all button */}
        {expandedPlugin && (
          <button
            onClick={() => setExpandedPlugin(null)}
            style={{
              padding: '6px 12px',
              fontSize: 11,
              fontWeight: 600,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6,
              color: '#888',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
              e.currentTarget.style.color = '#fff'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
              e.currentTarget.style.color = '#888'
            }}
          >
            Collapse All
          </button>
        )}
      </div>

      {/* Metering Panel */}
      <div style={{ marginBottom: 20 }}>
        {/* Metering Header */}
        <div
          onClick={() => setShowMetering(!showMetering)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            background: 'linear-gradient(135deg, rgba(55, 214, 201, 0.1), rgba(0, 212, 255, 0.05))',
            border: '1px solid rgba(55, 214, 201, 0.2)',
            borderRadius: showMetering ? '10px 10px 0 0' : 10,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Activity size={16} style={{ color: '#37d6c9' }} />
            <span style={{
              fontSize: 14,
              fontWeight: 600,
              color: '#37d6c9',
            }}>
              Audio Metering
            </span>
          </div>
          <ChevronRight
            size={16}
            style={{
              color: '#37d6c9',
              transform: showMetering ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
            }}
          />
        </div>

        {/* Metering Content */}
        <div style={{
          display: 'grid',
          gridTemplateRows: showMetering ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.25s ease-out',
        }}>
          <div style={{ overflow: 'hidden' }}>
            <div style={{
              padding: 16,
              background: 'rgba(0, 0, 0, 0.2)',
              border: '1px solid rgba(55, 214, 201, 0.2)',
              borderTop: 'none',
              borderRadius: '0 0 10px 10px',
            }}>
              {/* Tab buttons */}
              <div style={{
                display: 'flex',
                gap: 6,
                marginBottom: 16,
                flexWrap: 'wrap',
              }}>
                {[
                  { id: 'spectrum' as MeteringTab, label: 'Spectrum', icon: <BarChart3 size={14} /> },
                  { id: 'loudness' as MeteringTab, label: 'Loudness', icon: <Activity size={14} /> },
                  { id: 'cpu' as MeteringTab, label: 'CPU', icon: <Activity size={14} /> },
                  { id: 'latency' as MeteringTab, label: 'Latency', icon: <Clock size={14} /> },
                  { id: 'phase' as MeteringTab, label: 'Phase', icon: <Radio size={14} /> },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      setActiveTab(tab.id)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      fontSize: 12,
                      fontWeight: 500,
                      background: activeTab === tab.id
                        ? 'rgba(55, 214, 201, 0.2)'
                        : 'rgba(255, 255, 255, 0.05)',
                      border: `1px solid ${activeTab === tab.id ? 'rgba(55, 214, 201, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`,
                      borderRadius: 6,
                      color: activeTab === tab.id ? '#37d6c9' : '#888',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div style={{ minHeight: 200 }}>
                {activeTab === 'spectrum' && (
                  <SpectrumAnalyzer
                    mode="bars"
                    height={180}
                    barCount={48}
                    showLabels={true}
                    showPeaks={true}
                    colors={['#22c55e', '#eab308', '#ef4444']}
                  />
                )}
                {activeTab === 'loudness' && (
                  <LoudnessMeter
                    targetLufs={-14}
                    truePeakLimit={-1}
                    compact={false}
                  />
                )}
                {activeTab === 'cpu' && (
                  <CPUMeterPanel
                    showBreakdown={true}
                    compact={false}
                  />
                )}
                {activeTab === 'latency' && (
                  <LatencyDisplay
                    showBreakdown={true}
                    compact={false}
                  />
                )}
                {activeTab === 'phase' && (
                  <PhaseCorrelationMeter
                    showStereoInfo={true}
                    orientation="horizontal"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Plugin rows */}
      <div>
        {/* NAM */}
        <CollapsiblePluginRow
          plugin={PLUGINS.nam}
          isExpanded={expandedPlugin === 'nam'}
          onToggle={() => togglePlugin('nam')}
          isActive={nam.available}
          isBypassed={nam.bypass}
          mixValue={nam.mix}
          onMixChange={(v) => updateNAMMix(v)}
          onBypassChange={() => updateNAMBypass(!nam.bypass)}
          chainName={chainName}
          onAddToChain={() => onAddToChain?.('nam')}
        >
          <NAMCard
            status={nam}
            onModelChange={updateNAMModel}
            onMixChange={updateNAMMix}
          />
        </CollapsiblePluginRow>

        {/* Cabinet IR */}
        <CollapsiblePluginRow
          plugin={PLUGINS.cabinet}
          isExpanded={expandedPlugin === 'cabinet'}
          onToggle={() => togglePlugin('cabinet')}
          isActive={!!cabinet.loaded}
          isBypassed={cabinet.bypass}
          mixValue={cabinet.mix}
          onMixChange={(v) => updateCabinetMix(v)}
          onBypassChange={() => updateCabinetBypass(!cabinet.bypass)}
          chainName={chainName}
          onAddToChain={() => onAddToChain?.('cabinet')}
        >
          <GraphicalCabinetIRCard
            status={cabinet}
            onIRChange={updateCabinetIR}
            onMixChange={updateCabinetMix}
            onBypassChange={updateCabinetBypass}
            showNavigation={true}
            showMeters={true}
            showControls={true}
          />
        </CollapsiblePluginRow>

        {/* Reverb IR */}
        <CollapsiblePluginRow
          plugin={PLUGINS.reverb}
          isExpanded={expandedPlugin === 'reverb'}
          onToggle={() => togglePlugin('reverb')}
          isActive={!!reverb.loaded}
          isBypassed={reverb.bypass}
          mixValue={reverb.mix}
          onMixChange={(v) => updateReverbMix(v)}
          onBypassChange={() => updateReverbBypass(!reverb.bypass)}
          chainName={chainName}
          onAddToChain={() => onAddToChain?.('reverb')}
        >
          <ReverbIRCard
            status={reverb}
            onIRChange={updateReverbIR}
            onMixChange={updateReverbMix}
          />
        </CollapsiblePluginRow>

        {/* Cocoa Delay */}
        <CollapsiblePluginRow
          plugin={PLUGINS.delay}
          isExpanded={expandedPlugin === 'delay'}
          onToggle={() => togglePlugin('delay')}
          isActive={cocoaDelay.available}
          isBypassed={cocoaDelay.bypass}
          mixValue={cocoaDelay.mix}
          onMixChange={(v) => updateCocoaDelayMix(v)}
          onBypassChange={() => updateCocoaDelayBypass(!cocoaDelay.bypass)}
          chainName={chainName}
          onAddToChain={() => onAddToChain?.('delay')}
        >
          <CocoaDelayCard
            status={cocoaDelay}
            onMixChange={updateCocoaDelayMix}
            onTimeChange={updateCocoaDelayTime}
            onFeedbackChange={updateCocoaDelayFeedback}
            onDriftChange={updateCocoaDelayDrift}
            onDuckingChange={updateCocoaDelayDucking}
            onPanModeChange={updateCocoaDelayPanMode}
            onDriveChange={updateCocoaDelayDrive}
            onBypassChange={updateCocoaDelayBypass}
          />
        </CollapsiblePluginRow>

        {/* Zita AT1 */}
        <CollapsiblePluginRow
          plugin={PLUGINS.autotune}
          isExpanded={expandedPlugin === 'autotune'}
          onToggle={() => togglePlugin('autotune')}
          isActive={zitaAT1.available}
          isBypassed={zitaAT1.bypass}
          mixValue={Math.round(zitaAT1.correction * 100)}
          onMixChange={(v) => updateZitaAT1Correction(v / 100)}
          onBypassChange={() => updateZitaAT1Bypass(!zitaAT1.bypass)}
          chainName={chainName}
          onAddToChain={() => onAddToChain?.('autotune')}
        >
          <ZitaAT1Card
            status={zitaAT1}
            onTuningChange={updateZitaAT1Tuning}
            onBiasChange={updateZitaAT1Bias}
            onFilterChange={updateZitaAT1Filter}
            onCorrectionChange={updateZitaAT1Correction}
            onOffsetChange={updateZitaAT1Offset}
            onNotesChange={updateZitaAT1Notes}
            onMidiChange={updateZitaAT1Midi}
            onLowLatencyChange={updateZitaAT1LowLatency}
            onBypassChange={updateZitaAT1Bypass}
          />
        </CollapsiblePluginRow>

        {/* TripleSpread */}
        <CollapsiblePluginRow
          plugin={PLUGINS.triplespread}
          isExpanded={expandedPlugin === 'triplespread'}
          onToggle={() => togglePlugin('triplespread')}
          isActive={tripleSpread.available}
          isBypassed={tripleSpread.bypass}
          mixValue={tripleSpread.mix}
          onMixChange={(v) => updateTripleSpreadMix(v)}
          onBypassChange={() => updateTripleSpreadBypass(!tripleSpread.bypass)}
          chainName={chainName}
          onAddToChain={() => onAddToChain?.('triplespread')}
        >
          <TripleSpreadCard
            status={tripleSpread}
            onSpreadChange={updateTripleSpreadSpread}
            onMixChange={updateTripleSpreadMix}
            onBypassChange={updateTripleSpreadBypass}
          />
        </CollapsiblePluginRow>

        {/* Valentine */}
        <CollapsiblePluginRow
          plugin={PLUGINS.valentine}
          isExpanded={expandedPlugin === 'valentine'}
          onToggle={() => togglePlugin('valentine')}
          isActive={valentine.available}
          isBypassed={valentine.bypass}
          mixValue={valentine.mix}
          onMixChange={(v) => updateValentineMix(v)}
          onBypassChange={() => updateValentineBypass(!valentine.bypass)}
          chainName={chainName}
          onAddToChain={() => onAddToChain?.('valentine')}
        >
          <ValentineCard
            status={valentine}
            onCrushChange={updateValentineCrush}
            onCompressChange={updateValentineCompress}
            onSaturateChange={updateValentineSaturate}
            onRatioChange={updateValentineRatio}
            onAttackChange={updateValentineAttack}
            onReleaseChange={updateValentineRelease}
            onOutputChange={updateValentineOutput}
            onMixChange={updateValentineMix}
            onClipOutputChange={updateValentineClipOutput}
            onBypassChange={updateValentineBypass}
          />
        </CollapsiblePluginRow>

        {/* ZL Equalizer */}
        <CollapsiblePluginRow
          plugin={PLUGINS.zlequalizer}
          isExpanded={expandedPlugin === 'zlequalizer'}
          onToggle={() => togglePlugin('zlequalizer')}
          isActive={zlEqualizer.available}
          isBypassed={zlEqualizer.bypass}
          mixValue={zlEqualizer.mix}
          onMixChange={(v) => updateZLEqualizerMix(v)}
          onBypassChange={() => updateZLEqualizerBypass(!zlEqualizer.bypass)}
          chainName={chainName}
          onAddToChain={() => onAddToChain?.('zlequalizer')}
        >
          <ZLEqualizerCard
            status={zlEqualizer}
            onOutputGainChange={updateZLEqualizerOutputGain}
            onScaleChange={updateZLEqualizerScale}
            onMixChange={updateZLEqualizerMix}
            onBypassChange={updateZLEqualizerBypass}
            onAutoGainChange={updateZLEqualizerAutoGain}
            onBandChange={(bandIndex, params) => updateZLEqualizerBand({ bandIndex, settings: params })}
          />
        </CollapsiblePluginRow>

        {/* Freeverb3 */}
        <CollapsiblePluginRow
          plugin={PLUGINS.freeverb3}
          isExpanded={expandedPlugin === 'freeverb3'}
          onToggle={() => togglePlugin('freeverb3')}
          isActive={freeverb3.available}
          isBypassed={freeverb3.bypass}
          mixValue={freeverb3.mix}
          onMixChange={(v) => updateFreeverb3Mix(v)}
          onBypassChange={() => updateFreeverb3Bypass(!freeverb3.bypass)}
          chainName={chainName}
          onAddToChain={() => onAddToChain?.('freeverb3')}
        >
          <Freeverb3Card
            status={freeverb3}
            onReverbTypeChange={updateFreeverb3ReverbType}
            onRoomSizeChange={updateFreeverb3RoomSize}
            onDampingChange={updateFreeverb3Damping}
            onWidthChange={updateFreeverb3Width}
            onPredelayChange={updateFreeverb3Predelay}
            onDecayChange={updateFreeverb3Decay}
            onLowCutChange={updateFreeverb3LowCut}
            onHighCutChange={updateFreeverb3HighCut}
            onModulationChange={updateFreeverb3Modulation}
            onModFreqChange={updateFreeverb3ModFreq}
            onEarlyMixChange={updateFreeverb3EarlyMix}
            onEarlySizeChange={updateFreeverb3EarlySize}
            onMixChange={updateFreeverb3Mix}
            onOutputGainChange={updateFreeverb3OutputGain}
            onDiffusionChange={updateFreeverb3Diffusion}
            onSpinChange={updateFreeverb3Spin}
            onWanderChange={updateFreeverb3Wander}
            onBypassChange={updateFreeverb3Bypass}
          />
        </CollapsiblePluginRow>
      </div>
    </div>
  )
}
