import { ReactNode } from 'react'
import { StatusBadge } from '../Visualizations/StatusBadge'

interface PluginCardProps {
  title: string
  icon: ReactNode
  color: 'nam' | 'cabinet' | 'reverb' | 'delay' | 'autotune' | 'airwindows' | 'valentine' | 'eq' | 'freeverb3'
  status: 'active' | 'inactive' | 'error'
  children: ReactNode
  onStatusClick?: () => void
  defaultCollapsed?: boolean // kept for backwards compatibility, but ignored
}

export function PluginCard({
  title,
  icon,
  color,
  status,
  children,
  onStatusClick,
}: PluginCardProps) {

  const colorSchemes = {
    nam: {
      gradient: 'linear-gradient(135deg, rgba(45, 27, 78, 0.3), rgba(90, 45, 143, 0.3))',
      accent: '#ff6b9d'
    },
    cabinet: {
      gradient: 'linear-gradient(135deg, rgba(61, 40, 23, 0.3), rgba(139, 90, 43, 0.3))',
      accent: '#ffb84d'
    },
    reverb: {
      gradient: 'linear-gradient(135deg, rgba(10, 63, 81, 0.3), rgba(30, 111, 127, 0.3))',
      accent: '#37d6c9'
    },
    delay: {
      gradient: 'linear-gradient(135deg, rgba(78, 52, 46, 0.3), rgba(139, 90, 78, 0.3))',
      accent: '#d4a574'
    },
    autotune: {
      gradient: 'linear-gradient(135deg, rgba(46, 78, 52, 0.3), rgba(78, 139, 90, 0.3))',
      accent: '#4ade80'
    },
    airwindows: {
      gradient: 'linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(139, 92, 246, 0.3))',
      accent: '#a78bfa'
    },
    valentine: {
      gradient: 'linear-gradient(135deg, rgba(225, 29, 72, 0.3), rgba(190, 18, 60, 0.3))',
      accent: '#e11d48'
    },
    eq: {
      gradient: 'linear-gradient(135deg, rgba(6, 182, 212, 0.3), rgba(8, 145, 178, 0.3))',
      accent: '#06b6d4'
    },
    freeverb3: {
      gradient: 'linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(79, 70, 229, 0.3))',
      accent: '#6366f1'
    }
  }

  const scheme = colorSchemes[color]

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: 16,
        background: 'linear-gradient(135deg, #0e1625, #141e32)',
        border: `1px solid ${scheme.accent}40`,
        borderRadius: 8,
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
        transition: 'all 0.3s ease'
      }}
      className="plugin-card"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 12,
          paddingBottom: 12,
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: scheme.gradient,
            borderRadius: 6,
            color: scheme.accent
          }}
        >
          {icon}
        </div>
        <h3 style={{ flex: 1, fontWeight: 600, fontSize: 14, color: '#f2f6ff', margin: 0 }}>
          {title}
        </h3>
        <div onClick={(e) => e.stopPropagation()}>
          <StatusBadge status={status} onClick={onStatusClick} />
        </div>
      </div>
      {children}
    </div>
  )
}
