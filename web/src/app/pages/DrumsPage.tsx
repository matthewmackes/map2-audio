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
import { Drum, Music, Upload, FolderOpen, RefreshCw, Play, Square, ChevronDown } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { drumsApi } from '../../map2/api'
import type { DrumMachineState, DrumPack } from '../../map2/types'

export function DrumsPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'player' | 'factory' | 'user'>('player')

  // Queries
  const stateQuery = useQuery({
    queryKey: ['drums', 'state'],
    queryFn: drumsApi.getState,
    refetchInterval: 2000,
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
        background: '#1a1a2e',
        border: '1px solid #333',
        borderRadius: 10,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 14, color: '#fff' }}>{pack.name}</div>
      <div style={{ fontSize: 12, color: '#888' }}>{pack.description}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
        <span style={{
          fontSize: 11,
          padding: '2px 8px',
          background: '#333',
          borderRadius: 4,
          color: '#aaa',
        }}>
          {pack.source}
        </span>
      </div>
    </div>
  )

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        title="Drum Machine"
        subtitle="Practice patterns, factory packs & user drum kits"
        icon={<Drum size={32} style={{ color: '#f59e0b' }} />}
      />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid #333', paddingBottom: 16 }}>
        {(['player', 'factory', 'user'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: activeTab === tab ? '#444' : '#222',
              border: `1px solid ${activeTab === tab ? '#666' : '#444'}`,
              borderRadius: 6,
              color: activeTab === tab ? '#fff' : '#888',
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
          <h3 style={{ margin: '0 0 16px', color: '#fff' }}>Drum Player</h3>

          {/* Mode selector */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            {(['practice', 'advanced', 'backing_tracks'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => updateState.mutate({ ui_mode: mode })}
                style={{
                  padding: '10px 20px',
                  background: state?.ui_mode === mode ? '#f59e0b' : '#2a2a3e',
                  color: state?.ui_mode === mode ? '#000' : '#ccc',
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
              <div>
                <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>Variation</label>
                <input
                  type="number"
                  value={state.practice_variation}
                  onChange={e => updateState.mutate({ practice_variation: Number(e.target.value) })}
                  min={0}
                  style={{ width: '100%', padding: 8, background: '#1a1a2e', border: '1px solid #444', borderRadius: 6, color: '#fff' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>Count-in Bars</label>
                <input
                  type="number"
                  value={state.practice_count_in_bars}
                  onChange={e => updateState.mutate({ practice_count_in_bars: Number(e.target.value) })}
                  min={0}
                  max={4}
                  style={{ width: '100%', padding: 8, background: '#1a1a2e', border: '1px solid #444', borderRadius: 6, color: '#fff' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>Quantization</label>
                <input
                  type="number"
                  value={state.practice_change_quantization}
                  onChange={e => updateState.mutate({ practice_change_quantization: Number(e.target.value) })}
                  min={1}
                  max={8}
                  style={{ width: '100%', padding: 8, background: '#1a1a2e', border: '1px solid #444', borderRadius: 6, color: '#fff' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={state.practice_auto_fill}
                  onChange={e => updateState.mutate({ practice_auto_fill: e.target.checked })}
                />
                <label style={{ fontSize: 13, color: '#ccc' }}>Auto Fill</label>
              </div>
            </div>
          )}

          {!state && (
            <div style={{ color: '#666', textAlign: 'center', padding: 40 }}>
              <RefreshCw size={24} style={{ marginBottom: 8, opacity: 0.5 }} />
              <div>Loading drum machine state...</div>
            </div>
          )}
        </div>
      )}

      {/* Factory Packs Tab */}
      {activeTab === 'factory' && (
        <div>
          <h3 style={{ margin: '0 0 16px', color: '#fff' }}>
            Factory Drum Packs ({factoryPacks.length})
          </h3>
          {factoryPacks.length === 0 ? (
            <div style={{ color: '#666', textAlign: 'center', padding: 40 }}>
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
            <h3 style={{ margin: 0, color: '#fff' }}>
              My Drum Packs ({generatedPacks.length})
            </h3>
          </div>
          {generatedPacks.length === 0 ? (
            <div style={{ color: '#666', textAlign: 'center', padding: 40 }}>
              <FolderOpen size={24} style={{ marginBottom: 8, opacity: 0.5 }} />
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
