import { useState, useEffect, useCallback, useMemo, type CSSProperties } from 'react'
import {
  Button,
  InlineLoading,
  InlineNotification,
  Layer,
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
  Flow,
  Launch,
  Music,
} from '@carbon/icons-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { midiApiV2 } from '../../../map2/api'
import type { MIDICommand, MIDITriggerType, MIDIActionType, MIDIMappingV2 } from '../../../map2/types'
import { MidiCcBadge } from '../Controls/MidiCcBadge'
import { LoadingState } from '../shared/LoadingState'
import {
  JuceGridRoutingVisualizer,
  type JuceGridRoutingFlowInfo,
} from '../SnapshotEditor/SnapshotEditorRoutingVisualizer'
import './RoutingTopologyModal.css'

type RoutingMode =
  | 'parallel_blend'
  | 'ab_switch'
  | 'series'
  | 'parameter_morph'
  | 'sidechain'

export interface RoutingTopologyFlowSlot {
  id: string
  label: string
  color: string
  chainId: number | null
}

export interface RoutingTopologyContentProps {
  routingMode: RoutingMode
  morphProgress: number
  activeFlowIndex: number
  flowSlots: RoutingTopologyFlowSlot[]
  routingVisualizerFlows: JuceGridRoutingFlowInfo[]
  activeSlotId: string | null
  morphSourceSlotId: string | null
  morphTargetSlotId: string | null
  routingFocusButtons: Array<{
    id: string
    title: string
    caption: string
    active: boolean
    color: string
  }>
  onSetRoutingMode: (mode: RoutingMode) => void
  onSelectFlowIndex: (index: number) => void
  onSetMorphProgress: (value: number) => void
  onOpenPortRouting: (flowIndex: number) => void
  onOpenAssignFlow: (flowId: string) => void
  activeFlowId: string | null
  liveStatusLabel: 'Draft' | 'Live' | 'Pending live' | 'Applying'
  liveStatusTagType: 'cool-gray' | 'green' | 'warm-gray' | 'blue'
  liveStatusMessage: string
  readOnly?: boolean
}

const ROUTING_MODE_OPTIONS: Array<{ id: RoutingMode; label: string; summary: string }> = [
  { id: 'series', label: 'Series', summary: 'Sequentially process each flow before output.' },
  { id: 'parallel_blend', label: 'Parallel', summary: 'Run flows side-by-side and blend them together.' },
  { id: 'ab_switch', label: 'A/B', summary: 'Only one focus flow is active at a time.' },
  { id: 'parameter_morph', label: 'Morph', summary: 'Crossfade parameter states between two flows.' },
  { id: 'sidechain', label: 'Sidechain', summary: 'Drive one flow with another as control input.' },
]

interface RoutingMidiTarget {
  id: string
  label: string
  description: string
  action: MIDIActionType
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
  { value: 'note_on', label: 'Note On' },
  { value: 'note_off', label: 'Note Off' },
  { value: 'control_change', label: 'Control Change' },
]

const CHANNEL_OPTIONS = [
  { value: 0, label: 'Omni' },
  ...Array.from({ length: 16 }, (_, i) => ({ value: i + 1, label: `Ch ${i + 1}` })),
]

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
  return Object.entries(target.actionParams).every(([key, value]) => params[key] === value)
}

