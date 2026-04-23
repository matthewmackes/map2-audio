import React, { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Tag } from '@carbon/react'
import { TrashCan, Save } from '@carbon/icons-react'
import { LegacyButton } from '../../../shared/LegacyButton'
import { useToasts } from '../../../Toasts'
import {
  lcdApi,
  LCD_SNAPSHOT_AWARE_FIELDS,
  type LCDPreset,
  type LCDSnapshotHook,
  type LCDDisplayConfig,
} from '../../../../../map2/lcd'
import { fetchJson } from '../../../../../map2/http'

const PAGE_CHOICES = ['status', 'vu', 'chain', 'plugins', 'midi', 'perf', 'settings', 'menu']

interface SnapshotListItem {
  id: string
  name?: string
  metadata?: { name?: string }
}

export function LCDSnapshotsView() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()

  const snapshotsQuery = useQuery({
    queryKey: ['snapshots', 'list'],
    queryFn: async () =>
      fetchJson<{ snapshots: SnapshotListItem[] }>('/api/snapshots?limit=200'),
  })
  const presetsQuery = useQuery({
    queryKey: ['lcd', 'presets'],
    queryFn: lcdApi.getPresets,
  })
  const hooksQuery = useQuery({
    queryKey: ['lcd', 'snapshotHooks'],
    queryFn: lcdApi.listSnapshotHooks,
  })

  const [selectedId, setSelectedId] = useState<string | null>(null)
  useEffect(() => {
    if (!selectedId && snapshotsQuery.data?.snapshots?.length) {
      setSelectedId(snapshotsQuery.data.snapshots[0].id)
    }
  }, [snapshotsQuery.data, selectedId])

  const snapshots = snapshotsQuery.data?.snapshots ?? []
  const presets = presetsQuery.data?.presets ?? []
  const hooksByKey = useMemo(() => {
    const map = new Map<string, LCDSnapshotHook>()
    for (const h of hooksQuery.data?.hooks ?? []) map.set(h.snapshot_id, h.hook)
    return map
  }, [hooksQuery.data])

  return (
    <div className="lcd-page">
      <div className="snapshots-tab" style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16 }}>
        <SnapshotList
          snapshots={snapshots}
          hooks={hooksByKey}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        {selectedId && (
          <SnapshotHookEditor
            key={selectedId}
            snapshotId={selectedId}
            presets={presets}
            onDirtyChange={() => {
              queryClient.invalidateQueries({ queryKey: ['lcd', 'snapshotHooks'] })
            }}
            onToast={(msg, tone) => pushToast(msg, tone)}
          />
        )}
      </div>
    </div>
  )
}

interface SnapshotListProps {
  snapshots: SnapshotListItem[]
  hooks: Map<string, LCDSnapshotHook>
  selectedId: string | null
  onSelect: (id: string) => void
}

