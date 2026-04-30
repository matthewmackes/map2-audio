// SnapshotEditor routing-modal aggregate (T2473 part 19).
// Bundles two parent-driven modal mounts that each control a
// piece of routing UX: the automation lane picker and the
// per-flow audio port selector. State and callbacks remain
// parent-owned; this aggregate is purely declarative wiring.

import type { AutomationLane } from '../../grid/shared'

import { JuceGridAudioPortModal } from '../../components/modals/JuceGridAudioPortModal'
import {
  SnapshotEditorLanePicker,
  type LanePickerChain,
} from './SnapshotEditorLanePicker'

export interface SnapshotEditorRoutingModalsProps {
  // Lane Picker
  lanePickerOpen: boolean
  lanePickerChain: LanePickerChain | null | undefined
  lanePickerExistingLaneCount: number
  onCloseLanePicker: () => void
  onAddLane: (lane: AutomationLane) => void

  // Audio Port Selector — gated by `portSelectorOpen`. The four
  // chainId / flowLabel / flowColor / readOnly fields are still
  // resolved parent-side because they depend on the parent's
  // flow-scoped state machinery (portSelectorFlowIndex, flowSlots,
  // SLOT_COLORS, snapshotEditorMutationDisabled).
  portSelectorOpen: boolean
  portSelectorChainId: number | null | undefined
  portSelectorFlowLabel: string | undefined
  portSelectorFlowColor: string | undefined
  portSelectorReadOnly: boolean
  onClosePortSelector: () => void
  onPortsChange: () => void
}

export function SnapshotEditorRoutingModals({
  lanePickerOpen,
  lanePickerChain,
  lanePickerExistingLaneCount,
  onCloseLanePicker,
  onAddLane,
  portSelectorOpen,
  portSelectorChainId,
  portSelectorFlowLabel,
  portSelectorFlowColor,
  portSelectorReadOnly,
  onClosePortSelector,
  onPortsChange,
}: SnapshotEditorRoutingModalsProps) {
  return (
    <>
      <SnapshotEditorLanePicker
        open={lanePickerOpen}
        currentChain={lanePickerChain}
        existingLaneCount={lanePickerExistingLaneCount}
        onClose={onCloseLanePicker}
        onAddLane={onAddLane}
      />
      <JuceGridAudioPortModal
        open={portSelectorOpen}
        onClose={onClosePortSelector}
        chainId={portSelectorChainId}
        flowLabel={portSelectorFlowLabel}
        flowColor={portSelectorFlowColor}
        readOnly={portSelectorReadOnly}
        onPortsChange={onPortsChange}
      />
    </>
  )
}
