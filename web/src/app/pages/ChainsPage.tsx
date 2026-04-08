import { useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  InlineLoading,
  InlineNotification,
  Layer,
  Modal,
  OverflowMenu,
  OverflowMenuItem,
  Search,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  TextInput,
} from '@carbon/react'
import {
  Add,
  CheckmarkFilled,
  Flow,
  Renew,
} from '@carbon/icons-react'
import type { Chain, ChainsResponse } from '../../map2/types'
import { chainsApi } from '../../map2/api'
import { useToasts } from '../components/Toasts'
import { MapAudioGridIcon } from '../components/icons/map'
import { SidechainPanel } from '../components/Routing/SidechainPanel'
import { ParallelRoutingPanel } from '../components/Routing/ParallelRoutingPanel'
import { EffectsLoopSummaryPanel } from '../components/Routing/EffectsLoopSummaryPanel'
import { ChainDeployModal } from '../components/chains/ChainDeployModal'
import { useIsMobile } from '../hooks/useIsMobile'
import { useCluster } from '../contexts/useCluster'
import { useNodePageContext } from '../hooks/useNodePageContext'
import { useViewedNodeStore } from '../stores/viewedNodeStore'
import { NODE_PAGE_KEYS } from '../utils/nodeDisplay'
import './ChainsPage.css'

type ClusterChainsFanoutResponse = {
  nodes?: Record<string, { status_code?: number; body?: ChainsResponse }>
}

type MetricTone = 'gray' | 'green' | 'warm-gray'

const RUNTIME_CHAIN_CONTROL_NOTICE = 'These controls switch runtime chains directly. Control-plane snapshot truth lives in Audio Grid.'

function AudioGridActionIcon(props: { className?: string }) {
  return <MapAudioGridIcon {...props} size={16} />
}

function formatUpdatedAt(value: string | undefined): string {
  if (!value) {
    return '--'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return '--'
  }

  return parsed.toLocaleString()
}

function statusTagType(statusCode: number | undefined): 'green' | 'red' | 'warm-gray' {
  if (statusCode === 200) {
    return 'green'
  }

  if (typeof statusCode === 'number' && statusCode >= 500) {
    return 'red'
  }

  return 'warm-gray'
}

interface ChainsMetricCardProps {
  label: string
  value: ReactNode
  helper: string
  tone?: MetricTone
}

function ChainsMetricCard({ label, value, helper, tone = 'gray' }: ChainsMetricCardProps) {
  return (
    <Layer className="chains-page__metric-card">
      <div className="chains-page__metric-label">{label}</div>
      <div className="chains-page__metric-value">{value}</div>
      <Tag type={tone}>{helper}</Tag>
    </Layer>
  )
}

