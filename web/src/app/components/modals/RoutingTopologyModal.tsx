/**
 * RoutingTopologyModal
 *
 * Full signal-path configuration modal for the Audio Grid.
 * Covers all routing topology layers:
 *   - Topology mode (Series / Parallel / A/B / Morph / Sidechain)
 *   - Focus flow selection
 *   - Morph amount (when in parameter_morph mode)
 *   - Live routing diagram visualizer
 *   - Actions: Route ports, Assign flow (open child modals in place)
 *   - MIDI command assignments for every controllable routing target
 *
 * Changes are live/immediate — no Apply step. The modal heading button
 * labelled "Live" reflects this. Close with X or "Done".
 *
 * MIDI section follows the MIDICommand pattern (`action: 'set_routing'`),
 * matching the Native JUCE effect card pattern (MidiMappingDialog / MidiCcBadge).
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Button,
  InlineLoading,
  InlineNotification,
  Layer,
  Modal,
  NumberInput,
  Select,
  SelectItem,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Tag,
  Tile,
  Toggle,
} from '@carbon/react'
import {
  Branch,
  Close,
  Flow,
  Launch,
  Music,
} from '@carbon/icons-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { midiApiV2 } from '../../../map2/api'
import type { MIDICommand, MIDITriggerType, MIDIActionType, MIDIMappingV2 } from '../../../map2/types'
import { MidiCcBadge } from '../Controls/MidiCcBadge'
import {
  JuceGridRoutingVisualizer,
  type JuceGridRoutingFlowInfo,
} from '../SnapshotEditor/SnapshotEditorRoutingVisualizer'
import './RoutingTopologyModal.css'

// ── Types ──────────────────────────────────────────────────────────────────────

type RoutingMode =
  | 'parallel_blend'
  | 'ab_switch'
  | 'series'
  | 'parameter_morph'
  | 'sidechain'

export interface RoutingTopologyModalFlowSlot {
  id: string
  label: string
  color: string
  chainId: number | null
}

export interface RoutingTopologyModalProps {
  open: boolean
  onClose: () => void
  /** Current routing mode — changes are applied live via callbacks */
  routingMode: RoutingMode
  /** Morph progress 0–1 */
  morphProgress: number
  /** Index of the currently focused flow */
  activeFlowIndex: number
  /** All flow slots */
  flowSlots: RoutingTopologyModalFlowSlot[]
  /** Flows shaped for the visualizer */
  routingVisualizerFlows: JuceGridRoutingFlowInfo[]
  /** Active slot id for visualizer */
  activeSlotId: string | null
  morphSourceSlotId: string | null
  morphTargetSlotId: string | null
  /** Focus-flow buttons — pre-computed by parent */
  routingFocusButtons: Array<{
    id: string
    title: string
    caption: string
    active: boolean
  }>
  /** Live callbacks — fired immediately, no Apply */
  onSetRoutingMode: (mode: RoutingMode) => void
  onSelectFlowIndex: (index: number) => void
  onSetMorphProgress: (value: number) => void
  /** Open child modals (they stack on top of this one) */
  onOpenPortRouting: (flowIndex: number) => void
  onOpenAssignFlow: (flowId: string) => void
  /** Active flow index so Actions panel knows which flow to target */
  activeFlowId: string | null
}

// ── Constants ──────────────────────────────────────────────────────────────────

const ROUTING_MODE_OPTIONS: Array<{ id: RoutingMode; label: string; summary: string }> = [
  { id: 'series',          label: 'Series',    summary: 'Sequentially process each flow before output.' },
  { id: 'parallel_blend',  label: 'Parallel',  summary: 'Run flows side-by-side and blend them together.' },
  { id: 'ab_switch',       label: 'A/B',        summary: 'Only one focus flow is active at a time.' },
  { id: 'parameter_morph', label: 'Morph',      summary: 'Crossfade parameter states between two flows.' },
  { id: 'sidechain',       label: 'Sidechain',  summary: 'Drive one flow with another as control input.' },
]

