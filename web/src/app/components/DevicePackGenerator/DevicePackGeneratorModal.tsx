/**
 * T2492-1 — Device-Pack Generator Wizard Modal.
 *
 * 5-step Carbon Modal that walks the operator through synthesizing
 * a draft device-pack from a connected USB MIDI adapter:
 *
 *   1. Detected device summary (read-only)
 *   2. Enrichment lookup (Mixxx + USB-IF; operator picks template / scratch)
 *   3. Review synthesized manifest
 *   4. Edit XML / JS scaffolding
 *   5. Commit to device-packs/<vendor>/<model>/
 *
 * Trigger entry points (wired in T2491 cleanup loop):
 *   - Carbon Tag on /midi/connections (per-row "Unknown device")
 *   - InlineNotification banner on /midi/devices (top-of-page)
 *
 * See `docs/architecture/DEVICE_PACK_AUTO_GENERATION.md`.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  CodeSnippet,
  InlineLoading,
  InlineNotification,
  Modal,
  ProgressIndicator,
  ProgressStep,
  TextArea,
  TextInput,
  Tile,
  Tag,
  RadioButton,
  RadioButtonGroup,
} from '@carbon/react'

import {
  devicePackAutoGenApi,
  type DevicePackLookupResponse,
  type DevicePackOperatorChoice,
  type DevicePackSynthesizeResponse,
  type DevicePackCommitResponse,
} from '../../../map2/clients/devicePackAutoGen'
import { ApiError } from '../../../map2/http'

/**
 * T2492-1a — extract a human-readable error message from an ApiError.
 *
 * The backend returns FastAPI's standard `{detail: "..."}` envelope on
 * 4xx/5xx; ApiError stashes that in `body`. The default ApiError
 * .message is just "API Error 500: Internal Server Error" which
 * hides the actual reason from the operator (the bug surfaced when a
 * commit failed with a read-only filesystem and operators saw the
 * generic message instead of the actionable target-dir reason).
 */
function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    const body = err.body
    if (body && typeof body === 'object' && 'detail' in body) {
      const detail = (body as { detail: unknown }).detail
      if (typeof detail === 'string' && detail.length > 0) {
        return detail
      }
    }
    return `${err.statusText || 'Error'} (${err.status})`
  }
  if (err instanceof Error) return err.message
  return String(err)
}

export interface DevicePackGeneratorTriggerDevice {
  vid: string
  pid: string
  alsa_name?: string
  usb_manufacturer?: string
  usb_product?: string
}

export interface DevicePackGeneratorModalProps {
  open: boolean
  device: DevicePackGeneratorTriggerDevice | null
  onClose: () => void
  onCommitted?: (result: DevicePackCommitResponse) => void
}

type WizardStep = 'detected' | 'enrichment' | 'manifest' | 'scaffolding' | 'commit'

const STEP_ORDER: WizardStep[] = ['detected', 'enrichment', 'manifest', 'scaffolding', 'commit']

function stepIndex(step: WizardStep): number {
  return STEP_ORDER.indexOf(step)
}

