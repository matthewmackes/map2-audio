/**
 * ChainManagementCard - Compact Chain Grid UI
 *
 * Tight grid layout showing all chains with inline lifecycle controls:
 * - Power (activate/deactivate)
 * - Rename (inline editing)
 * - Delete
 * - Plugin count & status indicators
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Add,
  Checkmark,
  Close,
  Edit,
  Power,
  Renew,
  SplitScreen,
  TrashCan,
} from '@carbon/icons-react'
import { chainsApi } from '../../map2/api'
import { useToasts } from './Toasts'
import type { Chain, ChainsResponse } from '../../map2/types'
import { getPluginChipMeta } from '../utils/pluginChipMeta'

const MAX_VISIBLE_CHIPS = 5
const RUNTIME_CHAIN_CONTROL_NOTICE = 'Runtime-only chain controls. Snapshot control-plane truth lives in Audio Grid.'

interface FlowSlot {
  id: string
  chainId: number | null
  label: string
  color: string
}

interface ChainManagementCardProps {
  /** Currently selected chain ID in the flow slots */
  selectedChainId?: number | null
  /** Callback when a chain is selected */
  onChainSelect?: (chainId: number) => void
  /** Flow slots to show which flows are using each chain */
  flowSlots?: FlowSlot[]
  /** Whether the card is expanded by default */
  defaultExpanded?: boolean
}

