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

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Pulse, Broadcast, Cpu, Link, SpeakerHigh, Microphone, Warning,
  CheckCircle, SpeakerX, GearSix, Lightning,
  ChartBar, Stack, GitBranch, CaretDown, CaretUp, ArrowsClockwise
} from '@phosphor-icons/react'
import { usePipeWire } from '../hooks/usePipeWire'
import { audioApi, getWsUrl, latencyV2Api } from '../../map2/api'
import type { LatencyJitterStats } from '../../map2/api'
import type { AudioSourceTruthPayload } from '../../map2/types'
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
  mono:      "var(--font-mono)",
  accent:    '#3b82f6',    // blue
  green:     '#22c55e',
  amber:     '#f59e0b',
  red:       '#ef4444',
  purple:    '#a78bfa',
  cyan:      '#60a5fa',
  pink:      '#60a5fa',
  teal:      '#60a5fa',
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
      borderRadius: 0,
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
  { id: 'overview',    label: 'Engine Cluster',  icon: Stack,      color: T.accent },
  { id: 'metering',    label: 'Metering',        icon: ChartBar,   color: T.green },
  { id: 'routing',     label: 'Signal Path',     icon: GitBranch,  color: T.purple },
  { id: 'diagnostics', label: 'Diagnostics',     icon: GearSix,    color: T.amber },
]

function SOTCell({ label, value, color = T.text }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: T.surface, borderRadius: 0, padding: '10px 12px', border: `1px solid ${T.border}` }}>
      <div style={{ fontSize: 10, color: T.dim, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color, fontFamily: T.mono, fontWeight: 600, overflowWrap: 'anywhere' }}>{value}</div>
    </div>
  )
}

