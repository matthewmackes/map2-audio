/**
 * ReverbIRCard - Custom card for JUCE ConvolutionProcessor (Reverb IR mode)
 *
 * Parameters:
 * - mix: % (0 to 100)
 * - bypass: boolean
 *
 * Features:
 * - IR file browser
 * - Decay visualization
 * - Navigation (prev/next)
 */

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PluginCardShell } from '../../Base/PluginCardShell'
import { ParameterSection } from '../../Base/ParameterSection'
import { ParameterRow } from '../../Base/ParameterRow'
import { ParameterKnob } from '../../../Controls/ParameterKnob'
import { ReverbDecayCurve } from '../../Visualizations/ReverbDecayCurve'
import type { PluginCardProps } from '../../types'

interface IRStatus {
  loaded: string | null
  mix: number
  bypass: boolean
  decayTime?: number
  availableIRs: Array<{ name: string; size: string; length: number }>
}

async function fetchReverbStatus(): Promise<IRStatus> {
  const res = await fetch('/api/ir/status?type=reverb')
  if (!res.ok) throw new Error('Failed to fetch reverb status')
  return res.json()
}

async function fetchReverbList(): Promise<Array<{ name: string; size: string }>> {
  const res = await fetch('/api/ir/reverbs')
  if (!res.ok) throw new Error('Failed to fetch reverbs')
  const data = await res.json()
  return data.reverbs || []
}

export function ReverbIRCard({
  plugin,
  accentColor = '#a855f7',
  compact = false,
}: PluginCardProps) {
  const queryClient = useQueryClient()
  const [showBrowser, setShowBrowser] = useState(false)

  const statusQuery = useQuery({
    queryKey: ['ir', 'reverb', 'status'],
    queryFn: fetchReverbStatus,
    refetchInterval: 2000,
  })

  const listQuery = useQuery({
    queryKey: ['ir', 'reverb', 'list'],
    queryFn: fetchReverbList,
  })

  const loadMutation = useMutation({
    mutationFn: async (irName: string) => {
      const res = await fetch(`/api/ir/reverbs/${encodeURIComponent(irName)}/load`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to load reverb IR')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ir', 'reverb'] })
      setShowBrowser(false)
    },
  })

  const setMix = useCallback(async (value: number) => {
    await fetch(`/api/ir/set-reverb-mix/${value}`, { method: 'POST' })
    queryClient.invalidateQueries({ queryKey: ['ir', 'reverb', 'status'] })
  }, [queryClient])

  const setBypass = useCallback(async (bypass: boolean) => {
    await fetch(`/api/ir/set-reverb-bypass/${bypass}`, { method: 'POST' })
    queryClient.invalidateQueries({ queryKey: ['ir', 'reverb', 'status'] })
  }, [queryClient])

  const status = statusQuery.data
  const reverbs = listQuery.data || []

  const visualization = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
      {/* Decay Visualization */}
      <ReverbDecayCurve
        decayTime={status?.decayTime || 2}
        width={compact ? 200 : 280}
        height={compact ? 60 : 80}
        accentColor={accentColor}
      />

      {/* Current IR Name */}
      <div
        style={{
          padding: '8px 20px',
          background: '#1a1a1a',
          borderRadius: '6px',
          border: `1px solid ${accentColor}40`,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase', marginBottom: '2px' }}>
          Reverb IR
        </div>
        <div
          style={{
            fontSize: '13px',
            fontWeight: 'bold',
            color: status?.loaded ? '#fff' : '#666',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '160px',
          }}
        >
          {status?.loaded || 'No IR Loaded'}
        </div>
      </div>

      {/* Browse Button */}
      <button
        onClick={() => setShowBrowser(true)}
        style={{
          padding: '8px 24px',
          background: accentColor,
          border: 'none',
          borderRadius: '4px',
          color: '#000',
          cursor: 'pointer',
          fontSize: '11px',
          fontWeight: 'bold',
        }}
      >
        BROWSE REVERBS
      </button>
    </div>
  )

  return (
    <PluginCardShell
      plugin={plugin}
      accentColor={accentColor}
      bypassed={status?.bypass ?? false}
      onBypassToggle={() => setBypass(!status?.bypass)}
      visualization={visualization}
      compact={compact}
    >
      {/* Mix Control */}
      <ParameterSection title="Mix" accentColor={accentColor}>
        <ParameterRow justify="center">
          <ParameterKnob
            label="Dry/Wet"
            value={status?.mix ?? 30}
            min={0}
            max={100}
            defaultValue={30}
            step={1}
            unit="%"
            onChange={setMix}
            accentColor={accentColor}
            size="large"
          />
        </ParameterRow>
      </ParameterSection>

      {/* IR Count */}
      <div
        style={{
          textAlign: 'center',
          padding: '8px 0',
          fontSize: '10px',
          color: '#666',
        }}
      >
        {reverbs.length} reverb IRs available
      </div>

      {/* Browser Modal */}
      {showBrowser && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowBrowser(false)}
        >
          <div
            style={{
              background: '#1a1a1a',
              borderRadius: '12px',
              padding: '20px',
              maxWidth: '400px',
              maxHeight: '500px',
              overflow: 'auto',
              border: `1px solid ${accentColor}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px 0', color: accentColor }}>Select Reverb IR</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {reverbs.map((rev) => (
                <button
                  key={rev.name}
                  onClick={() => loadMutation.mutate(rev.name)}
                  style={{
                    padding: '12px 16px',
                    background: status?.loaded === rev.name ? accentColor : '#333',
                    border: 'none',
                    borderRadius: '6px',
                    color: status?.loaded === rev.name ? '#000' : '#fff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ fontWeight: 'bold' }}>{rev.name}</div>
                  <div style={{ fontSize: '10px', opacity: 0.7 }}>{rev.size}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </PluginCardShell>
  )
}

export default ReverbIRCard
