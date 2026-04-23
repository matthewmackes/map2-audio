import React from 'react'
import { EmptyState } from '../../../shared/EmptyState'

export function LCDPresetsView() {
  return (
    <div style={{ padding: 24 }}>
      <EmptyState
        title="LCD Presets"
        description="Named LCD configurations (load/save/delete/duplicate/rename). Wire-up shipping in T2430-H."
        align="left"
      />
    </div>
  )
}
