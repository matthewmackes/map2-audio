/**
 * LCDPage — Unified LCD Management Console
 *
 * A single, professional interface that consolidates all LCD functionality:
 *
 *  ┌────────┬────────┬───────┬────────┬──────────┬──────────┐
 *  │Displays│ Events │ Nodes │ Alerts │ Hardware │ Settings │
 *  └────────┴────────┴───────┴────────┴──────────┴──────────┘
 *
 * Tab 1 — Displays
 *   Dual LCD real-time simulation, virtual input controller,
 *   custom message composer, event trigger simulator.
 *
 * Tab 2 — Events
 *   WebSocket-based real-time event feed with severity / type filters,
 *   pinned events, event detail modal, cluster statistics.
 *
 * Tab 3 — Nodes
 *   Per-node LCD preview, node health metrics (CPU / memory),
 *   recent events per node, cluster overview grid.
 *
 * Tab 4 — Alerts
 *   Alert routing configuration for 12 event types, target LCD
 *   selection, duration / priority editing, active alert queue.
 *
 * Tab 5 — Hardware
 *   I2C bus scanning, per-LCD test / backlight / reset controls,
 *   FT232H USB-to-I2C interactive pinout, wiring guide, schematic.
 *
 * Tab 6 — Settings
 *   Brightness, auto-off timer, auto-scroll, alert sounds / volume,
 *   broadcast mode, event retention, live preview.
 */

import React, { useState, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Layer } from '@carbon/react'
import {
  Activity,
  Book,
  Branch,
  Categories,
  Chat,
  CheckmarkFilled,
  Chemistry,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Close,
  DataBase,
  Filter,
  Flash,
  Information,
  Keyboard,
  Link,
  Music,
  NetworkAdminControl,
  Notification,
  Pause,
  Pin,
  Play,
  Power,
  Renew,
  Reset,
  Scan,
  Send,
  SettingsAdjust,
  Sun,
  Terminal,
  Tools,
  VolumeUp,
  WarningAlt,
  Waveform,
} from '@carbon/icons-react'
import { LegacyButton } from '../components/shared/LegacyButton'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { NumberInput } from '../components/ParameterControl'
import { useToasts } from '../components/Toasts'
import { lcdApi } from '../../map2/lcd'
import { useLCDEvents, useLCDStatistics, useLCDEventHistory } from '../hooks/useLCDEvents'
import { LCDEventFeed } from '../components/LCDEventFeed'
import { LCDEmulator } from '../components/LCDEmulator'
import { NodeLCDGrid } from '../components/NodeLCDCard'
import { MapRackDeviceIcon } from '../components/icons/map'
import type {
  LCDStatus,
  LCDPage as LCDPageType,
  DualLCDSimulation,
  AlertConfig,
  AlertRoutingConfig,
  LCDPageConfig,
  AlertQueueStatus,
  I2CScanResult,
  TestSuiteResult,
  LCDInputAction,
  AlertSeverity,
  FT232HScanResult,
  FT232HStatus,
} from '../../map2/lcd'
import type { LCDEvent, EventSeverity } from '../models/lcd_event'
import './LCDPage.css'


// ════════════════════════════════════════════════════════════════════════════
// Tab Type
// ════════════════════════════════════════════════════════════════════════════

type TabId = 'displays' | 'events' | 'nodes' | 'alerts' | 'hardware' | 'settings'


// ════════════════════════════════════════════════════════════════════════════
// Sub-components — Displays Tab
// ════════════════════════════════════════════════════════════════════════════

interface LCDSimulatorProps {
  lcdId: number
  lines: string[]
  address: string
  currentPage?: string
  onPageChange?: (page: string) => void
  connected?: boolean
  isPolling?: boolean
}

