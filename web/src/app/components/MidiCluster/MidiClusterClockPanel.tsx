// Cluster clock control panel. T2475 (E1): migrated from MUI to Carbon.
//   <Box sx>           → flat <div> with className
//   <Stack>            → flex <div> with gap
//   <Typography>       → semantic <span>
//   <FormControl>+<Select>+<InputLabel>+<MenuItem> → Carbon <Dropdown>
//   <Button variant="contained">  → Carbon kind="primary"
//   <Button variant="outlined">   → Carbon kind="tertiary"
//   inline #22c55e/#60a5fa palette → Carbon support tokens

import { useMemo, useState } from 'react'
import { Button, Dropdown } from '@carbon/react'
import { MeterAlt, Renew, Timer } from '@carbon/icons-react'

import type { MidiClusterClock } from '../../../map2/api'
import { useClusterClockActions } from '../../hooks/useMidiCluster'
import './MidiClusterClockPanel.css'

interface Props {
  clock?: MidiClusterClock
  nodes: Array<{ node_id: string; hostname: string }>
}

interface StrategyOption {
  value: string
  label: string
}

interface NodeOption {
  value: string
  label: string
}

const strategies: StrategyOption[] = [
  { value: 'leader-node', label: 'Leader node' },
  { value: 'lowest-latency', label: 'Lowest latency' },
  { value: 'manual', label: 'Manual' },
  { value: 'external', label: 'External' },
]

export function MidiClusterClockPanel({ clock, nodes }: Props) {
  const { setStrategy, forceSync } = useClusterClockActions()
  const [strategy, setStrategyValue] = useState(clock?.strategy ?? 'leader-node')
  const [manualNode, setManualNode] = useState<string>('')

  const masterHostname = useMemo(() => {
    if (!clock?.master_node_id) return ''
    return nodes.find(n => n.node_id === clock.master_node_id)?.hostname ?? clock.master_node_id
  }, [clock?.master_node_id, nodes])

  const nodeOptions = useMemo<NodeOption[]>(
    () => nodes.map(n => ({ value: n.node_id, label: n.hostname })),
    [nodes],
  )

  const selectedStrategy =
    strategies.find(s => s.value === strategy) ?? strategies[0]
  const selectedNode = nodeOptions.find(n => n.value === manualNode) ?? null

  const handleApply = () => {
    void setStrategy.mutateAsync({ strategy, manualNodeId: strategy === 'manual' ? manualNode : undefined })
  }

  return (
    <div className="midi-cluster-clock-panel">
      <div className="midi-cluster-clock-panel__head">
        <MeterAlt size={18} className="midi-cluster-clock-panel__head-icon" aria-hidden="true" />
        <span className="midi-cluster-clock-panel__title">Cluster Clock</span>
      </div>
      {clock ? (
        <div className="midi-cluster-clock-panel__body">
          <div className="midi-cluster-clock-panel__readout">
            <Timer size={16} className="midi-cluster-clock-panel__readout-icon" aria-hidden="true" />
            <span className="midi-cluster-clock-panel__readout-text">
              Master: {masterHostname || 'n/a'} · BPM {clock.master_bpm.toFixed(1)} · Drift {clock.drift_ms.toFixed(2)} ms
            </span>
          </div>
          <div className="midi-cluster-clock-panel__controls">
            <Dropdown<StrategyOption>
              id="midi-cluster-clock-strategy"
              titleText="Strategy"
              label="Strategy"
              hideLabel
              size="sm"
              items={strategies}
              itemToString={(item) => item?.label ?? ''}
              selectedItem={selectedStrategy}
              onChange={({ selectedItem }) => {
                if (selectedItem) setStrategyValue(selectedItem.value)
              }}
            />
            {strategy === 'manual' && (
              <Dropdown<NodeOption>
                id="midi-cluster-clock-manual-node"
                titleText="Manual master"
                label="Select node"
                hideLabel
                size="sm"
                items={nodeOptions}
                itemToString={(item) => item?.label ?? ''}
                selectedItem={selectedNode}
                onChange={({ selectedItem }) => {
                  if (selectedItem) setManualNode(selectedItem.value)
                }}
              />
            )}
            <Button
              kind="primary"
              size="sm"
              onClick={handleApply}
              disabled={setStrategy.isPending}
            >
              Apply
            </Button>
            <Button
              kind="tertiary"
              size="sm"
              renderIcon={Renew}
              onClick={() => forceSync.mutate()}
              disabled={forceSync.isPending}
            >
              Force re-sync
            </Button>
          </div>
        </div>
      ) : (
        <span className="midi-cluster-clock-panel__empty">Clock data unavailable.</span>
      )}
    </div>
  )
}

export default MidiClusterClockPanel
