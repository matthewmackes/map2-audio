/**
 * T2499-B — Maschine MK1 onboarding wizard (web operator surface).
 *
 * Drives the per-unit onboarding orchestrator (tour → pad sensitivity →
 * pressure curves → LCD calibration → profile selection → ready) over the
 * /api/maschine/onboarding/* routes. This is the dual-surface web half: the
 * MK1's own LCD shows the same phases when the daemon is wired in; both share
 * one orchestrator instance, so progress made here is reflected on the device
 * and vice-versa.
 *
 * Per the T700 audit, the precise per-pad / per-curve capture is an on-device
 * gesture (tap each pad, press at known forces). The web surface owns the
 * *orchestration*: it connects the unit, walks the phases, lets the operator
 * accept sensible defaults for any phase they don't want to capture by hand,
 * and picks the boot profile from the T700 Q68 catalog.
 */
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Dropdown,
  Heading,
  InlineNotification,
  Layer,
  ProgressIndicator,
  ProgressStep,
  Section,
  Stack,
  TextInput,
  Tile,
} from '@carbon/react'

import { StatusChip } from '../../components/primitives'
import {
  maschineOnboardingApi,
  type OnboardingState,
  type OnboardingStatus,
  type ProfileCatalogEntry,
} from '../../../map2/clients/maschineOnboarding'

// Default section payloads — accepted when the operator opts not to capture a
// phase by hand on the device. Mirror the calibration-store schema shapes.
const DEFAULT_PAD_SENSITIVITY = Array.from({ length: 16 }, () => ({
  threshold: 8,
  max_velocity: 120,
}))

const DEFAULT_PRESSURE_CURVES = {
  per_pad: Array.from({ length: 16 }, () => ({ polynomial: [0.0, 1.0] })),
  global_compensation: 0.0,
}

const DEFAULT_LCD = { gamma: 1.0, per_lcd_bias: { left: 0, right: 0 } }

// Visible wizard steps (READY is the terminal success state, not a step).
const STEP_ORDER: OnboardingState[] = [
  'tour',
  'pad_sensitivity',
  'pressure_curves',
  'lcd_calibration',
  'profile_selection',
]

const STEP_LABELS: Record<string, string> = {
  tour: 'Tour',
  pad_sensitivity: 'Pad sensitivity',
  pressure_curves: 'Pressure curves',
  lcd_calibration: 'Screen calibration',
  profile_selection: 'Boot profile',
}

function stepIndexFor(state: OnboardingState): number {
  const idx = STEP_ORDER.indexOf(state)
  if (idx >= 0) return idx
  if (state === 'ready' || state === 'hot_load') return STEP_ORDER.length
  return -1
}

export interface MaschineOnboardingWizardProps {
  /** Test seam — inject a fake API so jest can drive the flow without fetch. */
  api?: typeof maschineOnboardingApi
}

