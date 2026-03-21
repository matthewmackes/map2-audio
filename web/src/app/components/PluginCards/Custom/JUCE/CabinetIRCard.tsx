/**
 * CabinetIRCard - Carbon-compliant JUCE ConvolutionProcessor (Cabinet IR mode)
 *
 * Uses ConvolutionCategoryLayout for AXE-FX Edit structural parity.
 * Parameters: mix, bypass. Features: shared IR manager dialog, prev/next navigation.
 */

import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ConvolutionCategoryLayout } from '../../Layouts/ConvolutionCategoryLayout'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import type { PluginCardProps } from '../../types'
import { CabinetIRManagerDialog } from '../../../loaders/CabinetIRManagerDialog'

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
  const [dialogOpen, setDialogOpen] = useState(false)

  const statusQuery = useQuery({
    queryKey: ['ir', 'cabinet', 'status'],
    queryFn: fetchCabinetStatus,
    refetchInterval: 2000,
  })

  const listQuery = useQuery({
    queryKey: ['ir', 'cabinet', 'list'],
    queryFn: fetchCabinetList,
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

  return (
    <>
      <ConvolutionCategoryLayout
        plugin={plugin}
        accentColor={accentColor}
        compact={compact}
        bypassed={status?.bypass ?? false}
        onBypassToggle={() => setBypass(!status?.bypass)}
        onOpenMidiMappings={onOpenMidiMappings}
        irName={status?.loaded || undefined}
        onBrowseIR={() => setDialogOpen(true)}
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
          <div style={{ textAlign: 'center', padding: '8px 0', fontSize: 10, color: '#666' }}>
            {cabinets.length} cabinet IRs available
          </div>
        }
      />
      <CabinetIRManagerDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onLoadCabinetIR={() => setDialogOpen(false)}
      />
    </>
  )
}

export { CabinetIRCardBase as CabinetIRCard }
export default withMidiDialog(CabinetIRCardBase, CABINET_IR_URI, CABINET_PARAMS)
