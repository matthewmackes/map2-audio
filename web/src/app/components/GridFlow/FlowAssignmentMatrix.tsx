import { useQuery } from '@tanstack/react-query'
import { RefreshCw, AlertTriangle, GitBranch } from 'lucide-react'

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
  const res = await fetch('/api/deployment/mode')
  if (!res.ok) throw new Error('Failed to fetch deployment mode')
  return res.json()
}

async function fetchAssignments(): Promise<{ assignments: FlowAssignment[]; total: number }> {
  const res = await fetch('/api/cluster/flows/assignments')
  if (!res.ok) {
    throw new Error('Failed to fetch flow assignments')
  }
  return res.json()
}

export function FlowAssignmentMatrix() {
  const deploymentQuery = useQuery({
    queryKey: ['deployment', 'mode'],
    queryFn: fetchDeploymentMode,
    staleTime: 30000,
  })

  const isAllInOne = deploymentQuery.data?.mode === 'ALL-IN-ONE'

  const { data, refetch, isLoading, error } = useQuery({
    queryKey: ['cluster', 'flow-assignments'],
    queryFn: fetchAssignments,
    refetchInterval: 2000,
    enabled: !isAllInOne,
  })

  const assignments = data?.assignments || []

  const handleFailover = async (flowId: string) => {
    const confirmed = window.confirm('Trigger failover to standby node?')
    if (!confirmed) return

    await fetch('/api/cluster/flows/failover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flow_id: flowId }),
    })

    refetch()
  }

  if (isAllInOne) {
    return (
      <div className="flow-assignment-matrix flow-assignment-compact">
        <div className="flow-assignment-header">
          <GitBranch size={16} />
          <h3>Flow Assignments</h3>
          <span className="cluster-aio-badge">ALL-IN-ONE</span>
          <span className="cluster-aio-status">Flows assigned to local node automatically</span>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flow-assignment-matrix">
        <div className="flow-assignment-header">
          <h3>Flow Assignments</h3>
        </div>
        <div className="flow-assignment-empty">Loading assignments...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flow-assignment-matrix">
        <div className="flow-assignment-header">
          <h3>Flow Assignments</h3>
        </div>
        <div className="flow-assignment-empty">Failed to load assignments</div>
      </div>
    )
  }

  return (
    <div className="flow-assignment-matrix">
      <div className="flow-assignment-header">
        <h3>Flow Assignments ({assignments.length})</h3>
        <button className="flow-assignment-refresh" onClick={() => refetch()}>
          <RefreshCw size={16} />
        </button>
      </div>

      {assignments.length === 0 ? (
        <div className="flow-assignment-empty">No assignments</div>
      ) : (
        <div className="flow-assignment-table">
          <div className="flow-assignment-row header">
            <div>Flow</div>
            <div>Chain</div>
            <div>Node</div>
            <div>Type</div>
            <div>Strategy</div>
            <div>Actions</div>
          </div>

          {assignments.map((assignment, idx) => (
            <div key={`${assignment.flow_id}-${idx}`} className="flow-assignment-row">
              <div>{assignment.flow_id}</div>
              <div>{assignment.chain_id}</div>
              <div>{assignment.assigned_node_id}</div>
              <div>{assignment.assignment_type}</div>
              <div>{assignment.assignment_strategy}</div>
              <div className="flow-assignment-actions">
                <button
                  className="flow-assignment-action"
                  title="Failover"
                  onClick={() => handleFailover(assignment.flow_id)}
                >
                  <AlertTriangle size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
