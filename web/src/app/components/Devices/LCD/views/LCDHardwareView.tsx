import React, { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Tag } from '@carbon/react'
import { Renew, Terminal } from '@carbon/icons-react'
import { LegacyButton } from '../../../shared/LegacyButton'
import { useToasts } from '../../../Toasts'
import { lcdApi, type DriverHealth } from '../../../../../map2/lcd'
import { HardwareControls, FT232HConfig } from '../LCDView'

export function LCDHardwareView() {
  const { pushToast } = useToasts()
  const [nativeLines, setNativeLines] = useState({ line1: '', line2: '', line3: '', line4: '' })

  const statusQuery = useQuery({
    queryKey: ['lcd', 'status'],
    queryFn: lcdApi.getStatus,
    refetchInterval: 7000,
    retry: 1,
    staleTime: 5000,
  })
  const healthQuery = useQuery({
    queryKey: ['lcd', 'health'],
    queryFn: lcdApi.getDriverHealth,
    refetchInterval: 5000,
    staleTime: 3000,
  })

  const scanMutation = useMutation({
    mutationFn: () => lcdApi.scanI2C(1),
    onSuccess: (data) => pushToast(`Found ${data.lcd_count} LCD(s)`, 'success'),
    onError: () => pushToast('I²C scan failed', 'error'),
  })
  const ft232hScanMutation = useMutation({
    mutationFn: () => lcdApi.scanFT232H(),
    onSuccess: (data) =>
      pushToast(
        data.status.connected ? `FT232H: Found ${data.lcd_count} device(s)` : `FT232H: ${data.status.error || 'Not connected'}`,
        data.status.connected ? 'success' : 'warn',
      ),
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
  const testMutation = useMutation({
    mutationFn: lcdApi.testDisplay,
    onSuccess: () => pushToast('Display test triggered', 'info'),
    onError: () => pushToast('Test failed', 'error'),
  })
  const backlightMutation = useMutation({
    mutationFn: ({ lcdId, enabled }: { lcdId: number; enabled: boolean }) => lcdApi.toggleBacklight(lcdId, enabled),
    onSuccess: (data) => pushToast(`Backlight ${data.backlight ? 'on' : 'off'}`, 'info'),
    onError: () => pushToast('Backlight toggle failed', 'error'),
  })
  const resetMutation = useMutation({
    mutationFn: lcdApi.resetDisplay,
    onSuccess: () => pushToast('Display reset', 'info'),
    onError: () => pushToast('Reset failed', 'error'),
  })
  const reconnectMutation = useMutation({
    mutationFn: (lcdId: number) => lcdApi.reconnectDriver(lcdId),
    onSuccess: (data) => pushToast(`Reconnected LCD ${data.lcd_id + 1}`, 'success'),
    onError: () => pushToast('Reconnect failed', 'error'),
  })
  const nativeWriteMutation = useMutation({
    mutationFn: lcdApi.writeNative,
    onSuccess: () => pushToast('Native raw write sent', 'success'),
    onError: (e) => pushToast(`Native write failed: ${e}`, 'error'),
  })

  const isSimulation = statusQuery.data?.simulation_mode || false
  const uptime = statusQuery.data?.uptime_seconds || 0
  const sysStats = statusQuery.data?.statistics || { page_changes: 0, input_events: 0 }

  return (
    <div className="lcd-page">
      <div className="hardware-tab">
        <HardwareControls
          onScan={() => scanMutation.mutate()}
          onTest={(lcdId) => testMutation.mutate(lcdId)}
          onBacklight={(lcdId, enabled) => backlightMutation.mutate({ lcdId, enabled })}
          onReset={(lcdId) => resetMutation.mutate(lcdId)}
          scanResult={scanMutation.data}
          isScanning={scanMutation.isPending}
        />

        <DriverHealthPanel
          drivers={healthQuery.data?.drivers ?? []}
          onReconnect={(id) => reconnectMutation.mutate(id)}
          reconnectBusy={reconnectMutation.isPending}
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
                {uptime > 0 ? `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s` : 'N/A'}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">Page Changes</span>
              <span className="info-value">{sysStats.page_changes || 0}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Input Events</span>
              <span className="info-value">{sysStats.input_events || 0}</span>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 24 }}>
          <NativeRawWritePanel
            lines={nativeLines}
            onChange={setNativeLines}
            onSend={() => nativeWriteMutation.mutate(nativeLines)}
            busy={nativeWriteMutation.isPending}
          />
        </div>

        <div style={{ marginTop: 24 }}>
          <FT232HConfig
            onScan={() => ft232hScanMutation.mutate()}
            onTestLCD={(address) => ft232hTestMutation.mutate(address)}
            onTestWrite={(address, message) =>
              ft232hWriteMutation.mutate({ address, line1: message, line2: new Date().toLocaleTimeString() })
            }
            scanResult={
              ft232hScanMutation.data
                ? { bus: 0, devices: ft232hScanMutation.data.devices, lcd_count: ft232hScanMutation.data.lcd_count }
                : undefined
            }
            isScanning={ft232hScanMutation.isPending}
            deviceStatus={
              ft232hScanMutation.data
                ? {
                    connected: ft232hScanMutation.data.status.connected,
                    url: ft232hScanMutation.data.status.url,
                    frequency: ft232hScanMutation.data.status.frequency,
                    devices: ft232hScanMutation.data.devices.map((d) => ({ address: d.address, type: d.device_type })),
                  }
                : {
                    connected: false,
                    url: 'ftdi://ftdi:232h/1',
                    frequency: 100000,
                    devices: [] as { address: number; type: string }[],
                  }
            }
          />
        </div>
      </div>
    </div>
  )
}

