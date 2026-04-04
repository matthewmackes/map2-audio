/**
 * NAMCard - Neural Amp Modeler from JUCE NAMProcessor
 *
 * Parameters:
 * - inputGain: dB (-12 to 12)
 * - outputGain: dB (-12 to 12)
 * - normalize: boolean
 * - bypass: boolean
 *
 * Features:
 * - In-card model selection backed by the shared NAM manager dialog
 * - Input/Output level meters
 * - Model metadata display
 */

import { useState, useCallback, useMemo, type ChangeEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MachineLearningModel } from '@carbon/icons-react'
import { withMidiDialog, type PluginParamDef } from '../../withMidiDialog'
import { AmplifierCategoryLayout, type ParamSlot } from '../../Layouts/AmplifierCategoryLayout'
import type { AdvancedSection } from '../../Base/CarbonCardShell'
import { CarbonParameterSection } from '../../Base/CarbonParameterSection'
import type { PluginCardProps } from '../../types'
import { NAMManagerDialog } from '../../../loaders/NAMManagerDialog'
import { AssetUploadButton } from '../../../loaders/AssetUploadButton'
import { useToasts } from '../../../Toasts'
import { namApi } from '../../../../../map2/api'
import type { NAMStatus as ApiNAMStatus } from '../../../../../map2/types'
import { getPluginIdentityKeyFromParts } from '../../../../../map2/utils/pluginIdentity'
import { getPluginAccentConfig } from '../../../../utils/pluginAccent'

// Plugin URI for MIDI mappings
const NAM_URI = 'map2://juce/nam'

// Parameter definitions for MIDI mapping dialog
const NAM_PARAMS: PluginParamDef[] = [
  { index: 0, name: 'Input Gain', symbol: 'inputGain' },
  { index: 1, name: 'Output Level', symbol: 'outputLevel' },
]

interface NAMStatus {
  available: boolean
  activeModel: string | null
  configuredModel?: string | null
  configuredAssetPath?: string | null
  loading: boolean
  bypass: boolean
  configuredBypass?: boolean
  inputLevel: number
  outputLevel: number
  inputGain: number
  outputGain: number
  normalize: boolean
  configuredInputGain?: number
  configuredOutputGain?: number
  configuredNormalize?: boolean
  availableModels: string[]
  runtimeWarning?: string
}

function normalizeNAMStatus(status: ApiNAMStatus): NAMStatus {
  return {
    available: status.available,
    activeModel: status.activeModel,
    configuredModel: status.configuredModel,
    configuredAssetPath: status.configuredAssetPath,
    loading: status.loading ?? false,
    bypass: status.bypass,
    configuredBypass: status.configuredBypass,
    inputLevel: status.inputLevel,
    outputLevel: status.outputLevel,
    inputGain: status.input_gain ?? 0,
    outputGain: status.output_gain ?? 0,
    normalize: status.normalize ?? true,
    configuredInputGain: status.configuredInputGain,
    configuredOutputGain: status.configuredOutputGain,
    configuredNormalize: status.configuredNormalize,
    availableModels: status.availableModels,
    runtimeWarning: status.runtimeWarning,
  }
}

interface NAMCardProps extends PluginCardProps {
  onOpenMidiMappings?: () => void
}

function isDraftOnlyFallbackError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }
  return error.message.includes('Multiple active NAM loaders are configured without live runtime identity')
    || error.message.includes('Configured NAM block is not active in the live runtime')
}

