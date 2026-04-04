import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  InlineLoading,
  InlineNotification,
  Modal,
  Search,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
} from '@carbon/react'
import { MachineLearningModel, Renew, StarFilled } from '@carbon/icons-react'
import { namApi } from '../../../map2/api'
import { ApiError } from '../../../map2/http'
import type { NAMModelsResponse, NAMStatus } from '../../../map2/types'
import { getPluginIdentityKeyFromParts } from '../../../map2/utils/pluginIdentity'
import { AssetUploadButton } from './AssetUploadButton'
import { useToasts } from '../Toasts'
import './ModelManagerDialogs.css'

const NAM_PLUGIN_URI = 'map2://juce/nam'

interface FeaturedModel {
  id: string | number
  name: string
  amp_name?: string
  amp_type?: string
}

interface FeaturedModelsResponse {
  models?: FeaturedModel[]
}

interface Props {
  open: boolean
  onClose: () => void
  onLoadNAM?: (modelName: string) => void
  instanceId?: number
  pluginPosition?: number
  assignedModelName?: string | null
  assignedModelPath?: string | null
  onAssignModel?: (model: { name: string; filePath?: string | null }) => void
}

interface NAMModelListItem {
  name: string
  type?: string
  size_mb?: number
  file_path?: string
  path?: string
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const detail =
      typeof error.body === 'object' && error.body !== null && 'detail' in error.body
        ? (error.body as { detail?: unknown }).detail
        : undefined
    if (typeof detail === 'string' && detail.trim().length > 0) {
      return detail
    }
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }
  return fallback
}

function resolveModelPath(model: Pick<NAMModelListItem, 'file_path' | 'path'>): string | null {
  return model.file_path ?? model.path ?? null
}

function isDraftOnlyFallbackError(error: unknown): boolean {
  const message = getErrorMessage(error, '')
  return message.includes('Multiple active NAM loaders are configured without live runtime identity')
    || message.includes('Configured NAM block is not active in the live runtime')
}

