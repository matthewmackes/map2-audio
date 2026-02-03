import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Tab,
  TabList,
  TabPanel,
  TabProvider,
} from '@ariakit/react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  Chip,
  LinearProgress,
  Tooltip,
  Alert,
  CircularProgress,
} from '@mui/material'
import { NumberInput } from '../../map2/components/NumberInput'
import {
  Usb,
  Volume2,
  Mic,
  Headphones,
  Settings,
  Activity,
  RefreshCw,
  Power,
  Radio,
  Clock,
  Music,
  Waves,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Gauge,
  Zap,
  Play,
  Square,
  AlertTriangle,
  Cpu,
  Timer,
  TriangleAlert,
  Wrench,
  TestTube,
  RotateCcw,
  HardDrive,
  Cable,
  Loader2,
  Info,
  ListChecks,
} from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { useToasts } from '../components/Toasts'
import { audioApi, diagnosticsApi } from '../../map2/api'
import type { AudioStatus } from '../../map2/types'
import type { AudioHealth, XrunStats, BufferPreset, JuceMetrics, DiagnosticResult, FullDiagnosticResult } from '../../map2/api'

// Roland Edirol UA-1000 official images
const UA1000_FRONT_IMAGE = 'https://static.roland.com/assets/images/products/gallery/ua_1000_front_gal.jpg'
const UA1000_BACK_IMAGE = 'https://static.roland.com/assets/images/products/gallery/ua_1000_back_gal.jpg'

// WebSocket URL for real-time metering
const WS_URL = `ws://${window.location.host}/ws`

// Types for real-time metering data
interface MeterData {
  input_left: number
  input_right: number
  output_left: number
  output_right: number
}

interface CpuData {
  cpu_load: number
  dsp_load?: number
}