export function ChainsPage() {
  const queryClient = useQueryClient()
  const isMobile = useIsMobile()
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [deployChain, setDeployChain] = useState<Chain | null>(null)
  const [chainName, setChainName] = useState('')
  const [searchValue, setSearchValue] = useState('')
  const { pushToast } = useToasts()
  const setViewedNode = useViewedNodeStore((state) => state.setViewedNode)
  const { localNode: pageLocalNode, viewedNode, viewedNodeId } = useNodePageContext(NODE_PAGE_KEYS.chains)
  const { activeNodeId, nodes: clusterNodes, localNodeId, setActiveNode, isClusterMode } = useCluster()

  const allNodesSelected = activeNodeId === 'all'
  const selectedNode = (viewedNode?.node_id === viewedNodeId ? viewedNode : null)
    ?? clusterNodes.find((node) => node.nodeId === viewedNodeId)
    ?? clusterNodes.find((node) => node.nodeId === activeNodeId)
  const resolvedLocalNodeId = pageLocalNode?.node_id ?? localNodeId
  const remoteSelected = !allNodesSelected && Boolean(viewedNodeId && viewedNodeId !== resolvedLocalNodeId)
  const apiNodeId = remoteSelected ? viewedNodeId : null
  const scopeKey = allNodesSelected ? 'all' : (apiNodeId ?? localNodeId)
  const remoteLabel = remoteSelected ? (selectedNode?.hostname ?? viewedNodeId ?? null) : null
  const remoteLatencyMs = remoteSelected && selectedNode && 'latencyMs' in selectedNode
    ? selectedNode.latencyMs ?? null
    : null

  const chainsKey = ['chains', scopeKey] as const

  const chainsQuery = useQuery<ChainsResponse>({
    queryKey: chainsKey,
    queryFn: () => chainsApi.list(apiNodeId),
    enabled: !allNodesSelected,
  })

  const clusterChainsQuery = useQuery<ClusterChainsFanoutResponse>({
    queryKey: ['chains', 'cluster-comparison'],
    queryFn: async () => {
      const response = await fetch('/api/chains/?node_id=all', { cache: 'no-store' })
      if (!response.ok) {
        throw new Error('Failed to load cluster chain inventory')
      }
      return response.json() as Promise<ClusterChainsFanoutResponse>
    },
    enabled: allNodesSelected,
    staleTime: 5000,
  })

  const filteredChains = useMemo(() => {
    const query = searchValue.trim().toLowerCase()
    if (!query) {
      return chainsQuery.data?.chains ?? []
    }

    return chainsQuery.data?.chains.filter((chain) => chain.name.toLowerCase().includes(query)) ?? []
  }, [chainsQuery.data, searchValue])

  const createChain = useMutation({
    mutationFn: (name: string) => chainsApi.create(name, apiNodeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      setChainName('')
      setCreateDialogOpen(false)
      pushToast('Chain created', 'success')
    },
    onError: () => pushToast('Failed to create chain', 'error'),
  })

  const activateChain = useMutation({
    mutationFn: (id: number) => chainsApi.activate(id, apiNodeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      pushToast('Runtime chain activated', 'success')
    },
    onError: () => pushToast('Failed to activate runtime chain', 'error'),
  })

  const deactivateChain = useMutation({
    mutationFn: (id: number) => chainsApi.deactivate(id, apiNodeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      pushToast('Runtime chain stopped', 'info')
    },
    onError: () => pushToast('Failed to stop runtime chain', 'error'),
  })

  const deleteChain = useMutation({
    mutationFn: (id: number) => chainsApi.delete(id, apiNodeId),
    onSuccess: (_, id) => {
      queryClient.setQueryData(chainsKey, (data?: ChainsResponse) => {
        if (!data) {
          return data
        }

        return {
          ...data,
          count: Math.max(0, data.count - 1),
          chains: data.chains.filter((chain) => chain.id !== id),
        }
      })
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      pushToast('Chain deleted', 'warn')
    },
    onError: () => pushToast('Failed to delete chain', 'error'),
  })

  const renameChain = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => chainsApi.rename(id, name, apiNodeId),
    onSuccess: (_, { id, name }) => {
      queryClient.setQueryData(chainsKey, (data?: ChainsResponse) => {
        if (!data) {
          return data
        }

        return {
          ...data,
          chains: data.chains.map((chain) => (chain.id === id ? { ...chain, name, updated_at: new Date().toISOString() } : chain)),
        }
      })
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      pushToast('Chain renamed', 'success')
    },
    onError: () => pushToast('Failed to rename chain', 'error'),
  })

  const activeChain = chainsQuery.data?.chains.find((chain) => chain.is_active)
  const totalPlugins = chainsQuery.data?.chains.reduce((acc, chain) => acc + chain.plugins.length, 0) ?? 0

  const clusterRows = useMemo(() => {
    const payload = clusterChainsQuery.data?.nodes ?? {}
    return clusterNodes.map((node) => {
      const body = payload[node.nodeId]?.body
      const chains = body?.chains ?? []
      const active = chains.find((chain) => chain.is_active)
      const plugins = chains.reduce((acc, chain) => acc + chain.plugins.length, 0)

      return {
        node,
        chainCount: chains.length,
        activeName: active?.name ?? null,
        totalPlugins: plugins,
        statusCode: payload[node.nodeId]?.status_code ?? (node.isOnline ? 200 : undefined),
      }
    })
  }, [clusterChainsQuery.data?.nodes, clusterNodes])

  const handleCreate = () => {
    const trimmed = chainName.trim()
    if (!trimmed) {
      return
    }

    createChain.mutate(trimmed)
  }

  const handleRefresh = () => {
    if (allNodesSelected) {
      clusterChainsQuery.refetch()
      return
    }

    chainsQuery.refetch()
  }

  if (allNodesSelected) {
    const totalClusterChains = clusterRows.reduce((sum, row) => sum + row.chainCount, 0)
    const nodesWithActiveChains = clusterRows.filter((row) => row.activeName).length
    const totalClusterPlugins = clusterRows.reduce((sum, row) => sum + row.totalPlugins, 0)

    return (
      <div className="chains-page">
        <Layer className="chains-page__hero">
          <div className="chains-page__header-row">
            <div className="chains-page__title-block">
              <Flow size={32} aria-hidden="true" className="chains-page__title-icon" />
              <div>
                <h1 className="chains-page__title">Chains</h1>
                <p className="chains-page__subtitle">Cluster-wide runtime chain inventory and direct runtime-selection comparison</p>
              </div>
            </div>
            <div className="chains-page__actions">
              <Button kind="ghost" size="sm" renderIcon={Renew} onClick={handleRefresh}>
                Refresh
              </Button>
            </div>
          </div>

          <div className="chains-page__scope-card chains-page__scope-card--all">
            <div className="chains-page__scope-label">Chain scope</div>
            <strong className="chains-page__scope-title">All nodes cluster comparison</strong>
            <p className="chains-page__scope-copy">
              Compare chain counts, runtime-active chains, and plugin footprint across the cluster, then inspect one node to manage direct runtime chain switching.
            </p>
          </div>

          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title="Runtime-only chain controls"
            subtitle={RUNTIME_CHAIN_CONTROL_NOTICE}
          />
        </Layer>

        <div className="chains-page__metrics-grid">
          <ChainsMetricCard label="Total chains" value={totalClusterChains} helper="Across all nodes" />
          <ChainsMetricCard label="Nodes with runtime-active chain" value={nodesWithActiveChains} helper="Runtime selection" tone="green" />
          <ChainsMetricCard label="Plugins across chains" value={totalClusterPlugins} helper="Cluster footprint" />
        </div>

        <Layer className="chains-page__panel">
          <div className="chains-page__panel-header">
            <div>
              <h2 className="chains-page__panel-title">Cluster chain inventory</h2>
              <p className="chains-page__panel-subtitle">Inspect a node to manage its signal-chain inventory.</p>
            </div>
          </div>

          {clusterChainsQuery.isLoading ? (
            <InlineLoading description="Loading cluster chains..." />
          ) : clusterChainsQuery.error ? (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title="Failed to load cluster chain inventory"
              subtitle="The backend did not return cluster chain data for all nodes."
            />
          ) : (
            <TableContainer className="chains-page__table-wrap">
              <Table size="sm" className="chains-page__table">
                <TableHead>
                  <TableRow>
                    <TableHeader>Node</TableHeader>
                    <TableHeader>Chains</TableHeader>
                    <TableHeader>Runtime-active chain</TableHeader>
                    <TableHeader>Plugins</TableHeader>
                    <TableHeader>Status</TableHeader>
                    <TableHeader className="chains-page__table-cell--actions">Action</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {clusterRows.map((row) => (
                    <TableRow key={row.node.nodeId}>
                      <TableCell>
                        <div className="chains-page__row-primary">
                          {row.node.isLocal ? `${row.node.hostname} (Local)` : row.node.hostname}
                        </div>
                        <div className="chains-page__row-secondary">{row.node.nodeId}</div>
                      </TableCell>
                      <TableCell>{row.chainCount}</TableCell>
                      <TableCell>{row.activeName ?? 'None runtime-active'}</TableCell>
                      <TableCell>{row.totalPlugins}</TableCell>
                      <TableCell>
                        <Tag type={statusTagType(row.statusCode)}>{row.statusCode === 200 ? 'Online' : 'Unavailable'}</Tag>
                      </TableCell>
                      <TableCell className="chains-page__table-cell--actions">
                        <Button
                          kind="tertiary"
                          size="sm"
                          onClick={() => {
                            setActiveNode(null)
                            setViewedNode(NODE_PAGE_KEYS.chains, row.node.nodeId)
                          }}
                        >
                          Inspect
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Layer>
      </div>
    )
  }

  return (
    <div className="chains-page">
      <Layer className="chains-page__hero">
        <div className="chains-page__header-row">
          <div className="chains-page__title-block">
            <Flow size={32} aria-hidden="true" className="chains-page__title-icon" />
            <div>
              <h1 className="chains-page__title">{remoteSelected ? `Chains - ${selectedNode?.hostname ?? viewedNodeId}` : 'Chains'}</h1>
              <p className="chains-page__subtitle">
                {remoteSelected
                  ? `Inspect and runtime-switch processing chains on ${selectedNode?.hostname ?? viewedNodeId}.`
                  : 'Inspect and runtime-switch processing chains for this node.'}
              </p>
            </div>
          </div>

          <div className="chains-page__actions">
            {remoteSelected ? <Tag type="warm-gray">Audio Grid local only</Tag> : (
              <Button kind="ghost" size="sm" href="/juce-grid" renderIcon={AudioGridActionIcon}>
                Audio Grid
              </Button>
            )}
            <Button kind="ghost" size="sm" renderIcon={Renew} onClick={handleRefresh}>
              Refresh
            </Button>
            <Button kind="primary" size="sm" renderIcon={Add} onClick={() => setCreateDialogOpen(true)}>
              New chain
            </Button>
          </div>
        </div>

        {isClusterMode ? (
          <div className={`chains-page__scope-card ${remoteSelected ? 'chains-page__scope-card--remote' : 'chains-page__scope-card--local'}`}>
            <div className="chains-page__scope-label">Chain scope</div>
            <strong className="chains-page__scope-title">{remoteSelected ? selectedNode?.hostname ?? viewedNodeId : 'Local node'}</strong>
            <p className="chains-page__scope-copy">
              {remoteSelected
                ? `Runtime chain actions are proxied to ${selectedNode?.hostname ?? viewedNodeId}${remoteLatencyMs == null ? '' : ` with peer latency ${remoteLatencyMs.toFixed(1)} ms`}.`
                : 'This page edits local runtime chain inventory. Select all nodes for comparison, or switch to a peer node to manage remote runtime chain inventory.'}
            </p>
          </div>
        ) : null}

        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title="Runtime-only chain controls"
          subtitle={RUNTIME_CHAIN_CONTROL_NOTICE}
        />
      </Layer>

      <div className="chains-page__metrics-grid">
        <ChainsMetricCard
          label="Total chains"
          value={chainsQuery.data?.count ?? '--'}
          helper={chainsQuery.isFetching ? 'Refreshing' : 'Inventory'}
        />
        <ChainsMetricCard
          label="Runtime-active chain"
          value={activeChain?.name ?? 'None runtime-active'}
          helper={activeChain ? 'Runtime only' : 'Direct switch'}
          tone={activeChain ? 'green' : 'warm-gray'}
        />
        <ChainsMetricCard label="Plugins across chains" value={totalPlugins} helper="Footprint" />
      </div>

      <Layer className="chains-page__panel">
        <div className="chains-page__panel-header">
          <div>
            <h2 className="chains-page__panel-title">All chains</h2>
            <p className="chains-page__panel-subtitle">Search, deploy, and manage runtime chain inventory.</p>
          </div>
          <Search
            id="chains-search"
            size="sm"
            labelText="Search chains"
            placeholder="Filter by chain name"
            value={searchValue}
            onChange={(event) => setSearchValue(event.currentTarget.value)}
            className="chains-page__search"
          />
        </div>

        {chainsQuery.isLoading ? (
          <InlineLoading description="Loading chains..." />
        ) : chainsQuery.error ? (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title="Failed to load chains"
            subtitle="The backend did not return chain inventory for this node."
          />
        ) : filteredChains.length === 0 ? (
          <InlineNotification
            kind="info"
            lowContrast
            hideCloseButton
            title="No chains found"
            subtitle={searchValue.trim() ? 'No chains match that filter.' : 'Create a chain to begin routing plugins.'}
          />
        ) : (
          <TableContainer className="chains-page__table-wrap">
            <Table size="sm" className="chains-page__table">
              <TableHead>
                <TableRow>
                  <TableHeader>Name</TableHeader>
                  <TableHeader>Plugins</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Updated</TableHeader>
                  <TableHeader className="chains-page__table-cell--actions">Actions</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredChains.map((chain) => (
                  <ChainRow
                    key={chain.id}
                    chain={chain}
                    isMobile={isMobile}
                    canDeploy={isClusterMode}
                    onActivate={() => activateChain.mutate(chain.id)}
                    onDeactivate={() => deactivateChain.mutate(chain.id)}
                    onDelete={() => deleteChain.mutate(chain.id)}
                    onDeploy={() => setDeployChain(chain)}
                    onRename={(newName) => renameChain.mutate({ id: chain.id, name: newName })}
                    disableActions={activateChain.isPending || deactivateChain.isPending || deleteChain.isPending}
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Layer>

      <Layer className="chains-page__panel chains-page__panel--routing">
        <div className="chains-page__panel-header">
          <div>
            <h2 className="chains-page__panel-title">Advanced routing</h2>
            <p className="chains-page__panel-subtitle">
              Sidechain, parallel, and external-loop controls for {remoteSelected ? `${selectedNode?.hostname ?? viewedNodeId}` : 'the local node'}.
            </p>
          </div>
        </div>

        <div className="chains-page__routing-grid">
          <Layer className="chains-page__routing-surface">
            <ParallelRoutingPanel nodeId={apiNodeId} remoteLabel={remoteLabel} latencyMs={remoteLatencyMs} />
          </Layer>
          <Layer className="chains-page__routing-surface">
            <SidechainPanel nodeId={apiNodeId} remoteLabel={remoteLabel} latencyMs={remoteLatencyMs} />
          </Layer>
        </div>

        <Layer className="chains-page__routing-summary">
          <EffectsLoopSummaryPanel
            nodeId={apiNodeId}
            chains={chainsQuery.data?.chains ?? []}
            remoteLabel={remoteLabel}
            latencyMs={remoteLatencyMs}
          />
        </Layer>
      </Layer>

      <Modal
        open={createDialogOpen}
        size={isMobile ? 'lg' : 'sm'}
        modalLabel={remoteSelected ? `Target ${selectedNode?.hostname ?? viewedNodeId}` : 'Local node'}
        modalHeading="Create a new chain"
        primaryButtonText={createChain.isPending ? 'Creating...' : 'Create chain'}
        secondaryButtonText="Cancel"
        primaryButtonDisabled={createChain.isPending || !chainName.trim()}
        onRequestClose={() => {
          if (createChain.isPending) {
            return
          }
          setCreateDialogOpen(false)
          setChainName('')
        }}
        onRequestSubmit={handleCreate}
        selectorPrimaryFocus="#chains-create-name-input"
      >
        <p className="chains-page__modal-copy">Name the chain, then add plugins from the plugins view.</p>
        <TextInput
          id="chains-create-name-input"
          labelText="Chain name"
          placeholder="Example: modern crunch"
          autoFocus
          value={chainName}
          onChange={(event) => setChainName(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && chainName.trim()) {
              event.preventDefault()
              handleCreate()
            }
          }}
        />
      </Modal>

      <ChainDeployModal
        open={Boolean(deployChain)}
        chain={deployChain}
        sourceNodeId={apiNodeId ?? resolvedLocalNodeId}
        onClose={() => setDeployChain(null)}
      />
    </div>
  )
}

function ChainRow({
  chain,
  isMobile,
  canDeploy,
  onActivate,
  onDeactivate,
  onDelete,
  onDeploy,
  onRename,
  disableActions,
}: {
  chain: Chain
  isMobile: boolean
  canDeploy?: boolean
  onActivate: () => void
  onDeactivate: () => void
  onDelete: () => void
  onDeploy?: () => void
  onRename: (name: string) => void
  disableActions: boolean
}) {
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [renameValue, setRenameValue] = useState(chain.name)
  const pluginCount = chain.plugins.length
  const renameInputId = `chains-rename-input-${chain.id}`

  const handleRenameSubmit = () => {
    const trimmed = renameValue.trim()
    if (!trimmed) {
      return
    }

    onRename(trimmed)
    setRenameDialogOpen(false)
  }

  const handleDeleteSubmit = () => {
    onDelete()
    setDeleteDialogOpen(false)
  }

  return (
    <TableRow>
      <TableCell>
        <div className="chains-page__row-primary">{chain.name}</div>
      </TableCell>
      <TableCell>{pluginCount} plugin{pluginCount === 1 ? '' : 's'}</TableCell>
      <TableCell>
        <Tag type={chain.is_active ? 'green' : 'gray'}>
          {chain.is_active ? (
            <span className="chains-page__tag-with-icon">
              <CheckmarkFilled size={14} aria-hidden="true" />
              Runtime active
            </span>
          ) : (
            'Runtime standby'
          )}
        </Tag>
      </TableCell>
      <TableCell>{formatUpdatedAt(chain.updated_at)}</TableCell>
      <TableCell className="chains-page__table-cell--actions">
        <OverflowMenu
          ariaLabel={`Actions for ${chain.name}`}
          iconDescription={`Actions for ${chain.name}`}
          size="sm"
          flipped
          disabled={disableActions}
        >
          {!chain.is_active ? (
            <OverflowMenuItem itemText="Set runtime active" onClick={onActivate} disabled={disableActions} />
          ) : (
            <OverflowMenuItem itemText="Stop runtime chain" onClick={onDeactivate} disabled={disableActions} />
          )}
          {canDeploy && onDeploy ? (
            <OverflowMenuItem itemText="Deploy" onClick={onDeploy} disabled={disableActions} />
          ) : null}
          <OverflowMenuItem
            itemText="Rename"
            onClick={() => {
              setRenameValue(chain.name)
              setRenameDialogOpen(true)
            }}
            disabled={disableActions}
          />
          <OverflowMenuItem
            itemText="Delete"
            isDelete
            onClick={() => setDeleteDialogOpen(true)}
            disabled={disableActions}
          />
        </OverflowMenu>

        <Modal
          open={renameDialogOpen}
          size={isMobile ? 'lg' : 'sm'}
          modalHeading="Rename chain"
          primaryButtonText="Rename"
          secondaryButtonText="Cancel"
          primaryButtonDisabled={disableActions || !renameValue.trim()}
          onRequestClose={() => setRenameDialogOpen(false)}
          onRequestSubmit={handleRenameSubmit}
          selectorPrimaryFocus={`#${renameInputId}`}
        >
          <p className="chains-page__modal-copy">Update the chain name while preserving routing and plugin order.</p>
          <TextInput
            id={renameInputId}
            labelText="Chain name"
            placeholder="Example: modern crunch"
            autoFocus
            value={renameValue}
            onChange={(event) => setRenameValue(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && renameValue.trim()) {
                event.preventDefault()
                handleRenameSubmit()
              }
            }}
          />
        </Modal>

        <Modal
          open={deleteDialogOpen}
          danger
          size={isMobile ? 'lg' : 'sm'}
          modalHeading="Delete this chain?"
          primaryButtonText="Delete chain"
          secondaryButtonText="Cancel"
          primaryButtonDisabled={disableActions}
          onRequestClose={() => setDeleteDialogOpen(false)}
          onRequestSubmit={handleDeleteSubmit}
        >
          <p className="chains-page__modal-copy">
            Deleting removes the chain and its routing from inventory. Presets remain available.
          </p>
          <p className="chains-page__modal-copy chains-page__modal-copy--strong">Chain: {chain.name}</p>
        </Modal>
      </TableCell>
    </TableRow>
  )
}
