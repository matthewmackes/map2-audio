import { useState, useEffect, useMemo, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Tab,
  TabList,
  TabPanel,
  TabProvider,
} from '@ariakit/react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material'
import { NumberInput } from '../../map2/components/NumberInput'
import {
  Piano,
  Music,
  Settings,
  Activity,
  Save,
  Loader2,
  Plus,
  Trash2,
  Edit2,
  Power,
  Zap,
  RefreshCw,
  Radio,
  Volume2,
  Gamepad2,
} from 'lucide-react'
import { midiApiV2, chainsApi, pluginsApi } from '../../map2/api'
import type {
  MIDIMappingV2,
  MIDICommand,
  MIDIStatus,
  MIDIPreset,
  MIDICurveType,
  MIDIActionType,
  MIDITriggerType,
  Chain,
  Plugin,
} from '../../map2/types'
import { PageHeader } from '../components/PageHeader'
import { StatCard } from '../components/StatCard'
import { useToasts } from '../components/Toasts'
import { MIDICommanderSetup } from '../components/MIDICommanderSetup'

// Curve type labels
const CURVE_LABELS: Record<MIDICurveType, string> = {
  linear: 'Linear',
  logarithmic: 'Logarithmic',
  exponential: 'Exponential',
  s_curve: 'S-Curve',
}

// Action type labels
const ACTION_LABELS: Record<MIDIActionType, string> = {
  activate_chain: 'Activate Chain',
  toggle_chain: 'Toggle Chain',
  toggle_plugin: 'Toggle Plugin',
  set_routing: 'Set Routing',
  next_preset: 'Next Preset',
  previous_preset: 'Previous Preset',
}

// Trigger type labels
const TRIGGER_LABELS: Record<MIDITriggerType, string> = {
  program_change: 'Program Change',
  note_on: 'Note On',
  note_off: 'Note Off',
  control_change: 'Control Change',
}

