import { useState } from 'react'
import { Cpu, Activity } from 'lucide-react'
import { useNativePlugins } from '../hooks/useNativePlugins'
import { NAMCard } from '../components/NativePlugins/NAMCard'
import { CabinetIRCard } from '../components/NativePlugins/CabinetIRCard'
import { ReverbIRCard } from '../components/NativePlugins/ReverbIRCard'
import { SignalFlowVisualization } from '../components/NativePlugins/SignalFlowVisualization'
import { AudioMeter } from '../components/Visualizations/AudioMeter'
import { AudioMeteringTab } from '../components/NativePlugins/AudioMeteringTab'

type TabId = 'processors' | 'metering'

const TABS: Array<{ id: TabId; label: string; icon: typeof Cpu }> = [
  { id: 'processors', label: 'Processors', icon: Cpu },
  { id: 'metering', label: 'Audio Metering', icon: Activity },
]

export function NativePluginsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('processors')

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
    isError,
    updateNAMModel,
    updateNAMMix,
    updateNAMBypass,
    updateCabinetIR,
    updateCabinetMix,
    updateCabinetBypass,
    updateReverbIR,
    updateReverbMix,
    updateReverbBypass
  } = useNativePlugins()

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        color: '#888',
        fontSize: 14
      }}>
        Loading native plugins...
      </div>
    )
  }

  const masterInputLevel = Math.max(nam.inputLevel, cabinet.inputLevel, reverb.inputLevel)
  const masterOutputLevel = Math.max(nam.outputLevel, cabinet.outputLevel, reverb.outputLevel)

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f2f6ff', margin: '0 0 8px 0' }}>
          Native Audio Processors
        </h1>
        <p style={{ fontSize: 14, color: '#888', margin: 0 }}>
          Advanced neural and convolution-based audio processing
        </p>
      </div>

      {/* Tab Navigation */}
      <div style={{
        display: 'flex',
        gap: 4,
        marginBottom: 24,
        padding: 4,
        background: '#1a1628',
        borderRadius: 8,
        width: 'fit-content',
      }}>
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 20px',
                background: isActive ? '#00d4ff' : 'transparent',
                color: isActive ? '#0a0a12' : '#888',
                border: 'none',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: isActive ? 600 : 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'processors' && (
        <>
          {/* Signal Flow */}
          <div style={{
            background: 'linear-gradient(135deg, #0e1625, #141e32)',
            border: '1px solid #333',
            borderRadius: 8,
            marginBottom: 32,
            overflow: 'hidden'
          }}>
            <SignalFlowVisualization
              namStatus={nam.bypass ? 'inactive' : 'active'}
              cabinetStatus={cabinet.bypass ? 'inactive' : 'active'}
              reverbStatus={reverb.bypass ? 'inactive' : 'active'}
            />
          </div>

          {/* Plugin Cards Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
            gap: 20,
            marginBottom: 32
          }}>
            <NAMCard
              status={nam}
              onModelChange={updateNAMModel}
              onMixChange={updateNAMMix}
              onBypassChange={updateNAMBypass}
            />
            <CabinetIRCard
              status={cabinet}
              onIRChange={updateCabinetIR}
              onMixChange={updateCabinetMix}
              onBypassChange={updateCabinetBypass}
            />
            <ReverbIRCard
              status={reverb}
              onIRChange={updateReverbIR}
              onMixChange={updateReverbMix}
              onBypassChange={updateReverbBypass}
            />
          </div>

          {/* Global Statistics */}
          <div style={{
            background: 'linear-gradient(135deg, #0e1625, #141e32)',
            border: '1px solid #333',
            borderRadius: 8,
            padding: 20
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#f2f6ff', margin: '0 0 20px 0' }}>
              Master Output
            </h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: 24
            }}>
              <div>
                <AudioMeter
                  label="Master Input"
                  value={masterInputLevel}
                  peak={Math.max(nam.peakInput, cabinet.peakInput, reverb.peakInput)}
                  min={-60}
                  max={12}
                />
              </div>
              <div>
                <AudioMeter
                  label="Master Output"
                  value={masterOutputLevel}
                  peak={Math.max(nam.peakOutput, cabinet.peakOutput, reverb.peakOutput)}
                  min={-60}
                  max={12}
                />
              </div>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                paddingBottom: 4,
                fontSize: 12,
                color: '#888',
                lineHeight: 1.6
              }}>
                <div>Processing Latency: {(nam.latency + cabinet.latency + reverb.latency).toFixed(2)}ms</div>
                <div>CPU Usage: Real-time monitoring active</div>
                <div>Sample Rate: 48 kHz</div>
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'metering' && (
        <AudioMeteringTab
          nam={nam}
          cabinet={cabinet}
          reverb={reverb}
          cocoaDelay={cocoaDelay}
          zitaAT1={zitaAT1}
          tripleSpread={tripleSpread}
          valentine={valentine}
          zlEqualizer={zlEqualizer}
          freeverb3={freeverb3}
        />
      )}

      {/* Error Indicator */}
      {isError && (
        <div style={{
          marginTop: 20,
          padding: 16,
          background: '#5a2b2b',
          border: '1px solid #8b4545',
          borderRadius: 6,
          color: '#ffcccc',
          fontSize: 13
        }}>
          Some plugins are not responding. Please check backend connection.
        </div>
      )}
    </div>
  )
}
