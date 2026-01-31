/**
 * ChainPanel Component
 *
 * Full-width horizontal panel for displaying a signal chain.
 * Each chain gets its own panel with header controls and HorizontalSignalChain.
 */

import { Volume2, VolumeX, Disc } from 'lucide-react'
import type { Chain, ChainPlugin, Plugin } from '../../../map2/types'
import { HorizontalSignalChain } from '../HorizontalSignalChain'

export interface ChainSlot {
  id: string
  chainId: number | null
  label: string
  color: string
  dryWetMix: number
  muted: boolean
  solo: boolean
}

export interface ChainPanelProps {
  slot: ChainSlot
  slotIndex: number
  chain: Chain | undefined
  isActive: boolean
  onSlotSelect: () => void
  onChainSelect: (chainId: number | null) => void
  availableChains: Chain[]
  pluginMeta: Record<string, Plugin>
  selectedPluginUri: string | null
  onPluginSelect: (uri: string) => void
  onPluginReorder: (pluginUris: string[]) => void
  onToggleBypass: (uri: string, bypassed: boolean) => void
  onDeletePlugin?: (uri: string) => void
  onMuteToggle: () => void
  onSoloToggle: () => void
}

export function ChainPanel({
  slot,
  slotIndex,
  chain,
  isActive,
  onSlotSelect,
  onChainSelect,
  availableChains,
  pluginMeta,
  selectedPluginUri,
  onPluginSelect,
  onPluginReorder,
  onToggleBypass,
  onDeletePlugin,
  onMuteToggle,
  onSoloToggle,
}: ChainPanelProps) {
  return (
    <div
      className={`chain-panel ${isActive ? 'active' : ''}`}
      style={{ '--slot-color': slot.color } as React.CSSProperties}
      onClick={onSlotSelect}
    >
      {/* Header */}
      <div className="chain-panel-header">
        {/* Label Badge */}
        <button
          className="chain-panel-label"
          onClick={(e) => { e.stopPropagation(); onSlotSelect(); }}
          title={`Chain ${slot.label}`}
        >
          {slot.label}
        </button>

        {/* Chain Selector */}
        <select
          className="chain-panel-select"
          value={slot.chainId ?? ''}
          onChange={(e) => {
            e.stopPropagation()
            onChainSelect(e.target.value ? Number(e.target.value) : null)
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <option value="">Select chain...</option>
          {availableChains.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.is_active ? '●' : ''}
            </option>
          ))}
        </select>

        {/* Plugin Count */}
        {chain && (
          <span className="chain-panel-count">
            {chain.plugins.length} plugin{chain.plugins.length !== 1 ? 's' : ''}
          </span>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Mute Button */}
        <button
          className={`chain-panel-btn ${slot.muted ? 'active muted' : ''}`}
          onClick={(e) => { e.stopPropagation(); onMuteToggle(); }}
          title={slot.muted ? 'Unmute' : 'Mute'}
        >
          {slot.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          <span>M</span>
        </button>

        {/* Solo Button */}
        <button
          className={`chain-panel-btn ${slot.solo ? 'active solo' : ''}`}
          onClick={(e) => { e.stopPropagation(); onSoloToggle(); }}
          title={slot.solo ? 'Unsolo' : 'Solo'}
        >
          <Disc size={14} />
          <span>S</span>
        </button>
      </div>

      {/* Body - Horizontal Signal Chain */}
      <div className="chain-panel-body">
        {!chain ? (
          <div className="chain-panel-empty">
            No chain selected
          </div>
        ) : chain.plugins.length === 0 ? (
          <div className="chain-panel-empty">
            Empty chain - add plugins from the library
          </div>
        ) : (
          <HorizontalSignalChain
            plugins={chain.plugins}
            pluginMeta={pluginMeta}
            selectedPluginUri={isActive ? selectedPluginUri : null}
            onPluginSelect={onPluginSelect}
            onPluginReorder={onPluginReorder}
            onToggleBypass={onToggleBypass}
            onDeletePlugin={onDeletePlugin}
            isActive={chain.is_active && !slot.muted}
          />
        )}
      </div>
    </div>
  )
}

export default ChainPanel
