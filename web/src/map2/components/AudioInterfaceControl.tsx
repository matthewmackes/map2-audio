/**
 * AudioInterfaceControl Component - Premium Dark Theme
 *
 * Displays and manages audio interface configuration with:
 * - Hero section with large device image and quick stats
 * - Inline live metering confirmation
 * - Configuration controls (device, input mode, sample rate, buffer size)
 * - Live status monitoring
 * - Fully responsive design
 */

import React, { useCallback, useEffect, useState } from 'react'
import { Tag } from '@carbon/react'

import { LoadingState } from '../../app/components/shared/LoadingState'
import { useToasts } from '../../app/components/Toasts'
import type { AudioHealth as ApiAudioHealth } from '../api'
import { audioApi } from '../clients/audio'
import { CompactVuStrip } from './CompactVuStrip'
import './AudioInterfaceControl.css'

interface AudioStatus {
  running: boolean
  sample_rate: number
  buffer_size: number
  cpu_load: number
  engine?: string
  audio_device?: string | null
  input_channel_mode?: 'mono_left' | 'mono_right' | 'stereo'
  input_gain_db?: number
  output_gain_db?: number
  available: boolean
  error?: string
  channels_in?: number
  channels_out?: number
}

interface USBPrimaryDevice extends Record<string, unknown> {
  name?: string
  model?: string
  vendor_id?: string
  product_id?: string
  bus?: string | number
  device?: string | number
  alsa_device?: string
  channels_in?: number
  channels_out?: number
}

interface USBDevice {
  hotone_detected: boolean
  device_count: number
  primary_device?: USBPrimaryDevice
  all_devices: Record<string, unknown>[]
  recommendations?: string[]
}

interface AudioHealth extends Partial<ApiAudioHealth> {
  total_xruns?: number
  xrun_rate_per_minute?: number
  watchdog_enabled?: boolean
  signal_state?: string
  input_level_db?: number
  is_auto_muted?: boolean
}

interface StatusItem {
  text: string
  status: 'success' | 'warning' | 'error'
}

interface AudioInterfaceControlProps {
  nodeId?: string | null
}

