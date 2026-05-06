import './DeviceContextDialog.css'

import { useEffect, useReducer, useRef } from 'react'
import {
  Button,
  InlineLoading,
  InlineNotification,
  Modal,
  ProgressIndicator,
  ProgressStep,
  Tag,
} from '@carbon/react'
import { ErrorFilled, Information, Renew, WarningAlt } from '@carbon/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { useDeviceNodeContext } from '../../hooks/useDeviceNodeContext'
import { useCluster } from '../../contexts/useCluster'
import type {
  DeviceIssue,
  DeviceIssueSeverity,
  DeviceKey,
  SwitchProgressState,
  SwitchStep,
} from './deviceContextTypes'
import { SWITCH_STEPS, SWITCH_STEP_LABELS } from './deviceContextTypes'

// ── State machine ─────────────────────────────────────────────────────────────

type SwitchAction =
  | { type: 'START_SWITCH'; targetNodeId: string }
  | { type: 'ADVANCE_STEP' }
  | { type: 'FAIL'; failedStep: SwitchStep; errorDetail: string }
  | { type: 'RESET' }

const initialSwitchState: SwitchProgressState = {
  active: false,
  currentStep: 'initiating',
  completedSteps: [],
  failedStep: null,
  errorDetail: null,
  targetNodeId: null,
}

function switchReducer(state: SwitchProgressState, action: SwitchAction): SwitchProgressState {
  switch (action.type) {
    case 'START_SWITCH':
      return {
        active: true,
        currentStep: 'initiating',
        completedSteps: [],
        failedStep: null,
        errorDetail: null,
        targetNodeId: action.targetNodeId,
      }
    case 'ADVANCE_STEP': {
      const currentIndex = SWITCH_STEPS.indexOf(state.currentStep as Exclude<SwitchStep, 'failed'>)
      const nextStep = SWITCH_STEPS[currentIndex + 1] ?? 'ready'
      return {
        ...state,
        completedSteps: [...state.completedSteps, state.currentStep as Exclude<SwitchStep, 'failed'>],
        currentStep: nextStep,
      }
    }
    case 'FAIL':
      return {
        ...state,
        currentStep: 'failed',
        failedStep: action.failedStep,
        errorDetail: action.errorDetail,
      }
    case 'RESET':
      return initialSwitchState
    default:
      return state
  }
}

// ── Progress step index helpers ───────────────────────────────────────────────

function stepIndex(step: SwitchStep): number {
  const idx = SWITCH_STEPS.indexOf(step as Exclude<SwitchStep, 'failed'>)
  return idx === -1 ? 0 : idx
}

// ── Issue icon ────────────────────────────────────────────────────────────────

