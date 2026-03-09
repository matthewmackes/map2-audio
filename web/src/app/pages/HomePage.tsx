import { useState, useEffect } from 'react'
import { House, Gauge, SquaresFour, Plug, FlowArrow, ShareNetwork, CheckCircle, XCircle, Copy, Broadcast } from '@phosphor-icons/react'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { CPUStatusOverview } from '../components/CPUStatusOverview'
import { PlatformCapabilities } from '../components/PlatformCapabilities'
import { SystemArchitectureFlow } from '../components/SystemArchitectureFlow'
import { usePipeWire } from '../hooks/usePipeWire'
import { useAVBStatus } from '../hooks/useAvbStatus'
import responsive from '../../styles/responsive.module.css'

interface NetworkShareStatus {
  smb_enabled: boolean
  smb_port_445: boolean
  smb_port_139: boolean
  local_ip: string
  shares: Array<{ name: string; path: string; description: string; accessible: boolean; writable: boolean }>
  access_urls: { windows: string; linux: string; mac: string }
}

interface CpuBrandInfo {
  vendor: string
  model: string
  brand: string
  family: string
  logo_url: string
  brand_color: string
  display_name: string
}

export function HomePage() {
  const [networkStatus, setNetworkStatus] = useState<NetworkShareStatus | null>(null)
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
  const [cpuBrand, setCpuBrand] = useState<CpuBrandInfo | null>(null)
  const pw = usePipeWire({ useWebSocket: false, pollingInterval: 5000 })
  const avbStatusQuery = useAVBStatus()

  useEffect(() => {
    fetch('/folders/network-shares')
      .then(res => res.ok ? res.json() : null)
      .then(data => setNetworkStatus(data))
      .catch(() => setNetworkStatus(null))

    fetch('/api/system/cpu-brand')
      .then(res => res.ok ? res.json() : null)
      .then(data => setCpuBrand(data))
      .catch(() => setCpuBrand(null))
  }, [])

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedUrl(label)
      setTimeout(() => setCopiedUrl(null), 2000)
    })
  }

  const avbState = avbStatusQuery.data?.state || (avbStatusQuery.data?.available ? 'operational' : 'disabled')
  const avbStateColor = (
    avbState === 'operational'
      ? '#22c55e'
      : avbState === 'degraded'
        ? '#f59e0b'
        : avbState === 'disabled'
          ? '#9ca3af'
          : '#ef4444'
  )
  const avbSummary = avbStatusQuery.isLoading
    ? 'Checking'
    : (avbStatusQuery.data?.available ? avbState : 'Unavailable')
  const avbHelper = avbStatusQuery.isLoading
    ? 'Polling AVB status'
    : (
      avbStatusQuery.data?.reason ||
      `${avbStatusQuery.data?.interface || 'interface n/a'} • PTP ${avbStatusQuery.data?.ptp?.state || 'unknown'}`
    )

  return (
    <div className="stack">
      <PageHeader
        title="Mackes Audio Platform 1-22-25"
        subtitle="Neural Amp Modeler | LV2 (LADSPA Version 2) | Convolution Reverb | Realtime Linux"
        icon={<House size={32} weight="duotone" style={{ color: '#2563eb' }} />}
        logo={cpuBrand?.logo_url ? {
          url: cpuBrand.logo_url,
          alt: `${cpuBrand.display_name} Processor`,
          title: cpuBrand.model
        } : undefined}
      />

      {/* System Architecture & Health - Top Priority */}
      <div className={responsive.desktopOnly}>
        <SystemArchitectureFlow />
      </div>

      {/* Platform Capabilities & Standards */}
      <div className={responsive.desktopOnly}>
        <PlatformCapabilities />
      </div>

      {/* Unified CPU Status & Management - At Top */}
      <div className="card">
        <CPUStatusOverview />
      </div>

      {/* Network Share Access - Standalone Section */}
      {networkStatus?.smb_enabled && (
        <div className="card">
            <div className="flex" style={{ gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <ShareNetwork size={16} weight="duotone" />
              <strong style={{ fontSize: 13 }}>Network Access</strong>
              <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 'auto' }}>IP: {networkStatus.local_ip}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
              {networkStatus.shares.map(share => (
                <div
                  key={share.name}
                  className="flex"
                  style={{
                    gap: 8,
                    alignItems: 'center',
                    padding: '8px 12px',
                    background: '#111111',
                    borderRadius: 6,
                    cursor: 'pointer',
                    border: copiedUrl === share.name ? '1px solid #22c55e' : '1px solid transparent'
                  }}
                  onClick={() => copyToClipboard(`\\\\${networkStatus.local_ip}\\${share.name}`, share.name)}
                  title={`Click to copy: \\\\${networkStatus.local_ip}\\${share.name}`}
                >
                  {share.accessible ? (
                    <CheckCircle size={14} weight="duotone" style={{ color: '#22c55e', flexShrink: 0 }} />
                  ) : (
                    <XCircle size={14} weight="duotone" style={{ color: '#ef4444', flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{share.name}</div>
                    <div style={{ fontSize: 10, color: '#6b7280' }}>{share.description}</div>
                  </div>
                  <Copy size={12} weight="bold" style={{ color: copiedUrl === share.name ? '#22c55e' : '#6b7280', flexShrink: 0 }} />
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: '#6b7280' }}>
              Click a share to copy Windows path. Linux/Mac: smb://{networkStatus.local_ip}/share-name
            </div>
        </div>
      )}

      <div className="stat-grid">
        <StatCard
          label="PipeWire"
          value={
            <div className="flex" style={{ gap: 8 }}>
              <Broadcast size={18} weight="duotone" style={{ color: pw.isDaemonRunning ? '#60a5fa' : '#ef4444' }} />
              <span>{pw.isDaemonRunning ? `${pw.totalLatencyMs.toFixed(1)}ms` : 'Offline'}</span>
            </div>
          }
          helper={pw.isDaemonRunning ? `v${pw.daemonVersion} • ${pw.effectiveQuantum}smp @ ${(pw.effectiveRate/1000).toFixed(0)}kHz` : 'Daemon not running'}
        />
        <StatCard
          label="Chains"
          value={<div className="flex" style={{ gap: 8 }}><FlowArrow size={18} weight="duotone" /><span>Ready</span></div>}
          helper="Routing"
        />
        <StatCard
          label="Presets"
          value={<div className="flex" style={{ gap: 8 }}><SquaresFour size={18} weight="duotone" /><span>Editable</span></div>}
          helper="Catalog"
        />
        <StatCard
          label="Plugins"
          value={<div className="flex" style={{ gap: 8 }}><Plug size={18} weight="duotone" /><span>Discover</span></div>}
          helper="Inventory"
        />
        <StatCard
          label="Metrics"
          value={<div className="flex" style={{ gap: 8 }}><Gauge size={18} weight="duotone" /><span>Live</span></div>}
          helper="Health"
        />
        <StatCard
          label="AVB Stack"
          value={(
            <div className="flex" style={{ gap: 8 }}>
              <ShareNetwork size={18} weight="duotone" style={{ color: avbStateColor }} />
              <span>{avbSummary}</span>
            </div>
          )}
          helper={avbHelper}
        />
      </div>
    </div>
  )
}
