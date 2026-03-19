/**
 * AudioInterfaceControl Component - Premium Dark Theme
 *
 * Displays and manages audio interface configuration with:
 * - Hero section with large device image and quick stats
 * - Real-time audio specifications panel
 * - Configuration controls (sample rate, buffer size)
 * - Live status monitoring
 * - Fully responsive design
 */

import React, { useState, useEffect, useCallback } from 'react';
import './AudioInterfaceControl.css';

interface AudioStatus {
  running: boolean;
  sample_rate: number;
  buffer_size: number;
  cpu_load: number;
  engine?: string;
  available: boolean;
  error?: string;
  channels_in?: number;
  channels_out?: number;
}

interface USBPrimaryDevice extends Record<string, unknown> {
  name?: string;
  model?: string;
  vendor_id?: string;
  product_id?: string;
  bus?: string | number;
  device?: string | number;
  alsa_device?: string;
  channels_in?: number;
  channels_out?: number;
}

interface USBDevice {
  hotone_detected: boolean;
  device_count: number;
  primary_device?: USBPrimaryDevice;
  all_devices: Record<string, unknown>[];
  recommendations?: string[];
}

interface AudioHealth {
  total_xruns?: number;
  xrun_rate_per_minute?: number;
  watchdog_enabled?: boolean;
  signal_state?: string;
  input_level_db?: number;
  is_auto_muted?: boolean;
}

interface StatusItem {
  text: string;
  status: 'success' | 'warning' | 'error';
}

interface AudioInterfaceControlProps {
  nodeId?: string | null
}

