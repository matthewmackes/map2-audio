import React from 'react'
import { EmptyState } from '../../../shared/EmptyState'

export function LCDSnapshotsView() {
  return (
    <div style={{ padding: 24 }}>
      <EmptyState
        title="Snapshot LCD Hooks"
        description="Per-snapshot LCD overrides referencing presets by name. Shipping in T2430-I."
        align="left"
      />
    </div>
  )
}
