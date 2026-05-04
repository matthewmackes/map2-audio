/**
 * MIDI Commander Setup Component
 *
 * Provides device profile management, expression pedal calibration,
 * and firmware update capabilities for the MeloAudio MIDI Commander.
 *
 * T2475 (E1): direct-swap migration from MUI to Carbon. The MUI
 * `Stepper` widget has no direct Carbon equivalent; replaced with
 * Carbon's `ProgressIndicator` (step header) plus per-step content
 * rendered conditionally on `activeStep`. All other MUI components
 * mapped to their nearest Carbon equivalent: Button → Carbon Button,
 * Chip → StatusChip (B4), Switch → Carbon Toggle,
 * FormControl/Select/InputLabel/MenuItem → Carbon Dropdown,
 * LinearProgress → Carbon ProgressBar, Alert/AlertTitle → Carbon
 * InlineNotification, TextField → Carbon TextInput.
 */

import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Dropdown,
  InlineNotification,
  ProgressBar,
  ProgressIndicator,
  ProgressStep,
  TextInput,
  Toggle,
} from '@carbon/react'
import {
  ChevronDown,
  ChevronRight,
  MeterAlt,
  Music,
  Renew,
  Settings,
  Upload,
} from '@carbon/icons-react'

import { midiApiV2 } from '../../map2/api'
import type {
  MIDIDeviceProfile,
  ExpressionCalibration,
  MIDIExpressionCurve,
  FootswitchConfig,
  ExpressionPedalConfig,
} from '../../map2/types'
import { createParameterDescriptor } from '../data/parameterSchema'
import { ParameterControl } from './ParameterControl'
import { StatusChip } from './primitives'
import { useToasts } from './Toasts'
import { LegacyTile } from './shared/LegacyTile'

interface CurveOption {
  value: MIDIExpressionCurve
  label: string
}

const CURVE_OPTIONS: CurveOption[] = [
  { value: 'linear', label: 'Linear' },
  { value: 'logarithmic', label: 'Logarithmic (Smooth start)' },
  { value: 'exponential', label: 'Exponential (Smooth end)' },
  { value: 's_curve', label: 'S-Curve (Smooth both)' },
]

// ============================================================================
// Device Profile Card
// ============================================================================

interface ProfileCardProps {
  profile: MIDIDeviceProfile
  isActive: boolean
  onApply: () => void
  isApplying?: boolean
}

