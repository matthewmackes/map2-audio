import { useState, useEffect } from 'react'
import { Zap, Heart } from 'lucide-react'
import { PluginCard } from './PluginCard'
import { AudioMeter } from '../Visualizations/AudioMeter'
import { ParameterSlider } from '../Controls/ParameterSlider'
import { ValentineStatus } from '../../../map2/types/native-plugins'
import { ProjectAttribution } from './ProjectAttribution'

interface ValentineCardProps {
  status: ValentineStatus
  onCrushChange?: (enabled: boolean) => void
  onCompressChange?: (value: number) => void
  onSaturateChange?: (value: number) => void
  onRatioChange?: (value: number) => void
  onAttackChange?: (value: number) => void
  onReleaseChange?: (value: number) => void
  onOutputChange?: (value: number) => void
  onMixChange?: (mix: number) => void
  onClipOutputChange?: (enabled: boolean) => void
  onBypassChange?: (bypass: boolean) => void
}

export function ValentineCard({
  status,
  onCrushChange,
  onCompressChange,
  onSaturateChange,
  onRatioChange,
  onAttackChange,
  onReleaseChange,
  onOutputChange,
  onMixChange,
  onClipOutputChange,
  onBypassChange
}: ValentineCardProps) {
  const [compress, setCompress] = useState(status.compress)
  const [saturate, setSaturate] = useState(status.saturate)
  const [ratio, setRatio] = useState(status.ratio)
  const [attack, setAttack] = useState(status.attack)
  const [release, setRelease] = useState(status.release)
  const [output, setOutput] = useState(status.output)
  const [mix, setMix] = useState(status.mix)

  useEffect(() => {
    setCompress(status.compress)
    setSaturate(status.saturate)
    setRatio(status.ratio)
    setAttack(status.attack)
    setRelease(status.release)
    setOutput(status.output)
    setMix(status.mix)
  }, [status])

  // Valentine's signature red/pink color
  const valentineColor = '#e11d48'
  const valentineColorLight = 'rgba(225, 29, 72, 0.2)'

  return (
    <PluginCard
      title="Valentine"
      icon={<Heart size={24} />}
      color="valentine"
      status={status.available ? 'active' : 'inactive'}
    >
      {/* Project Attribution */}
      <ProjectAttribution projectId="valentine" />

      {/* Input/Output Meters with Gain Reduction */}
      <div style={{ marginBottom: 16, display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr 1fr' }}>
        <AudioMeter label="Input" value={status.inputLevel} peak={status.peakInput} />
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4
        }}>
          <div style={{ fontSize: 9, color: '#888', textTransform: 'uppercase' }}>GR</div>
          <div style={{
            width: 24,
            height: 60,
            background: 'rgba(0,0,0,0.3)',
            borderRadius: 4,
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: `${Math.min(100, Math.abs(status.gainReduction) * 5)}%`,
              background: `linear-gradient(180deg, ${valentineColor} 0%, #be123c 100%)`,
              transition: 'height 0.1s ease',
              boxShadow: `0 0 10px ${valentineColor}`
            }} />
          </div>
          <div style={{ fontSize: 10, color: valentineColor, fontWeight: 600 }}>
            {status.gainReduction.toFixed(1)}dB
          </div>
        </div>
        <AudioMeter label="Output" value={status.outputLevel} peak={status.peakOutput} />
      </div>

      {/* Signal Flow Visualization */}
      <div style={{
        marginBottom: 16,
        padding: 12,
        background: valentineColorLight,
        borderRadius: 8,
        border: `1px solid ${valentineColor}30`
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 4,
          fontSize: 9,
          fontWeight: 600
        }}>
          <div style={{
            padding: '4px 6px',
            background: status.crush ? valentineColor : 'rgba(255,255,255,0.1)',
            color: status.crush ? '#fff' : '#666',
            borderRadius: 4,
            transition: 'all 0.2s'
          }}>CRUSH</div>
          <div style={{ color: '#666' }}>→</div>
          <div style={{
            padding: '4px 6px',
            background: compress > 10 ? `rgba(225, 29, 72, ${compress / 100})` : 'rgba(255,255,255,0.1)',
            color: compress > 10 ? '#fff' : '#666',
            borderRadius: 4
          }}>COMP</div>
          <div style={{ color: '#666' }}>→</div>
          <div style={{
            padding: '4px 6px',
            background: saturate > 10 ? `rgba(225, 29, 72, ${saturate / 100})` : 'rgba(255,255,255,0.1)',
            color: saturate > 10 ? '#fff' : '#666',
            borderRadius: 4
          }}>SAT</div>
          <div style={{ color: '#666' }}>→</div>
          <div style={{
            padding: '4px 6px',
            background: status.clipOutput ? valentineColor : 'rgba(255,255,255,0.1)',
            color: status.clipOutput ? '#fff' : '#666',
            borderRadius: 4
          }}>CLIP</div>
        </div>
      </div>

      {/* Crush Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button
          onClick={() => onCrushChange?.(!status.crush)}
          style={{
            padding: '6px 12px',
            background: status.crush ? valentineColor : 'rgba(255,255,255,0.1)',
            color: status.crush ? '#fff' : '#888',
            border: `1px solid ${status.crush ? valentineColor : '#444'}`,
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: status.crush ? `0 0 12px ${valentineColor}50` : 'none'
          }}
        >
          CRUSH {status.crush ? 'ON' : 'OFF'}
        </button>
        <span style={{ fontSize: 10, color: '#666' }}>Downsample to 27.5kHz</span>
      </div>

      {/* Compress Control */}
      <div style={{ marginBottom: 12 }}>
        <ParameterSlider
          label="Compress"
          value={compress}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => { setCompress(v); onCompressChange?.(v) }}
        />
      </div>

      {/* Saturate Control */}
      <div style={{ marginBottom: 12 }}>
        <ParameterSlider
          label="Saturate"
          value={saturate}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => { setSaturate(v); onSaturateChange?.(v) }}
        />
      </div>

      {/* Ratio Control */}
      <div style={{ marginBottom: 12 }}>
        <ParameterSlider
          label="Ratio"
          value={ratio}
          min={1}
          max={1000}
          unit={ratio >= 1000 ? ':1 (∞)' : ':1'}
          onChange={(v) => { setRatio(v); onRatioChange?.(v) }}
        />
      </div>

      {/* Attack/Release Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <ParameterSlider
          label="Attack"
          value={attack}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => { setAttack(v); onAttackChange?.(v) }}
        />
        <ParameterSlider
          label="Release"
          value={release}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => { setRelease(v); onReleaseChange?.(v) }}
        />
      </div>

      {/* Output Control */}
      <div style={{ marginBottom: 12 }}>
        <ParameterSlider
          label="Output"
          value={output}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => { setOutput(v); onOutputChange?.(v) }}
        />
      </div>

      {/* Mix Control */}
      <div style={{ marginBottom: 12 }}>
        <ParameterSlider
          label="Wet/Dry Mix"
          value={mix}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => { setMix(v); onMixChange?.(v) }}
        />
      </div>

      {/* Clip Output & Bypass Row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 0', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            id="valentine-clip"
            checked={status.clipOutput}
            onChange={(e) => onClipOutputChange?.(e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer', accentColor: valentineColor }}
          />
          <label htmlFor="valentine-clip" style={{ fontSize: 12, color: '#ddd', cursor: 'pointer' }}>
            Clip Output
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            id="valentine-bypass"
            checked={status.bypass}
            onChange={(e) => onBypassChange?.(e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          <label htmlFor="valentine-bypass" style={{ fontSize: 12, color: '#ddd', cursor: 'pointer' }}>
            Bypass
          </label>
        </div>
      </div>

      {/* Status Footer */}
      <div style={{
        fontSize: 11,
        color: '#888',
        borderTop: `1px solid ${valentineColor}30`,
        paddingTop: 12,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: status.available ? '#22c55e' : '#666',
            boxShadow: status.available ? '0 0 8px #22c55e' : 'none',
          }} />
          <span style={{ color: status.available ? '#22c55e' : '#666' }}>
            {status.available ? 'Compressor Ready' : 'Initializing...'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, fontSize: 10 }}>
          {status.crush && <span style={{ color: valentineColor, fontWeight: 600 }}>🔥 CRUSH</span>}
          <span>GR: <span style={{ color: valentineColor, fontWeight: 600 }}>{status.gainReduction.toFixed(1)}dB</span></span>
          <span>Ratio: <span style={{ color: valentineColor, fontWeight: 600 }}>{ratio >= 1000 ? '∞' : ratio}:1</span></span>
        </div>
      </div>
    </PluginCard>
  )
}