function SnapshotList({ snapshots, hooks, selectedId, onSelect }: SnapshotListProps) {
  return (
    <div className="lcd-section-card" style={{ maxHeight: 680, overflowY: 'auto' }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: '#60a5fa', marginBottom: 12 }}>
        Snapshots ({snapshots.length})
      </h3>
      {snapshots.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--cds-text-secondary)' }}>No snapshots in the library yet.</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {snapshots.map((s) => {
          const hook = hooks.get(s.id)
          const name = s.metadata?.name || s.name || s.id
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              style={{
                textAlign: 'left',
                padding: '8px 12px',
                borderRadius: 4,
                border: '1px solid var(--cds-border-subtle)',
                background: selectedId === s.id ? 'var(--cds-layer-selected)' : 'var(--cds-layer)',
                color: 'var(--cds-text-primary)',
                cursor: 'pointer',
                fontSize: 13,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <strong>{name}</strong>
                {hook && 'preset' in hook && <Tag type="teal" size="sm">preset: {hook.preset}</Tag>}
                {hook && 'inline' in hook && <Tag type="magenta" size="sm">inline</Tag>}
              </div>
              <code style={{ fontSize: 10, color: 'var(--cds-text-secondary)' }}>{s.id}</code>
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface SnapshotHookEditorProps {
  snapshotId: string
  presets: LCDPreset[]
  onDirtyChange: () => void
  onToast: (msg: string, tone: 'info' | 'success' | 'warn' | 'error') => void
}

function SnapshotHookEditor({ snapshotId, presets, onDirtyChange, onToast }: SnapshotHookEditorProps) {
  const queryClient = useQueryClient()
  const hookQuery = useQuery({
    queryKey: ['lcd', 'snapshotHook', snapshotId],
    queryFn: () => lcdApi.getSnapshotHook(snapshotId),
  })

  const [mode, setMode] = useState<'none' | 'preset' | 'inline'>('none')
  const [presetName, setPresetName] = useState<string>('')
  const [inlineDraft, setInlineDraft] = useState<Partial<LCDDisplayConfig>[]>([
    { id: 0 },
    { id: 1 },
  ])

  useEffect(() => {
    const hook = hookQuery.data?.hook
    if (!hook) {
      setMode('none')
      return
    }
    if ('preset' in hook) {
      setMode('preset')
      setPresetName(hook.preset)
    } else if ('inline' in hook) {
      setMode('inline')
      setInlineDraft(hook.inline.displays ?? [{ id: 0 }, { id: 1 }])
    }
  }, [hookQuery.data])

  const saveMutation = useMutation({
    mutationFn: (hook: LCDSnapshotHook) => lcdApi.putSnapshotHook(snapshotId, hook),
    onSuccess: () => {
      onToast('LCD hook saved', 'success')
      queryClient.invalidateQueries({ queryKey: ['lcd', 'snapshotHook', snapshotId] })
      onDirtyChange()
    },
    onError: (e) => onToast(`Save failed: ${e}`, 'error'),
  })
  const clearMutation = useMutation({
    mutationFn: () => lcdApi.deleteSnapshotHook(snapshotId),
    onSuccess: () => {
      onToast('LCD hook cleared', 'success')
      queryClient.invalidateQueries({ queryKey: ['lcd', 'snapshotHook', snapshotId] })
      onDirtyChange()
      setMode('none')
    },
    onError: (e) => onToast(`Clear failed: ${e}`, 'error'),
  })

  const handleSave = () => {
    if (mode === 'none') {
      clearMutation.mutate()
      return
    }
    if (mode === 'preset') {
      if (!presetName) {
        onToast('Pick a preset first', 'warn')
        return
      }
      saveMutation.mutate({ preset: presetName })
      return
    }
    saveMutation.mutate({ inline: { displays: inlineDraft } })
  }

  const updateInline = (idx: number, field: keyof LCDDisplayConfig, value: unknown) => {
    setInlineDraft((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  return (
    <div className="lcd-section-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#60a5fa', margin: 0 }}>Snapshot hook</h3>
        <code style={{ fontSize: 11, color: 'var(--cds-text-secondary)' }}>{snapshotId}</code>
        <LegacyButton
          variant="primary"
          onClick={handleSave}
          disabled={saveMutation.isPending || clearMutation.isPending}
          style={{ marginLeft: 'auto' }}
        >
          <Save size={16} /> Save
        </LegacyButton>
        {mode !== 'none' && (
          <LegacyButton variant="ghost" onClick={() => clearMutation.mutate()} disabled={clearMutation.isPending}>
            <TrashCan size={16} /> Clear
          </LegacyButton>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        {(['none', 'preset', 'inline'] as const).map((m) => (
          <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input type="radio" checked={mode === m} onChange={() => setMode(m)} /> {m}
          </label>
        ))}
      </div>

      {mode === 'none' && (
        <p style={{ color: 'var(--cds-text-secondary)', fontSize: 13 }}>
          No hook. When this snapshot activates, LCD keeps its current node-local config.
        </p>
      )}

      {mode === 'preset' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 12, color: 'var(--cds-text-secondary)' }}>Preset to apply on activation</label>
          <select value={presetName} onChange={(e) => setPresetName(e.target.value)}>
            <option value="">— pick one —</option>
            {presets.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name} {p.builtin ? '[built-in]' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {mode === 'inline' && (
        <div>
          <p style={{ color: 'var(--cds-text-secondary)', fontSize: 12, marginTop: 0, marginBottom: 12 }}>
            Inline override: only the 5 snapshot-aware fields below are applied. Hardware-calibration fields
            (brightness, contrast, etc.) stay node-local.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
            {inlineDraft.map((entry, idx) => (
              <div key={idx} className="lcd-section-card" style={{ background: 'var(--cds-layer-accent)' }}>
                <h4 style={{ fontSize: 13, color: '#60a5fa', marginTop: 0 }}>LCD {idx + 1}</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {(LCD_SNAPSHOT_AWARE_FIELDS as readonly (keyof LCDDisplayConfig)[]).map((field) => (
                    <InlineFieldEditor
                      key={field}
                      field={field}
                      value={entry[field]}
                      onChange={(v) => updateInline(idx, field, v)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function InlineFieldEditor({
  field,
  value,
  onChange,
}: {
  field: keyof LCDDisplayConfig
  value: unknown
  onChange: (v: unknown) => void
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
      <span style={{ color: 'var(--cds-text-secondary)' }}>{String(field)}</span>
      {field === 'default_page' ? (
        <select value={String(value ?? '')} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">— inherit —</option>
          {PAGE_CHOICES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      ) : field === 'auto_cycle_enabled' || field === 'alert_sound' ? (
        <select
          value={value === undefined ? '' : value ? '1' : '0'}
          onChange={(e) => {
            const v = e.target.value
            onChange(v === '' ? undefined : v === '1')
          }}
        >
          <option value="">— inherit —</option>
          <option value="1">on</option>
          <option value="0">off</option>
        </select>
      ) : (
        <input
          type="number"
          value={value === undefined ? '' : (value as number)}
          placeholder="— inherit —"
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      )}
    </label>
  )
}
