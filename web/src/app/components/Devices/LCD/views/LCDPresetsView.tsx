import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Tag } from '@carbon/react'
import { Copy, Save, TrashCan, Play, Edit } from '@carbon/icons-react'
import { LegacyButton } from '../../../shared/LegacyButton'
import { useToasts } from '../../../Toasts'
import { lcdApi, type LCDPreset } from '../../../../../map2/lcd'

export function LCDPresetsView() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()

  const presetsQuery = useQuery({
    queryKey: ['lcd', 'presets'],
    queryFn: lcdApi.getPresets,
  })

  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['lcd', 'presets'] })

  const saveMutation = useMutation({
    mutationFn: (payload: { name: string; description?: string }) => lcdApi.savePreset(payload),
    onSuccess: () => {
      pushToast('Preset saved from current config', 'success')
      invalidate()
      setNewName('')
      setNewDesc('')
    },
    onError: (e) => pushToast(`Save failed: ${e}`, 'error'),
  })
  const deleteMutation = useMutation({
    mutationFn: lcdApi.deletePreset,
    onSuccess: (data) => { pushToast(`Deleted '${data.name}'`, 'success'); invalidate() },
    onError: (e) => pushToast(`Delete failed: ${e}`, 'error'),
  })
  const renameMutation = useMutation({
    mutationFn: ({ name, newName }: { name: string; newName: string }) => lcdApi.renamePreset(name, newName),
    onSuccess: (data) => { pushToast(`Renamed to '${data.new_name}'`, 'success'); invalidate() },
    onError: (e) => pushToast(`Rename failed: ${e}`, 'error'),
  })
  const duplicateMutation = useMutation({
    mutationFn: ({ name, newName }: { name: string; newName: string }) => lcdApi.duplicatePreset(name, newName),
    onSuccess: (data) => { pushToast(`Duplicated as '${data.name}'`, 'success'); invalidate() },
    onError: (e) => pushToast(`Duplicate failed: ${e}`, 'error'),
  })
  const applyMutation = useMutation({
    mutationFn: lcdApi.applyPreset,
    onSuccess: (data) => {
      pushToast(`Applied '${data.name}' (${data.applied_displays} displays)`, 'success')
      queryClient.invalidateQueries({ queryKey: ['lcd', 'displaysConfig'] })
    },
    onError: (e) => pushToast(`Apply failed: ${e}`, 'error'),
  })

  const presets: LCDPreset[] = presetsQuery.data?.presets ?? []
  const builtins = presets.filter((p) => p.builtin)
  const userPresets = presets.filter((p) => !p.builtin)

  return (
    <div className="lcd-page">
      <div className="presets-tab" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#60a5fa', marginBottom: 12 }}>
            Save current settings as a new preset
          </h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              <span style={{ color: 'var(--cds-text-secondary)' }}>Name</span>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. studio-bench"
                style={{ minWidth: 240 }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, flex: 1 }}>
              <span style={{ color: 'var(--cds-text-secondary)' }}>Description</span>
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Short description"
              />
            </label>
            <LegacyButton
              variant="primary"
              disabled={!newName.trim() || saveMutation.isPending}
              onClick={() => saveMutation.mutate({ name: newName.trim(), description: newDesc.trim() })}
            >
              <Save size={16} /> Save
            </LegacyButton>
          </div>
        </div>

        <PresetSection
          title="Built-in presets (read-only)"
          presets={builtins}
          onApply={(p) => applyMutation.mutate(p.name)}
          onDuplicate={(p) => {
            const newName = window.prompt(`Duplicate '${p.name}' as:`, `${p.name}-copy`)
            if (newName && newName.trim()) duplicateMutation.mutate({ name: p.name, newName: newName.trim() })
          }}
          onDelete={null}
          onRename={null}
        />

        <PresetSection
          title={`User presets (${userPresets.length})`}
          presets={userPresets}
          onApply={(p) => applyMutation.mutate(p.name)}
          onDuplicate={(p) => {
            const newName = window.prompt(`Duplicate '${p.name}' as:`, `${p.name}-copy`)
            if (newName && newName.trim()) duplicateMutation.mutate({ name: p.name, newName: newName.trim() })
          }}
          onDelete={(p) => {
            if (window.confirm(`Delete preset '${p.name}'? This cannot be undone.`)) {
              deleteMutation.mutate(p.name)
            }
          }}
          onRename={(p) => {
            const newName = window.prompt(`Rename '${p.name}' to:`, p.name)
            if (newName && newName.trim() && newName !== p.name) {
              renameMutation.mutate({ name: p.name, newName: newName.trim() })
            }
          }}
        />
      </div>
    </div>
  )
}

interface PresetSectionProps {
  title: string
  presets: LCDPreset[]
  onApply: (p: LCDPreset) => void
  onDuplicate: (p: LCDPreset) => void
  onDelete: ((p: LCDPreset) => void) | null
  onRename: ((p: LCDPreset) => void) | null
}

function PresetSection({ title, presets, onApply, onDuplicate, onDelete, onRename }: PresetSectionProps) {
  return (
    <div>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: '#60a5fa', marginBottom: 12 }}>{title}</h3>
      {presets.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--cds-text-secondary)' }}>None.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {presets.map((p) => (
            <div key={p.name} className="lcd-section-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <h4 style={{ fontSize: 14, fontWeight: 600, color: '#f3f4f6', margin: 0 }}>{p.name}</h4>
                {p.builtin && <Tag type="teal">built-in</Tag>}
              </div>
              <p style={{ fontSize: 12, color: 'var(--cds-text-secondary)', margin: '0 0 var(--cds-spacing-04)' }}>{p.description || '—'}</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <LegacyButton variant="primary" size="sm" onClick={() => onApply(p)}>
                  <Play size={14} /> Apply
                </LegacyButton>
                <LegacyButton variant="ghost" size="sm" onClick={() => onDuplicate(p)}>
                  <Copy size={14} /> Duplicate
                </LegacyButton>
                {onRename && (
                  <LegacyButton variant="ghost" size="sm" onClick={() => onRename(p)}>
                    <Edit size={14} /> Rename
                  </LegacyButton>
                )}
                {onDelete && (
                  <LegacyButton variant="ghost" size="sm" onClick={() => onDelete(p)}>
                    <TrashCan size={14} /> Delete
                  </LegacyButton>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
