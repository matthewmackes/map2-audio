import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Checkbox,
  ComposedModal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Tag,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from '@carbon/react'
import {
  CheckmarkFilled as CheckCircle,
  ErrorFilled as XCircle,
  Renew as SpinnerGap,
  Share,
  WarningAlt as WarningCircle,
} from '@carbon/icons-react'
import type { Chain } from '../../../map2/types'
import { useCluster } from '../../contexts/useCluster'
import { LegacyButton } from '../shared/LegacyButton'
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
    <ComposedModal open={open} onClose={onClose} size="lg">
      <ModalHeader
        title={chain.name}
        label="Deploy Chain"
        closeModal={onClose}
      />
      <ModalBody>
        <p style={{
          // carbon-allow: legacy intro paragraph 20px bottom-margin (between Carbon stops).
          margin: '0 0 20px', color: '#94a3b8', lineHeight: 1.6,
        }}>
          Source node <strong style={{ color: '#e2e8f0' }}>{nodeLabelById.get(sourceNodeId) ?? sourceNodeId}</strong>. Targets missing non-builtin plugins are blocked before deployment.
        </p>

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
          <Checkbox
            id="chain-deploy-activate"
            labelText=""
            checked={activateOnTargets}
            onChange={(_, { checked }) => setActivateOnTargets(Boolean(checked))}
            disabled={deployMutation.isPending}
          />
          Activate the deployed chain on each target node
        </label>

        <div style={{ overflowX: 'auto', marginBottom: 20 }}>
          <TableContainer title="Target nodes" description="Select the peers that should receive this chain deployment.">
            <Table size="md" useZebraStyles={false}>
              <TableHead>
                <TableRow>
                  <TableHeader>Target</TableHeader>
                  <TableHeader>Plugin Coverage</TableHeader>
                  <TableHeader>Deploy Mode</TableHeader>
                  <TableHeader>Select</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
              {rows.map(({ node, missingPlugins, canDeploy }) => {
                const checked = selectedTargetIds.has(node.nodeId)
                return (
                  <TableRow key={node.nodeId}>
                    <TableCell>
                      <div style={{ fontWeight: 600 }}>{nodeLabelById.get(node.nodeId) ?? node.nodeId}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {node.isOnline ? `Latency ${node.latencyMs ?? 'n/a'} ms` : 'Offline'}
                      </div>
                    </TableCell>
                    <TableCell>
                      {missingPlugins.length === 0 ? (
                        <Tag type="green" size="sm" renderIcon={CheckCircle}>Ready</Tag>
                      ) : (
                        <Tag type="warm-gray" size="sm" renderIcon={XCircle} title={missingPlugins.join(', ')}>
                          Missing {missingPlugins.length} plugin{missingPlugins.length === 1 ? '' : 's'}
                        </Tag>
                      )}
                    </TableCell>
                    <TableCell>{activateOnTargets ? 'Activate after deploy' : 'Stage only'}</TableCell>
                    <TableCell>
                      <Checkbox
                        id={`chain-deploy-${node.nodeId}`}
                        checked={checked}
                        disabled={!canDeploy || deployMutation.isPending}
                        labelText=""
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
                    </TableCell>
                  </TableRow>
                )
              })}
              </TableBody>
            </Table>
          </TableContainer>
        </div>

        {pluginCatalogQuery.isLoading && (
          <div className="flex" style={{ gap: 8, alignItems: 'center', marginBottom: 16 }}>
            <SpinnerGap size={16} className="spin" />
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
            <WarningCircle size={18} />
            <span>Plugin coverage check failed. Built-in plugins can still deploy, but peer plugin mismatches may block activation on the target.</span>
          </div>
        )}

      </ModalBody>
      <ModalFooter>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', width: '100%' }}>
          <div className="muted" style={{ fontSize: 13 }}>
            {selectedTargetIds.size} target node{selectedTargetIds.size === 1 ? '' : 's'} selected
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <LegacyButton variant="ghost" onClick={onClose} disabled={deployMutation.isPending}>
              Cancel
            </LegacyButton>
            <LegacyButton
              variant="primary"
              disabled={selectedTargetIds.size === 0 || deployMutation.isPending}
              onClick={() => deployMutation.mutate(Array.from(selectedTargetIds))}
            >
              {deployMutation.isPending ? (
                <>
                  <SpinnerGap size={14} className="spin" />
                  Deploying…
                </>
              ) : (
                <>
                  <Share size={14} />
                  Deploy Chain
                </>
              )}
            </LegacyButton>
          </div>
        </div>
      </ModalFooter>
    </ComposedModal>
  )
}

export default ChainDeployModal
