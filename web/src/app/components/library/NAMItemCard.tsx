import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, SpinnerGap } from '@phosphor-icons/react'
import { namApi } from '../../../map2/api'

interface NAMItemCardProps {
  model: {
    name: string
    type: string
    path?: string
    size?: number
  }
  isActive: boolean
}

function formatSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const MODEL_TYPE_COLORS: Record<string, string> = {
  amp: 'var(--primary)',
  pedal: 'var(--accent)',
  preamp: 'var(--success)',
  unknown: 'var(--muted)',
}

export function NAMItemCard({ model, isActive }: NAMItemCardProps) {
  const queryClient = useQueryClient()

  const loadMutation = useMutation({
    mutationFn: () => namApi.loadModel(model.name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nam', 'status'] })
    },
  })

  const activateMutation = useMutation({
    mutationFn: () => namApi.activateModel(model.name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nam', 'status'] })
    },
  })

  const typeColor = MODEL_TYPE_COLORS[model.type] ?? MODEL_TYPE_COLORS.unknown

  return (
    <div className={`model-item ${isActive ? 'active' : ''}`}>
      <div className="model-item-info">
        <div className="model-item-name">{model.name}</div>
        <div className="model-item-meta">
          <span className="badge" style={{ background: typeColor, color: '#fff', marginRight: 8 }}>
            {model.type}
          </span>
          {model.size && formatSize(model.size)}
        </div>
      </div>
      <div className="flex" style={{ gap: 8, alignItems: 'center' }}>
        {isActive ? (
          <span className="pill success" style={{ padding: '4px 8px' }}>
            <Check size={12} weight="bold" /> Active
          </span>
        ) : (
          <button
            className="btn btn-sm btn-primary"
            onClick={() => activateMutation.mutate()}
            disabled={loadMutation.isPending || activateMutation.isPending}
          >
            {(loadMutation.isPending || activateMutation.isPending) ? (
              <SpinnerGap size={14} weight="duotone" className="spin" />
            ) : (
              'Load'
            )}
          </button>
        )}
      </div>
    </div>
  )
}