/** MIDI-controllable routing targets with metadata */
interface RoutingMidiTarget {
  id: string
  label: string
  description: string
  action: MIDIActionType
  /** extra action_params merged on create */
  actionParams?: Record<string, unknown>
}

const ROUTING_MIDI_TARGETS: RoutingMidiTarget[] = [
  {
    id: 'set_routing_series',
    label: 'Set Series mode',
    description: 'Switch topology to Series on trigger',
    action: 'set_routing',
    actionParams: { mode: 'series' },
  },
  {
    id: 'set_routing_parallel',
    label: 'Set Parallel mode',
    description: 'Switch topology to Parallel blend on trigger',
    action: 'set_routing',
    actionParams: { mode: 'parallel_blend' },
  },
  {
    id: 'set_routing_ab',
    label: 'Set A/B mode',
    description: 'Switch topology to A/B switch on trigger',
    action: 'set_routing',
    actionParams: { mode: 'ab_switch' },
  },
  {
    id: 'set_routing_morph',
    label: 'Set Morph mode',
    description: 'Switch topology to Parameter Morph on trigger',
    action: 'set_routing',
    actionParams: { mode: 'parameter_morph' },
  },
  {
    id: 'set_routing_sidechain',
    label: 'Set Sidechain mode',
    description: 'Switch topology to Sidechain on trigger',
    action: 'set_routing',
    actionParams: { mode: 'sidechain' },
  },
  {
    id: 'activate_chain_flow_a',
    label: 'Focus Flow A',
    description: 'Switch active focus to Flow A',
    action: 'activate_chain',
    actionParams: { flow_index: 0 },
  },
  {
    id: 'activate_chain_flow_b',
    label: 'Focus Flow B',
    description: 'Switch active focus to Flow B',
    action: 'activate_chain',
    actionParams: { flow_index: 1 },
  },
  {
    id: 'activate_chain_flow_c',
    label: 'Focus Flow C',
    description: 'Switch active focus to Flow C',
    action: 'activate_chain',
    actionParams: { flow_index: 2 },
  },
  {
    id: 'activate_chain_flow_d',
    label: 'Focus Flow D',
    description: 'Switch active focus to Flow D',
    action: 'activate_chain',
    actionParams: { flow_index: 3 },
  },
]

const TRIGGER_OPTIONS: Array<{ value: MIDITriggerType; label: string }> = [
  { value: 'program_change', label: 'Program Change' },
  { value: 'note_on',        label: 'Note On' },
  { value: 'note_off',       label: 'Note Off' },
  { value: 'control_change', label: 'Control Change' },
]

const CHANNEL_OPTIONS = [
  { value: 0,  label: 'Omni' },
  ...Array.from({ length: 16 }, (_, i) => ({ value: i + 1, label: `Ch ${i + 1}` })),
]

// ── MIDI command row draft ─────────────────────────────────────────────────────

interface MidiCommandDraft {
  targetId: string
  existingId: number | null
  triggerType: MIDITriggerType
  channel: number
  data1: number
  isEnabled: boolean
  isDirty: boolean
}

function blankDraft(targetId: string): MidiCommandDraft {
  return {
    targetId,
    existingId: null,
    triggerType: 'program_change',
    channel: 0,
    data1: 0,
    isEnabled: true,
    isDirty: false,
  }
}

function commandMatchesTarget(cmd: MIDICommand, target: RoutingMidiTarget): boolean {
  if (cmd.action !== target.action) return false
  if (!target.actionParams) return true
  const params = cmd.action_params ?? {}
  return Object.entries(target.actionParams).every(([k, v]) => params[k] === v)
}

// ── Component ──────────────────────────────────────────────────────────────────

