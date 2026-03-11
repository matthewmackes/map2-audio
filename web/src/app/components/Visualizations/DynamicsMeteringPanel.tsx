/**
 * DynamicsMeteringPanel - Real-time Dynamics Processor Metering
 *
 * Displays gain reduction meters for Compressor, Limiter, and Noise Gate
 */

import React from 'react'
import { useDynamics, DynamicsMetering } from '../../hooks/useDynamics'

interface GainReductionMeterProps {
  label: string
  metering: DynamicsMetering
  color: string
  bypass?: boolean
}

const GainReductionMeter: React.FC<GainReductionMeterProps> = ({
  label,
  metering,
  color,
  bypass = false
}) => {
  const maxGr = 24 // Max gain reduction display in dB
  const grPercent = Math.min(100, (Math.abs(metering.gainReduction) / maxGr) * 100)

  const formatDb = (db: number) => {
    if (db <= -100) return '-∞'
    if (db >= 0) return '0.0'
    return db.toFixed(1)
  }

  return (
    <div style={{
      background: 'rgba(20, 25, 35, 0.6)',
      borderRadius: 6,
      padding: 10,
      opacity: bypass ? 0.4 : 1,
      transition: 'opacity 0.2s'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color }}>{label}</span>
        {bypass && (
          <span style={{ fontSize: 9, color: '#666', textTransform: 'uppercase' }}>Bypass</span>
        )}
      </div>

      {/* Gain Reduction Bar */}
      <div style={{ marginBottom: 8 }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 9,
          color: '#666',
          marginBottom: 2
        }}>
          <span>GR</span>
          <span style={{
            fontFamily: 'monospace',
            color: metering.gainReduction < -3 ? color : '#888'
          }}>
            {metering.gainReduction.toFixed(1)} dB
          </span>
        </div>
        <div style={{
          height: 8,
          background: '#1a1628',
          borderRadius: 4,
          overflow: 'hidden',
          position: 'relative'
        }}>
          {/* GR bar grows from right to left */}
          <div style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: `${grPercent}%`,
            background: `linear-gradient(to left, ${color}, ${color}88)`,
            transition: 'width 0.05s ease-out'
          }} />
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 8,
          color: '#444',
          marginTop: 1
        }}>
          <span>0</span>
          <span>-12</span>
          <span>-24</span>
        </div>
      </div>

      {/* Input/Output Levels */}
      <div style={{
        display: 'flex',
        gap: 8
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 8, color: '#555', marginBottom: 2 }}>IN</div>
          <div style={{
            height: 4,
            background: '#1a1628',
            borderRadius: 2,
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              width: `${Math.max(0, Math.min(100, (metering.inputLevel + 60) / 60 * 100))}%`,
              background: '#3b82f6',
              transition: 'width 0.05s ease-out'
            }} />
          </div>
          <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#666', marginTop: 1 }}>
            {formatDb(metering.inputLevel)}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 8, color: '#555', marginBottom: 2 }}>OUT</div>
          <div style={{
            height: 4,
            background: '#1a1628',
            borderRadius: 2,
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              width: `${Math.max(0, Math.min(100, (metering.outputLevel + 60) / 60 * 100))}%`,
              background: '#22c55e',
              transition: 'width 0.05s ease-out'
            }} />
          </div>
          <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#666', marginTop: 1 }}>
            {formatDb(metering.outputLevel)}
          </div>
        </div>
      </div>
    </div>
  )
}

interface DynamicsMeteringPanelProps {
  showCompressor?: boolean
  showLimiter?: boolean
  showGate?: boolean
  compact?: boolean
  className?: string
  nodeId?: string | null
}

export const DynamicsMeteringPanel: React.FC<DynamicsMeteringPanelProps> = ({
  showCompressor = true,
  showLimiter = true,
  showGate = true,
  compact = false,
  className = '',
  nodeId,
}) => {
  const {
    compressor,
    limiter,
    gate,
    isConnected,
    isRunning
  } = useDynamics({ nodeId })

  if (!isRunning) {
    return (
      <div className={className} style={{ color: '#666', fontSize: 12, textAlign: 'center', padding: 20 }}>
        Audio engine not running
      </div>
    )
  }

  return (
    <div className={className}>
      <div style={{
        background: 'rgba(20, 25, 35, 0.8)',
        borderRadius: 8,
        padding: compact ? 12 : 16
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#f59e0b' }}>Dynamics</span>
          <div style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: isConnected ? '#22c55e' : '#666'
          }} />
        </div>

        <div style={{
          display: 'grid',
          gap: 10,
          gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit, minmax(140px, 1fr))'
        }}>
          {showCompressor && (
            <GainReductionMeter
              label="Compressor"
              metering={compressor.metering}
              color="#8b5cf6"
              bypass={compressor.parameters.bypass}
            />
          )}
          {showLimiter && (
            <GainReductionMeter
              label="Limiter"
              metering={limiter.metering}
              color="#ef4444"
              bypass={limiter.parameters.bypass}
            />
          )}
          {showGate && (
            <GainReductionMeter
              label="Gate"
              metering={gate.metering}
              color="#06b6d4"
              bypass={gate.parameters.bypass}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default DynamicsMeteringPanel
