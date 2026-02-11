/**
 * AudioEnginePage — Unified Audio Engine & Infrastructure Dashboard
 *
 * Professional appliance-grade view combining:
 *   Layer 1: Engine Cluster Overview (PipeWire daemon + JUCE engine status)
 *   Layer 2: Real-time Metering (Spectrum, VU, LUFS, Phase, Dynamics)
 *   Layer 3: Signal Path & Routing (Nodes, Links, Streams)
 *   Layer 4: Diagnostics & Settings (Latency, CPU, Quantum, Clock)
 *
 * Design language: SSL System T / Meyer Galileo / Lake LM44
 *   — dark, high-contrast, grid-based, monospace numerics
 *   — no skeuomorphic graphics, pure information density
 */

import { useState } from 'react'
import {
  Activity, Radio, Cpu, Link2, Speaker, Mic, AlertTriangle,
  CheckCircle, XCircle, Volume2, VolumeX, Settings, Zap,
  BarChart3, Layers, GitBranch, ChevronDown, ChevronUp
} from 'lucide-react'
import { usePipeWire } from '../hooks/usePipeWire'
import { SpectrumAnalyzer } from '../components/Visualizations/SpectrumAnalyzer'
import { LoudnessMeter } from '../components/Visualizations/LoudnessMeter'
import { CPUMeterPanel } from '../components/Visualizations/CPUMeterPanel'
import { LatencyDisplay } from '../components/Visualizations/LatencyDisplay'
import { PhaseCorrelationMeter } from '../components/Visualizations/PhaseCorrelationMeter'
import { VuMeterDisplay } from '../components/Visualizations/VuMeterDisplay'
import { DynamicsMeteringPanel } from '../components/Visualizations/DynamicsMeteringPanel'

// ============================================================================
// Design tokens — appliance palette
// ============================================================================
const T = {
  bg:        '#0a0e17',
  surface:   '#0f1520',
  panel:     '#141c2b',
  border:    '#1e2a3d',
  borderHi:  '#2a3a55',
  text:      '#e2e8f0',
  muted:     '#64748b',
  dim:       '#475569',
  mono:      "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
  accent:    '#3b82f6',    // blue
  green:     '#22c55e',
  amber:     '#f59e0b',
  red:       '#ef4444',
  purple:    '#a78bfa',
  cyan:      '#06b6d4',
  pink:      '#ec4899',
  teal:      '#14b8a6',
}

// ============================================================================
// Shared micro-components
// ============================================================================

function StatusLed({ ok, label, size = 8 }: { ok: boolean; label?: string; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: ok ? T.green : T.dim }}>
      <span style={{
        width: size, height: size, borderRadius: '50%',
        background: ok ? T.green : '#374151',
        boxShadow: ok ? `0 0 6px ${T.green}60` : 'none',
      }} />
      {label}
    </span>
  )
}

function Stat({ label, value, unit, color = T.text, small }: {
  label: string; value: string | number; unit?: string; color?: string; small?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: small ? 18 : 24, fontWeight: 700, color, fontFamily: T.mono, lineHeight: 1 }}>
        {value}
        {unit && <span style={{ fontSize: small ? 10 : 12, color: T.dim, marginLeft: 3, fontWeight: 500 }}>{unit}</span>}
      </span>
    </div>
  )
}

function Panel({ children, style, borderColor }: {
  children: React.ReactNode; style?: React.CSSProperties; borderColor?: string
}) {
  return (
    <div style={{
      background: T.panel,
      border: `1px solid ${borderColor || T.border}`,
      borderRadius: 8,
      padding: 16,
      ...style,
    }}>
      {children}
    </div>
  )
}

function SectionLabel({ children, color = T.accent }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase',
      letterSpacing: 1.2, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6,
    }}>
      {children}
    </div>
  )
}

// ============================================================================
// Tab definition
// ============================================================================
type Tab = 'overview' | 'metering' | 'routing' | 'diagnostics'

const TABS: { id: Tab; label: string; icon: any; color: string }[] = [
  { id: 'overview',    label: 'Engine Cluster',  icon: Layers,     color: T.accent },
  { id: 'metering',    label: 'Metering',        icon: BarChart3,  color: T.green },
  { id: 'routing',     label: 'Signal Path',     icon: GitBranch,  color: T.purple },
  { id: 'diagnostics', label: 'Diagnostics',     icon: Settings,   color: T.amber },
]

