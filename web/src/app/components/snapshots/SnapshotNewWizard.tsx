import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  InlineLoading,
  RadioButton,
  RadioButtonGroup,
  Select,
  SelectItem,
  TextInput,
} from '@carbon/react'
import { pipewireApi } from '../../../map2/api'
import type { PipeWireDeviceInfo } from '../../../map2/types'

export type SnapshotNewWizardRoutingMode = 'parallel_blend' | 'series' | 'morph' | 'sidechain'

export interface SnapshotNewWizardValues {
  name: string
  routingMode: SnapshotNewWizardRoutingMode
  inputDevice: string | null
  outputDevice: string | null
}

interface SnapshotNewWizardProps {
  existingSnapshotNames: string[]
  initialName: string
  isSubmitting?: boolean
  onCancel: () => void
  onSubmit: (values: SnapshotNewWizardValues) => Promise<void> | void
}

const NAME_PATTERN = /^[A-Za-z0-9 -]+$/

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function validateSnapshotName(name: string, existingSnapshotNames: string[]): string | null {
  const normalized = normalizeName(name)
  if (normalized.length === 0) {
    return 'Name is required.'
  }
  if (normalized.length > 20) {
    return 'Name must be 20 characters or fewer.'
  }
  if (!NAME_PATTERN.test(normalized)) {
    return 'Use letters, numbers, spaces, and hyphens only.'
  }
  if (existingSnapshotNames.some((entry) => normalizeName(entry).toLowerCase() === normalized.toLowerCase())) {
    return 'A snapshot with that name already exists.'
  }
  return null
}

function getDeviceLabel(device: PipeWireDeviceInfo): string {
  return device.nick || device.name || `Device ${device.id}`
}

