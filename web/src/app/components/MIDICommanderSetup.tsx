/**
 * MIDI Commander Setup Component
 *
 * Provides device profile management, expression pedal calibration,
 * and firmware update capabilities for the MeloAudio MIDI Commander.
 */

import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Chip,
  Switch,
  FormControlLabel,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  LinearProgress,
  Alert,
  AlertTitle,
  TextField,
  Stepper,
  Step,
  StepLabel,
  StepContent,
} from '@mui/material'
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
import { useToasts } from './Toasts'
import { LegacyTile } from './shared/LegacyTile'

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
        <Chip
          label="Active"
          color="success"
          size="small"
          style={{ position: 'absolute', top: 8, right: 8 }}
        />
      )}
      {profile.is_recommended && !isActive && (
        <Chip
          label="Recommended"
          color="primary"
          size="small"
          variant="outlined"
          style={{ position: 'absolute', top: 8, right: 8 }}
        />
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
          <Chip
            label={`${profile.footswitches.length} Switches`}
            size="small"
            variant="outlined"
          />
        )}
        {profile.expression_pedals.length > 0 && (
          <Chip
            label={`${profile.expression_pedals.length} Expression`}
            size="small"
            variant="outlined"
          />
        )}
        {profile.bank_config?.enabled && (
          <Chip
            label={`${profile.bank_config.max_banks} Banks`}
            size="small"
            variant="outlined"
          />
        )}
        {profile.supports_firmware_update && (
          <Chip
            icon={<Upload size={12} />}
            label="DFU"
            size="small"
            variant="outlined"
          />
        )}
      </div>

      {!isActive && (
        <Button
          variant="contained"
          onClick={onApply}
          disabled={isApplying}
          fullWidth
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
    <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 16 }}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div
          style={{
            background: '#111',
            color: '#0f0',
            fontFamily: 'var(--font-mono)',
            padding: '8px 24px',
            borderRadius: 4,
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
                padding: '8px 16px',
                background: 'var(--surface-3)',
                borderRadius: 4,
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
              <LinearProgress
                variant="determinate"
                value={(processedValue || 0) * 100}
                sx={{ height: 8, borderRadius: 4 }}
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
            <FormControl fullWidth size="small">
              <InputLabel>Response Curve</InputLabel>
              <Select
                value={draftCalibration.curve}
                label="Response Curve"
                onChange={(e) => commitCalibration({ curve: e.target.value as MIDIExpressionCurve })}
              >
                <MenuItem value="linear">Linear</MenuItem>
                <MenuItem value="logarithmic">Logarithmic (Smooth start)</MenuItem>
                <MenuItem value="exponential">Exponential (Smooth end)</MenuItem>
                <MenuItem value="s_curve">S-Curve (Smooth both)</MenuItem>
              </Select>
            </FormControl>
          </div>

          {/* Invert toggle */}
          <FormControlLabel
            control={
              <Switch
                checked={draftCalibration.invert}
                onChange={(e) => commitCalibration({ invert: e.target.checked })}
              />
            }
            label="Invert Direction"
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
        <Alert severity="warning" style={{ marginBottom: 16 }}>
          <AlertTitle>dfu-util not installed</AlertTitle>
          {dfuStatus?.install_hint && (
            <code style={{ display: 'block', marginTop: 8 }}>
              {dfuStatus.install_hint}
            </code>
          )}
        </Alert>
      )}

      <Stepper activeStep={activeStep} orientation="vertical">
        <Step>
          <StepLabel>Enter DFU Mode</StepLabel>
          <StepContent>
            {instructions && (
              <div style={{ marginBottom: 16 }}>
                <ol style={{ paddingLeft: 20, margin: 0 }}>
                  {instructions.steps.map((step, i) => (
                    <li key={i} style={{ marginBottom: 8 }}>{step}</li>
                  ))}
                </ol>
                {instructions.notes.length > 0 && (
                  <Alert severity="info" style={{ marginTop: 12 }}>
                    {instructions.notes.map((note, i) => (
                      <div key={i}>{note}</div>
                    ))}
                  </Alert>
                )}
              </div>
            )}
            <Button
              variant="contained"
              onClick={() => setActiveStep(1)}
              disabled={!dfuStatus?.dfu_available}
            >
              Continue
            </Button>
          </StepContent>
        </Step>

        <Step>
          <StepLabel>Verify DFU Connection</StepLabel>
          <StepContent>
            <div style={{ marginBottom: 16 }}>
              {dfuStatus?.devices_in_dfu_mode.length ? (
                <Alert severity="success">
                  <AlertTitle>Device detected in DFU mode</AlertTitle>
                  {dfuStatus.devices_in_dfu_mode.map((d, i) => (
                    <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      {d.raw}
                    </div>
                  ))}
                </Alert>
              ) : (
                <Alert severity="warning">
                  <AlertTitle>No device in DFU mode</AlertTitle>
                  Follow the steps above to enter DFU mode, then click Refresh.
                </Alert>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={() => dfuStatusQuery.refetch()}>
                <Renew size={16} /> Refresh
              </Button>
              <Button
                variant="contained"
                onClick={() => setActiveStep(2)}
                disabled={!dfuStatus?.devices_in_dfu_mode.length}
              >
                Continue
              </Button>
            </div>
          </StepContent>
        </Step>

        <Step>
          <StepLabel>Flash Firmware</StepLabel>
          <StepContent>
            <TextField
              fullWidth
              label="Firmware File Path"
              value={firmwarePath}
              onChange={(e) => setFirmwarePath(e.target.value)}
              placeholder="/path/to/firmware.dfu"
              style={{ marginBottom: 16 }}
              helperText="Enter the full path to the .dfu firmware file"
            />

            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={() => setActiveStep(1)}>Back</Button>
              <Button
                variant="contained"
                color="primary"
                onClick={() => flashMutation.mutate()}
                disabled={!firmwarePath || flashMutation.isPending}
              >
                {flashMutation.isPending ? 'Flashing...' : 'Flash Firmware'}
              </Button>
            </div>

            {flashMutation.isPending && (
              <LinearProgress style={{ marginTop: 16 }} />
            )}
          </StepContent>
        </Step>

        <Step>
          <StepLabel>Complete</StepLabel>
          <StepContent>
            <Alert severity="success" style={{ marginBottom: 16 }}>
              <AlertTitle>Firmware Updated</AlertTitle>
              Power cycle the device to complete the update.
              {instructions?.exit_dfu && (
                <div style={{ marginTop: 8 }}>{instructions.exit_dfu}</div>
              )}
            </Alert>
            <Button onClick={() => setActiveStep(0)}>Start Over</Button>
          </StepContent>
        </Step>
      </Stepper>
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
          variant={selectedSection === 'profiles' ? 'contained' : 'outlined'}
          onClick={() => setSelectedSection('profiles')}
          size="small"
        >
          <Settings size={16} style={{ marginRight: 4 }} /> Profiles
        </Button>
        <Button
          variant={selectedSection === 'calibration' ? 'contained' : 'outlined'}
          onClick={() => setSelectedSection('calibration')}
          size="small"
          disabled={!activeProfile}
        >
          <MeterAlt size={16} style={{ marginRight: 4 }} /> Calibration
        </Button>
        <Button
          variant={selectedSection === 'firmware' ? 'contained' : 'outlined'}
          onClick={() => setSelectedSection('firmware')}
          size="small"
          disabled={!activeProfile?.supports_firmware_update}
        >
          <Upload size={16} style={{ marginRight: 4 }} /> Firmware
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
                    borderRadius: 8,
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
                      variant="outlined"
                      onClick={() => bankDownMutation.mutate()}
                      disabled={bankState.current_bank === 0}
                    >
                      Bank Down
                    </Button>
                    <Button
                      variant="outlined"
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
            <Alert severity="info">
              This profile does not have expression pedal configurations.
            </Alert>
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

          <Alert severity="warning" style={{ marginTop: 16 }}>
            <AlertTitle>Firmware Update Warning</AlertTitle>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li>Only use official firmware files from trusted sources</li>
              <li>Do not disconnect the device during flashing</li>
              <li>Incorrect firmware may brick your device</li>
              <li>MeloAudio no longer provides official support for this device</li>
            </ul>
          </Alert>
        </>
      )}
    </div>
  )
}

export default MIDICommanderSetup
