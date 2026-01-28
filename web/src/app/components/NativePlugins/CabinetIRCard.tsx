import { useState, useEffect } from 'react'
import { Speaker } from 'lucide-react'
import { PluginCard } from './PluginCard'
import { FrequencyResponseChart } from '../Visualizations/FrequencyResponseChart'
import { AudioMeter } from '../Visualizations/AudioMeter'
import { ParameterSlider } from '../Controls/ParameterSlider'
import { CabinetStatus } from '../../../map2/types/native-plugins'

interface CabinetIRCardProps {
  status: CabinetStatus
  onIRChange?: (irName: string) => void
  onMixChange?: (mix: number) => void
  onBypassChange?: (bypass: boolean) => void
}

export function CabinetIRCard({
  status,
  onIRChange,
  onMixChange,
  onBypassChange
}: CabinetIRCardProps) {
  const [selectedIR, setSelectedIR] = useState(status.loaded || '')
  const [mix, setMix] = useState(status.mix)

  useEffect(() => {
    setSelectedIR(status.loaded || '')
    setMix(status.mix)
  }, [status])

  return (
    <PluginCard
      title="Cabinet IR"
      icon={<Speaker size={24} />}
      color="cabinet"
      status={status.loaded ? 'active' : 'inactive'}
    >
      <div style={{ marginBottom: 20 }}>
        <FrequencyResponseChart data={status.frequencyResponse} height={160} />
      </div>

      <div style={{ marginBottom: 20, display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <AudioMeter
          label="Input"
          value={status.inputLevel}
          peak={status.peakInput}
        />
        <AudioMeter
          label="Output"
          value={status.outputLevel}
          peak={status.peakOutput}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 6 }}>
            Cabinet IR
          </label>
          <select
            value={selectedIR}
            onChange={(e) => {
              setSelectedIR(e.target.value)
              onIRChange?.(e.target.value)
            }}
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
            <option value="">-- Select Cabinet --</option>
            {status.availableIRs.map((ir: { name: string; size: string; length: number }) => (
              <option key={ir.name} value={ir.name}>
                {ir.name} ({ir.size})
              </option>
            ))}
          </select>
        </div>

        <ParameterSlider
          label="Wet/Dry Mix"
          value={mix}
          min={0}
          max={100}
          unit="%"
          onChange={(newMix) => {
            setMix(newMix)
            onMixChange?.(newMix)
          }}
        />

        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            id="cabinet-bypass"
            checked={status.bypass}
            onChange={(e) => onBypassChange?.(e.target.checked)}
            style={{ width: 18, height: 18, cursor: 'pointer' }}
          />
          <label htmlFor="cabinet-bypass" style={{ fontSize: 12, cursor: 'pointer' }}>
            Bypass
          </label>
        </div>
      </div>

      <div style={{
        fontSize: 12,
        color: '#888',
        borderTop: '1px solid #444',
        paddingTop: 12,
        lineHeight: 1.4
      }}>
        <div style={{ marginBottom: 4 }}>
          {status.loaded ? (
            <>
              <span style={{ color: '#37d6c9' }}>✓</span> {status.loaded}
            </>
          ) : (
            <>
              <span style={{ color: '#f59e0b' }}>○</span> No cabinet loaded
            </>
          )}
        </div>
        <div>Latency: {status.latency.toFixed(2)}ms ({status.latency.toFixed(0)} samples)</div>
      </div>
    </PluginCard>
  )
}
