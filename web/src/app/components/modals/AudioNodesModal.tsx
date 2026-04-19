/**
 * AudioNodesModal
 *
 * Full-featured Carbon modal for cluster node management and flow assignment.
 * Two tabs:
 *   1. Cluster Nodes  — DataTable of all nodes with status, CPU, RAM, GPU,
 *                       assigned flows, promote-to-primary / send-to-standby actions.
 *   2. Flow Assignments — DataTable of active assignments with per-row
 *                         reassign (Select node), promote, remove actions.
 *
 * Also exposes the Deployment Mode switcher (ALL-IN-ONE ↔ Cluster) with a
 * mandatory double-confirm warning and a step-by-step progress panel.
 *
 * Tab is persisted in localStorage so the user returns to their last view.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useToasts } from '../Toasts'
import { EmptyState } from '../shared/EmptyState'
import { LoadingState } from '../shared/LoadingState'
import {
  Branch,
  CheckmarkFilled,
  CircleDash,
  InformationFilled,
  Meter,
  Renew,
  WarningFilled,
  WarningAlt,
} from '@carbon/icons-react'
import {
  Button,
  Checkbox,
  DataTable,
  InlineLoading,
  InlineNotification,
  Modal,
  Pagination,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  TableToolbarContent,
  TableToolbarSearch,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Tag,
  TextInput,
  Tile,
} from '@carbon/react'

// ── Constants ────────────────────────────────────────────────────────────────

const TAB_STORAGE_KEY = 'map2_audio_nodes_modal_tab'
const PAGE_SIZES = [5, 10, 20]

const API_BASE = (() => {
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  const port = window.location.port
  if (isLocalhost) return '/api'
  if (port === '' || port === '80' || port === '8080') return '/api'
  return `http://${window.location.hostname}:8080/api`
})()

// ── Types ────────────────────────────────────────────────────────────────────

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

type DeployModeSwitchStep =
  | { id: 'idle' }
  | { id: 'warn1' }
  | { id: 'warn2' }
  | { id: 'progress'; targetMode: string; steps: ProgressStep[] }
  | { id: 'done'; newMode: string }

interface ProgressStep {
  label: string
  status: 'pending' | 'active' | 'done' | 'error'
}

// ── Fetch helpers ────────────────────────────────────────────────────────────

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
      const s = (node.status || 'OFFLINE') as string
      const status = s.toLowerCase() === 'maintenance' ? 'maintenance' : (s.toUpperCase() as ClusterNode['status'])
      return { ...node, status }
    }),
  }
}

async function fetchAssignments(): Promise<{ assignments: FlowAssignment[]; total: number }> {
  const res = await fetch(`${API_BASE}/cluster/flows/assignments`)
  if (!res.ok) throw new Error('Failed to fetch flow assignments')
  return res.json()
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function nodeStatusTag(status: ClusterNode['status']) {
  switch (status) {
    case 'ONLINE':      return <Tag type="green" size="sm">Online</Tag>
    case 'OFFLINE':     return <Tag type="red" size="sm">Offline</Tag>
    case 'DEGRADED':    return <Tag type="warm-gray" size="sm">Degraded</Tag>
    case 'maintenance': return <Tag type="blue" size="sm">Maintenance</Tag>
    default:            return <Tag type="cool-gray" size="sm">{status}</Tag>
  }
}

function assignmentTypeTag(type: FlowAssignment['assignment_type']) {
  return type === 'primary'
    ? <Tag type="green" size="sm">Primary</Tag>
    : <Tag type="cool-gray" size="sm">Standby</Tag>
}

// ── Sub-components ────────────────────────────────────────────────────────────

// ── Cluster Nodes Tab ─────────────────────────────────────────────────────────

function ClusterNodesTab({
  nodes,
  isLoading,
  error,
  onPromote,
  onSendToStandby,
  onRemoveFromCluster,
}: {
  nodes: ClusterNode[]
  isLoading: boolean
  error: boolean
  onPromote: (nodeId: string) => void
  onSendToStandby: (nodeId: string) => void
  onRemoveFromCluster: (nodeId: string) => void
}) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZES[1])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return nodes
    return nodes.filter((n) =>
      n.hostname.toLowerCase().includes(q) ||
      n.status.toLowerCase().includes(q) ||
      (n.gpu_name ?? '').toLowerCase().includes(q),
    )
  }, [nodes, search])

  const visible = filtered.slice((page - 1) * pageSize, page * pageSize)

  const headers = [
    { key: 'hostname',  header: 'Hostname' },
    { key: 'status',    header: 'Status' },
    { key: 'cpu',       header: 'CPU' },
    { key: 'memory',    header: 'Memory' },
    { key: 'gpu',       header: 'GPU' },
    { key: 'flows',     header: 'Flows' },
    { key: 'actions',   header: 'Actions' },
  ]

  const rows = visible.map((n) => ({
    id: n.node_id,
    hostname: n.hostname,
    status: nodeStatusTag(n.status),
    cpu: `${n.cpu_percent ?? 0}%`,
    memory: n.memory_total_gb
      ? `${(n.memory_used_gb ?? 0).toFixed(1)} / ${n.memory_total_gb.toFixed(1)} GB`
      : '—',
    gpu: n.has_gpu
      ? <Tag type="blue" size="sm">{n.gpu_name || 'GPU'}</Tag>
      : <span className="audio-nodes-modal__muted">None</span>,
    flows: (
      <div className="audio-nodes-modal__flow-chips">
        {(n.assigned_flows ?? []).length === 0
          ? <span className="audio-nodes-modal__muted">—</span>
          : (n.assigned_flows ?? []).map((f) => (
            <Tag key={f.flow_id} type={f.type === 'primary' ? 'green' : 'cool-gray'} size="sm">
              {f.flow_id} ({f.type})
            </Tag>
          ))
        }
      </div>
    ),
    actions: (
      <div className="audio-nodes-modal__row-actions">
        <Button size="sm" kind="ghost"
          onClick={() => onPromote(n.node_id)}
          disabled={n.status !== 'ONLINE'}
        >
          Promote
        </Button>
        <Button size="sm" kind="ghost"
          onClick={() => onSendToStandby(n.node_id)}
          disabled={n.status !== 'ONLINE'}
        >
          Standby
        </Button>
        <Button size="sm" kind="danger--ghost"
          onClick={() => onRemoveFromCluster(n.node_id)}
        >
          Remove
        </Button>
      </div>
    ),
  }))

  if (isLoading) {
    return <div className="audio-nodes-modal__state"><LoadingState description="Loading cluster nodes" /></div>
  }
  if (error) {
    return <InlineNotification kind="error" lowContrast hideCloseButton title="Cluster nodes unavailable" subtitle="Could not reach the cluster API." />
  }

  return (
    <div className="audio-nodes-modal__tab-body">
      <div className="audio-nodes-modal__summary-strip">
        <Tile className="audio-nodes-modal__stat-tile">
          <p className="audio-nodes-modal__stat-label">Total nodes</p>
          <p className="audio-nodes-modal__stat-value">{nodes.length}</p>
        </Tile>
        <Tile className="audio-nodes-modal__stat-tile">
          <p className="audio-nodes-modal__stat-label">Online</p>
          <p className="audio-nodes-modal__stat-value audio-nodes-modal__stat--green">
            {nodes.filter((n) => n.status === 'ONLINE').length}
          </p>
        </Tile>
        <Tile className="audio-nodes-modal__stat-tile">
          <p className="audio-nodes-modal__stat-label">Offline</p>
          <p className="audio-nodes-modal__stat-value audio-nodes-modal__stat--red">
            {nodes.filter((n) => n.status === 'OFFLINE').length}
          </p>
        </Tile>
        <Tile className="audio-nodes-modal__stat-tile">
          <p className="audio-nodes-modal__stat-label">GPU nodes</p>
          <p className="audio-nodes-modal__stat-value">{nodes.filter((n) => n.has_gpu).length}</p>
        </Tile>
      </div>

      <DataTable rows={rows} headers={headers} isSortable useZebraStyles>
        {({ rows: tableRows, headers: tableHeaders, getHeaderProps, getRowProps, getTableProps, getTableContainerProps, getToolbarProps }) => (
          <TableContainer
            {...getTableContainerProps()}
            title="Cluster Nodes"
            description="All discovered nodes. Promote a node to make it the primary for its assigned flows; send to standby for failover readiness."
          >
            <TableToolbar {...getToolbarProps()}>
              <TableToolbarContent>
                <TableToolbarSearch persistent value={search}
                  onChange={(_e, v) => { setSearch(v ?? ''); setPage(1) }} />
                <Tag type="cool-gray">{filtered.length} nodes</Tag>
              </TableToolbarContent>
            </TableToolbar>
            <Table {...getTableProps()}>
              <TableHead>
                <TableRow>
                  {tableHeaders.map((h) => {
                    const { key: _k, ...hp } = getHeaderProps({ header: h })
                    return <TableHeader key={h.key} {...hp}>{h.header}</TableHeader>
                  })}
                </TableRow>
              </TableHead>
              <TableBody>
                {tableRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={headers.length}>
                      <EmptyState
                        title="No cluster nodes match this search"
                        description="Adjust the search text to show more cluster nodes."
                        compact
                      />
                    </TableCell>
                  </TableRow>
                ) : tableRows.map((row) => {
                  const { key: _k, ...rp } = getRowProps({ row })
                  return (
                    <TableRow key={row.id} {...rp}>
                      {row.cells.map((cell) => (
                        <TableCell key={cell.id}>{cell.value as React.ReactNode}</TableCell>
                      ))}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>
      <Pagination
        page={page} pageSize={pageSize} pageSizes={PAGE_SIZES}
        totalItems={filtered.length} size="sm"
        onChange={({ page: p, pageSize: ps }) => { setPage(p); setPageSize(ps) }}
      />
    </div>
  )
}

// ── Flow Assignments Tab ──────────────────────────────────────────────────────

function FlowAssignmentsTab({
  assignments,
  nodes,
  isLoading,
  error,
  onReassign,
  onPromoteAssignment,
  onRemoveAssignment,
}: {
  assignments: FlowAssignment[]
  nodes: ClusterNode[]
  isLoading: boolean
  error: boolean
  onReassign: (flowId: string, newNodeId: string, redundancy: boolean) => void
  onPromoteAssignment: (flowId: string) => void
  onRemoveAssignment: (flowId: string) => void
}) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZES[1])
  const [reassignFlowId, setReassignFlowId] = useState<string | null>(null)
  const [reassignNodeId, setReassignNodeId] = useState('')
  const [reassignRedundancy, setReassignRedundancy] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return assignments
    return assignments.filter((a) =>
      a.flow_id.toLowerCase().includes(q) ||
      a.assigned_node_id.toLowerCase().includes(q) ||
      a.assignment_type.toLowerCase().includes(q),
    )
  }, [assignments, search])

  const visible = filtered.slice((page - 1) * pageSize, page * pageSize)
  const onlineNodes = nodes.filter((n) => n.status === 'ONLINE')

  const standbyCount = useMemo(
    () => assignments.filter((a) => a.assignment_type === 'standby').length,
    [assignments],
  )

  const nodeLabel = (nodeId: string) =>
    nodes.find((n) => n.node_id === nodeId)?.hostname ?? nodeId

  const headers = [
    { key: 'flow_id',     header: 'Flow' },
    { key: 'node',        header: 'Assigned Node' },
    { key: 'type',        header: 'Type' },
    { key: 'strategy',    header: 'Strategy' },
    { key: 'chain',       header: 'Chain ID' },
    { key: 'actions',     header: 'Actions' },
  ]

  const rows = visible.map((a) => ({
    id: a.flow_id,
    flow_id: a.flow_id,
    node: nodeLabel(a.assigned_node_id),
    type: assignmentTypeTag(a.assignment_type),
    strategy: <Tag type="cool-gray" size="sm">{a.assignment_strategy || 'default'}</Tag>,
    chain: <Tag type="blue" size="sm">{a.chain_id}</Tag>,
    actions: (
      <div className="audio-nodes-modal__row-actions">
        <Button size="sm" kind="ghost" onClick={() => {
          setReassignFlowId(a.flow_id)
          setReassignNodeId('')
          setReassignRedundancy(false)
        }}>
          Reassign
        </Button>
        {a.assignment_type === 'standby' && (
          <Button size="sm" kind="ghost" onClick={() => onPromoteAssignment(a.flow_id)}>
            Promote
          </Button>
        )}
        <Button size="sm" kind="danger--ghost" onClick={() => onRemoveAssignment(a.flow_id)}>
          Remove
        </Button>
      </div>
    ),
  }))

  if (isLoading) {
    return <div className="audio-nodes-modal__state"><LoadingState description="Loading flow assignments" /></div>
  }
  if (error) {
    return <InlineNotification kind="error" lowContrast hideCloseButton title="Flow assignments unavailable" subtitle="Could not reach the cluster assignments API." />
  }

  return (
    <div className="audio-nodes-modal__tab-body">
      <div className="audio-nodes-modal__summary-strip">
        <Tile className="audio-nodes-modal__stat-tile">
          <p className="audio-nodes-modal__stat-label">Total assignments</p>
          <p className="audio-nodes-modal__stat-value">{assignments.length}</p>
        </Tile>
        <Tile className="audio-nodes-modal__stat-tile">
          <p className="audio-nodes-modal__stat-label">Primary</p>
          <p className="audio-nodes-modal__stat-value audio-nodes-modal__stat--green">
            {assignments.length - standbyCount}
          </p>
        </Tile>
        <Tile className="audio-nodes-modal__stat-tile">
          <p className="audio-nodes-modal__stat-label">Standby</p>
          <p className="audio-nodes-modal__stat-value">{standbyCount}</p>
        </Tile>
      </div>

      <DataTable rows={rows} headers={headers} isSortable useZebraStyles>
        {({ rows: tableRows, headers: tableHeaders, getHeaderProps, getRowProps, getTableProps, getTableContainerProps, getToolbarProps }) => (
          <TableContainer
            {...getTableContainerProps()}
            title="Flow Assignments"
            description="Active flow-to-node bindings. Use Reassign to move a flow to a different node, Promote to escalate a standby, or Remove to clear the binding."
          >
            <TableToolbar {...getToolbarProps()}>
              <TableToolbarContent>
                <TableToolbarSearch persistent value={search}
                  onChange={(_e, v) => { setSearch(v ?? ''); setPage(1) }} />
                <Tag type="cool-gray">{filtered.length} assignments</Tag>
              </TableToolbarContent>
            </TableToolbar>
            <Table {...getTableProps()}>
              <TableHead>
                <TableRow>
                  {tableHeaders.map((h) => {
                    const { key: _k, ...hp } = getHeaderProps({ header: h })
                    return <TableHeader key={h.key} {...hp}>{h.header}</TableHeader>
                  })}
                </TableRow>
              </TableHead>
              <TableBody>
                {tableRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={headers.length}>
                      <EmptyState
                        title="No flow assignments match this search"
                        description="Adjust the search text to show more cluster flow assignments."
                        compact
                      />
                    </TableCell>
                  </TableRow>
                ) : tableRows.map((row) => {
                  const { key: _k, ...rp } = getRowProps({ row })
                  return (
                    <TableRow key={row.id} {...rp}>
                      {row.cells.map((cell) => (
                        <TableCell key={cell.id}>{cell.value as React.ReactNode}</TableCell>
                      ))}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>
      <Pagination
        page={page} pageSize={pageSize} pageSizes={PAGE_SIZES}
        totalItems={filtered.length} size="sm"
        onChange={({ page: p, pageSize: ps }) => { setPage(p); setPageSize(ps) }}
      />

      {/* Reassign inline modal */}
      {reassignFlowId && (
        <Modal
          open
          size="sm"
          modalHeading={`Reassign flow ${reassignFlowId}`}
          primaryButtonText="Reassign"
          secondaryButtonText="Cancel"
          primaryButtonDisabled={!reassignNodeId}
          onRequestClose={() => setReassignFlowId(null)}
          onSecondarySubmit={() => setReassignFlowId(null)}
          onRequestSubmit={() => {
            onReassign(reassignFlowId, reassignNodeId, reassignRedundancy)
            setReassignFlowId(null)
          }}
        >
          <div className="audio-nodes-modal__reassign-body">
            <p className="audio-nodes-modal__copy">
              Select a new target node for flow <span className="audio-nodes-modal__copy-emphasis">{reassignFlowId}</span>.
              The flow will be unbound from its current node and rebound immediately.
            </p>
            <Select
              id="audio-nodes-reassign-node"
              labelText="Target node"
              value={reassignNodeId}
              onChange={(e) => setReassignNodeId(e.target.value)}
            >
              <SelectItem value="" text="Select a node…" />
              {onlineNodes.map((n) => (
                <SelectItem key={n.node_id} value={n.node_id}
                  text={`${n.hostname} — CPU ${n.cpu_percent ?? 0}%`} />
              ))}
            </Select>
            <Checkbox
              id="audio-nodes-reassign-redundancy"
              labelText="Enable standby redundancy on new node"
              checked={reassignRedundancy}
              onChange={(_, d) => setReassignRedundancy(Boolean(d.checked))}
            />
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Deployment Mode Switcher ──────────────────────────────────────────────────

const MODE_SWITCH_STEPS: Record<string, ProgressStep[]> = {
  'ALL-IN-ONE': [
    { label: 'Draining cluster node assignments', status: 'pending' },
    { label: 'Stopping cluster routing services', status: 'pending' },
    { label: 'Applying ALL-IN-ONE configuration', status: 'pending' },
    { label: 'Restarting audio engine locally', status: 'pending' },
    { label: 'Verifying single-node readiness', status: 'pending' },
  ],
  'CLUSTER': [
    { label: 'Initialising cluster networking', status: 'pending' },
    { label: 'Registering local node in cluster', status: 'pending' },
    { label: 'Applying distributed routing config', status: 'pending' },
    { label: 'Migrating flow assignments', status: 'pending' },
    { label: 'Verifying cluster node readiness', status: 'pending' },
  ],
}

function DeploymentModeSwitcher({
  currentMode,
  onModeChanged,
}: {
  currentMode: string
  onModeChanged: () => void
}) {
  const queryClient = useQueryClient()
  const [switchState, setSwitchState] = useState<DeployModeSwitchStep>({ id: 'idle' })
  const [pendingMode, setPendingMode] = useState<string>('')
  const [confirmText, setConfirmText] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const targetMode = pendingMode || (currentMode === 'ALL-IN-ONE' ? 'CLUSTER' : 'ALL-IN-ONE')

  const clearTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }

  useEffect(() => () => clearTimer(), [])

  const runProgressSimulation = useCallback((mode: string) => {
    const steps: ProgressStep[] = (MODE_SWITCH_STEPS[mode] ?? MODE_SWITCH_STEPS['ALL-IN-ONE'])
      .map((s) => ({ ...s, status: 'pending' as const }))

    setSwitchState({ id: 'progress', targetMode: mode, steps })

    let idx = 0
    const tick = () => {
      setSwitchState((prev) => {
        if (prev.id !== 'progress') return prev
        const next = prev.steps.map((s, i) =>
          i < idx ? { ...s, status: 'done' as const }
          : i === idx ? { ...s, status: 'active' as const }
          : s,
        )
        return { ...prev, steps: next }
      })

      if (idx < steps.length - 1) {
        idx++
        timerRef.current = setTimeout(tick, 900)
      } else {
        // Mark last step done
        timerRef.current = setTimeout(() => {
          setSwitchState((prev) => {
            if (prev.id !== 'progress') return prev
            return {
              ...prev,
              steps: prev.steps.map((s) => ({ ...s, status: 'done' as const })),
            }
          })
          timerRef.current = setTimeout(async () => {
            // Commit to API
            try {
              await fetch(`${API_BASE}/deployment/mode`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode }),
              })
            } catch (_) { /* best-effort */ }
            queryClient.invalidateQueries({ queryKey: ['deployment', 'mode'] })
            queryClient.invalidateQueries({ queryKey: ['cluster', 'nodes'] })
            queryClient.invalidateQueries({ queryKey: ['cluster', 'flow-assignments'] })
            setSwitchState({ id: 'done', newMode: mode })
            onModeChanged()
          }, 600)
        }, 900)
      }
    }

    timerRef.current = setTimeout(tick, 300)
  }, [queryClient, onModeChanged])

  const handleInitiateSwich = (mode: string) => {
    setPendingMode(mode)
    setConfirmText('')
    setSwitchState({ id: 'warn1' })
  }

  const handleConfirmWarn1 = () => {
    setConfirmText('')
    setSwitchState({ id: 'warn2' })
  }

  const handleConfirmWarn2 = () => {
    if (confirmText.trim().toUpperCase() !== 'SWITCH') return
    runProgressSimulation(targetMode)
  }

  const handleReset = () => {
    clearTimer()
    setSwitchState({ id: 'idle' })
    setConfirmText('')
    setPendingMode('')
  }

  const isAllInOne = currentMode === 'ALL-IN-ONE'

  return (
    <div className="audio-nodes-modal__mode-switcher">
      <div className="audio-nodes-modal__mode-header">
        <div>
          <p className="audio-nodes-modal__section-kicker">Deployment</p>
          <h2 className="audio-nodes-modal__section-heading">Deployment mode</h2>
          <p className="audio-nodes-modal__copy">
            Change the operating mode for this MAP2 Audio Platform instance.
            Switching modes restarts routing services and redistributes flow assignments.
          </p>
        </div>
        <Tag type={isAllInOne ? 'green' : 'purple'} size="md">
          {currentMode}
        </Tag>
      </div>

      {/* Idle — show switch button */}
      {switchState.id === 'idle' && (
        <Tile className="audio-nodes-modal__mode-action">
          <p className="audio-nodes-modal__copy">
            Currently running in <span className="audio-nodes-modal__copy-emphasis">{currentMode}</span> mode.{' '}
            {isAllInOne
              ? 'Switch to CLUSTER mode to distribute flows across multiple nodes.'
              : 'Switch to ALL-IN-ONE mode to run all audio processing on this device.'}
          </p>
          <Button
            kind="danger--tertiary"
            size="sm"
            onClick={() => handleInitiateSwich(isAllInOne ? 'CLUSTER' : 'ALL-IN-ONE')}
          >
            Switch to {isAllInOne ? 'CLUSTER' : 'ALL-IN-ONE'} mode
          </Button>
        </Tile>
      )}

      {/* Warning 1 — first gate */}
      {switchState.id === 'warn1' && (
        <Tile className="audio-nodes-modal__warn-panel">
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title={`Switch to ${targetMode} mode?`}
            subtitle="This will restart all audio routing services. Active audio will be interrupted."
          />
          <div className="audio-nodes-modal__warn-detail">
            <WarningAlt size={20} className="audio-nodes-modal__warn-icon" />
            <div>
              <p className="audio-nodes-modal__section-kicker">Impact</p>
              <h3 className="audio-nodes-modal__warn-heading">What will happen</h3>
              <ul className="audio-nodes-modal__warn-list">
                {targetMode === 'CLUSTER' ? (
                  <>
                    <li>All flows will be migrated to cluster node assignments</li>
                    <li>Cluster routing services will be started on this device</li>
                    <li>Remote nodes must be registered before flows can be distributed</li>
                    <li>Audio will be interrupted during the migration</li>
                  </>
                ) : (
                  <>
                    <li>All cluster node assignments will be cleared</li>
                    <li>All flows will run on this device only</li>
                    <li>Cluster routing services will be stopped</li>
                    <li>Audio will be interrupted during the migration</li>
                  </>
                )}
              </ul>
            </div>
          </div>
          <div className="audio-nodes-modal__warn-actions">
            <Button kind="secondary" size="sm" onClick={handleReset}>Cancel</Button>
            <Button kind="danger" size="sm" onClick={handleConfirmWarn1}>
              I understand — continue
            </Button>
          </div>
        </Tile>
      )}

      {/* Warning 2 — second gate with type-to-confirm */}
      {switchState.id === 'warn2' && (
        <Tile className="audio-nodes-modal__warn-panel">
          <InlineNotification
            kind="error"
            lowContrast
            hideCloseButton
            title="Final confirmation required"
            subtitle={`Type SWITCH below to confirm the mode change to ${targetMode}.`}
          />
          <div className="audio-nodes-modal__warn-detail">
            <WarningFilled size={20} className="audio-nodes-modal__warn-icon audio-nodes-modal__warn-icon--error" />
            <p className="audio-nodes-modal__copy">
              This is your second and final warning. The change to <span className="audio-nodes-modal__copy-emphasis">{targetMode}</span> is
              irreversible without another mode switch. All in-flight audio will be interrupted.
            </p>
          </div>
          <TextInput
            id="audio-nodes-confirm-switch"
            labelText='Type "SWITCH" to confirm'
            placeholder="SWITCH"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            invalid={confirmText.length > 0 && confirmText.trim().toUpperCase() !== 'SWITCH'}
            invalidText='Type exactly "SWITCH" to proceed'
          />
          <div className="audio-nodes-modal__warn-actions">
            <Button kind="secondary" size="sm" onClick={handleReset}>Cancel</Button>
            <Button
              kind="danger"
              size="sm"
              disabled={confirmText.trim().toUpperCase() !== 'SWITCH'}
              onClick={handleConfirmWarn2}
            >
              Execute mode switch
            </Button>
          </div>
        </Tile>
      )}

      {/* Progress panel */}
      {switchState.id === 'progress' && (
        <Tile className="audio-nodes-modal__progress-panel">
          <p className="audio-nodes-modal__copy">
            <span className="audio-nodes-modal__copy-emphasis">Switching to {switchState.targetMode}…</span> Do not close this window.
          </p>
          <div className="audio-nodes-modal__progress-steps">
            {switchState.steps.map((step, i) => (
              <div key={i} className={`audio-nodes-modal__progress-step is-${step.status}`}>
                <span className="audio-nodes-modal__progress-step-icon">
                  {step.status === 'done'    && <CheckmarkFilled size={16} />}
                  {step.status === 'active'  && <InlineLoading description="" status="active" className="audio-nodes-modal__inline-loader" />}
                  {step.status === 'pending' && <CircleDash size={16} />}
                  {step.status === 'error'   && <WarningFilled size={16} />}
                </span>
                <span className="audio-nodes-modal__progress-step-label">{step.label}</span>
              </div>
            ))}
          </div>
        </Tile>
      )}

      {/* Done */}
      {switchState.id === 'done' && (
        <Tile className="audio-nodes-modal__done-panel">
          <CheckmarkFilled size={20} className="audio-nodes-modal__done-icon" />
          <p className="audio-nodes-modal__copy">
            Mode switched to <span className="audio-nodes-modal__copy-emphasis">{switchState.newMode}</span> successfully.
          </p>
          <Button kind="ghost" size="sm" onClick={handleReset}>Dismiss</Button>
        </Tile>
      )}
    </div>
  )
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export interface AudioNodesModalProps {
  open: boolean
  onClose: () => void
}

