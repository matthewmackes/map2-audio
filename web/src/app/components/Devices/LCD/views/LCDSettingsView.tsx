import React, { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Tag } from '@carbon/react'
import { Save, SettingsAdjust } from '@carbon/icons-react'
import { LegacyButton } from '../../../shared/LegacyButton'
import { useToasts } from '../../../Toasts'
import { lcdApi, LCD_SNAPSHOT_AWARE_FIELDS, type LCDDisplayConfig } from '../../../../../map2/lcd'

const PAGE_CHOICES = ['status', 'vu', 'chain', 'plugins', 'midi', 'perf', 'settings', 'menu']
const ADAPTER_CHOICES = ['native-i2c', 'ft232h'] as const

export function LCDSettingsView() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()

  const configQuery = useQuery({
    queryKey: ['lcd', 'displaysConfig'],
    queryFn: lcdApi.getDisplaysConfig,
  })
  const updateMutation = useMutation({
    mutationFn: lcdApi.updateDisplaysConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lcd', 'displaysConfig'] })
      pushToast('LCD settings saved', 'success')
    },
    onError: () => pushToast('Failed to save LCD settings', 'error'),
  })

  const [draft, setDraft] = useState<LCDDisplayConfig[] | null>(null)

  useEffect(() => {
    if (configQuery.data?.displays) setDraft(configQuery.data.displays)
  }, [configQuery.data])

  const dirty = useMemo(() => {
    if (!draft || !configQuery.data?.displays) return false
    return JSON.stringify(draft) !== JSON.stringify(configQuery.data.displays)
  }, [draft, configQuery.data])

  if (!draft) {
    return (
      <div className="lcd-page">
        <div style={{ padding: 24, color: 'var(--cds-text-secondary)' }}>Loading LCD settings…</div>
      </div>
    )
  }

  const updateField = (idx: number, key: keyof LCDDisplayConfig, value: unknown) => {
    setDraft((prev) => {
      if (!prev) return prev
      const next = [...prev]
      next[idx] = { ...next[idx], [key]: value } as LCDDisplayConfig
      return next
    })
  }

  return (
    <div className="lcd-page">
      <div className="settings-tab">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <SettingsAdjust size={20} style={{ color: '#60a5fa' }} />
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#60a5fa', margin: 0 }}>LCD Settings</h3>
          <Tag type="cool-gray">{draft.length} displays</Tag>
          {dirty && <Tag type="warm-gray">Unsaved changes</Tag>}
          <LegacyButton
            variant="primary"
            onClick={() => updateMutation.mutate(draft)}
            disabled={!dirty || updateMutation.isPending}
            style={{ marginLeft: 'auto' }}
          >
            <Save size={16} /> Save
          </LegacyButton>
        </div>

        <p style={{ color: 'var(--cds-text-secondary)', fontSize: 12, marginTop: 0, marginBottom: 16 }}>
          Per-LCD config. Snapshot-aware fields (marked) may be overridden by snapshot activation hooks per T2430-I;
          the rest stay node-local (hardware calibration). Brightness, contrast, and other hardware values apply live
          to the driver when the LCD manager is running.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 16 }}>
          {draft.map((display, idx) => (
            <DisplayEditorCard
              key={display.id}
              display={display}
              onChange={(key, value) => updateField(idx, key, value)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

interface DisplayEditorCardProps {
  display: LCDDisplayConfig
  onChange: <K extends keyof LCDDisplayConfig>(key: K, value: LCDDisplayConfig[K]) => void
}

function DisplayEditorCard({ display, onChange }: DisplayEditorCardProps) {
  const snapshotAware = (key: keyof LCDDisplayConfig) =>
    (LCD_SNAPSHOT_AWARE_FIELDS as readonly string[]).includes(key as string)

  return (
    <div className="lcd-section-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <h4 style={{ fontSize: 14, fontWeight: 600, color: '#60a5fa', margin: 0 }}>
          LCD {display.id + 1}
        </h4>
        <Tag type={display.enabled ? 'green' : 'warm-gray'}>{display.enabled ? 'enabled' : 'disabled'}</Tag>
        <Tag type="cool-gray">{display.adapter}</Tag>
        <code style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--cds-text-secondary)' }}>
          0x{display.address.toString(16).toUpperCase().padStart(2, '0')}
        </code>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Row label="Enabled">
          <input type="checkbox" checked={display.enabled} onChange={(e) => onChange('enabled', e.target.checked)} />
        </Row>
        <Row label="Adapter">
          <select value={display.adapter} onChange={(e) => onChange('adapter', e.target.value)}>
            {ADAPTER_CHOICES.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </Row>
        <Row label="I²C address (hex)">
          <input
            type="text"
            value={`0x${display.address.toString(16).toUpperCase().padStart(2, '0')}`}
            onChange={(e) => {
              const parsed = parseInt(e.target.value.replace(/^0x/i, ''), 16)
              if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 0xFF) onChange('address', parsed)
            }}
          />
        </Row>
        <Row label="Brightness (0-255)">
          <input
            type="number"
            min={0}
            max={255}
            value={display.brightness}
            onChange={(e) => onChange('brightness', Math.min(255, Math.max(0, parseInt(e.target.value) || 0)))}
          />
        </Row>
        <Row label="Contrast (0-63)">
          <input
            type="number"
            min={0}
            max={63}
            value={display.contrast}
            onChange={(e) => onChange('contrast', Math.min(63, Math.max(0, parseInt(e.target.value) || 0)))}
          />
        </Row>
        <Row label="Auto-scroll">
          <input type="checkbox" checked={display.auto_scroll} onChange={(e) => onChange('auto_scroll', e.target.checked)} />
        </Row>
        <Row label="Scroll delay (ms)">
          <input
            type="number"
            min={50}
            max={2000}
            value={display.scroll_delay_ms}
            onChange={(e) => onChange('scroll_delay_ms', Math.min(2000, Math.max(50, parseInt(e.target.value) || 300)))}
          />
        </Row>
        <Row label="Alert sound" snapshotAware={snapshotAware('alert_sound')}>
          <input type="checkbox" checked={display.alert_sound} onChange={(e) => onChange('alert_sound', e.target.checked)} />
        </Row>
        <Row label="Alert freq (Hz)">
          <input
            type="number"
            min={100}
            max={5000}
            value={display.alert_sound_freq_hz}
            onChange={(e) => onChange('alert_sound_freq_hz', Math.min(5000, Math.max(100, parseInt(e.target.value) || 1000)))}
          />
        </Row>
        <Row label="Alert duration (ms)">
          <input
            type="number"
            min={10}
            max={2000}
            value={display.alert_sound_duration_ms}
            onChange={(e) => onChange('alert_sound_duration_ms', Math.min(2000, Math.max(10, parseInt(e.target.value) || 100)))}
          />
        </Row>
        <Row label="Idle dim timeout (s)" snapshotAware={snapshotAware('idle_dim_timeout_s')}>
          <input
            type="number"
            min={0}
            max={3600}
            value={display.idle_dim_timeout_s}
            onChange={(e) => onChange('idle_dim_timeout_s', Math.min(3600, Math.max(0, parseInt(e.target.value) || 0)))}
          />
        </Row>
        <Row label="Idle dim brightness">
          <input
            type="number"
            min={0}
            max={255}
            value={display.idle_dim_brightness}
            onChange={(e) => onChange('idle_dim_brightness', Math.min(255, Math.max(0, parseInt(e.target.value) || 50)))}
          />
        </Row>
        <Row label="Auto-cycle enabled" snapshotAware={snapshotAware('auto_cycle_enabled')}>
          <input type="checkbox" checked={display.auto_cycle_enabled} onChange={(e) => onChange('auto_cycle_enabled', e.target.checked)} />
        </Row>
        <Row label="Auto-cycle interval (s)" snapshotAware={snapshotAware('auto_cycle_interval_s')}>
          <input
            type="number"
            min={1}
            max={600}
            value={display.auto_cycle_interval_s}
            onChange={(e) => onChange('auto_cycle_interval_s', Math.min(600, Math.max(1, parseInt(e.target.value) || 30)))}
          />
        </Row>
        <Row label="Default page" snapshotAware={snapshotAware('default_page')}>
          <select value={display.default_page} onChange={(e) => onChange('default_page', e.target.value)}>
            {PAGE_CHOICES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </Row>
      </div>
    </div>
  )
}

function Row({ label, snapshotAware, children }: { label: string; snapshotAware?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
      <span style={{ color: 'var(--cds-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
        {label}
        {snapshotAware && <Tag size="sm" type="teal">snapshot-aware</Tag>}
      </span>
      {children}
    </label>
  )
}
