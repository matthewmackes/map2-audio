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

import { useState, useMemo, type CSSProperties } from 'react'
import {
  Activity,
  Branch,
  ChartColumn,
  CheckmarkFilled,
  DataBase,
  Document,
  ErrorFilled,
  Flow,
  Idea,
  Network_3 as NetworkThree,
  Renew,
  Settings,
  Time,
  UpdateNow,
  View,
  WarningAlt,
  WarningAltFilled,
  type CarbonIconType,
} from '@carbon/icons-react'
import { useQuery } from '@tanstack/react-query'
import { Button, Checkbox, InlineNotification, Layer, Tag } from '@carbon/react'
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
import './ClusterDashboardPage.css'

interface DashboardTab {
  id: string
  label: string
  icon: CarbonIconType
  description: string
  category: 'primary' | 'network' | 'operations' | 'advanced'
}

const DASHBOARD_TABS: DashboardTab[] = [
  // Primary Monitoring
  {
    id: 'overview',
    label: 'Overview',
    icon: View,
    description: 'Real-time cluster health, topology, and status at a glance',
    category: 'primary'
  },
  {
    id: 'multi-node',
    label: 'Multi-Node',
    icon: DataBase,
    description: 'Comprehensive per-node monitoring: JUCE engine, cluster services, AVB status',
    category: 'primary'
  },
  {
    id: 'services',
    label: 'Services',
    icon: Activity,
    description: 'Detailed health matrix for all cluster services (mDNS, RAFT, Health Monitor, etc.)',
    category: 'primary'
  },

  // Network Audio
  {
    id: 'avb-network',
    label: 'AVB Network',
    icon: NetworkThree,
    description: 'IEEE 1722/802.1 AVB/TSN network audio: streams, gPTP sync, AVDECC entities',
    category: 'network'
  },
  {
    id: 'flows',
    label: 'Audio Flows',
    icon: Flow,
    description: 'Audio signal routing and flow distribution across cluster nodes',
    category: 'network'
  },

  // Operations & Analytics
  {
    id: 'metrics',
    label: 'Metrics',
    icon: ChartColumn,
    description: 'Prometheus metrics dashboard: CPU, memory, latency, throughput',
    category: 'operations'
  },
  {
    id: 'events',
    label: 'Events',
    icon: Branch,
    description: 'Live event stream: state changes, errors, deployments, discoveries',
    category: 'operations'
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: Document,
    description: 'Export analysis reports and performance summaries',
    category: 'operations'
  },
  {
    id: 'updates',
    label: 'Updates',
    icon: UpdateNow,
    description: 'System and cluster-wide software updates and version management',
    category: 'operations'
  },

  // Advanced
  {
    id: 'education',
    label: 'Learn',
    icon: Idea,
    description: 'Educational content: how clusters work, AVB/TSN fundamentals, RAFT consensus',
    category: 'advanced'
  },
  {
    id: 'advanced-ops',
    label: 'Advanced Ops',
    icon: Settings,
    description: 'Reset cloned node identity to default and rejoin cluster safely',
    category: 'advanced'
  },
]