export function RoutingTopologyModal({
  open,
  onClose,
  routingMode,
  morphProgress,
  activeFlowIndex,
  flowSlots,
  routingVisualizerFlows,
  activeSlotId,
  morphSourceSlotId,
  morphTargetSlotId,
  routingFocusButtons,
  onSetRoutingMode,
  onSelectFlowIndex,
  onSetMorphProgress,
  onOpenPortRouting,
  onOpenAssignFlow,
  activeFlowId,
}: RoutingTopologyModalProps) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState(0)
  const [drafts, setDrafts] = useState<Record<string, MidiCommandDraft>>({})
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())

  // ── Load existing MIDI commands ──────────────────────────────────────────────
  const commandsQuery = useQuery({
    queryKey: ['midi', 'commands', 'routing'],
    queryFn: () => midiApiV2.getCommands(),
    enabled: open,
  })

  // Hydrate drafts from fetched commands whenever the query settles
  useEffect(() => {
    if (!commandsQuery.data) return
    const cmds = commandsQuery.data.commands
    setDrafts((prev) => {
      const next: Record<string, MidiCommandDraft> = {}
      for (const target of ROUTING_MIDI_TARGETS) {
        const existing = cmds.find((c) => commandMatchesTarget(c, target))
        if (existing) {
          // Keep dirty edits the user has already made in this session
          const prevDraft = prev[target.id]
          next[target.id] = prevDraft?.isDirty
            ? prevDraft
            : {
                targetId: target.id,
                existingId: existing.id,
                triggerType: existing.trigger_type,
                channel: existing.channel,
                data1: existing.data1,
                isEnabled: existing.is_enabled,
                isDirty: false,
              }
        } else {
          next[target.id] = prev[target.id] ?? blankDraft(target.id)
        }
      }
      return next
    })
  }, [commandsQuery.data])

  // Reset tab on open
  useEffect(() => {
    if (open) setActiveTab(0)
  }, [open])

  // ── Mutations ────────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (command: Partial<MIDICommand>) => midiApiV2.createCommand(command),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['midi', 'commands', 'routing'] }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: Partial<MIDICommand> }) =>
      midiApiV2.updateCommand(id, updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['midi', 'commands', 'routing'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => midiApiV2.deleteCommand(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['midi', 'commands', 'routing'] }),
  })

  // ── Draft helpers ────────────────────────────────────────────────────────────

  const updateDraft = useCallback((targetId: string, patch: Partial<MidiCommandDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [targetId]: { ...prev[targetId], ...patch, isDirty: true },
    }))
  }, [])

  const saveDraft = useCallback(async (targetId: string) => {
    const draft = drafts[targetId]
    const target = ROUTING_MIDI_TARGETS.find((t) => t.id === targetId)
    if (!draft || !target) return

    setSavingIds((prev) => new Set(prev).add(targetId))
    try {
      const payload: Partial<MIDICommand> = {
        name: target.label,
        trigger_type: draft.triggerType,
        channel: draft.channel,
        data1: draft.data1,
        data2_threshold: null,
        action: target.action,
        target_chain_id: null,
        target_plugin_uri: null,
        action_params: target.actionParams ?? null,
        is_enabled: draft.isEnabled,
      }

      if (draft.existingId !== null) {
        await updateMutation.mutateAsync({ id: draft.existingId, updates: payload })
      } else {
        await createMutation.mutateAsync(payload)
      }

      setDrafts((prev) => ({
        ...prev,
        [targetId]: { ...prev[targetId], isDirty: false },
      }))
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev)
        next.delete(targetId)
        return next
      })
    }
  }, [drafts, createMutation, updateMutation])

  const deleteDraft = useCallback(async (targetId: string) => {
    const draft = drafts[targetId]
    if (!draft?.existingId) return

    setDeletingIds((prev) => new Set(prev).add(targetId))
    try {
      await deleteMutation.mutateAsync(draft.existingId)
      setDrafts((prev) => ({
        ...prev,
        [targetId]: blankDraft(targetId),
      }))
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev)
        next.delete(targetId)
        return next
      })
    }
  }, [drafts, deleteMutation])

  // ── Derived ──────────────────────────────────────────────────────────────────

  const activeMode = useMemo(
    () => ROUTING_MODE_OPTIONS.find((o) => o.id === routingMode) ?? ROUTING_MODE_OPTIONS[0],
    [routingMode],
  )

  const activeFlow = flowSlots.find((s) => s.id === activeFlowId) ?? flowSlots[activeFlowIndex] ?? null

  const midiAssignedCount = useMemo(
    () => Object.values(drafts).filter((d) => d.existingId !== null).length,
    [drafts],
  )

  // ── Render helpers ────────────────────────────────────────────────────────────

  const renderTopologyPanel = () => (
    <div className="rtm__panel-grid">
      {/* LEFT: controls */}
      <div className="rtm__sidebar">
        {/* Topology tile */}
        <Tile className="rtm__tile">
          <span className="rtm__tile-label">Topology</span>
          <p className="rtm__tile-copy">{activeMode.summary}</p>
          <div className="rtm__button-row">
            {ROUTING_MODE_OPTIONS.map((option) => (
              <Button
                key={option.id}
                size="sm"
                kind={routingMode === option.id ? 'secondary' : 'ghost'}
                onClick={() => onSetRoutingMode(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </Tile>

        {/* Focus flow tile */}
        <Tile className="rtm__tile">
          <span className="rtm__tile-label">Focus flow</span>
          <p className="rtm__tile-copy">Choose which flow stays primary while editing and routing.</p>
          <div className="rtm__focus-list">
            {routingFocusButtons.map((btn, index) => (
              <Button
                key={btn.id}
                size="sm"
                kind={btn.active ? 'secondary' : 'ghost'}
                className="rtm__focus-button"
                onClick={() => onSelectFlowIndex(index)}
              >
                <span className="rtm__focus-button-copy">
                  <span className="rtm__focus-button-title">{btn.title}</span>
                  <span className="rtm__focus-button-caption">{btn.caption}</span>
                </span>
              </Button>
            ))}
          </div>
        </Tile>

        {/* Morph tile — only in morph mode */}
        {routingMode === 'parameter_morph' && (
          <Tile className="rtm__tile rtm__tile--morph">
            <span className="rtm__tile-label">Morph amount</span>
            <p className="rtm__tile-copy">Set the crossfade position between morph source and target.</p>
            <NumberInput
              id="rtm-morph-amount"
              label="Morph"
              value={Math.round(morphProgress * 100)}
              min={0}
              max={100}
              step={1}
              onChange={(_e, { value }) => {
                const n = typeof value === 'number' ? value : Number(value)
                if (!Number.isNaN(n)) onSetMorphProgress(n / 100)
              }}
            />
          </Tile>
        )}

        {/* Actions tile */}
        <Tile className="rtm__tile">
          <span className="rtm__tile-label">Actions</span>
          <p className="rtm__tile-copy">Open port routing or assign the active flow to a cluster node.</p>
          <div className="rtm__button-row">
            <Button
              size="sm"
              kind="ghost"
              renderIcon={Launch}
              onClick={() => onOpenPortRouting(activeFlowIndex)}
            >
              Route ports
            </Button>
            <Button
              size="sm"
              kind="ghost"
              renderIcon={Branch}
              disabled={!activeFlow}
              onClick={() => activeFlow && onOpenAssignFlow(activeFlow.id)}
            >
              Assign flow
            </Button>
          </div>
        </Tile>
      </div>

      {/* RIGHT: diagram */}
      <div className="rtm__visual">
        <JuceGridRoutingVisualizer
          mode={routingMode}
          flows={routingVisualizerFlows}
          morphProgress={morphProgress}
          activeFlowId={activeSlotId}
          morphSourceId={morphSourceSlotId}
          morphTargetId={morphTargetSlotId}
          compact={flowSlots.length > 4}
          showFlowList={false}
        />
      </div>
    </div>
  )

  const renderMidiPanel = () => (
    <div className="rtm__midi-panel">
      <div className="rtm__midi-header">
        <div className="rtm__midi-copy">
          <strong>MIDI command assignments</strong>
          <p>
            Assign MIDI triggers (Program Change, Note, CC) to routing actions.
            Changes are saved per-target. Follows the same command model as effect cards.
          </p>
        </div>
        <div className="rtm__midi-meta">
          {midiAssignedCount > 0 && (
            <Tag type="blue">{midiAssignedCount} assigned</Tag>
          )}
          <Tag type="cool-gray">Commands</Tag>
        </div>
      </div>

      {commandsQuery.isLoading && (
        <div className="rtm__midi-loading">
          <InlineLoading description="Loading MIDI commands…" />
        </div>
      )}

      {commandsQuery.isError && (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="MIDI commands unavailable"
          subtitle="Could not reach the MIDI API. Reopen the modal after the engine settles."
        />
      )}

      {!commandsQuery.isLoading && (
        <div className="rtm__midi-table">
          <div className="rtm__midi-table-head" role="row">
            <span role="columnheader">Action</span>
            <span role="columnheader">Trigger</span>
            <span role="columnheader">Ch</span>
            <span role="columnheader">Data 1</span>
            <span role="columnheader">Enabled</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Save / Remove</span>
          </div>

          {ROUTING_MIDI_TARGETS.map((target) => {
            const draft = drafts[target.id] ?? blankDraft(target.id)
            const isSaving = savingIds.has(target.id)
            const isDeleting = deletingIds.has(target.id)
            const isAssigned = draft.existingId !== null
            const isBusy = isSaving || isDeleting

            // Build a fake MIDIMappingV2-like object for MidiCcBadge (reuse display)
            const badgeMapping: MIDIMappingV2 | null = isAssigned
              ? {
                  id: draft.existingId!,
                  channel: draft.channel,
                  cc: draft.data1,
                  chain_id: null,
                  target_plugin_uri: null,
                  target_param_index: null,
                  target_param_symbol: null,
                  min_val: 0,
                  max_val: 127,
                  curve_type: 'linear',
                  invert: false,
                  feedback_enabled: false,
                  feedback_cc: null,
                  name: target.label,
                  group_id: null,
                  is_learned: false,
                  is_enabled: draft.isEnabled,
                }
              : null

            return (
              <div
                key={target.id}
                className={`rtm__midi-row ${isAssigned ? 'is-assigned' : ''} ${draft.isDirty ? 'is-dirty' : ''}`}
                role="row"
              >
                {/* Action label */}
                <div className="rtm__midi-cell rtm__midi-cell--action" role="cell">
                  <div className="rtm__midi-action-copy">
                    <strong>{target.label}</strong>
                    <span>{target.description}</span>
                  </div>
                  {isAssigned && (
                    <MidiCcBadge
                      mapping={badgeMapping}
                      position="inline"
                      size="small"
                    />
                  )}
                </div>

                {/* Trigger type */}
                <div className="rtm__midi-cell" role="cell">
                  <Select
                    id={`rtm-trigger-${target.id}`}
                    labelText=""
                    hideLabel
                    size="sm"
                    value={draft.triggerType}
                    onChange={(e) => updateDraft(target.id, { triggerType: e.target.value as MIDITriggerType })}
                    disabled={isBusy}
                  >
                    {TRIGGER_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} text={opt.label} />
                    ))}
                  </Select>
                </div>

                {/* Channel */}
                <div className="rtm__midi-cell rtm__midi-cell--narrow" role="cell">
                  <Select
                    id={`rtm-channel-${target.id}`}
                    labelText=""
                    hideLabel
                    size="sm"
                    value={String(draft.channel)}
                    onChange={(e) => updateDraft(target.id, { channel: Number(e.target.value) })}
                    disabled={isBusy}
                  >
                    {CHANNEL_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)} text={opt.label} />
                    ))}
                  </Select>
                </div>

                {/* Data 1 (PC / note / CC number) */}
                <div className="rtm__midi-cell rtm__midi-cell--narrow" role="cell">
                  <NumberInput
                    id={`rtm-data1-${target.id}`}
                    label=""
                    hideLabel
                    size="sm"
                    value={draft.data1}
                    min={0}
                    max={127}
                    step={1}
                    onChange={(_e, { value }) => {
                      const n = typeof value === 'number' ? value : Number(value)
                      if (!Number.isNaN(n)) updateDraft(target.id, { data1: n })
                    }}
                    disabled={isBusy}
                  />
                </div>

                {/* Enabled toggle */}
                <div className="rtm__midi-cell rtm__midi-cell--toggle" role="cell">
                  <Toggle
                    id={`rtm-enabled-${target.id}`}
                    labelText=""
                    hideLabel
                    size="sm"
                    toggled={draft.isEnabled}
                    onToggle={(checked) => updateDraft(target.id, { isEnabled: checked })}
                    disabled={isBusy}
                  />
                </div>

                {/* Status badge */}
                <div className="rtm__midi-cell rtm__midi-cell--status" role="cell">
                  {isSaving || isDeleting ? (
                    <InlineLoading />
                  ) : isAssigned ? (
                    <Tag type={draft.isDirty ? 'warm-gray' : 'green'}>
                      {draft.isDirty ? 'Unsaved' : 'Saved'}
                    </Tag>
                  ) : (
                    <Tag type="cool-gray">Unassigned</Tag>
                  )}
                </div>

                {/* Save / Remove actions */}
                <div className="rtm__midi-cell rtm__midi-cell--actions" role="cell">
                  <Button
                    size="sm"
                    kind={draft.isDirty ? 'primary' : 'ghost'}
                    disabled={isBusy || !draft.isDirty}
                    onClick={() => saveDraft(target.id)}
                  >
                    Save
                  </Button>
                  {isAssigned && (
                    <Button
                      size="sm"
                      kind="danger--ghost"
                      disabled={isBusy}
                      onClick={() => deleteDraft(target.id)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="rtm__midi-footer">
        <p className="rtm__midi-footer-copy">
          MIDI commands trigger routing actions globally. For per-chain program-change
          recall, use the chain MIDI config in the Chain Assignment modal.
        </p>
      </div>
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <Modal
      open={open}
      size="lg"
      modalHeading="Set your Signal Path between Flows/Chains"
      modalLabel={activeMode.label}
      primaryButtonText="Done"
      hasScrollingContent
      onRequestClose={onClose}
      onRequestSubmit={onClose}
      secondaryButtons={[]}
      aria-label="Routing topology"
    >
      <div className="rtm__body">
        {/* Live status strip */}
        <div className="rtm__live-strip">
          <Tag type="green">Live</Tag>
          <span className="rtm__live-strip-copy">
            Changes apply immediately — no Apply step needed.
          </span>
          <div className="rtm__live-strip-meta">
            <Tag type="blue">{activeMode.label}</Tag>
            <Tag type="cool-gray">Focus {routingFocusButtons.find((b) => b.active)?.title ?? '—'}</Tag>
            {routingMode === 'parameter_morph' && (
              <Tag type="purple">Morph {Math.round(morphProgress * 100)}%</Tag>
            )}
            {midiAssignedCount > 0 && (
              <Tag type="teal">
                <Music size={12} style={{ marginRight: 4 }} />
                {midiAssignedCount} MIDI
              </Tag>
            )}
          </div>
        </div>

        {/* Tabs: Topology | MIDI */}
        <Layer>
          <Tabs
            selectedIndex={activeTab}
            onChange={({ selectedIndex }) => setActiveTab(selectedIndex)}
          >
            <TabList aria-label="Routing topology sections" contained>
              <Tab>
                <Flow size={14} style={{ marginRight: 6 }} />
                Topology
              </Tab>
              <Tab>
                <Music size={14} style={{ marginRight: 6 }} />
                MIDI Control
                {midiAssignedCount > 0 && (
                  <span className="rtm__tab-badge">{midiAssignedCount}</span>
                )}
              </Tab>
            </TabList>
            <TabPanels>
              <TabPanel>{renderTopologyPanel()}</TabPanel>
              <TabPanel>{renderMidiPanel()}</TabPanel>
            </TabPanels>
          </Tabs>
        </Layer>
      </div>
    </Modal>
  )
}

export default RoutingTopologyModal
