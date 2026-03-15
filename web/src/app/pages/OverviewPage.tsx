import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Accordion,
  AccordionItem,
  Button,
  InlineLoading,
  InlineNotification,
  Layer,
  Tag,
} from '@carbon/react'
import {
  ChartColumn,
  Copy,
  Flow,
  Launch,
  Network_3 as NetworkThree,
  Share,
  type CarbonIconType,
} from '@carbon/icons-react'
import { useNavigate } from 'react-router-dom'
import { CPUStatusOverview } from '../components/CPUStatusOverview'
import { PlatformCapabilities } from '../components/PlatformCapabilities'
import { SystemArchitectureFlow } from '../components/SystemArchitectureFlow'
import { useAVBStatus } from '../hooks/useAvbStatus'
import { useCPUMetrics } from '../hooks/useCPUMetrics'
import { usePipeWire } from '../hooks/usePipeWire'
import './OverviewPage.css'

interface NetworkShareStatus {
  smb_enabled: boolean
  smb_port_445: boolean
  smb_port_139: boolean
  local_ip: string
  shares: Array<{ name: string; path: string; description: string; accessible: boolean; writable: boolean }>
  access_urls: { windows: string; linux: string; mac: string }
}

type StatusTone = 'gray' | 'green' | 'red' | 'warm-gray' | 'cool-gray'

interface OverviewMetricCardProps {
  label: string
  value: ReactNode
  helper: string
  statusLabel: string
  icon: CarbonIconType
  tone: StatusTone
}

interface OverviewSummaryPanelProps {
  eyebrow: string
  title: string
  tone: StatusTone
  statusLabel: string
  summary: string
  details: string
  rows: Array<{ label: string; value: ReactNode }>
}

interface OverviewAction {
  label: string
  path: string
  kind: 'primary' | 'secondary' | 'ghost'
}

function formatRate(rate: number): string {
  return `${(rate / 1000).toFixed(0)} kHz`
}

function getAudioTone(
  isDaemonRunning: boolean,
  overallStatus: 'ok' | 'warning' | 'error' | 'offline',
  hasXruns: boolean,
): StatusTone {
  if (!isDaemonRunning || overallStatus === 'error' || hasXruns) {
    return 'red'
  }
  if (overallStatus === 'warning') {
    return 'warm-gray'
  }
  return 'green'
}

function getCpuTone(status: string, hasXruns: boolean): StatusTone {
  if (status === 'critical' || hasXruns) {
    return 'red'
  }
  if (status === 'warning') {
    return 'warm-gray'
  }
  return 'green'
}

function getContentTone(
  loading: boolean,
  error: string | null,
  networkStatus: NetworkShareStatus | null,
  accessibleShares: number,
): StatusTone {
  if (loading) {
    return 'cool-gray'
  }
  if (error) {
    return 'red'
  }
  if (!networkStatus?.smb_enabled) {
    return 'gray'
  }
  if (accessibleShares === 0) {
    return 'warm-gray'
  }
  return 'green'
}

function OverviewMetricCard({ label, value, helper, statusLabel, icon: Icon, tone }: OverviewMetricCardProps) {
  return (
    <Layer className="overview-page__kpi-card">
      <div className="overview-page__kpi-head">
        <div>
          <p className="overview-page__eyebrow">{label}</p>
          <Tag type={tone}>{statusLabel}</Tag>
        </div>
        <Icon size={18} aria-hidden="true" className="overview-page__kpi-icon" />
      </div>
      <p className="overview-page__kpi-value">{value}</p>
      <p className="overview-page__kpi-helper">{helper}</p>
    </Layer>
  )
}