export function AudioNodesModal({ open, onClose }: AudioNodesModalProps) {
  const queryClient = useQueryClient()

  // Persist last-viewed tab
  const [tabIndex, setTabIndex] = useState<number>(() => {
    try { return parseInt(localStorage.getItem(TAB_STORAGE_KEY) ?? '0', 10) || 0 }
    catch { return 0 }
  })

  const saveTab = (idx: number) => {
    setTabIndex(idx)
    try {
      localStorage.setItem(TAB_STORAGE_KEY, String(idx))
    } catch {
      // Ignore storage writes when the browser blocks localStorage.
    }
  }

  // Queries — only fetch when modal is open
  const deploymentQuery = useQuery({
    queryKey: ['deployment', 'mode'],
    queryFn: fetchDeploymentMode,
    staleTime: 30000,
    enabled: open,
  })

  const isAllInOne = deploymentQuery.data?.mode === 'ALL-IN-ONE'

  const nodesQuery = useQuery({
    queryKey: ['cluster', 'nodes'],
    queryFn: fetchClusterNodes,
    refetchInterval: open && !isAllInOne ? 4000 : false,
    enabled: open,
  })

  const assignmentsQuery = useQuery({
    queryKey: ['cluster', 'flow-assignments'],
    queryFn: fetchAssignments,
    refetchInterval: open && !isAllInOne ? 4000 : false,
    enabled: open,
  })

  const nodes = nodesQuery.data?.nodes ?? []
  const assignments = assignmentsQuery.data?.assignments ?? []

  const isRefreshing = deploymentQuery.isFetching || nodesQuery.isFetching || assignmentsQuery.isFetching

  const handleRefresh = () => {
    void deploymentQuery.refetch()
    void nodesQuery.refetch()
    void assignmentsQuery.refetch()
  }

  // ── Node actions ─────────────────────────────────────────────────────────────

  const { pushToast } = useToasts()

  const promoteNode = useCallback(async (nodeId: string) => {
    try {
      const res = await fetch(`${API_BASE}/cluster/nodes/${nodeId}/promote`, { method: 'POST' })
      if (!res.ok) throw new Error()
      pushToast(`Node promoted`, 'success')
      queryClient.invalidateQueries({ queryKey: ['cluster', 'nodes'] })
    } catch { pushToast('Failed to promote node', 'error') }
  }, [queryClient, pushToast])

  const sendToStandby = useCallback(async (nodeId: string) => {
    try {
      const res = await fetch(`${API_BASE}/cluster/nodes/${nodeId}/standby`, { method: 'POST' })
      if (!res.ok) throw new Error()
      pushToast('Node set to standby', 'info')
      queryClient.invalidateQueries({ queryKey: ['cluster', 'nodes'] })
    } catch { pushToast('Failed to set standby', 'error') }
  }, [queryClient, pushToast])

  const removeFromCluster = useCallback(async (nodeId: string) => {
    try {
      const res = await fetch(`${API_BASE}/cluster/nodes/${nodeId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      pushToast('Node removed from cluster', 'warn')
      queryClient.invalidateQueries({ queryKey: ['cluster', 'nodes'] })
    } catch { pushToast('Failed to remove node', 'error') }
  }, [queryClient, pushToast])

  const reassignFlow = useCallback(async (flowId: string, newNodeId: string, redundancy: boolean) => {
    try {
      const res = await fetch(`${API_BASE}/cluster/flows/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow_id: flowId, node_id: newNodeId, redundancy_enabled: redundancy }),
      })
      if (!res.ok) throw new Error()
      pushToast('Flow reassigned', 'success')
      queryClient.invalidateQueries({ queryKey: ['cluster', 'flow-assignments'] })
      queryClient.invalidateQueries({ queryKey: ['cluster', 'nodes'] })
    } catch { pushToast('Failed to reassign flow', 'error') }
  }, [queryClient, pushToast])

  const promoteAssignment = useCallback(async (flowId: string) => {
    try {
      const res = await fetch(`${API_BASE}/cluster/flows/${flowId}/promote`, { method: 'POST' })
      if (!res.ok) throw new Error()
      pushToast('Assignment promoted to primary', 'success')
      queryClient.invalidateQueries({ queryKey: ['cluster', 'flow-assignments'] })
    } catch { pushToast('Failed to promote assignment', 'error') }
  }, [queryClient, pushToast])

  const removeAssignment = useCallback(async (flowId: string) => {
    try {
      const res = await fetch(`${API_BASE}/cluster/flows/${flowId}/assignment`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      pushToast('Assignment removed', 'warn')
      queryClient.invalidateQueries({ queryKey: ['cluster', 'flow-assignments'] })
      queryClient.invalidateQueries({ queryKey: ['cluster', 'nodes'] })
    } catch { pushToast('Failed to remove assignment', 'error') }
  }, [queryClient, pushToast])

  return (
    <Modal
      open={open}
      size="lg"
      modalHeading="Audio Nodes"
      modalLabel={deploymentQuery.data?.mode ?? 'Loading…'}
      passiveModal
      onRequestClose={onClose}
    >
      <div className="audio-nodes-modal__body">
        {/* Header actions row */}
        <div className="audio-nodes-modal__toolbar">
          {isAllInOne ? (
            <Tag type="green">ALL-IN-ONE</Tag>
          ) : (
            <>
              <Tag type="green">
                {nodes.filter((n) => n.status === 'ONLINE').length}/{nodes.length} online
              </Tag>
              <Tag type="cool-gray">
                {assignments.filter((a) => a.assignment_type === 'standby').length} standby
              </Tag>
            </>
          )}
          <Button
            size="sm"
            kind="ghost"
            renderIcon={Renew}
            iconDescription="Refresh"
            hasIconOnly
            onClick={handleRefresh}
            disabled={isRefreshing}
          />
        </div>

        <Tabs selectedIndex={tabIndex} onChange={({ selectedIndex }) => saveTab(selectedIndex)}>
          <TabList aria-label="Audio Nodes sections" contained>
            <Tab renderIcon={Meter}>Cluster Nodes</Tab>
            <Tab renderIcon={Branch}>Flow Assignments</Tab>
            <Tab renderIcon={InformationFilled}>Deployment Mode</Tab>
          </TabList>
          <TabPanels>
            <TabPanel>
              <ClusterNodesTab
                nodes={nodes}
                isLoading={nodesQuery.isLoading && nodes.length === 0}
                error={nodesQuery.isError}
                onPromote={promoteNode}
                onSendToStandby={sendToStandby}
                onRemoveFromCluster={removeFromCluster}
              />
            </TabPanel>
            <TabPanel>
              <FlowAssignmentsTab
                assignments={assignments}
                nodes={nodes}
                isLoading={assignmentsQuery.isLoading && assignments.length === 0}
                error={assignmentsQuery.isError}
                onReassign={reassignFlow}
                onPromoteAssignment={promoteAssignment}
                onRemoveAssignment={removeAssignment}
              />
            </TabPanel>
            <TabPanel>
              {deploymentQuery.isLoading ? (
                <div className="audio-nodes-modal__state">
                  <LoadingState description="Loading deployment mode" />
                </div>
              ) : deploymentQuery.isError ? (
                <InlineNotification kind="error" lowContrast hideCloseButton
                  title="Deployment mode unavailable" subtitle="Could not reach the deployment API." />
              ) : (
                <DeploymentModeSwitcher
                  currentMode={deploymentQuery.data?.mode ?? 'ALL-IN-ONE'}
                  onModeChanged={() => {
                    queryClient.invalidateQueries({ queryKey: ['deployment', 'mode'] })
                  }}
                />
              )}
            </TabPanel>
          </TabPanels>
        </Tabs>
      </div>
    </Modal>
  )
}
