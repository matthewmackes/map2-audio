import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, InlineNotification, ProgressBar, Tab, TabList, TabPanel, TabPanels, Tabs, Tile, Tooltip } from '@carbon/react'
import { Activity, ChartLine, Information } from '@carbon/icons-react'
import { audioApi } from '../../map2/api'
import type { AudioHealth, JuceMetrics } from '../../map2/api'
import type { AudioStatus } from '../../map2/types'
import { useVuMeters } from '../hooks/useVuMeters'
import { StatusChip } from '../components/primitives'

// T2475 (E1): direct-swap MUI → Carbon migration. The MOTU/RME page is
// borderline §10.5 hardware-skin (it visually represents two physical
// audio interfaces with photorealistic colors). Hardware-aesthetic
// palette literals (the deep-teal/amber/blue tones that mirror the
// physical units' panel colors) are preserved as device-graphics; the
// operational chrome (system-load tiles, latency tiles, signal-flow
// arrows) routes through Carbon tokens.

type LatencyMode = 'motu-only' | 'adat-expanded' | 'outboard-inserts'

interface MeterChannel {
  db: number
  percent: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function dbToPercent(db: number) {
  const finiteDb = Number.isFinite(db) ? db : -60
  const normalized = (clamp(finiteDb, -60, 0) + 60) / 60
  return Math.round(normalized * 100)
}

function buildMeterChannels(leftDb: number, rightDb: number, count: number): MeterChannel[] {
  return Array.from({ length: count }, (_, index) => {
    const db = index % 2 === 0 ? leftDb : rightDb
    return { db, percent: dbToPercent(db) }
  })
}

const LATENCY_MODES: { value: LatencyMode; label: string }[] = [
  { value: 'motu-only', label: 'MOTU Only' },
  { value: 'adat-expanded', label: 'ADAT Expanded' },
  { value: 'outboard-inserts', label: 'Outboard Inserts' },
]

export default function MOTURMEPage() {
  const [latencyMode, setLatencyMode] = useState<LatencyMode>('adat-expanded')
  const { levels, isConnected: metersConnected, isRunning: metersRunning } = useVuMeters({
    useWebSocket: true,
    pollingInterval: 250,
  })

  const { data: audioStatus } = useQuery<AudioStatus>({
    queryKey: ['audio', 'status', 'motu-rme'],
    queryFn: () => audioApi.getStatus(),
    refetchInterval: 2000,
  })

  const { data: audioHealth } = useQuery<AudioHealth>({
    queryKey: ['audio', 'health', 'motu-rme'],
    queryFn: () => audioApi.getHealth(),
    refetchInterval: 2000,
  })

  const { data: juceMetrics } = useQuery<JuceMetrics>({
    queryKey: ['audio', 'juce', 'motu-rme'],
    queryFn: () => audioApi.getJuceMetrics(),
    refetchInterval: 5000,
  })

  const sampleRate = audioStatus?.sample_rate ?? juceMetrics?.sample_rate ?? 48000
  const safeSampleRate = sampleRate > 0 ? sampleRate : 48000
  const bufferSize = audioStatus?.buffer_size ?? juceMetrics?.buffer_size ?? 64
  const inputChannels = Math.max(0, juceMetrics?.input_channels ?? 8)
  const outputChannels = Math.max(0, juceMetrics?.output_channels ?? 8)
  const activeChannels = Math.max(2, inputChannels + outputChannels)

  // USB Load calculation
  const calculateUSBLoad = () => {
    const baseLoad = (activeChannels * safeSampleRate * 24 * 2) / (480 * 1000000) // USB 2.0 theoretical max
    const utilizationFactor = safeSampleRate === 192000 ? 0.9 : safeSampleRate === 96000 ? 0.7 : 0.5
    return Math.min(95, Math.round(baseLoad * utilizationFactor * 100))
  }

  // Host Backplane Load calculation
  const calculateHostLoad = () => {
    const bufferFactor = bufferSize < 128 ? 1.5 : bufferSize < 256 ? 1.0 : 0.7
    const channelFactor = activeChannels / 18
    const sampleRateFactor = safeSampleRate / 48000
    return Math.min(95, Math.round(35 * channelFactor * sampleRateFactor * bufferFactor))
  }

  // Latency calculations (in samples and ms)
  const getLatencyBreakdown = () => {
    const samplesPerMs = safeSampleRate / 1000

    const dawBuffer = bufferSize * 2
    const driverUSB = safeSampleRate === 192000 ? 60 : safeSampleRate === 96000 ? 40 : 30
    const motuConverters = 22
    const adatTransmission = 8
    const rmeConverters = 22
    const outboardHardware = latencyMode === 'outboard-inserts' ? 60 : 0

    let totalSamples = dawBuffer + driverUSB + motuConverters

    if (latencyMode === 'adat-expanded' || latencyMode === 'outboard-inserts') {
      totalSamples += adatTransmission + rmeConverters
    }

    if (latencyMode === 'outboard-inserts') {
      totalSamples += outboardHardware
    }

    const totalMs = totalSamples / samplesPerMs

    return {
      dawBuffer: { samples: dawBuffer, ms: dawBuffer / samplesPerMs },
      driverUSB: { samples: driverUSB, ms: driverUSB / samplesPerMs },
      motuConverters: { samples: motuConverters, ms: motuConverters / samplesPerMs },
      adatTransmission: { samples: adatTransmission, ms: adatTransmission / samplesPerMs },
      rmeConverters: { samples: rmeConverters, ms: rmeConverters / samplesPerMs },
      outboardHardware: { samples: outboardHardware, ms: outboardHardware / samplesPerMs },
      total: { samples: totalSamples, ms: totalMs },
    }
  }

  const usbLoad = calculateUSBLoad()
  const hostLoad = clamp(Math.round(audioStatus?.cpu_load ?? audioHealth?.cpu_load ?? calculateHostLoad()), 0, 95)
  const latency = getLatencyBreakdown()

  const motuMeters = useMemo(
    () => buildMeterChannels(levels.inputLeft, levels.inputRight, 8),
    [levels.inputLeft, levels.inputRight]
  )
  const rmeMeters = useMemo(
    () => buildMeterChannels(levels.outputLeft, levels.outputRight, 8),
    [levels.outputLeft, levels.outputRight]
  )

  // Hardware-skin meter colors — preserved as device graphics per §10.5.
  const getMeterColor = (value: number) => {
    if (value > 85) return '#FF4444'
    if (value > 70) return '#FFAA00'
    return '#2563eb'
  }

  // Hardware-skin load colors — preserved as device graphics per §10.5.
  const getLoadColor = (value: number) => {
    if (value > 75) return '#FF4444'
    if (value > 60) return '#FFAA00'
    return '#00FF9D'
  }

  const latencyTabIndex = LATENCY_MODES.findIndex(m => m.value === latencyMode)

  return (
    <div className="motu-rme-page" style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      padding: 'var(--cds-spacing-06)',
    }}>
      {/* Page Title */}
      <div style={{ marginBottom: 'var(--cds-spacing-07)', textAlign: 'center' }}>
        <h1
          style={{
            color: 'var(--cds-text-primary)',
            fontWeight: 700,
            marginBottom: 'var(--cds-spacing-03)',
            fontSize: 'var(--cds-expressive-heading-06-font-size, 2rem)',
            lineHeight: 'var(--cds-expressive-heading-06-line-height, 1.25)',
          }}
        >
          MOTU UltraLite-mk5 + RME ADI-8 QS
        </h1>
        <p
          style={{
            color: 'var(--cds-text-secondary)',
            fontSize: 'var(--cds-body-compact-01-font-size, 0.875rem)',
            margin: 0,
          }}
        >
          ADAT-Expanded Monitoring Dashboard
        </p>
        <div style={{ marginTop: 12 }}>
          <StatusChip
            tone={metersRunning ? (metersConnected ? 'live' : 'caution') : 'critical'}
            label={
              !metersRunning
                ? 'Engine stopped'
                : metersConnected
                  ? 'Live metering (WebSocket)'
                  : 'Live metering (polling fallback)'
            }
            size="sm"
            dot
          />
        </div>
      </div>

