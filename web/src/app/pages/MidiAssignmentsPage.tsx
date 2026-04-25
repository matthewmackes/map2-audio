/**
 * MIDI Assignments Page — unified surface for every MIDI binding in the platform.
 *
 * Brings together (read: surfaces every option from) all of these existing systems:
 *   - midiApiV2: parameter mappings (CC -> plugin parameter), commands (PC/CC/Note ->
 *     activate_chain / toggle_chain / toggle_plugin / set_routing / next_preset /
 *     previous_preset), routing rules (CC -> chain flow change), MIDI learn,
 *     channel/CC presets, mapping groups, chain<->program-change configs,
 *     device profiles + footswitches + expression-pedal definitions, expression
 *     calibration, send-test (CC / PC / note), bank up/down/set, sync to controller.
 *   - expressionApi (/v2/expression/*): per-pedal assignments with custom-curve
 *     editor, listen-for-cc auto-detect, and live retime stats.
 *   - snapshotsApi: per-snapshot expression mappings + per-snapshot MIDI map.
 *
 * Visual styling is intentionally bare so it can be redressed by Claude Design later;
 * the goal here is exhaustive coverage so every backend capability is reachable.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Checkbox,
  InlineNotification,
  NumberInput as CarbonNumberInput,
  Select,
  SelectItem,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Tag,
  TextInput,
  Tile,
  Toggle,
} from '@carbon/react'
import {
  Add,
  ChartLine,
  Connect,
  Devices,
  Flash,
  Music,
  Plug,
  Renew,
  Send,
  Settings,
  TrashCan,
} from '@carbon/icons-react'

import {
  chainsApi,
  midiApiV2,
  pluginsApi,
  snapshotsApi,
} from '../../map2/api'
import { fetchJson } from '../../map2/http'
import { API_BASE } from '../../map2/transport'
import type {
  ChainMIDIConfig,
  Chain,
  ExpressionCalibration,
  MIDIActionType,
  MIDICommand,
  MIDICurveType,
  MIDIDeviceProfile,
  MIDIMappingGroup,
  MIDIMappingV2,
  MIDIPreset,
  MIDIRoutingRule,
  MIDIStatus,
  MIDITriggerType,
  Plugin,
  Snapshot,
} from '../../map2/types'

const CURVE_OPTIONS: Array<{ value: MIDICurveType; label: string }> = [
  { value: 'linear', label: 'Linear' },
  { value: 'logarithmic', label: 'Logarithmic' },
  { value: 'exponential', label: 'Exponential' },
  { value: 's_curve', label: 'S-Curve' },
]

const TRIGGER_OPTIONS: Array<{ value: MIDITriggerType; label: string }> = [
  { value: 'program_change', label: 'Program Change' },
  { value: 'control_change', label: 'Control Change (CC)' },
  { value: 'note_on', label: 'Note On' },
  { value: 'note_off', label: 'Note Off' },
]

const ACTION_OPTIONS: Array<{ value: MIDIActionType; label: string; needsChain: boolean; needsPlugin: boolean }> = [
  { value: 'activate_chain', label: 'Activate chain', needsChain: true, needsPlugin: false },
  { value: 'toggle_chain', label: 'Toggle chain', needsChain: true, needsPlugin: false },
  { value: 'toggle_plugin', label: 'Toggle plugin bypass', needsChain: false, needsPlugin: true },
  { value: 'set_routing', label: 'Set routing', needsChain: true, needsPlugin: false },
  { value: 'next_preset', label: 'Next snapshot', needsChain: false, needsPlugin: false },
  { value: 'previous_preset', label: 'Previous snapshot', needsChain: false, needsPlugin: false },
]

interface ExpressionAssignment {
  id: string
  cc: number
  channel: number
  cc_min: number
  cc_max: number
  param_id: string
  param_label: string
  out_min: number
  out_max: number
  curve: MIDICurveType | string
  custom_curve?: number[]
  active: boolean
  source?: string
  retime_mean_ms?: number
  retime_p95_ms?: number
  retime_max_ms?: number
}

interface ExpressionEngineParam {
  id: string
  label: string
  min: number
  max: number
  unit?: string
  group?: string
}

const PERFORMANCE_TARGETS: Array<{ id: string; label: string }> = [
  { id: 'page_next', label: 'Page next' },
  { id: 'page_prev', label: 'Page previous' },
  { id: 'tap_tempo', label: 'Tap tempo' },
  { id: 'tuner_mute', label: 'Tuner mute' },
  { id: 'bypass_01', label: 'Bypass slot 1' },
  { id: 'bypass_02', label: 'Bypass slot 2' },
  { id: 'bypass_03', label: 'Bypass slot 3' },
  { id: 'bypass_04', label: 'Bypass slot 4' },
  { id: 'bypass_05', label: 'Bypass slot 5' },
  { id: 'bypass_06', label: 'Bypass slot 6' },
  { id: 'bypass_07', label: 'Bypass slot 7' },
  { id: 'bypass_08', label: 'Bypass slot 8' },
]

function MidiActivityStrip({ status }: { status: MIDIStatus | undefined }) {
  return (
    <Tile style={{ padding: '0.75rem 1rem', display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <strong>Live MIDI activity</strong>
      <Tag type={status?.enabled ? 'green' : 'red'}>
        {status?.enabled ? 'Engine running' : 'Engine offline'}
      </Tag>
      <Tag type={status?.input_open ? 'blue' : 'cool-gray'}>
        IN: {status?.input_device ?? '—'}
      </Tag>
      <Tag type={status?.output_open ? 'purple' : 'cool-gray'}>
        OUT: {status?.output_device ?? '—'}
      </Tag>
      <Tag type="cool-gray">{`Last: Ch ${status?.last_channel ?? '—'} · CC ${status?.last_cc ?? '—'} · Val ${status?.last_value ?? '—'}`}</Tag>
      <Tag type={status?.learning ? 'magenta' : 'cool-gray'}>
        {status?.learning ? 'LEARNING' : 'Idle'}
      </Tag>
      <Tag type="cool-gray">{`${status?.mappings_count ?? 0} mappings · ${status?.commands_count ?? 0} commands`}</Tag>
    </Tile>
  )
}

// ============================================================================
// PARAMETER MAPPINGS (CC -> plugin parameter)
// ============================================================================

interface ParameterMappingsTabProps {
  mappings: MIDIMappingV2[]
  groups: MIDIMappingGroup[]
  chains: Chain[]
  plugins: Plugin[]
  snapshotIdFilter: number | null
}

function ParameterMappingsTab({ mappings, groups, chains, plugins, snapshotIdFilter }: ParameterMappingsTabProps) {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['midi'] })

  const [showOnlyChain, setShowOnlyChain] = useState<number | 'all' | 'global'>('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    return mappings.filter((m) => {
      if (showOnlyChain === 'global' && m.chain_id !== null) return false
      if (typeof showOnlyChain === 'number' && m.chain_id !== showOnlyChain) return false
      if (search) {
        const haystack = `${m.name ?? ''} ${m.target_plugin_uri ?? ''} ${m.target_param_symbol ?? ''} cc${m.cc} ch${m.channel}`.toLowerCase()
        if (!haystack.includes(search.toLowerCase())) return false
      }
      return true
    })
  }, [mappings, showOnlyChain, search])

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: Partial<MIDIMappingV2> }) => midiApiV2.updateMapping(id, updates),
    onSuccess: invalidate,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => midiApiV2.deleteMapping(id),
    onSuccess: invalidate,
  })

  const createMutation = useMutation({
    mutationFn: (payload: Partial<MIDIMappingV2>) => midiApiV2.createMapping(payload),
    onSuccess: invalidate,
  })

  const testMutation = useMutation({
    mutationFn: ({ id, mode }: { id: number; mode: 'heel' | 'live' | 'toe' }) => midiApiV2.testMappingFeedback(
      id,
      mode === 'live' ? { use_current_value: true } : { normalized_value: mode === 'heel' ? 0 : 1 },
    ),
  })

  const [draft, setDraft] = useState<Partial<MIDIMappingV2>>(() => ({
    cc: 0,
    channel: 0,
    chain_id: null,
    target_plugin_uri: '',
    target_param_index: 0,
    target_param_symbol: '',
    min_val: 0,
    max_val: 1,
    curve_type: 'linear',
    invert: false,
    feedback_enabled: true,
    feedback_cc: null,
    is_enabled: true,
    name: '',
    group_id: null,
  }))

  const draftPlugin = plugins.find((p) => p.uri === draft.target_plugin_uri)

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {snapshotIdFilter && (
        <InlineNotification
          kind="info"
          title="Snapshot context"
          subtitle={`Launched from snapshot ID ${snapshotIdFilter}. Per-chain mappings tied to the snapshot's active chain are highlighted.`}
          hideCloseButton
          lowContrast
        />
      )}

      <Tile>
        <h3>Filter</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginTop: '0.75rem' }}>
          <Select
            id="param-mapping-filter-chain"
            labelText="Chain scope"
            value={String(showOnlyChain)}
            onChange={(e) => {
              const v = e.target.value
              setShowOnlyChain(v === 'all' ? 'all' : v === 'global' ? 'global' : Number(v))
            }}
          >
            <SelectItem value="all" text="All scopes" />
            <SelectItem value="global" text="Global only" />
            {chains.map((chain) => (
              <SelectItem key={chain.id} value={String(chain.id)} text={`Chain ${chain.id} — ${chain.name}`} />
            ))}
          </Select>
          <TextInput
            id="param-mapping-filter-search"
            labelText="Search"
            placeholder="cc, plugin, name, channel"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </Tile>

      <Tile>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h3>Parameter mappings ({filtered.length} of {mappings.length})</h3>
          <Tag type="cool-gray">CC → plugin parameter</Tag>
        </div>
        <p style={{ marginTop: '0.25rem', opacity: 0.7 }}>
          Each row is a CC binding to a plugin parameter. Per-chain mappings only apply when that chain is active; global mappings apply everywhere.
        </p>
        <table style={{ width: '100%', marginTop: '0.75rem', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <th>Name</th>
              <th>CC</th>
              <th>Ch</th>
              <th>Scope</th>
              <th>Plugin · Param</th>
              <th>Range</th>
              <th>Curve</th>
              <th>Invert</th>
              <th>Feedback</th>
              <th>Group</th>
              <th>Enabled</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id} style={{ borderTop: '1px solid var(--cds-border-subtle, #393939)' }}>
                <td>{m.name ?? '—'}</td>
                <td>
                  <CarbonNumberInput
                    id={`pm-cc-${m.id}`}
                    label=""
                    hideLabel
                    value={m.cc}
                    min={0}
                    max={127}
                    step={1}
                    onChange={(_e, { value }) => updateMutation.mutate({ id: m.id, updates: { cc: Number(value) } })}
                  />
                </td>
                <td>
                  <CarbonNumberInput
                    id={`pm-ch-${m.id}`}
                    label=""
                    hideLabel
                    value={m.channel}
                    min={0}
                    max={16}
                    step={1}
                    onChange={(_e, { value }) => updateMutation.mutate({ id: m.id, updates: { channel: Number(value) } })}
                  />
                </td>
                <td>{m.chain_id === null ? <Tag type="cool-gray">Global</Tag> : <Tag type="blue">Chain {m.chain_id}</Tag>}</td>
                <td>{m.target_plugin_uri ?? '—'}<br /><small>{m.target_param_symbol} (#{m.target_param_index})</small></td>
                <td>
                  <CarbonNumberInput
                    id={`pm-min-${m.id}`}
                    label=""
                    hideLabel
                    value={m.min_val}
                    step={0.01}
                    onChange={(_e, { value }) => updateMutation.mutate({ id: m.id, updates: { min_val: Number(value) } })}
                  />
                  <CarbonNumberInput
                    id={`pm-max-${m.id}`}
                    label=""
                    hideLabel
                    value={m.max_val}
                    step={0.01}
                    onChange={(_e, { value }) => updateMutation.mutate({ id: m.id, updates: { max_val: Number(value) } })}
                  />
                </td>
                <td>
                  <Select
                    id={`pm-curve-${m.id}`}
                    labelText=""
                    hideLabel
                    value={m.curve_type}
                    onChange={(e) => updateMutation.mutate({ id: m.id, updates: { curve_type: e.target.value as MIDICurveType } })}
                  >
                    {CURVE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value} text={o.label} />)}
                  </Select>
                </td>
                <td>
                  <Toggle id={`pm-invert-${m.id}`} labelText="" hideLabel size="sm" toggled={m.invert} onToggle={(v) => updateMutation.mutate({ id: m.id, updates: { invert: v } })} />
                </td>
                <td>
                  <Toggle id={`pm-fb-${m.id}`} labelText="" hideLabel size="sm" toggled={m.feedback_enabled} onToggle={(v) => updateMutation.mutate({ id: m.id, updates: { feedback_enabled: v } })} />
                  {m.feedback_enabled && <small> CC {m.feedback_cc ?? m.cc}</small>}
                </td>
                <td>
                  <Select
                    id={`pm-group-${m.id}`}
                    labelText=""
                    hideLabel
                    value={String(m.group_id ?? '')}
                    onChange={(e) => updateMutation.mutate({ id: m.id, updates: { group_id: e.target.value ? Number(e.target.value) : null } })}
                  >
                    <SelectItem value="" text="—" />
                    {groups.map((g) => <SelectItem key={g.id} value={String(g.id)} text={g.name} />)}
                  </Select>
                </td>
                <td>
                  <Toggle id={`pm-enabled-${m.id}`} labelText="" hideLabel size="sm" toggled={m.is_enabled} onToggle={(v) => updateMutation.mutate({ id: m.id, updates: { is_enabled: v } })} />
                </td>
                <td>
                  <Button kind="ghost" size="sm" onClick={() => testMutation.mutate({ id: m.id, mode: 'heel' })}>Heel</Button>
                  <Button kind="ghost" size="sm" onClick={() => testMutation.mutate({ id: m.id, mode: 'live' })}>Live</Button>
                  <Button kind="ghost" size="sm" onClick={() => testMutation.mutate({ id: m.id, mode: 'toe' })}>Toe</Button>
                  <Button kind="danger--ghost" size="sm" hasIconOnly renderIcon={TrashCan} iconDescription="Delete" onClick={() => deleteMutation.mutate(m.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Tile>

      <Tile>
        <h3>Add parameter mapping</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
          <TextInput id="add-pm-name" labelText="Name" value={draft.name ?? ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <CarbonNumberInput id="add-pm-cc" label="CC (0–127)" value={draft.cc ?? 0} min={0} max={127} step={1} onChange={(_e, { value }) => setDraft({ ...draft, cc: Number(value) })} />
          <CarbonNumberInput id="add-pm-ch" label="Channel (0=omni)" value={draft.channel ?? 0} min={0} max={16} step={1} onChange={(_e, { value }) => setDraft({ ...draft, channel: Number(value) })} />
          <Select id="add-pm-scope" labelText="Scope" value={draft.chain_id === null ? 'global' : String(draft.chain_id ?? '')} onChange={(e) => setDraft({ ...draft, chain_id: e.target.value === 'global' ? null : Number(e.target.value) })}>
            <SelectItem value="global" text="Global" />
            {chains.map((c) => <SelectItem key={c.id} value={String(c.id)} text={`Chain ${c.id} — ${c.name}`} />)}
          </Select>
          <Select id="add-pm-plugin" labelText="Plugin" value={draft.target_plugin_uri ?? ''} onChange={(e) => setDraft({ ...draft, target_plugin_uri: e.target.value, target_param_index: 0, target_param_symbol: '' })}>
            <SelectItem value="" text="— select —" />
            {plugins.map((p) => <SelectItem key={p.uri} value={p.uri} text={p.name} />)}
          </Select>
          <Select id="add-pm-param" labelText="Parameter" value={String(draft.target_param_index ?? 0)} onChange={(e) => {
            const idx = Number(e.target.value)
            const param = draftPlugin?.parameters[idx]
            setDraft({ ...draft, target_param_index: idx, target_param_symbol: param?.symbol ?? '', min_val: param?.min ?? 0, max_val: param?.max ?? 1 })
          }} disabled={!draftPlugin}>
            {(draftPlugin?.parameters ?? []).map((p) => (
              <SelectItem key={p.index} value={String(p.index)} text={`${p.name} (${p.symbol})`} />
            ))}
          </Select>
          <CarbonNumberInput id="add-pm-min" label="Min value" value={draft.min_val ?? 0} step={0.01} onChange={(_e, { value }) => setDraft({ ...draft, min_val: Number(value) })} />
          <CarbonNumberInput id="add-pm-max" label="Max value" value={draft.max_val ?? 1} step={0.01} onChange={(_e, { value }) => setDraft({ ...draft, max_val: Number(value) })} />
          <Select id="add-pm-curve" labelText="Curve" value={draft.curve_type ?? 'linear'} onChange={(e) => setDraft({ ...draft, curve_type: e.target.value as MIDICurveType })}>
            {CURVE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value} text={o.label} />)}
          </Select>
          <Checkbox id="add-pm-invert" labelText="Invert response" checked={draft.invert ?? false} onChange={(_e, { checked }) => setDraft({ ...draft, invert: checked })} />
          <Checkbox id="add-pm-feedback" labelText="Feedback enabled" checked={draft.feedback_enabled ?? true} onChange={(_e, { checked }) => setDraft({ ...draft, feedback_enabled: checked })} />
          <CarbonNumberInput id="add-pm-feedback-cc" label="Feedback CC (blank = mapped CC)" value={draft.feedback_cc ?? 0} min={0} max={127} step={1} onChange={(_e, { value }) => setDraft({ ...draft, feedback_cc: Number(value) || null })} />
          <Select id="add-pm-group" labelText="Group" value={String(draft.group_id ?? '')} onChange={(e) => setDraft({ ...draft, group_id: e.target.value ? Number(e.target.value) : null })}>
            <SelectItem value="" text="— none —" />
            {groups.map((g) => <SelectItem key={g.id} value={String(g.id)} text={g.name} />)}
          </Select>
        </div>
        <Button style={{ marginTop: '0.75rem' }} renderIcon={Add} onClick={() => createMutation.mutate(draft)}>
          Create mapping
        </Button>
      </Tile>
    </div>
  )
}

// ============================================================================
// SNAPSHOT TRIGGERS & SYSTEM COMMANDS
// ============================================================================

interface CommandsTabProps {
  commands: MIDICommand[]
  chains: Chain[]
  plugins: Plugin[]
  snapshots: Snapshot[]
  chainConfigs: ChainMIDIConfig[]
}

function CommandsTab({ commands, chains, plugins, snapshots, chainConfigs }: CommandsTabProps) {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['midi'] })

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: Partial<MIDICommand> }) => midiApiV2.updateCommand(id, updates),
    onSuccess: invalidate,
  })
  const deleteMutation = useMutation({
    mutationFn: (id: number) => midiApiV2.deleteCommand(id),
    onSuccess: invalidate,
  })
  const createMutation = useMutation({
    mutationFn: (payload: Partial<MIDICommand>) => midiApiV2.createCommand(payload),
    onSuccess: invalidate,
  })
  const setChainConfigMutation = useMutation({
    mutationFn: ({ chainId, programNumber, options }: { chainId: number; programNumber: number; options?: { bank_msb?: number; bank_lsb?: number; send_pc_on_activate?: boolean } }) =>
      midiApiV2.setChainConfig(chainId, programNumber, options),
    onSuccess: invalidate,
  })
  const deleteChainConfigMutation = useMutation({
    mutationFn: (chainId: number) => midiApiV2.deleteChainConfig(chainId),
    onSuccess: invalidate,
  })

  const [draft, setDraft] = useState<Partial<MIDICommand>>({
    name: '',
    trigger_type: 'program_change',
    channel: 0,
    data1: 0,
    data2_threshold: null,
    action: 'activate_chain',
    target_chain_id: null,
    target_plugin_uri: null,
    action_params: null,
    is_enabled: true,
  })

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <InlineNotification
        kind="info"
        title="Snapshot triggers & system commands"
        subtitle="A 'command' fires a one-shot action when a MIDI message matches: activate a chain, toggle a plugin, set routing, jump snapshots, or run system actions. Use the chain/program-change matrix below for snapshot/chain Program Change recall."
        hideCloseButton
        lowContrast
      />

      <Tile>
        <h3>Commands ({commands.length})</h3>
        <table style={{ width: '100%', marginTop: '0.75rem', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <th>Name</th>
              <th>Trigger</th>
              <th>Ch</th>
              <th>Data1</th>
              <th>Threshold</th>
              <th>Action</th>
              <th>Target chain</th>
              <th>Target plugin</th>
              <th>Enabled</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {commands.map((cmd) => (
              <tr key={cmd.id} style={{ borderTop: '1px solid var(--cds-border-subtle, #393939)' }}>
                <td>{cmd.name ?? '—'}</td>
                <td>
                  <Select id={`cmd-trig-${cmd.id}`} labelText="" hideLabel value={cmd.trigger_type} onChange={(e) => updateMutation.mutate({ id: cmd.id, updates: { trigger_type: e.target.value as MIDITriggerType } })}>
                    {TRIGGER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value} text={o.label} />)}
                  </Select>
                </td>
                <td>
                  <CarbonNumberInput id={`cmd-ch-${cmd.id}`} label="" hideLabel value={cmd.channel} min={0} max={16} step={1} onChange={(_e, { value }) => updateMutation.mutate({ id: cmd.id, updates: { channel: Number(value) } })} />
                </td>
                <td>
                  <CarbonNumberInput id={`cmd-d1-${cmd.id}`} label="" hideLabel value={cmd.data1} min={0} max={127} step={1} onChange={(_e, { value }) => updateMutation.mutate({ id: cmd.id, updates: { data1: Number(value) } })} />
                </td>
                <td>
                  <CarbonNumberInput id={`cmd-thresh-${cmd.id}`} label="" hideLabel value={cmd.data2_threshold ?? 0} min={0} max={127} step={1} onChange={(_e, { value }) => updateMutation.mutate({ id: cmd.id, updates: { data2_threshold: Number(value) || null } })} />
                </td>
                <td>
                  <Select id={`cmd-action-${cmd.id}`} labelText="" hideLabel value={cmd.action} onChange={(e) => updateMutation.mutate({ id: cmd.id, updates: { action: e.target.value as MIDIActionType } })}>
                    {ACTION_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value} text={o.label} />)}
                  </Select>
                </td>
                <td>
                  <Select id={`cmd-chain-${cmd.id}`} labelText="" hideLabel value={String(cmd.target_chain_id ?? '')} onChange={(e) => updateMutation.mutate({ id: cmd.id, updates: { target_chain_id: e.target.value ? Number(e.target.value) : null } })}>
                    <SelectItem value="" text="—" />
                    {chains.map((c) => <SelectItem key={c.id} value={String(c.id)} text={`${c.id} — ${c.name}`} />)}
                  </Select>
                </td>
                <td>
                  <Select id={`cmd-plugin-${cmd.id}`} labelText="" hideLabel value={cmd.target_plugin_uri ?? ''} onChange={(e) => updateMutation.mutate({ id: cmd.id, updates: { target_plugin_uri: e.target.value || null } })}>
                    <SelectItem value="" text="—" />
                    {plugins.map((p) => <SelectItem key={p.uri} value={p.uri} text={p.name} />)}
                  </Select>
                </td>
                <td>
                  <Toggle id={`cmd-enabled-${cmd.id}`} labelText="" hideLabel size="sm" toggled={cmd.is_enabled} onToggle={(v) => updateMutation.mutate({ id: cmd.id, updates: { is_enabled: v } })} />
                </td>
                <td>
                  <Button kind="danger--ghost" size="sm" hasIconOnly renderIcon={TrashCan} iconDescription="Delete" onClick={() => deleteMutation.mutate(cmd.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Tile>

      <Tile>
        <h3>Add command</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
          <TextInput id="add-cmd-name" labelText="Name" value={draft.name ?? ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <Select id="add-cmd-trig" labelText="Trigger" value={draft.trigger_type ?? 'program_change'} onChange={(e) => setDraft({ ...draft, trigger_type: e.target.value as MIDITriggerType })}>
            {TRIGGER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value} text={o.label} />)}
          </Select>
          <CarbonNumberInput id="add-cmd-ch" label="Channel (0=omni)" value={draft.channel ?? 0} min={0} max={16} step={1} onChange={(_e, { value }) => setDraft({ ...draft, channel: Number(value) })} />
          <CarbonNumberInput id="add-cmd-d1" label="Data1 (PC# / CC# / Note#)" value={draft.data1 ?? 0} min={0} max={127} step={1} onChange={(_e, { value }) => setDraft({ ...draft, data1: Number(value) })} />
          <CarbonNumberInput id="add-cmd-thresh" label="Velocity/Value threshold" value={draft.data2_threshold ?? 0} min={0} max={127} step={1} onChange={(_e, { value }) => setDraft({ ...draft, data2_threshold: Number(value) || null })} />
          <Select id="add-cmd-action" labelText="Action" value={draft.action ?? 'activate_chain'} onChange={(e) => setDraft({ ...draft, action: e.target.value as MIDIActionType })}>
            {ACTION_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value} text={o.label} />)}
          </Select>
          <Select id="add-cmd-chain" labelText="Target chain" value={String(draft.target_chain_id ?? '')} onChange={(e) => setDraft({ ...draft, target_chain_id: e.target.value ? Number(e.target.value) : null })}>
            <SelectItem value="" text="—" />
            {chains.map((c) => <SelectItem key={c.id} value={String(c.id)} text={`${c.id} — ${c.name}`} />)}
          </Select>
          <Select id="add-cmd-plugin" labelText="Target plugin" value={draft.target_plugin_uri ?? ''} onChange={(e) => setDraft({ ...draft, target_plugin_uri: e.target.value || null })}>
            <SelectItem value="" text="—" />
            {plugins.map((p) => <SelectItem key={p.uri} value={p.uri} text={p.name} />)}
          </Select>
          <Checkbox id="add-cmd-enabled" labelText="Enabled" checked={draft.is_enabled ?? true} onChange={(_e, { checked }) => setDraft({ ...draft, is_enabled: checked })} />
        </div>
        <Button style={{ marginTop: '0.75rem' }} renderIcon={Add} onClick={() => createMutation.mutate(draft)}>
          Create command
        </Button>
      </Tile>

      <Tile>
        <h3>Snapshot / chain Program Change matrix ({chainConfigs.length})</h3>
        <p style={{ opacity: 0.7 }}>Bind a chain to a Program Change number so a single PC message recalls it. Optionally send PC out on activate to keep external gear in sync.</p>
        <table style={{ width: '100%', marginTop: '0.75rem', borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left' }}><th>Chain</th><th>PC</th><th>Bank MSB</th><th>Bank LSB</th><th>Send PC on activate</th><th /></tr></thead>
          <tbody>
            {chains.map((c) => {
              const cfg = chainConfigs.find((cc) => cc.chain_id === c.id)
              return (
                <tr key={c.id} style={{ borderTop: '1px solid var(--cds-border-subtle, #393939)' }}>
                  <td>{c.id} — {c.name}</td>
                  <td>
                    <CarbonNumberInput id={`cc-pc-${c.id}`} label="" hideLabel value={cfg?.program_number ?? 0} min={0} max={127} step={1} onChange={(_e, { value }) => setChainConfigMutation.mutate({ chainId: c.id, programNumber: Number(value), options: { bank_msb: cfg?.bank_msb, bank_lsb: cfg?.bank_lsb, send_pc_on_activate: cfg?.send_pc_on_activate } })} />
                  </td>
                  <td>
                    <CarbonNumberInput id={`cc-msb-${c.id}`} label="" hideLabel value={cfg?.bank_msb ?? 0} min={0} max={127} step={1} onChange={(_e, { value }) => setChainConfigMutation.mutate({ chainId: c.id, programNumber: cfg?.program_number ?? 0, options: { bank_msb: Number(value), bank_lsb: cfg?.bank_lsb, send_pc_on_activate: cfg?.send_pc_on_activate } })} />
                  </td>
                  <td>
                    <CarbonNumberInput id={`cc-lsb-${c.id}`} label="" hideLabel value={cfg?.bank_lsb ?? 0} min={0} max={127} step={1} onChange={(_e, { value }) => setChainConfigMutation.mutate({ chainId: c.id, programNumber: cfg?.program_number ?? 0, options: { bank_msb: cfg?.bank_msb, bank_lsb: Number(value), send_pc_on_activate: cfg?.send_pc_on_activate } })} />
                  </td>
                  <td>
                    <Toggle id={`cc-pcout-${c.id}`} labelText="" hideLabel size="sm" toggled={cfg?.send_pc_on_activate ?? false} onToggle={(v) => setChainConfigMutation.mutate({ chainId: c.id, programNumber: cfg?.program_number ?? 0, options: { bank_msb: cfg?.bank_msb, bank_lsb: cfg?.bank_lsb, send_pc_on_activate: v } })} />
                  </td>
                  <td>
                    {cfg && <Button kind="danger--ghost" size="sm" hasIconOnly renderIcon={TrashCan} iconDescription="Clear" onClick={() => deleteChainConfigMutation.mutate(c.id)} />}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Tile>

      <Tile>
        <h3>Snapshot Program Change overview</h3>
        <p style={{ opacity: 0.7 }}>For reference: snapshots that have a Program Change number assigned. Edit per snapshot in the Snapshot Editor toolbar.</p>
        <table style={{ width: '100%', marginTop: '0.75rem', borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left' }}><th>ID</th><th>Snapshot</th><th>PC #</th></tr></thead>
          <tbody>
            {snapshots.map((s: any) => (
              <tr key={s.id} style={{ borderTop: '1px solid var(--cds-border-subtle, #393939)' }}>
                <td>{s.id}</td>
                <td>{s.name ?? `Snapshot ${s.id}`}</td>
                <td>{s.program_number ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Tile>
    </div>
  )
}

// ============================================================================
// ROUTING RULES (CC / PC -> chain flow change)
// ============================================================================

interface RoutingRulesTabProps {
  rules: MIDIRoutingRule[]
  chains: Chain[]
}

function RoutingRulesTab({ rules, chains }: RoutingRulesTabProps) {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['midi'] })

  const createMutation = useMutation({
    mutationFn: (rule: Partial<MIDIRoutingRule>) => midiApiV2.createRoutingRule(rule),
    onSuccess: invalidate,
  })
  const deleteMutation = useMutation({
    mutationFn: (id: number) => midiApiV2.deleteRoutingRule(id),
    onSuccess: invalidate,
  })

  const [draft, setDraft] = useState<Partial<MIDIRoutingRule>>({
    chain_id: chains[0]?.id ?? 0,
    name: '',
    trigger_type: 'control_change',
    channel: 0,
    data1: 0,
    from_flow_index: 0,
    to_flow_index: 1,
    is_enabled: true,
  })

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <InlineNotification kind="info" title="Routing rules"
        subtitle="A routing rule shifts a chain's active flow when a MIDI trigger arrives — useful for switching tone stacks, bypass alternates, or A/B paths inside a chain."
        hideCloseButton lowContrast />

      <Tile>
        <h3>Routing rules ({rules.length})</h3>
        <table style={{ width: '100%', marginTop: '0.75rem', borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left' }}><th>Name</th><th>Chain</th><th>Trigger</th><th>Ch</th><th>Data1</th><th>From flow</th><th>To flow</th><th>Enabled</th><th /></tr></thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid var(--cds-border-subtle, #393939)' }}>
                <td>{r.name ?? '—'}</td>
                <td>{r.chain_id}</td>
                <td>{r.trigger_type}</td>
                <td>{r.channel}</td>
                <td>{r.data1}</td>
                <td>{r.from_flow_index}</td>
                <td>{r.to_flow_index}</td>
                <td>{r.is_enabled ? 'Yes' : 'No'}</td>
                <td><Button kind="danger--ghost" size="sm" hasIconOnly renderIcon={TrashCan} iconDescription="Delete" onClick={() => deleteMutation.mutate(r.id)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Tile>

      <Tile>
        <h3>Add routing rule</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
          <TextInput id="add-rr-name" labelText="Name" value={draft.name ?? ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <Select id="add-rr-chain" labelText="Chain" value={String(draft.chain_id ?? 0)} onChange={(e) => setDraft({ ...draft, chain_id: Number(e.target.value) })}>
            {chains.map((c) => <SelectItem key={c.id} value={String(c.id)} text={`${c.id} — ${c.name}`} />)}
          </Select>
          <Select id="add-rr-trig" labelText="Trigger" value={draft.trigger_type ?? 'control_change'} onChange={(e) => setDraft({ ...draft, trigger_type: e.target.value as MIDITriggerType })}>
            {TRIGGER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value} text={o.label} />)}
          </Select>
          <CarbonNumberInput id="add-rr-ch" label="Channel" value={draft.channel ?? 0} min={0} max={16} step={1} onChange={(_e, { value }) => setDraft({ ...draft, channel: Number(value) })} />
          <CarbonNumberInput id="add-rr-d1" label="Data1" value={draft.data1 ?? 0} min={0} max={127} step={1} onChange={(_e, { value }) => setDraft({ ...draft, data1: Number(value) })} />
          <CarbonNumberInput id="add-rr-from" label="From flow index" value={draft.from_flow_index ?? 0} min={0} step={1} onChange={(_e, { value }) => setDraft({ ...draft, from_flow_index: Number(value) })} />
          <CarbonNumberInput id="add-rr-to" label="To flow index" value={draft.to_flow_index ?? 1} min={0} step={1} onChange={(_e, { value }) => setDraft({ ...draft, to_flow_index: Number(value) })} />
          <Checkbox id="add-rr-enabled" labelText="Enabled" checked={draft.is_enabled ?? true} onChange={(_e, { checked }) => setDraft({ ...draft, is_enabled: checked })} />
        </div>
        <Button style={{ marginTop: '0.75rem' }} renderIcon={Add} onClick={() => createMutation.mutate(draft)}>Create rule</Button>
      </Tile>
    </div>
  )
}

// ============================================================================
// EXPRESSION PEDALS — global assignments + per-snapshot expression mappings
// ============================================================================

function ExpressionTab({ snapshotIdFilter }: { snapshotIdFilter: number | null }) {
  const queryClient = useQueryClient()

  const assignmentsQuery = useQuery<ExpressionAssignment[]>({
    queryKey: ['expression-assignments'],
    queryFn: () => fetchJson<ExpressionAssignment[]>(`${API_BASE}/v2/expression/assignments`),
    refetchInterval: 2000,
  })
  const paramsQuery = useQuery<{ parameters: ExpressionEngineParam[] }>({
    queryKey: ['expression-engine-parameters'],
    queryFn: () => fetchJson(`${API_BASE}/v2/engine/parameters`),
    staleTime: 60_000,
  })
  const calibrationsQuery = useQuery<{ calibrations: Record<string, ExpressionCalibration> }>({
    queryKey: ['midi', 'expression-calibrations'],
    queryFn: () => midiApiV2.getExpressionCalibrations(),
  })

  const params = paramsQuery.data?.parameters ?? []

  const saveMutation = useMutation({
    mutationFn: (payload: Partial<ExpressionAssignment>) => fetchJson<ExpressionAssignment>(`${API_BASE}/v2/expression/assignments`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expression-assignments'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetchJson(`${API_BASE}/v2/expression/assignments/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expression-assignments'] }),
  })

  const listenMutation = useMutation({
    mutationFn: (listenerId: string) => fetchJson<{ cc: number; channel: number }>(`${API_BASE}/v2/expression/listen-for-cc`, {
      method: 'POST',
      body: JSON.stringify({ listener_id: listenerId, timeout_seconds: 10.0 }),
    }),
  })

  const [draft, setDraft] = useState<Partial<ExpressionAssignment>>({
    cc: 0, channel: 0, cc_min: 0, cc_max: 127,
    param_id: '', param_label: '',
    out_min: 0, out_max: 1, curve: 'linear', active: true,
  })

  const assignments = assignmentsQuery.data ?? []
  const userAssignments = assignments.filter((a) => (a.source ?? 'user') === 'user')
  const performanceAssignments = assignments.filter((a) => a.source === 'performance_mode')

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <InlineNotification kind="info" title="Expression pedals"
        subtitle="A continuous CC (typically from an expression pedal) drives one or more engine parameters or performance actions. Each assignment has its own input window (cc_min/cc_max), output range, curve type, and optional custom curve."
        hideCloseButton lowContrast />

      <Tile>
        <h3>Add expression assignment</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
          <CarbonNumberInput id="exp-cc" label="CC" value={draft.cc ?? 0} min={0} max={127} step={1} onChange={(_e, { value }) => setDraft({ ...draft, cc: Number(value) })} />
          <CarbonNumberInput id="exp-ch" label="Channel (0=omni)" value={draft.channel ?? 0} min={0} max={16} step={1} onChange={(_e, { value }) => setDraft({ ...draft, channel: Number(value) })} />
          <CarbonNumberInput id="exp-cc-min" label="CC min (input window)" value={draft.cc_min ?? 0} min={0} max={127} step={1} onChange={(_e, { value }) => setDraft({ ...draft, cc_min: Number(value) })} />
          <CarbonNumberInput id="exp-cc-max" label="CC max (input window)" value={draft.cc_max ?? 127} min={0} max={127} step={1} onChange={(_e, { value }) => setDraft({ ...draft, cc_max: Number(value) })} />
          <Select id="exp-param" labelText="Target parameter" value={draft.param_id ?? ''} onChange={(e) => {
            const p = params.find((x) => x.id === e.target.value)
            setDraft({ ...draft, param_id: e.target.value, param_label: p?.label ?? e.target.value, out_min: p?.min ?? 0, out_max: p?.max ?? 1 })
          }}>
            <SelectItem value="" text="— select engine parameter —" />
            {params.map((p) => <SelectItem key={p.id} value={p.id} text={`${p.label}${p.unit ? ` (${p.unit})` : ''}`} />)}
            <SelectItem value="" text="── performance actions ──" disabled />
            {PERFORMANCE_TARGETS.map((p) => <SelectItem key={p.id} value={p.id} text={`Performance: ${p.label}`} />)}
          </Select>
          <CarbonNumberInput id="exp-out-min" label="Output min" value={draft.out_min ?? 0} step={0.01} onChange={(_e, { value }) => setDraft({ ...draft, out_min: Number(value) })} />
          <CarbonNumberInput id="exp-out-max" label="Output max" value={draft.out_max ?? 1} step={0.01} onChange={(_e, { value }) => setDraft({ ...draft, out_max: Number(value) })} />
          <Select id="exp-curve" labelText="Curve" value={String(draft.curve ?? 'linear')} onChange={(e) => setDraft({ ...draft, curve: e.target.value })}>
            {CURVE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value} text={o.label} />)}
            <SelectItem value="custom" text="Custom (Bezier — edit per-row)" />
          </Select>
          <Checkbox id="exp-active" labelText="Active" checked={draft.active ?? true} onChange={(_e, { checked }) => setDraft({ ...draft, active: checked })} />
        </div>
        <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
          <Button renderIcon={Add} onClick={() => saveMutation.mutate(draft)}>Create assignment</Button>
          <Button kind="tertiary" renderIcon={Flash} disabled={listenMutation.isPending} onClick={async () => {
            try {
              const result = await listenMutation.mutateAsync(`add-form-${Date.now()}`)
              setDraft({ ...draft, cc: result.cc, channel: result.channel })
            } catch {}
          }}>{listenMutation.isPending ? 'Listening… move pedal' : 'Listen for CC'}</Button>
        </div>
      </Tile>

      <Tile>
        <h3>User assignments ({userAssignments.length})</h3>
        <table style={{ width: '100%', marginTop: '0.75rem', borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left' }}><th>CC</th><th>Ch</th><th>Window</th><th>Target</th><th>Out range</th><th>Curve</th><th>Active</th><th>Retime (ms)</th><th /></tr></thead>
          <tbody>
            {userAssignments.map((a) => (
              <tr key={a.id} style={{ borderTop: '1px solid var(--cds-border-subtle, #393939)' }}>
                <td>{a.cc}</td>
                <td>{a.channel || 'omni'}</td>
                <td>{a.cc_min}–{a.cc_max}</td>
                <td>{a.param_label || a.param_id}</td>
                <td>{a.out_min} → {a.out_max}</td>
                <td>{a.curve}</td>
                <td>{a.active ? 'Yes' : 'No'}</td>
                <td>{a.retime_mean_ms != null ? `μ ${a.retime_mean_ms.toFixed(2)} · p95 ${a.retime_p95_ms?.toFixed(2)} · max ${a.retime_max_ms?.toFixed(2)}` : '—'}</td>
                <td>
                  <Button kind="ghost" size="sm" onClick={() => saveMutation.mutate({ ...a, active: !a.active })}>{a.active ? 'Disable' : 'Enable'}</Button>
                  <Button kind="danger--ghost" size="sm" hasIconOnly renderIcon={TrashCan} iconDescription="Delete" onClick={() => deleteMutation.mutate(a.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Tile>

      {performanceAssignments.length > 0 && (
        <Tile>
          <h3>Performance-mode assignments ({performanceAssignments.length})</h3>
          <p style={{ opacity: 0.7 }}>Read-only mappings owned by performance mode (e.g. tap tempo, tuner mute, page next/prev, bypass slots).</p>
          <table style={{ width: '100%', marginTop: '0.75rem', borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left' }}><th>CC</th><th>Ch</th><th>Target</th><th>Active</th></tr></thead>
            <tbody>
              {performanceAssignments.map((a) => (
                <tr key={a.id}><td>{a.cc}</td><td>{a.channel || 'omni'}</td><td>{a.param_label || a.param_id}</td><td>{a.active ? 'Yes' : 'No'}</td></tr>
              ))}
            </tbody>
          </table>
        </Tile>
      )}

      <Tile>
        <h3>Per-pedal calibration ({Object.keys(calibrationsQuery.data?.calibrations ?? {}).length})</h3>
        <p style={{ opacity: 0.7 }}>Stored hardware calibration: physical CC range, deadzones, curve, and inversion. Edit on the Devices &gt; physical surface page.</p>
        <table style={{ width: '100%', marginTop: '0.75rem', borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left' }}><th>Pedal ID</th><th>CC</th><th>Ch</th><th>Min raw</th><th>Max raw</th><th>Deadzone (lo / hi)</th><th>Curve</th><th>Invert</th><th>Default target</th></tr></thead>
          <tbody>
            {Object.entries(calibrationsQuery.data?.calibrations ?? {}).map(([id, cal]) => (
              <tr key={id} style={{ borderTop: '1px solid var(--cds-border-subtle, #393939)' }}>
                <td>{id}</td>
                <td>{cal.cc_number ?? '—'}</td>
                <td>{cal.channel ?? '—'}</td>
                <td>{cal.min_raw}</td>
                <td>{cal.max_raw}</td>
                <td>{cal.deadzone_low} / {cal.deadzone_high}</td>
                <td>{cal.curve}</td>
                <td>{cal.invert ? 'Yes' : 'No'}</td>
                <td>{cal.target ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Tile>

      {snapshotIdFilter && (
        <Tile>
          <h3>Per-snapshot expression mappings</h3>
          <p style={{ opacity: 0.7 }}>Snapshot ID {snapshotIdFilter} owns per-snapshot expression maps (one CC → many parameters). Edit those in the Snapshot Editor "Expression mappings" card; this is a reference here.</p>
          <Link to={`/snapshot-editor?snapshotId=${snapshotIdFilter}`}>Open in Snapshot Editor →</Link>
        </Tile>
      )}
    </div>
  )
}

// ============================================================================
// DEVICES, PROFILES, BANKS, SEND, GROUPS, PRESETS
// ============================================================================

function DevicesAndUtilitiesTab() {
  const queryClient = useQueryClient()

  const devicesQuery = useQuery({ queryKey: ['midi', 'devices'], queryFn: () => midiApiV2.getDevices() })
  const profilesQuery = useQuery({ queryKey: ['midi', 'profiles'], queryFn: () => midiApiV2.getDeviceProfiles() })
  const presetsQuery = useQuery({ queryKey: ['midi', 'presets'], queryFn: () => midiApiV2.getPresets() })
  const groupsQuery = useQuery({ queryKey: ['midi', 'groups'], queryFn: () => midiApiV2.getGroups() })
  const bankQuery = useQuery({ queryKey: ['midi', 'banks', 'current'], queryFn: () => midiApiV2.getCurrentBank(), refetchInterval: 2000 })

  const openInputMutation = useMutation({ mutationFn: (name: string) => midiApiV2.openInputDevice(name), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['midi'] }) })
  const openOutputMutation = useMutation({ mutationFn: (name: string) => midiApiV2.openOutputDevice(name), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['midi'] }) })
  const closeInputMutation = useMutation({ mutationFn: () => midiApiV2.closeInputDevice(), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['midi'] }) })
  const closeOutputMutation = useMutation({ mutationFn: () => midiApiV2.closeOutputDevice(), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['midi'] }) })
  const applyProfileMutation = useMutation({ mutationFn: ({ id, clear }: { id: string; clear: boolean }) => midiApiV2.applyDeviceProfile(id, clear), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['midi'] }) })
  const savePresetMutation = useMutation({ mutationFn: ({ name, description }: { name: string; description?: string }) => midiApiV2.savePreset(name, description), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['midi'] }) })
  const loadPresetMutation = useMutation({ mutationFn: (id: number) => midiApiV2.loadPreset(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['midi'] }) })
  const deletePresetMutation = useMutation({ mutationFn: (id: number) => midiApiV2.deletePreset(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['midi'] }) })
  const createGroupMutation = useMutation({ mutationFn: ({ name, color }: { name: string; color?: string }) => midiApiV2.createGroup(name, color), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['midi'] }) })
  const deleteGroupMutation = useMutation({ mutationFn: (id: number) => midiApiV2.deleteGroup(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['midi'] }) })
  const syncMutation = useMutation({ mutationFn: () => midiApiV2.syncToController() })
  const sendCcMutation = useMutation({ mutationFn: ({ channel, cc, value }: { channel: number; cc: number; value: number }) => midiApiV2.sendCC(channel, cc, value) })
  const sendPcMutation = useMutation({ mutationFn: ({ channel, program }: { channel: number; program: number }) => midiApiV2.sendProgramChange(channel, program) })
  const sendNoteMutation = useMutation({ mutationFn: ({ channel, note, velocity, on }: { channel: number; note: number; velocity: number; on: boolean }) => midiApiV2.sendNote(channel, note, velocity, on) })
  const bankUpMutation = useMutation({ mutationFn: () => midiApiV2.bankUp(), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['midi', 'banks'] }) })
  const bankDownMutation = useMutation({ mutationFn: () => midiApiV2.bankDown(), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['midi', 'banks'] }) })
  const bankSetMutation = useMutation({ mutationFn: (n: number) => midiApiV2.setBank(n), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['midi', 'banks'] }) })

  const [presetName, setPresetName] = useState('')
  const [presetDesc, setPresetDesc] = useState('')
  const [groupName, setGroupName] = useState('')
  const [groupColor, setGroupColor] = useState('')
  const [sendCc, setSendCc] = useState({ channel: 1, cc: 0, value: 0 })
  const [sendPc, setSendPc] = useState({ channel: 1, program: 0 })
  const [sendNote, setSendNote] = useState({ channel: 1, note: 60, velocity: 100, on: true })

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <Tile>
        <h3>Devices</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
          <div>
            <h4>Input</h4>
            <p style={{ opacity: 0.7 }}>Active: {devicesQuery.data?.current_input ?? '—'}</p>
            {devicesQuery.data?.input_devices.map((d) => (
              <div key={d} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.25rem 0' }}>
                <span>{d}</span>
                <Button kind="ghost" size="sm" onClick={() => openInputMutation.mutate(d)}>Open</Button>
              </div>
            ))}
            <Button kind="danger--ghost" size="sm" onClick={() => closeInputMutation.mutate()}>Close current input</Button>
          </div>
          <div>
            <h4>Output</h4>
            <p style={{ opacity: 0.7 }}>Active: {devicesQuery.data?.current_output ?? '—'}</p>
            {devicesQuery.data?.output_devices.map((d) => (
              <div key={d} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.25rem 0' }}>
                <span>{d}</span>
                <Button kind="ghost" size="sm" onClick={() => openOutputMutation.mutate(d)}>Open</Button>
              </div>
            ))}
            <Button kind="danger--ghost" size="sm" onClick={() => closeOutputMutation.mutate()}>Close current output</Button>
          </div>
        </div>
      </Tile>

      <Tile>
        <h3>Device profiles ({profilesQuery.data?.count ?? 0})</h3>
        <p style={{ opacity: 0.7 }}>Active profile: {profilesQuery.data?.active_profile_id ?? '—'}. Applying a profile populates commands, mappings, and expression configs from the profile spec.</p>
        <table style={{ width: '100%', marginTop: '0.75rem', borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left' }}><th>Name</th><th>Manufacturer</th><th>Switches</th><th>Pedals</th><th>FW update</th><th /></tr></thead>
          <tbody>
            {(profilesQuery.data?.profiles ?? []).map((p: MIDIDeviceProfile) => (
              <tr key={p.profile_id} style={{ borderTop: '1px solid var(--cds-border-subtle, #393939)' }}>
                <td>{p.name}{p.is_recommended && <Tag type="green" size="sm">Recommended</Tag>}</td>
                <td>{p.manufacturer}</td>
                <td>{p.footswitches.length}</td>
                <td>{p.expression_pedals.length}</td>
                <td>{p.supports_firmware_update ? `Yes (${p.current_firmware_version ?? '—'})` : 'No'}</td>
                <td>
                  <Button kind="ghost" size="sm" onClick={() => applyProfileMutation.mutate({ id: p.profile_id, clear: true })}>Apply (replace)</Button>
                  <Button kind="ghost" size="sm" onClick={() => applyProfileMutation.mutate({ id: p.profile_id, clear: false })}>Apply (merge)</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Tile>

      <Tile>
        <h3>Banks</h3>
        <p style={{ opacity: 0.7 }}>Bank: {bankQuery.data?.current_bank ?? 0} / {bankQuery.data?.max_banks ?? 0} · {bankQuery.data?.items_per_bank ?? 0} items per bank · PC offset {bankQuery.data?.pc_offset ?? 0}</p>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <Button size="sm" onClick={() => bankDownMutation.mutate()}>Bank −</Button>
          <Button size="sm" onClick={() => bankUpMutation.mutate()}>Bank +</Button>
          {Array.from({ length: bankQuery.data?.max_banks ?? 0 }, (_, i) => (
            <Button key={i} kind={(bankQuery.data?.current_bank ?? 0) === i ? 'primary' : 'ghost'} size="sm" onClick={() => bankSetMutation.mutate(i)}>{i}</Button>
          ))}
        </div>
      </Tile>

      <Tile>
        <h3>MIDI presets ({presetsQuery.data?.count ?? 0})</h3>
        <p style={{ opacity: 0.7 }}>Save and load complete MIDI configurations (mappings + commands + routing rules).</p>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', alignItems: 'flex-end' }}>
          <TextInput id="preset-name" labelText="Name" value={presetName} onChange={(e) => setPresetName(e.target.value)} />
          <TextInput id="preset-desc" labelText="Description" value={presetDesc} onChange={(e) => setPresetDesc(e.target.value)} />
          <Button renderIcon={Add} onClick={() => { savePresetMutation.mutate({ name: presetName, description: presetDesc }); setPresetName(''); setPresetDesc('') }}>Save current as preset</Button>
        </div>
        <table style={{ width: '100%', marginTop: '0.75rem', borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left' }}><th>Name</th><th>Description</th><th>Default</th><th /></tr></thead>
          <tbody>
            {(presetsQuery.data?.presets ?? []).map((p: MIDIPreset) => (
              <tr key={p.id} style={{ borderTop: '1px solid var(--cds-border-subtle, #393939)' }}>
                <td>{p.name}</td><td>{p.description ?? '—'}</td><td>{p.is_default ? 'Yes' : ''}</td>
                <td>
                  <Button kind="ghost" size="sm" onClick={() => loadPresetMutation.mutate(p.id)}>Load</Button>
                  <Button kind="danger--ghost" size="sm" hasIconOnly renderIcon={TrashCan} iconDescription="Delete" onClick={() => deletePresetMutation.mutate(p.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Tile>

      <Tile>
        <h3>Mapping groups ({groupsQuery.data?.count ?? 0})</h3>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', alignItems: 'flex-end' }}>
          <TextInput id="group-name" labelText="Name" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
          <TextInput id="group-color" labelText="Color (hex/name)" value={groupColor} onChange={(e) => setGroupColor(e.target.value)} />
          <Button renderIcon={Add} onClick={() => { createGroupMutation.mutate({ name: groupName, color: groupColor || undefined }); setGroupName(''); setGroupColor('') }}>Add group</Button>
        </div>
        <ul style={{ marginTop: '0.5rem' }}>
          {(groupsQuery.data?.groups ?? []).map((g: MIDIMappingGroup) => (
            <li key={g.id} style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--cds-border-subtle, #393939)', padding: '0.25rem 0' }}>
              <span><span style={{ display: 'inline-block', width: 10, height: 10, background: g.color ?? '#666', marginRight: 6, borderRadius: 2 }} />{g.name} (sort {g.sort_order})</span>
              <Button kind="danger--ghost" size="sm" hasIconOnly renderIcon={TrashCan} iconDescription="Delete" onClick={() => deleteGroupMutation.mutate(g.id)} />
            </li>
          ))}
        </ul>
      </Tile>

      <Tile>
        <h3>Send test MIDI</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
          <div>
            <h4>Send CC</h4>
            <CarbonNumberInput id="send-cc-ch" label="Channel" value={sendCc.channel} min={1} max={16} step={1} onChange={(_e, { value }) => setSendCc({ ...sendCc, channel: Number(value) })} />
            <CarbonNumberInput id="send-cc-cc" label="CC" value={sendCc.cc} min={0} max={127} step={1} onChange={(_e, { value }) => setSendCc({ ...sendCc, cc: Number(value) })} />
            <CarbonNumberInput id="send-cc-val" label="Value" value={sendCc.value} min={0} max={127} step={1} onChange={(_e, { value }) => setSendCc({ ...sendCc, value: Number(value) })} />
            <Button size="sm" renderIcon={Send} onClick={() => sendCcMutation.mutate(sendCc)}>Send CC</Button>
          </div>
          <div>
            <h4>Send Program Change</h4>
            <CarbonNumberInput id="send-pc-ch" label="Channel" value={sendPc.channel} min={1} max={16} step={1} onChange={(_e, { value }) => setSendPc({ ...sendPc, channel: Number(value) })} />
            <CarbonNumberInput id="send-pc-pc" label="Program" value={sendPc.program} min={0} max={127} step={1} onChange={(_e, { value }) => setSendPc({ ...sendPc, program: Number(value) })} />
            <Button size="sm" renderIcon={Send} onClick={() => sendPcMutation.mutate(sendPc)}>Send PC</Button>
          </div>
          <div>
            <h4>Send Note</h4>
            <CarbonNumberInput id="send-n-ch" label="Channel" value={sendNote.channel} min={1} max={16} step={1} onChange={(_e, { value }) => setSendNote({ ...sendNote, channel: Number(value) })} />
            <CarbonNumberInput id="send-n-note" label="Note (0–127)" value={sendNote.note} min={0} max={127} step={1} onChange={(_e, { value }) => setSendNote({ ...sendNote, note: Number(value) })} />
            <CarbonNumberInput id="send-n-vel" label="Velocity" value={sendNote.velocity} min={0} max={127} step={1} onChange={(_e, { value }) => setSendNote({ ...sendNote, velocity: Number(value) })} />
            <Checkbox id="send-n-on" labelText="Note on (vs. off)" checked={sendNote.on} onChange={(_e, { checked }) => setSendNote({ ...sendNote, on: checked })} />
            <Button size="sm" renderIcon={Send} onClick={() => sendNoteMutation.mutate(sendNote)}>Send Note</Button>
          </div>
        </div>
      </Tile>

      <Tile>
        <h3>Sync</h3>
        <p style={{ opacity: 0.7 }}>Push current parameter values out as feedback CCs to the connected controller.</p>
        <Button renderIcon={Renew} onClick={() => syncMutation.mutate()}>Sync to controller</Button>
      </Tile>
    </div>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export function MidiAssignmentsPage() {
  const [searchParams] = useSearchParams()
  const snapshotIdFilter = useMemo(() => {
    const raw = searchParams.get('snapshotId')
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }, [searchParams])

  const statusQuery = useQuery<MIDIStatus>({
    queryKey: ['midi', 'status'],
    queryFn: () => midiApiV2.getStatus(),
    refetchInterval: 500,
  })

  const mappingsQuery = useQuery({ queryKey: ['midi', 'mappings'], queryFn: () => midiApiV2.getMappings() })
  const commandsQuery = useQuery({ queryKey: ['midi', 'commands'], queryFn: () => midiApiV2.getCommands() })
  const routingRulesQuery = useQuery({ queryKey: ['midi', 'routing-rules'], queryFn: () => midiApiV2.getRoutingRules() })
  const groupsQuery = useQuery({ queryKey: ['midi', 'groups'], queryFn: () => midiApiV2.getGroups() })
  const chainConfigsQuery = useQuery({ queryKey: ['midi', 'chain-configs'], queryFn: () => midiApiV2.getChainConfigs() })
  const chainsQuery = useQuery({ queryKey: ['chains'], queryFn: () => chainsApi.list() })
  const pluginsQuery = useQuery({ queryKey: ['plugins', 'all'], queryFn: () => pluginsApi.getAll() })
  const snapshotsQuery = useQuery({ queryKey: ['snapshots', 'list'], queryFn: () => snapshotsApi.list() })

  const learnStatusQuery = useQuery({ queryKey: ['midi', 'learn-status'], queryFn: () => midiApiV2.getLearnStatus(), refetchInterval: 500 })
  const stopLearnMutation = useMutation({ mutationFn: () => midiApiV2.stopLearn() })

  const mappings = mappingsQuery.data?.mappings ?? []
  const commands = commandsQuery.data?.commands ?? []
  const routingRules = routingRulesQuery.data?.routing_rules ?? []
  const groups = groupsQuery.data?.groups ?? []
  const chainConfigs = chainConfigsQuery.data?.configs ?? []
  const chains = useMemo(() => {
    const data = chainsQuery.data
    if (!data) return [] as Chain[]
    if (Array.isArray((data as any).chains)) return (data as any).chains as Chain[]
    if (Array.isArray(data)) return data as Chain[]
    return [] as Chain[]
  }, [chainsQuery.data])
  const plugins = pluginsQuery.data ?? []
  const snapshots = (snapshotsQuery.data?.snapshots ?? []) as Snapshot[]

  return (
    <div style={{ padding: '1.5rem', display: 'grid', gap: '1rem', minHeight: '100vh' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Music /> MIDI Assignments
          </h1>
          <p style={{ margin: '0.25rem 0 0', opacity: 0.7 }}>
            One place to bind any MIDI input to any plugin parameter, snapshot trigger, routing change, or expression target.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {snapshotIdFilter && (
            <Tag type="blue">Snapshot context: {snapshotIdFilter}</Tag>
          )}
          {learnStatusQuery.data?.learning && (
            <>
              <Tag type="magenta">Learn mode active</Tag>
              <Button kind="danger--tertiary" size="sm" renderIcon={Flash} onClick={() => stopLearnMutation.mutate()}>Stop learn</Button>
            </>
          )}
        </div>
      </header>

      <MidiActivityStrip status={statusQuery.data} />

      <Tabs>
        <TabList aria-label="MIDI assignment sections" contained>
          <Tab renderIcon={Music}>Parameters</Tab>
          <Tab renderIcon={ChartLine}>Snapshot triggers</Tab>
          <Tab renderIcon={Connect}>Routing rules</Tab>
          <Tab renderIcon={Plug}>Expression pedals</Tab>
          <Tab renderIcon={Devices}>Devices &amp; utilities</Tab>
        </TabList>
        <TabPanels>
          <TabPanel>
            <ParameterMappingsTab mappings={mappings} groups={groups} chains={chains} plugins={plugins} snapshotIdFilter={snapshotIdFilter} />
          </TabPanel>
          <TabPanel>
            <CommandsTab commands={commands} chains={chains} plugins={plugins} snapshots={snapshots} chainConfigs={chainConfigs} />
          </TabPanel>
          <TabPanel>
            <RoutingRulesTab rules={routingRules} chains={chains} />
          </TabPanel>
          <TabPanel>
            <ExpressionTab snapshotIdFilter={snapshotIdFilter} />
          </TabPanel>
          <TabPanel>
            <DevicesAndUtilitiesTab />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>
  )
}

export default MidiAssignmentsPage
