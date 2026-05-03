/**
 * AudioEngineChainsSection — read-only runtime view of known chains,
 * grafted onto the Audio Engine page (replaces the standalone /chains
 * route). Section-scaled treatment per the 2026-05-03 nav reorg:
 *   - h2 heading + load-bearing warning notification
 *   - 2 metric tiles (runtime chains count, live chain name)
 *   - table (cluster-comparison view when "All nodes" is selected,
 *     single-node table with search otherwise)
 *
 * Scope is **slaved to the Audio Engine page-key** — there is no
 * separate Chains node-context anymore. The "Inspect" button drives
 * the Audio Engine selector, so all chains state moves through one
 * canonical scope on this page.
 */

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
import { Renew } from '@carbon/icons-react'

import type { Chain, ChainsResponse } from '../../../map2/types'
import { chainsApi } from '../../../map2/api'
import { EmptyState } from '../../components/shared/EmptyState'
import { LoadingState } from '../../components/shared/LoadingState'
import { useCluster } from '../../contexts/useCluster'
import { useNodePageContext } from '../../hooks/useNodePageContext'
import { useViewedNodeStore } from '../../stores/viewedNodeStore'
import { NODE_PAGE_KEYS } from '../../utils/nodeDisplay'
import './AudioEngineChainsSection.css'

type ClusterChainsFanoutResponse = {
  nodes?: Record<string, { status_code?: number; body?: ChainsResponse }>
}

type MetricTone = 'gray' | 'green' | 'warm-gray'

const RUNTIME_CHAIN_CONTROL_NOTICE = 'This section is a read-only runtime view of known chains. Edit and publish snapshot-owned live truth from Audio Grid and Snapshot Publish.'

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
    <Layer className="audio-engine-chains__metric-card">
      <div className="audio-engine-chains__metric-label">{label}</div>
      <div className="audio-engine-chains__metric-value">{value}</div>
      <Tag type={tone}>{helper}</Tag>
    </Layer>
  )
}

