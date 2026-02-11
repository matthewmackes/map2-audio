import { useCallback, useMemo, useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  UploadSimple,
  X,
  Lightning,
  SpeakerHigh,
  WaveSine,
  PuzzlePiece,
  FileAudio,
  CheckCircle,
  WarningCircle,
  SpinnerGap,
  FolderOpen,
  Trash,
} from '@phosphor-icons/react'
import { uploadApi } from '../../../map2/api'
import { useToasts } from '../Toasts'

export type AssetType = 'nam' | 'cabinet_ir' | 'reverb_ir' | 'vst3'

interface UploadFile {
  id: string
  file: File
  name: string
  size: number
  type: AssetType | null
  status: 'pending' | 'uploading' | 'success' | 'error'
  progress: number
  error?: string
  requiresTypeSelection?: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  defaultAssetType?: AssetType
  onUploadComplete?: (count: number) => void
}

// Asset type configurations
const ASSET_CONFIGS: Record<
  AssetType,
  {
    name: string
    icon: typeof Lightning
    color: string
    extensions: string[]
    description: string
  }
> = {
  nam: {
    name: 'NAM Model',
    icon: Lightning,
    color: '#f6c452',
    extensions: ['.nam'],
    description: 'Neural amp/pedal models',
  },
  cabinet_ir: {
    name: 'Cabinet IR',
    icon: SpeakerHigh,
    color: '#37d6c9',
    extensions: ['.wav', '.aif', '.aiff', '.flac'],
    description: 'Speaker cabinet IRs',
  },
  reverb_ir: {
    name: 'Reverb IR',
    icon: WaveSine,
    color: '#2196f3',
    extensions: ['.wav', '.aif', '.aiff', '.flac'],
    description: 'Reverb/room IRs',
  },
  vst3: {
    name: 'VST3 Plugin',
    icon: PuzzlePiece,
    color: '#a855f7',
    extensions: ['.vst3', '.zip'],
    description: 'VST3 plugin bundles',
  },
}

const AUDIO_EXTENSIONS = new Set(['.wav', '.aif', '.aiff', '.flac'])

function detectAssetType(filename: string): { type: AssetType | null; needsSelection: boolean } {
  const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase()

  if (ext === '.nam') return { type: 'nam', needsSelection: false }
  if (ext === '.vst3' || (ext === '.zip' && filename.toLowerCase().includes('vst3'))) {
    return { type: 'vst3', needsSelection: false }
  }
  if (ext === '.zip') return { type: 'vst3', needsSelection: false }
  if (AUDIO_EXTENSIONS.has(ext)) {
    // Audio files require user selection
    return { type: null, needsSelection: true }
  }
  return { type: null, needsSelection: false }
}

