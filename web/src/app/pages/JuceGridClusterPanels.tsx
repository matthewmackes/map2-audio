import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Branch, Meter, Renew, WarningAlt } from '@carbon/icons-react'
import { Button, InlineLoading, Layer, Modal, Tag, Tile } from '@carbon/react'
import { useToasts } from '../components/Toasts'

const API_BASE = (() => {
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  const port = window.location.port
  if (isLocalhost) return '/api'
  if (port === '' || port === '80' || port === '8080') return '/api'
  return `http://${window.location.hostname}:8080/api`
})()

interface ClusterNode {
  node_id: string
  hostname: string
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED' | 'maintenance'
  cpu_percent?: number
  memory_used_gb?: number
  memory_total_gb?: number
  has_gpu?: boolean
  gpu_name?: string | null
  assigned_flows?: Array<{ flow_id: string; type: 'primary' | 'standby' }>
  flow_count?: number
}

interface FlowAssignment {
  flow_id: string
  chain_id: number
  assigned_node_id: string
  assignment_type: 'primary' | 'standby'
  assignment_strategy: string
}

interface DeploymentModeResponse {
  mode: string
  description: string
}

type TagTone = 'red' | 'green' | 'blue' | 'warm-gray' | 'cool-gray' | 'purple'

async function fetchDeploymentMode(): Promise<DeploymentModeResponse> {
  const res = await fetch(`${API_BASE}/deployment/mode`)
  if (!res.ok) throw new Error('Failed to fetch deployment mode')
  return res.json()
}

async function fetchClusterNodes(): Promise<{ nodes: ClusterNode[] }> {
  const res = await fetch(`${API_BASE}/cluster/nodes`)
  if (!res.ok) throw new Error('Failed to fetch cluster nodes')
  const data = await res.json()

  return {
    nodes: (data.nodes || []).map((node: ClusterNode) => {
      const statusRaw = (node.status || 'OFFLINE') as string
      const status = statusRaw.toLowerCase() === 'maintenance'
        ? 'maintenance'
        : (statusRaw.toUpperCase() as ClusterNode['status'])
      return { ...node, status }
    }),
  }
}

async function fetchAssignments(): Promise<{ assignments: FlowAssignment[]; total: number }> {
  const res = await fetch(`${API_BASE}/cluster/flows/assignments`)
  if (!res.ok) throw new Error('Failed to fetch flow assignments')
  return res.json()
}

async function toggleNodeMaintenance(nodeId: string, enabled: boolean) {
  const res = await fetch(`${API_BASE}/cluster/nodes/${nodeId}/maintenance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  })
  if (!res.ok) throw new Error('Failed to update maintenance mode')
}

async function triggerFlowFailover(flowId: string) {
  const res = await fetch(`${API_BASE}/cluster/flows/failover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flow_id: flowId }),
  })
  if (!res.ok) throw new Error('Failed to trigger flow failover')
}

function getNodeStatusTagType(status: ClusterNode['status']): TagTone {
  switch (status) {
    case 'ONLINE':
      return 'green'
    case 'DEGRADED':
      return 'warm-gray'
    case 'maintenance':
      return 'cool-gray'
    case 'OFFLINE':
    default:
      return 'red'
  }
}

function formatNodeStatus(status: ClusterNode['status']) {
  return status === 'maintenance' ? 'Maintenance' : status
}

function formatPercent(value: number) {
  return `${Math.round(Math.max(0, Math.min(100, value)))}%`
}

function formatMemorySummary(node: ClusterNode) {
  const used = node.memory_used_gb ?? 0
  const total = node.memory_total_gb ?? 0
  return total > 0 ? `${used.toFixed(1)} / ${total.toFixed(1)} GB` : `${used.toFixed(1)} GB`
}

function formatAssignmentType(type: FlowAssignment['assignment_type']) {
  return type === 'primary' ? 'Primary' : 'Standby'
}

