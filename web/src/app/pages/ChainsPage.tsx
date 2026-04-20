import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  InlineNotification,
  Layer,
  Search,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
} from '@carbon/react'
import {
  Flow,
  Renew,
} from '@carbon/icons-react'
import type { Chain, ChainsResponse } from '../../map2/types'
import { chainsApi } from '../../map2/api'
import { EmptyState } from '../components/shared/EmptyState'
import { LoadingState } from '../components/shared/LoadingState'
import { MapAudioGridIcon } from '../components/icons/map'
import { ShellWindowTitleStrip } from '../components/shared/ShellWindowTitleStrip'
import { useCluster } from '../contexts/useCluster'
import { useNodePageContext } from '../hooks/useNodePageContext'
import { useViewedNodeStore } from '../stores/viewedNodeStore'
import { NODE_PAGE_KEYS } from '../utils/nodeDisplay'
import './ChainsPage.css'

type ClusterChainsFanoutResponse = {
  nodes?: Record<string, { status_code?: number; body?: ChainsResponse }>
}

type MetricTone = 'gray' | 'green' | 'warm-gray'

const RUNTIME_CHAIN_CONTROL_NOTICE = 'This page is a read-only runtime view of known chains. Edit and publish snapshot-owned live truth from Audio Grid and Snapshot Publish.'

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

function formatSnapshotLabel(chain: Chain): string {
  if (typeof chain.snapshot_name === 'string' && chain.snapshot_name.trim()) {
    return chain.snapshot_name
  }
  if (typeof chain.snapshot_id === 'number') {
    return `Snapshot #${chain.snapshot_id}`
  }
  return 'Runtime chain'
}

function formatPathLabel(chain: Chain): string {
  if (typeof chain.path_id === 'string' && chain.path_id.trim()) {
    return chain.path_id
  }
  if (typeof chain.snapshot_chain_id === 'number') {
    return `Snapshot chain ${chain.snapshot_chain_id}`
  }
  return chain.name
}

