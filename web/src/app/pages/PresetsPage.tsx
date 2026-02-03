import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Combobox, ComboboxItem, ComboboxPopover, ComboboxProvider, useComboboxStore } from '@ariakit/react'
import { BookmarkPlus, Loader2, Star, Settings } from 'lucide-react'
import type { Preset } from '../../map2/types'
import { presetsApi } from '../../map2/api'
import { PageHeader } from '../components/PageHeader'
import { useToasts } from '../components/Toasts'

type PresetsResponse = { presets: Preset[] }

export function PresetsPage() {
  const combobox = useComboboxStore()
  const searchValue = combobox.getState().value
  const { pushToast } = useToasts()

  const presetsQuery = useQuery<PresetsResponse>({
    queryKey: ['presets', searchValue],
    queryFn: () => presetsApi.list(searchValue ? { search: searchValue } : undefined),
  })

  const presets = presetsQuery.data?.presets ?? []
  const names = presets.map((p: Preset) => p.name)

  useEffect(() => {
    if (presetsQuery.isError) pushToast('Failed to load presets', 'error')
  }, [presetsQuery.isError, pushToast])

  useEffect(() => {
    // sync for controlled updates; no list API required in @ariakit/react store
  }, [names])

  return (
    <div className="stack">
      <PageHeader
        title="Presets"
        subtitle="Search, filter, and favorite presets with keyboard-friendly controls."
        icon={<Settings size={32} style={{ color: '#3b82f6' }} />}
        actions={<span className="pill">Synced with backend</span>}
      />

      <div className="card">
        <div className="section-heading">
          <div>
            <h3>Preset library</h3>
            <p className="subtitle">Type to filter or pick from the popover.</p>
          </div>
          <ComboboxProvider store={combobox}>
            <div style={{ minWidth: 260 }}>
              <Combobox store={combobox} className="combobox" placeholder="Search presets" />
              <ComboboxPopover store={combobox} className="menu" gutter={6}>
                {names.length === 0 ? (
                  <div className="menu-item" aria-disabled>
                    {presetsQuery.isLoading ? 'Loading presets…' : 'No presets yet'}
                  </div>
                ) : (
                  names.map((name) => <ComboboxItem key={name} value={name} className="menu-item" />)
                )}
              </ComboboxPopover>
            </div>
          </ComboboxProvider>
        </div>

        {presetsQuery.isLoading ? (
          <div className="flex" style={{ padding: '12px 4px' }}>
            <Loader2 className="spin" size={18} /> Loading presets...
          </div>
        ) : presetsQuery.error ? (
          <div className="pill warn">Failed to load presets</div>
        ) : presets.length === 0 ? (
          <div className="list-item">No presets yet. Save one from the Chains view.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Tags</th>
                  <th>Favorite</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {presets.map((preset) => (
                  <PresetRow key={preset.id} preset={preset} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function PresetRow({ preset }: { preset: Preset }) {
  return (
    <tr>
      <td>{preset.name}</td>
      <td>{preset.category}</td>
      <td className="muted">{preset.tags.join(', ') || '—'}</td>
      <td>
        {preset.is_favorite ? (
          <span className="pill success"><Star size={14} /> Favorite</span>
        ) : (
          <span className="pill muted"><BookmarkPlus size={14} /> Markable</span>
        )}
      </td>
      <td>{new Date(preset.updated_at).toLocaleString()}</td>
    </tr>
  )
}