export function AudioEngineChainsSection() {
  const [searchValue, setSearchValue] = useState('')
  const setViewedNode = useViewedNodeStore((state) => state.setViewedNode)
  // Slaved to the Audio Engine page-key — no separate Chains context.
  const { localNode: pageLocalNode, viewedNode, viewedNodeId } = useNodePageContext(NODE_PAGE_KEYS.audioEngine)
  const { activeNodeId, nodes: clusterNodes, localNodeId, setActiveNode } = useCluster()

  const allNodesSelected = activeNodeId === 'all'
  const selectedNode = (viewedNode?.node_id === viewedNodeId ? viewedNode : null)
    ?? clusterNodes.find((node) => node.nodeId === viewedNodeId)
    ?? clusterNodes.find((node) => node.nodeId === activeNodeId)
  const resolvedLocalNodeId = pageLocalNode?.node_id ?? localNodeId
  const remoteSelected = !allNodesSelected && Boolean(viewedNodeId && viewedNodeId !== resolvedLocalNodeId)
  const apiNodeId = remoteSelected ? viewedNodeId : null
  const scopeKey = allNodesSelected ? 'all' : (apiNodeId ?? localNodeId)

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

  const runtimeChains = chainsQuery.data?.chains ?? []

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

  // The "Inspect" button (cluster view) drives the Audio Engine
  // selector instead of a separate Chains-only one. Operators stay on
  // /node-ops/audio-engine; the rest of the page re-scopes to the
  // node they picked.
  const handleInspectNode = (nodeId: string) => {
    setActiveNode(null)
    setViewedNode(NODE_PAGE_KEYS.audioEngine, nodeId)
  }

  const totalClusterChains = clusterRows.reduce((sum, row) => sum + row.chainCount, 0)
  const nodesWithLiveChains = clusterRows.filter((row) => row.activeName).length

  return (
    <section className="audio-engine-chains" aria-labelledby="audio-engine-chains-heading">
      <header className="audio-engine-chains__header">
        <div className="audio-engine-chains__heading-row">
          <h2 id="audio-engine-chains-heading" className="audio-engine-chains__heading">Chains</h2>
          <div className="audio-engine-chains__actions">
            <Button kind="ghost" size="sm" renderIcon={Renew} onClick={handleRefresh}>
              Refresh
            </Button>
          </div>
        </div>
        <InlineNotification
          kind="warning"
          lowContrast
          hideCloseButton
          title="Snapshot-owned runtime view"
          subtitle={RUNTIME_CHAIN_CONTROL_NOTICE}
        />
      </header>

      {allNodesSelected ? (
        <>
          <div className="audio-engine-chains__metrics-grid">
            <ChainsMetricCard label="Runtime chains" value={totalClusterChains} helper="Across all nodes" />
            <ChainsMetricCard label="Nodes with live chain" value={nodesWithLiveChains} helper="Runtime projection" tone="green" />
          </div>

          <Layer className="audio-engine-chains__panel">
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
              <TableContainer className="audio-engine-chains__table-wrap">
                <Table size="sm" className="audio-engine-chains__table">
                  <TableHead>
                    <TableRow>
                      <TableHeader>Node</TableHeader>
                      <TableHeader>Runtime chains</TableHeader>
                      <TableHeader>Live chain</TableHeader>
                      <TableHeader>Status</TableHeader>
                      <TableHeader className="audio-engine-chains__table-cell--actions">Action</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {clusterRows.map((row) => (
                      <TableRow key={row.node.nodeId}>
                        <TableCell>
                          <div className="audio-engine-chains__row-primary">
                            {row.node.isLocal ? `${row.node.hostname} (Local)` : row.node.hostname}
                          </div>
                          <div className="audio-engine-chains__row-secondary">{row.node.nodeId}</div>
                        </TableCell>
                        <TableCell>{row.chainCount}</TableCell>
                        <TableCell>
                          <div className="audio-engine-chains__row-primary">{row.activeName ?? 'No live chain'}</div>
                          <div className="audio-engine-chains__row-secondary">{row.snapshotLabel ?? 'No active snapshot'}</div>
                        </TableCell>
                        <TableCell>
                          <Tag type={statusTagType(row.statusCode)}>{row.statusCode === 200 ? 'Online' : 'Unavailable'}</Tag>
                        </TableCell>
                        <TableCell className="audio-engine-chains__table-cell--actions">
                          <Button
                            kind="tertiary"
                            size="sm"
                            onClick={() => handleInspectNode(row.node.nodeId)}
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
        </>
      ) : (
        <>
          <div className="audio-engine-chains__metrics-grid">
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

          <Layer className="audio-engine-chains__panel">
            <div className="audio-engine-chains__panel-header">
              <Search
                id="audio-engine-chains-search"
                size="sm"
                labelText="Search runtime chains"
                placeholder="Filter by path, chain, or snapshot"
                value={searchValue}
                onChange={(event) => setSearchValue(event.currentTarget.value)}
                className="audio-engine-chains__search"
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
              <TableContainer className="audio-engine-chains__table-wrap">
                <Table size="sm" className="audio-engine-chains__table">
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
                          <div className="audio-engine-chains__row-primary">{formatPathLabel(chain)}</div>
                          <div className="audio-engine-chains__row-secondary">{chain.name}</div>
                        </TableCell>
                        <TableCell>
                          <div className="audio-engine-chains__row-primary">{formatSnapshotLabel(chain)}</div>
                          <div className="audio-engine-chains__row-secondary">
                            {typeof chain.snapshot_id === 'number' ? `Snapshot ID ${chain.snapshot_id}` : 'Snapshot-owned'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="audio-engine-chains__row-primary">
                            <Tag type={chain.is_active ? 'green' : 'warm-gray'}>
                              {chain.is_active ? 'Runtime live' : 'Runtime standby'}
                            </Tag>
                          </div>
                          <div className="audio-engine-chains__row-secondary">
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
        </>
      )}
    </section>
  )
}

export default AudioEngineChainsSection
