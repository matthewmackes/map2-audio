/**
 * CabinetIRCard - Carbon-compliant JUCE ConvolutionProcessor (Cabinet IR mode)
 *
 * Uses ConvolutionCategoryLayout for AXE-FX Edit structural parity.
 * Parameters: mix, bypass. Features: shared IR manager dialog, prev/next navigation.
 */

import { useState, useCallback, type ChangeEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ConvolutionCategoryLayout } from '../../Layouts/ConvolutionCategoryLayout'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import type { PluginCardProps } from '../../types'
import { CabinetIRManagerDialog } from '../../../loaders/CabinetIRManagerDialog'
import { AssetUploadButton } from '../../../loaders/AssetUploadButton'
import { useToasts } from '../../../Toasts'
import { irApi } from '../../../../../map2/api'
import { getPluginIdentityKeyFromParts } from '../../../../../map2/utils/pluginIdentity'

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

interface CabinetIRCardProps extends PluginCardProps {
  onOpenMidiMappings?: () => void
}

function CabinetIRCardBase({
  plugin,
  pluginPosition,
  accentColor = '#f97316',
  compact = false,
  onOpenMidiMappings,
}: CabinetIRCardProps) {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const { pushToast } = useToasts()
  const instanceId = typeof plugin.instance_id === 'number' && plugin.instance_id > 0 ? plugin.instance_id : undefined
  const resolvedPluginPosition = typeof pluginPosition === 'number' && pluginPosition >= 0 ? pluginPosition : undefined
  const statusScopeKey = getPluginIdentityKeyFromParts(CABINET_IR_URI, resolvedPluginPosition, instanceId)

  const statusQuery = useQuery({
    queryKey: ['ir', 'cabinet', 'status', statusScopeKey],
    queryFn: async () => {
      const status = await irApi.getTypeStatus('cabinet', {
        instanceId,
        pluginPosition: resolvedPluginPosition,
      })
      return {
        loaded: status.loaded ?? status.loaded_cabinet ?? status.active_cabinet ?? null,
        mix: status.mix ?? 100,
        bypass: status.bypass ?? false,
        availableIRs: status.availableIRs ?? [],
      }
    },
    refetchInterval: 2000,
  })

  const listQuery = useQuery({
    queryKey: ['ir', 'cabinet', 'list'],
    queryFn: async () => {
      const data = await irApi.listCabinets()
      return (data.irs ?? []).map((ir) => ({
        name: ir.name,
        size: `${((ir.size ?? 0) / 1024).toFixed(0)} KB`,
      }))
    },
  })

  const setMix = useCallback(async (value: number) => {
    if (instanceId) {
      await irApi.setCabinetMixForInstance(value, instanceId)
    } else if (resolvedPluginPosition !== undefined) {
      await irApi.setCabinetMixAtPosition(value, resolvedPluginPosition)
    } else {
      await fetch(`/api/ir/set-cabinet-mix/${value}`, { method: 'POST' })
    }
    queryClient.invalidateQueries({ queryKey: ['ir', 'cabinet', 'status'] })
  }, [instanceId, queryClient, resolvedPluginPosition])

  const setBypass = useCallback(async (bypass: boolean) => {
    if (instanceId) {
      await irApi.setCabinetBypassForInstance(bypass, instanceId)
    } else if (resolvedPluginPosition !== undefined) {
      await irApi.setCabinetBypassAtPosition(bypass, resolvedPluginPosition)
    } else {
      await fetch(`/api/ir/set-cabinet-bypass/${bypass}`, { method: 'POST' })
    }
    queryClient.invalidateQueries({ queryKey: ['ir', 'cabinet', 'status'] })
  }, [instanceId, queryClient, resolvedPluginPosition])

  const navigate = useCallback(async (direction: 'prev' | 'next') => {
    if (instanceId) {
      await irApi.navigateCabinetToInstance(direction, instanceId)
    } else if (resolvedPluginPosition !== undefined) {
      await irApi.navigateCabinetAtPosition(direction, resolvedPluginPosition)
    } else {
      await fetch(`/api/ir/navigate-cabinet/${direction}`, { method: 'POST' })
    }
    queryClient.invalidateQueries({ queryKey: ['ir', 'cabinet', 'status'] })
  }, [instanceId, queryClient, resolvedPluginPosition])

  const status = statusQuery.data
  const cabinets = listQuery.data || []

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      const uploadResponse = await fetch('/api/ir/cabinets/upload', {
        method: 'POST',
        body: formData,
      })
      if (!uploadResponse.ok) {
        throw new Error('Failed to upload cabinet IR')
      }
      const data = await uploadResponse.json() as { filename?: string }
      if (data.filename) {
        if (instanceId) {
          await irApi.loadCabinetToInstance(data.filename, instanceId)
        } else if (resolvedPluginPosition !== undefined) {
          await irApi.loadCabinetAtPosition(data.filename, resolvedPluginPosition)
        } else {
          const loadResponse = await fetch(`/api/ir/cabinets/${encodeURIComponent(data.filename)}/load`, {
            method: 'POST',
          })
          if (!loadResponse.ok) {
            throw new Error('Failed to load uploaded cabinet IR')
          }
        }
      }
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ir'] })
      pushToast(`Loaded cabinet IR: ${data.filename || 'uploaded file'}`, 'success')
    },
    onError: () => pushToast('Failed to upload cabinet IR', 'error'),
  })

  const handleUploadChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      uploadMutation.mutate(file)
    }
    event.target.value = ''
  }, [uploadMutation])

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
        uploadControl={(
          <AssetUploadButton
            accept={['.wav']}
            ariaLabel="Upload cabinet IR to selected block"
            label={uploadMutation.isPending ? 'Uploading...' : 'Upload WAV'}
            onChange={handleUploadChange}
            disabled={uploadMutation.isPending}
          />
        )}
        assetSupportText="Upload a local WAV cabinet IR or open the shared library."
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
        instanceId={instanceId}
        pluginPosition={resolvedPluginPosition}
      />
    </>
  )
}

export { CabinetIRCardBase as CabinetIRCard }
export default withMidiDialog(CabinetIRCardBase, CABINET_IR_URI, CABINET_PARAMS)