export function MIDIPage() {
  const queryClient = useQueryClient()
  const { pushToast } = useToasts()
  const [selectedTab, setSelectedTab] = useState('controller')

  // Query keys
  const statusKey = ['midi', 'status'] as const
  const mappingsKey = ['midi', 'mappings'] as const
  const commandsKey = ['midi', 'commands'] as const
  const presetsKey = ['midi', 'presets'] as const
  const devicesKey = ['midi', 'devices'] as const
  const chainsKey = ['chains'] as const

  // Queries
  const statusQuery = useQuery({
    queryKey: statusKey,
    queryFn: midiApiV2.getStatus,
    refetchInterval: 2000,
  })

  const mappingsQuery = useQuery({
    queryKey: mappingsKey,
    queryFn: () => midiApiV2.getMappings(),
  })

  const commandsQuery = useQuery({
    queryKey: commandsKey,
    queryFn: midiApiV2.getCommands,
  })

  const presetsQuery = useQuery({
    queryKey: presetsKey,
    queryFn: midiApiV2.getPresets,
  })

  const devicesQuery = useQuery({
    queryKey: devicesKey,
    queryFn: midiApiV2.getDevices,
  })

  const chainsQuery = useQuery({
    queryKey: chainsKey,
    queryFn: chainsApi.list,
  })

  // Derived data
  const status = statusQuery.data
  const mappings = mappingsQuery.data?.mappings ?? []
  const commands = commandsQuery.data?.commands ?? []
  const presets = presetsQuery.data?.presets ?? []
  const chains = chainsQuery.data?.chains ?? []

  return (
    <div className="stack">
      <PageHeader
        title="MIDI Control"
        subtitle="CC mappings, chain switching, and real-time MIDI monitoring."
        actions={
          <div className="flex" style={{ gap: 8 }}>
            <button
              className="btn btn-ghost"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['midi'] })}
            >
              <RefreshCw size={16} /> Refresh
            </button>
          </div>
        }
      />

      {/* Status Cards */}
      <div className="grid four">
        <StatCard
          label="MIDI Status"
          value={status?.enabled ? 'Enabled' : 'Disabled'}
          helper={status?.input_open ? 'Input Open' : 'No Input'}
          tone={status?.enabled ? 'success' : 'default'}
        />
        <StatCard
          label="CC Mappings"
          value={mappings.length}
          helper="Active mappings"
        />
        <StatCard
          label="Commands"
          value={commands.length}
          helper="Triggers defined"
        />
        <StatCard
          label="Learn Mode"
          value={status?.learning ? 'Active' : 'Idle'}
          helper={status?.learning ? 'Waiting for CC...' : 'Ready'}
          tone={status?.learning ? 'warn' : 'default'}
        />
      </div>

      {/* Tabs */}
      <div className="card">
        <TabProvider defaultSelectedId="controller" selectedId={selectedTab} setSelectedId={(id) => setSelectedTab(id ?? 'controller')}>
          <TabList className="tab-list" aria-label="MIDI sections">
            <Tab id="controller" className="tab">
              <Gamepad2 size={16} /> Controller Setup
            </Tab>
            <Tab id="mappings" className="tab">
              <Music size={16} /> CC Mappings
            </Tab>
            <Tab id="commands" className="tab">
              <Zap size={16} /> Commands
            </Tab>
            <Tab id="devices" className="tab">
              <Settings size={16} /> Devices
            </Tab>
            <Tab id="activity" className="tab">
              <Activity size={16} /> Activity
            </Tab>
            <Tab id="presets" className="tab">
              <Save size={16} /> Presets
            </Tab>
          </TabList>

          <TabPanel id="controller" className="tab-panel">
            <MIDICommanderSetup />
          </TabPanel>

          <TabPanel id="mappings" className="tab-panel">
            <MappingsTab
              mappings={mappings}
              chains={chains}
              onRefresh={() => queryClient.invalidateQueries({ queryKey: mappingsKey })}
            />
          </TabPanel>

          <TabPanel id="commands" className="tab-panel">
            <CommandsTab
              commands={commands}
              chains={chains}
              onRefresh={() => queryClient.invalidateQueries({ queryKey: commandsKey })}
            />
          </TabPanel>

          <TabPanel id="devices" className="tab-panel">
            <DevicesTab
              devices={devicesQuery.data}
              onRefresh={() => queryClient.invalidateQueries({ queryKey: devicesKey })}
            />
          </TabPanel>

          <TabPanel id="activity" className="tab-panel">
            <ActivityTab status={status} />
          </TabPanel>

          <TabPanel id="presets" className="tab-panel">
            <PresetsTab
              presets={presets}
              onRefresh={() => queryClient.invalidateQueries({ queryKey: presetsKey })}
            />
          </TabPanel>
        </TabProvider>
      </div>
    </div>
  )
}

// ========== Mappings Tab ==========

