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

const SNAPSHOT_PATH_SOURCE_KIND = 'snapshot_path'
const RUNTIME_CHAIN_CONTROL_NOTICE = 'This page is a read-only runtime view of snapshot-owned paths. Edit and publish live truth from Audio Grid and Snapshot Publish.'

function AudioGridActionIcon(props: { className?: string }) {
  return <MapAudioGridIcon {...props} size={16} />
}

function isSnapshotOwnedChain(chain: Chain): boolean {
  return chain.source_kind === SNAPSHOT_PATH_SOURCE_KIND || chain.management_scope === 'snapshot' || chain.snapshot_id != null
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
  return 'Snapshot-owned path'
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
  const snapshotOwnedChains = useMemo(
    () => allNodeChains.filter(isSnapshotOwnedChain),
    [allNodeChains],
  )
  const hiddenLegacyChainCount = Math.max(0, allNodeChains.length - snapshotOwnedChains.length)

  const filteredChains = useMemo(() => {
    const query = searchValue.trim().toLowerCase()
    if (!query) {
      return snapshotOwnedChains
    }

    return snapshotOwnedChains.filter((chain) => (
      chain.name.toLowerCase().includes(query)
      || formatSnapshotLabel(chain).toLowerCase().includes(query)
      || formatPathLabel(chain).toLowerCase().includes(query)
    ))
  }, [searchValue, snapshotOwnedChains])

  const activeSnapshotPath = snapshotOwnedChains.find((chain) => chain.is_active)

  const clusterRows = useMemo(() => {
    const payload = clusterChainsQuery.data?.nodes ?? {}
    return clusterNodes.map((node) => {
      const chains = (payload[node.nodeId]?.body?.chains ?? []).filter(isSnapshotOwnedChain)
      const fullInventory = payload[node.nodeId]?.body?.chains ?? []
      const active = chains.find((chain) => chain.is_active)

      return {
        node,
        chainCount: chains.length,
        activeName: active ? formatPathLabel(active) : null,
        snapshotLabel: active ? formatSnapshotLabel(active) : null,
        hiddenLegacyCount: Math.max(0, fullInventory.length - chains.length),
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
    const nodesWithLivePaths = clusterRows.filter((row) => row.activeName).length
    const totalHiddenLegacyChains = clusterRows.reduce((sum, row) => sum + row.hiddenLegacyCount, 0)

    return (
      <div className="chains-page">
        <ShellWindowTitleStrip />
        <Layer className="chains-page__hero">
          <div className="chains-page__header-row">
            <div className="chains-page__title-block">
              <Flow size={32} aria-hidden="true" className="chains-page__title-icon" />
              <div>
                <h1 className="chains-page__title">Chains</h1>
                <p className="chains-page__subtitle">Cluster view of snapshot-owned runtime paths only</p>
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
              Compare snapshot-owned runtime path projections across the cluster. Legacy standalone chains are intentionally omitted here.
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
          <ChainsMetricCard label="Snapshot paths" value={totalClusterChains} helper="Across all nodes" />
          <ChainsMetricCard label="Nodes with live path" value={nodesWithLivePaths} helper="Runtime projection" tone="green" />
          <ChainsMetricCard label="Hidden legacy chains" value={totalHiddenLegacyChains} helper="Excluded from this page" tone="warm-gray" />
        </div>

        <Layer className="chains-page__panel">
          <div className="chains-page__panel-header">
            <div>
              <h2 className="chains-page__panel-title">Cluster snapshot path inventory</h2>
              <p className="chains-page__panel-subtitle">Inspect a node to review its snapshot-owned runtime projections.</p>
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
                    <TableHeader>Snapshot paths</TableHeader>
                    <TableHeader>Live path</TableHeader>
                    <TableHeader>Hidden legacy chains</TableHeader>
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
                        <div className="chains-page__row-primary">{row.activeName ?? 'No live snapshot path'}</div>
                        <div className="chains-page__row-secondary">{row.snapshotLabel ?? 'No active snapshot'}</div>
                      </TableCell>
                      <TableCell>{row.hiddenLegacyCount}</TableCell>
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
                  ? `Inspect snapshot-owned runtime paths on ${selectedNode?.hostname ?? viewedNodeId}.`
                  : 'Inspect snapshot-owned runtime paths for this node.'}
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
                : 'This page is limited to snapshot-owned runtime projections. Legacy standalone chains are hidden, and canonical edits live in the snapshot workflow.'}
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

        {hiddenLegacyChainCount > 0 ? (
          <InlineNotification
            kind="info"
            lowContrast
            hideCloseButton
            title="Legacy standalone chains hidden"
            subtitle={`${hiddenLegacyChainCount} non-snapshot runtime chain${hiddenLegacyChainCount === 1 ? '' : 's'} omitted from this page.`}
          />
        ) : null}
      </Layer>

      <div className="chains-page__metrics-grid">
        <ChainsMetricCard
          label="Snapshot paths"
          value={snapshotOwnedChains.length}
          helper={chainsQuery.isFetching ? 'Refreshing' : 'Visible on this node'}
        />
        <ChainsMetricCard
          label="Live path"
          value={activeSnapshotPath ? formatPathLabel(activeSnapshotPath) : 'No live snapshot path'}
          helper={activeSnapshotPath ? formatSnapshotLabel(activeSnapshotPath) : 'Runtime projection'}
          tone={activeSnapshotPath ? 'green' : 'warm-gray'}
        />
        <ChainsMetricCard
          label="Hidden legacy chains"
          value={hiddenLegacyChainCount}
          helper="Excluded from this page"
          tone="warm-gray"
        />
      </div>

      <Layer className="chains-page__panel">
        <div className="chains-page__panel-header">
          <div>
            <h2 className="chains-page__panel-title">Live snapshot paths</h2>
            <p className="chains-page__panel-subtitle">Search the snapshot-owned runtime projections currently known for this node.</p>
          </div>
          <Search
            id="chains-search"
            size="sm"
            labelText="Search snapshot paths"
            placeholder="Filter by path or snapshot"
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
            title={searchValue.trim() ? 'No snapshot paths match this filter' : 'No snapshot-owned runtime paths'}
            description={searchValue.trim()
              ? 'Try a different snapshot or path label.'
              : 'Open Snapshot Editor or Snapshot Publish to stage and activate a live snapshot path.'}
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
