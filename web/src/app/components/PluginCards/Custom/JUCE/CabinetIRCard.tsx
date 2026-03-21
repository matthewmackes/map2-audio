/**
 * CabinetIRCard - Carbon-compliant JUCE ConvolutionProcessor (Cabinet IR mode)
 *
 * Uses ConvolutionCategoryLayout for AXE-FX Edit structural parity.
 * Parameters: mix, bypass. Features: IR browser, prev/next navigation.
 */

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ConvolutionCategoryLayout } from '../../Layouts/ConvolutionCategoryLayout'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import type { PluginCardProps } from '../../types'

const CABINET_IR_URI = 'map2://juce/convolution/cabinet'

const PARAM = { MIX: 0 } as const

const CABINET_PARAMS: PluginParamDef[] = [
  { index: 0, name: 'Mix', symbol: 'mix' },
]

interface IRStatus {
  loaded: string | null
  mix: number
  bypass: boolean
  availableIRs: Array<{ name: string; size: string; length: number }>
}

async function fetchCabinetStatus(): Promise<IRStatus> {
  const res = await fetch('/api/ir/status?type=cabinet')
  if (!res.ok) throw new Error('Failed to fetch cabinet status')
  return res.json()
}

async function fetchCabinetList(): Promise<Array<{ name: string; size: string }>> {
  const res = await fetch('/api/ir/cabinets')
  if (!res.ok) throw new Error('Failed to fetch cabinets')
  const data = await res.json()
  return data.cabinets || []
}

interface CabinetIRCardProps extends PluginCardProps {
  onOpenMidiMappings?: () => void
}

function CabinetIRCardBase({
  plugin,
  accentColor = '#f97316',
  compact = false,
  onOpenMidiMappings,
}: CabinetIRCardProps) {
  const queryClient = useQueryClient()
  const [showBrowser, setShowBrowser] = useState(false)

  const statusQuery = useQuery({
    queryKey: ['ir', 'cabinet', 'status'],
    queryFn: fetchCabinetStatus,
    refetchInterval: 2000,
  })

  const listQuery = useQuery({
    queryKey: ['ir', 'cabinet', 'list'],
    queryFn: fetchCabinetList,
  })

  const loadMutation = useMutation({
    mutationFn: async (irName: string) => {
      const res = await fetch(`/api/ir/cabinets/${encodeURIComponent(irName)}/load`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to load cabinet IR')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ir', 'cabinet'] })
      setShowBrowser(false)
    },
  })

  const setMix = useCallback(async (value: number) => {
    await fetch(`/api/ir/set-cabinet-mix/${value}`, { method: 'POST' })
    queryClient.invalidateQueries({ queryKey: ['ir', 'cabinet', 'status'] })
  }, [queryClient])

  const setBypass = useCallback(async (bypass: boolean) => {
    await fetch(`/api/ir/set-cabinet-bypass/${bypass}`, { method: 'POST' })
    queryClient.invalidateQueries({ queryKey: ['ir', 'cabinet', 'status'] })
  }, [queryClient])

  const navigate = useCallback(async (direction: 'prev' | 'next') => {
    await fetch(`/api/ir/navigate-cabinet/${direction}`, { method: 'POST' })
    queryClient.invalidateQueries({ queryKey: ['ir', 'cabinet', 'status'] })
  }, [queryClient])

  const status = statusQuery.data
  const cabinets = listQuery.data || []

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
        <h3 style={{ margin: '0 0 16px 0', color: accentColor }}>Select Cabinet IR</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {cabinets.map((cab) => (
            <button
              key={cab.name}
              onClick={() => loadMutation.mutate(cab.name)}
              style={{
                padding: '12px 16px',
                background: status?.loaded === cab.name ? accentColor : '#333',
                border: 'none', borderRadius: 6,
                color: status?.loaded === cab.name ? '#000' : '#fff',
                cursor: 'pointer', textAlign: 'left', fontSize: 12,
              }}
            >
              <div style={{ fontWeight: 'bold' }}>{cab.name}</div>
              <div style={{ fontSize: 10, opacity: 0.7 }}>{cab.size}</div>
            </button>
          ))}
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
      irName={status?.loaded || undefined}
      onBrowseIR={() => setShowBrowser(true)}
      onPrevIR={() => navigate('prev')}
      onNextIR={() => navigate('next')}
      mix={{
        label: 'Dry/Wet',
        value: status?.mix ?? 100,
        min: 0, max: 100, defaultValue: 100, step: 1,
        unit: '%',
        onChange: setMix,
        midi: { pluginUri: CABINET_IR_URI, paramIndex: PARAM.MIX },
      }}
      extraContent={
        <>
          <div style={{ textAlign: 'center', padding: '8px 0', fontSize: 10, color: '#666' }}>
            {cabinets.length} cabinet IRs available
          </div>
          {browserModal}
        </>
      }
    />
  )
}

export { CabinetIRCardBase as CabinetIRCard }
export default withMidiDialog(CabinetIRCardBase, CABINET_IR_URI, CABINET_PARAMS)
