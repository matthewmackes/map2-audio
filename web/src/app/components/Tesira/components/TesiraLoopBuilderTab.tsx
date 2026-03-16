import React, { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { chainsApi, effectsLoopsApi } from '../../../../map2/api'
import type { EffectsLoop, LoopInsertion } from '../../../../map2/types'
import { useWebSocketConnection, useWebSocketTopic } from '../../../../map2/hooks/useWebSocket'
import { NumberInput } from '../../Controls/NumberInput'

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

function toNumber(value: string, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
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
    const next: Record<string, InsertionDraft> = {}
    for (const insertion of chainInsertions) {
      next[insertion.insertion_id] = mapInsertionDraft(insertion)
    }
    setInsertionDrafts(next)
  }, [chainInsertions])

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

  const selectedLoop = loops.find((loop) => loop.loop_id === selectedLoopId) ?? null
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

  return (
    <Box sx={{ p: 2 }}>
      <Stack spacing={2}>
        {(createLoopMutation.error || insertLoopMutation.error || patchInsertionMutation.error || deleteInsertionMutation.error) && (
          <Alert severity="error">
            {String(
              createLoopMutation.error ||
              insertLoopMutation.error ||
              patchInsertionMutation.error ||
              deleteInsertionMutation.error
            )}
          </Alert>
        )}

        <Grid container spacing={2}>
          <Grid item xs={12} xl={7}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Typography variant="h6">Loop Builder</Typography>
                <Typography variant="body2" color="text.secondary">
                  Create and activate external Tesira AVB send/return loops, then route them into chain insertions.
                </Typography>

                <Grid container spacing={1.5}>
                  <Grid item xs={12} md={6}>
                    <TextField
                      size="small"
                      label="Loop Name"
                      value={createLoopName}
                      onChange={(e) => setCreateLoopName(e.target.value)}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={6} md={3}>
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
                  </Grid>
                  <Grid item xs={6} md={3}>
                    <FormControl size="small" fullWidth>
                      <InputLabel id="loop-topology-label">Topology</InputLabel>
                      <Select
                        labelId="loop-topology-label"
                        label="Topology"
                        value={createLoopTopology}
                        onChange={(e) => setCreateLoopTopology(String(e.target.value))}
                      >
                        {LOOP_TOPOLOGIES.map((topology) => (
                          <MenuItem key={topology} value={topology}>{topology}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField
                      size="small"
                      label="Template ID (optional)"
                      value={createTemplateId}
                      onChange={(e) => setCreateTemplateId(e.target.value)}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField
                      size="small"
                      label="Send Endpoint ID"
                      value={createSendEndpointId}
                      onChange={(e) => setCreateSendEndpointId(e.target.value)}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField
                      size="small"
                      label="Return Endpoint ID"
                      value={createReturnEndpointId}
                      onChange={(e) => setCreateReturnEndpointId(e.target.value)}
                      fullWidth
                    />
                  </Grid>
                </Grid>

                <Stack direction="row" spacing={1}>
                  <Button
                    variant="contained"
                    color="error"
                    onClick={() => createLoopMutation.mutate()}
                    disabled={isBusy}
                  >
                    Create Loop
                  </Button>
                  <Button variant="outlined" onClick={invalidateLoopQueries} disabled={isBusy}>
                    Refresh
                  </Button>
                </Stack>
              </Stack>
            </Paper>
          </Grid>

          <Grid item xs={12} xl={5}>
            <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
              <Stack spacing={1.5}>
                <Typography variant="h6">Chain Insertion</Typography>
                <FormControl size="small" fullWidth>
                  <InputLabel id="loop-chain-label">Chain</InputLabel>
                  <Select
                    labelId="loop-chain-label"
                    label="Chain"
                    value={selectedChainId === null ? '' : String(selectedChainId)}
                    onChange={(e) => setSelectedChainId(e.target.value ? Number(e.target.value) : null)}
                  >
                    {chains.map((chain) => (
                      <MenuItem key={chain.id} value={String(chain.id)}>
                        #{chain.id} {chain.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Grid container spacing={1}>
                  <Grid item xs={6}>
                    <FormControl size="small" fullWidth>
                      <InputLabel id="insert-loop-label">Loop</InputLabel>
                      <Select
                        labelId="insert-loop-label"
                        label="Loop"
                        value={insertLoopId}
                        onChange={(e) => setInsertLoopId(String(e.target.value))}
                      >
                        {loops.map((loop) => (
                          <MenuItem key={loop.loop_id} value={loop.loop_id}>
                            {loop.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={3}>
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
                  </Grid>
                  <Grid item xs={3}>
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
                  </Grid>
                  <Grid item xs={12}>
                    <FormControl size="small" fullWidth>
                      <InputLabel id="insert-mode-label">Mode</InputLabel>
                      <Select
                        labelId="insert-mode-label"
                        label="Mode"
                        value={insertMode}
                        onChange={(e) => setInsertMode(String(e.target.value))}
                      >
                        {INSERTION_MODES.map((mode) => (
                          <MenuItem key={mode} value={mode}>
                            {mode}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>

                <Button
                  variant="contained"
                  onClick={() => insertLoopMutation.mutate()}
                  disabled={isBusy || selectedChainId === null || !insertLoopId}
                >
                  Insert Into Chain
                </Button>
              </Stack>
            </Paper>
          </Grid>
        </Grid>

        <Grid container spacing={2}>
          <Grid item xs={12} lg={7}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Typography variant="h6">Loop Inventory</Typography>
                {loopsQuery.isLoading && (
                  <Box sx={{ py: 3, textAlign: 'center' }}>
                    <CircularProgress size={24} />
                  </Box>
                )}
                {!loopsQuery.isLoading && loops.length === 0 && (
                  <Alert severity="info">No loops configured yet.</Alert>
                )}
                {loops.map((loop) => {
                  const template = loop.template_id ? templateById.get(loop.template_id) : undefined
                  const runtime = template?.runtime_status
                  const runtimeStatus = runtime?.drift_status ?? 'unknown'
                  const isSelected = loop.loop_id === selectedLoopId
                  return (
                    <Paper
                      key={loop.loop_id}
                      variant={isSelected ? 'elevation' : 'outlined'}
                      sx={{
                        p: 1.25,
                        borderColor: isSelected ? 'error.light' : 'divider',
                        cursor: 'pointer',
                      }}
                      onClick={() => setSelectedLoopId(loop.loop_id)}
                    >
                      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                        <Box>
                          <Typography variant="subtitle2">{loop.name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {loop.send_endpoint_id || 'send?'} → {loop.return_endpoint_id || 'return?'}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" justifyContent="flex-end">
                          <Chip size="small" label={loop.state_actual} color={loop.state_actual === 'active' ? 'success' : 'default'} />
                          <Chip size="small" label={loop.health_status} color={loop.health_status === 'healthy' ? 'success' : 'warning'} />
                          <Chip size="small" label={`template:${runtimeStatus}`} color={runtimeStatus === 'ok' ? 'success' : runtimeStatus === 'warning' ? 'warning' : 'error'} />
                        </Stack>
                      </Stack>
                      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                        <Button size="small" variant="outlined" onClick={(e) => {
                          e.stopPropagation()
                          activateLoopMutation.mutate(loop.loop_id)
                        }}>
                          Activate
                        </Button>
                        <Button size="small" variant="outlined" onClick={(e) => {
                          e.stopPropagation()
                          const bypass = loop.state_actual !== 'bypassed'
                          bypassLoopMutation.mutate({ loopId: loop.loop_id, bypass })
                        }}>
                          {loop.state_actual === 'bypassed' ? 'Unbypass' : 'Bypass'}
                        </Button>
                        <Button size="small" variant="outlined" onClick={(e) => {
                          e.stopPropagation()
                          calibrateLoopMutation.mutate(loop.loop_id)
                        }}>
                          Calibrate
                        </Button>
                        <Button size="small" color="error" onClick={(e) => {
                          e.stopPropagation()
                          deleteLoopMutation.mutate(loop.loop_id)
                        }}>
                          Delete
                        </Button>
                      </Stack>
                    </Paper>
                  )
                })}
              </Stack>
            </Paper>
          </Grid>

          <Grid item xs={12} lg={5}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Typography variant="h6">Loop Inspector</Typography>
                {!selectedLoop && <Alert severity="info">Select a loop to inspect routing and live metrics.</Alert>}
                {selectedLoop && (
                  <>
                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                      <Chip size="small" label={`Loop: ${selectedLoop.loop_id}`} />
                      {selectedSignal?.stateEvent && <Chip size="small" color="warning" label={`event:${selectedSignal.stateEvent}`} />}
                      {selectedSignal?.calibrationStatus && <Chip size="small" color="info" label={`cal:${selectedSignal.calibrationStatus}`} />}
                      {selectedSignal?.metricsAt && <Chip size="small" variant="outlined" label="metrics ws" />}
                    </Stack>
                    <Paper variant="outlined" sx={{ p: 1.25 }}>
                      <Typography variant="caption" color="text.secondary">Routing Overlay</Typography>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {selectedLoop.send_endpoint_id || 'send endpoint not set'}
                      </Typography>
                      <Typography variant="body2" color="error.main">⇢ {selectedLoop.name} ⇢</Typography>
                      <Typography variant="body2">
                        {selectedLoop.return_endpoint_id || 'return endpoint not set'}
                      </Typography>
                    </Paper>
                    {selectedTemplate?.runtime_status && (
                      <Alert severity={selectedTemplate.runtime_status.drift_status === 'ok' ? 'success' : 'warning'}>
                        Template drift status: <strong>{selectedTemplate.runtime_status.drift_status}</strong>
                        {' '}({selectedTemplate.runtime_status.alarm_count} alarms)
                      </Alert>
                    )}
                    <Paper variant="outlined" sx={{ p: 1.25 }}>
                      <Typography variant="caption" color="text.secondary">Latency / Compensation</Typography>
                      <Grid container spacing={1} sx={{ mt: 0.5 }}>
                        <Grid item xs={6}>
                          <Typography variant="body2">Target: {selectedLoop.target_added_latency_ms.toFixed(2)} ms</Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="body2">
                            Measured: {(metricsQuery.data?.measured_added_latency_ms ?? selectedLoop.measured_added_latency_ms ?? 0).toFixed(3)} ms
                          </Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="body2">
                            Compensation: {metricsQuery.data?.compensation_samples ?? selectedLoop.compensation_samples} samples
                          </Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="body2">Calibration: {selectedLoop.calibration_status}</Typography>
                        </Grid>
                      </Grid>
                    </Paper>
                  </>
                )}
              </Stack>
            </Paper>
          </Grid>
        </Grid>

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={1.25}>
            <Typography variant="h6">Chain Insertions</Typography>
            <Divider />
            {selectedChainId === null && <Alert severity="info">Choose a chain to manage insertions.</Alert>}
            {selectedChainId !== null && chainInsertions.length === 0 && <Alert severity="info">No loop insertions in this chain.</Alert>}
            {chainInsertions.map((insertion) => {
              const draft = insertionDrafts[insertion.insertion_id] ?? mapInsertionDraft(insertion)
              const sourceLoop = loopById.get(insertion.loop_id)
              return (
                <Paper key={insertion.insertion_id} variant="outlined" sx={{ p: 1.25 }}>
                  <Stack spacing={1}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="subtitle2">
                        Slot {insertion.slot_index}: {sourceLoop?.name || insertion.loop_id}
                      </Typography>
                      <Stack direction="row" spacing={0.75}>
                        <Chip size="small" label={draft.enabled ? 'enabled' : 'disabled'} color={draft.enabled ? 'success' : 'default'} />
                        <Chip size="small" label={draft.mode} />
                      </Stack>
                    </Stack>
                    <Grid container spacing={1}>
                      <Grid item xs={12} sm={4}>
                        <FormControl size="small" fullWidth>
                          <InputLabel id={`mode-${insertion.insertion_id}`}>Mode</InputLabel>
                          <Select
                            labelId={`mode-${insertion.insertion_id}`}
                            label="Mode"
                            value={draft.mode}
                            onChange={(e) => {
                              const value = String(e.target.value)
                              setInsertionDrafts((prev) => ({
                                ...prev,
                                [insertion.insertion_id]: { ...draft, mode: value },
                              }))
                            }}
                          >
                            {INSERTION_MODES.map((mode) => (
                              <MenuItem key={mode} value={mode}>{mode}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={6} sm={2}>
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
                      </Grid>
                      <Grid item xs={6} sm={2}>
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
                      </Grid>
                      <Grid item xs={6} sm={2}>
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
                      </Grid>
                      <Grid item xs={6} sm={2}>
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
                      </Grid>
                    </Grid>
                    <Stack direction="row" spacing={1}>
                      <Button
                        size="small"
                        variant="outlined"
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
                        size="small"
                        variant="contained"
                        color="error"
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
                        Save
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        onClick={() => deleteInsertionMutation.mutate(insertion.insertion_id)}
                        disabled={isBusy}
                      >
                        Remove
                      </Button>
                    </Stack>
                  </Stack>
                </Paper>
              )
            })}
          </Stack>
        </Paper>
      </Stack>
    </Box>
  )
}
