import { useMemo, useState } from 'react'
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
import type { NAMModelsResponse, NAMStatus } from '../../../map2/types'
import { AssetUploadButton } from './AssetUploadButton'
import { useToasts } from '../Toasts'
import './ModelManagerDialogs.css'

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
}

export function NAMManagerDialog({ open, onClose, onLoadNAM }: Props) {
  const { pushToast } = useToasts()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [uploading, setUploading] = useState(false)

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
    queryKey: ['nam', 'status'],
    queryFn: () => namApi.getStatus(),
    enabled: open,
  })

  const loadMutation = useMutation({
    mutationFn: (name: string) => namApi.loadModel(name),
    onSuccess: (_, name) => {
      queryClient.invalidateQueries({ queryKey: ['nam'] })
      pushToast(`Loaded NAM model: ${name}`, 'success')
      onLoadNAM?.(name)
    },
    onError: () => pushToast('Failed to load NAM model', 'error'),
  })

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      setUploading(true)
      return namApi.upload(file)
    },
    onSuccess: async (data: { model?: { name?: string } }) => {
      queryClient.invalidateQueries({ queryKey: ['nam'] })
      const uploadedName = data.model?.name
      pushToast(`Uploaded: ${uploadedName || 'NAM model'}`, 'success')
      if (uploadedName) {
        try {
          await loadMutation.mutateAsync(uploadedName)
        } catch {
          // loadMutation surfaces its own error toast
        }
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
  const activeModel = statusQuery.data?.activeModel

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
            Active: {activeModel}
          </Tag>
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
                const isLoading = loadMutation.isPending && loadMutation.variables === model.name

                return (
                  <article key={model.id} className="model-manager-dialog__featured-item">
                    <p className="model-manager-dialog__featured-title">{model.amp_name || model.name}</p>
                    <p className="model-manager-dialog__featured-subtitle">{model.amp_type || 'NAM profile'}</p>
                    {isActive ? (
                      <Tag type="green" size="sm">
                        Active
                      </Tag>
                    ) : (
                      <Button
                        kind="tertiary"
                        size="sm"
                        onClick={() => loadMutation.mutate(model.name)}
                        disabled={isLoading || loadMutation.isPending}
                      >
                        {isLoading ? 'Loading...' : 'Load'}
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
                          <TableHeader>Size</TableHeader>
                          <TableHeader>Status</TableHeader>
                          <TableHeader>Action</TableHeader>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {typeModels.map((model) => {
                          const isActive = model.name === activeModel
                          const isLoading = loadMutation.isPending && loadMutation.variables === model.name
                          const sizeMb = model.size_mb ?? (model.size ? model.size / (1024 * 1024) : null)

                          return (
                            <TableRow key={model.name}>
                              <TableCell>{model.name}</TableCell>
                              <TableCell>{sizeMb ? `${sizeMb.toFixed(1)} MB` : '-'}</TableCell>
                              <TableCell>
                                {isActive ? (
                                  <Tag type="green" size="sm">
                                    Active
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
                                  onClick={() => loadMutation.mutate(model.name)}
                                  disabled={isActive || loadMutation.isPending}
                                >
                                  {isLoading ? 'Loading...' : 'Load'}
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