function LCDSimulator({ lcdId, lines, address, currentPage, onPageChange, connected = true, isPolling }: LCDSimulatorProps) {
  const pages = ['status', 'vu', 'chain', 'plugins', 'midi', 'perf', 'settings', 'menu']

  return (
    <div className="lcd-simulator-card">
      <div className="lcd-header">
        <div className="lcd-title">
          <MapRackDeviceIcon size={18} />
          <span>LCD {lcdId + 1}</span>
          <span className="lcd-address">{address}</span>
        </div>
        <div className="lcd-status-badges">
          {connected ? (
            <span className="pill success"><CheckmarkFilled size={12} /> Connected</span>
          ) : (
            <span className="pill warn"><WarningAlt size={12} /> Disconnected</span>
          )}
          {isPolling && (
            <span className="pill muted"><Activity size={12} /> Live</span>
          )}
        </div>
      </div>

      <div className="lcd-display-frame">
        <div className="lcd-bezel">
          <div className="lcd-screen">
            {lines.map((line, idx) => (
              <div key={idx} className="lcd-line">{line || '\u00A0'}</div>
            ))}
            {lines.length < 4 && Array.from({ length: 4 - lines.length }).map((_, idx) => (
              <div key={`empty-${idx}`} className="lcd-line">{'\u00A0'}</div>
            ))}
          </div>
        </div>
        <div className="lcd-reflection" />
      </div>

      <div className="lcd-page-selector">
        <span className="lcd-page-label">Page:</span>
        <div className="lcd-page-buttons">
          {pages.map(page => (
            <button
              key={page}
              className={`lcd-page-btn ${currentPage === page ? 'active' : ''}`}
              onClick={() => onPageChange?.(page)}
              title={page.charAt(0).toUpperCase() + page.slice(1)}
            >
              {getPageIcon(page)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function getPageIcon(page: string): React.ReactNode {
  const icons: Record<string, React.ReactNode> = {
    status: <Activity size={14} />,
    vu: <VolumeUp size={14} />,
    chain: <Branch size={14} />,
    plugins: <Categories size={14} />,
    midi: <Music size={14} />,
    perf: <Waveform size={14} />,
    settings: <SettingsAdjust size={14} />,
    menu: <SettingsAdjust size={14} />,
  }
  return icons[page] || <MapRackDeviceIcon size={14} />
}

interface InputControllerProps {
  onInput: (action: LCDInputAction) => void
  disabled?: boolean
}

function InputController({ onInput, disabled }: InputControllerProps) {
  return (
    <div className="input-controller">
      <div className="input-title">
        <Keyboard size={16} />
        <span>Virtual input</span>
      </div>

      <div className="input-grid">
        <div className="input-dpad">
          <button className="input-btn dpad-up" onClick={() => onInput('up')} disabled={disabled} title="Up">
            <ChevronUp size={20} />
          </button>
          <div className="dpad-row">
            <button className="input-btn dpad-left" onClick={() => onInput('left')} disabled={disabled} title="Left">
              <ChevronLeft size={20} />
            </button>
            <button className="input-btn dpad-center" onClick={() => onInput('select')} disabled={disabled} title="Select">
              <CheckmarkFilled size={16} />
            </button>
            <button className="input-btn dpad-right" onClick={() => onInput('right')} disabled={disabled} title="Right">
              <ChevronRight size={20} />
            </button>
          </div>
          <button className="input-btn dpad-down" onClick={() => onInput('down')} disabled={disabled} title="Down">
            <ChevronDown size={20} />
          </button>
        </div>

        <div className="input-encoder">
          <div className="encoder-ring">
            <button className="encoder-btn ccw" onClick={() => onInput('encoder_ccw')} disabled={disabled} title="Rotate CCW">
              <Reset size={14} />
            </button>
            <button className="encoder-btn press" onClick={() => onInput('encoder_press')} disabled={disabled} title="Press">●</button>
            <button className="encoder-btn cw" onClick={() => onInput('encoder_cw')} disabled={disabled} title="Rotate CW">
              <Renew size={14} />
            </button>
          </div>
          <span className="encoder-label">Encoder</span>
        </div>

        <div className="input-function-btns">
          <button className="input-btn func" onClick={() => onInput('menu')} disabled={disabled}>Menu</button>
          <button className="input-btn func" onClick={() => onInput('back')} disabled={disabled}>Back</button>
          <button className="input-btn func" onClick={() => onInput('prev_page')} disabled={disabled}>◀ Prev</button>
          <button className="input-btn func" onClick={() => onInput('next_page')} disabled={disabled}>Next ▶</button>
        </div>
      </div>
    </div>
  )
}

interface CustomMessageComposerProps {
  onSend: (lcdId: number, line1: string, line2: string, duration: number) => void
}

function CustomMessageComposer({ onSend }: CustomMessageComposerProps) {
  const [targetLcd, setTargetLcd] = useState<number>(-1)
  const [line1, setLine1] = useState('')
  const [line2, setLine2] = useState('')
  const [duration, setDuration] = useState(5)

  return (
    <div className="message-composer">
      <div className="composer-header">
        <Chat size={18} />
        <span>Custom Message</span>
      </div>

      <div className="composer-content">
        <div className="composer-target">
          <label>Send to:</label>
          <div className="composer-target-btns">
            {[{ id: 0, label: 'LCD 1' }, { id: 1, label: 'LCD 2' }, { id: -1, label: 'Both' }].map(t => (
              <button key={t.id} className={`composer-btn ${targetLcd === t.id ? 'active' : ''}`} onClick={() => setTargetLcd(t.id)}>{t.label}</button>
            ))}
          </div>
        </div>

        <div className="composer-lines">
          <div className="composer-line">
            <label>Line 1:</label>
            <input type="text" maxLength={20} value={line1} onChange={(e) => setLine1(e.target.value)} placeholder="Enter message..." />
            <span className="char-count">{line1.length}/20</span>
          </div>
          <div className="composer-line">
            <label>Line 2:</label>
            <input type="text" maxLength={20} value={line2} onChange={(e) => setLine2(e.target.value)} placeholder="Optional second line..." />
            <span className="char-count">{line2.length}/20</span>
          </div>
        </div>

        <div className="composer-duration">
          <label>Duration:</label>
          <NumberInput
            label="Duration"
            value={duration}
            min={1}
            max={30}
            unit="s"
            profile="time-ms"
            showLabel={false}
            showBounds={false}
            onChange={(nextValue) => setDuration(nextValue)}
          />
        </div>

        <LegacyButton
          variant="primary"
          className="composer-send"
          onClick={() => { onSend(targetLcd, line1, line2, duration); setLine1(''); setLine2('') }}
          disabled={!line1.trim()}
        >
          <Send size={16} /> Send Message
        </LegacyButton>
      </div>
    </div>
  )
}

interface EventTriggersProps {
  onTrigger: (eventType: string, eventData: any) => void
}

function EventTriggers({ onTrigger }: EventTriggersProps) {
  const events = [
    { type: 'chain_loaded', label: 'Chain Loaded', icon: <Branch size={14} />, data: { chain_name: 'Test Chain' } },
    { type: 'snapshot_loaded', label: 'Snapshot Loaded', icon: <Categories size={14} />, data: { snapshot_name: 'Clean Tone' } },
    { type: 'nam_loaded', label: 'NAM Model', icon: <NetworkAdminControl size={14} />, data: { model_name: 'Mesa Boogie' } },
    { type: 'ir_loaded', label: 'IR Loaded', icon: <VolumeUp size={14} />, data: { ir_name: 'Marshall 4x12' } },
    { type: 'xrun', label: 'XRun Alert', icon: <WarningAlt size={14} />, data: { count: 1 } },
    { type: 'cpu_high', label: 'High CPU', icon: <Waveform size={14} />, data: { load: 85 } },
    { type: 'midi_cc', label: 'MIDI CC', icon: <Music size={14} />, data: { cc: 1, value: 127 } },
    { type: 'bypass', label: 'Plugin Bypass', icon: <Power size={14} />, data: { plugin: 'Chorus' } },
  ]

  return (
    <div className="event-triggers">
      <div className="triggers-header">
        <Flash size={18} />
        <span>Event Triggers</span>
        <span className="triggers-hint">Simulate system events</span>
      </div>
      <div className="triggers-grid">
        {events.map(event => (
          <button key={event.type} className="trigger-btn" onClick={() => onTrigger(event.type, event.data)}>
            {event.icon}
            <span>{event.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}


// ════════════════════════════════════════════════════════════════════════════
// Sub-components — Alerts Tab
// ════════════════════════════════════════════════════════════════════════════

interface AlertRouterConfigProps {
  config: AlertConfig | null
  onUpdate: (config: { routing?: Record<string, Partial<AlertRoutingConfig>>; pages?: Record<number, Partial<LCDPageConfig>> }) => void
}

function AlertRouterConfig({ config, onUpdate }: AlertRouterConfigProps) {
  const [editingAlert, setEditingAlert] = useState<string | null>(null)

  const alertTypes = [
    { type: 'XRUN', label: 'Audio Dropouts (XRuns)', severity: 'warning' as AlertSeverity },
    { type: 'HIGH_XRUN_RATE', label: 'High XRun Rate', severity: 'critical' as AlertSeverity },
    { type: 'THREAD_STALL', label: 'Thread Stall', severity: 'critical' as AlertSeverity },
    { type: 'SIGNAL_LOST', label: 'Signal Lost', severity: 'info' as AlertSeverity },
    { type: 'AUTO_MUTED', label: 'Auto Muted', severity: 'info' as AlertSeverity },
    { type: 'BUFFER_UNDERRUN', label: 'Buffer Underrun', severity: 'warning' as AlertSeverity },
    { type: 'CPU_HIGH', label: 'High CPU Load', severity: 'warning' as AlertSeverity },
    { type: 'CHAIN_LOADED', label: 'Chain Loaded', severity: 'info' as AlertSeverity },
    { type: 'SNAPSHOT_LOADED', label: 'Snapshot Loaded', severity: 'info' as AlertSeverity },
    { type: 'PLUGIN_BYPASSED', label: 'Plugin Bypassed', severity: 'info' as AlertSeverity },
    { type: 'NAM_MODEL_LOADED', label: 'NAM Model Loaded', severity: 'info' as AlertSeverity },
    { type: 'IR_LOADED', label: 'IR Loaded', severity: 'info' as AlertSeverity },
  ]

  const getSeverityColor = (severity: AlertSeverity) => {
    switch (severity) {
      case 'critical': return '#ef4444'
      case 'warning': return '#f59e0b'
      case 'info': return '#3b82f6'
      default: return '#6b7280'
    }
  }

  return (
    <div className="alert-router-config">
      <div className="alert-router-header">
        <Notification size={18} />
        <span>Alert Routing</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280', fontWeight: 400 }}>
          Configure which events appear on each LCD and how they behave
        </span>
      </div>

      <div className="alert-types-grid">
        {alertTypes.map(({ type, label, severity }) => {
          const routing = config?.routing?.[type]
          const isEnabled = routing?.enabled ?? true
          const targetLcd = routing?.target_lcd ?? 0

          return (
            <div key={type} className={`alert-type-card ${isEnabled ? 'enabled' : 'disabled'}`} onClick={() => setEditingAlert(editingAlert === type ? null : type)}>
              <div className="alert-type-header">
                <span className="alert-severity-dot" style={{ backgroundColor: getSeverityColor(severity) }} />
                <span className="alert-type-label">{label}</span>
                <button
                  className={`alert-toggle ${isEnabled ? 'on' : 'off'}`}
                  onClick={(e) => { e.stopPropagation(); onUpdate({ routing: { [type]: { enabled: !isEnabled } } }) }}
                >
                  {isEnabled ? 'ON' : 'OFF'}
                </button>
              </div>

              <div className="alert-type-target">
                <span>Target:</span>
                <div className="lcd-target-btns">
                  {[{ id: 0, label: 'LCD 1' }, { id: 1, label: 'LCD 2' }, { id: -1, label: 'Both' }].map(t => (
                    <button
                      key={t.id}
                      className={`lcd-target-btn ${targetLcd === t.id ? 'active' : ''}`}
                      onClick={(e) => { e.stopPropagation(); onUpdate({ routing: { [type]: { target_lcd: t.id } } }) }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {editingAlert === type && (
                <div className="alert-type-details">
                  <div className="alert-detail-row">
                    <label>Duration (sec):</label>
                    <div onClick={(e) => e.stopPropagation()}>
                      <NumberInput
                        label="Duration (sec)"
                        value={routing?.duration_seconds ?? 5}
                        min={1}
                        max={60}
                        unit="s"
                        showLabel={false}
                        showBounds={false}
                        onChange={(nextValue) => onUpdate({ routing: { [type]: { duration_seconds: nextValue } } })}
                      />
                    </div>
                  </div>
                  <div className="alert-detail-row">
                    <label>Priority (1-10):</label>
                    <div onClick={(e) => e.stopPropagation()}>
                      <NumberInput
                        label="Priority"
                        value={routing?.priority ?? 5}
                        min={1}
                        max={10}
                        showLabel={false}
                        showBounds={false}
                        onChange={(nextValue) => onUpdate({ routing: { [type]: { priority: nextValue } } })}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}


// ════════════════════════════════════════════════════════════════════════════
// Sub-components — Hardware Tab
// ════════════════════════════════════════════════════════════════════════════

interface HardwareControlsProps {
  onScan: () => void
  onTest: (lcdId: number) => void
  onBacklight: (lcdId: number, enabled: boolean) => void
  onReset: (lcdId: number) => void
  scanResult?: I2CScanResult
  isScanning?: boolean
}

function HardwareControls({ onScan, onTest, onBacklight, onReset, scanResult, isScanning }: HardwareControlsProps) {
  return (
    <div className="hardware-controls">
      <div className="hardware-header">
        <DataBase size={18} />
        <span>I2C Bus &amp; LCD Control</span>
      </div>

      <div className="hardware-actions">
        <LegacyButton variant="ghost" onClick={onScan} disabled={isScanning}>
          <Scan size={16} />
          {isScanning ? 'Scanning…' : 'Scan I2C Bus'}
        </LegacyButton>

        {scanResult && (
          <div className="scan-results">
            <span className="scan-summary">Found {scanResult.lcd_count} LCD{scanResult.lcd_count !== 1 ? 's' : ''} on bus {scanResult.bus}</span>
            <div className="scan-devices">
              {scanResult.devices.map(device => (
                <div key={device.address} className="scan-device">
                  <span className="device-address">{device.address_hex}</span>
                  <span className="device-type">{device.device_type}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="lcd-controls-grid">
        {[0, 1].map(lcdId => (
          <div key={lcdId} className="lcd-control-card">
            <div className="lcd-control-header"><MapRackDeviceIcon size={14} /><span>LCD {lcdId + 1}</span></div>
            <div className="lcd-control-buttons">
              <LegacyButton variant="secondary" size="sm" onClick={() => onTest(lcdId)} title="Run display test"><Chemistry size={14} /> Test</LegacyButton>
              <LegacyButton variant="secondary" size="sm" iconDescription="Backlight on" onClick={() => onBacklight(lcdId, true)} title="Backlight on"><Sun size={14} /></LegacyButton>
              <LegacyButton variant="secondary" size="sm" iconDescription="Backlight off" onClick={() => onBacklight(lcdId, false)} title="Backlight off"><Sun size={14} /></LegacyButton>
              <LegacyButton variant="secondary" size="sm" iconDescription="Reset display" onClick={() => onReset(lcdId)} title="Reset display"><Reset size={14} /></LegacyButton>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

interface FT232HConfigProps {
  onScan: () => void
  onTestLCD: (address: number) => void
  onTestWrite: (address: number, message: string) => void
  scanResult?: I2CScanResult
  isScanning?: boolean
  deviceStatus?: { connected: boolean; url: string; frequency: number; devices: { address: number; type: string }[] }
}

function FT232HConfig({ onScan, onTestLCD, onTestWrite, scanResult, isScanning, deviceStatus }: FT232HConfigProps) {
  const [selectedPin, setSelectedPin] = useState<string | null>(null)
  const [testMessage, setTestMessage] = useState('Hello MAP2!')
  const [testAddress, setTestAddress] = useState(0x27)

  const pins = {
    left: [
      { id: 'GND1', name: 'GND', type: 'power', description: 'Ground — Connect to LCD GND' },
      { id: 'D7', name: 'D7', type: 'gpio', description: 'GPIO — General Purpose I/O' },
      { id: 'D6', name: 'D6', type: 'gpio', description: 'GPIO — General Purpose I/O' },
      { id: 'D5', name: 'D5', type: 'gpio', description: 'GPIO — General Purpose I/O' },
      { id: 'D4', name: 'D4', type: 'gpio', description: 'GPIO — General Purpose I/O' },
      { id: 'C9', name: 'C9', type: 'gpio', description: 'GPIO (original board)' },
      { id: 'C8', name: 'C8', type: 'gpio', description: 'GPIO (original board)' },
    ],
    right: [
      { id: '5V', name: '5V', type: 'power', description: 'Power Output — 5V from USB, connect to LCD VCC' },
      { id: 'D0', name: 'D0 (SCL)', type: 'i2c', description: 'I2C Clock (SCL) — Connect to LCD SCL' },
      { id: 'D1', name: 'D1 (SDA)', type: 'i2c', description: 'I2C Data (SDA) — Connect to LCD SDA' },
      { id: 'D2', name: 'D2 (SDA)', type: 'i2c', description: 'I2C Data (SDA) — Tie to D1 for I2C' },
      { id: 'D3', name: 'D3 (CS)', type: 'spi', description: 'SPI Chip Select (not used for I2C)' },
      { id: 'GND2', name: 'GND', type: 'power', description: 'Ground — Connect to LCD GND' },
      { id: '3V', name: '3.3V', type: 'power', description: '3.3V Output (USB-C version)' },
    ],
  }

  const i2cWiring = [
    { from: 'D0', to: 'SCL', description: 'I2C Clock Signal' },
    { from: 'D1', to: 'SDA', description: 'I2C Data Signal' },
    { from: '5V', to: 'VCC', description: 'Power (5V)' },
    { from: 'GND1', to: 'GND', description: 'Ground' },
  ]

  return (
    <div className="ft232h-config">
      <div className="ft232h-header">
        <Waveform size={20} />
        <span>FT232H USB-to-I2C Configuration</span>
        <a href="https://learn.adafruit.com/circuitpython-on-any-computer-with-ft232h" target="_blank" rel="noopener noreferrer" className="ft232h-docs-link">
          <Link size={14} /> Adafruit Docs
        </a>
      </div>

      <div className="ft232h-layout">
        {/* Left — Device Status */}
        <div className="ft232h-status-panel">
          <div className="panel-header"><Activity size={16} /><span>Device Status</span></div>

          <div className="status-item">
            <span className="status-label">USB Device</span>
            <span className={`status-value ${deviceStatus?.connected ? 'connected' : 'disconnected'}`}>
              {deviceStatus?.connected ? <><CheckmarkFilled size={14} /> FT232H Detected</> : <><WarningAlt size={14} /> Not Detected</>}
            </span>
          </div>
          <div className="status-item"><span className="status-label">Vendor ID</span><span className="status-value mono">0x0403</span></div>
          <div className="status-item"><span className="status-label">Product ID</span><span className="status-value mono">0x6014</span></div>
          <div className="status-item"><span className="status-label">I2C Frequency</span><span className="status-value mono">{deviceStatus?.frequency || 100000} Hz</span></div>
          <div className="status-item"><span className="status-label">URL</span><span className="status-value mono small">{deviceStatus?.url || 'ftdi://ftdi:232h/1'}</span></div>

          <LegacyButton variant="primary" fullWidth onClick={onScan} disabled={isScanning}>
            <Scan size={16} /> {isScanning ? 'Scanning…' : 'Scan I2C Bus'}
          </LegacyButton>

          {scanResult && (
            <div className="scan-results-box">
              <div className="scan-header">Found {scanResult.lcd_count} device{scanResult.lcd_count !== 1 ? 's' : ''}</div>
              {scanResult.devices.map(device => (
                <div key={device.address} className={`scan-device-item ${device.address === testAddress ? 'selected' : ''}`} onClick={() => setTestAddress(device.address)}>
                  <span className="device-addr">{device.address_hex}</span>
                  <span className="device-type">{device.device_type}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Center — Interactive Board & Schematic */}
        <div className="ft232h-board-container">
          <div className="board-title">FT232H Breakout Board (USB-C Version)</div>

          <div className="board-image-wrapper">
            <img src="/images/ft232h-pinout.jpg" alt="FT232H Pinout Diagram" className="board-photo" />
            <div className="pin-overlays">
              <div className={`pin-overlay i2c ${selectedPin === 'D0' ? 'selected' : ''}`} style={{ top: '33%', right: '8%' }} onClick={() => setSelectedPin(selectedPin === 'D0' ? null : 'D0')} title="D0 — SCL"><span className="pin-label">SCL</span></div>
              <div className={`pin-overlay i2c ${selectedPin === 'D1' ? 'selected' : ''}`} style={{ top: '39%', right: '8%' }} onClick={() => setSelectedPin(selectedPin === 'D1' ? null : 'D1')} title="D1 — SDA"><span className="pin-label">SDA</span></div>
              <div className={`pin-overlay power ${selectedPin === '5V' ? 'selected' : ''}`} style={{ top: '27%', right: '8%' }} onClick={() => setSelectedPin(selectedPin === '5V' ? null : '5V')} title="5V Power"><span className="pin-label">5V</span></div>
              <div className={`pin-overlay power ${selectedPin === 'GND1' ? 'selected' : ''}`} style={{ top: '27%', left: '8%' }} onClick={() => setSelectedPin(selectedPin === 'GND1' ? null : 'GND1')} title="Ground"><span className="pin-label">GND</span></div>
            </div>
          </div>

          <div className="schematic-title">I2C Connection Schematic</div>
          <svg viewBox="0 0 400 200" className="ft232h-schematic-svg">
            <rect x="20" y="40" width="120" height="120" rx="8" fill="#1a1a2e" stroke="#22c55e" strokeWidth="2" />
            <text x="80" y="70" textAnchor="middle" fill="#22c55e" fontSize="14" fontWeight="bold">FT232H</text>
            <text x="80" y="90" textAnchor="middle" fill="#666" fontSize="10">USB Adapter</text>
            <circle cx="140" cy="70" r="6" fill="#22c55e" /><text x="135" y="62" textAnchor="end" fill="#fff" fontSize="9">D0 (SCL)</text>
            <circle cx="140" cy="95" r="6" fill="#22c55e" /><text x="135" y="87" textAnchor="end" fill="#fff" fontSize="9">D1 (SDA)</text>
            <circle cx="140" cy="120" r="6" fill="#ef4444" /><text x="135" y="112" textAnchor="end" fill="#fff" fontSize="9">5V</text>
            <circle cx="140" cy="145" r="6" fill="#ef4444" /><text x="135" y="137" textAnchor="end" fill="#fff" fontSize="9">GND</text>
            <line x1="146" y1="70" x2="254" y2="70" stroke="#22c55e" strokeWidth="3" />
            <line x1="146" y1="95" x2="254" y2="95" stroke="#22c55e" strokeWidth="3" />
            <line x1="146" y1="120" x2="254" y2="120" stroke="#ef4444" strokeWidth="3" />
            <line x1="146" y1="145" x2="254" y2="145" stroke="#ef4444" strokeWidth="3" />
            <polygon points="245,66 255,70 245,74" fill="#22c55e" />
            <polygon points="245,91 255,95 245,99" fill="#22c55e" />
            <polygon points="245,116 255,120 245,124" fill="#ef4444" />
            <polygon points="245,141 255,145 245,149" fill="#ef4444" />
            <rect x="260" y="40" width="120" height="120" rx="8" fill="#1a1a2e" stroke="#3b82f6" strokeWidth="2" />
            <text x="320" y="70" textAnchor="middle" fill="#3b82f6" fontSize="14" fontWeight="bold">I2C LCD</text>
            <text x="320" y="90" textAnchor="middle" fill="#666" fontSize="10">PCF8574</text>
            <circle cx="260" cy="70" r="6" fill="#22c55e" /><text x="265" y="62" textAnchor="start" fill="#fff" fontSize="9">SCL</text>
            <circle cx="260" cy="95" r="6" fill="#22c55e" /><text x="265" y="87" textAnchor="start" fill="#fff" fontSize="9">SDA</text>
            <circle cx="260" cy="120" r="6" fill="#ef4444" /><text x="265" y="112" textAnchor="start" fill="#fff" fontSize="9">VCC</text>
            <circle cx="260" cy="145" r="6" fill="#ef4444" /><text x="265" y="137" textAnchor="start" fill="#fff" fontSize="9">GND</text>
            <g transform="translate(100, 180)">
              <circle cx="0" cy="0" r="5" fill="#22c55e" /><text x="10" y="4" fill="#888" fontSize="9">I2C Signal</text>
              <circle cx="100" cy="0" r="5" fill="#ef4444" /><text x="110" y="4" fill="#888" fontSize="9">Power</text>
            </g>
          </svg>

          {selectedPin && (
            <div className="pin-detail-popup">
              {pins.left.concat(pins.right).find(p => p.id === selectedPin)?.description}
            </div>
          )}
        </div>

        {/* Right — Wiring & Testing */}
        <div className="ft232h-wiring-panel">
          <div className="panel-header"><Link size={16} /><span>I2C LCD Wiring</span></div>
          <div className="wiring-table">
            <div className="wiring-header"><span>FT232H</span><span></span><span>LCD</span></div>
            {i2cWiring.map(wire => (
              <div key={wire.from} className="wiring-row">
                <span className="wire-from">{wire.from}</span>
                <span className="wire-arrow">→</span>
                <span className="wire-to">{wire.to}</span>
              </div>
            ))}
          </div>
          <div className="wiring-notes"><WarningAlt size={14} /><span>Set I2C switch to ON position</span></div>

          <div className="panel-header" style={{ marginTop: 16 }}><Chemistry size={16} /><span>LCD Test</span></div>
          <div className="test-controls">
            <div className="test-address">
              <label>I2C Address</label>
              <select value={testAddress} onChange={(e) => setTestAddress(parseInt(e.target.value))}>
                <option value={0x27}>0x27 (PCF8574)</option>
                <option value={0x3F}>0x3F (PCF8574A)</option>
                <option value={0x20}>0x20</option>
                <option value={0x38}>0x38</option>
              </select>
            </div>
            <div className="test-message">
              <label>Test Message</label>
              <input type="text" value={testMessage} onChange={(e) => setTestMessage(e.target.value)} maxLength={20} placeholder="Enter message…" />
            </div>
            <LegacyButton variant="primary" fullWidth onClick={() => onTestWrite(testAddress, testMessage)}><Send size={16} /> Send to LCD</LegacyButton>
            <LegacyButton variant="ghost" fullWidth onClick={() => onTestLCD(testAddress)}><Chemistry size={16} /> Run Display Test</LegacyButton>
          </div>

          <div className="panel-header" style={{ marginTop: 16 }}><Terminal size={16} /><span>CLI Commands</span></div>
          <div className="cli-commands">
            <code>python lcd/test_ft232h_lcd.py</code>
            <code>sudo ./scripts/setup_ft232h.sh</code>
          </div>
        </div>
      </div>
    </div>
  )
}


// ════════════════════════════════════════════════════════════════════════════
// Sub-components — Events Tab (from LCDDashboardPage)
// ════════════════════════════════════════════════════════════════════════════

interface EventDetailsModalProps {
  event: LCDEvent
  onClose: () => void
  onPin: () => void
  onUnpin: () => void
  isPinned: boolean
}

function EventDetailsModal({ event, onClose, onPin, onUnpin, isPinned }: EventDetailsModalProps) {
  return (
    <div className="event-modal-overlay" onClick={onClose}>
      <div className="event-modal" onClick={(e) => e.stopPropagation()}>
        <div className="event-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 32 }}>{event.icon}</span>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#60a5fa', margin: 0 }}>{event.title}</h2>
              <p style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 0' }}>{event.source_node}</p>
            </div>
          </div>
          <LegacyButton variant="ghost" size="sm" iconDescription="Close event details" onClick={onClose}><Close size={18} /></LegacyButton>
        </div>

        <div className="event-modal-body">
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: '#6b7280' }}>Message</label>
            <p style={{ fontSize: 16, color: '#f3f4f6', margin: '4px 0 0' }}>{event.message}</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div><label style={{ fontSize: 12, color: '#6b7280' }}>Severity</label><p style={{ color: '#f3f4f6', fontWeight: 600, margin: '4px 0 0' }}>{event.severity.toUpperCase()}</p></div>
            <div><label style={{ fontSize: 12, color: '#6b7280' }}>Type</label><p style={{ color: '#f3f4f6', fontWeight: 600, margin: '4px 0 0' }}>{event.event_type.toUpperCase()}</p></div>
            <div><label style={{ fontSize: 12, color: '#6b7280' }}>Time</label><p style={{ color: '#f3f4f6', fontFamily: 'var(--font-ui-tight)', fontSize: 13, margin: '4px 0 0' }}>{new Date(event.timestamp).toLocaleString()}</p></div>
            <div><label style={{ fontSize: 12, color: '#6b7280' }}>Event ID</label><p style={{ color: '#f3f4f6', fontFamily: 'var(--font-ui-tight)', fontSize: 13, margin: '4px 0 0' }}>{event.event_id.substring(0, 12)}…</p></div>
          </div>

          {Object.keys(event.context).length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 8 }}>Context</label>
              <pre style={{ background: '#0a0a0a', padding: 12, borderRadius: 6, fontSize: 12, color: '#22c55e', overflowX: 'auto', margin: 0 }}>
                {JSON.stringify(event.context, null, 2)}
              </pre>
            </div>
          )}

          <div style={{ background: '#0a0a0a', borderRadius: 6, padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#6b7280' }}>Broadcast:</span><span style={{ color: '#f3f4f6' }}>{event.broadcast ? '✓ Yes' : '✗ No'}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#6b7280' }}>Sound:</span><span style={{ color: '#f3f4f6' }}>{event.sound ? '🔊 Yes' : '🔇 No'}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#6b7280' }}>TTL:</span><span style={{ color: '#f3f4f6' }}>{event.ttl}s</span></div>
          </div>
        </div>

        <div className="event-modal-footer">
          <LegacyButton variant="primary" style={{ flex: 1 }} onClick={isPinned ? onUnpin : onPin}>
            <Pin size={14} /> {isPinned ? 'Unpin' : 'Pin'}
          </LegacyButton>
          <LegacyButton variant="ghost" style={{ flex: 1 }} onClick={onClose}>Close</LegacyButton>
        </div>
      </div>
    </div>
  )
}


// ════════════════════════════════════════════════════════════════════════════
// Sub-components — Nodes Tab (from NodeLCDPage)
// ════════════════════════════════════════════════════════════════════════════

interface MockNodeStatus {
  nodeId: string
  status: 'online' | 'offline' | 'local'
  lastEvent?: string
  eventCount: number
  cpu?: number
  memory?: number
}

function NodeHealthBar({ label, value }: { label: string; value: number }) {
  const color = value > 80 ? '#ef4444' : value > 50 ? '#f59e0b' : '#22c55e'
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
        <span style={{ color: '#6b7280' }}>{label}</span>
        <span style={{ color: '#f3f4f6', fontWeight: 600 }}>{value.toFixed(1)}%</span>
      </div>
      <div style={{ height: 6, background: '#111111', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(value, 100)}%`, background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
    </div>
  )
}

function NodeOverviewCard({ node }: { node: MockNodeStatus }) {
  const borderColor = node.status === 'online' ? '#22c55e' : node.status === 'local' ? '#3b82f6' : '#f59e0b'
  const statusLabel = node.status === 'online' ? '✓ Online' : node.status === 'offline' ? '⚠ Offline' : '◆ Local'

  return (
    <div style={{ border: `2px solid ${borderColor}`, borderRadius: 8, padding: 12, background: 'rgba(0,0,0,0.3)' }}>
      <h4 style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0 }}>{node.nodeId}</h4>
      <p style={{ fontSize: 11, color: '#6b7280', margin: '4px 0 0' }}>{statusLabel}</p>
      <p style={{ fontSize: 11, margin: '8px 0 0' }}><span style={{ color: '#60a5fa' }}>{node.eventCount}</span> events</p>
      {node.cpu !== undefined && <p style={{ fontSize: 11, color: '#f59e0b', margin: '2px 0 0' }}>CPU: {node.cpu.toFixed(0)}%</p>}
    </div>
  )
}


// ════════════════════════════════════════════════════════════════════════════
// Sub-components — Settings Tab (from LCDSettingsPage)
// ════════════════════════════════════════════════════════════════════════════

interface LCDSettings {
  brightness: number
  autoOffTime: number
  soundEnabled: boolean
  soundVolume: number
  alertSoundOnly: boolean
  broadcastMode: 'all' | 'critical' | 'local-only'
  eventRetention: number
  autoScrollDelay: number
}


// ════════════════════════════════════════════════════════════════════════════
// Main Page Component
// ════════════════════════════════════════════════════════════════════════════

export function LCDPage() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const [activeTab, setActiveTab] = useState<TabId>('displays')
  const [isPolling, setIsPolling] = useState(true)

  // ── LCD core queries ──────────────────────────────────────────────────
  const statusQuery = useQuery({ queryKey: ['lcd', 'status'], queryFn: lcdApi.getStatus, refetchInterval: isPolling ? 7000 : false, retry: 1, staleTime: 5000 })
  const simulationQuery = useQuery({ queryKey: ['lcd', 'simulation'], queryFn: lcdApi.getDualSimulation, refetchInterval: isPolling ? 7000 : false, retry: 1, staleTime: 5000 })
  const pagesQuery = useQuery({ queryKey: ['lcd', 'pages'], queryFn: lcdApi.getPages })
  const alertConfigQuery = useQuery({ queryKey: ['lcd', 'alertConfig'], queryFn: lcdApi.getAlertConfig })
  const activeAlertsQuery = useQuery({ queryKey: ['lcd', 'activeAlerts'], queryFn: lcdApi.getActiveAlerts, refetchInterval: isPolling ? 7000 : false, retry: 1, staleTime: 5000 })

  // ── LCD core mutations ────────────────────────────────────────────────
  const setPageMutation = useMutation({
    mutationFn: ({ lcdId, page }: { lcdId: number; page: string }) => lcdApi.setLCDPage(lcdId, page),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lcd'] }); pushToast('Page changed', 'success') },
    onError: () => pushToast('Failed to change page', 'error'),
  })
  const inputMutation = useMutation({
    mutationFn: lcdApi.simulateInput,
    onSuccess: (data) => { queryClient.invalidateQueries({ queryKey: ['lcd', 'simulation'] }); pushToast(`Input: ${data.action}`, 'info') },
    onError: () => pushToast('Failed to simulate input', 'error'),
  })
  const messageMutation = useMutation({
    mutationFn: ({ lcdId, line1, line2, duration }: { lcdId: number; line1: string; line2: string; duration: number }) => lcdApi.displayMessage(lcdId, line1, line2, duration),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lcd', 'simulation'] }); pushToast('Message sent', 'success') },
    onError: () => pushToast('Failed to send message', 'error'),
  })
  const scanMutation = useMutation({
    mutationFn: () => lcdApi.scanI2C(1),
    onSuccess: (data) => pushToast(`Found ${data.lcd_count} LCD(s)`, 'success'),
    onError: () => pushToast('I2C scan failed', 'error'),
  })
  const ft232hScanMutation = useMutation({
    mutationFn: () => lcdApi.scanFT232H(),
    onSuccess: (data) => { pushToast(data.status.connected ? `FT232H: Found ${data.lcd_count} device(s)` : `FT232H: ${data.status.error || 'Not connected'}`, data.status.connected ? 'success' : 'warning' as any) },
    onError: () => pushToast('FT232H scan failed', 'error'),
  })
  const ft232hWriteMutation = useMutation({
    mutationFn: (request: { address: number; line1: string; line2?: string }) => lcdApi.writeFT232H(request),
    onSuccess: () => pushToast('Text written to LCD', 'success'),
    onError: (e) => pushToast(`Write failed: ${e}`, 'error'),
  })
  const ft232hTestMutation = useMutation({
    mutationFn: (address: number) => lcdApi.testFT232H(address),
    onSuccess: (data) => pushToast(`Test sent to ${data.address}`, 'success'),
    onError: () => pushToast('LCD test failed', 'error'),
  })
  const testMutation = useMutation({ mutationFn: lcdApi.testDisplay, onSuccess: () => pushToast('Display test triggered', 'info'), onError: () => pushToast('Test failed', 'error') })
  const backlightMutation = useMutation({
    mutationFn: ({ lcdId, enabled }: { lcdId: number; enabled: boolean }) => lcdApi.toggleBacklight(lcdId, enabled),
    onSuccess: (data) => pushToast(`Backlight ${data.backlight ? 'on' : 'off'}`, 'info'),
    onError: () => pushToast('Backlight toggle failed', 'error'),
  })
  const resetMutation = useMutation({ mutationFn: lcdApi.resetDisplay, onSuccess: () => pushToast('Display reset', 'info'), onError: () => pushToast('Reset failed', 'error') })
  const updateAlertConfigMutation = useMutation({
    mutationFn: lcdApi.updateAlertConfig,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lcd', 'alertConfig'] }); pushToast('Alert config updated', 'success') },
    onError: () => pushToast('Failed to update config', 'error'),
  })

  // ── Handlers ──────────────────────────────────────────────────────────
  const handlePageChange = useCallback((lcdId: number, page: string) => { setPageMutation.mutate({ lcdId, page }) }, [setPageMutation])
  const handleInput = useCallback((action: LCDInputAction) => { inputMutation.mutate(action) }, [inputMutation])
  const handleSendMessage = useCallback((lcdId: number, line1: string, line2: string, duration: number) => { messageMutation.mutate({ lcdId, line1, line2, duration }) }, [messageMutation])
  const handleEventTrigger = useCallback((eventType: string, eventData: any) => {
    const messages: Record<string, string> = {
      chain_loaded: `Chain: ${eventData.chain_name}`, snapshot_loaded: `Snapshot: ${eventData.snapshot_name}`,
      nam_loaded: `NAM: ${eventData.model_name}`, ir_loaded: `IR: ${eventData.ir_name}`,
      xrun: `XRun #${eventData.count}`, cpu_high: `CPU: ${eventData.load}%`,
      midi_cc: `CC${eventData.cc}: ${eventData.value}`, bypass: `Bypassed: ${eventData.plugin}`,
    }
    messageMutation.mutate({ lcdId: -1, line1: messages[eventType] || eventType, line2: new Date().toLocaleTimeString(), duration: 3 })
    pushToast(`Triggered: ${eventType}`, 'info')
  }, [messageMutation, pushToast])

  // ── Events tab state (from LCDDashboardPage) ─────────────────────────
  const { events: wsEvents, connected: wsEventConnected, error: wsEventError } = useLCDEvents()
  const { stats: lcdEventStats } = useLCDStatistics()
  const [filterSeverity, setFilterSeverity] = useState<EventSeverity | 'all'>('all')
  const [filterType, setFilterType] = useState<string | 'all'>('all')
  const [pinned, setPinned] = useState<Set<string>>(new Set())
  const [selectedEvent, setSelectedEvent] = useState<LCDEvent | null>(null)

  const filteredEvents = wsEvents.filter(e => {
    if (filterSeverity !== 'all' && e.severity !== filterSeverity) return false
    if (filterType !== 'all' && e.event_type !== filterType) return false
    return true
  })
  const pinnedEvents = wsEvents.filter(e => pinned.has(e.event_id))

  // ── Nodes tab state (from NodeLCDPage) ────────────────────────────────
  const [selectedNode, setSelectedNode] = useState<string>('CONTROL-NODE-E5F6')
  const [nodes] = useState<MockNodeStatus[]>([
    { nodeId: 'AUDIO-NODE-A1B2', status: 'online', eventCount: 42, lastEvent: '14:32:15', cpu: 65, memory: 48 },
    { nodeId: 'AUDIO-NODE-C3D4', status: 'online', eventCount: 38, lastEvent: '14:32:08', cpu: 52, memory: 41 },
    { nodeId: 'CONTROL-NODE-E5F6', status: 'local', eventCount: 127, lastEvent: '14:32:22' },
    { nodeId: 'AUDIO-NODE-G7H8', status: 'offline', eventCount: 25, lastEvent: '14:15:43' },
  ])
  const { events: nodeEvents } = useLCDEventHistory(50, undefined, undefined, 'local')
  const selectedNodeData = nodes.find(n => n.nodeId === selectedNode)
  const currentNodeEvent = nodeEvents[0]

  // ── Settings tab state (from LCDSettingsPage) ─────────────────────────
  const [settings, setSettings] = useState<LCDSettings>({
    brightness: 100, autoOffTime: 0, soundEnabled: true, soundVolume: 70,
    alertSoundOnly: true, broadcastMode: 'all', eventRetention: 24, autoScrollDelay: 3,
  })
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const handleSaveSettings = async () => {
    setSaveStatus('saving')
    try { await new Promise(r => setTimeout(r, 500)); setSaveStatus('saved'); setTimeout(() => setSaveStatus('idle'), 2000) }
    catch { setSaveStatus('error') }
  }

  // ── Computed values ───────────────────────────────────────────────────
  const lcd1Lines = simulationQuery.data?.lcd_1?.lines || ['LCD 1', 'Waiting...']
  const lcd2Lines = simulationQuery.data?.lcd_2?.lines || ['LCD 2', 'Waiting...']
  const currentPage = statusQuery.data?.current_page || 'status'
  const isRunning = statusQuery.data?.running || false
  const isSimulation = statusQuery.data?.simulation_mode || false
  const uptime = statusQuery.data?.uptime_seconds || 0
  const sysStats = statusQuery.data?.statistics || { updates: 0, page_changes: 0, errors: 0, input_events: 0 }
  const queueLength = activeAlertsQuery.data?.queue_length || 0

  // ── Tab definitions ───────────────────────────────────────────────────
  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'displays', label: 'Displays', icon: <MapRackDeviceIcon size={16} /> },
    { id: 'events',   label: 'Events',   icon: <Activity size={16} /> },
    { id: 'nodes',    label: 'Nodes',    icon: <Tools size={16} /> },
    { id: 'alerts',   label: 'Alerts',   icon: <Notification size={16} /> },
    { id: 'hardware', label: 'Hardware',  icon: <DataBase size={16} /> },
    { id: 'settings', label: 'Settings', icon: <SettingsAdjust size={16} /> },
  ]

  return (
    <section className="lcd-page-route">
      <Layer className="lcd-page-route__surface">
      <div className="lcd-page">
      <PageHeader
        title="LCD Management Console"
        subtitle="Unified control center for dual-LCD display hardware, real-time events, alert routing, and system configuration"
        icon={<MapRackDeviceIcon size={32} style={{ color: '#22c55e' }} />}
        actions={
          <div className="flex" style={{ gap: 8 }}>
            <LegacyButton variant={isPolling ? 'primary' : 'ghost'} onClick={() => setIsPolling(!isPolling)} title={isPolling ? 'Pause live updates' : 'Resume live updates'}>
              {isPolling ? <Pause size={16} /> : <Play size={16} />}
              {isPolling ? 'Live' : 'Paused'}
            </LegacyButton>
            <LegacyButton variant="ghost" onClick={() => queryClient.invalidateQueries({ queryKey: ['lcd'] })}>
              <Renew size={16} /> Refresh
            </LegacyButton>
          </div>
        }
      />

      {/* ── Overview Cards ──────────────────────────────────────────── */}
      <div className="grid four">
        <StatCard label="LCD Status" value={isRunning ? 'Running' : 'Stopped'} helper={isSimulation ? 'Simulation' : 'Hardware'} tone={isRunning ? 'success' : 'warn'} />
        <StatCard label="Current Page" value={currentPage?.toUpperCase() || 'N/A'} helper="Active view" />
        <StatCard label="Updates" value={sysStats.updates?.toLocaleString() || '0'} helper={`${sysStats.errors || 0} errors`} tone={sysStats.errors > 0 ? 'warn' : 'default'} />
        <StatCard label="Alert Queue" value={queueLength} helper={queueLength > 0 ? 'Pending' : 'Empty'} tone={queueLength > 5 ? 'warn' : 'default'} />
      </div>

      {/* ── How It Works banner ─────────────────────────────────────── */}
      <div className="lcd-edu-banner">
        <Book size={16} style={{ flexShrink: 0 }} />
        <div>
          <strong>How It Works</strong> — MAP2 drives two I2C 4×20-character LCD screens via an FT232H USB-to-I2C adapter.
          The backend streams real-time status (VU meters, chain info, performance) to each display.
          Alerts from the audio engine are routed to the appropriate screen based on severity and type.
          Use the tabs below to monitor, test, and configure every aspect of the LCD subsystem.
        </div>
      </div>

      {/* ── Tab Navigation ──────────────────────────────────────────── */}
      <div className="lcd-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`lcd-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ─────────────────────────────────────────────── */}
      <div className="lcd-content">

        {/* ━━━ DISPLAYS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {activeTab === 'displays' && (
          <div className="displays-tab">
            <div className="lcd-simulators-row">
              <LCDSimulator lcdId={0} lines={lcd1Lines} address={simulationQuery.data?.lcd_1?.address || '0x27'} currentPage={currentPage} onPageChange={(page) => handlePageChange(0, page)} connected={isRunning} isPolling={isPolling} />
              <LCDSimulator lcdId={1} lines={lcd2Lines} address={simulationQuery.data?.lcd_2?.address || '0x3F'} currentPage={currentPage} onPageChange={(page) => handlePageChange(1, page)} connected={isRunning} isPolling={isPolling} />
            </div>
            <div className="lcd-controls-row">
              <InputController onInput={handleInput} disabled={!isRunning} />
              <CustomMessageComposer onSend={handleSendMessage} />
              <EventTriggers onTrigger={handleEventTrigger} />
            </div>
          </div>
        )}

        {/* ━━━ EVENTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {activeTab === 'events' && (
          <div className="events-tab">
            {/* Connection status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div className={`pill ${wsEventConnected ? 'success' : 'warn'}`}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: wsEventConnected ? '#22c55e' : '#ef4444', display: 'inline-block' }} />
                {wsEventConnected ? 'WebSocket Connected' : 'Disconnected'}
              </div>
              {wsEventError && <span style={{ color: '#ef4444', fontSize: 12 }}>{wsEventError.message}</span>}
            </div>

            {/* Statistics */}
            <div className="grid five" style={{ marginBottom: 20 }}>
              <StatCard label="Total Events" value={lcdEventStats.total_events} tone="default" />
              <StatCard label="Local Events" value={lcdEventStats.local_events} tone="success" />
              <StatCard label="Remote Events" value={lcdEventStats.remote_events} tone="default" />
              <StatCard label="Active Nodes" value={(lcdEventStats as any).active_nodes?.length ?? 0} tone="default" />
              <StatCard label="Connected Peers" value={(lcdEventStats as any).connected_peers?.length ?? 0} tone="default" />
            </div>

            {/* Filters */}
            <div className="lcd-filters-bar">
              <Filter size={16} style={{ color: '#60a5fa' }} />
              <div className="lcd-filter-group">
                <label>Severity</label>
                <select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value as any)}>
                  <option value="all">All Severities</option>
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="error">Error</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div className="lcd-filter-group">
                <label>Type</label>
                <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                  <option value="all">All Types</option>
                  <option value="audio">Audio</option>
                  <option value="system">System</option>
                  <option value="network">Network</option>
                  <option value="service">Service</option>
                  <option value="user">User</option>
                  <option value="alert">Alert</option>
                </select>
              </div>
            </div>

            {/* Pinned Events */}
            {pinnedEvents.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: '#f59e0b', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Pin size={16} /> Pinned Events ({pinnedEvents.length})
                </h3>
                <LCDEventFeed events={pinnedEvents} maxHeight="200px" onEventClick={(e) => setSelectedEvent(e)} />
              </div>
            )}

            {/* Event Feed */}
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#60a5fa', marginBottom: 12 }}>
                Event Feed ({filteredEvents.length})
              </h3>
              <LCDEventFeed events={filteredEvents} maxHeight="500px" onEventClick={(e) => setSelectedEvent(e)} />
            </div>

            {/* Event Details Modal */}
            {selectedEvent && (
              <EventDetailsModal
                event={selectedEvent}
                onClose={() => setSelectedEvent(null)}
                onPin={() => { const s = new Set(pinned); s.add(selectedEvent.event_id); setPinned(s) }}
                onUnpin={() => { const s = new Set(pinned); s.delete(selectedEvent.event_id); setPinned(s) }}
                isPinned={pinned.has(selectedEvent.event_id)}
              />
            )}
          </div>
        )}

        {/* ━━━ NODES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {activeTab === 'nodes' && (
          <div className="nodes-tab">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 24 }}>
              {/* Left — Node Selector */}
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: '#60a5fa', marginBottom: 16 }}>Audio Nodes</h3>
                <NodeLCDGrid nodes={nodes} selectedNode={selectedNode} onNodeSelect={setSelectedNode} />
              </div>

              {/* Right — LCD Preview & Details */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* LCD Preview */}
                <div className="lcd-section-card">
                  <h4 style={{ fontSize: 14, fontWeight: 600, color: '#60a5fa', marginBottom: 16 }}>LCD Preview</h4>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <LCDEmulator event={currentNodeEvent} nodeLabel={selectedNode} loading={!selectedNodeData} />
                  </div>
                </div>

                {/* Node Status */}
                {selectedNodeData && (
                  <div className="lcd-section-card">
                    <h4 style={{ fontSize: 14, fontWeight: 600, color: '#60a5fa', marginBottom: 16 }}>Node Status</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
                      <div><span style={{ fontSize: 11, color: '#6b7280' }}>Node ID</span><p style={{ fontFamily: 'var(--font-ui-tight)', fontSize: 12, margin: '4px 0 0', color: '#f3f4f6' }}>{selectedNodeData.nodeId}</p></div>
                      <div>
                        <span style={{ fontSize: 11, color: '#6b7280' }}>Status</span>
                        <p style={{ fontWeight: 700, margin: '4px 0 0', color: selectedNodeData.status === 'online' ? '#22c55e' : selectedNodeData.status === 'local' ? '#3b82f6' : '#ef4444' }}>
                          {selectedNodeData.status.toUpperCase()}
                        </p>
                      </div>
                      <div><span style={{ fontSize: 11, color: '#6b7280' }}>Last Event</span><p style={{ fontFamily: 'var(--font-ui-tight)', fontSize: 12, margin: '4px 0 0', color: '#f3f4f6' }}>{selectedNodeData.lastEvent || '—'}</p></div>
                      <div><span style={{ fontSize: 11, color: '#6b7280' }}>Event Count</span><p style={{ fontWeight: 700, margin: '4px 0 0', color: '#60a5fa' }}>{selectedNodeData.eventCount}</p></div>
                      {selectedNodeData.cpu !== undefined && (
                        <div><span style={{ fontSize: 11, color: '#6b7280' }}>CPU Usage</span><p style={{ margin: '4px 0 0', color: selectedNodeData.cpu > 80 ? '#ef4444' : selectedNodeData.cpu > 50 ? '#f59e0b' : '#22c55e' }}>{selectedNodeData.cpu.toFixed(1)}%</p></div>
                      )}
                      {selectedNodeData.memory !== undefined && (
                        <div><span style={{ fontSize: 11, color: '#6b7280' }}>Memory Usage</span><p style={{ margin: '4px 0 0', color: selectedNodeData.memory > 80 ? '#ef4444' : selectedNodeData.memory > 50 ? '#f59e0b' : '#22c55e' }}>{selectedNodeData.memory.toFixed(1)}%</p></div>
                      )}
                    </div>
                    {selectedNodeData.cpu !== undefined && <NodeHealthBar label="CPU Load" value={selectedNodeData.cpu} />}
                    {selectedNodeData.memory !== undefined && <NodeHealthBar label="Memory" value={selectedNodeData.memory} />}
                  </div>
                )}

                {/* Recent Events */}
                <div className="lcd-section-card">
                  <h4 style={{ fontSize: 14, fontWeight: 600, color: '#60a5fa', marginBottom: 12 }}>Recent Events (10)</h4>
                  <LCDEventFeed events={nodeEvents.slice(0, 10)} maxHeight="300px" />
                </div>
              </div>
            </div>

            {/* Cluster Overview */}
            <div className="lcd-section-card" style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#60a5fa', marginBottom: 16 }}>Cluster Overview</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                {nodes.map(node => <NodeOverviewCard key={node.nodeId} node={node} />)}
              </div>
            </div>
          </div>
        )}

        {/* ━━━ ALERTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {activeTab === 'alerts' && (
          <div className="alerts-tab">
            <AlertRouterConfig config={alertConfigQuery.data || null} onUpdate={(config) => updateAlertConfigMutation.mutate(config)} />

            {queueLength > 0 && (
              <div className="active-alerts-panel">
                <div className="alerts-panel-header"><Activity size={18} /><span>Active Alerts ({queueLength})</span></div>
                <div className="alerts-list">
                  {activeAlertsQuery.data?.alerts?.map((alert, idx) => (
                    <div key={idx} className="alert-item">
                      <span className="alert-type">{alert.alert_type}</span>
                      <span className="alert-message">{alert.message}</span>
                      <span className="alert-target">LCD {alert.target_lcd === -1 ? 'Both' : alert.target_lcd + 1}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ━━━ HARDWARE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {activeTab === 'hardware' && (
          <div className="hardware-tab">
            <HardwareControls
              onScan={() => scanMutation.mutate()}
              onTest={(lcdId) => testMutation.mutate(lcdId)}
              onBacklight={(lcdId, enabled) => backlightMutation.mutate({ lcdId, enabled })}
              onReset={(lcdId) => resetMutation.mutate(lcdId)}
              scanResult={scanMutation.data}
              isScanning={scanMutation.isPending}
            />

            {/* System Info */}
            <div className="hardware-info">
              <div className="info-header"><Terminal size={18} /><span>System Information</span></div>
              <div className="info-grid">
                <div className="info-item"><span className="info-label">Mode</span><span className="info-value">{isSimulation ? 'Simulation' : 'Hardware'}</span></div>
                <div className="info-item"><span className="info-label">Uptime</span><span className="info-value">{uptime > 0 ? `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s` : 'N/A'}</span></div>
                <div className="info-item"><span className="info-label">Page Changes</span><span className="info-value">{sysStats.page_changes || 0}</span></div>
                <div className="info-item"><span className="info-label">Input Events</span><span className="info-value">{sysStats.input_events || 0}</span></div>
              </div>
            </div>

            {/* FT232H Section */}
            <div style={{ marginTop: 24 }}>
              <FT232HConfig
                onScan={() => ft232hScanMutation.mutate()}
                onTestLCD={(address) => ft232hTestMutation.mutate(address)}
                onTestWrite={(address, message) => ft232hWriteMutation.mutate({ address, line1: message, line2: new Date().toLocaleTimeString() })}
                scanResult={ft232hScanMutation.data ? { bus: 0, devices: ft232hScanMutation.data.devices, lcd_count: ft232hScanMutation.data.lcd_count } : undefined}
                isScanning={ft232hScanMutation.isPending}
                deviceStatus={ft232hScanMutation.data
                  ? { connected: ft232hScanMutation.data.status.connected, url: ft232hScanMutation.data.status.url, frequency: ft232hScanMutation.data.status.frequency, devices: ft232hScanMutation.data.devices.map(d => ({ address: d.address, type: d.device_type })) }
                  : { connected: false, url: 'ftdi://ftdi:232h/1', frequency: 100000, devices: [] as { address: number; type: string }[] }
                }
              />
            </div>
          </div>
        )}

        {/* ━━━ SETTINGS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        {activeTab === 'settings' && (
          <div className="settings-tab">
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
              {/* Settings Panel */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Display Settings */}
                <div className="lcd-section-card">
                  <h4 style={{ fontSize: 16, fontWeight: 600, color: '#60a5fa', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <MapRackDeviceIcon size={18} /> Display Settings
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Brightness */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <label style={{ color: '#d1d5db', fontWeight: 600 }}>Brightness</label>
                        <span style={{ color: '#60a5fa', fontFamily: 'var(--font-ui-tight)' }}>{settings.brightness}%</span>
                      </div>
                      <NumberInput
                        label="Brightness"
                        value={settings.brightness}
                        min={0}
                        max={100}
                        unit="%"
                        showLabel={false}
                        showBounds={false}
                        onChange={(nextValue) => setSettings({ ...settings, brightness: nextValue })}
                      />
                      <p className="setting-hint">Adjust LCD backlight brightness</p>
                    </div>

                    {/* Auto-off */}
                    <div>
                      <label style={{ color: '#d1d5db', fontWeight: 600, display: 'block', marginBottom: 8 }}>Auto-off Timer</label>
                      <select value={String(settings.autoOffTime)} onChange={(e) => setSettings({ ...settings, autoOffTime: parseInt(e.target.value) })} className="lcd-select">
                        <option value="0">Never</option>
                        <option value="5">5 minutes</option>
                        <option value="15">15 minutes</option>
                        <option value="30">30 minutes</option>
                        <option value="60">1 hour</option>
                      </select>
                      <p className="setting-hint">Turn off display after inactivity</p>
                    </div>

                    {/* Auto-scroll */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ color: '#d1d5db', fontWeight: 600 }}>Auto-scroll Long Messages</label>
                        <button
                          onClick={() => setSettings({ ...settings, autoScrollDelay: settings.autoScrollDelay > 0 ? 0 : 3 })}
                          style={{ width: 48, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: settings.autoScrollDelay > 0 ? '#22c55e' : '#444', position: 'relative', transition: 'background 0.2s' }}
                        >
                          <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: settings.autoScrollDelay > 0 ? 26 : 2, transition: 'left 0.2s' }} />
                        </button>
                      </div>
                      <p className="setting-hint">Scroll text that exceeds display width</p>
                    </div>

                    {/* Scroll Speed */}
                    {settings.autoScrollDelay > 0 && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                          <label style={{ color: '#d1d5db', fontWeight: 600 }}>Scroll Speed</label>
                          <span style={{ color: '#60a5fa', fontFamily: 'var(--font-ui-tight)' }}>{settings.autoScrollDelay}s</span>
                        </div>
                        <NumberInput
                          label="Scroll Speed"
                          value={settings.autoScrollDelay}
                          min={1}
                          max={5}
                          unit="s"
                          showLabel={false}
                          showBounds={false}
                          onChange={(nextValue) => setSettings({ ...settings, autoScrollDelay: nextValue })}
                        />
                        <p className="setting-hint">Delay between scroll steps</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Audio & Alert Settings */}
                <div className="lcd-section-card">
                  <h4 style={{ fontSize: 16, fontWeight: 600, color: '#60a5fa', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <VolumeUp size={18} /> Audio &amp; Alerts
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Sound toggle */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ color: '#d1d5db', fontWeight: 600 }}>Alert Sounds</label>
                        <button
                          onClick={() => setSettings({ ...settings, soundEnabled: !settings.soundEnabled })}
                          style={{ width: 48, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: settings.soundEnabled ? '#22c55e' : '#444', position: 'relative', transition: 'background 0.2s' }}
                        >
                          <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: settings.soundEnabled ? 26 : 2, transition: 'left 0.2s' }} />
                        </button>
                      </div>
                      <p className="setting-hint">Play beep sound on critical events</p>
                    </div>

                    {settings.soundEnabled && (
                      <>
                        {/* Volume */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                            <label style={{ color: '#d1d5db', fontWeight: 600 }}>Alert Volume</label>
                            <span style={{ color: '#60a5fa', fontFamily: 'var(--font-ui-tight)' }}>{settings.soundVolume}%</span>
                          </div>
                          <NumberInput
                            label="Alert Volume"
                            value={settings.soundVolume}
                            min={0}
                            max={100}
                            unit="%"
                            showLabel={false}
                            showBounds={false}
                            onChange={(nextValue) => setSettings({ ...settings, soundVolume: nextValue })}
                          />
                          <p className="setting-hint">Volume for critical alert sounds</p>
                        </div>

                        {/* Critical only */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label style={{ color: '#d1d5db', fontWeight: 600 }}>Critical Alerts Only</label>
                            <button
                              onClick={() => setSettings({ ...settings, alertSoundOnly: !settings.alertSoundOnly })}
                              style={{ width: 48, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: settings.alertSoundOnly ? '#22c55e' : '#444', position: 'relative', transition: 'background 0.2s' }}
                            >
                              <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: settings.alertSoundOnly ? 26 : 2, transition: 'left 0.2s' }} />
                            </button>
                          </div>
                          <p className="setting-hint">Only play sounds for critical severity events</p>
                        </div>

                        {/* Test Sound */}
                        <LegacyButton variant="ghost" style={{ alignSelf: 'flex-start' }}>
                          🔊 Test Alert Sound
                        </LegacyButton>
                      </>
                    )}
                  </div>
                </div>

                {/* Event Management */}
                <div className="lcd-section-card">
                  <h4 style={{ fontSize: 16, fontWeight: 600, color: '#60a5fa', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Activity size={18} /> Event Management
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Broadcast Mode */}
                    <div>
                      <label style={{ color: '#d1d5db', fontWeight: 600, display: 'block', marginBottom: 8 }}>Broadcast Mode</label>
                      <select value={settings.broadcastMode} onChange={(e) => setSettings({ ...settings, broadcastMode: e.target.value as any })} className="lcd-select">
                        <option value="all">All Events</option>
                        <option value="critical">Critical Only</option>
                        <option value="local-only">Local Only</option>
                      </select>
                      <p className="setting-hint">Which events to display on this LCD</p>
                    </div>

                    {/* Retention */}
                    <div>
                      <label style={{ color: '#d1d5db', fontWeight: 600, display: 'block', marginBottom: 8 }}>Event Retention</label>
                      <select value={String(settings.eventRetention)} onChange={(e) => setSettings({ ...settings, eventRetention: parseInt(e.target.value) })} className="lcd-select">
                        <option value="1">1 hour</option>
                        <option value="6">6 hours</option>
                        <option value="12">12 hours</option>
                        <option value="24">24 hours</option>
                        <option value="72">3 days</option>
                        <option value="168">1 week</option>
                      </select>
                      <p className="setting-hint">How long to keep event history</p>
                    </div>

                    {/* Clear */}
                    <LegacyButton variant="danger" style={{ alignSelf: 'flex-start' }}>
                      🗑️ Clear Event History
                    </LegacyButton>
                  </div>
                </div>

                {/* Save / Reset */}
                <div style={{ display: 'flex', gap: 12 }}>
                  <LegacyButton
                    variant="primary"
                    style={{ flex: 1, padding: '12px 24px', fontSize: 15 }}
                    onClick={handleSaveSettings}
                    disabled={saveStatus !== 'idle'}
                  >
                    {saveStatus === 'saving' && '⏳ Saving…'}
                    {saveStatus === 'saved' && '✓ Saved!'}
                    {saveStatus === 'error' && '✗ Error'}
                    {saveStatus === 'idle' && 'Save Settings'}
                  </LegacyButton>
                  <LegacyButton variant="ghost" style={{ padding: '12px 24px', fontSize: 15 }}>Reset</LegacyButton>
                </div>
              </div>

              {/* Preview Panel */}
              <div>
                <div className="lcd-section-card" style={{ position: 'sticky', top: 24 }}>
                  <h4 style={{ fontSize: 16, fontWeight: 600, color: '#60a5fa', marginBottom: 16 }}>Live Preview</h4>

                  {/* Brightness Preview */}
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Brightness Level</p>
                    <div style={{ background: '#fde68a', borderRadius: 6, padding: 16, border: '2px solid #78350f', textAlign: 'center', opacity: settings.brightness / 100, transition: 'opacity 0.2s' }}>
                      <span style={{ color: '#78350f', fontFamily: 'var(--font-ui-tight)', fontWeight: 600 }}>4×20 LCD</span>
                    </div>
                  </div>

                  {/* Current Settings */}
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Current Settings</p>
                    <div style={{ background: '#0a0a0a', borderRadius: 6, padding: 12, fontFamily: 'var(--font-ui-tight)', fontSize: 12, lineHeight: 1.8 }}>
                      <div>Brightness: <span style={{ color: '#60a5fa' }}>{settings.brightness}%</span></div>
                      <div>Sound: <span style={{ color: '#60a5fa' }}>{settings.soundEnabled ? 'ON' : 'OFF'}</span></div>
                      <div>Volume: <span style={{ color: '#60a5fa' }}>{settings.soundVolume}%</span></div>
                      <div>Mode: <span style={{ color: '#60a5fa' }}>{settings.broadcastMode}</span></div>
                      <div>Retention: <span style={{ color: '#60a5fa' }}>{settings.eventRetention}h</span></div>
                      <div>Scroll: <span style={{ color: '#60a5fa' }}>{settings.autoScrollDelay > 0 ? `${settings.autoScrollDelay}s` : 'OFF'}</span></div>
                    </div>
                  </div>

                  {/* Info Note */}
                  <div style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 6, padding: 12 }}>
                    <p style={{ fontSize: 12, color: '#93c5fd', margin: 0 }}>
                      <Information size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                      Settings apply immediately to this node's LCD display.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Styles ──────────────────────────────────────────────────── */}
      <style>{`
        .lcd-page {
          padding: 24px;
          max-width: 1600px;
          margin: 0 auto;
        }

        .grid.four {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }
        .grid.five {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }
        @media (max-width: 1200px) {
          .grid.four { grid-template-columns: repeat(2, 1fr); }
          .grid.five { grid-template-columns: repeat(3, 1fr); }
        }
        @media (max-width: 600px) {
          .grid.four, .grid.five { grid-template-columns: 1fr; }
        }

        /* ── Educational Banner ── */
        .lcd-edu-banner {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          background: linear-gradient(135deg, rgba(34,197,94,0.08) 0%, rgba(34,197,94,0.03) 100%);
          border: 1px solid rgba(34,197,94,0.2);
          border-radius: 10px;
          padding: 'var(--cds-spacing-05, 1rem) var(--cds-spacing-05, 1rem)';
          margin-bottom: 20px;
          font-size: 13px;
          line-height: 1.6;
          color: #a3e635;
        }
        .lcd-edu-banner strong { color: #22c55e; }

        /* ── Tabs ── */
        .lcd-tabs {
          display: flex;
          gap: 4px;
          margin-bottom: 24px;
          padding: 4px;
          background: #1a1a1a;
          border-radius: 12px;
          width: fit-content;
          flex-wrap: wrap;
        }
        .lcd-tab {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 'var(--cds-spacing-04, 0.75rem) var(--cds-spacing-06, 1.5rem)';
          border: none;
          background: transparent;
          color: #888;
          font-size: 14px;
          font-weight: 500;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .lcd-tab:hover { color: #fff; background: #333; }
        .lcd-tab.active { color: #fff; background: #22c55e; }

        .lcd-content { min-height: 500px; }

        /* ── Shared Section Card ── */
        .lcd-section-card {
          background: #111;
          border: 1px solid #222;
          border-radius: 12px;
          padding: 'var(--cds-spacing-06, 1.5rem)';
        }

        /* ── Displays Tab ── */
        .displays-tab { display: flex; flex-direction: column; gap: 24px; }
        .lcd-simulators-row { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
        .lcd-controls-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
        @media (max-width: 900px) { .lcd-simulators-row { grid-template-columns: 1fr; } }
        @media (max-width: 1100px) { .lcd-controls-row { grid-template-columns: 1fr; } }

        /* LCD Simulator Card */
        .lcd-simulator-card {
          background: linear-gradient(145deg, #1a1a1a 0%, #111 100%);
          border: 1px solid #2a2a2a;
          border-radius: 16px;
          padding: 'var(--cds-spacing-06, 1.5rem)';
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        }
        .lcd-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .lcd-title { display: flex; align-items: center; gap: 8px; color: #fff; font-weight: 600; }
        .lcd-address { color: #666; font-size: var(--cds-label-01-font-size, 0.75rem); font-family: var(--font-ui-tight); }
        .lcd-status-badges { display: flex; gap: 8px; }

        .lcd-display-frame { position: relative; margin: 16px 0; }
        .lcd-bezel {
          background: linear-gradient(135deg, #2d3436 0%, #1e272e 100%);
          border: 3px solid #3d3d3d; border-radius: 12px; padding: 12px;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.3);
        }
        .lcd-screen {
          background: linear-gradient(180deg, #0a1628 0%, #0d1f35 50%, #0a1628 100%);
          border-radius: 4px; padding: 8px 12px; font-family: var(--font-ui);
          box-shadow: inset 0 1px 3px rgba(0,0,0,0.8), 0 0 20px rgba(34,197,94,0.1);
        }
        .lcd-line {
          color: #22c55e;
          text-shadow: 0 0 8px rgba(34,197,94,0.8), 0 0 16px rgba(34,197,94,0.4);
          font-size: var(--cds-heading-01-font-size, 1rem); font-weight: 500; line-height: 1.6; letter-spacing: 0.08em;
          white-space: pre; min-height: 28px;
        }
        .lcd-reflection {
          position: absolute; top: 0; left: 0; right: 0; height: 40%;
          background: linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 100%);
          border-radius: 12px 12px 0 0; pointer-events: none;
        }
        .lcd-page-selector { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
        .lcd-page-label { color: #666; font-size: var(--cds-label-01-font-size, 0.75rem); }
        .lcd-page-buttons { display: flex; gap: 4px; flex-wrap: wrap; }
        .lcd-page-btn {
          display: flex; align-items: center; justify-content: center; width: 32px; height: 32px;
          background: #222; border: 1px solid #333; border-radius: 6px; color: #888; cursor: pointer; transition: all 0.2s;
        }
        .lcd-page-btn:hover { background: #333; color: #fff; border-color: #444; }
        .lcd-page-btn.active { background: #22c55e; border-color: #22c55e; color: #fff; }

        /* Input Controller */
        .input-controller { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 16px; padding: var(--cds-spacing-06, 1.5rem); }
        .input-title { display: flex; align-items: center; gap: 8px; color: #fff; font-weight: 600; margin-bottom: 16px; }
        .input-grid { display: flex; flex-direction: column; gap: 16px; }
        .input-dpad { display: flex; flex-direction: column; align-items: center; gap: 4px; }
        .dpad-row { display: flex; gap: 4px; }
        .input-btn {
          display: flex; align-items: center; justify-content: center;
          background: #2a2a2a; border: 1px solid #3a3a3a; border-radius: 8px; color: #888; cursor: pointer; transition: all 0.15s;
        }
        .input-btn:hover:not(:disabled) { background: #3a3a3a; color: #fff; transform: scale(1.05); }
        .input-btn:active:not(:disabled) { transform: scale(0.95); background: #22c55e; }
        .input-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .dpad-up, .dpad-down, .dpad-left, .dpad-right { width: 44px; height: 44px; }
        .dpad-center { width: 44px; height: 44px; background: #333; }
        .input-encoder { display: flex; flex-direction: column; align-items: center; gap: 8px; }
        .encoder-ring { display: flex; gap: 4px; }
        .encoder-btn {
          display: flex; align-items: center; justify-content: center; width: 40px; height: 40px;
          background: #2a2a2a; border: 1px solid #3a3a3a; border-radius: 50%; color: #888; font-size: var(--cds-body-compact-01-font-size, 0.875rem); cursor: pointer; transition: all 0.15s;
        }
        .encoder-btn:hover { background: #3a3a3a; color: #fff; }
        .encoder-btn.press { background: #333; color: #22c55e; }
        .encoder-label { color: #666; font-size: var(--cds-label-01-font-size, 0.75rem); }
        .input-function-btns { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
        .input-btn.func { padding: var(--cds-spacing-04, 0.75rem) var(--cds-spacing-05, 1rem); font-size: var(--cds-body-compact-01-font-size, 0.875rem); font-weight: 500; }

        /* Message Composer */
        .message-composer { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 16px; padding: var(--cds-spacing-06, 1.5rem); }
        .composer-header { display: flex; align-items: center; gap: 8px; color: #fff; font-weight: 600; margin-bottom: 16px; }
        .composer-content { display: flex; flex-direction: column; gap: 16px; }
        .composer-target { display: flex; align-items: center; gap: 12px; }
        .composer-target label { color: #888; font-size: 13px; }
        .composer-target-btns { display: flex; gap: 4px; }
        .composer-btn {
          padding: 6px 12px; background: #222; border: 1px solid #333; border-radius: 6px; color: #888; font-size: 12px; cursor: pointer; transition: all 0.2s;
        }
        .composer-btn:hover { background: #333; color: #fff; }
        .composer-btn.active { background: #22c55e; border-color: #22c55e; color: #fff; }
        .composer-lines { display: flex; flex-direction: column; gap: 12px; }
        .composer-line { display: flex; align-items: center; gap: 8px; }
        .composer-line label { color: #888; font-size: 13px; min-width: 50px; }
        .composer-line input {
          flex: 1; background: #222; border: 1px solid #333; border-radius: 6px; padding: 8px 12px; color: #fff; font-family: var(--font-ui-tight);
        }
        .composer-line input:focus { outline: 2px solid var(--cds-focus, #22c55e); outline-offset: 2px; border-color: #22c55e; }
        .char-count { color: #666; font-size: 11px; min-width: 40px; }
        .composer-duration { display: flex; align-items: center; gap: 12px; }
        .composer-duration label { color: #888; font-size: 13px; }
        .composer-duration input[type="range"] { flex: 1; accent-color: #22c55e; }
        .composer-duration span { color: #fff; font-size: 14px; min-width: 30px; }
        .composer-send { width: 100%; }

        /* Event Triggers */
        .event-triggers { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 16px; padding: var(--cds-spacing-06, 1.5rem); }
        .triggers-header { display: flex; align-items: center; gap: 8px; color: #fff; font-weight: 600; margin-bottom: 16px; }
        .triggers-hint { color: #666; font-size: 12px; font-weight: 400; margin-left: auto; }
        .triggers-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
        .trigger-btn {
          display: flex; align-items: center; gap: 8px; padding: var(--cds-spacing-04, 0.75rem) var(--cds-spacing-04, 0.75rem);
          background: #222; border: 1px solid #333; border-radius: 8px; color: #888; font-size: 12px; cursor: pointer; transition: all 0.2s;
        }
        .trigger-btn:hover { background: #333; color: #fff; border-color: #444; }
        .trigger-btn:active { background: #22c55e; border-color: #22c55e; }

        /* ── Events Tab ── */
        .lcd-filters-bar {
          display: flex; align-items: center; gap: 16px; padding: var(--cds-spacing-05, 1rem) var(--cds-spacing-05, 1rem);
          background: #111; border: 1px solid #222; border-radius: 10px; margin-bottom: 20px;
        }
        .lcd-filter-group { display: flex; flex-direction: column; gap: 4px; }
        .lcd-filter-group label { font-size: var(--cds-label-01-font-size, 0.75rem); color: '#6b7280'; font-weight: 600; }
        .lcd-filter-group select {
          background: #1a1a1a; border: 1px solid #333; border-radius: 6px; color: #fff; padding: 6px 12px; font-size: 13px;
        }

        /* Event Modal */
        .event-modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px;
        }
        .event-modal {
          background: #111; border: 2px solid #22d3ee; border-radius: 12px; max-width: 640px; width: 100%; max-height: 80vh; overflow-y: auto;
        }
        .event-modal-header {
          display: flex; align-items: flex-start; justify-content: space-between; padding: var(--cds-spacing-06, 1.5rem); border-bottom: 1px solid #222;
        }
        .event-modal-body { padding: var(--cds-spacing-06, 1.5rem); }
        .event-modal-footer { display: flex; gap: 12px; padding: var(--cds-spacing-06, 1.5rem); border-top: 1px solid #222; }

        /* ── Alerts Tab ── */
        .alert-router-config { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 16px; padding: var(--cds-spacing-06, 1.5rem); }
        .alert-router-header { display: flex; align-items: center; gap: 8px; color: #fff; font-weight: 600; margin-bottom: 20px; }
        .alert-types-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
        .alert-type-card {
          background: #222; border: 1px solid #333; border-radius: 10px; padding: 12px; cursor: pointer; transition: all 0.2s;
        }
        .alert-type-card:hover { background: #2a2a2a; border-color: #444; }
        .alert-type-card.disabled { opacity: 0.5; }
        .alert-type-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
        .alert-severity-dot { width: 8px; height: 8px; border-radius: 50%; }
        .alert-type-label { flex: 1; color: #fff; font-size: 13px; font-weight: 500; }
        .alert-toggle { padding: 3px 8px; background: #333; border: none; border-radius: 4px; color: #888; font-size: 10px; font-weight: 600; cursor: pointer; }
        .alert-toggle.on { background: #22c55e; color: #fff; }
        .alert-toggle.off { background: #444; color: #666; }
        .alert-type-target { display: flex; align-items: center; gap: var(--cds-spacing-04, 0.75rem); color: #888; font-size: 12px; }
        .lcd-target-btns { display: flex; gap: 4px; }
        .lcd-target-btn {
          padding: 4px 8px; background: #333; border: none; border-radius: 4px; color: #888; font-size: 11px; cursor: pointer; transition: all 0.2s;
        }
        .lcd-target-btn:hover { background: #444; color: #fff; }
        .lcd-target-btn.active { background: #3b82f6; color: #fff; }
        .alert-type-details { margin-top: 12px; padding-top: 12px; border-top: 1px solid #333; }
        .alert-detail-row { display: flex; align-items: center; gap: var(--cds-spacing-04, 0.75rem); margin-bottom: 8px; }
        .alert-detail-row label { color: #888; font-size: 12px; min-width: 100px; }
        .alert-detail-row input {
          width: 60px; padding: 4px 8px; background: #333; border: 1px solid #444; border-radius: 4px; color: #fff; font-size: 12px;
        }
        .active-alerts-panel { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 16px; padding: var(--cds-spacing-06, 1.5rem); margin-top: 24px; }
        .alerts-panel-header { display: flex; align-items: center; gap: 8px; color: #f59e0b; font-weight: 600; margin-bottom: 16px; }
        .alerts-list { display: flex; flex-direction: column; gap: 8px; }
        .alert-item { display: flex; align-items: center; gap: 12px; padding: var(--cds-spacing-04, 0.75rem) var(--cds-spacing-04, 0.75rem); background: #222; border-radius: 8px; }
        .alert-item .alert-type { color: #f59e0b; font-weight: 500; font-size: 13px; }
        .alert-item .alert-message { flex: 1; color: #888; font-size: 13px; }
        .alert-item .alert-target { color: #666; font-size: 12px; }

        /* ── Hardware Tab ── */
        .hardware-controls { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 16px; padding: var(--cds-spacing-06, 1.5rem); }
        .hardware-header { display: flex; align-items: center; gap: 8px; color: #fff; font-weight: 600; margin-bottom: 16px; }
        .hardware-actions { margin-bottom: 20px; }
        .scan-results { margin-top: 12px; padding: 12px; background: #222; border-radius: 8px; }
        .scan-summary { color: #22c55e; font-size: 13px; display: block; margin-bottom: 8px; }
        .scan-devices { display: flex; flex-wrap: wrap; gap: 8px; }
        .scan-device { display: flex; align-items: center; gap: 6px; padding: 4px 10px; background: #333; border-radius: 4px; }
        .device-address { color: #3b82f6; font-family: var(--font-ui-tight); font-size: 12px; }
        .device-type { color: #888; font-size: 11px; }
        .lcd-controls-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
        .lcd-control-card { background: #222; border: 1px solid #333; border-radius: 10px; padding: 16px; }
        .lcd-control-header { display: flex; align-items: center; gap: 8px; color: #fff; font-weight: 500; margin-bottom: 12px; }
        .lcd-control-buttons { display: flex; gap: 8px; flex-wrap: wrap; }
        .lcd-control-buttons .cds--btn { padding: 6px 10px; }
        .hardware-info { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 16px; padding: var(--cds-spacing-06, 1.5rem); margin-top: 24px; }
        .info-header { display: flex; align-items: center; gap: 8px; color: #fff; font-weight: 600; margin-bottom: 16px; }
        .info-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
        @media (max-width: 800px) { .info-grid { grid-template-columns: repeat(2, 1fr); } }
        .info-item { display: flex; flex-direction: column; gap: 4px; }
        .info-label { color: #666; font-size: 12px; }
        .info-value { color: #fff; font-size: 16px; font-weight: 500; }

        /* FT232H */
        .ft232h-config { background: #111; border: 1px solid #222; border-radius: 12px; padding: var(--cds-spacing-06, 1.5rem); }
        .ft232h-header { display: flex; align-items: center; gap: var(--cds-spacing-04, 0.75rem); margin-bottom: var(--cds-spacing-06, 1.5rem); font-size: 18px; font-weight: 600; color: #fff; }
        .ft232h-docs-link { margin-left: auto; display: flex; align-items: center; gap: 6px; font-size: 12px; color: #22c55e; text-decoration: none; }
        .ft232h-docs-link:hover { text-decoration: underline; }
        .ft232h-layout { display: grid; grid-template-columns: 250px 1fr 280px; gap: var(--cds-spacing-06, 1.5rem); }
        @media (max-width: 1200px) { .ft232h-layout { grid-template-columns: 1fr; } }
        .ft232h-status-panel, .ft232h-wiring-panel { background: #0a0a0a; border: 1px solid #222; border-radius: 8px; padding: 16px; }
        .panel-header { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: #888; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #222; }
        .status-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #1a1a1a; }
        .status-label { color: #666; font-size: 12px; }
        .status-value { color: #fff; font-size: 13px; display: flex; align-items: center; gap: 6px; }
        .status-value.connected { color: #22c55e; }
        .status-value.disconnected { color: #f59e0b; }
        .status-value.mono { font-family: var(--font-ui-tight); }
        .status-value.small { font-size: 11px; }
        .full-width { width: 100%; margin-top: 12px; }
        .scan-results-box { margin-top: 12px; background: #111; border: 1px solid #222; border-radius: 6px; overflow: hidden; }
        .scan-header { padding: 8px 12px; background: rgba(34,197,94,0.1); color: #22c55e; font-size: 12px; font-weight: 500; }
        .scan-device-item { display: flex; justify-content: space-between; padding: 8px 12px; border-top: 1px solid #1a1a1a; cursor: pointer; transition: background 0.2s; }
        .scan-device-item:hover, .scan-device-item.selected { background: rgba(34,197,94,0.1); }
        .device-addr { font-family: var(--font-ui-tight); color: #22c55e; font-size: 13px; }
        .ft232h-board-container { display: flex; flex-direction: column; align-items: center; gap: 16px; }
        .board-title, .schematic-title { font-size: 14px; color: #666; margin-bottom: 8px; text-align: center; }
        .schematic-title { margin-top: 16px; padding-top: 16px; border-top: 1px solid #222; width: 100%; }
        .board-image-wrapper { position: relative; width: 100%; max-width: 400px; border-radius: 8px; overflow: hidden; border: 2px solid #333; }
        .board-photo { width: 100%; height: auto; display: block; }
        .pin-overlays { position: absolute; top: 0; left: 0; right: 0; bottom: 0; pointer-events: none; }
        .pin-overlay {
          position: absolute; width: 50px; height: 24px; display: flex; align-items: center; justify-content: center;
          border-radius: 4px; cursor: pointer; pointer-events: auto; transition: all 0.2s; font-size: 10px; font-weight: 600;
        }
        .pin-overlay.i2c { background: rgba(34,197,94,0.8); border: 2px solid #22c55e; color: #fff; }
        .pin-overlay.power { background: rgba(239,68,68,0.8); border: 2px solid #ef4444; color: #fff; }
        .pin-overlay:hover, .pin-overlay.selected { transform: scale(1.1); box-shadow: 0 0 20px currentColor; z-index: 10; }
        .pin-label { text-shadow: 0 1px 2px rgba(0,0,0,0.5); }
        .ft232h-schematic-svg { width: 100%; max-width: 450px; height: auto; background: #0a0a0a; border-radius: 8px; border: 1px solid #222; padding: var(--cds-spacing-04, 0.75rem); }
        .pin-detail-popup { margin-top: var(--cds-spacing-04, 0.75rem); padding: var(--cds-spacing-04, 0.75rem) var(--cds-spacing-05, 1rem); background: rgba(34,197,94,0.1); border: 1px solid #22c55e; border-radius: 6px; color: #22c55e; font-size: 13px; text-align: center; }
        .wiring-table { font-size: 13px; }
        .wiring-header { display: grid; grid-template-columns: 1fr auto 1fr; gap: var(--cds-spacing-04, 0.75rem); padding: 8px 0; color: #666; font-size: var(--cds-label-01-font-size, 0.75rem); border-bottom: 1px solid #222; }
        .wiring-row { display: grid; grid-template-columns: 1fr auto 1fr; gap: var(--cds-spacing-04, 0.75rem); padding: 8px 0; border-bottom: 1px solid #1a1a1a; }
        .wire-from { font-family: var(--font-ui-tight); color: #22c55e; }
        .wire-arrow { color: #444; }
        .wire-to { font-family: var(--font-ui-tight); color: #3b82f6; }
        .wiring-notes { display: flex; align-items: center; gap: 8px; margin-top: 12px; padding: var(--cds-spacing-04, 0.75rem); background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.3); border-radius: 6px; color: #f59e0b; font-size: 12px; }
        .test-controls { display: flex; flex-direction: column; gap: 12px; }
        .test-address label, .test-message label { display: block; color: #666; font-size: 11px; margin-bottom: 4px; }
        .test-address select, .test-message input { width: 100%; padding: 8px 12px; background: #111; border: 1px solid #333; border-radius: 6px; color: #fff; font-size: 13px; }
        .test-message input { font-family: var(--font-ui-tight); }
        .cli-commands { display: flex; flex-direction: column; gap: 8px; }
        .cli-commands code { display: block; padding: 8px 12px; background: #111; border: 1px solid #222; border-radius: 4px; font-family: var(--font-ui-tight); font-size: 11px; color: #22c55e; word-break: break-all; }

        /* ── Settings Tab ── */
        .setting-hint { font-size: var(--cds-label-01-font-size, 0.75rem); color: #666; margin: 4px 0 0; }
        .lcd-slider { width: 100%; accent-color: #22c55e; height: 6px; }
        .lcd-select {
          width: 100%; padding: 8px 12px; background: #1a1a1a; border: 1px solid #333; border-radius: 6px; color: #fff; font-size: 13px;
        }

        /* ── Shared ── */
        .pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 20px; font-size: var(--cds-label-01-font-size, 0.75rem); font-weight: 500; }
        .pill.success { background: rgba(34,197,94,0.15); color: #22c55e; }
        .pill.warn { background: rgba(245,158,11,0.15); color: #f59e0b; }
        .pill.muted { background: rgba(107,114,128,0.15); color: #9ca3af; }

      `}</style>
      </div>
      </Layer>
    </section>
  )
}