export function DevicePackGeneratorModal({
  open,
  device,
  onClose,
  onCommitted,
}: DevicePackGeneratorModalProps) {
  const [step, setStep] = useState<WizardStep>('detected')
  const [lookup, setLookup] = useState<DevicePackLookupResponse | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [operatorChoice, setOperatorChoice] = useState<DevicePackOperatorChoice>('auto')
  const [synth, setSynth] = useState<DevicePackSynthesizeResponse | null>(null)
  const [synthError, setSynthError] = useState<string | null>(null)
  const [synthLoading, setSynthLoading] = useState(false)
  const [editedXml, setEditedXml] = useState('')
  const [editedJs, setEditedJs] = useState('')
  const [vendorOverride, setVendorOverride] = useState('')
  const [modelOverride, setModelOverride] = useState('')
  const [commitError, setCommitError] = useState<string | null>(null)
  const [commitLoading, setCommitLoading] = useState(false)
  const [commitResult, setCommitResult] = useState<DevicePackCommitResponse | null>(null)

  // Reset all state when the modal opens fresh, or when the device changes.
  useEffect(() => {
    if (!open) return
    setStep('detected')
    setLookup(null)
    setLookupError(null)
    setLookupLoading(false)
    setOperatorChoice('auto')
    setSynth(null)
    setSynthError(null)
    setSynthLoading(false)
    setEditedXml('')
    setEditedJs('')
    setVendorOverride('')
    setModelOverride('')
    setCommitError(null)
    setCommitLoading(false)
    setCommitResult(null)
  }, [open, device?.vid, device?.pid])

  // Auto-fire the lookup when entering step 2.
  useEffect(() => {
    if (!open || step !== 'enrichment' || !device) return
    if (lookup || lookupLoading) return
    setLookupLoading(true)
    setLookupError(null)
    devicePackAutoGenApi
      .lookup({ vid: device.vid, pid: device.pid })
      .then((res) => setLookup(res))
      .catch((err) => setLookupError(describeError(err)))
      .finally(() => setLookupLoading(false))
  }, [open, step, device, lookup, lookupLoading])

  // Auto-fire the synthesis when entering step 3 (and any time the
  // operator changes their template choice on step 2).
  useEffect(() => {
    if (!open || step !== 'manifest' || !device) return
    if (synth || synthLoading) return
    setSynthLoading(true)
    setSynthError(null)
    devicePackAutoGenApi
      .synthesize({
        vid: device.vid,
        pid: device.pid,
        alsa_name: device.alsa_name ?? '',
        usb_manufacturer: device.usb_manufacturer ?? '',
        usb_product: device.usb_product ?? '',
        operator_choice: operatorChoice,
      })
      .then((res) => {
        setSynth(res)
        setEditedXml(res.mapping_xml)
        setEditedJs(res.scripts_js)
        setVendorOverride(res.suggested_vendor)
        setModelOverride(res.suggested_model)
      })
      .catch((err) => setSynthError(describeError(err)))
      .finally(() => setSynthLoading(false))
  }, [open, step, device, synth, synthLoading, operatorChoice])

  const canAdvanceFromDetected = device !== null
  const canAdvanceFromEnrichment = !lookupLoading && lookupError === null
  const canAdvanceFromManifest = synth !== null
  const canAdvanceFromScaffolding = editedXml.trim().length > 0
  const canCommit =
    !commitLoading &&
    synth !== null &&
    vendorOverride.trim().length > 0 &&
    modelOverride.trim().length > 0

  const advance = () => {
    const idx = stepIndex(step)
    if (idx >= 0 && idx < STEP_ORDER.length - 1) {
      setStep(STEP_ORDER[idx + 1])
    }
  }
  const retreat = () => {
    const idx = stepIndex(step)
    if (idx > 0) setStep(STEP_ORDER[idx - 1])
  }

  const handleCommit = async () => {
    if (!synth) return
    setCommitLoading(true)
    setCommitError(null)
    try {
      const result = await devicePackAutoGenApi.commit({
        vendor: vendorOverride,
        model: modelOverride,
        manifest_yaml: synth.manifest_yaml,
        mapping_xml: editedXml,
        scripts_js: editedJs,
        overwrite: false,
      })
      setCommitResult(result)
      onCommitted?.(result)
    } catch (err) {
      setCommitError(describeError(err))
    } finally {
      setCommitLoading(false)
    }
  }

  const primaryButtonText = useMemo(() => {
    switch (step) {
      case 'detected':
        return 'Look up'
      case 'enrichment':
        return 'Synthesize'
      case 'manifest':
        return 'Edit scaffolding'
      case 'scaffolding':
        return 'Review & commit'
      case 'commit':
        return commitResult ? 'Done' : 'Commit pack'
    }
  }, [step, commitResult])

  const primaryDisabled = useMemo(() => {
    switch (step) {
      case 'detected':
        return !canAdvanceFromDetected
      case 'enrichment':
        return !canAdvanceFromEnrichment
      case 'manifest':
        return !canAdvanceFromManifest
      case 'scaffolding':
        return !canAdvanceFromScaffolding
      case 'commit':
        return commitResult ? false : !canCommit
    }
  }, [
    step,
    canAdvanceFromDetected,
    canAdvanceFromEnrichment,
    canAdvanceFromManifest,
    canAdvanceFromScaffolding,
    canCommit,
    commitResult,
  ])

  const handlePrimary = () => {
    if (step === 'commit') {
      if (commitResult) {
        onClose()
      } else {
        void handleCommit()
      }
    } else {
      advance()
    }
  }

  return (
    <Modal
      open={open}
      modalHeading="Generate device-pack"
      modalLabel="MIDI Services / Devices"
      primaryButtonText={primaryButtonText}
      primaryButtonDisabled={primaryDisabled}
      secondaryButtonText={step === 'detected' ? 'Cancel' : 'Back'}
      onRequestClose={onClose}
      onRequestSubmit={handlePrimary}
      onSecondarySubmit={step === 'detected' ? onClose : retreat}
      size="lg"
      data-testid="device-pack-generator-modal"
    >
      <ProgressIndicator currentIndex={stepIndex(step)} spaceEqually>
        <ProgressStep label="Detected" />
        <ProgressStep label="Enrichment" />
        <ProgressStep label="Manifest" />
        <ProgressStep label="Scaffolding" />
        <ProgressStep label="Commit" />
      </ProgressIndicator>

      <div style={{ marginBlockStart: 'var(--cds-spacing-05, 1rem)' }}>
        {step === 'detected' && device && (
          <Tile>
            <h4 style={{ margin: 0 }}>Detected USB MIDI adapter</h4>
            <dl style={{ marginBlockStart: 'var(--cds-spacing-04, 0.75rem)' }}>
              <dt>USB VID</dt>
              <dd><code>{device.vid}</code></dd>
              <dt>USB PID</dt>
              <dd><code>{device.pid}</code></dd>
              {device.usb_manufacturer && (
                <>
                  <dt>USB manufacturer string</dt>
                  <dd>{device.usb_manufacturer}</dd>
                </>
              )}
              {device.usb_product && (
                <>
                  <dt>USB product string</dt>
                  <dd>{device.usb_product}</dd>
                </>
              )}
              {device.alsa_name && (
                <>
                  <dt>ALSA client/port</dt>
                  <dd>{device.alsa_name}</dd>
                </>
              )}
            </dl>
          </Tile>
        )}

        {step === 'enrichment' && (
          <>
            {lookupLoading && <InlineLoading description="Looking up VID:PID against Mixxx + USB-IF…" />}
            {lookupError && (
              <InlineNotification
                kind="error"
                lowContrast
                hideCloseButton
                title="Lookup failed"
                subtitle={lookupError}
              />
            )}
            {lookup && (
              <>
                <Tile>
                  <h4 style={{ margin: 0 }}>Mixxx mapping match</h4>
                  {lookup.mixxx_match ? (
                    <>
                      <p style={{ marginBlockStart: 'var(--cds-spacing-03, 0.5rem)' }}>
                        <Tag type="green" size="sm">Hit</Tag>{' '}
                        <strong>{lookup.mixxx_match.device_name}</strong>
                      </p>
                      <p>
                        Template: <code>{lookup.mixxx_match.mapping_file}</code>
                      </p>
                      <p>
                        Upstream Mixxx commit:{' '}
                        <code>{lookup.mixxx_match.upstream_commit.slice(0, 12)}</code>
                      </p>
                    </>
                  ) : (
                    <p style={{ marginBlockStart: 'var(--cds-spacing-03, 0.5rem)' }}>
                      <Tag type="gray" size="sm">No match</Tag>{' '}
                      No Mixxx HID/bulk template for this VID:PID. Q4=A: MIDI-only
                      Mixxx mappings are not VID:PID-keyed and won't match here.
                    </p>
                  )}
                </Tile>
                <Tile style={{ marginBlockStart: 'var(--cds-spacing-04, 0.75rem)' }}>
                  <h4 style={{ margin: 0 }}>USB-IF vendor lookup</h4>
                  {lookup.usbif_match ? (
                    <p style={{ marginBlockStart: 'var(--cds-spacing-03, 0.5rem)' }}>
                      <Tag type="cool-gray" size="sm">Vendor</Tag>{' '}
                      {lookup.usbif_match.vendor_name ?? '(unknown)'}
                      {lookup.usbif_match.product_name && (
                        <>
                          {' '}— Product: {lookup.usbif_match.product_name}
                        </>
                      )}
                    </p>
                  ) : (
                    <p style={{ marginBlockStart: 'var(--cds-spacing-03, 0.5rem)' }}>
                      <Tag type="gray" size="sm">No match</Tag> Vendor not in usb.ids.
                    </p>
                  )}
                </Tile>
                <div style={{ marginBlockStart: 'var(--cds-spacing-05, 1rem)' }}>
                  <h4 style={{ margin: 0 }}>Choose template strategy</h4>
                  <RadioButtonGroup
                    name="operator-choice"
                    valueSelected={operatorChoice}
                    onChange={(value) => {
                      setOperatorChoice(value as DevicePackOperatorChoice)
                      setSynth(null)
                    }}
                    orientation="vertical"
                    style={{ marginBlockStart: 'var(--cds-spacing-03, 0.5rem)' }}
                  >
                    <RadioButton
                      value="auto"
                      labelText="Auto (use Mixxx template if matched, else from scratch)"
                      id="op-auto"
                    />
                    <RadioButton
                      value="use-mixxx-template"
                      labelText="Force Mixxx template"
                      id="op-mixxx"
                      disabled={!lookup.mixxx_match}
                    />
                    <RadioButton
                      value="from-scratch"
                      labelText="Generate from scratch"
                      id="op-scratch"
                    />
                  </RadioButtonGroup>
                </div>
              </>
            )}
          </>
        )}

        {step === 'manifest' && (
          <>
            {synthLoading && <InlineLoading description="Synthesizing manifest…" />}
            {synthError && (
              <InlineNotification
                kind="error"
                lowContrast
                hideCloseButton
                title="Synthesis failed"
                subtitle={synthError}
              />
            )}
            {synth && (
              <>
                {synth.used_mixxx_template ? (
                  <InlineNotification
                    kind="info"
                    lowContrast
                    hideCloseButton
                    title="Mixxx template will be used as the seed"
                    subtitle={`Template: ${synth.mixxx_template_path}. The original GPL-2.0-or-later license header is preserved verbatim in the committed pack.`}
                  />
                ) : (
                  <InlineNotification
                    kind="info"
                    lowContrast
                    hideCloseButton
                    title="From-scratch scaffold"
                    subtitle="No Mixxx template was applied. The scaffolding step gives you a minimal XML + JS skeleton you can edit before commit."
                  />
                )}
                <h4 style={{ marginBlockStart: 'var(--cds-spacing-04, 0.75rem)', marginBlockEnd: 'var(--cds-spacing-03, 0.5rem)' }}>
                  Synthesized manifest (.MAP2.yaml)
                </h4>
                <CodeSnippet type="multi" feedback="Copied" wrapText>
                  {synth.manifest_yaml}
                </CodeSnippet>
              </>
            )}
          </>
        )}

        {step === 'scaffolding' && synth && (
          <>
            <p>
              Edit the XML mapping and JS script before commit. The two text areas
              below are pre-filled — XML is required, JS is optional.
            </p>
            <TextArea
              id="device-pack-xml"
              labelText="Mapping XML"
              rows={12}
              value={editedXml}
              onChange={(e) => setEditedXml(e.target.value)}
              style={{ fontFamily: 'var(--cds-code-01-font-family, monospace)' }}
            />
            <TextArea
              id="device-pack-js"
              labelText="Scripts JS"
              rows={10}
              value={editedJs}
              onChange={(e) => setEditedJs(e.target.value)}
              style={{
                fontFamily: 'var(--cds-code-01-font-family, monospace)',
                marginBlockStart: 'var(--cds-spacing-04, 0.75rem)',
              }}
            />
          </>
        )}

        {step === 'commit' && synth && (
          <>
            {!commitResult && (
              <>
                <p>
                  Confirm the target directory before commit. The pack lands at{' '}
                  <code>device-packs/&lt;vendor&gt;/&lt;model&gt;/</code>.
                </p>
                <TextInput
                  id="device-pack-vendor"
                  labelText="Vendor (slug)"
                  helperText="Lowercase, no spaces — used as the directory name."
                  value={vendorOverride}
                  onChange={(e) => setVendorOverride(e.target.value)}
                />
                <TextInput
                  id="device-pack-model"
                  labelText="Model (slug)"
                  helperText="Lowercase, no spaces — used as the directory name."
                  value={modelOverride}
                  onChange={(e) => setModelOverride(e.target.value)}
                  style={{ marginBlockStart: 'var(--cds-spacing-04, 0.75rem)' }}
                />
              </>
            )}
            {commitLoading && <InlineLoading description="Writing pack to disk…" />}
            {commitError && (
              <InlineNotification
                kind="error"
                lowContrast
                hideCloseButton
                title="Commit failed"
                subtitle={commitError}
              />
            )}
            {commitResult && (
              <InlineNotification
                kind="success"
                lowContrast
                hideCloseButton
                title="Pack committed"
                subtitle={`Profile key: ${commitResult.profile_key}. Files written to ${commitResult.pack_dir}/.`}
              />
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

export default DevicePackGeneratorModal
