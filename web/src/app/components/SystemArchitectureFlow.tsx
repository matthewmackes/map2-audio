import { useState, useEffect } from 'react'
import {
  Activity as Cpu,
  Activity as Pulse,
  CheckmarkFilled as CheckCircle,
  DataBase as Database,
  DataBase as HardDrive,
  Flash as Lightning,
  FlowConnection as FlowArrow,
  MeterAlt as Gauge,
  Radio as Broadcast,
  ServerDns as DesktopTower,
  WarningAlt as WarningCircle,
  Waveform,
} from '@carbon/icons-react'
import type { CarbonIconType } from '@carbon/icons-react'
import { LegacyTile } from './shared/LegacyTile'
import './StatusPanelFlatteners.css'

interface ComponentDetails {
  description: string
  components: string[]
  metrics?: { label: string; value: string }[]
}

interface SystemHealth {
  audioEngine: { 
    status: 'healthy' | 'warning' | 'critical'
    message: string
    utilization?: number
    details?: ComponentDetails
  }
  dspGraph: { 
    status: 'healthy' | 'warning' | 'critical'
    message: string
    utilization?: number
    details?: ComponentDetails
  }
  pluginHost: { 
    status: 'healthy' | 'warning' | 'critical'
    message: string
    loadedCount?: number
    details?: ComponentDetails
  }
  midiSequencer: { 
    status: 'healthy' | 'warning' | 'critical'
    message: string
    details?: ComponentDetails
  }
  webAPI: { 
    status: 'healthy' | 'warning' | 'critical'
    message: string
    clients?: number
    details?: ComponentDetails
  }
  pipeWire: {
    status: 'healthy' | 'warning' | 'critical'
    message: string
    latencyMs?: number
    details?: ComponentDetails
  }
}

interface PerformanceData {
  cpu_percent: number
  memory_percent: number
  buffer_underruns: number
  alerts: number
  history_samples: number
}

interface PluginPerformance {
  total_plugins: number
  total_cpu_percent: number
  nam_available: boolean
  ir_available: boolean
  gpu_device: string | null
}