function NAMCardBase({
  plugin,
  pluginPosition,
  accentColor: providedAccent,
  compact = false,
  onOpenMidiMappings,
  onLoaderStateChange,
}: NAMCardProps) {
  const accentColor = providedAccent || getPluginAccentConfig(plugin.uri, plugin.category).color
  const queryClient = useQueryClient()
  const [managerOpen, setManagerOpen] = useState(false)
  const { pushToast } = useToasts()
  const instanceId = typeof plugin.instance_id === 'number' && plugin.instance_id > 0 ? plugin.instance_id : undefined
  const resolvedPluginPosition = typeof pluginPosition === 'number' && pluginPosition >= 0 ? pluginPosition : undefined
  const statusScopeKey = getPluginIdentityKeyFromParts(NAM_URI, resolvedPluginPosition, instanceId)
  const statusQueryKey = ['nam', 'status', statusScopeKey] as const

  const statusQuery = useQuery({
    queryKey: statusQueryKey,
    queryFn: async () => normalizeNAMStatus(
      instanceId
        ? await namApi.getInstanceStatus(instanceId)
        : resolvedPluginPosition !== undefined
          ? await namApi.getStatusAtPosition(resolvedPluginPosition)
          : await namApi.getStatus()
    ),
    refetchInterval: 500, // Fast updates for level meters
  })
  const modelsQuery = useQuery({
    queryKey: ['nam', 'models'],
    queryFn: () => namApi.listModels(),
  })

  const setInputGain = useCallback(async (value: number) => {
    if (instanceId) {
      await namApi.setInputGainForInstance(value, instanceId)
    } else if (resolvedPluginPosition !== undefined) {
      await namApi.setInputGainAtPosition(value, resolvedPluginPosition)
    } else {
      await fetch('/api/nam/input-gain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gain_db: value }),
      })
    }
    void queryClient.invalidateQueries({ queryKey: statusQueryKey })
  }, [instanceId, queryClient, resolvedPluginPosition, statusQueryKey])

  const setOutputGain = useCallback(async (value: number) => {
    if (instanceId) {
      await namApi.setOutputGainForInstance(value, instanceId)
    } else if (resolvedPluginPosition !== undefined) {
      await namApi.setOutputGainAtPosition(value, resolvedPluginPosition)
    } else {
      await fetch('/api/nam/output-gain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gain_db: value }),
      })
    }
    void queryClient.invalidateQueries({ queryKey: statusQueryKey })
  }, [instanceId, queryClient, resolvedPluginPosition, statusQueryKey])

  const setNormalize = useCallback(async (normalize: boolean) => {
    if (instanceId) {
      await namApi.setNormalizeForInstance(normalize, instanceId)
    } else if (resolvedPluginPosition !== undefined) {
      await namApi.setNormalizeAtPosition(normalize, resolvedPluginPosition)
    } else {
      await fetch('/api/nam/normalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ normalize }),
      })
    }
    void queryClient.invalidateQueries({ queryKey: statusQueryKey })
  }, [instanceId, queryClient, resolvedPluginPosition, statusQueryKey])

  const setBypass = useCallback(async (bypass: boolean) => {
    if (instanceId) {
      await namApi.setBypassForInstance(bypass, instanceId)
    } else if (resolvedPluginPosition !== undefined) {
      await namApi.setBypassAtPosition(bypass, resolvedPluginPosition)
    } else {
      await fetch('/api/nam/bypass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bypass }),
      })
    }
    void queryClient.invalidateQueries({ queryKey: statusQueryKey })
  }, [instanceId, queryClient, resolvedPluginPosition, statusQueryKey])

  const status = statusQuery.data
  const availableModelCount = status?.availableModels?.length ?? 0
  const draftConfiguredModel = plugin.loader_state?.selected_asset_name ?? plugin.loader_state?.selected_model ?? null
  const draftConfiguredPath = plugin.loader_state?.selected_asset_path ?? null
  const displayModel = status?.activeModel || status?.configuredModel || draftConfiguredModel || null
  const configuredModel = status?.configuredModel || draftConfiguredModel || null
  const hasConfiguredModel = Boolean(configuredModel)
  const usingConfiguredFallback = Boolean(!status?.activeModel && configuredModel)
  const usingLiveModel = Boolean(status?.activeModel)
  const currentModelDetails = useMemo(() => {
    const models = modelsQuery.data?.models ?? []
    if (!displayModel) {
      return null
    }
    return models.find((model) => model.name === displayModel) ?? null
  }, [displayModel, modelsQuery.data?.models])

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      const uploadResponse = await fetch('/api/nam/upload', {
        method: 'POST',
        body: formData,
      })
      if (!uploadResponse.ok) {
        throw new Error('Failed to upload NAM model')
      }
      const data = await uploadResponse.json() as { model?: { name?: string; file_path?: string | null }; draft_only?: boolean }
      const uploadedName = data.model?.name
      const uploadedPath = data.model?.file_path ?? draftConfiguredPath
      if (uploadedName && onLoaderStateChange) {
        onLoaderStateChange({
          selected_model: uploadedName,
          selected_asset_name: uploadedName,
          selected_asset_path: uploadedPath ?? null,
        })
      }
      if (uploadedName) {
        try {
          if (instanceId) {
            await namApi.loadModelToInstance(uploadedName, instanceId)
          } else if (resolvedPluginPosition !== undefined) {
            await namApi.loadModelAtPosition(uploadedName, resolvedPluginPosition)
          } else {
            const loadResponse = await fetch(`/api/nam/models/${encodeURIComponent(uploadedName)}/load`, {
              method: 'POST',
            })
            if (!loadResponse.ok) {
              throw new Error('Failed to load uploaded NAM model')
            }
          }
        } catch (error) {
          if (!onLoaderStateChange || !isDraftOnlyFallbackError(error)) {
            throw error
          }
          return {
            ...data,
            draft_only: true,
          }
        }
      }
      return data
    },
    onSuccess: async (data: { model?: { name?: string }; draft_only?: boolean }) => {
      await queryClient.invalidateQueries({ queryKey: ['nam', 'models'] })
      await queryClient.invalidateQueries({ queryKey: statusQueryKey })
      if (data.draft_only) {
        pushToast(`Stored NAM model: ${data.model?.name || 'uploaded model'}. It will load when this block is active in the live runtime.`, 'info')
      } else {
        pushToast(`Loaded NAM model: ${data.model?.name || 'uploaded model'}`, 'success')
      }
    },
    onError: () => pushToast('Failed to upload NAM model', 'error'),
  })

  const handleUploadChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      uploadMutation.mutate(file)
    }
    event.target.value = ''
  }, [uploadMutation])

  // Level meter helper
  const levelToPercent = (db: number) => Math.max(0, Math.min(100, ((db + 60) / 60) * 100))

  const visualization = (
    <div style={{ display: 'flex', gap: '20px', alignItems: 'center', justifyContent: 'center' }}>
      {/* Input Meter */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
        <span style={{ fontSize: '9px', color: '#666', textTransform: 'uppercase' }}>IN</span>
        <div
          style={{
            width: '12px',
            height: compact ? 112 : 140,
            background: '#222',
            borderRadius: '2px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column-reverse',
          }}
        >
          <div
            style={{
              height: `${levelToPercent(status?.inputLevel ?? -60)}%`,
              background: `linear-gradient(to top, ${accentColor}, #ffaa00)`,
              transition: 'height 0.05s ease-out',
            }}
          />
        </div>
        <span style={{ fontSize: '9px', color: '#888', fontFamily: 'var(--font-mono)' }}>
          {(status?.inputLevel ?? -60).toFixed(0)}
        </span>
      </div>

      {/* Model Display */}
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            padding: '12px 20px',
            background: '#1a1a1a',
            borderRadius: '8px',
            border: `1px solid ${accentColor}40`,
            marginBottom: '8px',
          }}
        >
          <div style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase', marginBottom: '4px' }}>
            NAM Model
          </div>
          <div
            style={{
              fontSize: '14px',
              fontWeight: 'bold',
              color: status?.activeModel ? '#fff' : '#666',
              maxWidth: '140px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {status?.loading ? 'Loading...' : displayModel || 'No Model'}
          </div>
        </div>
      </div>

      {/* Output Meter */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
        <span style={{ fontSize: '9px', color: '#666', textTransform: 'uppercase' }}>OUT</span>
        <div
          style={{
            width: '12px',
            height: compact ? 112 : 140,
            background: '#222',
            borderRadius: '2px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column-reverse',
          }}
        >
          <div
            style={{
              height: `${levelToPercent(status?.outputLevel ?? -60)}%`,
              background: `linear-gradient(to top, ${accentColor}, #ffaa00)`,
              transition: 'height 0.05s ease-out',
            }}
          />
        </div>
        <span style={{ fontSize: '9px', color: '#888', fontFamily: 'var(--font-mono)' }}>
          {(status?.outputLevel ?? -60).toFixed(0)}
        </span>
      </div>
    </div>
  )

  // Map parameters to AmplifierCategoryLayout slots
  const inputGainSlot: ParamSlot = {
    label: 'Input',
    value: status?.inputGain ?? 0,
    min: -12,
    max: 12,
    defaultValue: 0,
    step: 0.1,
    unit: 'dB',
    onChange: setInputGain,
    valueFormatter: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`,
  }

  const outputGainSlot: ParamSlot = {
    label: 'Output',
    value: status?.outputGain ?? 0,
    min: -12,
    max: 12,
    defaultValue: 0,
    step: 0.1,
    unit: 'dB',
    onChange: setOutputGain,
    valueFormatter: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`,
  }

  const advancedSections: AdvancedSection[] = [
    {
      id: 'options',
      title: 'Options',
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            className={`carbon-toggle-btn ${status?.normalize ? 'active' : ''}`}
            onClick={() => setNormalize(!status?.normalize)}
            style={status?.normalize ? { background: accentColor, borderColor: accentColor } : undefined}
          >
            Normalize Output
          </button>
        </div>
      ),
    },
  ]

  const modelSelector = (
    <CarbonParameterSection
      title="Model"
      icon={<MachineLearningModel size={14} aria-hidden="true" />}
      accentColor={accentColor}
      autoIcon={false}
    >
      <div className="carbon-asset-selector-stack">
        <div className="carbon-asset-selector">
          <div className="carbon-asset-selector-main">
            <div className="carbon-asset-selector-title-block">
              <p className="carbon-asset-selector-kicker">Loaded model</p>
              <div
                className={`carbon-asset-selector-value ${displayModel ? '' : 'empty'}`}
                title={displayModel || 'No model loaded'}
              >
                {status?.loading ? 'Loading...' : displayModel || 'No model loaded'}
              </div>
            </div>
            <div className="carbon-asset-selector-status">
              {usingLiveModel ? <span className="carbon-asset-selector-status-badge carbon-asset-selector-status-badge--accent">Live runtime</span> : null}
              {hasConfiguredModel ? <span className="carbon-asset-selector-status-badge">Configured</span> : null}
              {usingConfiguredFallback ? <span className="carbon-asset-selector-status-badge carbon-asset-selector-status-badge--warning">Stored only</span> : null}
              {status?.runtimeWarning ? <span className="carbon-asset-selector-status-badge carbon-asset-selector-status-badge--warning">Runtime warning</span> : null}
            </div>
            <div className="carbon-asset-selector-fact-grid">
              <div className="carbon-asset-selector-fact">
                <span className="carbon-asset-selector-fact-label">Live</span>
                <span className="carbon-asset-selector-fact-value">{status?.activeModel ?? 'Not active'}</span>
              </div>
              <div className="carbon-asset-selector-fact">
                <span className="carbon-asset-selector-fact-label">Configured</span>
                <span className="carbon-asset-selector-fact-value">{configuredModel ?? 'None'}</span>
              </div>
              <div className="carbon-asset-selector-fact">
                <span className="carbon-asset-selector-fact-label">Type</span>
                <span className="carbon-asset-selector-fact-value">{currentModelDetails?.type || 'Unknown'}</span>
              </div>
              <div className="carbon-asset-selector-fact">
                <span className="carbon-asset-selector-fact-label">Size</span>
                <span className="carbon-asset-selector-fact-value">
                  {typeof currentModelDetails?.size_mb === 'number' ? `${currentModelDetails.size_mb.toFixed(1)} MB` : 'Unknown'}
                </span>
              </div>
              <div className="carbon-asset-selector-fact">
                <span className="carbon-asset-selector-fact-label">Library</span>
                <span className="carbon-asset-selector-fact-value">
                  {availableModelCount} model{availableModelCount === 1 ? '' : 's'}
                </span>
              </div>
            </div>
            <p className="carbon-asset-selector-support">
              {status?.runtimeWarning || 'Upload a local `.nam` file or open the model library.'}
            </p>
          </div>
          <div className="carbon-asset-selector-actions">
            <button
              type="button"
              className="carbon-toggle-btn"
              onClick={() => setManagerOpen(true)}
              disabled={!status?.available || uploadMutation.isPending}
            >
              Select...
            </button>
            <AssetUploadButton
              accept={['.nam']}
              ariaLabel="Upload NAM model to selected block"
              label={uploadMutation.isPending ? 'Uploading...' : 'Upload .nam'}
              onChange={handleUploadChange}
              disabled={!status?.available || uploadMutation.isPending}
            />
          </div>
        </div>
      </div>
    </CarbonParameterSection>
  )

  return (
    <>
      <AmplifierCategoryLayout
        plugin={plugin}
        accentColor={accentColor}
        compact={compact}
        bypassed={status?.bypass ?? false}
        onBypassToggle={() => setBypass(!status?.bypass)}
        onOpenMidiMappings={onOpenMidiMappings}
        visualization={visualization}
        topContent={modelSelector}
        inputGain={inputGainSlot}
        outputGain={outputGainSlot}
        inputLevel={status?.inputLevel ?? 0}
        outputLevel={status?.outputLevel ?? 0}
        advancedSections={advancedSections}
      />
      <NAMManagerDialog
        open={managerOpen}
        onClose={() => setManagerOpen(false)}
        onLoadNAM={() => setManagerOpen(false)}
        instanceId={instanceId}
        pluginPosition={resolvedPluginPosition}
        assignedModelName={draftConfiguredModel}
        assignedModelPath={draftConfiguredPath}
        onAssignModel={onLoaderStateChange
          ? (model) => {
            onLoaderStateChange({
              selected_model: model.name,
              selected_asset_name: model.name,
              selected_asset_path: model.filePath ?? null,
            })
          }
          : undefined}
      />
    </>
  )
}

// Export base component for testing
export { NAMCardBase as NAMCard }

// Export wrapped component with MIDI dialog
export default withMidiDialog(NAMCardBase, NAM_URI, NAM_PARAMS)
