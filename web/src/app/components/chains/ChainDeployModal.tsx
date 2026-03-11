import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, ShareNetwork, SpinnerGap, WarningCircle, X, XCircle } from '@phosphor-icons/react'
import type { Chain } from '../../../map2/types'
import { useCluster } from '../../contexts/ClusterContext'
import { useToasts } from '../Toasts'

type ClusterPlugin = {
  uri: string
  installed_on?: string[]
}

type ClusterPluginResponse = {
  plugins?: ClusterPlugin[]
}

interface ChainDeployModalProps {
  open: boolean
  chain: Chain | null
  sourceNodeId: string
  onClose: () => void
}

function isBuiltinPlugin(uri: string): boolean {
  return uri.startsWith('map2://juce/') || uri.startsWith('map2://flow-') || uri.startsWith('map2://')
}

export function ChainDeployModal({
  open,
  chain,
  sourceNodeId,
  onClose,
}: ChainDeployModalProps) {
  const qc = useQueryClient()
  const { pushToast } = useToasts()
  const { nodes } = useCluster()
  const [selectedTargetIds, setSelectedTargetIds] = useState<Set<string>>(new Set())
  const [activateOnTargets, setActivateOnTargets] = useState(false)

  const targetNodes = useMemo(
    () => nodes.filter((node) => node.nodeId !== sourceNodeId),
    [nodes, sourceNodeId]
  )
  const nodeLabelById = useMemo(
    () => new Map(nodes.map((node) => [node.nodeId, node.isLocal ? `${node.hostname} (Local)` : node.hostname])),
    [nodes]
  )

  useEffect(() => {
    if (!open) return
    setSelectedTargetIds(new Set(targetNodes.filter((node) => node.isOnline).map((node) => node.nodeId)))
    setActivateOnTargets(Boolean(chain?.is_active))
  }, [chain?.is_active, open, targetNodes])

  const pluginCatalogQuery = useQuery<ClusterPluginResponse>({
    queryKey: ['cluster', 'plugins', 'catalog', 'chain-deploy'],
    queryFn: async () => {
      const response = await fetch('/api/cluster/health/extended/plugins')
      if (!response.ok) {
        throw new Error('Failed to fetch cluster plugin catalog')
      }
      return response.json() as Promise<ClusterPluginResponse>
    },
    enabled: open && Boolean(chain),
    staleTime: 10000,
  })

  const rows = useMemo(() => {
    const catalog = pluginCatalogQuery.data?.plugins ?? []
    return targetNodes.map((node) => {
      const missingPlugins = (chain?.plugins ?? [])
        .map((plugin) => plugin.uri)
        .filter((uri) => {
          if (isBuiltinPlugin(uri)) return false
          const item = catalog.find((candidate) => candidate.uri === uri)
          return !item?.installed_on?.includes(node.nodeId)
        })

      return {
        node,
        missingPlugins,
        canDeploy: node.isOnline && missingPlugins.length === 0,
      }
    })
  }, [chain?.plugins, pluginCatalogQuery.data?.plugins, targetNodes])

  const deployMutation = useMutation({
    mutationFn: async (targetNodeIds: string[]) => {
      if (!chain) {
        throw new Error('No chain selected')
      }

      const failures: string[] = []
      const successes: string[] = []

      for (const targetNodeId of targetNodeIds) {
        const response = await fetch(`/api/chains/deploy?node_id=${encodeURIComponent(targetNodeId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chain_id: chain.id,
            chain_name: chain.name,
            plugins: chain.plugins.map((plugin) => ({
              uri: plugin.uri,
              bypass: Boolean(plugin.bypassed),
            })),
            mode: activateOnTargets ? 'active' : 'standby',
            activate: activateOnTargets,
          }),
        })

        if (!response.ok) {
          failures.push(nodeLabelById.get(targetNodeId) ?? targetNodeId)
          continue
        }

        const payload = await response.json().catch(() => ({}))
        if (payload.applied === false || payload.status === 'failed') {
          failures.push(nodeLabelById.get(targetNodeId) ?? targetNodeId)
        } else {
          successes.push(nodeLabelById.get(targetNodeId) ?? targetNodeId)
        }
      }

      return { successes, failures }
    },
    onSuccess: async ({ successes, failures }) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['chains'] }),
        qc.invalidateQueries({ queryKey: ['chains', 'cluster-comparison'] }),
      ])

      if (successes.length > 0) {
        pushToast(`Deployed chain to ${successes.length} node${successes.length === 1 ? '' : 's'}`, 'success')
      }
      if (failures.length > 0) {
        pushToast(`Chain deploy failed on: ${failures.join(', ')}`, 'warn', { persistent: true })
      }
      onClose()
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Chain deployment failed', 'error')
    },
  })

  if (!open || !chain) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.58)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={() => {
        if (!deployMutation.isPending) onClose()
      }}
    >
      <div
        className="card"
        style={{ width: 'min(920px, 94vw)', maxHeight: '90vh', overflow: 'auto', padding: 24 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.1, color: '#94a3b8', marginBottom: 8 }}>
              Deploy Chain
            </div>
            <h3 style={{ margin: 0, fontSize: 24 }}>{chain.name}</h3>
            <p style={{ margin: '8px 0 0', color: '#94a3b8', lineHeight: 1.6 }}>
              Source node <strong style={{ color: '#e2e8f0' }}>{nodeLabelById.get(sourceNodeId) ?? sourceNodeId}</strong>. Targets missing non-builtin plugins are blocked before deployment.
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={deployMutation.isPending}>
            <X size={16} weight="bold" />
          </button>
        </div>

        <div
          style={{
            padding: 14,
            borderRadius: 10,
            background: 'rgba(37, 99, 235, 0.10)',
            border: '1px solid rgba(96, 165, 250, 0.18)',
            marginBottom: 16,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Payload</div>
          <div className="muted" style={{ fontSize: 13 }}>
            {chain.plugins.length} plugins · chain id {chain.id} · {chain.is_active ? 'currently active on source' : 'standby on source'}
          </div>
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 16,
            fontSize: 14,
            color: '#e2e8f0',
          }}
        >
          <input
            type="checkbox"
            checked={activateOnTargets}
            onChange={(event) => setActivateOnTargets(event.target.checked)}
            disabled={deployMutation.isPending}
          />
          Activate the deployed chain on each target node
        </label>

        <div style={{ overflowX: 'auto', marginBottom: 20 }}>
          <table className="table" style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th>Target</th>
                <th>Plugin Coverage</th>
                <th>Deploy Mode</th>
                <th>Select</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ node, missingPlugins, canDeploy }) => {
                const checked = selectedTargetIds.has(node.nodeId)
                return (
                  <tr key={node.nodeId}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{nodeLabelById.get(node.nodeId) ?? node.nodeId}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {node.isOnline ? `Latency ${node.latencyMs ?? 'n/a'} ms` : 'Offline'}
                      </div>
                    </td>
                    <td>
                      {missingPlugins.length === 0 ? (
                        <span className="pill success">
                          <CheckCircle size={14} weight="duotone" /> Ready
                        </span>
                      ) : (
                        <span className="pill warn" title={missingPlugins.join(', ')}>
                          <XCircle size={14} weight="duotone" /> Missing {missingPlugins.length} plugin{missingPlugins.length === 1 ? '' : 's'}
                        </span>
                      )}
                    </td>
                    <td>{activateOnTargets ? 'Activate after deploy' : 'Stage only'}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!canDeploy || deployMutation.isPending}
                        onChange={() => {
                          setSelectedTargetIds((previous) => {
                            const next = new Set(previous)
                            if (next.has(node.nodeId)) {
                              next.delete(node.nodeId)
                            } else {
                              next.add(node.nodeId)
                            }
                            return next
                          })
                        }}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {pluginCatalogQuery.isLoading && (
          <div className="flex" style={{ gap: 8, alignItems: 'center', marginBottom: 16 }}>
            <SpinnerGap size={16} weight="duotone" className="spin" />
            <span className="muted">Checking cluster plugin coverage…</span>
          </div>
        )}

        {pluginCatalogQuery.isError && (
          <div
            style={{
              marginBottom: 16,
              padding: 12,
              borderRadius: 10,
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.22)',
              color: '#fde68a',
              display: 'flex',
              gap: 10,
              alignItems: 'center',
            }}
          >
            <WarningCircle size={18} weight="duotone" />
            <span>Plugin coverage check failed. Built-in plugins can still deploy, but peer plugin mismatches may block activation on the target.</span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div className="muted" style={{ fontSize: 13 }}>
            {selectedTargetIds.size} target node{selectedTargetIds.size === 1 ? '' : 's'} selected
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={deployMutation.isPending}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={selectedTargetIds.size === 0 || deployMutation.isPending}
              onClick={() => deployMutation.mutate(Array.from(selectedTargetIds))}
            >
              {deployMutation.isPending ? (
                <>
                  <SpinnerGap size={14} weight="duotone" className="spin" />
                  Deploying…
                </>
              ) : (
                <>
                  <ShareNetwork size={14} weight="duotone" />
                  Deploy Chain
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ChainDeployModal
