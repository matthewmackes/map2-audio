import { useState } from 'react'
import { Broadcast, SpeakerHigh, SpeakerX, Warning, CheckCircle, XCircle, Pulse, Cpu, Link, Microphone, GearSix, type Icon } from '@phosphor-icons/react'
import { usePipeWire } from '../hooks/usePipeWire'

// ============================================================================
// Helper Components
// ============================================================================

function StatusBadge({ status }: { status: 'ok' | 'warning' | 'error' | 'offline' }) {
  const config = {
    ok:      { icon: CheckCircle,    color: '#22c55e', bg: '#052e16', label: 'Healthy' },
    warning: { icon: Warning,        color: '#f59e0b', bg: '#451a03', label: 'Warning' },
    error:   { icon: XCircle,        color: '#ef4444', bg: '#450a0a', label: 'Error' },
    offline: { icon: XCircle,        color: '#6b7280', bg: '#1f2937', label: 'Offline' },
  }
  const { icon: Icon, color, bg, label } = config[status]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 9999, backgroundColor: bg, color, fontSize: 13, fontWeight: 600 }}>
      <Icon size={14} /> {label}
    </span>
  )
}

function MetricCard({ label, value, unit, icon: Icon, color = '#94a3b8' }: {
  label: string; value: string | number; unit?: string; icon: Icon; color?: string
}) {
  return (
    <div style={{ background: '#1e293b', borderRadius: 12, padding: '20px 24px', minWidth: 160 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
        <Icon size={14} weight="duotone" /> {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color, fontFamily: 'JetBrains Mono, monospace' }}>
        {value}{unit && <span style={{ fontSize: 14, color: '#64748b', marginLeft: 4 }}>{unit}</span>}
      </div>
    </div>
  )
}

// ============================================================================
// Sub-sections
// ============================================================================

function DaemonSection({ pw }: { pw: ReturnType<typeof usePipeWire> }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
      <MetricCard icon={Broadcast}    label="Version"     value={pw.daemonVersion || '—'} color="#60a5fa" />
      <MetricCard icon={Pulse} label="Latency"     value={pw.totalLatencyMs.toFixed(1)} unit="ms" color={pw.isHighLatency ? '#f59e0b' : '#22c55e'} />
      <MetricCard icon={Cpu}      label="Quantum"     value={pw.effectiveQuantum} unit="smp" color="#60a5fa" />
      <MetricCard icon={Pulse} label="Sample Rate" value={(pw.effectiveRate / 1000).toFixed(1)} unit="kHz" color="#60a5fa" />
      <MetricCard icon={SpeakerHigh}  label="Devices"     value={pw.devices.length} color="#60a5fa" />
      <MetricCard icon={Link}    label="Links"       value={pw.links.length} color="#60a5fa" />
      <MetricCard icon={Pulse} label="Streams"     value={pw.streams.length} color="#60a5fa" />
      <MetricCard icon={Warning} label="XRuns"  value={pw.xruns} color={pw.hasXruns ? '#ef4444' : '#22c55e'} />
    </div>
  )
}