export function NAMManagerDialog({
  open,
  onClose,
  onLoadNAM,
  instanceId,
  pluginPosition,
  assignedModelName,
  assignedModelPath,
  onAssignModel,
}: Props) {
  const { pushToast } = useToasts()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [uploading, setUploading] = useState(false)
  const resolvedInstanceId = typeof instanceId === 'number' && instanceId > 0 ? instanceId : undefined
  const resolvedPluginPosition = typeof pluginPosition === 'number' && pluginPosition >= 0 ? pluginPosition : undefined
  const statusScopeKey = getPluginIdentityKeyFromParts(NAM_PLUGIN_URI, resolvedPluginPosition, resolvedInstanceId)
  const statusQueryKey = ['nam', 'status', statusScopeKey] as const

  const modelsQuery = useQuery<NAMModelsResponse>({
    queryKey: ['nam', 'models'],
    queryFn: () => namApi.listModels(),
    enabled: open,
  })

  const featuredQuery = useQuery<FeaturedModelsResponse>({
    queryKey: ['nam', 'featured'],
    queryFn: async () => {
      const response = await fetch('/api/nam/featured')
      if (!response.ok) {
        throw new Error('Failed to fetch featured models')
      }
      return response.json() as Promise<FeaturedModelsResponse>
    },
    enabled: open,
  })

  const statusQuery = useQuery<NAMStatus>({
    queryKey: statusQueryKey,
    queryFn: () => (
      resolvedInstanceId !== undefined || resolvedPluginPosition !== undefined
        ? namApi.getScopedStatus({
          instanceId: resolvedInstanceId,
          pluginPosition: resolvedPluginPosition,
        })
          : namApi.getStatus()
    ),
    enabled: open,
  })

  const activeModel = statusQuery.data?.activeModel
  const configuredModel = statusQuery.data?.configuredModel ?? assignedModelName
  const runtimeWarning = statusQuery.data?.runtimeWarning
  const scopedRuntimeUnavailable = Boolean(
    (resolvedInstanceId !== undefined || resolvedPluginPosition !== undefined)
      && runtimeWarning
      && !activeModel,
  )

  const loadMutation = useMutation({
    mutationFn: async ({ name, allowDraftOnly }: { name: string; allowDraftOnly: boolean }) => {
      try {
        return {
          draftOnly: false,
          response: await (
            resolvedInstanceId !== undefined || resolvedPluginPosition !== undefined
              ? namApi.loadModelScoped(name, {
                instanceId: resolvedInstanceId,
                pluginPosition: resolvedPluginPosition,
              })
              : namApi.loadModel(name)
          ),
        }
      } catch (error) {
        if (allowDraftOnly && isDraftOnlyFallbackError(error)) {
          return { draftOnly: true, response: null }
        }
        throw error
      }
    },
    onSuccess: ({ draftOnly }, { name }) => {
      void queryClient.invalidateQueries({ queryKey: statusQueryKey })
      if (draftOnly) {
        pushToast(`Stored NAM model: ${name}. It will load when this block is active in the live runtime.`, 'info')
      } else {
        pushToast(`Loaded NAM model: ${name}`, 'success')
      }
      onLoadNAM?.(name)
    },
    onError: (error) => pushToast(getErrorMessage(error, 'Failed to load NAM model'), 'error'),
  })

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      setUploading(true)
      return namApi.upload(file)
    },
    onSuccess: async (data: { model?: { name?: string; file_path?: string | null } }) => {
      await queryClient.invalidateQueries({ queryKey: ['nam', 'models'] })
      await queryClient.invalidateQueries({ queryKey: statusQueryKey })
      const uploadedName = data.model?.name
      const uploadedPath = data.model?.file_path ?? assignedModelPath
      if (uploadedName && onAssignModel) {
        onAssignModel({ name: uploadedName, filePath: uploadedPath ?? null })
      }
      pushToast(`Uploaded: ${uploadedName || 'NAM model'}`, 'success')
      if (uploadedName && !scopedRuntimeUnavailable) {
        try {
          await loadMutation.mutateAsync({
            name: uploadedName,
            allowDraftOnly: Boolean(onAssignModel),
          })
        } catch {
          // loadMutation surfaces its own error toast
        }
      } else if (uploadedName && scopedRuntimeUnavailable) {
        pushToast(
          onAssignModel
            ? 'Selected block is not active in the live runtime; the uploaded model was stored in this snapshot draft.'
            : 'Selected block is not active in the live runtime; uploaded model was added to the library only.',
          onAssignModel ? 'info' : 'warn',
        )
        onLoadNAM?.(uploadedName)
      }
    },
    onError: () => pushToast('Failed to upload NAM model', 'error'),
    onSettled: () => setUploading(false),
  })

  const models = useMemo(
    () =>
      (modelsQuery.data?.models ?? []).map((model) => ({
        ...model,
        type:
          'type' in model && typeof model.type === 'string'
            ? model.type
            : (model as { model_type?: string }).model_type || 'unknown',
      })),
    [modelsQuery.data?.models],
  )
  const featured = featuredQuery.data?.models ?? []
  const normalizedSearch = search.trim().toLowerCase()

  const modelsByType = useMemo(() => {
    const groups: Record<string, typeof models> = {
      amp: [],
      pedal: [],
      preamp: [],
      unknown: [],
    }

    const filtered = models.filter((model) => model.name.toLowerCase().includes(normalizedSearch))
    for (const model of filtered) {
      const type = model.type || 'unknown'
      if (groups[type]) {
        groups[type].push(model)
      } else {
        groups.unknown.push(model)
      }
    }

    return groups
  }, [models, normalizedSearch])

  const handleRefresh = () => {
    void modelsQuery.refetch()
    void statusQuery.refetch()
    void featuredQuery.refetch()
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      uploadMutation.mutate(file)
    }
    event.target.value = ''
  }

  const typeLabels: Record<string, string> = {
    amp: 'Amplifiers',
    pedal: 'Pedals and drives',
    preamp: 'Preamps',
    unknown: 'Other models',
  }

  const handleModelAction = useCallback(async (model: NAMModelListItem) => {
    const modelPath = resolveModelPath(model)
    if (onAssignModel) {
      onAssignModel({ name: model.name, filePath: modelPath })
    }
    if (scopedRuntimeUnavailable) {
      pushToast(
        `Stored NAM model: ${model.name}. It will load when this block is active in the live runtime.`,
        'info',
      )
      onLoadNAM?.(model.name)
      return
    }
    loadMutation.mutate({
      name: model.name,
      allowDraftOnly: Boolean(onAssignModel),
    })
  }, [loadMutation, onAssignModel, onLoadNAM, pushToast, scopedRuntimeUnavailable])

  return (
    <Modal
      open={open}
      size="lg"
      modalHeading="Neural amp modeler"
      modalLabel="Model library"
      primaryButtonText="Close"
      secondaryButtonText="Refresh"
      onRequestClose={onClose}
      onRequestSubmit={onClose}
      onSecondarySubmit={handleRefresh}
      selectorPrimaryFocus="#nam-manager-search"
    >
      <div className="model-manager-dialog">
        <div className="model-manager-dialog__header">
          <div className="model-manager-dialog__title-row">
            <MachineLearningModel size={20} aria-hidden="true" />
            <p>Load machine-learning amp and pedal models for authentic tone.</p>
          </div>
          <div className="model-manager-dialog__toolbar">
            <Search
              id="nam-manager-search"
              labelText="Search"
              placeholder="Search models"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              size="md"
            />
            <AssetUploadButton
              kind="ghost"
              size="md"
              ariaLabel="Upload NAM model file"
              label={uploading ? 'Uploading...' : 'Upload .nam'}
              accept={['.nam']}
              onChange={handleFileChange}
              disabled={uploading}
            />
            <Button
              kind="ghost"
              size="md"
              hasIconOnly
              iconDescription="Refresh model list"
              renderIcon={Renew}
              onClick={handleRefresh}
              disabled={modelsQuery.isFetching}
            />
          </div>
        </div>
        {activeModel && (
          <Tag type="green" title="Active NAM model" size="md">
            Live: {activeModel}
          </Tag>
        )}
        {configuredModel && (
          <Tag type={configuredModel === activeModel ? 'cool-gray' : 'warm-gray'} title="Configured NAM model" size="md">
            Configured: {configuredModel}
          </Tag>
        )}
        {runtimeWarning && (
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title="Runtime warning"
            subtitle={runtimeWarning}
          />
        )}
        {scopedRuntimeUnavailable && (
          <InlineNotification
            kind={onAssignModel ? 'info' : 'warning'}
            lowContrast
            hideCloseButton
            title={onAssignModel ? 'Runtime load unavailable' : 'Load unavailable'}
            subtitle={
              onAssignModel
                ? 'This selected block is not active in the live runtime right now. Choosing a model will store it in the snapshot draft and apply it when the block goes live.'
                : 'This selected block is configured but not active in the live runtime, so scoped model loads are disabled.'
            }
          />
        )}

        {!normalizedSearch && featured.length > 0 && (
          <section className="model-manager-dialog__featured">
            <h4>
              <StarFilled size={16} aria-hidden="true" />
              Featured models
            </h4>
            <div className="model-manager-dialog__featured-grid">
              {featured.slice(0, 12).map((model) => {
                const isActive = model.name === activeModel
                const isConfigured = model.name === configuredModel
                const isLoading = loadMutation.isPending && loadMutation.variables?.name === model.name

                return (
                  <article key={model.id} className="model-manager-dialog__featured-item">
                    <p className="model-manager-dialog__featured-title">{model.amp_name || model.name}</p>
                    <p className="model-manager-dialog__featured-subtitle">{model.amp_type || 'NAM profile'}</p>
                    {isActive ? (
                      <Tag type="green" size="sm">
                        Live
                      </Tag>
                    ) : isConfigured ? (
                      <Tag type="warm-gray" size="sm">
                        Configured
                      </Tag>
                    ) : (
                      <Button
                        kind="tertiary"
                        size="sm"
                        onClick={() => { void handleModelAction(model) }}
                        disabled={isLoading || loadMutation.isPending || (scopedRuntimeUnavailable && !onAssignModel)}
                      >
                        {scopedRuntimeUnavailable && onAssignModel ? 'Assign' : isLoading ? 'Loading...' : scopedRuntimeUnavailable ? 'Unavailable' : 'Load'}
                      </Button>
                    )}
                  </article>
                )
              })}
            </div>
          </section>
        )}

        {modelsQuery.isLoading ? (
          <InlineLoading description="Loading models" status="active" />
        ) : modelsQuery.isError ? (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title="Unable to load NAM models"
            subtitle="The NAM model query failed. Refresh and try again."
          />
        ) : models.length === 0 ? (
          <p className="model-manager-dialog__empty">No NAM models found. Upload .nam files to get started.</p>
        ) : (
          <div className="model-manager-dialog__type-sections">
            {Object.entries(modelsByType).map(([type, typeModels]) => {
              if (typeModels.length === 0) {
                return null
              }

              return (
                <section key={type} className="model-manager-dialog__type-section">
                  <h5>{typeLabels[type]} ({typeModels.length})</h5>
                  <TableContainer className="model-manager-dialog__table-wrap">
                    <Table size="sm" useZebraStyles={false}>
                      <TableHead>
                        <TableRow>
                          <TableHeader>Name</TableHeader>
                          <TableHeader>Type</TableHeader>
                          <TableHeader>Size</TableHeader>
                          <TableHeader>Status</TableHeader>
                          <TableHeader>Action</TableHeader>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {typeModels.map((model) => {
                          const isActive = model.name === activeModel
                          const isConfigured = model.name === configuredModel
                          const isLoading = loadMutation.isPending && loadMutation.variables?.name === model.name
                          const sizeMb = model.size_mb ?? (model.size ? model.size / (1024 * 1024) : null)

                          return (
                            <TableRow key={model.name}>
                              <TableCell>{model.name}</TableCell>
                              <TableCell>{model.type || 'unknown'}</TableCell>
                              <TableCell>{sizeMb ? `${sizeMb.toFixed(1)} MB` : '-'}</TableCell>
                              <TableCell>
                                {isActive ? (
                                  <Tag type="green" size="sm">
                                    Live
                                  </Tag>
                                ) : isConfigured ? (
                                  <Tag type="warm-gray" size="sm">
                                    Configured
                                  </Tag>
                                ) : (
                                  <Tag type="cool-gray" size="sm">
                                    Available
                                  </Tag>
                                )}
                              </TableCell>
                              <TableCell>
                                <Button
                                  kind="tertiary"
                                  size="sm"
                                  onClick={() => { void handleModelAction(model) }}
                                  disabled={isActive || loadMutation.isPending || (scopedRuntimeUnavailable && !onAssignModel)}
                                >
                                  {scopedRuntimeUnavailable && onAssignModel ? 'Assign' : isLoading ? 'Loading...' : scopedRuntimeUnavailable ? 'Unavailable' : 'Load'}
                                </Button>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </section>
              )
            })}
          </div>
        )}

        <p className="model-manager-dialog__support-note">Supported format: NAM model files (.nam).</p>
      </div>
    </Modal>
  )
}
