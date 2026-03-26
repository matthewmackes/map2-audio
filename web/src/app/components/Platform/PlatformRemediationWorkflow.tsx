import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Checkbox,
  ComposedModal,
  InlineLoading,
  InlineNotification,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ProgressIndicator,
  ProgressStep,
  RadioTile,
  StructuredListBody,
  StructuredListCell,
  StructuredListRow,
  StructuredListWrapper,
  Tag,
  Tile,
  TileGroup,
} from '@carbon/react'

import {
  type RemediationNode,
  type RemediationWorkflowStatus,
  type RemediationSummary,
  type RemediationWorkflow,
  usePlatformRemediationActions,
  usePlatformRemediationHistory,
  usePlatformRemediationSummary,
  useRemediationNodesByState,
} from '../../hooks/usePlatformRemediation'
import './PlatformRemediationWorkflow.css'

type AdoptionCandidate = {
  candidate_id: string
  remote_node_id?: string | null
  node_id?: string | null
  hostname: string
  trust_state: string
  adoption_state: string
  activation_state: string
  readiness?: {
    status: string
    blocking_count: number
    warning_count: number
  } | null
  avb_auto_provision?: {
    state: string
    reason?: string | null
    connected?: number
    failed?: number
    candidate_pairs?: number
    last_run_at?: string | null
    error?: string | null
  } | null
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }
  return response.json() as Promise<T>
}

function stateTagType(state: string): 'green' | 'cool-gray' | 'warm-gray' | 'red' | 'blue' | 'cyan' {
  if (state === 'ready' || state === 'syncing') return 'green'
  if (state === 'blocked' || state === 'failed' || state === 'confirmed_clone') return 'red'
  if (state === 'candidate' || state === 'claimable' || state === 'outdated' || state === 'suspected_clone') return 'warm-gray'
  if (state === 'held' || state === 'rollback_available') return 'blue'
  return 'cool-gray'
}

