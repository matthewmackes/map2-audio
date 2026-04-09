/**
 * BottomRoutingPanel Component
 *
 * Sticky bottom panel for managing signal chain routing.
 * Allows adding/removing chains and selecting routing modes.
 */

import { Add, ArrowRight, FlowConnection, Shuffle, SplitScreen, Subtract } from '@carbon/icons-react'
import type { ChainSlot } from '../ChainPanel'
import './BottomRoutingPanel.css'

export type RoutingMode =
  | 'parallel_blend'
  | 'ab_switch'
  | 'series'
  | 'parameter_morph'
  | 'sidechain'

export interface RoutingConfig {
  mode: RoutingMode
  activeSlotId: string | null
  blendPositions: Record<string, number>
  morphProgress: number
  morphSourceSlotId: string | null
  morphTargetSlotId: string | null
  seriesOrder: string[]
}

export interface BottomRoutingPanelProps {
  chainSlots: ChainSlot[]
  routing: RoutingConfig
  activeSlotIndex: number
  onAddChain: () => void
  onRemoveChain: (slotId: string) => void
  onSetRoutingMode: (mode: RoutingMode) => void
  onSetActiveSlot: (index: number) => void
  canAddChain: boolean
  canRemoveChain: boolean
}

const ROUTING_MODES: { mode: RoutingMode; label: string; icon: React.ReactNode; description: string }[] = [
  {
    mode: 'parallel_blend',
    label: 'Parallel',
    icon: <SplitScreen size={14} />,
    description: 'Mix all chains together',
  },
  {
    mode: 'series',
    label: 'Series',
    icon: <ArrowRight size={14} />,
    description: 'Chain A → B → C',
  },
  {
    mode: 'ab_switch',
    label: 'A/B Switch',
    icon: <Shuffle size={14} />,
    description: 'Switch between chains',
  },
  {
    mode: 'sidechain',
    label: 'Sidechain',
    icon: <FlowConnection size={14} />,
    description: 'Plugin sidechain routing',
  },
]

export function BottomRoutingPanel({
  chainSlots,
  routing,
  activeSlotIndex,
  onAddChain,
  onRemoveChain,
  onSetRoutingMode,
  onSetActiveSlot,
  canAddChain,
  canRemoveChain,
}: BottomRoutingPanelProps) {
  return (
    <div className="bottom-routing-panel">
      {/* Chain Management Section */}
      <div className="routing-chain-management">
        <button
          className="btn btn-sm btn-ghost"
          onClick={onAddChain}
          disabled={!canAddChain}
          title="Add chain"
        >
          <Add size={16} />
        </button>
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => {
            const lastSlot = chainSlots[chainSlots.length - 1]
            if (lastSlot && canRemoveChain) {
              onRemoveChain(lastSlot.id)
            }
          }}
          disabled={!canRemoveChain}
          title="Remove last chain"
        >
          <Subtract size={16} />
        </button>
        <span className="routing-chain-count">
          {chainSlots.length} chain{chainSlots.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Routing Mode Selector */}
      <div className="routing-mode-selector">
        {ROUTING_MODES.map(({ mode, label, icon, description }) => (
          <button
            key={mode}
            className={`btn btn-sm ${routing.mode === mode ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => onSetRoutingMode(mode)}
            title={description}
          >
            {icon}
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Chain Flow Diagram */}
      <div className="routing-chain-diagram">
        {chainSlots.map((slot, index) => (
          <div key={slot.id} className="routing-chain-node-wrapper">
            <button
              className={`routing-chain-node ${activeSlotIndex === index ? 'active' : ''}`}
              style={{ borderColor: slot.color, color: slot.color }}
              onClick={() => onSetActiveSlot(index)}
              title={`Chain ${slot.label}`}
            >
              {slot.label}
            </button>
            {index < chainSlots.length - 1 && (
              <span className="routing-chain-arrow">
                {routing.mode === 'series' ? '→' : routing.mode === 'parallel_blend' ? '+' : '|'}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default BottomRoutingPanel
