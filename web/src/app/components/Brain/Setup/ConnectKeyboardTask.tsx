import { Button, ComposedModal, ModalBody, ModalFooter, ModalHeader, Tile } from '@carbon/react'
import { ArrowLeft, ArrowRight, Close } from '@carbon/icons-react'
import { useCallback, useMemo, useState } from 'react'

import { StatusChip } from '../../primitives'
import {
  CONNECT_KEYBOARD_PHASES,
  PHASE_INDEX,
  isBackDisabled,
  shouldConfirmOnExit,
  type ConnectKeyboardPhaseId,
} from './connectKeyboardPhases'
import { useKeyboardDetectionList } from './useKeyboardDetectionList'
import { ConnectKeyboardWelcomePhase } from './ConnectKeyboardWelcomePhase'
import { ConnectKeyboardDetectPhase } from './ConnectKeyboardDetectPhase'
import { ConnectKeyboardTestPhase } from './ConnectKeyboardTestPhase'
import { ConnectKeyboardSnapshotPhase } from './ConnectKeyboardSnapshotPhase'
import { ConnectKeyboardDonePhase } from './ConnectKeyboardDonePhase'
import { useConnectKeyboardSnapshotJob } from './useConnectKeyboardSnapshotJob'
import './connectKeyboardTask.css'

interface ConnectKeyboardTaskProps {
  onExit: () => void
}

type PhaseTone = 'live' | 'staged' | 'committed' | 'neutral'

function phaseTone(currentIndex: number, phaseIndex: number): PhaseTone {
  if (phaseIndex < currentIndex) return 'committed'
  if (phaseIndex === currentIndex) return 'staged'
  return 'neutral'
}

function phaseToneLabel(tone: PhaseTone): string {
  if (tone === 'committed') return 'Done'
  if (tone === 'staged') return 'Active'
  return 'Pending'
}

