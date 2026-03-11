/**
 * Host Machine Page - Hardware Information & Real-Time Health Monitoring
 * 
 * Displays comprehensive hardware information about the host system running MAP2,
 * with manufacturer branding, real-time health metrics, disk SMART data, and
 * audio optimization features specific to small form factor (SFF) hardware.
 */

import { useState } from 'react'
import {
  Box,
  Tab,
  Tabs,
  Paper,
  CircularProgress,
  Alert,
  Container,
  Grid,
  Button,
} from '@mui/material'
import { DesktopTower, Warning, Check, ArrowsClockwise } from '@phosphor-icons/react'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { useToasts } from '../components/Toasts'
import { useCluster } from '../contexts/ClusterContext'

// Host Machine hooks
import {
  useHostMachinePageData,
  useRefreshHostMachineData,
} from '../hooks/useHostMachine'

// Host Machine components
import BrandingPanel from '../components/HostMachine/BrandingPanel'
import MachineSpecsCard from '../components/HostMachine/MachineSpecsCard'
import HealthMonitor from '../components/HostMachine/HealthMonitor'
import DiskHealthCard from '../components/HostMachine/DiskHealthCard'
import AudioNodeFeatures from '../components/HostMachine/AudioNodeFeatures'
import PerformanceMetrics from '../components/HostMachine/PerformanceMetrics'