function formatAssignmentStrategy(strategy: string) {
  return strategy
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function renderLoadingState(label: string) {
  return (
    <div className="juce-grid-page__ops-empty">
      <InlineLoading description={label} status="active" />
    </div>
  )
}

function renderEmptyState(message: string) {
  return <div className="juce-grid-page__ops-empty">{message}</div>
}

function renderAllInOneState(title: string, description: string, tagType: TagTone = 'green') {
  return (
    <Tile className="juce-grid-page__ops-aio">
      <div className="juce-grid-page__ops-aio-copy">
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <Tag type={tagType}>ALL-IN-ONE</Tag>
    </Tile>
  )
}

export function JuceGridClusterPanel() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()

  const deploymentQuery = useQuery({
    queryKey: ['deployment', 'mode'],
    queryFn: fetchDeploymentMode,
    staleTime: 30000,
  })

  const isAllInOne = deploymentQuery.data?.mode === 'ALL-IN-ONE'

  const nodesQuery = useQuery({
    queryKey: ['cluster', 'nodes'],
    queryFn: fetchClusterNodes,
    refetchInterval: isAllInOne ? false : 4000,
    enabled: !isAllInOne,
  })

  const maintenanceMutation = useMutation({
    mutationFn: ({ nodeId, enabled }: { nodeId: string; enabled: boolean }) => toggleNodeMaintenance(nodeId, enabled),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cluster', 'nodes'] })
      pushToast('Cluster maintenance mode updated', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update maintenance mode', 'error')
    },
  })

  const nodes = nodesQuery.data?.nodes || []
  const onlineCount = useMemo(
    () => nodes.filter((node) => node.status === 'ONLINE').length,
    [nodes],
  )

  return (
    <Layer className="juce-grid-page__ops-shell">
      <div className="juce-grid-page__ops-header">
        <div className="juce-grid-page__ops-copy">
          <div className="juce-grid-page__ops-heading">
            <Meter size={18} />
            <strong>Cluster nodes</strong>
          </div>
          <p>Monitor routing capacity and node readiness without leaving the editor.</p>
        </div>
        <div className="juce-grid-page__ops-actions">
          {!isAllInOne && <Tag type="green">{onlineCount}/{nodes.length || 0} online</Tag>}
          <Button
            size="sm"
            kind="ghost"
            renderIcon={Renew}
            onClick={() => {
              void deploymentQuery.refetch()
              void nodesQuery.refetch()
            }}
            disabled={deploymentQuery.isFetching || nodesQuery.isFetching}
          >
            Refresh
          </Button>
        </div>
      </div>

      {deploymentQuery.isLoading && renderLoadingState('Loading deployment mode')}
      {deploymentQuery.isError && renderEmptyState('Failed to load cluster deployment mode')}
      {!deploymentQuery.isLoading && !deploymentQuery.isError && isAllInOne && (
        renderAllInOneState('Local node deployment', 'Cluster services are running on this device, so failover controls are not required.')
      )}
      {!deploymentQuery.isLoading && !deploymentQuery.isError && !isAllInOne && nodesQuery.isLoading && renderLoadingState('Loading cluster nodes')}
      {!deploymentQuery.isLoading && !deploymentQuery.isError && !isAllInOne && nodesQuery.isError && renderEmptyState('Failed to load cluster nodes')}
      {!deploymentQuery.isLoading && !deploymentQuery.isError && !isAllInOne && !nodesQuery.isLoading && !nodesQuery.isError && (
        nodes.length === 0 ? renderEmptyState('No cluster nodes detected') : (
          <div className="juce-grid-page__cluster-grid">
            {nodes.map((node) => {
              const cpuPercent = node.cpu_percent ?? 0
              const memoryTotal = node.memory_total_gb ?? 0
              const memoryPercent = memoryTotal > 0 ? ((node.memory_used_gb ?? 0) / memoryTotal) * 100 : 0
              const assignedFlows = node.assigned_flows || []
              const inMaintenance = node.status === 'maintenance'

              return (
                <Tile key={node.node_id} className="juce-grid-page__cluster-card">
                  <div className="juce-grid-page__cluster-card-header">
                    <div className="juce-grid-page__cluster-card-copy">
                      <strong>{node.hostname}</strong>
                      <span>{node.node_id}</span>
                    </div>
                    <div className="juce-grid-page__cluster-card-tags">
                      <Tag type={getNodeStatusTagType(node.status)}>{formatNodeStatus(node.status)}</Tag>
                      {node.has_gpu && <Tag type="purple">{node.gpu_name || 'GPU'}</Tag>}
                    </div>
                  </div>

                  <div className="juce-grid-page__cluster-metrics">
                    <div className="juce-grid-page__cluster-metric">
                      <div className="juce-grid-page__cluster-metric-row">
                        <span>CPU</span>
                        <strong>{formatPercent(cpuPercent)}</strong>
                      </div>
                      <div className="juce-grid-page__cluster-meter" aria-hidden>
                        <div className="juce-grid-page__cluster-meter-fill" style={{ width: formatPercent(cpuPercent) }} />
                      </div>
                    </div>

                    <div className="juce-grid-page__cluster-metric">
                      <div className="juce-grid-page__cluster-metric-row">
                        <span>Memory</span>
                        <strong>{formatMemorySummary(node)}</strong>
                      </div>
                      <div className="juce-grid-page__cluster-meter" aria-hidden>
                        <div className="juce-grid-page__cluster-meter-fill juce-grid-page__cluster-meter-fill--memory" style={{ width: formatPercent(memoryPercent) }} />
                      </div>
                    </div>
                  </div>

                  <div className="juce-grid-page__cluster-flows">
                    <div className="juce-grid-page__cluster-flow-summary">
                      <span>Assigned flows</span>
                      <strong>{node.flow_count ?? assignedFlows.length}</strong>
                    </div>
                    {assignedFlows.length > 0 ? (
                      <div className="juce-grid-page__cluster-flow-tags">
                        {assignedFlows.map((assignment) => (
                          <Tag
                            key={`${node.node_id}-${assignment.flow_id}-${assignment.type}`}
                            type={assignment.type === 'primary' ? 'blue' : 'cool-gray'}
                          >
                            {assignment.flow_id} {assignment.type === 'standby' ? 'standby' : 'primary'}
                          </Tag>
                        ))}
                      </div>
                    ) : (
                      <p className="juce-grid-page__cluster-empty-copy">No flow assignments yet.</p>
                    )}
                  </div>

                  <div className="juce-grid-page__cluster-actions">
                    {node.status !== 'OFFLINE' && (
                      <Button
                        size="sm"
                        kind={inMaintenance ? 'secondary' : 'ghost'}
                        renderIcon={WarningAlt}
                        onClick={() => maintenanceMutation.mutate({ nodeId: node.node_id, enabled: !inMaintenance })}
                        disabled={maintenanceMutation.isPending}
                      >
                        {inMaintenance ? 'Resume node' : 'Maintenance'}
                      </Button>
                    )}
                  </div>
                </Tile>
              )
            })}
          </div>
        )
      )}
    </Layer>
  )
}

