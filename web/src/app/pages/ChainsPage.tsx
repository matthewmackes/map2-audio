import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Combobox,
  ComboboxItem,
  ComboboxPopover,
  ComboboxProvider,
  useComboboxStore,
  Menu,
  MenuButton,
  MenuItem,
  MenuProvider,
  useMenuStore,
} from '@ariakit/react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
} from '@mui/material'
import { SealCheck, SpinnerGap, Plus, Power, Trash, Link, ArrowsClockwise } from '@phosphor-icons/react'
import type { Chain, ChainsResponse } from '../../map2/types'
import { chainsApi } from '../../map2/api'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { useToasts } from '../components/Toasts'
import { SidechainPanel } from '../components/Routing/SidechainPanel'
import { ParallelRoutingPanel } from '../components/Routing/ParallelRoutingPanel'
import { EffectsLoopSummaryPanel } from '../components/Routing/EffectsLoopSummaryPanel'
import { ChainDeployModal } from '../components/chains/ChainDeployModal'
import { useIsMobile } from '../hooks/useIsMobile'
import { useCluster } from '../contexts/ClusterContext'

type ClusterChainsFanoutResponse = {
  nodes?: Record<string, { status_code?: number; body?: ChainsResponse }>
}

export function ChainsPage() {
  const queryClient = useQueryClient()
  const isMobile = useIsMobile()
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [deployChain, setDeployChain] = useState<Chain | null>(null)
  const [chainName, setChainName] = useState('')
  const { pushToast } = useToasts()
  const { activeNodeId, nodes: clusterNodes, localNodeId, setActiveNode, isClusterMode } = useCluster()
  const allNodesSelected = activeNodeId === 'all'
  const selectedNode = clusterNodes.find((node) => node.nodeId === activeNodeId)
  const remoteSelected = Boolean(activeNodeId && activeNodeId !== 'all' && activeNodeId !== localNodeId)
  const apiNodeId = remoteSelected ? activeNodeId : null
  const scopeKey = allNodesSelected ? 'all' : (apiNodeId ?? localNodeId)
  const remoteLabel = remoteSelected ? (selectedNode?.hostname ?? activeNodeId ?? null) : null
  const remoteLatencyMs = remoteSelected ? (selectedNode?.latencyMs ?? null) : null

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
  const chainNames = useMemo(() => chainsQuery.data?.chains.map((chain) => chain.name) ?? [], [chainsQuery.data])

  const combobox = useComboboxStore()
  const searchValue = (combobox.getState().value ?? '').toLowerCase()
  const filteredChains = useMemo(
    () => chainsQuery.data?.chains.filter((chain) => chain.name.toLowerCase().includes(searchValue)) ?? [],
    [chainsQuery.data, searchValue]
  )

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
      pushToast('Chain activated', 'success')
    },
    onError: () => pushToast('Failed to activate chain', 'error'),
  })

  const deactivateChain = useMutation({
    mutationFn: (id: number) => chainsApi.deactivate(id, apiNodeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      pushToast('Chain deactivated', 'info')
    },
    onError: () => pushToast('Failed to deactivate chain', 'error'),
  })

  const deleteChain = useMutation({
    mutationFn: (id: number) => chainsApi.delete(id, apiNodeId),
    onSuccess: (_, id) => {
      queryClient.setQueryData(chainsKey, (data?: ChainsResponse) => {
        if (!data) return data
        return { ...data, count: Math.max(0, data.count - 1), chains: data.chains.filter((chain) => chain.id !== id) }
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
        if (!data) return data
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

  const handleCreate = (event: React.FormEvent) => {
    event.preventDefault()
    if (!chainName.trim()) return
    createChain.mutate(chainName.trim())
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
      <div className="stack chains-page">
        <PageHeader
          title="Chains · All Nodes"
          subtitle="Cluster-wide chain inventory and active selection comparison"
          icon={<Link size={32} weight="duotone" style={{ color: '#2563eb' }} />}
          actions={
            <button className="btn btn-secondary" onClick={handleRefresh}>
              <ArrowsClockwise size={16} weight="duotone" /> Refresh
            </button>
          }
        />

        <div
          className="card"
          style={{
            background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(15, 23, 42, 0.94))',
            borderColor: 'rgba(96, 165, 250, 0.28)',
          }}
        >
          <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.1, color: '#94a3b8', marginBottom: 8 }}>
            Chain Scope
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>All Nodes cluster comparison</div>
          <p style={{ margin: 0, color: '#cbd5e1', fontSize: 14, lineHeight: 1.6 }}>
            Compare chain counts, active chains, and plugin footprint across the cluster, then switch to a specific node to create, rename, activate, or delete chains.
          </p>
        </div>

        <div className="grid two">
          <StatCard label="Total chains" value={totalClusterChains} helper="Across all nodes" />
          <StatCard label="Nodes with active chain" value={nodesWithActiveChains} helper="Live selection" />
          <StatCard label="Plugins across chains" value={totalClusterPlugins} helper="Cluster footprint" />
        </div>

        <div className="card">
          <div className="section-heading">
            <div>
              <h3>Cluster chain inventory</h3>
              <p className="subtitle">Choose a node to manage its signal-chain inventory directly.</p>
            </div>
          </div>

          {clusterChainsQuery.isLoading ? (
            <div className="flex" style={{ padding: '12px 4px' }}>
              <SpinnerGap className="spin" size={18} weight="duotone" /> Loading cluster chains...
            </div>
          ) : clusterChainsQuery.error ? (
            <div className="pill warn">Failed to load cluster chain inventory</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Node</th>
                    <th>Chains</th>
                    <th>Active Chain</th>
                    <th>Plugins</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {clusterRows.map((row) => (
                    <tr key={row.node.nodeId}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{row.node.isLocal ? `${row.node.hostname} (Local)` : row.node.hostname}</div>
                        <div className="muted" style={{ fontSize: 12 }}>{row.node.nodeId}</div>
                      </td>
                      <td>{row.chainCount}</td>
                      <td>{row.activeName ?? 'None selected'}</td>
                      <td>{row.totalPlugins}</td>
                      <td>
                        <span className={`pill ${row.statusCode === 200 ? 'success' : 'warn'}`}>
                          {row.statusCode === 200 ? 'Online' : 'Unavailable'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setActiveNode(row.node.nodeId)}>
                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="stack chains-page">
      <PageHeader
        title={remoteSelected ? `Chains · ${selectedNode?.hostname ?? activeNodeId}` : 'Chains'}
        subtitle={
          remoteSelected
            ? `Curate and activate processing chains on ${selectedNode?.hostname ?? activeNodeId}.`
            : 'Curate and activate processing chains with Ariakit dialogs and menus.'
        }
        icon={<Link size={32} weight="duotone" style={{ color: '#2563eb' }} />}
        actions={
          <div className="flex" style={{ gap: 8 }}>
            {remoteSelected ? (
              <span className="pill muted">Grid editor local-only</span>
            ) : (
              <a className="btn btn-ghost" href="/grid">
                <Plus size={16} weight="bold" /> Grid view
              </a>
            )}
            <button className="btn btn-secondary" onClick={handleRefresh}>
              <ArrowsClockwise size={16} weight="duotone" /> Refresh
            </button>
            <button className="btn btn-primary" onClick={() => setCreateDialogOpen(true)}>
              <Plus size={16} weight="bold" /> New chain
            </button>
          </div>
        }
      />

      {isClusterMode && (
        <div
          className="card"
          style={{
            background: remoteSelected
              ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(15, 23, 42, 0.94))'
              : 'linear-gradient(135deg, rgba(71, 85, 105, 0.18), rgba(15, 23, 42, 0.94))',
            borderColor: remoteSelected ? 'rgba(52, 211, 153, 0.22)' : 'rgba(148, 163, 184, 0.18)',
          }}
        >
          <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.1, color: '#94a3b8', marginBottom: 8 }}>
            Chain Scope
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
            {remoteSelected ? selectedNode?.hostname ?? activeNodeId : 'Local node'}
          </div>
          <p style={{ margin: 0, color: '#cbd5e1', fontSize: 14, lineHeight: 1.6 }}>
            {remoteSelected
              ? `Chain actions are proxied to ${selectedNode?.hostname ?? activeNodeId}${selectedNode?.latencyMs == null ? '' : ` · peer latency ${selectedNode.latencyMs.toFixed(1)} ms`}.`
              : 'This page edits the local node. Switch to All Nodes for comparison or select a peer to manage its chain inventory remotely.'}
          </p>
        </div>
      )}

      <div className="grid two">
        <StatCard
          label="Total chains"
          value={chainsQuery.data?.count ?? '—'}
          helper={chainsQuery.isFetching ? 'Refreshing' : 'Inventory'}
        />
        <StatCard
          label="Active chain"
          value={activeChain?.name ?? 'None selected'}
          helper={activeChain ? 'Live' : 'Pick one'}
          tone={activeChain ? 'success' : 'warn'}
        />
        <StatCard label="Plugins across chains" value={totalPlugins} helper="Footprint" />
      </div>

      <div className="card">
        <div className="section-heading">
          <div>
            <h3>All chains</h3>
            <p className="subtitle">Search, activate, and manage via Ariakit primitives.</p>
          </div>
          <ComboboxProvider store={combobox}>
            <div style={{ minWidth: 240 }}>
              <Combobox store={combobox} className="combobox" placeholder="Filter by name" />
              <ComboboxPopover store={combobox} className="menu" gutter={6}>
                {chainNames.length === 0 ? (
                  <div className="menu-item" aria-disabled>
                    No chains yet
                  </div>
                ) : (
                  chainNames.map((name) => (
                    <ComboboxItem key={name} value={name} className="menu-item" />
                  ))
                )}
              </ComboboxPopover>
            </div>
          </ComboboxProvider>
        </div>

        {chainsQuery.isLoading ? (
          <div className="flex" style={{ padding: '12px 4px' }}>
            <SpinnerGap className="spin" size={18} weight="duotone" /> Loading chains...
          </div>
        ) : chainsQuery.error ? (
          <div className="pill warn">Failed to load chains</div>
        ) : filteredChains.length === 0 ? (
          <div className="list-item">No chains match that filter.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Plugins</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
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
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-heading">
          <div>
            <h3>Advanced routing</h3>
            <p className="subtitle">
              Sidechain, parallel, and external-loop controls for {remoteSelected ? `${selectedNode?.hostname ?? activeNodeId}` : 'the local node'}.
            </p>
          </div>
        </div>

        <div className="grid two" style={{ alignItems: 'start' }}>
          <ParallelRoutingPanel nodeId={apiNodeId} remoteLabel={remoteLabel} latencyMs={remoteLatencyMs} />
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              border: '1px solid rgba(168, 85, 247, 0.16)',
              background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.94), rgba(15, 23, 42, 0.82))',
            }}
          >
            <SidechainPanel nodeId={apiNodeId} remoteLabel={remoteLabel} latencyMs={remoteLatencyMs} />
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <EffectsLoopSummaryPanel
            nodeId={apiNodeId}
            chains={chainsQuery.data?.chains ?? []}
            remoteLabel={remoteLabel}
            latencyMs={remoteLatencyMs}
          />
        </div>
      </div>

      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} fullScreen={isMobile}>
        <DialogTitle>Create a new chain</DialogTitle>
        <DialogContent sx={{ minWidth: '400px' }}>
          <p style={{ marginBottom: '16px', color: '#6b7280' }}>
            Name it, then add plugins from the Plugins view.
          </p>
          <TextField
            autoFocus
            fullWidth
            label="Chain name"
            placeholder="e.g. Modern Crunch"
            value={chainName}
            onChange={(event) => setChainName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && chainName.trim()) {
                event.preventDefault()
                handleCreate(event as any)
              }
            }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setCreateDialogOpen(false)
              setChainName('')
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            variant="contained"
            disabled={createChain.isPending || !chainName.trim()}
          >
            {createChain.isPending ? <SpinnerGap className="spin" size={16} weight="duotone" /> : <Plus size={16} weight="bold" />} Create
          </Button>
        </DialogActions>
      </Dialog>

      <ChainDeployModal
        open={Boolean(deployChain)}
        chain={deployChain}
        sourceNodeId={apiNodeId ?? localNodeId}
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
  const menu = useMenuStore()
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renameValue, setRenameValue] = useState(chain.name)
  const pluginCount = chain.plugins.length

  const handleRenameSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = renameValue.trim()
    if (!trimmed) return
    onRename(trimmed)
    setRenameDialogOpen(false)
  }

  return (
    <tr>
      <td>{chain.name}</td>
      <td>{pluginCount} plugin{pluginCount === 1 ? '' : 's'}</td>
      <td>
        <span className={`pill ${chain.is_active ? 'success' : 'muted'}`}>
          {chain.is_active ? <SealCheck size={14} weight="duotone" /> : null}
          {chain.is_active ? 'Active' : 'Idle'}
        </span>
      </td>
      <td>{chain.updated_at && !isNaN(new Date(chain.updated_at).getTime()) ? new Date(chain.updated_at).toLocaleString() : '—'}</td>
      <td style={{ textAlign: 'right' }}>
        <MenuProvider store={menu}>
          <MenuButton store={menu} className="btn btn-ghost btn-sm">Actions</MenuButton>
          <Menu store={menu} className="menu">
            {!chain.is_active ? (
              <MenuItem className="menu-item" onClick={onActivate} disabled={disableActions}>
                <Power size={16} weight="duotone" /> Activate
              </MenuItem>
            ) : (
              <MenuItem className="menu-item" onClick={onDeactivate} disabled={disableActions}>
                <Power size={16} weight="duotone" /> Deactivate
              </MenuItem>
            )}
            {canDeploy && onDeploy ? (
              <MenuItem className="menu-item" onClick={onDeploy} disabled={disableActions}>
                Deploy...
              </MenuItem>
            ) : null}
            <MenuItem
              className="menu-item"
              onClick={() => {
                setRenameValue(chain.name)
                setRenameDialogOpen(true)
              }}
              disabled={disableActions}
            >
              Rename
            </MenuItem>
            <MenuItem
              className="menu-item"
              onClick={() => {
                if (confirm('Delete this chain? This removes the chain and its routing from the inventory. Presets remain unaffected.')) {
                  onDelete()
                }
              }}
              disabled={disableActions}
            >
              <Trash size={16} weight="duotone" /> Delete
            </MenuItem>
          </Menu>
        </MenuProvider>

        <Dialog open={renameDialogOpen} onClose={() => setRenameDialogOpen(false)} fullScreen={isMobile}>
          <DialogTitle>Rename chain</DialogTitle>
          <DialogContent sx={{ minWidth: '400px' }}>
            <p style={{ marginBottom: '16px', color: '#6b7280' }}>
              Update the chain name and keep routing intact.
            </p>
            <TextField
              autoFocus
              fullWidth
              label="Name"
              placeholder="e.g. Modern Crunch"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && renameValue.trim()) {
                  event.preventDefault()
                  handleRenameSubmit(event as any)
                }
              }}
              sx={{ mt: 1 }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRenameDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleRenameSubmit}
              variant="contained"
              disabled={disableActions || !renameValue.trim()}
            >
              Rename
            </Button>
          </DialogActions>
        </Dialog>
      </td>
    </tr>
  )
}
