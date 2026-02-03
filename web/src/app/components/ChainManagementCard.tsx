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
  Plus,
  Power,
  Trash2,
  Edit3,
  Check,
  X,
  Loader2,
  Layers,
} from 'lucide-react'
import { chainsApi } from '../../map2/api'
import { useToasts } from './Toasts'
import type { Chain, ChainsResponse } from '../../map2/types'

interface ChainManagementCardProps {
  /** Currently selected chain ID in the flow slots */
  selectedChainId?: number | null
  /** Callback when a chain is selected */
  onChainSelect?: (chainId: number) => void
  /** Whether the card is expanded by default */
  defaultExpanded?: boolean
}

export function ChainManagementCard({
  selectedChainId,
  onChainSelect,
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
    queryFn: chainsApi.list,
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
      pushToast('Chain activated', 'success')
    },
    onError: () => pushToast('Failed to activate', 'error'),
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: number) => chainsApi.deactivate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      pushToast('Chain deactivated', 'info')
    },
    onError: () => pushToast('Failed to deactivate', 'error'),
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
        <Layers size={16} />
        <span>Chains</span>
      </div>

      {/* Grid of chain cells */}
      <div className="chains-grid">
        {chainsQuery.isLoading ? (
          <div className="chains-grid-loading">
            <Loader2 size={16} className="spin" />
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
                        {renameMutation.isPending ? <Loader2 size={12} className="spin" /> : <Check size={12} />}
                      </button>
                      <button
                        className="chains-grid-btn"
                        onClick={(e) => { e.stopPropagation(); cancelEditing() }}
                      >
                        <X size={12} />
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
                        title={chain.is_active ? 'Deactivate' : 'Activate'}
                      >
                        <Power size={12} />
                      </button>
                      <span className="chains-grid-cell-name" title={chain.name}>
                        {chain.name}
                      </span>
                    </div>

                    {/* Bottom row: Stats + Actions */}
                    <div className="chains-grid-cell-bottom">
                      <div className="chains-grid-cell-stats">
                        <span className="chains-grid-stat" title="Plugins">
                          {chain.plugins.length}p
                        </span>
                        {chain.is_active && (
                          <span className="chains-grid-active-indicator" title="Active" />
                        )}
                      </div>
                      <div className="chains-grid-cell-actions">
                        <button
                          className="chains-grid-btn"
                          onClick={(e) => startEditing(chain, e)}
                          disabled={isPending}
                          title="Rename"
                        >
                          <Edit3 size={11} />
                        </button>
                        <button
                          className="chains-grid-btn danger"
                          onClick={(e) => handleDelete(chain, e)}
                          disabled={isPending}
                          title="Delete"
                        >
                          <Trash2 size={11} />
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
                    {createMutation.isPending ? <Loader2 size={12} className="spin" /> : <Check size={12} />}
                  </button>
                  <button
                    className="chains-grid-btn"
                    onClick={() => {
                      setShowCreateInput(false)
                      setNewChainName('')
                    }}
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="chains-grid-cell add-cell"
                onClick={() => setShowCreateInput(true)}
                title="Create new chain"
              >
                <Plus size={18} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default ChainManagementCard