export function JuceGridFlowAssignmentPanel() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const [pendingFailover, setPendingFailover] = useState<FlowAssignment | null>(null)

  const deploymentQuery = useQuery({
    queryKey: ['deployment', 'mode'],
    queryFn: fetchDeploymentMode,
    staleTime: 30000,
  })

  const isAllInOne = deploymentQuery.data?.mode === 'ALL-IN-ONE'

  const assignmentsQuery = useQuery({
    queryKey: ['cluster', 'flow-assignments'],
    queryFn: fetchAssignments,
    refetchInterval: isAllInOne ? false : 4000,
    enabled: !isAllInOne,
  })

  const failoverMutation = useMutation({
    mutationFn: (flowId: string) => triggerFlowFailover(flowId),
    onSuccess: async (_, flowId) => {
      await queryClient.invalidateQueries({ queryKey: ['cluster', 'flow-assignments'] })
      await queryClient.invalidateQueries({ queryKey: ['cluster', 'nodes'] })
      pushToast(`Failover triggered for ${flowId}`, 'success')
      setPendingFailover(null)
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to trigger flow failover', 'error')
    },
  })

  const assignments = assignmentsQuery.data?.assignments || []
  const standbyCount = useMemo(
    () => assignments.filter((assignment) => assignment.assignment_type === 'standby').length,
    [assignments],
  )

  return (
    <>
      <Layer className="juce-grid-page__ops-shell">
        <div className="juce-grid-page__ops-header">
          <div className="juce-grid-page__ops-copy">
            <div className="juce-grid-page__ops-heading">
              <Branch size={18} />
              <strong>Flow assignments</strong>
            </div>
            <p>Review cluster placement and escalate to standby nodes from a Carbon workflow.</p>
          </div>
          <div className="juce-grid-page__ops-actions">
            {!isAllInOne && <Tag type="cool-gray">{standbyCount} standby</Tag>}
            <Button
              size="sm"
              kind="ghost"
              renderIcon={Renew}
              onClick={() => {
                void deploymentQuery.refetch()
                void assignmentsQuery.refetch()
              }}
              disabled={deploymentQuery.isFetching || assignmentsQuery.isFetching}
            >
              Refresh
            </Button>
          </div>
        </div>

        {deploymentQuery.isLoading && renderLoadingState('Loading deployment mode')}
        {deploymentQuery.isError && renderEmptyState('Failed to load flow-assignment mode')}
        {!deploymentQuery.isLoading && !deploymentQuery.isError && isAllInOne && (
          renderAllInOneState('Local flow placement', 'Flows remain on the local node automatically in all-in-one deployments.', 'blue')
        )}
        {!deploymentQuery.isLoading && !deploymentQuery.isError && !isAllInOne && assignmentsQuery.isLoading && renderLoadingState('Loading flow assignments')}
        {!deploymentQuery.isLoading && !deploymentQuery.isError && !isAllInOne && assignmentsQuery.isError && renderEmptyState('Failed to load flow assignments')}
        {!deploymentQuery.isLoading && !deploymentQuery.isError && !isAllInOne && !assignmentsQuery.isLoading && !assignmentsQuery.isError && (
          assignments.length === 0 ? renderEmptyState('No cluster flow assignments are active yet') : (
            <div className="juce-grid-page__assignment-list">
              {assignments.map((assignment, index) => (
                <Tile key={`${assignment.flow_id}-${assignment.chain_id}-${index}`} className="juce-grid-page__assignment-tile">
                  <div className="juce-grid-page__assignment-tile-header">
                    <div className="juce-grid-page__assignment-tile-copy">
                      <strong>{assignment.flow_id}</strong>
                      <p>Chain {assignment.chain_id} on {assignment.assigned_node_id}</p>
                    </div>
                    <div className="juce-grid-page__assignment-tile-tags">
                      <Tag type={assignment.assignment_type === 'primary' ? 'blue' : 'cool-gray'}>
                        {formatAssignmentType(assignment.assignment_type)}
                      </Tag>
                      <Tag type="warm-gray">{formatAssignmentStrategy(assignment.assignment_strategy)}</Tag>
                    </div>
                  </div>

                  <div className="juce-grid-page__assignment-values">
                    <div>
                      <span>Node</span>
                      <strong>{assignment.assigned_node_id}</strong>
                    </div>
                    <div>
                      <span>Chain</span>
                      <strong>{assignment.chain_id}</strong>
                    </div>
                    <div>
                      <span>Strategy</span>
                      <strong>{formatAssignmentStrategy(assignment.assignment_strategy)}</strong>
                    </div>
                  </div>

                  <div className="juce-grid-page__assignment-actions">
                    <Button
                      size="sm"
                      kind="ghost"
                      renderIcon={WarningAlt}
                      onClick={() => setPendingFailover(assignment)}
                    >
                      Trigger failover
                    </Button>
                  </div>
                </Tile>
              ))}
            </div>
          )
        )}
      </Layer>

      {pendingFailover && (
        <Modal
          open
          danger
          modalHeading={`Fail over ${pendingFailover.flow_id}?`}
          primaryButtonText={failoverMutation.isPending ? 'Failing over...' : 'Trigger failover'}
          secondaryButtonText="Cancel"
          primaryButtonDisabled={failoverMutation.isPending}
          onRequestClose={() => {
            if (!failoverMutation.isPending) {
              setPendingFailover(null)
            }
          }}
          onSecondarySubmit={() => {
            if (!failoverMutation.isPending) {
              setPendingFailover(null)
            }
          }}
          onRequestSubmit={() => failoverMutation.mutate(pendingFailover.flow_id)}
        >
          <div className="juce-grid-page__form-modal-body">
            <p className="juce-grid-page__modal-copy">
              Promote the standby path for <strong>{pendingFailover.flow_id}</strong> and refresh cluster routing assignments.
            </p>
          </div>
        </Modal>
      )}
    </>
  )
}