function IssueIcon({ severity }: { severity: DeviceIssueSeverity }) {
  switch (severity) {
    case 'error':
      return <ErrorFilled size={16} aria-hidden="true" />
    case 'warning':
      return <WarningAlt size={16} aria-hidden="true" />
    default:
      return <Information size={16} aria-hidden="true" />
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface DeviceContextDialogProps {
  open: boolean
  onClose: () => void
  deviceName: string
  deviceKey: DeviceKey | DeviceKey[]
  onRequestReassign?: (targetNodeId: string) => void
  onRequestRediscovery?: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DeviceContextDialog({
  open,
  onClose,
  deviceName,
  deviceKey,
  onRequestReassign,
  onRequestRediscovery,
}: DeviceContextDialogProps) {
  const queryClient = useQueryClient()
  const { setActiveNode } = useCluster()
  const { deviceState, issues, targetNode, allNodesWithDevice, canSwitch } = useDeviceNodeContext(deviceKey)

  const [switchState, dispatch] = useReducer(switchReducer, initialSwitchState)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const failTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rediscoveryQueryRef = useRef(false)

  // Reset state machine when dialog closes
  useEffect(() => {
    if (!open) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (failTimeoutRef.current) clearTimeout(failTimeoutRef.current)
      dispatch({ type: 'RESET' })
      rediscoveryQueryRef.current = false
    }
  }, [open])

  // Watch deviceState: if it becomes 'ready' while switching, advance to ready
  useEffect(() => {
    if (switchState.active && switchState.currentStep !== 'failed' && deviceState === 'ready') {
      dispatch({ type: 'ADVANCE_STEP' }) // move to authenticating or ready
    }
  }, [deviceState, switchState.active, switchState.currentStep])

  // Auto-close after reaching 'ready'
  useEffect(() => {
    if (switchState.currentStep === 'ready') {
      timeoutRef.current = setTimeout(() => {
        onClose()
        dispatch({ type: 'RESET' })
      }, 800)
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [switchState.currentStep, onClose])

  function handleSwitch() {
    if (!targetNode) return
    const targetId = targetNode.nodeId

    dispatch({ type: 'START_SWITCH', targetNodeId: targetId })

    // Perform the actual context switch immediately (synchronous)
    setActiveNode(targetId)

    // Force inventory refresh
    void queryClient.invalidateQueries({ queryKey: ['cluster', 'hardware-inventory'] })

    // Simulate progress: initiating → connecting after 350ms
    timeoutRef.current = setTimeout(() => {
      dispatch({ type: 'ADVANCE_STEP' })
      // connecting → authenticating after another 500ms
      timeoutRef.current = setTimeout(() => {
        dispatch({ type: 'ADVANCE_STEP' })
      }, 500)
    }, 350)

    // Fail-safe timeout: if still not ready after 8 seconds, surface an error
    failTimeoutRef.current = setTimeout(() => {
      dispatch({
        type: 'FAIL',
        failedStep: 'authenticating',
        errorDetail: `Context was switched to ${targetNode.hostname} but the device was not confirmed within the expected time. Verify that ${targetNode.hostname} is online and the device is connected.`,
      })
    }, 8000)
  }

  function handleRetry() {
    dispatch({ type: 'RESET' })
  }

  function handleRediscovery() {
    rediscoveryQueryRef.current = true
    void queryClient.invalidateQueries({ queryKey: ['cluster', 'hardware-inventory'] })
    onRequestRediscovery?.()
  }

  // Determine primary/secondary button text and actions based on state
  const isSwitching = switchState.active && switchState.currentStep !== 'failed' && switchState.currentStep !== 'ready'
  const isFailed = switchState.currentStep === 'failed'
  const isSuccess = switchState.currentStep === 'ready'

  const primaryButtonText = isFailed ? 'Retry' : canSwitch ? 'Switch Context' : 'Close'
  const primaryButtonDisabled = isSwitching || isSuccess

  function handlePrimary() {
    if (isFailed) {
      handleRetry()
    } else if (canSwitch) {
      handleSwitch()
    } else {
      onClose()
    }
  }

  // ── Issue list rendering ──────────────────────────────────────────────────

  function renderIssueList(issueList: DeviceIssue[]) {
    if (issueList.length === 0) return null
    return (
      <div className="device-context-dialog__issue-list">
        {issueList.map((issue) => (
          <div key={issue.id} className="device-context-dialog__issue-row">
            <span className={`device-context-dialog__issue-icon device-context-dialog__issue-icon--${issue.severity}`}>
              <IssueIcon severity={issue.severity} />
            </span>
            <div className="device-context-dialog__issue-content">
              <p className="device-context-dialog__issue-title">{issue.title}</p>
              <p className="device-context-dialog__issue-detail">{issue.detail}</p>
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ── Progress rendering ────────────────────────────────────────────────────

  function renderProgress() {
    const currentIdx = stepIndex(switchState.currentStep)
    return (
      <div className="device-context-dialog__progress-area">
        <p className="device-context-dialog__progress-label">
          Switching managing context to {targetNode?.hostname ?? switchState.targetNodeId}…
        </p>
        <ProgressIndicator vertical currentIndex={currentIdx}>
          {SWITCH_STEPS.map((step) => (
            <ProgressStep
              key={step}
              label={SWITCH_STEP_LABELS[step]}
            />
          ))}
        </ProgressIndicator>
      </div>
    )
  }

  // ── Error rendering ───────────────────────────────────────────────────────

  function renderError() {
    return (
      <div className="device-context-dialog__error-area">
        <InlineNotification
          kind="error"
          lowContrast
          hideCloseButton
          title={`Failed at: ${switchState.failedStep ? SWITCH_STEP_LABELS[switchState.failedStep] : 'unknown step'}`}
          subtitle={switchState.errorDetail ?? 'An unexpected error occurred during the context switch.'}
        />
      </div>
    )
  }

  // ── Cluster actions rendering ─────────────────────────────────────────────

  function renderClusterActions() {
    if (isSwitching || isSuccess) return null
    return (
      <div className="device-context-dialog__cluster-actions">
        <p className="device-context-dialog__cluster-actions-title">Cluster device actions</p>

        {allNodesWithDevice.length > 0 ? (
          <>
            <p className="device-context-dialog__issue-detail" style={{ marginBottom: 'var(--cds-spacing-03)' }}>
              Nodes where this device is visible:
            </p>
            <div className="device-context-dialog__node-list">
              {allNodesWithDevice.map((loc) => (
                <div key={`${loc.nodeId}-${loc.kind}`} className="device-context-dialog__node-row">
                  <span className="device-context-dialog__node-hostname">{loc.hostname}</span>
                  <span className="device-context-dialog__node-kind">
                    <Tag size="sm" type="cool-gray">{loc.kind.replace('_', ' ')}</Tag>
                  </span>
                  <Button
                    kind="ghost"
                    size="sm"
                    onClick={() => {
                      setActiveNode(loc.nodeId)
                      onClose()
                    }}
                  >
                    Switch here
                  </Button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="device-context-dialog__issue-detail">
            No nodes are currently reporting this device.
          </p>
        )}

        {onRequestReassign && targetNode && (
          <Button
            kind="tertiary"
            size="sm"
            style={{ marginBottom: 'var(--cds-spacing-03)' }}
            onClick={() => {
              onRequestReassign(targetNode.nodeId)
              onClose()
            }}
          >
            Reassign device to current node
          </Button>
        )}

        <div className="device-context-dialog__rediscovery-row">
          <Button
            kind="ghost"
            size="sm"
            renderIcon={Renew}
            onClick={handleRediscovery}
          >
            Trigger rediscovery
          </Button>
          {rediscoveryQueryRef.current ? (
            <InlineLoading description="Scanning cluster…" status="active" />
          ) : null}
        </div>
      </div>
    )
  }

  // ── Modal body ────────────────────────────────────────────────────────────

  function renderBody() {
    if (isSuccess) {
      return (
        <InlineNotification
          kind="success"
          lowContrast
          hideCloseButton
          title="Context switched"
          subtitle={`Now managing ${targetNode?.hostname ?? 'the node'}. This dialog will close automatically.`}
        />
      )
    }
    if (isFailed) {
      return (
        <div className="device-context-dialog__body">
          {renderError()}
          {renderClusterActions()}
        </div>
      )
    }
    if (isSwitching) {
      return renderProgress()
    }
    // Idle: show issues + cluster actions
    return (
      <div className="device-context-dialog__body">
        {renderIssueList(issues)}
        {renderClusterActions()}
      </div>
    )
  }

  return (
    <Modal
      open={open}
      size="sm"
      modalHeading={`${deviceName} — Device Context`}
      modalLabel="Cluster device management"
      primaryButtonText={primaryButtonText}
      primaryButtonDisabled={primaryButtonDisabled}
      secondaryButtonText={isSwitching || isSuccess ? undefined : 'Cancel'}
      onRequestClose={isSwitching ? undefined : onClose}
      onSecondarySubmit={onClose}
      onRequestSubmit={handlePrimary}
      preventCloseOnClickOutside={isSwitching}
    >
      {renderBody()}
    </Modal>
  )
}
