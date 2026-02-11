import { useState, useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { PencilSimple, Check, X, WarningCircle, SpinnerGap, CheckCircle, XCircle, Lightning, Pulse, Cpu, Clock, TrendUp } from '@phosphor-icons/react'
import { useCPUMetrics } from '../hooks/useCPUMetrics'

interface AudioActivity {
  id: string
  label: string
  description: string
  cpu_affinity: boolean
  min_priority: string
  category?: string
}

interface CoreAssignment {
  core_id: number
  services: string[]
  priority: 'SCHED_FIFO' | 'SCHED_RR' | 'normal'
  isolated: boolean
}

interface CoreConfig {
  cores: CoreAssignment[]
  available_activities: AudioActivity[]
  cpu_count: number
}

interface CoreUtilization {
  core_id: number
  utilization: number
  timestamp: number
}

const AVAILABLE_ACTIVITIES: AudioActivity[] = [
  // JUCE Audio Engine (Core RT Services)
  {
    id: 'juce_audio_engine',
    label: 'JUCE Audio Engine',
    description: 'ALSA backend, buffer management, latency compensation, audio I/O',
    cpu_affinity: true,
    min_priority: 'SCHED_FIFO',
    category: 'JUCE',
  },
  {
    id: 'juce_dsp_graph',
    label: 'JUCE DSP Graph',
    description: 'Effect chain routing, A/B morphing, parameter interpolation, bypass control',
    cpu_affinity: true,
    min_priority: 'SCHED_FIFO',
    category: 'JUCE',
  },
  {
    id: 'juce_midi_io',
    label: 'JUCE MIDI / I/O',
    description: 'MIDI input routing, learn mode, CC mapping, real-time events',
    cpu_affinity: true,
    min_priority: 'SCHED_FIFO',
    category: 'JUCE',
  },
  {
    id: 'juce_monitoring',
    label: 'JUCE Monitoring',
    description: 'Watchdog, performance history, alert generation, underrun tracking',
    cpu_affinity: true,
    min_priority: 'SCHED_RR',
    category: 'JUCE',
  },
  // Plugin Processing
  {
    id: 'all_plugins',
    label: 'Audio Plugins',
    description: 'JUCE plugin host (VST3, AU, LV2, LADSPA), scanner, per-plugin CPU tracking',
    cpu_affinity: true,
    min_priority: 'SCHED_FIFO',
    category: 'Plugins',
  },
  {
    id: 'nam_processing',
    label: 'NAM Models',
    description: 'Neural amp modeling, CUDA/MPS GPU acceleration, pre-allocated buffers',
    cpu_affinity: true,
    min_priority: 'SCHED_FIFO',
    category: 'Plugins',
  },
  {
    id: 'ir_processing',
    label: 'IR Processing (Cabinet/Reverb)',
    description: 'Partitioned FFT convolution, overlap-add, wet/dry mix, latency reporting',
    cpu_affinity: true,
    min_priority: 'SCHED_FIFO',
    category: 'Plugins',
  },
  // System Services
  {
    id: 'ui_api',
    label: 'UI / API Server',
    description: 'FastAPI backend, WebSocket events, REST endpoints, metrics collector',
    cpu_affinity: false,
    min_priority: 'normal',
    category: 'System',
  },
  {
    id: 'meters_ui',
    label: 'Meters / Visualization',
    description: 'VU meters, level display, waveform rendering, LCD updates',
    cpu_affinity: false,
    min_priority: 'normal',
    category: 'System',
  },
  {
    id: 'background',
    label: 'Background Tasks',
    description: 'Logging, preset autosave, plugin scanning, network discovery',
    cpu_affinity: false,
    min_priority: 'normal',
    category: 'System',
  },
]

const UTILIZATION_THRESHOLD = 90
const SUSTAINED_DURATION_MS = 5000

export function CPUStatusOverview() {
  const [editingCoreId, setEditingCoreId] = useState<number | null>(null)
  const [editingServices, setEditingServices] = useState<string[]>([])
  const [editingPriority, setEditingPriority] = useState<'SCHED_FIFO' | 'SCHED_RR' | 'normal'>('normal')
  const [editingIsolated, setEditingIsolated] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [coreUtilization, setCoreUtilization] = useState<Map<number, CoreUtilization>>(new Map())
  const [highUtilHistory, setHighUtilHistory] = useState<Map<number, number>>(new Map()) // core_id -> timestamp when high util started
  const [alertCores, setAlertCores] = useState<Set<number>>(new Set()) // cores that should be red
  const [verificationResult, setVerificationResult] = useState<any>(null)
  const [isVerifying, setIsVerifying] = useState(false)

  // JUCE audio engine metrics via WebSocket
  const {
    metrics: juceMetrics,
    status: juceStatus,
    hasXruns,
    getTopConsumers,
    isConnected: juceConnected
  } = useCPUMetrics({ useWebSocket: true })

  // Fetch current configuration
  const configQuery = useQuery<CoreConfig>({
    queryKey: ['core-assignments'],
    queryFn: async () => {
      const res = await fetch('/api/system/core-config')
      if (!res.ok) {
        throw new Error('Failed to fetch core configuration')
      }
      return res.json()
    },
  })

  // Fetch real utilization data from API with proper caching
  useEffect(() => {
    // Fetch immediately on mount
    const fetchUtilization = async () => {
      try {
        const res = await fetch('/api/system/core-config')
        if (!res.ok) throw new Error('Failed to fetch utilization')
        const data = await res.json()
        
        // Update utilization from the API response
        setCoreUtilization((prev) => {
          const updated = new Map(prev)
          data.cores?.forEach((core: any) => {
            updated.set(core.core_id, {
              core_id: core.core_id,
              utilization: Math.max(0, Math.min(100, core.utilization || 0)),
              timestamp: Date.now(),
            })
          })
          return updated
        })
      } catch (error) {
        console.error('Error fetching utilization:', error)
      }
    }

    fetchUtilization()
    
    // Poll every 1 second for updates
    const interval = setInterval(fetchUtilization, 1000)

    return () => clearInterval(interval)
  }, [])

  // Monitor high utilization sustained for 5 seconds
  useEffect(() => {
    const now = Date.now()
    const newHighUtilHistory = new Map(highUtilHistory)
    const newAlertCores = new Set<number>()

    coreUtilization.forEach((util, coreId) => {
      if (util.utilization >= UTILIZATION_THRESHOLD) {
        // Core is above threshold
        if (!newHighUtilHistory.has(coreId)) {
          // Start tracking
          newHighUtilHistory.set(coreId, now)
        }
        // Check if sustained for 5 seconds
        const startTime = newHighUtilHistory.get(coreId)!
        if (now - startTime >= SUSTAINED_DURATION_MS) {
          newAlertCores.add(coreId)
        }
      } else {
        // Core dropped below threshold
        newHighUtilHistory.delete(coreId)
      }
    })

    setHighUtilHistory(newHighUtilHistory)
    setAlertCores(newAlertCores)
  }, [coreUtilization])

  // Apply changes mutation
  const applyMutation = useMutation({
    mutationFn: async (newConfig: CoreConfig) => {
      const res = await fetch('/api/system/core-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to apply core configuration')
      }
      return res.json()
    },
    onSuccess: () => {
      setHasChanges(false)
      setEditingCoreId(null)
      configQuery.refetch()
    },
  })

  const handleEditCore = (coreId: number) => {
    const core = configQuery.data?.cores.find((c) => c.core_id === coreId)
    if (core) {
      setEditingCoreId(coreId)
      setEditingServices([...core.services])
      setEditingPriority(core.priority)
      setEditingIsolated(core.isolated)
    }
  }

  const handleSaveCore = async () => {
    if (!configQuery.data || editingCoreId === null) return

    try {
      const response = await fetch('/api/system/core-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          core_id: editingCoreId,
          services: editingServices,
          priority: editingPriority,
          isolated: editingIsolated,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to update core configuration')
      }

      await response.json()
      
      // Update local state with new configuration
      if (configQuery.data) {
        configQuery.data.cores = configQuery.data.cores.map((c) =>
          c.core_id === editingCoreId
            ? { ...c, services: editingServices, priority: editingPriority, isolated: editingIsolated }
            : c
        )
      }
      
      setEditingCoreId(null)
      setEditingServices([])
      setHasChanges(false)
      
      // Refetch to ensure sync with server
      await configQuery.refetch()
    } catch (error) {
      console.error('Failed to save core configuration:', error)
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleCancel = () => {
    setEditingCoreId(null)
    setHasChanges(false)
  }

  const handleApplyChanges = async () => {
    if (!configQuery.data) return
    await applyMutation.mutateAsync(configQuery.data)
  }

  const toggleService = (service: string) => {
    if (editingServices.includes(service)) {
      setEditingServices(editingServices.filter((s) => s !== service))
    } else {
      // Allow unlimited services per core
      setEditingServices([...editingServices, service])
    }
  }

  // Verify live CPU core pinning configuration
  const handleVerifyLiveConfig = async () => {
    setIsVerifying(true)
    try {
      const res = await fetch('/api/system/core-config/verify')
      if (!res.ok) {
        throw new Error('Failed to verify configuration')
      }
      const data = await res.json()
      setVerificationResult(data)
    } catch (error) {
      console.error('Verification failed:', error)
      setVerificationResult({
        status: 'error',
        message: error instanceof Error ? error.message : 'Verification failed',
      })
    } finally {
      setIsVerifying(false)
    }
  }

  // Group activities by category
  const groupedActivities = AVAILABLE_ACTIVITIES.reduce((acc, activity) => {
    const category = activity.category || 'Other'
    if (!acc[category]) acc[category] = []
    acc[category].push(activity)
    return acc
  }, {} as Record<string, AudioActivity[]>)

  const getCoreBgColor = (coreId: number, isAlert: boolean) => {
    if (isAlert) return '#ff5252' // Red for high sustained utilization
    const util = coreUtilization.get(coreId)?.utilization ?? 0
    if (util >= 75) return 'rgba(255, 152, 0, 0.15)' // Orange warning
    if (util >= 50) return 'rgba(76, 175, 80, 0.1)' // Light green
    return 'rgba(100, 100, 100, 0.05)' // Light gray
  }

  const getUtilizationColor = (util: number) => {
    if (util >= 90) return '#ff5252'
    if (util >= 75) return '#ffa726'
    if (util >= 50) return '#4caf50'
    return '#90caf9'
  }

  if (configQuery.isLoading) {
    return (
      <div className="flex" style={{ padding: '12px 4px' }}>
        <SpinnerGap className="spin" size={18} weight="duotone" /> Loading core configuration...
      </div>
    )
  }

  if (!configQuery.data) {
    return <div className="pill warn">Failed to load core configuration</div>
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      {/* Header */}
      <div className="flex-between" style={{ gap: 12 }}>
        <div>
          <h3 style={{ margin: '0 0 4px' }}>CPU Core Status & Management</h3>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            Manage real-time service affinity, priority scheduling, and core isolation for optimal audio performance. Red indicates &gt;90% utilization sustained for 5 seconds.
          </p>
          <div style={{ marginTop: 8, fontSize: 11, color: '#9ca3af', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div><strong>SCHED_FIFO:</strong> Highest priority, real-time audio</div>
            <div><strong>SCHED_RR:</strong> Round-robin, moderate priority</div>
            <div><strong>normal:</strong> Standard Linux scheduling</div>
          </div>
        </div>
      </div>

      {/* JUCE Audio Engine Performance */}
      {juceMetrics.running && (
        <div style={{ padding: 16, backgroundColor: '#1a1a2e', borderRadius: 10, border: '1px solid #2a2a4a' }}>
          <div className="flex-between" style={{ marginBottom: 14 }}>
            <div className="flex" style={{ gap: 10, alignItems: 'center' }}>
              <Pulse size={18} weight="duotone" style={{ color: '#64b5f6' }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#f2f6ff' }}>JUCE Audio Engine Performance</span>
              {juceConnected && (
                <span style={{ fontSize: 9, padding: '2px 6px', background: 'rgba(76,175,80,0.2)', border: '1px solid rgba(76,175,80,0.4)', borderRadius: 10, color: '#4caf50' }}>
                  LIVE
                </span>
              )}
            </div>
            {hasXruns && (
              <div className="flex" style={{ gap: 6, alignItems: 'center', padding: '4px 10px', background: 'rgba(255,82,82,0.15)', border: '1px solid rgba(255,82,82,0.4)', borderRadius: 6 }}>
                <WarningCircle size={14} weight="duotone" style={{ color: '#ff5252' }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#ff5252' }}>{juceMetrics.xrunCount} XRuns</span>
              </div>
            )}
          </div>

          {/* Main metrics grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            {/* Audio Callback CPU */}
            <div style={{ padding: 12, background: 'rgba(100,181,246,0.08)', borderRadius: 8, border: '1px solid rgba(100,181,246,0.2)' }}>
              <div className="flex" style={{ gap: 6, alignItems: 'center', marginBottom: 8 }}>
                <Cpu size={14} weight="duotone" style={{ color: '#64b5f6' }} />
                <span style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', fontWeight: 500 }}>Audio CPU</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: juceStatus === 'critical' ? '#ff5252' : juceStatus === 'warning' ? '#ffa726' : '#4caf50' }}>
                {juceMetrics.totalCpuPercent.toFixed(1)}%
              </div>
              <div style={{ marginTop: 6, height: 4, background: 'rgba(100,100,100,0.2)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min(100, juceMetrics.totalCpuPercent)}%`,
                  background: juceStatus === 'critical' ? '#ff5252' : juceStatus === 'warning' ? '#ffa726' : '#4caf50',
                  transition: 'width 150ms ease'
                }} />
              </div>
            </div>

            {/* Peak CPU */}
            <div style={{ padding: 12, background: 'rgba(255,167,38,0.08)', borderRadius: 8, border: '1px solid rgba(255,167,38,0.2)' }}>
              <div className="flex" style={{ gap: 6, alignItems: 'center', marginBottom: 8 }}>
                <TrendUp size={14} weight="duotone" style={{ color: '#ffa726' }} />
                <span style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', fontWeight: 500 }}>Peak</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#ffa726' }}>
                {juceMetrics.peakCpuPercent.toFixed(1)}%
              </div>
              <div style={{ fontSize: 10, color: '#6b7280', marginTop: 6 }}>
                Avg: {juceMetrics.averageCpuPercent.toFixed(1)}%
              </div>
            </div>

            {/* Headroom */}
            <div style={{ padding: 12, background: 'rgba(76,175,80,0.08)', borderRadius: 8, border: '1px solid rgba(76,175,80,0.2)' }}>
              <div className="flex" style={{ gap: 6, alignItems: 'center', marginBottom: 8 }}>
                <Pulse size={14} weight="duotone" style={{ color: '#4caf50' }} />
                <span style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', fontWeight: 500 }}>Headroom</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: juceMetrics.headroomPercent < 20 ? '#ff5252' : juceMetrics.headroomPercent < 40 ? '#ffa726' : '#4caf50' }}>
                {juceMetrics.headroomPercent.toFixed(0)}%
              </div>
              <div style={{ fontSize: 10, color: '#6b7280', marginTop: 6 }}>
                Safety margin
              </div>
            </div>

            {/* Callback Timing */}
            <div style={{ padding: 12, background: 'rgba(171,71,188,0.08)', borderRadius: 8, border: '1px solid rgba(171,71,188,0.2)' }}>
              <div className="flex" style={{ gap: 6, alignItems: 'center', marginBottom: 8 }}>
                <Clock size={14} weight="duotone" style={{ color: '#ab47bc' }} />
                <span style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', fontWeight: 500 }}>Callback</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#ab47bc' }}>
                {juceMetrics.currentCallbackMs.toFixed(2)}ms
              </div>
              <div style={{ fontSize: 10, color: '#6b7280', marginTop: 6 }}>
                Budget: {juceMetrics.budgetMs.toFixed(2)}ms
              </div>
            </div>
          </div>

          {/* Per-Plugin CPU Breakdown */}
          {getTopConsumers(5).length > 0 && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(100,100,100,0.2)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 10, textTransform: 'uppercase' }}>
                Top Plugin CPU Usage
              </div>
              <div className="stack" style={{ gap: 6 }}>
                {getTopConsumers(5).map(({ pluginId, cpu }) => (
                  <div key={pluginId} className="flex-between" style={{ fontSize: 11 }}>
                    <span style={{ color: '#d1d5db' }}>Plugin {pluginId}</span>
                    <div className="flex" style={{ gap: 8, alignItems: 'center' }}>
                      <div style={{ width: 80, height: 4, background: 'rgba(100,100,100,0.2)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: `${Math.min(100, cpu)}%`,
                          background: cpu > 30 ? '#ffa726' : '#64b5f6',
                          transition: 'width 150ms ease'
                        }} />
                      </div>
                      <span style={{ width: 45, textAlign: 'right', fontFamily: 'monospace', color: cpu > 30 ? '#ffa726' : '#6b7280' }}>
                        {cpu.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Core Grid - Status Overview + Management */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {configQuery.data.cores.map((core) => {
          const util = coreUtilization.get(core.core_id)?.utilization ?? 0
          const isAlert = alertCores.has(core.core_id)
          const bgColor = getCoreBgColor(core.core_id, isAlert)
          const utilColor = getUtilizationColor(util)

          return (
            <div
              key={core.core_id}
              className={`list-item ${editingCoreId === core.core_id ? 'active' : ''}`}
              style={{
                cursor: editingCoreId !== core.core_id ? 'pointer' : 'default',
                padding: 14,
                backgroundColor: bgColor,
                border: isAlert ? '2px solid #ff5252' : '1px solid transparent',
                transition: 'all 200ms ease',
              }}
            >
              {editingCoreId === core.core_id ? (
                // Edit Mode
                <div className="stack" style={{ gap: 8 }}>
                  <div className="flex-between">
                    <strong>Core {core.core_id}</strong>
                    <div className="flex" style={{ gap: 4 }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={handleSaveCore}
                        title="Save changes"
                      >
                        <Check size={14} weight="bold" />
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={handleCancel}
                        title="Cancel"
                      >
                        <X size={14} weight="bold" />
                      </button>
                    </div>
                  </div>

                  {/* Service Selection */}
                  <div className="stack" style={{ gap: 6 }}>
                    <label className="stat-label">Services ({editingServices.length} assigned)</label>
                    <div className="stack" style={{ gap: 10 }}>
                      {Object.entries(groupedActivities).map(([category, activities]) => (
                        <div key={category} style={{ gap: 4 }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', marginBottom: 4 }}>
                            {category}
                          </div>
                          <div className="stack" style={{ gap: 4, marginLeft: 8 }}>
                            {activities.map((activity) => (
                              <div key={activity.id} style={{ fontSize: 11 }}>
                                <label className="flex" style={{ gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                                  <input
                                    type="checkbox"
                                    checked={editingServices.includes(activity.label)}
                                    onChange={() => toggleService(activity.label)}
                                    style={{ cursor: 'pointer' }}
                                  />
                                  <div className="stack" style={{ gap: 1 }}>
                                    <span>{activity.label}</span>
                                    <span style={{ fontSize: 9, color: '#6b7280' }}>{activity.description}</span>
                                  </div>
                                </label>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Priority */}
                  <div>
                    <label className="stat-label" style={{ marginBottom: 4 }}>Priority</label>
                    <select
                      className="input"
                      value={editingPriority}
                      onChange={(e) => setEditingPriority(e.target.value as any)}
                      style={{ fontSize: 12 }}
                    >
                      <option value="normal">normal</option>
                      <option value="SCHED_RR">SCHED_RR</option>
                      <option value="SCHED_FIFO">SCHED_FIFO</option>
                    </select>
                  </div>

                  {/* Isolation */}
                  <label className="flex" style={{ gap: 6, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={editingIsolated}
                      onChange={(e) => setEditingIsolated(e.target.checked)}
                    />
                    <span style={{ fontSize: 12 }}>Isolated (no other tasks)</span>
                  </label>
                </div>
              ) : (
                // View Mode with Status
                <div className="stack" style={{ gap: 10 }}>
                  {/* Header with Edit */}
                  <div className="flex-between">
                    <strong>Core {core.core_id}</strong>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleEditCore(core.core_id)}
                      title="Edit"
                    >
                      <PencilSimple size={14} weight="duotone" />
                    </button>
                  </div>

                  {/* Utilization Bar */}
                  <div>
                    <div className="flex-between" style={{ marginBottom: 4, fontSize: 11 }}>
                      <span className="muted">Utilization</span>
                      <span style={{ fontWeight: 700, color: utilColor }}>{util.toFixed(1)}%</span>
                    </div>
                    <div
                      style={{
                        height: 6,
                        backgroundColor: 'rgba(100, 100, 100, 0.2)',
                        borderRadius: 3,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${util}%`,
                          backgroundColor: utilColor,
                          transition: 'width 100ms ease, background-color 200ms ease',
                        }}
                      />
                    </div>
                  </div>

                  {/* Assignments */}
                  <div>
                    <div style={{ fontSize: 10, marginBottom: 6, color: '#000', fontWeight: 500 }}>Assignments ({core.services.length})</div>
                    <div className="stack" style={{ gap: 4 }}>
                      {core.services.length > 0 ? (
                        core.services.map((service) => {
                          // Find the activity details for this service
                          const activity = AVAILABLE_ACTIVITIES.find(a => a.label === service)
                          return (
                            <div
                              key={service}
                              className="pill"
                              style={{ 
                                fontSize: 10, 
                                alignSelf: 'flex-start', 
                                padding: '4px 8px', 
                                background: activity?.category === 'JUCE' ? 'rgba(100,181,246,0.2)'
                                  : activity?.category === 'Plugins' ? 'rgba(171,71,188,0.2)'
                                  : 'rgba(129,199,132,0.2)',
                                border: activity?.category === 'JUCE' ? '1px solid #64b5f6'
                                  : activity?.category === 'Plugins' ? '1px solid #ab47bc'
                                  : '1px solid #81c784',
                              }}
                              title={activity?.description || service}
                            >
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <span style={{ fontWeight: 500 }}>{service}</span>
                                {activity && (
                                  <span style={{ fontSize: 8, color: '#6b7280', fontWeight: 400 }}>
                                    {activity.description.split(',')[0]}
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })
                      ) : (
                        <span className="muted" style={{ fontSize: 10 }}>Idle - no services assigned</span>
                      )}
                    </div>
                  </div>

                  {/* Priority & Isolation */}
                  <div className="flex-between" style={{ fontSize: 10, paddingTop: 4, borderTop: '1px solid rgba(100,100,100,0.2)' }}>
                    <span className="muted">{core.priority}</span>
                    {core.isolated && <span className="pill muted" style={{ fontSize: 9, padding: '2px 6px' }}>isolated</span>}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Alert Summary */}
      {alertCores.size > 0 && (
        <div className="flex" style={{ gap: 12, padding: 12, backgroundColor: 'rgba(255, 82, 82, 0.1)', borderRadius: 8, border: '1px solid #ff5252' }}>
          <WarningCircle size={18} weight="duotone" style={{ color: '#ff5252', flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 12 }}>
            <strong style={{ color: '#ff5252' }}>High CPU Alert</strong>
            <p style={{ margin: '4px 0 0 0' }}>
              Core{alertCores.size > 1 ? 's' : ''} {Array.from(alertCores).join(', ')} sustained &gt;90% utilization for 5+ seconds. Consider redistributing workload or adding resources.
            </p>
          </div>
        </div>
      )}

      {/* Validation / Alerts */}
      {editingCoreId === null && configQuery.data.cores.some((c) => c.isolated && c.services.length === 0) && (
        <div className="flex" style={{ gap: 8, padding: 10, backgroundColor: 'rgba(255,193,7,0.1)', borderRadius: 8 }}>
          <WarningCircle size={16} weight="duotone" style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span style={{ fontSize: 12 }}>
            Some isolated cores have no services assigned. Consider reassigning for optimal resource use.
          </span>
        </div>
      )}

      {/* Live Configuration Verification */}
      <div style={{ padding: 14, backgroundColor: '#0a0a0a', borderRadius: 8, border: '1px solid #222222' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h4 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600 }}>Verify Live CPU Core Pinning</h4>
            <p style={{ margin: 0, fontSize: 11, color: '#9ca3af' }}>Check current system configuration against applied settings</p>
          </div>
          <button
            className="btn btn-secondary"
            onClick={handleVerifyLiveConfig}
            disabled={isVerifying}
            style={{ whiteSpace: 'nowrap' }}
          >
            {isVerifying ? (
              <>
                <SpinnerGap size={14} weight="duotone" style={{ animation: 'spin 1s linear infinite', marginRight: 6 }} />
                Verifying...
              </>
            ) : (
              <>
                <Lightning size={14} weight="duotone" style={{ marginRight: 6 }} />
                Verify Live Config
              </>
            )}
          </button>
        </div>

        {/* Verification Results */}
        {verificationResult && (
          <div style={{ marginTop: 12, padding: 12, backgroundColor: 'rgba(100,100,100,0.1)', borderRadius: 6, border: '1px solid rgba(100,100,100,0.2)' }}>
            {verificationResult.status === 'success' ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <CheckCircle size={18} weight="duotone" style={{ color: '#4caf50', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#4caf50' }}>Configuration Verified</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, lineHeight: 1.5 }}>
                    Live CPU pinning matches configured settings. All assignments are active and correct.
                  </div>
                  {verificationResult.details && (
                    <div style={{ fontSize: 10, marginTop: 8, color: '#999', maxHeight: 120, overflow: 'auto' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
                        {Object.entries(verificationResult.details).map(([core, status]: any) => (
                          <div key={core} style={{ fontSize: 9, padding: 6, background: 'rgba(76,175,80,0.1)', borderRadius: 3, border: '1px solid rgba(76,175,80,0.2)' }}>
                            <strong>{core}</strong>
                            <div style={{ marginTop: 2, color: '#9ca3af' }}>
                              {Array.isArray(status.services) ? status.services.join(', ') : 'Idle'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <XCircle size={18} weight="duotone" style={{ color: '#ef5350', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#ef5350' }}>Configuration Mismatch</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                    {verificationResult.message || 'Live configuration does not match configured settings.'}
                  </div>
                  {verificationResult.mismatches && (
                    <div style={{ fontSize: 10, marginTop: 8, color: '#ffa726', maxHeight: 120, overflow: 'auto' }}>
                      <strong>Mismatches:</strong>
                      <ul style={{ margin: '4px 0 0 20px', padding: 0 }}>
                        {verificationResult.mismatches.map((mismatch: string, idx: number) => (
                          <li key={idx} style={{ fontSize: 9, marginTop: 2 }}>{mismatch}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div style={{ fontSize: 9, color: '#6b7280', marginTop: 8 }}>
              Last verified: {verificationResult.timestamp ? new Date(verificationResult.timestamp).toLocaleTimeString() : 'Unknown'}
            </div>
          </div>
        )}
      </div>

      {/* Apply Button */}
      {hasChanges && (
        <div className="flex" style={{ gap: 8 }}>
          <button
            className="btn btn-primary"
            onClick={handleApplyChanges}
            disabled={applyMutation.isPending}
          >
            {applyMutation.isPending ? <SpinnerGap className="spin" size={14} weight="duotone" /> : 'Apply Changes'}
          </button>
          <button className="btn btn-ghost" onClick={() => setHasChanges(false)}>
            Discard
          </button>
        </div>
      )}
    </div>
  )
}
