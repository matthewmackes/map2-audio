import { useMemo, useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, RefreshCw, Zap, X, Upload } from 'lucide-react'
import { namApi } from '../../../map2/api'
import type { NAMModelsResponse, NAMStatus } from '../../../map2/types'
import { useToasts } from '../Toasts'

interface Props {
  open: boolean
  onClose: () => void
  onLoadNAM?: (modelName: string) => void
}

export function NAMManagerDialog({ open, onClose, onLoadNAM }: Props) {
  const { pushToast } = useToasts()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const [uploading, setUploading] = useState(false)

  const modelsQuery = useQuery<NAMModelsResponse>({
    queryKey: ['nam', 'models'],
    queryFn: () => namApi.listModels(),
    enabled: open,
  })

  const statusQuery = useQuery<NAMStatus>({
    queryKey: ['nam', 'status'],
    queryFn: namApi.getStatus,
    enabled: open,
  })

  // Simplified: loadModel now also activates on the backend
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['nam'] })
      pushToast(`Uploaded: ${data.model.name}`, 'success')
    },
    onError: () => pushToast('Failed to upload NAM model', 'error'),
    onSettled: () => setUploading(false),
  })

  const models = modelsQuery.data?.models ?? []
  const activeModel = statusQuery.data?.activeModel

  const modelsByType = useMemo(() => {
    const groups: Record<string, typeof models> = {
      amp: [],
      pedal: [],
      preamp: [],
      unknown: [],
    }
    const filtered = models.filter((m) =>
      m.name.toLowerCase().includes(search.toLowerCase())
    )
    filtered.forEach((model) => {
      const type = model.type || 'unknown'
      if (groups[type]) {
        groups[type].push(model)
      } else {
        groups.unknown.push(model)
      }
    })
    return groups
  }, [models, search])

  const handleRefresh = () => {
    modelsQuery.refetch()
    statusQuery.refetch()
  }

  const handleUpload = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      uploadMutation.mutate(file)
    }
    e.target.value = ''
  }

  const typeLabels: Record<string, string> = {
    amp: 'Amplifiers',
    pedal: 'Pedals & Drives',
    preamp: 'Preamps',
    unknown: 'Other Models',
  }

  useEffect(() => {
    if (!open) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="dialog-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        className="dialog"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(600px, 90vw)' }}
      >
        <div className="flex-between" style={{ marginBottom: 8 }}>
          <div className="flex" style={{ gap: 10, alignItems: 'center' }}>
            <Zap size={20} style={{ color: '#f6c452' }} />
            <h3 style={{ margin: 0 }}>Neural Amp Modeler</h3>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <p style={{ margin: '8px 0 16px' }}>
          Load machine-learning amp and pedal models for authentic tone.
        </p>

        <div className="flex-between" style={{ marginBottom: 12 }}>
          <input
            type="text"
            className="input"
            placeholder="Search models..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1 }}
          />
          <div className="flex" style={{ gap: 8 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleUpload}
              disabled={uploading}
            >
              <Upload size={16} />
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleRefresh}
              disabled={modelsQuery.isFetching}
            >
              <RefreshCw size={16} className={modelsQuery.isFetching ? 'spin' : ''} />
            </button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".nam"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        {activeModel && (
          <div className="flex" style={{ marginBottom: 12 }}>
            <span className="pill success">
              <Check size={14} />
              Active: {activeModel}
            </span>
          </div>
        )}

        {modelsQuery.isLoading ? (
          <div className="flex" style={{ padding: 16, justifyContent: 'center' }}>
            <Loader2 className="spin" size={20} />
            <span className="muted">Loading models...</span>
          </div>
        ) : modelsQuery.error ? (
          <div className="pill warn">Failed to load models</div>
        ) : models.length === 0 ? (
          <div className="list-item muted">
            No NAM models found. Upload .nam files or download from the Library.
          </div>
        ) : (
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {Object.entries(modelsByType).map(([type, typeModels]) =>
              typeModels.length > 0 ? (
                <div key={type} className="model-type-section">
                  <div className="model-type-header">
                    {typeLabels[type]} ({typeModels.length})
                  </div>
                  <div className="model-list">
                    {typeModels.map((model) => {
                      const isActive = model.name === activeModel
                      const isLoading =
                        loadMutation.isPending &&
                        loadMutation.variables === model.name
                      return (
                        <div
                          key={model.name}
                          className={`model-item ${isActive ? 'active' : ''}`}
                        >
                          <div className="model-item-info">
                            <div className="model-item-name">{model.name}</div>
                            {(model.size_mb || model.size) && (
                              <div className="model-item-meta">
                                {model.size_mb
                                  ? model.size_mb.toFixed(1)
                                  : (model.size! / 1024 / 1024).toFixed(1)} MB
                              </div>
                            )}
                          </div>
                          {isActive ? (
                            <span className="pill success" style={{ padding: '4px 8px' }}>
                              <Check size={12} />
                              Active
                            </span>
                          ) : (
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => loadMutation.mutate(model.name)}
                              disabled={loadMutation.isPending}
                            >
                              {isLoading ? (
                                <Loader2 className="spin" size={14} />
                              ) : (
                                'Load'
                              )}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : null
            )}
          </div>
        )}

        <div className="divider" />

        <div className="flex-between">
          <span className="muted" style={{ fontSize: 12 }}>
            Supported: NAM model files (.nam)
          </span>
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