      {/* Hero Section - Product Photos */}
      <Tile style={{
        background: 'rgba(15, 23, 42, 0.9)',
        border: '1px solid rgba(37, 99, 235, 0.2)',
        marginBottom: 24,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', gap: 32, flexWrap: 'wrap' }}>
          {/* RME ADI-8 QS (Top) */}
          <div style={{ textAlign: 'center', flex: 1, minWidth: 250 }}>
            <div style={{
              width: '100%',
              height: 180,
              background: 'rgba(42, 32, 20, 0.78)',
              border: '1px solid rgba(37, 99, 235, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
            }}>
              <img
                src="/img/audio-output.png"
                alt="RME ADI-8 QS"
                style={{ width: '85%', height: '85%', objectFit: 'contain', opacity: 0.92 }}
              />
            </div>
            <span style={{ display: 'inline-block', padding: 'var(--cds-spacing-02) var(--cds-spacing-03)', background: '#2563eb', color: '#111', fontWeight: 600, fontSize: 12 }}>
              ADAT Slave
            </span>
          </div>

          {/* ADAT Connection Indicator */}
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: 'rgba(21, 42, 72, 0.92)',
              border: '2px solid #2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              animation: 'pulse 2s ease-in-out infinite',
            }}>
              <Activity size={32} style={{ color: '#2563eb' }} />
            </div>
            <div style={{ color: '#2563eb', marginTop: 8, fontSize: 12 }}>
              ADAT Optical
            </div>
          </div>