function ProfileCard({ profile, isActive, onApply, isApplying }: ProfileCardProps) {
  return (
    <LegacyTile
      className={isActive ? 'ring ring-accent' : undefined}
      style={{ padding: 16, position: 'relative' }}
    >
      {isActive && (
        <span style={{ position: 'absolute', top: 8, right: 8 }}>
          <StatusChip tone="ok" label="Active" size="sm" />
        </span>
      )}
      {profile.is_recommended && !isActive && (
        <span style={{ position: 'absolute', top: 8, right: 8 }}>
          <StatusChip tone="info" label="Recommended" size="sm" />
        </span>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <span style={{ fontSize: 32 }}>{profile.icon}</span>
        <div>
          <h4 style={{ margin: 0 }}>{profile.name}</h4>
          <p className="subtitle" style={{ margin: 0 }}>{profile.manufacturer}</p>
        </div>
      </div>

      <p className="subtitle" style={{ marginBottom: 12 }}>{profile.description}</p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {profile.footswitches.length > 0 && (
          <StatusChip tone="neutral" label={`${profile.footswitches.length} Switches`} size="sm" />
        )}
        {profile.expression_pedals.length > 0 && (
          <StatusChip tone="neutral" label={`${profile.expression_pedals.length} Expression`} size="sm" />
        )}
        {profile.bank_config?.enabled && (
          <StatusChip tone="neutral" label={`${profile.bank_config.max_banks} Banks`} size="sm" />
        )}
        {profile.supports_firmware_update && (
          <StatusChip tone="info" label="DFU" size="sm" />
        )}
      </div>

      {!isActive && (
        <Button
          kind="primary"
          onClick={onApply}
          disabled={isApplying}
          size="sm"
        >
          {isApplying ? 'Applying...' : 'Apply Profile'}
        </Button>
      )}
    </LegacyTile>
  )
}

// ============================================================================
// Footswitch Layout Display
// ============================================================================

interface FootswitchLayoutProps {
  footswitches: FootswitchConfig[]
  expressionPedals: ExpressionPedalConfig[]
}

function FootswitchLayout({ footswitches, expressionPedals }: FootswitchLayoutProps) {
  // Group switches by type for display
  const pcSwitches = footswitches.filter(fs => fs.midi_type === 'pc')
  const ccSwitches = footswitches.filter(fs => fs.midi_type === 'cc')

  return (
    <div style={{ background: 'var(--surface-2)', padding: 16 }}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div
          style={{
            background: '#111',
            color: 'var(--cds-support-success)',
            fontFamily: 'var(--font-mono)',
            padding: 'var(--cds-spacing-03) var(--cds-spacing-06)',
            display: 'inline-block',
          }}
        >
          MIDI Commander
        </div>
      </div>

      {/* Top Row - CC Switches */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.max(4, ccSwitches.length)}, 1fr)`,
          gap: 8,
          marginBottom: 12,
        }}
      >
        {ccSwitches.map(fs => (
          <LegacyTile
            key={fs.switch_id}
            style={{
              padding: 8,
              textAlign: 'center',
              background: 'var(--surface-3)',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{fs.switch_id}</div>
            <div style={{ fontSize: 11 }} className="subtitle">
              CC {fs.number}
            </div>
            <div style={{ fontSize: 10 }} className="subtitle">
              {fs.label}
            </div>
          </LegacyTile>
        ))}
      </div>

      {/* Bottom Row - PC Switches */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.max(4, pcSwitches.length)}, 1fr)`,
          gap: 8,
          marginBottom: 12,
        }}
      >
        {pcSwitches.map(fs => (
          <LegacyTile
            key={fs.switch_id}
            style={{
              padding: 8,
              textAlign: 'center',
              background: 'var(--accent)',
              color: 'white',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{fs.switch_id}</div>
            <div style={{ fontSize: 11, opacity: 0.9 }}>PC {fs.number}</div>
            <div style={{ fontSize: 10, opacity: 0.8 }}>{fs.label}</div>
          </LegacyTile>
        ))}
      </div>

      {/* Expression Pedals */}
      {expressionPedals.length > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 12,
          }}
        >
          {expressionPedals.map(ep => (
            <div
              key={ep.pedal_id}
              style={{
                textAlign: 'center',
                padding: 'var(--cds-spacing-03) var(--cds-spacing-05)',
                background: 'var(--surface-3)',
              }}
            >
              <MeterAlt size={16} style={{ marginBottom: 4 }} />
              <div style={{ fontSize: 12, fontWeight: 600 }}>{ep.pedal_id}</div>
              <div className="subtitle" style={{ fontSize: 10 }}>
                CC {ep.cc_number} - {ep.label}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Expression Pedal Calibration
// ============================================================================

interface ExpressionCalibrationPanelProps {
  pedalId: string
  label: string
  calibration: ExpressionCalibration | null
  liveValue?: number
  onUpdate: (updates: Partial<ExpressionCalibration>) => void
}

const DEFAULT_EXPRESSION_CALIBRATION: ExpressionCalibration = {
  min_raw: 0,
  max_raw: 127,
  deadzone_low: 2,
  deadzone_high: 125,
  curve: 'linear',
  invert: false,
}

const DEADZONE_LOW_DESCRIPTOR = createParameterDescriptor({
  min: 0,
  max: 127,
  step: 1,
  defaultValue: 2,
  name: 'Low',
  symbol: 'deadzone_low',
  profile: 'integer',
  classification: 'CALIBRATION',
  fineStep: 1,
  largeStep: 8,
  commitStrategy: 'blur',
})

const DEADZONE_HIGH_DESCRIPTOR = createParameterDescriptor({
  min: 0,
  max: 127,
  step: 1,
  defaultValue: 125,
  name: 'High',
  symbol: 'deadzone_high',
  profile: 'integer',
  classification: 'CALIBRATION',
  fineStep: 1,
  largeStep: 8,
  commitStrategy: 'blur',
})

function normalizeCalibrationPair(calibration: ExpressionCalibration): ExpressionCalibration {
  const deadzoneLow = Math.max(0, Math.min(127, Math.round(calibration.deadzone_low)))
  const deadzoneHigh = Math.max(deadzoneLow, Math.min(127, Math.round(calibration.deadzone_high)))

  return {
    ...calibration,
    deadzone_low: deadzoneLow,
    deadzone_high: deadzoneHigh,
  }
}

function applyCalibrationUpdates(
  calibration: ExpressionCalibration,
  updates: Partial<ExpressionCalibration>,
): ExpressionCalibration {
  return normalizeCalibrationPair({
    ...calibration,
    ...updates,
  })
}

function getCalibrationUpdates(
  previous: ExpressionCalibration,
  next: ExpressionCalibration,
): Partial<ExpressionCalibration> {
  const updates: Partial<ExpressionCalibration> = {}

  if (previous.deadzone_low !== next.deadzone_low) {
    updates.deadzone_low = next.deadzone_low
  }
  if (previous.deadzone_high !== next.deadzone_high) {
    updates.deadzone_high = next.deadzone_high
  }
  if (previous.curve !== next.curve) {
    updates.curve = next.curve
  }
  if (previous.invert !== next.invert) {
    updates.invert = next.invert
  }

  return updates
}

export function ExpressionCalibrationPanel({
  pedalId,
  label,
  calibration,
  liveValue,
  onUpdate,
}: ExpressionCalibrationPanelProps) {
  const [expanded, setExpanded] = useState(false)

  const resolvedCalibration = normalizeCalibrationPair({
    ...DEFAULT_EXPRESSION_CALIBRATION,
    ...calibration,
  })
  const [draftCalibration, setDraftCalibration] = useState<ExpressionCalibration>(resolvedCalibration)

  useEffect(() => {
    setDraftCalibration(resolvedCalibration)
  }, [
    resolvedCalibration.curve,
    resolvedCalibration.deadzone_high,
    resolvedCalibration.deadzone_low,
    resolvedCalibration.invert,
    resolvedCalibration.max_raw,
    resolvedCalibration.min_raw,
  ])

  const setDraftValue = useCallback((updates: Partial<ExpressionCalibration>) => {
    setDraftCalibration((previous) => applyCalibrationUpdates(previous, updates))
  }, [])

  const commitCalibration = useCallback((updates: Partial<ExpressionCalibration>) => {
    const nextCalibration = applyCalibrationUpdates(draftCalibration, updates)
    setDraftCalibration(nextCalibration)
    const changedFields = getCalibrationUpdates(resolvedCalibration, nextCalibration)
    if (Object.keys(changedFields).length > 0) {
      onUpdate(changedFields)
    }
  }, [draftCalibration, onUpdate, resolvedCalibration])

  // Calculate processed value for preview
  const processValue = (raw: number): number => {
    let val = raw
    if (val < draftCalibration.deadzone_low) val = draftCalibration.deadzone_low
    if (val > draftCalibration.deadzone_high) val = draftCalibration.deadzone_high

    const range = draftCalibration.deadzone_high - draftCalibration.deadzone_low
    if (range <= 0) return 0

    let normalized = (val - draftCalibration.deadzone_low) / range

    // Apply curve
    if (draftCalibration.curve === 'logarithmic') {
      normalized = normalized > 0 ? Math.log10(1 + 9 * normalized) : 0
    } else if (draftCalibration.curve === 'exponential') {
      normalized = (Math.pow(10, normalized) - 1) / 9
    } else if (draftCalibration.curve === 's_curve') {
      normalized = 0.5 * (1 + Math.tanh(4 * (normalized - 0.5)))
    }

    if (draftCalibration.invert) normalized = 1 - normalized

    return normalized
  }

  const processedValue = liveValue !== undefined ? processValue(liveValue) : null

  const selectedCurve = CURVE_OPTIONS.find(c => c.value === draftCalibration.curve) ?? CURVE_OPTIONS[0]

  return (
    <LegacyTile style={{ padding: 16, marginBottom: 12 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <MeterAlt size={20} />
          <div>
            <h4 style={{ margin: 0 }}>{pedalId}</h4>
            <p className="subtitle" style={{ margin: 0 }}>{label}</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {liveValue !== undefined && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12 }} className="subtitle">Raw: {liveValue}</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {(processedValue! * 100).toFixed(0)}%
              </div>
            </div>
          )}
          {expanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 16 }}>
          {/* Live preview bar */}
          {liveValue !== undefined && (
            <div style={{ marginBottom: 16 }}>
              <div className="subtitle" style={{ marginBottom: 4 }}>Live Preview</div>
              <ProgressBar
                value={(processedValue || 0) * 100}
                max={100}
                label="Live preview"
                hideLabel
                size="small"
              />
            </div>
          )}

          {/* Deadzone range */}
          <div style={{ marginBottom: 16 }}>
            <div className="subtitle" style={{ marginBottom: 8 }}>
              Deadzone Range
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <ParameterControl
                variant="numeric"
                label="Low"
                descriptor={DEADZONE_LOW_DESCRIPTOR}
                value={draftCalibration.deadzone_low}
                onLiveChange={(value) => setDraftValue({ deadzone_low: value })}
                onCommit={(value) => commitCalibration({ deadzone_low: value })}
                commitStrategy="blur"
                size="small"
                showBounds={false}
              />
              <ParameterControl
                variant="numeric"
                label="High"
                descriptor={DEADZONE_HIGH_DESCRIPTOR}
                value={draftCalibration.deadzone_high}
                onLiveChange={(value) => setDraftValue({ deadzone_high: value })}
                onCommit={(value) => commitCalibration({ deadzone_high: value })}
                commitStrategy="blur"
                size="small"
                showBounds={false}
              />
            </div>
          </div>

          {/* Curve type */}
          <div style={{ marginBottom: 16 }}>
            <Dropdown<CurveOption>
              id={`midi-commander-curve-${pedalId}`}
              titleText="Response Curve"
              label="Response Curve"
              size="sm"
              items={CURVE_OPTIONS}
              itemToString={(item) => item?.label ?? ''}
              selectedItem={selectedCurve}
              onChange={({ selectedItem }) => {
                if (selectedItem) commitCalibration({ curve: selectedItem.value })
              }}
            />
          </div>

          {/* Invert toggle */}
          <Toggle
            id={`midi-commander-invert-${pedalId}`}
            labelText="Invert Direction"
            hideLabel={false}
            toggled={draftCalibration.invert}
            onToggle={(checked) => commitCalibration({ invert: checked })}
            size="sm"
          />
        </div>
      )}
    </LegacyTile>
  )
}

// ============================================================================
// Firmware Update Panel
// ============================================================================

interface FirmwareUpdatePanelProps {
  profileId: string
}

function FirmwareUpdatePanel({ profileId }: FirmwareUpdatePanelProps) {
  const { pushToast } = useToasts()
  const [firmwarePath, setFirmwarePath] = useState('')
  const [activeStep, setActiveStep] = useState(0)

  const dfuStatusQuery = useQuery({
    queryKey: ['midi', 'dfu-status'],
    queryFn: midiApiV2.getDFUStatus,
    refetchInterval: 2000,
  })

  const instructionsQuery = useQuery({
    queryKey: ['midi', 'dfu-instructions', profileId],
    queryFn: () => midiApiV2.getDFUInstructions(profileId),
  })

  const flashMutation = useMutation({
    mutationFn: () => midiApiV2.flashFirmware(profileId, firmwarePath),
    onSuccess: (result) => {
      if (result.success) {
        pushToast(result.message || 'Firmware flashed successfully', 'success')
        setActiveStep(3)
      } else {
        pushToast(result.error || 'Flash failed', 'error')
      }
    },
    onError: (err: Error) => {
      pushToast(`Flash error: ${err.message}`, 'error')
    },
  })

  const dfuStatus = dfuStatusQuery.data
  const instructions = instructionsQuery.data

  return (
    <LegacyTile style={{ padding: 16 }}>
      <h3 style={{ marginBottom: 16 }}>
        <Upload size={20} style={{ marginRight: 8 }} />
        Firmware Update
      </h3>

      {!dfuStatus?.dfu_available && (
        <InlineNotification
          kind="warning"
          title="dfu-util not installed"
          subtitle={dfuStatus?.install_hint}
          hideCloseButton
          lowContrast
          style={{ marginBottom: 16 }}
        />
      )}

      {/* T2475 (E1): MUI Stepper widget has no direct Carbon equivalent.
       * Replaced with Carbon ProgressIndicator for the step header (shows
       * current/complete/incomplete state of all steps) plus per-step
       * content rendered conditionally on activeStep. Same operator UX,
       * just rendered as Carbon idioms. */}
      <ProgressIndicator
        currentIndex={activeStep}
        spaceEqually
        style={{ marginBottom: 16 }}
      >
        <ProgressStep label="Enter DFU Mode" />
        <ProgressStep label="Verify DFU" />
        <ProgressStep label="Flash Firmware" />
        <ProgressStep label="Complete" />
      </ProgressIndicator>

      {activeStep === 0 && (
        <div>
          {instructions && (
            <div style={{ marginBottom: 16 }}>
              <ol style={{ paddingLeft: 20, margin: 0 }}>
                {instructions.steps.map((step, i) => (
                  <li key={i} style={{ marginBottom: 8 }}>{step}</li>
                ))}
              </ol>
              {instructions.notes.length > 0 && (
                <InlineNotification
                  kind="info"
                  title="Notes"
                  subtitle={instructions.notes.join(' · ')}
                  hideCloseButton
                  lowContrast
                  style={{ marginTop: 12 }}
                />
              )}
            </div>
          )}
          <Button
            kind="primary"
            onClick={() => setActiveStep(1)}
            disabled={!dfuStatus?.dfu_available}
          >
            Continue
          </Button>
        </div>
      )}

      {activeStep === 1 && (
        <div>
          <div style={{ marginBottom: 16 }}>
            {dfuStatus?.devices_in_dfu_mode.length ? (
              <InlineNotification
                kind="success"
                title="Device detected in DFU mode"
                subtitle={dfuStatus.devices_in_dfu_mode.map(d => d.raw).join(' · ')}
                hideCloseButton
                lowContrast
              />
            ) : (
              <InlineNotification
                kind="warning"
                title="No device in DFU mode"
                subtitle="Follow the steps above to enter DFU mode, then click Refresh."
                hideCloseButton
                lowContrast
              />
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button kind="tertiary" renderIcon={Renew} onClick={() => dfuStatusQuery.refetch()}>
              Refresh
            </Button>
            <Button
              kind="primary"
              onClick={() => setActiveStep(2)}
              disabled={!dfuStatus?.devices_in_dfu_mode.length}
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {activeStep === 2 && (
        <div>
          <TextInput
            id="midi-commander-firmware-path"
            labelText="Firmware File Path"
            value={firmwarePath}
            onChange={(e) => setFirmwarePath(e.target.value)}
            placeholder="/path/to/firmware.dfu"
            helperText="Enter the full path to the .dfu firmware file"
            style={{ marginBottom: 16 }}
          />

          <div style={{ display: 'flex', gap: 8 }}>
            <Button kind="tertiary" onClick={() => setActiveStep(1)}>Back</Button>
            <Button
              kind="primary"
              onClick={() => flashMutation.mutate()}
              disabled={!firmwarePath || flashMutation.isPending}
            >
              {flashMutation.isPending ? 'Flashing...' : 'Flash Firmware'}
            </Button>
          </div>

          {flashMutation.isPending && (
            <div style={{ marginTop: 16 }}>
              <ProgressBar label="Flashing firmware" hideLabel />
            </div>
          )}
        </div>
      )}

      {activeStep === 3 && (
        <div>
          <InlineNotification
            kind="success"
            title="Firmware Updated"
            subtitle={`Power cycle the device to complete the update.${instructions?.exit_dfu ? ` ${instructions.exit_dfu}` : ''}`}
            hideCloseButton
            lowContrast
            style={{ marginBottom: 16 }}
          />
          <Button kind="tertiary" onClick={() => setActiveStep(0)}>Start Over</Button>
        </div>
      )}
    </LegacyTile>
  )
}

// ============================================================================
// Main MIDI Commander Setup Component
// ============================================================================

export function MIDICommanderSetup() {
  const { pushToast } = useToasts()
  const queryClient = useQueryClient()
  const [selectedSection, setSelectedSection] = useState<'profiles' | 'calibration' | 'firmware'>('profiles')

  // Queries
  const profilesQuery = useQuery({
    queryKey: ['midi', 'device-profiles'],
    queryFn: midiApiV2.getDeviceProfiles,
  })

  const activeProfileQuery = useQuery({
    queryKey: ['midi', 'active-profile'],
    queryFn: midiApiV2.getActiveProfile,
  })

  const calibrationsQuery = useQuery({
    queryKey: ['midi', 'expression-calibrations'],
    queryFn: midiApiV2.getExpressionCalibrations,
  })

  const bankQuery = useQuery({
    queryKey: ['midi', 'bank'],
    queryFn: midiApiV2.getCurrentBank,
  })

  // Mutations
  const applyProfileMutation = useMutation({
    mutationFn: (profileId: string) => midiApiV2.applyDeviceProfile(profileId),
    onSuccess: (result) => {
      pushToast(`Applied ${result.profile_name}: ${result.commands_created} commands created`, 'success')
      queryClient.invalidateQueries({ queryKey: ['midi'] })
    },
    onError: (err: Error) => {
      pushToast(`Failed to apply profile: ${err.message}`, 'error')
    },
  })

  const updateCalibrationMutation = useMutation({
    mutationFn: midiApiV2.updateExpressionCalibration,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['midi', 'expression-calibrations'] })
    },
  })

  const bankUpMutation = useMutation({
    mutationFn: midiApiV2.bankUp,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['midi', 'bank'] }),
  })

  const bankDownMutation = useMutation({
    mutationFn: midiApiV2.bankDown,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['midi', 'bank'] }),
  })

  const profiles = profilesQuery.data?.profiles ?? []
  const activeProfile = activeProfileQuery.data?.profile
  const calibrations = calibrationsQuery.data?.calibrations ?? {}
  const bankState = bankQuery.data

  return (
    <div className="stack">
      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Button
          kind={selectedSection === 'profiles' ? 'primary' : 'tertiary'}
          onClick={() => setSelectedSection('profiles')}
          size="sm"
          renderIcon={Settings}
        >
          Profiles
        </Button>
        <Button
          kind={selectedSection === 'calibration' ? 'primary' : 'tertiary'}
          onClick={() => setSelectedSection('calibration')}
          size="sm"
          disabled={!activeProfile}
          renderIcon={MeterAlt}
        >
          Calibration
        </Button>
        <Button
          kind={selectedSection === 'firmware' ? 'primary' : 'tertiary'}
          onClick={() => setSelectedSection('firmware')}
          size="sm"
          disabled={!activeProfile?.supports_firmware_update}
          renderIcon={Upload}
        >
          Firmware
        </Button>
      </div>

      {/* Profiles Section */}
      {selectedSection === 'profiles' && (
        <>
          <div className="section-heading">
            <div>
              <h3>Device Profiles</h3>
              <p className="subtitle">Select a MIDI controller profile to auto-configure mappings.</p>
            </div>
          </div>

          <div className="grid two">
            {profiles.map(profile => (
              <ProfileCard
                key={profile.profile_id}
                profile={profile}
                isActive={activeProfile?.profile_id === profile.profile_id}
                onApply={() => applyProfileMutation.mutate(profile.profile_id)}
                isApplying={applyProfileMutation.isPending}
              />
            ))}
          </div>

          {/* Active profile details */}
          {activeProfile && (
            <LegacyTile style={{ padding: 16, marginTop: 16 }}>
              <h4 style={{ marginBottom: 16 }}>
                <Music size={18} style={{ marginRight: 8 }} />
                {activeProfile.name} Layout
              </h4>

              <FootswitchLayout
                footswitches={activeProfile.footswitches}
                expressionPedals={activeProfile.expression_pedals}
              />

              {/* Bank controls */}
              {activeProfile.bank_config?.enabled && bankState && (
                <div
                  style={{
                    marginTop: 16,
                    padding: 16,
                    background: 'var(--surface-2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      Bank {bankState.current_bank + 1} of {bankState.max_banks}
                    </div>
                    <div className="subtitle">
                      Chains {bankState.pc_offset + 1} - {bankState.pc_offset + bankState.items_per_bank}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button
                      kind="tertiary"
                      onClick={() => bankDownMutation.mutate()}
                      disabled={bankState.current_bank === 0}
                    >
                      Bank Down
                    </Button>
                    <Button
                      kind="tertiary"
                      onClick={() => bankUpMutation.mutate()}
                      disabled={bankState.current_bank >= bankState.max_banks - 1}
                    >
                      Bank Up
                    </Button>
                  </div>
                </div>
              )}
            </LegacyTile>
          )}
        </>
      )}

      {/* Calibration Section */}
      {selectedSection === 'calibration' && activeProfile && (
        <>
          <div className="section-heading">
            <div>
              <h3>Expression Pedal Calibration</h3>
              <p className="subtitle">
                Fine-tune response curves and deadzones for expression pedals.
              </p>
            </div>
          </div>

          {activeProfile.expression_pedals.map(ep => (
            <ExpressionCalibrationPanel
              key={ep.pedal_id}
              pedalId={ep.pedal_id}
              label={ep.label}
              calibration={calibrations[ep.pedal_id] || null}
              onUpdate={(updates) => {
                updateCalibrationMutation.mutate({
                  pedal_id: ep.pedal_id,
                  ...updates,
                })
              }}
            />
          ))}

          {activeProfile.expression_pedals.length === 0 && (
            <InlineNotification
              kind="info"
              title="No expression pedals"
              subtitle="This profile does not have expression pedal configurations."
              hideCloseButton
              lowContrast
            />
          )}
        </>
      )}

      {/* Firmware Section */}
      {selectedSection === 'firmware' && activeProfile?.supports_firmware_update && (
        <>
          <div className="section-heading">
            <div>
              <h3>Firmware Update</h3>
              <p className="subtitle">
                Update device firmware using DFU mode.
              </p>
            </div>
          </div>

          <FirmwareUpdatePanel profileId={activeProfile.profile_id} />

          <InlineNotification
            kind="warning"
            title="Firmware Update Warning"
            subtitle="Only use official firmware files from trusted sources. Do not disconnect the device during flashing. Incorrect firmware may brick your device. MeloAudio no longer provides official support for this device."
            hideCloseButton
            lowContrast
            style={{ marginTop: 16 }}
          />
        </>
      )}
    </div>
  )
}

export default MIDICommanderSetup