export const AudioInterfaceControl: React.FC<AudioInterfaceControlProps> = ({ nodeId }) => {
  const [audioStatus, setAudioStatus] = useState<AudioStatus | null>(null);
  const [usbDevices, setUsbDevices] = useState<USBDevice | null>(null);
  const [audioHealth, setAudioHealth] = useState<AudioHealth | null>(null);
  const [sampleRate, setSampleRate] = useState(48000);
  const [bufferSize, setBufferSize] = useState(256);
  const [loading, setLoading] = useState(true);
  const [deviceImage, setDeviceImage] = useState<string>('/img/audio-input.png');
  const [isApplyingConfig, setIsApplyingConfig] = useState(false);
  const [configDirty, setConfigDirty] = useState(false);

  const withNodeQuery = useCallback((path: string) => {
    if (!nodeId || nodeId === 'all') {
      return path
    }
    const separator = path.includes('?') ? '&' : '?'
    return `${path}${separator}node_id=${encodeURIComponent(nodeId)}`
  }, [nodeId])

  // Use bundled assets so the image always loads offline and in production.
  const getDeviceArtwork = (model: string): string => {
    const artworkMap: Record<string, string> = {
      jogg: '/img/audio-input.png',
      ampero: '/img/audio-output.png',
      ampero_one: '/img/audio-output.png',
      ampero_ii: '/img/audio-output.png',
      ampero_mini: '/img/audio-output.png',
    };
    return artworkMap[model] || artworkMap.jogg; // Default to Jogg
  };

  // Fetch audio status
  const updateAudioStatus = useCallback(async () => {
    try {
      const response = await fetch(withNodeQuery('/api/audio/status'));
      const data = await response.json();
      setAudioStatus(data);
      if (!configDirty) {
        setSampleRate(data.sample_rate);
        setBufferSize(data.buffer_size);
      }
    } catch (error) {
      console.error('Failed to fetch audio status:', error);
      setAudioStatus({
        running: false,
        sample_rate: 48000,
        buffer_size: 256,
        cpu_load: 0,
        available: false,
        error: 'Failed to connect to audio engine'
      });
    }
  }, [configDirty, withNodeQuery]);

  // Fetch USB devices
  const updateUSBDevices = useCallback(async () => {
    try {
      const response = await fetch(withNodeQuery('/api/usb/devices'));
      const data = await response.json();
      setUsbDevices(data);
    } catch (error) {
      console.error('Failed to fetch USB devices:', error);
    }
  }, [withNodeQuery]);

  // Fetch audio health
  const updateAudioHealth = useCallback(async () => {
    try {
      const response = await fetch(withNodeQuery('/api/audio/health'));
      if (response.ok) {
        const data = await response.json();
        setAudioHealth(data);
      }
    } catch (error) {
      console.error('Failed to fetch audio health:', error);
    }
  }, [withNodeQuery]);

  // Initial load and auto-refresh
  useEffect(() => {
    const fetchAll = async () => {
      await Promise.all([updateAudioStatus(), updateUSBDevices(), updateAudioHealth()]);
      setLoading(false);
    };

    fetchAll();

    const interval = setInterval(() => {
      updateAudioStatus();
      updateUSBDevices();
      updateAudioHealth();
    }, 10000);

    return () => clearInterval(interval);
  }, [updateAudioStatus, updateUSBDevices, updateAudioHealth]);

  // Monitor device changes and update artwork
  useEffect(() => {
    const currentDevice = usbDevices?.primary_device?.model || 'jogg';
    setDeviceImage(getDeviceArtwork(currentDevice));
  }, [usbDevices?.primary_device?.model]);

  // Apply audio config to backend (query params are required by backend route).
  const handleApplyConfig = async () => {
    setIsApplyingConfig(true);
    try {
      const params = new URLSearchParams({
        sample_rate: String(sampleRate),
        buffer_size: String(bufferSize),
      });
      const response = await fetch(withNodeQuery(`/api/audio/config?${params.toString()}`), {
        method: 'POST',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        alert(data.detail || data.message || 'Failed to apply audio configuration');
        return;
      }

      setConfigDirty(false);
      alert(`Audio configuration updated: ${sampleRate} Hz / ${bufferSize} samples.`);
      await updateAudioStatus();
    } catch (error) {
      alert('Error applying audio configuration: ' + error);
    } finally {
      setIsApplyingConfig(false);
    }
  };

  // Handle engine restart
  const handleRestart = async () => {
    if (!window.confirm('Restart audio engine? This will cause brief audio interruption.')) {
      return;
    }

    try {
      const response = await fetch(withNodeQuery('/api/audio/restart'), { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        alert('Audio engine restarting...');
        setTimeout(updateAudioStatus, 1000);
      }
    } catch (error) {
      alert('Error restarting engine: ' + error);
    }
  };

  // Handle diagnostics test
  const handleTest = async () => {
    try {
      const response = await fetch(withNodeQuery('/api/audio/test'), { method: 'POST' });
      const data = await response.json();
      alert(
        `Audio Test Results:\n\n` +
        `Latency: ${data.latency_ms?.toFixed(2) || 'N/A'} ms\n` +
        `Sample Rate: ${data.sample_rate || 'N/A'} Hz\n` +
        `Buffer Size: ${data.buffer_size || 'N/A'} samples\n` +
        `CPU Load: ${data.cpu_load?.toFixed(1) || 'N/A'}%\n` +
        `Quality Score: ${data.score || 'N/A'}/100\n` +
        `Status: ${data.status || 'Unknown'}`
      );
    } catch (error) {
      alert('Error running diagnostics: ' + error);
    }
  };

  // Handle info button
  const handleMoreInfo = () => {
    if (usbDevices?.primary_device) {
      const device = usbDevices.primary_device;
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
      `;
      alert(joggInfo);
    } else {
      alert('No USB audio device detected');
    }
  };

  // Calculate latency
  const calculateLatency = (): string => {
    if (audioStatus?.buffer_size && audioStatus?.sample_rate) {
      return ((audioStatus.buffer_size / audioStatus.sample_rate) * 1000 * 2).toFixed(1);
    }
    return '5.3';
  };

  // Generate status items
  const getStatusItems = (): StatusItem[] => {
    const items: StatusItem[] = [];

    // Audio engine status
    items.push({
      text: audioStatus?.running ? 'Audio engine running' : 'Audio engine stopped',
      status: audioStatus?.running ? 'success' : 'warning'
    });

    // USB device status
    if (usbDevices?.hotone_detected) {
      items.push({ text: 'Hotone device connected', status: 'success' });
    } else if (usbDevices && usbDevices.device_count > 0) {
      items.push({ text: `${usbDevices.device_count} USB device(s) detected`, status: 'success' });
    } else {
      items.push({ text: 'No USB audio device', status: 'warning' });
    }

    // CPU load
    const cpuLoad = audioStatus?.cpu_load || 0;
    if (cpuLoad < 50) {
      items.push({ text: `CPU: ${cpuLoad.toFixed(1)}% - Excellent`, status: 'success' });
    } else if (cpuLoad < 80) {
      items.push({ text: `CPU: ${cpuLoad.toFixed(1)}% - Good`, status: 'success' });
    } else {
      items.push({ text: `CPU: ${cpuLoad.toFixed(1)}% - High`, status: 'warning' });
    }

    // XRun status
    if (audioHealth) {
      const xruns = audioHealth.total_xruns || 0;
      const xrunRate = audioHealth.xrun_rate_per_minute || 0;

      if (xruns === 0) {
        items.push({ text: 'No buffer underruns', status: 'success' });
      } else if (xrunRate < 1.0) {
        items.push({ text: `${xruns} XRuns (${xrunRate.toFixed(2)}/min)`, status: 'success' });
      } else if (xrunRate < 5.0) {
        items.push({ text: `${xruns} XRuns (${xrunRate.toFixed(2)}/min)`, status: 'warning' });
      } else {
        items.push({ text: `${xruns} XRuns - Critical`, status: 'error' });
      }
    } else {
      items.push({ text: 'Buffer health OK', status: 'success' });
    }

    return items;
  };

  if (loading) {
    return <div className="audio-interface-section" style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading audio interface...</div>;
  }

  const isConnected = audioStatus?.available && (usbDevices?.hotone_detected || (usbDevices?.device_count || 0) > 0);
  const deviceName = usbDevices?.primary_device?.name || audioStatus?.engine || 'Hotone Jogg';
  const latencyMs = calculateLatency();
  const statusItems = getStatusItems();

  return (
    <div className="audio-interface-section">
      {/* Header */}
      <div className="audio-interface-header">
        <h2 className="audio-interface-title">
          <span className="audio-interface-icon">I/O</span>
          Audio Interface
        </h2>
        <div className={`status-badge ${isConnected ? 'connected' : 'disconnected'}`}>
          {isConnected ? '✓ Connected' : '○ Disconnected'}
        </div>
      </div>

      {/* Hero Section with Device Image */}
      <div className="audio-hero-section">
        <div className="audio-device-showcase">
          {/* Device Image */}
          <div className="audio-device-image">
            {deviceImage ? (
              <img
                src={deviceImage}
                alt={deviceName}
                onError={() => {
                  if (deviceImage !== '/img/audio-output.png') {
                    setDeviceImage('/img/audio-output.png');
                    return;
                  }
                  setDeviceImage('');
                }}
              />
            ) : (
              <span className="fallback-icon">I/O</span>
            )}
          </div>

          {/* Device Info */}
          <div className="audio-device-info">
            <div className="audio-device-name">{deviceName}</div>
            <div className="audio-device-subtitle">USB Audio Interface</div>

            {/* Quick Stats */}
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

      {/* Details Section - 3 Column Grid */}
      <div className="audio-details-section">
        {/* Specifications Panel */}
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

        {/* Configuration Panel */}
        <div className="audio-panel">
          <div className="audio-panel-title">Configuration</div>

          <div className="audio-control-group">
            <label className="audio-control-label">Sample Rate</label>
            <select
              className="audio-select"
              value={sampleRate}
              onChange={(e) => {
                setSampleRate(parseInt(e.target.value, 10));
                setConfigDirty(true);
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
                setBufferSize(parseInt(e.target.value, 10));
                setConfigDirty(true);
              }}
            >
              <option value={64}>64 samples (1.3ms)</option>
              <option value={128}>128 samples (2.7ms)</option>
              <option value={256}>256 samples (5.3ms)</option>
              <option value={512}>512 samples (10.7ms)</option>
              <option value={1024}>1024 samples (21.3ms)</option>
            </select>
          </div>

          <div className="audio-button-row">
            <button
              className="audio-control-btn"
              onClick={handleApplyConfig}
              disabled={!configDirty || isApplyingConfig}
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

        {/* Status Panel */}
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

      {/* Configuration Guide */}
      <div className="audio-config-guide">
        <h4>Hotone Jogg Configuration Guide</h4>
        <p><strong>✓ Recommended:</strong> 48 kHz sample rate, 256 sample buffer</p>
        <p><strong>⚡ Low Latency:</strong> ~5.3ms at 256 samples, 48kHz (optimal for live performance)</p>
        <p><strong>🔧 Optimization:</strong> Disable USB autosuspend to prevent audio dropout. Click "Device Info" for detailed setup guide.</p>
      </div>
    </div>
  );
};

export default AudioInterfaceControl;