function DevicesTable({ pw }: { pw: ReturnType<typeof usePipeWire> }) {
  if (!pw.devices.length) return <p style={{ color: '#64748b' }}>No audio devices detected</p>
  return (
    <div className="pipewire-table-wrap">
      <table className="pipewire-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #334155', color: '#64748b', textAlign: 'left' }}>
            <th style={{ padding: '8px 12px' }}>ID</th>
            <th style={{ padding: '8px 12px' }}>Device</th>
            <th style={{ padding: '8px 12px' }}>Driver</th>
            <th style={{ padding: '8px 12px' }}>Default</th>
          </tr>
        </thead>
        <tbody>
          {pw.devices.map(d => (
            <tr key={d.id} style={{ borderBottom: '1px solid #1e293b' }}>
              <td style={{ padding: '8px 12px', color: '#94a3b8', fontFamily: 'monospace' }}>{d.id}</td>
              <td style={{ padding: '8px 12px', color: '#e2e8f0' }}>{d.name}</td>
              <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{d.driver}</td>
              <td style={{ padding: '8px 12px' }}>{d.is_default ? '★' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function NodesTable({ pw }: { pw: ReturnType<typeof usePipeWire> }) {
  if (!pw.nodes.length) return <p style={{ color: '#64748b' }}>No sink/source nodes</p>
  return (
    <div className="pipewire-table-wrap">
      <table className="pipewire-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #334155', color: '#64748b', textAlign: 'left' }}>
            <th style={{ padding: '8px 12px' }}>ID</th>
            <th style={{ padding: '8px 12px' }}>Name</th>
            <th style={{ padding: '8px 12px' }}>Type</th>
            <th style={{ padding: '8px 12px' }}>Volume</th>
            <th style={{ padding: '8px 12px' }}>Mute</th>
            <th style={{ padding: '8px 12px' }}>Default</th>
          </tr>
        </thead>
        <tbody>
          {pw.nodes.map(n => (
            <tr key={n.id} style={{ borderBottom: '1px solid #1e293b' }}>
              <td style={{ padding: '8px 12px', color: '#94a3b8', fontFamily: 'monospace' }}>{n.id}</td>
              <td style={{ padding: '8px 12px', color: '#e2e8f0' }}>{n.name}</td>
              <td style={{ padding: '8px 12px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: n.media_class.includes('Sink') ? '#60a5fa' : '#a78bfa' }}>
                  {n.media_class.includes('Sink') ? <SpeakerHigh size={14} weight="duotone"/> : <Microphone size={14} weight="duotone"/>}
                  {n.media_class.includes('Sink') ? 'Sink' : 'Source'}
                </span>
              </td>
              <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>
                <span style={{ color: n.volume > 1.0 ? '#f59e0b' : '#e2e8f0' }}>
                  {(n.volume * 100).toFixed(0)}%
                </span>
              </td>
              <td style={{ padding: '8px 12px' }}>
                {n.muted
                  ? <SpeakerX size={16} weight="duotone" color="#ef4444" />
                  : <SpeakerHigh size={16} weight="duotone" color="#22c55e" />}
              </td>
              <td style={{ padding: '8px 12px' }}>{n.is_default ? '★' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StreamsTable({ pw }: { pw: ReturnType<typeof usePipeWire> }) {
  if (!pw.streams.length) return <p style={{ color: '#64748b' }}>No active audio streams</p>
  return (
    <div className="pipewire-table-wrap">
      <table className="pipewire-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #334155', color: '#64748b', textAlign: 'left' }}>
            <th style={{ padding: '8px 12px' }}>ID</th>
            <th style={{ padding: '8px 12px' }}>Client</th>
            <th style={{ padding: '8px 12px' }}>Media</th>
          </tr>
        </thead>
        <tbody>
          {pw.streams.map(s => (
            <tr key={s.id} style={{ borderBottom: '1px solid #1e293b' }}>
              <td style={{ padding: '8px 12px', color: '#94a3b8', fontFamily: 'monospace' }}>{s.id}</td>
              <td style={{ padding: '8px 12px', color: '#e2e8f0' }}>{s.client_name}</td>
              <td style={{ padding: '8px 12px', color: '#94a3b8' }}>{s.media_name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LinksTable({ pw }: { pw: ReturnType<typeof usePipeWire> }) {
  if (!pw.links.length) return <p style={{ color: '#64748b' }}>No port connections</p>
  return (
    <div className="pipewire-table-wrap">
      <table className="pipewire-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #334155', color: '#64748b', textAlign: 'left' }}>
            <th style={{ padding: '8px 12px' }}>ID</th>
            <th style={{ padding: '8px 12px' }}>Output</th>
            <th style={{ padding: '8px 12px' }}></th>
            <th style={{ padding: '8px 12px' }}>Input</th>
            <th style={{ padding: '8px 12px' }}>State</th>
          </tr>
        </thead>
        <tbody>
          {pw.links.map(l => (
            <tr key={l.id} style={{ borderBottom: '1px solid #1e293b' }}>
              <td style={{ padding: '8px 12px', color: '#94a3b8', fontFamily: 'monospace' }}>{l.id}</td>
              <td style={{ padding: '8px 12px', color: '#e2e8f0', fontFamily: 'monospace' }}>{l.output_node}:{l.output_port}</td>
              <td style={{ padding: '8px 12px', color: '#60a5fa' }}>→</td>
              <td style={{ padding: '8px 12px', color: '#e2e8f0', fontFamily: 'monospace' }}>{l.input_node}:{l.input_port}</td>
              <td style={{ padding: '8px 12px' }}>
                <span style={{
                  color: l.state === 'active' || l.state === 'running' ? '#22c55e'
                    : l.state === 'error' ? '#ef4444'
                      : l.state === 'paused' ? '#f59e0b'
                        : '#94a3b8',
                  fontWeight: 600,
                  fontSize: 12
                }}>
                  {l.state || 'unknown'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AlertsList({ pw }: { pw: ReturnType<typeof usePipeWire> }) {
  if (!pw.alerts.length) return <p style={{ color: '#22c55e', fontSize: 14 }}>✓ No active alerts</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {pw.alerts.map((a, i) => {
        const color = a.severity === 'error' ? '#ef4444' : a.severity === 'warning' ? '#f59e0b' : '#60a5fa'
        const bg = a.severity === 'error' ? '#450a0a' : a.severity === 'warning' ? '#451a03' : '#172554'
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, backgroundColor: bg, color, fontSize: 13 }}>
            <Warning size={16} weight="duotone" />
            <span>{a.message}</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.7, textTransform: 'uppercase' }}>{a.severity}</span>
          </div>
        )
      })}
    </div>
  )
}

function QuantumControl({ pw }: { pw: ReturnType<typeof usePipeWire> }) {
  const currentForced = pw.settings.clock_force_quantum
  const currentQuantum = pw.settings.clock_quantum

  return (
    <div>
      <div style={{ 
        padding: '16px 20px', 
        borderRadius: 8, 
        backgroundColor: '#1e293b',
        border: '2px solid #475569' 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: 14, color: '#94a3b8', fontWeight: 600 }}>🔒 LOCKED FOR TIER A PERFORMANCE</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Current Quantum</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#60a5fa', fontFamily: 'monospace' }}>
              {currentQuantum} samples
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>Forced Quantum</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: currentForced === 64 ? '#22c55e' : '#f59e0b', fontFamily: 'monospace' }}>
              {currentForced || 'auto'}
            </div>
          </div>
        </div>
        <div style={{ 
          marginTop: 16, 
          padding: 12, 
          backgroundColor: '#0f172a', 
          borderRadius: 6,
          fontSize: 12,
          color: '#94a3b8',
          lineHeight: 1.6
        }}>
          <strong style={{ color: '#e2e8f0' }}>Quantum is locked at 64 samples for professional guitar processing.</strong><br/>
          • Target latency: &lt;3ms round-trip (Tier A)<br/>
          • Prevents buffer size mismatch with JUCE engine<br/>
          • To change: Edit systemd service (<code style={{ color: '#60a5fa' }}>map2-backend.service</code>) and restart<br/>
          <br/>
          Graph latency: 64→{((64 / pw.effectiveRate) * 1000).toFixed(1)}ms, 
          128→{((128 / pw.effectiveRate) * 1000).toFixed(1)}ms, 
          256→{((256 / pw.effectiveRate) * 1000).toFixed(1)}ms
          <span style={{ marginLeft: 8, opacity: 0.7 }}>(×2 for round-trip)</span>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Main Page
// ============================================================================

type Tab = 'overview' | 'devices' | 'nodes' | 'streams' | 'links' | 'settings'

export function PipeWirePage() {
  const pw = usePipeWire()
  const [tab, setTab] = useState<Tab>('overview')

  const tabs: { id: Tab; label: string; icon: Icon }[] = [
    { id: 'overview', label: 'Overview',  icon: Pulse },
    { id: 'devices',  label: 'Devices',   icon: SpeakerHigh },
    { id: 'nodes',    label: 'Nodes',     icon: SpeakerHigh },
    { id: 'streams',  label: 'Streams',   icon: Microphone },
    { id: 'links',    label: 'Links',     icon: Link },
    { id: 'settings', label: 'Settings',  icon: GearSix },
  ]

  return (
    <div className="pipewire-page" style={{ padding: 32, maxWidth: 1200, margin: '0 auto', color: '#e2e8f0' }}>
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
        <Broadcast size={36} weight="duotone" color="#60a5fa" />
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: '#f8fafc' }}>
            PipeWire Audio Server
          </h1>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 14 }}>
            Audio graph topology, latency control, and real-time monitoring
          </p>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <StatusBadge status={pw.overallStatus} />
        </div>
      </header>

      {/* Tabs */}
      <nav className="pipewire-tabbar" style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid #334155', paddingBottom: 0 }}>
        {tabs.map(t => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 18px', border: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: active ? 600 : 400,
                color: active ? '#60a5fa' : '#94a3b8',
                backgroundColor: 'transparent',
                borderBottom: active ? '2px solid #60a5fa' : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              <Icon size={16} /> {t.label}
            </button>
          )
        })}
      </nav>

      {/* Content */}
      <div>
        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            <DaemonSection pw={pw} />
            <Section title="Alerts" icon={Warning}>
              <AlertsList pw={pw} />
            </Section>
            <Section title="Default Sink" icon={SpeakerHigh}>
              {pw.defaultSink
                ? <p style={{ color: '#e2e8f0', fontSize: 14 }}>
                    <strong>{pw.defaultSink.name}</strong> — Vol: {(pw.defaultSink.volume * 100).toFixed(0)}%
                    {pw.defaultSink.muted && <span style={{ color: '#ef4444', marginLeft: 8 }}>(MUTED)</span>}
                  </p>
                : <p style={{ color: '#64748b' }}>No default sink</p>}
            </Section>
            <Section title="Default Source" icon={Microphone}>
              {pw.defaultSource
                ? <p style={{ color: '#e2e8f0', fontSize: 14 }}>
                    <strong>{pw.defaultSource.name}</strong> — Vol: {(pw.defaultSource.volume * 100).toFixed(0)}%
                    {pw.defaultSource.muted && <span style={{ color: '#ef4444', marginLeft: 8 }}>(MUTED)</span>}
                  </p>
                : <p style={{ color: '#64748b' }}>No default source</p>}
            </Section>
          </div>
        )}

        {tab === 'devices' && (
          <Section title="Audio Devices" icon={SpeakerHigh}>
            <DevicesTable pw={pw} />
          </Section>
        )}

        {tab === 'nodes' && (
          <Section title="Sink & Source Nodes" icon={SpeakerHigh}>
            <NodesTable pw={pw} />
          </Section>
        )}

        {tab === 'streams' && (
          <Section title="Active Streams" icon={Microphone}>
            <StreamsTable pw={pw} />
          </Section>
        )}

        {tab === 'links' && (
          <Section title="Port Connections" icon={Link}>
            <LinksTable pw={pw} />
          </Section>
        )}

        {tab === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <Section title="Buffer Size (Quantum)" icon={GearSix}>
              <QuantumControl pw={pw} />
            </Section>
            <Section title="Clock Settings" icon={Pulse}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                <SettingItem label="clock.rate" value={`${pw.settings.clock_rate} Hz`} />
                <SettingItem label="clock.force-rate" value={pw.settings.clock_force_rate ? `${pw.settings.clock_force_rate} Hz` : 'auto'} />
                <SettingItem label="clock.quantum" value={`${pw.settings.clock_quantum}`} />
                <SettingItem label="clock.force-quantum" value={pw.settings.clock_force_quantum ? `${pw.settings.clock_force_quantum}` : 'auto'} />
                <SettingItem label="clock.min-quantum" value={`${pw.settings.clock_min_quantum}`} />
                <SettingItem label="clock.max-quantum" value={`${pw.settings.clock_max_quantum}`} />
                <SettingItem label="clock.allowed-rates" value={pw.settings.clock_allowed_rates.join(', ')} />
              </div>
            </Section>
            <Section title="Latency Breakdown" icon={Pulse}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                <MetricCard icon={Pulse} label="Graph" value={pw.graphLatencyMs.toFixed(1)} unit="ms" color="#60a5fa" />
                <MetricCard icon={Pulse} label="Driver" value={pw.driverLatencyMs.toFixed(1)} unit="ms" color="#60a5fa" />
                <MetricCard icon={Pulse} label="Total" value={pw.totalLatencyMs.toFixed(1)} unit="ms" color={pw.isHighLatency ? '#f59e0b' : '#22c55e'} />
              </div>
            </Section>
          </div>
        )}
      </div>

      {/* Footer: connection status */}
      <div style={{ marginTop: 40, padding: '12px 0', borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b' }}>
        <span>{pw.isConnected ? '● Connected via WebSocket' : '○ Polling mode'}</span>
        <span>Last update: {pw.metrics.timestamp ? new Date(pw.metrics.timestamp).toLocaleTimeString() : '—'}</span>
      </div>
    </div>
  )
}

// ============================================================================
// Utility components
// ============================================================================

function Section({ title, icon: Icon, children }: { title: string; icon: Icon; children: React.ReactNode }) {
  return (
    <div style={{ background: '#0f172a', borderRadius: 12, padding: 24, border: '1px solid #1e293b' }}>
      <h3 style={{ margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 600, color: '#f8fafc' }}>
        <Icon size={18} color="#60a5fa" /> {title}
      </h3>
      {children}
    </div>
  )
}

function SettingItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#1e293b', borderRadius: 8, padding: '12px 16px' }}>
      <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0', fontFamily: 'JetBrains Mono, monospace' }}>{value}</div>
    </div>
  )
}
