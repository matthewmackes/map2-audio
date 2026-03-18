import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckmarkFilled as Check, Renew as SpinnerGap } from '@carbon/icons-react'
import { irApi } from '../../../map2/api'

interface IRItemCardProps {
  ir: {
    name: string
    path: string
    type: 'cabinet' | 'reverb'
    size?: number
    sample_rate?: number
    duration?: number
  }
  type: 'cabinet' | 'reverb'
  isActive: boolean
  availabilityLabel?: string
}

function formatSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDuration(seconds?: number): string {
  if (!seconds) return ''
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`
  return `${seconds.toFixed(2)}s`
}

function formatSampleRate(rate?: number): string {
  if (!rate) return ''
  return `${(rate / 1000).toFixed(1)}kHz`
}

export function IRItemCard({ ir, type, isActive, availabilityLabel }: IRItemCardProps) {
  const queryClient = useQueryClient()

  const loadMutation = useMutation({
    mutationFn: () =>
      type === 'cabinet'
        ? irApi.loadCabinet(ir.name)
        : irApi.loadReverb(ir.name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ir', 'status'] })
    },
  })

  const metadata = [
    formatDuration(ir.duration),
    formatSampleRate(ir.sample_rate),
    formatSize(ir.size),
  ].filter(Boolean).join(' • ')

  return (
    <div className={`model-item ${isActive ? 'active' : ''}`}>
      <div className="model-item-info">
        <div className="model-item-name">{ir.name}</div>
        {metadata && (
          <div className="model-item-meta">{metadata}</div>
        )}
        {availabilityLabel && (
          <div className="model-item-meta">{availabilityLabel}</div>
        )}
      </div>
      <div className="flex" style={{ gap: 8, alignItems: 'center' }}>
        {isActive ? (
          <span className="pill success" style={{ padding: '4px 8px' }}>
            <Check size={12} /> Active
          </span>
        ) : (
          <button
            className="btn btn-sm btn-primary"
            onClick={() => loadMutation.mutate()}
            disabled={loadMutation.isPending}
          >
            {loadMutation.isPending ? (
              <SpinnerGap size={14} className="spin" />
            ) : (
              'Load'
            )}
          </button>
        )}
      </div>
    </div>
  )
}