export function EdirolUA1000Page() {
  const { pushToast } = useToasts()
  const queryClient = useQueryClient()
  const [selectedTab, setSelectedTab] = useState('engine')
  const [configDialogOpen, setConfigDialogOpen] = useState(false)

  // Real-time WebSocket data
  const [meterData, setMeterData] = useState<MeterData>({ input_left: 0, input_right: 0, output_left: 0, output_right: 0 })
  const [cpuData, setCpuData] = useState<CpuData>({ cpu_load: 0 })
  const [wsConnected, setWsConnected] = useState(false)

  // WebSocket connection for real-time metering
  useEffect(() => {
    let ws: WebSocket | null = null
    let reconnectTimeout: NodeJS.Timeout

    const connect = () => {
      try {
        ws = new WebSocket(WS_URL)

        ws.onopen = () => {
          setWsConnected(true)
          // Subscribe to metering topics
          ws?.send(JSON.stringify({ type: 'subscribe', topics: ['meters', 'cpu'] }))
        }

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            if (message.type === 'meters_update' && message.data) {
              setMeterData({
                input_left: message.data.input_left ?? 0,
                input_right: message.data.input_right ?? 0,
                output_left: message.data.output_left ?? 0,
                output_right: message.data.output_right ?? 0,
              })
            } else if (message.type === 'cpu_update' && message.data) {
              setCpuData({
                cpu_load: message.data.cpu_load ?? 0,
                dsp_load: message.data.dsp_load,
              })
            }
          } catch (e) {
            // Ignore parse errors
          }
        }

        ws.onclose = () => {
          setWsConnected(false)
          reconnectTimeout = setTimeout(connect, 3000)
        }

        ws.onerror = () => {
          ws?.close()
        }
      } catch (e) {
        reconnectTimeout = setTimeout(connect, 3000)
      }
    }

    connect()

    return () => {
      clearTimeout(reconnectTimeout)
      ws?.close()
    }
  }, [])

  // API Queries
  const statusQuery = useQuery({
    queryKey: ['audio', 'status'],
    queryFn: audioApi.getStatus,
    refetchInterval: 2000,
  })

  const healthQuery = useQuery({
    queryKey: ['audio', 'health'],
    queryFn: audioApi.getHealth,
    refetchInterval: 5000,
  })

  const xrunsQuery = useQuery({
    queryKey: ['audio', 'xruns'],
    queryFn: audioApi.getXruns,
    refetchInterval: 5000,
  })

  const bufferPresetsQuery = useQuery({
    queryKey: ['audio', 'buffer-presets'],
    queryFn: audioApi.getBufferPresets,
  })

  const juceQuery = useQuery({
    queryKey: ['audio', 'juce'],
    queryFn: audioApi.getJuceMetrics,
    refetchInterval: 5000,
  })

  const latencyQuery = useQuery({
    queryKey: ['audio', 'latency'],
    queryFn: audioApi.getLatency,
    refetchInterval: 2000,
  })

  // Mutations
  const startAudio = useMutation({
    mutationFn: audioApi.start,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['audio'] })
      pushToast(data.message || 'Audio started', 'success')
    },
    onError: () => pushToast('Failed to start audio', 'error'),
  })

  const stopAudio = useMutation({
    mutationFn: audioApi.stop,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['audio'] })
      pushToast(data.message || 'Audio stopped', 'info')
    },
    onError: () => pushToast('Failed to stop audio', 'error'),
  })

  const restartAudio = useMutation({
    mutationFn: audioApi.restart,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['audio'] })
      pushToast(data.message || 'Audio restarted', 'success')
    },
    onError: () => pushToast('Failed to restart audio', 'error'),
  })

  const status = statusQuery.data
  const health = healthQuery.data
  const xruns = xrunsQuery.data
  const juce = juceQuery.data
  const latency = latencyQuery.data

  const isRunning = status?.running ?? false
  const cpuLoad = wsConnected ? cpuData.cpu_load : (status?.cpu_load ?? 0)

  const getHealthColor = () => {
    if (!health) return 'default'
    if (health.status === 'healthy') return 'success'
    if (health.status === 'warning') return 'warning'
    return 'error'
  }

  return (
    <div className="stack">
      <PageHeader
        title="Edirol UA-1000"
        subtitle="Hi-Speed USB 2.0 Audio Interface - Connected to JUCE Audio Engine"
        actions={
          <div className="flex" style={{ gap: 8 }}>
            {!isRunning ? (
              <button
                className="btn btn-primary"
                onClick={() => startAudio.mutate()}
                disabled={startAudio.isPending}
              >
                {startAudio.isPending ? <CircularProgress size={16} /> : <Play size={16} />}
                Start Audio
              </button>
            ) : (
              <button
                className="btn btn-ghost"
                onClick={() => stopAudio.mutate()}
                disabled={stopAudio.isPending}
              >
                {stopAudio.isPending ? <CircularProgress size={16} /> : <Square size={16} />}
                Stop
              </button>
            )}
            <button
              className="btn btn-ghost"
              onClick={() => restartAudio.mutate()}
              disabled={restartAudio.isPending || !isRunning}
            >
              <RefreshCw size={16} /> Restart
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setConfigDialogOpen(true)}
            >
              <Settings size={16} /> Configure
            </button>
          </div>
        }
      />

      {/* Health Alert */}
      {health?.status === 'critical' && (
        <Alert severity="error" icon={<AlertTriangle />}>
          Audio engine is in critical state. {health.alerts?.join('. ')}
        </Alert>
      )}
      {health?.auto_muted && (
        <Alert severity="warning" icon={<AlertCircle />}>
          Audio has been auto-muted due to high xrun count. Check your buffer settings.
        </Alert>
      )}

      {/* Compact Status Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '12px 20px',
        background: 'linear-gradient(135deg, rgba(20, 30, 50, 0.95), rgba(14, 22, 37, 0.9))',
        borderRadius: 8,
        border: `1px solid ${isRunning ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
        flexWrap: 'wrap'
      }}>
        {/* Engine Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: isRunning ? '#22c55e' : '#ef4444',
            boxShadow: isRunning ? '0 0 8px #22c55e' : 'none',
          }} />
          <span style={{ fontWeight: 600, color: isRunning ? '#22c55e' : '#ef4444' }}>
            {isRunning ? 'Running' : 'Stopped'}
          </span>
        </div>

        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)' }} />

        {/* Sample Rate */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#666' }}>Rate</span>
          <span style={{ fontWeight: 600, color: '#f2f6ff' }}>
            {status ? `${status.sample_rate / 1000}kHz` : '—'}
          </span>
          <span style={{ fontSize: 10, color: '#555' }}>24-bit</span>
        </div>

        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)' }} />

        {/* Buffer / Latency */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#666' }}>Buffer</span>
          <span style={{ fontWeight: 600, color: '#f2f6ff' }}>
            {status ? `${status.buffer_size}` : '—'}
          </span>
          <span style={{ fontSize: 10, color: '#555' }}>smp</span>
          <span style={{ fontSize: 11, color: '#3b82f6', marginLeft: 4 }}>
            {latency ? `${latency.latency_ms.toFixed(1)}ms` : ''}
          </span>
        </div>

        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)' }} />

        {/* CPU Load */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#666' }}>CPU</span>
          <span style={{
            fontWeight: 600,
            color: cpuLoad > 0.8 ? '#ef4444' : cpuLoad > 0.5 ? '#f59e0b' : '#22c55e'
          }}>
            {(cpuLoad * 100).toFixed(1)}%
          </span>
          <div style={{
            width: 40,
            height: 4,
            background: 'rgba(255,255,255,0.1)',
            borderRadius: 2,
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${cpuLoad * 100}%`,
              height: '100%',
              background: cpuLoad > 0.8 ? '#ef4444' : cpuLoad > 0.5 ? '#f59e0b' : '#22c55e',
              transition: 'width 0.1s'
            }} />
          </div>
        </div>

        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)' }} />

        {/* Active Channels */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#666' }}>Channels</span>
          <span style={{ fontWeight: 600, color: '#06b6d4' }}>
            {juce?.input_channels ?? 10}in/{juce?.output_channels ?? 10}out
          </span>
        </div>

        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)' }} />

        {/* XRuns */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: '#666' }}>XRuns</span>
          <span style={{
            fontWeight: 600,
            color: (xruns?.total ?? 0) > 0 ? '#f59e0b' : '#22c55e'
          }}>
            {xruns?.total ?? 0}
          </span>
        </div>

        <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)' }} />

        {/* WebSocket Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: wsConnected ? '#22c55e' : '#666',
          }} />
          <span style={{ fontSize: 10, color: wsConnected ? '#22c55e' : '#666' }}>
            {wsConnected ? 'Live' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Hardware Images */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h3 style={{ marginBottom: 8, color: 'var(--text-muted)' }}>Front Panel</h3>
          <div style={{
            background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)',
            borderRadius: 8,
            padding: 16,
            display: 'inline-block',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            position: 'relative',
          }}>
            {/* Connection indicator overlay */}
            <div style={{
              position: 'absolute',
              top: 8,
              right: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(0,0,0,0.7)',
              padding: '4px 8px',
              borderRadius: 4,
              fontSize: 11,
            }}>
              <div style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: isRunning ? '#22c55e' : '#ef4444',
                boxShadow: isRunning ? '0 0 8px #22c55e' : 'none',
              }} />
              {isRunning ? 'Active' : 'Inactive'}
            </div>
            <img
              src={UA1000_FRONT_IMAGE}
              alt="Edirol UA-1000 Front Panel"
              style={{
                maxWidth: '100%',
                height: 'auto',
                borderRadius: 4,
                display: 'block',
              }}
              onError={(e) => {
                e.currentTarget.style.display = 'none'
                e.currentTarget.parentElement!.innerHTML = `
                  <div style="padding: 40px; color: #888; text-align: center;">
                    <div style="font-size: 48px; margin-bottom: 12px;">🎛️</div>
                    <div>Front Panel Image</div>
                    <div style="font-size: 12px; opacity: 0.7;">XLR/TRS Inputs 1-4 • Headphones • Gain Controls</div>
                  </div>
                `
              }}
            />
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <h3 style={{ marginBottom: 8, color: 'var(--text-muted)' }}>Rear Panel</h3>
          <div style={{
            background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)',
            borderRadius: 8,
            padding: 16,
            display: 'inline-block',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
          }}>
            <img
              src={UA1000_BACK_IMAGE}
              alt="Edirol UA-1000 Rear Panel"
              style={{
                maxWidth: '100%',
                height: 'auto',
                borderRadius: 4,
                display: 'block',
              }}
              onError={(e) => {
                e.currentTarget.style.display = 'none'
                e.currentTarget.parentElement!.innerHTML = `
                  <div style="padding: 40px; color: #888; text-align: center;">
                    <div style="font-size: 48px; margin-bottom: 12px;">🔌</div>
                    <div>Rear Panel Image</div>
                    <div style="font-size: 12px; opacity: 0.7;">Outputs 1-8 • S/PDIF • ADAT • Word Clock • MIDI • USB</div>
                  </div>
                `
              }}
            />
          </div>
        </div>
      </div>

      {/* Tabbed Sections */}
      <div className="card">
        <TabProvider
          defaultSelectedId="engine"
          selectedId={selectedTab}
          setSelectedId={(id) => setSelectedTab(id ?? 'engine')}
        >
          <TabList className="tab-list" aria-label="UA-1000 sections" style={{ gap: 4, display: 'flex', flexWrap: 'wrap' }}>
            <Tab id="engine" className="tab" style={{ padding: '10px 16px', fontSize: 14, fontWeight: 600, flex: '1 1 auto' }}>
              <Cpu size={18} /> JUCE Engine
            </Tab>
            <Tab id="meters" className="tab" style={{ padding: '10px 16px', fontSize: 14, fontWeight: 600, flex: '1 1 auto' }}>
              <Activity size={18} /> Live Meters
            </Tab>
            <Tab id="analog" className="tab" style={{ padding: '10px 16px', fontSize: 14, fontWeight: 600, flex: '1 1 auto' }}>
              <Volume2 size={18} /> Analog I/O
            </Tab>
            <Tab id="digital" className="tab" style={{ padding: '10px 16px', fontSize: 14, fontWeight: 600, flex: '1 1 auto' }}>
              <Waves size={18} /> Digital I/O
            </Tab>
            <Tab id="midi" className="tab" style={{ padding: '10px 16px', fontSize: 14, fontWeight: 600, flex: '1 1 auto' }}>
              <Music size={18} /> MIDI
            </Tab>
            <Tab id="health" className="tab" style={{ padding: '10px 16px', fontSize: 14, fontWeight: 600, flex: '1 1 auto' }}>
              <AlertCircle size={18} /> Health
            </Tab>
            <Tab id="diagnostics" className="tab" style={{ padding: '10px 16px', fontSize: 14, fontWeight: 600, flex: '1 1 auto' }}>
              <Wrench size={18} /> Diagnostics
            </Tab>
          </TabList>

          <TabPanel id="engine" className="tab-panel">
            <JuceEngineTab
              status={status}
              juce={juce}
              latency={latency}
              cpuLoad={cpuLoad}
              wsConnected={wsConnected}
            />
          </TabPanel>

          <TabPanel id="meters" className="tab-panel">
            <LiveMetersTab meterData={meterData} wsConnected={wsConnected} />
          </TabPanel>

          <TabPanel id="analog" className="tab-panel">
            <AnalogIOTab meterData={meterData} />
          </TabPanel>

          <TabPanel id="digital" className="tab-panel">
            <DigitalIOTab />
          </TabPanel>

          <TabPanel id="midi" className="tab-panel">
            <MIDITab />
          </TabPanel>

          <TabPanel id="health" className="tab-panel">
            <HealthTab health={health} xruns={xruns} />
          </TabPanel>

          <TabPanel id="diagnostics" className="tab-panel">
            <DiagnosticsTab />
          </TabPanel>
        </TabProvider>
      </div>

      {/* Configuration Dialog */}
      <ConfigDialog
        open={configDialogOpen}
        onClose={() => setConfigDialogOpen(false)}
        status={status}
        bufferPresets={bufferPresetsQuery.data}
        onConfigured={() => queryClient.invalidateQueries({ queryKey: ['audio'] })}
      />
    </div>
  )
}

// ========== JUCE Engine Tab ==========

function JuceEngineTab({
  status,
  juce,
  latency,
  cpuLoad,
  wsConnected,
}: {
  status?: AudioStatus
  juce?: JuceMetrics
  latency?: { latency_ms: number }
  cpuLoad: number
  wsConnected: boolean
}) {
  return (
    <div className="stack">
      <div className="section-heading">
        <div>
          <h3>JUCE Audio Engine Status</h3>
          <p className="subtitle">Real-time connection between Edirol UA-1000 and the audio processing engine.</p>
        </div>
      </div>

      <div className="grid three">
        {/* Engine Info */}
        <div className="card" style={{ padding: 16 }}>
          <div className="flex" style={{ alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <Cpu size={20} style={{ color: status?.running ? '#22c55e' : '#ef4444' }} />
            <h4>Engine</h4>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <div className="flex-between">
              <span>Status</span>
              <Chip
                label={status?.running ? 'Running' : 'Stopped'}
                size="small"
                color={status?.running ? 'success' : 'error'}
              />
            </div>
            <div className="flex-between">
              <span>Version</span>
              <span>{juce?.engine_version ?? status?.version ?? '—'}</span>
            </div>
            <div className="flex-between">
              <span>Plugin Count</span>
              <span>{status?.plugin_count ?? 0}</span>
            </div>
            <div className="flex-between">
              <span>Active Chain</span>
              <span>{status?.active_pedalboard ?? 'None'}</span>
            </div>
          </div>
        </div>

        {/* Audio Device */}
        <div className="card" style={{ padding: 16 }}>
          <div className="flex" style={{ alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <Usb size={20} style={{ color: '#0066cc' }} />
            <h4>Audio Device</h4>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <div className="flex-between">
              <span>Device</span>
              <span style={{ fontSize: 12 }}>{juce?.audio_device ?? 'Edirol UA-1000'}</span>
            </div>
            <div className="flex-between">
              <span>Input Channels</span>
              <Chip
                label={`${juce?.input_channels ?? 10} channels`}
                size="small"
                color="success"
                title="Analog 1-4, S/PDIF L/R, ADAT 1-8 (when in ADAT mode)"
              />
            </div>
            <div className="flex-between">
              <span>Output Channels</span>
              <Chip
                label={`${juce?.output_channels ?? 10} channels`}
                size="small"
                color="success"
                title="Analog 1-8, S/PDIF L/R"
              />
            </div>
            <div className="flex-between">
              <span>USB Speed</span>
              <Chip label="USB 2.0 Hi-Speed" size="small" color="info" />
            </div>
          </div>
        </div>

        {/* Performance */}
        <div className="card" style={{ padding: 16 }}>
          <div className="flex" style={{ alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <Gauge size={20} style={{ color: '#f59e0b' }} />
            <h4>Performance</h4>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <div>
              <div className="flex-between" style={{ marginBottom: 4 }}>
                <span>CPU Load</span>
                <span>{(cpuLoad * 100).toFixed(1)}%</span>
              </div>
              <LinearProgress
                variant="determinate"
                value={cpuLoad * 100}
                sx={{
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: 'var(--bg-tertiary)',
                  '& .MuiLinearProgress-bar': {
                    backgroundColor: cpuLoad > 0.8 ? '#ef4444' : cpuLoad > 0.5 ? '#f59e0b' : '#22c55e',
                  },
                }}
              />
            </div>
            <div className="flex-between">
              <span>Latency</span>
              <span>{latency?.latency_ms?.toFixed(2) ?? '—'} ms</span>
            </div>
            <div className="flex-between">
              <span>Sample Rate</span>
              <span>{status?.sample_rate ?? '—'} Hz</span>
            </div>
            <div className="flex-between">
              <span>Buffer Size</span>
              <span>{status?.buffer_size ?? '—'} samples</span>
            </div>
          </div>
        </div>
      </div>

      {/* WebSocket Status */}
      <div className="card" style={{ padding: 16 }}>
        <h4 style={{ marginBottom: 12 }}>Real-Time Connection</h4>
        <div className="grid two">
          <div className="flex" style={{ alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: wsConnected ? '#22c55e' : '#ef4444',
              boxShadow: wsConnected ? '0 0 8px #22c55e' : 'none',
            }} />
            <span>WebSocket: {wsConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Live metering updates at 30fps when connected
          </div>
        </div>
      </div>

      {/* Signal Flow */}
      <div className="card" style={{ padding: 16 }}>
        <h4 style={{ marginBottom: 16 }}>Signal Flow</h4>
        <div style={{
          background: 'var(--bg-secondary)',
          borderRadius: 8,
          padding: 24,
          textAlign: 'center',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: 800, margin: '0 auto' }}>
            {/* UA-1000 */}
            <div style={{ textAlign: 'center' }}>
              <div style={{
                background: '#0066cc',
                color: '#fff',
                padding: '12px 20px',
                borderRadius: 4,
                marginBottom: 8,
                fontWeight: 600,
              }}>
                Edirol UA-1000
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {juce?.input_channels ?? 10} In / {juce?.output_channels ?? 10} Out
              </div>
            </div>

            {/* Arrow */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>USB 2.0</div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ width: 80, height: 2, background: status?.running ? '#22c55e' : 'var(--border)' }} />
                <div style={{ borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderLeft: `8px solid ${status?.running ? '#22c55e' : 'var(--border)'}` }} />
              </div>
            </div>

            {/* JUCE Engine */}
            <div style={{ textAlign: 'center' }}>
              <div style={{
                background: status?.running ? '#22c55e' : '#666',
                color: '#fff',
                padding: '12px 20px',
                borderRadius: 4,
                marginBottom: 8,
                fontWeight: 600,
              }}>
                JUCE Engine
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {status?.plugin_count ?? 0} plugins loaded
              </div>
            </div>

            {/* Arrow */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Processed</div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ width: 80, height: 2, background: status?.running ? '#3b82f6' : 'var(--border)' }} />
                <div style={{ borderTop: '6px solid transparent', borderBottom: '6px solid transparent', borderLeft: `8px solid ${status?.running ? '#3b82f6' : 'var(--border)'}` }} />
              </div>
            </div>

            {/* Output */}
            <div style={{ textAlign: 'center' }}>
              <div style={{
                background: '#3b82f6',
                color: '#fff',
                padding: '12px 20px',
                borderRadius: 4,
                marginBottom: 8,
                fontWeight: 600,
              }}>
                Audio Output
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {juce?.output_channels ?? 10} channels available
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ========== Live Meters Tab ==========

function LiveMetersTab({ meterData, wsConnected }: { meterData: MeterData; wsConnected: boolean }) {
  const MeterBar = ({ value, label, color }: { value: number; label: string; color: string }) => (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{
        height: 150,
        width: 30,
        background: 'var(--bg-tertiary)',
        borderRadius: 4,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          bottom: 0,
          width: '100%',
          height: `${Math.min(value * 100, 100)}%`,
          background: value > 0.9 ? '#ef4444' : value > 0.7 ? '#f59e0b' : color,
          transition: 'height 0.05s linear',
        }} />
        {/* Peak indicator */}
        {value > 0.95 && (
          <div style={{
            position: 'absolute',
            top: 2,
            left: 2,
            right: 2,
            height: 4,
            background: '#ef4444',
            borderRadius: 2,
          }} />
        )}
      </div>
      <div style={{ fontSize: 10, textAlign: 'center', marginTop: 4 }}>
        {(value * 100).toFixed(0)}%
      </div>
    </div>
  )

  return (
    <div className="stack">
      <div className="section-heading">
        <div>
          <h3>Live Audio Meters</h3>
          <p className="subtitle">
            Real-time level monitoring via WebSocket.
            {!wsConnected && <span style={{ color: '#f59e0b' }}> (Reconnecting...)</span>}
          </p>
        </div>
        <Chip
          icon={wsConnected ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          label={wsConnected ? 'Live' : 'Offline'}
          color={wsConnected ? 'success' : 'default'}
          size="small"
        />
      </div>

      <div className="grid two">
        {/* Input Meters */}
        <div className="card" style={{ padding: 16 }}>
          <h4 style={{ marginBottom: 16, textAlign: 'center' }}>
            <Mic size={16} style={{ marginRight: 8 }} />
            Input Levels
          </h4>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
            <MeterBar value={meterData.input_left} label="L" color="#22c55e" />
            <MeterBar value={meterData.input_right} label="R" color="#22c55e" />
          </div>
        </div>

        {/* Output Meters */}
        <div className="card" style={{ padding: 16 }}>
          <h4 style={{ marginBottom: 16, textAlign: 'center' }}>
            <Volume2 size={16} style={{ marginRight: 8 }} />
            Output Levels
          </h4>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
            <MeterBar value={meterData.output_left} label="L" color="#3b82f6" />
            <MeterBar value={meterData.output_right} label="R" color="#3b82f6" />
          </div>
        </div>
      </div>

      {/* Multi-channel overview */}
      <div className="card" style={{ padding: 16 }}>
        <h4 style={{ marginBottom: 16 }}>All Channels Overview</h4>
        <div className="grid two">
          <div>
            <h5 style={{ fontSize: 12, marginBottom: 8 }}>Inputs (1-10)</h5>
            <div style={{ display: 'flex', gap: 4 }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((ch) => {
                // Simulate levels for channels
                const level = ch <= 2 ? (ch === 1 ? meterData.input_left : meterData.input_right) : 0
                return (
                  <div
                    key={ch}
                    style={{
                      width: 20,
                      height: 40,
                      background: 'var(--bg-tertiary)',
                      borderRadius: 2,
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      width: '100%',
                      height: `${level * 100}%`,
                      background: '#22c55e',
                      transition: 'height 0.05s linear',
                    }} />
                    <div style={{
                      position: 'absolute',
                      bottom: 2,
                      left: 0,
                      right: 0,
                      textAlign: 'center',
                      fontSize: 8,
                      color: 'var(--text-muted)',
                    }}>{ch}</div>
                  </div>
                )
              })}
            </div>
          </div>
          <div>
            <h5 style={{ fontSize: 12, marginBottom: 8 }}>Outputs (1-10)</h5>
            <div style={{ display: 'flex', gap: 4 }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((ch) => {
                const level = ch <= 2 ? (ch === 1 ? meterData.output_left : meterData.output_right) : 0
                return (
                  <div
                    key={ch}
                    style={{
                      width: 20,
                      height: 40,
                      background: 'var(--bg-tertiary)',
                      borderRadius: 2,
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      width: '100%',
                      height: `${level * 100}%`,
                      background: '#3b82f6',
                      transition: 'height 0.05s linear',
                    }} />
                    <div style={{
                      position: 'absolute',
                      bottom: 2,
                      left: 0,
                      right: 0,
                      textAlign: 'center',
                      fontSize: 8,
                      color: 'var(--text-muted)',
                    }}>{ch}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ========== Analog I/O Tab ==========

function AnalogIOTab({ meterData }: { meterData: MeterData }) {
  const [phantomPower, setPhantomPower] = useState([false, false, false, false])

  return (
    <div className="stack">
      <div className="section-heading">
        <div>
          <h3>Analog Inputs & Outputs</h3>
          <p className="subtitle">10 inputs and 10 outputs with 24-bit/96kHz converters.</p>
        </div>
      </div>

      {/* Front Panel Inputs 1-4 */}
      <div className="card" style={{ padding: 16 }}>
        <h4 style={{ marginBottom: 16 }}>
          <Mic size={16} style={{ marginRight: 8 }} />
          Front Panel Inputs (XLR/TRS Combo)
        </h4>
        <div className="grid four">
          {[1, 2, 3, 4].map((ch) => {
            const level = ch === 1 ? meterData.input_left : ch === 2 ? meterData.input_right : 0
            const isHiZ = ch === 3
            return (
              <div key={ch} className="card" style={{ padding: 12, background: 'var(--bg-secondary)' }}>
                <div className="flex-between" style={{ marginBottom: 8 }}>
                  <span style={{ fontWeight: 600 }}>Input {ch}</span>
                  {isHiZ && <Chip label="Hi-Z" size="small" color="warning" />}
                </div>

                <div style={{ marginBottom: 8 }}>
                  <div style={{
                    height: 60,
                    width: 20,
                    background: 'var(--bg-tertiary)',
                    borderRadius: 4,
                    margin: '0 auto',
                    position: 'relative',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      width: '100%',
                      height: `${level * 100}%`,
                      background: level > 0.9 ? '#ef4444' : '#22c55e',
                      transition: 'height 0.05s linear',
                    }} />
                  </div>
                </div>

                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={phantomPower[ch - 1]}
                      onChange={(e) => {
                        const newState = [...phantomPower]
                        newState[ch - 1] = e.target.checked
                        setPhantomPower(newState)
                      }}
                    />
                  }
                  label={<span style={{ fontSize: 11 }}>48V</span>}
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* Outputs */}
      <div className="card" style={{ padding: 16 }}>
        <h4 style={{ marginBottom: 16 }}>
          <Volume2 size={16} style={{ marginRight: 8 }} />
          Analog Outputs (TRS Balanced)
        </h4>
        <div className="grid four">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((ch) => {
            const level = ch === 1 ? meterData.output_left : ch === 2 ? meterData.output_right : 0
            const isMain = ch <= 2
            return (
              <div key={ch} className="card" style={{ padding: 12, background: 'var(--bg-secondary)' }}>
                <div className="flex-between" style={{ marginBottom: 8 }}>
                  <span style={{ fontWeight: 600 }}>Output {ch}</span>
                  {isMain && <Chip label="Main" size="small" color="primary" />}
                </div>
                <LinearProgress
                  variant="determinate"
                  value={level * 100}
                  sx={{
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: 'var(--bg-tertiary)',
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: '#3b82f6',
                    },
                  }}
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* Headphones */}
      <div className="card" style={{ padding: 16 }}>
        <h4 style={{ marginBottom: 16 }}>
          <Headphones size={16} style={{ marginRight: 8 }} />
          Headphones Output
        </h4>
        <div className="grid two">
          <div>
            <p className="subtitle">Stereo 1/4" TRS jack on front panel.</p>
            <div style={{ marginTop: 12 }}>
              <NumberInput
                label="Headphone Volume"
                value={60}
                min={0}
                max={100}
                step={1}
                unit="%"
                size="small"
                onChange={() => {}}
              />
            </div>
          </div>
          <div className="flex" style={{ justifyContent: 'center', alignItems: 'center' }}>
            <Headphones size={48} style={{ color: 'var(--accent)' }} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ========== Digital I/O Tab ==========

function DigitalIOTab() {
  return (
    <div className="stack">
      <div className="section-heading">
        <div>
          <h3>Digital Audio I/O</h3>
          <p className="subtitle">S/PDIF, ADAT optical, and Word Clock connections.</p>
        </div>
      </div>

      <div className="grid two">
        <div className="card" style={{ padding: 16 }}>
          <h4 style={{ marginBottom: 16 }}>
            <Radio size={16} style={{ marginRight: 8 }} />
            S/PDIF (Coaxial & Optical)
          </h4>
          <div className="stack" style={{ gap: 12 }}>
            <div className="flex-between">
              <span>Coaxial Input</span>
              <Chip label="Available" size="small" />
            </div>
            <div className="flex-between">
              <span>Coaxial Output</span>
              <Chip label="Available" size="small" />
            </div>
            <div className="flex-between">
              <span>Optical</span>
              <Chip label="S/PDIF Mode" size="small" />
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <h4 style={{ marginBottom: 16 }}>
            <Waves size={16} style={{ marginRight: 8 }} />
            ADAT Lightpipe
          </h4>
          <div className="stack" style={{ gap: 12 }}>
            <div className="flex-between">
              <span>Mode</span>
              <FormControl size="small" style={{ minWidth: 100 }}>
                <Select defaultValue="spdif" size="small">
                  <MenuItem value="spdif">S/PDIF</MenuItem>
                  <MenuItem value="adat">ADAT</MenuItem>
                </Select>
              </FormControl>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              ADAT mode provides 8 channels at 44.1/48kHz
            </p>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <h4 style={{ marginBottom: 16 }}>
          <Clock size={16} style={{ marginRight: 8 }} />
          Word Clock (BNC)
        </h4>
        <div className="grid two">
          <div className="flex-between">
            <span>Word Clock In</span>
            <Chip label="No Signal" size="small" />
          </div>
          <div className="flex-between">
            <span>Word Clock Out</span>
            <Chip label="Active" size="small" color="info" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ========== MIDI Tab ==========

function MIDITab() {
  return (
    <div className="stack">
      <div className="section-heading">
        <div>
          <h3>MIDI Interface</h3>
          <p className="subtitle">5-pin DIN MIDI In and Out connectors.</p>
        </div>
      </div>

      <div className="grid two">
        <div className="card" style={{ padding: 16 }}>
          <div className="flex" style={{ alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <Music size={24} style={{ color: 'var(--accent)' }} />
            <div>
              <h4>MIDI In</h4>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>5-pin DIN</span>
            </div>
          </div>
          <Chip label="Available" size="small" color="success" />
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div className="flex" style={{ alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <Music size={24} style={{ color: 'var(--accent)' }} />
            <div>
              <h4>MIDI Out</h4>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>5-pin DIN</span>
            </div>
          </div>
          <Chip label="Available" size="small" color="success" />
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <h4 style={{ marginBottom: 12 }}>USB MIDI</h4>
        <p className="subtitle">
          The UA-1000 also provides a USB MIDI interface to the JUCE engine.
        </p>
      </div>
    </div>
  )
}

// ========== Health Tab ==========

function HealthTab({ health, xruns }: { health?: AudioHealth; xruns?: XrunStats }) {
  const { pushToast } = useToasts()

  const unmuteMutation = useMutation({
    mutationFn: audioApi.unmute,
    onSuccess: () => pushToast('Audio unmuted', 'success'),
    onError: () => pushToast('Failed to unmute', 'error'),
  })

  return (
    <div className="stack">
      <div className="section-heading">
        <div>
          <h3>Audio Health Monitoring</h3>
          <p className="subtitle">XRun detection, signal monitoring, and system alerts.</p>
        </div>
      </div>

      <div className="grid three">
        <StatCard
          label="Health Status"
          value={health?.status ?? 'Unknown'}
          helper={health?.alerts?.length ? `${health.alerts.length} alerts` : 'No alerts'}
          tone={health?.status === 'healthy' ? 'success' : health?.status === 'warning' ? 'warn' : 'default'}
        />
        <StatCard
          label="XRuns (Last Min)"
          value={xruns?.last_minute ?? 0}
          helper={`${xruns?.total ?? 0} total`}
          tone={(xruns?.last_minute ?? 0) > 5 ? 'warn' : 'default'}
        />
        <StatCard
          label="Signal"
          value={health?.signal_detected ? 'Detected' : 'No Signal'}
          helper={health?.auto_muted ? 'Auto-muted' : 'Active'}
          tone={health?.signal_detected ? 'success' : 'default'}
        />
      </div>

      {/* XRun Statistics */}
      <div className="card" style={{ padding: 16 }}>
        <h4 style={{ marginBottom: 16 }}>
          <TriangleAlert size={16} style={{ marginRight: 8 }} />
          XRun Statistics
        </h4>
        <div className="grid four">
          <div className="list-item" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 600 }}>{xruns?.total ?? 0}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total</div>
          </div>
          <div className="list-item" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 600 }}>{xruns?.last_minute ?? 0}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Last Minute</div>
          </div>
          <div className="list-item" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 600 }}>{xruns?.last_hour ?? 0}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Last Hour</div>
          </div>
          <div className="list-item" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12 }}>{xruns?.last_timestamp ?? '—'}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Last Occurred</div>
          </div>
        </div>
      </div>

      {/* Auto-mute control */}
      {health?.auto_muted && (
        <div className="card" style={{ padding: 16 }}>
          <Alert
            severity="warning"
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => unmuteMutation.mutate()}
                disabled={unmuteMutation.isPending}
              >
                Force Unmute
              </Button>
            }
          >
            Audio has been automatically muted due to excessive XRuns. Consider increasing buffer size.
          </Alert>
        </div>
      )}

      {/* Alerts */}
      {health?.alerts && health.alerts.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <h4 style={{ marginBottom: 12 }}>Active Alerts</h4>
          <div className="stack" style={{ gap: 8 }}>
            {health.alerts.map((alert, i) => (
              <Alert key={i} severity="warning" icon={<AlertCircle size={16} />}>
                {alert}
              </Alert>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ========== Diagnostics Tab ==========

function DiagnosticsTab() {
  const { pushToast } = useToasts()
  const queryClient = useQueryClient()
  const [testResults, setTestResults] = useState<DiagnosticResult[]>([])
  const [isRunningFullTest, setIsRunningFullTest] = useState(false)

  // Run loopback test
  const loopbackTest = useMutation({
    mutationFn: diagnosticsApi.runLoopbackTest,
    onSuccess: (data) => {
      setTestResults(prev => [data, ...prev])
      pushToast(data.success ? 'Loopback test passed' : 'Loopback test failed', data.success ? 'success' : 'error')
    },
    onError: () => pushToast('Failed to run loopback test', 'error'),
  })

  // Clear XRuns
  const clearXruns = useMutation({
    mutationFn: diagnosticsApi.clearXruns,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audio', 'xruns'] })
      pushToast('XRun counter cleared', 'success')
    },
    onError: () => pushToast('Failed to clear XRuns', 'error'),
  })

  // Reset ALSA state
  const resetAlsa = useMutation({
    mutationFn: diagnosticsApi.resetAlsaState,
    onSuccess: (data) => {
      pushToast(data.message || 'ALSA state reset', 'success')
    },
    onError: () => pushToast('Failed to reset ALSA state', 'error'),
  })

  // Run full diagnostic
  const fullDiagnostic = useMutation({
    mutationFn: diagnosticsApi.runFullDiagnostic,
    onMutate: () => setIsRunningFullTest(true),
    onSuccess: (data) => {
      setTestResults(data.tests)
      setIsRunningFullTest(false)
      pushToast(
        `Diagnostics complete: ${data.overall_status.toUpperCase()}`,
        data.overall_status === 'pass' ? 'success' : data.overall_status === 'warning' ? 'info' : 'error'
      )
    },
    onError: () => {
      setIsRunningFullTest(false)
      pushToast('Failed to run diagnostics', 'error')
    },
  })

  // Test buffer stability
  const bufferTest = useMutation({
    mutationFn: ({ size, duration }: { size: number; duration: number }) =>
      diagnosticsApi.testBufferStability(size, duration),
    onSuccess: (data) => {
      const result: DiagnosticResult = {
        success: data.stability_score > 0.9,
        test_name: `Buffer Stability (${data.buffer_size} samples)`,
        duration_ms: data.duration_seconds * 1000,
        xruns_detected: data.xruns,
        message: data.recommendation,
        quality_score: data.stability_score,
      }
      setTestResults(prev => [result, ...prev])
      pushToast(result.success ? 'Buffer stable' : 'Buffer instability detected', result.success ? 'success' : 'warn')
    },
    onError: () => pushToast('Failed to run buffer test', 'error'),
  })

  return (
    <div className="stack">
      <div className="section-heading">
        <div>
          <h3>Diagnostics & Reset</h3>
          <p className="subtitle">Run tests, reset device state, and troubleshoot issues.</p>
        </div>
      </div>

      {/* Factory Reset Instructions */}
      <div className="card" style={{ padding: 16, background: 'linear-gradient(135deg, #1e3a5f 0%, #0d1b2a 100%)', border: '1px solid #234' }}>
        <div className="flex" style={{ alignItems: 'flex-start', gap: 16 }}>
          <div style={{
            background: '#0066cc',
            borderRadius: 8,
            padding: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <RotateCcw size={24} style={{ color: '#fff' }} />
          </div>
          <div style={{ flex: 1 }}>
            <h4 style={{ marginBottom: 8, color: '#fff' }}>UA-1000 Hardware Factory Reset</h4>
            <p style={{ fontSize: 13, color: '#aab', marginBottom: 12 }}>
              To restore the UA-1000 to factory settings:
            </p>
            <ol style={{ fontSize: 12, color: '#8899aa', paddingLeft: 20, margin: 0 }}>
              <li style={{ marginBottom: 4 }}>Power off the UA-1000</li>
              <li style={{ marginBottom: 4 }}>Hold down <strong style={{ color: '#fff' }}>Output Volume Select</strong> + <strong style={{ color: '#fff' }}>Stereo/Mono Select</strong> switches simultaneously</li>
              <li style={{ marginBottom: 4 }}>While holding both switches, turn the power ON</li>
              <li>Release the switches after the unit powers up</li>
            </ol>
            <Alert severity="warning" sx={{ mt: 2, '& .MuiAlert-message': { fontSize: 11 } }}>
              This will reset all UA-1000 internal settings including clock source and digital I/O modes.
            </Alert>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card" style={{ padding: 16 }}>
        <h4 style={{ marginBottom: 16 }}>
          <Wrench size={16} style={{ marginRight: 8 }} />
          Quick Actions
        </h4>
        <div className="grid four">
          <Button
            variant="outlined"
            onClick={() => fullDiagnostic.mutate()}
            disabled={isRunningFullTest}
            startIcon={isRunningFullTest ? <Loader2 className="spin" size={16} /> : <ListChecks size={16} />}
            fullWidth
          >
            {isRunningFullTest ? 'Running...' : 'Full Diagnostic'}
          </Button>
          <Button
            variant="outlined"
            onClick={() => loopbackTest.mutate()}
            disabled={loopbackTest.isPending}
            startIcon={loopbackTest.isPending ? <Loader2 className="spin" size={16} /> : <Cable size={16} />}
            fullWidth
          >
            Loopback Test
          </Button>
          <Button
            variant="outlined"
            onClick={() => clearXruns.mutate()}
            disabled={clearXruns.isPending}
            startIcon={<RotateCcw size={16} />}
            fullWidth
          >
            Clear XRuns
          </Button>
          <Button
            variant="outlined"
            color="warning"
            onClick={() => resetAlsa.mutate()}
            disabled={resetAlsa.isPending}
            startIcon={resetAlsa.isPending ? <Loader2 className="spin" size={16} /> : <HardDrive size={16} />}
            fullWidth
          >
            Reset ALSA
          </Button>
        </div>
      </div>

      {/* Buffer Stability Tests */}
      <div className="card" style={{ padding: 16 }}>
        <h4 style={{ marginBottom: 16 }}>
          <TestTube size={16} style={{ marginRight: 8 }} />
          Buffer Stability Tests
        </h4>
        <p className="subtitle" style={{ marginBottom: 12 }}>
          Test different buffer sizes to find the optimal setting for your system.
        </p>
        <div className="grid four">
          {[64, 128, 256, 512].map(size => (
            <Button
              key={size}
              variant="outlined"
              size="small"
              onClick={() => bufferTest.mutate({ size, duration: 5 })}
              disabled={bufferTest.isPending}
            >
              Test {size} smp
            </Button>
          ))}
        </div>
      </div>

      {/* ALSA Diagnostic Commands */}
      <div className="card" style={{ padding: 16 }}>
        <h4 style={{ marginBottom: 16 }}>
          <HardDrive size={16} style={{ marginRight: 8 }} />
          ALSA Diagnostics
        </h4>
        <p className="subtitle" style={{ marginBottom: 12 }}>
          Linux ALSA commands for low-level troubleshooting. Run these in a terminal:
        </p>
        <div className="stack" style={{ gap: 8 }}>
          {[
            { cmd: 'aplay -l', desc: 'List all playback devices' },
            { cmd: 'arecord -l', desc: 'List all capture devices' },
            { cmd: 'cat /proc/asound/cards', desc: 'Show ALSA card info' },
            { cmd: 'alsa-info.sh --upload', desc: 'Generate full ALSA diagnostic report' },
            { cmd: 'dmesg | grep -i snd', desc: 'Check kernel audio messages' },
            { cmd: 'lsusb -v | grep -A 20 "Edirol\\|Roland"', desc: 'USB device descriptor' },
          ].map(({ cmd, desc }) => (
            <div key={cmd} className="list-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <code style={{ fontSize: 12, background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: 3 }}>{cmd}</code>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{desc}</div>
              </div>
              <Tooltip title="Copy to clipboard">
                <Button
                  size="small"
                  onClick={() => {
                    navigator.clipboard.writeText(cmd)
                    pushToast('Copied to clipboard', 'info')
                  }}
                >
                  Copy
                </Button>
              </Tooltip>
            </div>
          ))}
        </div>
      </div>

      {/* Test Results */}
      {testResults.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <div className="flex-between" style={{ marginBottom: 16 }}>
            <h4>
              <Activity size={16} style={{ marginRight: 8 }} />
              Test Results
            </h4>
            <Button size="small" onClick={() => setTestResults([])}>Clear</Button>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            {testResults.map((result, i) => (
              <div
                key={i}
                className="list-item"
                style={{
                  borderLeft: `3px solid ${result.success ? '#22c55e' : '#ef4444'}`,
                  paddingLeft: 12,
                }}
              >
                <div className="flex-between">
                  <div className="flex" style={{ alignItems: 'center', gap: 8 }}>
                    {result.success ? (
                      <CheckCircle2 size={16} style={{ color: '#22c55e' }} />
                    ) : (
                      <XCircle size={16} style={{ color: '#ef4444' }} />
                    )}
                    <strong>{result.test_name}</strong>
                  </div>
                  <Chip
                    label={result.success ? 'PASS' : 'FAIL'}
                    size="small"
                    color={result.success ? 'success' : 'error'}
                  />
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  {result.message}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  Duration: {result.duration_ms}ms
                  {result.latency_ms && ` • Latency: ${result.latency_ms.toFixed(2)}ms`}
                  {result.quality_score && ` • Quality: ${(result.quality_score * 100).toFixed(0)}%`}
                  {result.xruns_detected > 0 && ` • XRuns: ${result.xruns_detected}`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Troubleshooting Tips */}
      <div className="card" style={{ padding: 16 }}>
        <h4 style={{ marginBottom: 16 }}>
          <Info size={16} style={{ marginRight: 8 }} />
          Troubleshooting Tips
        </h4>
        <div className="stack" style={{ gap: 12 }}>
          <Alert severity="info" icon={<Info size={16} />}>
            <strong>XRuns / Buffer Underruns:</strong> Increase buffer size in Configure dialog. Try 512 or 1024 samples for stability.
          </Alert>
          <Alert severity="info" icon={<Info size={16} />}>
            <strong>No Audio Output:</strong> Check that UA-1000 is selected as the audio device. Verify USB connection and try a different USB port.
          </Alert>
          <Alert severity="info" icon={<Info size={16} />}>
            <strong>High Latency:</strong> Lower the buffer size (try 128 or 256 samples). Ensure USB 2.0 port is being used, not USB 1.1.
          </Alert>
          <Alert severity="info" icon={<Info size={16} />}>
            <strong>Digital Sync Issues:</strong> If using S/PDIF or ADAT, ensure clock source matches the external device. Perform hardware factory reset if needed.
          </Alert>
          <Alert severity="info" icon={<Info size={16} />}>
            <strong>Crackling/Pops:</strong> Disable USB power saving in Linux. Check with: <code style={{ fontSize: 11 }}>cat /sys/module/usbcore/parameters/autosuspend</code>
          </Alert>
        </div>
      </div>
    </div>
  )
}

// ========== Configuration Dialog ==========

function ConfigDialog({
  open,
  onClose,
  status,
  bufferPresets,
  onConfigured,
}: {
  open: boolean
  onClose: () => void
  status?: AudioStatus
  bufferPresets?: BufferPreset[]
  onConfigured: () => void
}) {
  const { pushToast } = useToasts()
  const [sampleRate, setSampleRate] = useState(status?.sample_rate ?? 48000)
  const [bufferSize, setBufferSize] = useState(status?.buffer_size ?? 256)

  useEffect(() => {
    if (status) {
      setSampleRate(status.sample_rate)
      setBufferSize(status.buffer_size)
    }
  }, [status])

  const configureMutation = useMutation({
    mutationFn: () => audioApi.configure({ sampleRate, bufferSize }),
    onSuccess: (data) => {
      onConfigured()
      onClose()
      pushToast(data.message || 'Configuration applied', 'success')
    },
    onError: () => pushToast('Failed to apply configuration', 'error'),
  })

  const calculateLatency = (buffer: number, rate: number) => ((buffer / rate) * 1000).toFixed(2)

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>UA-1000 / JUCE Engine Configuration</DialogTitle>
      <DialogContent>
        <div className="stack" style={{ paddingTop: 8 }}>
          <FormControl fullWidth>
            <InputLabel>Sample Rate</InputLabel>
            <Select
              value={sampleRate}
              label="Sample Rate"
              onChange={(e) => setSampleRate(Number(e.target.value))}
            >
              <MenuItem value={44100}>44.1 kHz (CD Quality)</MenuItem>
              <MenuItem value={48000}>48 kHz (Recommended)</MenuItem>
              <MenuItem value={88200}>88.2 kHz (High Resolution)</MenuItem>
              <MenuItem value={96000}>96 kHz (Studio Quality)</MenuItem>
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <InputLabel>Buffer Size</InputLabel>
            <Select
              value={bufferSize}
              label="Buffer Size"
              onChange={(e) => setBufferSize(Number(e.target.value))}
            >
              {(Array.isArray(bufferPresets) ? bufferPresets : [
                { size: 64, label: '64 samples' },
                { size: 128, label: '128 samples' },
                { size: 256, label: '256 samples', recommended: true },
                { size: 512, label: '512 samples' },
                { size: 1024, label: '1024 samples' },
                { size: 2048, label: '2048 samples' },
              ]).map((preset) => (
                <MenuItem key={preset.size} value={preset.size}>
                  {preset.size} samples ({calculateLatency(preset.size, sampleRate)} ms)
                  {preset.recommended && ' - Recommended'}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <div style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 4 }}>
            <div className="flex-between" style={{ marginBottom: 8 }}>
              <span>Calculated Latency:</span>
              <strong>{calculateLatency(bufferSize, sampleRate)} ms</strong>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
              Lower buffer sizes reduce latency but increase CPU load. Higher buffer sizes are more stable.
            </p>
          </div>

          <Alert severity="info" icon={<AlertCircle size={16} />}>
            Changes will restart the audio engine. Active processing will be briefly interrupted.
          </Alert>
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={() => configureMutation.mutate()}
          variant="contained"
          disabled={configureMutation.isPending}
        >
          {configureMutation.isPending ? <CircularProgress size={16} /> : 'Apply'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