export function SystemArchitectureFlow() {
  const [health, setHealth] = useState<SystemHealth>({
    audioEngine: {
      status: 'healthy',
      message: 'Real-time audio processing active',
      details: {
        description: 'JUCE audio engine with ALSA I/O and RT priority',
        components: ['JUCE Audio Engine', 'ALSA Backend', 'Buffer Manager', 'Latency Compensator'],
      }
    },
    dspGraph: { 
      status: 'healthy', 
      message: 'Effect chain processing',
      details: {
        description: 'Deterministic signal processing chain',
        components: ['Chain Router', 'A/B Morph Engine', 'Parameter Interpolation', 'Bypass Control'],
      }
    },
    pluginHost: { 
      status: 'healthy', 
      message: 'Plugin environment ready', 
      loadedCount: 0,
      details: {
        description: 'LV2 plugin hosting with NAM/IR support',
        components: ['LV2 Host (lilv)', 'NAM Processor', 'IR Convolver', 'Plugin Scanner'],
      }
    },
    midiSequencer: { 
      status: 'healthy', 
      message: 'MIDI input monitoring',
      details: {
        description: 'MIDI event routing and learn mode',
        components: ['MIDI Input Router', 'Learn Mode Handler', 'CC Mapping Engine', 'Template System'],
      }
    },
    webAPI: { 
      status: 'healthy', 
      message: 'REST API responding', 
      clients: 0,
      details: {
        description: 'FastAPI backend with WebSocket support',
        components: ['REST Endpoints', 'WebSocket Server', 'Event Publisher', 'Performance Monitor'],
      }
    },
    pipeWire: {
      status: 'healthy',
      message: 'Audio server initializing...',
      latencyMs: 0,
      details: {
        description: 'PipeWire audio server — graph routing, latency control, device management',
        components: ['PipeWire Daemon', 'WirePlumber', 'ALSA Backend', 'Graph Router'],
      }
    },
  })

  const [perfData, setPerfData] = useState<PerformanceData>({
    cpu_percent: 0,
    memory_percent: 0,
    buffer_underruns: 0,
    alerts: 0,
    history_samples: 0,
  })

  const [pluginPerf, setPluginPerf] = useState<PluginPerformance>({
    total_plugins: 0,
    total_cpu_percent: 0,
    nam_available: false,
    ir_available: false,
    gpu_device: null,
  })

  const [expandedComponent, setExpandedComponent] = useState<string | null>(null)

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        // Fetch multiple endpoints in parallel for comprehensive status
        const [configRes, testRes, pluginsRes, perfRes, pluginPerfRes, alertsRes, namRes, pwRes] = await Promise.all([
          fetch('/api/system/core-config').catch(() => null),
          fetch('/api/system-tests/test/juce-engine/latest').catch(() => null),
          fetch('/api/plugins/discover').catch(() => null),
          fetch('/api/performance/current').catch(() => null),
          fetch('/api/performance/plugins').catch(() => null),
          fetch('/api/performance/alerts').catch(() => null),
          fetch('/api/nam/status').catch(() => null),
          fetch('/api/pipewire/status').catch(() => null),
        ])

        const config = configRes?.ok ? await configRes.json() : null
        const testData = testRes?.ok ? await testRes.json() : null
        const plugins = pluginsRes?.ok ? await pluginsRes.json() : null
        const perf = perfRes?.ok ? await perfRes.json() : null
        const pluginStats = pluginPerfRes?.ok ? await pluginPerfRes.json() : null
        const alerts = alertsRes?.ok ? await alertsRes.json() : null
        const namStatus = namRes?.ok ? await namRes.json() : null
        const pwData = pwRes?.ok ? await pwRes.json() : null

        // Update performance data
        if (perf) {
          setPerfData({
            cpu_percent: perf.cpu_percent || 0,
            memory_percent: perf.memory_percent || 0,
            buffer_underruns: perf.buffer_underruns || 0,
            alerts: alerts?.count || 0,
            history_samples: perf.history_samples || 0,
          })
        }

        // Update plugin performance
        if (pluginStats) {
          setPluginPerf({
            total_plugins: pluginStats.count || plugins?.plugins?.length || 0,
            total_cpu_percent: pluginStats.total_cpu_percent || 0,
            nam_available: namStatus?.available || false,
            ir_available: true, // IR processor is always available
            gpu_device: namStatus?.gpu_info?.name || null,
          })
        }

        // Calculate audio engine status based on test results
        const audioScore = testData?.score || 0
        const audioStatus = audioScore >= 80 ? 'healthy' : audioScore >= 50 ? 'warning' : 'critical'
        
        // Calculate DSP status based on utilization
        const dspUtil = config?.cores?.[2]?.utilization || 0
        const dspStatus = dspUtil < 70 ? 'healthy' : dspUtil < 90 ? 'warning' : 'critical'

        // Calculate plugin host status
        const pluginCount = plugins?.plugins?.length || 0
        const pluginStatus = pluginCount > 0 ? 'healthy' : 'warning'

        setHealth(prev => ({
          audioEngine: {
            status: audioStatus,
            message: `Audio score: ${audioScore}/100 • Latency: ${testData?.latency_ms?.toFixed(1) || 'N/A'}ms`,
            utilization: config?.cores?.[1]?.utilization,
            details: {
              description: 'Real-time audio I/O with SCHED_FIFO priority',
              components: ['JUCE Audio Engine', 'ALSA Backend', 'Buffer Manager', 'Latency Compensator'],
              metrics: [
                { label: 'Sample Rate', value: `${testData?.sample_rate || 48000} Hz` },
                { label: 'Buffer Size', value: `${testData?.buffer_size || 256} samples` },
                { label: 'Latency', value: `${testData?.latency_ms?.toFixed(2) || 'N/A'} ms` },
                { label: 'RT Priority', value: config?.cores?.[1]?.priority || 'SCHED_FIFO' },
              ],
            },
          },
          dspGraph: {
            status: dspStatus,
            message: `DSP load: ${dspUtil.toFixed(1)}% • Chain morphing enabled`,
            utilization: dspUtil,
            details: {
              description: 'Deterministic effect chain with A/B morphing',
              components: ['Chain Router', 'A/B Morph Engine', 'Parameter Interpolator', 'Bypass Manager'],
              metrics: [
                { label: 'CPU Usage', value: `${dspUtil.toFixed(1)}%` },
                { label: 'Active Chains', value: `${config?.cores?.[2]?.services?.length || 1}` },
                { label: 'Morph Support', value: 'Enabled' },
                { label: 'RT Convolution', value: 'Partitioned FFT' },
              ],
            },
          },
          pluginHost: {
            status: pluginStatus,
            message: `${pluginCount} plugins • NAM: ${namStatus?.available ? 'Ready' : 'N/A'}`,
            loadedCount: pluginCount,
            details: {
              description: 'LV2 hosting with Neural Amp Modeling & IR support',
              components: ['LV2 Host (lilv)', 'NAM Processor', 'IR Convolver (Partitioned)', 'Plugin Scanner'],
              metrics: [
                { label: 'LV2 Plugins', value: `${pluginCount}` },
                { label: 'NAM Device', value: namStatus?.device || 'CPU' },
                { label: 'GPU Accel', value: namStatus?.cuda_available ? namStatus?.gpu_info?.name : 'None' },
                { label: 'IR Engine', value: 'Overlap-Add FFT' },
              ],
            },
          },
          midiSequencer: {
            ...prev.midiSequencer,
            details: {
              description: 'MIDI routing with learn mode and templates',
              components: ['MIDI Input Router', 'Learn Mode Handler', 'CC Mapping Engine', 'Template System'],
              metrics: [
                { label: 'Input Ports', value: 'Auto-detect' },
                { label: 'Learn Mode', value: 'Available' },
                { label: 'CC Mappings', value: 'Per-chain' },
                { label: 'Templates', value: 'User-defined' },
              ],
            },
          },
          webAPI: {
            status: 'healthy',
            message: `API active • ${alerts?.count || 0} alerts • ${perf?.buffer_underruns || 0} underruns`,
            clients: 1,
            details: {
              description: 'FastAPI with performance monitoring & history',
              components: ['REST Endpoints', 'WebSocket Server', 'Metrics Collector', 'Alert Manager'],
              metrics: [
                { label: 'History', value: `${perf?.history_samples || 3600}s retention` },
                { label: 'Alerts', value: `${alerts?.count || 0} active` },
                { label: 'Underruns', value: `${perf?.buffer_underruns || 0}` },
                { label: 'CPU Track', value: 'Per-plugin' },
              ],
            },
          },
          pipeWire: {
            status: pwData?.daemon?.running
              ? (pwData.alerts?.some((a: { severity?: string }) => a.severity === 'error') ? 'critical'
                : pwData.alerts?.some((a: { severity?: string }) => a.severity === 'warning') ? 'warning' : 'healthy')
              : 'critical',
            message: pwData?.daemon?.running
              ? `v${pwData.daemon.version} • ${pwData.devices?.length || 0} dev • ${pwData.total_latency_ms?.toFixed(1) || '?'}ms • ${pwData.xruns || 0} xruns`
              : 'PipeWire daemon not running',
            latencyMs: pwData?.total_latency_ms || 0,
            details: {
              description: 'PipeWire audio server — real-time graph routing and device management',
              components: ['PipeWire Daemon', 'WirePlumber', 'ALSA Backend', 'Graph Router'],
              metrics: [
                { label: 'Version', value: pwData?.daemon?.version || 'N/A' },
                { label: 'Sample Rate', value: `${pwData?.settings?.clock_rate || 48000} Hz` },
                { label: 'Quantum', value: `${pwData?.settings?.clock_force_quantum || pwData?.settings?.clock_quantum || 1024}` },
                { label: 'Latency', value: `${pwData?.total_latency_ms?.toFixed(1) || 'N/A'} ms` },
                { label: 'Devices', value: `${pwData?.devices?.length || 0}` },
                { label: 'Streams', value: `${pwData?.streams?.length || 0}` },
                { label: 'Links', value: `${pwData?.links?.length || 0}` },
                { label: 'XRuns', value: `${pwData?.xruns || 0}` },
              ],
            },
          },
        }))
      } catch (err) {
        console.error('Error fetching system health:', err)
      }
    }

    fetchHealth()
    const interval = setInterval(fetchHealth, 2000)
    return () => clearInterval(interval)
  }, [])

  const getStatusColor = (status: 'healthy' | 'warning' | 'critical') => {
    switch (status) {
      case 'healthy':
        return { bg: '#4caf5020', border: '#4caf50', text: '#4caf50', icon: CheckCircle }
      case 'warning':
        return { bg: '#ffa72620', border: '#ffa726', text: '#ffa726', icon: WarningCircle }
      case 'critical':
        return { bg: '#ef444420', border: '#ef4444', text: '#ef4444', icon: WarningCircle }
    }
  }

  const renderHealthBlock = (
    icon: CarbonIconType,
    label: string,
    healthInfo: { 
      status: 'healthy' | 'warning' | 'critical'
      message: string
      utilization?: number
      loadedCount?: number
      clients?: number
      details?: ComponentDetails
    },
    color: ReturnType<typeof getStatusColor>,
    componentKey: string
  ) => {
    const IconComponent = icon
    const StatusIcon = color.icon
    const isExpanded = expandedComponent === componentKey

    return (
      <div
        style={{
          flex: '1 1 auto',
          minWidth: '140px',
          padding: 12,
          background: color.bg,
          border: `2px solid ${color.border}`,
          borderRadius: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          position: 'relative',
          overflow: 'hidden',
          cursor: 'pointer',
          transition: 'all var(--map2-dur-base, 220ms) var(--map2-ease-in-out-rack, ease)',
        }}
        onClick={() => setExpandedComponent(isExpanded ? null : componentKey)}
        title="Click for details"
      >
        <div className="flex" style={{ gap: 8, alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div className="flex" style={{ gap: 6, alignItems: 'center' }}>
            <IconComponent size={18} style={{ color: color.text, flexShrink: 0 }} />
            <strong style={{ fontSize: 12, color: color.text }}>{label}</strong>
          </div>
          <StatusIcon size={14} style={{ color: color.text, flexShrink: 0 }} />
        </div>

        <div style={{ fontSize: 10, color: 'var(--cds-text-secondary)', lineHeight: 1.4 }}>{healthInfo.message}</div>

        {healthInfo.utilization !== undefined && (
          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: 9, color: 'var(--cds-text-secondary, #888)', marginBottom: 2 }}>CPU: {healthInfo.utilization.toFixed(1)}%</div>
            <div style={{ height: 4, background: 'rgba(0,0,0,0.3)', borderRadius: 2, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(100, healthInfo.utilization)}%`,
                  background: color.text,
                  transition: 'width var(--map2-dur-slow, 380ms) var(--map2-ease-in-out-rack, ease)',
                }}
              />
            </div>
          </div>
        )}

        {healthInfo.loadedCount !== undefined && (
          <div style={{ fontSize: 9, color: 'var(--cds-text-secondary, #888)' }}>{healthInfo.loadedCount} plugins loaded</div>
        )}

        {/* Expanded details panel */}
        {isExpanded && healthInfo.details && (
          <div style={{ 
            marginTop: 8, 
            padding: 8, 
            background: 'rgba(0,0,0,0.3)', 
            borderRadius: 4,
            borderTop: `1px solid ${color.border}`,
          }}>
            <div style={{ fontSize: 9, color: 'var(--cds-text-secondary)', marginBottom: 6, fontStyle: 'italic' }}>
              {healthInfo.details.description}
            </div>
            
            <div style={{ fontSize: 9, color: 'var(--cds-text-secondary, #888)', marginBottom: 4 }}>
              <strong style={{ color: 'var(--cds-text-secondary)' }}>Components:</strong>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {healthInfo.details.components.map((comp, i) => (
                <span 
                  key={i}
                  style={{ 
                    fontSize: 8, 
                    // carbon-allow: dense surface; off-grid between Carbon stops.
                    padding: '2px 6px', 
                    background: 'rgba(100,181,246,0.2)', 
                    borderRadius: 3,
                    color: 'var(--cds-support-info)',
                  }}
                >
                  {comp}
                </span>
              ))}
            </div>

            {healthInfo.details.metrics && (
              <>
                <div style={{ fontSize: 9, color: 'var(--cds-text-secondary, #888)', marginBottom: 4 }}>
                  <strong style={{ color: 'var(--cds-text-secondary)' }}>Metrics:</strong>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  {healthInfo.details.metrics.map((metric, i) => (
                    <div key={i} style={{ fontSize: 8, color: 'var(--cds-text-secondary, #888)' }}>
                      <span style={{ color: 'var(--cds-text-helper, #666)' }}>{metric.label}:</span>{' '}
                      <span style={{ color: 'var(--cds-text-primary)' }}>{metric.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        
        {/* Expand indicator */}
        <div style={{ 
          position: 'absolute', 
          bottom: 4, 
          right: 8, 
          fontSize: 8, 
          color: 'var(--cds-text-helper, #666)',
          opacity: isExpanded ? 0 : 0.7,
        }}>
          ▼ details
        </div>
      </div>
    )
  }

  const audioEngineColor = getStatusColor(health.audioEngine.status)
  const dspGraphColor = getStatusColor(health.dspGraph.status)
  const pluginHostColor = getStatusColor(health.pluginHost.status)
  const midiSequencerColor = getStatusColor(health.midiSequencer.status)
  const webAPIColor = getStatusColor(health.webAPI.status)
  const pipeWireColor = getStatusColor(health.pipeWire.status)

  return (
    <LegacyTile className="system-architecture-flow">
      <div style={{ marginBottom: 16 }}>
        <div className="flex" style={{ gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <FlowArrow size={22} style={{ color: 'var(--cds-support-info)' }} />
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>System Architecture & Health</h3>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--cds-text-secondary)', lineHeight: 1.5 }}>
          MAP2 Audio Platform operates as a tightly integrated, real-time audio processing stack. Audio signals flow through multiple specialized subsystems,
          each pinned to dedicated CPU cores for consistent, predictable performance. The system continuously monitors each component's health status,
          ensuring stable operation and alerting when intervention may be needed.
        </p>
      </div>

      {/* Horizontal Architecture Flow */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', overflowX: 'auto', paddingBottom: 8 }}>
        {/* Audio Input Stage */}
        <div
          style={{
            flex: '0 0 auto',
            width: 80,
            height: 60,
            background: 'rgba(100, 181, 246, 0.1)',
            border: '2px dashed #64b5f6',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            color: 'var(--cds-support-info)',
            textAlign: 'center',
            padding: 4,
            fontWeight: 500,
          }}
        >
          Audio<br />Input
        </div>

        {/* Arrow */}
        <div style={{ flex: '0 0 24px', height: 2, background: '#888', position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              right: -6,
              top: -4,
              width: 0,
              height: 0,
              borderLeft: '8px solid #888',
              borderTop: '4px solid transparent',
              borderBottom: '4px solid transparent',
            }}
          />
        </div>

        {/* Audio Engine */}
        {renderHealthBlock(Pulse, 'Audio Engine', health.audioEngine, audioEngineColor, 'audioEngine')}

        {/* Arrow */}
        <div style={{ flex: '0 0 24px', height: 2, background: '#888', position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              right: -6,
              top: -4,
              width: 0,
              height: 0,
              borderLeft: '8px solid #888',
              borderTop: '4px solid transparent',
              borderBottom: '4px solid transparent',
            }}
          />
        </div>

        {/* DSP Graph */}
        {renderHealthBlock(Lightning, 'DSP Graph', health.dspGraph, dspGraphColor, 'dspGraph')}

        {/* Arrow */}
        <div style={{ flex: '0 0 24px', height: 2, background: '#888', position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              right: -6,
              top: -4,
              width: 0,
              height: 0,
              borderLeft: '8px solid #888',
              borderTop: '4px solid transparent',
              borderBottom: '4px solid transparent',
            }}
          />
        </div>

        {/* Plugin Host */}
        {renderHealthBlock(Broadcast, 'Plugin Host', health.pluginHost, pluginHostColor, 'pluginHost')}

        {/* Arrow */}
        <div style={{ flex: '0 0 24px', height: 2, background: '#888', position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              right: -6,
              top: -4,
              width: 0,
              height: 0,
              borderLeft: '8px solid #888',
              borderTop: '4px solid transparent',
              borderBottom: '4px solid transparent',
            }}
          />
        </div>

        {/* Audio Output Stage */}
        <div
          style={{
            flex: '0 0 auto',
            width: 80,
            height: 60,
            background: 'rgba(129, 199, 132, 0.1)',
            border: '2px dashed #81c784',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            color: 'var(--cds-support-success)',
            textAlign: 'center',
            padding: 4,
            fontWeight: 500,
          }}
        >
          Audio<br />Output
        </div>
      </div>

      {/* Parallel Systems */}
      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
        {/* PipeWire Audio Server */}
        {renderHealthBlock(Waveform, 'PipeWire', health.pipeWire, pipeWireColor, 'pipeWire')}

        {/* MIDI Sequencer */}
        {renderHealthBlock(Database, 'MIDI Sequencer', health.midiSequencer, midiSequencerColor, 'midiSequencer')}

        {/* Web API */}
        {renderHealthBlock(DesktopTower, 'Web API Server', health.webAPI, webAPIColor, 'webAPI')}
      </div>

      {/* Performance Summary Bar */}
      <div style={{ 
        marginTop: 16, 
        padding: 12, 
        background: 'rgba(100,181,246,0.1)', 
        borderRadius: 8,
        border: '1px solid rgba(100,181,246,0.3)',
      }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Cpu size={14} style={{ color: 'var(--cds-support-info)' }} />
              <span style={{ fontSize: 10, color: 'var(--cds-text-secondary, #888)' }}>System CPU:</span>
              <span style={{ fontSize: 11, color: 'var(--cds-text-primary)', fontWeight: 500 }}>{perfData.cpu_percent.toFixed(1)}%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <HardDrive size={14} style={{ color: 'var(--cds-support-success)' }} />
              <span style={{ fontSize: 10, color: 'var(--cds-text-secondary, #888)' }}>Memory:</span>
              <span style={{ fontSize: 11, color: 'var(--cds-text-primary)', fontWeight: 500 }}>{perfData.memory_percent.toFixed(1)}%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Gauge size={14} style={{ color: pluginPerf.gpu_device ? '#ab47bc' : '#888' }} />
              <span style={{ fontSize: 10, color: 'var(--cds-text-secondary, #888)' }}>GPU:</span>
              <span style={{ fontSize: 11, color: pluginPerf.gpu_device ? '#ab47bc' : '#666', fontWeight: 500 }}>
                {pluginPerf.gpu_device || 'CPU Only'}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ fontSize: 10, color: perfData.buffer_underruns > 0 ? '#ffa726' : '#4caf50' }}>
              {perfData.buffer_underruns} underruns
            </div>
            <div style={{ fontSize: 10, color: perfData.alerts > 0 ? '#ffa726' : '#4caf50' }}>
              {perfData.alerts} alerts
            </div>
          </div>
        </div>
      </div>

      {/* Architecture Description */}
      <div style={{ marginTop: 16, padding: 12, background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--cds-text-secondary)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--cds-text-primary)' }}>Signal Flow:</strong> Audio enters through PipeWire, the primary audio server managing device routing,
          buffer quantums, and sample rate negotiation. PipeWire feeds the JUCE Audio Engine running on dedicated CPU cores with SCHED_FIFO priority.
          Audio flows through the DSP Graph with A/B chain morphing for smooth preset transitions via real-time parameter interpolation.
          <br />
          <br />
          <strong style={{ color: 'var(--cds-text-primary)' }}>Audio Server:</strong> PipeWire provides the audio graph infrastructure — device enumeration, port linking,
          latency management, and XRun detection. The quantum (buffer period) and sample rate are adjustable in real-time via the PipeWire dashboard.
          WirePlumber handles session policy and automatic device routing.
          <br />
          <br />
          <strong style={{ color: 'var(--cds-text-primary)' }}>Plugin Processing:</strong> The Plugin Host supports LV2 plugins via lilv, Neural Amp Models (NAM) with optional 
          GPU acceleration (CUDA/MPS), and Impulse Response processing using RT-safe partitioned FFT convolution. Each plugin's CPU usage is tracked 
          individually for performance optimization.
          <br />
          <br />
          <strong style={{ color: 'var(--cds-text-primary)' }}>Monitoring:</strong> The Performance Monitor maintains up to 1 hour of historical metrics with configurable 
          resolution. PipeWire metrics (latency, XRuns, graph topology) are broadcast in real-time via WebSocket. Click any component above to view 
          its internal subsystems and real-time metrics.
          <br />
          <br />
          <strong style={{ color: 'var(--cds-text-primary)' }}>Status Legend:</strong>{' '}
          <span style={{ color: 'var(--cds-support-success)' }}>● Green</span> = Healthy ·{' '}
          <span style={{ color: 'var(--cds-support-warning)' }}>● Orange</span> = Warning ·{' '}
          <span style={{ color: 'var(--cds-support-error)' }}>● Red</span> = Critical
        </div>
      </div>
    </LegacyTile>
  )
}