export function HostMachinePage() {
  const { pushToast } = useToasts()
  const { activeNodeId, nodes, localNodeId } = useCluster()
  const [tabIndex, setTabIndex] = useState(0)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const allNodesSelected = activeNodeId === 'all'
  const selectedNode = nodes.find((node) => node.nodeId === activeNodeId)
  const remoteSelected = Boolean(activeNodeId && activeNodeId !== 'all' && activeNodeId !== localNodeId)

  // Use combined hook for all Host Machine data
  const {
    hostInfo,
    diskHealth,
    healthOverview,
    branding,
    clusterComparison,
    isLoading,
    isError,
    error,
  } = useHostMachinePageData(activeNodeId, autoRefresh)

  // Get manual refresh function
  const refresh = useRefreshHostMachineData(activeNodeId)

  // Handle refresh with toast notification
  const handleManualRefresh = async () => {
    refresh()
    pushToast('Refreshing host machine data...', 'info')
  }

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    )
  }

  if (isError || (!allNodesSelected && (!hostInfo.data || !branding.data))) {
    return (
      <Box sx={{ p: 3 }}>
        <PageHeader
          title={allNodesSelected ? 'Host Machine · All Nodes' : 'Host Machine'}
          subtitle="Hardware Information & Monitoring"
          icon={<DesktopTower size={32} weight="duotone" style={{ color: '#ef4444' }} />}
        />
        <Alert severity="error" sx={{ mt: 3 }}>
          {error instanceof Error ? error.message : 'Failed to load host machine information. Please try again later.'}
        </Alert>
      </Box>
    )
  }

  if (allNodesSelected) {
    const comparisonRows = clusterComparison.data ?? []

    return (
      <Box className="host-machine-page" sx={{ pb: 4 }}>
        <Container maxWidth="lg">
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
            <PageHeader
              title="Host Machine · All Nodes"
              subtitle="Cluster-wide hardware comparison"
              icon={<DesktopTower size={32} weight="duotone" style={{ color: '#3b82f6' }} />}
            />
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<ArrowsClockwise size={16} weight="duotone" />}
                onClick={handleManualRefresh}
              >
                Refresh
              </Button>
            </Box>
          </Box>

          <Alert severity="info" sx={{ mb: 3 }}>
            Comparing hardware, disk, and health data across the cluster. Select a node for full detailed diagnostics.
          </Alert>

          <Paper sx={{ p: 0, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.9fr 0.8fr 1fr 1.1fr 0.8fr', bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
              {['Node', 'CPU', 'Memory', 'Disk', 'System', 'Audio Interfaces', 'Health'].map((heading) => (
                <Box key={heading} sx={{ p: 1.5, fontSize: 11, fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase' }}>
                  {heading}
                </Box>
              ))}
            </Box>

            {comparisonRows.map((row, index) => {
              const disk = row.diskHealth?.disks?.[0]
              const interfaces = row.hardware?.audio_interfaces ?? []
              const rowNode = nodes.find((node) => node.nodeId === row.nodeId)
              return (
                <Box
                  key={row.nodeId}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '1.2fr 1fr 0.9fr 0.8fr 1fr 1.1fr 0.8fr',
                    borderBottom: index === comparisonRows.length - 1 ? 'none' : '1px solid',
                    borderColor: 'divider',
                    bgcolor: rowNode?.isOnline === false ? 'action.hover' : 'transparent',
                  }}
                >
                  <Box sx={{ p: 1.5 }}>
                    <div style={{ fontWeight: 700 }}>{row.hostInfo?.hostname ?? rowNode?.hostname ?? row.nodeId}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{row.nodeId}</div>
                  </Box>
                  <Box sx={{ p: 1.5, fontSize: 13 }}>
                    {row.hostInfo ? `${row.hostInfo.cpu_cores}c / ${row.hostInfo.cpu_threads}t` : '—'}
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{row.hostInfo?.cpu_model ?? 'Unknown CPU'}</div>
                  </Box>
                  <Box sx={{ p: 1.5, fontSize: 13 }}>
                    {row.hostInfo ? `${(row.hostInfo.total_memory_mb / 1024).toFixed(1)} GB` : '—'}
                  </Box>
                  <Box sx={{ p: 1.5, fontSize: 13 }}>
                    {disk ? `${disk.size_gb} GB` : '—'}
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{disk?.health_status ?? row.diskHealth?.overall_health ?? 'Unknown'}</div>
                  </Box>
                  <Box sx={{ p: 1.5, fontSize: 13 }}>
                    <div>{row.hostInfo?.manufacturer ?? 'Unknown'}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{row.hostInfo?.kernel_version ?? 'Kernel unavailable'}</div>
                  </Box>
                  <Box sx={{ p: 1.5, fontSize: 13 }}>
                    {interfaces.length > 0 ? interfaces.join(', ') : 'None reported'}
                  </Box>
                  <Box sx={{ p: 1.5, fontSize: 13, fontWeight: 700, color: row.healthOverview?.overall_health === 'critical' ? '#ef4444' : row.healthOverview?.overall_health === 'warning' ? '#f59e0b' : '#10b981' }}>
                    {(row.healthOverview?.overall_health ?? 'unknown').toUpperCase()}
                  </Box>
                </Box>
              )
            })}
          </Paper>
        </Container>
      </Box>
    )
  }

  const machineInfo = hostInfo.data
  const diskHealthData = diskHealth.data
  const healthOverviewData = healthOverview.data
  const brandingData = branding.data

  const overallHealth = healthOverviewData?.overall_health || 'unknown'
  const healthColor =
    overallHealth === 'excellent'
      ? '#10b981'
      : overallHealth === 'good'
        ? '#3b82f6'
        : overallHealth === 'warning'
          ? '#f59e0b'
          : '#ef4444'

  return (
    <Box className="host-machine-page" sx={{ pb: 4 }}>
      <Container maxWidth="lg">
        {/* Page Header with Refresh Controls */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
          <PageHeader
            title={remoteSelected ? `Host Machine · ${selectedNode?.hostname ?? activeNodeId}` : 'Host Machine'}
            subtitle="Complete Hardware Information & Real-Time Health Monitoring"
            icon={<DesktopTower size={32} weight="duotone" style={{ color: brandingData.brand_color }} />}
          />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<ArrowsClockwise size={16} weight="duotone" />}
              onClick={handleManualRefresh}
              sx={{
                color: 'var(--text-primary)',
                borderColor: 'var(--border-strong)',
                backgroundColor: 'var(--surface-2)',
                borderRadius: 0,
                '&:hover': {
                  borderColor: 'var(--border-strong)',
                  backgroundColor: 'var(--surface-3)',
                },
              }}
            >
              Refresh
            </Button>
            <Button
              variant={autoRefresh ? 'contained' : 'outlined'}
              size="small"
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              {autoRefresh ? 'Auto-Refresh ON' : 'Auto-Refresh OFF'}
            </Button>
          </Box>
        </Box>

        {remoteSelected && (
          <Alert severity="info" sx={{ mb: 3 }}>
            Viewing remote node {selectedNode?.hostname ?? activeNodeId} ({activeNodeId})
            {selectedNode?.latencyMs == null ? '' : ` · peer latency ${selectedNode.latencyMs.toFixed(1)} ms`}
          </Alert>
        )}

        {/* Branding Panel */}
        {brandingData && <BrandingPanel branding={brandingData} />}

        {/* Quick Stats & Health Status */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              icon="cpu"
              label="CPU"
              value={`${machineInfo.cpu_cores}c/${machineInfo.cpu_threads}t`}
              secondary={machineInfo.cpu_frequency_mhz ? `${(machineInfo.cpu_frequency_mhz / 1000).toFixed(1)} GHz` : ''}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              icon="memory"
              label="Memory"
              value={`${(machineInfo.total_memory_mb / 1024).toFixed(1)} GB`}
              secondary="Total System RAM"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              icon="storage"
              label="Storage"
              value={diskHealthData?.disks?.[0] ? `${diskHealthData.disks[0].size_gb} GB` : 'N/A'}
              secondary={diskHealthData?.overall_health || ''}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <StatCard
              icon="health"
              label="Health"
              value={overallHealth.toUpperCase()}
              secondary={healthOverviewData?.cpu_temp_celsius ? `${healthOverviewData.cpu_temp_celsius}°C` : ''}
              color={healthColor}
            />
          </Grid>
        </Grid>

        {/* Tabbed Content Section */}
        <Paper sx={{ mt: 3 }}>
          <Tabs
            value={tabIndex}
            onChange={(_, newValue) => setTabIndex(newValue)}
            variant="scrollable"
            allowScrollButtonsMobile
            sx={{
              borderBottom: 1,
              borderColor: 'divider',
              bgcolor: 'background.paper',
            }}
          >
            <Tab label="Specifications" />
            <Tab label="Disk Health" />
            <Tab label="Audio Features" />
            <Tab label="Performance" />
            <Tab label="Service Info" />
          </Tabs>

          {/* Tab 1: Specifications */}
          {tabIndex === 0 && (
            <Box sx={{ p: 3 }}>
              <MachineSpecsCard machineInfo={machineInfo} nodeId={activeNodeId} />
            </Box>
          )}

          {/* Tab 2: Disk Health */}
          {tabIndex === 1 && diskHealthData && (
            <Box sx={{ p: 3 }}>
              <DiskHealthCard diskHealth={diskHealthData} nodeId={activeNodeId} />
            </Box>
          )}

          {/* Tab 3: Audio Features */}
          {tabIndex === 2 && (
            <Box sx={{ p: 3 }}>
              <AudioNodeFeatures
                machineInfo={machineInfo}
                healthOverview={healthOverviewData}
                branding={brandingData}
              />
            </Box>
          )}

          {/* Tab 4: Performance Metrics */}
          {tabIndex === 3 && (
            <Box sx={{ p: 3 }}>
              <PerformanceMetrics
                autoRefresh={autoRefresh}
                onAutoRefreshChange={setAutoRefresh}
                nodeId={activeNodeId}
              />
            </Box>
          )}

          {/* Tab 5: Service Info */}
          {tabIndex === 4 && (
            <Box sx={{ p: 3 }}>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Box
                    sx={{
                      p: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 1,
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>Service Information</div>
                    <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.8 }}>
                      <div>
                        <strong>System UUID:</strong> {machineInfo.system_uuid || 'N/A'}
                      </div>
                      <div>
                        <strong>BIOS Version:</strong> {machineInfo.bios_version || 'N/A'}
                      </div>
                      <div>
                        <strong>BIOS Date:</strong> {machineInfo.bios_date || 'N/A'}
                      </div>
                      <div>
                        <strong>Chassis Type:</strong> {machineInfo.chassis_type || 'N/A'}
                      </div>
                      <div>
                        <strong>Warranty:</strong> {brandingData.warranty_status || 'Check manufacturer'}
                      </div>
                      <div>
                        <strong>Support URL:</strong>{' '}
                        {brandingData.support_url ? (
                          <a href={brandingData.support_url} target="_blank" rel="noopener">
                            Visit Support Portal
                          </a>
                        ) : (
                          'N/A'
                        )}
                      </div>
                    </div>
                  </Box>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Box
                    sx={{
                      p: 2,
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 1,
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>System Export</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                      <button
                        onClick={() => {
                          const data = {
                            machine: machineInfo,
                            health: healthOverviewData,
                            disks: diskHealthData,
                            branding: brandingData,
                            timestamp: new Date().toISOString(),
                          }
                          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = `host-machine-info-${new Date().getTime()}.json`
                          a.click()
                        }}
                        style={{
                          padding: '8px 16px',
                          background: brandingData.brand_color,
                          color: 'white',
                          border: 'none',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontSize: 12,
                        }}
                      >
                        Export as JSON
                      </button>
                    </div>
                  </Box>
                </Grid>
              </Grid>
            </Box>
          )}
        </Paper>

        {/* Refresh Status */}
        <Box sx={{ mt: 3, display: 'flex', alignItems: 'center', gap: 1, fontSize: 12, color: '#6b7280' }}>
          <span>
            {autoRefresh ? '🔄 Auto-refresh enabled' : '⏸️ Auto-refresh disabled'}
          </span>
          {healthOverviewData && (
            <span>
              • Health updated moments ago
            </span>
          )}
        </Box>
      </Container>
    </Box>
  )
}

export default HostMachinePage