// ============================================================================
// LAYER 1 — Engine Cluster Overview
// ============================================================================

function OverviewLayer({ pw }: { pw: ReturnType<typeof usePipeWire> }) {
  const daemonOk = pw.isDaemonRunning
  const overallColor = pw.overallStatus === 'ok' ? T.green
    : pw.overallStatus === 'warning' ? T.amber
    : pw.overallStatus === 'error' ? T.red : T.dim

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── System Status Strip ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
      }}>
        {/* PipeWire Engine */}
        <Panel borderColor={daemonOk ? `${T.green}30` : `${T.red}30`}>
          <SectionLabel color={T.purple}>
            <Radio size={13} /> PipeWire Audio Server
          </SectionLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <StatusLed ok={daemonOk} label={daemonOk ? 'Online' : 'Offline'} size={10} />
            <span style={{
              padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
              fontFamily: T.mono, color: overallColor,
              background: `${overallColor}15`, border: `1px solid ${overallColor}30`,
            }}>
              {pw.overallStatus.toUpperCase()}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            <Stat label="Version" value={pw.daemonVersion || '—'} color={T.accent} small />
            <Stat label="Sample Rate" value={(pw.effectiveRate / 1000).toFixed(1)} unit="kHz" color={T.purple} small />
            <Stat label="Quantum" value={pw.effectiveQuantum} unit="smp" color={T.purple} small />
            <Stat label="Latency" value={pw.totalLatencyMs.toFixed(1)} unit="ms" color={pw.isHighLatency ? T.amber : T.green} small />
          </div>
        </Panel>

        {/* JUCE Engine */}
        <Panel borderColor={`${T.accent}30`}>
          <SectionLabel color={T.accent}>
            <Zap size={13} /> JUCE Audio Engine
          </SectionLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <StatusLed ok={true} label="Running" size={10} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            <Stat label="Devices" value={pw.devices.length} color={T.accent} small />
            <Stat label="Nodes" value={pw.nodes.length} color={T.accent} small />
            <Stat label="Links" value={pw.links.length} color={T.accent} small />
            <Stat label="Streams" value={pw.streams.length} color={T.accent} small />
          </div>
        </Panel>
      </div>

      {/* ── Alerts ── */}
      {pw.alerts.length > 0 && (
        <Panel borderColor={`${T.red}30`}>
          <SectionLabel color={T.red}><AlertTriangle size={13} /> Alerts</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pw.alerts.map((a, i) => {
              const c = a.severity === 'error' ? T.red : a.severity === 'warning' ? T.amber : T.accent
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', borderRadius: 6, background: `${c}10`,
                  border: `1px solid ${c}25`, fontSize: 12, color: c,
                }}>
                  <AlertTriangle size={13} />
                  <span style={{ flex: 1 }}>{a.message}</span>
                  <span style={{ fontSize: 10, opacity: 0.6, textTransform: 'uppercase' }}>{a.severity}</span>
                </div>
              )
            })}
          </div>
        </Panel>
      )}
      {pw.alerts.length === 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 6, background: `${T.green}08`, border: `1px solid ${T.green}20`, fontSize: 12, color: T.green }}>
          <CheckCircle size={14} /> No active alerts — system healthy
        </div>
      )}

      {/* ── Default I/O ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Panel>
          <SectionLabel color={T.green}><Speaker size={13} /> Default Sink (Output)</SectionLabel>
          {pw.defaultSink ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 14, color: T.text, fontWeight: 600 }}>{pw.defaultSink.name}</span>
              <span style={{ fontSize: 12, color: T.muted }}>{pw.defaultSink.channels}ch</span>
              <span style={{ fontSize: 12, fontFamily: T.mono, color: T.green }}>
                {(pw.defaultSink.volume * 100).toFixed(0)}%
              </span>
              {pw.defaultSink.muted && <span style={{ fontSize: 11, color: T.red, fontWeight: 600 }}>MUTED</span>}
              <StatusLed ok={pw.defaultSink.state === 'running'} label={pw.defaultSink.state} />
            </div>
          ) : <span style={{ fontSize: 13, color: T.dim }}>No default sink configured</span>}
        </Panel>
        <Panel>
          <SectionLabel color={T.cyan}><Mic size={13} /> Default Source (Input)</SectionLabel>
          {pw.defaultSource ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 14, color: T.text, fontWeight: 600 }}>{pw.defaultSource.name}</span>
              <span style={{ fontSize: 12, color: T.muted }}>{pw.defaultSource.channels}ch</span>
              <span style={{ fontSize: 12, fontFamily: T.mono, color: T.green }}>
                {(pw.defaultSource.volume * 100).toFixed(0)}%
              </span>
              {pw.defaultSource.muted && <span style={{ fontSize: 11, color: T.red, fontWeight: 600 }}>MUTED</span>}
              <StatusLed ok={pw.defaultSource.state === 'running'} label={pw.defaultSource.state} />
            </div>
          ) : <span style={{ fontSize: 13, color: T.dim }}>No default source configured</span>}
        </Panel>
      </div>

      {/* ── XRuns ── */}
      <Panel borderColor={pw.hasXruns ? `${T.red}30` : T.border}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Stat label="XRuns" value={pw.xruns} color={pw.hasXruns ? T.red : T.green} small />
          <span style={{ fontSize: 12, color: pw.hasXruns ? T.amber : T.dim }}>
            {pw.hasXruns ? 'Buffer underruns detected — consider increasing quantum' : 'No dropouts — audio path is clean'}
          </span>
        </div>
      </Panel>
    </div>
  )
}

