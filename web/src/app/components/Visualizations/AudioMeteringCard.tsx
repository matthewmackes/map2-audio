import { useState } from 'react'
import { Activity as Pulse, ChartLine as ChartBar, ChevronRight as CaretRight, Radio as Broadcast, Time as Clock } from '@carbon/icons-react'
import { SpectrumAnalyzer } from './SpectrumAnalyzer'
import { LoudnessMeter } from './LoudnessMeter'
import { CPUMeterPanel } from './CPUMeterPanel'
import { LatencyDisplay } from './LatencyDisplay'
import { PhaseCorrelationMeter } from './PhaseCorrelationMeter'

type MeteringTab = 'spectrum' | 'loudness' | 'cpu' | 'latency' | 'phase'

interface AudioMeteringCardProps {
  defaultExpanded?: boolean
  compact?: boolean
}

export function AudioMeteringCard({
  defaultExpanded = true,
  compact = false
}: AudioMeteringCardProps) {
  const [showMetering, setShowMetering] = useState(defaultExpanded)
  const [activeTab, setActiveTab] = useState<MeteringTab>('spectrum')

  const accentColor = '#2563eb'

  return (
    <div className="card" style={{
      background: 'linear-gradient(135deg, rgba(14, 22, 37, 0.95), rgba(20, 30, 50, 0.9))',
      borderColor: `rgba(55, 214, 201, 0.2)`,
      padding: 0,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        onClick={() => setShowMetering(!showMetering)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: compact ? '10px 14px' : '14px 20px',
          background: 'linear-gradient(135deg, rgba(55, 214, 201, 0.1), rgba(0, 212, 255, 0.05))',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: `linear-gradient(135deg, ${accentColor}20, ${accentColor}10)`,
            border: `1px solid ${accentColor}30`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Pulse size={18} style={{ color: accentColor }} />
          </div>
          <div>
            <span style={{
              fontSize: 16,
              fontWeight: 700,
              color: accentColor,
              display: 'block',
            }}>
              Audio Metering
            </span>
            <span style={{
              fontSize: 11,
              color: '#6b7280',
            }}>
              Spectrum • Loudness • CPU • Latency • Phase
            </span>
          </div>
        </div>
        <CaretRight
          size={18}
          style={{
            color: accentColor,
            transform: showMetering ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        />
      </div>

      {/* Content */}
      <div style={{
        display: 'grid',
        gridTemplateRows: showMetering ? '1fr' : '0fr',
        transition: 'grid-template-rows 0.25s ease-out',
      }}>
        <div style={{ overflow: 'hidden' }}>
          <div style={{
            padding: compact ? 12 : 20,
            background: 'rgba(0, 0, 0, 0.2)',
          }}>
            {/* Tab buttons */}
            <div style={{
              display: 'flex',
              gap: 6,
              marginBottom: 16,
              flexWrap: 'wrap',
            }}>
              {[
                { id: 'spectrum' as MeteringTab, label: 'Spectrum', icon: <ChartBar size={14} /> },
                { id: 'loudness' as MeteringTab, label: 'Loudness', icon: <Pulse size={14} /> },
                { id: 'cpu' as MeteringTab, label: 'CPU', icon: <Pulse size={14} /> },
                { id: 'latency' as MeteringTab, label: 'Latency', icon: <Clock size={14} /> },
                { id: 'phase' as MeteringTab, label: 'Phase', icon: <Broadcast size={14} /> },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    setActiveTab(tab.id)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 16px',
                    fontSize: 12,
                    fontWeight: 500,
                    background: activeTab === tab.id
                      ? `${accentColor}25`
                      : 'rgba(255, 255, 255, 0.05)',
                    border: `1px solid ${activeTab === tab.id ? `${accentColor}50` : 'rgba(255, 255, 255, 0.1)'}`,
                    borderRadius: 8,
                    color: activeTab === tab.id ? accentColor : '#6b7280',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{ minHeight: compact ? 160 : 200 }}>
              {activeTab === 'spectrum' && (
                <SpectrumAnalyzer
                  mode="bars"
                  height={compact ? 150 : 180}
                  barCount={48}
                  showLabels={true}
                  showPeaks={true}
                  colors={['#22c55e', '#eab308', '#ef4444']}
                />
              )}
              {activeTab === 'loudness' && (
                <LoudnessMeter
                  targetLufs={-14}
                  truePeakLimit={-1}
                  compact={compact}
                />
              )}
              {activeTab === 'cpu' && (
                <CPUMeterPanel
                  showBreakdown={true}
                  compact={compact}
                />
              )}
              {activeTab === 'latency' && (
                <LatencyDisplay
                  showBreakdown={true}
                  compact={compact}
                />
              )}
              {activeTab === 'phase' && (
                <PhaseCorrelationMeter
                  showStereoInfo={true}
                  orientation="horizontal"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
