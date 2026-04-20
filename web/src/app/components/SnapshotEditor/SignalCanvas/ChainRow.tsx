import { Add } from '@carbon/icons-react'

import { ChainHead } from './ChainHead'
import { ChainSide } from './ChainSide'
import { ChainTab } from './ChainTab'
import { Meter } from './Meter'
import { SignalNode } from './Node'
import { SignalGrid } from './SignalGrid'
import { SignalCanvasIcon } from './icons'
import { Terminal } from './Terminal'
import type { PluginCategorySpriteId } from '../../shared/pluginCategoryIcon'

export interface ChainRowPlugin {
  uri: string
  position: number
  label: string
  categoryLabel: string
  iconId: PluginCategorySpriteId
  bypassed?: boolean
  selected?: boolean
  cpuLoad?: number
  systemBlockBadge?: string | null
}

export interface ChainRowProps {
  chainLabel: string
  chainName: string
  active?: boolean
  assigned?: boolean
  readOnly?: boolean
  muted?: boolean
  soloed?: boolean
  branchCount?: number
  routingLabel?: string
  sendLabel?: string
  plugins: ChainRowPlugin[]
  addEnabled?: boolean
  meterLeft?: number
  meterRight?: number
  meterStale?: boolean
  meterClipped?: boolean
  onPluginSelect?: (plugin: ChainRowPlugin) => void
  onToggleBypass?: (plugin: ChainRowPlugin) => void
  onDeletePlugin?: (plugin: ChainRowPlugin) => void
  onAddPlugin?: () => void
  onRenameChain?: () => void
  onDuplicateChain?: () => void
  onToggleChainActive?: () => void
  onDeleteChain?: () => void
  onAssignChain?: () => void
  onMuteToggle?: () => void
  onSoloToggle?: () => void
  onClearClip?: () => void
}

export function ChainRow({
  chainLabel,
  chainName,
  active = false,
  assigned = true,
  readOnly = false,
  muted = false,
  soloed = false,
  branchCount = 1,
  routingLabel = 'SERIES',
  sendLabel = 'NO SEND',
  plugins,
  addEnabled = false,
  meterLeft = 0,
  meterRight = meterLeft,
  meterStale = false,
  meterClipped = false,
  onPluginSelect,
  onToggleBypass,
  onDeletePlugin,
  onAddPlugin,
  onRenameChain,
  onDuplicateChain,
  onToggleChainActive,
  onDeleteChain,
  onAssignChain,
  onMuteToggle,
  onSoloToggle,
  onClearClip,
}: ChainRowProps) {
  const rowCount = Math.max(5, Math.floor(2 * Math.max(1, branchCount) + 1))

  return (
    <section className={`snapshot-chain-row chain${active ? ' active' : ''}${muted ? ' is-muted' : ''}`} data-testid="snapshot-signal-chain-row" aria-label={`${chainName} signal chain`}>
      <ChainHead
        chainLabel={chainLabel}
        chainName={chainName}
        active={active}
        assigned={assigned}
        readOnly={readOnly}
        routingLabel={routingLabel}
        sendLabel={sendLabel}
        onRename={onRenameChain}
        onDuplicate={onDuplicateChain}
        onActivate={onToggleChainActive}
        onDelete={onDeleteChain}
        onAssign={onAssignChain}
      />

      <div className="snapshot-chain-row__body">
        <ChainTab label={chainLabel} active={active} muted={muted} />
        <div className="snapshot-chain-row__grid-shell">
          <SignalGrid cols={13} rows={rowCount}>
            <div className="snapshot-chain-row__lane" data-testid="snapshot-signal-chain-lane">
              <Terminal role="input" active={active} />
              <div className="snapshot-chain-row__nodes">
                {plugins.map((plugin) => (
                  <div key={`${plugin.uri}:${plugin.position}`} className="snapshot-chain-row__node-slot" data-testid={`snapshot-signal-node-slot-${plugin.position}`}>
                    <SignalNode
                      label={plugin.label}
                      iconId={plugin.iconId}
                      selected={plugin.selected}
                      bypassed={plugin.bypassed}
                      cpuLoad={plugin.cpuLoad}
                      showBypassControl={!readOnly}
                      onSelect={() => onPluginSelect?.(plugin)}
                      onBypassToggle={() => onToggleBypass?.(plugin)}
                    />
                    {plugin.systemBlockBadge ? (
                      <span className="snapshot-chain-row__system-badge" data-testid={`snapshot-signal-system-badge-${plugin.position}`}>
                        {plugin.systemBlockBadge}
                      </span>
                    ) : null}
                    {plugin.selected && !readOnly && onDeletePlugin && !plugin.systemBlockBadge ? (
                      <button
                        type="button"
                        className="snapshot-chain-row__node-delete"
                        data-testid={`snapshot-signal-node-delete-${plugin.position}`}
                        aria-label={`Remove ${plugin.label} from chain`}
                        onClick={() => onDeletePlugin(plugin)}
                      >
                        <SignalCanvasIcon id="i-trash" className="snapshot-chain-row__node-delete-icon" />
                      </button>
                    ) : null}
                  </div>
                ))}
                {addEnabled && !readOnly ? (
                  <button type="button" className="snapshot-chain-row__add" aria-label="Add effect" onClick={onAddPlugin}>
                    <Add size={18} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
              <Terminal role="output" active={active} />
            </div>
          </SignalGrid>
        </div>
        <Meter left={meterLeft} right={meterRight} stale={meterStale} clipped={meterClipped} onClearClip={onClearClip} />
        <ChainSide
          chainLabel={chainLabel}
          chainName={chainName}
          active={active}
          assigned={assigned}
          readOnly={readOnly}
          muted={muted}
          soloed={soloed}
          pluginCount={plugins.length}
          branchCount={branchCount}
          cpuLoad={plugins.reduce((sum, plugin) => sum + (plugin.cpuLoad ?? 0), 0)}
          routingLabel={routingLabel}
          sendLabel={sendLabel}
          onRename={onRenameChain}
          onDuplicate={onDuplicateChain}
          onActivate={onToggleChainActive}
          onDelete={onDeleteChain}
          onAssign={onAssignChain}
          onMuteToggle={onMuteToggle}
          onSoloToggle={onSoloToggle}
        />
      </div>
    </section>
  )
}