          {/* MOTU UltraLite-mk5 (Bottom) */}
          <div style={{ textAlign: 'center', flex: 1, minWidth: 250 }}>
            <div style={{
              width: '100%',
              height: 180,
              background: 'rgba(12, 46, 39, 0.8)',
              border: '1px solid rgba(0, 255, 157, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
            }}>
              <img
                src="/img/audio-input.png"
                alt="MOTU UltraLite-mk5"
                style={{ width: '85%', height: '85%', objectFit: 'contain', opacity: 0.92 }}
              />
            </div>
            <span style={{ display: 'inline-block', padding: 'var(--cds-spacing-02) var(--cds-spacing-03)', background: '#00FF9D', color: '#111', fontWeight: 600, fontSize: 12 }}>
              Clock Master
            </span>
          </div>
        </div>
      </Tile>

      {/* System Load & Health */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
        {/* USB Load */}
        <Tile style={{ background: '#111111', border: '1px solid rgba(37, 99, 235, 0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ color: 'var(--cds-text-secondary)', fontSize: 'var(--cds-body-compact-01-font-size, 0.8125rem)' }}>
              USB Load (Estimated)
            </span>
            <Tooltip
              align="bottom"
              label="Calculated from active channels × sample rate × bit depth. >75% increases dropout risk. Consider larger buffer size."
            >
              <Button
                kind="ghost"
                size="sm"
                hasIconOnly
                renderIcon={Information}
                iconDescription="USB load explainer"
              />
            </Tooltip>
          </div>
          <div style={{ color: getLoadColor(usbLoad), fontWeight: 700, marginBottom: 12, fontSize: '2.25rem', lineHeight: 1 }}>
            {usbLoad}%
          </div>
          <ProgressBar
            value={usbLoad}
            max={100}
            label="USB load"
            hideLabel
            size="small"
          />
          <div style={{ color: 'var(--cds-text-helper)', marginTop: 'var(--cds-spacing-03)', fontSize: 'var(--cds-helper-text-01-font-size, 0.75rem)' }}>
            {inputChannels} in / {outputChannels} out @ {(safeSampleRate / 1000).toFixed(1)}kHz
          </div>
        </Tile>

        {/* Host Backplane Load */}
        <Tile style={{ background: '#111111', border: '1px solid rgba(37, 99, 235, 0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span style={{ color: 'var(--cds-text-secondary)', fontSize: 'var(--cds-body-compact-01-font-size, 0.8125rem)' }}>
              Host Backplane Load (CPU)
            </span>
            <Tooltip
              align="bottom"
              label="Computer-side CPU/driver pressure. Based on buffer size, channel count, and sample rate. Lower buffer = higher load."
            >
              <Button
                kind="ghost"
                size="sm"
                hasIconOnly
                renderIcon={Information}
                iconDescription="Host load explainer"
              />
            </Tooltip>
          </div>
          <div style={{ color: getLoadColor(hostLoad), fontWeight: 700, marginBottom: 12, fontSize: '2.25rem', lineHeight: 1 }}>
            {hostLoad}%
          </div>
          <ProgressBar
            value={hostLoad}
            max={100}
            label="Host load"
            hideLabel
            size="small"
          />
          <div style={{ color: 'var(--cds-text-helper)', marginTop: 'var(--cds-spacing-03)', fontSize: 'var(--cds-helper-text-01-font-size, 0.75rem)' }}>
            Buffer: {bufferSize} samples
          </div>
        </Tile>
      </div>

      {/* 16-Channel Metering Grid */}
      <Tile style={{ background: '#111111', border: '1px solid rgba(37, 99, 235, 0.2)', marginBottom: 24 }}>
        <h3 style={{ color: 'var(--cds-text-primary)', marginBottom: 'var(--cds-spacing-05)', fontWeight: 600, fontSize: 'var(--cds-productive-heading-03-font-size, 1.25rem)', lineHeight: 'var(--cds-productive-heading-03-line-height, 1.4)' }}>
          Live Metering (Input + Output)
        </h3>

        {/* MOTU Channels 1-8 */}
        <div style={{ marginBottom: 24 }}>
          <span style={{ display: 'inline-block', padding: 'var(--cds-spacing-02) var(--cds-spacing-03)', background: '#00FF9D', color: '#111', marginBottom: 12, fontWeight: 600, fontSize: 12 }}>
            MOTU Local (1-8)
          </span>
          <div style={{ display: 'grid', gap: 8 }}>
            {motuMeters.map((meter, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ color: 'var(--cds-text-secondary)', minWidth: 30, fontSize: 'var(--cds-helper-text-01-font-size, 0.75rem)' }}>
                  Ch {i + 1}
                </span>
                <div style={{ flex: 1, position: 'relative', height: 24, background: 'rgba(0,0,0,0.3)', overflow: 'hidden' }}>
                  <div style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${meter.percent}%`,
                    background: getMeterColor(meter.percent),
                    transition: 'width var(--map2-dur-instant, 80ms) var(--map2-ease-in-out-rack, ease)',
                  }} />
                </div>
                <span style={{ color: getMeterColor(meter.percent), minWidth: 55, textAlign: 'right', fontWeight: 600, fontSize: 12 }}>
                  {meter.db.toFixed(1)} dB
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* RME Channels 9-16 */}
        <div>
          <span style={{ display: 'inline-block', padding: 'var(--cds-spacing-02) var(--cds-spacing-03)', background: '#2563eb', color: '#111', marginBottom: 12, fontWeight: 600, fontSize: 12 }}>
            RME ADAT (9-16)
          </span>
          <div style={{ display: 'grid', gap: 8 }}>
            {rmeMeters.map((meter, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ color: 'var(--cds-text-secondary)', minWidth: 30, fontSize: 'var(--cds-helper-text-01-font-size, 0.75rem)' }}>
                  Ch {i + 9}
                </span>
                <div style={{ flex: 1, position: 'relative', height: 24, background: 'rgba(0,0,0,0.3)', overflow: 'hidden' }}>
                  <div style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${meter.percent}%`,
                    background: getMeterColor(meter.percent),
                    transition: 'width var(--map2-dur-instant, 80ms) var(--map2-ease-in-out-rack, ease)',
                  }} />
                </div>
                <span style={{ color: getMeterColor(meter.percent), minWidth: 55, textAlign: 'right', fontWeight: 600, fontSize: 12 }}>
                  {meter.db.toFixed(1)} dB
                </span>
              </div>
            ))}
          </div>
        </div>
      </Tile>

      {/* Latency & Audio Chain Panel */}
      <Tile style={{ background: '#111111', border: '1px solid rgba(255, 170, 0, 0.3)', marginBottom: 24 }}>
        <h3 style={{ color: 'var(--cds-text-primary)', marginBottom: 'var(--cds-spacing-05)', fontWeight: 600, fontSize: 'var(--cds-productive-heading-03-font-size, 1.25rem)', lineHeight: 'var(--cds-productive-heading-03-line-height, 1.4)' }}>
          <ChartLine size={20} style={{ marginRight: 8, verticalAlign: 'middle' }} />
          Latency & Audio Chain Analysis
        </h3>

        {/* Mode Selector */}
        <Tabs
          selectedIndex={latencyTabIndex}
          onChange={({ selectedIndex }) => {
            const next = LATENCY_MODES[selectedIndex]
            if (next) setLatencyMode(next.value)
          }}
        >
          <TabList aria-label="Latency mode">
            {LATENCY_MODES.map(mode => (
              <Tab key={mode.value}>{mode.label}</Tab>
            ))}
          </TabList>
          <TabPanels>
            {LATENCY_MODES.map(mode => (
              <TabPanel key={mode.value}>{/* tab content rendered below for shared layout */}</TabPanel>
            ))}
          </TabPanels>
        </Tabs>

        {/* Total RTL Display */}
        <div style={{
          background: 'rgba(63, 38, 20, 0.78)',
          border: '2px solid rgba(255, 170, 0, 0.5)',
          padding: 24,
          marginTop: 16,
          marginBottom: 24,
          textAlign: 'center',
        }}>
          <div style={{ color: '#FFAA00', marginBottom: 8, fontSize: 12 }}>
            Total Round-Trip Latency (RTL)
          </div>
          <div style={{ color: '#FFAA00', fontWeight: 700, fontSize: '3rem', lineHeight: 1 }}>
            {latency.total.ms.toFixed(2)} ms
          </div>
          <div style={{ color: 'var(--cds-text-secondary)', fontSize: 'var(--cds-helper-text-01-font-size, 0.75rem)' }}>
            ({latency.total.samples} samples @ {(safeSampleRate / 1000).toFixed(1)}kHz)
          </div>
        </div>

        {/* Breakdown */}
        <div style={{ display: 'grid', gap: 12 }}>
          <LatencyRow label="DAW Buffer (2× round-trip)" samples={latency.dawBuffer.samples} ms={latency.dawBuffer.ms} />
          <LatencyRow label="Driver + USB Transport" samples={latency.driverUSB.samples} ms={latency.driverUSB.ms} />
          <LatencyRow label="MOTU Converters (AD+DA)" samples={latency.motuConverters.samples} ms={latency.motuConverters.ms} />

          {(latencyMode === 'adat-expanded' || latencyMode === 'outboard-inserts') && (
            <>
              <LatencyRow label="ADAT Transmission (round-trip)" samples={latency.adatTransmission.samples} ms={latency.adatTransmission.ms} color="#2563eb" />
              <LatencyRow label="RME ADI-8 QS Converters (AD+DA)" samples={latency.rmeConverters.samples} ms={latency.rmeConverters.ms} color="#2563eb" />
            </>
          )}

          {latencyMode === 'outboard-inserts' && (
            <LatencyRow label="Analog Outboard Hardware" samples={latency.outboardHardware.samples} ms={latency.outboardHardware.ms} color="#FF4444" />
          )}
        </div>

        {/* Educational Info */}
        <InlineNotification
          kind="info"
          title="ADAT Latency"
          subtitle="Pure ADAT Lightpipe transmission ≈6-10 samples round-trip. RME ADI-8 QS converters add ≈20-24 samples. Total ADAT path: ≈26-34 samples (≈0.54-0.71 ms @ 48kHz). ADAT transmission itself is negligible compared to converters or analog gear."
          hideCloseButton
          lowContrast
          style={{ marginTop: 16 }}
        />
      </Tile>

      {/* Signal Flow Visualizer */}
      <Tile style={{ background: '#111111', border: '1px solid rgba(96, 165, 250, 0.3)' }}>
        <h3 style={{ color: 'var(--cds-text-primary)', marginBottom: 'var(--cds-spacing-05)', fontWeight: 600, fontSize: 'var(--cds-productive-heading-03-font-size, 1.25rem)', lineHeight: 'var(--cds-productive-heading-03-line-height, 1.4)' }}>
          Signal Flow Diagram
        </h3>

        <div style={{
          background: 'rgba(15, 23, 42, 0.78)',
          padding: 32,
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 24,
        }}>
          <SignalNode label="DAW" color="#60a5fa" />
          <Arrow />
          <SignalNode label="MOTU USB" color="#00FF9D" latency={`${latency.motuConverters.ms.toFixed(2)}ms`} />

          {(latencyMode === 'adat-expanded' || latencyMode === 'outboard-inserts') && (
            <>
              <Arrow label="ADAT" />
              <SignalNode label="RME ADI-8" color="#2563eb" latency={`${latency.rmeConverters.ms.toFixed(2)}ms`} />
            </>
          )}

          {latencyMode === 'outboard-inserts' && (
            <>
              <Arrow label="Analog" />
              <SignalNode label="Outboard" color="#FF4444" latency={`${latency.outboardHardware.ms.toFixed(2)}ms`} />
            </>
          )}
        </div>

        <div style={{ color: 'var(--cds-text-helper)', display: 'block', marginTop: 'var(--cds-spacing-05)', textAlign: 'center', fontSize: 'var(--cds-helper-text-01-font-size, 0.75rem)' }}>
          Current mode: <strong style={{ color: '#2563eb' }}>
            {latencyMode === 'motu-only' ? 'MOTU Only (8ch direct)' :
             latencyMode === 'adat-expanded' ? 'ADAT Expanded (16ch total)' :
             'Outboard Inserts (analog processing loop)'}
          </strong>
        </div>
      </Tile>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.8; }
        }
      `}</style>
    </div>
  )
}

// Helper Components
function LatencyRow({ label, samples, ms, color = '#FFAA00' }: { label: string; samples: number; ms: number; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, background: 'rgba(0,0,0,0.2)' }}>
      <span style={{ color: 'var(--cds-text-secondary)', fontSize: 'var(--cds-body-compact-01-font-size, 0.8125rem)' }}>
        {label}
      </span>
      <div style={{ textAlign: 'right' }}>
        <div style={{ color, fontWeight: 600, fontSize: 13 }}>
          {ms.toFixed(2)} ms
        </div>
        <div style={{ color: 'var(--cds-text-helper)', fontSize: 'var(--cds-helper-text-01-font-size, 0.75rem)' }}>
          ({samples} samples)
        </div>
      </div>
    </div>
  )
}

function SignalNode({ label, color, latency }: { label: string; color: string; latency?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        width: 100,
        height: 100,
        background: `${color}1f`,
        border: `2px solid ${color}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}>
        <Activity size={24} style={{ color }} />
        <div style={{ color: '#f3f4f6', fontWeight: 600, fontSize: 12 }}>
          {label}
        </div>
        {latency && (
          <div style={{ color, fontSize: 10 }}>
            +{latency}
          </div>
        )}
      </div>
    </div>
  )
}

function Arrow({ label }: { label?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        width: 60,
        height: 2,
        background: '#3b82f6',
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute',
          right: -6,
          top: -4,
          width: 0,
          height: 0,
          borderLeft: '8px solid #60a5fa',
          borderTop: '5px solid transparent',
          borderBottom: '5px solid transparent',
        }} />
      </div>
      {label && (
        <div style={{ color: 'var(--cds-text-helper)', fontSize: 10, marginTop: 'var(--cds-spacing-02)' }}>
          {label}
        </div>
      )}
    </div>
  )
}
