import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, SpinnerGap, ArrowsClockwise, SpeakerHigh, UploadSimple, WaveSine, X } from '@phosphor-icons/react'
import { irApi } from '../../../map2/api'
import type { IRsResponse, IRStatus } from '../../../map2/types'
import { useToasts } from '../Toasts'
import { useIsMobile } from '../../hooks/useIsMobile'

export type IRType = 'cabinet' | 'reverb'

interface IRTypeConfig {
  title: string
  description: string
  searchPlaceholder: string
  emptyMessage: string
  loadingMessage: string
  defaultLabel: string
  icon: typeof SpeakerHigh
  iconColor: string
  listQueryFn: () => Promise<IRsResponse>
  loadFn: (name: string) => Promise<any>
  uploadFn: (file: File) => Promise<any>
  queryKey: string
  loadedKey: keyof IRStatus
}

const IR_CONFIGS: Record<IRType, IRTypeConfig> = {
  cabinet: {
    title: 'Cabinet Impulse Responses',
    description: 'Load speaker cabinet IRs for authentic amp-in-the-room tone.',
    searchPlaceholder: 'Search cabinets...',
    emptyMessage: 'No cabinet IRs found. Upload WAV files to get started.',
    loadingMessage: 'Loading cabinet IRs...',
    defaultLabel: 'Cabinet IR',
    icon: SpeakerHigh,
    iconColor: '#2563eb',
    listQueryFn: irApi.listCabinets,
    loadFn: irApi.loadCabinet,
    uploadFn: irApi.uploadCabinet,
    queryKey: 'cabinets',
    loadedKey: 'loaded_cabinet',
  },
  reverb: {
    title: 'Reverb Impulse Responses',
    description: 'Load reverb IRs for realistic room and space simulation.',
    searchPlaceholder: 'Search reverbs...',
    emptyMessage: 'No reverb IRs found. Upload WAV files to get started.',
    loadingMessage: 'Loading reverb IRs...',
    defaultLabel: 'Reverb IR',
    icon: WaveSine,
    iconColor: '#2196f3',
    listQueryFn: irApi.listReverbs,
    loadFn: irApi.loadReverb,
    uploadFn: irApi.uploadReverb,
    queryKey: 'reverbs',
    loadedKey: 'loaded_reverb',
  },
}

interface Props {
  type: IRType
  open: boolean
  onClose: () => void
  onLoad?: (irName: string) => void
}

