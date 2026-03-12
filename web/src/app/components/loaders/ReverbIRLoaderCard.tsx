import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { WaveSine } from '@phosphor-icons/react'
import { irApi } from '../../../map2/api'
import type { IRStatus } from '../../../map2/types'
import { ReverbIRManagerDialog } from './ReverbIRManagerDialog'

interface ReverbIRLoaderCardProps {
  onLoadReverbIR?: (irName: string) => void
}

export function ReverbIRLoaderCard({ onLoadReverbIR }: ReverbIRLoaderCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false)

  const statusQuery = useQuery<IRStatus>({
    queryKey: ['ir', 'status'],
    queryFn: () => irApi.getStatus(),
  })

  const status = statusQuery.data
  const loadedReverb = status?.loaded_reverb

  return (
    <>
      <div className="loader-card reverb">
        <div className="loader-card-header">
          <div className="loader-card-icon reverb">
            <WaveSine size={22} weight="duotone" />
          </div>
          <div className="loader-card-info">
            <h4 className="loader-card-title">Reverb IR</h4>
            <p className="loader-card-subtitle">Reverb Impulse Response</p>
          </div>
        </div>

        <div className="divider" />

        <div className="loader-card-status">
          {loadedReverb ? (
            <>
              <span className="loader-card-model">{loadedReverb}</span>
              <span className="pill success">Active</span>
            </>
          ) : (
            <span className="muted">No reverb loaded</span>
          )}
        </div>

        <button className="btn btn-sm" onClick={() => setDialogOpen(true)}>
          Manage
        </button>
      </div>

      <ReverbIRManagerDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onLoadReverbIR={onLoadReverbIR} />
    </>
  )
}
