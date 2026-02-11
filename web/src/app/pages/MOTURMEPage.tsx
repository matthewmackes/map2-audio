import { useState, useEffect } from 'react'
import {
  Card,
  CardContent,
  Typography,
  Box,
  LinearProgress,
  Chip,
  Tabs,
  Tab,
  Tooltip,
  Alert,
  IconButton,
} from '@mui/material'
import { Activity, Zap, AlertTriangle, Info, TrendingUp, Layers } from 'lucide-react'

type LatencyMode = 'motu-only' | 'adat-expanded' | 'outboard-inserts'

export default function MOTURMEPage() {
  const [latencyMode, setLatencyMode] = useState<LatencyMode>('adat-expanded')
  const [sampleRate, setSampleRate] = useState(48000)
  const [bufferSize, setBufferSize] = useState(64)
  const [activeChannels, setActiveChannels] = useState(16)

  // Simulated real-time meter values (0-100)
  const [meterValues, setMeterValues] = useState<number[]>(Array(16).fill(0))

  // Simulated animated meters
  useEffect(() => {
    const interval = setInterval(() => {
      setMeterValues(prev => prev.map(() => Math.random() * 100))
    }, 100)
    return () => clearInterval(interval)
  }, [])

  // USB Load calculation
  const calculateUSBLoad = () => {
    const baseLoad = (activeChannels * sampleRate * 24 * 2) / (480 * 1000000) // USB 2.0 theoretical max
    const utilizationFactor = sampleRate === 192000 ? 0.9 : sampleRate === 96000 ? 0.7 : 0.5
    return Math.min(95, Math.round(baseLoad * utilizationFactor * 100))
  }

  // Host Backplane Load calculation
  const calculateHostLoad = () => {
    const bufferFactor = bufferSize < 128 ? 1.5 : bufferSize < 256 ? 1.0 : 0.7
    const channelFactor = activeChannels / 18
    const sampleRateFactor = sampleRate / 48000
    return Math.min(95, Math.round(35 * channelFactor * sampleRateFactor * bufferFactor))
  }

  // Latency calculations (in samples and ms)
  const getLatencyBreakdown = () => {
    const samplesPerMs = sampleRate / 1000

    const dawBuffer = bufferSize * 2
    const driverUSB = sampleRate === 192000 ? 60 : sampleRate === 96000 ? 40 : 30
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
  const hostLoad = calculateHostLoad()
  const latency = getLatencyBreakdown()

  const getMeterColor = (value: number) => {
    if (value > 85) return '#FF4444'
    if (value > 70) return '#FFAA00'
    return '#00D4FF'
  }

  const getLoadColor = (value: number) => {
    if (value > 75) return '#FF4444'
    if (value > 60) return '#FFAA00'
    return '#00FF9D'
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(180deg, #0F0F12 0%, #111114 100%)',
      padding: '24px',
    }}>
      {/* Page Title */}
      <Box sx={{ mb: 4, textAlign: 'center' }}>
        <Typography variant="h3" style={{ color: '#E0E0E5', fontWeight: 700, marginBottom: 8 }}>
          MOTU UltraLite-mk5 + RME ADI-8 QS
        </Typography>
        <Typography variant="subtitle1" style={{ color: '#94a3b8', fontSize: 14 }}>
          ADAT-Expanded Monitoring Dashboard
        </Typography>
      </Box>

      {/* Hero Section - Product Photos */}
      <Card style={{ 
        background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.05), rgba(168, 85, 247, 0.05))',
        border: '1px solid rgba(0, 212, 255, 0.2)',
        marginBottom: 24,
      }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            {/* RME ADI-8 QS (Top) */}
            <Box sx={{ textAlign: 'center', flex: 1, minWidth: 250 }}>
              <div style={{
                width: '100%',
                height: 180,
                background: 'linear-gradient(135deg, rgba(255, 170, 0, 0.1), rgba(0, 212, 255, 0.1))',
                border: '2px dashed rgba(0, 212, 255, 0.3)',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}>
                <div style={{ textAlign: 'center' }}>
                  <Layers size={48} style={{ color: '#00D4FF', marginBottom: 8 }} />
                  <Typography variant="body2" style={{ color: '#94a3b8' }}>
                    RME ADI-8 QS
                  </Typography>
                  <Typography variant="caption" style={{ color: '#6b7280' }}>
                    8ch Premium AD/DA
                  </Typography>
                </div>
              </div>
              <Chip label="ADAT Slave" size="small" style={{ background: '#00D4FF', color: '#111', fontWeight: 600 }} />
            </Box>

            {/* ADAT Connection Indicator */}
            <Box sx={{ textAlign: 'center' }}>
              <div style={{
                width: 80,
                height: 80,
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(0, 212, 255, 0.3), transparent)',
                border: '2px solid #00D4FF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                animation: 'pulse 2s ease-in-out infinite',
              }}>
                <Activity size={32} style={{ color: '#00D4FF' }} />
              </div>
              <Typography variant="caption" style={{ color: '#00D4FF', marginTop: 8, display: 'block' }}>
                ADAT Optical
              </Typography>
            </Box>

            {/* MOTU UltraLite-mk5 (Bottom) */}
            <Box sx={{ textAlign: 'center', flex: 1, minWidth: 250 }}>
              <div style={{
                width: '100%',
                height: 180,
                background: 'linear-gradient(135deg, rgba(0, 255, 157, 0.1), rgba(0, 212, 255, 0.1))',
                border: '2px dashed rgba(0, 255, 157, 0.3)',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}>
                <div style={{ textAlign: 'center' }}>
                  <Zap size={48} style={{ color: '#00FF9D', marginBottom: 8 }} />
                  <Typography variant="body2" style={{ color: '#94a3b8' }}>
                    MOTU UltraLite-mk5
                  </Typography>
                  <Typography variant="caption" style={{ color: '#6b7280' }}>
                    USB Audio Interface
                  </Typography>
                </div>
              </div>
              <Chip label="Clock Master" size="small" style={{ background: '#00FF9D', color: '#111', fontWeight: 600 }} />
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* System Load & Health */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2, mb: 3 }}>
        {/* USB Load */}
        <Card style={{ background: '#1a1a2e', border: '1px solid rgba(0, 212, 255, 0.2)' }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="body2" style={{ color: '#94a3b8', fontSize: 13 }}>
                USB Load (Estimated)
              </Typography>
              <Tooltip title="Calculated from active channels × sample rate × bit depth. >75% increases dropout risk. Consider larger buffer size.">
                <IconButton size="small">
                  <Info size={16} style={{ color: '#6b7280' }} />
                </IconButton>
              </Tooltip>
            </Box>
            <Typography variant="h3" style={{ color: getLoadColor(usbLoad), fontWeight: 700, marginBottom: 12 }}>
              {usbLoad}%
            </Typography>
            <LinearProgress 
              variant="determinate" 
              value={usbLoad} 
              sx={{
                height: 8,
                borderRadius: 4,
                backgroundColor: 'rgba(0,0,0,0.3)',
                '& .MuiLinearProgress-bar': {
                  backgroundColor: getLoadColor(usbLoad),
                }
              }}
            />
            <Typography variant="caption" style={{ color: '#6b7280', marginTop: 8, display: 'block' }}>
              {activeChannels} ch × {sampleRate / 1000}kHz @ 24-bit
            </Typography>
          </CardContent>
        </Card>

        {/* Host Backplane Load */}
        <Card style={{ background: '#1a1a2e', border: '1px solid rgba(0, 212, 255, 0.2)' }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="body2" style={{ color: '#94a3b8', fontSize: 13 }}>
                Host Backplane Load (Estimated)
              </Typography>
              <Tooltip title="Computer-side CPU/driver pressure. Based on buffer size, channel count, and sample rate. Lower buffer = higher load.">
                <IconButton size="small">
                  <Info size={16} style={{ color: '#6b7280' }} />
                </IconButton>
              </Tooltip>
            </Box>
            <Typography variant="h3" style={{ color: getLoadColor(hostLoad), fontWeight: 700, marginBottom: 12 }}>
              {hostLoad}%
            </Typography>
            <LinearProgress 
              variant="determinate" 
              value={hostLoad} 
              sx={{
                height: 8,
                borderRadius: 4,
                backgroundColor: 'rgba(0,0,0,0.3)',
                '& .MuiLinearProgress-bar': {
                  backgroundColor: getLoadColor(hostLoad),
                }
              }}
            />
            <Typography variant="caption" style={{ color: '#6b7280', marginTop: 8, display: 'block' }}>
              Buffer: {bufferSize} samples
            </Typography>
          </CardContent>
        </Card>
      </Box>

      {/* 16-Channel Metering Grid */}
      <Card style={{ background: '#1a1a2e', border: '1px solid rgba(0, 212, 255, 0.2)', marginBottom: 24 }}>
        <CardContent>
          <Typography variant="h6" style={{ color: '#E0E0E5', marginBottom: 16, fontWeight: 600 }}>
            16-Channel Metering (8 MOTU + 8 RME via ADAT)
          </Typography>
          
          {/* MOTU Channels 1-8 */}
          <Box sx={{ mb: 3 }}>
            <Chip label="MOTU Local (1-8)" size="small" style={{ background: '#00FF9D', color: '#111', marginBottom: 12, fontWeight: 600 }} />
            <Box sx={{ display: 'grid', gap: 1 }}>
              {meterValues.slice(0, 8).map((value, i) => (
                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Typography variant="caption" style={{ color: '#94a3b8', minWidth: 30 }}>
                    Ch {i + 1}
                  </Typography>
                  <Box sx={{ flex: 1, position: 'relative', height: 24, background: 'rgba(0,0,0,0.3)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${value}%`,
                      background: `linear-gradient(90deg, ${getMeterColor(value)}, ${getMeterColor(value)}80)`,
                      transition: 'width 0.1s ease-out',
                    }} />
                  </Box>
                  <Typography variant="caption" style={{ color: getMeterColor(value), minWidth: 45, textAlign: 'right', fontWeight: 600 }}>
                    {value.toFixed(0)} dB
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>

          {/* RME Channels 9-16 */}
          <Box>
            <Chip label="RME ADAT (9-16)" size="small" style={{ background: '#00D4FF', color: '#111', marginBottom: 12, fontWeight: 600 }} />
            <Box sx={{ display: 'grid', gap: 1 }}>
              {meterValues.slice(8, 16).map((value, i) => (
                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Typography variant="caption" style={{ color: '#94a3b8', minWidth: 30 }}>
                    Ch {i + 9}
                  </Typography>
                  <Box sx={{ flex: 1, position: 'relative', height: 24, background: 'rgba(0,0,0,0.3)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${value}%`,
                      background: `linear-gradient(90deg, ${getMeterColor(value)}, ${getMeterColor(value)}80)`,
                      transition: 'width 0.1s ease-out',
                    }} />
                  </Box>
                  <Typography variant="caption" style={{ color: getMeterColor(value), minWidth: 45, textAlign: 'right', fontWeight: 600 }}>
                    {value.toFixed(0)} dB
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Latency & Audio Chain Panel */}
      <Card style={{ background: '#1a1a2e', border: '1px solid rgba(255, 170, 0, 0.3)', marginBottom: 24 }}>
        <CardContent>
          <Typography variant="h6" style={{ color: '#E0E0E5', marginBottom: 16, fontWeight: 600 }}>
            <TrendingUp size={20} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            Latency & Audio Chain Analysis
          </Typography>

          {/* Mode Selector */}
          <Tabs 
            value={latencyMode} 
            onChange={(_, v) => setLatencyMode(v)} 
            sx={{ mb: 3, borderBottom: 1, borderColor: 'rgba(255,255,255,0.1)' }}
          >
            <Tab label="MOTU Only" value="motu-only" />
            <Tab label="ADAT Expanded" value="adat-expanded" />
            <Tab label="Outboard Inserts" value="outboard-inserts" />
          </Tabs>

          {/* Total RTL Display */}
          <Box sx={{ 
            background: 'linear-gradient(135deg, rgba(255, 170, 0, 0.1), rgba(255, 68, 68, 0.1))',
            border: '2px solid rgba(255, 170, 0, 0.5)',
            borderRadius: 3,
            padding: 3,
            mb: 3,
            textAlign: 'center',
          }}>
            <Typography variant="body2" style={{ color: '#FFAA00', marginBottom: 8, fontSize: 12 }}>
              Total Round-Trip Latency (RTL)
            </Typography>
            <Typography variant="h2" style={{ color: '#FFAA00', fontWeight: 700 }}>
              {latency.total.ms.toFixed(2)} ms
            </Typography>
            <Typography variant="caption" style={{ color: '#94a3b8' }}>
              ({latency.total.samples} samples @ {sampleRate / 1000}kHz)
            </Typography>
          </Box>

          {/* Breakdown */}
          <Box sx={{ display: 'grid', gap: 1.5 }}>
            <LatencyRow label="DAW Buffer (2× round-trip)" samples={latency.dawBuffer.samples} ms={latency.dawBuffer.ms} />
            <LatencyRow label="Driver + USB Transport" samples={latency.driverUSB.samples} ms={latency.driverUSB.ms} />
            <LatencyRow label="MOTU Converters (AD+DA)" samples={latency.motuConverters.samples} ms={latency.motuConverters.ms} />
            
            {(latencyMode === 'adat-expanded' || latencyMode === 'outboard-inserts') && (
              <>
                <LatencyRow label="ADAT Transmission (round-trip)" samples={latency.adatTransmission.samples} ms={latency.adatTransmission.ms} color="#00D4FF" />
                <LatencyRow label="RME ADI-8 QS Converters (AD+DA)" samples={latency.rmeConverters.samples} ms={latency.rmeConverters.ms} color="#00D4FF" />
              </>
            )}
            
            {latencyMode === 'outboard-inserts' && (
              <LatencyRow label="Analog Outboard Hardware" samples={latency.outboardHardware.samples} ms={latency.outboardHardware.ms} color="#FF4444" />
            )}
          </Box>

          {/* Educational Info */}
          <Alert severity="info" icon={<Info size={20} />} style={{ marginTop: 16, background: 'rgba(0, 212, 255, 0.1)', border: '1px solid rgba(0, 212, 255, 0.3)' }}>
            <Typography variant="body2" style={{ color: '#E0E0E5', fontSize: 12, lineHeight: 1.6 }}>
              <strong>ADAT Latency:</strong> Pure ADAT Lightpipe transmission ≈6-10 samples round-trip. RME ADI-8 QS converters add ≈20-24 samples. 
              Total ADAT path: ≈26-34 samples (≈0.54-0.71 ms @ 48kHz). ADAT transmission itself is negligible compared to converters or analog gear.
            </Typography>
          </Alert>
        </CardContent>
      </Card>

      {/* Signal Flow Visualizer */}
      <Card style={{ background: '#1a1a2e', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
        <CardContent>
          <Typography variant="h6" style={{ color: '#E0E0E5', marginBottom: 16, fontWeight: 600 }}>
            Signal Flow Diagram
          </Typography>
          
          <Box sx={{ 
            background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.05), rgba(168, 85, 247, 0.05))',
            borderRadius: 3,
            padding: 4,
            display: 'flex',
            justifyContent: 'space-around',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 3,
          }}>
            <SignalNode label="DAW" color="#a855f7" />
            <Arrow />
            <SignalNode label="MOTU USB" color="#00FF9D" latency={`${latency.motuConverters.ms.toFixed(2)}ms`} />
            
            {(latencyMode === 'adat-expanded' || latencyMode === 'outboard-inserts') && (
              <>
                <Arrow label="ADAT" />
                <SignalNode label="RME ADI-8" color="#00D4FF" latency={`${latency.rmeConverters.ms.toFixed(2)}ms`} />
              </>
            )}
            
            {latencyMode === 'outboard-inserts' && (
              <>
                <Arrow label="Analog" />
                <SignalNode label="Outboard" color="#FF4444" latency={`${latency.outboardHardware.ms.toFixed(2)}ms`} />
              </>
            )}
          </Box>
          
          <Typography variant="caption" style={{ color: '#6b7280', display: 'block', marginTop: 16, textAlign: 'center' }}>
            Current mode: <strong style={{ color: '#00D4FF' }}>
              {latencyMode === 'motu-only' ? 'MOTU Only (8ch direct)' : 
               latencyMode === 'adat-expanded' ? 'ADAT Expanded (16ch total)' : 
               'Outboard Inserts (analog processing loop)'}
            </strong>
          </Typography>
        </CardContent>
      </Card>

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
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 1.5, background: 'rgba(0,0,0,0.2)', borderRadius: 2 }}>
      <Typography variant="body2" style={{ color: '#94a3b8', fontSize: 13 }}>
        {label}
      </Typography>
      <Box sx={{ textAlign: 'right' }}>
        <Typography variant="body2" style={{ color, fontWeight: 600, fontSize: 13 }}>
          {ms.toFixed(2)} ms
        </Typography>
        <Typography variant="caption" style={{ color: '#6b7280', fontSize: 11 }}>
          ({samples} samples)
        </Typography>
      </Box>
    </Box>
  )
}

function SignalNode({ label, color, latency }: { label: string; color: string; latency?: string }) {
  return (
    <Box sx={{ textAlign: 'center' }}>
      <Box sx={{
        width: 100,
        height: 100,
        borderRadius: 3,
        background: `linear-gradient(135deg, ${color}20, ${color}10)`,
        border: `2px solid ${color}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
      }}>
        <Activity size={24} style={{ color }} />
        <Typography variant="body2" style={{ color: '#E0E0E5', fontWeight: 600, fontSize: 12 }}>
          {label}
        </Typography>
        {latency && (
          <Typography variant="caption" style={{ color, fontSize: 10 }}>
            +{latency}
          </Typography>
        )}
      </Box>
    </Box>
  )
}

function Arrow({ label }: { label?: string }) {
  return (
    <Box sx={{ textAlign: 'center' }}>
      <div style={{ 
        width: 60, 
        height: 2, 
        background: 'linear-gradient(90deg, #00D4FF, #a855f7)',
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute',
          right: -6,
          top: -4,
          width: 0,
          height: 0,
          borderLeft: '8px solid #a855f7',
          borderTop: '5px solid transparent',
          borderBottom: '5px solid transparent',
        }} />
      </div>
      {label && (
        <Typography variant="caption" style={{ color: '#6b7280', fontSize: 10, marginTop: 4, display: 'block' }}>
          {label}
        </Typography>
      )}
    </Box>
  )
}
