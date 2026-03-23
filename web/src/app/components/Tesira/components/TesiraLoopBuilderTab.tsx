import React, { useEffect, useMemo, useState } from 'react'
import { Add, PlayFilled, Renew, TrashCan } from '@carbon/icons-react'
import {
  Button,
  InlineLoading,
  InlineNotification,
  Select,
  SelectItem,
  Tag,
  TextInput,
  Tile,
} from '@carbon/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { chainsApi, effectsLoopsApi } from '../../../../map2/api'
import type { EffectsLoop, LoopInsertion } from '../../../../map2/types'
import { useWebSocketConnection, useWebSocketTopic } from '../../../../map2/hooks/useWebSocket'
import { NumberInput } from '../../Controls/NumberInput'
import './TesiraCarbonChrome.css'

const LOOP_TOPOLOGIES = [
  'serial_insert',
  'parallel_send_return',
  'dual_parallel',
  'multiband_split',
] as const

const INSERTION_MODES = [
  'serial_insert',
  'parallel_send_return',
  'dual_parallel',
  'multiband_split',
] as const

interface LoopSignalState {
  stateEvent?: string
  calibrationStatus?: string
  metricsAt?: string
}

interface InsertionDraft {
  enabled: boolean
  mode: string
  blend_pct: number
  send_gain_db: number
  return_gain_db: number
  crossfade_ms: number
}

interface TesiraLoopBuilderTabProps {
  deviceId: string
}

function mapInsertionDraft(insertion: LoopInsertion): InsertionDraft {
  return {
    enabled: Boolean(insertion.enabled),
    mode: insertion.mode || 'serial_insert',
    blend_pct: Number(insertion.blend_pct ?? 100),
    send_gain_db: Number(insertion.send_gain_db ?? 0),
    return_gain_db: Number(insertion.return_gain_db ?? 0),
    crossfade_ms: Number(insertion.crossfade_ms ?? 12),
  }
}

function formatOptionLabel(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function loopStateTag(loop: EffectsLoop): React.ReactNode {
  const state = loop.state_actual || 'unknown'
  const type = state === 'active' ? 'green' : state === 'bypassed' ? 'warm-gray' : 'cool-gray'
  return <Tag type={type} size="sm">{state}</Tag>
}

function healthTag(status: string): React.ReactNode {
  return <Tag type={status === 'healthy' ? 'green' : 'red'} size="sm">{status || 'unknown'}</Tag>
}

function templateRuntimeTag(status: string): React.ReactNode {
  const type = status === 'ok' ? 'green' : status === 'warning' ? 'warm-gray' : 'red'
  return <Tag type={type} size="sm">{`template:${status}`}</Tag>
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function handleSelectableKeyDown(
  event: React.KeyboardEvent<HTMLElement>,
  callback: () => void,
) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    callback()
  }
}