// ============================================================================
// LAYER 2 — Metering
// ============================================================================

function MeteringLayer() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Row 1: Spectrum + VU */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <Panel borderColor={`${T.accent}25`}>
          <SectionLabel color={T.accent}><Zap size={13} /> Frequency Spectrum</SectionLabel>
          <SpectrumAnalyzer mode="bars" height={200} barCount={64} showLabels showPeaks colors={[T.green, T.amber, T.red]} />
        </Panel>
        <Panel borderColor={`${T.green}25`}>
          <SectionLabel color={T.green}><BarChart3 size={13} /> Signal Levels</SectionLabel>
          <VuMeterDisplay showInput showOutput />
        </Panel>
      </div>

      {/* Row 2: LUFS + Phase + Dynamics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        <Panel borderColor={`${T.accent}25`}>
          <SectionLabel color={T.accent}><Activity size={13} /> Loudness (LUFS)</SectionLabel>
          <LoudnessMeter targetLufs={-14} truePeakLimit={-1} compact={false} />
        </Panel>
        <Panel borderColor={`${T.pink}25`}>
          <SectionLabel color={T.pink}><Activity size={13} /> Stereo Phase</SectionLabel>
          <PhaseCorrelationMeter showStereoInfo orientation="horizontal" />
        </Panel>
        <Panel borderColor={`${T.amber}25`}>
          <SectionLabel color={T.amber}><Activity size={13} /> Dynamics</SectionLabel>
          <DynamicsMeteringPanel showCompressor showLimiter showGate />
        </Panel>
      </div>
    </div>
  )
}

// ============================================================================
// LAYER 3 — Signal Path / Routing
// ============================================================================

function RoutingLayer({ pw }: { pw: ReturnType<typeof usePipeWire> }) {
  const [expandLinks, setExpandLinks] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Devices */}
      <Panel>
        <SectionLabel color={T.purple}><Speaker size={13} /> Audio Devices</SectionLabel>
        {pw.devices.length === 0
          ? <span style={{ fontSize: 13, color: T.dim }}>No devices detected</span>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.border}`, color: T.muted, textAlign: 'left' }}>
                  <th style={{ padding: '6px 10px', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>ID</th>
                  <th style={{ padding: '6px 10px', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Device</th>
                  <th style={{ padding: '6px 10px', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Driver</th>
                  <th style={{ padding: '6px 10px', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Default</th>
                </tr>
              </thead>
              <tbody>
                {pw.devices.map(d => (
                  <tr key={d.id} style={{ borderBottom: `1px solid ${T.bg}` }}>
                    <td style={{ padding: '8px 10px', fontFamily: T.mono, color: T.muted, fontSize: 12 }}>{d.id}</td>
                    <td style={{ padding: '8px 10px', color: T.text, fontWeight: 500 }}>{d.name}</td>
                    <td style={{ padding: '8px 10px', color: T.muted }}>{d.driver}</td>
                    <td style={{ padding: '8px 10px' }}>{d.is_default ? <span style={{ color: T.amber }}>★</span> : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </Panel>

      {/* Nodes */}
      <Panel>
        <SectionLabel color={T.green}><Volume2 size={13} /> Sink & Source Nodes</SectionLabel>
        {pw.nodes.length === 0
          ? <span style={{ fontSize: 13, color: T.dim }}>No sink/source nodes</span>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.border}`, color: T.muted, textAlign: 'left' }}>
                  <th style={{ padding: '6px 10px', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>ID</th>
                  <th style={{ padding: '6px 10px', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Name</th>
                  <th style={{ padding: '6px 10px', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Type</th>
                  <th style={{ padding: '6px 10px', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Ch</th>
                  <th style={{ padding: '6px 10px', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Volume</th>
                  <th style={{ padding: '6px 10px', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>State</th>
                </tr>
              </thead>
              <tbody>
                {pw.nodes.map(n => {
                  const isSink = n.media_class.includes('Sink')
                  return (
                    <tr key={n.id} style={{ borderBottom: `1px solid ${T.bg}` }}>
                      <td style={{ padding: '8px 10px', fontFamily: T.mono, color: T.muted, fontSize: 12 }}>{n.id}</td>
                      <td style={{ padding: '8px 10px', color: T.text, fontWeight: 500 }}>{n.name}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: isSink ? T.accent : T.purple, fontSize: 12 }}>
                          {isSink ? <Speaker size={12}/> : <Mic size={12}/>}
                          {isSink ? 'Sink' : 'Source'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', fontFamily: T.mono, color: T.muted, fontSize: 12 }}>{n.channels ?? '—'}</td>
                      <td style={{ padding: '8px 10px', fontFamily: T.mono, fontSize: 12 }}>
                        <span style={{ color: n.volume > 1 ? T.amber : T.text }}>{(n.volume * 100).toFixed(0)}%</span>
                        {n.muted && <VolumeX size={12} color={T.red} style={{ marginLeft: 6 }} />}
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <StatusLed ok={n.state === 'running'} label={n.state || '—'} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
      </Panel>

      {/* Streams */}
      {pw.streams.length > 0 && (
        <Panel>
          <SectionLabel color={T.cyan}><Activity size={13} /> Active Streams</SectionLabel>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}`, color: T.muted, textAlign: 'left' }}>
                <th style={{ padding: '6px 10px', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>ID</th>
                <th style={{ padding: '6px 10px', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Client</th>
                <th style={{ padding: '6px 10px', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Media</th>
              </tr>
            </thead>
            <tbody>
              {pw.streams.map(s => (
                <tr key={s.id} style={{ borderBottom: `1px solid ${T.bg}` }}>
                  <td style={{ padding: '8px 10px', fontFamily: T.mono, color: T.muted, fontSize: 12 }}>{s.id}</td>
                  <td style={{ padding: '8px 10px', color: T.text, fontWeight: 500 }}>{s.client_name}</td>
                  <td style={{ padding: '8px 10px', color: T.muted }}>{s.media_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {/* Links (collapsible) */}
      <Panel>
        <button
          onClick={() => setExpandLinks(!expandLinks)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            background: 'none', border: 'none', cursor: 'pointer', color: T.accent, padding: 0,
          }}
        >
          <SectionLabel color={T.accent}>
            <Link2 size={13} /> Port Connections
            <span style={{ fontFamily: T.mono, fontSize: 11, color: T.muted, marginLeft: 6 }}>({pw.links.length})</span>
          </SectionLabel>
          <span style={{ marginLeft: 'auto' }}>
            {expandLinks ? <ChevronUp size={14} color={T.muted} /> : <ChevronDown size={14} color={T.muted} />}
          </span>
        </button>
        {expandLinks && pw.links.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 8 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}`, color: T.muted, textAlign: 'left' }}>
                <th style={{ padding: '5px 8px', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>ID</th>
                <th style={{ padding: '5px 8px', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Output</th>
                <th style={{ padding: '5px 8px' }}></th>
                <th style={{ padding: '5px 8px', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Input</th>
                <th style={{ padding: '5px 8px', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>State</th>
              </tr>
            </thead>
            <tbody>
              {pw.links.map(l => {
                const stateColor = l.state === 'active' || l.state === 'running' ? T.green
                  : l.state === 'error' ? T.red
                  : l.state === 'paused' ? T.amber : T.dim
                return (
                  <tr key={l.id} style={{ borderBottom: `1px solid ${T.bg}` }}>
                    <td style={{ padding: '5px 8px', fontFamily: T.mono, color: T.dim, fontSize: 11 }}>{l.id}</td>
                    <td style={{ padding: '5px 8px', fontFamily: T.mono, color: T.text, fontSize: 11 }}>{l.output_node}:{l.output_port}</td>
                    <td style={{ padding: '5px 8px', color: T.accent, fontSize: 11 }}>→</td>
                    <td style={{ padding: '5px 8px', fontFamily: T.mono, color: T.text, fontSize: 11 }}>{l.input_node}:{l.input_port}</td>
                    <td style={{ padding: '5px 8px', color: stateColor, fontWeight: 600, fontSize: 11 }}>{l.state || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {expandLinks && pw.links.length === 0 && (
          <span style={{ fontSize: 13, color: T.dim }}>No port connections</span>
        )}
      </Panel>
    </div>
  )
}

// ============================================================================
// LAYER 4 — Diagnostics & Settings
// ============================================================================

function DiagnosticsLayer({ pw }: { pw: ReturnType<typeof usePipeWire> }) {
  const quantumValues = [32, 64, 128, 256, 512, 1024, 2048]
  const currentForced = pw.settings.clock_force_quantum

  const handleQuantum = async (q: number) => {
    try { await pw.setQuantum(q) } catch (e) { console.error('Quantum change failed:', e) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Row 1: CPU + Latency */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Panel borderColor={`${T.green}25`}>
          <SectionLabel color={T.green}><Cpu size={13} /> CPU & DSP Load</SectionLabel>
          <CPUMeterPanel showBreakdown compact={false} />
        </Panel>
        <Panel borderColor={`${T.amber}25`}>
          <SectionLabel color={T.amber}><Activity size={13} /> Latency Analysis</SectionLabel>
          <LatencyDisplay showBreakdown compact={false} />
        </Panel>
      </div>

      {/* Row 2: Quantum Control */}
      <Panel>
        <SectionLabel color={T.purple}><Settings size={13} /> Buffer Size (Quantum)</SectionLabel>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          <button
            onClick={() => handleQuantum(0)}
            disabled={pw.isSettingQuantum}
            style={{
              padding: '6px 14px', borderRadius: 5, border: `1px solid ${currentForced === 0 ? T.accent : T.border}`,
              cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: currentForced === 0 ? `${T.accent}20` : T.surface,
              color: currentForced === 0 ? T.accent : T.muted,
            }}
          >
            Auto
          </button>
          {quantumValues.map(q => (
            <button
              key={q}
              onClick={() => handleQuantum(q)}
              disabled={pw.isSettingQuantum}
              style={{
                padding: '6px 14px', borderRadius: 5, fontFamily: T.mono,
                border: `1px solid ${currentForced === q ? T.accent : T.border}`,
                cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: currentForced === q ? `${T.accent}20` : T.surface,
                color: currentForced === q ? T.accent : T.muted,
              }}
            >
              {q}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: T.dim, fontFamily: T.mono }}>
          {quantumValues.map(q => `${q}→${((q / pw.effectiveRate) * 1000).toFixed(1)}ms`).join('  ·  ')}
          <span style={{ marginLeft: 8, opacity: 0.6 }}>(×2 round-trip)</span>
        </div>
      </Panel>

      {/* Row 3: Clock Settings + Latency Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Panel>
          <SectionLabel color={T.muted}><Settings size={13} /> Clock Configuration</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {[
              ['clock.rate', `${pw.settings.clock_rate} Hz`],
              ['clock.force-rate', pw.settings.clock_force_rate ? `${pw.settings.clock_force_rate} Hz` : 'auto'],
              ['clock.quantum', `${pw.settings.clock_quantum}`],
              ['clock.force-quantum', pw.settings.clock_force_quantum ? `${pw.settings.clock_force_quantum}` : 'auto'],
              ['clock.min-quantum', `${pw.settings.clock_min_quantum}`],
              ['clock.max-quantum', `${pw.settings.clock_max_quantum}`],
              ['clock.allowed-rates', pw.settings.clock_allowed_rates.join(', ')],
            ].map(([label, val]) => (
              <div key={label as string} style={{ background: T.surface, borderRadius: 6, padding: '10px 12px' }}>
                <div style={{ fontSize: 10, color: T.dim, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text, fontFamily: T.mono }}>{val}</div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel>
          <SectionLabel color={T.teal}><Activity size={13} /> Latency Breakdown</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <div style={{ background: T.surface, borderRadius: 6, padding: '14px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: T.dim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Graph</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: T.accent, fontFamily: T.mono }}>
                {pw.graphLatencyMs.toFixed(1)}<span style={{ fontSize: 11, color: T.dim, marginLeft: 2 }}>ms</span>
              </div>
            </div>
            <div style={{ background: T.surface, borderRadius: 6, padding: '14px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: T.dim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Driver</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: T.purple, fontFamily: T.mono }}>
                {pw.driverLatencyMs.toFixed(1)}<span style={{ fontSize: 11, color: T.dim, marginLeft: 2 }}>ms</span>
              </div>
            </div>
            <div style={{ background: T.surface, borderRadius: 6, padding: '14px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: T.dim, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Total</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: pw.isHighLatency ? T.amber : T.green, fontFamily: T.mono }}>
                {pw.totalLatencyMs.toFixed(1)}<span style={{ fontSize: 11, color: T.dim, marginLeft: 2 }}>ms</span>
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  )
}

// ============================================================================
// Main Page
// ============================================================================

export function AudioEnginePage() {
  const pw = usePipeWire()
  const [tab, setTab] = useState<Tab>('overview')

  const overallColor = pw.overallStatus === 'ok' ? T.green
    : pw.overallStatus === 'warning' ? T.amber
    : pw.overallStatus === 'error' ? T.red : T.dim

  return (
    <div style={{
      padding: '24px 32px', maxWidth: 1400, margin: '0 auto', color: T.text,
      background: `linear-gradient(180deg, ${T.bg} 0%, #0c1220 100%)`,
      minHeight: '100vh',
    }}>
      {/* ── Header ── */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24,
        paddingBottom: 20, borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `linear-gradient(135deg, ${T.accent}20, ${T.purple}20)`,
          border: `1px solid ${T.accent}30`,
        }}>
          <Activity size={22} color={T.accent} />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.3px' }}>
            Audio Engine
          </h1>
          <p style={{ margin: '2px 0 0', color: T.muted, fontSize: 12 }}>
            Real-time engine monitoring, metering & signal path control
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, color: T.dim }}>
            {pw.isConnected ? '● WS' : '○ Poll'}
          </span>
          <span style={{
            padding: '4px 12px', borderRadius: 5, fontSize: 11, fontWeight: 700,
            fontFamily: T.mono, color: overallColor,
            background: `${overallColor}12`, border: `1px solid ${overallColor}30`,
            letterSpacing: 0.5,
          }}>
            {pw.overallStatus.toUpperCase()}
          </span>
        </div>
      </header>

      {/* ── Tab Bar ── */}
      <nav style={{
        display: 'flex', gap: 2, marginBottom: 24,
        borderBottom: `1px solid ${T.border}`,
      }}>
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 20px', border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: active ? 700 : 500,
                textTransform: 'uppercase', letterSpacing: 0.8,
                color: active ? t.color : T.dim,
                backgroundColor: active ? `${t.color}08` : 'transparent',
                borderBottom: active ? `2px solid ${t.color}` : '2px solid transparent',
                marginBottom: -1, transition: 'all 0.15s ease',
              }}
            >
              <Icon size={14} /> {t.label}
            </button>
          )
        })}
      </nav>

      {/* ── Layer Content ── */}
      <div>
        {tab === 'overview' && <OverviewLayer pw={pw} />}
        {tab === 'metering' && <MeteringLayer />}
        {tab === 'routing' && <RoutingLayer pw={pw} />}
        {tab === 'diagnostics' && <DiagnosticsLayer pw={pw} />}
      </div>

      {/* ── Footer ── */}
      <footer style={{
        marginTop: 32, padding: '12px 0', borderTop: `1px solid ${T.border}`,
        display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.dim,
      }}>
        <span>
          PipeWire {pw.daemonVersion || '—'} · {pw.effectiveRate / 1000}kHz / {pw.effectiveQuantum}smp · {pw.totalLatencyMs.toFixed(1)}ms
        </span>
        <span>
          {pw.metrics.timestamp ? new Date(pw.metrics.timestamp).toLocaleTimeString() : '—'}
        </span>
      </footer>
    </div>
  )
}

export default AudioEnginePage