function humanizeState(state: string): string {
  return state.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

async function listAdoptionCandidates() {
  return fetchJson<{ items: AdoptionCandidate[] }>('/api/adoption/candidates')
}

export interface PlatformRemediationWorkflowProps {
  mode: RemediationWorkflow
  stateFilter?: string | null
  initialNodeIds?: string[]
  summary?: RemediationSummary
  embedded?: boolean
  onRequestClose?: () => void
}

export function PlatformRemediationWorkflow({
  mode,
  stateFilter,
  initialNodeIds = [],
  summary: providedSummary,
  embedded = false,
  onRequestClose,
}: PlatformRemediationWorkflowProps) {
  const summaryQuery = usePlatformRemediationSummary()
  const summary = providedSummary ?? summaryQuery.data
  const historyQuery = usePlatformRemediationHistory()
  const actions = usePlatformRemediationActions()
  const nodesByState = useRemediationNodesByState(summary)
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(initialNodeIds)
  const [activeMode, setActiveMode] = useState<RemediationWorkflow>(mode)
  const [adoptionCandidates, setAdoptionCandidates] = useState<AdoptionCandidate[] | null>(null)
  const [adoptionError, setAdoptionError] = useState<string | null>(null)
  const [pairingCodes, setPairingCodes] = useState<Record<string, string>>({})
  const [adoptionBusyId, setAdoptionBusyId] = useState<string | null>(null)

  const filteredNodes = useMemo(() => {
    if (!summary?.nodes) return []
    if (stateFilter) {
      return nodesByState[stateFilter] ?? []
    }
    return summary.nodes
  }, [nodesByState, stateFilter, summary?.nodes])

  const selectedNodes = useMemo(
    () => filteredNodes.filter((node) => selectedNodeIds.includes(node.node_id)),
    [filteredNodes, selectedNodeIds],
  )

  const sourceNodes = useMemo(
    () => (summary?.nodes ?? []).filter((node) => node.registered),
    [summary?.nodes],
  )
  const currentSource = summary?.nodes.find((node) => node.is_source_of_truth) ?? null

  const loadAdoption = async () => {
    try {
      setAdoptionError(null)
      const payload = await listAdoptionCandidates()
      setAdoptionCandidates(payload.items)
    } catch (error) {
      setAdoptionError(error instanceof Error ? error.message : 'Failed to load adoption candidates')
    }
  }

  const toggleNode = (nodeId: string, checked: boolean) => {
    setSelectedNodeIds((current) => checked ? [...new Set([...current, nodeId])] : current.filter((item) => item !== nodeId))
  }

  useEffect(() => {
    if (activeMode === 'adoption' && adoptionCandidates === null && adoptionBusyId === null) {
      void loadAdoption()
    }
  }, [activeMode, adoptionBusyId, adoptionCandidates])

  const handleClaim = async (candidate: AdoptionCandidate) => {
    setAdoptionBusyId(candidate.candidate_id)
    try {
      await fetchJson(`/api/adoption/candidates/${candidate.candidate_id}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairing_code: pairingCodes[candidate.candidate_id] ?? '' }),
      })
      await loadAdoption()
    } finally {
      setAdoptionBusyId(null)
    }
  }

  const handleAdopt = async (candidate: AdoptionCandidate) => {
    setAdoptionBusyId(candidate.candidate_id)
    try {
      await fetchJson(`/api/adoption/candidates/${candidate.candidate_id}/adopt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activation_mode: 'standby' }),
      })
      await loadAdoption()
    } finally {
      setAdoptionBusyId(null)
    }
  }

  const handlePromote = async (candidate: AdoptionCandidate) => {
    const nodeId = candidate.node_id ?? candidate.remote_node_id
    if (!nodeId) return
    setAdoptionBusyId(candidate.candidate_id)
    try {
      await fetchJson(`/api/adoption/nodes/${nodeId}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activation_scope: 'all' }),
      })
      await loadAdoption()
    } finally {
      setAdoptionBusyId(null)
    }
  }

  const workflowContent = activeMode === 'adoption' ? (
    <AdoptionWorkflow
      candidates={adoptionCandidates}
      stateFilter={stateFilter}
      error={adoptionError}
      busyId={adoptionBusyId}
      pairingCodes={pairingCodes}
      onPairingCodeChange={(candidateId, value) => setPairingCodes((current) => ({ ...current, [candidateId]: value }))}
      onLoad={loadAdoption}
      onClaim={handleClaim}
      onAdopt={handleAdopt}
      onPromote={handlePromote}
    />
  ) : activeMode === 'sync' ? (
    <SyncWorkflow
      summary={summary}
      sourceNodes={sourceNodes}
      currentSource={currentSource}
      filteredNodes={filteredNodes}
      selectedNodes={selectedNodes}
      selectedNodeIds={selectedNodeIds}
      onToggleNode={toggleNode}
      onCaptureSource={(sourceNodeId) => actions.captureSource.mutateAsync(sourceNodeId)}
      onSyncNow={() => actions.runSync.mutateAsync({ nodeIds: selectedNodeIds })}
      onFixNode={(nodeId) => actions.fixSync.mutateAsync(nodeId)}
      syncStatus={summary?.workflows?.sync}
      historyItems={historyQuery.data?.items ?? []}
      onRestore={(historyFile) => actions.restoreSync.mutateAsync(historyFile)}
      busy={
        actions.captureSource.isPending ||
        actions.runSync.isPending ||
        actions.fixSync.isPending ||
        actions.restoreSync.isPending
      }
    />
  ) : (
    <CloneWorkflow
      filteredNodes={filteredNodes}
      selectedNodes={selectedNodes}
      selectedNodeIds={selectedNodeIds}
      onToggleNode={toggleNode}
      onRecover={async () => {
        const result = await actions.recoverClone.mutateAsync({ nodeIds: selectedNodeIds })
        const shouldAdvance = Array.isArray((result as { results?: Array<{ next_workflow?: string }> }).results)
          && (result as { results?: Array<{ next_workflow?: string }> }).results?.some((item) => item.next_workflow === 'adoption')
        if (shouldAdvance) {
          setActiveMode('adoption')
          await loadAdoption()
        }
      }}
      busy={actions.recoverClone.isPending}
    />
  )

  const body = (
    <div className="platform-remediation">
      <div className="platform-remediation__header">
        <div>
          <h2 className="platform-remediation__title">Platforms remediation</h2>
          <p className="platform-remediation__subtitle">
            Carbon-guided remediation for adoption, release sync, and cloned-node recovery.
          </p>
        </div>
        <TileGroup
          className="platform-remediation__mode-tiles"
          legend="Remediation workflow"
          name="platform-remediation-mode"
          valueSelected={activeMode}
          onChange={(value) => setActiveMode(value as RemediationWorkflow)}
        >
          <RadioTile value="adoption" id="remediation-mode-adoption">Adoption</RadioTile>
          <RadioTile value="sync" id="remediation-mode-sync">Sync</RadioTile>
          <RadioTile value="clone" id="remediation-mode-clone">Cloned Nodes</RadioTile>
        </TileGroup>
      </div>
      <ProgressIndicator currentIndex={activeMode === 'adoption' ? 0 : activeMode === 'sync' ? 1 : 2}>
        <ProgressStep label="Adoption" description="Claim, adopt, promote" />
        <ProgressStep label="Sync" description="Source, hold, rollback, fix" />
        <ProgressStep label="Clone" description="Recover and rejoin cloned nodes" />
      </ProgressIndicator>
      {summaryQuery.isLoading && !providedSummary ? <InlineLoading description="Loading remediation status…" /> : null}
      {summaryQuery.error && !providedSummary ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Remediation status unavailable"
          subtitle={summaryQuery.error instanceof Error ? summaryQuery.error.message : 'Failed to load remediation summary.'}
        />
      ) : null}
      {workflowContent}
    </div>
  )

  if (embedded) {
    return body
  }

  return (
    <ComposedModal open size="lg" onClose={onRequestClose}>
      <ModalHeader
        title="Platforms remediation"
        label="Carbon workflow"
        closeModal={onRequestClose}
      />
      <ModalBody hasScrollingContent>{body}</ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={onRequestClose}>Close</Button>
      </ModalFooter>
    </ComposedModal>
  )
}

function AdoptionWorkflow({
  candidates,
  stateFilter,
  error,
  busyId,
  pairingCodes,
  onPairingCodeChange,
  onLoad,
  onClaim,
  onAdopt,
  onPromote,
}: {
  candidates: AdoptionCandidate[] | null
  stateFilter?: string | null
  error: string | null
  busyId: string | null
  pairingCodes: Record<string, string>
  onPairingCodeChange: (candidateId: string, value: string) => void
  onLoad: () => Promise<void>
  onClaim: (candidate: AdoptionCandidate) => Promise<void>
  onAdopt: (candidate: AdoptionCandidate) => Promise<void>
  onPromote: (candidate: AdoptionCandidate) => Promise<void>
}) {
  const filteredCandidates = useMemo(() => {
    if (!candidates) return candidates
    if (!stateFilter) return candidates
    return candidates.filter((candidate) => candidate.adoption_state === stateFilter)
  }, [candidates, stateFilter])

  return (
    <section className="platform-remediation__section">
      <div className="platform-remediation__section-heading">
        <div>
          <h3>Adoption route workflow</h3>
          <p>Use the shared adoption lifecycle already shipped in MAP2, now surfaced in a dedicated Platforms workflow.</p>
        </div>
        <Button kind="secondary" size="sm" onClick={() => void onLoad()}>Refresh adoption</Button>
      </div>
      {error ? <InlineNotification kind="error" lowContrast hideCloseButton title="Adoption unavailable" subtitle={error} /> : null}
      {filteredCandidates === null ? (
        <Tile><InlineLoading description="Loading adoption candidates…" /></Tile>
      ) : filteredCandidates.length === 0 ? (
        <Tile><p>No nodes are waiting for adoption.</p></Tile>
      ) : (
        <div className="platform-remediation__stack">
          {filteredCandidates.map((candidate) => {
            const busy = busyId === candidate.candidate_id
            return (
              <Tile key={candidate.candidate_id} className="platform-remediation__card">
                <div className="platform-remediation__card-header">
                  <strong>{candidate.hostname}</strong>
                  <div className="platform-remediation__tag-row">
                    <Tag type={stateTagType(candidate.adoption_state)}>{humanizeState(candidate.adoption_state)}</Tag>
                    <Tag type={stateTagType(candidate.trust_state)}>{humanizeState(candidate.trust_state)}</Tag>
                    {candidate.readiness?.status ? <Tag type={stateTagType(candidate.readiness.status)}>{humanizeState(candidate.readiness.status)}</Tag> : null}
                    {candidate.avb_auto_provision?.state ? (
                      <Tag type={stateTagType(candidate.avb_auto_provision.state)}>{`AVB ${humanizeState(candidate.avb_auto_provision.state)}`}</Tag>
                    ) : null}
                  </div>
                </div>
                <StructuredListWrapper aria-label={`${candidate.hostname} adoption state`}>
                  <StructuredListBody>
                    <StructuredListRow>
                      <StructuredListCell>State</StructuredListCell>
                      <StructuredListCell>{humanizeState(candidate.adoption_state)}</StructuredListCell>
                    </StructuredListRow>
                    <StructuredListRow>
                      <StructuredListCell>Activation</StructuredListCell>
                      <StructuredListCell>{humanizeState(candidate.activation_state)}</StructuredListCell>
                    </StructuredListRow>
                    {candidate.avb_auto_provision?.state ? (
                      <StructuredListRow>
                        <StructuredListCell>AVB Auto Provision</StructuredListCell>
                        <StructuredListCell>
                          {humanizeState(candidate.avb_auto_provision.state)}
                          {typeof candidate.avb_auto_provision.connected === 'number'
                            ? ` · ${candidate.avb_auto_provision.connected} connected`
                            : ''}
                          {typeof candidate.avb_auto_provision.failed === 'number' && candidate.avb_auto_provision.failed > 0
                            ? ` · ${candidate.avb_auto_provision.failed} failed`
                            : ''}
                        </StructuredListCell>
                      </StructuredListRow>
                    ) : null}
                  </StructuredListBody>
                </StructuredListWrapper>
                {candidate.avb_auto_provision?.error ? (
                  <InlineNotification
                    kind="warning"
                    lowContrast
                    hideCloseButton
                    title="AVB auto provision needs review"
                    subtitle={candidate.avb_auto_provision.error}
                  />
                ) : null}
              {candidate.adoption_state === 'candidate' ? (
                  <div className="platform-remediation__action-row">
                    <input
                      aria-label={`Pairing code for ${candidate.hostname}`}
                      className="platform-remediation__text-input"
                      value={pairingCodes[candidate.candidate_id] ?? ''}
                      onChange={(event) => onPairingCodeChange(candidate.candidate_id, event.target.value)}
                      placeholder="Pairing code"
                    />
                    <Button size="sm" disabled={busy} onClick={() => void onClaim(candidate)}>
                      {busy ? 'Working…' : 'Claim'}
                    </Button>
                  </div>
                ) : null}
                {candidate.adoption_state === 'claimable' ? (
                  <Button size="sm" disabled={busy} onClick={() => void onAdopt(candidate)}>
                    {busy ? 'Working…' : 'Adopt to standby'}
                  </Button>
                ) : null}
                {candidate.adoption_state === 'adopted' ? (
                  <Button size="sm" disabled={busy} onClick={() => void onPromote(candidate)}>
                    {busy ? 'Working…' : 'Promote to active'}
                  </Button>
                ) : null}
              </Tile>
            )
          })}
        </div>
      )}
    </section>
  )
}

function SyncWorkflow({
  summary,
  sourceNodes,
  currentSource,
  filteredNodes,
  selectedNodes,
  selectedNodeIds,
  onToggleNode,
  onCaptureSource,
  onSyncNow,
  onFixNode,
  syncStatus,
  historyItems,
  onRestore,
  busy,
}: {
  summary: RemediationSummary | undefined
  sourceNodes: RemediationNode[]
  currentSource: RemediationNode | null
  filteredNodes: RemediationNode[]
  selectedNodes: RemediationNode[]
  selectedNodeIds: string[]
  onToggleNode: (nodeId: string, checked: boolean) => void
  onCaptureSource: (sourceNodeId: string) => Promise<unknown>
  onSyncNow: () => Promise<unknown>
  onFixNode: (nodeId: string) => Promise<unknown>
  syncStatus?: RemediationWorkflowStatus
  historyItems: Array<{ history_file: string; timestamp?: string | null; source_node?: string | null }>
  onRestore: (historyFile: string) => Promise<unknown>
  busy: boolean
}) {
  const [selectedHistory, setSelectedHistory] = useState<string>('')
  const syncUnavailable = syncStatus?.available === false
  const syncUnavailableMessage = syncStatus?.detail ?? 'Release sync is temporarily unavailable on this node. Adoption and cloned-node recovery still work.'

  return (
    <section className="platform-remediation__section">
      <div className="platform-remediation__section-heading">
        <div>
          <h3>Source-of-truth sync</h3>
          <p>Use the version manifest as the held release level, compare live node builds, and sync targets in parallel.</p>
        </div>
      </div>
      {syncUnavailable ? (
        <Tile className="platform-remediation__card">
          <strong>Release sync unavailable</strong>
          <p>{syncUnavailableMessage}</p>
        </Tile>
      ) : null}
      <div className="platform-remediation__split">
        <Tile className="platform-remediation__card">
          <div className="platform-remediation__card-header">
            <strong>Source of truth</strong>
            {currentSource ? <Tag type="blue">{currentSource.hostname}</Tag> : <Tag type="cool-gray">No held source</Tag>}
          </div>
          <TileGroup
            legend="Registered nodes"
            name="sync-source"
            valueSelected={currentSource?.node_id ?? ''}
            onChange={(value) => {
              if (!syncUnavailable) {
                void onCaptureSource(String(value))
              }
            }}
          >
            {sourceNodes.map((node) => (
              <RadioTile key={node.node_id} id={`source-${node.node_id}`} value={node.node_id} disabled={syncUnavailable || busy}>
                {node.hostname} {node.version ? `· ${node.version}` : ''}
              </RadioTile>
            ))}
          </TileGroup>
        </Tile>
        <Tile className="platform-remediation__card">
          <div className="platform-remediation__card-header">
            <strong>Release hold and rollback</strong>
            <Tag type="cool-gray">{historyItems.length} manifest snapshots</Tag>
          </div>
          <select
            className="platform-remediation__select"
            aria-label="Manifest history"
            value={selectedHistory}
            disabled={syncUnavailable || busy}
            onChange={(event) => setSelectedHistory(event.target.value)}
          >
            <option value="">Select manifest history</option>
            {historyItems.map((item) => (
              <option key={item.history_file} value={item.history_file}>
                {item.timestamp ?? item.history_file} {item.source_node ? `· ${item.source_node}` : ''}
              </option>
            ))}
          </select>
          <div className="platform-remediation__action-row">
            <Button size="sm" kind="secondary" disabled={syncUnavailable || !selectedHistory || busy} onClick={() => void onRestore(selectedHistory)}>
              Rollback to release
            </Button>
          </div>
        </Tile>
      </div>
      <Tile className="platform-remediation__card">
        <div className="platform-remediation__card-header">
          <strong>Target nodes</strong>
          <div className="platform-remediation__tag-row">
            <Tag type="cool-gray">{filteredNodes.length} visible</Tag>
            <Tag type="cool-gray">{selectedNodeIds.length} selected</Tag>
          </div>
        </div>
        <div className="platform-remediation__stack">
          {filteredNodes.map((node) => (
            <label key={node.node_id} className="platform-remediation__selector-row">
              <Checkbox
                id={`sync-node-${node.node_id}`}
                checked={selectedNodeIds.includes(node.node_id)}
                labelText=""
                disabled={syncUnavailable || busy}
                onChange={(_, { checked }) => onToggleNode(node.node_id, Boolean(checked))}
              />
              <div className="platform-remediation__selector-copy">
                <strong>{node.hostname}</strong>
                <span>{node.version ?? 'unknown build'}</span>
              </div>
              <div className="platform-remediation__tag-row">
                {node.sync_states.map((state) => <Tag key={state} type={stateTagType(state)}>{humanizeState(state)}</Tag>)}
              </div>
              <Button kind="ghost" size="sm" disabled={syncUnavailable || busy} onClick={() => void onFixNode(node.node_id)}>Fix</Button>
            </label>
          ))}
        </div>
        <div className="platform-remediation__action-row">
          <Button size="sm" disabled={syncUnavailable || selectedNodes.length === 0 || busy} onClick={() => void onSyncNow()}>Sync now</Button>
        </div>
      </Tile>
      {summary?.manifest?.timestamp ? (
        <Tile className="platform-remediation__card">
          <p>Held release captured at {summary.manifest.timestamp}.</p>
        </Tile>
      ) : null}
    </section>
  )
}

function CloneWorkflow({
  filteredNodes,
  selectedNodes,
  selectedNodeIds,
  onToggleNode,
  onRecover,
  busy,
}: {
  filteredNodes: RemediationNode[]
  selectedNodes: RemediationNode[]
  selectedNodeIds: string[]
  onToggleNode: (nodeId: string, checked: boolean) => void
  onRecover: () => Promise<void>
  busy: boolean
}) {
  return (
    <section className="platform-remediation__section">
      <div className="platform-remediation__section-heading">
        <div>
          <h3>Cloned node remediation</h3>
          <p>Detected clone-image collisions can be repaired headlessly with hostname reset, reset/rejoin, and immediate handoff into adoption.</p>
        </div>
      </div>
      <Tile className="platform-remediation__card">
        <div className="platform-remediation__stack">
          {filteredNodes.map((node) => (
            <label key={node.node_id} className="platform-remediation__selector-row">
              <Checkbox
                id={`clone-node-${node.node_id}`}
                checked={selectedNodeIds.includes(node.node_id)}
                labelText=""
                onChange={(_, { checked }) => onToggleNode(node.node_id, Boolean(checked))}
              />
              <div className="platform-remediation__selector-copy">
                <strong>{node.hostname}</strong>
                <span>{node.node_id}</span>
              </div>
              <div className="platform-remediation__tag-row">
                {node.clone_states.map((state) => <Tag key={state} type={stateTagType(state)}>{humanizeState(state)}</Tag>)}
              </div>
            </label>
          ))}
        </div>
        <div className="platform-remediation__action-row">
          <Button size="sm" disabled={selectedNodes.length === 0 || busy} onClick={() => void onRecover()}>
            {busy ? 'Recovering…' : 'Run clone recovery'}
          </Button>
        </div>
      </Tile>
    </section>
  )
}

export default PlatformRemediationWorkflow
