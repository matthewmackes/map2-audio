/**
 * ChainEndpoint Component
 *
 * Audio interface I/O card displayed at the edges of each flow's signal chain.
 * Opens the unified AudioPortSelector on click.
 *
 * Design language: Linear × Figma 2025 × Apple HIG
 *   – 1px borders, 6px radius, 4/8/12 spacing grid
 *   – Tabular figures for metrics
 *   – Subtle depth via border-contrast, no heavy shadows
 *   – Hover: border brightens, 120ms ease-out
 */

import { memo } from 'react'
import { ArrowDown, SpeakerHigh, GearSix } from '@phosphor-icons/react'

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
  selectedAvbEndpoints?: string[]
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
  const accent = type === 'input' ? '#22c55e' : '#a855f7'
  const accentMuted = type === 'input' ? '#4ade80' : '#c084fc'

  const sampleRate = audioStatus?.sampleRate || 48000
  const bufferSize = audioStatus?.bufferSize || 256
  const latencyMs = audioStatus?.latencyMs || (bufferSize / sampleRate * 1000 * 2)
  const channels = audioStatus?.channels || 2
  const xruns = audioStatus?.xruns || 0
  const isRunning = audioStatus?.isRunning ?? true
  const selectedPorts = audioStatus?.selectedPorts || []
  const selectedAvbEndpoints = audioStatus?.selectedAvbEndpoints || []
  const totalPorts = audioStatus?.totalPorts || channels
  const totalSelected = selectedPorts.length + selectedAvbEndpoints.length

  const latencyColor =
    latencyMs < 10 ? '#22c55e' : latencyMs < 20 ? '#f59e0b' : '#ef4444'

  const channelLabel =
    totalSelected > 0
      ? totalSelected === 1 ? 'Mono' : totalSelected === 2 ? 'Stereo' : `${totalSelected}ch`
      : channels === 1 ? 'Mono' : channels === 2 ? 'Stereo' : `${channels}ch`
  const localPortDetail = (
    selectedPorts.length > 0 && totalPorts > 2
      ? selectedPorts.map(p => p + 1).join(' · ')
      : null
  )
  const avbDetail = selectedAvbEndpoints.length > 0
    ? `AVB ${selectedAvbEndpoints.length}`
    : null
  const portDetail = [localPortDetail, avbDetail].filter(Boolean).join(' • ') || null

  if (compact) {
    return (
      <button
        onClick={onPortSelectClick}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
          padding: '8px 12px',
          background: `${accent}08`,
          borderRadius: 6,
          border: `1px solid ${accent}25`,
          cursor: onPortSelectClick ? 'pointer' : 'default',
          transition: 'border-color 120ms ease-out',
          minWidth: 72,
        }}
      >
        {type === 'input' ? <ArrowDown size={12} weight="duotone" style={{ color: accent, opacity: 0.7 }} /> : <SpeakerHigh size={12} weight="duotone" style={{ color: accent, opacity: 0.7 }} />}
        <span style={{ fontSize: 9, fontWeight: 700, color: accent, letterSpacing: '0.6px', textTransform: 'uppercase' }}>{label}</span>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: isRunning ? '#22c55e' : '#ef4444' }} />
      </button>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        width: 116,
        padding: '10px 10px 8px',
        background: `linear-gradient(180deg, ${accent}06 0%, rgba(0,0,0,0.18) 100%)`,
        borderRadius: 8,
        border: `1px solid ${accent}30`,
        position: 'relative',
        transition: 'border-color 120ms ease-out, box-shadow 120ms ease-out',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = `${accent}55`
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = `${accent}30`
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          background: `${accent}15`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          {type === 'input'
            ? <ArrowDown size={12} weight="duotone" style={{ color: accent }} />
            : <SpeakerHigh size={12} weight="duotone" style={{ color: accent }} />
          }
        </div>
        <span style={{
          flex: 1,
          fontSize: 10,
          fontWeight: 700,
          color: accent,
          letterSpacing: '0.4px',
          textTransform: 'uppercase',
        }}>
          {label}
        </span>
        <div style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: isRunning ? '#22c55e' : '#ef4444',
          boxShadow: isRunning ? '0 0 4px #22c55e60' : '0 0 4px #ef444460',
          flexShrink: 0,
        }} />
      </div>

      <button
        onClick={onPortSelectClick}
        disabled={!onPortSelectClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 4,
          padding: '5px 8px',
          background: `${accent}0a`,
          border: `1px solid ${accent}20`,
          borderRadius: 5,
          cursor: onPortSelectClick ? 'pointer' : 'default',
          transition: 'background 120ms ease-out, border-color 120ms ease-out',
        }}
        onMouseEnter={e => {
          if (onPortSelectClick) {
            (e.currentTarget as HTMLElement).style.background = `${accent}18`
            ;(e.currentTarget as HTMLElement).style.borderColor = `${accent}40`
          }
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.background = `${accent}0a`
          ;(e.currentTarget as HTMLElement).style.borderColor = `${accent}20`
        }}
        title={onPortSelectClick ? `Configure ${type} ports` : undefined}
      >
        <div>
          <div style={{
            fontSize: 13,
            fontWeight: 700,
            color: accentMuted,
            lineHeight: '16px',
          }}>
            {channelLabel}
          </div>
          {portDetail && (
            <div style={{
              fontSize: 8,
              color: 'rgba(255,255,255,0.35)',
              marginTop: 1,
              fontFeatureSettings: '"tnum"',
            }}>
              {type === 'input' ? 'In' : 'Out'} {portDetail}
            </div>
          )}
        </div>
        {onPortSelectClick && (
          <GearSix
            size={12}
            style={{ color: accentMuted, opacity: 0.55, flexShrink: 0 }}
          />
        )}
      </button>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          padding: '2px 5px',
          background: `${latencyColor}12`,
          borderRadius: 3,
        }}>
          <svg width="8" height="8" viewBox="0 0 12 12">
            <circle cx="6" cy="6" r="4.5" fill="none" stroke={latencyColor} strokeWidth="1.2" opacity="0.5" />
            <path d="M6,3.5 L6,6 L7.8,7" fill="none" stroke={latencyColor} strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          <span style={{
            fontSize: 9,
            fontWeight: 600,
            color: latencyColor,
            fontFeatureSettings: '"tnum"',
          }}>
            {latencyMs.toFixed(1)}ms
          </span>
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '2px 5px',
          background: xruns === 0 ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.12)',
          borderRadius: 3,
        }}>
          <span style={{
            fontSize: 8,
            fontWeight: 700,
            color: xruns === 0 ? '#22c55e' : '#ef4444',
            fontFeatureSettings: '"tnum"',
          }}>
            {xruns === 0 ? '✓' : `⚠ ${xruns}`}
          </span>
        </div>
      </div>
    </div>
  )
})
