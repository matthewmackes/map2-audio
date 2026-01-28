import { useEffect, useState, useRef } from 'react'

interface AudioMeterProps {
  label?: string
  value: number
  peak: number
  min?: number
  max?: number
  unit?: string
  showPeak?: boolean
  showValue?: boolean
  showScale?: boolean
  compact?: boolean
}

export function AudioMeter({
  label,
  value,
  peak,
  min = -60,
  max = 12,
  unit = 'dB',
  showPeak = true,
  showValue = true,
  showScale = false,
  compact = false
}: AudioMeterProps) {
  const [peakHold, setPeakHold] = useState(peak)
  const [isClipping, setIsClipping] = useState(false)
  const clipTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const peakTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Handle peak hold with decay
  useEffect(() => {
    if (peak > peakHold) {
      setPeakHold(peak)

      if (peakTimeoutRef.current) clearTimeout(peakTimeoutRef.current)

      peakTimeoutRef.current = setTimeout(() => {
        setPeakHold(value)
      }, 2000)
    }

    return () => {
      if (peakTimeoutRef.current) clearTimeout(peakTimeoutRef.current)
    }
  }, [peak, value])

  // Handle clipping indicator
  useEffect(() => {
    if (value > 0 || peak > 0) {
      setIsClipping(true)

      if (clipTimeoutRef.current) clearTimeout(clipTimeoutRef.current)

      clipTimeoutRef.current = setTimeout(() => {
        setIsClipping(false)
      }, 500)
    }

    return () => {
      if (clipTimeoutRef.current) clearTimeout(clipTimeoutRef.current)
    }
  }, [value, peak])

  const range = max - min
  const percentage = Math.max(0, Math.min(100, ((value - min) / range) * 100))
  const peakPercentage = Math.max(0, Math.min(100, ((peakHold - min) / range) * 100))
  const zeroDbPosition = ((0 - min) / range) * 100

  // Gradient color based on level
  let barColor = '#10b981' // Green
  let barGradient = 'linear-gradient(90deg, #10b981 0%, #10b981 100%)'

  if (percentage > 75) {
    barColor = '#f59e0b' // Yellow/Orange
    barGradient = 'linear-gradient(90deg, #10b981 0%, #10b981 70%, #f59e0b 100%)'
  }
  if (percentage > 95) {
    barColor = '#ef4444' // Red
    barGradient = 'linear-gradient(90deg, #10b981 0%, #10b981 60%, #f59e0b 80%, #ef4444 100%)'
  }

  const height = compact ? 10 : 16

  return (
    <div style={{ marginBottom: compact ? 8 : 12 }}>
      {label && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 11,
          color: '#888',
          marginBottom: 4
        }}>
          <span>{label}</span>
          {isClipping && (
            <span style={{
              fontSize: 9,
              fontWeight: 700,
              color: '#ef4444',
              background: 'rgba(239, 68, 68, 0.2)',
              padding: '2px 6px',
              borderRadius: 4,
              animation: 'pulse 0.5s ease-in-out',
            }}>
              CLIP
            </span>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{
          flex: 1,
          position: 'relative',
          height,
          background: '#1a1628',
          borderRadius: 4,
          overflow: 'hidden',
          border: isClipping ? '1px solid #ef4444' : '1px solid transparent',
          transition: 'border-color 0.1s ease',
        }}>
          {/* Main level bar */}
          <div
            style={{
              height: '100%',
              width: `${percentage}%`,
              background: barGradient,
              transition: 'width 0.05s ease-out',
              boxShadow: isClipping ? '0 0 8px rgba(239, 68, 68, 0.5)' : 'none',
            }}
          />

          {/* 0 dB marker line */}
          {zeroDbPosition > 0 && zeroDbPosition < 100 && (
            <div
              style={{
                position: 'absolute',
                left: `${zeroDbPosition}%`,
                top: 0,
                height: '100%',
                width: '1px',
                background: 'rgba(255, 255, 255, 0.3)',
              }}
            />
          )}

          {/* Peak hold marker */}
          {showPeak && peakPercentage > 0 && (
            <div
              style={{
                position: 'absolute',
                left: `calc(${peakPercentage}% - 1px)`,
                top: 0,
                height: '100%',
                width: '2px',
                background: peakHold > 0 ? '#ef4444' : '#fff',
                boxShadow: peakHold > 0
                  ? '0 0 6px rgba(239, 68, 68, 0.8)'
                  : '0 0 4px rgba(255, 255, 255, 0.5)',
              }}
            />
          )}
        </div>

        {showValue && (
          <div style={{
            fontSize: compact ? 10 : 12,
            color: value > 0 ? '#ef4444' : '#f2f6ff',
            minWidth: compact ? 50 : 60,
            textAlign: 'right',
            fontWeight: value > 0 ? 600 : 400,
            fontFamily: 'monospace',
          }}>
            {value > -60 ? value.toFixed(1) : '-∞'} {unit}
          </div>
        )}

        {showPeak && !compact && (
          <div style={{
            fontSize: 11,
            color: peakHold > 0 ? '#ef4444' : '#888',
            minWidth: 70,
            textAlign: 'right',
            fontFamily: 'monospace',
          }}>
            pk: {peakHold > -60 ? peakHold.toFixed(1) : '-∞'} {unit}
          </div>
        )}
      </div>

      {/* Optional scale */}
      {showScale && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 9,
          color: '#555',
          marginTop: 2,
          paddingLeft: 0,
          paddingRight: showValue ? (showPeak ? 138 : 68) : 0,
        }}>
          <span>{min}</span>
          <span>-30</span>
          <span>-18</span>
          <span>-6</span>
          <span>0</span>
          <span>{max}</span>
        </div>
      )}
    </div>
  )
}
