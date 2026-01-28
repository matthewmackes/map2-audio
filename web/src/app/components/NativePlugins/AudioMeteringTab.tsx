import { Activity, Gauge, Volume2 } from 'lucide-react'
import { AudioMeter } from '../Visualizations/AudioMeter'
import { NAMStatus, CabinetStatus, ReverbStatus, CocoaDelayStatus, ZitaAT1Status, TripleSpreadStatus, ValentineStatus, ZLEqualizerStatus, Freeverb3Status } from '../../../map2/types/native-plugins'

interface AudioMeteringTabProps {
  nam: NAMStatus
  cabinet: CabinetStatus
  reverb: ReverbStatus
  cocoaDelay: CocoaDelayStatus
  zitaAT1: ZitaAT1Status
  tripleSpread: TripleSpreadStatus
  valentine: ValentineStatus
  zlEqualizer: ZLEqualizerStatus
  freeverb3: Freeverb3Status
}

interface PluginMeterSectionProps {
  title: string
  icon: React.ReactNode
  color: string
  inputLevel: number
  outputLevel: number
  peakInput: number
  peakOutput: number
  gainReduction?: number
  status: 'active' | 'inactive' | 'bypassed'
  latency?: number
}

function PluginMeterSection({
  title,
  icon,
  color,
  inputLevel,
  outputLevel,
  peakInput,
  peakOutput,
  gainReduction,
  status,
  latency
}: PluginMeterSectionProps) {
  const statusColor = status === 'active' ? '#22c55e' : status === 'bypassed' ? '#f59e0b' : '#666'
  const statusText = status === 'active' ? 'Active' : status === 'bypassed' ? 'Bypassed' : 'Inactive'

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0e1625, #141e32)',
      border: `1px solid ${color}33`,
      borderRadius: 8,
      padding: 16,
      minWidth: 280,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        paddingBottom: 12,
        borderBottom: `1px solid ${color}22`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ color }}>{icon}</div>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#f2f6ff' }}>{title}</span>
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11,
        }}>
          <div style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: statusColor,
            boxShadow: status === 'active' ? `0 0 8px ${statusColor}` : 'none',
          }} />
          <span style={{ color: statusColor }}>{statusText}</span>
        </div>
      </div>

      {/* Meters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <AudioMeter
          label="Input"
          value={inputLevel}
          peak={peakInput}
          min={-60}
          max={12}
        />
        <AudioMeter
          label="Output"
          value={outputLevel}
          peak={peakOutput}
          min={-60}
          max={12}
        />
        {gainReduction !== undefined && gainReduction !== 0 && (
          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
              Gain Reduction
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                flex: 1,
                height: 12,
                background: '#1a1628',
                borderRadius: 4,
                overflow: 'hidden',
                position: 'relative',
              }}>
                <div style={{
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  height: '100%',
                  width: `${Math.min(100, Math.abs(gainReduction) * 5)}%`,
                  background: 'linear-gradient(90deg, #f59e0b, #ef4444)',
                  borderRadius: 4,
                }} />
              </div>
              <span style={{ fontSize: 12, color: '#f59e0b', minWidth: 50, textAlign: 'right' }}>
                -{Math.abs(gainReduction).toFixed(1)} dB
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {latency !== undefined && latency > 0 && (
        <div style={{
          marginTop: 12,
          paddingTop: 8,
          borderTop: `1px solid ${color}22`,
          fontSize: 10,
          color: '#666',
        }}>
          Latency: {latency.toFixed(2)}ms
        </div>
      )}
    </div>
  )
}

export function AudioMeteringTab({
  nam,
  cabinet,
  reverb,
  cocoaDelay,
  zitaAT1,
  tripleSpread,
  valentine,
  zlEqualizer,
  freeverb3,
}: AudioMeteringTabProps) {
  const getStatus = (available: boolean, bypass: boolean): 'active' | 'inactive' | 'bypassed' => {
    if (!available) return 'inactive'
    if (bypass) return 'bypassed'
    return 'active'
  }

  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 24,
        padding: 16,
        background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.1), rgba(0, 0, 0, 0.3))',
        borderRadius: 8,
        border: '1px solid rgba(0, 212, 255, 0.2)',
      }}>
        <Activity size={24} style={{ color: '#00d4ff' }} />
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#f2f6ff', margin: 0 }}>
            Audio Metering
          </h3>
          <p style={{ fontSize: 12, color: '#888', margin: '4px 0 0 0' }}>
            Real-time input/output levels for all native audio processors
          </p>
        </div>
      </div>

      {/* Master Section */}
      <div style={{
        background: 'linear-gradient(135deg, #0e1625, #141e32)',
        border: '1px solid #333',
        borderRadius: 8,
        padding: 20,
        marginBottom: 24,
      }}>
        <h4 style={{
          fontSize: 12,
          fontWeight: 600,
          color: '#00d4ff',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          margin: '0 0 16px 0',
        }}>
          Master Levels
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
          <div>
            <AudioMeter
              label="Master Input"
              value={Math.max(nam.inputLevel, cabinet.inputLevel, reverb.inputLevel)}
              peak={Math.max(nam.peakInput, cabinet.peakInput, reverb.peakInput)}
              min={-60}
              max={12}
            />
          </div>
          <div>
            <AudioMeter
              label="Master Output"
              value={Math.max(nam.outputLevel, cabinet.outputLevel, reverb.outputLevel)}
              peak={Math.max(nam.peakOutput, cabinet.peakOutput, reverb.peakOutput)}
              min={-60}
              max={12}
            />
          </div>
        </div>
      </div>

      {/* Plugin Meters Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: 16,
      }}>
        {/* Amp/Tone Section */}
        <PluginMeterSection
          title="Neural Amp Modeler"
          icon={<Gauge size={18} />}
          color="#10b981"
          inputLevel={nam.inputLevel}
          outputLevel={nam.outputLevel}
          peakInput={nam.peakInput}
          peakOutput={nam.peakOutput}
          status={getStatus(nam.available, nam.bypass)}
          latency={nam.latency}
        />

        <PluginMeterSection
          title="Cabinet IR"
          icon={<Volume2 size={18} />}
          color="#8b5cf6"
          inputLevel={cabinet.inputLevel}
          outputLevel={cabinet.outputLevel}
          peakInput={cabinet.peakInput}
          peakOutput={cabinet.peakOutput}
          status={getStatus(cabinet.loaded !== null, cabinet.bypass)}
          latency={cabinet.latency}
        />

        <PluginMeterSection
          title="ZL Equalizer"
          icon={<Activity size={18} />}
          color="#06b6d4"
          inputLevel={zlEqualizer.inputLevel}
          outputLevel={zlEqualizer.outputLevel}
          peakInput={zlEqualizer.peakInput}
          peakOutput={zlEqualizer.peakOutput}
          status={getStatus(zlEqualizer.available, zlEqualizer.bypass)}
          latency={zlEqualizer.latency}
        />

        {/* Dynamics */}
        <PluginMeterSection
          title="Valentine Compressor"
          icon={<Gauge size={18} />}
          color="#ef4444"
          inputLevel={valentine.inputLevel}
          outputLevel={valentine.outputLevel}
          peakInput={valentine.peakInput}
          peakOutput={valentine.peakOutput}
          gainReduction={valentine.gainReduction}
          status={getStatus(valentine.available, valentine.bypass)}
          latency={valentine.latency}
        />

        {/* Time-Based */}
        <PluginMeterSection
          title="Cocoa Delay"
          icon={<Activity size={18} />}
          color="#d4a574"
          inputLevel={cocoaDelay.inputLevel}
          outputLevel={cocoaDelay.outputLevel}
          peakInput={cocoaDelay.peakInput}
          peakOutput={cocoaDelay.peakOutput}
          status={getStatus(cocoaDelay.available, cocoaDelay.bypass)}
          latency={cocoaDelay.latency}
        />

        <PluginMeterSection
          title="Reverb IR"
          icon={<Volume2 size={18} />}
          color="#3b82f6"
          inputLevel={reverb.inputLevel}
          outputLevel={reverb.outputLevel}
          peakInput={reverb.peakInput}
          peakOutput={reverb.peakOutput}
          status={getStatus(reverb.loaded !== null, reverb.bypass)}
          latency={reverb.latency}
        />

        <PluginMeterSection
          title="Freeverb3"
          icon={<Volume2 size={18} />}
          color="#6366f1"
          inputLevel={freeverb3.inputLevel}
          outputLevel={freeverb3.outputLevel}
          peakInput={freeverb3.peakInput}
          peakOutput={freeverb3.peakOutput}
          status={getStatus(freeverb3.available, freeverb3.bypass)}
          latency={freeverb3.latency}
        />

        {/* Modulation/Pitch */}
        <PluginMeterSection
          title="TripleSpread"
          icon={<Activity size={18} />}
          color="#ec4899"
          inputLevel={tripleSpread.inputLevel}
          outputLevel={tripleSpread.outputLevel}
          peakInput={tripleSpread.peakInput}
          peakOutput={tripleSpread.peakOutput}
          status={getStatus(tripleSpread.available, tripleSpread.bypass)}
          latency={tripleSpread.latency}
        />

        <PluginMeterSection
          title="Zita AT1 Autotune"
          icon={<Gauge size={18} />}
          color="#f97316"
          inputLevel={zitaAT1.inputLevel}
          outputLevel={zitaAT1.outputLevel}
          peakInput={zitaAT1.peakInput}
          peakOutput={zitaAT1.peakOutput}
          status={getStatus(zitaAT1.available, zitaAT1.bypass)}
          latency={zitaAT1.latency}
        />
      </div>
    </div>
  )
}
