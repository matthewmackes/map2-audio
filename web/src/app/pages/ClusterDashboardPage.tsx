import { useState, useMemo } from 'react'
import { Settings, Zap, BarChart3, Eye, Activity, GitBranch, FileText, RefreshCw, ShieldCheck } from 'lucide-react'
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

interface DashboardTab {
  id: string
  label: string
  icon: React.ReactNode
  description: string
}

const DASHBOARD_TABS: DashboardTab[] = [
  { id: 'overview', label: 'Overview', icon: <Eye size={18} />, description: 'Cluster status at a glance' },
  { id: 'education', label: 'Learn', icon: <Zap size={18} />, description: 'How clusters work' },
  { id: 'services', label: 'Services', icon: <Activity size={18} />, description: 'All services health' },
  { id: 'metrics', label: 'Metrics', icon: <BarChart3 size={18} />, description: 'Prometheus dashboard' },
  { id: 'events', label: 'Events', icon: <GitBranch size={18} />, description: 'Live event stream' },
  { id: 'flows', label: 'Flows', icon: <GitBranch size={18} />, description: 'Flow distribution' },
  { id: 'reports', label: 'Reports', icon: <FileText size={18} />, description: 'Export & analysis' },
  { id: 'updates', label: 'Updates', icon: <ShieldCheck size={18} />, description: 'System and cluster updates' },
]

export function ClusterDashboardPage() {
  const [activeTab, setActiveTab] = useState('overview')
  const [simulationMode, setSimulationMode] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const [showProgress, setShowProgress] = useState(false)

  // Fetch deployment mode to show appropriate message
  const { data: deploymentMode } = useQuery({
    queryKey: ['deployment', 'mode'],
    queryFn: async () => {
      const res = await fetch('/api/deployment/mode')
      if (!res.ok) throw new Error('Failed to fetch deployment mode')
      return res.json()
    },
    refetchInterval: 7000,  // 7s polling - non-disruptive
    staleTime: 5000,
  })

  const isAllInOne = deploymentMode?.mode === 'ALL-IN-ONE'

  // Fetch cluster status for the banner
  const { data: clusterStatus } = useQuery({
    queryKey: ['cluster', 'status'],
    queryFn: async () => {
      const res = await fetch('/api/cluster/status')
      if (!res.ok) throw new Error('Failed to fetch cluster status')
      return res.json()
    },
    refetchInterval: 7000,  // 7s polling - non-disruptive
    staleTime: 5000,
  })

  const activeTabInfo = useMemo(
    () => DASHBOARD_TABS.find(t => t.id === activeTab),
    [activeTab]
  )

  return (
    <div className="cluster-dashboard-page" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader
        title="Cluster Management Dashboard"
        subtitle="Comprehensive monitoring, management, and analytics for your distributed audio cluster"
      />

      {/* Cluster Status Banner */}
      {clusterStatus && (
        <div
          className="cluster-status-banner"
          style={{
            background: 'linear-gradient(155deg, #2d2d2d, #333333)',
            border: '2px solid #00d4ff',
            borderRadius: 12,
            padding: '18px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                backgroundColor: clusterStatus.online_count === 0 ? '#ff3333' : '#00ff41',
              }}
            />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {clusterStatus.cluster_name || 'Unnamed Cluster'}
              </div>
              <div style={{ fontSize: 12, color: '#a0a0a0', marginTop: 4 }}>
                {clusterStatus.online_count}/{clusterStatus.total_count} nodes online • Health:{' '}
                {clusterStatus.aggregate_health_score?.toFixed(0) || 0}%
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => {
                const event = new CustomEvent('refreshClusterData')
                window.dispatchEvent(event)
              }}
              className="btn btn-sm"
              title="Refresh cluster data"
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={() => setShowWizard(true)}
              className="btn btn-sm"
              title="Run onboarding wizard"
            >
              🧙 Wizard
            </button>
            <button
              onClick={() => setShowProgress(true)}
              className="btn btn-sm"
              title="View update progress"
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
                border: '1px solid #444',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
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
      )}

      {/* Tab Navigation */}
      <div
        className="dashboard-tabs-nav"
        style={{
          display: 'flex',
          gap: 12,
          borderBottom: '1px solid #333',
          overflowX: 'auto',
          paddingBottom: 12,
        }}
      >
        {DASHBOARD_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`dashboard-tab ${activeTab === tab.id ? 'active' : ''}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 16px',
              background: activeTab === tab.id ? 'rgba(0, 212, 255, 0.1)' : 'transparent',
              border: `2px solid ${activeTab === tab.id ? '#00d4ff' : 'transparent'}`,
              borderRadius: 6,
              color: activeTab === tab.id ? '#00d4ff' : '#a0a0a0',
              fontSize: 13,
              fontWeight: activeTab === tab.id ? 600 : 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
            }}
            title={tab.description}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Modals */}
      {showWizard && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
            overflowY: 'auto',
          }}
        >
          <OnboardingWizard onComplete={() => setShowWizard(false)} />
        </div>
      )}

      {showProgress && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
            overflowY: 'auto',
          }}
        >
          <div style={{ width: '100%', maxWidth: 1200, position: 'relative' }}>
            <button
              onClick={() => setShowProgress(false)}
              className="btn btn-sm"
              style={{ position: 'absolute', top: 0, right: 0 }}
            >
              ✕ Close
            </button>
            <UpdateProgressViewer />
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="dashboard-content" style={{ flex: 1 }}>
        {isAllInOne && activeTab !== 'overview' && (
          <div
            className="dashboard-warning"
            style={{
              background: 'rgba(255, 170, 0, 0.1)',
              border: '2px solid #ffaa00',
              borderRadius: 8,
              padding: '16px 20px',
              marginBottom: 20,
              fontSize: 13,
              color: '#ffaa00',
            }}
          >
            <strong>ℹ️ Running in ALL-IN-ONE mode:</strong> Cluster features are limited when all services run on a single
            node. Deploy multiple nodes to see full cluster capabilities.
          </div>
        )}

        {activeTab === 'overview' && <ClusterOverviewTabEnhanced simulationMode={simulationMode} />}
        {activeTab === 'education' && <ClusterEducationTab />}
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