const DASHBOARD_CATEGORY_LABELS: Record<DashboardTab['category'], string> = {
  primary: 'Primary monitoring',
  network: 'Network audio',
  operations: 'Operations and analytics',
  advanced: 'Advanced',
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
    }, {} as Record<DashboardTab['category'], DashboardTab[]>)
  }, [])

  const getHealthStatusIcon = (status: ClusterHealth['overall']) => {
    switch (status) {
      case 'healthy':
        return <CheckmarkFilled size={20} className="cluster-dashboard-health-icon is-healthy" />
      case 'degraded':
        return <WarningAltFilled size={20} className="cluster-dashboard-health-icon is-degraded" />
      case 'critical':
        return <ErrorFilled size={20} className="cluster-dashboard-health-icon is-critical" />
      default:
        return <Time size={20} className="cluster-dashboard-health-icon is-unknown" />
    }
  }

  const getHealthStatusColor = (status: ClusterHealth['overall']) => {
    switch (status) {
      case 'healthy': return 'var(--cds-support-success)'
      case 'degraded': return 'var(--cds-support-warning)'
      case 'critical': return 'var(--cds-support-error)'
      default: return 'var(--cds-text-secondary)'
    }
  }

  const healthStatusTagType = (status: ClusterHealth['overall']): 'green' | 'warm-gray' | 'red' => {
    switch (status) {
      case 'healthy':
        return 'green'
      case 'critical':
        return 'red'
      default:
        return 'warm-gray'
    }
  }

  return (
    <div className="cluster-dashboard-page">
      <Layer className="cluster-dashboard-hero">
        <div className="cluster-dashboard-hero-top">
          <div className="cluster-dashboard-hero-copy">
            <h1 className="cluster-dashboard-title">MAP2 audio platform</h1>
            <p className="cluster-dashboard-subtitle">Unified cluster management and network audio monitoring</p>
          </div>

          <div className="cluster-dashboard-actions">
            <Button
              kind="ghost"
              size="sm"
              renderIcon={Renew}
              className="cluster-dashboard-action-btn"
              onClick={() => {
                const event = new CustomEvent('refreshClusterData')
                window.dispatchEvent(event)
              }}
            >
              Refresh
            </Button>
            <Button kind="ghost" size="sm" renderIcon={Idea} className="cluster-dashboard-action-btn" onClick={() => setShowWizard(true)}>
              Wizard
            </Button>
            <Button
              kind="ghost"
              size="sm"
              renderIcon={ChartColumn}
              className="cluster-dashboard-action-btn"
              onClick={() => setShowProgress(true)}
            >
              Progress
            </Button>
            <div className="cluster-dashboard-sim-mode">
              <Checkbox
                id="cluster-simulation-mode"
                labelText="Simulation mode"
                checked={simulationMode}
                onChange={(event) => setSimulationMode(event.currentTarget.checked)}
              />
            </div>
          </div>
        </div>

        {clusterStatus && (
          <div className="cluster-dashboard-health-grid">
            <Layer
              className={`cluster-dashboard-health-card cluster-dashboard-health-card--primary cluster-dashboard-health-card--${clusterHealth.overall}`}
              style={{ '--health-color': getHealthStatusColor(clusterHealth.overall) } as CSSProperties}
            >
              {getHealthStatusIcon(clusterHealth.overall)}
              <div className="cluster-dashboard-health-primary-copy">
                <div className="cluster-dashboard-health-title">{clusterStatus.cluster_name || 'Unnamed cluster'}</div>
                <div className="cluster-dashboard-health-status">
                  <span>Status</span>
                  <Tag type={healthStatusTagType(clusterHealth.overall)} size="sm">
                    {clusterHealth.overall}
                  </Tag>
                </div>
              </div>
            </Layer>

            <Layer className="cluster-dashboard-health-card cluster-dashboard-health-card--metric">
              <p className="cluster-dashboard-metric-label">Cluster nodes</p>
              <div className="cluster-dashboard-metric-value">
                <span className="cluster-dashboard-metric-primary">{clusterStatus.online_count}</span>
                <span className="cluster-dashboard-metric-secondary">/ {clusterStatus.total_count} online</span>
              </div>
            </Layer>

            <Layer className="cluster-dashboard-health-card cluster-dashboard-health-card--metric">
              <p className="cluster-dashboard-metric-label">Health score</p>
              <div className="cluster-dashboard-metric-value">
                <span className="cluster-dashboard-metric-primary">
                  {clusterStatus.aggregate_health_score?.toFixed(0) || 0}
                </span>
                <span className="cluster-dashboard-metric-secondary">%</span>
              </div>
            </Layer>

            <Layer className="cluster-dashboard-health-card cluster-dashboard-health-card--metric">
              <p className="cluster-dashboard-metric-label">Active issues</p>
              <div className="cluster-dashboard-metric-value">
                <span className="cluster-dashboard-metric-primary">{clusterHealth.issues.length}</span>
                <span className="cluster-dashboard-metric-secondary">
                  {clusterHealth.issues.filter((issue) => issue.severity === 'critical').length} critical
                </span>
              </div>
            </Layer>
          </div>
        )}

        {clusterHealth.issues.length > 0 && (
          <Layer className="cluster-dashboard-issues-panel">
            <div className="cluster-dashboard-issues-header">
              <WarningAlt size={20} aria-hidden />
              <h3>Active issues requiring attention</h3>
            </div>
            <div className="cluster-dashboard-issues-list">
              {clusterHealth.issues.slice(0, 5).map((issue, idx) => (
                <div key={idx} className={`cluster-dashboard-issue-row cluster-dashboard-issue-row--${issue.severity}`}>
                  <div className="cluster-dashboard-issue-main">
                    <Tag type={issue.severity === 'critical' ? 'red' : 'warm-gray'} size="sm">
                      {issue.severity}
                    </Tag>
                    <Tag type="cool-gray" size="sm">
                      {issue.category}
                    </Tag>
                    <span className="cluster-dashboard-issue-message">{issue.message}</span>
                  </div>
                  <span className="cluster-dashboard-issue-time">{issue.timestamp.toLocaleTimeString()}</span>
                </div>
              ))}
            </div>

            {clusterHealth.recommendations.length > 0 && (
              <div className="cluster-dashboard-recommendations">
                <p className="cluster-dashboard-recommendations-title">Recommendations</p>
                <ul className="cluster-dashboard-recommendations-list">
                  {clusterHealth.recommendations.map((recommendation, idx) => (
                    <li key={idx}>{recommendation}</li>
                  ))}
                </ul>
              </div>
            )}
          </Layer>
        )}
      </Layer>

      <div className="cluster-dashboard-tab-sections">
        {(Object.entries(tabsByCategory) as Array<[DashboardTab['category'], DashboardTab[]]>).map(([category, tabs]) => (
          <section key={category} className="cluster-dashboard-tab-section">
            <p className="cluster-dashboard-tab-category">{DASHBOARD_CATEGORY_LABELS[category]}</p>
            <div className="cluster-dashboard-tab-list">
              {tabs.map((tab) => {
                const TabIcon = tab.icon
                return (
                  <button
                    key={tab.id}
                    type="button"
                    className={`cluster-dashboard-tab${activeTab === tab.id ? ' is-active' : ''}`}
                    onClick={() => setActiveTab(tab.id)}
                    title={tab.description}
                  >
                    <TabIcon size={16} aria-hidden />
                    <span>{tab.label}</span>
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      {activeTabInfo && (
        <Layer className="cluster-dashboard-tab-description">
          <span>{activeTabInfo.description}</span>
        </Layer>
      )}

      {showWizard && (
        <div className="cluster-dashboard-modal-backdrop">
          <OnboardingWizard onComplete={() => setShowWizard(false)} />
        </div>
      )}

      {showProgress && (
        <div className="cluster-dashboard-modal-backdrop">
          <div className="cluster-dashboard-progress-modal">
            <Button
              kind="danger--ghost"
              size="sm"
              renderIcon={WarningAlt}
              className="cluster-dashboard-close-progress"
              onClick={() => setShowProgress(false)}
            >
              Close
            </Button>
            <UpdateProgressViewer />
          </div>
        </div>
      )}

      <div className="dashboard-content cluster-dashboard-content">
        {isAllInOne && activeTab !== 'overview' && activeTab !== 'education' && (
          <InlineNotification
            lowContrast
            kind="warning"
            hideCloseButton
            className="cluster-dashboard-inline-warning"
            title="Running in all-in-one mode."
            subtitle="Cluster features are limited when all services run on one node. Deploy multiple nodes to unlock distributed routing, RAFT consensus, and load balancing views."
          />
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
