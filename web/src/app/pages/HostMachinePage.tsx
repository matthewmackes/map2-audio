/**
 * Host Machine Page - Hardware Information & Real-Time Health Monitoring
 *
 * Displays comprehensive hardware information about the host system running MAP2,
 * with manufacturer branding, real-time health metrics, disk SMART data, and
 * audio optimization features specific to small form factor (SFF) hardware.
 */

import { useState } from 'react'
import { CheckmarkFilled, Renew, WarningAltFilled } from '@carbon/icons-react'
import '../components/HostMachine/HostMachine.css'
import { PageHeader } from '../components/PageHeader'
import { useToasts } from '../components/Toasts'
import { useCluster } from '../contexts/ClusterContext'
import { MapRackDeviceIcon } from '../components/icons/map'

import {
  useHostMachinePageData,
  useRefreshHostMachineData,
} from '../hooks/useHostMachine'

import BrandingPanel from '../components/HostMachine/BrandingPanel'
import MachineSpecsCard from '../components/HostMachine/MachineSpecsCard'
import DiskHealthCard from '../components/HostMachine/DiskHealthCard'
import AudioNodeFeatures from '../components/HostMachine/AudioNodeFeatures'
import PerformanceMetrics from '../components/HostMachine/PerformanceMetrics'

const TABS = ['Specifications', 'Disk Health', 'Audio Features', 'Performance', 'Service Info'] as const

