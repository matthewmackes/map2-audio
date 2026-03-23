import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Branch, Meter, Renew } from '@carbon/icons-react'
import { Button, Layer, Tag } from '@carbon/react'

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

async function fetchDeploymentMode(): Promise<DeploymentModeResponse> {
  const res = await fetch(`${API_BASE}/deployment/mode`)
  if (!res.ok) throw new Error('Failed to fetch deployment mode')
  return res.json()
}

async function fetchClusterNodes(): Promise<{ nodes: ClusterNode[] }> {
  const res = await fetch(`${API_BASE}/cluster/nodes`)
  if (!res.ok) throw new Error('Failed to fetch cluster nodes')
  const data = await res.json()
  const rawNodes = Array.isArray(data?.nodes) ? data.nodes : []

  return {
    nodes: rawNodes.map((node: ClusterNode) => {
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

export function JuceGridClusterPanel() {
  return <JuceGridClusterSummaryBar />
}

export function JuceGridFlowAssignmentPanel() {
  return null
}

export function JuceGridClusterSummaryBar() {
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

  const nodes = nodesQuery.data?.nodes || []
  const onlineCount = useMemo(
    () => nodes.filter((node) => node.status === 'ONLINE').length,
    [nodes],
  )

  const assignmentsQuery = useQuery({
    queryKey: ['cluster', 'flow-assignments'],
    queryFn: fetchAssignments,
    refetchInterval: isAllInOne ? false : 4000,
    enabled: !isAllInOne,
  })

  const assignments = assignmentsQuery.data?.assignments || []
  const standbyCount = useMemo(
    () => assignments.filter((assignment) => assignment.assignment_type === 'standby').length,
    [assignments],
  )

  const combinedLoading = deploymentQuery.isLoading || (!isAllInOne && (nodesQuery.isLoading || assignmentsQuery.isLoading))
  const combinedError = deploymentQuery.isError || (!isAllInOne && (nodesQuery.isError || assignmentsQuery.isError))
  const isRefreshing = deploymentQuery.isFetching || nodesQuery.isFetching || assignmentsQuery.isFetching

  const clusterStatusCopy = isAllInOne
    ? 'Cluster services are running on this device, so failover controls are not required.'
    : combinedError
      ? 'Failed to load cluster deployment status.'
      : combinedLoading
        ? 'Loading cluster node status and readiness.'
        : nodes.length === 0
          ? 'No cluster nodes detected.'
          : `${onlineCount}/${nodes.length} nodes online and ready for routing capacity review.`

  const assignmentStatusCopy = isAllInOne
    ? 'Flows remain on the local node automatically in all-in-one deployments.'
    : combinedError
      ? 'Failed to load flow-assignment status.'
      : combinedLoading
        ? 'Loading current flow placement and standby readiness.'
        : assignments.length === 0
          ? 'No cluster flow assignments are active yet.'
          : `${assignments.length} active assignments, ${standbyCount} standby, available for escalation workflows.`

  return (
    <Layer className="juce-grid-page__ops-shell">
      <div className="juce-grid-page__ops-header juce-grid-page__ops-header--combined">
        <div className="juce-grid-page__ops-summary-grid">
          <div className="juce-grid-page__ops-summary-block">
            <div className="juce-grid-page__ops-heading">
              <Meter size={18} />
              <strong>Cluster nodes</strong>
            </div>
            <p>Monitor routing capacity and node readiness without leaving the editor.</p>
            <span className="juce-grid-page__ops-summary-status">{clusterStatusCopy}</span>
          </div>

          <div className="juce-grid-page__ops-summary-block">
            <div className="juce-grid-page__ops-heading">
              <Branch size={18} />
              <strong>Flow assignments</strong>
            </div>
            <p>Review cluster placement and escalate to standby nodes from a Carbon workflow.</p>
            <span className="juce-grid-page__ops-summary-status">{assignmentStatusCopy}</span>
          </div>
        </div>

        <div className="juce-grid-page__ops-actions">
          {isAllInOne ? (
            <Tag type="green">ALL-IN-ONE</Tag>
          ) : (
            <>
              <Tag type="green">{onlineCount}/{nodes.length || 0} online</Tag>
              <Tag type="cool-gray">{standbyCount} standby</Tag>
            </>
          )}
          <Button
            size="sm"
            kind="ghost"
            renderIcon={Renew}
            onClick={() => {
              void deploymentQuery.refetch()
              void nodesQuery.refetch()
              void assignmentsQuery.refetch()
            }}
            disabled={isRefreshing}
          >
            Refresh
          </Button>
        </div>
      </div>
    </Layer>
  )
}
