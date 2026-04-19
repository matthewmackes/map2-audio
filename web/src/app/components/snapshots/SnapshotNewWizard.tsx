import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Select,
  SelectItem,
  TextInput,
} from '@carbon/react'
import { pipewireApi } from '../../../map2/api'
import type { PipeWireDeviceInfo } from '../../../map2/types'
import { snapshotsApi } from '../../../map2/clients/snapshots'
import { EmptyState } from '../shared/EmptyState'
import { LoadingState } from '../shared/LoadingState'
import {
  normalizeSnapshotName,
  validateSnapshotName,
} from '../../utils/snapshotNames'

export interface SnapshotNewWizardValues {
  name: string
  hostId: string
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
  const [hostId, setHostId] = useState<string>('')
  const [inputDevice, setInputDevice] = useState<string | null>(null)
  const [outputDevice, setOutputDevice] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const nodesQuery = useQuery({
    queryKey: ['snapshots', 'cluster-nodes', 'snapshot-wizard'],
    queryFn: () => snapshotsApi.listNodes(),
    staleTime: 10_000,
  })

  const devicesQuery = useQuery({
    queryKey: ['pipewire', 'devices', 'snapshot-wizard', hostId || 'none'],
    queryFn: () => pipewireApi.getDevices(hostId || null),
    enabled: hostId.length > 0,
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
    const firstNodeId = nodesQuery.data?.nodes.find((node) => typeof node.id === 'string' && node.id.trim().length > 0)?.id ?? ''
    setHostId((current) => current || firstNodeId)
  }, [nodesQuery.data?.nodes])

  useEffect(() => {
    if (hostId.length === 0 || devices.length === 0) {
      setInputDevice(null)
      setOutputDevice(null)
      return
    }
    setInputDevice((current) => current ?? devices[0].name)
    setOutputDevice((current) => current ?? devices[0].name)
  }, [devices, hostId])

  const stepTitle = [
    'Name your snapshot',
    'Choose a live host',
    'Pick an input device',
    'Pick an output device',
  ][stepIndex]

  const stepCopy = [
    'Start with a unique snapshot name. Defaults use rhyming names plus today\'s numeric date.',
    'Choose the node that will host this snapshot when you commit it into the live system.',
    'Store the preferred capture device for this live session on the selected host.',
    'Store the preferred playback device for this live session on the selected host.',
  ][stepIndex]

  const stepDeviceField = stepIndex === 2 ? 'input' : 'output'
  const canAdvance = useMemo(() => {
    if (stepIndex === 0) {
      return validateSnapshotName(name, existingSnapshotNames) === null
    }
    if (stepIndex === 1) {
      return hostId.length > 0
    }
    return true
  }, [existingSnapshotNames, hostId, name, stepIndex])

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
      name: normalizeSnapshotName(name),
      hostId,
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
              placeholder="LilaMila04022026"
            />
          )}

          {stepIndex === 1 && (
            <>
              {nodesQuery.isLoading ? (
                <LoadingState description="Loading available hosts" />
              ) : nodesQuery.isError ? (
                <EmptyState
                  compact
                  className="juce-grid-page__empty-state"
                  title="Unable to load hosts"
                  description="The snapshot can still be created later from the publish workflow."
                />
              ) : (nodesQuery.data?.nodes ?? []).length === 0 ? (
                <EmptyState
                  compact
                  className="juce-grid-page__empty-state"
                  title="No hosts are available right now"
                  description="Bring a host online before committing a live snapshot."
                />
              ) : (
                <Select
                  id="snapshot-new-wizard-host"
                  labelText="Live host"
                  value={hostId}
                  onChange={(event) => {
                    const nextHostId = event.target.value
                    setHostId(nextHostId)
                    setInputDevice(null)
                    setOutputDevice(null)
                  }}
                >
                  {(nodesQuery.data?.nodes ?? [])
                    .filter((node) => typeof node.id === 'string' && node.id.trim().length > 0)
                    .map((node) => {
                      const label = typeof node.hostname === 'string' && node.hostname.trim().length > 0
                        ? `${node.hostname} (${node.id})`
                        : node.id
                      return (
                        <SelectItem
                          key={`snapshot-host-${node.id}`}
                          value={node.id}
                          text={label}
                        />
                      )
                    })}
                </Select>
              )}
            </>
          )}

          {(stepIndex === 2 || stepIndex === 3) && (
            <>
              {devicesQuery.isLoading ? (
                <LoadingState description="Loading host audio devices" />
              ) : devicesQuery.isError ? (
                <EmptyState
                  compact
                  className="juce-grid-page__empty-state"
                  title="Unable to load audio devices"
                  description="You can continue without selecting one."
                />
              ) : devices.length === 0 ? (
                <EmptyState
                  compact
                  className="juce-grid-page__empty-state"
                  title="No PipeWire devices are available right now"
                  description="This step can be skipped."
                />
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
                {isSubmitting ? 'Committing...' : 'Commit'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
