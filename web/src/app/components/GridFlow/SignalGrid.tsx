/**
 * SignalGrid Component
 *
 * Container for the signal flow grid visualization.
 * Shows ChainEndpoint cards at input/output and animated signal flow.
 */

import { memo } from 'react'
import { SignalGridRow } from './SignalGridRow'
import { ChainEndpoint, AudioInterfaceStatus } from './ChainEndpoint'
import type { Chain, Plugin } from '../../../map2/types'

export interface SignalGridProps {
  chain: Chain | null
  pluginMeta: Record<string, Plugin>
  selectedPluginUri: string | null
  onPluginSelect: (uri: string) => void
  onToggleBypass: (uri: string, bypassed: boolean) => void
  onDeletePlugin?: (uri: string) => void
  onReorderPlugins: (pluginUris: string[]) => void
  onAddPlugin?: () => void
  audioStatus?: AudioInterfaceStatus
  pluginLevels?: Record<string, { in: number; out: number }>
  showEndpoints?: boolean
}

export const SignalGrid = memo(function SignalGrid({
  chain,
  pluginMeta,
  selectedPluginUri,
  onPluginSelect,
  onToggleBypass,
  onDeletePlugin,
  onReorderPlugins,
  onAddPlugin,
  audioStatus,
  pluginLevels = {},
  showEndpoints = false,
}: SignalGridProps) {
  if (!chain) {
    return (
      <div className="signal-grid">
        <div className="signal-grid-empty">
          <p>Select a chain to view and edit</p>
        </div>
      </div>
    )
  }

  const handleToggleBypass = (uri: string) => {
    const plugin = chain.plugins.find((p) => p.uri === uri)
    if (plugin) {
      onToggleBypass(uri, !plugin.bypassed)
    }
  }

  return (
    <div className="signal-grid">
      {/* Input ChainEndpoint */}
      {showEndpoints && audioStatus && (
        <div className="signal-grid-endpoint-wrapper">
          <ChainEndpoint
            type="input"
            label="INPUT"
            audioStatus={audioStatus}
            compact={true}
          />
        </div>
      )}

      {/* Main signal flow row */}
      <SignalGridRow
        rowLabel="In"
        rowIndex={0}
        plugins={chain.plugins}
        pluginMeta={pluginMeta}
        selectedPluginUri={selectedPluginUri}
        onPluginSelect={onPluginSelect}
        onToggleBypass={handleToggleBypass}
        onDeletePlugin={onDeletePlugin}
        onReorderPlugins={onReorderPlugins}
        onAddPlugin={onAddPlugin}
        isActive={chain.is_active}
        pluginLevels={pluginLevels}
      />

      {/* Output ChainEndpoint */}
      {showEndpoints && audioStatus && (
        <div className="signal-grid-endpoint-wrapper">
          <ChainEndpoint
            type="output"
            label="OUTPUT"
            audioStatus={audioStatus}
            compact={true}
          />
        </div>
      )}
    </div>
  )
})

export default SignalGrid
