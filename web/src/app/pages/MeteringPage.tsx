/**
 * MeteringPage - JUCE Core Engine Metering Dashboard
 *
 * Real-time audio analysis with all JUCE metering capabilities:
 * - VU Meters (Input/Output levels)
 * - Spectrum Analyzer (FFT visualization)
 * - Loudness Meter (LUFS with True Peak)
 * - Phase Correlation & Stereo Analysis
 * - CPU/DSP Monitoring
 * - Latency Display
 * - Dynamics Metering (Compressor/Limiter/Gate GR)
 */

import { useState } from 'react'
import { BarChart3, ChevronDown, ChevronUp } from 'lucide-react'
import { SpectrumAnalyzer } from '../components/Visualizations/SpectrumAnalyzer'
import { LoudnessMeter } from '../components/Visualizations/LoudnessMeter'
import { CPUMeterPanel } from '../components/Visualizations/CPUMeterPanel'
import { LatencyDisplay } from '../components/Visualizations/LatencyDisplay'
import { PhaseCorrelationMeter } from '../components/Visualizations/PhaseCorrelationMeter'
import { VuMeterDisplay } from '../components/Visualizations/VuMeterDisplay'
import { DynamicsMeteringPanel } from '../components/Visualizations/DynamicsMeteringPanel'

