/**
 * T2499-A follow-on (autonomous-10 + 1, 2026-05-09): Configurator
 * route mount.
 *
 * Hosts the framework's `DevicePackPicker` at
 * `/midi/devices/configurator` and the `MidiLearnModule` fallback at
 * `/midi/devices/configurator/learn`. This is the entry point the
 * Sequencer Setup "Map a MIDI controller" card now deep-links to.
 *
 * Phase 1 of the T2499 mega-epic (2026-05-09):
 *   - Brain slots come from the live sequencer state via
 *     `GET /api/engine/sequencer/slots` (no more 4-slot stub list).
 *   - Pack registry is shared across pages via `packs/index.ts` so
 *     T2499-B (Maschine) and T2499-C (AVDECC) can register without
 *     touching this page.
 *   - The "no configurator surface yet" toast is gone — packs that
 *     don't yet have a frontend descriptor are silently filtered out
 *     of the picker so operators never see unactionable tiles.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Heading, InlineLoading, InlineNotification, Layer, Section } from '@carbon/react'

import { DevicePackPicker } from '../../components/DeviceConfigurator/DevicePackPicker'
import {
  MidiLearnModule,
  type BrainSlotChoice,
  type MidiEventSubscriber,
  type MidiLearnSubmission,
} from '../../components/DeviceConfigurator/MidiLearnModule'
import { submitBrainSlotBinding } from '../../components/DeviceConfigurator/bindingsWriter'
import type { ConfiguratorPackDescriptor } from '../../components/DeviceConfigurator/types'
import {
  listLocalPacks,
  lookupPackDescriptor,
} from '../../components/DeviceConfigurator/packs'
import { createMidiLearnPollingSubscriber } from '../../components/DeviceConfigurator/midiLearnPollingSubscriber'
import { configuratorPacksApi } from '../../../map2/clients/configuratorPacks'
import { sequencerApi } from '../../../map2/clients/sequencer'
import type { SequencerSlot } from '../../../map2/api'
import { useToasts } from '../../components/Toasts'

// Cycle 8 / 2026-05-09 — replaces the no-op subscriber with a real
// polling bridge over GET /api/midi/bindings/learn/last-cc.
const DEFAULT_SUBSCRIBER: MidiEventSubscriber = createMidiLearnPollingSubscriber()

interface BrainSlotQueryResult {
  slots: BrainSlotChoice[]
  isLoading: boolean
  error: Error | null
}

/**
 * Adapter: live `SequencerSlot` from the brain → `BrainSlotChoice`
 * shape the framework Learn module expects. Slots are sorted by
 * `slot_id`. The display label uses 1-based indexing to match the
 * MPX-1 / sequencer surfaces (T041 directive).
 */
function slotsToChoices(slots: SequencerSlot[]): BrainSlotChoice[] {
  return slots
    .slice()
    .sort((a, b) => a.slot_id - b.slot_id)
    .map((slot) => {
      const oneBased = slot.slot_id + 1
      const status =
        slot.asset_type !== 'empty'
          ? `${slot.name || slot.source_label || 'Slot'} (${slot.asset_type})`
          : `Slot ${oneBased} (empty)`
      return {
        id: `brain-slot-${slot.slot_id}`,
        label: `${oneBased.toString().padStart(2, '0')} · ${status}`,
        description:
          slot.asset_path && slot.asset_path.length > 0
            ? slot.asset_path
            : slot.mode,
      }
    })
}

interface MidiServicesConfiguratorPageProps {
  /**
   * Override the registered packs. Defaults to the live
   * frontend pack registry filtered by backend pack-discovery.
   * Tests inject mocks; production callers omit.
   */
  packs?: ConfiguratorPackDescriptor[]
  /**
   * Override the brain-slot list. Defaults to a live query against
   * GET /api/engine/sequencer/slots. Tests inject a fixed list.
   */
  brainSlots?: BrainSlotChoice[]
  /**
   * Inject a MIDI Learn event source. Defaults to a polling bridge
   * over GET /api/midi/bindings/learn/last-cc. Tests inject a fake.
   */
  subscribeToMidiEvents?: MidiEventSubscriber
}