function OverviewSummaryPanel({
  eyebrow,
  title,
  tone,
  statusLabel,
  summary,
  details,
  rows,
}: OverviewSummaryPanelProps) {
  return (
    <Layer className="overview-page__summary-panel">
      <div className="overview-page__summary-head">
        <div>
          <p className="overview-page__eyebrow">{eyebrow}</p>
          <h2 className="overview-page__section-title">{title}</h2>
        </div>
        <Tag type={tone}>{statusLabel}</Tag>
      </div>
      <p className="overview-page__summary-copy">{summary}</p>
      <p className="overview-page__summary-detail">{details}</p>
      <dl className="overview-page__stat-list">
        {rows.map((row) => (
          <div key={row.label} className="overview-page__stat-row">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </Layer>
  )
}

export function OverviewPage() {
  const navigate = useNavigate()
  const [networkStatus, setNetworkStatus] = useState<NetworkShareStatus | null>(null)
  const [networkLoading, setNetworkLoading] = useState(true)
  const [networkError, setNetworkError] = useState<string | null>(null)
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
  const [cpuDetailsOpen, setCpuDetailsOpen] = useState(false)
  const [architectureOpen, setArchitectureOpen] = useState(false)
  const [capabilitiesOpen, setCapabilitiesOpen] = useState(false)

  const pw = usePipeWire({ useWebSocket: false, pollingInterval: 5000 })
  const avbStatusQuery = useAVBStatus()
  const cpu = useCPUMetrics({ useWebSocket: false, pollingInterval: 5000 })

  useEffect(() => {
    let cancelled = false

    const loadNetworkStatus = async () => {
      setNetworkLoading(true)
      setNetworkError(null)
      try {
        const response = await fetch('/api/folders/network-shares')
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        const data = await response.json() as NetworkShareStatus
        if (!cancelled) {
          setNetworkStatus(data)
        }
      } catch (error) {
        if (!cancelled) {
          setNetworkStatus(null)
          setNetworkError(error instanceof Error ? error.message : 'Unknown error')
        }
      } finally {
        if (!cancelled) {
          setNetworkLoading(false)
        }
      }
    }

    void loadNetworkStatus()
    return () => {
      cancelled = true
    }
  }, [])

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedUrl(label)
      window.setTimeout(() => setCopiedUrl((current) => (current === label ? null : current)), 2000)
    } catch {
      setCopiedUrl(null)
    }
  }

  const avbState = avbStatusQuery.data?.state || (avbStatusQuery.data?.available ? 'operational' : 'disabled')
  const avbTone: StatusTone = (
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
    ? 'Polling AVB readiness and PTP lock.'
    : (
      avbStatusQuery.data?.reason ||
      `${avbStatusQuery.data?.interface || 'interface n/a'} - PTP ${avbStatusQuery.data?.ptp?.state || 'unknown'}`
    )

  const audioTone = getAudioTone(pw.isDaemonRunning, pw.overallStatus, pw.hasXruns)
  const cpuTone = getCpuTone(cpu.status, cpu.hasXruns)

  const accessibleShares = networkStatus?.shares.filter((share) => share.accessible).length ?? 0
  const writableShares = networkStatus?.shares.filter((share) => share.writable).length ?? 0
  const contentTone = getContentTone(networkLoading, networkError, networkStatus, accessibleShares)

  const nodeTone: StatusTone = (
    !pw.isDaemonRunning || cpuTone === 'red'
      ? 'red'
      : audioTone === 'warm-gray' || cpuTone === 'warm-gray' || avbTone === 'warm-gray'
        ? 'warm-gray'
        : 'green'
  )

  const nodeStatusLabel = nodeTone === 'red'
    ? 'Needs attention'
    : nodeTone === 'warm-gray'
      ? 'Monitor'
      : 'Healthy'

  const audioStatusLabel = audioTone === 'red'
    ? 'Not ready'
    : audioTone === 'warm-gray'
      ? 'Watch latency'
      : 'Ready'

  const leadSummary = useMemo(() => {
    if (!pw.isDaemonRunning) {
      return 'This node is not currently ready for live audio. Restore the audio daemon before routing or content work.'
    }
    if (nodeTone === 'red') {
      return 'The node is online but reports blocking health issues that should be resolved before production use.'
    }
    if (nodeTone === 'warm-gray') {
      return 'The node is active with advisory conditions. Audio is available, but one or more readiness signals need attention.'
    }
    return 'The node is healthy and ready for routine audio, routing, and content operations.'
  }, [nodeTone, pw.isDaemonRunning])

  const nodeHealthRows = useMemo(
    () => [
      { label: 'Audio daemon', value: pw.isDaemonRunning ? 'Running' : 'Offline' },
      { label: 'CPU load', value: cpu.metrics.running ? `${cpu.metrics.totalCpuPercent.toFixed(0)}% total` : 'Engine idle' },
      { label: 'XRuns', value: `${cpu.metrics.xrunCount}` },
      { label: 'AVB / PTP', value: avbSummary },
    ],
    [avbSummary, cpu.metrics.running, cpu.metrics.totalCpuPercent, cpu.metrics.xrunCount, pw.isDaemonRunning],
  )

  const audioReadinessRows = useMemo(
    () => [
      { label: 'Latency', value: pw.isDaemonRunning ? `${pw.totalLatencyMs.toFixed(1)} ms total` : 'Unavailable' },
      { label: 'Clocking', value: `${pw.effectiveQuantum} samples @ ${formatRate(pw.effectiveRate)}` },
      { label: 'Clients', value: `${pw.clientCount}` },
      { label: 'I/O graph', value: `${pw.devices.length} devices / ${pw.streams.length} streams` },
    ],
    [
      pw.clientCount,
      pw.devices.length,
      pw.effectiveQuantum,
      pw.effectiveRate,
      pw.isDaemonRunning,
      pw.streams.length,
      pw.totalLatencyMs,
    ],
  )

  const kpiCards = useMemo<OverviewMetricCardProps[]>(() => {
    const contentValue = networkLoading
      ? 'Checking'
      : networkError
        ? 'Unavailable'
        : networkStatus?.smb_enabled
          ? `${accessibleShares}/${networkStatus.shares.length} shares reachable`
          : 'Disabled'
    const contentHelper = networkLoading
      ? 'Checking SMB shares and access URLs.'
      : networkError
        ? 'The share-status endpoint did not return usable data.'
        : networkStatus?.smb_enabled
          ? `${writableShares}/${networkStatus.shares.length} shares writable. Copy SMB paths directly from this page.`
          : 'SMB file sharing is disabled for this node.'

    return [
      {
        label: 'Audio runtime',
        value: pw.isDaemonRunning ? `${pw.totalLatencyMs.toFixed(1)} ms` : 'Offline',
        helper: pw.isDaemonRunning
          ? `${pw.effectiveQuantum} samples @ ${formatRate(pw.effectiveRate)}. ${pw.hasXruns ? 'XRuns detected.' : 'No xruns reported.'}`
          : 'Open the audio engine to restore runtime service.',
        statusLabel: audioStatusLabel,
        icon: NetworkThree,
        tone: audioTone,
      },
      {
        label: 'AVB readiness',
        value: avbSummary,
        helper: avbHelper,
        statusLabel: avbStatusQuery.isLoading ? 'Polling' : avbSummary,
        icon: Share,
        tone: avbTone,
      },
      {
        label: 'CPU and engine',
        value: cpu.metrics.running ? `${cpu.metrics.totalCpuPercent.toFixed(0)}% CPU` : 'Engine idle',
        helper: cpu.hasXruns
          ? `${cpu.metrics.xrunCount} xruns detected. Inspect engine health before performance use.`
          : `Headroom ${Math.round(cpu.metrics.headroomPercent)}%. Open detailed CPU health for scheduling context.`,
        statusLabel: cpu.status === 'critical' ? 'Critical' : cpu.status === 'warning' ? 'Warning' : 'Stable',
        icon: ChartColumn,
        tone: cpuTone,
      },
      {
        label: 'Content access',
        value: contentValue,
        helper: contentHelper,
        statusLabel: networkLoading
          ? 'Checking'
          : networkError
            ? 'Error'
            : networkStatus?.smb_enabled
              ? 'SMB ready'
              : 'Disabled',
        icon: Flow,
        tone: contentTone,
      },
    ]
  }, [
    accessibleShares,
    audioStatusLabel,
    audioTone,
    avbHelper,
    avbStatusQuery.isLoading,
    avbSummary,
    avbTone,
    contentTone,
    cpu.hasXruns,
    cpu.metrics.headroomPercent,
    cpu.metrics.running,
    cpu.metrics.totalCpuPercent,
    cpu.metrics.xrunCount,
    cpu.status,
    networkError,
    networkLoading,
    networkStatus,
    pw.effectiveQuantum,
    pw.effectiveRate,
    pw.hasXruns,
    pw.isDaemonRunning,
    pw.totalLatencyMs,
    writableShares,
  ])

  const actions: OverviewAction[] = [
    { label: 'Open audio engine', path: '/engine', kind: 'primary' },
    { label: 'Open AVB routing', path: '/avb-routing', kind: 'secondary' },
    { label: 'Open chains', path: '/chains', kind: 'ghost' },
    { label: 'Open content library', path: '/library', kind: 'ghost' },
    { label: 'Open host machine', path: '/host-machine', kind: 'ghost' },
  ]

  return (
    <div className="overview-page">
      <div className="overview-page__band">
        <Layer className="overview-page__lead-card">
          <p className="overview-page__eyebrow">Operational overview</p>
          <h1 className="overview-page__page-title">Node overview</h1>
          <p className="overview-page__page-summary">{leadSummary}</p>
          <div className="overview-page__lead-tags">
            <Tag type={nodeTone}>{nodeStatusLabel}</Tag>
            <Tag type={audioTone}>{audioStatusLabel}</Tag>
            <Tag type={avbTone}>{avbStatusQuery.isLoading ? 'AVB polling' : avbSummary}</Tag>
          </div>
        </Layer>

        <Layer className="overview-page__actions-card">
          <div className="overview-page__summary-head">
            <div>
              <p className="overview-page__eyebrow">Quick actions</p>
              <h2 className="overview-page__section-title">Go directly to the next task</h2>
            </div>
          </div>
          <p className="overview-page__summary-detail">
            These shortcuts cover the most common follow-up actions after a first health scan.
          </p>
          <div className="overview-page__action-list" role="group" aria-label="Overview actions">
            {actions.map((action) => (
              <Button
                key={action.path}
                kind={action.kind}
                size="sm"
                renderIcon={Launch}
                onClick={() => navigate(action.path)}
              >
                {action.label}
              </Button>
            ))}
          </div>
        </Layer>
      </div>

      <div className="overview-page__band">
        <div className="overview-page__summary-column">
          <OverviewSummaryPanel
            eyebrow="Primary signal"
            title="Node health"
            tone={nodeTone}
            statusLabel={nodeStatusLabel}
            summary={nodeTone === 'green'
              ? 'Core runtime signals are healthy enough for normal operation.'
              : nodeTone === 'warm-gray'
                ? 'The node is running, but one or more health signals need follow-up.'
                : 'The node should not be treated as performance-ready yet.'}
            details="This summary combines audio daemon state, CPU pressure, xruns, and AVB posture into one first-scan briefing."
            rows={nodeHealthRows}
          />
        </div>

        <div className="overview-page__summary-column">
          <OverviewSummaryPanel
            eyebrow="Secondary signal"
            title="Audio path readiness"
            tone={audioTone}
            statusLabel={audioStatusLabel}
            summary={pw.isDaemonRunning
              ? 'Audio runtime is active and the current clocking profile is available for routing work.'
              : 'Audio runtime is offline, so latency and graph readiness are not currently usable.'}
            details="Use this panel to confirm latency, clocking, and graph scale before moving into detailed engine or routing work."
            rows={audioReadinessRows}
          />
        </div>
      </div>

      <div className="overview-page__band">
        {kpiCards.map((card) => (
          <div key={card.label} className="overview-page__kpi-column">
            <OverviewMetricCard {...card} />
          </div>
        ))}
      </div>

      <div className="overview-page__band">
        <Layer className="overview-page__section overview-page__section--content">
          <div className="overview-page__section-head">
            <div>
              <p className="overview-page__eyebrow">Operational content</p>
              <h2 className="overview-page__section-title">Content access</h2>
              <p className="overview-page__section-copy">
                Review SMB availability, copy share paths, and confirm whether remote transfer is ready.
              </p>
            </div>
            {networkStatus?.local_ip ? <Tag type="cool-gray">IP {networkStatus.local_ip}</Tag> : null}
          </div>

          {networkLoading ? (
            <InlineLoading description="Checking SMB shares and access URLs..." />
          ) : null}

          {!networkLoading && networkError ? (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title="Network access unavailable"
              subtitle="The network-share status endpoint did not return a usable response."
            />
          ) : null}

          {!networkLoading && !networkError && networkStatus && !networkStatus.smb_enabled ? (
            <div className="overview-page__empty-state">
              <h3>SMB file sharing is currently disabled for this node.</h3>
              <p>Use the library and host-machine routes to inspect local content and service configuration.</p>
            </div>
          ) : null}

          {!networkLoading && !networkError && networkStatus?.smb_enabled && networkStatus.shares.length === 0 ? (
            <div className="overview-page__empty-state">
              <h3>No SMB shares are currently published.</h3>
              <p>The endpoint is available, but it did not return any active share definitions.</p>
            </div>
          ) : null}

          {!networkLoading && !networkError && networkStatus?.smb_enabled && networkStatus.shares.length > 0 ? (
            <>
              <div className="overview-page__content-actions">
                <div className="overview-page__content-copy">
                  <p className="overview-page__content-copy-text">
                    Windows: <code>{networkStatus.access_urls.windows}</code>
                  </p>
                  <p className="overview-page__content-copy-text">
                    Unix: <code>{networkStatus.access_urls.linux}</code>
                  </p>
                </div>
                <div className="overview-page__content-copy-actions">
                  <Button
                    kind="ghost"
                    size="sm"
                    renderIcon={Copy}
                    onClick={() => {
                      void copyToClipboard(networkStatus.access_urls.windows, 'smb-root')
                    }}
                  >
                    Copy SMB root
                  </Button>
                  {copiedUrl === 'smb-root' ? <Tag type="green">Copied</Tag> : null}
                </div>
              </div>

              <div className="overview-page__share-list" role="list" aria-label="Network shares">
                {networkStatus.shares.map((share) => {
                  const path = `\\\\${networkStatus.local_ip}\\${share.name}`
                  return (
                    <div key={share.name} role="listitem" className="overview-page__share-row">
                      <div className="overview-page__share-main">
                        <div className="overview-page__share-heading">
                          <h3>{share.name}</h3>
                          <div className="overview-page__share-tags">
                            <Tag type={share.accessible ? 'green' : 'red'}>
                              {share.accessible ? 'Reachable' : 'Unavailable'}
                            </Tag>
                            <Tag type={share.writable ? 'cool-gray' : 'gray'}>
                              {share.writable ? 'Writable' : 'Read only'}
                            </Tag>
                          </div>
                        </div>
                        <p className="overview-page__share-description">{share.description}</p>
                        <code className="overview-page__share-path" title={path}>
                          {path}
                        </code>
                      </div>
                      <div className="overview-page__share-actions">
                        <Button
                          kind="ghost"
                          size="sm"
                          renderIcon={Copy}
                          onClick={() => {
                            void copyToClipboard(path, share.name)
                          }}
                        >
                          Copy path
                        </Button>
                        {copiedUrl === share.name ? <Tag type="green">Copied</Tag> : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          ) : null}
        </Layer>

        <Layer className="overview-page__section overview-page__section--support">
          <div className="overview-page__section-head">
            <div>
              <p className="overview-page__eyebrow">Supporting detail</p>
              <h2 className="overview-page__section-title">Detailed system context</h2>
              <p className="overview-page__section-copy">
                Open these sections when the top-level health summary points to deeper investigation.
              </p>
            </div>
          </div>

          <Accordion align="start" className="overview-page__accordion">
            <AccordionItem
              title="Detailed CPU and scheduling"
              open={cpuDetailsOpen}
              onHeadingClick={({ isOpen }) => setCpuDetailsOpen(!isOpen)}
            >
              <CPUStatusOverview />
            </AccordionItem>
            <AccordionItem
              title="System architecture"
              open={architectureOpen}
              onHeadingClick={({ isOpen }) => setArchitectureOpen(!isOpen)}
            >
              <SystemArchitectureFlow />
            </AccordionItem>
            <AccordionItem
              title="Platform capabilities"
              open={capabilitiesOpen}
              onHeadingClick={({ isOpen }) => setCapabilitiesOpen(!isOpen)}
            >
              <PlatformCapabilities />
            </AccordionItem>
          </Accordion>
        </Layer>
      </div>
    </div>
  )
}
