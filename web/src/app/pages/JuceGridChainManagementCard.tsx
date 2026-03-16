import { useMemo, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Add, Branch, Power, TrashCan } from '@carbon/icons-react'
import { Button, InlineLoading, Layer, Modal, Tag, TextInput, Tile } from '@carbon/react'
import { chainsApi } from '../../map2/api'
import { useToasts } from '../components/Toasts'
import type { Chain, ChainsResponse } from '../../map2/types'

interface FlowSlotRef {
  id: string
  chainId: number | null
  label: string
  color: string
}

interface JuceGridChainManagementCardProps {
  selectedChainId?: number | null
  onChainSelect?: (chainId: number) => void
  onSelectedChainRemoved?: (chainId: number) => void
  flowSlots?: FlowSlotRef[]
  focusedFlowLabel?: string
  onToggleSelectedChainActive: () => void
  onDuplicateChain: () => void
  onRenameChain: () => void
}

export function JuceGridChainManagementCard({
  selectedChainId,
  onChainSelect,
  onSelectedChainRemoved,
  flowSlots = [],
  focusedFlowLabel = 'A',
  onToggleSelectedChainActive,
  onDuplicateChain,
  onRenameChain,
}: JuceGridChainManagementCardProps) {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newChainName, setNewChainName] = useState('')
  const [pendingDeleteChain, setPendingDeleteChain] = useState<Chain | null>(null)

  const chainsQuery = useQuery<ChainsResponse>({
    queryKey: ['chains'],
    queryFn: () => chainsApi.list(),
    refetchInterval: 5000,
  })

  const chains = chainsQuery.data?.chains || []
  const selectedChain = useMemo(
    () => chains.find((chain) => chain.id === selectedChainId) ?? null,
    [chains, selectedChainId],
  )

  const createMutation = useMutation({
    mutationFn: (name: string) => chainsApi.create(name),
    onSuccess: async (createdChain) => {
      await queryClient.invalidateQueries({ queryKey: ['chains'] })
      setShowCreateModal(false)
      setNewChainName('')
      onChainSelect?.(createdChain.id)
      pushToast(`Chain "${createdChain.name}" created`, 'success')
    },
    onError: () => pushToast('Failed to create chain', 'error'),
  })

  const activateMutation = useMutation({
    mutationFn: (chainId: number) => chainsApi.activate(chainId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['chains'] })
      pushToast('Chain activated', 'success')
    },
    onError: () => pushToast('Failed to activate chain', 'error'),
  })

  const deactivateMutation = useMutation({
    mutationFn: (chainId: number) => chainsApi.deactivate(chainId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['chains'] })
      pushToast('Chain deactivated', 'info')
    },
    onError: () => pushToast('Failed to deactivate chain', 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: (chainId: number) => chainsApi.delete(chainId),
    onSuccess: async (_, chainId) => {
      await queryClient.invalidateQueries({ queryKey: ['chains'] })
      setPendingDeleteChain(null)
      onSelectedChainRemoved?.(chainId)
      pushToast('Chain deleted', 'warn')
    },
    onError: () => pushToast('Failed to delete chain', 'error'),
  })

  const isBusy = createMutation.isPending || activateMutation.isPending || deactivateMutation.isPending || deleteMutation.isPending

  const selectedChainFlowSlots = useMemo(
    () => selectedChain ? flowSlots.filter((slot) => slot.chainId === selectedChain.id) : [],
    [flowSlots, selectedChain],
  )
  const activeChains = useMemo(
    () => chains.filter((chain) => chain.is_active),
    [chains],
  )

  const handleTileKeyDown = (event: ReactKeyboardEvent<HTMLElement>, chainId: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onChainSelect?.(chainId)
    }
  }

  const toggleChainPower = (chain: Chain) => {
    if (chain.is_active) {
      deactivateMutation.mutate(chain.id)
      return
    }
    activateMutation.mutate(chain.id)
  }

  const submitCreateChain = () => {
    const normalizedName = newChainName.trim()
    if (!normalizedName) {
      return
    }
    createMutation.mutate(normalizedName)
  }

  return (
    <>
      <Layer className="juce-grid-page__chain-card">
        <div className="juce-grid-page__chain-card-header">
          <div className="juce-grid-page__chain-card-copy">
            <div className="juce-grid-page__chain-card-heading">
              <Branch size={18} />
              <strong>Chains</strong>
            </div>
            <p>A Chain is the Audio that will "Go Live" or be "Activated"</p>
          </div>
          <div className="juce-grid-page__chain-card-header-actions">
            <Tag type="cool-gray">Focus {focusedFlowLabel}</Tag>
          </div>
        </div>

        <div className="juce-grid-page__chain-action-grid">
          <div className="juce-grid-page__chain-active-display">
            <div className="juce-grid-page__chain-active-display-header">
              <span className="juce-grid-page__chain-action-label">Active chains</span>
              <Tag type={activeChains.length > 0 ? 'green' : 'cool-gray'}>
                {activeChains.length} live
              </Tag>
            </div>
            <div className="juce-grid-page__chain-active-display-line" aria-label="Currently active chains">
              {activeChains.length > 0 ? activeChains.map((chain) => {
                const flowsUsingChain = flowSlots.filter((slot) => slot.chainId === chain.id)
                const flowLabel = flowsUsingChain.length > 0
                  ? flowsUsingChain.map((slot) => slot.label).join('+')
                  : 'Live'
                const accentColor = flowsUsingChain[0]?.color || 'var(--cds-support-success, #24a148)'

                return (
                  <span
                    key={`active-chain-${chain.id}`}
                    className="juce-grid-page__chain-active-chip"
                    style={{ '--chain-active-accent': accentColor } as CSSProperties}
                  >
                    <span className="juce-grid-page__chain-active-chip-flow">{flowLabel}</span>
                    <span className="juce-grid-page__chain-active-chip-name">{chain.name}</span>
                  </span>
                )
              }) : (
                <span className="juce-grid-page__chain-active-chip is-empty">
                  <span className="juce-grid-page__chain-active-chip-name">No Active Chains</span>
                </span>
              )}
            </div>
          </div>

          <div className="juce-grid-page__chain-management-layout">
            <div className="juce-grid-page__chain-management-sidebar">
              <Tile className="juce-grid-page__chain-action-tile">
                <span className="juce-grid-page__chain-action-label">Selected chain</span>
                {selectedChain ? (
                  <>
                    <div className="juce-grid-page__chain-action-heading">
                      <strong>{selectedChain.name}</strong>
                      <div className="juce-grid-page__chain-action-tags">
                        <Tag type={selectedChain.is_active ? 'green' : 'cool-gray'}>
                          {selectedChain.is_active ? 'Active' : 'Inactive'}
                        </Tag>
                        <Tag type="cool-gray">{selectedChain.plugins.length} blocks</Tag>
                      </div>
                    </div>
                    <p className="juce-grid-page__chain-action-copy">
                      Assigned to focused flow {focusedFlowLabel}. Manage the focused chain while keeping the chooser visible beside this summary.
                    </p>
                    {selectedChainFlowSlots.length > 0 && (
                      <div className="juce-grid-page__chain-flow-tags">
                        {selectedChainFlowSlots.map((slot) => (
                          <Tag key={`${slot.id}-${slot.label}`} type="blue">
                            Flow {slot.label}
                          </Tag>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <strong>No chain assigned</strong>
                    <p className="juce-grid-page__chain-action-copy">
                      Select a chain from the chooser to the right to bind it to focused flow {focusedFlowLabel} before duplicating, renaming, or changing activation.
                    </p>
                  </>
                )}
              </Tile>

              <Tile className="juce-grid-page__chain-action-tile">
                <span className="juce-grid-page__chain-action-label">Chain operations</span>
                <p className="juce-grid-page__chain-action-copy">Create a new chain or manage the focused chain lifecycle inside the same Carbon action group.</p>
                <div className="juce-grid-page__chain-button-row">
                  <Button
                    size="sm"
                    kind="ghost"
                    renderIcon={Add}
                    onClick={() => setShowCreateModal(true)}
                    disabled={createMutation.isPending}
                  >
                    New chain
                  </Button>
                  <Button
                    size="sm"
                    kind={selectedChain?.is_active ? 'secondary' : 'primary'}
                    onClick={onToggleSelectedChainActive}
                    disabled={!selectedChain}
                  >
                    {selectedChain?.is_active ? 'Deactivate chain' : 'Activate chain'}
                  </Button>
                  <Button size="sm" kind="ghost" onClick={onDuplicateChain} disabled={!selectedChain}>
                    Duplicate
                  </Button>
                  <Button size="sm" kind="ghost" onClick={onRenameChain} disabled={!selectedChain}>
                    Rename chain
                  </Button>
                </div>
              </Tile>
            </div>

            <div className="juce-grid-page__chain-chooser-panel">
              <span className="juce-grid-page__chain-action-label">Chains chooser</span>
              {chainsQuery.isLoading ? (
                <div className="juce-grid-page__chain-loading">
                  <InlineLoading description="Loading chains" status="active" />
                </div>
              ) : (
                <div className="juce-grid-page__chain-grid" role="list" aria-label="Available chains">
                  {chains.map((chain) => {
                    const flowsUsingChain = flowSlots.filter((slot) => slot.chainId === chain.id)
                    const isSelected = selectedChainId === chain.id

                    return (
                      <article
                        key={chain.id}
                        role="listitem"
                        tabIndex={0}
                        className={`juce-grid-page__chain-tile ${isSelected ? 'is-selected' : ''} ${chain.is_active ? 'is-active' : ''}`}
                        onClick={() => onChainSelect?.(chain.id)}
                        onKeyDown={(event) => handleTileKeyDown(event, chain.id)}
                        aria-pressed={isSelected}
                      >
                        <div className="juce-grid-page__chain-tile-header">
                          <div className="juce-grid-page__chain-tile-copy">
                            <strong>{chain.name}</strong>
                            <span>{chain.plugins.length} loaded {chain.plugins.length === 1 ? 'block' : 'blocks'}</span>
                          </div>
                          <div className="juce-grid-page__chain-tile-tags">
                            {isSelected && <Tag type="blue">Focused</Tag>}
                            {chain.is_active && <Tag type="green">Active</Tag>}
                          </div>
                        </div>

                        <div className="juce-grid-page__chain-tile-meta">
                          {flowsUsingChain.length > 0 ? (
                            <div className="juce-grid-page__chain-flow-pills">
                              {flowsUsingChain.map((slot) => (
                                <span
                                  key={`${chain.id}-${slot.id}`}
                                  className="juce-grid-page__chain-flow-pill"
                                  style={{ '--chain-flow-color': slot.color } as CSSProperties}
                                >
                                  {slot.label}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="juce-grid-page__chain-empty-copy">Not assigned to a flow</span>
                          )}
                        </div>

                        <div className="juce-grid-page__chain-tile-actions">
                          <Button
                            size="sm"
                            kind={chain.is_active ? 'secondary' : 'ghost'}
                            hasIconOnly
                            renderIcon={Power}
                            iconDescription={chain.is_active ? `Deactivate ${chain.name}` : `Activate ${chain.name}`}
                            onClick={(event) => {
                              event.stopPropagation()
                              toggleChainPower(chain)
                            }}
                            disabled={isBusy}
                          />
                          <Button
                            size="sm"
                            kind="danger--tertiary"
                            hasIconOnly
                            renderIcon={TrashCan}
                            iconDescription={`Delete ${chain.name}`}
                            onClick={(event) => {
                              event.stopPropagation()
                              setPendingDeleteChain(chain)
                            }}
                            disabled={isBusy}
                          />
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </Layer>

      {showCreateModal && (
        <Modal
          open
          modalHeading="Create chain"
          primaryButtonText={createMutation.isPending ? 'Creating...' : 'Create chain'}
          secondaryButtonText="Cancel"
          primaryButtonDisabled={newChainName.trim().length === 0 || createMutation.isPending}
          onRequestClose={() => {
            setShowCreateModal(false)
            setNewChainName('')
          }}
          onSecondarySubmit={() => {
            setShowCreateModal(false)
            setNewChainName('')
          }}
          onRequestSubmit={submitCreateChain}
        >
          <div className="juce-grid-page__form-modal-body">
            <p className="juce-grid-page__modal-copy">
              Create a new chain and assign it to focused flow {focusedFlowLabel}.
            </p>
            <TextInput
              id="juce-grid-create-chain-name"
              labelText="Chain name"
              value={newChainName}
              onChange={(event) => setNewChainName(event.target.value)}
              autoFocus
            />
          </div>
        </Modal>
      )}

      {pendingDeleteChain && (
        <Modal
          open
          danger
          modalHeading={`Delete ${pendingDeleteChain.name}?`}
          primaryButtonText={deleteMutation.isPending ? 'Deleting...' : 'Delete chain'}
          secondaryButtonText="Cancel"
          primaryButtonDisabled={deleteMutation.isPending}
          onRequestClose={() => setPendingDeleteChain(null)}
          onSecondarySubmit={() => setPendingDeleteChain(null)}
          onRequestSubmit={() => deleteMutation.mutate(pendingDeleteChain.id)}
        >
          <div className="juce-grid-page__form-modal-body">
            <p className="juce-grid-page__modal-copy">
              Remove this chain from the library. Any flows using it will be cleared on this page.
            </p>
          </div>
        </Modal>
      )}
    </>
  )
}
