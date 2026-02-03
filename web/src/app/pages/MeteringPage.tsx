/**
 * MeteringPage - Comprehensive Audio Metering Dashboard
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

import { SpectrumAnalyzer } from '../components/Visualizations/SpectrumAnalyzer'
import { LoudnessMeter } from '../components/Visualizations/LoudnessMeter'
import { CPUMeterPanel } from '../components/Visualizations/CPUMeterPanel'
import { LatencyDisplay } from '../components/Visualizations/LatencyDisplay'
import { PhaseCorrelationMeter } from '../components/Visualizations/PhaseCorrelationMeter'
import { VuMeterDisplay } from '../components/Visualizations/VuMeterDisplay'
import { DynamicsMeteringPanel } from '../components/Visualizations/DynamicsMeteringPanel'

export function MeteringPage() {
  return (
    <div className="metering-page" style={{ padding: 20 }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f2f6ff', margin: 0 }}>
          Audio Metering
        </h1>
        <p style={{ fontSize: 13, color: '#666', margin: '4px 0 0' }}>
          Real-time audio analysis and system monitoring - all meters live from JUCE engine
        </p>
      </header>

      {/* Main Dashboard Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(12, 1fr)',
        gridTemplateRows: 'auto',
        gap: 16
      }}>
        {/* Row 1: VU Meters + Spectrum Analyzer */}
        <div style={{ gridColumn: 'span 2' }}>
          <VuMeterDisplay showInput showOutput />
        </div>

        <div style={{ gridColumn: 'span 10' }}>
          <div style={{
            background: 'rgba(20, 25, 35, 0.8)',
            borderRadius: 8,
            padding: 16
          }}>
            <SpectrumAnalyzer
              mode="bars"
              height={200}
              barCount={64}
              showLabels
              showPeaks
              colors={['#22c55e', '#eab308', '#ef4444']}
            />
          </div>
        </div>

        {/* Row 2: Loudness + Phase + Dynamics */}
        <div style={{ gridColumn: 'span 4' }}>
          <div style={{
            background: 'rgba(20, 25, 35, 0.8)',
            borderRadius: 8,
            padding: 16
          }}>
            <div style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#3b82f6',
              marginBottom: 12
            }}>
              Loudness (LUFS)
            </div>
            <LoudnessMeter
              targetLufs={-14}
              truePeakLimit={-1}
              compact={false}
            />
          </div>
        </div>

        <div style={{ gridColumn: 'span 4' }}>
          <div style={{
            background: 'rgba(20, 25, 35, 0.8)',
            borderRadius: 8,
            padding: 16
          }}>
            <div style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#ec4899',
              marginBottom: 12
            }}>
              Stereo Analysis
            </div>
            <PhaseCorrelationMeter
              showStereoInfo
              orientation="horizontal"
            />
          </div>
        </div>

        <div style={{ gridColumn: 'span 4' }}>
          <DynamicsMeteringPanel
            showCompressor
            showLimiter
            showGate
          />
        </div>

        {/* Row 3: CPU + Latency */}
        <div style={{ gridColumn: 'span 6' }}>
          <div style={{
            background: 'rgba(20, 25, 35, 0.8)',
            borderRadius: 8,
            padding: 16
          }}>
            <div style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#22c55e',
              marginBottom: 12
            }}>
              CPU & DSP Performance
            </div>
            <CPUMeterPanel
              showBreakdown
              compact={false}
            />
          </div>
        </div>

        <div style={{ gridColumn: 'span 6' }}>
          <div style={{
            background: 'rgba(20, 25, 35, 0.8)',
            borderRadius: 8,
            padding: 16
          }}>
            <div style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#f59e0b',
              marginBottom: 12
            }}>
              Latency
            </div>
            <LatencyDisplay
              showBreakdown
              compact={false}
            />
          </div>
        </div>
      </div>

      {/* Footer info */}
      <div style={{
        marginTop: 20,
        padding: 12,
        background: 'rgba(55, 214, 201, 0.05)',
        borderRadius: 8,
        border: '1px solid rgba(55, 214, 201, 0.2)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 11,
          color: '#666'
        }}>
          <span>
            <strong style={{ color: '#37d6c9' }}>JUCE Audio Engine</strong> - ITU-R BS.1770-4 LUFS | 2048-point FFT @ 30fps | True Peak with 4x oversampling
          </span>
          <span>
            All meters update in real-time via WebSocket
          </span>
        </div>
      </div>
    </div>
  )
}

export default MeteringPage
