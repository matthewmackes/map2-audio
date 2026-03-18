import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { VolumeUp as SpeakerHigh } from '@carbon/icons-react'
import { irApi } from '../../../map2/api'
import type { IRStatus } from '../../../map2/types'
import { CabinetIRManagerDialog } from './CabinetIRManagerDialog'

interface CabinetIRLoaderCardProps {
  onLoadCabinetIR?: (irName: string) => void
}

export function CabinetIRLoaderCard({ onLoadCabinetIR }: CabinetIRLoaderCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false)

  const statusQuery = useQuery<IRStatus>({
    queryKey: ['ir', 'status'],
    queryFn: () => irApi.getStatus(),
  })

  const status = statusQuery.data
  const loadedCabinet = status?.loaded_cabinet

  return (
    <>
      <div className="loader-card cabinet">
        <div className="loader-card-header">
          <div className="loader-card-icon cabinet">
            <SpeakerHigh size={22} />
          </div>
          <div className="loader-card-info">
            <h4 className="loader-card-title">Cabinet IR</h4>
            <p className="loader-card-subtitle">Speaker Cabinet Impulse</p>
          </div>
        </div>

        <div className="divider" />

        <div className="loader-card-status">
          {loadedCabinet ? (
            <>
              <span className="loader-card-model">{loadedCabinet}</span>
              <span className="pill success">Active</span>
            </>
          ) : (
            <span className="muted">No cabinet loaded</span>
          )}
        </div>

        <button className="btn btn-sm" onClick={() => setDialogOpen(true)}>
          Manage
        </button>
      </div>

      <CabinetIRManagerDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onLoadCabinetIR={onLoadCabinetIR} />
    </>
  )
}
