import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Lightning, WarningCircle } from '@phosphor-icons/react'
import { namApi } from '../../../map2/api'
import type { NAMStatus } from '../../../map2/types'
import { NAMManagerDialog } from './NAMManagerDialog'

interface NAMLoaderCardProps {
  onLoadNAM?: (modelName: string) => void
}

export function NAMLoaderCard({ onLoadNAM }: NAMLoaderCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false)

  const statusQuery = useQuery<NAMStatus>({
    queryKey: ['nam', 'status'],
    queryFn: namApi.getStatus,
  })

  const status = statusQuery.data
  const available = status?.available ?? false
  const activeModel = status?.activeModel

  return (
    <>
      <div className="loader-card nam">
        <div className="loader-card-header">
          <div className="loader-card-icon nam">
            <Lightning size={22} weight="duotone" />
          </div>
          <div className="loader-card-info">
            <h4 className="loader-card-title">NAM Loader</h4>
            <p className="loader-card-subtitle">Neural Amp Modeler</p>
          </div>
        </div>

        <div className="divider" />

        <div className="loader-card-status">
          {!available ? (
            <span className="pill warn">
              <WarningCircle size={14} weight="duotone" />
              Unavailable
            </span>
          ) : activeModel ? (
            <>
              <span className="loader-card-model">{activeModel}</span>
              <span className="pill success">Active</span>
            </>
          ) : (
            <span className="muted">No model loaded</span>
          )}
        </div>

        <button
          className="btn btn-sm"
          onClick={() => setDialogOpen(true)}
          disabled={!available}
        >
          Manage
        </button>
      </div>

      <NAMManagerDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onLoadNAM={onLoadNAM} />
    </>
  )
}