export function MidiServicesConfiguratorPage({
  packs,
  brainSlots,
  subscribeToMidiEvents = DEFAULT_SUBSCRIBER,
}: MidiServicesConfiguratorPageProps = {}) {
  const navigate = useNavigate()
  const { pushToast } = useToasts()
  const [view, setView] = useState<'picker' | 'learn'>('picker')

  // Backend-driven pack discovery. The backend reports which
  // pack_ids are registered + available; the frontend renders only
  // the packs whose descriptors it knows about locally (silent
  // filter for packs missing a descriptor). Falls back to the full
  // local registry if the backend call hasn't resolved yet so the
  // page stays usable in offline tests.
  const packsQuery = useQuery({
    queryKey: ['configurator-packs'],
    queryFn: () => configuratorPacksApi.list(),
    enabled: packs === undefined,
    staleTime: 30_000,
  })

  const registeredPacks = useMemo(() => {
    if (packs !== undefined) return packs
    const backendList = packsQuery.data?.packs
    if (!backendList || backendList.length === 0) {
      return listLocalPacks()
    }
    return backendList
      .map((entry) => lookupPackDescriptor(entry.pack_id))
      .filter((descriptor): descriptor is ConfiguratorPackDescriptor =>
        descriptor !== undefined,
      )
  }, [packs, packsQuery.data])

  // Live brain-slot query — replaces the stub 4-slot list. The
  // backend slot list is 16 entries (slot_ids 0..15) regardless of
  // current snapshot, so MIDI Learn always has every brain slot
  // available as a binding target. Tests pass `brainSlots` directly.
  const slotsQuery: BrainSlotQueryResult = useBrainSlotsQuery(brainSlots)

  const handlePickPack = (pack: ConfiguratorPackDescriptor) => {
    const route = pack.metadata?.bespoke_route
    if (typeof route === 'string' && route.length > 0) {
      navigate(route)
      return
    }
    // No bespoke route on the descriptor and no Configurator tabs
    // either — this would mean the descriptor is malformed. Surface
    // a clear error rather than silently doing nothing.
    pushToast(
      `${pack.displayName} descriptor is incomplete (no bespoke_route or tabs).`,
      'error',
    )
  }

  const handleLearnSubmit = async (submission: MidiLearnSubmission) => {
    const result = await submitBrainSlotBinding(submission)
    pushToast(
      result.duplicate
        ? `Already bound: ${submission.slot.label}`
        : `Bound ${submission.slot.label} to ${submission.event.status} ch${submission.event.channel} data1=${submission.event.data1}`,
      'success',
    )
  }

  return (
    <Section
      className="midi-services-configurator"
      data-testid="midi-services-configurator"
    >
      <Layer level={0}>
        <header className="midi-services-configurator__header">
          <Heading className="midi-services-configurator__title">
            Map a MIDI controller
          </Heading>
          <p className="midi-services-configurator__subtitle">
            Pick a recognised device-pack to launch its onboarding flow, or
            bind any controller via MIDI Learn.
          </p>
        </header>
      </Layer>

      {view === 'picker' ? (
        <DevicePackPicker
          packs={registeredPacks}
          onPick={handlePickPack}
          onPickMidiLearn={() => setView('learn')}
        />
      ) : (
        <BrainSlotLearnView
          slotsQuery={slotsQuery}
          subscribeToMidiEvents={subscribeToMidiEvents}
          onSubmit={handleLearnSubmit}
          onBack={() => setView('picker')}
        />
      )}
    </Section>
  )
}

interface BrainSlotLearnViewProps {
  slotsQuery: BrainSlotQueryResult
  subscribeToMidiEvents: MidiEventSubscriber
  onSubmit: (submission: MidiLearnSubmission) => void | Promise<void>
  onBack: () => void
}

function BrainSlotLearnView({
  slotsQuery,
  subscribeToMidiEvents,
  onSubmit,
}: BrainSlotLearnViewProps) {
  if (slotsQuery.isLoading) {
    return (
      <div className="midi-services-configurator__loading" data-testid="brain-slots-loading">
        <InlineLoading status="active" description="Loading brain slots…" />
      </div>
    )
  }
  if (slotsQuery.error) {
    return (
      <InlineNotification
        kind="error"
        lowContrast
        hideCloseButton
        title="Failed to load brain slots"
        subtitle={slotsQuery.error.message}
      />
    )
  }
  if (slotsQuery.slots.length === 0) {
    return (
      <InlineNotification
        kind="warning"
        lowContrast
        hideCloseButton
        title="No brain slots available"
        subtitle="The sequencer has not initialised any slots yet — open a snapshot first."
      />
    )
  }
  return (
    <MidiLearnModule
      brainSlots={slotsQuery.slots}
      subscribeToMidiEvents={subscribeToMidiEvents}
      onSubmit={onSubmit}
    />
  )
}

function useBrainSlotsQuery(
  injected: BrainSlotChoice[] | undefined,
): BrainSlotQueryResult {
  const query = useQuery({
    queryKey: ['configurator', 'brain-slots'],
    queryFn: () => sequencerApi.getSlots(),
    enabled: injected === undefined,
    staleTime: 5_000,
  })
  if (injected !== undefined) {
    return { slots: injected, isLoading: false, error: null }
  }
  return {
    slots: query.data ? slotsToChoices(query.data) : [],
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error : null,
  }
}

export { slotsToChoices }