export const AudioInterfaceControl: React.FC<AudioInterfaceControlProps> = ({ nodeId }) => {
  const { pushToast } = useToasts()
  const [audioStatus, setAudioStatus] = useState<AudioStatus | null>(null)
  const [usbDevices, setUsbDevices] = useState<USBDevice | null>(null)
  const [audioHealth, setAudioHealth] = useState<AudioHealth | null>(null)
  const [sampleRate, setSampleRate] = useState(48000)
  const [bufferSize, setBufferSize] = useState(256)
  const [selectedAudioDevice, setSelectedAudioDevice] = useState('')
  const [selectedInputChannelMode, setSelectedInputChannelMode] = useState<'mono_left' | 'mono_right' | 'stereo'>('stereo')
  const [selectedInputGainDb, setSelectedInputGainDb] = useState(0)
  const [selectedOutputGainDb, setSelectedOutputGainDb] = useState(0)
  const [loading, setLoading] = useState(true)
  const [deviceImage, setDeviceImage] = useState<string>('/img/audio-input.png')
  const [isApplyingConfig, setIsApplyingConfig] = useState(false)
  const [isStartingAudio, setIsStartingAudio] = useState(false)
  const [isStoppingAudio, setIsStoppingAudio] = useState(false)
  const [configDirty, setConfigDirty] = useState(false)

  const withNodeQuery = useCallback((path: string) => {
    if (!nodeId || nodeId === 'all') {
      return path
    }
    const separator = path.includes('?') ? '&' : '?'
    return `${path}${separator}node_id=${encodeURIComponent(nodeId)}`
  }, [nodeId])

  const getDeviceArtwork = (model: string): string => {
    const artworkMap: Record<string, string> = {
      jogg: '/img/audio-input.png',
      ampero: '/img/audio-output.png',
      ampero_one: '/img/audio-output.png',
      ampero_ii: '/img/audio-output.png',
      ampero_mini: '/img/audio-output.png',
    }
    return artworkMap[model] || artworkMap.jogg
  }

  const updateAudioStatus = useCallback(async () => {
    try {
      const data = await audioApi.getStatus(nodeId)
      setAudioStatus(data)
      if (!configDirty) {
        setSampleRate(data.sample_rate)
        setBufferSize(data.buffer_size)
        if (data.audio_device) {
          setSelectedAudioDevice(data.audio_device)
        }
        setSelectedInputChannelMode(data.input_channel_mode || 'stereo')
        setSelectedInputGainDb(data.input_gain_db || 0)
        setSelectedOutputGainDb(data.output_gain_db || 0)
      }
    } catch (error) {
      console.error('Failed to fetch audio status:', error)
      setAudioStatus({
        running: false,
        sample_rate: 48000,
        buffer_size: 256,
        cpu_load: 0,
        audio_device: null,
        input_channel_mode: 'stereo',
        input_gain_db: 0,
        output_gain_db: 0,
        available: false,
        error: 'Failed to connect to audio engine',
      })
    }
  }, [configDirty, nodeId])

  const updateUSBDevices = useCallback(async () => {
    try {
      const response = await fetch(withNodeQuery('/api/usb/devices'))
      const data = await response.json()
      setUsbDevices(data)
      if (!configDirty && !selectedAudioDevice) {
        const primaryDevice = typeof data?.primary_device?.alsa_device === 'string'
          ? data.primary_device.alsa_device
          : typeof data?.primary_device?.name === 'string'
            ? data.primary_device.name
            : ''
        if (primaryDevice) {
          setSelectedAudioDevice(primaryDevice)
        }
      }
    } catch (error) {
      console.error('Failed to fetch USB devices:', error)
    }
  }, [configDirty, selectedAudioDevice, withNodeQuery])

  const updateAudioHealth = useCallback(async () => {
    try {
      const data = await audioApi.getHealth(nodeId)
      setAudioHealth(data)
    } catch (error) {
      console.error('Failed to fetch audio health:', error)
    }
  }, [nodeId])

  useEffect(() => {
    const fetchAll = async () => {
      await Promise.all([updateAudioStatus(), updateUSBDevices(), updateAudioHealth()])
      setLoading(false)
    }

    fetchAll()

    const interval = setInterval(() => {
      updateAudioStatus()
      updateUSBDevices()
      updateAudioHealth()
    }, 10000)

    return () => clearInterval(interval)
  }, [updateAudioHealth, updateAudioStatus, updateUSBDevices])

  useEffect(() => {
    const currentDevice = usbDevices?.primary_device?.model || 'jogg'
    setDeviceImage(getDeviceArtwork(currentDevice))
  }, [usbDevices?.primary_device?.model])

  const applyAudioConfig = useCallback(async (options?: { silentSuccess?: boolean }) => {
    setIsApplyingConfig(true)
    try {
      const data = await audioApi.configure({
        sampleRate,
        bufferSize,
        audioDevice: selectedAudioDevice || undefined,
        inputChannelMode: selectedInputChannelMode,
        inputGainDb: selectedInputGainDb,
        outputGainDb: selectedOutputGainDb,
      }, nodeId)
      setConfigDirty(false)
      if (!options?.silentSuccess) {
        pushToast(
          data.message || `Audio configuration updated: ${sampleRate} Hz / ${bufferSize} samples.`,
          'success',
        )
      }
      await updateAudioStatus()
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to apply audio configuration'
      pushToast(message, 'error')
      return false
    } finally {
      setIsApplyingConfig(false)
    }
  }, [
    bufferSize,
    nodeId,
    pushToast,
    sampleRate,
    selectedAudioDevice,
    selectedInputChannelMode,
    selectedInputGainDb,
    selectedOutputGainDb,
    updateAudioStatus,
  ])

  const handleApplyConfig = async () => {
    await applyAudioConfig()
  }

  const handleStartAudio = async () => {
    if (audioStatus?.running) {
      return
    }
    setIsStartingAudio(true)
    try {
      if (configDirty) {
        const configApplied = await applyAudioConfig({ silentSuccess: true })
        if (!configApplied) {
          return
        }
      }
      const data = await audioApi.start(nodeId)
      pushToast(data.message || 'Audio started', 'success')
      await updateAudioStatus()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start audio'
      pushToast(message, 'error')
    } finally {
      setIsStartingAudio(false)
    }
  }

  const handleStopAudio = async () => {
    if (!audioStatus?.running) {
      return
    }
    setIsStoppingAudio(true)
    try {
      const data = await audioApi.stop(nodeId)
      pushToast(data.message || 'Audio stopped', 'info')
      await updateAudioStatus()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to stop audio'
      pushToast(message, 'error')
    } finally {
      setIsStoppingAudio(false)
    }
  }

  const handleRestart = async () => {
    if (!window.confirm('Restart audio engine? This will cause brief audio interruption.')) {
      return
    }

    try {
      const data = await audioApi.restart(nodeId)
      if (data.success) {
        pushToast(data.message || 'Audio engine restarting...', 'success')
        setTimeout(updateAudioStatus, 1000)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error restarting engine'
      pushToast(message, 'error')
    }
  }

  const handleTest = async () => {
    try {
      const response = await fetch(withNodeQuery('/api/audio/test'), { method: 'POST' })
      const data = await response.json()
      alert(
        `Audio Test Results:\n\n` +
        `Latency: ${data.latency_ms?.toFixed(2) || 'N/A'} ms\n` +
        `Sample Rate: ${data.sample_rate || 'N/A'} Hz\n` +
        `Buffer Size: ${data.buffer_size || 'N/A'} samples\n` +
        `CPU Load: ${data.cpu_load?.toFixed(1) || 'N/A'}%\n` +
        `Quality Score: ${data.score || 'N/A'}/100\n` +
        `Status: ${data.status || 'Unknown'}`
      )
    } catch (error) {
      alert('Error running diagnostics: ' + error)
    }
  }

  const handleMoreInfo = () => {
    if (usbDevices?.primary_device) {
      const device = usbDevices.primary_device
      const joggInfo = `
HOTONE JOGG USB AUDIO - DEVICE INFORMATION

═══════════════════════════════════════════
SPECIFICATIONS
═══════════════════════════════════════════
Name: ${device.name || 'Hotone Jogg'}
Vendor: HotoneAudio
Vendor ID: ${device.vendor_id || '84ef'}
Product ID: ${device.product_id || '0014'}
Bus: ${device.bus || 'N/A'}
Device: ${device.device || 'N/A'}
ALSA Device: ${device.alsa_device || 'hw:0,0'}
USB Speed: Full Speed (12 Mbps)

═══════════════════════════════════════════
RECOMMENDED SETTINGS
═══════════════════════════════════════════
✓ Sample Rate: 48000 Hz
✓ Buffer Size: 256 samples
✓ Latency: ~5.3ms @ 256 samples, 48kHz
✓ Enable Direct Monitoring (on device)
✓ USB Power: Keep Connected (disable autosuspend)

═══════════════════════════════════════════
OPTIMIZATION TIPS
═══════════════════════════════════════════
1. Disable USB autosuspend to prevent audio dropout
2. Use realtime kernel (PREEMPT_RT) for best latency
3. Close unnecessary applications during sessions
4. Keep USB cable short and direct

═══════════════════════════════════════════
CURRENT STATUS
═══════════════════════════════════════════
✓ Device: DETECTED (${device.name || 'Hotone Jogg'})
✓ Sample Rate: ${audioStatus?.sample_rate || 48000} Hz
✓ Buffer: ${audioStatus?.buffer_size || 256} samples
✓ Status: ${audioStatus?.running ? 'RUNNING' : 'READY'}
      `
      alert(joggInfo)
    } else {
      alert('No USB audio device detected')
    }
  }

  const calculateLatency = (): string => {
    if (audioStatus?.buffer_size && audioStatus?.sample_rate) {
      return ((audioStatus.buffer_size / audioStatus.sample_rate) * 1000 * 2).toFixed(1)
    }
    return '5.3'
  }

  const getStatusItems = (): StatusItem[] => {
    const items: StatusItem[] = []

    items.push({
      text: audioStatus?.running ? 'Audio engine running' : 'Audio engine stopped',
      status: audioStatus?.running ? 'success' : 'warning',
    })

    if (usbDevices?.hotone_detected) {
      items.push({ text: 'Hotone device connected', status: 'success' })
    } else if (usbDevices && usbDevices.device_count > 0) {
      items.push({ text: `${usbDevices.device_count} USB device(s) detected`, status: 'success' })
    } else {
      items.push({ text: 'No USB audio device', status: 'warning' })
    }

    const cpuLoad = audioStatus?.cpu_load || 0
    if (cpuLoad < 50) {
      items.push({ text: `CPU: ${cpuLoad.toFixed(1)}% - Excellent`, status: 'success' })
    } else if (cpuLoad < 80) {
      items.push({ text: `CPU: ${cpuLoad.toFixed(1)}% - Good`, status: 'success' })
    } else {
      items.push({ text: `CPU: ${cpuLoad.toFixed(1)}% - High`, status: 'warning' })
    }

    if (audioHealth) {
      const xruns = audioHealth.total_xruns || 0
      const xrunRate = audioHealth.xrun_rate_per_minute || 0

      if (xruns === 0) {
        items.push({ text: 'No buffer underruns', status: 'success' })
      } else if (xrunRate < 1.0) {
        items.push({ text: `${xruns} XRuns (${xrunRate.toFixed(2)}/min)`, status: 'success' })
      } else if (xrunRate < 5.0) {
        items.push({ text: `${xruns} XRuns (${xrunRate.toFixed(2)}/min)`, status: 'warning' })
      } else {
        items.push({ text: `${xruns} XRuns - Critical`, status: 'error' })
      }
    } else {
      items.push({ text: 'Buffer health OK', status: 'success' })
    }

    return items
  }

  const audioDeviceOptions = (() => {
    const options = new Map<string, string>()
    const pushOption = (value: string | undefined, label: string | undefined) => {
      const normalizedValue = String(value || '').trim()
      const normalizedLabel = String(label || '').trim()
      if (!normalizedValue || options.has(normalizedValue)) {
        return
      }
      options.set(normalizedValue, normalizedLabel || normalizedValue)
    }

    for (const device of usbDevices?.all_devices || []) {
      const value = typeof device?.alsa_device === 'string' && device.alsa_device.trim()
        ? device.alsa_device
        : typeof device?.name === 'string'
          ? device.name
          : ''
      const name = typeof device?.name === 'string' ? device.name : value
      const alsaDevice = typeof device?.alsa_device === 'string' ? device.alsa_device : ''
      const label = alsaDevice && alsaDevice !== name ? `${name} (${alsaDevice})` : name
      pushOption(value, label)
    }

    pushOption(audioStatus?.audio_device ?? undefined, audioStatus?.audio_device ?? undefined)
    return Array.from(options.entries()).map(([value, label]) => ({ value, label }))
  })()

  if (loading) {
    return (
      <div className="audio-interface-section">
        <LoadingState description="Loading audio interface" />
      </div>
    )
  }

  const isConnected = audioStatus?.available && (usbDevices?.hotone_detected || (usbDevices?.device_count || 0) > 0)
  const deviceName = audioDeviceOptions.find((option) => option.value === selectedAudioDevice)?.label
    || usbDevices?.primary_device?.name
    || audioStatus?.audio_device
    || audioStatus?.engine
    || 'Hotone Jogg'
  const latencyMs = calculateLatency()
  const statusItems = getStatusItems()

  return (
    <div className="audio-interface-section">
      <div className="audio-interface-header">
        <h2 className="audio-interface-title">
          <span className="audio-interface-icon">I/O</span>
          Audio Interface
        </h2>
        <Tag
          className="audio-interface-status-tag"
          size="md"
          type={isConnected ? 'green' : 'warm-gray'}
        >
          {isConnected ? 'Connected' : 'Disconnected'}
        </Tag>
      </div>

      <div className="audio-hero-section">
        <div className="audio-device-showcase">
          <div className="audio-device-image">
            {deviceImage ? (
              <img
                src={deviceImage}
                alt={deviceName}
                onError={() => {
                  if (deviceImage !== '/img/audio-output.png') {
                    setDeviceImage('/img/audio-output.png')
                    return
                  }
                  setDeviceImage('')
                }}
              />
            ) : (
              <span className="fallback-icon">I/O</span>
            )}
          </div>

          <div className="audio-device-info">
            <div className="audio-device-name">{deviceName}</div>
            <div className="audio-device-subtitle">USB Audio Interface</div>

            <div className="audio-quick-stats">
              <div className="audio-quick-stat">
                <div className="audio-quick-stat-value">
                  {audioStatus?.sample_rate ? Math.round(audioStatus.sample_rate / 1000) : 48}k
                </div>
                <div className="audio-quick-stat-label">Sample Rate</div>
              </div>
              <div className="audio-quick-stat">
                <div className="audio-quick-stat-value">{latencyMs}</div>
                <div className="audio-quick-stat-label">Latency (ms)</div>
              </div>
              <div className="audio-quick-stat">
                <div className="audio-quick-stat-value">{audioStatus?.buffer_size || 256}</div>
                <div className="audio-quick-stat-label">Buffer Size</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="audio-inline-metering-section">
        <CompactVuStrip nodeId={nodeId} />
      </div>

      <div className="audio-details-section">
        <div className="audio-panel">
          <div className="audio-panel-title">Specifications</div>
          <div className="audio-specs-list">
            <div className="audio-spec-row">
              <span className="audio-spec-label">Sample Rate</span>
              <span className="audio-spec-value">
                {audioStatus?.sample_rate ? (audioStatus.sample_rate / 1000).toFixed(1) : '48.0'}k Hz
              </span>
            </div>
            <div className="audio-spec-row">
              <span className="audio-spec-label">Buffer Size</span>
              <span className="audio-spec-value">{audioStatus?.buffer_size || 256} samples</span>
            </div>
            <div className="audio-spec-row">
              <span className="audio-spec-label">Bit Depth</span>
              <span className="audio-spec-value">24-bit</span>
            </div>
            <div className="audio-spec-row">
              <span className="audio-spec-label">Input Channels</span>
              <span className="audio-spec-value">
                {audioStatus?.channels_in || usbDevices?.primary_device?.channels_in || 1} (Mono)
              </span>
            </div>
            <div className="audio-spec-row">
              <span className="audio-spec-label">Output Channels</span>
              <span className="audio-spec-value">
                {audioStatus?.channels_out || usbDevices?.primary_device?.channels_out || 2} (Stereo)
              </span>
            </div>
            <div className="audio-spec-row">
              <span className="audio-spec-label">Latency</span>
              <span className="audio-spec-value">{latencyMs} ms</span>
            </div>
          </div>
        </div>

        <div className="audio-panel">
          <div className="audio-panel-title">Configuration</div>

          <div className="audio-control-group">
            <label className="audio-control-label" htmlFor="audio-device-select">Audio Device</label>
            <select
              id="audio-device-select"
              className="audio-select"
              value={selectedAudioDevice}
              onChange={(e) => {
                setSelectedAudioDevice(e.target.value)
                setConfigDirty(true)
              }}
            >
              {audioDeviceOptions.length === 0 ? (
                <option value="">No USB audio devices detected</option>
              ) : null}
              {audioDeviceOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className="audio-control-group">
            <label className="audio-control-label" htmlFor="audio-input-channel-mode-select">Input Channel Mode</label>
            <select
              id="audio-input-channel-mode-select"
              className="audio-select"
              value={selectedInputChannelMode}
              onChange={(e) => {
                setSelectedInputChannelMode(e.target.value as 'mono_left' | 'mono_right' | 'stereo')
                setConfigDirty(true)
              }}
            >
              <option value="mono_left">Mono Left</option>
              <option value="mono_right">Mono Right</option>
              <option value="stereo">Stereo</option>
            </select>
          </div>

          <div className="audio-control-group">
            <label className="audio-control-label">Sample Rate</label>
            <select
              className="audio-select"
              value={sampleRate}
              onChange={(e) => {
                setSampleRate(parseInt(e.target.value, 10))
                setConfigDirty(true)
              }}
            >
              <option value={44100}>44.1 kHz</option>
              <option value={48000}>48 kHz</option>
              <option value={96000}>96 kHz</option>
              <option value={192000}>192 kHz</option>
            </select>
          </div>

          <div className="audio-control-group">
            <label className="audio-control-label">Buffer Size</label>
            <select
              className="audio-select"
              value={bufferSize}
              onChange={(e) => {
                setBufferSize(parseInt(e.target.value, 10))
                setConfigDirty(true)
              }}
            >
              <option value={64}>64 samples (1.3ms)</option>
              <option value={128}>128 samples (2.7ms)</option>
              <option value={256}>256 samples (5.3ms)</option>
              <option value={512}>512 samples (10.7ms)</option>
              <option value={1024}>1024 samples (21.3ms)</option>
            </select>
          </div>

          <div className="audio-control-group">
            <div className="audio-slider-row">
              <label className="audio-control-label" htmlFor="audio-input-gain-slider">Input Gain</label>
              <span className="audio-slider-value">{selectedInputGainDb.toFixed(1)} dB</span>
            </div>
            <input
              id="audio-input-gain-slider"
              aria-label="Input Gain"
              className="audio-slider"
              type="range"
              min={-24}
              max={24}
              step={0.5}
              value={selectedInputGainDb}
              onChange={(e) => {
                setSelectedInputGainDb(parseFloat(e.target.value))
                setConfigDirty(true)
              }}
            />
          </div>

          <div className="audio-control-group">
            <div className="audio-slider-row">
              <label className="audio-control-label" htmlFor="audio-output-gain-slider">Output Gain</label>
              <span className="audio-slider-value">{selectedOutputGainDb.toFixed(1)} dB</span>
            </div>
            <input
              id="audio-output-gain-slider"
              aria-label="Output Gain"
              className="audio-slider"
              type="range"
              min={-24}
              max={24}
              step={0.5}
              value={selectedOutputGainDb}
              onChange={(e) => {
                setSelectedOutputGainDb(parseFloat(e.target.value))
                setConfigDirty(true)
              }}
            />
          </div>

          <div className="audio-button-row">
            {!audioStatus?.running ? (
              <button
                className="audio-control-btn"
                onClick={handleStartAudio}
                disabled={isStartingAudio}
              >
                {isStartingAudio ? 'Starting...' : 'Start Audio'}
              </button>
            ) : (
              <button
                className="audio-control-btn"
                onClick={handleStopAudio}
                disabled={isStoppingAudio}
              >
                {isStoppingAudio ? 'Stopping...' : 'Stop Audio'}
              </button>
            )}
            <button
              className="audio-control-btn"
              onClick={handleApplyConfig}
              disabled={!configDirty || isApplyingConfig || isStartingAudio || isStoppingAudio}
            >
              {isApplyingConfig ? 'Applying...' : 'Apply Settings'}
            </button>
          </div>

          <div className="audio-button-row">
            <button className="audio-control-btn" onClick={handleRestart}>
              Restart
            </button>
            <button className="audio-control-btn" onClick={handleTest}>
              Test
            </button>
          </div>

          <div className="audio-button-row">
            <button className="audio-control-btn secondary" onClick={handleMoreInfo}>
              Device Info
            </button>
          </div>
        </div>

        <div className="audio-panel">
          <div className="audio-panel-title">System Status</div>
          <div className="audio-status-list">
            {statusItems.map((item, index) => (
              <div key={index} className={`audio-status-item ${item.status}`}>
                <span className={`audio-status-dot ${item.status}`}></span>
                <span className="audio-status-text">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="audio-config-guide">
        <h4>Hotone Jogg Configuration Guide</h4>
        <p><strong>✓ Recommended:</strong> 48 kHz sample rate, 256 sample buffer</p>
        <p><strong>⚡ Low Latency:</strong> ~5.3ms at 256 samples, 48kHz (optimal for live performance)</p>
        <p><strong>🔧 Optimization:</strong> Disable USB autosuspend to prevent audio dropout. Click "Device Info" for detailed setup guide.</p>
      </div>
    </div>
  )
}

export default AudioInterfaceControl
