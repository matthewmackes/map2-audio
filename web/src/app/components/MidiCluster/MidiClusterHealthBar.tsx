// MIDI cluster health bar. T2475 (E1): migrated from MUI (Paper/Stack/
// Typography/LinearProgress/Chip) to Carbon-native idioms. Now consumes
// the canonical StatusChip primitive (B4) for the three counter chips.

import { ProgressBar, Tile } from '@carbon/react'
import { StatusChip } from '../primitives'
import type { MidiClusterHealth } from '../../../map2/api'
import './MidiClusterHealthBar.css'

interface Props {
  health?: MidiClusterHealth
}

export function MidiClusterHealthBar({ health }: Props) {
  if (!health) return null

  const healthyPercent = health.connection_count > 0
    ? Math.round((health.healthy_connection_count / health.connection_count) * 100)
    : 100

  return (
    <Tile className="midi-cluster-health-bar">
      <div className="midi-cluster-health-bar__row">
        <div className="midi-cluster-health-bar__copy">
          <span className="midi-cluster-health-bar__title">Cluster MIDI Health</span>
          <span className="midi-cluster-health-bar__caption">
            {health.node_count} nodes · {health.connection_count} connections · clock {health.clock_status}
          </span>
          <ProgressBar
            value={healthyPercent}
            max={100}
            label="Healthy connections"
            hideLabel
            size="small"
          />
        </div>
        <div className="midi-cluster-health-bar__chips">
          <StatusChip tone="ok" label={`Healthy ${health.healthy_connection_count}`} size="sm" />
          <StatusChip tone="caution" label={`Degraded ${health.degraded_connections}`} size="sm" />
          <StatusChip
            tone="info"
            label="Clock drift"
            value={`${health.clock_drift_ms.toFixed(1)} ms`}
            size="sm"
          />
        </div>
      </div>
    </Tile>
  )
}

export default MidiClusterHealthBar