export function TesiraLoopBuilderTab({ deviceId }: TesiraLoopBuilderTabProps) {
  const qc = useQueryClient()
  useWebSocketConnection()

  const [selectedChainId, setSelectedChainId] = useState<number | null>(null)
  const [selectedLoopId, setSelectedLoopId] = useState<string>('')
  const [loopSignals, setLoopSignals] = useState<Record<string, LoopSignalState>>({})
  const [insertionDrafts, setInsertionDrafts] = useState<Record<string, InsertionDraft>>({})

  const [createLoopName, setCreateLoopName] = useState('External FX Loop')
  const [createLoopTopology, setCreateLoopTopology] = useState<string>('serial_insert')
  const [createLoopChannels, setCreateLoopChannels] = useState(2)
  const [createTemplateId, setCreateTemplateId] = useState('')
  const [createSendEndpointId, setCreateSendEndpointId] = useState('')
  const [createReturnEndpointId, setCreateReturnEndpointId] = useState('')

  const [insertLoopId, setInsertLoopId] = useState('')
  const [insertSlotIndex, setInsertSlotIndex] = useState(0)
  const [insertMode, setInsertMode] = useState<string>('serial_insert')
  const [insertBlendPct, setInsertBlendPct] = useState(100)

  const loopsQuery = useQuery({
    queryKey: ['effects-loops', 'list'],
    queryFn: async () => (await effectsLoopsApi.list()).loops,
    refetchInterval: 5000,
  })

  const templatesQuery = useQuery({
    queryKey: ['effects-loops', 'templates'],
    queryFn: async () => (await effectsLoopsApi.listTemplates()).templates,
    refetchInterval: 10000,
  })

  const chainsQuery = useQuery({
    queryKey: ['chains', 'list'],
    queryFn: async () => (await chainsApi.list()).chains,
    refetchInterval: 10000,
  })

  const insertionsQuery = useQuery({
    queryKey: ['effects-loops', 'chain-insertions', selectedChainId],
    queryFn: async () => {
      if (selectedChainId === null) {
        return {
          chain_id: 0,
          loop_insertions: [] as LoopInsertion[],
          effects_loops: [] as EffectsLoop[],
          count: 0,
        }
      }
      return effectsLoopsApi.listChainInsertions(selectedChainId)
    },
    enabled: selectedChainId !== null,
    refetchInterval: 5000,
  })

  const metricsQuery = useQuery({
    queryKey: ['effects-loops', 'metrics', selectedLoopId],
    queryFn: async () => effectsLoopsApi.getMetrics(selectedLoopId),
    enabled: selectedLoopId.length > 0,
    refetchInterval: 3000,
  })

  const loops = loopsQuery.data ?? []
  const templates = templatesQuery.data ?? []
  const chains = chainsQuery.data ?? []
  const chainInsertions = insertionsQuery.data?.loop_insertions ?? []
  const resolvedChainLoops = insertionsQuery.data?.effects_loops ?? []
  const insertionDraftSeed = useMemo(() => {
    const next: Record<string, InsertionDraft> = {}
    for (const insertion of chainInsertions) {
      next[insertion.insertion_id] = mapInsertionDraft(insertion)
    }
    return next
  }, [chainInsertions])
  const insertionDraftSeedSignature = useMemo(
    () => JSON.stringify(insertionDraftSeed),
    [insertionDraftSeed],
  )

  const loopById = useMemo(() => {
    const mapping = new Map<string, EffectsLoop>()
    for (const loop of loops) {
      mapping.set(loop.loop_id, loop)
    }
    for (const loop of resolvedChainLoops) {
      if (!mapping.has(loop.loop_id)) {
        mapping.set(loop.loop_id, loop)
      }
    }
    return mapping
  }, [loops, resolvedChainLoops])

  const templateById = useMemo(() => {
    const mapping = new Map<string, (typeof templates)[number]>()
    for (const template of templates) {
      mapping.set(template.template_id, template)
    }
    return mapping
  }, [templates])

  useEffect(() => {
    if (selectedChainId === null && chains.length > 0) {
      setSelectedChainId(chains[0].id)
    }
  }, [chains, selectedChainId])

  useEffect(() => {
    if (!selectedLoopId && loops.length > 0) {
      setSelectedLoopId(loops[0].loop_id)
    }
  }, [loops, selectedLoopId])

  useEffect(() => {
    if (!insertLoopId && loops.length > 0) {
      setInsertLoopId(loops[0].loop_id)
    }
  }, [insertLoopId, loops])

  useEffect(() => {
    setInsertionDrafts((prev) => {
      if (JSON.stringify(prev) === insertionDraftSeedSignature) {
        return prev
      }
      return insertionDraftSeed
    })
  }, [insertionDraftSeed, insertionDraftSeedSignature])

  const invalidateLoopQueries = () => {
    qc.invalidateQueries({ queryKey: ['effects-loops', 'list'] })
    qc.invalidateQueries({ queryKey: ['effects-loops', 'templates'] })
    if (selectedChainId !== null) {
      qc.invalidateQueries({ queryKey: ['effects-loops', 'chain-insertions', selectedChainId] })
    }
    if (selectedLoopId) {
      qc.invalidateQueries({ queryKey: ['effects-loops', 'metrics', selectedLoopId] })
    }
  }

  const createLoopMutation = useMutation({
    mutationFn: async () =>
      effectsLoopsApi.create({
        name: createLoopName.trim() || 'External FX Loop',
        channels: Math.max(1, Math.min(8, createLoopChannels)),
        topology: createLoopTopology,
        tesira_device_id: deviceId,
        template_id: createTemplateId.trim() || undefined,
        send_endpoint_id: createSendEndpointId.trim() || undefined,
        return_endpoint_id: createReturnEndpointId.trim() || undefined,
      }),
    onSuccess: (created) => {
      setSelectedLoopId(created.loop_id)
      if (!insertLoopId) {
        setInsertLoopId(created.loop_id)
      }
      invalidateLoopQueries()
    },
  })

  const activateLoopMutation = useMutation({
    mutationFn: async (loopId: string) => effectsLoopsApi.activate(loopId, { audition_mode: false }),
    onSuccess: () => invalidateLoopQueries(),
  })

  const bypassLoopMutation = useMutation({
    mutationFn: async ({ loopId, bypass }: { loopId: string; bypass: boolean }) => effectsLoopsApi.bypass(loopId, bypass),
    onSuccess: () => invalidateLoopQueries(),
  })

  const calibrateLoopMutation = useMutation({
    mutationFn: async (loopId: string) => effectsLoopsApi.calibrate(loopId, {}),
    onSuccess: () => invalidateLoopQueries(),
  })

  const deleteLoopMutation = useMutation({
    mutationFn: async (loopId: string) => effectsLoopsApi.delete(loopId),
    onSuccess: () => invalidateLoopQueries(),
  })

  const insertLoopMutation = useMutation({
    mutationFn: async () => {
      if (selectedChainId === null) {
        throw new Error('Select a chain before inserting a loop')
      }
      return effectsLoopsApi.insertChainLoop(selectedChainId, {
        loop_id: insertLoopId,
        slot_index: Math.max(0, insertSlotIndex),
        mode: insertMode,
        blend_pct: Math.max(0, Math.min(100, insertBlendPct)),
      })
    },
    onSuccess: () => {
      if (selectedChainId !== null) {
        qc.invalidateQueries({ queryKey: ['effects-loops', 'chain-insertions', selectedChainId] })
      }
    },
  })

  const patchInsertionMutation = useMutation({
    mutationFn: async ({
      insertionId,
      payload,
    }: {
      insertionId: string
      payload: Partial<LoopInsertion>
    }) => {
      if (selectedChainId === null) {
        throw new Error('Select a chain before updating insertions')
      }
      return effectsLoopsApi.patchChainLoop(selectedChainId, insertionId, payload)
    },
    onSuccess: () => {
      if (selectedChainId !== null) {
        qc.invalidateQueries({ queryKey: ['effects-loops', 'chain-insertions', selectedChainId] })
      }
    },
  })

  const deleteInsertionMutation = useMutation({
    mutationFn: async (insertionId: string) => {
      if (selectedChainId === null) {
        throw new Error('Select a chain before deleting insertions')
      }
      return effectsLoopsApi.deleteChainLoop(selectedChainId, insertionId)
    },
    onSuccess: () => {
      if (selectedChainId !== null) {
        qc.invalidateQueries({ queryKey: ['effects-loops', 'chain-insertions', selectedChainId] })
      }
    },
  })

  useWebSocketTopic('effects_loop_state', (data) => {
    const loopId = String(data?.loop?.loop_id ?? '')
    if (!loopId) return
    setLoopSignals((prev) => ({
      ...prev,
      [loopId]: {
        ...prev[loopId],
        stateEvent: String(data?.event ?? 'state_update'),
      },
    }))
    qc.invalidateQueries({ queryKey: ['effects-loops', 'list'] })
  })

  useWebSocketTopic('effects_loop_metrics', (data) => {
    const loopId = String(data?.loop_id ?? '')
    if (!loopId) return
    setLoopSignals((prev) => ({
      ...prev,
      [loopId]: {
        ...prev[loopId],
        metricsAt: String(data?.timestamp ?? new Date().toISOString()),
      },
    }))
    qc.invalidateQueries({ queryKey: ['effects-loops', 'metrics', loopId] })
  })

  useWebSocketTopic('effects_loop_calibration_progress', (data) => {
    const loopId = String(data?.loop_id ?? '')
    if (!loopId) return
    setLoopSignals((prev) => ({
      ...prev,
      [loopId]: {
        ...prev[loopId],
        calibrationStatus: String(data?.status ?? 'unknown'),
      },
    }))
  })

  const selectedLoop = selectedLoopId ? loopById.get(selectedLoopId) ?? null : null
  const selectedTemplate = selectedLoop?.template_id ? templateById.get(selectedLoop.template_id) : undefined
  const selectedSignal = selectedLoop ? loopSignals[selectedLoop.loop_id] : undefined

  const isBusy =
    createLoopMutation.isPending ||
    activateLoopMutation.isPending ||
    bypassLoopMutation.isPending ||
    calibrateLoopMutation.isPending ||
    deleteLoopMutation.isPending ||
    insertLoopMutation.isPending ||
    patchInsertionMutation.isPending ||
    deleteInsertionMutation.isPending

  const mutationError = [
    createLoopMutation.error,
    activateLoopMutation.error,
    bypassLoopMutation.error,
    calibrateLoopMutation.error,
    deleteLoopMutation.error,
    insertLoopMutation.error,
    patchInsertionMutation.error,
    deleteInsertionMutation.error,
  ].find(Boolean)

  return (
    <div className="tesira-loop-builder">
      {mutationError ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="Loop workflow action failed"
          subtitle={formatErrorMessage(mutationError)}
        />
      ) : null}

      <div className="tesira-loop-builder__grid">
        <Tile className="tesira-loop-builder__tile">
          <div className="tesira-loop-builder__header">
            <div>
              <p className="tesira-dashboard__eyebrow">Effects loop design</p>
              <h3 className="tesira-dashboard__title">Create Tesira send and return loops</h3>
              <p className="tesira-dashboard__summary">
                Create and activate external Tesira AVB send and return loops, then route them into chain insertions without leaving the dedicated control route.
              </p>
            </div>
            <div className="tesira-loop-builder__tags">
              <Tag type="cool-gray" size="sm">{`${loops.length} loops`}</Tag>
              <Tag type="warm-gray" size="sm">{`${templates.length} templates`}</Tag>
            </div>
          </div>

          <div className="tesira-loop-builder__form-grid">
            <TextInput
              id={`tesira-loop-name-${deviceId}`}
              labelText="Loop name"
              value={createLoopName}
              onChange={(event) => setCreateLoopName(event.target.value)}
            />
            <div className="tesira-loop-builder__number-field">
              <NumberInput
                label="Channels"
                value={createLoopChannels}
                min={1}
                max={8}
                step={1}
                size="small"
                showBounds={false}
                fullWidth
                onChange={(value) => setCreateLoopChannels(Math.max(1, Math.min(8, Math.round(value))))}
              />
            </div>
            <Select
              id={`tesira-loop-topology-${deviceId}`}
              labelText="Topology"
              value={createLoopTopology}
              onChange={(event) => setCreateLoopTopology(String(event.target.value))}
            >
              {LOOP_TOPOLOGIES.map((topology) => (
                <SelectItem key={topology} value={topology} text={formatOptionLabel(topology)} />
              ))}
            </Select>
            <TextInput
              id={`tesira-loop-template-${deviceId}`}
              labelText="Template ID"
              value={createTemplateId}
              onChange={(event) => setCreateTemplateId(event.target.value)}
              placeholder="Optional"
            />
            <TextInput
              id={`tesira-loop-send-${deviceId}`}
              labelText="Send endpoint ID"
              value={createSendEndpointId}
              onChange={(event) => setCreateSendEndpointId(event.target.value)}
              placeholder="tesira-send-1"
            />
            <TextInput
              id={`tesira-loop-return-${deviceId}`}
              labelText="Return endpoint ID"
              value={createReturnEndpointId}
              onChange={(event) => setCreateReturnEndpointId(event.target.value)}
              placeholder="tesira-return-1"
            />
          </div>

          <div className="tesira-loop-builder__actions">
            <Button
              size="sm"
              kind="primary"
              renderIcon={Add}
              onClick={() => createLoopMutation.mutate()}
              disabled={isBusy}
            >
              Create loop
            </Button>
            <Button
              size="sm"
              kind="ghost"
              renderIcon={Renew}
              onClick={invalidateLoopQueries}
              disabled={isBusy}
            >
              Refresh
            </Button>
          </div>
        </Tile>

        <Tile className="tesira-loop-builder__tile">
          <div className="tesira-loop-builder__header">
            <div>
              <p className="tesira-dashboard__eyebrow">Chain insertion</p>
              <h3 className="tesira-dashboard__title">Route a loop into a MAP2 chain</h3>
              <p className="tesira-dashboard__summary">
                Choose the destination chain, insertion mode, and blend settings before adding the selected Tesira loop into the live signal path.
              </p>
            </div>
            <div className="tesira-loop-builder__tags">
              <Tag type="cool-gray" size="sm">
                {selectedChainId === null ? 'No chain selected' : `Chain #${selectedChainId}`}
              </Tag>
            </div>
          </div>

          <div className="tesira-loop-builder__form-grid">
            <Select
              id={`tesira-loop-chain-${deviceId}`}
              labelText="Chain"
              value={selectedChainId === null ? '' : String(selectedChainId)}
              onChange={(event) => setSelectedChainId(event.target.value ? Number(event.target.value) : null)}
            >
              <SelectItem value="" text={chains.length > 0 ? 'Select a chain' : 'No chains available'} />
              {chains.map((chain) => (
                <SelectItem key={chain.id} value={String(chain.id)} text={`#${chain.id} ${chain.name}`} />
              ))}
            </Select>
            <Select
              id={`tesira-loop-insert-${deviceId}`}
              labelText="Loop"
              value={insertLoopId}
              onChange={(event) => setInsertLoopId(String(event.target.value))}
            >
              <SelectItem value="" text={loops.length > 0 ? 'Select a loop' : 'No loops available'} />
              {loops.map((loop) => (
                <SelectItem key={loop.loop_id} value={loop.loop_id} text={loop.name} />
              ))}
            </Select>
            <div className="tesira-loop-builder__number-field">
              <NumberInput
                label="Slot"
                value={insertSlotIndex}
                min={0}
                max={128}
                step={1}
                size="small"
                showBounds={false}
                fullWidth
                onChange={(value) => setInsertSlotIndex(Math.max(0, Math.round(value)))}
              />
            </div>
            <div className="tesira-loop-builder__number-field">
              <NumberInput
                label="Blend %"
                value={insertBlendPct}
                min={0}
                max={100}
                step={1}
                size="small"
                showBounds={false}
                fullWidth
                onChange={(value) => setInsertBlendPct(Math.max(0, Math.min(100, Math.round(value))))}
              />
            </div>
            <Select
              id={`tesira-loop-mode-${deviceId}`}
              labelText="Insertion mode"
              value={insertMode}
              onChange={(event) => setInsertMode(String(event.target.value))}
            >
              {INSERTION_MODES.map((mode) => (
                <SelectItem key={mode} value={mode} text={formatOptionLabel(mode)} />
              ))}
            </Select>
          </div>

          <div className="tesira-loop-builder__actions">
            <Button
              size="sm"
              kind="primary"
              renderIcon={Add}
              onClick={() => insertLoopMutation.mutate()}
              disabled={isBusy || selectedChainId === null || !insertLoopId}
            >
              Insert into chain
            </Button>
          </div>
        </Tile>
      </div>

      <div className="tesira-loop-builder__grid tesira-loop-builder__grid--inventory">
        <Tile className="tesira-loop-builder__tile">
          <div className="tesira-loop-builder__header">
            <div>
              <p className="tesira-dashboard__eyebrow">Loop inventory</p>
              <h3 className="tesira-dashboard__title">Review loop runtime state</h3>
              <p className="tesira-dashboard__summary">
                Select a loop to inspect routing, compensation, and runtime alerts, or trigger activation, bypass, calibration, and cleanup actions directly from the list.
              </p>
            </div>
          </div>

          {loopsQuery.isLoading && loops.length === 0 ? (
            <div className="tesira-loop-builder__loading">
              <InlineLoading description="Loading effects loops" />
            </div>
          ) : loops.length === 0 ? (
            <p className="tesira-loop-builder__empty">No loops configured yet.</p>
          ) : (
            <div className="tesira-loop-builder__inventory-list">
              {loops.map((loop) => {
                const template = loop.template_id ? templateById.get(loop.template_id) : undefined
                const runtimeStatus = template?.runtime_status?.drift_status ?? 'unknown'
                const isSelected = loop.loop_id === selectedLoopId
                return (
                  <Tile
                    key={loop.loop_id}
                    className={
                      isSelected
                        ? 'tesira-loop-builder__inventory-card tesira-loop-builder__inventory-card--selected'
                        : 'tesira-loop-builder__inventory-card'
                    }
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedLoopId(loop.loop_id)}
                    onKeyDown={(event) => handleSelectableKeyDown(event, () => setSelectedLoopId(loop.loop_id))}
                  >
                    <div className="tesira-loop-builder__inventory-card-header">
                      <div className="tesira-loop-builder__inventory-card-copy">
                        <h4 className="tesira-loop-builder__inventory-card-title">{loop.name}</h4>
                        <p className="tesira-loop-builder__inventory-card-meta">
                          {(loop.send_endpoint_id || 'Send endpoint not set')}
                          {' -> '}
                          {(loop.return_endpoint_id || 'Return endpoint not set')}
                        </p>
                      </div>
                      <div className="tesira-loop-builder__inventory-card-tags">
                        {loopStateTag(loop)}
                        {healthTag(loop.health_status)}
                        <Tag type="cool-gray" size="sm">{`${loop.channels} ch`}</Tag>
                        {template ? templateRuntimeTag(runtimeStatus) : null}
                      </div>
                    </div>

                    <div className="tesira-loop-builder__actions">
                      <Button
                        size="sm"
                        kind="secondary"
                        renderIcon={PlayFilled}
                        onClick={(event) => {
                          event.stopPropagation()
                          activateLoopMutation.mutate(loop.loop_id)
                        }}
                        disabled={isBusy}
                      >
                        Activate
                      </Button>
                      <Button
                        size="sm"
                        kind="ghost"
                        onClick={(event) => {
                          event.stopPropagation()
                          bypassLoopMutation.mutate({
                            loopId: loop.loop_id,
                            bypass: loop.state_actual !== 'bypassed',
                          })
                        }}
                        disabled={isBusy}
                      >
                        {loop.state_actual === 'bypassed' ? 'Unbypass' : 'Bypass'}
                      </Button>
                      <Button
                        size="sm"
                        kind="ghost"
                        onClick={(event) => {
                          event.stopPropagation()
                          calibrateLoopMutation.mutate(loop.loop_id)
                        }}
                        disabled={isBusy}
                      >
                        Calibrate
                      </Button>
                      <Button
                        size="sm"
                        kind="danger--tertiary"
                        renderIcon={TrashCan}
                        onClick={(event) => {
                          event.stopPropagation()
                          deleteLoopMutation.mutate(loop.loop_id)
                        }}
                        disabled={isBusy}
                      >
                        Delete
                      </Button>
                    </div>
                  </Tile>
                )
              })}
            </div>
          )}
        </Tile>

        <Tile className="tesira-loop-builder__tile">
          <div className="tesira-loop-builder__header">
            <div>
              <p className="tesira-dashboard__eyebrow">Loop inspector</p>
              <h3 className="tesira-dashboard__title">Inspect the selected loop</h3>
              <p className="tesira-dashboard__summary">
                Review route endpoints, latency compensation, calibration state, and recent runtime events for the selected effects loop.
              </p>
            </div>
          </div>

          {!selectedLoop ? (
            <InlineNotification
              kind="info"
              lowContrast
              hideCloseButton
              title="No loop selected"
              subtitle="Choose a loop from the inventory to inspect routing and live metrics."
            />
          ) : (
            <div className="tesira-loop-builder__inspector-stack">
              <div className="tesira-loop-builder__tags">
                <Tag type="blue" size="sm">{selectedLoop.loop_id}</Tag>
                {selectedSignal?.stateEvent ? <Tag type="warm-gray" size="sm">{`event:${selectedSignal.stateEvent}`}</Tag> : null}
                {selectedSignal?.calibrationStatus ? <Tag type="cool-gray" size="sm">{`cal:${selectedSignal.calibrationStatus}`}</Tag> : null}
                {selectedSignal?.metricsAt ? <Tag type="cool-gray" size="sm">metrics ws</Tag> : null}
              </div>

              {selectedTemplate?.runtime_status ? (
                <InlineNotification
                  kind={selectedTemplate.runtime_status.drift_status === 'ok' ? 'success' : 'warning'}
                  lowContrast
                  hideCloseButton
                  title={`Template drift ${selectedTemplate.runtime_status.drift_status}`}
                  subtitle={`${selectedTemplate.runtime_status.alarm_count} runtime alarm(s) reported against the selected template.`}
                />
              ) : null}

              {selectedLoop.health_reason ? (
                <InlineNotification
                  kind="warning"
                  lowContrast
                  hideCloseButton
                  title="Loop health note"
                  subtitle={selectedLoop.health_reason}
                />
              ) : null}

              <div className="tesira-loop-builder__route">
                <p className="tesira-dashboard__stat-label">Routing overlay</p>
                <div className="tesira-loop-builder__route-path">
                  <div className="tesira-loop-builder__route-node">
                    {selectedLoop.send_endpoint_id || 'Send endpoint not set'}
                  </div>
                  <span className="tesira-loop-builder__route-arrow" aria-hidden="true">→</span>
                  <div className="tesira-loop-builder__route-node tesira-loop-builder__route-node--accent">
                    {selectedLoop.name}
                  </div>
                  <span className="tesira-loop-builder__route-arrow" aria-hidden="true">→</span>
                  <div className="tesira-loop-builder__route-node">
                    {selectedLoop.return_endpoint_id || 'Return endpoint not set'}
                  </div>
                </div>
              </div>

              <div className="tesira-loop-builder__stats">
                <div className="tesira-loop-builder__stat">
                  <p className="tesira-dashboard__stat-label">Target latency</p>
                  <p className="tesira-dashboard__stat-value">{selectedLoop.target_added_latency_ms.toFixed(2)} ms</p>
                </div>
                <div className="tesira-loop-builder__stat">
                  <p className="tesira-dashboard__stat-label">Measured latency</p>
                  <p className="tesira-dashboard__stat-value">
                    {(metricsQuery.data?.measured_added_latency_ms ?? selectedLoop.measured_added_latency_ms ?? 0).toFixed(3)} ms
                  </p>
                </div>
                <div className="tesira-loop-builder__stat">
                  <p className="tesira-dashboard__stat-label">Compensation</p>
                  <p className="tesira-dashboard__stat-value">
                    {metricsQuery.data?.compensation_samples ?? selectedLoop.compensation_samples} samples
                  </p>
                </div>
                <div className="tesira-loop-builder__stat">
                  <p className="tesira-dashboard__stat-label">Calibration</p>
                  <p className="tesira-dashboard__stat-value">{selectedLoop.calibration_status}</p>
                </div>
              </div>
            </div>
          )}
        </Tile>
      </div>

      <Tile className="tesira-loop-builder__tile">
        <div className="tesira-loop-builder__header">
          <div>
            <p className="tesira-dashboard__eyebrow">Chain insertions</p>
            <h3 className="tesira-dashboard__title">Manage active loop insertions</h3>
            <p className="tesira-dashboard__summary">
              Tune blend, crossfade, and gain compensation per insertion, then apply or remove the route from the selected chain.
            </p>
          </div>
          <div className="tesira-loop-builder__tags">
            {selectedChainId === null ? null : <Tag type="cool-gray" size="sm">{`${chainInsertions.length} insertions`}</Tag>}
          </div>
        </div>

        {selectedChainId === null ? (
          <InlineNotification
            kind="info"
            lowContrast
            hideCloseButton
            title="No chain selected"
            subtitle="Choose a chain above to manage loop insertions."
          />
        ) : chainInsertions.length === 0 ? (
          <p className="tesira-loop-builder__empty">No loop insertions in this chain.</p>
        ) : (
          <div className="tesira-loop-builder__insertion-list">
            {chainInsertions.map((insertion) => {
              const draft = insertionDrafts[insertion.insertion_id] ?? mapInsertionDraft(insertion)
              const sourceLoop = loopById.get(insertion.loop_id)
              return (
                <Tile key={insertion.insertion_id} className="tesira-loop-builder__insertion-card">
                  <div className="tesira-loop-builder__inventory-card-header">
                    <div className="tesira-loop-builder__inventory-card-copy">
                      <h4 className="tesira-loop-builder__inventory-card-title">
                        {`Slot ${insertion.slot_index}: ${sourceLoop?.name || insertion.loop_id}`}
                      </h4>
                      <p className="tesira-loop-builder__inventory-card-meta">
                        {sourceLoop?.topology ? formatOptionLabel(sourceLoop.topology) : 'Loop topology unavailable'}
                      </p>
                    </div>
                    <div className="tesira-loop-builder__inventory-card-tags">
                      <Tag type={draft.enabled ? 'green' : 'warm-gray'} size="sm">
                        {draft.enabled ? 'Enabled' : 'Disabled'}
                      </Tag>
                      <Tag type="cool-gray" size="sm">{formatOptionLabel(draft.mode)}</Tag>
                    </div>
                  </div>

                  <div className="tesira-loop-builder__insertion-grid">
                    <Select
                      id={`tesira-loop-insertion-mode-${insertion.insertion_id}`}
                      labelText="Mode"
                      value={draft.mode}
                      onChange={(event) => {
                        const value = String(event.target.value)
                        setInsertionDrafts((prev) => ({
                          ...prev,
                          [insertion.insertion_id]: { ...draft, mode: value },
                        }))
                      }}
                    >
                      {INSERTION_MODES.map((mode) => (
                        <SelectItem key={mode} value={mode} text={formatOptionLabel(mode)} />
                      ))}
                    </Select>
                    <div className="tesira-loop-builder__number-field">
                      <NumberInput
                        label="Blend %"
                        value={draft.blend_pct}
                        min={0}
                        max={100}
                        step={1}
                        size="small"
                        showBounds={false}
                        fullWidth
                        onChange={(value) => {
                          const nextValue = Math.max(0, Math.min(100, value))
                          setInsertionDrafts((prev) => ({
                            ...prev,
                            [insertion.insertion_id]: { ...draft, blend_pct: nextValue },
                          }))
                        }}
                      />
                    </div>
                    <div className="tesira-loop-builder__number-field">
                      <NumberInput
                        label="Crossfade ms"
                        value={draft.crossfade_ms}
                        min={0}
                        max={10000}
                        step={1}
                        size="small"
                        showBounds={false}
                        fullWidth
                        onChange={(value) => {
                          const nextValue = Math.max(0, value)
                          setInsertionDrafts((prev) => ({
                            ...prev,
                            [insertion.insertion_id]: { ...draft, crossfade_ms: nextValue },
                          }))
                        }}
                      />
                    </div>
                    <div className="tesira-loop-builder__number-field">
                      <NumberInput
                        label="Send dB"
                        value={draft.send_gain_db}
                        min={-120}
                        max={24}
                        step={0.1}
                        size="small"
                        showBounds={false}
                        fullWidth
                        onChange={(value) => {
                          setInsertionDrafts((prev) => ({
                            ...prev,
                            [insertion.insertion_id]: { ...draft, send_gain_db: value },
                          }))
                        }}
                      />
                    </div>
                    <div className="tesira-loop-builder__number-field">
                      <NumberInput
                        label="Return dB"
                        value={draft.return_gain_db}
                        min={-120}
                        max={24}
                        step={0.1}
                        size="small"
                        showBounds={false}
                        fullWidth
                        onChange={(value) => {
                          setInsertionDrafts((prev) => ({
                            ...prev,
                            [insertion.insertion_id]: { ...draft, return_gain_db: value },
                          }))
                        }}
                      />
                    </div>
                  </div>

                  <div className="tesira-loop-builder__actions">
                    <Button
                      size="sm"
                      kind="ghost"
                      onClick={() => {
                        setInsertionDrafts((prev) => ({
                          ...prev,
                          [insertion.insertion_id]: { ...draft, enabled: !draft.enabled },
                        }))
                      }}
                    >
                      {draft.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    <Button
                      size="sm"
                      kind="primary"
                      onClick={() => patchInsertionMutation.mutate({
                        insertionId: insertion.insertion_id,
                        payload: {
                          enabled: draft.enabled,
                          mode: draft.mode,
                          blend_pct: draft.blend_pct,
                          send_gain_db: draft.send_gain_db,
                          return_gain_db: draft.return_gain_db,
                          crossfade_ms: draft.crossfade_ms,
                        },
                      })}
                      disabled={isBusy}
                    >
                      Save changes
                    </Button>
                    <Button
                      size="sm"
                      kind="danger--tertiary"
                      renderIcon={TrashCan}
                      onClick={() => deleteInsertionMutation.mutate(insertion.insertion_id)}
                      disabled={isBusy}
                    >
                      Remove
                    </Button>
                  </div>
                </Tile>
              )
            })}
          </div>
        )}
      </Tile>
    </div>
  )
}