export function IRManagerDialog({ type, open, onClose, onLoad }: Props) {
  const config = IR_CONFIGS[type]
  const Icon = config.icon
  const isMobile = useIsMobile()

  const { pushToast } = useToasts()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const [uploading, setUploading] = useState(false)

  const irsQuery = useQuery<IRsResponse>({
    queryKey: ['ir', config.queryKey],
    queryFn: config.listQueryFn,
    enabled: open,
  })

  const statusQuery = useQuery<IRStatus>({
    queryKey: ['ir', 'status'],
    queryFn: irApi.getStatus,
    enabled: open,
  })

  const loadMutation = useMutation({
    mutationFn: config.loadFn,
    onSuccess: (_, name) => {
      queryClient.invalidateQueries({ queryKey: ['ir'] })
      pushToast(`Loaded ${type} IR: ${name}`, 'success')
      onLoad?.(name)
    },
    onError: () => pushToast(`Failed to load ${type} IR`, 'error'),
  })

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      setUploading(true)
      return config.uploadFn(file)
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ir'] })
      pushToast(`Uploaded: ${data.filename}`, 'success')
    },
    onError: () => pushToast(`Failed to upload ${type} IR`, 'error'),
    onSettled: () => setUploading(false),
  })

  const irs = irsQuery.data?.irs ?? []
  const loadedIR = statusQuery.data?.[config.loadedKey] as string | undefined

  const filteredIRs = irs.filter((ir) =>
    ir.name.toLowerCase().includes(search.toLowerCase())
  )

  const handleRefresh = () => {
    irsQuery.refetch()
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
        alignItems: isMobile ? 'stretch' : 'center',
        justifyContent: isMobile ? 'stretch' : 'center',
        zIndex: 1000,
      }}
    >
      <div
        className="dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: isMobile ? '100vw' : 'min(600px, 90vw)',
          maxHeight: isMobile ? '100vh' : undefined,
          minHeight: isMobile ? '100vh' : undefined,
          borderRadius: isMobile ? 0 : undefined,
        }}
      >
        <div className="flex-between" style={{ marginBottom: 8 }}>
          <div className="flex" style={{ gap: 10, alignItems: 'center' }}>
            <Icon size={20} style={{ color: config.iconColor }} />
            <h3 style={{ margin: 0 }}>{config.title}</h3>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            <X size={18} weight="bold" />
          </button>
        </div>

        <p style={{ margin: '8px 0 16px' }}>{config.description}</p>

        <div className="flex-between" style={{ marginBottom: 12 }}>
          <input
            type="text"
            className="input"
            placeholder={config.searchPlaceholder}
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
              <UploadSimple size={16} weight="duotone" />
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleRefresh}
              disabled={irsQuery.isFetching}
            >
              <ArrowsClockwise size={16} weight="duotone" className={irsQuery.isFetching ? 'spin' : ''} />
            </button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".wav"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        {loadedIR && (
          <div className="flex" style={{ marginBottom: 12 }}>
            <span className="pill success">
              <Check size={14} weight="bold" />
              Active: {loadedIR}
            </span>
          </div>
        )}

        {irsQuery.isLoading ? (
          <div className="flex" style={{ padding: 16, justifyContent: 'center' }}>
            <SpinnerGap className="spin" size={20} weight="duotone" />
            <span className="muted">{config.loadingMessage}</span>
          </div>
        ) : irsQuery.error ? (
          <div className="pill warn">Failed to load {type} IRs</div>
        ) : filteredIRs.length === 0 ? (
          <div className="list-item muted">{config.emptyMessage}</div>
        ) : (
          <div className="model-list" style={{ maxHeight: 350 }}>
            {filteredIRs.map((ir) => {
              const isActive = ir.name === loadedIR
              const isLoading =
                loadMutation.isPending && loadMutation.variables === ir.name
              return (
                <div
                  key={ir.name}
                  className={`model-item ${isActive ? 'active' : ''}`}
                >
                  <div className="model-item-info">
                    <div className="model-item-name">{ir.name}</div>
                    <div className="model-item-meta">
                      {ir.duration
                        ? `${(ir.duration * 1000).toFixed(0)}ms`
                        : ir.size
                          ? `${(ir.size / 1024).toFixed(0)} KB`
                          : config.defaultLabel}
                      {ir.sample_rate && ` @ ${ir.sample_rate / 1000}kHz`}
                    </div>
                  </div>
                  {isActive ? (
                    <span className="pill success" style={{ padding: '4px 8px' }}>
                      <Check size={12} weight="bold" />
                      Active
                    </span>
                  ) : (
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => loadMutation.mutate(ir.name)}
                      disabled={loadMutation.isPending}
                    >
                      {isLoading ? (
                        <SpinnerGap className="spin" size={14} weight="duotone" />
                      ) : (
                        'Load'
                      )}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="divider" />

        <div className="flex-between">
          <span className="muted" style={{ fontSize: 12 }}>
            Supported: WAV files (44.1/48kHz)
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

// Convenience wrapper components for backwards compatibility
export function CabinetIRManagerDialog({
  open,
  onClose,
  onLoadCabinetIR,
}: {
  open: boolean
  onClose: () => void
  onLoadCabinetIR?: (irName: string) => void
}) {
  return (
    <IRManagerDialog
      type="cabinet"
      open={open}
      onClose={onClose}
      onLoad={onLoadCabinetIR}
    />
  )
}

export function ReverbIRManagerDialog({
  open,
  onClose,
  onLoadReverbIR,
}: {
  open: boolean
  onClose: () => void
  onLoadReverbIR?: (irName: string) => void
}) {
  return (
    <IRManagerDialog
      type="reverb"
      open={open}
      onClose={onClose}
      onLoad={onLoadReverbIR}
    />
  )
}
