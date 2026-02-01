/**
 * SignalCable Component
 * Animated SVG cable for signal flow visualization
 */

import { memo, useId } from 'react'

export interface SignalCableProps {
  isActive?: boolean
  color?: string
  orientation?: 'horizontal' | 'vertical'
}

export const SignalCable = memo(function SignalCable({
  isActive = true,
  color = 'var(--primary)',
  orientation = 'horizontal',
}: SignalCableProps) {
  const id = useId()
  const glowId = `glow-${id}`
  const gradientId = `cableGradient-${id}`

  if (orientation === 'vertical') {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: 24,
        position: 'relative',
      }}>
        <svg width="40" height="24" viewBox="0 0 40 24" style={{ overflow: 'visible' }}>
          <defs>
            <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={color} stopOpacity="0.3" />
              <stop offset="50%" stopColor={color} stopOpacity="1" />
              <stop offset="100%" stopColor={color} stopOpacity="0.3" />
            </linearGradient>
          </defs>

          {isActive && (
            <line
              x1="20" y1="0" x2="20" y2="24"
              stroke={color}
              strokeWidth={8}
              strokeLinecap="round"
              opacity={0.15}
              filter={`url(#${glowId})`}
            />
          )}

          <line
            x1="20" y1="0" x2="20" y2="24"
            stroke={isActive ? `url(#${gradientId})` : color}
            strokeWidth={isActive ? 4 : 2}
            strokeLinecap="round"
            opacity={isActive ? 1 : 0.4}
            filter={isActive ? `url(#${glowId})` : undefined}
          />

          {isActive && (
            <>
              <circle cx="20" cy="0" r="3" fill={color} filter={`url(#${glowId})`}>
                <animate attributeName="cy" values="-4;28" dur="0.8s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0;1;1;0" dur="0.8s" repeatCount="indefinite" />
                <animate attributeName="r" values="2;4;2" dur="0.8s" repeatCount="indefinite" />
              </circle>
              <circle cx="20" cy="0" r="2" fill="#fff" opacity="0.8">
                <animate attributeName="cy" values="-4;28" dur="0.8s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0;0.8;0.8;0" dur="0.8s" repeatCount="indefinite" />
              </circle>
              <circle cx="20" cy="0" r="2" fill={color} filter={`url(#${glowId})`}>
                <animate attributeName="cy" values="-4;28" dur="0.8s" begin="0.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0;0.7;0.7;0" dur="0.8s" begin="0.4s" repeatCount="indefinite" />
              </circle>
            </>
          )}

          <circle cx="20" cy="2" r={isActive ? 3 : 2} fill={isActive ? color : '#666'} opacity={isActive ? 1 : 0.5}>
            {isActive && <animate attributeName="r" values="2;4;2" dur="1.5s" repeatCount="indefinite" />}
          </circle>
          <circle cx="20" cy="22" r={isActive ? 3 : 2} fill={isActive ? color : '#666'} opacity={isActive ? 1 : 0.5}>
            {isActive && <animate attributeName="r" values="2;4;2" dur="1.5s" repeatCount="indefinite" />}
          </circle>
        </svg>
      </div>
    )
  }

  // Horizontal orientation (for Grid layout)
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      width: 32,
      height: 24,
      position: 'relative',
    }}>
      <svg width="32" height="24" viewBox="0 0 32 24" style={{ overflow: 'visible' }}>
        <defs>
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="50%" stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="0.3" />
          </linearGradient>
        </defs>

        {isActive && (
          <line
            x1="0" y1="12" x2="32" y2="12"
            stroke={color}
            strokeWidth={8}
            strokeLinecap="round"
            opacity={0.15}
            filter={`url(#${glowId})`}
          />
        )}

        <line
          x1="0" y1="12" x2="32" y2="12"
          stroke={isActive ? `url(#${gradientId})` : color}
          strokeWidth={isActive ? 3 : 2}
          strokeLinecap="round"
          opacity={isActive ? 1 : 0.4}
          filter={isActive ? `url(#${glowId})` : undefined}
        />

        {isActive && (
          <>
            <circle cx="0" cy="12" r="3" fill={color} filter={`url(#${glowId})`}>
              <animate attributeName="cx" values="-4;36" dur="0.8s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0;1;1;0" dur="0.8s" repeatCount="indefinite" />
              <animate attributeName="r" values="2;3;2" dur="0.8s" repeatCount="indefinite" />
            </circle>
            <circle cx="0" cy="12" r="2" fill="#fff" opacity="0.8">
              <animate attributeName="cx" values="-4;36" dur="0.8s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0;0.8;0.8;0" dur="0.8s" repeatCount="indefinite" />
            </circle>
            <circle cx="0" cy="12" r="2" fill={color} filter={`url(#${glowId})`}>
              <animate attributeName="cx" values="-4;36" dur="0.8s" begin="0.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0;0.7;0.7;0" dur="0.8s" begin="0.4s" repeatCount="indefinite" />
            </circle>
          </>
        )}

        <circle cx="2" cy="12" r={isActive ? 3 : 2} fill={isActive ? color : '#666'} opacity={isActive ? 1 : 0.5}>
          {isActive && <animate attributeName="r" values="2;3;2" dur="1.5s" repeatCount="indefinite" />}
        </circle>
        <circle cx="30" cy="12" r={isActive ? 3 : 2} fill={isActive ? color : '#666'} opacity={isActive ? 1 : 0.5}>
          {isActive && <animate attributeName="r" values="2;3;2" dur="1.5s" repeatCount="indefinite" />}
        </circle>
      </svg>
    </div>
  )
})
