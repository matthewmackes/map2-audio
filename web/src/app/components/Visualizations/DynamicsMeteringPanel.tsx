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
      transition: 'opacity var(--map2-dur-base, 220ms) var(--map2-ease-in-out-rack, ease)'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color }}>{label}</span>
        {bypass && (
          <span style={{ fontSize: 9, color: 'var(--cds-text-helper)', letterSpacing: '0.02em' }}>Bypass</span>
        )}
      </div>

      {/* Gain Reduction Bar */}
      <div style={{ marginBottom: 8 }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 9,
          color: 'var(--cds-text-helper)',
          marginBottom: 2
        }}>
          <span>GR</span>
          <span style={{
            fontFamily: 'var(--font-mono)',
            color: metering.gainReduction < -3 ? color : 'var(--cds-text-secondary)'
          }}>
            {metering.gainReduction.toFixed(1)} dB
          </span>
        </div>
        <div style={{
          height: 8,
          background: 'var(--cds-layer)',
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
            // carbon-allow: gain-reduction meter ballistics 50ms — explicit T2466 carve-out (audio-domain motion).
            transition: 'width 0.05s ease-out'
          }} />
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 8,
          color: 'var(--cds-text-disabled)',
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
          <div style={{ fontSize: 8, color: 'var(--cds-text-disabled)', marginBottom: 2 }}>IN</div>
          <div style={{
            height: 4,
            background: 'var(--cds-layer)',
            borderRadius: 2,
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              width: `${Math.max(0, Math.min(100, (metering.inputLevel + 60) / 60 * 100))}%`,
              background: 'var(--cds-support-info)',
              // carbon-allow: input-level meter ballistics 50ms — explicit T2466 carve-out (audio-domain motion).
              transition: 'width 0.05s ease-out'
            }} />
          </div>
          <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--cds-text-helper)', marginTop: 1 }}>
            {formatDb(metering.inputLevel)}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 8, color: 'var(--cds-text-disabled)', marginBottom: 2 }}>OUT</div>
          <div style={{
            height: 4,
            background: 'var(--cds-layer)',
            borderRadius: 2,
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              width: `${Math.max(0, Math.min(100, (metering.outputLevel + 60) / 60 * 100))}%`,
              background: 'var(--cds-support-success)',
              // carbon-allow: output-level meter ballistics 50ms — explicit T2466 carve-out (audio-domain motion).
              transition: 'width 0.05s ease-out'
            }} />
          </div>
          <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--cds-text-helper)', marginTop: 1 }}>
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
      <div className={className} style={{ color: 'var(--cds-text-helper)', fontSize: 12, textAlign: 'center', padding: 20 }}>
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
          {/* carbon-allow: panel-identity amber accent (T2481-F1; matches dynamics module visual identity in audio-meter family). */}
          <span style={{ fontSize: 13, fontWeight: 600, color: '#f59e0b' }}>Dynamics</span>
          <div style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: isConnected ? 'var(--cds-support-success)' : 'var(--cds-text-helper)'
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
              // carbon-allow: dynamics-module category accent (T2481-F1; per-module identity color, no Carbon equivalent token).
              color="#8b5cf6"
              bypass={compressor.parameters.bypass}
            />
          )}
          {showLimiter && (
            <GainReductionMeter
              label="Limiter"
              metering={limiter.metering}
              // carbon-allow: dynamics-module category accent (T2481-F1; limiter-module identity color, no Carbon equivalent token).
              color="#ef4444"
              bypass={limiter.parameters.bypass}
            />
          )}
          {showGate && (
            <GainReductionMeter
              label="Gate"
              metering={gate.metering}
              // carbon-allow: dynamics-module category accent (T2481-F1; gate-module identity color, no Carbon equivalent token).
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