export function MaschineOnboardingWizard({
  api = maschineOnboardingApi,
}: MaschineOnboardingWizardProps) {
  const queryClient = useQueryClient()
  const [serial, setSerial] = useState('')
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const statusQuery = useQuery({
    queryKey: ['maschine', 'onboarding', 'status'],
    queryFn: () => api.status(),
    refetchInterval: 2000,
  })

  const catalogQuery = useQuery({
    queryKey: ['maschine', 'onboarding', 'catalog'],
    queryFn: () => api.profileCatalog(),
    staleTime: 60_000,
  })

  const status: OnboardingStatus | undefined = statusQuery.data
  const state = status?.state ?? 'idle'
  const activeStep = stepIndexFor(state)

  const applyStatus = (next: OnboardingStatus) => {
    queryClient.setQueryData(['maschine', 'onboarding', 'status'], next)
    setError(null)
  }
  const onMutationError = (err: unknown) => {
    setError(err instanceof Error ? err.message : 'Onboarding step failed')
  }

  const connectMutation = useMutation({
    mutationFn: () => api.connect(serial.trim()),
    onSuccess: applyStatus,
    onError: onMutationError,
  })
  const tourMutation = useMutation({
    mutationFn: () => api.tourComplete(),
    onSuccess: applyStatus,
    onError: onMutationError,
  })
  const skipMutation = useMutation({
    mutationFn: () => api.skip(),
    onSuccess: applyStatus,
    onError: onMutationError,
  })
  const padMutation = useMutation({
    mutationFn: () => api.completePhase('pad_sensitivity', DEFAULT_PAD_SENSITIVITY),
    onSuccess: applyStatus,
    onError: onMutationError,
  })
  const pressureMutation = useMutation({
    mutationFn: () => api.completePhase('pressure_curves', DEFAULT_PRESSURE_CURVES),
    onSuccess: applyStatus,
    onError: onMutationError,
  })
  const lcdMutation = useMutation({
    mutationFn: () => api.completePhase('lcd_calibration', DEFAULT_LCD),
    onSuccess: applyStatus,
    onError: onMutationError,
  })
  const profileMutation = useMutation({
    mutationFn: () =>
      api.completePhase('profile_selection', { id: selectedProfile }),
    onSuccess: applyStatus,
    onError: onMutationError,
  })
  const resetMutation = useMutation({
    mutationFn: () => api.reset(),
    onSuccess: (next) => {
      applyStatus(next)
      setSelectedProfile(null)
      setSerial('')
    },
    onError: onMutationError,
  })

  const profiles: ProfileCatalogEntry[] = catalogQuery.data?.profiles ?? []
  const selectedProfileItem = useMemo(
    () => profiles.find((p) => p.id === selectedProfile) ?? null,
    [profiles, selectedProfile],
  )

  const busy =
    connectMutation.isPending ||
    tourMutation.isPending ||
    skipMutation.isPending ||
    padMutation.isPending ||
    pressureMutation.isPending ||
    lcdMutation.isPending ||
    profileMutation.isPending ||
    resetMutation.isPending

  return (
    <Section className="maschine-onboarding">
      <Stack gap={6}>
        <div>
          <Heading className="maschine-onboarding__title">
            Calibrate Maschine MK1
          </Heading>
          <p className="maschine-onboarding__subtitle">
            Headless onboarding for the MK1 as a primary console: pad sensitivity,
            pressure curves, screen calibration, and boot-profile selection.
            Captured calibration is keyed by the unit&apos;s USB serial and follows
            the device between hosts.
          </p>
        </div>

        {error ? (
          <InlineNotification
            kind="error"
            title="Onboarding error"
            subtitle={error}
            lowContrast
            onCloseButtonClick={() => setError(null)}
          />
        ) : null}

        <Layer>
          <Tile className="maschine-onboarding__status">
            <Stack gap={3} orientation="horizontal">
              <StatusChip
                tone={state === 'ready' ? 'ok' : state === 'idle' ? 'neutral' : 'info'}
                size="sm"
                label={STEP_LABELS[state] ?? (state === 'ready' ? 'Ready' : state)}
                dot
              />
              {status?.usb_serial ? (
                <StatusChip tone="neutral" size="sm" label={status.usb_serial} />
              ) : null}
            </Stack>
          </Tile>
        </Layer>

        {state !== 'idle' && state !== 'disconnected' ? (
          <ProgressIndicator
            currentIndex={activeStep}
            spaceEqually
            className="maschine-onboarding__progress"
          >
            {STEP_ORDER.map((step) => (
              <ProgressStep key={step} label={STEP_LABELS[step]} />
            ))}
          </ProgressIndicator>
        ) : null}

        {/* Step 0 — connect a unit */}
        {state === 'idle' || state === 'disconnected' ? (
          <Layer>
            <Tile>
              <Stack gap={4}>
                <p>
                  Enter the MK1&apos;s USB serial to begin. If the unit was
                  calibrated before, it hot-loads straight to ready.
                </p>
                <TextInput
                  id="maschine-onboarding-serial"
                  labelText="USB serial"
                  placeholder="e.g. MK1A1B2C3D4"
                  value={serial}
                  onChange={(e) => setSerial(e.target.value)}
                />
                <Button
                  disabled={!serial.trim() || busy}
                  onClick={() => connectMutation.mutate()}
                >
                  Begin onboarding
                </Button>
              </Stack>
            </Tile>
          </Layer>
        ) : null}

        {/* Step 1 — tour */}
        {state === 'tour' ? (
          <Layer>
            <Tile>
              <Stack gap={4}>
                <p>
                  The 10-step LCD tour introduces the console layout on the unit
                  itself. Complete it on the device, then continue — or skip the
                  whole flow to boot on default calibration.
                </p>
                <Stack gap={3} orientation="horizontal">
                  <Button disabled={busy} onClick={() => tourMutation.mutate()}>
                    Tour complete — continue
                  </Button>
                  <Button
                    kind="ghost"
                    disabled={busy}
                    onClick={() => skipMutation.mutate()}
                  >
                    Skip — use defaults
                  </Button>
                </Stack>
              </Stack>
            </Tile>
          </Layer>
        ) : null}

        {/* Step 2 — pad sensitivity */}
        {state === 'pad_sensitivity' ? (
          <PhaseTile
            title="Pad sensitivity"
            body="Tap each of the 16 pads lightly then hard on the device to capture per-pad thresholds. Or accept defaults to continue."
            busy={busy}
            onAccept={() => padMutation.mutate()}
          />
        ) : null}

        {/* Step 3 — pressure curves */}
        {state === 'pressure_curves' ? (
          <PhaseTile
            title="Pressure curves"
            body="Press each pad through its full range to fit a per-pad response curve. Or accept linear defaults."
            busy={busy}
            onAccept={() => pressureMutation.mutate()}
          />
        ) : null}

        {/* Step 4 — LCD calibration */}
        {state === 'lcd_calibration' ? (
          <PhaseTile
            title="Screen calibration"
            body="Tune the dual-LCD gamma and per-screen bias on the device. Or accept neutral defaults."
            busy={busy}
            onAccept={() => lcdMutation.mutate()}
          />
        ) : null}

        {/* Step 5 — profile selection */}
        {state === 'profile_selection' ? (
          <Layer>
            <Tile>
              <Stack gap={4}>
                <p>Pick the boot profile this MK1 starts in (T700 catalog).</p>
                <Dropdown
                  id="maschine-onboarding-profile"
                  titleText="Boot profile"
                  label="Select a profile"
                  items={profiles}
                  itemToString={(item) =>
                    item ? `${(item as ProfileCatalogEntry).id} — ${(item as ProfileCatalogEntry).name}` : ''
                  }
                  selectedItem={selectedProfileItem}
                  onChange={({ selectedItem }) =>
                    setSelectedProfile(
                      selectedItem ? (selectedItem as ProfileCatalogEntry).id : null,
                    )
                  }
                />
                <Button
                  disabled={!selectedProfile || busy}
                  onClick={() => profileMutation.mutate()}
                >
                  Finish onboarding
                </Button>
              </Stack>
            </Tile>
          </Layer>
        ) : null}

        {/* Terminal — ready */}
        {state === 'ready' || state === 'hot_load' ? (
          <Layer>
            <Tile className="maschine-onboarding__done">
              <Stack gap={4}>
                <StatusChip tone="ok" size="sm" label="Onboarding complete" dot />
                <p>
                  This MK1 is calibrated and ready as a primary console. Its
                  calibration is saved per USB serial and reused on next connect.
                </p>
                <Button
                  kind="tertiary"
                  disabled={busy}
                  onClick={() => resetMutation.mutate()}
                >
                  Onboard another unit
                </Button>
              </Stack>
            </Tile>
          </Layer>
        ) : null}
      </Stack>
    </Section>
  )
}

interface PhaseTileProps {
  title: string
  body: string
  busy: boolean
  onAccept: () => void
}

function PhaseTile({ title, body, busy, onAccept }: PhaseTileProps) {
  return (
    <Layer>
      <Tile>
        <Stack gap={4}>
          <Heading className="maschine-onboarding__phase-title">{title}</Heading>
          <p>{body}</p>
          <Button disabled={busy} onClick={onAccept}>
            Accept defaults — continue
          </Button>
        </Stack>
      </Tile>
    </Layer>
  )
}