export function SnapshotNewWizard({
  existingSnapshotNames,
  initialName,
  isSubmitting = false,
  onCancel,
  onSubmit,
}: SnapshotNewWizardProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [name, setName] = useState(initialName)
  const [routingMode, setRoutingMode] = useState<SnapshotNewWizardRoutingMode>('parallel_blend')
  const [inputDevice, setInputDevice] = useState<string | null>(null)
  const [outputDevice, setOutputDevice] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)

  const devicesQuery = useQuery({
    queryKey: ['pipewire', 'devices', 'snapshot-wizard'],
    queryFn: () => pipewireApi.getDevices(),
    staleTime: 10_000,
  })

  const devices = useMemo(
    () => (devicesQuery.data?.devices ?? []).slice().sort((left, right) => (
      getDeviceLabel(left).localeCompare(getDeviceLabel(right))
    )),
    [devicesQuery.data?.devices],
  )

  useEffect(() => {
    setName(initialName)
  }, [initialName])

  useEffect(() => {
    if (devices.length === 0) {
      setInputDevice(null)
      setOutputDevice(null)
      return
    }
    setInputDevice((current) => current ?? devices[0].name)
    setOutputDevice((current) => current ?? devices[0].name)
  }, [devices])

  const stepTitle = [
    'Name your snapshot',
    'Choose a routing mode',
    'Pick an input device',
    'Pick an output device',
  ][stepIndex]

  const stepCopy = [
    'Start with a short, unique snapshot name.',
    'Choose how the new signal design should route its chains.',
    'Store the preferred capture device as snapshot metadata.',
    'Store the preferred playback device as snapshot metadata.',
  ][stepIndex]

  const stepDeviceField = stepIndex === 2 ? 'input' : 'output'
  const canAdvance = useMemo(() => {
    if (stepIndex === 0) {
      return validateSnapshotName(name, existingSnapshotNames) === null
    }
    return true
  }, [existingSnapshotNames, name, stepIndex])

  const handleNext = () => {
    if (stepIndex === 0) {
      const error = validateSnapshotName(name, existingSnapshotNames)
      setNameError(error)
      if (error) {
        return
      }
    }
    setStepIndex((current) => Math.min(3, current + 1))
  }

  const handleBack = () => {
    if (stepIndex === 0) {
      onCancel()
      return
    }
    setStepIndex((current) => Math.max(0, current - 1))
  }

  const handleSubmit = async () => {
    const error = validateSnapshotName(name, existingSnapshotNames)
    setNameError(error)
    if (error) {
      setStepIndex(0)
      return
    }
    await onSubmit({
      name: normalizeName(name),
      routingMode,
      inputDevice,
      outputDevice,
    })
  }

  return (
    <div className="juce-grid-page__snapshot-panel">
      <div className="juce-grid-page__snapshot-header">
        <div className="juce-grid-page__snapshot-copy">
          <strong>Create new snapshot</strong>
          <span>Step {stepIndex + 1} of 4</span>
        </div>
      </div>

      <div className="juce-grid-page__snapshot-content">
        <div className="juce-grid-page__snapshot-active-display">
          <div className="juce-grid-page__snapshot-active-header">
            <span className="juce-grid-page__snapshot-action-label">New snapshot wizard</span>
          </div>

          <div className="juce-grid-page__snapshot-active-line">
            <span className="juce-grid-page__snapshot-active-number">{stepIndex + 1}</span>
            <span className="juce-grid-page__snapshot-active-name">{stepTitle}</span>
          </div>

          <p className="juce-grid-page__snapshot-active-description">{stepCopy}</p>

          {stepIndex === 0 && (
            <TextInput
              id="snapshot-new-wizard-name"
              labelText="Snapshot name"
              maxLength={20}
              value={name}
              onChange={(event) => {
                const nextValue = event.target.value
                setName(nextValue)
                setNameError(validateSnapshotName(nextValue, existingSnapshotNames))
              }}
              onBlur={() => {
                setNameError(validateSnapshotName(name, existingSnapshotNames))
              }}
              invalid={Boolean(nameError)}
              invalidText={nameError ?? undefined}
              placeholder="Friday Rehearsal"
            />
          )}

          {stepIndex === 1 && (
            <RadioButtonGroup
              legendText="Routing mode"
              name="snapshot-new-wizard-routing-mode"
              valueSelected={routingMode}
              onChange={(nextValue) => setRoutingMode(nextValue as SnapshotNewWizardRoutingMode)}
            >
              <RadioButton labelText="Parallel Blend" value="parallel_blend" id="snapshot-routing-parallel" />
              <RadioButton labelText="Series" value="series" id="snapshot-routing-series" />
              <RadioButton labelText="Morph" value="morph" id="snapshot-routing-morph" />
              <RadioButton labelText="Sidechain" value="sidechain" id="snapshot-routing-sidechain" />
            </RadioButtonGroup>
          )}

          {(stepIndex === 2 || stepIndex === 3) && (
            <>
              {devicesQuery.isLoading ? (
                <InlineLoading description="Loading audio devices" status="active" />
              ) : devicesQuery.isError ? (
                <p className="juce-grid-page__empty-state-copy">
                  Unable to load audio devices. You can continue without selecting one.
                </p>
              ) : devices.length === 0 ? (
                <p className="juce-grid-page__empty-state-copy">
                  No PipeWire devices are available right now. This step can be skipped.
                </p>
              ) : (
                <Select
                  id={`snapshot-new-wizard-${stepDeviceField}-device`}
                  labelText={stepDeviceField === 'input' ? 'Input device' : 'Output device'}
                  value={stepDeviceField === 'input' ? inputDevice ?? '' : outputDevice ?? ''}
                  onChange={(event) => {
                    const nextValue = event.target.value || null
                    if (stepDeviceField === 'input') {
                      setInputDevice(nextValue)
                    } else {
                      setOutputDevice(nextValue)
                    }
                  }}
                >
                  {devices.map((device) => (
                    <SelectItem
                      key={`${stepDeviceField}-device-${device.id}`}
                      value={device.name}
                      text={getDeviceLabel(device)}
                    />
                  ))}
                </Select>
              )}
            </>
          )}

          <div className="juce-grid-page__snapshot-command-row">
            <Button size="sm" kind="ghost" onClick={handleBack} disabled={isSubmitting}>
              {stepIndex === 0 ? 'Cancel' : 'Back'}
            </Button>
            {stepIndex < 3 ? (
              <Button size="sm" kind="primary" onClick={handleNext} disabled={!canAdvance || isSubmitting}>
                Next
              </Button>
            ) : (
              <Button size="sm" kind="primary" onClick={() => { void handleSubmit() }} disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