export function RoutingTopologyContent({
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
  liveStatusLabel,
  liveStatusTagType,
  liveStatusMessage,
  readOnly = false,
}: RoutingTopologyContentProps) {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState(0)
  const [drafts, setDrafts] = useState<Record<string, MidiCommandDraft>>({})
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())

  const commandsQuery = useQuery({
    queryKey: ['midi', 'commands', 'routing'],
    queryFn: () => midiApiV2.getCommands(),
  })

  useEffect(() => {
    if (!commandsQuery.data) return
    const commands = commandsQuery.data.commands
    setDrafts((previous) => {
      const next: Record<string, MidiCommandDraft> = {}
      for (const target of ROUTING_MIDI_TARGETS) {
        const existing = commands.find((command) => commandMatchesTarget(command, target))
        if (existing) {
          const previousDraft = previous[target.id]
          next[target.id] = previousDraft?.isDirty
            ? previousDraft
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
          next[target.id] = previous[target.id] ?? blankDraft(target.id)
        }
      }
      return next
    })
  }, [commandsQuery.data])

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

  const updateDraft = useCallback((targetId: string, patch: Partial<MidiCommandDraft>) => {
    setDrafts((previous) => ({
      ...previous,
      [targetId]: { ...previous[targetId], ...patch, isDirty: true },
    }))
  }, [])

  const saveDraft = useCallback(async (targetId: string) => {
    const draft = drafts[targetId]
    const target = ROUTING_MIDI_TARGETS.find((entry) => entry.id === targetId)
    if (!draft || !target) return

    setSavingIds((previous) => new Set(previous).add(targetId))
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

      setDrafts((previous) => ({
        ...previous,
        [targetId]: { ...previous[targetId], isDirty: false },
      }))
    } finally {
      setSavingIds((previous) => {
        const next = new Set(previous)
        next.delete(targetId)
        return next
      })
    }
  }, [createMutation, drafts, updateMutation])

  const deleteDraft = useCallback(async (targetId: string) => {
    const draft = drafts[targetId]
    if (!draft?.existingId) return

    setDeletingIds((previous) => new Set(previous).add(targetId))
    try {
      await deleteMutation.mutateAsync(draft.existingId)
      setDrafts((previous) => ({
        ...previous,
        [targetId]: blankDraft(targetId),
      }))
    } finally {
      setDeletingIds((previous) => {
        const next = new Set(previous)
        next.delete(targetId)
        return next
      })
    }
  }, [deleteMutation, drafts])

  const activeMode = useMemo(
    () => ROUTING_MODE_OPTIONS.find((option) => option.id === routingMode) ?? ROUTING_MODE_OPTIONS[0],
    [routingMode],
  )
  const activeFlow = flowSlots.find((slot) => slot.id === activeFlowId) ?? flowSlots[activeFlowIndex] ?? null
  const activeFocusButton = routingFocusButtons.find((button) => button.active) ?? null
  const morphSourceFlow = flowSlots.find((slot) => slot.id === morphSourceSlotId) ?? null
  const morphTargetFlow = flowSlots.find((slot) => slot.id === morphTargetSlotId) ?? null
  const midiAssignedCount = useMemo(
    () => Object.values(drafts).filter((draft) => draft.existingId !== null).length,
    [drafts],
  )

  const renderTopologyPanel = () => (
    <div className="rtm__panel-grid">
      <div className="rtm__sidebar">
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
                disabled={readOnly}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </Tile>

        <Tile className="rtm__tile">
          <span className="rtm__tile-label">Focus flow</span>
          <p className="rtm__tile-copy">Choose which flow stays primary while editing and routing.</p>
          <div className="rtm__focus-list">
            {routingFocusButtons.map((button, index) => (
              <Button
                key={button.id}
                size="sm"
                kind={button.active ? 'secondary' : 'ghost'}
                className="rtm__focus-button"
                style={{ '--rtm-flow-color': button.color } as CSSProperties}
                onClick={() => onSelectFlowIndex(index)}
                disabled={readOnly}
              >
                <span className="rtm__focus-button-copy">
                  <span className="rtm__focus-button-title">{button.title}</span>
                  <span className="rtm__focus-button-caption">{button.caption}</span>
                </span>
              </Button>
            ))}
          </div>
        </Tile>

        {routingMode === 'parameter_morph' ? (
          <Tile className="rtm__tile rtm__tile--morph">
            <span className="rtm__tile-label">Morph amount</span>
            <p className="rtm__tile-copy">Set the crossfade position between morph source and target.</p>
            <div className="rtm__morph-endpoints">
              {morphSourceFlow ? (
                <span
                  className="rtm__morph-endpoint"
                  style={{ '--rtm-flow-color': morphSourceFlow.color } as CSSProperties}
                >
                  {morphSourceFlow.label} source
                </span>
              ) : null}
              {morphTargetFlow ? (
                <span
                  className="rtm__morph-endpoint"
                  style={{ '--rtm-flow-color': morphTargetFlow.color } as CSSProperties}
                >
                  {morphTargetFlow.label} target
                </span>
              ) : null}
            </div>
            <NumberInput
              id="rtm-morph-amount"
              label="Morph"
              value={Math.round(morphProgress * 100)}
              min={0}
              max={100}
              step={1}
              onChange={(_event, { value }) => {
                const nextValue = typeof value === 'number' ? value : Number(value)
                if (!Number.isNaN(nextValue)) {
                  onSetMorphProgress(nextValue / 100)
                }
              }}
              disabled={readOnly}
            />
          </Tile>
        ) : null}

        <Tile className="rtm__tile">
          <span className="rtm__tile-label">Actions</span>
          <p className="rtm__tile-copy">Open port routing or assign the active flow to a cluster node.</p>
          <div className="rtm__button-row">
            <Button
              size="sm"
              kind="ghost"
              renderIcon={Launch}
              onClick={() => onOpenPortRouting(activeFlowIndex)}
              disabled={readOnly}
            >
              Route ports
            </Button>
            <Button
              size="sm"
              kind="ghost"
              renderIcon={Branch}
              disabled={readOnly || !activeFlow}
              onClick={() => activeFlow && onOpenAssignFlow(activeFlow.id)}
            >
              Assign flow
            </Button>
          </div>
        </Tile>
      </div>

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
            Assign MIDI triggers to routing actions. Changes are saved per target and follow the same command model as effect cards.
          </p>
        </div>
        <div className="rtm__midi-meta">
          {midiAssignedCount > 0 ? (
            <Tag type="blue">{midiAssignedCount} assigned</Tag>
          ) : null}
          <Tag type="cool-gray">Commands</Tag>
        </div>
      </div>

      {commandsQuery.isLoading ? (
        <div className="rtm__midi-loading">
          <LoadingState description="Loading MIDI commands" />
        </div>
      ) : null}

      {commandsQuery.isError ? (
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title="MIDI commands unavailable"
          subtitle="Could not reach the MIDI API. Reopen the modal after the engine settles."
        />
      ) : null}

      {!commandsQuery.isLoading ? (
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
            const controlsDisabled = readOnly || isBusy
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
                <div className="rtm__midi-cell rtm__midi-cell--action" role="cell">
                  <div className="rtm__midi-action-copy">
                    <strong>{target.label}</strong>
                    <span>{target.description}</span>
                  </div>
                  {isAssigned && badgeMapping ? (
                    <MidiCcBadge mapping={badgeMapping} position="inline" size="small" />
                  ) : null}
                </div>

                <div className="rtm__midi-cell" role="cell">
                  <Select
                    id={`rtm-trigger-${target.id}`}
                    labelText=""
                    hideLabel
                    size="sm"
                    value={draft.triggerType}
                    onChange={(event) => updateDraft(target.id, { triggerType: event.target.value as MIDITriggerType })}
                    disabled={controlsDisabled}
                  >
                    {TRIGGER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value} text={option.label} />
                    ))}
                  </Select>
                </div>

                <div className="rtm__midi-cell rtm__midi-cell--narrow" role="cell">
                  <Select
                    id={`rtm-channel-${target.id}`}
                    labelText=""
                    hideLabel
                    size="sm"
                    value={String(draft.channel)}
                    onChange={(event) => updateDraft(target.id, { channel: Number(event.target.value) })}
                    disabled={controlsDisabled}
                  >
                    {CHANNEL_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={String(option.value)} text={option.label} />
                    ))}
                  </Select>
                </div>

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
                    onChange={(_event, { value }) => {
                      const nextValue = typeof value === 'number' ? value : Number(value)
                      if (!Number.isNaN(nextValue)) {
                        updateDraft(target.id, { data1: nextValue })
                      }
                    }}
                    disabled={controlsDisabled}
                  />
                </div>

                <div className="rtm__midi-cell rtm__midi-cell--toggle" role="cell">
                  <Toggle
                    id={`rtm-enabled-${target.id}`}
                    labelText=""
                    hideLabel
                    size="sm"
                    toggled={draft.isEnabled}
                    onToggle={(checked) => updateDraft(target.id, { isEnabled: checked })}
                    disabled={controlsDisabled}
                  />
                </div>

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

                <div className="rtm__midi-cell rtm__midi-cell--actions" role="cell">
                  <Button
                    size="sm"
                    kind={draft.isDirty ? 'primary' : 'ghost'}
                    disabled={controlsDisabled || !draft.isDirty}
                    onClick={() => saveDraft(target.id)}
                  >
                    Save
                  </Button>
                  {isAssigned ? (
                    <Button
                      size="sm"
                      kind="danger--ghost"
                      disabled={controlsDisabled}
                      onClick={() => deleteDraft(target.id)}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      <div className="rtm__midi-footer">
        <p className="rtm__midi-footer-copy">
          MIDI commands trigger routing actions globally. For per-chain program-change recall, use the chain MIDI config in the Chain Assignment modal.
        </p>
      </div>
    </div>
  )

  return (
    <div className="rtm__body">
      <div className="rtm__live-strip">
        <Tag type={liveStatusTagType}>{liveStatusLabel}</Tag>
        <span className="rtm__live-strip-copy">{liveStatusMessage}</span>
        <div className="rtm__live-strip-meta">
          <Tag type="blue">{activeMode.label}</Tag>
          <span
            className="rtm__live-focus-chip"
            style={{ '--rtm-flow-color': activeFocusButton?.color ?? 'var(--cds-border-strong, #6f6f6f)' } as CSSProperties}
          >
            Focus {activeFocusButton?.title ?? '—'}
          </span>
          {routingMode === 'parameter_morph' ? (
            <span className="rtm__morph-chip-row">
              <span className="rtm__morph-chip">Morph {Math.round(morphProgress * 100)}%</span>
              {morphSourceFlow ? (
                <span
                  className="rtm__morph-endpoint"
                  style={{ '--rtm-flow-color': morphSourceFlow.color } as CSSProperties}
                >
                  {morphSourceFlow.label} source
                </span>
              ) : null}
              {morphTargetFlow ? (
                <span
                  className="rtm__morph-endpoint"
                  style={{ '--rtm-flow-color': morphTargetFlow.color } as CSSProperties}
                >
                  {morphTargetFlow.label} target
                </span>
              ) : null}
            </span>
          ) : null}
          {midiAssignedCount > 0 ? (
            <Tag type="teal">
              <Music size={12} style={{ marginRight: 4 }} />
              {midiAssignedCount} MIDI
            </Tag>
          ) : null}
        </div>
      </div>

      <Layer>
        <Tabs selectedIndex={activeTab} onChange={({ selectedIndex }) => setActiveTab(selectedIndex)}>
          <TabList aria-label="Routing topology sections" contained>
            <Tab>
              <Flow size={14} style={{ marginRight: 6 }} />
              Topology
            </Tab>
            <Tab>
              <Music size={14} style={{ marginRight: 6 }} />
              MIDI Control
              {midiAssignedCount > 0 ? (
                <Tag type="blue" size="sm">
                  {midiAssignedCount}
                </Tag>
              ) : null}
            </Tab>
          </TabList>
          <TabPanels>
            <TabPanel>{renderTopologyPanel()}</TabPanel>
            <TabPanel>{renderMidiPanel()}</TabPanel>
          </TabPanels>
        </Tabs>
      </Layer>
    </div>
  )
}

export default RoutingTopologyContent
