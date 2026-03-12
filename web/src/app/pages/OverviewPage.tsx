import { useState, useEffect, type ReactNode } from 'react'
import { Button, Layer, Tag } from '@carbon/react'
import {
  Apps,
  ChartColumn,
  CheckmarkFilled,
  Copy,
  ErrorFilled,
  Flow,
  Home,
  Network_3 as NetworkThree,
  Plug,
  Share,
  type CarbonIconType,
} from '@carbon/icons-react'
import { CPUStatusOverview } from '../components/CPUStatusOverview'
import { PlatformCapabilities } from '../components/PlatformCapabilities'
import { SystemArchitectureFlow } from '../components/SystemArchitectureFlow'
import { usePipeWire } from '../hooks/usePipeWire'
import { useAVBStatus } from '../hooks/useAvbStatus'
import responsive from '../../styles/responsive.module.css'
import './OverviewPage.css'

interface NetworkShareStatus {
  smb_enabled: boolean
  smb_port_445: boolean
  smb_port_139: boolean
  local_ip: string
  shares: Array<{ name: string; path: string; description: string; accessible: boolean; writable: boolean }>
  access_urls: { windows: string; linux: string; mac: string }
}

interface OverviewMetricCardProps {
  label: string
  value: ReactNode
  helper: string
  icon: CarbonIconType
  tone?: 'gray' | 'green' | 'red' | 'warm-gray'
}

function OverviewMetricCard({ label, value, helper, icon: Icon, tone = 'gray' }: OverviewMetricCardProps) {
  return (
    <Layer className="overview-page__metric-card">
      <div className="overview-page__metric-head">
        <span className="overview-page__metric-label">{label}</span>
        <Icon size={18} aria-hidden="true" className="overview-page__metric-icon" />
      </div>
      <div className="overview-page__metric-value">{value}</div>
      <Tag type={tone}>{helper}</Tag>
    </Layer>
  )
}

export function OverviewPage() {
  const [networkStatus, setNetworkStatus] = useState<NetworkShareStatus | null>(null)
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
  const pw = usePipeWire({ useWebSocket: false, pollingInterval: 5000 })
  const avbStatusQuery = useAVBStatus()

  useEffect(() => {
    fetch('/api/folders/network-shares')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setNetworkStatus(data))
      .catch(() => setNetworkStatus(null))
  }, [])

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedUrl(label)
      setTimeout(() => setCopiedUrl(null), 2000)
    } catch {
      setCopiedUrl(null)
    }
  }

  const avbState = avbStatusQuery.data?.state || (avbStatusQuery.data?.available ? 'operational' : 'disabled')
  const avbTagType: 'green' | 'red' | 'gray' | 'warm-gray' = (
    avbState === 'operational'
      ? 'green'
      : avbState === 'degraded'
        ? 'warm-gray'
        : avbState === 'disabled'
          ? 'gray'
          : 'red'
  )

  const avbSummary = avbStatusQuery.isLoading
    ? 'Checking'
    : (avbStatusQuery.data?.available ? avbState : 'Unavailable')
  const avbHelper = avbStatusQuery.isLoading
    ? 'Polling AVB status'
    : (
      avbStatusQuery.data?.reason ||
      `${avbStatusQuery.data?.interface || 'interface n/a'} - PTP ${avbStatusQuery.data?.ptp?.state || 'unknown'}`
    )

  return (
    <div className="overview-page">
      <Layer className="overview-page__hero">
        <div className="overview-page__hero-head">
          <Home size={32} aria-hidden="true" className="overview-page__hero-icon" />
          <div>
            <h1 className="overview-page__title">MAP2 audio platform overview</h1>
            <p className="overview-page__subtitle">
              Neural amp modeler, LV2, convolution reverb, and realtime Linux
            </p>
          </div>
        </div>
      </Layer>

      <div className={responsive.desktopOnly}>
        <SystemArchitectureFlow />
      </div>

      <div className={responsive.desktopOnly}>
        <PlatformCapabilities />
      </div>

      <Layer className="overview-page__panel">
        <CPUStatusOverview />
      </Layer>

      {networkStatus?.smb_enabled ? (
        <Layer className="overview-page__panel">
          <div className="overview-page__panel-head">
            <div>
              <h2 className="overview-page__panel-title">Network access</h2>
              <p className="overview-page__panel-subtitle">SMB shares for transfer and collaboration</p>
            </div>
            <Tag type="cool-gray">IP {networkStatus.local_ip}</Tag>
          </div>

          <div className="overview-page__shares-grid">
            {networkStatus.shares.map((share) => {
              const path = `\\\\${networkStatus.local_ip}\\${share.name}`
              return (
                <button
                  key={share.name}
                  type="button"
                  className={`overview-page__share-card ${copiedUrl === share.name ? 'is-copied' : ''}`}
                  onClick={() => {
                    void copyToClipboard(path, share.name)
                  }}
                  title={`Copy ${path}`}
                >
                  <span
                    className={`overview-page__share-status ${share.accessible ? 'is-accessible' : 'is-unavailable'}`}
                    aria-hidden="true"
                  >
                    {share.accessible ? <CheckmarkFilled size={16} /> : <ErrorFilled size={16} />}
                  </span>
                  <span className="overview-page__share-text">
                    <span className="overview-page__share-name">{share.name}</span>
                    <span className="overview-page__share-description">{share.description}</span>
                  </span>
                  <Copy size={14} aria-hidden="true" className="overview-page__share-copy" />
                </button>
              )
            })}
          </div>

          <p className="overview-page__shares-note">
            Click a share to copy its Windows path. Linux and macOS can use `smb://{networkStatus.local_ip}/share-name`.
          </p>
        </Layer>
      ) : null}

      <div className="overview-page__metrics-grid">
        <OverviewMetricCard
          label="PipeWire"
          value={pw.isDaemonRunning ? `${pw.totalLatencyMs.toFixed(1)} ms` : 'Offline'}
          helper={pw.isDaemonRunning
            ? `v${pw.daemonVersion} - ${pw.effectiveQuantum} smp @ ${(pw.effectiveRate / 1000).toFixed(0)} kHz`
            : 'Daemon not running'}
          icon={NetworkThree}
          tone={pw.isDaemonRunning ? 'green' : 'red'}
        />
        <OverviewMetricCard
          label="Chains"
          value="Ready"
          helper="Routing"
          icon={Flow}
          tone="green"
        />
        <OverviewMetricCard
          label="Presets"
          value="Editable"
          helper="Catalog"
          icon={Apps}
        />
        <OverviewMetricCard
          label="Plugins"
          value="Discover"
          helper="Inventory"
          icon={Plug}
        />
        <OverviewMetricCard
          label="Metrics"
          value="Live"
          helper="Health"
          icon={ChartColumn}
          tone="green"
        />
        <OverviewMetricCard
          label="AVB stack"
          value={avbSummary}
          helper={avbHelper}
          icon={Share}
          tone={avbTagType}
        />
      </div>

      {networkStatus?.smb_enabled ? (
        <div className="overview-page__smb-actions">
          <Button
            kind="ghost"
            size="sm"
            renderIcon={Copy}
            onClick={() => {
              void copyToClipboard(`smb://${networkStatus.local_ip}/`, 'smb-root')
            }}
          >
            Copy SMB root URL
          </Button>
        </div>
      ) : null}
    </div>
  )
}