interface DriverHealthPanelProps {
  drivers: DriverHealth[]
  onReconnect: (lcdId: number) => void
  reconnectBusy: boolean
}

function DriverHealthPanel({ drivers, onReconnect, reconnectBusy }: DriverHealthPanelProps) {
  return (
    <div className="hardware-info" style={{ marginTop: 16 }}>
      <div className="info-header">
        <Terminal size={18} />
        <span>Driver Health</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>
          Per-LCD transport, connection state, last write, error count
        </span>
      </div>
      <div className="info-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        {drivers.length === 0 && (
          <div className="info-item">
            <span className="info-label">No drivers</span>
            <span className="info-value">LCD manager not running</span>
          </div>
        )}
        {drivers.map((d) => (
          <div
            key={d.lcd_id}
            className="info-item"
            style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="info-label">LCD {d.lcd_id + 1}</span>
              <Tag type={d.connected && !d.is_mock ? 'green' : d.is_mock ? 'magenta' : 'warm-gray'}>
                {d.is_mock ? 'MOCK' : d.connected ? 'CONNECTED' : 'OFFLINE'}
              </Tag>
              <Tag type="cool-gray">{d.adapter}</Tag>
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', fontFamily: 'var(--font-ui-tight)' }}>
              {d.driver_class}
              {d.address !== null ? ` @ 0x${d.address.toString(16).toUpperCase().padStart(2, '0')}` : ''}
              {' · '}
              {d.last_write_ago_s === null ? 'no writes yet' : `last write ${d.last_write_ago_s.toFixed(1)}s ago`}
              {' · '}
              errors: {d.write_error_count}
              {d.backlight_level !== null ? ` · backlight ${d.backlight_level}%` : ''}
            </div>
            <LegacyButton variant="ghost" size="sm" onClick={() => onReconnect(d.lcd_id)} disabled={reconnectBusy}>
              <Renew size={14} /> Reconnect
            </LegacyButton>
          </div>
        ))}
      </div>
    </div>
  )
}

interface NativeRawWritePanelProps {
  lines: { line1: string; line2: string; line3: string; line4: string }
  onChange: (next: { line1: string; line2: string; line3: string; line4: string }) => void
  onSend: () => void
  busy: boolean
}

function NativeRawWritePanel({ lines, onChange, onSend, busy }: NativeRawWritePanelProps) {
  const update = (key: keyof typeof lines, value: string) => onChange({ ...lines, [key]: value })
  return (
    <div className="hardware-info">
      <div className="info-header">
        <Terminal size={18} />
        <span>Native I²C raw write (debug)</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>
          Bypasses LCD manager event queue. Primary native driver only.
        </span>
      </div>
      <div className="info-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {(['line1', 'line2', 'line3', 'line4'] as const).map((key, idx) => (
          <div key={key} className="info-item">
            <span className="info-label">Line {idx + 1}</span>
            <input
              type="text"
              maxLength={20}
              value={lines[key]}
              onChange={(e) => update(key, e.target.value)}
              placeholder={`Line ${idx + 1} (max 20 chars)`}
              style={{
                fontFamily: 'var(--font-ui-tight)',
                background: 'var(--cds-field)',
                border: '1px solid var(--cds-border-subtle)',
                borderRadius: 4,
                padding: '6px 8px',
                color: 'var(--cds-text-primary)',
                fontSize: 13,
              }}
            />
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <LegacyButton variant="primary" onClick={onSend} disabled={busy}>
          Send raw write
        </LegacyButton>
      </div>
    </div>
  )
}