function formatRuntimeSyncStatus(value: string | undefined): string {
  if (!value) {
    return 'Runtime status unavailable'
  }

  return value
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function runtimeSyncTone(chain: Chain): MetricTone {
  const status = chain.runtime_sync?.status
  if (status === 'active') {
    return 'green'
  }
  if (status === 'inactive') {
    return 'warm-gray'
  }
  return 'gray'
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
  const [searchValue, setSearchValue] = useState('')
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

  const chainsQuery = useQuery<ChainsResponse>({
    queryKey: ['chains', scopeKey],
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

  const allNodeChains = chainsQuery.data?.chains ?? []
  const runtimeChains = useMemo(
    () => allNodeChains,
    [allNodeChains],
  )

  const filteredChains = useMemo(() => {
    const query = searchValue.trim().toLowerCase()
    if (!query) {
      return runtimeChains
    }

    return runtimeChains.filter((chain) => (
      chain.name.toLowerCase().includes(query)
      || formatSnapshotLabel(chain).toLowerCase().includes(query)
      || formatPathLabel(chain).toLowerCase().includes(query)
    ))
  }, [searchValue, runtimeChains])

  const activeRuntimeChain = runtimeChains.find((chain) => chain.is_active)

  const clusterRows = useMemo(() => {
    const payload = clusterChainsQuery.data?.nodes ?? {}
    return clusterNodes.map((node) => {
      const chains = payload[node.nodeId]?.body?.chains ?? []
      const active = chains.find((chain) => chain.is_active)

      return {
        node,
        chainCount: chains.length,
        activeName: active ? formatPathLabel(active) : null,
        snapshotLabel: active ? formatSnapshotLabel(active) : null,
        statusCode: payload[node.nodeId]?.status_code ?? (node.isOnline ? 200 : undefined),
      }
    })
  }, [clusterChainsQuery.data?.nodes, clusterNodes])

  const handleRefresh = () => {
    if (allNodesSelected) {
      clusterChainsQuery.refetch()
      return
    }

    chainsQuery.refetch()
  }

  if (allNodesSelected) {
    const totalClusterChains = clusterRows.reduce((sum, row) => sum + row.chainCount, 0)
    const nodesWithLiveChains = clusterRows.filter((row) => row.activeName).length

    return (
      <div className="chains-page">
        <ShellWindowTitleStrip />
        <Layer className="chains-page__hero">
          <div className="chains-page__header-row">
            <div className="chains-page__title-block">
              <Flow size={32} aria-hidden="true" className="chains-page__title-icon" />
              <div>
                <h1 className="chains-page__title">Chains</h1>
                <p className="chains-page__subtitle">Cluster view of known runtime chains</p>
              </div>
            </div>
            <div className="chains-page__actions">
              <Button kind="ghost" size="sm" renderIcon={Renew} onClick={handleRefresh}>
                Refresh
              </Button>
            </div>
          </div>

          <Layer className="chains-page__scope-card chains-page__scope-card--all">
            <div className="chains-page__scope-label">Chain scope</div>
            <strong className="chains-page__scope-title">All nodes cluster comparison</strong>
            <p className="chains-page__scope-copy">
              Compare known runtime chain projections across the cluster.
            </p>
          </Layer>

          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title="Snapshot-owned runtime view"
            subtitle={RUNTIME_CHAIN_CONTROL_NOTICE}
          />
        </Layer>

        <div className="chains-page__metrics-grid">
          <ChainsMetricCard label="Runtime chains" value={totalClusterChains} helper="Across all nodes" />
          <ChainsMetricCard label="Nodes with live chain" value={nodesWithLiveChains} helper="Runtime projection" tone="green" />
        </div>

        <Layer className="chains-page__panel">
          <div className="chains-page__panel-header">
            <div>
              <h2 className="chains-page__panel-title">Cluster runtime chain inventory</h2>
              <p className="chains-page__panel-subtitle">Inspect a node to review its known runtime projections.</p>
            </div>
          </div>

          {clusterChainsQuery.isLoading ? (
            <LoadingState description="Loading cluster chains" />
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
                    <TableHeader>Runtime chains</TableHeader>
                    <TableHeader>Live chain</TableHeader>
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
                      <TableCell>
                        <div className="chains-page__row-primary">{row.activeName ?? 'No live chain'}</div>
                        <div className="chains-page__row-secondary">{row.snapshotLabel ?? 'No active snapshot'}</div>
                      </TableCell>
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
      <ShellWindowTitleStrip />
      <Layer className="chains-page__hero">
        <div className="chains-page__header-row">
          <div className="chains-page__title-block">
            <Flow size={32} aria-hidden="true" className="chains-page__title-icon" />
            <div>
              <h1 className="chains-page__title">{remoteSelected ? `Chains - ${selectedNode?.hostname ?? viewedNodeId}` : 'Chains'}</h1>
              <p className="chains-page__subtitle">
                {remoteSelected
                  ? `Inspect known runtime chains on ${selectedNode?.hostname ?? viewedNodeId}.`
                  : 'Inspect known runtime chains for this node.'}
              </p>
            </div>
          </div>

          <div className="chains-page__actions">
            {remoteSelected ? <Tag type="warm-gray">Audio Grid local only</Tag> : (
              <Button kind="ghost" size="sm" href="/snapshot-editor" renderIcon={AudioGridActionIcon}>
                Audio Grid
              </Button>
            )}
            <Button kind="ghost" size="sm" renderIcon={Renew} onClick={handleRefresh}>
              Refresh
            </Button>
          </div>
        </div>

        {isClusterMode ? (
          <Layer className={`chains-page__scope-card ${remoteSelected ? 'chains-page__scope-card--remote' : 'chains-page__scope-card--local'}`}>
            <div className="chains-page__scope-label">Chain scope</div>
            <strong className="chains-page__scope-title">{remoteSelected ? selectedNode?.hostname ?? viewedNodeId : 'Local node'}</strong>
            <p className="chains-page__scope-copy">
              {remoteSelected
                ? `Runtime path inspection is proxied to ${selectedNode?.hostname ?? viewedNodeId}${remoteLatencyMs == null ? '' : ` with peer latency ${remoteLatencyMs.toFixed(1)} ms`}.`
                : 'This page shows runtime chain projections. Canonical snapshot-owned edits live in the snapshot workflow.'}
            </p>
          </Layer>
        ) : null}

        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title="Snapshot-owned runtime view"
          subtitle={RUNTIME_CHAIN_CONTROL_NOTICE}
        />

      </Layer>

      <div className="chains-page__metrics-grid">
        <ChainsMetricCard
          label="Runtime chains"
          value={runtimeChains.length}
          helper={chainsQuery.isFetching ? 'Refreshing' : 'Visible on this node'}
        />
        <ChainsMetricCard
          label="Live chain"
          value={activeRuntimeChain ? formatPathLabel(activeRuntimeChain) : 'No live chain'}
          helper={activeRuntimeChain ? formatSnapshotLabel(activeRuntimeChain) : 'Runtime projection'}
          tone={activeRuntimeChain ? 'green' : 'warm-gray'}
        />
      </div>

      <Layer className="chains-page__panel">
        <div className="chains-page__panel-header">
          <div>
            <h2 className="chains-page__panel-title">Live runtime chains</h2>
            <p className="chains-page__panel-subtitle">Search the runtime projections currently known for this node.</p>
          </div>
          <Search
            id="chains-search"
            size="sm"
            labelText="Search runtime chains"
            placeholder="Filter by path, chain, or snapshot"
            value={searchValue}
            onChange={(event) => setSearchValue(event.currentTarget.value)}
            className="chains-page__search"
          />
        </div>

        {chainsQuery.isLoading ? (
          <LoadingState description="Loading chains" />
        ) : chainsQuery.error ? (
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title="Failed to load chains"
            subtitle="The backend did not return chain inventory for this node."
          />
        ) : filteredChains.length === 0 ? (
          <EmptyState
            title={searchValue.trim() ? 'No runtime chains match this filter' : 'No runtime chains'}
            description={searchValue.trim()
              ? 'Try a different chain, snapshot, or path label.'
              : 'Open Snapshot Editor or Snapshot Publish to stage and activate a live chain.'}
            compact
          />
        ) : (
          <TableContainer className="chains-page__table-wrap">
            <Table size="sm" className="chains-page__table">
              <TableHead>
                <TableRow>
                  <TableHeader>Path</TableHeader>
                  <TableHeader>Snapshot</TableHeader>
                  <TableHeader>Runtime state</TableHeader>
                  <TableHeader>Updated</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredChains.map((chain) => (
                  <TableRow key={chain.id}>
                    <TableCell>
                      <div className="chains-page__row-primary">{formatPathLabel(chain)}</div>
                      <div className="chains-page__row-secondary">{chain.name}</div>
                    </TableCell>
                    <TableCell>
                      <div className="chains-page__row-primary">{formatSnapshotLabel(chain)}</div>
                      <div className="chains-page__row-secondary">
                        {typeof chain.snapshot_id === 'number' ? `Snapshot ID ${chain.snapshot_id}` : 'Snapshot-owned'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="chains-page__row-primary">
                        <Tag type={chain.is_active ? 'green' : 'warm-gray'}>
                          {chain.is_active ? 'Runtime live' : 'Runtime standby'}
                        </Tag>
                      </div>
                      <div className="chains-page__row-secondary">
                        <Tag type={runtimeSyncTone(chain)}>{formatRuntimeSyncStatus(chain.runtime_sync?.status)}</Tag>
                      </div>
                    </TableCell>
                    <TableCell>{formatUpdatedAt(chain.updated_at)}</TableCell>
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
