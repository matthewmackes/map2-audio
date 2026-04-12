import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Checkbox,
  ClickableTile,
  InlineLoading,
  InlineNotification,
  Layer,
  Select,
  SelectItem,
  Tag,
  TextInput,
  Tile,
} from '@carbon/react'
import { ArrowRight, CheckmarkFilled, Download, Renew, Search, WarningAltFilled } from '@carbon/icons-react'
import { tesiraApi } from '../../../../map2/api'
import {
  useAddDevice,
  useAdoptDevice,
  useConnectDevice,
  useDiscoveryStatus,
  useReconnectDevice,
  useStartDiscovery,
  useTesiraDevices,
  useTesiraLayouts,
} from '../hooks/useTesiraApi'
import type { DiscoveredTesiraDevice, TesiraLayoutArtifact } from '../types'
import { EmptyState } from '../../shared/EmptyState'
import './TesiraOnboardingWizard.css'

type OnboardingMethod = 'serial' | 'network-discovery' | 'manual-ip'

type WizardStepId =
  | 'method'
  | 'recover'
  | 'enroll'
  | 'configure'
  | 'verify'

const WIZARD_STEPS: Array<{ id: WizardStepId; title: string; eyebrow: string }> = [
  { id: 'method', title: 'Choose Onboarding Method', eyebrow: 'Step 1' },
  { id: 'recover', title: 'Recover and Reset the Device', eyebrow: 'Step 2' },
  { id: 'enroll', title: 'Add the Unit to MAP2', eyebrow: 'Step 3' },
  { id: 'configure', title: 'Load a MAP2 Control Configuration', eyebrow: 'Step 4' },
  { id: 'verify', title: 'Verify Runtime Control', eyebrow: 'Step 5' },
]

const METHOD_OPTIONS: Array<{
  id: OnboardingMethod
  label: string
  eyebrow: string
  summary: string
  bullets: string[]
}> = [
  {
    id: 'serial',
    label: 'Serial Recovery',
    eyebrow: 'Recommended',
    summary: 'Primary path for used devices. Recover physical control first, then hand the unit back to MAP2 over the control network.',
    bullets: [
      'Best fit when the admin password is unknown or the unit arrived from another site.',
      'Matches Biamp guidance that factory reset requires physical access and clears the DSP configuration.',
      'Keeps serial or SSH as the preferred control posture during recovery; Telnet remains optional.',
    ],
  },
  {
    id: 'network-discovery',
    label: 'Network Discovery',
    eyebrow: 'Fast path',
    summary: 'Use discovery when the device is already factory-reset or otherwise reachable on the LAN and you want MAP2 to find it automatically.',
    bullets: [
      'Scans mDNS and Biamp discovery visibility from the Tesira route itself.',
      'Good for fresh hardware or units you already reset on the bench.',
      'Still falls back to manual IP entry if the scan cannot see the unit.',
    ],
  },
  {
    id: 'manual-ip',
    label: 'Manual IP Enrollment',
    eyebrow: 'Fallback',
    summary: 'Use a known control IP when discovery is blocked or the device is on a restricted management segment.',
    bullets: [
      'Adds the unit to the fleet without requiring TTP to be reachable first.',
      'Useful after serial recovery when you know the assigned control address.',
      'Pairs cleanly with the same configuration-load and verification steps as the other methods.',
    ],
  },
]

function modelLabel(device: DiscoveredTesiraDevice) {
  return device.model ?? device.hostname ?? device.mdns_name ?? device.host
}

