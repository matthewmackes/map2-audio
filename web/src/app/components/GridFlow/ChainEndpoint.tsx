/**
 * ChainEndpoint Component
 * Audio interface input/output cards with status display
 */

import { memo, useId } from 'react'
import { ArrowDown, Speaker } from 'lucide-react'

export interface AudioInterfaceStatus {
  deviceName?: string
  sampleRate?: number
  bufferSize?: number
  latencyMs?: number
  channels?: number
  cpuLoad?: number
  xruns?: number
  isRunning?: boolean
}

export interface ChainEndpointProps {
  type: 'input' | 'output'
  label: string
  audioStatus?: AudioInterfaceStatus
  compact?: boolean
}

export const ChainEndpoint = memo(function ChainEndpoint({
  type,
  label,
  audioStatus,
  compact = false,
}: ChainEndpointProps) {
  const id = useId()
  const color = type === 'input' ? '#22c55e' : '#a855f7'
  const bgColor = type === 'input' ? 'rgba(34, 197, 94, 0.08)' : 'rgba(168, 85, 247, 0.08)'
  const secondaryColor = type === 'input' ? '#4ade80' : '#c084fc'

  // Default values if no status provided
  const deviceName = audioStatus?.deviceName || 'Audio Interface'
  const sampleRate = audioStatus?.sampleRate || 48000
  const bufferSize = audioStatus?.bufferSize || 256
  const latencyMs = audioStatus?.latencyMs || (bufferSize / sampleRate * 1000 * 2)
  const channels = audioStatus?.channels || 2
  const cpuLoad = audioStatus?.cpuLoad || 0
  const xruns = audioStatus?.xruns || 0
  const isRunning = audioStatus?.isRunning ?? true

  // Status indicators
  const latencyStatus = latencyMs < 10 ? 'excellent' : latencyMs < 20 ? 'good' : 'high'
  const cpuStatus = cpuLoad < 50 ? 'low' : cpuLoad < 80 ? 'medium' : 'high'

  if (compact) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '8px 12px',
        background: `linear-gradient(135deg, ${bgColor} 0%, rgba(0,0,0,0.25) 100%)`,
        borderRadius: 8,
        border: `1px solid ${color}40`,
        minWidth: 80,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          borderRadius: 6,
          background: `${color}30`,
        }}>
          {type === 'input' ? (
            <ArrowDown size={14} style={{ color }} />
          ) : (
            <Speaker size={14} style={{ color }} />
          )}
        </div>
        <span style={{ fontSize: 10, fontWeight: 600, color }}>{label}</span>
        <div style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: isRunning ? '#22c55e' : '#ef4444',
          boxShadow: isRunning ? '0 0 4px #22c55e' : '0 0 4px #ef4444',
        }} />
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
      padding: '12px 16px',
      background: `linear-gradient(135deg, ${bgColor} 0%, rgba(0,0,0,0.25) 100%)`,
      borderRadius: 12,
      border: `2px solid ${color}60`,
      marginBottom: type === 'input' ? 6 : 0,
      marginTop: type === 'output' ? 6 : 0,
      position: 'relative',
      overflow: 'hidden',
      boxShadow: `0 0 20px ${color}30, inset 0 0 30px ${color}08`,
      minWidth: 200,
    }}>
      {/* Animated shimmer overlay */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: '-100%',
        width: '200%',
        height: '100%',
        background: `linear-gradient(90deg, transparent 0%, ${color}15 50%, transparent 100%)`,
        animation: 'shimmer 4s ease-in-out infinite',
        pointerEvents: 'none',
      }} />

      {/* Status indicator light */}
      <div style={{
        position: 'absolute',
        top: 8,
        right: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}>
        <div style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: isRunning ? '#22c55e' : '#ef4444',
          boxShadow: isRunning ? '0 0 8px #22c55e, 0 0 16px #22c55e50' : '0 0 8px #ef4444',
          animation: isRunning ? 'breathe 2s ease-in-out infinite' : 'none',
        }} />
        <span style={{ fontSize: 9, color: isRunning ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
          {isRunning ? 'ACTIVE' : 'STOPPED'}
        </span>
      </div>

      {/* Header row with icon and label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        {/* Icon container with glow */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 36,
          height: 36,
          borderRadius: 10,
          background: `linear-gradient(135deg, ${color}40 0%, ${color}20 100%)`,
          boxShadow: `0 0 15px ${color}50, inset 0 0 10px ${color}30`,
          position: 'relative',
        }}>
          {/* Pulsing ring */}
          <div style={{
            position: 'absolute',
            width: 44,
            height: 44,
            borderRadius: '50%',
            border: `2px solid ${color}`,
            animation: 'pulseRing 2.5s ease-out infinite',
            opacity: 0.4,
          }} />
          {type === 'input' ? (
            <ArrowDown size={18} style={{ color, filter: `drop-shadow(0 0 4px ${color})` }} />
          ) : (
            <Speaker size={18} style={{ color, filter: `drop-shadow(0 0 4px ${color})` }} />
          )}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 14,
            fontWeight: 700,
            color: color,
            textShadow: `0 0 10px ${color}60`,
            letterSpacing: '1px',
          }}>
            {label}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
            {deviceName}
          </div>
        </div>

        {/* Audio waveform indicator */}
        <svg width="32" height="20" viewBox="0 0 32 20" style={{ opacity: 0.8 }}>
          <defs>
            <linearGradient id={`waveGrad-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={color} stopOpacity="0.3" />
              <stop offset="50%" stopColor={secondaryColor} stopOpacity="1" />
              <stop offset="100%" stopColor={color} stopOpacity="0.3" />
            </linearGradient>
          </defs>
          <path
            d="M2,10 Q8,2 12,10 T22,10 T32,10"
            fill="none"
            stroke={`url(#waveGrad-${id})`}
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <animate
              attributeName="d"
              values="M2,10 Q8,2 12,10 T22,10 T32,10;M2,10 Q8,18 12,10 T22,10 T32,10;M2,10 Q8,2 12,10 T22,10 T32,10"
              dur="0.8s"
              repeatCount="indefinite"
            />
          </path>
        </svg>
      </div>

      {/* Audio configuration stats grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8,
        padding: '10px 0',
        borderTop: `1px solid ${color}30`,
        borderBottom: `1px solid ${color}30`,
      }}>
        {/* Sample Rate */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: secondaryColor, textShadow: `0 0 8px ${color}50` }}>
            {(sampleRate / 1000).toFixed(sampleRate % 1000 === 0 ? 0 : 1)}k
          </div>
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Sample Rate
          </div>
        </div>

        {/* Buffer Size */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: secondaryColor, textShadow: `0 0 8px ${color}50` }}>
            {bufferSize}
          </div>
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Buffer
          </div>
        </div>

        {/* Channels */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: secondaryColor, textShadow: `0 0 8px ${color}50` }}>
            {channels === 1 ? 'Mono' : channels === 2 ? 'Stereo' : `${channels}ch`}
          </div>
          <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Channels
          </div>
        </div>
      </div>

      {/* Performance metrics row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginTop: 10,
      }}>
        {/* Latency indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          background: latencyStatus === 'excellent' ? 'rgba(34, 197, 94, 0.2)' : latencyStatus === 'good' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)',
          borderRadius: 6,
          border: `1px solid ${latencyStatus === 'excellent' ? '#22c55e' : latencyStatus === 'good' ? '#f59e0b' : '#ef4444'}40`,
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12">
            <circle cx="6" cy="6" r="5" fill="none" stroke={latencyStatus === 'excellent' ? '#22c55e' : latencyStatus === 'good' ? '#f59e0b' : '#ef4444'} strokeWidth="1.5" opacity="0.5" />
            <path d="M6,3 L6,6 L8,7" fill="none" stroke={latencyStatus === 'excellent' ? '#22c55e' : latencyStatus === 'good' ? '#f59e0b' : '#ef4444'} strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            color: latencyStatus === 'excellent' ? '#22c55e' : latencyStatus === 'good' ? '#f59e0b' : '#ef4444',
          }}>
            {latencyMs.toFixed(1)}ms
          </span>
        </div>

        {/* CPU Load with mini bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flex: 1,
        }}>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)' }}>CPU</span>
          <div style={{
            flex: 1,
            height: 6,
            background: 'rgba(0,0,0,0.3)',
            borderRadius: 3,
            overflow: 'hidden',
            position: 'relative',
          }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, cpuLoad)}%`,
              background: cpuStatus === 'low' ? 'linear-gradient(90deg, #22c55e, #4ade80)' : cpuStatus === 'medium' ? 'linear-gradient(90deg, #f59e0b, #fbbf24)' : 'linear-gradient(90deg, #ef4444, #f87171)',
              borderRadius: 3,
              boxShadow: cpuStatus === 'low' ? '0 0 6px #22c55e' : cpuStatus === 'medium' ? '0 0 6px #f59e0b' : '0 0 6px #ef4444',
              transition: 'width 0.3s ease',
            }} />
          </div>
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            color: cpuStatus === 'low' ? '#22c55e' : cpuStatus === 'medium' ? '#f59e0b' : '#ef4444',
            minWidth: 32,
            textAlign: 'right',
          }}>
            {cpuLoad.toFixed(0)}%
          </span>
        </div>

        {/* Xruns indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 8px',
          background: xruns === 0 ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
          borderRadius: 6,
          border: `1px solid ${xruns === 0 ? '#22c55e' : '#ef4444'}40`,
        }}>
          <span style={{
            fontSize: 9,
            color: xruns === 0 ? '#22c55e' : '#ef4444',
            fontWeight: 600,
          }}>
            {xruns === 0 ? '✓' : '⚠'} {xruns} xruns
          </span>
        </div>
      </div>
    </div>
  )
})