export function UnifiedUploadDialog({
  open,
  onClose,
  defaultAssetType,
  onUploadComplete,
}: Props) {
  const { pushToast } = useToasts()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  const [files, setFiles] = useState<UploadFile[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [selectedType, setSelectedType] = useState<AssetType | 'auto'>(
    defaultAssetType || 'auto'
  )

  // Generate unique ID
  const generateId = () => crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)

  // Add files to queue
  const addFiles = useCallback(
    (newFiles: FileList | File[]) => {
      const fileArray = Array.from(newFiles)
      const uploadFiles: UploadFile[] = fileArray.map((file) => {
        const detection = detectAssetType(file.name)
        let finalType = detection.type

        // If user selected specific type, use it
        if (selectedType !== 'auto') {
          finalType = selectedType
        }

        return {
          id: generateId(),
          file,
          name: file.name,
          size: file.size,
          type: finalType,
          status: 'pending' as const,
          progress: 0,
          requiresTypeSelection: detection.needsSelection && selectedType === 'auto',
        }
      })

      setFiles((prev) => [...prev, ...uploadFiles])
    },
    [selectedType]
  )

  // Handle file input change
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      addFiles(e.target.files)
    }
    e.target.value = ''
  }

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      if (e.dataTransfer.files?.length) {
        addFiles(e.dataTransfer.files)
      }
    },
    [addFiles]
  )

  // Remove file from queue
  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  // Update file type
  const updateFileType = (id: string, type: AssetType) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, type, requiresTypeSelection: false } : f
      )
    )
  }

  // Upload single file
  const uploadFile = async (uploadFile: UploadFile) => {
    if (!uploadFile.type) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id
            ? { ...f, status: 'error', error: 'Please select file type' }
            : f
        )
      )
      return
    }

    // Set uploading status
    setFiles((prev) =>
      prev.map((f) =>
        f.id === uploadFile.id ? { ...f, status: 'uploading', progress: 0 } : f
      )
    )

    try {
      const result = await uploadApi.upload(uploadFile.file, uploadFile.type, (progress) => {
        setFiles((prev) =>
          prev.map((f) => (f.id === uploadFile.id ? { ...f, progress } : f))
        )
      })

      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id
            ? { ...f, status: 'success', progress: 100 }
            : f
        )
      )

      // Invalidate relevant queries
      if (uploadFile.type === 'nam') {
        queryClient.invalidateQueries({ queryKey: ['nam'] })
      } else if (uploadFile.type === 'cabinet_ir' || uploadFile.type === 'reverb_ir') {
        queryClient.invalidateQueries({ queryKey: ['ir'] })
      } else if (uploadFile.type === 'vst3') {
        queryClient.invalidateQueries({ queryKey: ['vst3'] })
        queryClient.invalidateQueries({ queryKey: ['plugins'] })
      }
    } catch (error) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id
            ? {
                ...f,
                status: 'error',
                error: error instanceof Error ? error.message : 'Upload failed',
              }
            : f
        )
      )
    }
  }

  // Upload all pending files
  const uploadAll = async () => {
    const pending = files.filter((f) => f.status === 'pending' && f.type)
    const needsType = files.filter((f) => f.status === 'pending' && !f.type)

    if (needsType.length > 0) {
      pushToast('Please select type for audio files', 'warn')
      return
    }

    for (const file of pending) {
      await uploadFile(file)
    }

    const successCount = files.filter((f) => f.status === 'success').length + pending.length
    if (successCount > 0) {
      pushToast(`Uploaded ${successCount} file(s)`, 'success')
      onUploadComplete?.(successCount)
    }
  }

  // Clear completed
  const clearCompleted = () => {
    setFiles((prev) => prev.filter((f) => f.status !== 'success'))
  }

  // Compute stats
  const stats = useMemo(
    () => ({
      total: files.length,
      pending: files.filter((f) => f.status === 'pending').length,
      uploading: files.filter((f) => f.status === 'uploading').length,
      success: files.filter((f) => f.status === 'success').length,
      error: files.filter((f) => f.status === 'error').length,
      needsType: files.filter((f) => f.status === 'pending' && !f.type).length,
    }),
    [files]
  )

  // Accept string for file input
  const acceptExtensions = useMemo(() => {
    if (selectedType === 'auto') {
      return Object.values(ASSET_CONFIGS)
        .flatMap((c) => c.extensions)
        .join(',')
    }
    return ASSET_CONFIGS[selectedType].extensions.join(',')
  }, [selectedType])

  // Keyboard handling
  useEffect(() => {
    if (!open) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open, onClose])

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setFiles([])
      setSelectedType(defaultAssetType || 'auto')
    }
  }, [open, defaultAssetType])

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
        style={{
          width: 'min(700px, 95vw)',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div className="flex-between" style={{ marginBottom: 12 }}>
          <div className="flex" style={{ gap: 10, alignItems: 'center' }}>
            <UploadSimple size={22} weight="duotone" style={{ color: 'var(--primary)' }} />
            <h3 style={{ margin: 0 }}>Upload Audio Assets</h3>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            <X size={18} weight="bold" />
          </button>
        </div>

        <p style={{ margin: '0 0 16px', color: 'var(--muted)' }}>
          Drag & drop files or click to browse. Supports NAM models, IRs, and VST3 plugins.
        </p>

        {/* Asset Type Filter */}
        <div className="flex" style={{ gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          <button
            className={`btn btn-sm ${selectedType === 'auto' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setSelectedType('auto')}
          >
            Auto-detect
          </button>
          {(Object.keys(ASSET_CONFIGS) as AssetType[]).map((type) => {
            const config = ASSET_CONFIGS[type]
            const Icon = config.icon
            return (
              <button
                key={type}
                className={`btn btn-sm ${selectedType === type ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setSelectedType(type)}
                style={{
                  borderColor: selectedType === type ? config.color : undefined,
                }}
              >
                <Icon size={14} style={{ color: config.color }} />
                {config.name}
              </button>
            )
          })}
        </div>

        {/* Drop Zone */}
        <div
          ref={dropZoneRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`upload-dropzone ${isDragOver ? 'drag-over' : ''}`}
          style={{
            border: `2px dashed ${isDragOver ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: 12,
            padding: 32,
            textAlign: 'center',
            cursor: 'pointer',
            background: isDragOver ? 'rgba(37, 99, 235, 0.05)' : 'transparent',
            transition: 'all 0.2s ease',
            marginBottom: 16,
          }}
        >
          <FolderOpen size={40} weight="duotone" style={{ color: 'var(--muted)', marginBottom: 12 }} />
          <p style={{ margin: '0 0 8px', fontWeight: 500 }}>
            {isDragOver ? 'Drop files here...' : 'Drag & drop files here'}
          </p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
            or click to browse
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={acceptExtensions}
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        {/* File List */}
        {files.length > 0 && (
          <div style={{ flex: 1, overflow: 'auto', marginBottom: 16 }}>
            <div className="flex-between" style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                {stats.total} file(s) - {stats.pending} pending, {stats.success} complete
                {stats.needsType > 0 && (
                  <span style={{ color: 'var(--warning)' }}>
                    {' '}({stats.needsType} need type selection)
                  </span>
                )}
              </span>
              {stats.success > 0 && (
                <button className="btn btn-ghost btn-sm" onClick={clearCompleted}>
                  Clear completed
                </button>
              )}
            </div>

            <div className="model-list" style={{ maxHeight: 250 }}>
              {files.map((file) => {
                const config = file.type ? ASSET_CONFIGS[file.type] : null
                const Icon = config?.icon || FileAudio

                return (
                  <div
                    key={file.id}
                    className={`model-item upload-file-item ${file.status}`}
                    style={{ flexDirection: 'column', gap: 8 }}
                  >
                    <div className="flex-between" style={{ width: '100%' }}>
                      <div className="flex" style={{ gap: 10, flex: 1, minWidth: 0 }}>
                        <Icon
                          size={18}
                          style={{ color: config?.color || 'var(--muted)', flexShrink: 0 }}
                        />
                        <div style={{ minWidth: 0 }}>
                          <div className="model-item-name">{file.name}</div>
                          <div className="model-item-meta">
                            {(file.size / 1024 / 1024).toFixed(2)} MB
                            {config && ` • ${config.name}`}
                          </div>
                        </div>
                      </div>

                      <div className="flex" style={{ gap: 8 }}>
                        {/* Type selector for audio files */}
                        {file.requiresTypeSelection && file.status === 'pending' && (
                          <select
                            value={file.type || ''}
                            onChange={(e) =>
                              updateFileType(file.id, e.target.value as AssetType)
                            }
                            className="combobox"
                            style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }}
                          >
                            <option value="">Select type...</option>
                            <option value="cabinet_ir">Cabinet IR</option>
                            <option value="reverb_ir">Reverb IR</option>
                          </select>
                        )}

                        {/* Status indicators */}
                        {file.status === 'success' && (
                          <CheckCircle size={18} weight="duotone" style={{ color: 'var(--success)' }} />
                        )}
                        {file.status === 'error' && (
                          <WarningCircle size={18} weight="duotone" style={{ color: 'var(--danger)' }} />
                        )}
                        {file.status === 'uploading' && (
                          <SpinnerGap size={18} weight="duotone" className="spin" style={{ color: 'var(--primary)' }} />
                        )}

                        {/* Remove button */}
                        {file.status !== 'uploading' && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => removeFile(file.id)}
                            style={{ padding: 4 }}
                          >
                            <Trash size={14} weight="duotone" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Progress bar */}
                    {file.status === 'uploading' && (
                      <div className="upload-progress" style={{ width: '100%' }}>
                        <div
                          className="upload-progress-bar"
                          style={{ width: `${file.progress}%` }}
                        />
                      </div>
                    )}

                    {/* Error message */}
                    {file.status === 'error' && file.error && (
                      <div style={{ fontSize: 12, color: 'var(--danger)' }}>
                        {file.error}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="divider" />
        <div className="flex-between">
          <span className="muted" style={{ fontSize: 12 }}>
            Supported: .nam, .wav, .aif, .aiff, .flac, .vst3, .zip
          </span>
          <div className="flex" style={{ gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose}>
              Close
            </button>
            {stats.pending > 0 && (
              <button
                className="btn btn-primary"
                onClick={uploadAll}
                disabled={stats.uploading > 0 || stats.needsType > 0}
              >
                {stats.uploading > 0 ? (
                  <>
                    <SpinnerGap size={16} weight="duotone" className="spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <UploadSimple size={16} weight="duotone" />
                    Upload {stats.pending} file(s)
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