export function MeteringPage() {
  const [showApiReference, setShowApiReference] = useState(false)

  const meteringApis = [
    { endpoint: 'GET /api/audio/status', description: 'Audio engine status and configuration' },
    { endpoint: 'GET /api/audio/levels', description: 'Input/output signal levels and peak metering' },
    { endpoint: 'GET /api/audio/levels/plugins', description: 'Per-plugin signal levels' },
    { endpoint: 'GET /api/audio/health', description: 'Audio health status, XRuns, signal detection, CPU load' },
    { endpoint: 'GET /api/audio/health/xruns', description: 'XRun statistics (total, last minute, last hour)' },
    { endpoint: 'GET /api/audio/health/signal', description: 'Signal detection (input/output active, peak levels)' },
    { endpoint: 'GET /api/audio/juce', description: 'JUCE engine metrics (device, sample rate, buffer size, CPU load)' },
    { endpoint: 'GET /api/audio/pipedal', description: 'Pipedal-specific metrics' },
    { endpoint: 'GET /api/metrics/current', description: 'Current system metrics (CPU, memory, DSP)' },
    { endpoint: 'GET /api/metrics/summary', description: 'Metrics summary and health percentage' },
    { endpoint: 'GET /api/metrics/cpu', description: 'CPU usage history with configurable limit' },
    { endpoint: 'GET /api/metrics/memory', description: 'Memory usage history' },
    { endpoint: 'GET /api/metrics/latency', description: 'Latency history and breakdown' },
    { endpoint: 'GET /api/metrics/jack', description: 'JACK audio server metrics' },
    { endpoint: 'GET /api/metrics/jack/latency', description: 'JACK latency (frames, milliseconds, sample rate, buffer size)' },
  ]

  return (
    <div className="metering-page" style={{
      padding: '32px',
      background: 'linear-gradient(135deg, rgba(10, 15, 25, 0.5) 0%, rgba(20, 25, 40, 0.3) 100%)'
    }}>
      {/* Header Section */}
      <header style={{
        marginBottom: 32,
        paddingBottom: 24,
        borderBottom: '2px solid rgba(59, 130, 246, 0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <BarChart3 size={36} style={{ color: '#3b82f6', marginRight: 8, flexShrink: 0 }} />
          <h1 style={{
            fontSize: 32,
            fontWeight: 800,
            color: '#f2f6ff',
            margin: 0,
            letterSpacing: '-0.5px'
          }}>
            JUCE Core Engine
          </h1>
          <span style={{
            fontSize: 24,
            fontWeight: 700,
            color: '#3b82f6',
            margin: 0
          }}>
            : Meters
          </span>
        </div>
        <p style={{
          fontSize: 13,
          color: '#888',
          margin: '12px 0 0',
          fontWeight: 500
        }}>
          Real-time audio analysis and system performance monitoring
        </p>
      </header>

      {/* Main Dashboard Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(14, 1fr)',
        gridTemplateRows: 'auto',
        gap: 20
      }}>
        {/* Section 1: Signal Analysis (Span 9) */}
        <div style={{ gridColumn: 'span 9' }}>
          <div style={{
            background: 'rgba(15, 20, 35, 0.6)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            borderRadius: 12,
            padding: 20,
            backdropFilter: 'blur(8px)'
          }}>
            <div style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#3b82f6',
              marginBottom: 16,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              ⚡ Frequency Spectrum
            </div>
            <SpectrumAnalyzer
              mode="bars"
              height={240}
              barCount={64}
              showLabels
              showPeaks
              colors={['#22c55e', '#eab308', '#ef4444']}
            />
          </div>
        </div>

        {/* Section 2: Input/Output Levels (Span 5) */}
        <div style={{ gridColumn: 'span 5' }}>
          <div style={{
            background: 'rgba(15, 20, 35, 0.6)',
            border: '1px solid rgba(34, 197, 94, 0.2)',
            borderRadius: 12,
            padding: 20,
            backdropFilter: 'blur(8px)',
            height: '100%'
          }}>
            <div style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#22c55e',
              marginBottom: 16,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              📊 Signal Levels
            </div>
            <VuMeterDisplay showInput showOutput />
          </div>
        </div>

        {/* Section 3: Loudness Measurement (Span 5) */}
        <div style={{ gridColumn: 'span 5' }}>
          <div style={{
            background: 'rgba(15, 20, 35, 0.6)',
            border: '1px solid rgba(59, 130, 246, 0.2)',
            borderRadius: 12,
            padding: 20,
            backdropFilter: 'blur(8px)'
          }}>
            <div style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#3b82f6',
              marginBottom: 16,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              📈 Loudness (LUFS)
            </div>
            <LoudnessMeter
              targetLufs={-14}
              truePeakLimit={-1}
              compact={false}
            />
          </div>
        </div>

        {/* Section 4: Stereo Phase Analysis (Span 4) */}
        <div style={{ gridColumn: 'span 4' }}>
          <div style={{
            background: 'rgba(15, 20, 35, 0.6)',
            border: '1px solid rgba(236, 72, 153, 0.2)',
            borderRadius: 12,
            padding: 20,
            backdropFilter: 'blur(8px)'
          }}>
            <div style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#ec4899',
              marginBottom: 16,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              🎼 Stereo Phase
            </div>
            <PhaseCorrelationMeter
              showStereoInfo
              orientation="horizontal"
            />
          </div>
        </div>

        {/* Section 5: Dynamics Metering (Span 5) */}
        <div style={{ gridColumn: 'span 5' }}>
          <div style={{
            background: 'rgba(15, 20, 35, 0.6)',
            border: '1px solid rgba(245, 158, 11, 0.2)',
            borderRadius: 12,
            padding: 20,
            backdropFilter: 'blur(8px)'
          }}>
            <div style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#f59e0b',
              marginBottom: 16,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              ⚙️ Dynamics
            </div>
            <DynamicsMeteringPanel
              showCompressor
              showLimiter
              showGate
            />
          </div>
        </div>

        {/* Section 6: CPU & Performance (Span 7) */}
        <div style={{ gridColumn: 'span 7' }}>
          <div style={{
            background: 'rgba(15, 20, 35, 0.6)',
            border: '1px solid rgba(34, 197, 94, 0.2)',
            borderRadius: 12,
            padding: 20,
            backdropFilter: 'blur(8px)'
          }}>
            <div style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#22c55e',
              marginBottom: 16,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              🖥️ CPU & DSP Performance
            </div>
            <CPUMeterPanel
              showBreakdown
              compact={false}
            />
          </div>
        </div>

        {/* Section 7: Latency (Span 7) */}
        <div style={{ gridColumn: 'span 7' }}>
          <div style={{
            background: 'rgba(15, 20, 35, 0.6)',
            border: '1px solid rgba(245, 158, 11, 0.2)',
            borderRadius: 12,
            padding: 20,
            backdropFilter: 'blur(8px)'
          }}>
            <div style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#f59e0b',
              marginBottom: 16,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              ⏱️ Latency Analysis
            </div>
            <LatencyDisplay
              showBreakdown
              compact={false}
            />
          </div>
        </div>
      </div>

      {/* Status Footer */}
      <div style={{
        marginTop: 32,
        padding: 16,
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(236, 72, 153, 0.05) 100%)',
        borderRadius: 12,
        border: '1px solid rgba(59, 130, 246, 0.15)',
        backdropFilter: 'blur(8px)'
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 20,
          fontSize: 12,
          color: '#888'
        }}>
          <div>
            <span style={{ color: '#3b82f6', fontWeight: 600 }}>Engine Specifications</span>
            <br />
            ITU-R BS.1770-4 LUFS | 2048-point FFT @ 30fps | True Peak with 4x oversampling
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ color: '#37d6c9', fontWeight: 600 }}>Status</span>
            <br />
            Real-time updates via WebSocket | <span style={{ color: '#22c55e' }}>● Active</span>
          </div>
        </div>
      </div>

      {/* API Reference Card - Collapsed by Default */}
      <div style={{
        marginTop: 32,
        background: 'rgba(15, 20, 35, 0.6)',
        border: '1px solid rgba(100, 116, 139, 0.2)',
        borderRadius: 12,
        backdropFilter: 'blur(8px)',
        overflow: 'hidden'
      }}>
        {/* Header - Clickable */}
        <button
          onClick={() => setShowApiReference(!showApiReference)}
          style={{
            width: '100%',
            padding: 20,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: 'inherit'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              🔗 API Reference
            </span>
            <span style={{
              fontSize: 11,
              color: '#475569',
              fontWeight: 500,
              background: 'rgba(100, 116, 139, 0.2)',
              padding: '4px 8px',
              borderRadius: 4
            }}>
              {meteringApis.length} endpoints
            </span>
          </div>
          {showApiReference ? (
            <ChevronUp size={20} style={{ color: '#64748b' }} />
          ) : (
            <ChevronDown size={20} style={{ color: '#64748b' }} />
          )}
        </button>

        {/* Expanded Content */}
        {showApiReference && (
          <div style={{
            padding: '0 20px 20px',
            borderTop: '1px solid rgba(100, 116, 139, 0.2)'
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: 12
            }}>
              {meteringApis.map((api, index) => (
                <div
                  key={index}
                  style={{
                    padding: 12,
                    background: 'rgba(30, 41, 59, 0.5)',
                    borderRadius: 8,
                    border: '1px solid rgba(100, 116, 139, 0.15)',
                    fontSize: 12
                  }}
                >
                  <div style={{
                    color: '#3b82f6',
                    fontFamily: 'monospace',
                    fontWeight: 600,
                    marginBottom: 4,
                    fontSize: 11,
                    letterSpacing: '0.5px'
                  }}>
                    {api.endpoint}
                  </div>
                  <div style={{
                    color: '#94a3b8',
                    fontSize: 11,
                    lineHeight: '1.4'
                  }}>
                    {api.description}
                  </div>
                </div>
              ))}
            </div>
            <div style={{
              marginTop: 16,
              padding: 12,
              background: 'rgba(59, 130, 246, 0.05)',
              borderRadius: 8,
              border: '1px solid rgba(59, 130, 246, 0.15)',
              fontSize: 11,
              color: '#64748b',
              lineHeight: '1.5'
            }}>
              <strong style={{ color: '#3b82f6' }}>Base URL:</strong> {window.location.origin}/api
              <br />
              <strong style={{ color: '#3b82f6' }}>WebSocket:</strong> {window.location.origin.replace(/^http/, 'ws')}/ws/metering (real-time updates)
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default MeteringPage
