/**
 * MAP2 Audio Platform - Unified Cluster Management Dashboard
 *
 * A comprehensive, professional-grade monitoring and management interface that provides:
 * - Real-time cluster health and topology visualization
 * - Multi-node performance comparison and service monitoring
 * - AVB/TSN network audio stream management
 * - Current state vs. desired state analysis
 * - Comprehensive error detection and alerting
 * - Educational content for understanding distributed audio systems
 *
 * **WHO**: Studio engineers, cluster administrators, system integrators, audio network specialists
 * **WHAT**: Complete visibility and control over distributed MAP2 audio processing clusters
 * **WHERE**: Production studios, live venues, broadcast facilities, distributed processing installations
 * **WHEN**: 24/7 monitoring, performance optimization, troubleshooting, capacity planning
 */

import { useState, useMemo } from 'react'
import {
  GearSix, Lightning, ChartBar, Eye, Pulse, GitBranch, FileText,
  ArrowsClockwise, ShieldCheck, Broadcast, DesktopTower, Network,
  Warning, CheckCircle, XCircle, Clock
} from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '../components/PageHeader'
import { ClusterOverviewTabEnhanced } from '../components/ClusterDashboard/ClusterOverviewTabEnhanced'
import { ClusterEducationTab } from '../components/ClusterDashboard/ClusterEducationTab'
import { ServicesHealthTab } from '../components/ClusterDashboard/ServicesHealthTab'
import { MetricsDashboardTab } from '../components/ClusterDashboard/MetricsDashboardTab'
import { LiveEventsTab } from '../components/ClusterDashboard/LiveEventsTab'
import { FlowManagementTab } from '../components/ClusterDashboard/FlowManagementTab'
import { ReportingTab } from '../components/ClusterDashboard/ReportingTab'
import { UpdatesTab } from '../components/ClusterDashboard/UpdatesTab'
import { OnboardingWizard } from '../components/OnboardingWizard'
import { UpdateProgressViewer } from '../components/UpdateProgressViewer'
import { MultiNodeMonitoringTab } from '../components/ClusterDashboard/MultiNodeMonitoringTab'
import { AVBNetworkTab } from '../components/ClusterDashboard/AVBNetworkTab'
import { ClusterAdvancedOperationsTab } from '../components/ClusterDashboard/ClusterAdvancedOperationsTab'

interface DashboardTab {
  id: string
  label: string
  icon: React.ReactNode
  description: string
  category: 'primary' | 'network' | 'operations' | 'advanced'
}

const DASHBOARD_TABS: DashboardTab[] = [
  // Primary Monitoring
  {
    id: 'overview',
    label: 'Overview',
    icon: <Eye size={18} weight="duotone" />,
    description: 'Real-time cluster health, topology, and status at a glance',
    category: 'primary'
  },
  {
    id: 'multi-node',
    label: 'Multi-Node',
    icon: <DesktopTower size={18} weight="duotone" />,
    description: 'Comprehensive per-node monitoring: JUCE engine, cluster services, AVB status',
    category: 'primary'
  },
  {
    id: 'services',
    label: 'Services',
    icon: <Pulse size={18} weight="duotone" />,
    description: 'Detailed health matrix for all cluster services (mDNS, RAFT, Health Monitor, etc.)',
    category: 'primary'
  },

  // Network Audio
  {
    id: 'avb-network',
    label: 'AVB Network',
    icon: <Broadcast size={18} weight="duotone" />,
    description: 'IEEE 1722/802.1 AVB/TSN network audio: streams, gPTP sync, AVDECC entities',
    category: 'network'
  },
  {
    id: 'flows',
    label: 'Audio Flows',
    icon: <Network size={18} weight="duotone" />,
    description: 'Audio signal routing and flow distribution across cluster nodes',
    category: 'network'
  },

  // Operations & Analytics
  {
    id: 'metrics',
    label: 'Metrics',
    icon: <ChartBar size={18} weight="duotone" />,
    description: 'Prometheus metrics dashboard: CPU, memory, latency, throughput',
    category: 'operations'
  },
  {
    id: 'events',
    label: 'Events',
    icon: <GitBranch size={18} weight="duotone" />,
    description: 'Live event stream: state changes, errors, deployments, discoveries',
    category: 'operations'
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: <FileText size={18} weight="duotone" />,
    description: 'Export analysis reports and performance summaries',
    category: 'operations'
  },
  {
    id: 'updates',
    label: 'Updates',
    icon: <ShieldCheck size={18} weight="duotone" />,
    description: 'System and cluster-wide software updates and version management',
    category: 'operations'
  },

  // Advanced
  {
    id: 'education',
    label: 'Learn',
    icon: <Lightning size={18} weight="duotone" />,
    description: 'Educational content: how clusters work, AVB/TSN fundamentals, RAFT consensus',
    category: 'advanced'
  },
  {
    id: 'advanced-ops',
    label: 'Advanced Ops',
    icon: <GearSix size={18} weight="duotone" />,
    description: 'Reset cloned node identity to default and rejoin cluster safely',
    category: 'advanced'
  },
]