function SourceOfTruthPanel() {
  const sot = useQuery<AudioSourceTruthPayload>({
    queryKey: ['audio-source-of-truth'],
    queryFn: audioApi.getSourceOfTruth,
    refetchInterval: 5000,
    staleTime: 2000,
  })

  if (sot.isLoading && !sot.data) {
    return (
      <Panel borderColor={`${T.accent}35`} style={{ marginBottom: 22 }}>
        <SectionLabel color={T.accent}><Pulse size={13} weight="duotone" /> Single Source Of Truth</SectionLabel>
        <span style={{ fontSize: 12, color: T.muted }}>Loading bitrate and clock map…</span>
      </Panel>
    )
  }

  if (!sot.data) {
    return (
      <Panel borderColor={`${T.red}35`} style={{ marginBottom: 22 }}>
        <SectionLabel color={T.red}><Pulse size={13} weight="duotone" /> Single Source Of Truth</SectionLabel>
        <span style={{ fontSize: 12, color: T.red }}>
          Unavailable: {sot.error instanceof Error ? sot.error.message : 'API error'}
        </span>
      </Panel>
    )
  }

  const payload = sot.data
  const statusColor = payload.status === 'aligned' ? T.green : payload.status === 'warning' ? T.amber : T.red
  const issuePreview = payload.consistency.issues.slice(0, 3)

  return (
    <Panel borderColor={`${statusColor}35`} style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
        <SectionLabel color={statusColor}>
          <Pulse size={13} weight="duotone" /> Single Source Of Truth
        </SectionLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            padding: '3px 10px',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 700,
            fontFamily: T.mono,
            color: statusColor,
            border: `1px solid ${statusColor}40`,
            background: `${statusColor}14`,
          }}>
            {payload.status.toUpperCase()}
          </span>
          <span style={{ fontSize: 11, color: T.dim }}>
            {new Date(payload.timestamp).toLocaleTimeString()}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        <SOTCell label="Profile" value={payload.profile.selected_profile} />
        <SOTCell label="Clock Master" value={payload.profile.clock_master} />
        <SOTCell label="Target Rate" value={`${payload.configured.engine_rate_hz} Hz`} color={T.accent} />
        <SOTCell label="Target Buffer" value={`${payload.configured.buffer_size_samples} smp`} />
        <SOTCell label="Bit Depth" value={`${payload.configured.bits_per_sample}-bit`} />
        <SOTCell
          label="Engine Runtime"
          value={`${payload.runtime.engine.sample_rate_hz || 0} Hz / ${payload.runtime.engine.buffer_size_samples || 0} smp`}
          color={payload.runtime.engine.running ? T.green : T.amber}
        />
        <SOTCell
          label="PipeWire Runtime"
          value={`${payload.runtime.pipewire.effective_rate_hz || 0} Hz / ${payload.runtime.pipewire.effective_quantum_samples || 0} smp`}
          color={payload.runtime.pipewire.available ? T.purple : T.red}
        />
        <SOTCell
          label="S/PDIF Map"
          value={`${payload.configured.spdif.enabled ? 'ON' : 'OFF'} · ${payload.configured.spdif_rate_hz} Hz`}
          color={payload.configured.spdif.enabled ? T.cyan : T.dim}
        />
        <SOTCell
          label="AVB State"
          value={`${payload.runtime.avb.enabled ? 'ON' : 'OFF'} · ${payload.runtime.avb.state}`}
          color={payload.runtime.avb.available ? T.green : T.amber}
        />
        <SOTCell label="Allowed Rates" value={payload.configured.allowed_rates_hz.join(', ')} />
      </div>

      {issuePreview.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {issuePreview.map((issue) => {
            const c = issue.severity === 'error' ? T.red : issue.severity === 'warning' ? T.amber : T.accent
            return (
              <div key={issue.id} style={{
                border: `1px solid ${c}35`,
                background: `${c}12`,
                color: c,
                borderRadius: 6,
                padding: '8px 10px',
                fontSize: 12,
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10,
                flexWrap: 'wrap',
              }}>
                <span>{issue.message}</span>
                <span style={{ fontFamily: T.mono, opacity: 0.9 }}>{issue.id}</span>
              </div>
            )
          })}
          {payload.consistency.issue_count > issuePreview.length && (
            <span style={{ fontSize: 11, color: T.dim }}>
              +{payload.consistency.issue_count - issuePreview.length} more issue(s) in API payload
            </span>
          )}
        </div>
      )}
    </Panel>
  )
}

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
            <Broadcast size={13} weight="duotone" /> PipeWire Audio Server
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
        <Panel borderColor={T.border}>
          <SectionLabel color={T.accent}>
            <Lightning size={13} weight="duotone" /> JUCE Audio Engine
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
          <SectionLabel color={T.red}><Warning size={13} weight="duotone" /> Alerts</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pw.alerts.map((a, i) => {
              const c = a.severity === 'error' ? T.red : a.severity === 'warning' ? T.amber : T.accent
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', borderRadius: 6, background: `${c}10`,
                  border: `1px solid ${c}25`, fontSize: 12, color: c,
                }}>
                  <Warning size={13} weight="duotone" />
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
          <CheckCircle size={14} weight="duotone" /> No active alerts — system healthy
        </div>
      )}

      {/* ── Default I/O ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Panel>
          <SectionLabel color={T.green}><SpeakerHigh size={13} weight="duotone" /> Default Sink (Output)</SectionLabel>
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
          <SectionLabel color={T.cyan}><Microphone size={13} weight="duotone" /> Default Source (Input)</SectionLabel>
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
          <SectionLabel color={T.accent}><Lightning size={13} weight="duotone" /> Frequency Spectrum</SectionLabel>
          <SpectrumAnalyzer mode="bars" height={200} barCount={64} showLabels showPeaks colors={[T.green, T.amber, T.red]} />
        </Panel>
        <Panel borderColor={`${T.green}25`}>
          <SectionLabel color={T.green}><ChartBar size={13} weight="duotone" /> Signal Levels</SectionLabel>
          <VuMeterDisplay showInput showOutput />
        </Panel>
      </div>

      {/* Row 2: LUFS + Phase + Dynamics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        <Panel borderColor={`${T.accent}25`}>
          <SectionLabel color={T.accent}><Pulse size={13} weight="duotone" /> Loudness (LUFS)</SectionLabel>
          <LoudnessMeter targetLufs={-14} truePeakLimit={-1} compact={false} />
        </Panel>
        <Panel borderColor={`${T.pink}25`}>
          <SectionLabel color={T.pink}><Pulse size={13} weight="duotone" /> Stereo Phase</SectionLabel>
          <PhaseCorrelationMeter showStereoInfo orientation="horizontal" />
        </Panel>
        <Panel borderColor={`${T.amber}25`}>
          <SectionLabel color={T.amber}><Pulse size={13} weight="duotone" /> Dynamics</SectionLabel>
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
        <SectionLabel color={T.purple}><SpeakerHigh size={13} weight="duotone" /> Audio Devices</SectionLabel>
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
        <SectionLabel color={T.green}><SpeakerHigh size={13} weight="duotone" /> Sink & Source Nodes</SectionLabel>
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
                          {isSink ? <SpeakerHigh size={12} weight="duotone" /> : <Microphone size={12} weight="duotone" />}
                          {isSink ? 'Sink' : 'Source'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', fontFamily: T.mono, color: T.muted, fontSize: 12 }}>{n.channels ?? '—'}</td>
                      <td style={{ padding: '8px 10px', fontFamily: T.mono, fontSize: 12 }}>
                        <span style={{ color: n.volume > 1 ? T.amber : T.text }}>{(n.volume * 100).toFixed(0)}%</span>
                        {n.muted && <SpeakerX size={12} weight="duotone" color={T.red} style={{ marginLeft: 6 }} />}
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
          <SectionLabel color={T.cyan}><Pulse size={13} weight="duotone" /> Active Streams</SectionLabel>
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
            <Link size={13} weight="duotone" /> Port Connections
            <span style={{ fontFamily: T.mono, fontSize: 11, color: T.muted, marginLeft: 6 }}>({pw.links.length})</span>
          </SectionLabel>
          <span style={{ marginLeft: 'auto' }}>
            {expandLinks ? <CaretUp size={14} weight="bold" color={T.muted} /> : <CaretDown size={14} weight="bold" color={T.muted} />}
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

interface TimingJitterPoint {
  timestampMs: number
  deltaMs: number
  deviationMs: number
  callbackCount: number
  xrunCount: number
  running: boolean
}

function deriveGate(stats: LatencyJitterStats) {
  const rtlP95 = stats.rtl_p95_ms ?? 0
  const hardFail = rtlP95 > 5.0 || stats.p95_ms > 1.0 || stats.xrun_count > 0
  const warn = !hardFail && (rtlP95 > 3.5 || stats.p95_ms > 0.5)
  return hardFail ? 'FAIL' : warn ? 'WARN' : 'PASS'
}

function LatencyMonitorPanel() {
  const [points, setPoints] = useState<TimingJitterPoint[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [gateResult, setGateResult] = useState<{
    gate: 'PASS' | 'WARN' | 'FAIL'
    checkedAt: number
    rtlP95: number
    jitterP95: number
    xruns: number
  } | null>(null)
  const [isResettingXruns, setIsResettingXruns] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  const jitterStatsQuery = useQuery({
    queryKey: ['latency-jitter-stats'],
    queryFn: latencyV2Api.getJitterStats,
    refetchInterval: 1000,
    staleTime: 500,
  })

  useEffect(() => {
    const ws = new WebSocket(getWsUrl())
    wsRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
      ws.send(JSON.stringify({ action: 'subscribe', topic: 'timing_jitter' }))
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        if (message?.type !== 'timing_jitter' && message?.type !== 'timing_jitter_update') {
          return
        }
        const data = message?.data ?? {}
        const ts = message?.timestamp ? Date.parse(message.timestamp) : Date.now()
        const point: TimingJitterPoint = {
          timestampMs: Number.isFinite(ts) ? ts : Date.now(),
          deltaMs: Number(data.delta_ms ?? 0),
          deviationMs: Number(data.deviation_ms ?? 0),
          callbackCount: Number(data.callback_count ?? 0),
          xrunCount: Number(data.xrun_count ?? 0),
          running: Boolean(data.running ?? true),
        }
        setPoints((prev) => [...prev.slice(-599), point])
      } catch (error) {
        console.error('timing_jitter parse error:', error)
      }
    }

    ws.onclose = () => setIsConnected(false)
    ws.onerror = () => setIsConnected(false)

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'unsubscribe', topic: 'timing_jitter' }))
      }
      ws.close()
      wsRef.current = null
    }
  }, [])

  const latestPoint = points.length > 0 ? points[points.length - 1] : null
  const sparklinePoints = useMemo(() => points.slice(-600), [points])
  const maxDeviation = useMemo(() => {
    const observedMax = Math.max(0, ...sparklinePoints.map((point) => point.deviationMs))
    return Math.max(3, observedMax)
  }, [sparklinePoints])
  const sparklinePath = useMemo(() => {
    if (sparklinePoints.length === 0) return ''
    if (sparklinePoints.length === 1) {
      const singleY = 120 - (sparklinePoints[0].deviationMs / maxDeviation) * 100
      return `M 0 ${singleY.toFixed(2)} L 600 ${singleY.toFixed(2)}`
    }
    const step = 600 / (sparklinePoints.length - 1)
    return sparklinePoints.map((point, index) => {
      const x = (index * step).toFixed(2)
      const y = (120 - (point.deviationMs / maxDeviation) * 100).toFixed(2)
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`
    }).join(' ')
  }, [sparklinePoints, maxDeviation])

  const amberLineY = 120 - (0.5 / maxDeviation) * 100
  const redLineY = 120 - (1.0 / maxDeviation) * 100
  const jitterStats = jitterStatsQuery.data
  const rtlP95 = jitterStats?.rtl_p95_ms ?? 0
  const rtlHasValue = (jitterStats?.sample_count ?? 0) > 0
  const rtlColor = rtlP95 > 5.0 ? T.red : rtlP95 >= 3.5 ? T.amber : T.green
  const engineOffline = jitterStats?.running === false && sparklinePoints.length === 0

  const lastXrunTimestamp = useMemo(() => {
    for (let i = sparklinePoints.length - 1; i > 0; i -= 1) {
      if (sparklinePoints[i].xrunCount > sparklinePoints[i - 1].xrunCount) {
        return new Date(sparklinePoints[i].timestampMs).toLocaleTimeString()
      }
    }
    return '—'
  }, [sparklinePoints])

  const runGateCheck = async () => {
    const stats = await latencyV2Api.getJitterStats()
    const gate = deriveGate(stats)
    setGateResult({
      gate,
      checkedAt: Date.now(),
      rtlP95: stats.rtl_p95_ms ?? 0,
      jitterP95: stats.p95_ms,
      xruns: stats.xrun_count,
    })
  }

  const resetXruns = async () => {
    try {
      setIsResettingXruns(true)
      await latencyV2Api.resetXruns()
      await jitterStatsQuery.refetch()
    } finally {
      setIsResettingXruns(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {engineOffline && (
        <div style={{
          border: `1px solid ${T.amber}35`,
          background: `${T.amber}10`,
          color: T.amber,
          borderRadius: 4,
          padding: '8px 10px',
          fontSize: 12,
        }}>
          Engine offline - no timing data
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 220px', gap: 12 }}>
        <div style={{
          border: `1px solid ${T.border}`,
          borderRadius: 4,
          background: T.surface,
          padding: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: 1 }}>RTL P95</div>
          <div style={{ fontFamily: T.mono, fontSize: 28, fontWeight: 700, color: rtlHasValue ? rtlColor : T.dim, lineHeight: 1 }}>
            {rtlHasValue ? rtlP95.toFixed(2) : '—'}
            <span style={{ fontSize: 12, marginLeft: 4, color: T.dim }}>ms</span>
          </div>
          <div style={{ fontSize: 11, color: T.dim }}>Round-trip latency @ 64 samples / 48 kHz</div>
          <div style={{ fontSize: 11, color: isConnected ? T.green : T.amber }}>
            {isConnected ? 'WS live' : 'WS reconnecting'}
          </div>
        </div>

        <div style={{
          border: `1px solid ${T.border}`,
          borderRadius: 4,
          background: T.surface,
          padding: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
              Jitter Sparkline (60s)
            </div>
            <div style={{ fontSize: 11, color: T.dim, fontFamily: T.mono }}>
              p95 {jitterStats?.p95_ms?.toFixed(3) ?? '—'} ms
            </div>
          </div>
          <svg viewBox="0 0 600 140" style={{ width: '100%', height: 140, border: `1px solid ${T.border}`, borderRadius: 4, background: T.bg }}>
            <line x1="0" y1={amberLineY} x2="600" y2={amberLineY} stroke={T.amber} strokeDasharray="6 5" strokeWidth="1" />
            <line x1="0" y1={redLineY} x2="600" y2={redLineY} stroke={T.red} strokeDasharray="6 5" strokeWidth="1" />
            {sparklinePath && <path d={sparklinePath} fill="none" stroke={T.cyan} strokeWidth="2" />}
          </svg>
          <div style={{ fontSize: 11, color: T.dim, fontFamily: T.mono }}>
            latest Δ {latestPoint ? latestPoint.deviationMs.toFixed(3) : '—'} ms
          </div>
        </div>

        <div style={{
          border: `1px solid ${T.border}`,
          borderRadius: 4,
          background: T.surface,
          padding: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: 1 }}>Xruns</div>
          <div style={{
            fontFamily: T.mono,
            fontSize: 28,
            lineHeight: 1,
            fontWeight: 700,
            color: (jitterStats?.xrun_count ?? 0) > 0 ? T.red : T.green,
          }}>
            {jitterStats?.xrun_count ?? 0}
          </div>
          <div style={{ fontSize: 11, color: T.dim }}>Last xrun: {lastXrunTimestamp}</div>
          <button
            onClick={resetXruns}
            disabled={isResettingXruns}
            style={{
              border: `1px solid ${T.border}`,
              borderRadius: 4,
              background: T.bg,
              color: T.text,
              cursor: isResettingXruns ? 'wait' : 'pointer',
              padding: '6px 8px',
              fontSize: 11,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <ArrowsClockwise size={12} weight="duotone" />
            Reset
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={runGateCheck}
          style={{
            border: `1px solid ${T.border}`,
            borderRadius: 4,
            background: T.surface,
            color: T.text,
            padding: '6px 10px',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          Gate Check
        </button>
        {gateResult && (
          <span style={{
            fontFamily: T.mono,
            fontSize: 11,
            color: gateResult.gate === 'FAIL' ? T.red : gateResult.gate === 'WARN' ? T.amber : T.green,
          }}>
            {gateResult.gate} · RTL p95 {gateResult.rtlP95.toFixed(3)}ms · jitter p95 {gateResult.jitterP95.toFixed(3)}ms · xruns {gateResult.xruns} · {new Date(gateResult.checkedAt).toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  )
}

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
          <SectionLabel color={T.green}><Cpu size={13} weight="duotone" /> CPU & DSP Load</SectionLabel>
          <CPUMeterPanel showBreakdown compact={false} />
        </Panel>
        <Panel borderColor={`${T.amber}25`}>
          <SectionLabel color={T.amber}><Pulse size={13} weight="duotone" /> Latency Analysis</SectionLabel>
          <LatencyDisplay showBreakdown compact={false} />
        </Panel>
      </div>

      <Panel borderColor={`${T.cyan}25`}>
        <SectionLabel color={T.cyan}><Pulse size={13} weight="duotone" /> Latency Monitor</SectionLabel>
        <LatencyMonitorPanel />
      </Panel>

      {/* Row 2: Quantum Control */}
      <Panel>
        <SectionLabel color={T.purple}><GearSix size={13} weight="duotone" /> Buffer Size (Quantum)</SectionLabel>
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
          <SectionLabel color={T.muted}><GearSix size={13} weight="duotone" /> Clock Configuration</SectionLabel>
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
          <SectionLabel color={T.teal}><Pulse size={13} weight="duotone" /> Latency Breakdown</SectionLabel>
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
    <div className="audio-engine-page" style={{
      padding: '24px 32px', maxWidth: 1400, margin: '0 auto', color: T.text,
      background: T.bg,
      minHeight: '100vh',
    }}>
      {/* ── Header ── */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24,
        paddingBottom: 20, borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: T.surface,
          border: `1px solid ${T.border}`,
        }}>
          <Pulse size={22} weight="duotone" color={T.accent} />
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
            padding: '4px 12px', borderRadius: 0, fontSize: 11, fontWeight: 700,
            fontFamily: T.mono, color: overallColor,
            background: `${overallColor}12`, border: `1px solid ${overallColor}30`,
            letterSpacing: 0.5,
          }}>
            {pw.overallStatus.toUpperCase()}
          </span>
        </div>
      </header>

      {/* ── Tab Bar ── */}
      <nav className="audio-engine-tabbar" role="tablist" style={{
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
              role="tab"
              aria-selected={active}
              data-selected={active ? 'true' : 'false'}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 20px', border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: active ? 700 : 500,
                textTransform: 'uppercase', letterSpacing: 0.8,
                color: active ? 'var(--interactive)' : 'var(--text-secondary)',
                backgroundColor: 'transparent',
                borderBottom: active ? '2px solid var(--interactive)' : '2px solid transparent',
                marginBottom: -1, transition: 'all 0.15s ease',
              }}
            >
              <Icon size={14} /> {t.label}
            </button>
          )
        })}
      </nav>

      {/* ── Single Source of Truth ── */}
      <SourceOfTruthPanel />

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
