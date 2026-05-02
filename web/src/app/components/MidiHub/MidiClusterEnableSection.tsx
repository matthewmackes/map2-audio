/**
 * T2486-1 — MIDI cluster enable section.
 *
 * Carbon-styled section rendered at the top of MidiServicesNetworkPage.
 * Shows the current cluster MIDI gate state (enabled + auto_connect)
 * and exposes the coupled-flip modal: turning the master switch on
 * prompts for auto-connect; turning it off skips the modal and writes
 * directly. Off → On is operator-confirmed; On → Off is one-click.
 *
 * Per the locked T2486 Q decisions:
 *   - Schema defaults stay False/False (fail-closed posture preserved)
 *   - Operator opt-in via this modal is the canonical path to ON
 *   - When enabled=true ∧ auto_connect=false, an info notification
 *     appears (T2486-2 handles that surface).
 */

import { useEffect, useState } from 'react'
import { Heading, InlineNotification, Layer, Section, Tag, Toggle } from '@carbon/react'

import { useMidiClusterSettings } from '../../hooks/useMidiClusterSettings'
import { MidiClusterEnableModal } from './MidiClusterEnableModal'
import './MidiClusterEnableSection.css'

const DISMISS_KEY = 'midi-cluster-auto-connect-off-advisory-dismissed'

export function MidiClusterEnableSection() {
  const { settings, isLoading, update, isUpdating } = useMidiClusterSettings()
  const [modalOpen, setModalOpen] = useState(false)

  // T2486-2 — per-session dismissibility for the auto-connect-off advisory.
  // sessionStorage (not localStorage): operator dismisses for this session
  // only; the next session brings it back so the asymmetric state remains
  // discoverable.
  const [advisoryDismissed, setAdvisoryDismissed] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      setAdvisoryDismissed(window.sessionStorage.getItem(DISMISS_KEY) === '1')
    } catch {
      setAdvisoryDismissed(false)
    }
  }, [])

  const enabled = settings?.enabled ?? false
  const autoConnect = settings?.auto_connect ?? false
  const advisoryActive = enabled && !autoConnect && !advisoryDismissed

  const handleToggle = async (next: boolean) => {
    if (next) {
      // Off → On: open the coupled-flip modal.
      setModalOpen(true)
    } else {
      // On → Off: write directly. Auto-connect stays whatever it was;
      // turning the master switch off makes auto_connect a no-op anyway.
      try {
        await update({ enabled: false })
      } catch (err) {
        // Surfacing handled by Carbon's default error UX in next iter.
        // eslint-disable-next-line no-console
        console.error('Failed to disable cluster MIDI:', err)
      }
    }
  }

  const handleModalConfirm = async ({
    enableCluster,
    enableAutoConnect,
  }: {
    enableCluster: true
    enableAutoConnect: boolean
  }) => {
    try {
      await update({
        enabled: enableCluster,
        auto_connect: enableAutoConnect,
      })
      setModalOpen(false)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to enable cluster MIDI:', err)
    }
  }

  return (
    <Section className="midi-cluster-enable">
      <Layer level={1}>
        <header className="midi-cluster-enable__header">
          <Heading className="midi-cluster-enable__title">Cluster MIDI</Heading>
          <div className="midi-cluster-enable__tags">
            <Tag type={enabled ? 'green' : 'gray'} size="sm">
              {enabled ? 'Enabled' : 'Disabled'}
            </Tag>
            {enabled ? (
              <Tag type={autoConnect ? 'green' : 'magenta'} size="sm">
                {autoConnect ? 'Auto-connect on' : 'Auto-connect off'}
              </Tag>
            ) : null}
          </div>
        </header>
        <p className="midi-cluster-enable__description">
          Share MIDI traffic across MAP2 nodes via RTP-MIDI. mDNS discovery
          finds peers; with auto-connect on, local outputs auto-pair with
          discovered peer inputs on every <code>midi.node.discovered</code>{' '}
          event. Defaults are fail-closed; both gates stay off until you opt
          in here.
        </p>
        <div className="midi-cluster-enable__toggle">
          <Toggle
            id="midi-cluster-enabled"
            labelText="Cluster MIDI"
            labelA="Off"
            labelB="On"
            toggled={enabled}
            disabled={isLoading || isUpdating}
            onToggle={handleToggle}
          />
        </div>
        {advisoryActive ? (
          <div className="midi-cluster-enable__advisory" data-testid="midi-cluster-advisory">
            <InlineNotification
              kind="info"
              lowContrast
              title="Cluster MIDI is enabled but auto-connect is off"
              subtitle="Peer MIDI ports require manual pairing from the cluster bindings matrix. Turn the advisory off to dismiss for this session."
              onCloseButtonClick={() => {
                setAdvisoryDismissed(true)
                if (typeof window !== 'undefined') {
                  try {
                    window.sessionStorage.setItem(DISMISS_KEY, '1')
                  } catch {
                    // sessionStorage full or denied — silent fallback.
                  }
                }
              }}
            />
          </div>
        ) : null}
      </Layer>

      <MidiClusterEnableModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={handleModalConfirm}
      />
    </Section>
  )
}

export default MidiClusterEnableSection
