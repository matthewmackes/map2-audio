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

import { useEffect, useRef, useState } from 'react'
import { ChartBar, ChevronDown, ChevronUp, Link, SettingsAdjust, Time, VolumeUp } from '@carbon/icons-react'
import './MeteringPage.css'
import { SpectrumAnalyzer } from '../components/Visualizations/SpectrumAnalyzer'
import { LoudnessMeter } from '../components/Visualizations/LoudnessMeter'
import { CPUMeterPanel } from '../components/Visualizations/CPUMeterPanel'
import { LatencyDisplay } from '../components/Visualizations/LatencyDisplay'
import { PhaseCorrelationMeter } from '../components/Visualizations/PhaseCorrelationMeter'
import { VuMeterDisplay } from '../components/Visualizations/VuMeterDisplay'
import { DynamicsMeteringPanel } from '../components/Visualizations/DynamicsMeteringPanel'
import { ClusterMeteringStrip } from '../components/Visualizations/ClusterMeteringStrip'
import { useWebSocketTopic } from '../../map2/hooks/useWebSocket'
import { useCluster } from '../contexts/useCluster'
import { withNodeTopic } from '../utils/clusterTransport'

export function MeteringPage() {
  const { activeNodeId, nodes, localNodeId } = useCluster()
  const [showApiReference, setShowApiReference] = useState(false)
  const [topicActivity, setTopicActivity] = useState({
    meters: false,
    cpu: false,
    latency: false,
  })
  const pageRef = useRef<HTMLDivElement | null>(null)
  const allNodesSelected = activeNodeId === 'all'
  const detailNodeId = allNodesSelected ? null : activeNodeId
  const selectedNode = nodes.find((node) => node.nodeId === activeNodeId)
  const remoteSelected = Boolean(activeNodeId && activeNodeId !== 'all' && activeNodeId !== localNodeId)
  const metersTopic = withNodeTopic('meters', detailNodeId) as Parameters<typeof useWebSocketTopic>[0]
  const cpuTopic = withNodeTopic('cpu', detailNodeId) as Parameters<typeof useWebSocketTopic>[0]
  const latencyTopic = withNodeTopic('latency', detailNodeId) as Parameters<typeof useWebSocketTopic>[0]

  const markTopicActive = (topic: 'meters' | 'cpu' | 'latency') => {
    setTopicActivity((previous) => {
      if (previous[topic]) {
        return previous
      }
      return {
        ...previous,
        [topic]: true,
      }
    })
  }

  useEffect(() => {
    setTopicActivity({ meters: false, cpu: false, latency: false })
  }, [allNodesSelected, detailNodeId])

  useWebSocketTopic(metersTopic, () => {
    markTopicActive('meters')
  })

  useWebSocketTopic(cpuTopic, () => {
    markTopicActive('cpu')
  })

  useWebSocketTopic(latencyTopic, () => {
    markTopicActive('latency')
  })

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
    <div
      ref={pageRef}
      className="metering-page"
      style={{
      padding: 'var(--cds-spacing-07)',
      background: 'rgba(12, 18, 28, 0.46)'
      }}
    >
      {/* Header Section */}
      <header style={{
        marginBottom: 32,
        paddingBottom: 24,
        borderBottom: '2px solid rgba(59, 130, 246, 0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <ChartBar size={36} style={{ color: 'var(--cds-interactive)', marginRight: 'var(--cds-spacing-03)', flexShrink: 0 }} />
            <h1 style={{
              fontSize: 'var(--cds-expressive-heading-06-font-size, 2rem)',
              fontWeight: 800,
              color: 'var(--cds-text-primary)',
              margin: 0,
              letterSpacing: '-0.5px'
            }}>
              {allNodesSelected
                ? 'JUCE Core Engine'
                : remoteSelected
                  ? `JUCE Core Engine · ${selectedNode?.hostname ?? activeNodeId}`
                  : 'JUCE Core Engine'}
            </h1>
            <span style={{
              // 24px sits between Carbon's productive-heading-04 (28px) and
              // expressive-heading-03 (20px); kept literal as a deliberate
              // sub-heading-04 step. Density carve-out per CARBON_FIT_AND
              // _FINISH_RUBRIC §1.
              fontSize: 24,
              fontWeight: 700,
              color: 'var(--cds-interactive)',
              margin: 0
            }}>
              {allNodesSelected ? ': Cluster Meters' : ': Meters'}
            </span>
          </div>
        </div>
        <p style={{
          fontSize: 13,
          color: 'var(--cds-text-helper)',
          margin: 'var(--cds-spacing-04) 0 0',
          fontWeight: 500
        }}>
          {allNodesSelected
            ? 'Cluster-wide live metering across all audio nodes'
            : 'Real-time audio analysis and system performance monitoring'}
        </p>
        {!allNodesSelected && (
          <div style={{
            marginTop: 'var(--cds-spacing-03)',
            display: 'flex',
            flexWrap: 'wrap',
            // carbon-allow: dense surface; off-grid between Carbon stops.
            gap: 10,
            fontSize: 'var(--cds-helper-text-01-font-size, 0.75rem)',
            color: 'var(--cds-text-secondary)',
            letterSpacing: '0.02em'
          }}>
            <span>meters: {topicActivity.meters ? 'live' : 'waiting'}</span>
            <span>cpu: {topicActivity.cpu ? 'live' : 'waiting'}</span>
            <span>latency: {topicActivity.latency ? 'live' : 'waiting'}</span>
          </div>
        )}
      </header>

      {(allNodesSelected || remoteSelected) && (
        <div style={{
          marginBottom: 20,
          // carbon-allow: dense surface; off-grid between Carbon stops.
          padding: '12px 14px',
          borderRadius: 12,
          border: '1px solid rgba(96, 165, 250, 0.2)',
          background: 'rgba(15, 23, 42, 0.7)',
          color: 'var(--cds-text-on-color)',
          fontSize: 13,
        }}>
          {allNodesSelected
            ? 'Viewing cluster mode. Click a node column below to switch into full single-node metering.'
            : `Viewing remote node ${selectedNode?.hostname ?? activeNodeId}${selectedNode?.latencyMs == null ? '' : ` · peer latency ${selectedNode.latencyMs.toFixed(1)} ms`}.`}
        </div>
      )}

      {allNodesSelected ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
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
              color: 'var(--cds-interactive)',
              marginBottom: 16,
              letterSpacing: '0.02em'
            }}>
              Cluster Metering Strip
            </div>
            <ClusterMeteringStrip />
          </div>

          <div style={{
            background: 'rgba(15, 20, 35, 0.55)',
            border: '1px solid rgba(100, 116, 139, 0.2)',
            borderRadius: 12,
            padding: 20,
            backdropFilter: 'blur(8px)',
            color: 'var(--cds-text-secondary)',
            fontSize: 13,
            lineHeight: 1.6,
          }}>
            Detailed spectrum, loudness, phase, latency, and dynamics panels remain single-node views because they rely on node-specific real-time streams. Select a node from the strip to open the full dashboard for that target.
          </div>
        </div>
      ) : (
      <div
        className="metering-grid"
        style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(14, 1fr)',
        gridTemplateRows: 'auto',
        gap: 20
        }}
      >
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
              color: 'var(--cds-interactive)',
              marginBottom: 16,
              letterSpacing: '0.02em'
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
              nodeId={detailNodeId}
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
              color: 'var(--cds-support-success)',
              marginBottom: 16,
              letterSpacing: '0.02em'
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ChartBar size={16} /> Signal Levels</span>
            </div>
            <VuMeterDisplay showInput showOutput nodeId={detailNodeId} />
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
              color: 'var(--cds-interactive)',
              marginBottom: 16,
              letterSpacing: '0.02em'
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ChartBar size={16} /> Loudness (LUFS)</span>
            </div>
            <LoudnessMeter
              targetLufs={-14}
              truePeakLimit={-1}
              compact={false}
              nodeId={detailNodeId}
            />
          </div>
        </div>

        {/* Section 4: Stereo Phase Analysis (Span 4) */}
        <div style={{ gridColumn: 'span 4' }}>
          <div style={{
            background: 'rgba(15, 20, 35, 0.6)',
            border: '1px solid rgba(96, 165, 250, 0.2)',
            borderRadius: 12,
            padding: 20,
            backdropFilter: 'blur(8px)'
          }}>
            <div style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--cds-support-info)',
              marginBottom: 16,
              letterSpacing: '0.02em'
            }}>
              🎼 Stereo Phase
            </div>
            <PhaseCorrelationMeter
              showStereoInfo
              orientation="horizontal"
              nodeId={detailNodeId}
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
              color: 'var(--cds-support-warning)',
              marginBottom: 16,
              letterSpacing: '0.02em'
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><SettingsAdjust size={16} /> Dynamics</span>
            </div>
            <DynamicsMeteringPanel
              showCompressor
              showLimiter
              showGate
              nodeId={detailNodeId}
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
              color: 'var(--cds-support-success)',
              marginBottom: 16,
              letterSpacing: '0.02em'
            }}>
              🖥️ CPU & DSP Performance
            </div>
            <CPUMeterPanel
              showBreakdown
              compact={false}
              nodeId={detailNodeId}
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
              color: 'var(--cds-support-warning)',
              marginBottom: 16,
              letterSpacing: '0.02em'
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Time size={16} /> Latency Analysis</span>
            </div>
            <LatencyDisplay
              showBreakdown
              compact={false}
              nodeId={detailNodeId}
            />
          </div>
        </div>
      </div>
      )}

      {/* Status Footer */}
      <div style={{
        marginTop: 32,
        padding: 16,
        background: 'rgba(37, 99, 235, 0.08)',
        borderRadius: 12,
        border: '1px solid rgba(59, 130, 246, 0.15)',
        backdropFilter: 'blur(8px)'
      }}>
        <div
          className="metering-status-grid"
          style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 20,
          fontSize: 12,
          color: 'var(--cds-text-helper)'
          }}
        >
          <div>
            <span style={{ color: 'var(--cds-interactive)', fontWeight: 600 }}>Engine Specifications</span>
            <br />
            ITU-R BS.1770-4 LUFS | 2048-point FFT @ 30fps | True Peak with 4x oversampling
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ color: 'var(--cds-support-info)', fontWeight: 600 }}>Status</span>
            <br />
            {allNodesSelected
              ? 'Cluster strip via per-node meter streams'
              : remoteSelected
                ? `Remote node ${selectedNode?.hostname ?? activeNodeId}`
                : 'Real-time updates via WebSocket'} | <span style={{ color: 'var(--cds-support-success)' }}>● Active</span>
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
              color: 'var(--cds-text-secondary)',
              letterSpacing: '0.02em'
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Link size={16} /> API Reference</span>
            </span>
            <span style={{
              fontSize: 11,
              color: 'var(--cds-text-helper)',
              fontWeight: 500,
              background: 'rgba(100, 116, 139, 0.2)',
              padding: 'var(--cds-spacing-02) var(--cds-spacing-03)',
              borderRadius: 4
            }}>
              {meteringApis.length} endpoints
            </span>
          </div>
          {showApiReference ? (
            <ChevronUp size={20} style={{ color: 'var(--cds-text-secondary)' }} />
          ) : (
            <ChevronDown size={20} style={{ color: 'var(--cds-text-secondary)' }} />
          )}
        </button>

        {/* Expanded Content */}
        {showApiReference && (
          <div style={{
            // carbon-allow: dense surface; off-grid between Carbon stops.
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
                    color: 'var(--cds-interactive)',
                    fontFamily: 'var(--font-ui-tight)',
                    fontWeight: 600,
                    marginBottom: 4,
                    fontSize: 11,
                    letterSpacing: '0.5px'
                  }}>
                    {api.endpoint}
                  </div>
                  <div style={{
                    color: 'var(--cds-text-secondary)',
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
              color: 'var(--cds-text-secondary)',
              lineHeight: '1.5'
            }}>
              <strong style={{ color: 'var(--cds-interactive)' }}>Base URL:</strong> {window.location.origin}/api
              <br />
              <strong style={{ color: 'var(--cds-interactive)' }}>WebSocket:</strong> {window.location.origin.replace(/^http/, 'ws')}/ws/metering (real-time updates)
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default MeteringPage
