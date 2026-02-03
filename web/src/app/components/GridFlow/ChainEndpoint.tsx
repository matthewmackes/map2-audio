/**
 * ChainEndpoint Component
 * Audio interface input/output cards with status display and port selection
 */

import { memo, useId } from 'react'
import { ArrowDown, Speaker, Settings2 } from 'lucide-react'

export interface AudioInterfaceStatus {
  deviceName?: string
  sampleRate?: number
  bufferSize?: number
  latencyMs?: number
  channels?: number
  cpuLoad?: number
  xruns?: number
  isRunning?: boolean
  selectedPorts?: number[]
  totalPorts?: number
}

export interface ChainEndpointProps {
  type: 'input' | 'output'
  label: string
  audioStatus?: AudioInterfaceStatus
  compact?: boolean
  onPortSelectClick?: () => void
}

export const ChainEndpoint = memo(function ChainEndpoint({
  type,
  label,
  audioStatus,
  compact = false,
  onPortSelectClick,
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
  const selectedPorts = audioStatus?.selectedPorts || []
  const totalPorts = audioStatus?.totalPorts || channels

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

  // Slim card design - half width, same height
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      padding: '10px 12px',
      background: `linear-gradient(135deg, ${bgColor} 0%, rgba(0,0,0,0.3) 100%)`,
      borderRadius: 10,
      border: `2px solid ${color}50`,
      position: 'relative',
      overflow: 'hidden',
      boxShadow: `0 0 15px ${color}20`,
      width: 120,
      minHeight: 100,
    }}>
      {/* Shimmer overlay */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: '-100%',
        width: '200%',
        height: '100%',
        background: `linear-gradient(90deg, transparent 0%, ${color}10 50%, transparent 100%)`,
        animation: 'shimmer 4s ease-in-out infinite',
        pointerEvents: 'none',
      }} />

      {/* Header: Icon + Label + Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          borderRadius: 8,
          background: `${color}30`,
          flexShrink: 0,
        }}>
          {type === 'input' ? (
            <ArrowDown size={14} style={{ color }} />
          ) : (
            <Speaker size={14} style={{ color }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            color: color,
            letterSpacing: '0.5px',
          }}>
            {label}
          </div>
        </div>
        <div style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: isRunning ? '#22c55e' : '#ef4444',
          boxShadow: isRunning ? '0 0 6px #22c55e' : '0 0 6px #ef4444',
          flexShrink: 0,
        }} />
      </div>

      {/* Channel Config Button - Main interaction */}
      <button
        onClick={onPortSelectClick}
        disabled={!onPortSelectClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          padding: '6px 8px',
          background: `${color}15`,
          border: `1px solid ${color}40`,
          borderRadius: 6,
          cursor: onPortSelectClick ? 'pointer' : 'default',
          transition: 'all 0.2s',
        }}
        title={onPortSelectClick ? `Configure ${type} ports` : undefined}
      >
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: secondaryColor }}>
            {selectedPorts.length > 0 ? (
              selectedPorts.length === 1 ? 'Mono' : selectedPorts.length === 2 ? 'Stereo' : `${selectedPorts.length}ch`
            ) : (
              channels === 1 ? 'Mono' : channels === 2 ? 'Stereo' : `${channels}ch`
            )}
          </div>
          {selectedPorts.length > 0 && totalPorts > 2 && (
            <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.5)' }}>
              {type === 'input' ? 'In' : 'Out'} {selectedPorts.map(p => p + 1).join(',')}
            </div>
          )}
        </div>
        {onPortSelectClick && (
          <Settings2 size={14} style={{ color: secondaryColor, opacity: 0.8 }} />
        )}
      </button>

      {/* Bottom row: Latency + Xruns */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 6,
      }}>
        {/* Latency */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 6px',
          background: latencyStatus === 'excellent' ? 'rgba(34, 197, 94, 0.15)' : latencyStatus === 'good' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          borderRadius: 4,
        }}>
          <svg width="10" height="10" viewBox="0 0 12 12">
            <circle cx="6" cy="6" r="5" fill="none" stroke={latencyStatus === 'excellent' ? '#22c55e' : latencyStatus === 'good' ? '#f59e0b' : '#ef4444'} strokeWidth="1.5" opacity="0.6" />
            <path d="M6,3 L6,6 L8,7" fill="none" stroke={latencyStatus === 'excellent' ? '#22c55e' : latencyStatus === 'good' ? '#f59e0b' : '#ef4444'} strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span style={{
            fontSize: 9,
            fontWeight: 600,
            color: latencyStatus === 'excellent' ? '#22c55e' : latencyStatus === 'good' ? '#f59e0b' : '#ef4444',
          }}>
            {latencyMs.toFixed(1)}ms
          </span>
        </div>

        {/* Xruns */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          padding: '3px 6px',
          background: xruns === 0 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          borderRadius: 4,
        }}>
          <span style={{
            fontSize: 9,
            color: xruns === 0 ? '#22c55e' : '#ef4444',
            fontWeight: 600,
          }}>
            {xruns === 0 ? '✓' : `⚠${xruns}`}
          </span>
        </div>
      </div>
    </div>
  )
})