function MappingsTab({
  mappings,
  chains,
  onRefresh,
}: {
  mappings: MIDIMappingV2[]
  chains: Chain[]
  onRefresh: () => void
}) {
  const { pushToast } = useToasts()
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editMapping, setEditMapping] = useState<MIDIMappingV2 | null>(null)

  const deleteMapping = useMutation({
    mutationFn: (id: number) => midiApiV2.deleteMapping(id),
    onSuccess: () => {
      onRefresh()
      pushToast('Mapping deleted', 'info')
    },
    onError: () => pushToast('Failed to delete mapping', 'error'),
  })

  const toggleMapping = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      midiApiV2.updateMapping(id, { is_enabled: enabled }),
    onSuccess: () => {
      onRefresh()
    },
  })

  return (
    <div className="stack">
      <div className="section-heading">
        <div>
          <h3>CC Mappings</h3>
          <p className="subtitle">Map MIDI CC messages to plugin parameters.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreateDialogOpen(true)}>
          <Plus size={16} /> Add Mapping
        </button>
      </div>

      {mappings.length === 0 ? (
        <div className="list-item">No CC mappings defined. Add one to get started.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>CH</th>
                <th>CC</th>
                <th>Target Plugin</th>
                <th>Parameter</th>
                <th>Range</th>
                <th>Curve</th>
                <th>Enabled</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((mapping) => (
                <tr key={mapping.id}>
                  <td>{mapping.channel === 0 ? 'Omni' : mapping.channel}</td>
                  <td>
                    <Chip label={`CC ${mapping.cc}`} size="small" color="primary" />
                  </td>
                  <td>{mapping.target_plugin_uri?.split('/').pop() ?? '—'}</td>
                  <td>{mapping.target_param_symbol ?? `#${mapping.target_param_index}`}</td>
                  <td>{`${mapping.min_val.toFixed(2)} - ${mapping.max_val.toFixed(2)}`}</td>
                  <td>
                    <Chip
                      label={CURVE_LABELS[mapping.curve_type]}
                      size="small"
                      variant="outlined"
                    />
                  </td>
                  <td>
                    <Switch
                      checked={mapping.is_enabled}
                      onChange={(e) =>
                        toggleMapping.mutate({ id: mapping.id, enabled: e.target.checked })
                      }
                      size="small"
                    />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => setEditMapping(mapping)}>
                        <Edit2 size={16} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        onClick={() => {
                          if (confirm('Delete this mapping?')) {
                            deleteMapping.mutate(mapping.id)
                          }
                        }}
                      >
                        <Trash2 size={16} />
                      </IconButton>
                    </Tooltip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <MappingDialog
        open={createDialogOpen || editMapping !== null}
        onClose={() => {
          setCreateDialogOpen(false)
          setEditMapping(null)
        }}
        mapping={editMapping}
        chains={chains}
        onSuccess={onRefresh}
      />
    </div>
  )
}

function MappingDialog({
  open,
  onClose,
  mapping,
  chains,
  onSuccess,
}: {
  open: boolean
  onClose: () => void
  mapping: MIDIMappingV2 | null
  chains: Chain[]
  onSuccess: () => void
}) {
  const { pushToast } = useToasts()
  const isEdit = mapping !== null

  const [channel, setChannel] = useState(mapping?.channel ?? 0)
  const [cc, setCc] = useState(mapping?.cc ?? 1)
  const [chainId, setChainId] = useState(mapping?.chain_id ?? chains[0]?.id ?? 0)
  const [pluginUri, setPluginUri] = useState(mapping?.target_plugin_uri ?? '')
  const [paramIndex, setParamIndex] = useState(mapping?.target_param_index ?? 0)
  const [minVal, setMinVal] = useState(mapping?.min_val ?? 0)
  const [maxVal, setMaxVal] = useState(mapping?.max_val ?? 1)
  const [curve, setCurve] = useState<MIDICurveType>(mapping?.curve_type ?? 'linear')
  const [invert, setInvert] = useState(mapping?.invert ?? false)

  useEffect(() => {
    if (mapping) {
      setChannel(mapping.channel)
      setCc(mapping.cc)
      setChainId(mapping.chain_id ?? 0)
      setPluginUri(mapping.target_plugin_uri ?? '')
      setParamIndex(mapping.target_param_index ?? 0)
      setMinVal(mapping.min_val)
      setMaxVal(mapping.max_val)
      setCurve(mapping.curve_type)
      setInvert(mapping.invert)
    }
  }, [mapping])

  const createMutation = useMutation({
    mutationFn: (data: Partial<MIDIMappingV2>) => midiApiV2.createMapping(data),
    onSuccess: () => {
      onSuccess()
      onClose()
      pushToast('Mapping created', 'success')
    },
    onError: () => pushToast('Failed to create mapping', 'error'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<MIDIMappingV2> }) =>
      midiApiV2.updateMapping(id, data),
    onSuccess: () => {
      onSuccess()
      onClose()
      pushToast('Mapping updated', 'success')
    },
    onError: () => pushToast('Failed to update mapping', 'error'),
  })

  const handleSubmit = () => {
    const data: Partial<MIDIMappingV2> = {
      channel,
      cc,
      chain_id: chainId || null,
      target_plugin_uri: pluginUri || null,
      target_param_index: paramIndex,
      min_val: minVal,
      max_val: maxVal,
      curve_type: curve,
      invert,
    }

    if (isEdit && mapping) {
      updateMutation.mutate({ id: mapping.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? 'Edit Mapping' : 'Create CC Mapping'}</DialogTitle>
      <DialogContent>
        <div className="stack" style={{ paddingTop: 8 }}>
          <div className="grid two">
            <FormControl fullWidth>
              <InputLabel>Channel</InputLabel>
              <Select
                value={channel}
                label="Channel"
                onChange={(e) => setChannel(Number(e.target.value))}
              >
                <MenuItem value={0}>Omni (All)</MenuItem>
                {Array.from({ length: 16 }, (_, i) => (
                  <MenuItem key={i + 1} value={i + 1}>
                    Channel {i + 1}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="CC Number"
              type="number"
              value={cc}
              onChange={(e) => setCc(Number(e.target.value))}
              inputProps={{ min: 0, max: 127 }}
            />
          </div>

          <FormControl fullWidth>
            <InputLabel>Chain</InputLabel>
            <Select
              value={chainId}
              label="Chain"
              onChange={(e) => setChainId(Number(e.target.value))}
            >
              {chains.map((chain) => (
                <MenuItem key={chain.id} value={chain.id}>
                  {chain.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Plugin URI"
            value={pluginUri}
            onChange={(e) => setPluginUri(e.target.value)}
            placeholder="e.g., http://example.com/plugin"
            fullWidth
          />

          <TextField
            label="Parameter Index"
            type="number"
            value={paramIndex}
            onChange={(e) => setParamIndex(Number(e.target.value))}
            inputProps={{ min: 0 }}
          />

          <div>
            <p className="subtitle" style={{ marginBottom: 8 }}>Value Range</p>
            <div style={{ display: 'flex', gap: 16 }}>
              <NumberInput
                label="Min"
                value={minVal}
                onChange={(v) => setMinVal(v)}
                min={0}
                max={1}
                step={0.01}
                size="small"
              />
              <NumberInput
                label="Max"
                value={maxVal}
                onChange={(v) => setMaxVal(v)}
                min={0}
                max={1}
                step={0.01}
                size="small"
              />
            </div>
          </div>

          <div className="grid two">
            <FormControl fullWidth>
              <InputLabel>Curve</InputLabel>
              <Select
                value={curve}
                label="Curve"
                onChange={(e) => setCurve(e.target.value as MIDICurveType)}
              >
                {Object.entries(CURVE_LABELS).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControlLabel
              control={<Switch checked={invert} onChange={(e) => setInvert(e.target.checked)} />}
              label="Invert"
            />
          </div>
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={createMutation.isPending || updateMutation.isPending}
        >
          {createMutation.isPending || updateMutation.isPending ? (
            <Loader2 className="spin" size={16} />
          ) : isEdit ? (
            'Update'
          ) : (
            'Create'
          )}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ========== Commands Tab ==========

function CommandsTab({
  commands,
  chains,
  onRefresh,
}: {
  commands: MIDICommand[]
  chains: Chain[]
  onRefresh: () => void
}) {
  const { pushToast } = useToasts()
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  const deleteCommand = useMutation({
    mutationFn: (id: number) => midiApiV2.deleteCommand(id),
    onSuccess: () => {
      onRefresh()
      pushToast('Command deleted', 'info')
    },
    onError: () => pushToast('Failed to delete command', 'error'),
  })

  return (
    <div className="stack">
      <div className="section-heading">
        <div>
          <h3>MIDI Commands</h3>
          <p className="subtitle">Trigger chain switching and actions via MIDI.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreateDialogOpen(true)}>
          <Plus size={16} /> Add Command
        </button>
      </div>

      {commands.length === 0 ? (
        <div className="list-item">No commands defined. Add Program Change triggers for chain switching.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Trigger</th>
                <th>CH</th>
                <th>Value</th>
                <th>Action</th>
                <th>Target</th>
                <th>Enabled</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {commands.map((cmd) => (
                <tr key={cmd.id}>
                  <td>
                    <Chip label={TRIGGER_LABELS[cmd.trigger_type]} size="small" />
                  </td>
                  <td>{cmd.channel === 0 ? 'Omni' : cmd.channel}</td>
                  <td>{cmd.data1}</td>
                  <td>
                    <Chip label={ACTION_LABELS[cmd.action]} size="small" color="secondary" />
                  </td>
                  <td>
                    {cmd.target_chain_id
                      ? chains.find((c) => c.id === cmd.target_chain_id)?.name ?? `Chain #${cmd.target_chain_id}`
                      : cmd.target_plugin_uri ?? '—'}
                  </td>
                  <td>
                    <Chip
                      label={cmd.is_enabled ? 'Yes' : 'No'}
                      size="small"
                      color={cmd.is_enabled ? 'success' : 'default'}
                    />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        onClick={() => {
                          if (confirm('Delete this command?')) {
                            deleteCommand.mutate(cmd.id)
                          }
                        }}
                      >
                        <Trash2 size={16} />
                      </IconButton>
                    </Tooltip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CommandDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        chains={chains}
        onSuccess={onRefresh}
      />
    </div>
  )
}

function CommandDialog({
  open,
  onClose,
  chains,
  onSuccess,
}: {
  open: boolean
  onClose: () => void
  chains: Chain[]
  onSuccess: () => void
}) {
  const { pushToast } = useToasts()

  const [triggerType, setTriggerType] = useState<MIDITriggerType>('program_change')
  const [channel, setChannel] = useState(0)
  const [data1, setData1] = useState(1)
  const [action, setAction] = useState<MIDIActionType>('activate_chain')
  const [targetChainId, setTargetChainId] = useState(chains[0]?.id ?? 0)

  const createMutation = useMutation({
    mutationFn: (data: Partial<MIDICommand>) => midiApiV2.createCommand(data),
    onSuccess: () => {
      onSuccess()
      onClose()
      pushToast('Command created', 'success')
    },
    onError: () => pushToast('Failed to create command', 'error'),
  })

  const handleSubmit = () => {
    createMutation.mutate({
      trigger_type: triggerType,
      channel,
      data1,
      action,
      target_chain_id: targetChainId,
    })
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create MIDI Command</DialogTitle>
      <DialogContent>
        <div className="stack" style={{ paddingTop: 8 }}>
          <FormControl fullWidth>
            <InputLabel>Trigger Type</InputLabel>
            <Select
              value={triggerType}
              label="Trigger Type"
              onChange={(e) => setTriggerType(e.target.value as MIDITriggerType)}
            >
              {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <div className="grid two">
            <FormControl fullWidth>
              <InputLabel>Channel</InputLabel>
              <Select
                value={channel}
                label="Channel"
                onChange={(e) => setChannel(Number(e.target.value))}
              >
                <MenuItem value={0}>Omni (All)</MenuItem>
                {Array.from({ length: 16 }, (_, i) => (
                  <MenuItem key={i + 1} value={i + 1}>
                    Channel {i + 1}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label={triggerType === 'program_change' ? 'Program #' : 'Note/CC #'}
              type="number"
              value={data1}
              onChange={(e) => setData1(Number(e.target.value))}
              inputProps={{ min: 0, max: 127 }}
            />
          </div>

          <FormControl fullWidth>
            <InputLabel>Action</InputLabel>
            <Select
              value={action}
              label="Action"
              onChange={(e) => setAction(e.target.value as MIDIActionType)}
            >
              {Object.entries(ACTION_LABELS).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {(action === 'activate_chain' || action === 'toggle_chain') && (
            <FormControl fullWidth>
              <InputLabel>Target Chain</InputLabel>
              <Select
                value={targetChainId}
                label="Target Chain"
                onChange={(e) => setTargetChainId(Number(e.target.value))}
              >
                {chains.map((chain) => (
                  <MenuItem key={chain.id} value={chain.id}>
                    {chain.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? <Loader2 className="spin" size={16} /> : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ========== Devices Tab ==========

function DevicesTab({
  devices,
  onRefresh,
}: {
  devices?: {
    input_devices: string[]
    output_devices: string[]
    current_input: string | null
    current_output: string | null
  }
  onRefresh: () => void
}) {
  const { pushToast } = useToasts()

  const openInput = useMutation({
    mutationFn: (device: string) => midiApiV2.openInputDevice(device),
    onSuccess: () => {
      onRefresh()
      pushToast('Input device opened', 'success')
    },
    onError: () => pushToast('Failed to open input device', 'error'),
  })

  const openOutput = useMutation({
    mutationFn: (device: string) => midiApiV2.openOutputDevice(device),
    onSuccess: () => {
      onRefresh()
      pushToast('Output device opened', 'success')
    },
    onError: () => pushToast('Failed to open output device', 'error'),
  })

  const closeInput = useMutation({
    mutationFn: () => midiApiV2.closeInputDevice(),
    onSuccess: () => {
      onRefresh()
      pushToast('Input device closed', 'info')
    },
  })

  const closeOutput = useMutation({
    mutationFn: () => midiApiV2.closeOutputDevice(),
    onSuccess: () => {
      onRefresh()
      pushToast('Output device closed', 'info')
    },
  })

  return (
    <div className="stack">
      <div className="section-heading">
        <div>
          <h3>MIDI Devices</h3>
          <p className="subtitle">Configure input and output MIDI devices.</p>
        </div>
        <button className="btn btn-ghost" onClick={onRefresh}>
          <RefreshCw size={16} /> Scan
        </button>
      </div>

      <div className="grid two">
        {/* Input Devices */}
        <div className="card" style={{ padding: 16 }}>
          <h4 style={{ marginBottom: 12 }}>
            <Radio size={16} style={{ marginRight: 8 }} />
            Input Devices
          </h4>
          {devices?.current_input && (
            <div className="flex" style={{ marginBottom: 12, gap: 8, alignItems: 'center' }}>
              <Chip label={devices.current_input} color="success" />
              <Button size="small" onClick={() => closeInput.mutate()}>
                Disconnect
              </Button>
            </div>
          )}
          <div className="stack" style={{ gap: 4 }}>
            {devices?.input_devices?.map((device) => (
              <div
                key={device}
                className="list-item"
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span>{device}</span>
                {device !== devices.current_input && (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => openInput.mutate(device)}
                    disabled={openInput.isPending}
                  >
                    Connect
                  </Button>
                )}
              </div>
            ))}
            {(!devices?.input_devices || devices.input_devices.length === 0) && (
              <div className="list-item">No input devices found</div>
            )}
          </div>
        </div>

        {/* Output Devices */}
        <div className="card" style={{ padding: 16 }}>
          <h4 style={{ marginBottom: 12 }}>
            <Volume2 size={16} style={{ marginRight: 8 }} />
            Output Devices
          </h4>
          {devices?.current_output && (
            <div className="flex" style={{ marginBottom: 12, gap: 8, alignItems: 'center' }}>
              <Chip label={devices.current_output} color="success" />
              <Button size="small" onClick={() => closeOutput.mutate()}>
                Disconnect
              </Button>
            </div>
          )}
          <div className="stack" style={{ gap: 4 }}>
            {devices?.output_devices?.map((device) => (
              <div
                key={device}
                className="list-item"
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span>{device}</span>
                {device !== devices.current_output && (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => openOutput.mutate(device)}
                    disabled={openOutput.isPending}
                  >
                    Connect
                  </Button>
                )}
              </div>
            ))}
            {(!devices?.output_devices || devices.output_devices.length === 0) && (
              <div className="list-item">No output devices found</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ========== Activity Tab ==========

function ActivityTab({ status }: { status?: MIDIStatus }) {
  const [messages, setMessages] = useState<Array<{ type: string; channel: number; cc: number; value: number; time: string }>>([])

  // Simulated activity display based on status
  useEffect(() => {
    if (status && status.last_cc > 0) {
      setMessages((prev) => [
        {
          type: 'CC',
          channel: status.last_channel,
          cc: status.last_cc,
          value: status.last_value,
          time: new Date().toLocaleTimeString(),
        },
        ...prev.slice(0, 49), // Keep last 50 messages
      ])
    }
  }, [status?.last_cc, status?.last_value])

  return (
    <div className="stack">
      <div className="section-heading">
        <div>
          <h3>MIDI Activity Monitor</h3>
          <p className="subtitle">Real-time MIDI message display.</p>
        </div>
        <button className="btn btn-ghost" onClick={() => setMessages([])}>
          Clear
        </button>
      </div>

      {/* Last received */}
      {status && (
        <div className="grid three">
          <StatCard
            label="Last Channel"
            value={status.last_channel || '—'}
            helper="MIDI channel"
          />
          <StatCard
            label="Last CC"
            value={status.last_cc || '—'}
            helper="Controller number"
          />
          <StatCard
            label="Last Value"
            value={status.last_value || '—'}
            helper="0-127"
          />
        </div>
      )}

      {/* Message log */}
      <div className="card" style={{ padding: 16, maxHeight: 400, overflow: 'auto' }}>
        {messages.length === 0 ? (
          <div className="list-item">No MIDI messages received yet. Connect a controller to see activity.</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Channel</th>
                <th>CC</th>
                <th>Value</th>
                <th>Bar</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((msg, i) => (
                <tr key={i}>
                  <td>{msg.time}</td>
                  <td><Chip label={msg.type} size="small" /></td>
                  <td>{msg.channel}</td>
                  <td>{msg.cc}</td>
                  <td>{msg.value}</td>
                  <td style={{ width: '30%' }}>
                    <div
                      style={{
                        width: `${(msg.value / 127) * 100}%`,
                        height: 8,
                        background: 'var(--accent)',
                        borderRadius: 4,
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ========== Presets Tab ==========

function PresetsTab({
  presets,
  onRefresh,
}: {
  presets: MIDIPreset[]
  onRefresh: () => void
}) {
  const { pushToast } = useToasts()
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [presetName, setPresetName] = useState('')

  const savePreset = useMutation({
    mutationFn: (name: string) => midiApiV2.savePreset(name),
    onSuccess: () => {
      onRefresh()
      setSaveDialogOpen(false)
      setPresetName('')
      pushToast('Preset saved', 'success')
    },
    onError: () => pushToast('Failed to save preset', 'error'),
  })

  const loadPreset = useMutation({
    mutationFn: (id: number) => midiApiV2.loadPreset(id),
    onSuccess: () => {
      onRefresh()
      pushToast('Preset loaded', 'success')
    },
    onError: () => pushToast('Failed to load preset', 'error'),
  })

  const deletePreset = useMutation({
    mutationFn: (id: number) => midiApiV2.deletePreset(id),
    onSuccess: () => {
      onRefresh()
      pushToast('Preset deleted', 'info')
    },
    onError: () => pushToast('Failed to delete preset', 'error'),
  })

  return (
    <div className="stack">
      <div className="section-heading">
        <div>
          <h3>MIDI Presets</h3>
          <p className="subtitle">Save and recall complete MIDI configurations.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setSaveDialogOpen(true)}>
          <Save size={16} /> Save Current
        </button>
      </div>

      {presets.length === 0 ? (
        <div className="list-item">No presets saved yet. Save your current MIDI configuration to create one.</div>
      ) : (
        <div className="grid three">
          {presets.map((preset) => (
            <div key={preset.id} className="card" style={{ padding: 16 }}>
              <h4>{preset.name}</h4>
              {preset.description && <p className="subtitle">{preset.description}</p>}
              <div className="flex" style={{ marginTop: 12, gap: 8 }}>
                <Button
                  size="small"
                  variant="contained"
                  onClick={() => loadPreset.mutate(preset.id)}
                  disabled={loadPreset.isPending}
                >
                  Load
                </Button>
                <Button
                  size="small"
                  color="error"
                  onClick={() => {
                    if (confirm('Delete this preset?')) {
                      deletePreset.mutate(preset.id)
                    }
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Save Dialog */}
      <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)}>
        <DialogTitle>Save MIDI Preset</DialogTitle>
        <DialogContent sx={{ minWidth: 400 }}>
          <p className="subtitle" style={{ marginBottom: 16 }}>
            Save all current mappings and commands as a preset.
          </p>
          <TextField
            autoFocus
            fullWidth
            label="Preset Name"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && presetName.trim()) {
                savePreset.mutate(presetName.trim())
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={() => savePreset.mutate(presetName.trim())}
            variant="contained"
            disabled={savePreset.isPending || !presetName.trim()}
          >
            {savePreset.isPending ? <Loader2 className="spin" size={16} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
