/**
 * LCDPage - Advanced LCD Display Management Interface
 * 
 * Features:
 * - Dual LCD real-time simulation with WebSocket updates
 * - Interactive page control for each LCD
 * - Alert routing configuration with visual editor
 * - Hardware testing and I2C scanning
 * - Custom message composer
 * - Event triggers for chains, snapshots, effects
 * - Live VU meter simulation
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Monitor,
  MonitorOff,
  Zap,
  Bell,
  Settings,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  RotateCcw,
  Send,
  AlertTriangle,
  CheckCircle,
  Activity,
  Radio,
  Sliders,
  Gauge,
  Music,
  HardDrive,
  RefreshCw,
  Power,
  Sun,
  SunDim,
  Terminal,
  MessageSquare,
  TestTube,
  Link2,
  Unlink,
  Scan,
  Layout,
  Eye,
  Volume2,
  Cpu,
  GitBranch,
  Keyboard,
  ArrowUpDown,
} from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { useToasts } from '../components/Toasts'
import { lcdApi } from '../../map2/lcd'
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

// ============================================================================
// Subcomponents
// ============================================================================

interface LCDSimulatorProps {
  lcdId: number;
  lines: string[];
  address: string;
  currentPage?: string;
  onPageChange?: (page: string) => void;
  connected?: boolean;
  isPolling?: boolean;
}

function LCDSimulator({ lcdId, lines, address, currentPage, onPageChange, connected = true, isPolling }: LCDSimulatorProps) {
  const pages = ['status', 'vu', 'chain', 'plugins', 'midi', 'perf', 'settings', 'menu'];
  
  return (
    <div className="lcd-simulator-card">
      <div className="lcd-header">
        <div className="lcd-title">
          <Monitor size={18} />
          <span>LCD {lcdId + 1}</span>
          <span className="lcd-address">{address}</span>
        </div>
        <div className="lcd-status-badges">
          {connected ? (
            <span className="pill success">
              <CheckCircle size={12} /> Connected
            </span>
          ) : (
            <span className="pill warn">
              <AlertTriangle size={12} /> Disconnected
            </span>
          )}
          {isPolling && (
            <span className="pill muted">
              <Activity size={12} /> Live
            </span>
          )}
        </div>
      </div>
      
      <div className="lcd-display-frame">
        <div className="lcd-bezel">
          <div className="lcd-screen">
            {lines.map((line, idx) => (
              <div key={idx} className="lcd-line">
                {line || '\u00A0'}
              </div>
            ))}
            {lines.length < 4 && Array.from({ length: 4 - lines.length }).map((_, idx) => (
              <div key={`empty-${idx}`} className="lcd-line">
                {'\u00A0'}
              </div>
            ))}
          </div>
        </div>
        <div className="lcd-reflection"></div>
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
  );
}

function getPageIcon(page: string): React.ReactNode {
  const icons: Record<string, React.ReactNode> = {
    status: <Activity size={14} />,
    vu: <Volume2 size={14} />,
    chain: <GitBranch size={14} />,
    plugins: <Layout size={14} />,
    midi: <Music size={14} />,
    perf: <Cpu size={14} />,
    settings: <Settings size={14} />,
    menu: <Sliders size={14} />,
  };
  return icons[page] || <Monitor size={14} />;
}

interface InputControllerProps {
  onInput: (action: LCDInputAction) => void;
  disabled?: boolean;
}

function InputController({ onInput, disabled }: InputControllerProps) {
  return (
    <div className="input-controller">
      <div className="input-title">
        <Keyboard size={16} />
        <span>Virtual Input</span>
      </div>
      
      <div className="input-grid">
        <div className="input-dpad">
          <button 
            className="input-btn dpad-up" 
            onClick={() => onInput('up')} 
            disabled={disabled}
            title="Up"
          >
            <ChevronUp size={20} />
          </button>
          <div className="dpad-row">
            <button 
              className="input-btn dpad-left" 
              onClick={() => onInput('left')} 
              disabled={disabled}
              title="Left"
            >
              <ChevronLeft size={20} />
            </button>
            <button 
              className="input-btn dpad-center" 
              onClick={() => onInput('select')} 
              disabled={disabled}
              title="Select"
            >
              <CheckCircle size={16} />
            </button>
            <button 
              className="input-btn dpad-right" 
              onClick={() => onInput('right')} 
              disabled={disabled}
              title="Right"
            >
              <ChevronRight size={20} />
            </button>
          </div>
          <button 
            className="input-btn dpad-down" 
            onClick={() => onInput('down')} 
            disabled={disabled}
            title="Down"
          >
            <ChevronDown size={20} />
          </button>
        </div>
        
        <div className="input-encoder">
          <div className="encoder-ring">
            <button 
              className="encoder-btn ccw" 
              onClick={() => onInput('encoder_ccw')} 
              disabled={disabled}
              title="Rotate CCW"
            >
              <RotateCcw size={14} />
            </button>
            <button 
              className="encoder-btn press" 
              onClick={() => onInput('encoder_press')} 
              disabled={disabled}
              title="Press"
            >
              ●
            </button>
            <button 
              className="encoder-btn cw" 
              onClick={() => onInput('encoder_cw')} 
              disabled={disabled}
              title="Rotate CW"
            >
              <RefreshCw size={14} />
            </button>
          </div>
          <span className="encoder-label">Encoder</span>
        </div>
        
        <div className="input-function-btns">
          <button 
            className="input-btn func" 
            onClick={() => onInput('menu')} 
            disabled={disabled}
          >
            Menu
          </button>
          <button 
            className="input-btn func" 
            onClick={() => onInput('back')} 
            disabled={disabled}
          >
            Back
          </button>
          <button 
            className="input-btn func" 
            onClick={() => onInput('prev_page')} 
            disabled={disabled}
          >
            ◀ Prev
          </button>
          <button 
            className="input-btn func" 
            onClick={() => onInput('next_page')} 
            disabled={disabled}
          >
            Next ▶
          </button>
        </div>
      </div>
    </div>
  );
}

interface AlertRouterConfigProps {
  config: AlertConfig | null;
  onUpdate: (config: { routing?: Record<string, Partial<AlertRoutingConfig>>; pages?: Record<number, Partial<LCDPageConfig>> }) => void;
}

function AlertRouterConfig({ config, onUpdate }: AlertRouterConfigProps) {
  const [editingAlert, setEditingAlert] = useState<string | null>(null);
  
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
  ];
  
  const getSeverityColor = (severity: AlertSeverity) => {
    switch (severity) {
      case 'critical': return '#ef4444';
      case 'warning': return '#f59e0b';
      case 'info': return '#3b82f6';
      default: return '#6b7280';
    }
  };
  
  return (
    <div className="alert-router-config">
      <div className="alert-router-header">
        <Bell size={18} />
        <span>Alert Routing</span>
      </div>
      
      <div className="alert-types-grid">
        {alertTypes.map(({ type, label, severity }) => {
          const routing = config?.routing?.[type];
          const isEnabled = routing?.enabled ?? true;
          const targetLcd = routing?.target_lcd ?? 0;
          
          return (
            <div 
              key={type} 
              className={`alert-type-card ${isEnabled ? 'enabled' : 'disabled'}`}
              onClick={() => setEditingAlert(editingAlert === type ? null : type)}
            >
              <div className="alert-type-header">
                <span 
                  className="alert-severity-dot" 
                  style={{ backgroundColor: getSeverityColor(severity) }}
                />
                <span className="alert-type-label">{label}</span>
                <button
                  className={`alert-toggle ${isEnabled ? 'on' : 'off'}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdate({
                      routing: {
                        [type]: { enabled: !isEnabled }
                      }
                    });
                  }}
                >
                  {isEnabled ? 'ON' : 'OFF'}
                </button>
              </div>
              
              <div className="alert-type-target">
                <span>Target:</span>
                <div className="lcd-target-btns">
                  <button
                    className={`lcd-target-btn ${targetLcd === 0 ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdate({ routing: { [type]: { target_lcd: 0 } } });
                    }}
                  >
                    LCD 1
                  </button>
                  <button
                    className={`lcd-target-btn ${targetLcd === 1 ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdate({ routing: { [type]: { target_lcd: 1 } } });
                    }}
                  >
                    LCD 2
                  </button>
                  <button
                    className={`lcd-target-btn ${targetLcd === -1 ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdate({ routing: { [type]: { target_lcd: -1 } } });
                    }}
                  >
                    Both
                  </button>
                </div>
              </div>
              
              {editingAlert === type && (
                <div className="alert-type-details">
                  <div className="alert-detail-row">
                    <label>Duration (sec):</label>
                    <input
                      type="number"
                      min="1"
                      max="60"
                      value={routing?.duration_seconds ?? 5}
                      onChange={(e) => onUpdate({
                        routing: { [type]: { duration_seconds: parseInt(e.target.value) || 5 } }
                      })}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div className="alert-detail-row">
                    <label>Priority (1-10):</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={routing?.priority ?? 5}
                      onChange={(e) => onUpdate({
                        routing: { [type]: { priority: parseInt(e.target.value) || 5 } }
                      })}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface CustomMessageComposerProps {
  onSend: (lcdId: number, line1: string, line2: string, duration: number) => void;
}

function CustomMessageComposer({ onSend }: CustomMessageComposerProps) {
  const [targetLcd, setTargetLcd] = useState<number>(-1);
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [duration, setDuration] = useState(5);
  
  return (
    <div className="message-composer">
      <div className="composer-header">
        <MessageSquare size={18} />
        <span>Custom Message</span>
      </div>
      
      <div className="composer-content">
        <div className="composer-target">
          <label>Send to:</label>
          <div className="composer-target-btns">
            <button
              className={`composer-btn ${targetLcd === 0 ? 'active' : ''}`}
              onClick={() => setTargetLcd(0)}
            >
              LCD 1
            </button>
            <button
              className={`composer-btn ${targetLcd === 1 ? 'active' : ''}`}
              onClick={() => setTargetLcd(1)}
            >
              LCD 2
            </button>
            <button
              className={`composer-btn ${targetLcd === -1 ? 'active' : ''}`}
              onClick={() => setTargetLcd(-1)}
            >
              Both
            </button>
          </div>
        </div>
        
        <div className="composer-lines">
          <div className="composer-line">
            <label>Line 1:</label>
            <input
              type="text"
              maxLength={20}
              value={line1}
              onChange={(e) => setLine1(e.target.value)}
              placeholder="Enter message..."
            />
            <span className="char-count">{line1.length}/20</span>
          </div>
          <div className="composer-line">
            <label>Line 2:</label>
            <input
              type="text"
              maxLength={20}
              value={line2}
              onChange={(e) => setLine2(e.target.value)}
              placeholder="Optional second line..."
            />
            <span className="char-count">{line2.length}/20</span>
          </div>
        </div>
        
        <div className="composer-duration">
          <label>Duration:</label>
          <input
            type="range"
            min="1"
            max="30"
            value={duration}
            onChange={(e) => setDuration(parseInt(e.target.value))}
          />
          <span>{duration}s</span>
        </div>
        
        <button
          className="btn btn-primary composer-send"
          onClick={() => {
            onSend(targetLcd, line1, line2, duration);
            setLine1('');
            setLine2('');
          }}
          disabled={!line1.trim()}
        >
          <Send size={16} />
          Send Message
        </button>
      </div>
    </div>
  );
}

interface HardwareControlsProps {
  onScan: () => void;
  onTest: (lcdId: number) => void;
  onBacklight: (lcdId: number, enabled: boolean) => void;
  onReset: (lcdId: number) => void;
  scanResult?: I2CScanResult;
  isScanning?: boolean;
}

function HardwareControls({ onScan, onTest, onBacklight, onReset, scanResult, isScanning }: HardwareControlsProps) {
  return (
    <div className="hardware-controls">
      <div className="hardware-header">
        <HardDrive size={18} />
        <span>Hardware Control</span>
      </div>
      
      <div className="hardware-actions">
        <button 
          className="btn btn-ghost" 
          onClick={onScan}
          disabled={isScanning}
        >
          <Scan size={16} />
          {isScanning ? 'Scanning...' : 'Scan I2C Bus'}
        </button>
        
        {scanResult && (
          <div className="scan-results">
            <span className="scan-summary">
              Found {scanResult.lcd_count} LCD{scanResult.lcd_count !== 1 ? 's' : ''} on bus {scanResult.bus}
            </span>
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
            <div className="lcd-control-header">
              <Monitor size={14} />
              <span>LCD {lcdId + 1}</span>
            </div>
            <div className="lcd-control-buttons">
              <button
                className="btn btn-sm"
                onClick={() => onTest(lcdId)}
                title="Run display test"
              >
                <TestTube size={14} />
                Test
              </button>
              <button
                className="btn btn-sm"
                onClick={() => onBacklight(lcdId, true)}
                title="Turn backlight on"
              >
                <Sun size={14} />
              </button>
              <button
                className="btn btn-sm"
                onClick={() => onBacklight(lcdId, false)}
                title="Turn backlight off"
              >
                <SunDim size={14} />
              </button>
              <button
                className="btn btn-sm"
                onClick={() => onReset(lcdId)}
                title="Reset display"
              >
                <RotateCcw size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface EventTriggersProps {
  onTrigger: (eventType: string, eventData: any) => void;
}

function EventTriggers({ onTrigger }: EventTriggersProps) {
  const events = [
    { type: 'chain_loaded', label: 'Chain Loaded', icon: <GitBranch size={14} />, data: { chain_name: 'Test Chain' } },
    { type: 'snapshot_loaded', label: 'Snapshot Loaded', icon: <Layout size={14} />, data: { snapshot_name: 'Clean Tone' } },
    { type: 'nam_loaded', label: 'NAM Model', icon: <Radio size={14} />, data: { model_name: 'Mesa Boogie' } },
    { type: 'ir_loaded', label: 'IR Loaded', icon: <Volume2 size={14} />, data: { ir_name: 'Marshall 4x12' } },
    { type: 'xrun', label: 'XRun Alert', icon: <AlertTriangle size={14} />, data: { count: 1 } },
    { type: 'cpu_high', label: 'High CPU', icon: <Cpu size={14} />, data: { load: 85 } },
    { type: 'midi_cc', label: 'MIDI CC', icon: <Music size={14} />, data: { cc: 1, value: 127 } },
    { type: 'bypass', label: 'Plugin Bypass', icon: <Power size={14} />, data: { plugin: 'Chorus' } },
  ];
  
  return (
    <div className="event-triggers">
      <div className="triggers-header">
        <Zap size={18} />
        <span>Event Triggers</span>
        <span className="triggers-hint">Simulate system events</span>
      </div>
      
      <div className="triggers-grid">
        {events.map(event => (
          <button
            key={event.type}
            className="trigger-btn"
            onClick={() => onTrigger(event.type, event.data)}
          >
            {event.icon}
            <span>{event.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// FT232H USB-to-I2C Configuration Component
// ============================================================================

interface FT232HConfigProps {
  onScan: () => void;
  onTestLCD: (address: number) => void;
  onTestWrite: (address: number, message: string) => void;
  scanResult?: I2CScanResult;
  isScanning?: boolean;
  deviceStatus?: {
    connected: boolean;
    url: string;
    frequency: number;
    devices: { address: number; type: string }[];
  };
}

function FT232HConfig({ onScan, onTestLCD, onTestWrite, scanResult, isScanning, deviceStatus }: FT232HConfigProps) {
  const [selectedPin, setSelectedPin] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState('Hello MAP2!');
  const [testAddress, setTestAddress] = useState(0x27);
  
  // Pin definitions for FT232H
  const pins = {
    // Left side (top to bottom)
    left: [
      { id: 'GND1', name: 'GND', y: 45, type: 'power', description: 'Ground - Connect to LCD GND' },
      { id: 'D7', name: 'D7', y: 75, type: 'gpio', description: 'GPIO - General Purpose I/O' },
      { id: 'D6', name: 'D6', y: 105, type: 'gpio', description: 'GPIO - General Purpose I/O' },
      { id: 'D5', name: 'D5', y: 135, type: 'gpio', description: 'GPIO - General Purpose I/O' },
      { id: 'D4', name: 'D4', y: 165, type: 'gpio', description: 'GPIO - General Purpose I/O' },
      { id: 'C9', name: 'C9', y: 195, type: 'gpio', description: 'GPIO (original board)' },
      { id: 'C8', name: 'C8', y: 225, type: 'gpio', description: 'GPIO (original board)' },
    ],
    // Right side (top to bottom)
    right: [
      { id: '5V', name: '5V', y: 45, type: 'power', description: 'Power Output - 5V from USB, connect to LCD VCC' },
      { id: 'D0', name: 'D0 (SCL)', y: 75, type: 'i2c', description: 'I2C Clock (SCL) - Connect to LCD SCL' },
      { id: 'D1', name: 'D1 (SDA)', y: 105, type: 'i2c', description: 'I2C Data (SDA) - Connect to LCD SDA' },
      { id: 'D2', name: 'D2 (SDA)', y: 135, type: 'i2c', description: 'I2C Data (SDA) - Tie to D1 for I2C' },
      { id: 'D3', name: 'D3 (CS)', y: 165, type: 'spi', description: 'SPI Chip Select (not used for I2C)' },
      { id: 'GND2', name: 'GND', y: 195, type: 'power', description: 'Ground - Connect to LCD GND' },
      { id: '3V', name: '3.3V', y: 225, type: 'power', description: '3.3V Output (USB-C version)' },
    ],
  };
  
  const getTypeColor = (type: string) => {
    switch (type) {
      case 'power': return '#ef4444';
      case 'i2c': return '#22c55e';
      case 'spi': return '#3b82f6';
      case 'gpio': return '#a855f7';
      default: return '#6b7280';
    }
  };
  
  const i2cWiring = [
    { from: 'D0', to: 'SCL', description: 'I2C Clock Signal' },
    { from: 'D1', to: 'SDA', description: 'I2C Data Signal' },
    { from: '5V', to: 'VCC', description: 'Power (5V)' },
    { from: 'GND1', to: 'GND', description: 'Ground' },
  ];
  
  return (
    <div className="ft232h-config">
      <div className="ft232h-header">
        <Cpu size={20} />
        <span>FT232H USB-to-I2C Configuration</span>
        <a 
          href="https://learn.adafruit.com/circuitpython-on-any-computer-with-ft232h" 
          target="_blank" 
          rel="noopener noreferrer"
          className="ft232h-docs-link"
        >
          <Link2 size={14} />
          Adafruit Docs
        </a>
      </div>
      
      <div className="ft232h-layout">
        {/* Left Panel - Device Status */}
        <div className="ft232h-status-panel">
          <div className="panel-header">
            <Activity size={16} />
            <span>Device Status</span>
          </div>
          
          <div className="status-item">
            <span className="status-label">USB Device</span>
            <span className={`status-value ${deviceStatus?.connected ? 'connected' : 'disconnected'}`}>
              {deviceStatus?.connected ? (
                <><CheckCircle size={14} /> FT232H Detected</>
              ) : (
                <><AlertTriangle size={14} /> Not Detected</>
              )}
            </span>
          </div>
          
          <div className="status-item">
            <span className="status-label">Vendor ID</span>
            <span className="status-value mono">0x0403</span>
          </div>
          
          <div className="status-item">
            <span className="status-label">Product ID</span>
            <span className="status-value mono">0x6014</span>
          </div>
          
          <div className="status-item">
            <span className="status-label">I2C Frequency</span>
            <span className="status-value mono">{deviceStatus?.frequency || 100000} Hz</span>
          </div>
          
          <div className="status-item">
            <span className="status-label">URL</span>
            <span className="status-value mono small">{deviceStatus?.url || 'ftdi://ftdi:232h/1'}</span>
          </div>
          
          <button 
            className="btn btn-primary full-width"
            onClick={onScan}
            disabled={isScanning}
          >
            <Scan size={16} />
            {isScanning ? 'Scanning...' : 'Scan I2C Bus'}
          </button>
          
          {scanResult && (
            <div className="scan-results-box">
              <div className="scan-header">
                Found {scanResult.lcd_count} device{scanResult.lcd_count !== 1 ? 's' : ''}
              </div>
              {scanResult.devices.map(device => (
                <div 
                  key={device.address} 
                  className={`scan-device-item ${device.address === testAddress ? 'selected' : ''}`}
                  onClick={() => setTestAddress(device.address)}
                >
                  <span className="device-addr">{device.address_hex}</span>
                  <span className="device-type">{device.device_type}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Center - Interactive Board Diagram */}
        <div className="ft232h-board-container">
          <div className="board-title">FT232H Breakout Board (USB-C Version)</div>
          
          {/* Real Board Image with Overlay */}
          <div className="board-image-wrapper">
            <img 
              src="/images/ft232h-pinout.jpg" 
              alt="FT232H Pinout Diagram" 
              className="board-photo"
            />
            
            {/* Interactive pin overlays */}
            <div className="pin-overlays">
              {/* I2C pins - highlighted */}
              <div 
                className={`pin-overlay i2c ${selectedPin === 'D0' ? 'selected' : ''}`}
                style={{ top: '33%', right: '8%' }}
                onClick={() => setSelectedPin(selectedPin === 'D0' ? null : 'D0')}
                title="D0 - SCL (I2C Clock)"
              >
                <span className="pin-label">SCL</span>
              </div>
              <div 
                className={`pin-overlay i2c ${selectedPin === 'D1' ? 'selected' : ''}`}
                style={{ top: '39%', right: '8%' }}
                onClick={() => setSelectedPin(selectedPin === 'D1' ? null : 'D1')}
                title="D1 - SDA (I2C Data)"
              >
                <span className="pin-label">SDA</span>
              </div>
              
              {/* Power pins */}
              <div 
                className={`pin-overlay power ${selectedPin === '5V' ? 'selected' : ''}`}
                style={{ top: '27%', right: '8%' }}
                onClick={() => setSelectedPin(selectedPin === '5V' ? null : '5V')}
                title="5V Power Output"
              >
                <span className="pin-label">5V</span>
              </div>
              <div 
                className={`pin-overlay power ${selectedPin === 'GND1' ? 'selected' : ''}`}
                style={{ top: '27%', left: '8%' }}
                onClick={() => setSelectedPin(selectedPin === 'GND1' ? null : 'GND1')}
                title="Ground"
              >
                <span className="pin-label">GND</span>
              </div>
            </div>
          </div>
          
          {/* Schematic diagram */}
          <div className="schematic-title">I2C Connection Schematic</div>
          <svg viewBox="0 0 400 200" className="ft232h-schematic-svg">
            {/* FT232H Block */}
            <rect x="20" y="40" width="120" height="120" rx="8" fill="#1a1a2e" stroke="#22c55e" strokeWidth="2" />
            <text x="80" y="70" textAnchor="middle" fill="#22c55e" fontSize="14" fontWeight="bold">FT232H</text>
            <text x="80" y="90" textAnchor="middle" fill="#666" fontSize="10">USB Adapter</text>
            
            {/* FT232H Pins */}
            <circle cx="140" cy="70" r="6" fill="#22c55e" />
            <text x="135" y="62" textAnchor="end" fill="#fff" fontSize="9">D0 (SCL)</text>
            
            <circle cx="140" cy="95" r="6" fill="#22c55e" />
            <text x="135" y="87" textAnchor="end" fill="#fff" fontSize="9">D1 (SDA)</text>
            
            <circle cx="140" cy="120" r="6" fill="#ef4444" />
            <text x="135" y="112" textAnchor="end" fill="#fff" fontSize="9">5V</text>
            
            <circle cx="140" cy="145" r="6" fill="#ef4444" />
            <text x="135" y="137" textAnchor="end" fill="#fff" fontSize="9">GND</text>
            
            {/* Connection Lines */}
            <line x1="146" y1="70" x2="254" y2="70" stroke="#22c55e" strokeWidth="3" />
            <line x1="146" y1="95" x2="254" y2="95" stroke="#22c55e" strokeWidth="3" />
            <line x1="146" y1="120" x2="254" y2="120" stroke="#ef4444" strokeWidth="3" />
            <line x1="146" y1="145" x2="254" y2="145" stroke="#ef4444" strokeWidth="3" />
            
            {/* Arrow indicators */}
            <polygon points="245,66 255,70 245,74" fill="#22c55e" />
            <polygon points="245,91 255,95 245,99" fill="#22c55e" />
            <polygon points="245,116 255,120 245,124" fill="#ef4444" />
            <polygon points="245,141 255,145 245,149" fill="#ef4444" />
            
            {/* LCD Block */}
            <rect x="260" y="40" width="120" height="120" rx="8" fill="#1a1a2e" stroke="#3b82f6" strokeWidth="2" />
            <text x="320" y="70" textAnchor="middle" fill="#3b82f6" fontSize="14" fontWeight="bold">I2C LCD</text>
            <text x="320" y="90" textAnchor="middle" fill="#666" fontSize="10">PCF8574</text>
            
            {/* LCD Pins */}
            <circle cx="260" cy="70" r="6" fill="#22c55e" />
            <text x="265" y="62" textAnchor="start" fill="#fff" fontSize="9">SCL</text>
            
            <circle cx="260" cy="95" r="6" fill="#22c55e" />
            <text x="265" y="87" textAnchor="start" fill="#fff" fontSize="9">SDA</text>
            
            <circle cx="260" cy="120" r="6" fill="#ef4444" />
            <text x="265" y="112" textAnchor="start" fill="#fff" fontSize="9">VCC</text>
            
            <circle cx="260" cy="145" r="6" fill="#ef4444" />
            <text x="265" y="137" textAnchor="start" fill="#fff" fontSize="9">GND</text>
            
            {/* Legend */}
            <g transform="translate(100, 180)">
              <circle cx="0" cy="0" r="5" fill="#22c55e" />
              <text x="10" y="4" fill="#888" fontSize="9">I2C Signal</text>
              <circle cx="100" cy="0" r="5" fill="#ef4444" />
              <text x="110" y="4" fill="#888" fontSize="9">Power</text>
            </g>
          </svg>
          
          {selectedPin && (
            <div className="pin-detail-popup">
              {pins.left.concat(pins.right).find(p => p.id === selectedPin)?.description}
            </div>
          )}
        </div>
        
        {/* Right Panel - Wiring & Testing */}
        <div className="ft232h-wiring-panel">
          <div className="panel-header">
            <Link2 size={16} />
            <span>I2C LCD Wiring</span>
          </div>
          
          <div className="wiring-table">
            <div className="wiring-header">
              <span>FT232H</span>
              <span></span>
              <span>LCD</span>
            </div>
            {i2cWiring.map(wire => (
              <div key={wire.from} className="wiring-row">
                <span className="wire-from">{wire.from}</span>
                <span className="wire-arrow">→</span>
                <span className="wire-to">{wire.to}</span>
              </div>
            ))}
          </div>
          
          <div className="wiring-notes">
            <AlertTriangle size={14} />
            <span>Set I2C switch to ON position</span>
          </div>
          
          <div className="panel-header" style={{ marginTop: '16px' }}>
            <TestTube size={16} />
            <span>LCD Test</span>
          </div>
          
          <div className="test-controls">
            <div className="test-address">
              <label>I2C Address</label>
              <select 
                value={testAddress} 
                onChange={(e) => setTestAddress(parseInt(e.target.value))}
              >
                <option value={0x27}>0x27 (PCF8574)</option>
                <option value={0x3F}>0x3F (PCF8574A)</option>
                <option value={0x20}>0x20</option>
                <option value={0x38}>0x38</option>
              </select>
            </div>
            
            <div className="test-message">
              <label>Test Message</label>
              <input 
                type="text" 
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                maxLength={20}
                placeholder="Enter message..."
              />
            </div>
            
            <button 
              className="btn btn-primary full-width"
              onClick={() => onTestWrite(testAddress, testMessage)}
            >
              <Send size={16} />
              Send to LCD
            </button>
            
            <button 
              className="btn btn-ghost full-width"
              onClick={() => onTestLCD(testAddress)}
            >
              <TestTube size={16} />
              Run Display Test
            </button>
          </div>
          
          <div className="panel-header" style={{ marginTop: '16px' }}>
            <Terminal size={16} />
            <span>CLI Commands</span>
          </div>
          
          <div className="cli-commands">
            <code>python lcd/test_ft232h_lcd.py</code>
            <code>sudo ./scripts/setup_ft232h.sh</code>
          </div>
        </div>
      </div>
      
      {/* FT232H Specific Styles */}
      <style>{`
        .ft232h-config {
          background: #111;
          border: 1px solid #222;
          border-radius: 12px;
          padding: 20px;
        }
        
        .ft232h-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 20px;
          font-size: 18px;
          font-weight: 600;
          color: #fff;
        }
        
        .ft232h-docs-link {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: #22c55e;
          text-decoration: none;
        }
        
        .ft232h-docs-link:hover {
          text-decoration: underline;
        }
        
        .ft232h-layout {
          display: grid;
          grid-template-columns: 250px 1fr 280px;
          gap: 20px;
        }
        
        @media (max-width: 1200px) {
          .ft232h-layout {
            grid-template-columns: 1fr;
          }
        }
        
        .ft232h-status-panel,
        .ft232h-wiring-panel {
          background: #0a0a0a;
          border: 1px solid #222;
          border-radius: 8px;
          padding: 16px;
        }
        
        .panel-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 600;
          color: #888;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid #222;
        }
        
        .status-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-bottom: 1px solid #1a1a1a;
        }
        
        .status-label {
          color: #666;
          font-size: 12px;
        }
        
        .status-value {
          color: #fff;
          font-size: 13px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .status-value.connected {
          color: #22c55e;
        }
        
        .status-value.disconnected {
          color: #f59e0b;
        }
        
        .status-value.mono {
          font-family: 'JetBrains Mono', monospace;
        }
        
        .status-value.small {
          font-size: 11px;
        }
        
        .full-width {
          width: 100%;
          margin-top: 12px;
        }
        
        .scan-results-box {
          margin-top: 12px;
          background: #111;
          border: 1px solid #222;
          border-radius: 6px;
          overflow: hidden;
        }
        
        .scan-header {
          padding: 8px 12px;
          background: rgba(34, 197, 94, 0.1);
          color: #22c55e;
          font-size: 12px;
          font-weight: 500;
        }
        
        .scan-device-item {
          display: flex;
          justify-content: space-between;
          padding: 8px 12px;
          border-top: 1px solid #1a1a1a;
          cursor: pointer;
          transition: background 0.2s;
        }
        
        .scan-device-item:hover,
        .scan-device-item.selected {
          background: rgba(34, 197, 94, 0.1);
        }
        
        .device-addr {
          font-family: 'JetBrains Mono', monospace;
          color: #22c55e;
          font-size: 13px;
        }
        
        .device-type {
          color: #666;
          font-size: 12px;
        }
        
        .ft232h-board-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
        }
        
        .board-title,
        .schematic-title {
          font-size: 14px;
          color: #666;
          margin-bottom: 8px;
          text-align: center;
        }
        
        .schematic-title {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid #222;
          width: 100%;
        }
        
        .board-image-wrapper {
          position: relative;
          width: 100%;
          max-width: 400px;
          border-radius: 8px;
          overflow: hidden;
          border: 2px solid #333;
        }
        
        .board-photo {
          width: 100%;
          height: auto;
          display: block;
        }
        
        .pin-overlays {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          pointer-events: none;
        }
        
        .pin-overlay {
          position: absolute;
          width: 50px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          cursor: pointer;
          pointer-events: auto;
          transition: all 0.2s;
          font-size: 10px;
          font-weight: 600;
        }
        
        .pin-overlay.i2c {
          background: rgba(34, 197, 94, 0.8);
          border: 2px solid #22c55e;
          color: #fff;
        }
        
        .pin-overlay.power {
          background: rgba(239, 68, 68, 0.8);
          border: 2px solid #ef4444;
          color: #fff;
        }
        
        .pin-overlay:hover,
        .pin-overlay.selected {
          transform: scale(1.1);
          box-shadow: 0 0 20px currentColor;
          z-index: 10;
        }
        
        .pin-label {
          text-shadow: 0 1px 2px rgba(0,0,0,0.5);
        }
        
        .ft232h-schematic-svg {
          width: 100%;
          max-width: 450px;
          height: auto;
          background: #0a0a0a;
          border-radius: 8px;
          border: 1px solid #222;
          padding: 10px;
        }
        
        .ft232h-board-svg {
          width: 100%;
          max-width: 500px;
          height: auto;
        }
        
        .pin-group {
          transition: all 0.2s;
        }
        
        .pin-group:hover circle {
          stroke-width: 3;
          filter: drop-shadow(0 0 6px currentColor);
        }
        
        .pin-group.selected circle {
          stroke-width: 3;
          filter: drop-shadow(0 0 10px currentColor);
        }
        
        .pin-detail-popup {
          margin-top: 10px;
          padding: 10px 16px;
          background: rgba(34, 197, 94, 0.1);
          border: 1px solid #22c55e;
          border-radius: 6px;
          color: #22c55e;
          font-size: 13px;
          text-align: center;
        }
        
        .wiring-table {
          font-size: 13px;
        }
        
        .wiring-header {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 10px;
          padding: 8px 0;
          color: #666;
          font-size: 11px;
          text-transform: uppercase;
          border-bottom: 1px solid #222;
        }
        
        .wiring-row {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 10px;
          padding: 8px 0;
          border-bottom: 1px solid #1a1a1a;
        }
        
        .wire-from {
          font-family: 'JetBrains Mono', monospace;
          color: #22c55e;
        }
        
        .wire-arrow {
          color: #444;
        }
        
        .wire-to {
          font-family: 'JetBrains Mono', monospace;
          color: #3b82f6;
        }
        
        .wiring-notes {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
          padding: 10px;
          background: rgba(245, 158, 11, 0.1);
          border: 1px solid rgba(245, 158, 11, 0.3);
          border-radius: 6px;
          color: #f59e0b;
          font-size: 12px;
        }
        
        .test-controls {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        
        .test-address label,
        .test-message label {
          display: block;
          color: #666;
          font-size: 11px;
          margin-bottom: 4px;
        }
        
        .test-address select,
        .test-message input {
          width: 100%;
          padding: 8px 12px;
          background: #111;
          border: 1px solid #333;
          border-radius: 6px;
          color: #fff;
          font-size: 13px;
        }
        
        .test-message input {
          font-family: 'JetBrains Mono', monospace;
        }
        
        .cli-commands {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        .cli-commands code {
          display: block;
          padding: 8px 12px;
          background: #111;
          border: 1px solid #222;
          border-radius: 4px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          color: #22c55e;
          word-break: break-all;
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export function LCDPage() {
  const queryClient = useQueryClient();
  const { pushToast } = useToasts();
  const [activeTab, setActiveTab] = useState<'displays' | 'alerts' | 'hardware' | 'ft232h'>('displays');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isPolling, setIsPolling] = useState(true);
  
  // Queries
  const statusQuery = useQuery({
    queryKey: ['lcd', 'status'],
    queryFn: lcdApi.getStatus,
    refetchInterval: isPolling ? 1000 : false,
    retry: 1,
  });
  
  const simulationQuery = useQuery({
    queryKey: ['lcd', 'simulation'],
    queryFn: lcdApi.getDualSimulation,
    refetchInterval: isPolling ? 500 : false,
    retry: 1,
  });
  
  const pagesQuery = useQuery({
    queryKey: ['lcd', 'pages'],
    queryFn: lcdApi.getPages,
  });
  
  const alertConfigQuery = useQuery({
    queryKey: ['lcd', 'alertConfig'],
    queryFn: lcdApi.getAlertConfig,
  });
  
  const activeAlertsQuery = useQuery({
    queryKey: ['lcd', 'activeAlerts'],
    queryFn: lcdApi.getActiveAlerts,
    refetchInterval: isPolling ? 2000 : false,
    retry: 1,
  });
  
  // Mutations
  const setPageMutation = useMutation({
    mutationFn: ({ lcdId, page }: { lcdId: number; page: string }) => 
      lcdApi.setLCDPage(lcdId, page),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lcd'] });
      pushToast('Page changed', 'success');
    },
    onError: () => pushToast('Failed to change page', 'error'),
  });
  
  const inputMutation = useMutation({
    mutationFn: lcdApi.simulateInput,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['lcd', 'simulation'] });
      pushToast(`Input: ${data.action}`, 'info');
    },
    onError: () => pushToast('Failed to simulate input', 'error'),
  });
  
  const messageMutation = useMutation({
    mutationFn: ({ lcdId, line1, line2, duration }: { lcdId: number; line1: string; line2: string; duration: number }) =>
      lcdApi.displayMessage(lcdId, line1, line2, duration),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lcd', 'simulation'] });
      pushToast('Message sent', 'success');
    },
    onError: () => pushToast('Failed to send message', 'error'),
  });
  
  const scanMutation = useMutation({
    mutationFn: () => lcdApi.scanI2C(1),
    onSuccess: (data) => {
      pushToast(`Found ${data.lcd_count} LCD(s)`, 'success');
    },
    onError: () => pushToast('I2C scan failed', 'error'),
  });
  
  // FT232H USB-to-I2C mutations
  const ft232hScanMutation = useMutation({
    mutationFn: () => lcdApi.scanFT232H(),
    onSuccess: (data) => {
      if (data.status.connected) {
        pushToast(`FT232H: Found ${data.lcd_count} device(s)`, 'success');
      } else {
        pushToast(`FT232H: ${data.status.error || 'Not connected'}`, 'warning');
      }
    },
    onError: () => pushToast('FT232H scan failed', 'error'),
  });
  
  const ft232hWriteMutation = useMutation({
    mutationFn: (request: { address: number; line1: string; line2?: string; line3?: string; line4?: string }) =>
      lcdApi.writeFT232H(request),
    onSuccess: () => pushToast('Text written to LCD', 'success'),
    onError: (e) => pushToast(`Write failed: ${e}`, 'error'),
  });
  
  const ft232hTestMutation = useMutation({
    mutationFn: (address: number) => lcdApi.testFT232H(address),
    onSuccess: (data) => pushToast(`Test sent to ${data.address}`, 'success'),
    onError: () => pushToast('LCD test failed', 'error'),
  });
  
  const testMutation = useMutation({
    mutationFn: lcdApi.testDisplay,
    onSuccess: () => pushToast('Display test triggered', 'info'),
    onError: () => pushToast('Test failed', 'error'),
  });
  
  const backlightMutation = useMutation({
    mutationFn: ({ lcdId, enabled }: { lcdId: number; enabled: boolean }) =>
      lcdApi.toggleBacklight(lcdId, enabled),
    onSuccess: (data) => pushToast(`Backlight ${data.backlight ? 'on' : 'off'}`, 'info'),
    onError: () => pushToast('Backlight toggle failed', 'error'),
  });
  
  const resetMutation = useMutation({
    mutationFn: lcdApi.resetDisplay,
    onSuccess: () => pushToast('Display reset', 'info'),
    onError: () => pushToast('Reset failed', 'error'),
  });
  
  const updateAlertConfigMutation = useMutation({
    mutationFn: lcdApi.updateAlertConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lcd', 'alertConfig'] });
      pushToast('Alert config updated', 'success');
    },
    onError: () => pushToast('Failed to update config', 'error'),
  });
  
  // Event handlers
  const handlePageChange = useCallback((lcdId: number, page: string) => {
    setPageMutation.mutate({ lcdId, page });
  }, [setPageMutation]);
  
  const handleInput = useCallback((action: LCDInputAction) => {
    inputMutation.mutate(action);
  }, [inputMutation]);
  
  const handleSendMessage = useCallback((lcdId: number, line1: string, line2: string, duration: number) => {
    messageMutation.mutate({ lcdId, line1, line2, duration });
  }, [messageMutation]);
  
  const handleEventTrigger = useCallback((eventType: string, eventData: any) => {
    // Simulate event by sending a message
    const messages: Record<string, string> = {
      chain_loaded: `Chain: ${eventData.chain_name}`,
      snapshot_loaded: `Snapshot: ${eventData.snapshot_name}`,
      nam_loaded: `NAM: ${eventData.model_name}`,
      ir_loaded: `IR: ${eventData.ir_name}`,
      xrun: `XRun #${eventData.count}`,
      cpu_high: `CPU: ${eventData.load}%`,
      midi_cc: `CC${eventData.cc}: ${eventData.value}`,
      bypass: `Bypassed: ${eventData.plugin}`,
    };
    
    messageMutation.mutate({
      lcdId: -1,
      line1: messages[eventType] || eventType,
      line2: new Date().toLocaleTimeString(),
      duration: 3,
    });
    
    pushToast(`Triggered: ${eventType}`, 'info');
  }, [messageMutation, pushToast]);
  
  // Computed values
  const lcd1Lines = simulationQuery.data?.lcd_1?.lines || ['LCD 1', 'Waiting...'];
  const lcd2Lines = simulationQuery.data?.lcd_2?.lines || ['LCD 2', 'Waiting...'];
  const currentPage = statusQuery.data?.current_page || 'status';
  const isRunning = statusQuery.data?.running || false;
  const isSimulation = statusQuery.data?.simulation_mode || false;
  const uptime = statusQuery.data?.uptime_seconds || 0;
  const stats = statusQuery.data?.statistics || { updates: 0, page_changes: 0, errors: 0, input_events: 0 };
  const queueLength = activeAlertsQuery.data?.queue_length || 0;
  
  return (
    <div className="lcd-page">
      <PageHeader
        title="LCD Display Manager"
        subtitle="Real-time dual LCD control and monitoring for MAP2 Audio"
        icon={<Monitor size={32} style={{ color: '#22c55e' }} />}
        actions={
          <div className="flex" style={{ gap: 8 }}>
            <button
              className={`btn ${isPolling ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setIsPolling(!isPolling)}
              title={isPolling ? 'Pause live updates' : 'Resume live updates'}
            >
              {isPolling ? <Pause size={16} /> : <Play size={16} />}
              {isPolling ? 'Live' : 'Paused'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['lcd'] })}
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>
        }
      />
      
      {/* Stats Cards */}
      <div className="grid four">
        <StatCard
          label="LCD Status"
          value={isRunning ? 'Running' : 'Stopped'}
          helper={isSimulation ? 'Simulation' : 'Hardware'}
          tone={isRunning ? 'success' : 'warn'}
        />
        <StatCard
          label="Current Page"
          value={currentPage?.toUpperCase() || 'N/A'}
          helper="Active view"
        />
        <StatCard
          label="Updates"
          value={stats.updates?.toLocaleString() || '0'}
          helper={`${stats.errors || 0} errors`}
          tone={stats.errors > 0 ? 'warn' : 'default'}
        />
        <StatCard
          label="Alert Queue"
          value={queueLength}
          helper={queueLength > 0 ? 'Pending' : 'Empty'}
          tone={queueLength > 5 ? 'warn' : 'default'}
        />
      </div>
      
      {/* Tab Navigation */}
      <div className="lcd-tabs">
        <button
          className={`lcd-tab ${activeTab === 'displays' ? 'active' : ''}`}
          onClick={() => setActiveTab('displays')}
        >
          <Monitor size={16} />
          Displays
        </button>
        <button
          className={`lcd-tab ${activeTab === 'alerts' ? 'active' : ''}`}
          onClick={() => setActiveTab('alerts')}
        >
          <Bell size={16} />
          Alerts
        </button>
        <button
          className={`lcd-tab ${activeTab === 'hardware' ? 'active' : ''}`}
          onClick={() => setActiveTab('hardware')}
        >
          <HardDrive size={16} />
          Hardware
        </button>
        <button
          className={`lcd-tab ${activeTab === 'ft232h' ? 'active' : ''}`}
          onClick={() => setActiveTab('ft232h')}
        >
          <Cpu size={16} />
          FT232H
        </button>
      </div>
      
      {/* Tab Content */}
      <div className="lcd-content">
        {activeTab === 'displays' && (
          <div className="displays-tab">
            <div className="lcd-simulators-row">
              <LCDSimulator
                lcdId={0}
                lines={lcd1Lines}
                address={simulationQuery.data?.lcd_1?.address || '0x27'}
                currentPage={currentPage}
                onPageChange={(page) => handlePageChange(0, page)}
                connected={isRunning}
                isPolling={isPolling}
              />
              <LCDSimulator
                lcdId={1}
                lines={lcd2Lines}
                address={simulationQuery.data?.lcd_2?.address || '0x3F'}
                currentPage={currentPage}
                onPageChange={(page) => handlePageChange(1, page)}
                connected={isRunning}
                isPolling={isPolling}
              />
            </div>
            
            <div className="lcd-controls-row">
              <InputController
                onInput={handleInput}
                disabled={!isRunning}
              />
              <CustomMessageComposer
                onSend={handleSendMessage}
              />
              <EventTriggers
                onTrigger={handleEventTrigger}
              />
            </div>
          </div>
        )}
        
        {activeTab === 'alerts' && (
          <div className="alerts-tab">
            <AlertRouterConfig
              config={alertConfigQuery.data || null}
              onUpdate={(config) => updateAlertConfigMutation.mutate(config)}
            />
            
            {queueLength > 0 && (
              <div className="active-alerts-panel">
                <div className="alerts-panel-header">
                  <Activity size={18} />
                  <span>Active Alerts ({queueLength})</span>
                </div>
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
            
            <div className="hardware-info">
              <div className="info-header">
                <Terminal size={18} />
                <span>System Information</span>
              </div>
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">Mode</span>
                  <span className="info-value">{isSimulation ? 'Simulation' : 'Hardware'}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Uptime</span>
                  <span className="info-value">
                    {uptime > 0 
                      ? `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`
                      : 'N/A'
                    }
                  </span>
                </div>
                <div className="info-item">
                  <span className="info-label">Page Changes</span>
                  <span className="info-value">{stats.page_changes || 0}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Input Events</span>
                  <span className="info-value">{stats.input_events || 0}</span>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'ft232h' && (
          <div className="ft232h-tab">
            <FT232HConfig
              onScan={() => ft232hScanMutation.mutate()}
              onTestLCD={(address) => {
                ft232hTestMutation.mutate(address);
              }}
              onTestWrite={(address, message) => {
                ft232hWriteMutation.mutate({
                  address,
                  line1: message,
                  line2: new Date().toLocaleTimeString(),
                });
              }}
              scanResult={ft232hScanMutation.data ? {
                bus: 0,
                devices: ft232hScanMutation.data.devices,
                lcd_count: ft232hScanMutation.data.lcd_count,
              } : undefined}
              isScanning={ft232hScanMutation.isPending}
              deviceStatus={ft232hScanMutation.data?.status || {
                connected: false,
                url: 'ftdi://ftdi:232h/1',
                frequency: 100000,
                devices: [],
              }}
            />
          </div>
        )}
      </div>
      
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
        
        @media (max-width: 1200px) {
          .grid.four { grid-template-columns: repeat(2, 1fr); }
        }
        
        @media (max-width: 600px) {
          .grid.four { grid-template-columns: 1fr; }
        }
        
        /* Tabs */
        .lcd-tabs {
          display: flex;
          gap: 4px;
          margin-bottom: 24px;
          padding: 4px;
          background: #1a1a1a;
          border-radius: 12px;
          width: fit-content;
        }
        
        .lcd-tab {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          border: none;
          background: transparent;
          color: #888;
          font-size: 14px;
          font-weight: 500;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .lcd-tab:hover {
          color: #fff;
          background: #333;
        }
        
        .lcd-tab.active {
          color: #fff;
          background: #22c55e;
        }
        
        /* LCD Content */
        .lcd-content {
          min-height: 500px;
        }
        
        /* Displays Tab */
        .displays-tab {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        
        .lcd-simulators-row {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 24px;
        }
        
        @media (max-width: 900px) {
          .lcd-simulators-row { grid-template-columns: 1fr; }
        }
        
        .lcd-controls-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
        }
        
        @media (max-width: 1100px) {
          .lcd-controls-row { grid-template-columns: 1fr; }
        }
        
        /* LCD Simulator Card */
        .lcd-simulator-card {
          background: linear-gradient(145deg, #1a1a1a 0%, #111 100%);
          border: 1px solid #2a2a2a;
          border-radius: 16px;
          padding: 20px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        }
        
        .lcd-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        
        .lcd-title {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #fff;
          font-weight: 600;
        }
        
        .lcd-address {
          color: #666;
          font-size: 12px;
          font-family: monospace;
        }
        
        .lcd-status-badges {
          display: flex;
          gap: 8px;
        }
        
        /* LCD Display Frame */
        .lcd-display-frame {
          position: relative;
          margin: 16px 0;
        }
        
        .lcd-bezel {
          background: linear-gradient(135deg, #2d3436 0%, #1e272e 100%);
          border: 3px solid #3d3d3d;
          border-radius: 12px;
          padding: 12px;
          box-shadow: 
            inset 0 2px 4px rgba(0,0,0,0.5),
            0 4px 12px rgba(0,0,0,0.3);
        }
        
        .lcd-screen {
          background: linear-gradient(180deg, #0a1628 0%, #0d1f35 50%, #0a1628 100%);
          border-radius: 4px;
          padding: 8px 12px;
          font-family: 'Courier New', monospace;
          box-shadow: 
            inset 0 1px 3px rgba(0,0,0,0.8),
            0 0 20px rgba(34, 197, 94, 0.1);
        }
        
        .lcd-line {
          color: #22c55e;
          text-shadow: 0 0 8px rgba(34, 197, 94, 0.8), 0 0 16px rgba(34, 197, 94, 0.4);
          font-size: 18px;
          font-weight: 500;
          line-height: 1.6;
          letter-spacing: 2px;
          white-space: pre;
          min-height: 28px;
        }
        
        .lcd-reflection {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 40%;
          background: linear-gradient(
            180deg,
            rgba(255,255,255,0.03) 0%,
            transparent 100%
          );
          border-radius: 12px 12px 0 0;
          pointer-events: none;
        }
        
        /* Page Selector */
        .lcd-page-selector {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 12px;
        }
        
        .lcd-page-label {
          color: #666;
          font-size: 13px;
        }
        
        .lcd-page-buttons {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
        }
        
        .lcd-page-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          background: #222;
          border: 1px solid #333;
          border-radius: 6px;
          color: #888;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .lcd-page-btn:hover {
          background: #333;
          color: #fff;
          border-color: #444;
        }
        
        .lcd-page-btn.active {
          background: #22c55e;
          border-color: #22c55e;
          color: #fff;
        }
        
        /* Input Controller */
        .input-controller {
          background: #1a1a1a;
          border: 1px solid #2a2a2a;
          border-radius: 16px;
          padding: 20px;
        }
        
        .input-title {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #fff;
          font-weight: 600;
          margin-bottom: 16px;
        }
        
        .input-grid {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        
        /* D-Pad */
        .input-dpad {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }
        
        .dpad-row {
          display: flex;
          gap: 4px;
        }
        
        .input-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          background: #2a2a2a;
          border: 1px solid #3a3a3a;
          border-radius: 8px;
          color: #888;
          cursor: pointer;
          transition: all 0.15s;
        }
        
        .input-btn:hover:not(:disabled) {
          background: #3a3a3a;
          color: #fff;
          transform: scale(1.05);
        }
        
        .input-btn:active:not(:disabled) {
          transform: scale(0.95);
          background: #22c55e;
        }
        
        .input-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        
        .dpad-up, .dpad-down, .dpad-left, .dpad-right {
          width: 44px;
          height: 44px;
        }
        
        .dpad-center {
          width: 44px;
          height: 44px;
          background: #333;
        }
        
        /* Encoder */
        .input-encoder {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }
        
        .encoder-ring {
          display: flex;
          gap: 4px;
        }
        
        .encoder-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          background: #2a2a2a;
          border: 1px solid #3a3a3a;
          border-radius: 50%;
          color: #888;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.15s;
        }
        
        .encoder-btn:hover {
          background: #3a3a3a;
          color: #fff;
        }
        
        .encoder-btn.press {
          background: #333;
          color: #22c55e;
        }
        
        .encoder-label {
          color: #666;
          font-size: 12px;
        }
        
        /* Function Buttons */
        .input-function-btns {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }
        
        .input-btn.func {
          padding: 10px 16px;
          font-size: 12px;
          font-weight: 500;
        }
        
        /* Message Composer */
        .message-composer {
          background: #1a1a1a;
          border: 1px solid #2a2a2a;
          border-radius: 16px;
          padding: 20px;
        }
        
        .composer-header {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #fff;
          font-weight: 600;
          margin-bottom: 16px;
        }
        
        .composer-content {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        
        .composer-target {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        
        .composer-target label {
          color: #888;
          font-size: 13px;
        }
        
        .composer-target-btns {
          display: flex;
          gap: 4px;
        }
        
        .composer-btn {
          padding: 6px 12px;
          background: #222;
          border: 1px solid #333;
          border-radius: 6px;
          color: #888;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .composer-btn:hover {
          background: #333;
          color: #fff;
        }
        
        .composer-btn.active {
          background: #22c55e;
          border-color: #22c55e;
          color: #fff;
        }
        
        .composer-lines {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        
        .composer-line {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .composer-line label {
          color: #888;
          font-size: 13px;
          min-width: 50px;
        }
        
        .composer-line input {
          flex: 1;
          background: #222;
          border: 1px solid #333;
          border-radius: 6px;
          padding: 8px 12px;
          color: #fff;
          font-family: monospace;
        }
        
        .composer-line input:focus {
          outline: none;
          border-color: #22c55e;
        }
        
        .char-count {
          color: #666;
          font-size: 11px;
          min-width: 40px;
        }
        
        .composer-duration {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        
        .composer-duration label {
          color: #888;
          font-size: 13px;
        }
        
        .composer-duration input[type="range"] {
          flex: 1;
          accent-color: #22c55e;
        }
        
        .composer-duration span {
          color: #fff;
          font-size: 14px;
          min-width: 30px;
        }
        
        .composer-send {
          width: 100%;
        }
        
        /* Event Triggers */
        .event-triggers {
          background: #1a1a1a;
          border: 1px solid #2a2a2a;
          border-radius: 16px;
          padding: 20px;
        }
        
        .triggers-header {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #fff;
          font-weight: 600;
          margin-bottom: 16px;
        }
        
        .triggers-hint {
          color: #666;
          font-size: 12px;
          font-weight: 400;
          margin-left: auto;
        }
        
        .triggers-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }
        
        .trigger-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          background: #222;
          border: 1px solid #333;
          border-radius: 8px;
          color: #888;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .trigger-btn:hover {
          background: #333;
          color: #fff;
          border-color: #444;
        }
        
        .trigger-btn:active {
          background: #22c55e;
          border-color: #22c55e;
        }
        
        /* Alert Router Config */
        .alert-router-config {
          background: #1a1a1a;
          border: 1px solid #2a2a2a;
          border-radius: 16px;
          padding: 20px;
        }
        
        .alert-router-header {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #fff;
          font-weight: 600;
          margin-bottom: 20px;
        }
        
        .alert-types-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 12px;
        }
        
        .alert-type-card {
          background: #222;
          border: 1px solid #333;
          border-radius: 10px;
          padding: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .alert-type-card:hover {
          background: #2a2a2a;
          border-color: #444;
        }
        
        .alert-type-card.disabled {
          opacity: 0.5;
        }
        
        .alert-type-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 10px;
        }
        
        .alert-severity-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        
        .alert-type-label {
          flex: 1;
          color: #fff;
          font-size: 13px;
          font-weight: 500;
        }
        
        .alert-toggle {
          padding: 3px 8px;
          background: #333;
          border: none;
          border-radius: 4px;
          color: #888;
          font-size: 10px;
          font-weight: 600;
          cursor: pointer;
        }
        
        .alert-toggle.on {
          background: #22c55e;
          color: #fff;
        }
        
        .alert-toggle.off {
          background: #444;
          color: #666;
        }
        
        .alert-type-target {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #888;
          font-size: 12px;
        }
        
        .lcd-target-btns {
          display: flex;
          gap: 4px;
        }
        
        .lcd-target-btn {
          padding: 4px 8px;
          background: #333;
          border: none;
          border-radius: 4px;
          color: #888;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .lcd-target-btn:hover {
          background: #444;
          color: #fff;
        }
        
        .lcd-target-btn.active {
          background: #3b82f6;
          color: #fff;
        }
        
        .alert-type-details {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid #333;
        }
        
        .alert-detail-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;
        }
        
        .alert-detail-row label {
          color: #888;
          font-size: 12px;
          min-width: 100px;
        }
        
        .alert-detail-row input {
          width: 60px;
          padding: 4px 8px;
          background: #333;
          border: 1px solid #444;
          border-radius: 4px;
          color: #fff;
          font-size: 12px;
        }
        
        /* Active Alerts Panel */
        .active-alerts-panel {
          background: #1a1a1a;
          border: 1px solid #2a2a2a;
          border-radius: 16px;
          padding: 20px;
          margin-top: 24px;
        }
        
        .alerts-panel-header {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #f59e0b;
          font-weight: 600;
          margin-bottom: 16px;
        }
        
        .alerts-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        .alert-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          background: #222;
          border-radius: 8px;
        }
        
        .alert-item .alert-type {
          color: #f59e0b;
          font-weight: 500;
          font-size: 13px;
        }
        
        .alert-item .alert-message {
          flex: 1;
          color: #888;
          font-size: 13px;
        }
        
        .alert-item .alert-target {
          color: #666;
          font-size: 12px;
        }
        
        /* Hardware Controls */
        .hardware-controls {
          background: #1a1a1a;
          border: 1px solid #2a2a2a;
          border-radius: 16px;
          padding: 20px;
        }
        
        .hardware-header {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #fff;
          font-weight: 600;
          margin-bottom: 16px;
        }
        
        .hardware-actions {
          margin-bottom: 20px;
        }
        
        .scan-results {
          margin-top: 12px;
          padding: 12px;
          background: #222;
          border-radius: 8px;
        }
        
        .scan-summary {
          color: #22c55e;
          font-size: 13px;
          display: block;
          margin-bottom: 8px;
        }
        
        .scan-devices {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        
        .scan-device {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          background: #333;
          border-radius: 4px;
        }
        
        .device-address {
          color: #3b82f6;
          font-family: monospace;
          font-size: 12px;
        }
        
        .device-type {
          color: #888;
          font-size: 11px;
        }
        
        .lcd-controls-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }
        
        .lcd-control-card {
          background: #222;
          border: 1px solid #333;
          border-radius: 10px;
          padding: 16px;
        }
        
        .lcd-control-header {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #fff;
          font-weight: 500;
          margin-bottom: 12px;
        }
        
        .lcd-control-buttons {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        
        .lcd-control-buttons .btn {
          padding: 6px 10px;
        }
        
        /* Hardware Info */
        .hardware-info {
          background: #1a1a1a;
          border: 1px solid #2a2a2a;
          border-radius: 16px;
          padding: 20px;
          margin-top: 24px;
        }
        
        .info-header {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #fff;
          font-weight: 600;
          margin-bottom: 16px;
        }
        
        .info-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }
        
        @media (max-width: 800px) {
          .info-grid { grid-template-columns: repeat(2, 1fr); }
        }
        
        .info-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        
        .info-label {
          color: #666;
          font-size: 12px;
        }
        
        .info-value {
          color: #fff;
          font-size: 16px;
          font-weight: 500;
        }
        
        /* Pills */
        .pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 500;
        }
        
        .pill.success {
          background: rgba(34, 197, 94, 0.15);
          color: #22c55e;
        }
        
        .pill.warn {
          background: rgba(245, 158, 11, 0.15);
          color: #f59e0b;
        }
        
        .pill.muted {
          background: rgba(107, 114, 128, 0.15);
          color: #9ca3af;
        }
        
        /* Buttons */
        .btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          border: none;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .btn-primary {
          background: #22c55e;
          color: #fff;
        }
        
        .btn-primary:hover {
          background: #16a34a;
        }
        
        .btn-ghost {
          background: #222;
          color: #888;
          border: 1px solid #333;
        }
        
        .btn-ghost:hover {
          background: #333;
          color: #fff;
        }
        
        .btn-sm {
          padding: 5px 10px;
          font-size: 12px;
        }
        
        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
