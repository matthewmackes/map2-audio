import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Speaker,
  ChevronLeft,
  ChevronRight,
  Power,
  Settings2,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import { IRFrequencyGraph } from '../Visualizations/IRFrequencyGraph'
import { CabinetStatus } from '../../../map2/types/native-plugins'

interface CabinetIRFlowCardProps {
  status: CabinetStatus
  onIRChange?: (irName: string) => void
  onMixChange?: (mix: number) => void
  onBypassChange?: (bypass: boolean) => void
  onOpenFullEditor?: () => void
  isSelected?: boolean
  isDragging?: boolean
}

// Compact Cabinet IR card designed for integration in the Flows window
// Shows FFT visualization with quick prev/next navigation
export function CabinetIRFlowCard({
  status,
  onIRChange,
  onMixChange,
  onBypassChange,
  onOpenFullEditor,
  isSelected = false,
  isDragging = false,
}: CabinetIRFlowCardProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [mix, setMix] = useState(status.mix)
  const [bypass, setBypass] = useState(status.bypass)
  const [expanded, setExpanded] = useState(false)

  // Sync with external status
  useEffect(() => {
    setMix(status.mix)
    setBypass(status.bypass)
    if (status.loaded) {
      const idx = status.availableIRs.findIndex(ir => ir.name === status.loaded)
      if (idx !== -1) setCurrentIndex(idx)
    }
  }, [status])

  const sortedIRs = useMemo(() => {
    return [...status.availableIRs].sort((a, b) => a.name.localeCompare(b.name))
  }, [status.availableIRs])

  const handlePrev = useCallback(() => {
    if (sortedIRs.length === 0) return
    const newIdx = currentIndex > 0 ? currentIndex - 1 : sortedIRs.length - 1
    setCurrentIndex(newIdx)
    onIRChange?.(sortedIRs[newIdx].name)
  }, [currentIndex, sortedIRs, onIRChange])

  const handleNext = useCallback(() => {
    if (sortedIRs.length === 0) return
    const newIdx = currentIndex < sortedIRs.length - 1 ? currentIndex + 1 : 0
    setCurrentIndex(newIdx)
    onIRChange?.(sortedIRs[newIdx].name)
  }, [currentIndex, sortedIRs, onIRChange])

  const handleToggleBypass = useCallback(() => {
    setBypass(!bypass)
    onBypassChange?.(!bypass)
  }, [bypass, onBypassChange])

  const handleMixDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const startX = e.clientX
    const startMix = mix

    const onMove = (moveEvent: MouseEvent) => {
      const delta = (moveEvent.clientX - startX) / 2
      const newMix = Math.max(0, Math.min(100, startMix + delta))
      setMix(newMix)
      onMixChange?.(Math.round(newMix))
    }

    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [mix, onMixChange])

  const isActive = Boolean(status.loaded && !bypass)
  const accentColor = '#ffb84d'

  return (
    <div
      style={{
        width: expanded ? 320 : 240,
        background: `linear-gradient(135deg, rgba(61, 40, 23, ${bypass ? '0.2' : '0.4'}), rgba(15, 12, 8, 0.95))`,
        border: `2px solid ${isSelected ? accentColor : bypass ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255, 184, 77, 0.25)'}`,
        borderRadius: 10,
        overflow: 'hidden',
        opacity: isDragging ? 0.6 : bypass ? 0.75 : 1,
        transition: 'all 0.3s ease',
        boxShadow: isSelected
          ? `0 0 20px rgba(255, 184, 77, 0.3), inset 0 0 20px rgba(255, 184, 77, 0.05)`
          : isActive
            ? '0 0 12px rgba(255, 184, 77, 0.15)'
            : 'none',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          background: 'rgba(0, 0, 0, 0.4)',
          borderBottom: '1px solid rgba(255, 184, 77, 0.15)',
          cursor: 'grab',
        }}
      >
        {/* Icon with glow */}
        <div style={{
          width: 28,
          height: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `linear-gradient(135deg, rgba(255, 184, 77, ${isActive ? 0.3 : 0.15}), rgba(255, 184, 77, 0.05))`,
          borderRadius: 6,
          boxShadow: isActive ? `0 0 10px ${accentColor}50` : 'none',
        }}>
          <Speaker size={16} style={{ color: accentColor }} />
        </div>

        {/* Title */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12,
            fontWeight: 600,
            color: '#f2f6ff',
            lineHeight: 1.2,
          }}>
            Cabinet IR
          </div>
          <div style={{
            fontSize: 10,
            color: isActive ? accentColor : 'rgba(255, 255, 255, 0.4)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {status.loaded || 'No IR loaded'}
          </div>
        </div>

        {/* Status badge */}
        <span style={{
          fontSize: 8,
          padding: '2px 5px',
          borderRadius: 3,
          background: isActive ? 'rgba(34, 197, 94, 0.2)' : bypass ? 'rgba(245, 158, 11, 0.2)' : 'rgba(100, 116, 139, 0.2)',
          color: isActive ? '#22c55e' : bypass ? '#f59e0b' : '#64748b',
          fontWeight: 600,
          textTransform: 'uppercase',
        }}>
          {isActive ? 'Live' : bypass ? 'Bypass' : 'Off'}
        </span>
      </div>

      {/* Frequency Graph - Compact */}
      <div style={{ padding: expanded ? '10px 12px' : '8px 10px' }}>
        <IRFrequencyGraph
          data={status.frequencyResponse}
          height={expanded ? 120 : 80}
          accentColor={accentColor}
          animated={isActive}
          showLabels={expanded}
        />
      </div>

      {/* Navigation Row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 10px',
        background: 'rgba(0, 0, 0, 0.3)',
        borderTop: '1px solid rgba(255, 184, 77, 0.1)',
      }}>
        {/* Prev */}
        <button
          onClick={(e) => { e.stopPropagation(); handlePrev() }}
          disabled={sortedIRs.length === 0}
          style={{
            width: 26,
            height: 26,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255, 184, 77, 0.1)',
            border: '1px solid rgba(255, 184, 77, 0.2)',
            borderRadius: 5,
            cursor: sortedIRs.length === 0 ? 'not-allowed' : 'pointer',
            opacity: sortedIRs.length === 0 ? 0.4 : 1,
          }}
          title="Previous IR"
        >
          <ChevronLeft size={14} style={{ color: accentColor }} />
        </button>

        {/* IR Counter */}
        <div style={{
          flex: 1,
          textAlign: 'center',
          fontSize: 11,
          color: 'rgba(255, 184, 77, 0.8)',
        }}>
          <span style={{ fontWeight: 700, color: accentColor }}>{currentIndex + 1}</span>
          <span style={{ color: 'rgba(255, 255, 255, 0.3)', margin: '0 3px' }}>/</span>
          <span>{sortedIRs.length}</span>
        </div>

        {/* Next */}
        <button
          onClick={(e) => { e.stopPropagation(); handleNext() }}
          disabled={sortedIRs.length === 0}
          style={{
            width: 26,
            height: 26,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255, 184, 77, 0.1)',
            border: '1px solid rgba(255, 184, 77, 0.2)',
            borderRadius: 5,
            cursor: sortedIRs.length === 0 ? 'not-allowed' : 'pointer',
            opacity: sortedIRs.length === 0 ? 0.4 : 1,
          }}
          title="Next IR"
        >
          <ChevronRight size={14} style={{ color: accentColor }} />
        </button>
      </div>

      {/* Mix Slider (Compact) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 10px',
        borderTop: '1px solid rgba(255, 184, 77, 0.1)',
      }}>
        <span style={{ fontSize: 9, color: 'rgba(255, 255, 255, 0.4)', minWidth: 24 }}>Mix</span>
        <div
          style={{
            flex: 1,
            height: 6,
            background: 'rgba(0, 0, 0, 0.4)',
            borderRadius: 3,
            cursor: 'ew-resize',
            position: 'relative',
            overflow: 'hidden',
          }}
          onMouseDown={handleMixDrag}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{
            height: '100%',
            width: `${mix}%`,
            background: `linear-gradient(90deg, ${accentColor}80, ${accentColor})`,
            borderRadius: 3,
            transition: 'width 0.1s ease',
          }} />
        </div>
        <span style={{
          fontSize: 10,
          fontWeight: 600,
          color: accentColor,
          minWidth: 32,
          textAlign: 'right',
        }}>
          {Math.round(mix)}%
        </span>
      </div>

      {/* Action Buttons */}
      <div style={{
        display: 'flex',
        gap: 4,
        padding: '8px 10px',
        background: 'rgba(0, 0, 0, 0.3)',
        borderTop: '1px solid rgba(255, 184, 77, 0.1)',
      }}>
        {/* Bypass */}
        <button
          onClick={(e) => { e.stopPropagation(); handleToggleBypass() }}
          style={{
            flex: 1,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            background: bypass ? 'rgba(245, 158, 11, 0.15)' : 'rgba(34, 197, 94, 0.15)',
            border: `1px solid ${bypass ? 'rgba(245, 158, 11, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`,
            borderRadius: 5,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          title={bypass ? 'Enable' : 'Bypass'}
        >
          <Power size={12} style={{ color: bypass ? '#f59e0b' : '#22c55e' }} />
          <span style={{ fontSize: 9, color: bypass ? '#f59e0b' : '#22c55e', fontWeight: 500 }}>
            {bypass ? 'OFF' : 'ON'}
          </span>
        </button>

        {/* Expand/Collapse */}
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded) }}
          style={{
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 5,
            cursor: 'pointer',
          }}
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? (
            <Minimize2 size={12} style={{ color: 'rgba(255, 255, 255, 0.6)' }} />
          ) : (
            <Maximize2 size={12} style={{ color: 'rgba(255, 255, 255, 0.6)' }} />
          )}
        </button>

        {/* Settings */}
        {onOpenFullEditor && (
          <button
            onClick={(e) => { e.stopPropagation(); onOpenFullEditor() }}
            style={{
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 5,
              cursor: 'pointer',
            }}
            title="Open full editor"
          >
            <Settings2 size={12} style={{ color: 'rgba(255, 255, 255, 0.6)' }} />
          </button>
        )}
      </div>

      {/* Latency Footer */}
      <div style={{
        padding: '6px 10px',
        fontSize: 9,
        color: 'rgba(255, 255, 255, 0.3)',
        display: 'flex',
        justifyContent: 'space-between',
        borderTop: '1px solid rgba(255, 184, 77, 0.08)',
      }}>
        <span>{status.currentIRSize}</span>
        <span>{status.latency.toFixed(1)}ms latency</span>
      </div>
    </div>
  )
}
