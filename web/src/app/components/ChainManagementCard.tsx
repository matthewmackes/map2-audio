/**
 * ChainManagementCard - Compact Chain Management UI
 *
 * Provides all chain management features in a clean, collapsible card:
 * - Create new chains
 * - Activate/deactivate chains
 * - Rename chains
 * - Delete chains
 * - Quick overview stats
 */

import { useState, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Power,
  Trash2,
  Edit3,
  Check,
  X,
  Loader2,
  Link2,
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
  defaultExpanded = false,
}: ChainManagementCardProps) {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()

  const [expanded, setExpanded] = useState(defaultExpanded)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newChainName, setNewChainName] = useState('')
  const [editingChainId, setEditingChainId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // Fetch chains
  const chainsQuery = useQuery<ChainsResponse>({
    queryKey: ['chains'],
    queryFn: chainsApi.list,
    refetchInterval: 5000,
  })

  const chains = chainsQuery.data?.chains || []
  const activeChain = chains.find(c => c.is_active)
  const totalPlugins = chains.reduce((sum, c) => sum + c.plugins.length, 0)

  // Filter chains by search
  const filteredChains = useMemo(() => {
    if (!searchQuery.trim()) return chains
    const q = searchQuery.toLowerCase()
    return chains.filter(c => c.name.toLowerCase().includes(q))
  }, [chains, searchQuery])

  // Mutations
  const createMutation = useMutation({
    mutationFn: (name: string) => chainsApi.create(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      setNewChainName('')
      setShowCreateForm(false)
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

  const handleDelete = (chain: Chain) => {
    if (confirm(`Delete "${chain.name}"? This cannot be undone.`)) {
      deleteMutation.mutate(chain.id)
    }
  }

  const startEditing = (chain: Chain) => {
    setEditingChainId(chain.id)
    setEditingName(chain.name)
  }

  const cancelEditing = () => {
    setEditingChainId(null)
    setEditingName('')
  }

  const isPending = createMutation.isPending || activateMutation.isPending ||
    deactivateMutation.isPending || deleteMutation.isPending || renameMutation.isPending

  return (
    <div className="chain-mgmt-card">
      {/* Header - always visible */}
      <button
        className="chain-mgmt-header"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="chain-mgmt-header-left">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <Layers size={16} />
          <span className="chain-mgmt-title">Chains</span>
        </div>
        <div className="chain-mgmt-header-stats">
          <span className="chain-mgmt-stat">
            {chains.length} chain{chains.length !== 1 ? 's' : ''}
          </span>
          {activeChain && (
            <span className="chain-mgmt-active-badge">
              <Link2 size={12} />
              {activeChain.name}
            </span>
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="chain-mgmt-content">
          {/* Quick stats */}
          <div className="chain-mgmt-stats-row">
            <div className="chain-mgmt-stat-item">
              <span className="chain-mgmt-stat-value">{chains.length}</span>
              <span className="chain-mgmt-stat-label">Chains</span>
            </div>
            <div className="chain-mgmt-stat-item">
              <span className="chain-mgmt-stat-value">{totalPlugins}</span>
              <span className="chain-mgmt-stat-label">Plugins</span>
            </div>
            <div className="chain-mgmt-stat-item active">
              <span className="chain-mgmt-stat-value">{activeChain?.name || '—'}</span>
              <span className="chain-mgmt-stat-label">Active</span>
            </div>
          </div>

          {/* Actions bar */}
          <div className="chain-mgmt-actions">
            {!showCreateForm ? (
              <button
                className="chain-mgmt-action-btn primary"
                onClick={() => setShowCreateForm(true)}
              >
                <Plus size={14} />
                New Chain
              </button>
            ) : (
              <div className="chain-mgmt-create-form">
                <input
                  type="text"
                  className="chain-mgmt-input"
                  placeholder="Chain name..."
                  value={newChainName}
                  onChange={(e) => setNewChainName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate()
                    if (e.key === 'Escape') {
                      setShowCreateForm(false)
                      setNewChainName('')
                    }
                  }}
                  autoFocus
                  disabled={createMutation.isPending}
                />
                <button
                  className="chain-mgmt-icon-btn success"
                  onClick={handleCreate}
                  disabled={!newChainName.trim() || createMutation.isPending}
                  title="Create"
                >
                  {createMutation.isPending ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
                </button>
                <button
                  className="chain-mgmt-icon-btn"
                  onClick={() => {
                    setShowCreateForm(false)
                    setNewChainName('')
                  }}
                  title="Cancel"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {chains.length > 5 && (
              <input
                type="text"
                className="chain-mgmt-search"
                placeholder="Filter..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            )}
          </div>

          {/* Chain list */}
          <div className="chain-mgmt-list">
            {chainsQuery.isLoading ? (
              <div className="chain-mgmt-loading">
                <Loader2 size={16} className="spin" />
                Loading chains...
              </div>
            ) : filteredChains.length === 0 ? (
              <div className="chain-mgmt-empty">
                {searchQuery ? 'No chains match filter' : 'No chains yet'}
              </div>
            ) : (
              filteredChains.map(chain => (
                <div
                  key={chain.id}
                  className={`chain-mgmt-item ${chain.is_active ? 'active' : ''} ${selectedChainId === chain.id ? 'selected' : ''}`}
                >
                  {editingChainId === chain.id ? (
                    <div className="chain-mgmt-edit-row">
                      <input
                        type="text"
                        className="chain-mgmt-input"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(chain.id)
                          if (e.key === 'Escape') cancelEditing()
                        }}
                        autoFocus
                        disabled={renameMutation.isPending}
                      />
                      <button
                        className="chain-mgmt-icon-btn success"
                        onClick={() => handleRename(chain.id)}
                        disabled={!editingName.trim() || renameMutation.isPending}
                        title="Save"
                      >
                        {renameMutation.isPending ? <Loader2 size={12} className="spin" /> : <Check size={12} />}
                      </button>
                      <button
                        className="chain-mgmt-icon-btn"
                        onClick={cancelEditing}
                        title="Cancel"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div
                        className="chain-mgmt-item-info"
                        onClick={() => onChainSelect?.(chain.id)}
                        title={`${chain.plugins.length} plugins`}
                      >
                        <span className="chain-mgmt-item-name">{chain.name}</span>
                        <span className="chain-mgmt-item-meta">
                          {chain.plugins.length}p
                          {chain.is_active && <span className="chain-mgmt-active-dot" />}
                        </span>
                      </div>
                      <div className="chain-mgmt-item-actions">
                        {chain.is_active ? (
                          <button
                            className="chain-mgmt-icon-btn warn"
                            onClick={() => deactivateMutation.mutate(chain.id)}
                            disabled={isPending}
                            title="Deactivate"
                          >
                            <Power size={12} />
                          </button>
                        ) : (
                          <button
                            className="chain-mgmt-icon-btn success"
                            onClick={() => activateMutation.mutate(chain.id)}
                            disabled={isPending}
                            title="Activate"
                          >
                            <Power size={12} />
                          </button>
                        )}
                        <button
                          className="chain-mgmt-icon-btn"
                          onClick={() => startEditing(chain)}
                          disabled={isPending}
                          title="Rename"
                        >
                          <Edit3 size={12} />
                        </button>
                        <button
                          className="chain-mgmt-icon-btn danger"
                          onClick={() => handleDelete(chain)}
                          disabled={isPending}
                          title="Delete"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default ChainManagementCard