export function ConnectKeyboardTask({ onExit }: ConnectKeyboardTaskProps) {
  const [currentPhaseId, setCurrentPhaseId] = useState<ConnectKeyboardPhaseId>('welcome')
  const [selectedPortName, setSelectedPortName] = useState<string | null>(null)
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false)

  const currentIndex = PHASE_INDEX[currentPhaseId]
  const totalPhaseCount = CONNECT_KEYBOARD_PHASES.length

  const detection = useKeyboardDetectionList({
    enabled: currentPhaseId === 'detect' || currentPhaseId === 'test',
  })

  const job = useConnectKeyboardSnapshotJob()

  const setupAnother = useCallback(() => {
    setCurrentPhaseId('welcome')
    setSelectedPortName(null)
    setSelectedDeviceId(null)
    job.reset()
  }, [job])

  const handleSelectDevice = useCallback((portName: string) => {
    setSelectedPortName(portName)
    // Look up the matching detection entry to capture its device_id (when
    // the entry is onboarded; raw "New" entries leave deviceId null).
    const match = detection.entries.find((e) => e.port_name === portName)
    if (match && match.source === 'onboarded') {
      setSelectedDeviceId(match.device_id)
    } else {
      setSelectedDeviceId(null)
    }
  }, [detection.entries])

  const requestExit = useCallback(() => {
    if (shouldConfirmOnExit(currentPhaseId)) {
      setExitConfirmOpen(true)
    } else {
      onExit()
    }
  }, [currentPhaseId, onExit])

  const confirmExit = useCallback(() => {
    setExitConfirmOpen(false)
    onExit()
  }, [onExit])

  const goNext = useCallback(() => {
    const nextIndex = currentIndex + 1
    if (nextIndex >= totalPhaseCount) return
    setCurrentPhaseId(CONNECT_KEYBOARD_PHASES[nextIndex]!.id)
  }, [currentIndex, totalPhaseCount])

  const goBack = useCallback(() => {
    if (isBackDisabled(currentPhaseId)) return
    const prevIndex = currentIndex - 1
    if (prevIndex < 0) return
    setCurrentPhaseId(CONNECT_KEYBOARD_PHASES[prevIndex]!.id)
  }, [currentIndex, currentPhaseId])

  const continueDisabled = useMemo(() => {
    if (currentPhaseId === 'detect') return selectedPortName === null
    if (currentPhaseId === 'snapshot') return true
    if (currentPhaseId === 'done') return true
    return false
  }, [currentPhaseId, selectedPortName])

  const continueLabel = useMemo(() => {
    if (currentIndex === totalPhaseCount - 1) return 'Finish'
    if (currentPhaseId === 'snapshot') return 'Continue'
    return 'Continue'
  }, [currentIndex, currentPhaseId, totalPhaseCount])

  const backDisabled = isBackDisabled(currentPhaseId) || currentIndex === 0

  return (
    <div className="connect-keyboard-task">
      <div className="connect-keyboard-task__header">
        <Button
          kind="ghost"
          size="sm"
          renderIcon={ArrowLeft}
          onClick={requestExit}
        >
          Setup tasks
        </Button>
        <div className="connect-keyboard-task__title-block">
          <div className="connect-keyboard-task__eyebrow">SETUP TASK</div>
          <h2 className="connect-keyboard-task__title">Connect a new keyboard</h2>
        </div>
      </div>

      <ol className="connect-keyboard-task__phase-list-rail" aria-label="Setup task phases">
        {CONNECT_KEYBOARD_PHASES.map((phase, index) => {
          const tone = phaseTone(currentIndex, index)
          const toneLabel = phaseToneLabel(tone)
          const isActive = index === currentIndex
          return (
            <li key={phase.id} className="connect-keyboard-task__phase-list-item">
              <Tile
                className={
                  'connect-keyboard-task__phase-tile' +
                  (isActive ? ' connect-keyboard-task__phase-tile--active' : '') +
                  (tone === 'committed' ? ' connect-keyboard-task__phase-tile--done' : '')
                }
              >
                <div className="connect-keyboard-task__phase-tile-head">
                  <div className="connect-keyboard-task__phase-tile-ordinal">
                    {phase.ordinal}
                  </div>
                  <div className="connect-keyboard-task__phase-tile-title">
                    {phase.title}
                  </div>
                  <StatusChip tone={tone} size="sm" label={toneLabel} />
                </div>
                <div className="connect-keyboard-task__phase-tile-description">
                  {phase.description}
                </div>
              </Tile>
            </li>
          )
        })}
      </ol>

      <section
        className="connect-keyboard-task__active-phase"
        aria-label={`Active phase: ${CONNECT_KEYBOARD_PHASES[currentIndex]!.title}`}
      >
        <div className="connect-keyboard-task__phase-eyebrow">
          PHASE {CONNECT_KEYBOARD_PHASES[currentIndex]!.ordinal} OF {totalPhaseCount}
        </div>
        {currentPhaseId === 'welcome' ? (
          <ConnectKeyboardWelcomePhase totalPhaseCount={totalPhaseCount} />
        ) : null}
        {currentPhaseId === 'detect' ? (
          <ConnectKeyboardDetectPhase
            entries={detection.entries}
            isLoading={detection.isLoading}
            error={detection.error}
            onRescan={detection.refetch}
            selectedPortName={selectedPortName}
            onSelect={handleSelectDevice}
          />
        ) : null}
        {currentPhaseId === 'test' ? (
          <ConnectKeyboardTestPhase selectedPortName={selectedPortName} />
        ) : null}
        {currentPhaseId === 'snapshot' ? (
          <ConnectKeyboardSnapshotPhase
            selectedPortName={selectedPortName}
            selectedDeviceId={selectedDeviceId}
            job={job}
            onAdvance={() => setCurrentPhaseId('done')}
          />
        ) : null}
        {currentPhaseId === 'done' ? (
          <ConnectKeyboardDonePhase
            selectedPortName={selectedPortName}
            result={job.result}
            onSetupAnother={setupAnother}
          />
        ) : null}
      </section>

      <footer className="connect-keyboard-task__footer">
        <Button kind="ghost" renderIcon={Close} onClick={requestExit}>
          Cancel
        </Button>
        <div className="connect-keyboard-task__footer-spacer" />
        <Button
          kind="secondary"
          renderIcon={ArrowLeft}
          onClick={goBack}
          disabled={backDisabled}
        >
          Back
        </Button>
        <Button
          kind="primary"
          renderIcon={ArrowRight}
          onClick={goNext}
          disabled={continueDisabled}
        >
          {continueLabel}
        </Button>
      </footer>

      {exitConfirmOpen ? (
        <ComposedModal
          open
          onClose={() => setExitConfirmOpen(false)}
          size="sm"
          aria-label="Exit setup task confirmation"
        >
          <ModalHeader title="Exit the setup task?" />
          <ModalBody>
            <p>
              Your progress on this task will be lost. Phases you have already completed
              up to this point will not be undone, but the unfinished work in the active
              phase will be discarded.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button kind="secondary" onClick={() => setExitConfirmOpen(false)}>
              Keep going
            </Button>
            <Button kind="danger" onClick={confirmExit}>
              Exit task
            </Button>
          </ModalFooter>
        </ComposedModal>
      ) : null}
    </div>
  )
}