export function ChainManagementCard({
  selectedChainId,
  onChainSelect,
  flowSlots = [],
}: ChainManagementCardProps) {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()

  const [showCreateInput, setShowCreateInput] = useState(false)
  const [newChainName, setNewChainName] = useState('')
  const [editingChainId, setEditingChainId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')

  // Fetch chains
  const chainsQuery = useQuery<ChainsResponse>({
    queryKey: ['chains'],
    queryFn: () => chainsApi.list(),
    refetchInterval: 5000,
  })

  const chains = chainsQuery.data?.chains || []

  // Mutations
  const createMutation = useMutation({
    mutationFn: (name: string) => chainsApi.create(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      setNewChainName('')
      setShowCreateInput(false)
      pushToast('Chain created', 'success')
    },
    onError: () => pushToast('Failed to create chain', 'error'),
  })

  const activateMutation = useMutation({
    mutationFn: (id: number) => chainsApi.activate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      pushToast('Runtime chain activated', 'success')
    },
    onError: () => pushToast('Failed to activate runtime chain', 'error'),
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: number) => chainsApi.deactivate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      pushToast('Runtime chain stopped', 'info')
    },
    onError: () => pushToast('Failed to stop runtime chain', 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => chainsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      pushToast('Chain deleted', 'warn')
    },
    onError: () => pushToast('Failed to delete', 'error'),
  })

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => chainsApi.rename(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      setEditingChainId(null)
      setEditingName('')
      pushToast('Chain renamed', 'success')
    },
    onError: () => pushToast('Failed to rename', 'error'),
  })

  const handleCreate = () => {
    const name = newChainName.trim()
    if (name) {
      createMutation.mutate(name)
    }
  }

  const handleRename = (id: number) => {
    const name = editingName.trim()
    if (name) {
      renameMutation.mutate({ id, name })
    }
  }

  const handleDelete = (chain: Chain, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm(`Delete "${chain.name}"?`)) {
      deleteMutation.mutate(chain.id)
    }
  }

  const startEditing = (chain: Chain, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingChainId(chain.id)
    setEditingName(chain.name)
  }

  const cancelEditing = () => {
    setEditingChainId(null)
    setEditingName('')
  }

  const togglePower = (chain: Chain, e: React.MouseEvent) => {
    e.stopPropagation()
    if (chain.is_active) {
      deactivateMutation.mutate(chain.id)
    } else {
      activateMutation.mutate(chain.id)
    }
  }

  const isPending = createMutation.isPending || activateMutation.isPending ||
    deactivateMutation.isPending || deleteMutation.isPending || renameMutation.isPending

  return (
    <div className="chains-grid-card">
      {/* Vertical title on the left */}
      <div className="chains-grid-title">
        <SplitScreen size={16} />
        <span>Runtime Chains</span>
      </div>

      <div
        role="note"
        style={{
          padding: '0.5rem 0.75rem',
          borderBottom: '1px solid var(--cds-border-subtle-01)',
          background: 'var(--cds-layer-02)',
          color: 'var(--cds-text-secondary)',
          fontSize: '0.75rem',
          lineHeight: 1.4,
        }}
      >
        {RUNTIME_CHAIN_CONTROL_NOTICE}
      </div>

      {/* Grid of chain cells */}
      <div className="chains-grid">
        {chainsQuery.isLoading ? (
          <div className="chains-grid-loading">
            <Renew size={16} className="spin" />
          </div>
        ) : (
          <>
            {chains.map(chain => (
              <div
                key={chain.id}
                className={`chains-grid-cell ${chain.is_active ? 'active' : ''} ${selectedChainId === chain.id ? 'selected' : ''}`}
                onClick={() => onChainSelect?.(chain.id)}
              >
                {editingChainId === chain.id ? (
                  /* Inline rename mode */
                  <div className="chains-grid-cell-edit">
                    <input
                      type="text"
                      className="chains-grid-input"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation()
                        if (e.key === 'Enter') handleRename(chain.id)
                        if (e.key === 'Escape') cancelEditing()
                      }}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                      disabled={renameMutation.isPending}
                    />
                    <div className="chains-grid-cell-edit-actions">
                      <button
                        className="chains-grid-btn confirm"
                        onClick={(e) => { e.stopPropagation(); handleRename(chain.id) }}
                        disabled={!editingName.trim() || renameMutation.isPending}
                      >
                        {renameMutation.isPending ? <Renew size={12} className="spin" /> : <Checkmark size={12} />}
                      </button>
                      <button
                        className="chains-grid-btn"
                        onClick={(e) => { e.stopPropagation(); cancelEditing() }}
                      >
                        <Close size={12} />
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Normal cell display */
                  <>
                    {/* Top row: Power + Name */}
                    <div className="chains-grid-cell-top">
                      <button
                        className={`chains-grid-btn power ${chain.is_active ? 'on' : ''}`}
                        onClick={(e) => togglePower(chain, e)}
                        disabled={isPending}
                        title={chain.is_active ? 'Stop runtime chain' : 'Set runtime active'}
                      >
                        <Power size={12} />
                      </button>
                      <span className="chains-grid-cell-name" title={chain.name}>
                        {chain.name}
                      </span>
                    </div>

                    {/* Flow indicators - show which flows use this chain */}
                    {(() => {
                      const flowsUsingChain = flowSlots.filter(f => f.chainId === chain.id)
                      if (flowsUsingChain.length === 0) return null
                      return (
                        <div className="chains-grid-cell-flows">
                          {flowsUsingChain.map(flow => (
                            <span
                              key={flow.id}
                              className="chains-grid-flow-dot"
                              style={{ backgroundColor: flow.color }}
                              title={`Flow: ${flow.label}`}
                            />
                          ))}
                        </div>
                      )
                    })()}

                    {/* Plugin chip strip — display-only */}
                    {chain.plugins.length > 0 && (
                      <div className="chains-grid-cell-chips">
                        {chain.plugins.slice(0, MAX_VISIBLE_CHIPS).map((plugin) => {
                          const category = plugin.plugin_display_type || plugin.name
                          const { label, tagType } = getPluginChipMeta(category, plugin.bypassed)
                          // Map Carbon tag types to local CSS classes (no Carbon dep here)
                          return (
                            <span
                              key={`${plugin.uri}-${plugin.position}`}
                              className={`chains-grid-plugin-chip chains-grid-plugin-chip--${tagType}${plugin.bypassed ? ' is-bypassed' : ''}`}
                              title={plugin.name || plugin.uri}
                            >
                              {label}
                            </span>
                          )
                        })}
                        {chain.plugins.length > MAX_VISIBLE_CHIPS && (
                          <span className="chains-grid-plugin-chip chains-grid-plugin-chip--cool-gray">
                            +{chain.plugins.length - MAX_VISIBLE_CHIPS}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Bottom row: Stats + Actions */}
                    <div className="chains-grid-cell-bottom">
                      <div className="chains-grid-cell-stats">
                        <span className="chains-grid-stat" title="Plugins">
                          {chain.plugins.length}p
                        </span>
                        {chain.is_active && (
                          <span className="chains-grid-active-indicator" title="Runtime active" />
                        )}
                      </div>
                      <div className="chains-grid-cell-actions">
                        <button
                          className="chains-grid-btn"
                          onClick={(e) => startEditing(chain, e)}
                          disabled={isPending}
                          title="Rename"
                        >
                          <Edit size={11} />
                        </button>
                        <button
                          className="chains-grid-btn danger"
                          onClick={(e) => handleDelete(chain, e)}
                          disabled={isPending}
                          title="Delete"
                        >
                          <TrashCan size={11} />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}

            {/* Create new chain cell */}
            {showCreateInput ? (
              <div className="chains-grid-cell create-mode">
                <input
                  type="text"
                  className="chains-grid-input"
                  placeholder="Name..."
                  value={newChainName}
                  onChange={(e) => setNewChainName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate()
                    if (e.key === 'Escape') {
                      setShowCreateInput(false)
                      setNewChainName('')
                    }
                  }}
                  autoFocus
                  disabled={createMutation.isPending}
                />
                <div className="chains-grid-create-actions">
                  <button
                    className="chains-grid-btn confirm"
                    onClick={handleCreate}
                    disabled={!newChainName.trim() || createMutation.isPending}
                  >
                    {createMutation.isPending ? <Renew size={12} className="spin" /> : <Checkmark size={12} />}
                  </button>
                  <button
                    className="chains-grid-btn"
                    onClick={() => {
                      setShowCreateInput(false)
                      setNewChainName('')
                    }}
                  >
                    <Close size={12} />
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="chains-grid-cell add-cell"
                onClick={() => setShowCreateInput(true)}
                title="Create new chain"
              >
                <Add size={18} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default ChainManagementCard
