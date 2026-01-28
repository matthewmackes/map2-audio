import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Speaker,
  ChevronLeft,
  ChevronRight,
  Upload,
  FolderOpen,
  SkipBack,
  SkipForward,
  Power,
  Volume2,
  Settings2,
} from 'lucide-react'
import { IRFrequencyGraph } from '../Visualizations/IRFrequencyGraph'
import { AudioMeter } from '../Visualizations/AudioMeter'
import { ParameterSlider } from '../Controls/ParameterSlider'
import { CabinetStatus } from '../../../map2/types/native-plugins'
import { ProjectAttribution } from './ProjectAttribution'

interface GraphicalCabinetIRCardProps {
  status: CabinetStatus
  onIRChange?: (irName: string) => void
  onMixChange?: (mix: number) => void
  onBypassChange?: (bypass: boolean) => void
  onUploadIR?: (file: File) => void
  compact?: boolean
  showNavigation?: boolean
  showMeters?: boolean
  showControls?: boolean
}

// Enhanced Cabinet IR Card inspired by GraphicalIRLoader
// Features: FFT frequency visualization, prev/next navigation, file browser
export function GraphicalCabinetIRCard({
  status,
  onIRChange,
  onMixChange,
  onBypassChange,
  onUploadIR,
  compact = false,
  showNavigation = true,
  showMeters = true,
  showControls = true,
}: GraphicalCabinetIRCardProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [mix, setMix] = useState(status.mix)
  const [bypass, setBypass] = useState(status.bypass)
  const [isHovered, setIsHovered] = useState(false)

  // Sync with status changes
  useEffect(() => {
    setMix(status.mix)
    setBypass(status.bypass)

    // Find current IR index
    if (status.loaded && status.availableIRs.length > 0) {
      const idx = status.availableIRs.findIndex(ir => ir.name === status.loaded)
      if (idx !== -1) setSelectedIndex(idx)
    }
  }, [status])

  // Sorted IR list for navigation
  const sortedIRs = useMemo(() => {
    return [...status.availableIRs].sort((a, b) => a.name.localeCompare(b.name))
  }, [status.availableIRs])

  // Navigation handlers
  const handlePrevious = useCallback(() => {
    if (sortedIRs.length === 0) return
    const newIndex = selectedIndex > 0 ? selectedIndex - 1 : sortedIRs.length - 1
    setSelectedIndex(newIndex)
    onIRChange?.(sortedIRs[newIndex].name)
  }, [selectedIndex, sortedIRs, onIRChange])

  const handleNext = useCallback(() => {
    if (sortedIRs.length === 0) return
    const newIndex = selectedIndex < sortedIRs.length - 1 ? selectedIndex + 1 : 0
    setSelectedIndex(newIndex)
    onIRChange?.(sortedIRs[newIndex].name)
  }, [selectedIndex, sortedIRs, onIRChange])

  const handleFirst = useCallback(() => {
    if (sortedIRs.length === 0) return
    setSelectedIndex(0)
    onIRChange?.(sortedIRs[0].name)
  }, [sortedIRs, onIRChange])

  const handleLast = useCallback(() => {
    if (sortedIRs.length === 0) return
    const lastIndex = sortedIRs.length - 1
    setSelectedIndex(lastIndex)
    onIRChange?.(sortedIRs[lastIndex].name)
  }, [sortedIRs, onIRChange])

  // Mix change with debounce
  const handleMixChange = useCallback((newMix: number) => {
    setMix(newMix)
    onMixChange?.(newMix)
  }, [onMixChange])

  // Bypass toggle
  const handleBypassToggle = useCallback(() => {
    const newBypass = !bypass
    setBypass(newBypass)
    onBypassChange?.(newBypass)
  }, [bypass, onBypassChange])

  // File upload handler
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && onUploadIR) {
      onUploadIR(file)
    }
    e.target.value = ''
  }, [onUploadIR])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isHovered) return

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          handlePrevious()
          break
        case 'ArrowRight':
          e.preventDefault()
          handleNext()
          break
        case 'Home':
          e.preventDefault()
          handleFirst()
          break
        case 'End':
          e.preventDefault()
          handleLast()
          break
        case 'b':
        case 'B':
          e.preventDefault()
          handleBypassToggle()
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isHovered, handlePrevious, handleNext, handleFirst, handleLast, handleBypassToggle])

  const currentIR = sortedIRs[selectedIndex]
  const isActive = Boolean(status.loaded && !bypass)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: `linear-gradient(135deg, rgba(61, 40, 23, ${bypass ? '0.15' : '0.35'}), rgba(20, 15, 10, 0.95))`,
        border: `1px solid rgba(255, 184, 77, ${bypass ? '0.15' : '0.4'})`,
        borderRadius: 10,
        padding: compact ? 12 : 16,
        transition: 'all 0.3s ease',
        opacity: bypass ? 0.7 : 1,
        boxShadow: isActive ? '0 0 20px rgba(255, 184, 77, 0.15)' : 'none',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: compact ? 10 : 14,
          paddingBottom: compact ? 8 : 12,
          borderBottom: '1px solid rgba(255, 184, 77, 0.15)',
        }}
      >
        {/* Icon */}
        <div style={{
          width: 36,
          height: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, rgba(255, 184, 77, 0.25), rgba(255, 184, 77, 0.1))',
          borderRadius: 8,
          boxShadow: isActive ? '0 0 12px rgba(255, 184, 77, 0.3)' : 'none',
        }}>
          <Speaker size={20} style={{ color: '#ffb84d' }} />
        </div>

        {/* Title and Status */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14,
            fontWeight: 600,
            color: '#f2f6ff',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            Cabinet IR
            <span style={{
              fontSize: 9,
              padding: '2px 6px',
              borderRadius: 4,
              background: isActive ? 'rgba(34, 197, 94, 0.2)' : bypass ? 'rgba(245, 158, 11, 0.2)' : 'rgba(100, 116, 139, 0.2)',
              color: isActive ? '#22c55e' : bypass ? '#f59e0b' : '#64748b',
              fontWeight: 500,
            }}>
              {isActive ? 'ACTIVE' : bypass ? 'BYPASS' : 'INACTIVE'}
            </span>
          </div>
          {status.loaded && (
            <div style={{
              fontSize: 11,
              color: 'rgba(255, 184, 77, 0.8)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '100%',
            }}>
              {status.loaded}
            </div>
          )}
        </div>

        {/* Bypass Button */}
        <button
          onClick={(e) => { e.stopPropagation(); handleBypassToggle() }}
          style={{
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: bypass ? 'rgba(245, 158, 11, 0.2)' : 'rgba(34, 197, 94, 0.2)',
            border: `1px solid ${bypass ? 'rgba(245, 158, 11, 0.4)' : 'rgba(34, 197, 94, 0.4)'}`,
            borderRadius: 6,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          title={bypass ? 'Enable (B)' : 'Bypass (B)'}
        >
          <Power size={16} style={{ color: bypass ? '#f59e0b' : '#22c55e' }} />
        </button>
      </div>

      {/* Project Attribution */}
      <ProjectAttribution projectId="cabinet" compact />

      {/* Frequency Graph */}
      <div style={{ marginBottom: compact ? 12 : 16 }}>
        <IRFrequencyGraph
          data={status.frequencyResponse}
          height={compact ? 120 : 160}
          accentColor="#ffb84d"
          animated={isActive}
        />
      </div>

      {/* Navigation Controls */}
      {showNavigation && sortedIRs.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: compact ? 12 : 16,
          padding: '8px 10px',
          background: 'rgba(0, 0, 0, 0.3)',
          borderRadius: 8,
          border: '1px solid rgba(255, 184, 77, 0.1)',
        }}>
          {/* First button */}
          <button
            onClick={handleFirst}
            disabled={selectedIndex === 0}
            style={{
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255, 184, 77, 0.1)',
              border: '1px solid rgba(255, 184, 77, 0.2)',
              borderRadius: 6,
              cursor: selectedIndex === 0 ? 'not-allowed' : 'pointer',
              opacity: selectedIndex === 0 ? 0.4 : 1,
              transition: 'all 0.2s ease',
            }}
            title="First IR (Home)"
          >
            <SkipBack size={14} style={{ color: '#ffb84d' }} />
          </button>

          {/* Previous button */}
          <button
            onClick={handlePrevious}
            style={{
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255, 184, 77, 0.15)',
              border: '1px solid rgba(255, 184, 77, 0.3)',
              borderRadius: 6,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            title="Previous IR (←)"
          >
            <ChevronLeft size={18} style={{ color: '#ffb84d' }} />
          </button>

          {/* IR Counter */}
          <div style={{
            flex: 1,
            textAlign: 'center',
            fontSize: 12,
            color: 'rgba(255, 184, 77, 0.8)',
            fontWeight: 500,
          }}>
            <span style={{ color: '#ffb84d', fontWeight: 700 }}>{selectedIndex + 1}</span>
            <span style={{ margin: '0 4px', color: 'rgba(255, 255, 255, 0.3)' }}>/</span>
            <span>{sortedIRs.length}</span>
          </div>

          {/* Next button */}
          <button
            onClick={handleNext}
            style={{
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255, 184, 77, 0.15)',
              border: '1px solid rgba(255, 184, 77, 0.3)',
              borderRadius: 6,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            title="Next IR (→)"
          >
            <ChevronRight size={18} style={{ color: '#ffb84d' }} />
          </button>

          {/* Last button */}
          <button
            onClick={handleLast}
            disabled={selectedIndex === sortedIRs.length - 1}
            style={{
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255, 184, 77, 0.1)',
              border: '1px solid rgba(255, 184, 77, 0.2)',
              borderRadius: 6,
              cursor: selectedIndex === sortedIRs.length - 1 ? 'not-allowed' : 'pointer',
              opacity: selectedIndex === sortedIRs.length - 1 ? 0.4 : 1,
              transition: 'all 0.2s ease',
            }}
            title="Last IR (End)"
          >
            <SkipForward size={14} style={{ color: '#ffb84d' }} />
          </button>
        </div>
      )}

      {/* IR Selector Dropdown */}
      <div style={{ marginBottom: compact ? 12 : 16 }}>
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11,
          color: 'rgba(255, 255, 255, 0.5)',
          marginBottom: 6,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}>
          <FolderOpen size={12} />
          Cabinet Selection
        </label>
        <select
          value={status.loaded || ''}
          onChange={(e) => {
            const newName = e.target.value
            const idx = sortedIRs.findIndex(ir => ir.name === newName)
            if (idx !== -1) setSelectedIndex(idx)
            onIRChange?.(newName)
          }}
          style={{
            width: '100%',
            padding: '10px 12px',
            background: 'rgba(20, 15, 10, 0.8)',
            color: '#f2f6ff',
            border: '1px solid rgba(255, 184, 77, 0.25)',
            borderRadius: 6,
            fontSize: 13,
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          <option value="">-- Select Cabinet IR --</option>
          {sortedIRs.map((ir, idx) => (
            <option key={ir.name} value={ir.name}>
              {idx + 1}. {ir.name} ({ir.size})
            </option>
          ))}
        </select>
      </div>

      {/* Audio Meters */}
      {showMeters && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          marginBottom: compact ? 12 : 16,
        }}>
          <AudioMeter
            label="Input"
            value={status.inputLevel}
            peak={status.peakInput}
          />
          <AudioMeter
            label="Output"
            value={status.outputLevel}
            peak={status.peakOutput}
          />
        </div>
      )}

      {/* Controls */}
      {showControls && (
        <div style={{ marginBottom: 12 }}>
          <ParameterSlider
            label="Wet/Dry Mix"
            value={mix}
            min={0}
            max={100}
            unit="%"
            onChange={handleMixChange}
          />
        </div>
      )}

      {/* Upload Button */}
      {onUploadIR && (
        <label style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '10px 16px',
          background: 'rgba(255, 184, 77, 0.1)',
          border: '1px dashed rgba(255, 184, 77, 0.3)',
          borderRadius: 6,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          marginBottom: 12,
        }}>
          <Upload size={16} style={{ color: '#ffb84d' }} />
          <span style={{ fontSize: 12, color: '#ffb84d' }}>Upload New IR (.wav)</span>
          <input
            type="file"
            accept=".wav"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
        </label>
      )}

      {/* Status Footer */}
      <div style={{
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.4)',
        borderTop: '1px solid rgba(255, 184, 77, 0.1)',
        paddingTop: 10,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          {status.loaded ? (
            <span>
              <span style={{ color: '#22c55e' }}>●</span> {currentIR?.size || status.currentIRSize}
            </span>
          ) : (
            <span style={{ color: '#64748b' }}>No IR loaded</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Latency: {status.latency.toFixed(2)}ms</span>
          <span style={{ color: 'rgba(255, 255, 255, 0.2)' }}>|</span>
          <span>{Math.round(status.latency * 48)}smp</span>
        </div>
      </div>

      {/* Keyboard hints */}
      {isHovered && (
        <div style={{
          marginTop: 8,
          padding: '6px 10px',
          background: 'rgba(0, 0, 0, 0.4)',
          borderRadius: 6,
          fontSize: 9,
          color: 'rgba(255, 255, 255, 0.4)',
          textAlign: 'center',
        }}>
          <span style={{ color: 'rgba(255, 184, 77, 0.6)' }}>←/→</span> Navigate
          <span style={{ margin: '0 8px', color: 'rgba(255, 255, 255, 0.2)' }}>|</span>
          <span style={{ color: 'rgba(255, 184, 77, 0.6)' }}>Home/End</span> First/Last
          <span style={{ margin: '0 8px', color: 'rgba(255, 255, 255, 0.2)' }}>|</span>
          <span style={{ color: 'rgba(255, 184, 77, 0.6)' }}>B</span> Bypass
        </div>
      )}
    </div>
  )
}
