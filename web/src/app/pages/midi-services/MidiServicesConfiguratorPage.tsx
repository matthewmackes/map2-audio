/**
 * T2499-A follow-on (autonomous-10 + 1, 2026-05-09): Configurator
 * route mount.
 *
 * Hosts the framework's `DevicePackPicker` at
 * `/midi/devices/configurator` and the `MidiLearnModule` fallback at
 * `/midi/devices/configurator/learn`. This is the entry point the
 * Sequencer Setup "Map a MIDI controller" card now deep-links to.
 *
 * Per the slice-3 risk decision, the bespoke MeloAudio Configurator
 * UI continues to own the production HIL surface — picking MeloAudio
 * here navigates to its existing route. Future packs (Maschine,
 * MPX-1, IntelFX, AVDECC) will register against the framework and
 * appear in the picker as they land.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Heading, Layer, Section } from '@carbon/react'

import { DevicePackPicker } from '../../components/DeviceConfigurator/DevicePackPicker'
import {
  MidiLearnModule,
  type BrainSlotChoice,
  type MidiEventSubscriber,
  type MidiLearnSubmission,
} from '../../components/DeviceConfigurator/MidiLearnModule'
import { submitBrainSlotBinding } from '../../components/DeviceConfigurator/bindingsWriter'
import type { ConfiguratorPackDescriptor } from '../../components/DeviceConfigurator/types'
import { meloaudioCommanderPack } from '../../components/DeviceConfigurator/packs/meloaudioCommander'
import { createMidiLearnPollingSubscriber } from '../../components/DeviceConfigurator/midiLearnPollingSubscriber'
import { useToasts } from '../../components/Toasts'

// Cycle 8 / 2026-05-09 — replaces the no-op subscriber with a real
// polling bridge over GET /api/midi/bindings/learn/last-cc.
const DEFAULT_SUBSCRIBER: MidiEventSubscriber = createMidiLearnPollingSubscriber()

/**
 * Minimal seed brain-slot list for the MIDI Learn fallback. Real
 * brain-slot enumeration lands in the next slice (T2499-A
 * follow-on); for now operators get four virtual slots so the
 * MIDI Learn flow is exercisable end-to-end.
 */
const SEED_BRAIN_SLOTS: BrainSlotChoice[] = [
  { id: 'brain-slot-1', label: 'Brain slot 1' },
  { id: 'brain-slot-2', label: 'Brain slot 2' },
  { id: 'brain-slot-3', label: 'Brain slot 3' },
  { id: 'brain-slot-4', label: 'Brain slot 4' },
]

interface MidiServicesConfiguratorPageProps {
  /**
   * Override the registered packs. Defaults to `[meloaudioCommanderPack]`.
   * Tests inject mocks; production callers omit.
   */
  packs?: ConfiguratorPackDescriptor[]
  /**
   * Inject a MIDI Learn event source. Defaults to a polling bridge
   * over GET /api/midi/bindings/learn/last-cc (cycle 8). Tests inject
   * a fake subscriber so they don't depend on the network.
   */
  subscribeToMidiEvents?: MidiEventSubscriber
}

export function MidiServicesConfiguratorPage({
  packs,
  subscribeToMidiEvents = DEFAULT_SUBSCRIBER,
}: MidiServicesConfiguratorPageProps = {}) {
  const navigate = useNavigate()
  const { pushToast } = useToasts()
  const [view, setView] = useState<'picker' | 'learn'>('picker')

  const registeredPacks = useMemo(
    () => packs ?? [meloaudioCommanderPack],
    [packs],
  )

  const handlePickPack = (pack: ConfiguratorPackDescriptor) => {
    const route = pack.metadata?.bespoke_route
    if (typeof route === 'string' && route.length > 0) {
      navigate(route)
      return
    }
    // No bespoke route registered yet — surface a clear message
    // until the pack lands its tabs on the framework shell.
    pushToast(
      `${pack.displayName} has not registered a configurator surface yet.`,
      'warn',
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
        <MidiLearnModule
          brainSlots={SEED_BRAIN_SLOTS}
          subscribeToMidiEvents={subscribeToMidiEvents}
          onSubmit={handleLearnSubmit}
        />
      )}
    </Section>
  )
}