// State comparison types
interface StateComparison {
  current: string | number
  desired: string | number
  status: 'match' | 'diverged' | 'unknown'
  details?: string
}

interface ClusterHealth {
  overall: 'healthy' | 'degraded' | 'critical' | 'unknown'
  issues: Array<{
    severity: 'critical' | 'warning' | 'info'
    category: 'audio' | 'network' | 'cluster' | 'system'
    message: string
    affectedNodes?: string[]
    timestamp: Date
  }>
  recommendations: string[]
}

export function ClusterDashboardPage() {
  const [activeTab, setActiveTab] = useState('overview')
  const [simulationMode, setSimulationMode] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const [showProgress, setShowProgress] = useState(false)
  const [showStateComparison, setShowStateComparison] = useState(true)

  // Fetch deployment mode
  const { data: deploymentMode } = useQuery({
    queryKey: ['deployment', 'mode'],
    queryFn: async () => {
      const res = await fetch('/api/deployment/mode')
      if (!res.ok) throw new Error('Failed to fetch deployment mode')
      return res.json()
    },
    refetchInterval: 7000,
    staleTime: 5000,
  })

  const isAllInOne = deploymentMode?.mode === 'ALL-IN-ONE'

  // Fetch cluster status
  const { data: clusterStatus } = useQuery({
    queryKey: ['cluster', 'status'],
    queryFn: async () => {
      const res = await fetch('/api/cluster/status')
      if (!res.ok) throw new Error('Failed to fetch cluster status')
      return res.json()
    },
    refetchInterval: 7000,
    staleTime: 5000,
  })

  // Calculate cluster health
  const clusterHealth = useMemo((): ClusterHealth => {
    const issues: ClusterHealth['issues'] = []
    const recommendations: string[] = []

    if (!clusterStatus) {
      return {
        overall: 'unknown',
        issues: [],
        recommendations: ['Waiting for cluster data...']
      }
    }

    // Check for offline nodes
    if (clusterStatus.online_count < clusterStatus.total_count) {
      const offlineCount = clusterStatus.total_count - clusterStatus.online_count
      issues.push({
        severity: offlineCount > clusterStatus.total_count / 2 ? 'critical' : 'warning',
        category: 'cluster',
        message: `${offlineCount} node${offlineCount > 1 ? 's' : ''} offline`,
        timestamp: new Date()
      })
      recommendations.push('Check network connectivity and node health for offline nodes')
    }

    // Check overall health score
    const healthScore = clusterStatus.aggregate_health_score || 0
    if (healthScore < 50) {
      issues.push({
        severity: 'critical',
        category: 'system',
        message: `Cluster health critically low: ${healthScore.toFixed(0)}%`,
        timestamp: new Date()
      })
      recommendations.push('Investigate node health metrics and service status immediately')
    } else if (healthScore < 80) {
      issues.push({
        severity: 'warning',
        category: 'system',
        message: `Cluster health degraded: ${healthScore.toFixed(0)}%`,
        timestamp: new Date()
      })
      recommendations.push('Review individual node metrics and optimize resource usage')
    }

    // Determine overall status
    const hasCritical = issues.some(i => i.severity === 'critical')
    const hasWarning = issues.some(i => i.severity === 'warning')
    const overall = hasCritical ? 'critical' : hasWarning ? 'degraded' : 'healthy'

    if (overall === 'healthy') {
      recommendations.push('Cluster operating within normal parameters')
    }

    return { overall, issues, recommendations }
  }, [clusterStatus])

  const activeTabInfo = useMemo(
    () => DASHBOARD_TABS.find(t => t.id === activeTab),
    [activeTab]
  )

  // Group tabs by category for better organization
  const tabsByCategory = useMemo(() => {
    return DASHBOARD_TABS.reduce((acc, tab) => {
      if (!acc[tab.category]) acc[tab.category] = []
      acc[tab.category].push(tab)
      return acc
    }, {} as Record<string, DashboardTab[]>)
  }, [])

  const getHealthStatusIcon = (status: ClusterHealth['overall']) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle size={20} weight="fill" color="#10b981" />
      case 'degraded':
        return <Warning size={20} weight="fill" color="#f59e0b" />
      case 'critical':
        return <XCircle size={20} weight="fill" color="#ef4444" />
      default:
        return <Clock size={20} weight="fill" color="#6b7280" />
    }
  }

  const getHealthStatusColor = (status: ClusterHealth['overall']) => {
    switch (status) {
      case 'healthy': return '#10b981'
      case 'degraded': return '#f59e0b'
      case 'critical': return '#ef4444'
      default: return '#6b7280'
    }
  }

  return (
    <div className="cluster-dashboard-page" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Professional Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        borderRadius: 16,
        padding: '32px',
        border: '1px solid rgba(148, 163, 184, 0.1)',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <h1 style={{
              fontSize: 36,
              fontWeight: 700,
              color: '#fff',
              marginBottom: 8,
              letterSpacing: '-0.5px'
            }}>
              MAP2 Audio Platform
            </h1>
            <p style={{
              fontSize: 16,
              color: '#94a3b8',
              fontWeight: 500
            }}>
              Unified Cluster Management & Network Audio Monitoring
            </p>
          </div>

          {/* Quick Actions */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button
              onClick={() => {
                const event = new CustomEvent('refreshClusterData')
                window.dispatchEvent(event)
              }}
              className="btn btn-sm"
              style={{
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid #3b82f6',
                color: '#60a5fa',
                padding: '8px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
              title="Refresh all cluster data"
            >
              <ArrowsClockwise size={16} weight="bold" />
              Refresh
            </button>
            <button
              onClick={() => setShowWizard(true)}
              className="btn btn-sm"
              style={{
                background: 'rgba(139, 92, 246, 0.1)',
                border: '1px solid #8b5cf6',
                color: '#a78bfa',
                padding: '8px 16px'
              }}
              title="Run cluster onboarding wizard"
            >
              🧙 Wizard
            </button>
            <button
              onClick={() => setShowProgress(true)}
              className="btn btn-sm"
              style={{
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid #10b981',
                color: '#34d399',
                padding: '8px 16px'
              }}
              title="View update progress across cluster"
            >
              📊 Progress
            </button>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
                color: '#94a3b8'
              }}
            >
              <input
                type="checkbox"
                checked={simulationMode}
                onChange={e => setSimulationMode(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Simulation Mode
            </label>
          </div>
        </div>

        {/* Cluster Health Banner */}
        {clusterStatus && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: 16,
            marginTop: 24
          }}>
            {/* Cluster Name & Health */}
            <div style={{
              background: 'rgba(15, 23, 42, 0.6)',
              borderRadius: 12,
              padding: 20,
              border: `2px solid ${getHealthStatusColor(clusterHealth.overall)}`,
              display: 'flex',
              alignItems: 'center',
              gap: 16
            }}>
              {getHealthStatusIcon(clusterHealth.overall)}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 4 }}>
                  {clusterStatus.cluster_name || 'Unnamed Cluster'}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  Status: <span style={{
                    color: getHealthStatusColor(clusterHealth.overall),
                    fontWeight: 600,
                    textTransform: 'uppercase'
                  }}>
                    {clusterHealth.overall}
                  </span>
                </div>
              </div>
            </div>

            {/* Nodes Status */}
            <div style={{
              background: 'rgba(59, 130, 246, 0.1)',
              borderRadius: 12,
              padding: 20,
              border: '1px solid rgba(59, 130, 246, 0.3)'
            }}>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>Cluster Nodes</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 32, fontWeight: 700, color: '#60a5fa' }}>
                  {clusterStatus.online_count}
                </span>
                <span style={{ fontSize: 16, color: '#94a3b8' }}>
                  / {clusterStatus.total_count} online
                </span>
              </div>
            </div>

            {/* Health Score */}
            <div style={{
              background: 'rgba(16, 185, 129, 0.1)',
              borderRadius: 12,
              padding: 20,
              border: '1px solid rgba(16, 185, 129, 0.3)'
            }}>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>Health Score</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 32, fontWeight: 700, color: '#34d399' }}>
                  {clusterStatus.aggregate_health_score?.toFixed(0) || 0}
                </span>
                <span style={{ fontSize: 16, color: '#94a3b8' }}>%</span>
              </div>
            </div>

            {/* Active Issues */}
            <div style={{
              background: clusterHealth.issues.length > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
              borderRadius: 12,
              padding: 20,
              border: `1px solid ${clusterHealth.issues.length > 0 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`
            }}>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>Active Issues</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{
                  fontSize: 32,
                  fontWeight: 700,
                  color: clusterHealth.issues.length > 0 ? '#f87171' : '#34d399'
                }}>
                  {clusterHealth.issues.length}
                </span>
                <span style={{ fontSize: 16, color: '#94a3b8' }}>
                  {clusterHealth.issues.filter(i => i.severity === 'critical').length} critical
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Issues & Recommendations Panel */}
        {clusterHealth.issues.length > 0 && (
          <div style={{
            marginTop: 16,
            background: 'rgba(239, 68, 68, 0.05)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 12,
            padding: 20
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <Warning size={20} weight="fill" color="#ef4444" />
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: 0 }}>
                Active Issues Requiring Attention
              </h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {clusterHealth.issues.slice(0, 5).map((issue, idx) => (
                <div key={idx} style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  borderRadius: 8,
                  padding: 12,
                  borderLeft: `4px solid ${issue.severity === 'critical' ? '#ef4444' : '#f59e0b'}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <span style={{
                      fontSize: 11,
                      textTransform: 'uppercase',
                      fontWeight: 600,
                      color: issue.severity === 'critical' ? '#ef4444' : '#f59e0b',
                      marginRight: 12
                    }}>
                      {issue.severity}
                    </span>
                    <span style={{
                      fontSize: 11,
                      textTransform: 'uppercase',
                      fontWeight: 600,
                      color: '#6b7280',
                      marginRight: 12
                    }}>
                      {issue.category}
                    </span>
                    <span style={{ fontSize: 14, color: '#fff' }}>
                      {issue.message}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>
                    {issue.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>

            {/* Recommendations */}
            {clusterHealth.recommendations.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(148, 163, 184, 0.1)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>
                  📋 Recommendations:
                </div>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#cbd5e1' }}>
                  {clusterHealth.recommendations.map((rec, idx) => (
                    <li key={idx} style={{ marginBottom: 4 }}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tab Navigation - Categorized */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {Object.entries(tabsByCategory).map(([category, tabs]) => (
          <div key={category}>
            <div style={{
              fontSize: 11,
              textTransform: 'uppercase',
              fontWeight: 600,
              color: '#6b7280',
              marginBottom: 8,
              letterSpacing: '0.5px'
            }}>
              {category === 'primary' && '📊 Primary Monitoring'}
              {category === 'network' && '🌐 Network Audio'}
              {category === 'operations' && '⚙️ Operations & Analytics'}
              {category === 'advanced' && '🎓 Advanced'}
            </div>
            <div style={{
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap'
            }}>
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`dashboard-tab ${activeTab === tab.id ? 'active' : ''}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '12px 20px',
                    background: activeTab === tab.id
                      ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(37, 99, 235, 0.1) 100%)'
                      : 'rgba(30, 41, 59, 0.4)',
                    border: `2px solid ${activeTab === tab.id ? '#3b82f6' : 'rgba(148, 163, 184, 0.1)'}`,
                    borderRadius: 10,
                    color: activeTab === tab.id ? '#60a5fa' : '#94a3b8',
                    fontSize: 14,
                    fontWeight: activeTab === tab.id ? 600 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap',
                    boxShadow: activeTab === tab.id ? '0 4px 6px -1px rgba(59, 130, 246, 0.2)' : 'none'
                  }}
                  title={tab.description}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Active Tab Description */}
      {activeTabInfo && (
        <div style={{
          background: 'rgba(30, 41, 59, 0.4)',
          border: '1px solid rgba(148, 163, 184, 0.1)',
          borderRadius: 8,
          padding: '12px 16px',
          fontSize: 13,
          color: '#cbd5e1',
          fontStyle: 'italic'
        }}>
          💡 {activeTabInfo.description}
        </div>
      )}

      {/* Modals */}
      {showWizard && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 20,
          overflowY: 'auto',
          backdropFilter: 'blur(8px)'
        }}>
          <OnboardingWizard onComplete={() => setShowWizard(false)} />
        </div>
      )}

      {showProgress && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 20,
          overflowY: 'auto',
          backdropFilter: 'blur(8px)'
        }}>
          <div style={{ width: '100%', maxWidth: 1200, position: 'relative' }}>
            <button
              onClick={() => setShowProgress(false)}
              className="btn btn-sm"
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid #ef4444',
                color: '#fff'
              }}
            >
              ✕ Close
            </button>
            <UpdateProgressViewer />
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="dashboard-content" style={{ flex: 1 }}>
        {isAllInOne && activeTab !== 'overview' && activeTab !== 'education' && (
          <div style={{
            background: 'rgba(251, 191, 36, 0.1)',
            border: '2px solid #fbbf24',
            borderRadius: 12,
            padding: '16px 20px',
            marginBottom: 20,
            fontSize: 14,
            color: '#fbbf24',
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}>
            <Warning size={20} weight="fill" />
            <div>
              <strong>ℹ️ Running in ALL-IN-ONE mode:</strong> Cluster features are limited when all services run on a single
              node. Deploy multiple nodes to see full distributed cluster capabilities including network audio routing,
              RAFT consensus, and distributed load balancing.
            </div>
          </div>
        )}

        {activeTab === 'overview' && <ClusterOverviewTabEnhanced simulationMode={simulationMode} />}
        {activeTab === 'multi-node' && <MultiNodeMonitoringTab />}
        {activeTab === 'avb-network' && <AVBNetworkTab />}
        {activeTab === 'education' && <ClusterEducationTab />}
        {activeTab === 'advanced-ops' && <ClusterAdvancedOperationsTab />}
        {activeTab === 'services' && <ServicesHealthTab />}
        {activeTab === 'metrics' && <MetricsDashboardTab />}
        {activeTab === 'events' && <LiveEventsTab />}
        {activeTab === 'flows' && <FlowManagementTab />}
        {activeTab === 'reports' && <ReportingTab />}
        {activeTab === 'updates' && <UpdatesTab />}
      </div>
    </div>
  )
}
