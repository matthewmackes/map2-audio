/**
 * ReverbIRCard - Carbon-compliant JUCE ConvolutionProcessor (Reverb IR mode)
 *
 * Uses ConvolutionCategoryLayout for AXE-FX Edit structural parity.
 * Parameters: mix, bypass. Features: shared IR manager dialog, decay visualization.
 */

import { useState, useCallback, type ChangeEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ConvolutionCategoryLayout } from '../../Layouts/ConvolutionCategoryLayout'
import { ReverbDecayCurve } from '../../Visualizations/ReverbDecayCurve'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import type { PluginCardProps } from '../../types'
import { ReverbIRManagerDialog } from '../../../loaders/ReverbIRManagerDialog'
import { AssetUploadButton } from '../../../loaders/AssetUploadButton'
import { useToasts } from '../../../Toasts'

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
  const [dialogOpen, setDialogOpen] = useState(false)
  const { pushToast } = useToasts()

  const statusQuery = useQuery({
    queryKey: ['ir', 'reverb', 'status'],
    queryFn: fetchReverbStatus,
    refetchInterval: 2000,
  })

  const listQuery = useQuery({
    queryKey: ['ir', 'reverb', 'list'],
    queryFn: fetchReverbList,
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

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      const uploadResponse = await fetch('/api/ir/reverbs/upload', {
        method: 'POST',
        body: formData,
      })
      if (!uploadResponse.ok) {
        throw new Error('Failed to upload reverb IR')
      }
      const data = await uploadResponse.json() as { filename?: string }
      if (data.filename) {
        const loadResponse = await fetch(`/api/ir/reverbs/${encodeURIComponent(data.filename)}/load`, {
          method: 'POST',
        })
        if (!loadResponse.ok) {
          throw new Error('Failed to load uploaded reverb IR')
        }
      }
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ir'] })
      pushToast(`Loaded reverb IR: ${data.filename || 'uploaded file'}`, 'success')
    },
    onError: () => pushToast('Failed to upload reverb IR', 'error'),
  })

  const handleUploadChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      uploadMutation.mutate(file)
    }
    event.target.value = ''
  }, [uploadMutation])

  const visualization = (
    <ReverbDecayCurve
      decayTime={status?.decayTime || 2}
      width={compact ? 280 : 392}
      height={compact ? 84 : 112}
      accentColor={accentColor}
    />
  )

  return (
    <>
      <ConvolutionCategoryLayout
        plugin={plugin}
        accentColor={accentColor}
        compact={compact}
        bypassed={status?.bypass ?? false}
        onBypassToggle={() => setBypass(!status?.bypass)}
        onOpenMidiMappings={onOpenMidiMappings}
        visualization={visualization}
        irName={status?.loaded || undefined}
        onBrowseIR={() => setDialogOpen(true)}
        uploadControl={(
          <AssetUploadButton
            accept={['.wav']}
            ariaLabel="Upload reverb IR to selected block"
            label={uploadMutation.isPending ? 'Uploading...' : 'Upload WAV'}
            onChange={handleUploadChange}
            disabled={uploadMutation.isPending}
          />
        )}
        assetSupportText="Upload a local WAV reverb IR or open the shared library."
        mix={{
          label: 'Dry/Wet',
          value: status?.mix ?? 30,
          min: 0, max: 100, defaultValue: 30, step: 1,
          unit: '%',
          onChange: setMix,
          midi: { pluginUri: REVERB_IR_URI, paramIndex: PARAM.MIX },
        }}
        extraContent={
          <div style={{ textAlign: 'center', padding: '8px 0', fontSize: 10, color: '#666' }}>
            {reverbs.length} reverb IRs available
          </div>
        }
      />
      <ReverbIRManagerDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onLoadReverbIR={() => setDialogOpen(false)}
      />
    </>
  )
}

export { ReverbIRCardBase as ReverbIRCard }
export default withMidiDialog(ReverbIRCardBase, REVERB_IR_URI, REVERB_PARAMS)
