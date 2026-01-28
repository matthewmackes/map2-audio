import { useState, useEffect } from 'react'
import { Timer, Coffee, Waves } from 'lucide-react'
import { PluginCard } from './PluginCard'
import { AudioMeter } from '../Visualizations/AudioMeter'
import { ParameterSlider } from '../Controls/ParameterSlider'
import { CocoaDelayStatus } from '../../../map2/types/native-plugins'
import { ProjectAttribution } from './ProjectAttribution'

interface CocoaDelayCardProps {
  status: CocoaDelayStatus
  onMixChange?: (mix: number) => void
  onTimeChange?: (time: number) => void
  onFeedbackChange?: (feedback: number) => void
  onDriftChange?: (drift: number) => void
  onDuckingChange?: (ducking: number) => void
  onPanModeChange?: (mode: 'static' | 'pingpong' | 'circular') => void
  onDriveChange?: (params: { enabled: boolean; amount: number }) => void
  onBypassChange?: (bypass: boolean) => void
}

export function CocoaDelayCard({
  status,
  onMixChange,
  onTimeChange,
  onFeedbackChange,
  onDriftChange,
  onDuckingChange,
  onPanModeChange,
  onDriveChange,
  onBypassChange
}: CocoaDelayCardProps) {
  const [mix, setMix] = useState(status.mix)
  const [delayTime, setDelayTime] = useState(status.delayTime)
  const [feedback, setFeedback] = useState(status.feedback)
  const [drift, setDrift] = useState(status.drift)
  const [ducking, setDucking] = useState(status.ducking)
  const [panMode, setPanMode] = useState(status.panMode)
  const [pan, setPan] = useState(status.pan)
  const [driveEnabled, setDriveEnabled] = useState(status.driveEnabled)
  const [driveAmount, setDriveAmount] = useState(status.driveAmount)
  const [lowCut, setLowCut] = useState(status.lowCut)
  const [highCut, setHighCut] = useState(status.highCut)
  const [tempoSync, setTempoSync] = useState(status.tempoSync)
  const [syncDivision, setSyncDivision] = useState(status.syncDivision)

  useEffect(() => {
    setMix(status.mix)
    setDelayTime(status.delayTime)
    setFeedback(status.feedback)
    setDrift(status.drift)
    setDucking(status.ducking)
    setPanMode(status.panMode)
    setPan(status.pan)
    setDriveEnabled(status.driveEnabled)
    setDriveAmount(status.driveAmount)
    setLowCut(status.lowCut)
    setHighCut(status.highCut)
    setTempoSync(status.tempoSync)
    setSyncDivision(status.syncDivision)
  }, [status])

  const syncDivisions = ['1/1', '1/2', '1/2T', '1/4', '1/4T', '1/8', '1/8T', '1/16', '1/16T', '1/32']

  return (
    <PluginCard
      title="Cocoa Delay"
      icon={<Timer size={24} />}
      color="delay"
      status={status.available ? 'active' : 'inactive'}
    >
      {/* Project Attribution */}
      <ProjectAttribution projectId="delay" />

      {/* Delay Visualization Header */}
      <div style={{
        marginBottom: 20,
        padding: 16,
        background: 'linear-gradient(135deg, rgba(212, 165, 116, 0.1), rgba(0, 0, 0, 0.3))',
        borderRadius: 10,
        border: '1px solid rgba(212, 165, 116, 0.2)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Coffee size={16} style={{ color: '#d4a574' }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: '#d4a574', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Delay Engine
            </span>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            {tempoSync && (
              <span style={{
                fontSize: 9,
                padding: '3px 8px',
                background: 'rgba(212, 165, 116, 0.2)',
                borderRadius: 12,
                color: '#d4a574',
                fontWeight: 600,
              }}>
                SYNC: {syncDivision}
              </span>
            )}
            <span style={{
              fontSize: 12,
              fontWeight: 700,
              color: '#d4a574',
            }}>
              {tempoSync ? syncDivision : `${delayTime}ms`}
            </span>
          </div>
        </div>

        {/* Delay tap visualization */}
        <div style={{
          height: 40,
          background: 'rgba(0, 0, 0, 0.3)',
          borderRadius: 6,
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Delay taps */}
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: `${(i + 1) * 20}%`,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 4,
                height: `${30 - i * 6}px`,
                background: `rgba(212, 165, 116, ${0.8 - i * 0.15})`,
                borderRadius: 2,
                boxShadow: `0 0 8px rgba(212, 165, 116, ${0.3 - i * 0.05})`,
              }}
            />
          ))}
          {/* Feedback indicator */}
          <div style={{
            position: 'absolute',
            bottom: 4,
            left: 4,
            right: 4,
            height: 3,
            background: 'rgba(0, 0, 0, 0.5)',
            borderRadius: 2,
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${feedback}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #d4a574, #f59e0b)',
              borderRadius: 2,
            }} />
          </div>
        </div>
      </div>

      {/* Input/Output Meters */}
      <div style={{ marginBottom: 20, display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <AudioMeter label="Input" value={status.inputLevel} peak={status.peakInput} />
        <AudioMeter label="Output" value={status.outputLevel} peak={status.peakOutput} />
      </div>

      {/* Core Delay Controls */}
      <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(212, 165, 116, 0.2)' }}>
        <h5 style={{ fontSize: 11, fontWeight: 700, color: '#d4a574', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 }}>
          Time
        </h5>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <input
            type="checkbox"
            id="cocoa-tempo-sync"
            checked={tempoSync}
            onChange={(e) => setTempoSync(e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          <label htmlFor="cocoa-tempo-sync" style={{ fontSize: 12, color: '#ddd', cursor: 'pointer' }}>
            Tempo Sync
          </label>
        </div>

        {tempoSync ? (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 6 }}>
              Note Division
            </label>
            <select
              value={syncDivision}
              onChange={(e) => setSyncDivision(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'rgba(212, 165, 116, 0.1)',
                color: '#f2f6ff',
                border: '1px solid rgba(212, 165, 116, 0.3)',
                borderRadius: 6,
                fontSize: 13,
                cursor: 'pointer'
              }}
            >
              {syncDivisions.map((div) => (
                <option key={div} value={div}>{div}</option>
              ))}
            </select>
          </div>
        ) : (
          <ParameterSlider
            label="Delay Time"
            value={delayTime}
            min={1}
            max={2000}
            unit="ms"
            onChange={(v) => { setDelayTime(v); onTimeChange?.(v) }}
          />
        )}

        <ParameterSlider
          label="Feedback"
          value={feedback}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => { setFeedback(v); onFeedbackChange?.(v) }}
        />
      </div>

      {/* Cocoa Delay Special Features */}
      <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(212, 165, 116, 0.2)' }}>
        <h5 style={{ fontSize: 11, fontWeight: 700, color: '#d4a574', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 }}>
          Character
        </h5>
        <ParameterSlider
          label="Drift (Wow/Flutter)"
          value={drift}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => { setDrift(v); onDriftChange?.(v) }}
        />
        <ParameterSlider
          label="Ducking"
          value={ducking}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => { setDucking(v); onDuckingChange?.(v) }}
        />
        <div style={{ fontSize: 10, color: '#888', marginTop: 4, marginBottom: 8 }}>
          Ducking attenuates wet signal based on input level
        </div>
      </div>

      {/* Pan Section */}
      <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(212, 165, 116, 0.2)' }}>
        <h5 style={{ fontSize: 11, fontWeight: 700, color: '#d4a574', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 }}>
          Stereo
        </h5>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 6 }}>
            Pan Mode
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['static', 'pingpong', 'circular'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => { setPanMode(mode); onPanModeChange?.(mode) }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: panMode === mode ? '#d4a574' : 'rgba(212, 165, 116, 0.15)',
                  color: panMode === mode ? '#1a1510' : '#d4a574',
                  border: `1px solid rgba(212, 165, 116, ${panMode === mode ? '0.8' : '0.3'})`,
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  transition: 'all 0.2s ease'
                }}
              >
                {mode === 'pingpong' ? 'Ping-Pong' : mode}
              </button>
            ))}
          </div>
        </div>
        {panMode === 'static' && (
          <ParameterSlider
            label="Pan Position"
            value={pan}
            min={-100}
            max={100}
            unit=""
            valueFormatter={(v) => v === 0 ? 'C' : v < 0 ? `L${Math.abs(v)}` : `R${v}`}
            onChange={(v) => setPan(v)}
          />
        )}
      </div>

      {/* Drive Section */}
      <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(212, 165, 116, 0.2)' }}>
        <h5 style={{ fontSize: 11, fontWeight: 700, color: '#d4a574', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 }}>
          Drive
        </h5>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <input
            type="checkbox"
            id="cocoa-drive"
            checked={driveEnabled}
            onChange={(e) => {
              setDriveEnabled(e.target.checked)
              onDriveChange?.({ enabled: e.target.checked, amount: driveAmount })
            }}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          <label htmlFor="cocoa-drive" style={{ fontSize: 12, color: '#ddd', cursor: 'pointer' }}>
            Enable Drive
          </label>
        </div>
        {driveEnabled && (
          <ParameterSlider
            label="Drive Amount"
            value={driveAmount}
            min={0}
            max={100}
            unit="%"
            onChange={(v) => {
              setDriveAmount(v)
              onDriveChange?.({ enabled: driveEnabled, amount: v })
            }}
          />
        )}
        <div style={{ fontSize: 10, color: '#888', marginTop: 4 }}>
          Saturation derived from Airwindows algorithms
        </div>
      </div>

      {/* Filter Section */}
      <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid rgba(212, 165, 116, 0.2)' }}>
        <h5 style={{ fontSize: 11, fontWeight: 700, color: '#d4a574', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 0.5 }}>
          Filter
        </h5>
        <ParameterSlider
          label="Low Cut"
          value={lowCut}
          min={20}
          max={2000}
          unit="Hz"
          onChange={(v) => setLowCut(v)}
        />
        <ParameterSlider
          label="High Cut"
          value={highCut}
          min={1000}
          max={20000}
          unit="Hz"
          onChange={(v) => setHighCut(v)}
        />
      </div>

      {/* Mix & Bypass */}
      <div style={{ marginBottom: 8 }}>
        <ParameterSlider
          label="Wet/Dry Mix"
          value={mix}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => { setMix(v); onMixChange?.(v) }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
          <input
            type="checkbox"
            id="cocoa-bypass"
            checked={status.bypass}
            onChange={(e) => onBypassChange?.(e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          <label htmlFor="cocoa-bypass" style={{ fontSize: 12, color: '#ddd', cursor: 'pointer' }}>
            Bypass
          </label>
        </div>
      </div>

      {/* Status Footer */}
      <div style={{
        fontSize: 11,
        color: '#888',
        borderTop: '1px solid rgba(212, 165, 116, 0.2)',
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
            {status.available ? 'Engine Ready' : 'Initializing...'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 10 }}>
          <span>Latency: <span style={{ color: '#d4a574', fontWeight: 600 }}>{status.latency}ms</span></span>
          {driveEnabled && <span style={{ color: '#f59e0b' }}>🔥 Drive</span>}
          {drift > 0 && <span style={{ color: '#d4a574' }}>〰️ Drift</span>}
        </div>
      </div>
    </PluginCard>
  )
}
