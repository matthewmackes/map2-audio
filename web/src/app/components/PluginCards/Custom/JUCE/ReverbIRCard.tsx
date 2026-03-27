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
import { irApi } from '../../../../../map2/api'
import { getPluginIdentityKeyFromParts } from '../../../../../map2/utils/pluginIdentity'

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

interface ReverbIRCardProps extends PluginCardProps {
  onOpenMidiMappings?: () => void
}

function ReverbIRCardBase({
  plugin,
  pluginPosition,
  accentColor = '#a855f7',
  compact = false,
  onOpenMidiMappings,
}: ReverbIRCardProps) {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const { pushToast } = useToasts()
  const instanceId = typeof plugin.instance_id === 'number' && plugin.instance_id > 0 ? plugin.instance_id : undefined
  const resolvedPluginPosition = typeof pluginPosition === 'number' && pluginPosition >= 0 ? pluginPosition : undefined
  const statusScopeKey = getPluginIdentityKeyFromParts(REVERB_IR_URI, resolvedPluginPosition, instanceId)
  const statusQueryKey = ['ir', 'status', 'reverb', statusScopeKey] as const
  const listQueryKey = ['ir', 'reverb', 'list'] as const

  const statusQuery = useQuery({
    queryKey: statusQueryKey,
    queryFn: async () => {
      const status = await irApi.getTypeStatus('reverb', {
        instanceId,
        pluginPosition: resolvedPluginPosition,
      })
      return {
        loaded: status.loaded ?? status.loaded_reverb ?? status.active_reverb ?? null,
        mix: status.mix ?? 30,
        bypass: status.bypass ?? false,
        decayTime: typeof status.currentDecay === 'number' ? status.currentDecay / 1000 : undefined,
        availableIRs: status.availableIRs ?? [],
      }
    },
    refetchInterval: 2000,
  })

  const listQuery = useQuery({
    queryKey: listQueryKey,
    queryFn: async () => {
      const data = await irApi.listReverbs()
      return (data.irs ?? []).map((ir) => ({
        name: ir.name,
        size: `${((ir.size ?? 0) / 1024).toFixed(0)} KB`,
      }))
    },
  })

  const setMix = useCallback(async (value: number) => {
    if (instanceId) {
      await irApi.setReverbMixForInstance(value, instanceId)
    } else if (resolvedPluginPosition !== undefined) {
      await irApi.setReverbMixAtPosition(value, resolvedPluginPosition)
    } else {
      await fetch(`/api/ir/set-reverb-mix/${value}`, { method: 'POST' })
    }
    void queryClient.invalidateQueries({ queryKey: statusQueryKey })
  }, [instanceId, queryClient, resolvedPluginPosition, statusQueryKey])

  const setBypass = useCallback(async (bypass: boolean) => {
    if (instanceId) {
      await irApi.setReverbBypassForInstance(bypass, instanceId)
    } else if (resolvedPluginPosition !== undefined) {
      await irApi.setReverbBypassAtPosition(bypass, resolvedPluginPosition)
    } else {
      await fetch(`/api/ir/set-reverb-bypass/${bypass}`, { method: 'POST' })
    }
    void queryClient.invalidateQueries({ queryKey: statusQueryKey })
  }, [instanceId, queryClient, resolvedPluginPosition, statusQueryKey])

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
        if (instanceId) {
          await irApi.loadReverbToInstance(data.filename, instanceId)
        } else if (resolvedPluginPosition !== undefined) {
          await irApi.loadReverbAtPosition(data.filename, resolvedPluginPosition)
        } else {
          const loadResponse = await fetch(`/api/ir/reverbs/${encodeURIComponent(data.filename)}/load`, {
            method: 'POST',
          })
          if (!loadResponse.ok) {
            throw new Error('Failed to load uploaded reverb IR')
          }
        }
      }
      return data
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: listQueryKey })
      await queryClient.invalidateQueries({ queryKey: statusQueryKey })
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
        instanceId={instanceId}
        pluginPosition={resolvedPluginPosition}
      />
    </>
  )
}

export { ReverbIRCardBase as ReverbIRCard }
export default withMidiDialog(ReverbIRCardBase, REVERB_IR_URI, REVERB_PARAMS)
