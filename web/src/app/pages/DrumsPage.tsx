/**
 * DrumsPage - Drum Machine Interface
 *
 * Provides access to the built-in drum machine engine with:
 * - Practice mode with style selection
 * - Factory and user-generated drum packs
 * - Pack upload support
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
// Note: Phosphor has no Drum icon — MusicNote used as closest match
import { MusicNote, UploadSimple, FolderOpen, ArrowsClockwise, Play, Square, CaretDown } from '@phosphor-icons/react'
import { PageHeader } from '../components/PageHeader'
import { NumberInput } from '../components/Controls/NumberInput'
import { drumsApi } from '../../map2/api'
import type { DrumMachineState, DrumPack } from '../../map2/types'

export function DrumsPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'player' | 'factory' | 'user'>('player')

  // Queries
  const stateQuery = useQuery({
    queryKey: ['drums', 'state'],
    queryFn: drumsApi.getState,
    refetchInterval: 7000,  // 7s polling - non-disruptive
    staleTime: 5000,
  })

  const factoryPacksQuery = useQuery({
    queryKey: ['drums', 'factory-packs'],
    queryFn: drumsApi.getFactoryPacks,
  })

  const generatedPacksQuery = useQuery({
    queryKey: ['drums', 'generated-packs'],
    queryFn: drumsApi.getGeneratedPacks,
  })

  // Mutations
  const updateState = useMutation({
    mutationFn: (state: Partial<DrumMachineState>) => drumsApi.updateState(state),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['drums', 'state'] }),
  })

  const state = stateQuery.data as DrumMachineState | undefined
  const factoryPacks = (factoryPacksQuery.data ?? []) as DrumPack[]
  const generatedPacks = (generatedPacksQuery.data ?? []) as DrumPack[]

  const renderPackCard = (pack: DrumPack) => (
    <div
      key={pack.pack_id}
      style={{
        background: '#0a0a0a',
        border: '1px solid #222222',
        borderRadius: 10,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 14, color: '#f3f4f6' }}>{pack.name}</div>
      <div style={{ fontSize: 12, color: '#6b7280' }}>{pack.description}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
        <span style={{
          fontSize: 11,
          padding: '2px 8px',
          background: '#222222',
          borderRadius: 4,
          color: '#9ca3af',
        }}>
          {pack.source}
        </span>
      </div>
    </div>
  )

  return (
    <div className="drums-page" style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        title="Drum Machine"
        subtitle="Practice patterns, factory packs & user drum kits"
        icon={<MusicNote size={32} weight="duotone" style={{ color: '#60a5fa' }} />}
      />

      {/* Tabs */}
      <div className="drums-tab-strip" style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid #222222', paddingBottom: 16 }}>
        {(['player', 'factory', 'user'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: activeTab === tab ? '#1e293b' : '#111111',
              border: `1px solid ${activeTab === tab ? '#6b7280' : '#1e293b'}`,
              borderRadius: 6,
              color: activeTab === tab ? '#f3f4f6' : '#6b7280',
              fontSize: 13,
              padding: '8px 16px',
              cursor: 'pointer',
              transition: 'all 0.2s',
              textTransform: 'capitalize',
            }}
          >
            {tab === 'player' ? 'Player' : tab === 'factory' ? 'Factory Packs' : 'My Packs'}
          </button>
        ))}
      </div>

      {/* Player Tab */}
      {activeTab === 'player' && (
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ margin: '0 0 16px', color: '#f3f4f6' }}>Drum Player</h3>

          {/* Mode selector */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            {(['practice', 'advanced', 'backing_tracks'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => updateState.mutate({ ui_mode: mode })}
                style={{
                  padding: '10px 20px',
                  background: state?.ui_mode === mode ? '#2563eb' : '#111111',
                  color: state?.ui_mode === mode ? '#f3f4f6' : '#d1d5db',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  textTransform: 'capitalize',
                }}
              >
                {mode.replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Practice Settings */}
          {state?.ui_mode === 'practice' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              <NumberInput
                label="Variation"
                value={state.practice_variation}
                min={0}
                max={10}
                step={1}
                defaultValue={0}
                profile="integer"
                onChange={(value) => updateState.mutate({ practice_variation: value })}
                size="small"
                fullWidth
                accentColor="#2563eb"
              />
              <NumberInput
                label="Count-in Bars"
                value={state.practice_count_in_bars}
                min={0}
                max={4}
                step={1}
                defaultValue={1}
                profile="integer"
                onChange={(value) => updateState.mutate({ practice_count_in_bars: value })}
                size="small"
                fullWidth
                accentColor="#2563eb"
                valueFormatter={(value) => value === 0 ? 'Off' : `${value}`}
              />
              <NumberInput
                label="Quantization"
                value={state.practice_change_quantization}
                min={1}
                max={8}
                step={1}
                defaultValue={1}
                profile="integer"
                onChange={(value) => updateState.mutate({ practice_change_quantization: value })}
                size="small"
                fullWidth
                accentColor="#2563eb"
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={state.practice_auto_fill}
                  onChange={e => updateState.mutate({ practice_auto_fill: e.target.checked })}
                />
                <label style={{ fontSize: 13, color: '#d1d5db' }}>Auto Fill</label>
              </div>
            </div>
          )}

          {!state && (
            <div style={{ color: '#6b7280', textAlign: 'center', padding: 40 }}>
              <ArrowsClockwise size={24} weight="duotone" style={{ marginBottom: 8, opacity: 0.5 }} />
              <div>Loading drum machine state...</div>
            </div>
          )}
        </div>
      )}

      {/* Factory Packs Tab */}
      {activeTab === 'factory' && (
        <div>
          <h3 style={{ margin: '0 0 16px', color: '#f3f4f6' }}>
            Factory Drum Packs ({factoryPacks.length})
          </h3>
          {factoryPacks.length === 0 ? (
            <div style={{ color: '#6b7280', textAlign: 'center', padding: 40 }}>
              No factory packs found. Check data/drums/factory_packs directory.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {factoryPacks.map(renderPackCard)}
            </div>
          )}
        </div>
      )}

      {/* User Packs Tab */}
      {activeTab === 'user' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, color: '#f3f4f6' }}>
              My Drum Packs ({generatedPacks.length})
            </h3>
          </div>
          {generatedPacks.length === 0 ? (
            <div style={{ color: '#6b7280', textAlign: 'center', padding: 40 }}>
              <FolderOpen size={24} weight="duotone" style={{ marginBottom: 8, opacity: 0.5 }} />
              <div>No user packs yet. Upload a drum pack JSON to get started.</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {generatedPacks.map(renderPackCard)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default DrumsPage
