/**
 * T2482 loop 12 / iter 114 — TargetDescriptorEditor.
 *
 * Sister to SourceDescriptorEditor (iter 113). Same structure:
 * Carbon-driven structured editor for a binding's target_descriptor,
 * driven by the iter-114 TARGET_TYPE_SPECS catalogue.
 *
 * Adds one new field kind: 'json' — for nested-object slots like
 * `args` on engine_command/macro/device_command. Renders as a JSON
 * textarea with parse-error invalidText.
 */

import { useMemo, useState } from 'react'
import {
  Dropdown,
  FormGroup,
  InlineNotification,
  TextArea,
  TextInput,
} from '@carbon/react'

import {
  getTargetSpec,
  type TargetFieldSpec,
} from './targetDescriptors'
import type { BindingTargetType } from '../../../map2/clients/midiBindings'
import './SourceDescriptorEditor.css'  // share the styles

interface TargetDescriptorEditorProps {
  targetType: BindingTargetType
  value: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  unknownExtras?: Record<string, unknown>
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
  field: TargetFieldSpec
  value: unknown
  onChange: (next: unknown) => void
  inputId: string
}) {
  const [jsonText, setJsonText] = useState<string>(() => {
    if (field.kind !== 'json') return ''
    if (value === undefined || value === null) return ''
    if (typeof value === 'string') return value
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return ''
    }
  })
  const [jsonError, setJsonError] = useState<string | null>(null)

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
          if (Number.isFinite(parsed)) onChange(parsed)
        }}
      />
    )
  }
  if (field.kind === 'json') {
    return (
      <TextArea
        id={inputId}
        labelText=""
        rows={3}
        value={jsonText}
        invalid={Boolean(jsonError)}
        invalidText={jsonError ?? ''}
        helperText={field.helperText}
        onChange={(e) => {
          const raw = e.target.value
          setJsonText(raw)
          if (raw.trim() === '') {
            setJsonError(null)
            onChange(undefined)
            return
          }
          try {
            const parsed = JSON.parse(raw)
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
              setJsonError('Must be a JSON object')
              return
            }
            setJsonError(null)
            onChange(parsed)
          } catch (err) {
            setJsonError((err as Error).message)
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

export function TargetDescriptorEditor({
  targetType,
  value,
  onChange,
  unknownExtras,
  advancedJson,
  onAdvancedJsonChange,
  advancedJsonError,
}: TargetDescriptorEditorProps) {
  const spec = useMemo(() => getTargetSpec(targetType), [targetType])

  const handleFieldChange = (fieldKey: string, next: unknown) => {
    const updated = { ...value }
    if (next === undefined || next === null || next === '') {
      delete updated[fieldKey]
    } else {
      updated[fieldKey] = next
    }
    onChange(updated)
  }

  if (!spec) {
    return (
      <InlineNotification
        kind="warning"
        lowContrast
        hideCloseButton
        title="No editor metadata for this target type"
        subtitle={`Target type "${targetType}" has no entry in TARGET_TYPE_SPECS. Use the Advanced JSON disclosure to author the descriptor directly.`}
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
              inputId={`target-desc-${targetType}-${field.key}`}
            />
          </FormGroup>
        ))}
      </div>

      {unknownCount > 0 ? (
        <InlineNotification
          kind="info"
          lowContrast
          hideCloseButton
          title={`${unknownCount} preserved key${unknownCount === 1 ? '' : 's'}`}
          subtitle="This binding carries target descriptor keys not modelled by this editor. They are preserved on save. Use Advanced (JSON) to view or edit them."
        />
      ) : null}

      {onAdvancedJsonChange ? (
        <details className="source-descriptor-editor__advanced">
          <summary>Advanced (JSON)</summary>
          <FormGroup legendText="Raw target descriptor JSON (overrides structured fields)">
            <TextArea
              id={`target-desc-${targetType}-advanced`}
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

export default TargetDescriptorEditor
