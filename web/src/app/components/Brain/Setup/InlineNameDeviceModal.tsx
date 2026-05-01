// Inline "name this device" modal — opens when the operator clicks
// Continue from Detect with a "New" port selected (T2480 Follow-up D,
// 2026-05-01).
//
// Behavior: operator types a friendly name, modal validates, on Submit
// it (1) upserts a custom device profile via midiHubApi.upsertDeviceProfile,
// (2) assigns the port to the new profile via midiHubApi.assignDevicePort,
// (3) returns the resulting device_id to the caller. Caller refreshes the
// detection list so the device shows up as onboarded on the next render.

import {
  Button,
  ComposedModal,
  InlineLoading,
  InlineNotification,
  ModalBody,
  ModalFooter,
  ModalHeader,
  TextInput,
} from '@carbon/react'
import { useEffect, useState } from 'react'

import { midiHubApi } from '@/map2/clients/midiHub'
import {
  buildMatchPatterns,
  slugifyProfileId,
  stripGenericPrefix,
  validateDeviceName,
} from './onboardingHelpers'

interface InlineNameDeviceModalProps {
  open: boolean
  portName: string
  genericDeviceId: string
  /** Suggested initial value — typically the ALSA port name. */
  suggestedName?: string
  onCancel: () => void
  onSuccess: (result: { profileId: string; deviceId: string; displayName: string }) => void
}

export function InlineNameDeviceModal({
  open,
  portName,
  genericDeviceId,
  suggestedName,
  onCancel,
  onSuccess,
}: InlineNameDeviceModalProps) {
  const [name, setName] = useState(suggestedName ?? portName)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Reset state when the modal opens for a new device.
  useEffect(() => {
    if (open) {
      setName(suggestedName ?? portName)
      setSubmitting(false)
      setSubmitError(null)
    }
  }, [open, suggestedName, portName])

  const validationError = validateDeviceName(name)
  const computedProfileId = slugifyProfileId(name)
  const fallbackProfileId = stripGenericPrefix(genericDeviceId) || computedProfileId

  const handleSubmit = async () => {
    if (validationError !== null) return
    setSubmitting(true)
    setSubmitError(null)
    const trimmed = name.trim()
    const profileId = computedProfileId === 'unnamed_device' ? fallbackProfileId : computedProfileId
    try {
      await midiHubApi.upsertDeviceProfile({
        profile_id: profileId,
        name: trimmed,
        match_patterns: buildMatchPatterns(trimmed, portName),
        default_channel: 0,
        supports_sysex: false,
        metadata: { onboarded_via: 'brain-setup-task' },
      })
      // Pin this port to the new profile so the next refresh emits the
      // device under its real profile_id rather than under
      // generic_controller. Device id format: "<profile_id>:<port-slug>".
      const slug = slugifyProfileId(portName)
      const newDeviceId = `${profileId}:${slug}`
      await midiHubApi.assignDevicePort({
        port_name: portName,
        device_id: newDeviceId,
      })
      onSuccess({ profileId, deviceId: newDeviceId, displayName: trimmed })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setSubmitError(message)
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <ComposedModal
      open
      onClose={() => {
        if (!submitting) onCancel()
      }}
      size="sm"
      aria-label="Name this MIDI device"
    >
      <ModalHeader title="Name this device" label={`Port: ${portName}`} />
      <ModalBody hasForm>
        <p className="connect-keyboard-task__phase-paragraph">
          This port hasn't been onboarded yet. Give it a friendly name so
          it shows up correctly in MIDI Hub and can be re-bound later
          without re-running this task.
        </p>
        <TextInput
          id="inline-name-device-input"
          labelText="Display name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          invalid={Boolean(validationError) && name !== ''}
          invalidText={validationError ?? ''}
          disabled={submitting}
          autoFocus
        />
        <p className="connect-keyboard-task__detect-row-sub" style={{ marginTop: 'var(--cds-spacing-03)' }}>
          Profile id: {computedProfileId}
        </p>
        {submitError ? (
          <InlineNotification
            kind="error"
            title="Could not save profile"
            subtitle={submitError}
            hideCloseButton
            lowContrast
            style={{ marginTop: 'var(--cds-spacing-04)' }}
          />
        ) : null}
      </ModalBody>
      <ModalFooter>
        <Button kind="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        {submitting ? (
          <InlineLoading description="Saving…" />
        ) : (
          <Button
            kind="primary"
            onClick={() => void handleSubmit()}
            disabled={validationError !== null}
          >
            Save and continue
          </Button>
        )}
      </ModalFooter>
    </ComposedModal>
  )
}
