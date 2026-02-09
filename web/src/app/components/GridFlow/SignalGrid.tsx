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
  onAddPluginDirect?: (uri: string) => void
  audioStatus?: AudioInterfaceStatus
  audioOutputStatus?: AudioInterfaceStatus
  pluginLevels?: Record<string, { in: number; out: number }>
  showEndpoints?: boolean
  onInputPortSelectClick?: () => void
  onOutputPortSelectClick?: () => void
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
  onAddPluginDirect,
  audioStatus,
  audioOutputStatus,
  pluginLevels = {},
  showEndpoints = false,
  onInputPortSelectClick,
  onOutputPortSelectClick,
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
    <div className="signal-grid" style={{
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    }}>
      {/* Input ChainEndpoint - Far Left */}
      {showEndpoints && audioStatus && (
        <div className="signal-grid-endpoint-wrapper" style={{ flexShrink: 0 }}>
          <ChainEndpoint
            type="input"
            label="INPUT"
            audioStatus={audioStatus}
            compact={false}
            onPortSelectClick={onInputPortSelectClick}
          />
        </div>
      )}

      {/* Main signal flow row - Center, fills available space */}
      <div style={{ flex: 1, minWidth: 0 }}>
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
          onAddPluginDirect={onAddPluginDirect}
          isActive={chain.is_active}
          pluginLevels={pluginLevels}
        />
      </div>

      {/* Output ChainEndpoint - Far Right */}
      {showEndpoints && (audioOutputStatus || audioStatus) && (
        <div className="signal-grid-endpoint-wrapper" style={{ flexShrink: 0 }}>
          <ChainEndpoint
            type="output"
            label="OUTPUT"
            audioStatus={audioOutputStatus || audioStatus!}
            compact={false}
            onPortSelectClick={onOutputPortSelectClick}
          />
        </div>
      )}
    </div>
  )
})

export default SignalGrid