export function TesiraOnboardingWizard() {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(0)
  const [method, setMethod] = useState<OnboardingMethod>('serial')
  const [usedDevice, setUsedDevice] = useState(true)
  const [ackFactoryReset, setAckFactoryReset] = useState(false)
  const [ackPhysicalAccess, setAckPhysicalAccess] = useState(false)
  const [ackSerialPreparation, setAckSerialPreparation] = useState(false)
  const [ackNetworkHandoff, setAckNetworkHandoff] = useState(false)
  const [friendlyName, setFriendlyName] = useState('')
  const [manualHost, setManualHost] = useState('')
  const [manualPort, setManualPort] = useState('23')
  const [selectedDiscoveryHost, setSelectedDiscoveryHost] = useState('')
  const [selectedLayoutKey, setSelectedLayoutKey] = useState('')
  const [configLoaded, setConfigLoaded] = useState(false)
  const [verifyAcknowledged, setVerifyAcknowledged] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [lastManagedHost, setLastManagedHost] = useState<string>('')

  const { data: devices = [] } = useTesiraDevices()
  const { data: discoveryStatus } = useDiscoveryStatus()
  const { data: layouts } = useTesiraLayouts({ includeInactive: false })
  const startDiscovery = useStartDiscovery()
  const adoptDevice = useAdoptDevice()
  const addDevice = useAddDevice()
  const connectDevice = useConnectDevice()
  const reconnectDevice = useReconnectDevice()

  const discoveryDevices = discoveryStatus?.devices ?? []

  const selectedMethod = METHOD_OPTIONS.find((option) => option.id === method) ?? METHOD_OPTIONS[0]
  const selectedDiscoveryDevice = discoveryDevices.find((device) => device.host === selectedDiscoveryHost) ?? null
  const normalizedManualHost = manualHost.trim()
  const targetHost = selectedDiscoveryHost || lastManagedHost || normalizedManualHost
  const targetDevice = devices.find((device) => device.host === targetHost) ?? null

  const selectedLayout = useMemo<TesiraLayoutArtifact | null>(() => {
    if (!selectedLayoutKey) return null
    const [layoutId, version] = selectedLayoutKey.split('@')
    return layouts?.layouts.find((layout) => layout.layout_id === layoutId && layout.version === version) ?? null
  }, [layouts?.layouts, selectedLayoutKey])

  const manualPackageUrl = selectedLayout
    ? tesiraApi.getLayoutManualPackageDownloadUrl(
        selectedLayout.layout_id,
        selectedLayout.version,
        targetDevice?.device_id,
      )
    : ''

  const stepReady = useMemo(() => {
    switch (WIZARD_STEPS[currentStep]?.id) {
      case 'method':
        return Boolean(method)
      case 'recover':
        if (method === 'serial') {
          return ackFactoryReset && ackPhysicalAccess && ackSerialPreparation && ackNetworkHandoff
        }
        return ackFactoryReset && ackNetworkHandoff
      case 'enroll':
        return Boolean(targetDevice)
      case 'configure':
        return Boolean(selectedLayout && configLoaded)
      case 'verify':
        return Boolean(targetDevice?.connected && verifyAcknowledged)
      default:
        return false
    }
  }, [
    ackFactoryReset,
    ackNetworkHandoff,
    ackPhysicalAccess,
    ackSerialPreparation,
    configLoaded,
    currentStep,
    method,
    selectedLayout,
    targetDevice,
    verifyAcknowledged,
  ])

  const handleDiscoveryScan = () => {
    setActionError(null)
    setActionMessage(null)
    startDiscovery.mutate(10, {
      onSuccess: () => setActionMessage('Tesira discovery scan started. MAP2 is checking mDNS and Biamp discovery visibility now.'),
      onError: (error) => setActionError(error instanceof Error ? error.message : 'Failed to start discovery scan'),
    })
  }

  const handleAddToFleet = async () => {
    setActionError(null)
    setActionMessage(null)

    try {
      if (selectedDiscoveryDevice) {
        if (selectedDiscoveryDevice.ttp_enabled === false) {
          await addDevice.mutateAsync({
            host: selectedDiscoveryDevice.host,
            port: selectedDiscoveryDevice.port,
            name: friendlyName.trim() || undefined,
          })
          setActionMessage('Device added to the Tesira fleet. Continue after TTP is enabled and the MAP2 layout is deployed.')
        } else {
          await adoptDevice.mutateAsync({
            host: selectedDiscoveryDevice.host,
            name: friendlyName.trim() || undefined,
          })
          setActionMessage('Discovered device adopted into the Tesira fleet.')
        }
        setLastManagedHost(selectedDiscoveryDevice.host)
        return
      }

      if (!normalizedManualHost) {
        setActionError('Enter a control IP or pick a discovered device before adding the unit to MAP2.')
        return
      }

      const parsedPort = Number.parseInt(manualPort || '23', 10)
      const port = Number.isFinite(parsedPort) && parsedPort > 0 && parsedPort <= 65535 ? parsedPort : 23

      await addDevice.mutateAsync({
        host: normalizedManualHost,
        port,
        name: friendlyName.trim() || undefined,
      })
      setLastManagedHost(normalizedManualHost)
      setActionMessage('Device added to the Tesira fleet by IP. Continue with the configuration-load step.')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to add device to the Tesira fleet')
    }
  }

  const handleReconnect = async () => {
    if (!targetDevice) return
    setActionError(null)
    setActionMessage(null)
    try {
      const result = targetDevice.connected
        ? await connectDevice.mutateAsync(targetDevice.device_id)
        : await reconnectDevice.mutateAsync(targetDevice.device_id)
      setActionMessage(result.message ?? 'MAP2 sent a reconnect request to the Tesira fleet.')
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Reconnect request failed')
    }
  }

  const goNext = () => {
    if (!stepReady || currentStep >= WIZARD_STEPS.length - 1) return
    setCurrentStep((step) => step + 1)
    setActionError(null)
  }

  const goBack = () => {
    if (currentStep === 0) return
    setCurrentStep((step) => step - 1)
    setActionError(null)
  }

  return (
    <div className="tesira-onboarding-wizard">
      <Layer className="tesira-onboarding-wizard__hero">
        <div className="tesira-onboarding-wizard__hero-copy">
          <p className="tesira-onboarding-wizard__eyebrow">Tesira onboarding</p>
          <h2>Tesira Onboarding Wizard</h2>
          <p className="tesira-onboarding-wizard__summary">
            Recover used Tesira hardware, add it to MAP2, load a MAP2-compatible layout, and verify runtime control from one guided flow.
          </p>
        </div>
        <div className="tesira-onboarding-wizard__hero-tags">
          <Tag type="blue">Serial first</Tag>
          <Tag type="cool-gray">Used-device recovery</Tag>
          <Tag type="green">MAP2 control-ready finish</Tag>
        </div>
      </Layer>

      <InlineNotification
        className="tesira-onboarding-wizard__notification"
        kind="info"
        lowContrast
        hideCloseButton
        title="Operator intent"
        subtitle="Onboarding is not finished when the unit is merely discovered. This wizard ends only after the Tesira is carrying a MAP2-compatible control configuration and MAP2 can verify runtime control."
      />

      <div className="tesira-onboarding-wizard__progress">
        {WIZARD_STEPS.map((step, index) => {
          const active = index === currentStep
          const complete = index < currentStep
          return (
            <button
              key={step.id}
              type="button"
              className={[
                'tesira-onboarding-wizard__progress-step',
                active ? 'is-active' : '',
                complete ? 'is-complete' : '',
              ].join(' ').trim()}
              onClick={() => setCurrentStep(index)}
            >
              <span className="tesira-onboarding-wizard__progress-kicker">{step.eyebrow}</span>
              <span className="tesira-onboarding-wizard__progress-title">{step.title}</span>
              {complete ? <CheckmarkFilled size={16} /> : null}
            </button>
          )
        })}
      </div>

      {WIZARD_STEPS[currentStep]?.id === 'method' ? (
        <div className="tesira-onboarding-wizard__panel-grid">
          {METHOD_OPTIONS.map((option) => (
            <ClickableTile
              key={option.id}
              className={[
                'tesira-onboarding-wizard__method-tile',
                option.id === method ? 'is-selected' : '',
              ].join(' ').trim()}
              onClick={() => setMethod(option.id)}
            >
              <div className="tesira-onboarding-wizard__method-header">
                <p>{option.eyebrow}</p>
                {option.id === method ? <Tag type="blue">Selected</Tag> : null}
              </div>
              <h3>{option.label}</h3>
              <p>{option.summary}</p>
              <ul>
                {option.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </ClickableTile>
          ))}
        </div>
      ) : null}

      {WIZARD_STEPS[currentStep]?.id === 'recover' ? (
        <Layer className="tesira-onboarding-wizard__step-panel">
          <div className="tesira-onboarding-wizard__step-copy">
            <p className="tesira-onboarding-wizard__eyebrow">Primary recovery path</p>
            <h3>{selectedMethod.label}</h3>
            <p>
              Biamp documents that recovering a lost admin password requires a factory reset, and that process clears the DSP configuration.
              The same security guidance recommends SSH or serial RS-232 in preference to Telnet when possible.
            </p>
          </div>

          <div className="tesira-onboarding-wizard__checklist">
            <Checkbox
              id="tesira-onboarding-used-device"
              labelText="Treat this as a used device that must be reset before MAP2 onboarding."
              checked={usedDevice}
              onChange={(_event, { checked }) => setUsedDevice(Boolean(checked))}
            />
            <Checkbox
              id="tesira-onboarding-physical-access"
              labelText="Physical access is available for factory reset and back-panel recovery."
              checked={ackPhysicalAccess}
              onChange={(_event, { checked }) => setAckPhysicalAccess(Boolean(checked))}
            />
            <Checkbox
              id="tesira-onboarding-reset"
              labelText="Factory reset completed or scheduled. I understand this clears the prior DSP configuration."
              checked={ackFactoryReset}
              onChange={(_event, { checked }) => setAckFactoryReset(Boolean(checked))}
            />
            <Checkbox
              id="tesira-onboarding-serial"
              labelText={
                method === 'serial'
                  ? 'Serial recovery is complete: the console path is available and the device is ready for MAP2 network enrollment.'
                  : 'The device is prepared on the control network and ready for MAP2 enrollment.'
              }
              checked={ackSerialPreparation}
              onChange={(_event, { checked }) => setAckSerialPreparation(Boolean(checked))}
            />
            <Checkbox
              id="tesira-onboarding-network"
              labelText="The control-network handoff is ready: MAP2 can discover the device or I know the control IP."
              checked={ackNetworkHandoff}
              onChange={(_event, { checked }) => setAckNetworkHandoff(Boolean(checked))}
            />
          </div>

          <Tile className="tesira-onboarding-wizard__callout">
            <h4>What MAP2 expects after recovery</h4>
            <p>
              MAP2 can manage runtime control only after the unit is back on the control network and a MAP2-compatible Tesira layout has been deployed.
              This wizard handles the MAP2 side of that handoff next.
            </p>
          </Tile>
        </Layer>
      ) : null}

      {WIZARD_STEPS[currentStep]?.id === 'enroll' ? (
        <Layer className="tesira-onboarding-wizard__step-panel">
          <div className="tesira-onboarding-wizard__step-copy">
            <p className="tesira-onboarding-wizard__eyebrow">Fleet enrollment</p>
            <h3>Add the recovered unit to MAP2</h3>
            <p>
              Use discovery first when possible. If the recovered device is not visible yet, fall back to a known control IP and enroll it directly.
            </p>
          </div>

          <div className="tesira-onboarding-wizard__enroll-grid">
            <Tile className="tesira-onboarding-wizard__action-card">
              <div className="tesira-onboarding-wizard__action-header">
                <h4>Discover on the network</h4>
                {discoveryStatus?.is_scanning ? <InlineLoading description="Scanning" status="active" /> : null}
              </div>
              <p>MAP2 checks both mDNS and Biamp discovery visibility from the dedicated Tesira route.</p>
              <Button size="sm" kind="secondary" renderIcon={Search} onClick={handleDiscoveryScan} disabled={startDiscovery.isPending}>
                Start discovery
              </Button>

              <div className="tesira-onboarding-wizard__candidate-list">
                {discoveryDevices.length === 0 ? (
                  <EmptyState
                    className="tesira-onboarding-wizard__empty"
                    title="No discovery candidates yet"
                    description="Start a scan or use the known-IP fallback."
                    compact
                    align="left"
                  />
                ) : (
                  discoveryDevices.map((device) => (
                    <button
                      key={device.host}
                      type="button"
                      className={[
                        'tesira-onboarding-wizard__candidate',
                        selectedDiscoveryHost === device.host ? 'is-selected' : '',
                      ].join(' ').trim()}
                      onClick={() => {
                        setSelectedDiscoveryHost(device.host)
                        setManualHost(device.host)
                        setLastManagedHost(device.host)
                      }}
                    >
                      <span className="tesira-onboarding-wizard__candidate-title">{modelLabel(device)}</span>
                      <span className="tesira-onboarding-wizard__candidate-meta">
                        {device.host}:{device.port}
                        {device.serial_number ? ` · S/N ${device.serial_number}` : ''}
                      </span>
                      <span className="tesira-onboarding-wizard__candidate-tags">
                        <Tag type={device.ttp_enabled ? 'green' : 'warm-gray'}>
                          {device.ttp_enabled ? 'TTP ready' : 'Discovery only'}
                        </Tag>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </Tile>

            <Tile className="tesira-onboarding-wizard__action-card">
              <div className="tesira-onboarding-wizard__action-header">
                <h4>Known-IP fallback</h4>
                <Tag type="cool-gray">All methods available</Tag>
              </div>
              <p>Use this after serial recovery if discovery is blocked or the device is already on a known management address.</p>
              <div className="tesira-onboarding-wizard__form-grid">
                <TextInput
                  id="tesira-onboarding-name"
                  labelText="Friendly name"
                  placeholder="Main Hall DSP"
                  value={friendlyName}
                  onChange={(event) => setFriendlyName(event.currentTarget.value)}
                />
                <TextInput
                  id="tesira-onboarding-host"
                  labelText="Tesira host"
                  placeholder="192.168.10.55"
                  value={manualHost}
                  onChange={(event) => setManualHost(event.currentTarget.value)}
                />
                <TextInput
                  id="tesira-onboarding-port"
                  labelText="TTP port"
                  value={manualPort}
                  onChange={(event) => setManualPort(event.currentTarget.value)}
                />
              </div>
              <Button
                size="sm"
                renderIcon={ArrowRight}
                onClick={() => {
                  void handleAddToFleet()
                }}
                disabled={addDevice.isPending || adoptDevice.isPending}
              >
                Add to Tesira fleet
              </Button>
            </Tile>
          </div>

          {targetDevice ? (
            <InlineNotification
              className="tesira-onboarding-wizard__notification"
              kind="success"
              lowContrast
              hideCloseButton
              title="Fleet enrollment ready"
              subtitle={`${targetDevice.name || targetDevice.host} is now in the Tesira fleet. Continue to the configuration-load step.`}
            />
          ) : null}
        </Layer>
      ) : null}

      {WIZARD_STEPS[currentStep]?.id === 'configure' ? (
        <Layer className="tesira-onboarding-wizard__step-panel">
          <div className="tesira-onboarding-wizard__step-copy">
            <p className="tesira-onboarding-wizard__eyebrow">Configuration load</p>
            <h3>Load a MAP2 control-ready layout</h3>
            <p>
              TTP handles runtime control, not full DSP authoring. The current MAP2 product path is to download a precompiled layout package, deploy it in SageVue, and return here for verification.
            </p>
          </div>

          <InlineNotification
            className="tesira-onboarding-wizard__notification"
            kind="warning"
            lowContrast
            hideCloseButton
            title="Current shipped deployment path"
            subtitle="Direct SageVue deployment is disabled in MAP2 today. Use a catalog layout, download the manual package, deploy it in SageVue, then come back to verify control."
          />

          <div className="tesira-onboarding-wizard__config-grid">
            <Tile className="tesira-onboarding-wizard__action-card">
              <Select
                id="tesira-onboarding-layout"
                labelText="MAP2 Tesira layout"
                value={selectedLayoutKey}
                onChange={(event) => setSelectedLayoutKey(event.currentTarget.value)}
              >
                <SelectItem value="" text="Select a layout" />
                {(layouts?.layouts ?? []).map((layout) => (
                  <SelectItem
                    key={`${layout.layout_id}@${layout.version}`}
                    value={`${layout.layout_id}@${layout.version}`}
                    text={`${layout.name} (${layout.layout_id} v${layout.version})`}
                  />
                ))}
              </Select>

              {selectedLayout ? (
                <div className="tesira-onboarding-wizard__layout-summary">
                  <p>{selectedLayout.notes || 'Catalog layout ready for operator deployment.'}</p>
                  <div className="tesira-onboarding-wizard__layout-tags">
                    <Tag type="blue">{selectedLayout.device_family}</Tag>
                    {selectedLayout.channel_profile ? <Tag type="cool-gray">{selectedLayout.channel_profile}</Tag> : null}
                    {selectedLayout.required_firmware ? <Tag type="warm-gray">{`FW ${selectedLayout.required_firmware}`}</Tag> : null}
                  </div>
                </div>
              ) : null}

              <div className="tesira-onboarding-wizard__wizard-actions">
                <Button
                  size="sm"
                  kind="primary"
                  renderIcon={Download}
                  href={manualPackageUrl || undefined}
                  target="_blank"
                  disabled={!selectedLayout}
                >
                  Download manual package
                </Button>
                <Button
                  size="sm"
                  kind="ghost"
                  href="https://sagevue-help.biamp.com/Tesira_Layouts.htm"
                  target="_blank"
                >
                  SageVue upload guide
                </Button>
              </div>
            </Tile>

            <Tile className="tesira-onboarding-wizard__action-card">
              <h4>Operator completion checklist</h4>
              <p>Do not advance until the MAP2-compatible layout is actually on the Tesira unit.</p>
              <div className="tesira-onboarding-wizard__ordered-steps">
                <p>1. Download the selected manual package.</p>
                <p>2. Upload the included TMF in SageVue.</p>
                <p>3. Deploy that layout to the recovered Tesira unit.</p>
                <p>4. Return to MAP2 for reconnect and runtime verification.</p>
              </div>
              <Checkbox
                id="tesira-onboarding-config-loaded"
                labelText="The MAP2-compatible Tesira layout has been uploaded and deployed."
                checked={configLoaded}
                onChange={(_event, { checked }) => setConfigLoaded(Boolean(checked))}
              />
            </Tile>
          </div>
        </Layer>
      ) : null}

      {WIZARD_STEPS[currentStep]?.id === 'verify' ? (
        <Layer className="tesira-onboarding-wizard__step-panel">
          <div className="tesira-onboarding-wizard__step-copy">
            <p className="tesira-onboarding-wizard__eyebrow">Runtime verification</p>
            <h3>Verify MAP2 control over the signal chain</h3>
            <p>
              Confirm that the device is back online and reachable so MAP2 can drive the signal chain, presets, monitoring, and other supported unit features.
            </p>
          </div>

          {targetDevice ? (
            <div className="tesira-onboarding-wizard__verify-card">
              <div>
                <h4>{targetDevice.name || targetDevice.host}</h4>
                <p>
                  {targetDevice.host}:{targetDevice.port}
                  {targetDevice.firmware_version ? ` · fw ${targetDevice.firmware_version}` : ''}
                </p>
              </div>
              <div className="tesira-onboarding-wizard__layout-tags">
                <Tag type={targetDevice.connected ? 'green' : 'warm-gray'}>
                  {targetDevice.connected ? 'Connected' : 'Offline'}
                </Tag>
                <Tag type="cool-gray">{`${targetDevice.avb_stream_count} AVB streams`}</Tag>
                {targetDevice.ptp_state ? <Tag type="blue">{`PTP ${targetDevice.ptp_state}`}</Tag> : null}
              </div>
            </div>
          ) : (
            <InlineNotification
              className="tesira-onboarding-wizard__notification"
              kind="warning"
              lowContrast
              hideCloseButton
              title="Fleet entry not found"
              subtitle="Add the device to the Tesira fleet first so MAP2 has a unit to verify."
            />
          )}

          <div className="tesira-onboarding-wizard__wizard-actions">
            <Button
              size="sm"
              kind="secondary"
              renderIcon={Renew}
              onClick={() => {
                void handleReconnect()
              }}
              disabled={!targetDevice || reconnectDevice.isPending || connectDevice.isPending}
            >
              {targetDevice?.connected ? 'Refresh connection' : 'Try MAP2 reconnect'}
            </Button>
            <Button
              size="sm"
              kind="primary"
              renderIcon={ArrowRight}
              onClick={() => {
                if (targetDevice) navigate(`/tesira/${targetDevice.device_id}/dashboard`)
              }}
              disabled={!targetDevice}
            >
              Open device dashboard
            </Button>
          </div>

          <Checkbox
            id="tesira-onboarding-verify"
            labelText="MAP2 can now reach the unit and the deployed layout exposes the signal-chain controls and features required for this installation."
            checked={verifyAcknowledged}
            onChange={(_event, { checked }) => setVerifyAcknowledged(Boolean(checked))}
          />
        </Layer>
      ) : null}

      {actionError ? (
        <InlineNotification
          className="tesira-onboarding-wizard__notification"
          kind="error"
          lowContrast
          hideCloseButton
          title="Wizard action failed"
          subtitle={actionError}
        />
      ) : null}
      {actionMessage ? (
        <InlineNotification
          className="tesira-onboarding-wizard__notification"
          kind="success"
          lowContrast
          hideCloseButton
          title="Wizard update"
          subtitle={actionMessage}
        />
      ) : null}

      <div className="tesira-onboarding-wizard__footer">
        <Tile className="tesira-onboarding-wizard__callout">
          <div className="tesira-onboarding-wizard__callout-header">
            <WarningAltFilled size={18} />
            <h4>Canonical process note</h4>
          </div>
          <p>
            A used-device onboarding run is only successful once the unit is reset, added to the Tesira fleet, loaded with a MAP2-compatible layout, and revalidated by MAP2.
          </p>
        </Tile>

        <div className="tesira-onboarding-wizard__wizard-actions">
          <Button size="sm" kind="ghost" disabled={currentStep === 0} onClick={goBack}>
            Back
          </Button>
          <Button size="sm" kind="primary" renderIcon={ArrowRight} disabled={!stepReady || currentStep === WIZARD_STEPS.length - 1} onClick={goNext}>
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
