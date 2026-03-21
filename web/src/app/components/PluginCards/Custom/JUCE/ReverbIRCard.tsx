/**
 * ReverbIRCard - Carbon-compliant JUCE ConvolutionProcessor (Reverb IR mode)
 *
 * Uses ConvolutionCategoryLayout for AXE-FX Edit structural parity.
 * Parameters: mix, bypass. Features: IR browser, decay visualization.
 */

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ConvolutionCategoryLayout } from '../../Layouts/ConvolutionCategoryLayout'
import { ReverbDecayCurve } from '../../Visualizations/ReverbDecayCurve'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import type { PluginCardProps } from '../../types'

const REVERB_IR_URI = 'map2://juce/convolution/reverb'

const PARAM = { MIX: 0 } as const

const REVERB_PARAMS: PluginParamDef[] = [
  { index: 0, name: 'Mix', symbol: 'mix' },
]

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
  return (data.irs || []).map((ir: any) => ({
    name: ir.name,
    size: `${(ir.size_mb || 0).toFixed(2)} MB`
  }))
}

interface ReverbIRCardProps extends PluginCardProps {
  onOpenMidiMappings?: () => void
}

function ReverbIRCardBase({
  plugin,
  accentColor = '#a855f7',
  compact = false,
  onOpenMidiMappings,
}: ReverbIRCardProps) {
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
      queryClient.invalidateQueries({ queryKey: ['ir', 'reverb', 'status'] })
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
    <ReverbDecayCurve
      decayTime={status?.decayTime || 2}
      width={compact ? 280 : 392}
      height={compact ? 84 : 112}
      accentColor={accentColor}
    />
  )

  // Browser modal as extraContent
  const browserModal = showBrowser ? (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={() => setShowBrowser(false)}
    >
      <div
        style={{
          background: '#1a1a1a', borderRadius: 12, padding: 20,
          maxWidth: 400, maxHeight: 500, overflow: 'auto',
          border: `1px solid ${accentColor}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 16px 0', color: accentColor }}>Select Reverb IR</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {reverbs.map((rev) => {
            const isLoading = loadMutation.isPending && loadMutation.variables === rev.name
            const isActive = status?.loaded === rev.name
            return (
              <button
                key={rev.name}
                onClick={() => loadMutation.mutate(rev.name)}
                disabled={loadMutation.isPending}
                style={{
                  padding: '12px 16px',
                  background: isActive ? accentColor : '#333',
                  border: 'none', borderRadius: 6,
                  color: isActive ? '#000' : '#fff',
                  cursor: loadMutation.isPending ? 'not-allowed' : 'pointer',
                  textAlign: 'left', fontSize: 12,
                  opacity: loadMutation.isPending && !isLoading ? 0.5 : 1,
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ fontWeight: 'bold' }}>
                  {isLoading ? 'Loading...' : rev.name}
                </div>
                <div style={{ fontSize: 10, opacity: 0.7 }}>{rev.size}</div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  ) : null

  return (
    <ConvolutionCategoryLayout
      plugin={plugin}
      accentColor={accentColor}
      compact={compact}
      bypassed={status?.bypass ?? false}
      onBypassToggle={() => setBypass(!status?.bypass)}
      onOpenMidiMappings={onOpenMidiMappings}
      visualization={visualization}
      irName={status?.loaded || undefined}
      onBrowseIR={() => setShowBrowser(true)}
      mix={{
        label: 'Dry/Wet',
        value: status?.mix ?? 30,
        min: 0, max: 100, defaultValue: 30, step: 1,
        unit: '%',
        onChange: setMix,
        midi: { pluginUri: REVERB_IR_URI, paramIndex: PARAM.MIX },
      }}
      extraContent={
        <>
          <div style={{ textAlign: 'center', padding: '8px 0', fontSize: 10, color: '#666' }}>
            {reverbs.length} reverb IRs available
          </div>
          {browserModal}
        </>
      }
    />
  )
}

export { ReverbIRCardBase as ReverbIRCard }
export default withMidiDialog(ReverbIRCardBase, REVERB_IR_URI, REVERB_PARAMS)
