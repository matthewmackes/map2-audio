/**
 * VuMeterDisplay - Real-time VU Meter Visualization
 *
 * Vertical stereo VU meters with peak hold for input and output levels
 */

import React from 'react'
import { useVuMeters } from '../../hooks/useVuMeters'

interface VuMeterBarProps {
  label: string
  leftDb: number
  rightDb: number
  leftPeak: number
  rightPeak: number
  min?: number
  max?: number
}

const VuMeterBar: React.FC<VuMeterBarProps> = ({
  label,
  leftDb,
  rightDb,
  leftPeak,
  rightPeak,
  min = -60,
  max = 6
}) => {
  const range = max - min
  const barHeight = 120

  const dbToPercent = (db: number) => Math.max(0, Math.min(100, ((db - min) / range) * 100))
  const dbToY = (db: number) => barHeight - (dbToPercent(db) / 100) * barHeight

  const getBarGradient = (db: number) => {
    if (db > 0) return 'linear-gradient(to top, #22c55e 0%, #22c55e 60%, #eab308 80%, #ef4444 100%)'
    if (db > -12) return 'linear-gradient(to top, #22c55e 0%, #22c55e 70%, #eab308 100%)'
    return 'linear-gradient(to top, #22c55e 0%, #22c55e 100%)'
  }

  const formatDb = (db: number) => {
    if (db <= -60) return '-∞'
    return db.toFixed(0)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 11, color: '#888', fontWeight: 500 }}>{label}</span>
      <div style={{ display: 'flex', gap: 3 }}>
        {/* Left channel */}
        <div style={{
          width: 12,
          height: barHeight,
          background: '#1a1628',
          borderRadius: 3,
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Level bar */}
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: `${dbToPercent(leftDb)}%`,
            background: getBarGradient(leftDb),
            transition: 'height 0.05s ease-out'
          }} />
          {/* Peak marker */}
          <div style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: dbToY(leftPeak),
            height: 2,
            background: leftPeak > 0 ? '#ef4444' : '#fff',
            boxShadow: leftPeak > 0 ? '0 0 4px #ef4444' : 'none'
          }} />
          {/* 0dB marker */}
          <div style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: dbToY(0),
            height: 1,
            background: 'rgba(255,255,255,0.3)'
          }} />
        </div>
        {/* Right channel */}
        <div style={{
          width: 12,
          height: barHeight,
          background: '#1a1628',
          borderRadius: 3,
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: `${dbToPercent(rightDb)}%`,
            background: getBarGradient(rightDb),
            transition: 'height 0.05s ease-out'
          }} />
          <div style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: dbToY(rightPeak),
            height: 2,
            background: rightPeak > 0 ? '#ef4444' : '#fff',
            boxShadow: rightPeak > 0 ? '0 0 4px #ef4444' : 'none'
          }} />
          <div style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: dbToY(0),
            height: 1,
            background: 'rgba(255,255,255,0.3)'
          }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, fontSize: 9, color: '#666' }}>
        <span>L</span>
        <span>R</span>
      </div>
      <div style={{
        fontSize: 10,
        fontFamily: 'monospace',
        color: Math.max(leftDb, rightDb) > 0 ? '#ef4444' : '#f2f6ff'
      }}>
        {formatDb(Math.max(leftDb, rightDb))} dB
      </div>
    </div>
  )
}

interface VuMeterDisplayProps {
  showInput?: boolean
  showOutput?: boolean
  compact?: boolean
  className?: string
}

export const VuMeterDisplay: React.FC<VuMeterDisplayProps> = ({
  showInput = true,
  showOutput = true,
  compact = false,
  className = ''
}) => {
  const { levels, peakHold, isConnected, isRunning, resetPeaks } = useVuMeters()

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
          <span style={{ fontSize: 13, fontWeight: 600, color: '#37d6c9' }}>VU Meters</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: isConnected ? '#22c55e' : '#666'
            }} />
            <button
              onClick={resetPeaks}
              style={{
                fontSize: 9,
                color: '#888',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 4,
                padding: '2px 6px',
                cursor: 'pointer'
              }}
            >
              Reset Peaks
            </button>
          </div>
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: compact ? 20 : 32
        }}>
          {showInput && (
            <VuMeterBar
              label="INPUT"
              leftDb={levels.inputLeft}
              rightDb={levels.inputRight}
              leftPeak={peakHold.inputLeft}
              rightPeak={peakHold.inputRight}
            />
          )}
          {showOutput && (
            <VuMeterBar
              label="OUTPUT"
              leftDb={levels.outputLeft}
              rightDb={levels.outputRight}
              leftPeak={peakHold.outputLeft}
              rightPeak={peakHold.outputRight}
            />
          )}
        </div>

        {/* Scale */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 8,
          fontSize: 9,
          color: '#555',
          paddingLeft: 10,
          paddingRight: 10
        }}>
          <span>-60</span>
          <span>-30</span>
          <span>-12</span>
          <span>0</span>
          <span>+6</span>
        </div>
      </div>
    </div>
  )
}

export default VuMeterDisplay
