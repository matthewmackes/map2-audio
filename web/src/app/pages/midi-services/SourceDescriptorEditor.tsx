/**
 * T2482 loop 12 / iter 113 — SourceDescriptorEditor.
 *
 * Carbon-driven structured editor for a binding's source_descriptor.
 * Renders fields per the iter-112 SOURCE_TYPE_SPECS catalogue.
 *
 * Per the iter-111 plan D1: the editor emits a plain dict; backend
 * is the validation authority. Frontend constraints (min/max on
 * number inputs) are pure UX and don't enforce dict-shape rules.
 *
 * Per D2: unknown extras passed in via the `unknownExtras` prop are
 * preserved invisibly — the parent re-merges them on Save via
 * sourceDescriptors.mergeForSave().
 *
 * Per D3: when the parent toggles `showAdvancedJson`, this component
 * also surfaces a JSON textarea fallback so operators can drop down
 * to raw JSON for backend-extension fields.
 */

import { useCallback, useMemo } from 'react'
import {
  Button,
  Dropdown,
  FormGroup,
  InlineNotification,
  TextArea,
  TextInput,
} from '@carbon/react'

import {
  getSourceSpec,
  type SourceFieldSpec,
} from './sourceDescriptors'
import { useMidiLearnPoll } from './useMidiLearnPoll'
import type { BindingSourceType, LastCcResponse } from '../../../map2/clients/midiBindings'
import './SourceDescriptorEditor.css'

interface SourceDescriptorEditorProps {
  sourceType: BindingSourceType
  /**
   * The known-fields-only descriptor slice. Parent calls
   * `extractKnownAndUnknown` before passing it in.
   */
  value: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void

  /**
   * The unknown extras slice (also from extractKnownAndUnknown). Used
   * here only for display when `showAdvancedJson` is on; parent owns
   * the mergeForSave step.
   */
  unknownExtras?: Record<string, unknown>

  /**
   * If true, render an "Advanced (JSON)" disclosure that shows the
   * full descriptor (known + unknown) as a JSON textarea. Per the
   * iter-111 D3, this is the forward-compat escape hatch.
   */
  advancedJson?: string
  onAdvancedJsonChange?: (raw: string) => void
  advancedJsonError?: string | null
}

function readNumber(val: unknown): string {
  if (val === null || val === undefined) return ''
  if (typeof val === 'number') return String(val)
  if (typeof val === 'string') return val
  return ''
}

function readString(val: unknown): string {
  if (val === null || val === undefined) return ''
  return String(val)
}

function FieldEditor({
  field,
  value,
  onChange,
  inputId,
}: {
  field: SourceFieldSpec
  value: unknown
  onChange: (next: unknown) => void
  inputId: string
}) {
  if (field.kind === 'enum' && field.enumValues) {
    return (
      <Dropdown
        id={inputId}
        titleText=""
        label={`Pick ${field.label}`}
        items={[...field.enumValues]}
        selectedItem={readString(value) || undefined}
        onChange={({ selectedItem }) => onChange(selectedItem ?? undefined)}
      />
    )
  }
  if (field.kind === 'int' || field.kind === 'float') {
    return (
      <TextInput
        id={inputId}
        labelText=""
        type="number"
        value={readNumber(value)}
        min={field.min}
        max={field.max}
        step={field.step ?? (field.kind === 'int' ? 1 : 0.01)}
        helperText={field.helperText}
        onChange={(e) => {
          const raw = e.target.value
          if (raw === '') {
            onChange(undefined)
            return
          }
          const parsed = field.kind === 'int' ? parseInt(raw, 10) : parseFloat(raw)
          if (Number.isFinite(parsed)) {
            onChange(parsed)
          }
        }}
      />
    )
  }
  // string fallback
  return (
    <TextInput
      id={inputId}
      labelText=""
      value={readString(value)}
      helperText={field.helperText}
      onChange={(e) => {
        const raw = e.target.value
        onChange(raw === '' ? undefined : raw)
      }}
    />
  )
}

export function SourceDescriptorEditor({
  sourceType,
  value,
  onChange,
  unknownExtras,
  advancedJson,
  onAdvancedJsonChange,
  advancedJsonError,
}: SourceDescriptorEditorProps) {
  const spec = useMemo(() => getSourceSpec(sourceType), [sourceType])

  const handleFieldChange = (fieldKey: string, next: unknown) => {
    const updated = { ...value }
    if (next === undefined || next === null || next === '') {
      delete updated[fieldKey]
    } else {
      updated[fieldKey] = next
    }
    onChange(updated)
  }

  // T2483-5 iter 175 — live MIDI-learn helper for the cc + channel
  // fields. Only rendered when source_type is midi_cc.
  const handleLearnCapture = useCallback(
    (cc: LastCcResponse) => {
      const updated: Record<string, unknown> = { ...value, cc: cc.cc }
      if (cc.channel !== null) {
        updated.channel = cc.channel
      }
      onChange(updated)
    },
    [value, onChange],
  )
  const learn = useMidiLearnPoll({ onCapture: handleLearnCapture })

  if (!spec) {
    return (
      <InlineNotification
        kind="warning"
        lowContrast
        hideCloseButton
        title="No editor metadata for this source type"
        subtitle={`Source type "${sourceType}" has no entry in SOURCE_TYPE_SPECS. Use the Advanced JSON disclosure to author the descriptor directly.`}
      />
    )
  }

  const unknownCount = unknownExtras ? Object.keys(unknownExtras).length : 0

  return (
    <div className="source-descriptor-editor">
      <div className="source-descriptor-editor__fields">
        {spec.fields.map((field) => (
          <FormGroup
            key={field.key}
            legendText={
              field.required ? `${field.label} (required)` : field.label
            }
          >
            <FieldEditor
              field={field}
              value={value[field.key]}
              onChange={(next) => handleFieldChange(field.key, next)}
              inputId={`source-desc-${sourceType}-${field.key}`}
            />
          </FormGroup>
        ))}
      </div>

      {sourceType === 'midi_cc' ? (
        <div className="source-descriptor-editor__learn">
          {learn.active ? (
            <>
              <span className="source-descriptor-editor__learn-status">
                Listening for the next CC… (10s timeout)
              </span>
              <Button kind="ghost" size="sm" onClick={learn.cancel}>
                Cancel
              </Button>
            </>
          ) : (
            <Button kind="tertiary" size="sm" onClick={learn.start}>
              Learn from MIDI
            </Button>
          )}
        </div>
      ) : null}

      {unknownCount > 0 ? (
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title={`${unknownCount} preserved key${unknownCount === 1 ? '' : 's'}`}
          subtitle="This binding carries descriptor keys not modelled by this editor. They are preserved on save. Use Advanced (JSON) to view or edit them."
        />
      ) : null}

      {onAdvancedJsonChange ? (
        <details className="source-descriptor-editor__advanced">
          <summary>Advanced (JSON)</summary>
          <FormGroup legendText="Raw descriptor JSON (overrides structured fields)">
            <TextArea
              id={`source-desc-${sourceType}-advanced`}
              labelText=""
              rows={6}
              invalid={Boolean(advancedJsonError)}
              invalidText={advancedJsonError ?? ''}
              value={advancedJson ?? ''}
              onChange={(e) => onAdvancedJsonChange(e.target.value)}
            />
          </FormGroup>
        </details>
      ) : null}
    </div>
  )
}

export default SourceDescriptorEditor