export function HostMachinePage() {
  const { pushToast } = useToasts()
  const { activeNodeId, nodes, localNodeId } = useCluster()
  const [tabIndex, setTabIndex] = useState(0)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const allNodesSelected = activeNodeId === 'all'
  const selectedNode = nodes.find((node) => node.nodeId === activeNodeId)
  const remoteSelected = Boolean(activeNodeId && activeNodeId !== 'all' && activeNodeId !== localNodeId)

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

  const refresh = useRefreshHostMachineData(activeNodeId)

  const handleManualRefresh = () => {
    refresh()
    pushToast('Refreshing host machine data…', 'info')
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="hm-spinner" />
          <p style={{ marginTop: 16, color: 'var(--text-secondary)', fontSize: 14 }}>
            Loading host machine data…
          </p>
        </div>
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────────
  if (isError || (!allNodesSelected && (!hostInfo.data || !branding.data))) {
    return (
      <div style={{ padding: '0 24px 32px' }}>
        <PageHeader
          title={allNodesSelected ? 'Host Machine · All Nodes' : 'Host Machine'}
          subtitle="Hardware Information & Monitoring"
          icon={<MapRackDeviceIcon size={28} style={{ color: 'var(--danger)' }} />}
        />
        <div className="hm-inline-notification hm-inline-notification--error" style={{ marginTop: 24 }}>
          <WarningAltFilled size={16} />
          <span>{error instanceof Error ? error.message : 'Failed to load host machine information. Please try again.'}</span>
        </div>
      </div>
    )
  }

  // ── All Nodes / Cluster View ──────────────────────────────────────────────────
  if (allNodesSelected) {
    const comparisonRows = clusterComparison.data ?? []
    return (
      <div style={{ padding: '0 24px 32px' }}>
        <div className="hm-page-toolbar">
          <PageHeader
            title="Host Machine · All Nodes"
            subtitle="Cluster-wide hardware comparison"
            icon={<MapRackDeviceIcon size={28} style={{ color: 'var(--interactive)' }} />}
          />
          <button className="hm-btn hm-btn--ghost" onClick={handleManualRefresh}>
            <Renew size={16} />
            Refresh
          </button>
        </div>

        <div className="hm-inline-notification hm-inline-notification--info" style={{ marginBottom: 24 }}>
          <CheckmarkFilled size={16} />
          <span>Comparing hardware, disk, and health data across the cluster. Select a node for full detailed diagnostics.</span>
        </div>

        <div className="hm-cluster-table">
          <div className="hm-cluster-table__head">
            {['Node', 'CPU', 'Memory', 'Disk', 'System', 'Audio Interfaces', 'Health'].map((h) => (
              <div key={h} className="hm-cluster-table__hcell">{h}</div>
            ))}
          </div>
          {comparisonRows.map((row) => {
            const disk = row.diskHealth?.disks?.[0]
            const interfaces = row.hardware?.audio_interfaces ?? []
            const rowNode = nodes.find((n) => n.nodeId === row.nodeId)
            const health = row.healthOverview?.overall_health ?? 'unknown'
            return (
              <div
                key={row.nodeId}
                className={`hm-cluster-table__row${rowNode?.isOnline === false ? ' hm-cluster-table__row--offline' : ''}`}
              >
                <div className="hm-cluster-table__cell">
                  <span className="hm-cluster-table__hostname">{row.hostInfo?.hostname ?? rowNode?.hostname ?? row.nodeId}</span>
                  <span className="hm-cluster-table__nodeid">{row.nodeId}</span>
                </div>
                <div className="hm-cluster-table__cell">
                  {row.hostInfo ? `${row.hostInfo.cpu_cores}c / ${row.hostInfo.cpu_threads}t` : '—'}
                  <span className="hm-cluster-table__sub">{row.hostInfo?.cpu_model ?? 'Unknown CPU'}</span>
                </div>
                <div className="hm-cluster-table__cell">
                  {row.hostInfo ? `${(row.hostInfo.total_memory_mb / 1024).toFixed(1)} GB` : '—'}
                </div>
                <div className="hm-cluster-table__cell">
                  {disk ? `${disk.size_gb} GB` : '—'}
                  <span className="hm-cluster-table__sub">{disk?.health_status ?? row.diskHealth?.overall_health ?? 'Unknown'}</span>
                </div>
                <div className="hm-cluster-table__cell">
                  {row.hostInfo?.manufacturer ?? 'Unknown'}
                  <span className="hm-cluster-table__sub">{row.hostInfo?.kernel_version ?? 'Kernel unavailable'}</span>
                </div>
                <div className="hm-cluster-table__cell">
                  {interfaces.length > 0 ? interfaces.join(', ') : <span style={{ color: 'var(--text-tertiary)' }}>None reported</span>}
                </div>
                <div className={`hm-cluster-table__cell hm-health-badge hm-health-badge--${health}`}>
                  {health.toUpperCase()}
                </div>
              </div>
            )
          })}
          {comparisonRows.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
              No nodes available
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Single Node View ──────────────────────────────────────────────────────────
  const machineInfo = hostInfo.data!
  const diskHealthData = diskHealth.data
  const healthOverviewData = healthOverview.data
  const brandingData = branding.data!

  const overallHealth = healthOverviewData?.overall_health ?? 'unknown'

  const healthTone =
    overallHealth === 'excellent' ? 'success'
    : overallHealth === 'good' ? 'success'
    : overallHealth === 'warning' ? 'warning'
    : 'danger'

  return (
    <div className="hm-page" style={{ padding: '0 24px 48px' }}>

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="hm-page-toolbar">
        <PageHeader
          title={remoteSelected ? `Host Machine · ${selectedNode?.hostname ?? activeNodeId}` : 'Host Machine'}
          subtitle="Hardware Information & Real-Time Health Monitoring"
          icon={<MapRackDeviceIcon size={28} style={{ color: brandingData.brand_color }} />}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className={`hm-btn hm-btn--ghost${autoRefresh ? ' hm-btn--active' : ''}`}
            onClick={() => setAutoRefresh(!autoRefresh)}
            title={autoRefresh ? 'Auto-refresh is ON — click to disable' : 'Auto-refresh is OFF — click to enable'}
          >
            <span className={`hm-refresh-dot${autoRefresh ? ' hm-refresh-dot--live' : ''}`} />
            {autoRefresh ? 'Live' : 'Paused'}
          </button>
          <button className="hm-btn hm-btn--ghost" onClick={handleManualRefresh}>
            <Renew size={16} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Remote notice ───────────────────────────────────────────── */}
      {remoteSelected && (
        <div className="hm-inline-notification hm-inline-notification--info" style={{ marginBottom: 24 }}>
          <MapRackDeviceIcon size={16} />
          <span>
            Viewing remote node <strong>{selectedNode?.hostname ?? activeNodeId}</strong>
            {selectedNode?.latencyMs != null && ` · peer latency ${selectedNode.latencyMs.toFixed(1)} ms`}
          </span>
        </div>
      )}

      {/* ── Branding ────────────────────────────────────────────────── */}
      {brandingData && <BrandingPanel branding={brandingData} />}

      {/* ── KPI row ─────────────────────────────────────────────────── */}
      <div className="hm-kpi-row">
        <div className="hm-kpi-card">
          <div className="hm-kpi-card__label">Processor</div>
          <div className="hm-kpi-card__value">{machineInfo.cpu_cores}c / {machineInfo.cpu_threads}t</div>
          <div className="hm-kpi-card__sub">
            {machineInfo.cpu_frequency_mhz
              ? `${(machineInfo.cpu_frequency_mhz / 1000).toFixed(1)} GHz`
              : machineInfo.cpu_model?.split(' ').slice(0, 3).join(' ') ?? 'CPU'}
          </div>
        </div>
        <div className="hm-kpi-card">
          <div className="hm-kpi-card__label">Memory</div>
          <div className="hm-kpi-card__value">{(machineInfo.total_memory_mb / 1024).toFixed(1)} GB</div>
          <div className="hm-kpi-card__sub">Total System RAM</div>
        </div>
        <div className="hm-kpi-card">
          <div className="hm-kpi-card__label">Primary Disk</div>
          <div className="hm-kpi-card__value">
            {diskHealthData?.disks?.[0] ? `${diskHealthData.disks[0].size_gb} GB` : 'N/A'}
          </div>
          <div className="hm-kpi-card__sub">{diskHealthData?.overall_health ?? 'Health unknown'}</div>
        </div>
        <div className={`hm-kpi-card hm-kpi-card--${healthTone}`}>
          <div className="hm-kpi-card__label">System Health</div>
          <div className="hm-kpi-card__value">{overallHealth.toUpperCase()}</div>
          <div className="hm-kpi-card__sub">
            {healthOverviewData?.cpu_temp_celsius != null
              ? `CPU ${healthOverviewData.cpu_temp_celsius}°C`
              : 'Monitoring active'}
          </div>
        </div>
      </div>

      {/* ── Tabbed content ──────────────────────────────────────────── */}
      <div className="hm-tabs">
        <div className="hm-tabs__nav" role="tablist">
          {TABS.map((tab, i) => (
            <button
              key={tab}
              role="tab"
              aria-selected={tabIndex === i}
              className={`hm-tabs__tab${tabIndex === i ? ' hm-tabs__tab--active' : ''}`}
              onClick={() => setTabIndex(i)}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="hm-tabs__panel">
          {tabIndex === 0 && <MachineSpecsCard machineInfo={machineInfo} nodeId={activeNodeId} />}

          {tabIndex === 1 && (
            diskHealthData
              ? <DiskHealthCard diskHealth={diskHealthData} nodeId={activeNodeId} />
              : <div className="hm-empty">No disk health data available</div>
          )}

          {tabIndex === 2 && (
            <AudioNodeFeatures
              machineInfo={machineInfo}
              healthOverview={healthOverviewData}
              branding={brandingData}
            />
          )}

          {tabIndex === 3 && (
            <PerformanceMetrics
              autoRefresh={autoRefresh}
              onAutoRefreshChange={setAutoRefresh}
              nodeId={activeNodeId}
            />
          )}

          {tabIndex === 4 && (
            <div className="hm-service-grid">
              {/* Service Information */}
              <div className="hm-section-card">
                <div className="hm-section-card__title">Service Information</div>
                <table className="hm-info-table">
                  <tbody>
                    <tr>
                      <td className="hm-info-table__key">System UUID</td>
                      <td className="hm-info-table__val hm-mono">{machineInfo.system_uuid || 'N/A'}</td>
                    </tr>
                    <tr>
                      <td className="hm-info-table__key">BIOS Version</td>
                      <td className="hm-info-table__val">{machineInfo.bios_version || 'N/A'}</td>
                    </tr>
                    <tr>
                      <td className="hm-info-table__key">BIOS Date</td>
                      <td className="hm-info-table__val">{machineInfo.bios_date || 'N/A'}</td>
                    </tr>
                    <tr>
                      <td className="hm-info-table__key">Chassis Type</td>
                      <td className="hm-info-table__val">{machineInfo.chassis_type || 'N/A'}</td>
                    </tr>
                    <tr>
                      <td className="hm-info-table__key">Warranty</td>
                      <td className="hm-info-table__val">{brandingData.warranty_status || 'Check manufacturer'}</td>
                    </tr>
                    {brandingData.support_url && (
                      <tr>
                        <td className="hm-info-table__key">Support</td>
                        <td className="hm-info-table__val">
                          <a
                            href={brandingData.support_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hm-link"
                          >
                            Visit Support Portal ↗
                          </a>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Export */}
              <div className="hm-section-card">
                <div className="hm-section-card__title">Export System Report</div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
                  Download a full JSON snapshot of this system — hardware specs, disk SMART data,
                  health overview, and branding metadata. Useful for support tickets and diagnostics.
                </p>
                <button
                  className="hm-btn hm-btn--primary"
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
                    a.download = `host-machine-${machineInfo.hostname ?? 'report'}-${Date.now()}.json`
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                >
                  Download JSON Report
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Status bar ──────────────────────────────────────────────── */}
      <div className="hm-status-bar">
        <span className={`hm-refresh-dot${autoRefresh ? ' hm-refresh-dot--live' : ''}`} />
        <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
          {autoRefresh ? 'Auto-refresh active · health every 2s, disk every 5s' : 'Auto-refresh paused'}
        </span>
        {healthOverviewData && (
          <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>· Updated moments ago</span>
        )}
      </div>
    </div>
  )
}

export default HostMachinePage
