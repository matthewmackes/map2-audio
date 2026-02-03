import { useState, useEffect } from 'react'
import { Home, Gauge, PanelsTopLeft, Plug2, Workflow, Share2, CheckCircle, XCircle, Copy } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { CPUStatusOverview } from '../components/CPUStatusOverview'
import { PlatformCapabilities } from '../components/PlatformCapabilities'
import { SystemArchitectureFlow } from '../components/SystemArchitectureFlow'

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
  return (
    <div className="stack">
      <PageHeader
        title="Mackes Audio Platform 1-22-25"
        subtitle="Neural Amp Modeler | LV2 (LADSPA Version 2) | Convolution Reverb | Realtime Linux"
        icon={<Home size={32} style={{ color: '#3b82f6' }} />}
        logo={cpuBrand?.logo_url ? {
          url: cpuBrand.logo_url,
          alt: `${cpuBrand.display_name} Processor`,
          title: cpuBrand.model
        } : undefined}
      />

      {/* System Architecture & Health - Top Priority */}
      <SystemArchitectureFlow />

      {/* Platform Capabilities & Standards */}
      <PlatformCapabilities />

      {/* Unified CPU Status & Management - At Top */}
      <div className="card">
        <CPUStatusOverview />
      </div>

      {/* Network Share Access - Standalone Section */}
      {networkStatus?.smb_enabled && (
        <div className="card">
            <div className="flex" style={{ gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <Share2 size={16} />
              <strong style={{ fontSize: 13 }}>Network Access</strong>
              <span style={{ fontSize: 11, color: '#888', marginLeft: 'auto' }}>IP: {networkStatus.local_ip}</span>
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
                    background: '#252540',
                    borderRadius: 6,
                    cursor: 'pointer',
                    border: copiedUrl === share.name ? '1px solid #22c55e' : '1px solid transparent'
                  }}
                  onClick={() => copyToClipboard(`\\\\${networkStatus.local_ip}\\${share.name}`, share.name)}
                  title={`Click to copy: \\\\${networkStatus.local_ip}\\${share.name}`}
                >
                  {share.accessible ? (
                    <CheckCircle size={14} style={{ color: '#22c55e', flexShrink: 0 }} />
                  ) : (
                    <XCircle size={14} style={{ color: '#ef4444', flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{share.name}</div>
                    <div style={{ fontSize: 10, color: '#888' }}>{share.description}</div>
                  </div>
                  <Copy size={12} style={{ color: copiedUrl === share.name ? '#22c55e' : '#666', flexShrink: 0 }} />
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: '#666' }}>
              Click a share to copy Windows path. Linux/Mac: smb://{networkStatus.local_ip}/share-name
            </div>
        </div>
      )}

      <div className="stat-grid">
        <StatCard
          label="Chains"
          value={<div className="flex" style={{ gap: 8 }}><Workflow size={18} /><span>Ready</span></div>}
          helper="Routing"
        />
        <StatCard
          label="Presets"
          value={<div className="flex" style={{ gap: 8 }}><PanelsTopLeft size={18} /><span>Editable</span></div>}
          helper="Catalog"
        />
        <StatCard
          label="Plugins"
          value={<div className="flex" style={{ gap: 8 }}><Plug2 size={18} /><span>Discover</span></div>}
          helper="Inventory"
        />
        <StatCard
          label="Metrics"
          value={<div className="flex" style={{ gap: 8 }}><Gauge size={18} /><span>Live</span></div>}
          helper="Health"
        />
      </div>
    </div>
  )
}
